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
from utils.database import db

router = APIRouter(prefix="/api/webhooks", tags=["Webhooks"])
logger = logging.getLogger(__name__)
from services.integration_log_service import save_integration_log as _save_log

# Migros Secret Key - .env'den al (tüm restoranlar için ortak)
MIGROS_SECRET_KEY = os.environ.get("MIGROS_SECRET_KEY", "YRwPHEl09DTCFkw5qrAHswr9e4h7Wex7")


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
            logger.warning(f"Getir webhook: Geçersiz API key")
            await _save_log("getir", "ERROR", f"Geçersiz API key: {x_api_key}")
            raise HTTPException(status_code=401, detail="Geçersiz API key")
        
        # JSON parse
        try:
            webhook_data = await request.json()
        except:
            logger.error("Getir webhook: JSON parse hatası")
            await _save_log("getir", "ERROR", "JSON parse hatası")
            raise HTTPException(status_code=400, detail="Geçersiz JSON")
        
        logger.info(f"Getir sipariş webhook alındı: order_id={webhook_data.get('id')}")
        await _save_log("getir", "INFO", f"Webhook alındı: order_id={webhook_data.get('id')}")
        
        # Sipariş ID kontrol
        getir_order_id = webhook_data.get("id")
        if not getir_order_id:
            logger.warning("Getir webhook: Sipariş ID bulunamadı")
            await _save_log("getir", "WARNING", "Sipariş ID bulunamadı")
            return {"status": "error", "message": "Sipariş ID bulunamadı"}
        
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
        
        await db.orders.insert_one(shiftjet_order)
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
            logger.warning(f"Getir iptal webhook: Geçersiz API key")
            raise HTTPException(status_code=401, detail="Geçersiz API key")
        
        # JSON parse
        try:
            webhook_data = await request.json()
        except:
            logger.error("Getir iptal webhook: JSON parse hatası")
            raise HTTPException(status_code=400, detail="Geçersiz JSON")
        
        logger.info(f"Getir iptal webhook alındı: data={webhook_data}")
        
        # Sipariş ID - Getir farklı field'larda gönderebilir
        getir_order_id = webhook_data.get("id") or webhook_data.get("orderId") or webhook_data.get("order_id")
        
        if not getir_order_id:
            logger.warning("Getir iptal webhook: Sipariş ID bulunamadı")
            return {"status": "error", "message": "Sipariş ID bulunamadı"}
        
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
            logger.warning(f"Getir restoran durum webhook: Geçersiz API key")
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

async def verify_migros_api_key(api_key: str) -> dict:
    """
    Migros webhook API key doğrulama.
    XApiKey header'ı ile gelen istekleri doğrular.
    """
    if not api_key:
        return {"valid": False, "restaurant": None}
    
    # Migros entegrasyonu olan restoranları ara
    restaurant = await db.restaurants.find_one(
        {"platform_integrations.migros.api_key": api_key},
        {"_id": 0}
    )
    
    if restaurant:
        return {"valid": True, "restaurant": restaurant}
    
    return {"valid": False, "restaurant": None}


