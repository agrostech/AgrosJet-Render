"""
Sipariş Yönetimi API
Mock data ile başlangıç - Adisyo entegrasyonu sonra eklenecek
"""
from fastapi import APIRouter, HTTPException, Depends
from pydantic import BaseModel
from typing import Optional, List
from datetime import datetime, timezone, timedelta
import uuid
import random
import re
import logging
import math
from utils.database import db
from utils.helpers import ensure_turkey_timezone, get_turkey_now
from services.credit_service import insert_order, insert_orders

# Türkiye timezone (UTC+3)
TURKEY_TZ = timezone(timedelta(hours=3))

MIGROS_SECRET_KEY = "oPbkAZjSO6HDD0E0wt9GR5IVQWNNgpFA"

from utils.jwt_utils import require_auth
router = APIRouter(prefix="/api/orders", tags=["Sipariş Yönetimi"], dependencies=[Depends(require_auth)])
logger = logging.getLogger(__name__)


# --- Taşıma Ücreti Hesaplama Yardımcı Fonksiyonları ---
def calculate_distance(loc1: dict, loc2: dict) -> float:
    """Haversine formula ile iki nokta arasındaki mesafeyi hesapla (km)"""
    if not loc1 or not loc2:
        return 0.0
    lat1 = loc1.get("latitude") or loc1.get("lat") or 0
    lng1 = loc1.get("longitude") or loc1.get("lng") or 0
    lat2 = loc2.get("latitude") or loc2.get("lat") or 0
    lng2 = loc2.get("longitude") or loc2.get("lng") or 0
    if not all([lat1, lng1, lat2, lng2]):
        return 0.0
    R = 6371  # Dünya yarıçapı km
    dLat = math.radians(lat2 - lat1)
    dLon = math.radians(lng2 - lng1)
    a = math.sin(dLat/2) ** 2 + math.cos(math.radians(lat1)) * math.cos(math.radians(lat2)) * math.sin(dLon/2) ** 2
    c = 2 * math.atan2(math.sqrt(a), math.sqrt(1-a))
    return R * c


def calculate_fee_from_pricing(pricing_type: str, per_package_price: float, km_ranges: list, distance_km: float) -> float:
    """Restoran pricing ayarlarına göre taşıma ücreti hesapla"""
    if pricing_type == "per_package":
        return per_package_price or 0.0
    elif pricing_type == "per_km" and km_ranges:
        for km_range in km_ranges:
            min_km = km_range.get("min_km", 0)
            max_km = km_range.get("max_km")
            price = km_range.get("price", 0)
            if max_km is None:
                if distance_km >= min_km:
                    return price
            else:
                if min_km <= distance_km < max_km:
                    return price
    return 0.0


def calculate_restaurant_fee(restaurant: dict, restaurant_location: dict, delivery_location: dict) -> tuple:
    """
    Restoran için taşıma ücreti ve KDV hesapla.
    Returns: (restaurant_fee, restaurant_kdv)
    """
    pricing_type = restaurant.get("pricing_type", "per_package")
    per_package_price = restaurant.get("per_package_price", 0)
    km_ranges = restaurant.get("km_ranges", [])
    kdv_rate = restaurant.get("kdv_rate", 10)  # Varsayılan %10
    
    # Ücret hesapla
    if pricing_type == "per_package":
        fee = per_package_price or 0.0
    else:
        distance_km = calculate_distance(restaurant_location, delivery_location)
        fee = calculate_fee_from_pricing(pricing_type, per_package_price, km_ranges, distance_km)
    
    # KDV hesapla
    kdv = fee * (kdv_rate / 100)
    
    return round(fee, 2), round(kdv, 2)


# --- Platform Bildirim Fonksiyonu ---
async def notify_platform_status_change(order: dict, new_status: str, preparation_time: int = None, cancel_reason_id: str = None, cancel_note: str = None):
    """
    Sipariş durumu değiştiğinde ilgili platforma (Trendyol, Getir, Adisyo vb.) bildirim gönder.
    Bu fonksiyon arka planda çalışır ve hata alsa bile ana işlemi engellemez.
    
    cancel_reason_id: Platform iptal sebebi ID'si (iptal durumu için)
    cancel_note: İptal notu
    """
    source = order.get("source", "")
    restaurant_id = order.get("restaurant_id")
    order_id = order.get("id")
    
    if not source or not restaurant_id:
        return
    
    try:
        if source == "trendyol":
            from services.trendyol_service import (
                accept_trendyol_order,
                mark_trendyol_order_ready,
                mark_trendyol_order_shipped,
                mark_trendyol_order_delivered,
                cancel_trendyol_order
            )
            
            # Trendyol kuryesi (Model 2) kontrolü - shipped ve delivered gönderilmez
            delivery_type = order.get("trendyol_raw", {}).get("deliveryType", "STORE")
            is_trendyol_courier = delivery_type == "GO"
            
            result = None
            
            if new_status == "preparing":
                # Siparişi kabul et
                prep_time = preparation_time or order.get("preparation_time") or 20
                result = await accept_trendyol_order(restaurant_id, order_id, prep_time)
                
            elif new_status == "ready":
                # Hazır
                result = await mark_trendyol_order_ready(restaurant_id, order_id)
                
            elif new_status == "on_the_way" and not is_trendyol_courier:
                # Yola çıktı (sadece Model 1)
                result = await mark_trendyol_order_shipped(restaurant_id, order_id)
                
            elif new_status == "delivered" and not is_trendyol_courier:
                # Teslim edildi (sadece Model 1)
                result = await mark_trendyol_order_delivered(restaurant_id, order_id)
                
            elif new_status == "cancelled":
                # İptal
                result = await cancel_trendyol_order(restaurant_id, order_id)
            
            if result:
                if result.get("success"):
                    logger.info(f"Trendyol bildirim başarılı: order={order_id}, status={new_status}")
                else:
                    logger.warning(f"Trendyol bildirim hatası: order={order_id}, status={new_status}, error={result.get('error')}")
        
        elif source == "getir":
            from services.getir_service import (
                cancel_getir_order,
                trigger_getir_deliver,
                handover_getir_order,
                smart_advance_getir_order
            )
            
            # Getir kuryesi kontrolü (deliveryType: 1=Getir Getirsin, 2=Restoran Getirsin)
            getir_raw = order.get("getir_raw", {})
            is_getir_courier = getir_raw.get("isGetirCourier", False) or getir_raw.get("deliveryType") == 1
            
            result = None
            
            if new_status == "on_the_way":
                # "Yola Çıkar" butonu tıklandığında
                # smart_advance_getir_order fonksiyonu Getir'deki mevcut duruma göre
                # gerekli adımları otomatik atar (prepare, handover, deliver)
                logger.info(f"Getir Yola Çıkar: order={order_id}, is_getir_courier={is_getir_courier}")
                result = await smart_advance_getir_order(restaurant_id, order_id, "on_the_way", is_getir_courier)
                
            elif new_status == "delivered":
                # "Teslim Et" butonu tıklandığında
                # Restoran Getirsin: deliver çağır (70 sn kuralı ile)
                if not is_getir_courier:
                    result = await trigger_getir_deliver(restaurant_id, order_id)
                    logger.info(f"Getir trigger_deliver çağrıldı (Teslim Et): order={order_id}, result={result}")
                else:
                    # Getir Getirsin siparişlerinde teslim Getir kuryesi tarafından yapılır
                    logger.info(f"Getir Getirsin siparişi - teslim Getir kuryesi tarafından yapılacak: order={order_id}")
                    result = {"success": True, "message": "Getir Getirsin siparişi - teslim Getir kuryesi tarafından yapılacak"}
                
            elif new_status == "cancelled":
                # İptal - iptal sebebi ve notu ile birlikte gönder
                result = await cancel_getir_order(restaurant_id, order_id, cancel_reason_id, cancel_note)
            
            if result:
                if result.get("success"):
                    logger.info(f"Getir bildirim başarılı: order={order_id}, status={new_status}, msg={result.get('message')}")
                else:
                    logger.warning(f"Getir bildirim hatası: order={order_id}, status={new_status}, error={result.get('error')}")
        
        elif source == "adisyo":
            from services.adisyo_service import update_adisyo_order_status
            
            adisyo_order_id = order.get("adisyo_order_id")
            if adisyo_order_id:
                # Kurye ID ve ödeme yöntemi bilgisini aktar
                courier_id = order.get("courier_id")
                payment_method = order.get("payment_method", "cash")
                payment_detail = order.get("payment_method_detail")  # Sodexo, Setcard vb.
                
                result = await update_adisyo_order_status(
                    restaurant_id, 
                    adisyo_order_id, 
                    new_status,
                    courier_id=courier_id,
                    payment_method=payment_method,
                    payment_detail=payment_detail
                )
                if result.get("success"):
                    logger.info(f"Adisyo bildirim başarılı: order={order_id}, status={new_status}")
                else:
                    logger.warning(f"Adisyo bildirim hatası: order={order_id}, status={new_status}, error={result.get('error')}")
        
        elif source == "yemeksepeti":
            from services.yemeksepeti_service import update_yemeksepeti_order_status, cancel_yemeksepeti_order
            
            result = None
            
            if new_status == "ready":
                result = await update_yemeksepeti_order_status(restaurant_id, order_id, "ready")
                
            elif new_status == "on_the_way":
                # Vendor Delivery ise gönder
                is_platform_delivery = order.get("yemeksepeti_raw", {}).get("isPlatformDelivery", True)
                if not is_platform_delivery:
                    result = await update_yemeksepeti_order_status(restaurant_id, order_id, "on_the_way")
                    
            elif new_status == "cancelled":
                result = await cancel_yemeksepeti_order(restaurant_id, order_id)
            
            if result:
                if result.get("success"):
                    logger.info(f"Yemeksepeti bildirim başarılı: order={order_id}, status={new_status}")
                else:
                    logger.warning(f"Yemeksepeti bildirim hatası: order={order_id}, status={new_status}, error={result.get('error')}")
        
        # SepetTakip siparişleri için de bildirim gönder
        sepettakip_order_id = order.get("sepettakip_order_id")
        if sepettakip_order_id:
            from routers.sepettakip import notify_sepettakip_status
            
            # Kurye ETA hesapla (assigned durumunda)
            courier_eta = None
            if new_status == "assigned":
                # Tahmini 30 dakika sonra
                eta_time = datetime.now(TURKEY_TZ) + timedelta(minutes=30)
                courier_eta = eta_time.isoformat()
            
            result = await notify_sepettakip_status(sepettakip_order_id, new_status, courier_eta)
            if result:
                if result.get("success"):
                    logger.info(f"SepetTakip bildirim başarılı: order={order_id}, sepettakip_order={sepettakip_order_id}, status={new_status}")
                else:
                    logger.warning(f"SepetTakip bildirim hatası: order={order_id}, status={new_status}, error={result.get('error')}")
        
        # Migros Yemek siparişleri için bildirim gönder
        # Migros sıralı durum geçişi istiyor: Approved → Prepared → Delivery → Completed
        migros_data = order.get("migros_data", {})
        if migros_data.get("order_id") and source == "migros":
            from services.migros_service import MigrosYemekService
            
            try:
                restaurant = await db.restaurants.find_one({"id": restaurant_id})
                if not restaurant:
                    logger.warning(f"Migros bildirim: Restoran bulunamadı: {restaurant_id}")
                else:
                    # Config'i doğru yerden al: platform_integrations.migros → integration_stores → migros_credentials
                    migros_config = restaurant.get("platform_integrations", {}).get("migros", {})
                    
                    if not migros_config.get("api_key"):
                        for store in restaurant.get("integration_stores", []):
                            if store.get("platform") == "migros" and store.get("enabled"):
                                creds = store.get("credentials", {})
                                migros_config = {
                                    "enabled": True,
                                    "api_key": creds.get("api_key"),
                                    "secret_key": creds.get("secret_key"),
                                    "store_id": creds.get("store_id"),
                                    "is_test": creds.get("is_test", False)
                                }
                                break
                    
                    if not migros_config.get("api_key"):
                        migros_config = restaurant.get("migros_credentials", {})
                    
                    if migros_config.get("api_key"):
                        service = MigrosYemekService(
                            api_key=migros_config["api_key"],
                            secret_key=MIGROS_SECRET_KEY,
                            is_test=False
                        )
                        
                        migros_order_id = migros_data.get("order_id")
                        migros_store_id = migros_data.get("store_id")
                        current_migros_status = order.get("migros_status", "Approved")
                        
                        # Migros'a gönderilecek durum(lar)ı belirle
                        # Sıralı geçiş: Approved → Prepared → Delivery → Completed
                        statuses_to_send = []
                        
                        if new_status in ("preparing", "ready"):
                            if current_migros_status != "Prepared":
                                statuses_to_send = ["Prepared"]
                        
                        elif new_status == "on_the_way":
                            # Önce Prepared gönder (henüz gönderilmediyse), sonra Delivery
                            if current_migros_status not in ("Prepared", "Delivery"):
                                statuses_to_send = ["Prepared", "Delivery"]
                            elif current_migros_status == "Prepared":
                                statuses_to_send = ["Delivery"]
                        
                        elif new_status == "delivered":
                            # Eksik adımları sırayla tamamla, sonra Completed
                            if current_migros_status == "Approved":
                                statuses_to_send = ["Prepared", "Delivery", "Completed"]
                            elif current_migros_status == "Prepared":
                                statuses_to_send = ["Delivery", "Completed"]
                            elif current_migros_status == "Delivery":
                                statuses_to_send = ["Completed"]
                        
                        elif new_status == "cancelled":
                            # İptal için /Order/v2/CancelOrder endpoint'ini kullan
                            migros_user_id = migros_data.get("user_id")
                            # Frontend'den gelen cancel_reason_id'yi kullan
                            migros_cancel_reason = int(cancel_reason_id) if cancel_reason_id else 1
                            
                            cancel_result = await service.cancel_order(
                                order_id=migros_order_id,
                                user_id=migros_user_id or 0,
                                cancel_reason_id=migros_cancel_reason,
                                notify_user=True
                            )
                            
                            if cancel_result.get("success", True):
                                last_success_status = "Rejected"
                                logger.info(f"Migros iptal başarılı: order={order_id}")
                            else:
                                logger.warning(f"Migros iptal hatası: order={order_id}, error={cancel_result.get('error') or cancel_result}")
                            
                            # statuses_to_send döngüsüne girmesin
                            statuses_to_send = []
                        
                        # Durumları sırayla gönder
                        last_success_status = None
                        for migros_status in statuses_to_send:
                            result = await service.update_order_status(
                                order_id=migros_order_id,
                                store_id=migros_store_id,
                                status=migros_status
                            )
                            
                            if result.get("success", True):
                                last_success_status = migros_status
                                logger.info(f"Migros bildirim başarılı: order={order_id}, {new_status} -> {migros_status}")
                            else:
                                logger.warning(f"Migros bildirim hatası: order={order_id}, {migros_status}, error={result.get('error') or result}")
                                break  # Hata alınca sonraki adımlara geçme
                        
                        # Son başarılı durumu veritabanına kaydet
                        if last_success_status:
                            await db.orders.update_one(
                                {"id": order_id},
                                {"$set": {"migros_status": last_success_status}}
                            )
                    else:
                        logger.warning(f"Migros bildirim: API credentials bulunamadı, restaurant={restaurant_id}")
            except Exception as migros_error:
                logger.error(f"Migros bildirim hatası: order={order_id}, error={str(migros_error)}")
                    
    except Exception as e:
        # Platform bildirimi başarısız olsa bile ana işlem devam etmeli
        logger.error(f"Platform bildirim hatası: source={source}, order={order_id}, status={new_status}, error={str(e)}")


