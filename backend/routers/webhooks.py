"""
Webhook Endpoints
- Yemeksepeti Webhook
- Getir Webhook (Sipariş + İptal)
- Migros Webhook
"""
from fastapi import APIRouter, HTTPException, Request, Header
from typing import Optional
import logging
import uuid
import os
from datetime import datetime, timezone, timedelta

# Türkiye timezone (UTC+3)
TURKEY_TZ = timezone(timedelta(hours=3))

from services.yemeksepeti_service import (
    process_yemeksepeti_webhook,
    verify_webhook_signature
)
from services.getir_service import (
    map_getir_status,
    map_getir_payment,
    convert_getir_order_to_shiftjet
)
from services.migros_service import MigrosYemekService
from services.credit_service import insert_order
from utils.database import db

router = APIRouter(prefix="/api/webhooks", tags=["Webhooks"])
logger = logging.getLogger(__name__)
from services.integration_log_service import save_integration_log as _save_log

# Migros Secret Key - .env'den al (tüm restoranlar için ortak)
MIGROS_SECRET_KEY = "oPbkAZjSO6HDD0E0wt9GR5IVQWNNgpFA"


# ==================== GETİR WEBHOOKS ====================

# Getir için API Key - .env'den al
GETIR_WEBHOOK_API_KEY = os.environ.get("GETIR_WEBHOOK_API_KEY", "")


async def verify_getir_api_key(api_key: str, restaurant_id: str = None) -> dict:
    """
    Getir webhook API key doğrulama.
    Sabit API key kullanılır - tüm restoranlar için geçerli.
    """
    if not api_key:
        return {"valid": False, "restaurant": None}
    
    # Sabit API key kontrolü
    if api_key != GETIR_WEBHOOK_API_KEY:
        return {"valid": False, "restaurant": None}
    
    # API key doğru - şimdilik restaurant bilgisi olmadan kabul et
    # Getir siparişinde restaurant bilgisi gelecek
    return {"valid": True, "restaurant": None}


@router.post("/getir/order")
async def getir_order_webhook(
    request: Request,
    x_api_key: Optional[str] = Header(None, alias="x-api-key")
):
    """
    Getir Sipariş Webhook Endpoint
    
    Getir yeni sipariş ve sipariş durumu değişikliklerini bu endpoint'e gönderir.
    
    Headers:
        x-api-key: Restoran için tanımlanan API key
    
    Body: Getir sipariş objesi
    """
    try:
        # API Key doğrulama
        auth_result = await verify_getir_api_key(x_api_key)
        
        if not auth_result["valid"]:
            logger.warning("Getir webhook: Geçersiz API key")
            await _save_log("getir", "ERROR", f"Geçersiz API key: {x_api_key}")
            raise HTTPException(status_code=401, detail="Geçersiz API key")
        
        # JSON parse
        try:
            webhook_data = await request.json()
        except:
            logger.error("Getir webhook: JSON parse hatası")
            await _save_log("getir", "ERROR", "JSON parse hatası")
            raise HTTPException(status_code=400, detail="Geçersiz JSON")
        
        # Sipariş ID - Getir farklı field'larda gönderebilir (id / orderId / _id / clientOrderId)
        getir_order_id = (
            webhook_data.get("id")
            or webhook_data.get("orderId")
            or webhook_data.get("_id")
            or webhook_data.get("clientOrderId")
            or webhook_data.get("order_id")
        )
        
        # Tam payload'ı debug için logla (Getir gerçek payload yapısını görmek için)
        logger.info(f"Getir sipariş webhook alındı: order_id={getir_order_id}, payload_keys={list(webhook_data.keys())}")
        await _save_log(
            "getir", "INFO",
            f"Webhook alındı: order_id={getir_order_id}",
            data={"payload": webhook_data, "headers_keys": list(webhook_data.keys())}
        )
        
        if not getir_order_id:
            logger.warning(f"Getir webhook: Sipariş ID bulunamadı, payload={webhook_data}")
            await _save_log(
                "getir", "WARNING",
                "Sipariş ID bulunamadı - payload formatı beklenenden farklı",
                data={"payload": webhook_data}
            )
            # Getir test/ping istekleri için 200 dön (webhook setup başarılı görünmesi için)
            return {"status": "ok", "message": "Sipariş ID bulunamadı (test/ping olabilir)", "action": "skipped"}
        
        # ID'yi normalize et — downstream kod (convert + getir_raw) `id` field'ını okur
        webhook_data["id"] = getir_order_id
        
        # Restoran bilgisini Getir verisinden al
        getir_restaurant_id = webhook_data.get("restaurant", {}).get("id") or webhook_data.get("restaurantId")
        
        # Sistemdeki restoranı bul (Getir restaurant ID ile eşleştir)
        restaurant = None
        if getir_restaurant_id:
            restaurant = await db.restaurants.find_one(
                {"platform_integrations.getir.restaurant_id": getir_restaurant_id},
                {"_id": 0}
            )
        
        if not restaurant:
            logger.warning(f"Getir webhook: Restoran bulunamadı, getir_restaurant_id={getir_restaurant_id}")
            await _save_log("getir", "WARNING", f"Restoran bulunamadı: getir_restaurant_id={getir_restaurant_id}")
        
        restaurant_id = restaurant.get("id") if restaurant else None
        
        # Mevcut sipariş kontrolü
        existing = await db.orders.find_one({"getir_order_id": getir_order_id})
        
        if existing:
            # Sipariş zaten var, durum güncelle
            current_status = existing.get("status")
            new_status = map_getir_status(webhook_data.get("status", "pending"))
            
            # ShiftJet'te ilerlemiş siparişlerin durumunu değiştirme
            shiftjet_priority_statuses = ["assigned", "confirmed", "on_the_way", "delivered", "cancelled"]
            
            if current_status not in shiftjet_priority_statuses and current_status != new_status:
                await db.orders.update_one(
                    {"getir_order_id": getir_order_id},
                    {"$set": {
                        "status": new_status,
                        "updated_at": datetime.now(TURKEY_TZ).isoformat(),
                        "getir_raw.status": webhook_data.get("status")
                    }}
                )
                logger.info(f"Getir sipariş güncellendi: {getir_order_id}, yeni durum: {new_status}")
                return {"status": "ok", "message": "Sipariş güncellendi", "action": "updated"}
            else:
                logger.info(f"Getir sipariş atlandı (durum zaten ilerletilmiş): {getir_order_id}")
                return {"status": "ok", "message": "Sipariş zaten güncel", "action": "skipped"}
        
        # Yeni sipariş - dönüştür ve kaydet
        shiftjet_order = await convert_getir_order_to_shiftjet(webhook_data, restaurant)
        
        # Hazırlama süresini hesapla
        try:
            from routers.orders import calculate_preparation_time_async
            prep_time = await calculate_preparation_time_async(restaurant_id, shiftjet_order.get("items", []))
        except:
            prep_time = 20  # Default 20 dakika
        
        prep_end = datetime.now(TURKEY_TZ) + timedelta(minutes=prep_time)
        shiftjet_order["preparation_time"] = prep_time
        shiftjet_order["preparation_end_at"] = prep_end.isoformat()
        
        await insert_order(shiftjet_order)
        logger.info(f"Getir yeni sipariş oluşturuldu: {getir_order_id}")
        
        return {"status": "ok", "message": "Sipariş oluşturuldu", "action": "created", "order_id": shiftjet_order["id"]}
        
    except HTTPException:
        raise
    except Exception as e:
        logger.exception(f"Getir sipariş webhook hatası: {str(e)}")
        return {"status": "error", "message": str(e)}