@router.post("/migros/order")
async def migros_order_webhook(
    request: Request,
    x_api_key: Optional[str] = Header(None, alias="XApiKey")
):
    """
    Migros Sipariş Webhook Endpoint
    
    Migros yeni sipariş ve sipariş durumu değişikliklerini bu endpoint'e gönderir.
    İstek body'si Rijndael AES ile şifrelenmiş olarak gelir.
    
    Headers:
        XApiKey: Restoran için tanımlanan API key
    
    Body: Şifrelenmiş sipariş verisi (value field'ında)
    """
    turkey_tz = timezone(timedelta(hours=3))
    
    try:
        # API Key doğrulama
        auth_result = await verify_migros_api_key(x_api_key)
        
        if not auth_result["valid"]:
            logger.warning(f"Migros order webhook: Geçersiz API key: {x_api_key}")
            from services.integration_log_service import save_integration_log
            await save_integration_log("migros", "ERROR", f"Geçersiz API key: {x_api_key}")
            raise HTTPException(status_code=401, detail="Geçersiz API key")
        
        restaurant = auth_result["restaurant"]
        restaurant_id = restaurant.get("id")
        company_id = restaurant.get("company_id")
        
        # JSON parse
        try:
            webhook_data = await request.json()
        except:
            logger.error("Migros order webhook: JSON parse hatası")
            raise HTTPException(status_code=400, detail="Geçersiz JSON")
        
        logger.info(f"Migros sipariş webhook alındı: restaurant={restaurant_id}, data_keys={list(webhook_data.keys()) if isinstance(webhook_data, dict) else 'not dict'}")
        
        # MongoDB'ye log kaydet
        from services.integration_log_service import save_integration_log
        await save_integration_log("migros", "INFO", f"Webhook alındı: restaurant={restaurant_id}, keys={list(webhook_data.keys()) if isinstance(webhook_data, dict) else 'not dict'}")
        
        # Şifreli veriyi çöz
        encrypted_value = webhook_data.get("value") or webhook_data.get("Value")
        if not encrypted_value:
            logger.error(f"Migros webhook: 'value' alanı bulunamadı. Data: {webhook_data}")
            raise HTTPException(status_code=400, detail="Şifreli veri bulunamadı")
        
        # MigrosYemekService ile decrypt
        migros_service = MigrosYemekService(
            api_key=x_api_key,
            secret_key=MIGROS_SECRET_KEY,
            is_test=True
        )
        
        try:
            order_data = migros_service.decrypt(encrypted_value)
            logger.info(f"Migros sipariş çözüldü: {order_data.get('orderId', 'unknown')}")
        except Exception as e:
            logger.error(f"Migros şifre çözme hatası: {e}")
            from services.integration_log_service import save_integration_log
            await save_integration_log("migros", "ERROR", f"Şifre çözme hatası: {e}")
            raise HTTPException(status_code=400, detail=f"Şifre çözme hatası: {str(e)}")
        
        # Siparişi ShiftJet formatına dönüştür ve kaydet
        now = datetime.now(turkey_tz)
        
        # Müşteri bilgileri
        customer = order_data.get("customer", {})
        address = order_data.get("address", {})
        
        # Ürünleri dönüştür
        items = []
        for item in order_data.get("products", []):
            item_data = {
                "id": str(item.get("productId", "")),
                "name": item.get("productName", ""),
                "quantity": item.get("count", 1),
                "unit_price": float(item.get("price", 0)),
                "total_price": float(item.get("price", 0)) * int(item.get("count", 1)),
                "note": item.get("note", ""),
                "options": []
            }
            # Opsiyonları ekle
            for opt in item.get("options", []):
                item_data["options"].append({
                    "name": opt.get("optionName", ""),
                    "price": float(opt.get("price", 0))
                })
            items.append(item_data)
        
        # Ödeme tipi
        payment_type = order_data.get("paymentType", "")
        payment_method = "cash" if payment_type in ["cash", "Cash", "CASH"] else "online"
        
        # Sipariş oluştur
        order = {
            "id": str(uuid.uuid4()),
            "platform": "migros",
            "platform_id": str(order_data.get("orderId", "")),
            "restaurant_id": restaurant_id,
            "company_id": company_id,
            "status": "pending",
            "customer": {
                "name": customer.get("name", "") + " " + customer.get("surname", ""),
                "phone": customer.get("phoneNumber", ""),
                "address": address.get("address", ""),
                "address_detail": address.get("direction", ""),
                "latitude": address.get("latitude"),
                "longitude": address.get("longitude"),
            },
            "items": items,
            "payment": {
                "method": payment_method,
                "total": float(order_data.get("checkAmount", 0)),
                "delivery_fee": float(order_data.get("deliveryFee", 0)),
                "discount": float(order_data.get("discount", 0)),
            },
            "note": order_data.get("note", ""),
            "created_at": now.isoformat(),
            "updated_at": now.isoformat(),
            "platform_data": order_data  # Orijinal veriyi de sakla
        }
        
        # Veritabanına kaydet
        await db.orders.insert_one(order)
        logger.info(f"Migros siparişi kaydedildi: {order['id']} (platform_id: {order['platform_id']})")
        from services.integration_log_service import save_integration_log
        await save_integration_log("migros", "INFO", f"Sipariş kaydedildi: {order['id']} (platform: {order['platform_id']})")
        
        return {
            "success": True,
            "message": "Sipariş başarıyla alındı",
            "orderId": order["id"],
            "timestamp": now.isoformat()
        }
        
    except HTTPException:
        raise
    except Exception as e:
        logger.exception(f"Migros sipariş webhook hatası: {str(e)}")
        from services.integration_log_service import save_integration_log
        await save_integration_log("migros", "ERROR", f"Webhook hatası: {str(e)}")
        return {"success": False, "errorMessage": {"errorDetail": str(e)}}