# --- Merkezi Status Güncelleme Fonksiyonu ---
async def update_order_status_core(
    order_id: str,
    new_status: str,
    actor_type: str = "system",
    actor_name: str = "Sistem",
    note: str = None,
    preparation_time: int = None,
    cancel_reason_id: str = None,
    cancel_note: str = None,
    extra_updates: dict = None,
    notify_platform: bool = True
) -> dict:
    """
    Merkezi sipariş durumu güncelleme fonksiyonu.
    
    Tüm status değişiklikleri bu fonksiyon üzerinden yapılmalı.
    - Status history otomatik eklenir
    - Platform bildirimi otomatik gönderilir
    - Zaman damgaları otomatik güncellenir
    
    Args:
        order_id: Sipariş ID
        new_status: Yeni durum
        actor_type: system | admin | courier | restaurant
        actor_name: İşlemi yapan kişi/sistem adı
        note: Durum değişikliği notu
        preparation_time: Hazırlık süresi (dakika) - preparing durumu için
        cancel_reason_id: İptal sebebi ID
        cancel_note: İptal notu
        extra_updates: Ek güncellemeler dict
        notify_platform: Platform bildirimi gönderilsin mi
        
    Returns:
        {"success": True/False, "order": updated_order, "error": str}
    """
    # Siparişi bul
    order = await db.orders.find_one({"id": order_id})
    if not order:
        return {"success": False, "error": "Sipariş bulunamadı"}
    
    old_status = order.get("status")
    
    # Türkiye saati (UTC+3)
    turkey_tz = timezone(timedelta(hours=3))
    now = datetime.now(turkey_tz)
    
    # Status label mapping
    status_labels = {
        "pending": "Bekliyor",
        "preparing": "Hazırlanıyor",
        "ready": "Hazır",
        "assigned": "Kurye Atandı",
        "confirmed": "Kurye Onayladı",
        "on_the_way": "Yolda",
        "delivered": "Teslim Edildi",
        "cancelled": "İptal Edildi",
        "scheduled": "İleri Tarihli"
    }
    
    # Status history entry
    history_entry = {
        "status": new_status,
        "label": status_labels.get(new_status, new_status.replace("_", " ").title()),
        "timestamp": now.isoformat(),
        "actor_type": actor_type,
        "actor_name": actor_name
    }
    if note:
        history_entry["note"] = note
    if cancel_reason_id:
        history_entry["cancel_reason_id"] = cancel_reason_id
    if cancel_note:
        history_entry["cancel_note"] = cancel_note
    
    # Update payload
    update_data = {
        "status": new_status,
        "updated_at": now.isoformat()
    }
    
    # Durum bazlı zaman damgaları
    if new_status == "preparing" and preparation_time:
        preparation_end = now + timedelta(minutes=preparation_time)
        update_data["preparation_time"] = preparation_time
        update_data["preparation_end_at"] = preparation_end.isoformat()
        history_entry["note"] = f"Hazırlık süresi: {preparation_time} dakika"
    
    elif new_status == "assigned":
        update_data["assigned_at"] = now.isoformat()
    
    elif new_status == "confirmed":
        update_data["confirmed_at"] = now.isoformat()
    
    elif new_status == "on_the_way":
        update_data["picked_up_at"] = now.isoformat()
    
    elif new_status == "delivered":
        update_data["delivered_at"] = now.isoformat()
    
    elif new_status == "cancelled":
        update_data["cancelled_at"] = now.isoformat()
        if cancel_reason_id:
            update_data["cancel_reason_id"] = cancel_reason_id
        if cancel_note:
            update_data["cancel_note"] = cancel_note
    
    # Extra updates (kurye atama, fee güncelleme vb.)
    if extra_updates:
        update_data.update(extra_updates)
    
    # Veritabanı güncelleme
    await db.orders.update_one(
        {"id": order_id},
        {
            "$set": update_data,
            "$push": {"status_history": history_entry}
        }
    )
    
    # Güncellenmiş siparişi al
    updated_order = await db.orders.find_one({"id": order_id})
    
    # Otomatik kurye hakediş işlemi
    # delivered → courier_fee otomatik bakiyeye yazılır (idempotent)
    # cancelled veya delivered'dan başka duruma → varsa earning sil
    try:
        from services.courier_earning_service import credit_courier_earning, revert_courier_earning
        if new_status == "delivered":
            await credit_courier_earning(updated_order)
        elif new_status == "cancelled" or (old_status == "delivered" and new_status != "delivered"):
            await revert_courier_earning(order_id)
    except Exception as e:
        logger.error(f"Otomatik hakediş hatası: {e}")
    
    # Platform bildirimi
    if notify_platform:
        try:
            await notify_platform_status_change(
                updated_order,
                new_status,
                preparation_time=preparation_time,
                cancel_reason_id=cancel_reason_id,
                cancel_note=cancel_note
            )
        except Exception as e:
            logger.error(f"Platform bildirim hatası (core): {str(e)}")
    
    # Kuryeye push bildirim: Sipariş iptal edildiyse ve kuryeye atanmışsa
    old_courier_id = order.get("courier_id")
    if old_courier_id and new_status == "cancelled":
        try:
            from services.push_notification_service import send_push_notification
            restaurant_name = order.get("restaurant_name", "Restoran")
            await send_push_notification(
                courier_id=old_courier_id,
                title="❌ Sipariş İptal Edildi",
                body=f"{restaurant_name}",
                data={
                    "type": "ORDER_CANCELLED",
                    "orderId": order_id,
                    "restaurantName": restaurant_name
                },
                sound="notification"
            )
        except Exception as e:
            logger.error(f"İptal bildirimi gönderilemedi: {e}")
    
    # Kuryeye push bildirim: Atama kaldırıldıysa (admin veya restoran tarafından)
    if old_courier_id and new_status != "cancelled" and extra_updates and extra_updates.get("courier_id") is None and "courier_id" in extra_updates:
        try:
            from services.push_notification_service import send_push_notification
            restaurant_name = order.get("restaurant_name", "Restoran")
            await send_push_notification(
                courier_id=old_courier_id,
                title="🔄 Atama Kaldırıldı",
                body=f"{restaurant_name} atamanız kaldırıldı",
                data={
                    "type": "ORDER_UNASSIGNED",
                    "orderId": order_id,
                    "restaurantName": restaurant_name
                },
                sound="notification"
            )
        except Exception as e:
            logger.error(f"Atama kaldırma bildirimi gönderilemedi: {e}")
    
    return {"success": True, "order": updated_order}


# --- Merkezi Kurye Atama Fonksiyonu ---
async def assign_courier_core(
    order: dict,
    courier_id: str,
    actor_type: str = "system",
    actor_name: str = "Sistem",
    calculate_fee: bool = True,
    send_push: bool = True
) -> dict:
    """
    Merkezi kurye atama fonksiyonu.
    
    Args:
        order: Sipariş dict
        courier_id: Atanacak kurye ID
        actor_type: admin | restaurant | system
        actor_name: İşlemi yapan kişi adı
        calculate_fee: Kurye ücreti hesaplansın mı
        send_push: Push notification gönderilsin mi
        
    Returns:
        {"success": True/False, "courier_name": str, "error": str}
    """
    # Kurye bilgisini al
    courier = await db.couriers.find_one(
        {"id": courier_id}, 
        {"_id": 0, "name": 1, "phone": 1, "pricing_type": 1, "per_package_price": 1, "km_ranges": 1, "tier_prices": 1}
    )
    if not courier:
        return {"success": False, "error": "Kurye bulunamadı"}
    
    now = datetime.now(TURKEY_TZ).isoformat()
    order_id = order["id"]
    company_id = order.get("company_id")
    
    # Güncelleme verileri
    update_data = {
        "courier_id": courier_id,
        "courier_name": courier["name"],
        "courier_phone": courier.get("phone"),
        "status": "assigned",
        "assigned_at": now,
        "updated_at": now
    }
    
    # Fee hesaplama (isteğe bağlı)
    if calculate_fee:
        distance_km = 0.0
        if order.get("restaurant_location") and order.get("delivery_location"):
            distance_km = calculate_distance(order["restaurant_location"], order["delivery_location"])
        
        pricing_type = courier.get("pricing_type", "per_package")
        
        # Kademeli ücretlendirme (kurye bazlı)
        if pricing_type == "tiered" and courier.get("tier_prices"):
            try:
                from services.tiered_pricing_service import get_courier_active_package_count
                active_count = await get_courier_active_package_count(courier_id, company_id)
                tier_index = min(active_count, 4)  # 0-4 arası index (5 kademe)
                tier_prices = courier.get("tier_prices", [0, 0, 0, 0, 0])
                courier_fee = tier_prices[tier_index] if tier_index < len(tier_prices) else tier_prices[-1]
                tiered_position = tier_index + 1  # 1-5 arası pozisyon
                update_data["tiered_position"] = tiered_position
            except Exception as e:
                logger.error(f"Kademeli ücret hesaplama hatası: {e}")
                courier_fee = 0
        else:
            # Normal ücretlendirme (per_package veya per_km)
            courier_fee = calculate_fee_from_pricing(
                pricing_type,
                courier.get("per_package_price", 0),
                courier.get("km_ranges", []),
                distance_km
            )
        
        update_data["courier_fee"] = round(courier_fee, 2)
    
    # History entry
    history_entry = {
        "status": "assigned",
        "label": "Kurye Atandı",
        "timestamp": now,
        "note": f"Kurye: {courier['name']}" + (f" ({actor_type})" if actor_type != "admin" else ""),
        "actor_type": actor_type,
        "actor_name": actor_name
    }
    
    # Veritabanı güncelleme - Sadece henüz kurye atanmamış siparişleri güncelle
    update_result = await db.orders.update_one(
        {"id": order_id, "courier_id": None},  # Sadece kurye atanmamışsa
        {
            "$set": update_data,
            "$push": {"status_history": history_entry}
        }
    )
    
    # Eğer sipariş bulunamadıysa veya zaten kurye atandıysa
    if update_result.matched_count == 0:
        return {"success": False, "error": "Sipariş zaten kuryeye atanmış veya bulunamadı"}
    
    # Push notification gönder
    if send_push:
        try:
            from services.push_notification_service import notify_courier_new_order
            order["order_number"] = order.get("order_number", "")
            order["restaurant_name"] = order.get("restaurant_name", "Restoran")
            await notify_courier_new_order(courier_id, order)
        except Exception as e:
            logger.error(f"Push notification hatası: {e}")
    
    return {"success": True, "courier_name": courier["name"]}


# --- Ücret Hesaplama Fonksiyonları ---
def calculate_distance(restaurant_location: dict = None, delivery_location: dict = None, 
                       lat1: float = None, lng1: float = None, lat2: float = None, lng2: float = None) -> float:
    """
    Haversine formula ile mesafe hesapla (km).
    Ya location dict'leri ya da doğrudan koordinatlar verilebilir.
    """
    # Location dict'lerinden koordinat çıkar
    if restaurant_location and delivery_location:
        lat1 = restaurant_location.get("latitude") or restaurant_location.get("lat") or 0
        lng1 = restaurant_location.get("longitude") or restaurant_location.get("lng") or 0
        lat2 = delivery_location.get("latitude") or delivery_location.get("lat") or 0
        lng2 = delivery_location.get("longitude") or delivery_location.get("lng") or 0
    
    if not all([lat1, lng1, lat2, lng2]):
        return 0.0
    
    R = 6371  # Dünya yarıçapı km
    dLat = math.radians(lat2 - lat1)
    dLon = math.radians(lng2 - lng1)
    a = math.sin(dLat/2) ** 2 + math.cos(math.radians(lat1)) * math.cos(math.radians(lat2)) * math.sin(dLon/2) ** 2
    c = 2 * math.atan2(math.sqrt(a), math.sqrt(1-a))
    return R * c


# Backward compatibility alias
def calculate_distance_between_points(lat1: float, lng1: float, lat2: float, lng2: float) -> float:
    """İki koordinat arası mesafe hesapla (km) - calculate_distance wrapper"""
    return calculate_distance(lat1=lat1, lng1=lng1, lat2=lat2, lng2=lng2)


def get_location_coords(location: dict) -> tuple:
    """Lokasyon dict'inden koordinatları çıkar"""
    if not location:
        return (None, None)
    lat = location.get("latitude") or location.get("lat")
    lng = location.get("longitude") or location.get("lng")
    return (lat, lng)