@router.post("/getir/cancel")
async def getir_cancel_webhook(
    request: Request,
    x_api_key: Optional[str] = Header(None, alias="x-api-key")
):
    """
    Getir Sipariş İptal Webhook Endpoint
    
    Getir sipariş iptallerini bu endpoint'e gönderir.
    
    Headers:
        x-api-key: Sabit API key (agrosjet-getir-wh-9f3k7x2m4p)
    
    Body: İptal bilgisi (order_id, cancel_reason, etc.)
    """
    try:
        # API Key doğrulama
        auth_result = await verify_getir_api_key(x_api_key)
        
        if not auth_result["valid"]:
            logger.warning("Getir iptal webhook: Geçersiz API key")
            raise HTTPException(status_code=401, detail="Geçersiz API key")
        
        # JSON parse
        try:
            webhook_data = await request.json()
        except:
            logger.error("Getir iptal webhook: JSON parse hatası")
            raise HTTPException(status_code=400, detail="Geçersiz JSON")
        
        logger.info(f"Getir iptal webhook alındı: data={webhook_data}")
        
        # Sipariş ID - Getir farklı field'larda gönderebilir
        getir_order_id = (
            webhook_data.get("id")
            or webhook_data.get("orderId")
            or webhook_data.get("_id")
            or webhook_data.get("clientOrderId")
            or webhook_data.get("order_id")
        )
        
        await _save_log(
            "getir", "INFO",
            f"İptal webhook alındı: order_id={getir_order_id}",
            data={"payload": webhook_data}
        )
        
        if not getir_order_id:
            logger.warning(f"Getir iptal webhook: Sipariş ID bulunamadı, payload={webhook_data}")
            await _save_log(
                "getir", "WARNING",
                "İptal webhook: Sipariş ID bulunamadı",
                data={"payload": webhook_data}
            )
            return {"status": "ok", "message": "Sipariş ID bulunamadı", "action": "skipped"}
        
        # Siparişi bul
        existing = await db.orders.find_one({"getir_order_id": getir_order_id})
        
        if not existing:
            logger.warning(f"Getir iptal webhook: Sipariş bulunamadı, order_id={getir_order_id}")
            return {"status": "ok", "message": "Sipariş bulunamadı (zaten yok veya iptal edilmiş)"}
        
        # İptal nedeni
        cancel_reason = webhook_data.get("cancelReason") or webhook_data.get("cancel_reason") or webhook_data.get("reason") or "Getir tarafından iptal edildi"
        
        # Türkiye saati (UTC+3)
        turkey_tz = timezone(timedelta(hours=3))
        now_turkey = datetime.now(turkey_tz).isoformat()
        
        # Siparişi iptal et
        await db.orders.update_one(
            {"getir_order_id": getir_order_id},
            {"$set": {
                "status": "cancelled",
                "updated_at": now_turkey,
                "cancel_reason": cancel_reason,
                "cancelled_by": "getir_webhook",
                "cancelled_at": now_turkey,
                "getir_raw.status": "cancelled"
            }}
        )
        
        logger.info(f"Getir sipariş iptal edildi: {getir_order_id}, neden: {cancel_reason}")
        
        return {"status": "ok", "message": "Sipariş iptal edildi", "order_id": getir_order_id}
        
    except HTTPException:
        raise
    except Exception as e:
        logger.exception(f"Getir iptal webhook hatası: {str(e)}")
        return {"status": "error", "message": str(e)}


@router.post("/getir/restaurant-status")
async def getir_restaurant_status_webhook(
    request: Request,
    x_api_key: Optional[str] = Header(None, alias="x-api-key")
):
    """
    Getir Restoran Durum Webhook Endpoint
    
    Getir restoran durumu değişikliklerini (açık/kapalı) bu endpoint'e gönderir.
    
    Headers:
        x-api-key: Sabit API key (agrosjet-getir-wh-9f3k7x2m4p)
    
    Body: Restoran durum bilgisi
    """
    try:
        # API Key doğrulama
        auth_result = await verify_getir_api_key(x_api_key)
        
        if not auth_result["valid"]:
            logger.warning("Getir restoran durum webhook: Geçersiz API key")
            raise HTTPException(status_code=401, detail="Geçersiz API key")
        
        # JSON parse
        try:
            webhook_data = await request.json()
        except:
            logger.error("Getir restoran durum webhook: JSON parse hatası")
            raise HTTPException(status_code=400, detail="Geçersiz JSON")
        
        logger.info(f"Getir restoran durum webhook alındı: data={webhook_data}")
        
        # Getir restoran ID'sini al
        getir_restaurant_id = webhook_data.get("restaurantId") or webhook_data.get("restaurant_id") or webhook_data.get("id")
        
        # Sistemdeki restoranı bul
        restaurant = None
        if getir_restaurant_id:
            restaurant = await db.restaurants.find_one(
                {"platform_integrations.getir.restaurant_id": getir_restaurant_id},
                {"_id": 0}
            )
        
        if not restaurant:
            logger.warning(f"Getir restoran durum webhook: Restoran bulunamadı, getir_restaurant_id={getir_restaurant_id}")
            return {"status": "ok", "message": "Restoran bulunamadı"}
        
        restaurant_id = restaurant.get("id")
        
        # Durum bilgisini al - Getir farklı field'larda gönderebilir
        status = webhook_data.get("status") or webhook_data.get("restaurantStatus") or webhook_data.get("state")
        is_open = None
        
        if status:
            status_lower = status.lower()
            if status_lower in ["open", "online", "active", "available", "açık"]:
                is_open = True
            elif status_lower in ["closed", "offline", "inactive", "unavailable", "kapalı", "busy", "paused"]:
                is_open = False
        
        # is_open field'ı da kontrol et
        if is_open is None:
            is_open_field = webhook_data.get("isOpen") or webhook_data.get("is_open")
            if is_open_field is not None:
                is_open = bool(is_open_field)
        
        if is_open is not None:
            # Restoran durumunu güncelle
            await db.restaurants.update_one(
                {"id": restaurant_id},
                {"$set": {
                    "platform_integrations.getir.is_open": is_open,
                    "platform_integrations.getir.status_updated_at": datetime.now(TURKEY_TZ).isoformat(),
                    "platform_integrations.getir.status_updated_by": "getir_webhook"
                }}
            )
            
            status_text = "açık" if is_open else "kapalı"
            logger.info(f"Getir restoran durumu güncellendi: {restaurant_id} -> {status_text}")
            
            return {"status": "ok", "message": f"Restoran durumu güncellendi: {status_text}", "is_open": is_open}
        else:
            logger.warning(f"Getir restoran durum webhook: Durum bilgisi çözümlenemedi, data={webhook_data}")
            return {"status": "ok", "message": "Durum bilgisi alındı ancak çözümlenemedi"}
        
    except HTTPException:
        raise
    except Exception as e:
        logger.exception(f"Getir restoran durum webhook hatası: {str(e)}")
        return {"status": "error", "message": str(e)}