@router.post("/migros/cancel")
async def migros_cancel_webhook(
    request: Request,
    x_api_key: Optional[str] = Header(None, alias="XApiKey")
):
    """
    Migros Sipariş İptal Webhook Endpoint
    
    Migros sipariş iptallerini bu endpoint'e gönderir.
    
    Headers:
        XApiKey: Restoran için tanımlanan API key
    
    Body: Şifrelenmiş iptal verisi
    """
    try:
        # API Key doğrulama
        auth_result = await verify_migros_api_key(x_api_key)
        
        if not auth_result["valid"]:
            logger.warning(f"Migros cancel webhook: Geçersiz API key")
            raise HTTPException(status_code=401, detail="Geçersiz API key")
        
        restaurant = auth_result["restaurant"]
        restaurant_id = restaurant.get("id")
        
        # JSON parse
        try:
            webhook_data = await request.json()
        except:
            logger.error("Migros cancel webhook: JSON parse hatası")
            raise HTTPException(status_code=400, detail="Geçersiz JSON")
        
        logger.info(f"Migros iptal webhook alındı: restaurant={restaurant_id}")
        
        # TODO: Rijndael AES ile şifre çözme işlemi eklenecek
        
        return {
            "success": True,
            "message": "İptal webhook alındı",
            "timestamp": datetime.now(TURKEY_TZ).isoformat()
        }
        
    except HTTPException:
        raise
    except Exception as e:
        logger.exception(f"Migros iptal webhook hatası: {str(e)}")
        return {"success": False, "errorMessage": {"errorDetail": str(e)}}


@router.post("/migros/status")
async def migros_status_webhook(
    request: Request,
    x_api_key: Optional[str] = Header(None, alias="XApiKey")
):
    """
    Migros Sipariş Durum Değişikliği Webhook Endpoint
    
    Migros sipariş durumu değişikliklerini bu endpoint'e gönderir.
    
    Headers:
        XApiKey: Restoran için tanımlanan API key
    
    Body: Şifrelenmiş durum verisi
    """
    try:
        # API Key doğrulama
        auth_result = await verify_migros_api_key(x_api_key)
        
        if not auth_result["valid"]:
            logger.warning(f"Migros status webhook: Geçersiz API key")
            raise HTTPException(status_code=401, detail="Geçersiz API key")
        
        restaurant = auth_result["restaurant"]
        restaurant_id = restaurant.get("id")
        
        # JSON parse
        try:
            webhook_data = await request.json()
        except:
            logger.error("Migros status webhook: JSON parse hatası")
            raise HTTPException(status_code=400, detail="Geçersiz JSON")
        
        logger.info(f"Migros status webhook alındı: restaurant={restaurant_id}")
        
        # TODO: Rijndael AES ile şifre çözme işlemi eklenecek
        
        return {
            "success": True,
            "message": "Durum webhook alındı",
            "timestamp": datetime.now(TURKEY_TZ).isoformat()
        }
        
    except HTTPException:
        raise
    except Exception as e:
        logger.exception(f"Migros status webhook hatası: {str(e)}")
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