async def calculate_courier_eta_for_restaurant(
    courier_id: str, 
    target_restaurant_id: str,
    target_restaurant_location: dict = None
) -> dict:
    """
    Kuryenin belirli bir restorana tahmini varış süresini hesapla.
    
    TOPLAMA-DAĞITMA MANTİĞİ (Collect-Then-Distribute):
    1. Kuryenin mevcut konumunu al
    2. Kuryenin aktif siparişlerini al
    3. ÖNCE tüm teslim alımları (pickups) yap - restoranlardan paket topla
    4. SONRA tüm teslimatları (deliveries) yap - toplananları dağıt
    
    Bu mantık gerçek dünya operasyonunu yansıtır:
    - Kurye önce tüm restoranlardan siparişleri toplar
    - Sonra toplanan siparişleri müşterilere dağıtır
    - Bu sayede restoranlar doğru ETA görür
    
    Senaryolar:
    - Kurye boşta: Doğrudan restorana mesafe
    - Kurye assigned/confirmed: Bu restoranlardan teslim alması gerekir (öncelikli)
    - Kurye on_the_way: Elindeki paketleri dağıttıktan sonra yeni alımlara geçer
    
    Returns:
        {
            "eta_minutes": int,          # Toplam tahmini dakika
            "eta_text": str,             # "~15 dk" formatında
            "distance_km": float,        # Toplam mesafe
            "current_orders_count": int, # Mevcut sipariş sayısı
            "route_summary": str,        # "2 teslim alım, 1 teslimat sonra" gibi
            "breakdown": list            # Detaylı rota bilgisi
        }
    """
    AVG_SPEED_KMH = 25  # Ortalama şehir içi motorsiklet hızı
    PICKUP_WAIT_MINS = 3  # Restoranda bekleme süresi (dakika)
    DELIVERY_WAIT_MINS = 3  # Teslimat bekleme süresi (dakika)
    
    # Kurye bilgisini al
    courier = await db.couriers.find_one(
        {"id": courier_id},
        {"_id": 0, "current_location": 1, "name": 1}
    )
    
    if not courier or not courier.get("current_location"):
        return {
            "eta_minutes": None,
            "eta_text": "Konum yok",
            "distance_km": 0,
            "current_orders_count": 0,
            "route_summary": "Kurye konumu bilinmiyor",
            "breakdown": []
        }
    
    courier_lat, courier_lng = get_location_coords(courier["current_location"])
    if not courier_lat or not courier_lng:
        return {
            "eta_minutes": None,
            "eta_text": "Konum yok",
            "distance_km": 0,
            "current_orders_count": 0,
            "route_summary": "Kurye konumu bilinmiyor",
            "breakdown": []
        }
    
    # Hedef restoran konumunu al
    if not target_restaurant_location:
        restaurant = await db.restaurants.find_one(
            {"id": target_restaurant_id},
            {"_id": 0, "latitude": 1, "longitude": 1, "name": 1}
        )
        if restaurant:
            target_restaurant_location = {
                "latitude": restaurant.get("latitude"),
                "longitude": restaurant.get("longitude")
            }
    
    target_lat, target_lng = get_location_coords(target_restaurant_location)
    if not target_lat or not target_lng:
        return {
            "eta_minutes": None,
            "eta_text": "Restoran konumu yok",
            "distance_km": 0,
            "current_orders_count": 0,
            "route_summary": "Restoran konumu bilinmiyor",
            "breakdown": []
        }
    
    # Kuryenin aktif siparişlerini al
    active_orders = await db.orders.find(
        {
            "courier_id": courier_id,
            "status": {"$in": ["assigned", "confirmed", "on_the_way"]}
        },
        {"_id": 0, "id": 1, "status": 1, "restaurant_id": 1, "restaurant_name": 1, 
         "restaurant_location": 1, "delivery_location": 1, "delivery_address": 1}
    ).to_list(20)
    
    # Sipariş yoksa doğrudan mesafe hesapla
    if not active_orders:
        direct_distance = calculate_distance_between_points(courier_lat, courier_lng, target_lat, target_lng)
        travel_time = max(1, math.ceil((direct_distance / AVG_SPEED_KMH) * 60))
        
        return {
            "eta_minutes": travel_time,
            "eta_text": f"~{travel_time} dk",
            "distance_km": round(direct_distance, 2),
            "current_orders_count": 0,
            "route_summary": "Doğrudan geliyor",
            "breakdown": [{
                "type": "direct",
                "description": "Restorana doğrudan",
                "distance_km": round(direct_distance, 2),
                "travel_mins": travel_time,
                "time_mins": travel_time
            }]
        }
    
    # Siparişleri TOPLAMA-DAĞITMA sırasına koy:
    # 1. assigned/confirmed (teslim alınacak) - ÖNCE tüm restoranlardan topla
    # 2. on_the_way olanlar (teslimat yapılacak) - SONRA dağıt
    
    on_the_way_orders = [o for o in active_orders if o["status"] == "on_the_way"]
    pickup_orders = [o for o in active_orders if o["status"] in ["assigned", "confirmed"]]
    
    # Mevcut konum
    current_lat, current_lng = courier_lat, courier_lng
    total_distance = 0
    total_time = 0
    breakdown = []
    reached_target = False
    
    # Hedef restorana ulaşana kadar yapılan teslimat ve teslim alım sayıları
    deliveries_before_target = 0
    pickups_before_target = 0
    
    # ============================================================
    # ADIM 1: ÖNCE TÜM TESLİM ALIMLARI YAP (assigned/confirmed)
    # Kurye önce tüm restoranlardan paketleri toplar
    # HEDEF RESTORANA ULAŞINCA DUR!
    # ============================================================
    remaining_pickups = pickup_orders.copy()
    
    while remaining_pickups and not reached_target:
        nearest = None
        nearest_distance = float('inf')
        
        for order in remaining_pickups:
            rest_lat, rest_lng = get_location_coords(order.get("restaurant_location"))
            if rest_lat and rest_lng:
                dist = calculate_distance_between_points(current_lat, current_lng, rest_lat, rest_lng)
                if dist < nearest_distance:
                    nearest_distance = dist
                    nearest = order
        
        if nearest:
            remaining_pickups.remove(nearest)
            rest_lat, rest_lng = get_location_coords(nearest.get("restaurant_location"))
            
            total_distance += nearest_distance
            travel_time = max(1, math.ceil((nearest_distance / AVG_SPEED_KMH) * 60))
            
            # Hedef restorana varınca işaretle
            is_target = nearest.get("restaurant_id") == target_restaurant_id
            
            if is_target:
                # Hedef restorana ulaştık - bekleme süresi EKLEMİYORUZ (zaten oradayız)
                total_time += travel_time
                reached_target = True
                
                breakdown.append({
                    "type": "target",
                    "description": f"HEDEF: {nearest.get('restaurant_name', 'Restoran')[:25]}",
                    "distance_km": round(nearest_distance, 2),
                    "travel_mins": travel_time,
                    "time_mins": travel_time,
                    "is_target": True
                })
            else:
                # Ara restoran - bekleme süresi ekle
                total_time += travel_time + PICKUP_WAIT_MINS
                pickups_before_target += 1
                
                breakdown.append({
                    "type": "pickup",
                    "description": f"Teslim Al: {nearest.get('restaurant_name', 'Restoran')[:25]}",
                    "distance_km": round(nearest_distance, 2),
                    "travel_mins": travel_time,
                    "wait_mins": PICKUP_WAIT_MINS,
                    "time_mins": travel_time + PICKUP_WAIT_MINS,
                    "is_target": False
                })
            
            current_lat, current_lng = rest_lat, rest_lng
        else:
            break
    
    # ============================================================
    # ADIM 2: SONRA TESLİMATLARI YAP (on_the_way)
    # Tüm teslim alımlar bittikten sonra dağıtıma geç
    # Not: Hedef restorana teslim alım aşamasında ulaşıldıysa burası atlanır
    # ============================================================
    if not reached_target:
        remaining_deliveries = on_the_way_orders.copy()
        while remaining_deliveries:
            # En yakın teslimat noktasını bul
            nearest = None
            nearest_distance = float('inf')
            
            for order in remaining_deliveries:
                del_lat, del_lng = get_location_coords(order.get("delivery_location"))
                if del_lat and del_lng:
                    dist = calculate_distance_between_points(current_lat, current_lng, del_lat, del_lng)
                    if dist < nearest_distance:
                        nearest_distance = dist
                        nearest = order
            
            if nearest:
                remaining_deliveries.remove(nearest)
                del_lat, del_lng = get_location_coords(nearest.get("delivery_location"))
                
                total_distance += nearest_distance
                travel_time = max(1, math.ceil((nearest_distance / AVG_SPEED_KMH) * 60))
                total_time += travel_time + DELIVERY_WAIT_MINS
                deliveries_before_target += 1
                
                breakdown.append({
                    "type": "delivery",
                    "description": f"Teslimat: {nearest.get('delivery_address', 'Adres')[:30]}...",
                    "distance_km": round(nearest_distance, 2),
                    "travel_mins": travel_time,
                    "wait_mins": DELIVERY_WAIT_MINS,
                    "time_mins": travel_time + DELIVERY_WAIT_MINS
                })
                
                current_lat, current_lng = del_lat, del_lng
            else:
                break
    
    # ============================================================
    # ADIM 3: Hedef restoran pickup listesinde değilse, son olarak git
    # ============================================================
    if not reached_target:
        final_distance = calculate_distance_between_points(current_lat, current_lng, target_lat, target_lng)
        total_distance += final_distance
        travel_time = max(1, math.ceil((final_distance / AVG_SPEED_KMH) * 60))
        total_time += travel_time
        
        breakdown.append({
            "type": "target",
            "description": "Hedefe varış",
            "distance_km": round(final_distance, 2),
            "travel_mins": travel_time,
            "time_mins": travel_time,
            "is_target": True
        })
    
    # Özet oluştur - hedef restorana ulaşana kadar yapılanlar
    # TOPLAMA-DAĞITMA mantığına göre: önce teslim alımlar, sonra teslimatlar
    if pickups_before_target > 0 and deliveries_before_target > 0:
        route_summary = f"{pickups_before_target} teslim alım, {deliveries_before_target} teslimat sonra"
    elif pickups_before_target > 0:
        route_summary = f"{pickups_before_target} teslim alım sonra"
    elif deliveries_before_target > 0:
        route_summary = f"{deliveries_before_target} teslimat sonra"
    else:
        route_summary = "Doğrudan geliyor"
    
    eta_minutes = max(1, total_time)
    
    return {
        "eta_minutes": eta_minutes,
        "eta_text": f"~{eta_minutes} dk",
        "distance_km": round(total_distance, 2),
        "current_orders_count": len(active_orders),
        "route_summary": route_summary,
        "breakdown": breakdown
    }


def normalize_product_name(name: str) -> str:
    """
    Ürün ismini normalize et - fuzzy matching için.
    "All in One" -> "allinone"
    "AllinOne" -> "allinone"
    "All in one (kutu)" -> "allinonekutu"
    """
    if not name:
        return ""
    # Küçük harfe çevir
    normalized = name.lower()
    # Türkçe karakterleri dönüştür
    tr_map = {'ı': 'i', 'ğ': 'g', 'ü': 'u', 'ş': 's', 'ö': 'o', 'ç': 'c'}
    for tr_char, en_char in tr_map.items():
        normalized = normalized.replace(tr_char, en_char)
    # Sadece alfanumerik karakterleri tut
    normalized = re.sub(r'[^a-z0-9]', '', normalized)
    return normalized


def calculate_preparation_time(restaurant: dict, order_items: list, db_products: list = None) -> int:
    """
    Sipariş için toplam hazırlık süresini hesapla.
    
    Mantık:
    - Standart hazırlık süresi + En uzun ürün bazlı ekstra süre
    - Örnek: Standart 15 dk + max(Lahmacun 10 dk, Pide 8 dk) = 15 + 10 = 25 dk
    
    Args:
        restaurant: Restoran bilgisi (preparation_time, product_preparation_times)
        order_items: Siparişteki ürünler (product_id veya name içermeli)
        db_products: Veritabanındaki ürünler (isim eşleştirmesi için, opsiyonel)
    """
    standard_time = restaurant.get("preparation_time", 15)
    product_times = restaurant.get("product_preparation_times", {})
    
    if not product_times or not order_items:
        return standard_time
    
    # Eğer db_products verilmişse, ürün isimlerine göre ID eşleştirmesi yap
    # (Adisyo, Yemeksepeti gibi platformlardan gelen siparişler için)
    name_to_id_map = {}
    if db_products:
        for p in db_products:
            normalized_name = normalize_product_name(p.get("name", ""))
            if normalized_name:
                name_to_id_map[normalized_name] = p.get("id")
    
    # Siparişteki ürünlerin ekstra sürelerini topla
    extra_times = []
    for item in order_items:
        product_id = item.get("product_id") or item.get("id")
        product_name = item.get("name") or item.get("product_name") or ""
        
        # Önce product_id ile dene
        if product_id and str(product_id) in product_times:
            extra_time = product_times[str(product_id)]
            if extra_time and extra_time > 0:
                extra_times.append(extra_time)
            continue
        
        # product_id yoksa veya bulunamadıysa, isim eşleştirmesi yap
        if product_name and name_to_id_map:
            normalized_item_name = normalize_product_name(product_name)
            
            # Tam eşleşme dene
            if normalized_item_name in name_to_id_map:
                matched_id = name_to_id_map[normalized_item_name]
                if str(matched_id) in product_times:
                    extra_time = product_times[str(matched_id)]
                    if extra_time and extra_time > 0:
                        extra_times.append(extra_time)
                continue
            
            # Kısmi eşleşme dene (siparişteki isim DB'deki ismi içeriyor mu veya tersi)
            for db_normalized, db_id in name_to_id_map.items():
                if (normalized_item_name in db_normalized or db_normalized in normalized_item_name):
                    if str(db_id) in product_times:
                        extra_time = product_times[str(db_id)]
                        if extra_time and extra_time > 0:
                            extra_times.append(extra_time)
                    break
    
    # En uzun ekstra süreyi ekle (birden fazla ürün varsa sadece en uzun olan)
    max_extra = max(extra_times) if extra_times else 0
    
    return standard_time + max_extra


async def calculate_preparation_time_async(restaurant_id: str, order_items: list) -> int:
    """
    Async versiyon - veritabanından restoran ve ürünleri çekip hesaplar.
    Adisyo, Yemeksepeti gibi platformlardan gelen siparişler için kullanılır.
    """
    # Restoran bilgisini al
    restaurant = await db.restaurants.find_one(
        {"id": restaurant_id},
        {"_id": 0, "preparation_time": 1, "product_preparation_times": 1}
    )
    
    if not restaurant:
        return 15  # Default
    
    product_times = restaurant.get("product_preparation_times", {})
    
    # Eğer ürün bazlı süre tanımlı değilse standart süreyi döndür
    if not product_times:
        return restaurant.get("preparation_time", 15)
    
    # Restoran ürünlerini çek (isim eşleştirmesi için)
    db_products = await db.products.find(
        {"restaurant_id": restaurant_id},
        {"_id": 0, "id": 1, "name": 1}
    ).to_list(1000)
    
    return calculate_preparation_time(restaurant, order_items, db_products)


def calculate_fee_from_pricing(pricing_type: str, per_package_price: float, km_ranges: list, distance_km: float) -> float:
    """Ücretlendirme ayarına göre ücret hesapla"""
    if pricing_type == "per_package":
        return per_package_price or 0.0
    elif pricing_type == "per_km" and km_ranges:
        for km_range in km_ranges:
            min_km = km_range.get("min_km", 0)
            max_km = km_range.get("max_km")
            price = km_range.get("price", 0)
            
            # max_km None ise sınırsız (örn: 10+ km)
            if max_km is None:
                if distance_km >= min_km:
                    return price
            else:
                if min_km <= distance_km < max_km:
                    return price
    return 0.0


async def calculate_order_fees(order: dict) -> dict:
    """Sipariş için kurye ve restoran ücretlerini hesapla"""
    courier_fee = 0.0
    restaurant_fee = 0.0
    restaurant_kdv = 0.0
    pos_commission = 0.0
    distance_km = 0.0
    
    # Mesafe hesapla
    if order.get("restaurant_location") and order.get("delivery_location"):
        distance_km = calculate_distance(order["restaurant_location"], order["delivery_location"])
    
    # Kurye ücret hesaplama
    courier_id = order.get("courier_id")
    if courier_id:
        courier = await db.couriers.find_one(
            {"id": courier_id}, 
            {"_id": 0, "pricing_type": 1, "per_package_price": 1, "km_ranges": 1, "tier_prices": 1}
        )
        if courier:
            pricing_type = courier.get("pricing_type", "per_package")
            if pricing_type == "tiered":
                # Kademeli: atamada hesaplanan courier_fee'yi koru
                courier_fee = order.get("courier_fee", 0) or 0
            else:
                courier_fee = calculate_fee_from_pricing(
                    pricing_type,
                    courier.get("per_package_price", 0),
                    courier.get("km_ranges", []),
                    distance_km
                )
    
    # Restoran ücret hesaplama
    restaurant_id = order.get("restaurant_id")
    if restaurant_id:
        restaurant = await db.restaurants.find_one(
            {"id": restaurant_id}, 
            {"_id": 0, "pricing_type": 1, "per_package_price": 1, "km_ranges": 1, "kdv_rate": 1, "pos_commission_rate": 1}
        )
        if restaurant:
            restaurant_fee = calculate_fee_from_pricing(
                restaurant.get("pricing_type", "per_package"),
                restaurant.get("per_package_price", 0),
                restaurant.get("km_ranges", []),
                distance_km
            )
            # KDV hesapla
            kdv_rate = restaurant.get("kdv_rate", 0)
            if kdv_rate > 0:
                restaurant_kdv = restaurant_fee * (kdv_rate / 100)
            
            # POS komisyonu hesapla (sadece kredi kartı ödemeleri için)
            payment_method = order.get("payment_method", "").lower()
            if payment_method == "card":
                pos_rate = restaurant.get("pos_commission_rate", 0)
                if pos_rate > 0:
                    total_amount = order.get("total_amount", 0)
                    pos_commission = total_amount * (pos_rate / 100)
    
    return {
        "courier_fee": round(courier_fee, 2),
        "restaurant_fee": round(restaurant_fee, 2),
        "restaurant_kdv": round(restaurant_kdv, 2),
        "pos_commission": round(pos_commission, 2),
        "distance_km": round(distance_km, 2)
    }


# --- Pydantic Models ---
class OrderAssign(BaseModel):
    courier_id: str
    admin_id: Optional[str] = None
    admin_name: Optional[str] = None


class BulkPickupRequest(BaseModel):
    order_ids: List[str]


class OrderStatusUpdate(BaseModel):
    status: str  # preparing, ready, assigned, on_the_way, delivered, cancelled
    preparation_time: Optional[int] = None  # Hazırlanıyor durumu için süre (dakika)
    courier_id: Optional[str] = None
    admin_id: Optional[str] = None
    admin_name: Optional[str] = None
    actor_type: Optional[str] = None  # admin, courier, system
    is_super_admin: Optional[bool] = False  # Super admin bypass
    cancel_reason_id: Optional[str] = None  # Platform iptal sebebi ID
    cancel_note: Optional[str] = None  # İptal notu


class OrderFeesUpdate(BaseModel):
    courier_fee: Optional[float] = None
    restaurant_fee: Optional[float] = None
    restaurant_kdv: Optional[float] = None
    pos_commission: Optional[float] = None
    admin_id: Optional[str] = None
    admin_name: Optional[str] = None


class ManualOrderItem(BaseModel):
    product_id: str
    name: str
    quantity: int
    price: float


class DeliveryLocation(BaseModel):
    lat: float
    lng: float


class ManualOrderCreate(BaseModel):
    restaurant_id: str
    customer_name: str
    customer_phone: Optional[str] = None
    delivery_address: str
    delivery_location: Optional[DeliveryLocation] = None  # Koordinatlar
    items: List[ManualOrderItem]
    payment_method: str  # cash, card, online, meal_card
    payment_method_detail: Optional[str] = None  # Yemek kartı türü (Ticket, Sodexo vb.)
    notes: Optional[str] = None
    is_scheduled: bool = False
    scheduled_time: Optional[str] = None  # ISO datetime string