@router.get("/getir/health")
async def getir_webhook_health():
    """Getir Webhook Endpoint Sağlık Kontrolü"""
    return {
        "status": "healthy",
        "service": "getir_webhook",
        "timestamp": datetime.now(TURKEY_TZ).isoformat(),
        "endpoints": {
            "order": "/api/webhooks/getir/order",
            "cancel": "/api/webhooks/getir/cancel",
            "restaurant_status": "/api/webhooks/getir/restaurant-status"
        }
    }


# ==================== MİGROS WEBHOOKS ====================

async def verify_migros_webhook(request: Request, x_api_key: Optional[str] = None) -> dict:
    """
    Migros webhook doğrulama.
    
    Migros webhook'ları için iki farklı authentication yöntemi desteklenir:
    1. XApiKey header ile (restaurant API key)
    2. Store ID ile (webhook body'sindeki store.id ile restoran eşleştirme)
    
    Returns:
        dict: {"valid": bool, "restaurant": dict or None, "auth_method": str}
    """
    # Önce XApiKey ile dene
    if x_api_key:
        # platform_integrations'da ara
        restaurant = await db.restaurants.find_one(
            {"platform_integrations.migros.api_key": x_api_key},
            {"_id": 0}
        )
        
        if restaurant:
            return {"valid": True, "restaurant": restaurant, "auth_method": "api_key"}
        
        # integration_stores'da ara
        restaurant = await db.restaurants.find_one(
            {
                "integration_stores": {
                    "$elemMatch": {
                        "platform": "migros",
                        "credentials.api_key": x_api_key
                    }
                }
            },
            {"_id": 0}
        )
        
        if restaurant:
            return {"valid": True, "restaurant": restaurant, "auth_method": "api_key"}
    
    return {"valid": False, "restaurant": None, "auth_method": None}


async def find_restaurant_by_migros_store_id(store_id) -> Optional[dict]:
    """
    Migros store ID ile restoran bul.
    store_id hem int hem string olabilir, her iki formatı da dene.
    """
    # store_id'nin hem string hem int versiyonunu hazırla
    store_id_str = str(store_id)
    store_id_int = int(store_id) if str(store_id).isdigit() else None
    
    # platform_integrations'da ara (string ve int)
    restaurant = await db.restaurants.find_one(
        {"platform_integrations.migros.store_id": store_id_str},
        {"_id": 0}
    )
    
    if restaurant:
        return restaurant
    
    if store_id_int is not None:
        restaurant = await db.restaurants.find_one(
            {"platform_integrations.migros.store_id": store_id_int},
            {"_id": 0}
        )
        if restaurant:
            return restaurant
    
    # integration_stores'da ara (string)
    restaurant = await db.restaurants.find_one(
        {
            "integration_stores": {
                "$elemMatch": {
                    "platform": "migros",
                    "credentials.store_id": store_id_str
                }
            }
        },
        {"_id": 0}
    )
    
    if restaurant:
        return restaurant
    
    # integration_stores'da ara (int)
    if store_id_int is not None:
        restaurant = await db.restaurants.find_one(
            {
                "integration_stores": {
                    "$elemMatch": {
                        "platform": "migros",
                        "credentials.store_id": store_id_int
                    }
                }
            },
            {"_id": 0}
        )
    
    return restaurant


def normalize_payment_method(payment_info: dict) -> str:
    """
    Migros ödeme bilgisini standart formata dönüştür.
    Standart değerler: cash, card, online, meal_card, online_meal_card
    """
    if not payment_info:
        return "cash"
    
    name = payment_info.get("name", "").upper()
    description = payment_info.get("description", "").lower()
    is_online = payment_info.get("isOnlinePayment", False)
    
    # Online ödeme
    if is_online:
        if "multinet" in description or "sodexo" in description or "setcard" in description or "ticket" in description:
            return "online_meal_card"
        return "online"
    
    # Kapıda ödeme
    if "CASH" in name or "nakit" in description:
        return "cash"
    if "CARD" in name or "kredi" in description or "kart" in description:
        if "multinet" in description or "sodexo" in description or "setcard" in description or "ticket" in description:
            return "meal_card"
        return "card"
    if "multinet" in description or "sodexo" in description or "setcard" in description or "ticket" in description:
        return "meal_card"
    
    # Varsayılan
    return "cash"