# --- Sipariş Durumları ---
ORDER_STATUSES = {
    "pending": {"label": "Beklemede", "color": "gray"},
    "scheduled": {"label": "Programlı", "color": "indigo"},
    "preparing": {"label": "Hazırlanıyor", "color": "yellow"},
    "ready": {"label": "Hazır", "color": "orange"},
    "assigned": {"label": "Kurye Atandı", "color": "purple"},
    "confirmed": {"label": "Onaylandı", "color": "blue"},  # Kurye siparişi onayladı
    "on_the_way": {"label": "Yolda", "color": "cyan"},
    "picked_up": {"label": "Yolda", "color": "cyan"},  # alias for on_the_way
    "delivered": {"label": "Teslim Edildi", "color": "green"},
    "cancelled": {"label": "İptal Edildi", "color": "red"}
}

# Platform bazlı iptal sebepleri
PLATFORM_CANCEL_REASONS = {
    "getir": [
        # Getir panelinde sadece bu 4 sebep kabul ediliyor
        {"id": "6088226bdaa34255a5693e23", "label": "Sipariş minimum sepet tutarı altında"},
        {"id": "5e1469f7916c7a55cfc2aede", "label": "Müşteri adresi restoran servis alanı dışında"},
        {"id": "5c5b49a768f6a45d427f0a8e", "label": "Restoranda ürün eksik"},
        {"id": "5f05b13f2765e85c5d0432d3", "label": "Restoran teknik problem yaşıyor"},
    ],
    "trendyol": [
        {"id": "OUT_OF_STOCK", "label": "Ürün stokta yok"},
        {"id": "RESTAURANT_CLOSED", "label": "Restoran kapalı"},
        {"id": "BUSY", "label": "Restoran çok yoğun"},
        {"id": "DELIVERY_AREA", "label": "Teslimat alanı dışında"},
        {"id": "OTHER", "label": "Diğer"},
    ],
    "yemeksepeti": [
        {"id": "1", "label": "Ürün stokta yok"},
        {"id": "2", "label": "Restoran kapalı"},
        {"id": "3", "label": "Restoran yoğun"},
        {"id": "4", "label": "Teslimat problemi"},
        {"id": "5", "label": "Diğer"},
    ],
    "default": [
        {"id": "out_of_stock", "label": "Ürün stokta yok"},
        {"id": "restaurant_closed", "label": "Restoran kapalı"},
        {"id": "busy", "label": "Restoran yoğun"},
        {"id": "delivery_issue", "label": "Teslimat problemi"},
        {"id": "customer_request", "label": "Müşteri isteği"},
        {"id": "other", "label": "Diğer"},
    ]
}

# Kurye ataması kaldırılacak durumlar
COURIER_REMOVAL_STATUSES = ["preparing", "ready", "cancelled"]

# Admin tarafından seçilemeyen durumlar (sadece kurye seçebilir veya otomatik atanır)
COURIER_ONLY_STATUSES = ["assigned", "confirmed"]


# --- Mock Data Generator ---
async def generate_mock_orders(company_id: str, count: int = 5, restaurant_id: str = None):
    """Test amaçlı mock sipariş oluştur - Şirketin bulunduğu şehirden"""
    
    # Şirket bilgilerini al (şehir koordinatları için)
    company = await db.companies.find_one(
        {"id": company_id},
        {"_id": 0, "city": 1, "city_lat": 1, "city_lng": 1}
    )
    
    # Şirketin restoranlarını al (hazırlık süresi dahil)
    restaurant_query = {"company_id": company_id, "is_archived": {"$ne": True}}
    if restaurant_id:
        restaurant_query["id"] = restaurant_id
    
    restaurants = await db.restaurants.find(
        restaurant_query,
        {"_id": 0, "id": 1, "name": 1, "latitude": 1, "longitude": 1, "preparation_time": 1}
    ).to_list(50)
    
    if not restaurants:
        return []
    
    # Şirket şehrine göre mahalle ve sokak bilgileri
    city_neighborhoods = {
        "Mersin": {
            "neighborhoods": [
                "Akdeniz", "Mezitli", "Yenişehir", "Toroslar", "Pozcu",
                "Forum", "Liparis", "Güvenevler", "Çankaya", "Bahçe"
            ],
            "streets": [
                "Gazi Mustafa Kemal Bulvarı", "İsmet İnönü Bulvarı", "Atatürk Caddesi",
                "Silifke Caddesi", "Hal Caddesi", "Çankaya Caddesi", "Kuvai Milliye Caddesi",
                "Hastane Caddesi", "Liman Caddesi", "Sahil Yolu"
            ],
            "base_lat": 36.8121,
            "base_lng": 34.6415
        },
        "Isparta": {
            "neighborhoods": [
                "Merkez", "Çünür", "Pirimehmet", "İstiklal", "Yayla",
                "Emre", "Sermet", "Turan", "Keçeci", "Modernevler"
            ],
            "streets": [
                "Süleyman Demirel Bulvarı", "İstasyon Caddesi", "Mimar Sinan Caddesi",
                "Cengiz Topel Caddesi", "113. Cadde", "Doğancı Caddesi", "Gazi Kemal Caddesi",
                "Yaşar Kemal Caddesi", "SDÜ Caddesi", "Gölcük Yolu"
            ],
            "base_lat": 37.7648,
            "base_lng": 30.5566
        },
        "İstanbul": {
            "neighborhoods": [
                "Kadıköy", "Beşiktaş", "Üsküdar", "Maltepe", "Ataşehir",
                "Şişli", "Bakırköy", "Fatih", "Beyoğlu", "Sarıyer"
            ],
            "streets": [
                "Bağdat Caddesi", "Barbaros Bulvarı", "İstiklal Caddesi", "Halaskargazi Caddesi",
                "Moda Caddesi", "Vatan Caddesi", "Bağlarbaşı Caddesi", "Maslak Caddesi"
            ],
            "base_lat": 41.0082,
            "base_lng": 28.9784
        },
        "Ankara": {
            "neighborhoods": [
                "Çankaya", "Kızılay", "Bahçelievler", "Keçiören", "Yenimahalle",
                "Etimesgut", "Mamak", "Altındağ", "Sincan", "Pursaklar"
            ],
            "streets": [
                "Atatürk Bulvarı", "Tunalı Hilmi Caddesi", "Kızılay Caddesi", "Bahçelievler Caddesi",
                "Hoşdere Caddesi", "Çetin Emeç Bulvarı", "Eskişehir Yolu"
            ],
            "base_lat": 39.9334,
            "base_lng": 32.8597
        },
        "İzmir": {
            "neighborhoods": [
                "Alsancak", "Konak", "Karşıyaka", "Bornova", "Buca",
                "Bayraklı", "Çiğli", "Gaziemir", "Balçova", "Narlıdere"
            ],
            "streets": [
                "Kordon Boyu", "Atatürk Caddesi", "Cumhuriyet Bulvarı", "Fevzipaşa Bulvarı",
                "Alsancak Caddesi", "Kıbrıs Şehitleri Caddesi"
            ],
            "base_lat": 38.4192,
            "base_lng": 27.1287
        },
        "Antalya": {
            "neighborhoods": [
                "Muratpaşa", "Konyaaltı", "Kepez", "Lara", "Kaleiçi",
                "Varsak", "Hurma", "Güzeloba", "Şirinyalı", "Meltem"
            ],
            "streets": [
                "Atatürk Caddesi", "Lara Caddesi", "Konyaaltı Caddesi", "Fener Caddesi",
                "Işıklar Caddesi", "Şarampol Caddesi", "Ali Çetinkaya Caddesi"
            ],
            "base_lat": 36.8969,
            "base_lng": 30.7133
        },
        "Bursa": {
            "neighborhoods": [
                "Osmangazi", "Nilüfer", "Yıldırım", "Görükle", "Altıparmak",
                "Çekirge", "Heykel", "Setbaşı", "Mudanya", "Gemlik"
            ],
            "streets": [
                "Atatürk Caddesi", "Altıparmak Caddesi", "Çekirge Caddesi", "Stadyum Caddesi",
                "İzmir Yolu", "FSM Bulvarı", "Mudanya Caddesi"
            ],
            "base_lat": 40.1828,
            "base_lng": 29.0665
        }
    }
    
    # Bilinmeyen şehirler için genel Türkiye mahalle/sokak isimleri
    default_city_data = {
        "neighborhoods": [
            "Merkez", "Yenimahalle", "Cumhuriyet", "Atatürk", "İstiklal",
            "Fatih", "Bahçelievler", "Yeşilyurt", "Güneşli", "Çarşı"
        ],
        "streets": [
            "Atatürk Caddesi", "Cumhuriyet Caddesi", "İstiklal Caddesi", "Hürriyet Caddesi",
            "Gazi Caddesi", "Çarşı Caddesi", "İnönü Caddesi", "Hastane Caddesi"
        ],
        "base_lat": 39.0,  # Default Türkiye merkezi
        "base_lng": 35.0
    }
    
    # Şirketin şehrini al veya varsayılan kullan
    city_name = company.get("city", "") if company else ""
    city_data = city_neighborhoods.get(city_name, default_city_data)
    
    # Şirketin koordinatlarını kullan veya şehir varsayılanını
    base_lat = company.get("city_lat", city_data["base_lat"]) if company else city_data["base_lat"]
    base_lng = company.get("city_lng", city_data["base_lng"]) if company else city_data["base_lng"]
    
    # Dinamik adresler oluştur (şirket konumu etrafında ~3km yarıçapta)
    def generate_address():
        neighborhood = random.choice(city_data["neighborhoods"])
        street = random.choice(city_data["streets"])
        building_no = random.randint(1, 200)
        
        # Rastgele konum (merkez etrafında ~3km)
        lat_offset = random.uniform(-0.025, 0.025)  # ~2.5km
        lng_offset = random.uniform(-0.025, 0.025)
        
        return {
            "address": f"{neighborhood}, {street} No:{building_no}",
            "lat": base_lat + lat_offset,
            "lng": base_lng + lng_offset
        }
    
    sample_customers = [
        "Ahmet Yılmaz", "Mehmet Demir", "Ayşe Kaya", "Fatma Öztürk", "Ali Çelik",
        "Zeynep Arslan", "Hüseyin Şahin", "Emine Yıldız", "Mustafa Aydın", "Hatice Koç"
    ]
    
    sample_items = [
        [{"name": "Lahmacun", "quantity": 3, "price": 45}],
        [{"name": "Adana Kebap", "quantity": 2, "price": 180}, {"name": "Ayran", "quantity": 2, "price": 15}],
        [{"name": "İskender", "quantity": 1, "price": 220}],
        [{"name": "Pide Karışık", "quantity": 2, "price": 120}, {"name": "Cacık", "quantity": 1, "price": 35}],
        [{"name": "Döner Dürüm", "quantity": 4, "price": 85}],
        [{"name": "Tavuk Şiş", "quantity": 2, "price": 150}, {"name": "Pilav", "quantity": 2, "price": 30}],
        [{"name": "Köfte Ekmek", "quantity": 3, "price": 65}],
        [{"name": "Pizza Margarita", "quantity": 1, "price": 180}, {"name": "Kola", "quantity": 2, "price": 25}],
    ]
    
    orders = []
    
    for i in range(count):
        restaurant = random.choice(restaurants)
        delivery = generate_address()  # Dinamik adres oluştur
        customer = random.choice(sample_customers)
        items = random.choice(sample_items)
        
        total = sum(item["price"] * item["quantity"] for item in items)
        
        # Şimdi oluştur (geri sayım için)
        created_at = datetime.now(TURKEY_TZ)
        
        # Restoran hazırlık süresi (varsayılan 15 dakika)
        prep_time = restaurant.get("preparation_time", 15)
        preparation_end_at = created_at + timedelta(minutes=prep_time)
        
        order = {
            "id": str(uuid.uuid4()),
            "order_number": f"ORD-{random.randint(1000, 9999)}",
            "company_id": company_id,
            "restaurant_id": restaurant["id"],
            "restaurant_name": restaurant["name"],
            "restaurant_location": {
                "latitude": restaurant.get("latitude", base_lat),
                "longitude": restaurant.get("longitude", base_lng)
            },
            "customer_name": customer,
            "customer_phone": f"05{random.randint(30, 59)}{random.randint(1000000, 9999999)}",
            "delivery_address": delivery["address"],
            "delivery_location": {
                "latitude": delivery["lat"],
                "longitude": delivery["lng"]
            },
            "items": items,
            "total_amount": total,
            "payment_method": random.choice(["cash", "card", "online"]),
            "status": "preparing",  # Yeni siparişler hazırlanıyor ile başlar
            "preparation_time": prep_time,  # Hazırlık süresi (dakika)
            "preparation_end_at": preparation_end_at.isoformat(),  # Hazırlık bitiş zamanı
            "courier_id": None,
            "courier_name": None,
            "assigned_at": None,
            "confirmed_at": None,
            "delivered_at": None,
            "notes": random.choice(["", "", "Kapıda ödeme", "Zile basma, ara", "Acele"]),
            "source": "mock",  # mock veya adisyo
            "created_at": created_at.isoformat(),
            "updated_at": created_at.isoformat(),
            "status_history": [
                {
                    "status": "preparing",
                    "label": "Sipariş Alındı",
                    "timestamp": created_at.isoformat(),
                    "note": f"Hazırlık süresi: {prep_time} dakika",
                    "actor_type": "system",  # system, admin, courier
                    "actor_name": "Sistem"
                }
            ]
        }
        
        orders.append(order)
    
    # Veritabanına kaydet (ve kontör düş)
    if orders:
        await insert_orders(orders)
    
    return orders


# --- Endpoints ---

# Platform İptal Sebepleri (Bu endpoint'ler dinamik olanlardan ÖNCE gelmeli!)
@router.get("/platform-cancel-reasons/{source}")
async def get_cancel_reasons_by_platform(source: str, restaurant_id: Optional[str] = None):
    """
    Platform bazlı iptal sebeplerini döndür
    
    source: getir, trendyol, yemeksepeti, migros, adisyo, manual, vb.
    restaurant_id: Migros için gerekli (API'den çekmek için)
    """
    # Migros için API'den çek
    if source == "migros" and restaurant_id:
        try:
            restaurant = await db.restaurants.find_one(
                {"id": restaurant_id},
                {"_id": 0, "platform_integrations.migros": 1, "integration_stores": 1}
            )
            if restaurant:
                migros_config = restaurant.get("platform_integrations", {}).get("migros", {})
                if not migros_config.get("api_key"):
                    for store in restaurant.get("integration_stores", []):
                        if store.get("platform") == "migros" and store.get("enabled"):
                            creds = store.get("credentials", {})
                            migros_config = {
                                "api_key": creds.get("api_key"),
                                "secret_key": creds.get("secret_key"),
                                "is_test": creds.get("is_test", True)
                            }
                            break
                
                if migros_config.get("api_key"):
                    from services.migros_service import MigrosYemekService
                    service = MigrosYemekService(
                        api_key=migros_config["api_key"],
                        secret_key=MIGROS_SECRET_KEY,
                        is_test=False
                    )
                    result = await service.get_cancel_reasons()
                    if result.get("success") is not False and result.get("data"):
                        data = result["data"]
                        reasons_list = data if isinstance(data, list) else []
                        if reasons_list:
                            reasons = [
                                {"id": str(r.get("reasonId", r.get("id", ""))), "label": r.get("description", "")}
                                for r in reasons_list
                            ]
                            return {"success": True, "source": source, "reasons": reasons}
        except Exception as e:
            logger.warning(f"Migros iptal sebepleri alınamadı: {e}")
    
    reasons = PLATFORM_CANCEL_REASONS.get(source, PLATFORM_CANCEL_REASONS["default"])
    return {
        "success": True,
        "source": source,
        "reasons": reasons
    }