def transform_migros_webhook_to_order(webhook_data: dict, restaurant: dict, preparation_time: int = None) -> dict:
    """
    Migros webhook payload'ını AgrosJet sipariş formatına dönüştür.
    
    Migros Webhook Yapısı:
    - id: Sipariş ID
    - description: Sipariş özeti
    - status: NEW_PENDING, APPROVED, etc.
    - deliveryProvider: RESTAURANT veya MIGROS
    - store: {id, name, group: {id, name}}
    - customer: {id, firstName, lastName, fullName, phoneNumber, deliveryAddress: {...}}
    - prices: {total, discounted, restaurantDiscounted, migrosDiscounted}
    - items: [{id, productId, name, price, priceText, amount, note, options: [...]}]
    - payment: {type: {name, description, isOnlinePayment, ...}}
    - extendedProperties: {orderNote, saveGreen, contactlessDelivery, ringDoorBell}
    - log: {createdAsMs}
    
    Args:
        webhook_data: Migros'tan gelen webhook verisi
        restaurant: Restoran bilgisi
        preparation_time: Hazırlık süresi (dakika). None ise restorandan alınır.
    """
    turkey_tz = timezone(timedelta(hours=3))
    now = datetime.now(turkey_tz)
    
    # Hazırlık süresi - parametre verilmişse onu kullan, yoksa restorandan al
    prep_time = preparation_time or restaurant.get("preparation_time", 15)
    preparation_end_at = now + timedelta(minutes=prep_time)
    
    # Müşteri bilgileri
    customer = webhook_data.get("customer", {})
    delivery_address = customer.get("deliveryAddress", {})
    geo_location = delivery_address.get("geoLocation", {})
    
    # Fiyat bilgileri (kuruştan TL'ye çevir)
    # Migros fiyat formatı değişken olabilir: 
    # - {"total": 30000} (direkt integer, kuruş)
    # - {"total": {"amountAsPenny": 30000}} (dict)
    prices = webhook_data.get("prices", {})
    
    def extract_price(price_data):
        """Fiyatı hem dict hem int formatından çıkar"""
        if isinstance(price_data, dict):
            return price_data.get("amountAsPenny", 0) / 100
        elif isinstance(price_data, (int, float)):
            return price_data / 100  # Kuruş cinsinden geliyorsa
        return 0
    
    discounted = prices.get("discounted")
    total = prices.get("total")
    
    total_price = extract_price(discounted) if discounted else 0
    if total_price == 0:
        total_price = extract_price(total) if total else 0
    
    # İndirim hesapla
    original_total = extract_price(total) if total else 0
    discount = original_total - total_price if original_total > total_price else 0
    
    # Ödeme bilgileri
    payment_info = webhook_data.get("payment", {}).get("type", {})
    payment_name = payment_info.get("name", "CASH_ON_DELIVERY")
    is_online = payment_info.get("isOnlinePayment", False)
    
    # Ödeme tipi dönüşümü
    payment_type_map = {
        "CASH_ON_DELIVERY": "cash",
        "CREDIT_CARD_ON_DELIVERY": "card",
        "CREDIT_CARD": "online",
        "ONLINE_PAYMENT": "online",
        "MEAL_CARD": "meal_card",
        "MEAL_CARD_ON_DELIVERY": "meal_card",
        "SODEXO_ON_DELIVERY": "meal_card",
        "MULTINET_ON_DELIVERY": "meal_card",
        "SETCARD_ON_DELIVERY": "meal_card",
        "TICKET_ON_DELIVERY": "meal_card",
        "PAYE_ON_DELIVERY": "meal_card",
        "METROPOL_ON_DELIVERY": "meal_card",
    }
    payment_method = payment_type_map.get(payment_name, "online" if is_online else "cash")
    
    # Ürünleri dönüştür
    items = []
    for item in webhook_data.get("items", []):
        # Migros fiyat alanları (kuruş cinsinden):
        # price = satır toplamı (zaten quantity ile çarpılmış)
        # unitPrice = birim fiyat
        total_price_penny = item.get("price", 0)
        unit_price_penny = item.get("unitPrice", 0)
        quantity = item.get("amount", 1)
        
        item_total_price = total_price_penny / 100
        if unit_price_penny:
            unit_price = unit_price_penny / 100
        elif quantity > 0:
            unit_price = item_total_price / quantity
        else:
            unit_price = item_total_price
        
        item_data = {
            "id": str(item.get("productId", item.get("id", ""))),
            "name": item.get("name", ""),
            "quantity": quantity,
            "price": unit_price,
            "unit_price": unit_price,
            "total_price": item_total_price,
            "note": item.get("note", ""),
            "options": []
        }
        
        # Opsiyonları recursive olarak ekle (subOptions desteği)
        def parse_options_recursive(options_list, parent_header=None):
            """Migros opsiyonlarını recursive olarak parse et"""
            parsed = []
            for opt in (options_list or []):
                opt_price = opt.get("primaryPrice", 0) / 100
                opt_unit_price = opt.get("unitPrimaryPrice", 0) / 100
                header_name = opt.get("headerName", "")
                item_names = opt.get("itemNames", "")
                quantity = opt.get("quantity", 1)
                excluded = opt.get("excluded", False)
                
                # Birim fiyat yoksa toplam fiyattan hesapla
                if opt_unit_price <= 0 and quantity > 0 and opt_price > 0:
                    opt_unit_price = opt_price / quantity
                
                if item_names:
                    # Virgülle ayrılmış çoklu öğeleri ayrı ayrı ekle
                    items_split = [x.strip() for x in item_names.split(",") if x.strip()]
                    if len(items_split) > 1:
                        for single_item in items_split:
                            parsed.append({
                                "name": f"{header_name}: {single_item}" if header_name else single_item,
                                "header": header_name,
                                "value": single_item,
                                "price": 0,
                                "quantity": 1,
                                "excluded": excluded,
                                "parent_header": parent_header
                            })
                    else:
                        parsed.append({
                            "name": f"{header_name}: {item_names}" if header_name else item_names,
                            "header": header_name,
                            "value": item_names,
                            "price": opt_price,
                            "unit_price": opt_unit_price,
                            "quantity": quantity,
                            "excluded": excluded,
                            "parent_header": parent_header
                        })
                
                # Alt seçenekleri (subOptions) recursive olarak parse et
                sub_options = opt.get("subOptions") or opt.get("options") or opt.get("childOptions") or []
                if sub_options:
                    child_parent = header_name or item_names or parent_header
                    parsed.extend(parse_options_recursive(sub_options, child_parent))
            
            return parsed
        
        item_data["options"] = parse_options_recursive(item.get("options") or [])
        
        items.append(item_data)
    
    # Ek özellikler
    extended_props = webhook_data.get("extendedProperties", {})
    
    # Oluşturma zamanı
    created_ms = webhook_data.get("log", {}).get("createdAsMs", 0)
    if created_ms:
        created_at = datetime.fromtimestamp(created_ms / 1000, tz=turkey_tz).isoformat()
    else:
        created_at = now.isoformat()
    
    # Store bilgileri - store hem dict hem int olabilir
    store = webhook_data.get("store", {})
    if isinstance(store, dict):
        store_id = store.get("id")
        store_name = store.get("name", "")
        store_group = store.get("group", {})
        store_group_id = store_group.get("id") if isinstance(store_group, dict) else None
        store_group_name = store_group.get("name", "") if isinstance(store_group, dict) else ""
    else:
        store_id = store
        store_name = ""
        store_group_id = None
        store_group_name = ""
    
    # Sipariş objesi oluştur
    # Migros siparişleri otomatik onaylanır, doğrudan "preparing" durumunda başlar
    order = {
        "id": str(uuid.uuid4()),
        "platform": "migros",
        "platform_id": str(webhook_data.get("id", "")),
        "external_id": f"migros_{webhook_data.get('id', '')}",
        "restaurant_id": restaurant.get("id"),
        "restaurant_name": restaurant.get("name"),
        "company_id": restaurant.get("company_id"),
        "status": "preparing",  # Otomatik onay - doğrudan hazırlanıyor durumunda
        "source": "migros",
        
        # Hazırlık süresi bilgileri
        "preparation_time": prep_time,
        "preparation_end_at": preparation_end_at.isoformat(),
        
        # Müşteri bilgileri
        "customer_name": customer.get("fullName", ""),
        "customer_phone": customer.get("phoneNumber", ""),
        "delivery_address": delivery_address.get("detail", ""),
        "address_direction": delivery_address.get("direction", ""),
        "delivery_location": {
            "latitude": geo_location.get("latitude"),
            "longitude": geo_location.get("longitude")
        },
        "city": delivery_address.get("city", {}).get("name", ""),
        "district": delivery_address.get("town", {}).get("name", ""),
        "neighborhood": delivery_address.get("district", {}).get("name", ""),
        
        # Ürünler
        "items": items,
        "description": webhook_data.get("description", ""),
        
        # Ödeme bilgileri
        "total_amount": total_price,
        "payment_type": payment_method,
        "payment_method": payment_method,
        "payment_method_detail": payment_info.get("description", ""),
        "is_paid": is_online,
        "discount": discount,
        
        # Ek özellikler
        "note": extended_props.get("orderNote", ""),
        "contactless_delivery": extended_props.get("contactlessDelivery", False),
        "ring_doorbell": extended_props.get("ringDoorBell", True),
        "save_green": extended_props.get("saveGreen", False),
        
        # Migros spesifik veriler
        "migros_data": {
            "order_id": webhook_data.get("id"),
            "user_id": customer.get("id"),
            "store_id": store_id,
            "store_name": store_name,
            "store_group_id": store_group_id,
            "store_group_name": store_group_name,
            "delivery_provider": webhook_data.get("deliveryProvider"),
            "original_status": webhook_data.get("status"),
            "prices": prices
        },
        
        # Zaman damgaları
        "created_at": created_at,
        "updated_at": now.isoformat(),
        "platform_created_at": created_at,
        
        # Orijinal veriyi sakla
        "platform_data": webhook_data
    }
    
    return order


@router.post("/migros/order")
async def migros_order_webhook(
    request: Request,
    x_api_key: Optional[str] = Header(None, alias="XApiKey")
):
    """
    Migros Sipariş Webhook Endpoint
    
    Migros yeni sipariş bildirimlerini bu endpoint'e gönderir.
    
    ÖNEMLİ: Webhook body'si ŞİFRELİ DEĞİL, düz JSON olarak gelir!
    Şifreleme sadece biz Migros API'ye istek gönderirken kullanılır.
    
    Headers:
        XApiKey: Restoran için tanımlanan API key (opsiyonel)
    
    Body: Düz JSON sipariş verisi
    """
    turkey_tz = timezone(timedelta(hours=3))
    from services.integration_log_service import save_integration_log
    
    # DEBUG: Ham veriyi hemen kaydet (ne gelirse gelsin)
    try:
        raw_body = await request.body()
        headers_dict = dict(request.headers)
        debug_entry = {
            "id": str(uuid.uuid4()),
            "platform": "migros",
            "endpoint": "order",
            "raw_body": raw_body.decode('utf-8', errors='replace')[:50000] if raw_body else "EMPTY",
            "raw_body_length": len(raw_body) if raw_body else 0,
            "headers": {k: v for k, v in headers_dict.items() if k.lower() not in ['authorization', 'cookie']},
            "content_type": request.headers.get("content-type", "NOT_SET"),
            "timestamp": datetime.now(turkey_tz).isoformat(),
            "client_ip": request.client.host if request.client else "unknown"
        }
        await db.webhook_debug_logs.insert_one(debug_entry)
        logger.info(f"Migros DEBUG: Raw body kaydedildi, length={len(raw_body) if raw_body else 0}, content_type={debug_entry['content_type']}")
    except Exception as debug_err:
        logger.error(f"Migros DEBUG kayıt hatası: {debug_err}")
    
    try:
        # JSON parse - raw_body'den parse et (request.json() body'yi tekrar okuyamaz)
        try:
            import json as json_module
            webhook_data = json_module.loads(raw_body.decode('utf-8')) if raw_body else {}
        except Exception as json_err:
            logger.error(f"Migros order webhook: JSON parse hatası: {json_err}")
            await save_integration_log("migros", "ERROR", f"JSON parse hatası: {json_err}, body: {raw_body[:500] if raw_body else b'empty'}")
            raise HTTPException(status_code=400, detail="Geçersiz JSON")
        
        # Webhook verilerini logla
        migros_order_id = webhook_data.get("id")
        store_data = webhook_data.get("store", {})
        # store hem dict hem int olabilir
        if isinstance(store_data, dict):
            migros_store_id = store_data.get("id")
        else:
            migros_store_id = store_data  # Direkt store ID gelmiş olabilir
        logger.info(f"Migros webhook alındı: order_id={migros_order_id}, store_id={migros_store_id}, keys={list(webhook_data.keys())}")
        await save_integration_log("migros", "INFO", f"Webhook alındı: order_id={migros_order_id}, store_id={migros_store_id}")
        
        # Sipariş ID kontrolü
        if not migros_order_id:
            logger.error(f"Migros webhook: Sipariş ID bulunamadı. Data keys: {list(webhook_data.keys())}")
            await save_integration_log("migros", "ERROR", f"Sipariş ID bulunamadı. Keys: {list(webhook_data.keys())}")
            raise HTTPException(status_code=400, detail="Sipariş ID bulunamadı")
        
        # Restoran bul - önce API key ile, sonra store_id ile
        restaurant = None
        
        # 1. XApiKey ile dene
        if x_api_key:
            auth_result = await verify_migros_webhook(request, x_api_key)
            if auth_result["valid"]:
                restaurant = auth_result["restaurant"]
                logger.info(f"Migros webhook: Restoran API key ile bulundu: {restaurant.get('id')}")
        
        # 2. Store ID ile dene
        if not restaurant and migros_store_id:
            restaurant = await find_restaurant_by_migros_store_id(migros_store_id)
            if restaurant:
                logger.info(f"Migros webhook: Restoran store_id ile bulundu: {restaurant.get('id')}")
        
        # Restoran bulunamadıysa
        if not restaurant:
            logger.warning(f"Migros webhook: Restoran bulunamadı. store_id={migros_store_id}, api_key={x_api_key[:10] if x_api_key else 'None'}...")
            await save_integration_log("migros", "WARNING", f"Restoran bulunamadı: store_id={migros_store_id}")
            # Yine de 200 dön (Migros retry yapmasın) ama loglayalım
            return {
                "success": False,
                "errorMessage": {"errorDetail": f"Restoran bulunamadı: store_id={migros_store_id}"}
            }
        
        restaurant_id = restaurant.get("id")
        
        # Mevcut sipariş kontrolü (duplicate prevention)
        existing = await db.orders.find_one({
            "$or": [
                {"platform_id": str(migros_order_id)},
                {"external_id": f"migros_{migros_order_id}"},
                {"migros_data.order_id": migros_order_id}
            ]
        })
        
        if existing:
            logger.info(f"Migros webhook: Sipariş zaten mevcut: {migros_order_id}")
            await save_integration_log("migros", "INFO", f"Sipariş zaten mevcut: {migros_order_id}")
            return {
                "success": True,
                "message": "Sipariş zaten mevcut",
                "orderId": existing.get("id"),
                "action": "skipped"
            }
        
        # Hazırlık süresini hesapla
        try:
            from routers.orders import calculate_preparation_time_async
            prep_time = await calculate_preparation_time_async(restaurant_id, webhook_data.get("items", []))
        except Exception as prep_err:
            logger.warning(f"Hazırlık süresi hesaplanamadı: {prep_err}, restoran default kullanılacak")
            prep_time = restaurant.get("preparation_time", 15)
        
        # Siparişi AgrosJet formatına dönüştür (preparing durumunda, hazırlık süresiyle)
        order = transform_migros_webhook_to_order(webhook_data, restaurant, preparation_time=prep_time)
        
        # Veritabanına kaydet (ve kontör düş)
        await insert_order(order)
        logger.info(f"Migros siparişi kaydedildi: {order['id']} (platform_id: {migros_order_id}, restaurant: {restaurant_id}, prep_time: {prep_time}dk)")
        await save_integration_log("migros", "INFO", f"Sipariş kaydedildi: {order['id']} (migros_id: {migros_order_id}, hazırlık: {prep_time}dk)")
        
        # Migros API'sine otomatik onay gönder (arka planda)
        migros_approval_success = False
        migros_approval_error = None
        try:
            # Restoran Migros credentials'larını al
            migros_config = restaurant.get("platform_integrations", {}).get("migros", {})
            
            # integration_stores'dan da kontrol et
            if not migros_config.get("api_key"):
                for store in restaurant.get("integration_stores", []):
                    if store.get("platform") == "migros" and store.get("enabled"):
                        creds = store.get("credentials", {})
                        migros_config = {
                            "api_key": creds.get("api_key"),
                            "secret_key": creds.get("secret_key"),
                            "store_id": creds.get("store_id"),
                            "is_test": creds.get("is_test", False)
                        }
                        break
            
            if migros_config.get("api_key"):
                # is_test boolean olarak handle et (corrupt veri olabilir)
                is_test = migros_config.get("is_test", False)
                if isinstance(is_test, str):
                    is_test = is_test.lower() in ("true", "1", "yes")
                is_test = bool(is_test)
                
                # Test ortamında restoranın kendi secret_key'ini, prod'da global key'i kullan
                secret_key = migros_config.get("secret_key") if is_test and migros_config.get("secret_key") else MIGROS_SECRET_KEY
                
                logger.info(f"Migros otomatik onay: api_key={migros_config['api_key'][:10]}..., is_test={is_test}")
                
                service = MigrosYemekService(
                    api_key=migros_config["api_key"],
                    secret_key=secret_key,
                    is_test=is_test
                )
                
                # Migros'a "Approved" gönder
                approval_result = await service.update_order_status(
                    order_id=migros_order_id,
                    store_id=int(migros_store_id) if migros_store_id else 0,
                    status="Approved"
                )
                
                if approval_result.get("success"):
                    migros_approval_success = True
                    logger.info(f"Migros siparişi otomatik onaylandı: {migros_order_id}")
                    await save_integration_log("migros", "INFO", f"Sipariş otomatik onaylandı: {migros_order_id}")
                    
                    # Siparişte onay bilgisini ve migros_status'u güncelle
                    await db.orders.update_one(
                        {"id": order["id"]},
                        {"$set": {
                            "migros_data.auto_approved": True,
                            "migros_data.approved_at": datetime.now(turkey_tz).isoformat(),
                            "migros_status": "Approved"
                        }}
                    )
                else:
                    migros_approval_error = approval_result.get("error", "Bilinmeyen hata")
                    logger.warning(f"Migros otomatik onay başarısız: {migros_order_id} - {migros_approval_error}")
                    await save_integration_log("migros", "WARNING", f"Otomatik onay başarısız: {migros_order_id} - {migros_approval_error}")
            else:
                migros_approval_error = "Migros API credentials bulunamadı"
                logger.warning(f"Migros otomatik onay atlandı: {migros_order_id} - credentials eksik")
                await save_integration_log("migros", "WARNING", f"Otomatik onay atlandı (credentials eksik): {migros_order_id}")
        
        except Exception as approval_err:
            migros_approval_error = str(approval_err)
            logger.error(f"Migros otomatik onay hatası: {migros_order_id} - {approval_err}")
            await save_integration_log("migros", "ERROR", f"Otomatik onay hatası: {migros_order_id} - {approval_err}")
        
        return {
            "success": True,
            "message": "Sipariş başarıyla alındı ve onaylandı" if migros_approval_success else "Sipariş alındı (otomatik onay gönderilemedi)",
            "orderId": order["id"],
            "platformOrderId": str(migros_order_id),
            "preparationTime": prep_time,
            "autoApproved": migros_approval_success,
            "approvalError": migros_approval_error,
            "timestamp": datetime.now(turkey_tz).isoformat()
        }
        
    except HTTPException:
        raise
    except Exception as e:
        logger.exception(f"Migros sipariş webhook hatası: {str(e)}")
        await save_integration_log("migros", "ERROR", f"Webhook hatası: {str(e)}")
        # Migros'a 200 dön ama hata logla (retry yapmasın)
        return {"success": False, "errorMessage": {"errorDetail": str(e)}}