# =============================================================================
# MERKEZİ SİPARİŞ LİSTELEME ENDPOİNT'İ (v2)
# Tüm paneller için tek endpoint - eski endpoint'ler backward compatibility için duruyor
# =============================================================================

@router.get("/v2/list")
async def get_orders_unified(
    panel: str,  # admin | restaurant | courier
    company_id: Optional[str] = None,
    restaurant_id: Optional[str] = None,
    courier_id: Optional[str] = None,
    status: Optional[str] = None,  # pending,preparing,ready veya "active"
    date_from: Optional[str] = None,
    date_to: Optional[str] = None,
    source: Optional[str] = None,  # getir,trendyol
    include_restaurant_delivery: bool = False,
    limit: int = 200,
    offset: int = 0
):
    """
    Merkezi sipariş listeleme endpoint'i - Tüm paneller için.
    
    Args:
        panel: admin | restaurant | courier (zorunlu)
        company_id: Şirket ID (admin için zorunlu)
        restaurant_id: Restoran ID (restaurant için zorunlu)
        courier_id: Kurye ID (courier için zorunlu)
        status: Durum filtresi - "active" veya virgülle ayrılmış durumlar
        date_from: Başlangıç tarihi (ISO format)
        date_to: Bitiş tarihi (ISO format)
        source: Platform filtresi (getir,trendyol)
        include_restaurant_delivery: Restoran teslimatı siparişlerini dahil et
        limit: Maksimum kayıt sayısı
        offset: Sayfalama için offset
    """
    from datetime import datetime, timezone, timedelta
    
    # Panel doğrulama
    if panel not in ["admin", "restaurant", "courier"]:
        raise HTTPException(status_code=400, detail="Geçersiz panel. İzin verilenler: admin, restaurant, courier")
    
    # Panel bazlı zorunlu parametreler
    if panel == "admin" and not company_id:
        raise HTTPException(status_code=400, detail="Admin paneli için company_id zorunlu")
    if panel == "restaurant" and not restaurant_id:
        raise HTTPException(status_code=400, detail="Restoran paneli için restaurant_id zorunlu")
    if panel == "courier" and not courier_id:
        raise HTTPException(status_code=400, detail="Kurye paneli için courier_id zorunlu")
    
    # Hazırlık süresi kontrolü (admin ve restaurant için)
    if panel == "admin" and company_id:
        await check_preparation_times(company_id=company_id)
    elif panel == "restaurant" and restaurant_id:
        await check_preparation_times(restaurant_id=restaurant_id)
    
    # Query oluştur
    query = {}
    
    # Panel bazlı temel filtreler
    if panel == "admin":
        query["company_id"] = company_id
        if not include_restaurant_delivery:
            query["is_restaurant_delivery"] = {"$ne": True}
    elif panel == "restaurant":
        query["restaurant_id"] = restaurant_id
    elif panel == "courier":
        query["courier_id"] = courier_id
        # Kurye için varsayılan: sadece aktif siparişler
        if not status:
            status = "active"
    
    # Status filtresi
    if status:
        if status == "active":
            query["status"] = {"$nin": ["delivered", "cancelled"]}
        elif "," in status:
            status_list = [s.strip() for s in status.split(",") if s.strip()]
            if status_list:
                query["status"] = {"$in": status_list}
        else:
            query["status"] = status
    else:
        # Restaurant paneli varsayılan: Bugün + Aktif
        if panel == "restaurant":
            # Türkiye saatine göre bugünün başlangıcı - +03:00 formatında
            now_turkey = datetime.now(TURKEY_TZ)
            today_start_turkey = now_turkey.replace(hour=0, minute=0, second=0, microsecond=0)
            today_start_str = today_start_turkey.isoformat()  # +03:00 formatında
            query["$or"] = [
                {"status": {"$nin": ["delivered", "cancelled"]}},
                {"delivered_at": {"$gte": today_start_str}}
            ]
    
    # Tarih filtresi için değişkenleri hazırla
    date_filter_start = None
    date_filter_end = None
    
    if date_from or date_to:
        if date_from:
            try:
                date_from_str = ensure_turkey_timezone(date_from)
                date_filter_start = datetime.fromisoformat(date_from_str)
            except:
                pass
        
        if date_to:
            try:
                date_to_str = ensure_turkey_timezone(date_to)
                date_filter_end = datetime.fromisoformat(date_to_str)
            except:
                pass
    
    # Platform filtresi
    if source:
        if "," in source:
            source_list = [s.strip() for s in source.split(",") if s.strip()]
            query["source"] = {"$in": source_list}
        else:
            query["source"] = source
    
    # Ek filtreler (cross-panel)
    if panel == "admin":
        if courier_id:
            query["courier_id"] = courier_id
        if restaurant_id:
            query["restaurant_id"] = restaurant_id
    
    # Sıralama
    sort_field = "assigned_at" if panel == "courier" else "created_at"
    sort_order = 1 if panel == "courier" else -1  # Kurye için en eski önce
    
    # Sorgu çalıştır
    all_orders = await db.orders.find(
        query, 
        {"_id": 0}
    ).sort(sort_field, sort_order).to_list(10000)  # Önce hepsini çek, sonra filtrele
    
    # Tarih filtresi varsa Python'da created_at ile filtrele (Türkiye saati)
    if date_filter_start or date_filter_end:
        turkey_tz = timezone(timedelta(hours=3))
        filtered_orders = []
        for order in all_orders:
            created_at = order.get("created_at")
            if not created_at:
                continue
            try:
                if isinstance(created_at, str):
                    order_dt = datetime.fromisoformat(created_at.replace('Z', '+00:00'))
                else:
                    order_dt = created_at
                
                # Türkiye saati olarak kabul et (eğer timezone yoksa)
                if order_dt.tzinfo is None:
                    order_dt = order_dt.replace(tzinfo=turkey_tz)
                
                # Tarih aralığı kontrolü
                if date_filter_start and order_dt < date_filter_start:
                    continue
                if date_filter_end and order_dt > date_filter_end:
                    continue
                
                filtered_orders.append(order)
            except:
                continue
        
        # Pagination uygula
        total_count = len(filtered_orders)
        orders = filtered_orders[offset:offset + limit]
    else:
        # Tarih filtresi yoksa normal pagination
        orders = all_orders[offset:offset + limit]
        total_count = await db.orders.count_documents(query)
    
    # Kurye bilgilerini zenginleştir (restaurant ve admin paneli için)
    if panel in ["restaurant", "admin"]:
        courier_ids = list(set(o.get("courier_id") for o in orders if o.get("courier_id")))
        
        if courier_ids:
            couriers = await db.couriers.find(
                {"id": {"$in": courier_ids}},
                {"_id": 0, "id": 1, "phone": 1, "current_location": 1, "name": 1}
            ).to_list(100)
            
            courier_map = {c["id"]: c for c in couriers}
            
            for order in orders:
                if order.get("courier_id") and order["courier_id"] in courier_map:
                    courier = courier_map[order["courier_id"]]
                    order["courier_phone"] = courier.get("phone")
                    order["courier_location"] = courier.get("current_location")
                    if not order.get("courier_name"):
                        order["courier_name"] = courier.get("name")
    
    # Restoran telefon bilgisini zenginleştir (eksikse)
    rest_ids_missing_phone = list(set(
        o.get("restaurant_id") for o in orders
        if o.get("restaurant_id") and not o.get("restaurant_phone")
    ))
    if rest_ids_missing_phone:
        rests = await db.restaurants.find(
            {"id": {"$in": rest_ids_missing_phone}},
            {"_id": 0, "id": 1, "phone": 1}
        ).to_list(500)
        rest_phone_map = {r["id"]: r.get("phone") for r in rests}
        for order in orders:
            if not order.get("restaurant_phone") and order.get("restaurant_id"):
                order["restaurant_phone"] = rest_phone_map.get(order["restaurant_id"])
    
    return {
        "success": True,
        "orders": orders,
        "total": total_count,
        "limit": limit,
        "offset": offset,
        "panel": panel
    }


# ESKİ get_orders silindi - /api/orders/v2/list?panel=admin kullanın
# ESKİ get_orders_by_restaurant silindi - /api/orders/v2/list?panel=restaurant kullanın


@router.put("/{order_id}/status")
async def update_order_status_simple(order_id: str, data: OrderStatusUpdate):
    """Sipariş durumunu güncelle - Restoran paneli için basit endpoint"""
    order = await db.orders.find_one({"id": order_id})
    if not order:
        raise HTTPException(status_code=404, detail="Sipariş bulunamadı")
    
    # İzin kontrolü - Restoran teslimatı olan siparişler için bu izin aranmaz
    if not order.get("is_restaurant_delivery"):
        restaurant_id = order.get("restaurant_id")
        if restaurant_id:
            restaurant = await db.restaurants.find_one(
                {"id": restaurant_id},
                {"_id": 0, "permissions": 1}
            )
            permissions = restaurant.get("permissions", {}) if restaurant else {}
            # Varsayılan değer True (can_change_order_status)
            can_change_status = permissions.get("can_change_order_status", True)
            if not can_change_status:
                raise HTTPException(
                    status_code=403,
                    detail="Sipariş durumu değiştirme izniniz bulunmuyor"
                )
    
    # Kurye atandıysa sadece belirli işlemlere izin ver
    if order.get("courier_id"):
        if data.status not in ["cancelled", "preparing"]:
            raise HTTPException(
                status_code=403, 
                detail="Kurye atandıktan sonra sadece bekleme süresi güncellenebilir veya sipariş iptal edilebilir"
            )
    
    # Sadece belirli durumlar değiştirilebilir
    allowed_statuses = ["pending", "preparing", "ready", "scheduled", "on_the_way", "delivered", "cancelled"]
    if data.status not in allowed_statuses:
        raise HTTPException(
            status_code=400, 
            detail=f"Bu durum restoran tarafından seçilemez. İzin verilen durumlar: {', '.join(allowed_statuses)}"
        )
    
    # Extra güncellemeler
    extra_updates = {}
    
    # Kurye atanmışken bekleme süresi güncellenirse kurye atamasını iptal et
    if order.get("courier_id") and data.status == "preparing":
        extra_updates["courier_id"] = None
        extra_updates["courier_name"] = None
        extra_updates["courier_assigned_at"] = None
    
    # Scheduled durumundan çıkıyorsa
    if data.status == "preparing" and order.get("status") == "scheduled":
        extra_updates["is_scheduled"] = False
    
    # İptal durumunda ek bilgiler
    if data.status == "cancelled":
        extra_updates["cancelled_by"] = "restaurant"
    
    # Merkezi fonksiyon ile güncelle
    prep_time = data.preparation_time or (15 if data.status == "preparing" else None)
    result = await update_order_status_core(
        order_id=order_id,
        new_status=data.status,
        actor_type="restaurant",
        actor_name="Restoran",
        preparation_time=prep_time,
        cancel_reason_id=data.cancel_reason_id,
        cancel_note=data.cancel_note,
        extra_updates=extra_updates if extra_updates else None,
        notify_platform=True
    )
    
    if not result["success"]:
        raise HTTPException(status_code=400, detail=result["error"])
    
    return {"message": "Sipariş durumu güncellendi", "status": data.status}


# --- Mock Data Endpoints (order_id'den önce olmalı) ---

@router.post("/{company_id}/generate-mock")
async def generate_mock(company_id: str, count: int = 5):
    """Test amaçlı mock sipariş oluştur"""
    orders = await generate_mock_orders(company_id, count)
    return {"message": f"{len(orders)} mock sipariş oluşturuldu", "count": len(orders)}


@router.delete("/{company_id}/clear-mock")
async def clear_mock_orders(company_id: str):
    """Tüm mock siparişleri sil"""
    result = await db.orders.delete_many({"company_id": company_id, "source": "mock"})
    return {"message": f"{result.deleted_count} mock sipariş silindi"}


@router.post("/restaurant/{restaurant_id}/generate-mock")
async def generate_mock_for_restaurant(restaurant_id: str, count: int = 20):
    """Restoran için mock sipariş oluştur"""
    # Restoranın company_id'sini al
    restaurant = await db.restaurants.find_one({"id": restaurant_id}, {"_id": 0, "company_id": 1})
    if not restaurant:
        raise HTTPException(status_code=404, detail="Restoran bulunamadı")
    
    orders = await generate_mock_orders(restaurant["company_id"], count, restaurant_id)
    return {"message": f"{len(orders)} mock sipariş oluşturuldu", "count": len(orders)}


@router.delete("/restaurant/{restaurant_id}/clear-mock")
async def clear_mock_orders_for_restaurant(restaurant_id: str):
    """Restorana ait tüm mock siparişleri sil"""
    result = await db.orders.delete_many({"restaurant_id": restaurant_id, "source": "mock"})
    return {"message": f"{result.deleted_count} mock sipariş silindi", "count": result.deleted_count}


# --- İstatistikler (order_id'den önce olmalı) ---

@router.get("/{company_id}/stats/summary")
async def get_order_stats(company_id: str):
    """Sipariş özet istatistikleri"""
    today_start = datetime.now(TURKEY_TZ).replace(hour=0, minute=0, second=0, microsecond=0)
    
    # Bugünkü siparişler
    today_orders = await db.orders.count_documents({
        "company_id": company_id,
        "created_at": {"$gte": today_start.isoformat()}
    })
    
    # Aktif siparişler
    active = await db.orders.count_documents({
        "company_id": company_id,
        "status": {"$nin": ["delivered", "cancelled"]}
    })
    
    # Teslim edilen
    delivered = await db.orders.count_documents({
        "company_id": company_id,
        "status": "delivered",
        "created_at": {"$gte": today_start.isoformat()}
    })
    
    return {
        "today_orders": today_orders,
        "active_orders": active,
        "delivered_today": delivered
    }


# --- Tek sipariş işlemleri ---

async def check_preparation_times(company_id: str = None, restaurant_id: str = None):
    """
    Hazırlık süresi dolan siparişleri otomatik 'Hazır' durumuna güncelle.
    company_id veya restaurant_id parametrelerinden biri verilmeli.
    """
    now = datetime.now(TURKEY_TZ).isoformat()
    
    # Query oluştur
    query = {
        "status": "preparing",
        "preparation_end_at": {"$lte": now}
    }
    if company_id:
        query["company_id"] = company_id
    elif restaurant_id:
        query["restaurant_id"] = restaurant_id
    else:
        return 0
    
    # Hazırlanıyor durumunda ve hazırlık süresi dolmuş siparişleri bul
    expired_orders = await db.orders.find(query, {"_id": 0, "id": 1, "order_number": 1}).to_list(100)
    
    # Her birini merkezi fonksiyon ile güncelle
    for order in expired_orders:
        await update_order_status_core(
            order_id=order["id"],
            new_status="ready",
            actor_type="auto",
            actor_name="Otomatik",
            note="Hazırlık süresi doldu",
            notify_platform=False
        )
        if restaurant_id:
            logger.info(f"Sipariş hazır durumuna güncellendi (bekleme süresi doldu): {order.get('order_number')}")
    
    return len(expired_orders)