@router.post("/migros/cancel")
async def migros_cancel_webhook(
    request: Request,
    x_api_key: Optional[str] = Header(None, alias="XApiKey")
):
    """
    Migros Sipariş İptal Webhook Endpoint
    
    Migros sipariş iptallerini bu endpoint'e gönderir.
    
    ÖNEMLİ: Webhook body'si ŞİFRELİ DEĞİL, düz JSON olarak gelir!
    
    Beklenen payload yapısı:
    {
        "OrderId": 100069761,
        "StoreId": 23000000101013,
        "UserId": 23002000015693
    }
    
    Headers:
        XApiKey: Restoran için tanımlanan API key (opsiyonel)
    
    Body: Düz JSON iptal verisi
    """
    turkey_tz = timezone(timedelta(hours=3))
    from services.integration_log_service import save_integration_log
    
    try:
        # JSON parse
        try:
            webhook_data = await request.json()
        except Exception as json_err:
            logger.error(f"Migros cancel webhook: JSON parse hatası: {json_err}")
            await save_integration_log("migros", "ERROR", f"Cancel webhook JSON parse hatası: {json_err}")
            raise HTTPException(status_code=400, detail="Geçersiz JSON")
        
        # Sipariş ID'yi al (OrderId veya orderId olabilir)
        migros_order_id = webhook_data.get("OrderId") or webhook_data.get("orderId") or webhook_data.get("id")
        migros_store_id = webhook_data.get("StoreId") or webhook_data.get("storeId")
        
        logger.info(f"Migros iptal webhook alındı: order_id={migros_order_id}, store_id={migros_store_id}")
        await save_integration_log("migros", "INFO", f"İptal webhook alındı: order_id={migros_order_id}")
        
        if not migros_order_id:
            logger.error(f"Migros cancel webhook: Sipariş ID bulunamadı. Data: {webhook_data}")
            await save_integration_log("migros", "ERROR", "İptal webhook: Sipariş ID bulunamadı")
            return {"success": False, "errorMessage": {"errorDetail": "Sipariş ID bulunamadı"}}
        
        # Siparişi bul
        existing = await db.orders.find_one({
            "$or": [
                {"platform_id": str(migros_order_id)},
                {"external_id": f"migros_{migros_order_id}"},
                {"migros_data.order_id": migros_order_id}
            ]
        })
        
        if not existing:
            logger.warning(f"Migros cancel webhook: Sipariş bulunamadı: {migros_order_id}")
            await save_integration_log("migros", "WARNING", f"İptal webhook: Sipariş bulunamadı: {migros_order_id}")
            return {"success": True, "message": "Sipariş bulunamadı (zaten yok veya iptal edilmiş)"}
        
        # Siparişi iptal et
        now = datetime.now(turkey_tz)
        await db.orders.update_one(
            {"id": existing["id"]},
            {"$set": {
                "status": "cancelled",
                "updated_at": now.isoformat(),
                "cancel_reason": "Migros tarafından iptal edildi",
                "cancelled_by": "migros_webhook",
                "cancelled_at": now.isoformat(),
                "migros_data.cancelled": True,
                "migros_data.cancel_webhook_data": webhook_data
            }}
        )
        
        logger.info(f"Migros siparişi iptal edildi: {existing['id']} (migros_id: {migros_order_id})")
        await save_integration_log("migros", "INFO", f"Sipariş iptal edildi: {existing['id']} (migros_id: {migros_order_id})")
        
        return {
            "success": True,
            "message": "Sipariş iptal edildi",
            "orderId": existing["id"],
            "platformOrderId": str(migros_order_id),
            "timestamp": now.isoformat()
        }
        
    except HTTPException:
        raise
    except Exception as e:
        logger.exception(f"Migros iptal webhook hatası: {str(e)}")
        await save_integration_log("migros", "ERROR", f"İptal webhook hatası: {str(e)}")
        return {"success": False, "errorMessage": {"errorDetail": str(e)}}


@router.post("/migros/status")
async def migros_status_webhook(
    request: Request,
    x_api_key: Optional[str] = Header(None, alias="XApiKey")
):
    """
    Migros Sipariş Durum Değişikliği (Delivery Status Changed) Webhook Endpoint
    
    Migros sipariş durumu değişikliklerini bu endpoint'e gönderir.
    
    ÖNEMLİ: Webhook body'si ŞİFRELİ DEĞİL, düz JSON olarak gelir!
    
    Beklenen payload yapısı:
    {
        "orderId": 100069761,
        "storeId": 23000000101013,
        "status": "APPROVED",  // Sipariş durumu
        "deliveryStatus": "ASSIGNED_FOR_DELIVERY",  // Kurye durumu
        "isCancelled": false,
        "deliveryProvider": "RESTAURANT",
        "courierName": "Ahmet Yılmaz"
    }
    
    Headers:
        XApiKey: Restoran için tanımlanan API key (opsiyonel)
    
    Body: Düz JSON durum verisi
    """
    turkey_tz = timezone(timedelta(hours=3))
    from services.integration_log_service import save_integration_log
    
    try:
        # JSON parse
        try:
            webhook_data = await request.json()
        except Exception as json_err:
            logger.error(f"Migros status webhook: JSON parse hatası: {json_err}")
            await save_integration_log("migros", "ERROR", f"Status webhook JSON parse hatası: {json_err}")
            raise HTTPException(status_code=400, detail="Geçersiz JSON")
        
        # Verileri al
        migros_order_id = webhook_data.get("orderId") or webhook_data.get("OrderId") or webhook_data.get("id")
        migros_store_id = webhook_data.get("storeId") or webhook_data.get("StoreId")
        order_status = webhook_data.get("status")
        delivery_status = webhook_data.get("deliveryStatus")
        is_cancelled = webhook_data.get("isCancelled", False)
        delivery_provider = webhook_data.get("deliveryProvider")
        courier_name = webhook_data.get("courierName")
        
        logger.info(f"Migros status webhook alındı: order_id={migros_order_id}, store_id={migros_store_id}, status={order_status}, delivery_status={delivery_status}")
        await save_integration_log("migros", "INFO", f"Status webhook: order_id={migros_order_id}, store_id={migros_store_id}, status={order_status}, delivery={delivery_status}")
        
        if not migros_order_id:
            logger.error(f"Migros status webhook: Sipariş ID bulunamadı. Data: {webhook_data}")
            return {"success": False, "errorMessage": {"errorDetail": "Sipariş ID bulunamadı"}}
        
        # Siparişi bul
        existing = await db.orders.find_one({
            "$or": [
                {"platform_id": str(migros_order_id)},
                {"external_id": f"migros_{migros_order_id}"},
                {"migros_data.order_id": migros_order_id}
            ]
        })
        
        if not existing:
            logger.warning(f"Migros status webhook: Sipariş bulunamadı: {migros_order_id}")
            await save_integration_log("migros", "WARNING", f"Status webhook: Sipariş bulunamadı: {migros_order_id}")
            return {"success": True, "message": "Sipariş bulunamadı"}
        
        now = datetime.now(turkey_tz)
        
        # İptal durumu kontrolü
        if is_cancelled:
            await db.orders.update_one(
                {"id": existing["id"]},
                {"$set": {
                    "status": "cancelled",
                    "updated_at": now.isoformat(),
                    "cancel_reason": "Migros tarafından iptal edildi",
                    "cancelled_by": "migros_status_webhook",
                    "cancelled_at": now.isoformat(),
                    "migros_data.cancelled": True,
                    "migros_data.last_status_update": webhook_data
                }}
            )
            logger.info(f"Migros siparişi iptal edildi (status webhook): {existing['id']}")
            await save_integration_log("migros", "INFO", f"Sipariş iptal edildi (status): {existing['id']}")
            return {"success": True, "message": "Sipariş iptal edildi", "orderId": existing["id"]}
        
        # Durum güncelleme - Migros durumları AgrosJet'e map et
        # Mevcut AgrosJet durumunu kontrol et - ilerlemiş durumları geri alma
        current_status = existing.get("status")
        protected_statuses = ["assigned", "confirmed", "on_the_way", "delivered", "cancelled"]
        
        # Migros delivery status -> AgrosJet status mapping
        delivery_status_map = {
            "ASSIGNED_FOR_DELIVERY": "assigned",
            "COURIER_APPROACHED": "on_the_way",
            "COURIER_ARRIVED": "on_the_way",
            "IN_DELIVERY": "on_the_way",
            "DELIVERED": "delivered"
        }
        
        # Migros order status -> AgrosJet status mapping (fallback)
        order_status_map = {
            "NEW_PENDING": "pending",
            "APPROVED": "confirmed",
            "PREPARED": "ready",
            "DELIVERY": "on_the_way",
            "COMPLETED": "delivered",
            "CANCELLED": "cancelled"
        }
        
        # Önce delivery_status'a bak, sonra order_status'a
        new_status = None
        if delivery_status and delivery_status in delivery_status_map:
            new_status = delivery_status_map[delivery_status]
        elif order_status and order_status in order_status_map:
            new_status = order_status_map[order_status]
        
        update_data = {
            "updated_at": now.isoformat(),
            "migros_data.last_status_update": webhook_data,
            "migros_data.original_status": order_status,
            "migros_data.delivery_status": delivery_status
        }
        
        if courier_name:
            update_data["migros_data.courier_name"] = courier_name
        if delivery_provider:
            update_data["migros_data.delivery_provider"] = delivery_provider
        
        # Status güncelle (eğer korumalı durumda değilse)
        if new_status and current_status not in protected_statuses:
            update_data["status"] = new_status
        
        await db.orders.update_one(
            {"id": existing["id"]},
            {"$set": update_data}
        )
        
        logger.info(f"Migros sipariş durumu güncellendi: {existing['id']} -> {new_status or 'no change'}")
        await save_integration_log("migros", "INFO", f"Durum güncellendi: {existing['id']} -> {new_status}")
        
        return {
            "success": True,
            "message": "Sipariş durumu güncellendi",
            "orderId": existing["id"],
            "platformOrderId": str(migros_order_id),
            "newStatus": new_status,
            "timestamp": now.isoformat()
        }
        
    except HTTPException:
        raise
    except Exception as e:
        logger.exception(f"Migros status webhook hatası: {str(e)}")
        await save_integration_log("migros", "ERROR", f"Status webhook hatası: {str(e)}")
        return {"success": False, "errorMessage": {"errorDetail": str(e)}}