@router.get("/restaurant/{restaurant_id}/available-couriers")
async def get_available_couriers_for_restaurant(restaurant_id: str):
    """
    Restoran için uygun kuryeleri getir.
    
    Mantık:
    - Önce can_assign_courier izni kontrol edilir
    - Eğer restoranda atanmış sipariş varsa: Sadece o restorandan paketi olan kuryeler
    - Eğer hiç atanmış sipariş yoksa: Boş liste (kurye ataması sadece paketi olan kuryeler için)
    
    Bu sayede aynı mahalleye birden fazla kurye gönderilmesi önlenir.
    """
    # Restoran bilgisini al
    restaurant = await db.restaurants.find_one(
        {"id": restaurant_id},
        {"_id": 0, "id": 1, "company_id": 1, "blocked_couriers": 1, "permissions": 1}
    )
    
    if not restaurant:
        raise HTTPException(status_code=404, detail="Restoran bulunamadı")
    
    # İzin kontrolü
    permissions = restaurant.get("permissions", {})
    if not permissions.get("can_assign_courier", False):
        return {
            "couriers": [],
            "restriction_mode": "disabled",
            "couriers_with_packages": [],
            "message": "Kurye atama izni aktif değil"
        }
    
    blocked_couriers = restaurant.get("blocked_couriers", [])
    
    # Restoranda sadece "confirmed" durumundaki siparişleri bul
    # assigned (henüz onaylanmadı) ve on_the_way (yolda) olan kuryeler gösterilmez
    active_orders = await db.orders.find(
        {
            "restaurant_id": restaurant_id,
            "status": "confirmed",
            "courier_id": {"$ne": None}
        },
        {"_id": 0, "courier_id": 1}
    ).to_list(100)
    
    # Bu restorandan onaylanmış paketi olan kurye ID'lerini topla
    couriers_with_packages = list(set(o.get("courier_id") for o in active_orders if o.get("courier_id")))
    
    if couriers_with_packages:
        # Sadece bu restorandan paketi olan kuryeleri getir (engellenmemişleri)
        valid_courier_ids = [c for c in couriers_with_packages if c not in blocked_couriers]
        
        couriers = await db.couriers.find(
            {"id": {"$in": valid_courier_ids}},
            {"_id": 0, "id": 1, "name": 1, "phone": 1, "status": 1, "current_location": 1}
        ).to_list(50)
        
        restriction_mode = "restricted"  # Kısıtlı mod - sadece paketi olan kuryeler
    else:
        # Hiç atanmış sipariş yok - restoran kurye atayamaz
        couriers = []
        restriction_mode = "no_packages"  # Hiç paket yok
    
    # Her kurye için bu restorandan kaç paketi olduğunu hesapla
    for courier in couriers:
        package_count = sum(1 for o in active_orders if o.get("courier_id") == courier["id"])
        courier["package_count"] = package_count
    
    return {
        "couriers": couriers,
        "restriction_mode": restriction_mode,
        "couriers_with_packages": couriers_with_packages
    }


@router.post("/restaurant/{restaurant_id}/assign/{order_id}")
async def assign_courier_from_restaurant(restaurant_id: str, order_id: str, data: OrderAssign):
    """
    Restoran panelinden kurye ata.
    Sadece o restorandan paketi olan kuryelere atama yapılabilir (eğer atanmış sipariş varsa).
    İzin kontrolü: can_assign_courier izni aktif olmalı.
    """
    # Sipariş kontrolü
    order = await db.orders.find_one({"id": order_id, "restaurant_id": restaurant_id})
    if not order:
        raise HTTPException(status_code=404, detail="Sipariş bulunamadı")
    
    if order.get("courier_id"):
        raise HTTPException(status_code=400, detail="Bu siparişe zaten kurye atanmış")
    
    # Restoran bilgisini al (izinler dahil)
    restaurant = await db.restaurants.find_one(
        {"id": restaurant_id},
        {"_id": 0, "id": 1, "company_id": 1, "blocked_couriers": 1, "permissions": 1}
    )
    
    if not restaurant:
        raise HTTPException(status_code=404, detail="Restoran bulunamadı")
    
    # İzin kontrolü
    permissions = restaurant.get("permissions", {})
    if not permissions.get("can_assign_courier", False):
        raise HTTPException(
            status_code=403, 
            detail="Bu restoran için kurye atama izni aktif değil"
        )
    
    # Engelli kurye kontrolü
    blocked_couriers = restaurant.get("blocked_couriers", [])
    if data.courier_id in blocked_couriers:
        raise HTTPException(status_code=400, detail="Bu kurye restoran tarafından engellenmiş")
    
    # Restoranda sadece "confirmed" durumundaki siparişleri kontrol et
    active_orders = await db.orders.find(
        {
            "restaurant_id": restaurant_id,
            "status": "confirmed",
            "courier_id": {"$ne": None}
        },
        {"_id": 0, "courier_id": 1}
    ).to_list(100)
    
    couriers_with_packages = list(set(o.get("courier_id") for o in active_orders if o.get("courier_id")))
    
    # Eğer restoranda onaylanmış paketi olan kurye varsa, sadece o kuryelere atama yapılabilir
    if couriers_with_packages and data.courier_id not in couriers_with_packages:
        raise HTTPException(
            status_code=400, 
            detail="Bu restorandan sadece onaylanmış paketi olan kuryelere atama yapabilirsiniz"
        )
    
    # Merkezi fonksiyon ile ata (fee hesaplanır ama restoran panelde gösterilmez)
    result = await assign_courier_core(
        order=order,
        courier_id=data.courier_id,
        actor_type="restaurant",
        actor_name="Restoran",
        calculate_fee=True,
        send_push=True
    )
    
    if not result["success"]:
        raise HTTPException(status_code=404, detail=result["error"])
    
    return {"message": f"Sipariş {result['courier_name']} kuryesine atandı"}


@router.get("/{company_id}/{order_id}")
async def get_order(company_id: str, order_id: str):
    """Tek bir sipariş detayı"""
    order = await db.orders.find_one(
        {"id": order_id, "company_id": company_id},
        {"_id": 0}
    )
    
    if not order:
        raise HTTPException(status_code=404, detail="Sipariş bulunamadı")
    
    return order


@router.post("/{company_id}/{order_id}/assign")
async def assign_courier(company_id: str, order_id: str, data: OrderAssign):
    """Siparişe kurye ata (Admin paneli)"""
    order = await db.orders.find_one({"id": order_id, "company_id": company_id})
    if not order:
        raise HTTPException(status_code=404, detail="Sipariş bulunamadı")
    
    # Sipariş zaten başka kuryeye atanmışsa, önce atamayı kaldır
    existing_courier_id = order.get("courier_id")
    if existing_courier_id and existing_courier_id != data.courier_id:
        # Eski kuryeden ata kaldır
        now = datetime.now(TURKEY_TZ).isoformat()
        old_courier = await db.couriers.find_one({"id": existing_courier_id}, {"_id": 0, "name": 1})
        old_courier_name = old_courier.get("name", "Kurye") if old_courier else "Kurye"
        old_tiered_position = order.get("tiered_position")
        
        # ÖNCE siparişi kurye atanmamış duruma getir
        history_entry = {
            "status": "reassigned",
            "label": "Kurye Değiştirildi",
            "timestamp": now,
            "note": f"{old_courier_name} → Yeni kurye atanıyor",
            "actor_type": "admin",
            "actor_name": data.admin_name or "Admin"
        }
        
        await db.orders.update_one(
            {"id": order_id},
            {
                "$set": {
                    "courier_id": None,
                    "courier_name": None,
                    "courier_phone": None,
                    "courier_fee": None,
                    "tiered_position": None,
                    "updated_at": now
                },
                "$push": {"status_history": history_entry}
            }
        )
        
        # SONRA kademeli ücretlendirme için yeniden hesapla (sipariş artık kuryeden ayrılmış)
        if old_tiered_position:
            try:
                from services.tiered_pricing_service import recalculate_tiered_fees_on_unassign
                await recalculate_tiered_fees_on_unassign(existing_courier_id, company_id)
            except Exception as e:
                logger.error(f"Eski kurye kademeli ücret güncelleme hatası: {e}")
        
        # Order'ı yeniden al (courier_id = None olmuş hali)
        order = await db.orders.find_one({"id": order_id, "company_id": company_id})
        logger.info(f"Kurye değişikliği: Sipariş {order_id}, {old_courier_name} -> yeni kurye atanacak")
        
        # Eski kuryeye bildirim gönder
        try:
            from services.push_notification_service import send_push_notification
            restaurant_name = order.get("restaurant_name", "Restoran")
            await send_push_notification(
                courier_id=existing_courier_id,
                title="Atama Kaldırıldı",
                body=f"{restaurant_name} siparişi başka kuryeye aktarıldı",
                data={
                    "type": "ORDER_REASSIGNED",
                    "orderId": order_id,
                    "restaurantName": restaurant_name
                },
                sound="notification"
            )
        except Exception as e:
            logger.error(f"Kurye değişikliği bildirimi gönderilemedi: {e}")
    
    # Restoran engel kontrolü
    restaurant_id = order.get("restaurant_id")
    if restaurant_id:
        restaurant = await db.restaurants.find_one(
            {"id": restaurant_id},
            {"_id": 0, "blocked_couriers": 1}
        )
        if restaurant:
            blocked_couriers = restaurant.get("blocked_couriers", [])
            if data.courier_id in blocked_couriers:
                # Kurye adını al
                courier = await db.couriers.find_one({"id": data.courier_id}, {"_id": 0, "name": 1})
                courier_name = courier.get("name", "Bu kurye") if courier else "Bu kurye"
                raise HTTPException(
                    status_code=400, 
                    detail=f"{courier_name} bu restoran için engellenmiş"
                )
    
    # Merkezi fonksiyon ile ata
    result = await assign_courier_core(
        order=order,
        courier_id=data.courier_id,
        actor_type="admin" if data.admin_name else "system",
        actor_name=data.admin_name or "Sistem",
        calculate_fee=True,
        send_push=True
    )
    
    if not result["success"]:
        raise HTTPException(status_code=404, detail=result["error"])
    
    # SepetTakip siparişi ise bildirim gönder
    sepettakip_order_id = order.get("sepettakip_order_id")
    if sepettakip_order_id:
        try:
            from routers.sepettakip import notify_sepettakip_status
            courier_eta = (datetime.now(TURKEY_TZ) + timedelta(minutes=30)).isoformat()
            await notify_sepettakip_status(sepettakip_order_id, "assigned", courier_eta)
            logger.info(f"SepetTakip kurye atama bildirimi: order={sepettakip_order_id}")
        except Exception as e:
            logger.error(f"SepetTakip kurye atama bildirimi hatası: {e}")
    
    return {"message": f"Sipariş {result['courier_name']} kuryesine atandı"}


@router.delete("/{company_id}/{order_id}/assign")
async def unassign_courier(company_id: str, order_id: str, admin_name: Optional[str] = None):
    """Siparişten kurye atamasını kaldır"""
    order = await db.orders.find_one({"id": order_id, "company_id": company_id})
    if not order:
        raise HTTPException(status_code=404, detail="Sipariş bulunamadı")
    
    if not order.get("courier_id"):
        raise HTTPException(status_code=400, detail="Bu siparişe kurye atanmamış")
    
    # Sipariş teslim edilmiş veya yoldaysa atama kaldırılamaz
    if order.get("status") in ["delivered", "on_the_way"]:
        raise HTTPException(status_code=400, detail="Bu durumda kurye ataması kaldırılamaz")
    
    courier_id = order.get("courier_id")
    courier_name = order.get("courier_name", "Bilinmiyor")
    
    # Merkezi fonksiyon ile güncelle
    result = await update_order_status_core(
        order_id=order_id,
        new_status="ready",
        actor_type="admin" if admin_name else "system",
        actor_name=admin_name or "Sistem",
        note=f"Kurye ataması kaldırıldı. Önceki kurye: {courier_name}",
        extra_updates={
            "courier_id": None,
            "courier_name": None,
            "assigned_at": None,
            "confirmed_at": None,
            "tiered_position": None
        },
        notify_platform=False
    )
    
    if not result["success"]:
        raise HTTPException(status_code=400, detail=result["error"])
    
    # Kademeli ücretlendirme: Kalan siparişlerin fiyatlarını kaydır
    try:
        from services.tiered_pricing_service import recalculate_tiered_fees_on_unassign
        shift_result = await recalculate_tiered_fees_on_unassign(courier_id, company_id)
        if shift_result.get("updated_count", 0) > 0:
            logger.info(f"Kademeli fiyat kaydırma: {shift_result['updated_count']} sipariş güncellendi")
    except Exception as e:
        logger.error(f"Kademeli fiyat kaydırma hatası: {e}")
    
    return {"message": "Kurye ataması kaldırıldı"}


@router.post("/{company_id}/{order_id}/status")
async def update_order_status(company_id: str, order_id: str, data: OrderStatusUpdate):
    """Sipariş durumunu güncelle (Admin için)"""
    order = await db.orders.find_one({"id": order_id, "company_id": company_id})
    if not order:
        raise HTTPException(status_code=404, detail="Sipariş bulunamadı")
    
    if data.status not in ORDER_STATUSES:
        raise HTTPException(status_code=400, detail="Geçersiz durum")
    
    # Admin sadece kurye onaylayabileceği durumları seçemez (super admin hariç)
    if data.status in COURIER_ONLY_STATUSES and not data.is_super_admin:
        raise HTTPException(
            status_code=400, 
            detail=f"'{ORDER_STATUSES[data.status]['label']}' durumu sadece kurye tarafından seçilebilir"
        )
    
    # Hazırlanıyor durumuna geçişte süre zorunlu (super admin hariç)
    if data.status == "preparing" and not data.preparation_time and not data.is_super_admin:
        raise HTTPException(
            status_code=400,
            detail="Hazırlanıyor durumu için süre belirtilmeli"
        )
    
    # Extra güncellemeleri hazırla
    extra_updates = {}
    
    # Hazırlanıyor dışındaki durumlarda preparation bilgilerini sıfırla
    if data.status != "preparing":
        extra_updates["preparation_end_at"] = None
        extra_updates["preparation_time"] = None
    
    # Kurye ataması kaldırılacak durumlara geçişte kurye bilgisini sil
    if data.status in COURIER_REMOVAL_STATUSES:
        extra_updates["courier_id"] = None
        extra_updates["courier_name"] = None
        extra_updates["assigned_at"] = None
        extra_updates["confirmed_at"] = None
    
    # Delivered durumunda ücretleri hesapla
    if data.status == "delivered":
        fees = await calculate_order_fees(order)
        extra_updates["courier_fee"] = fees["courier_fee"]
        extra_updates["restaurant_fee"] = fees["restaurant_fee"]
        extra_updates["restaurant_kdv"] = fees["restaurant_kdv"]
        extra_updates["pos_commission"] = fees["pos_commission"]
        extra_updates["distance_km"] = fees["distance_km"]
    
    # İptal durumunda cancelled_by ekle
    if data.status == "cancelled":
        extra_updates["cancelled_by"] = data.admin_name or "admin"
    
    # Merkezi fonksiyon ile güncelle
    result = await update_order_status_core(
        order_id=order_id,
        new_status=data.status,
        actor_type="admin" if data.admin_name else "system",
        actor_name=data.admin_name or "Sistem",
        preparation_time=data.preparation_time,
        cancel_reason_id=data.cancel_reason_id,
        cancel_note=data.cancel_note,
        extra_updates=extra_updates,
        notify_platform=True
    )
    
    if not result["success"]:
        raise HTTPException(status_code=400, detail=result["error"])
    
    return {"message": f"Sipariş durumu güncellendi: {ORDER_STATUSES[data.status]['label']}"}


@router.delete("/{company_id}/{order_id}")
async def delete_order(company_id: str, order_id: str):
    """Siparişi sil (sadece mock siparişler için)"""
    result = await db.orders.delete_one({"id": order_id, "company_id": company_id, "source": "mock"})
    
    if result.deleted_count == 0:
        raise HTTPException(status_code=404, detail="Sipariş bulunamadı veya silinemez")
    
    return {"message": "Sipariş silindi"}


# --- Kurye için Endpoints ---
# ESKİ get_courier_active_orders silindi - /api/orders/v2/list?panel=courier kullanın

@router.post("/courier/{courier_id}/order/{order_id}/confirm")
async def courier_confirm_order(courier_id: str, order_id: str):
    """Kurye siparişi kabul eder (Siparişi Gördüm)"""
    order = await db.orders.find_one({"id": order_id, "courier_id": courier_id})
    if not order:
        raise HTTPException(status_code=404, detail="Sipariş bulunamadı")
    
    if order["status"] != "assigned":
        raise HTTPException(status_code=400, detail="Bu sipariş onaylanamaz")
    
    # Kurye bilgisini al
    courier = await db.couriers.find_one({"id": courier_id}, {"_id": 0, "name": 1})
    courier_name = courier.get("name", "Kurye") if courier else "Kurye"
    
    result = await update_order_status_core(
        order_id=order_id,
        new_status="confirmed",
        actor_type="courier",
        actor_name=courier_name,
        note="Kurye siparişi gördü",
        notify_platform=False  # Confirm için platform bildirimi yok
    )
    
    if not result["success"]:
        raise HTTPException(status_code=400, detail=result["error"])
    
    return {"message": "Sipariş onaylandı"}