@router.get("/migros/health")
async def migros_webhook_health():
    """Migros Webhook Endpoint Sağlık Kontrolü"""
    return {
        "success": True,
        "data": {
            "status": "healthy",
            "service": "migros_webhook",
            "timestamp": datetime.now(TURKEY_TZ).isoformat(),
            "endpoints": {
                "order": "/api/webhooks/migros/order",
                "cancel": "/api/webhooks/migros/cancel",
                "status": "/api/webhooks/migros/status"
            }
        }
    }


# ==================== YEMEKSEPETİ WEBHOOKS ====================


@router.post("/yemeksepeti/{vendor_id}")
async def yemeksepeti_webhook(
    vendor_id: str,
    request: Request,
    x_signature: Optional[str] = Header(None, alias="X-Signature"),
    x_webhook_signature: Optional[str] = Header(None, alias="X-Webhook-Signature")
):
    """
    Yemeksepeti webhook endpoint'i.
    
    Yemeksepeti bu endpoint'e sipariş bildirimlerini gönderir:
    - RECEIVED: Yeni sipariş
    - READY_FOR_PICKUP: Hazır (onay)
    - DISPATCHED: Yola çıktı (onay)
    - DELIVERED: Teslim edildi
    - CANCELLED: İptal
    """
    try:
        # Raw body al
        body = await request.body()
        
        # Restoran bul ve webhook secret kontrolü
        restaurant = await db.restaurants.find_one(
            {"platform_integrations.yemeksepeti.vendor_id": vendor_id},
            {"_id": 0, "id": 1, "platform_integrations.yemeksepeti.webhook_secret": 1}
        )
        
        if not restaurant:
            logger.warning(f"Yemeksepeti webhook: Bilinmeyen vendor_id={vendor_id}")
            raise HTTPException(status_code=404, detail="Vendor bulunamadı")
        
        # İmza doğrulama (opsiyonel - secret varsa)
        webhook_secret = restaurant.get("platform_integrations", {}).get("yemeksepeti", {}).get("webhook_secret")
        signature = x_signature or x_webhook_signature
        
        if webhook_secret and signature:
            if not verify_webhook_signature(body, signature, webhook_secret):
                logger.warning(f"Yemeksepeti webhook: Geçersiz imza, vendor_id={vendor_id}")
                raise HTTPException(status_code=401, detail="Geçersiz imza")
        
        # JSON parse
        try:
            webhook_data = await request.json()
        except:
            logger.error(f"Yemeksepeti webhook: JSON parse hatası, vendor_id={vendor_id}")
            raise HTTPException(status_code=400, detail="Geçersiz JSON")
        
        logger.info(f"Yemeksepeti webhook alındı: vendor_id={vendor_id}, status={webhook_data.get('status')}")
        
        # Webhook işle
        result = await process_yemeksepeti_webhook(webhook_data, vendor_id)
        
        if not result["success"]:
            logger.error(f"Yemeksepeti webhook işleme hatası: {result.get('error')}")
            # Yemeksepeti'ye 200 dönmeliyiz yoksa tekrar dener
            # Ama hata logluyoruz
        
        # Her durumda 200 dön (Yemeksepeti retry yapmasın)
        return {"status": "ok", "message": result.get("message", "İşlendi")}
        
    except HTTPException:
        raise
    except Exception as e:
        logger.exception(f"Yemeksepeti webhook hatası: {str(e)}")
        # Yine 200 dön
        return {"status": "error", "message": str(e)}


@router.get("/yemeksepeti/{vendor_id}/health")
async def yemeksepeti_webhook_health(vendor_id: str):
    """Webhook endpoint sağlık kontrolü"""
    restaurant = await db.restaurants.find_one(
        {"platform_integrations.yemeksepeti.vendor_id": vendor_id},
        {"_id": 0, "id": 1, "name": 1}
    )
    
    if not restaurant:
        raise HTTPException(status_code=404, detail="Vendor bulunamadı")
    
    return {
        "status": "healthy",
        "vendor_id": vendor_id,
        "restaurant": restaurant.get("name")
    }