@router.post("/courier/{courier_id}/order/{order_id}/pickup")
async def courier_pickup_order(courier_id: str, order_id: str):
    """Kurye siparişi restorandan aldı - Yola Çık"""
    order = await db.orders.find_one({"id": order_id, "courier_id": courier_id})
    if not order:
        raise HTTPException(status_code=404, detail="Sipariş bulunamadı")
    
    if order["status"] != "confirmed":
        raise HTTPException(status_code=400, detail="Önce siparişi onaylamalısınız")
    
    # Kurye bilgisini al
    courier = await db.couriers.find_one({"id": courier_id}, {"_id": 0, "name": 1})
    courier_name = courier.get("name", "Kurye") if courier else "Kurye"
    
    result = await update_order_status_core(
        order_id=order_id,
        new_status="on_the_way",
        actor_type="courier",
        actor_name=courier_name,
        note="Kurye yola çıktı",
        notify_platform=True
    )
    
    if not result["success"]:
        raise HTTPException(status_code=400, detail=result["error"])
    
    return {"message": "Sipariş yola çıktı"}


@router.post("/courier/{courier_id}/bulk-pickup")
async def courier_bulk_pickup(courier_id: str, data: BulkPickupRequest):
    """Kurye birden fazla siparişi toplu yola çıkarır - Aynı restorandan siparişler için"""
    if not data.order_ids or len(data.order_ids) == 0:
        raise HTTPException(status_code=400, detail="Sipariş seçilmedi")
    
    # Kurye bilgisini al
    courier = await db.couriers.find_one({"id": courier_id}, {"_id": 0, "name": 1})
    if not courier:
        raise HTTPException(status_code=404, detail="Kurye bulunamadı")
    courier_name = courier.get("name", "Kurye")
    
    # Siparişleri kontrol et
    orders = await db.orders.find({
        "id": {"$in": data.order_ids},
        "courier_id": courier_id,
        "status": "confirmed"
    }).to_list(100)
    
    if len(orders) == 0:
        raise HTTPException(status_code=400, detail="Yola çıkarılacak onaylanmış sipariş bulunamadı")
    
    # Aynı restorandan olduğunu kontrol et
    restaurant_ids = set(o.get("restaurant_id") for o in orders)
    if len(restaurant_ids) > 1:
        raise HTTPException(status_code=400, detail="Toplu yola çıkarma sadece aynı restorandan siparişler için geçerlidir")
    
    now = datetime.now(TURKEY_TZ).isoformat()
    
    # Tüm siparişleri güncelle
    history_entry = {
        "status": "on_the_way",
        "label": "Yolda",
        "timestamp": now,
        "note": f"Kurye {len(orders)} siparişle yola çıktı",
        "actor_type": "courier",
        "actor_name": courier_name
    }
    
    result = await db.orders.update_many(
        {"id": {"$in": [o["id"] for o in orders]}},
        {
            "$set": {
                "status": "on_the_way",
                "picked_up_at": now,
                "updated_at": now
            },
            "$push": {"status_history": history_entry}
        }
    )
    
    # Platform'a bildirim gönder (her sipariş için)
    for o in orders:
        await notify_platform_status_change(o, "on_the_way")
    
    return {"message": f"{result.modified_count} sipariş yola çıktı"}


@router.post("/courier/{courier_id}/order/{order_id}/not-ready")
async def courier_order_not_ready(courier_id: str, order_id: str):
    """Sipariş henüz hazır değil - 5dk hazırlık süresi ekle ve atamayı kaldır"""
    # Yetki kontrolü
    courier = await db.couriers.find_one({"id": courier_id}, {"_id": 0, "name": 1, "permissions": 1})
    if not courier:
        raise HTTPException(status_code=404, detail="Kurye bulunamadı")
    
    permissions = courier.get("permissions", {})
    if not permissions.get("can_mark_not_ready", True):
        raise HTTPException(status_code=403, detail="Bu işlem için yetkiniz yok")
    
    order = await db.orders.find_one({"id": order_id, "courier_id": courier_id})
    if not order:
        raise HTTPException(status_code=404, detail="Sipariş bulunamadı")
    
    if order["status"] not in ["assigned", "confirmed"]:
        raise HTTPException(status_code=400, detail="Bu işlem sadece atanmış veya onaylanmış siparişler için yapılabilir")
    
    courier_name = courier.get("name", "Kurye")
    
    result = await update_order_status_core(
        order_id=order_id,
        new_status="preparing",
        actor_type="courier",
        actor_name=courier_name,
        note=f"Sipariş hazır değil - {courier_name} tarafından geri gönderildi (+5dk)",
        preparation_time=5,
        extra_updates={
            "courier_id": None,
            "courier_name": None,
            "confirmed_at": None
        },
        notify_platform=False
    )
    
    if not result["success"]:
        raise HTTPException(status_code=400, detail=result["error"])
    
    return {"message": "Sipariş hazırlanıyor olarak işaretlendi ve atama kaldırıldı"}


class PaymentDetails(BaseModel):
    cash_amount: float = 0
    card_amount: float = 0
    payment_method: Optional[str] = None  # "cash", "card", "mixed"

@router.post("/courier/{courier_id}/order/{order_id}/deliver")
async def courier_deliver_order(
    courier_id: str, 
    order_id: str,
    payment_details: Optional[PaymentDetails] = None
):
    """Kurye siparişi teslim etti"""
    order = await db.orders.find_one({"id": order_id, "courier_id": courier_id})
    if not order:
        raise HTTPException(status_code=404, detail="Sipariş bulunamadı")
    
    if order["status"] != "on_the_way":
        raise HTTPException(status_code=400, detail="Önce yola çıkmalısınız")
    
    # Kurye bilgisini al
    courier = await db.couriers.find_one({"id": courier_id}, {"_id": 0, "name": 1})
    courier_name = courier.get("name", "Kurye") if courier else "Kurye"
    
    # Ücretleri hesapla
    fees = await calculate_order_fees(order)
    
    # Extra güncellemeler
    extra_updates = {
        "courier_fee": fees["courier_fee"],
        "restaurant_fee": fees["restaurant_fee"],
        "restaurant_kdv": fees["restaurant_kdv"],
        "pos_commission": fees["pos_commission"],
        "distance_km": fees["distance_km"]
    }
    
    # Ödeme detayları varsa ekle
    if payment_details:
        if payment_details.payment_method:
            extra_updates["payment_method"] = payment_details.payment_method
        extra_updates["payment_details"] = {
            "cash_amount": payment_details.cash_amount,
            "card_amount": payment_details.card_amount,
            "original_method": order.get("payment_method", "unknown")
        }
    
    result = await update_order_status_core(
        order_id=order_id,
        new_status="delivered",
        actor_type="courier",
        actor_name=courier_name,
        note="Sipariş müşteriye teslim edildi",
        extra_updates=extra_updates,
        notify_platform=True
    )
    
    if not result["success"]:
        raise HTTPException(status_code=400, detail=result["error"])
    
    return {"message": "Sipariş teslim edildi"}


@router.post("/courier/{courier_id}/order/{order_id}/reject")
async def courier_reject_order(courier_id: str, order_id: str, reason: Optional[str] = None):
    """Kurye siparişi reddeder"""
    order = await db.orders.find_one({"id": order_id, "courier_id": courier_id})
    if not order:
        raise HTTPException(status_code=404, detail="Sipariş bulunamadı")
    
    if order["status"] not in ["assigned", "confirmed"]:
        raise HTTPException(status_code=400, detail="Bu sipariş reddedilemez")
    
    # Kurye bilgisini al
    courier = await db.couriers.find_one({"id": courier_id}, {"_id": 0, "name": 1})
    courier_name = courier.get("name", "Kurye") if courier else "Kurye"
    
    result = await update_order_status_core(
        order_id=order_id,
        new_status="ready",
        actor_type="courier",
        actor_name=courier_name,
        note="Kurye reddetti" + (f", Sebep: {reason}" if reason else ""),
        extra_updates={
            "courier_id": None,
            "courier_name": None,
            "rejection_reason": reason,
            "rejected_at": datetime.now(TURKEY_TZ).isoformat()
        },
        notify_platform=False
    )
    
    if not result["success"]:
        raise HTTPException(status_code=400, detail=result["error"])
    
    return {"message": "Sipariş reddedildi, başka kuryeye atanabilir"}


# --- Sipariş Ücret Güncelleme (Sadece Super Admin) ---
@router.put("/{order_id}/fees")
async def update_order_fees(order_id: str, data: OrderFeesUpdate):
    """Sipariş ücretlerini güncelle (sadece super admin)"""
    order = await db.orders.find_one({"id": order_id})
    if not order:
        raise HTTPException(status_code=404, detail="Sipariş bulunamadı")
    
    # Sadece teslim edilmiş siparişlerin ücreti değiştirilebilir
    if order.get("status") != "delivered":
        raise HTTPException(status_code=400, detail="Sadece teslim edilmiş siparişlerin ücreti değiştirilebilir")
    
    update_data = {"updated_at": datetime.now(TURKEY_TZ).isoformat()}
    
    if data.courier_fee is not None:
        update_data["courier_fee"] = round(data.courier_fee, 2)
    
    if data.restaurant_fee is not None:
        update_data["restaurant_fee"] = round(data.restaurant_fee, 2)
    
    if data.restaurant_kdv is not None:
        update_data["restaurant_kdv"] = round(data.restaurant_kdv, 2)
    
    if data.pos_commission is not None:
        update_data["pos_commission"] = round(data.pos_commission, 2)
    
    # History entry for audit trail
    kdv_info = f", KDV: {data.restaurant_kdv}₺" if data.restaurant_kdv else ""
    pos_info = f", POS: {data.pos_commission}₺" if data.pos_commission else ""
    history_entry = {
        "status": "fee_updated",
        "label": "Ücret Güncellendi",
        "timestamp": datetime.now(TURKEY_TZ).isoformat(),
        "note": f"Kurye: {data.courier_fee}₺, Restoran: {data.restaurant_fee}₺{kdv_info}{pos_info}",
        "actor_type": "super_admin",
        "actor_name": data.admin_name or "Admin"
    }
    
    await db.orders.update_one(
        {"id": order_id},
        {
            "$set": update_data,
            "$push": {"status_history": history_entry}
        }
    )
    
    return {
        "message": "Ücretler güncellendi",
        "courier_fee": update_data.get("courier_fee", order.get("courier_fee")),
        "restaurant_fee": update_data.get("restaurant_fee", order.get("restaurant_fee")),
        "restaurant_kdv": update_data.get("restaurant_kdv", order.get("restaurant_kdv")),
        "pos_commission": update_data.get("pos_commission", order.get("pos_commission"))
    }


# --- Manuel Sipariş Oluşturma (Restoran Paneli) ---

@router.post("/manual")
async def create_manual_order(data: ManualOrderCreate):
    """Restoran panelinden manuel sipariş oluştur (telefon siparişleri için)"""
    
    # Restoran bilgisini al (pricing alanları dahil)
    restaurant = await db.restaurants.find_one(
        {"id": data.restaurant_id},
        {"_id": 0, "id": 1, "name": 1, "latitude": 1, "longitude": 1, "company_id": 1, "preparation_time": 1, "product_preparation_times": 1, "pricing_type": 1, "per_package_price": 1, "km_ranges": 1, "kdv_rate": 1}
    )
    
    if not restaurant:
        raise HTTPException(status_code=404, detail="Restoran bulunamadı")
    
    now = datetime.now(TURKEY_TZ)
    
    # Sipariş numarası oluştur
    order_number = f"TEL-{random.randint(1000, 9999)}"
    
    # Toplam tutarı hesapla
    total_amount = sum(item.price * item.quantity for item in data.items)
    
    # Items listesi oluştur
    items = [
        {
            "product_id": item.product_id,
            "name": item.name,
            "quantity": item.quantity,
            "price": item.price
        }
        for item in data.items
    ]
    
    # Programlı sipariş kontrolü
    if data.is_scheduled and data.scheduled_time:
        # Scheduled time'ı parse et
        try:
            scheduled_dt = datetime.fromisoformat(data.scheduled_time.replace('Z', '+00:00'))
            # 30 dakikalık tampon - sipariş teslimata 30dk kala hazır olacak
            buffer_minutes = 30
            # Hazırlık bitiş zamanı = scheduled_time - buffer (hazır olma zamanı)
            preparation_end_at = scheduled_dt - timedelta(minutes=buffer_minutes)
            
            # İleri tarihli siparişlerde prep_time = preparation_end_at - now
            # Örnek: 17:00'da 19:00 teslimatı için -> 18:30 hazır -> 90dk hazırlık
            time_until_ready = (preparation_end_at - now).total_seconds() / 60
            prep_time = max(int(time_until_ready), 0)  # Negatif olamaz
            
            initial_status = "scheduled"
            history_note = f"Programlı teslimat: {scheduled_dt.strftime('%d.%m.%Y %H:%M')} (Hazırlık: {prep_time} dk)"
        except Exception as e:
            raise HTTPException(status_code=400, detail=f"Geçersiz tarih formatı: {str(e)}")
    else:
        # Standart siparişler için hazırlık süresini hesapla (standart + ürün bazlı ekstra)
        prep_time = calculate_preparation_time(restaurant, items)
        preparation_end_at = now + timedelta(minutes=prep_time)
        initial_status = "preparing"
        history_note = f"Hazırlık süresi: {prep_time} dakika"
    
    # Taşıma ücreti hesapla
    restaurant_location = {
        "latitude": restaurant.get("latitude"),
        "longitude": restaurant.get("longitude")
    }
    delivery_location_dict = {
        "latitude": data.delivery_location.lat if data.delivery_location else None,
        "longitude": data.delivery_location.lng if data.delivery_location else None
    } if data.delivery_location else None
    
    restaurant_fee, restaurant_kdv = calculate_restaurant_fee(
        restaurant, restaurant_location, delivery_location_dict
    )
    
    # Sipariş oluştur
    order = {
        "id": str(uuid.uuid4()),
        "order_number": order_number,
        "company_id": restaurant.get("company_id"),
        "restaurant_id": data.restaurant_id,
        "restaurant_name": restaurant.get("name"),
        "restaurant_location": restaurant_location,
        "customer_name": data.customer_name,
        "customer_phone": data.customer_phone or "",
        "delivery_address": data.delivery_address,
        "delivery_location": delivery_location_dict,
        "items": items,
        "total_amount": total_amount,
        "restaurant_fee": restaurant_fee,
        "restaurant_kdv": restaurant_kdv,
        "payment_method": data.payment_method,
        "payment_method_detail": data.payment_method_detail,  # Yemek kartı türü
        "status": initial_status,
        "preparation_time": prep_time,
        "preparation_end_at": preparation_end_at.isoformat(),
        "courier_id": None,
        "courier_name": None,
        "assigned_at": None,
        "confirmed_at": None,
        "delivered_at": None,
        "notes": data.notes or "",
        "source": "manual",  # manuel, adisyo, mock gibi
        "is_scheduled": data.is_scheduled,
        "scheduled_time": data.scheduled_time if data.is_scheduled else None,
        "created_at": now.isoformat(),
        "updated_at": now.isoformat(),
        "status_history": [
            {
                "status": initial_status,
                "label": "Programlı Sipariş" if data.is_scheduled else "Sipariş Alındı",
                "timestamp": now.isoformat(),
                "note": history_note,
                "actor_type": "restaurant",
                "actor_name": "Restoran Paneli"
            }
        ]
    }
    
    # Taşıma ücreti hesapla
    delivery_fee = 0
    delivery_fee_kdv = 0
    if restaurant.get("pricing_type") and data.delivery_location:
        from math import radians, sin, cos, sqrt, atan2
        
        # Mesafe hesapla
        rest_lat = restaurant.get("latitude", 0)
        rest_lng = restaurant.get("longitude", 0)
        del_lat = data.delivery_location.lat
        del_lng = data.delivery_location.lng
        
        if rest_lat and rest_lng and del_lat and del_lng:
            R = 6371
            lat1, lat2 = radians(rest_lat), radians(del_lat)
            dlat = radians(del_lat - rest_lat)
            dlng = radians(del_lng - rest_lng)
            a = sin(dlat/2)**2 + cos(lat1) * cos(lat2) * sin(dlng/2)**2
            c = 2 * atan2(sqrt(a), sqrt(1-a))
            distance_km = R * c
            
            # Ücret hesapla
            pricing_type = restaurant.get("pricing_type", "per_package")
            per_package_price = restaurant.get("per_package_price", 0)
            km_ranges = restaurant.get("km_ranges", [])
            
            if pricing_type == "per_package":
                delivery_fee = per_package_price
            elif pricing_type == "per_km" and km_ranges:
                for r in km_ranges:
                    if r.get("min_km", 0) <= distance_km < r.get("max_km", 999):
                        delivery_fee = r.get("price", 0)
                        break
            
            # KDV hesapla
            kdv_rate = restaurant.get("kdv_rate", 0)
            if kdv_rate > 0 and delivery_fee > 0:
                delivery_fee_kdv = delivery_fee * (kdv_rate / 100)
            
            order["distance_km"] = round(distance_km, 2)
    
    order["delivery_fee"] = round(delivery_fee, 2)
    order["delivery_fee_kdv"] = round(delivery_fee_kdv, 2)
    
    # Veritabanına kaydet (ve kontör düş)
    await insert_order(order)
    
    # Müşteriyi otomatik kaydet
    try:
        from routers.customers import auto_save_customer_from_order
        await auto_save_customer_from_order(order)
    except Exception as e:
        logger.warning(f"Müşteri otomatik kayıt hatası: {e}")
    
    # _id'yi kaldır
    order.pop("_id", None)
    
    return {
        "message": "Sipariş başarıyla oluşturuldu",
        "order": order
    }


# --- Restoran Teslimatı İşaretleme ---
@router.post("/{order_id}/mark-restaurant-delivery")
async def mark_restaurant_delivery(order_id: str, restaurant_id: str):
    """
    Siparişi restoran teslimatı olarak işaretle.
    
    Kurallar:
    - Restoran izni olmalı (can_mark_restaurant_delivery)
    - Yolda veya Teslim Edildi durumunda işaretlenemez
    - Kurye atandıktan 3dk geçtiyse ve onaylandı durumundaysa işaretlenemez
    
    Sonuç:
    - Kurye ataması kaldırılır
    - Sipariş yönetici panelinden gizlenir
    - Mütabakat ve raporlara dahil edilmez
    """
    # Siparişi bul
    order = await db.orders.find_one({"id": order_id})
    if not order:
        raise HTTPException(status_code=404, detail="Sipariş bulunamadı")
    
    # Sipariş bu restorana mı ait
    if order.get("restaurant_id") != restaurant_id:
        raise HTTPException(status_code=403, detail="Bu sipariş size ait değil")
    
    # Zaten restoran teslimatı mı
    if order.get("is_restaurant_delivery"):
        raise HTTPException(status_code=400, detail="Bu sipariş zaten restoran teslimatı olarak işaretli")
    
    # İzin kontrolü
    restaurant = await db.restaurants.find_one({"id": restaurant_id}, {"_id": 0, "permissions": 1})
    permissions = restaurant.get("permissions", {}) if restaurant else {}
    if not permissions.get("can_mark_restaurant_delivery", False):
        raise HTTPException(status_code=403, detail="Restoran teslimatı işaretleme izniniz yok")
    
    # Durum kontrolü - Yolda veya Teslim Edildi işaretlenemez
    current_status = order.get("status", "")
    if current_status in ["on_the_way", "delivered"]:
        status_text = "Yolda" if current_status == "on_the_way" else "Teslim Edildi"
        raise HTTPException(status_code=400, detail=f"{status_text} durumundaki siparişler restoran teslimatı olarak işaretlenemez")
    
    # 3 dakika kuralı - Kurye atandıktan 3dk geçtiyse ve onaylandı durumundaysa
    courier_id = order.get("courier_id")
    if courier_id and current_status == "confirmed":
        assigned_at = order.get("assigned_at")
        if assigned_at:
            try:
                if isinstance(assigned_at, str):
                    assigned_time = datetime.fromisoformat(assigned_at.replace('Z', '+00:00'))
                else:
                    assigned_time = assigned_at
                
                now = datetime.now(TURKEY_TZ)
                elapsed = (now - assigned_time).total_seconds()
                
                if elapsed > 180:  # 3 dakika = 180 saniye
                    raise HTTPException(
                        status_code=400, 
                        detail="Kurye atandıktan 3 dakika geçtiği için restoran teslimatı olarak işaretlenemez"
                    )
            except (ValueError, TypeError):
                pass  # Tarih parse edilemezse devam et
    
    # İşaretle
    now = datetime.now(TURKEY_TZ)
    
    # Önceki durumu ve hazırlık bilgilerini kaydet (geri aktarıldığında kullanılacak)
    update_data = {
        "is_restaurant_delivery": True,
        "restaurant_delivery_marked_at": now.isoformat(),
        "restaurant_delivery_marked_by": restaurant_id,
        "status_before_restaurant_delivery": order.get("status"),
        "preparation_time_before_restaurant_delivery": order.get("preparation_time"),
        "preparation_end_at_before_restaurant_delivery": order.get("preparation_end_at"),
        "courier_id": None,
        "courier_name": None,
        "courier_phone": None,
        "updated_at": now.isoformat()
    }
    
    # Status history'ye ekle
    history_entry = {
        "status": "restaurant_delivery",
        "label": "Restoran Teslimatı",
        "timestamp": now.isoformat(),
        "note": "Restoran teslimatı olarak işaretlendi",
        "actor_type": "restaurant",
        "actor_name": "Restoran"
    }
    
    await db.orders.update_one(
        {"id": order_id},
        {
            "$set": update_data,
            "$push": {"status_history": history_entry}
        }
    )
    
    logger.info(f"Sipariş restoran teslimatı olarak işaretlendi: {order_id}, restaurant: {restaurant_id}")
    
    return {
        "message": "Sipariş restoran teslimatı olarak işaretlendi",
        "order_id": order_id
    }


@router.post("/{order_id}/unmark-restaurant-delivery")
async def unmark_restaurant_delivery(order_id: str, restaurant_id: str):
    """
    Restoran teslimatı işaretini kaldır - sipariş tekrar kurye şirketine aktarılır.
    
    Kurallar:
    - Restoran izni olmalı (can_mark_restaurant_delivery)
    - Sipariş restoran teslimatı olarak işaretli olmalı
    - Teslim edilmiş siparişler geri alınamaz
    """
    # Siparişi bul
    order = await db.orders.find_one({"id": order_id})
    if not order:
        raise HTTPException(status_code=404, detail="Sipariş bulunamadı")
    
    # Sipariş bu restorana mı ait
    if order.get("restaurant_id") != restaurant_id:
        raise HTTPException(status_code=403, detail="Bu sipariş size ait değil")
    
    # Restoran teslimatı kontrolü
    if not order.get("is_restaurant_delivery"):
        raise HTTPException(status_code=400, detail="Bu sipariş zaten restoran teslimatı değil")
    
    # Teslim edilmiş sipariş geri alınamaz
    if order.get("status") == "delivered":
        raise HTTPException(status_code=400, detail="Teslim edilmiş siparişler geri alınamaz")
    
    # İzin kontrolü
    restaurant = await db.restaurants.find_one({"id": restaurant_id}, {"_id": 0, "permissions": 1})
    permissions = restaurant.get("permissions", {}) if restaurant else {}
    if not permissions.get("can_mark_restaurant_delivery", False):
        raise HTTPException(status_code=403, detail="Restoran teslimatı işaretleme izniniz yok")
    
    now = datetime.now(TURKEY_TZ)
    
    # Restoran teslimatı öncesi duruma dön
    # Eğer önceki durum kaydedilmişse onu kullan, yoksa "preparing" olarak başlat
    previous_status = order.get("status_before_restaurant_delivery", "preparing")
    previous_prep_time = order.get("preparation_time_before_restaurant_delivery")
    previous_prep_end_at = order.get("preparation_end_at_before_restaurant_delivery")
    
    # Eğer önceki durum "preparing" ise ve hazırlık süresi dolmuşsa, yeni süre başlat
    # Süre dolmuşsa 15 dakika ile yeniden başlat
    if previous_status == "preparing":
        if previous_prep_end_at:
            try:
                prep_end = datetime.fromisoformat(previous_prep_end_at.replace('Z', '+00:00'))
                if prep_end <= now:
                    # Süre dolmuş, 15 dakika ile yeniden başlat
                    previous_prep_time = 15
                    previous_prep_end_at = (now + timedelta(minutes=15)).isoformat()
            except (ValueError, TypeError):
                # Parse hatası, 15 dakika ile başlat
                previous_prep_time = 15
                previous_prep_end_at = (now + timedelta(minutes=15)).isoformat()
        else:
            # Hazırlık süresi yoksa 15 dakika ile başlat
            previous_prep_time = 15
            previous_prep_end_at = (now + timedelta(minutes=15)).isoformat()
    
    update_data = {
        "is_restaurant_delivery": False,
        "restaurant_delivery_unmarked_at": now.isoformat(),
        "status": previous_status,
        "preparation_time": previous_prep_time,
        "preparation_end_at": previous_prep_end_at,
        "updated_at": now.isoformat()
    }
    
    # Status history'ye ekle
    status_label = "Hazırlanıyor" if previous_status == "preparing" else ORDER_STATUSES.get(previous_status, {}).get("label", previous_status)
    history_entry = {
        "status": previous_status,
        "label": f"Kurye Şirketine Aktarıldı ({status_label})",
        "timestamp": now.isoformat(),
        "note": f"Restoran teslimatı iptal edildi, sipariş kurye şirketine aktarıldı. Durum: {status_label}",
        "actor_type": "restaurant",
        "actor_name": "Restoran"
    }
    
    await db.orders.update_one(
        {"id": order_id},
        {
            "$set": update_data,
            "$push": {"status_history": history_entry}
        }
    )
    
    logger.info(f"Restoran teslimatı iptal edildi: {order_id}, restaurant: {restaurant_id}, status: {previous_status}")
    
    return {
        "message": "Sipariş kurye şirketine aktarıldı",
        "order_id": order_id,
        "status": previous_status
    }


@router.post("/{order_id}/restaurant-update-status")
async def restaurant_update_delivery_status(order_id: str, restaurant_id: str, new_status: str):
    """
    Restoran teslimatı olan siparişin durumunu güncelle.
    Sadece restoran teslimatı işaretli siparişler için çalışır.
    """
    # Siparişi bul
    order = await db.orders.find_one({"id": order_id})
    if not order:
        raise HTTPException(status_code=404, detail="Sipariş bulunamadı")
    
    # Sipariş bu restorana mı ait
    if order.get("restaurant_id") != restaurant_id:
        raise HTTPException(status_code=403, detail="Bu sipariş size ait değil")
    
    # Restoran teslimatı kontrolü
    if not order.get("is_restaurant_delivery"):
        raise HTTPException(status_code=400, detail="Bu sipariş restoran teslimatı değil")
    
    # İzin verilen durumlar
    allowed_statuses = ["preparing", "confirmed", "on_the_way", "delivered", "cancelled"]
    if new_status not in allowed_statuses:
        raise HTTPException(status_code=400, detail=f"Geçersiz durum. İzin verilenler: {', '.join(allowed_statuses)}")
    
    # Extra güncellemeler
    extra_updates = {}
    if new_status == "delivered":
        extra_updates["delivered_by"] = "restaurant"
    if new_status == "cancelled":
        extra_updates["cancelled_by"] = "restaurant"
    
    result = await update_order_status_core(
        order_id=order_id,
        new_status=new_status,
        actor_type="restaurant",
        actor_name=order.get("restaurant_name", "Restoran"),
        extra_updates=extra_updates if extra_updates else None,
        notify_platform=True
    )
    
    if not result["success"]:
        raise HTTPException(status_code=400, detail=result["error"])
    
    status_labels = {
        "preparing": "Hazırlanıyor", "confirmed": "Onaylandı",
        "on_the_way": "Yolda", "delivered": "Teslim Edildi", "cancelled": "İptal Edildi"
    }
    
    return {
        "success": True,
        "message": f"Sipariş durumu güncellendi: {status_labels.get(new_status, new_status)}",
        "order_id": order_id,
        "status": new_status
    }


# --- Kurye ETA Endpoint ---

@router.get("/courier/{courier_id}/eta/{restaurant_id}")
async def get_courier_eta_for_restaurant_endpoint(courier_id: str, restaurant_id: str):
    """
    Kuryenin belirli bir restorana tahmini varış süresini hesapla.
    
    Bu endpoint kuryenin mevcut siparişlerini ve konumunu dikkate alarak
    dinamik ETA hesaplar.
    
    Returns:
        eta_minutes: Toplam tahmini dakika
        eta_text: "~15 dk" formatında
        distance_km: Toplam mesafe
        current_orders_count: Mevcut sipariş sayısı
        route_summary: "2 teslimat, 1 teslim alım sonra" gibi özet
        breakdown: Detaylı rota bilgisi
    """
    return await calculate_courier_eta_for_restaurant(courier_id, restaurant_id)


@router.get("/restaurant/{restaurant_id}/couriers-with-eta")
async def get_couriers_with_eta_for_restaurant(restaurant_id: str):
    """
    Restoran için uygun kuryeleri ETA bilgisiyle birlikte getir.
    
    Her kurye için dinamik ETA hesaplanır.
    """
    # Restoran bilgisini al
    restaurant = await db.restaurants.find_one(
        {"id": restaurant_id},
        {"_id": 0, "id": 1, "company_id": 1, "blocked_couriers": 1, "permissions": 1,
         "latitude": 1, "longitude": 1, "name": 1}
    )
    
    if not restaurant:
        raise HTTPException(status_code=404, detail="Restoran bulunamadı")
    
    # İzin kontrolü
    permissions = restaurant.get("permissions", {})
    if not permissions.get("can_assign_courier", False):
        return {
            "couriers": [],
            "restriction_mode": "disabled",
            "message": "Kurye atama izni aktif değil"
        }
    
    blocked_couriers = restaurant.get("blocked_couriers", [])
    restaurant_location = {
        "latitude": restaurant.get("latitude"),
        "longitude": restaurant.get("longitude")
    }
    
    # Restoranda sadece "confirmed" durumundaki siparişleri bul
    active_orders = await db.orders.find(
        {
            "restaurant_id": restaurant_id,
            "status": "confirmed",
            "courier_id": {"$ne": None}
        },
        {"_id": 0, "courier_id": 1}
    ).to_list(100)
    
    couriers_with_packages = list(set(o.get("courier_id") for o in active_orders if o.get("courier_id")))
    
    if couriers_with_packages:
        valid_courier_ids = [c for c in couriers_with_packages if c not in blocked_couriers]
        
        couriers = await db.couriers.find(
            {"id": {"$in": valid_courier_ids}},
            {"_id": 0, "id": 1, "name": 1, "phone": 1, "status": 1, "current_location": 1}
        ).to_list(50)
        
        restriction_mode = "restricted"
    else:
        couriers = []
        restriction_mode = "no_packages"
    
    # Her kurye için ETA hesapla
    couriers_with_eta = []
    for courier in couriers:
        package_count = sum(1 for o in active_orders if o.get("courier_id") == courier["id"])
        
        # ETA hesapla
        eta_info = await calculate_courier_eta_for_restaurant(
            courier["id"], 
            restaurant_id, 
            restaurant_location
        )
        
        couriers_with_eta.append({
            **courier,
            "package_count": package_count,
            "eta": eta_info
        })
    
    # ETA süresine göre sırala (en yakın önce)
    couriers_with_eta.sort(key=lambda c: c["eta"].get("eta_minutes") or 999)
    
    return {
        "couriers": couriers_with_eta,
        "restriction_mode": restriction_mode,
        "couriers_with_packages": couriers_with_packages
    }

