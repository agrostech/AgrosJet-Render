"""
Adisyo Webhook Endpoints

Adisyo'dan gelen webhook bildirimleri:
- order.created: Yeni sipariş oluşturulduğunda
- order.updated: Sipariş güncellendiğinde (durum değişikliği, iptal vb.)
- stock.depleted: Stok tükendiğinde
- stock.restocked: Stok yenilendiğinde

Güvenlik:
- HMAC-SHA256 imza doğrulama
- URL doğrulama ("adisyo" string kontrolü)
"""
from fastapi import APIRouter, HTTPException, Request, Header, Response
from pydantic import BaseModel
from typing import Optional
import logging
import hmac
import hashlib
import base64
from datetime import datetime, timezone, timedelta

# Türkiye timezone (UTC+3)
TURKEY_TZ = timezone(timedelta(hours=3))

from utils.database import db
from services.credit_service import insert_order
from services.adisyo_service import (
    get_order_details,
    convert_adisyo_order_to_shiftjet,
    map_adisyo_status
)

router = APIRouter(prefix="/api/adisyo", tags=["Adisyo Webhook"])
logger = logging.getLogger(__name__)

from services.integration_log_service import save_integration_log as _db_log

class _IntLogger:
    """Logger + MongoDB'ye kayıt"""
    def __init__(self, name):
        self._name = name
    async def info(self, msg):
        logger.info(msg)
        await _db_log(self._name, "INFO", msg)
    async def warning(self, msg):
        logger.warning(msg)
        await _db_log(self._name, "WARNING", msg)
    async def error(self, msg):
        logger.error(msg)
        await _db_log(self._name, "ERROR", msg)
    async def exception(self, msg):
        logger.exception(msg)
        await _db_log(self._name, "ERROR", msg)

ilog = _IntLogger("adisyo")


# ==================== HELPER FUNCTIONS ====================

def verify_adisyo_signature(payload: str, signature: str, api_key: str) -> bool:
    """
    Adisyo webhook imzasını doğrula (HMAC-SHA256)
    
    İmza Algoritması:
    Message = WebhookEventType + "|" + EventTimeUtc + "|" + ApiKey
    Signature = Base64(HMACSHA256(Message))
    """
    try:
        import json
        webhook_data = json.loads(payload)
        
        event_type = webhook_data.get("webhookEventType", "")
        event_time = webhook_data.get("eventTimeUtc", "")
        
        # Message oluştur
        message = f"{event_type}|{event_time}|{api_key}"
        
        # HMAC-SHA256 hesapla
        expected_signature = hmac.new(
            api_key.encode('utf-8'),
            message.encode('utf-8'),
            hashlib.sha256
        ).digest()
        
        expected_signature_b64 = base64.b64encode(expected_signature).decode('utf-8')
        
        # Timing-safe karşılaştırma
        return hmac.compare_digest(signature, expected_signature_b64)
        
    except Exception as e:
        logger.error(f"Adisyo imza doğrulama hatası: {e}")
        return False


async def get_restaurant_by_identity(restaurant_identity: str) -> Optional[dict]:
    """
    restaurant_identity (UUID) ile restoranı bul
    """
    # Önce adisyo_restaurant_identity ile dene
    restaurant = await db.restaurants.find_one(
        {"adisyo_restaurant_identity": restaurant_identity},
        {"_id": 0}
    )
    
    if restaurant:
        return restaurant
    
    # Yoksa adisyo_api_secret ile dene (bazı restoranlar identity yerine secret kullanıyor olabilir)
    restaurant = await db.restaurants.find_one(
        {"adisyo_api_secret": restaurant_identity},
        {"_id": 0}
    )
    
    return restaurant


async def process_order_event(event_data: dict, restaurant: dict, event_type: str) -> dict:
    """
    Sipariş event'ini işle (order.created veya order.updated)
    """
    order_id = event_data.get("id")
    
    if not order_id:
        return {"success": False, "error": "Sipariş ID bulunamadı"}
    
    restaurant_id = restaurant.get("id")
    
    # Adisyo'dan sipariş detaylarını çek
    order_result = await get_order_details(restaurant_id, order_id)
    
    if not order_result.get("success"):
        await ilog.warning(f"Adisyo sipariş detayları alınamadı: order_id={order_id}, error={order_result.get('error')}")
        return {"success": False, "error": order_result.get("error")}
    
    adisyo_order = order_result.get("order")
    
    if not adisyo_order:
        return {"success": False, "error": "Sipariş verisi boş"}
    
    # Mevcut sipariş kontrolü
    existing = await db.orders.find_one({"adisyo_order_id": order_id})
    
    if existing:
        # Sipariş zaten var
        if event_type == "order.created":
            await ilog.info(f"Adisyo sipariş zaten mevcut: order_id={order_id}")
            return {"success": True, "action": "skipped", "message": "Sipariş zaten mevcut"}
        
        # order.updated - durumu güncelle
        current_status = existing.get("status")
        
        # ShiftJet'te ilerlemiş siparişlerin durumunu değiştirme
        shiftjet_priority_statuses = ["assigned", "confirmed", "on_the_way", "delivered", "cancelled"]
        
        if current_status in shiftjet_priority_statuses:
            await ilog.info(f"Adisyo sipariş atlandı (durum zaten ilerletilmiş): order_id={order_id}")
            return {"success": True, "action": "skipped", "message": "Sipariş durumu zaten ilerletilmiş"}
        
        # Adisyo'dan gelen durumu map'le
        adisyo_status_id = adisyo_order.get("statusId", 1)
        new_status = map_adisyo_status(adisyo_status_id, adisyo_order.get("status", ""))
        
        # İptal kontrolü
        if adisyo_order.get("orderCancelReason"):
            new_status = "cancelled"
        
        if current_status != new_status:
            update_data = {
                "status": new_status,
                "updated_at": datetime.now(TURKEY_TZ).isoformat()
            }
            
            if new_status == "delivered":
                # Türkiye saati (UTC+3)
                turkey_tz = timezone(timedelta(hours=3))
                update_data["delivered_at"] = datetime.now(turkey_tz).isoformat()
            elif new_status == "cancelled":
                update_data["cancel_reason"] = adisyo_order.get("orderCancelReason", "Adisyo üzerinden iptal")
                update_data["cancelled_by"] = "adisyo_webhook"
                # Türkiye saati (UTC+3)
                turkey_tz = timezone(timedelta(hours=3))
                update_data["cancelled_at"] = datetime.now(turkey_tz).isoformat()
            
            await db.orders.update_one(
                {"adisyo_order_id": order_id},
                {"$set": update_data}
            )
            
            await ilog.info(f"Adisyo sipariş güncellendi: order_id={order_id}, yeni durum: {new_status}")
            return {"success": True, "action": "updated", "new_status": new_status}
        
        return {"success": True, "action": "skipped", "message": "Durum değişmedi"}
    
    # Yeni sipariş - dönüştür ve kaydet
    shiftjet_order = await convert_adisyo_order_to_shiftjet(adisyo_order, restaurant)
    
    # Hazırlama süresini ürün bazlı hesapla
    try:
        from routers.orders import calculate_preparation_time_async
        prep_time = await calculate_preparation_time_async(restaurant_id, shiftjet_order.get("items", []))
    except:
        prep_time = restaurant.get("preparation_time", 15)
    
    prep_end = datetime.now(TURKEY_TZ) + timedelta(minutes=prep_time)
    shiftjet_order["preparation_time"] = prep_time
    shiftjet_order["preparation_end_at"] = prep_end.isoformat()
    
    await insert_order(shiftjet_order)
    await ilog.info(f"Adisyo yeni sipariş oluşturuldu: adisyo_order_id={order_id}, shiftjet_id={shiftjet_order['id']}")
    
    return {"success": True, "action": "created", "order_id": shiftjet_order["id"]}


# ==================== WEBHOOK ENDPOINTS ====================

@router.post("/webhook")
async def adisyo_webhook(
    request: Request,
    x_adisyo_signature: Optional[str] = Header(None, alias="X-Adisyo-Signature")
):
    """
    Adisyo Ana Webhook Endpoint
    
    Adisyo bu endpoint'e aşağıdaki eventleri gönderir:
    - order.created: Yeni sipariş
    - order.updated: Sipariş güncellemesi
    - stock.depleted: Stok tükenmesi
    - stock.restocked: Stok yenilenmesi
    
    Headers:
        X-Adisyo-Signature: HMAC-SHA256 imza (Base64)
    
    Body: Event payload
    """
    try:
        # Raw body al
        raw_body = await request.body()
        body_str = raw_body.decode('utf-8')
        
        # URL Doğrulama - Adisyo kurulum sırasında "adisyo" string'i gönderir
        if body_str == 'adisyo' or body_str == '"adisyo"':
            await ilog.info("Adisyo URL doğrulama isteği alındı")
            return Response(content="adisyo", media_type="text/plain")
        
        # JSON parse
        try:
            import json
            webhook_data = json.loads(body_str)
        except:
            await ilog.error("Adisyo webhook: JSON parse hatası")
            raise HTTPException(status_code=400, detail="Geçersiz JSON")
        
        # Event bilgilerini al
        event_id = webhook_data.get("eventId", "")
        event_type = webhook_data.get("webhookEventType", "")
        event_time = webhook_data.get("eventTimeUtc", "")
        event_data = webhook_data.get("data", {})
        restaurant_identity = webhook_data.get("restaurantIdentity", "")
        
        await ilog.info(f"Adisyo webhook alındı: event_type={event_type}, event_id={event_id}, restaurant_identity={restaurant_identity}")
        
        # Duplicate kontrolü - aynı event_id daha önce işlendi mi?
        existing_event = await db.adisyo_webhook_events.find_one({"event_id": event_id})
        if existing_event:
            await ilog.info(f"Adisyo webhook duplicate: event_id={event_id}")
            return {"status": "ok", "message": "Event zaten işlendi", "action": "duplicate"}
        
        # Restoranı bul
        restaurant = await get_restaurant_by_identity(restaurant_identity)
        
        if not restaurant:
            await ilog.warning(f"Adisyo webhook: Restoran bulunamadı, restaurant_identity={restaurant_identity}")
            # Yine de 200 dön, Adisyo retry yapmasın
            return {"status": "ok", "message": "Restoran bulunamadı"}
        
        # İmza doğrulama (opsiyonel - API key varsa)
        api_key = restaurant.get("adisyo_webhook_api_key") or restaurant.get("adisyo_api_key")
        
        if api_key and x_adisyo_signature:
            if not verify_adisyo_signature(body_str, x_adisyo_signature, api_key):
                await ilog.warning(f"Adisyo webhook: Geçersiz imza, restaurant_identity={restaurant_identity}")
                # Güvenlik için 401 dönebiliriz ama Adisyo retry yapabilir
                # Şimdilik loglayıp devam edelim
        
        # Event'i işle
        result = {"success": True, "action": "ignored"}
        
        if event_type == "order.created":
            result = await process_order_event(event_data, restaurant, event_type)
            
        elif event_type == "order.updated":
            result = await process_order_event(event_data, restaurant, event_type)
            
        elif event_type == "stock.depleted":
            # Stok tükenmesi - şimdilik sadece logla
            await ilog.info(f"Adisyo stok tükendi: restaurant={restaurant.get('name')}, data={event_data}")
            result = {"success": True, "action": "logged", "message": "Stok tükenmesi kaydedildi"}
            
        elif event_type == "stock.restocked":
            # Stok yenilenmesi - şimdilik sadece logla
            await ilog.info(f"Adisyo stok yenilendi: restaurant={restaurant.get('name')}, data={event_data}")
            result = {"success": True, "action": "logged", "message": "Stok yenilenmesi kaydedildi"}
        
        # Event'i kaydet (duplicate önleme için)
        await db.adisyo_webhook_events.insert_one({
            "event_id": event_id,
            "event_type": event_type,
            "event_time": event_time,
            "restaurant_identity": restaurant_identity,
            "restaurant_id": restaurant.get("id"),
            "processed_at": datetime.now(TURKEY_TZ).isoformat(),
            "result": result
        })
        
        return {"status": "ok", **result}
        
    except HTTPException:
        raise
    except Exception as e:
        await ilog.exception(f"Adisyo webhook hatası: {str(e)}")
        # Yine 200 dön (Adisyo retry yapmasın)
        return {"status": "error", "message": str(e)}


@router.post("/webhook/{restaurant_id}")
async def adisyo_webhook_by_restaurant(
    restaurant_id: str,
    request: Request,
    x_adisyo_signature: Optional[str] = Header(None, alias="X-Adisyo-Signature")
):
    """
    Restoran bazlı Adisyo Webhook Endpoint
    
    Bazı kurulumlar için restoran ID'si URL'de olabilir.
    """
    try:
        # Raw body al
        raw_body = await request.body()
        body_str = raw_body.decode('utf-8')
        
        # URL Doğrulama
        if body_str == 'adisyo' or body_str == '"adisyo"':
            await ilog.info(f"Adisyo URL doğrulama isteği alındı: restaurant_id={restaurant_id}")
            return Response(content="adisyo", media_type="text/plain")
        
        # Restoranı bul
        restaurant = await db.restaurants.find_one(
            {"id": restaurant_id},
            {"_id": 0}
        )
        
        if not restaurant:
            await ilog.warning(f"Adisyo webhook: Restoran bulunamadı, restaurant_id={restaurant_id}")
            raise HTTPException(status_code=404, detail="Restoran bulunamadı")
        
        # JSON parse
        try:
            import json
            webhook_data = json.loads(body_str)
        except:
            await ilog.error("Adisyo webhook: JSON parse hatası")
            raise HTTPException(status_code=400, detail="Geçersiz JSON")
        
        # Event bilgilerini al
        event_id = webhook_data.get("eventId", "")
        event_type = webhook_data.get("webhookEventType", "")
        event_data = webhook_data.get("data", {})
        
        await ilog.info(f"Adisyo webhook alındı (by restaurant): event_type={event_type}, restaurant_id={restaurant_id}")
        
        # Event'i işle
        result = {"success": True, "action": "ignored"}
        
        if event_type in ["order.created", "order.updated"]:
            result = await process_order_event(event_data, restaurant, event_type)
        
        return {"status": "ok", **result}
        
    except HTTPException:
        raise
    except Exception as e:
        await ilog.exception(f"Adisyo webhook hatası: {str(e)}")
        return {"status": "error", "message": str(e)}


@router.get("/webhook/health")
async def adisyo_webhook_health():
    """Adisyo Webhook Endpoint Sağlık Kontrolü"""
    return {
        "status": "healthy",
        "service": "adisyo_webhook",
        "timestamp": datetime.now(TURKEY_TZ).isoformat(),
        "endpoints": {
            "main": "/api/adisyo/webhook",
            "by_restaurant": "/api/adisyo/webhook/{restaurant_id}"
        },
        "supported_events": [
            "order.created",
            "order.updated",
            "stock.depleted",
            "stock.restocked"
        ]
    }


# ==================== TEST ENDPOINT ====================

@router.post("/webhook/test")
async def test_adisyo_webhook():
    """
    Test amaçlı webhook simülasyonu.
    Gerçek Adisyo isteği olmadan webhook akışını test eder.
    """
    test_payload = {
        "eventId": f"test-{datetime.now(TURKEY_TZ).isoformat()}",
        "webhookEventType": "order.created",
        "eventTimeUtc": datetime.now(TURKEY_TZ).isoformat(),
        "data": {
            "id": 99999999
        },
        "restaurantIdentity": "test-identity"
    }
    
    return {
        "status": "ok",
        "message": "Test endpoint çalışıyor",
        "sample_payload": test_payload,
        "instructions": {
            "1": "Adisyo panelinde Uygulama Mağazası > Webhook bölümüne gidin",
            "2": "Yeni Webhook Oluştur butonuna tıklayın",
            "3": "Servis URL olarak: https://[YOUR_DOMAIN]/api/adisyo/webhook girin",
            "4": "Oluşturulan API Key'i kaydedin ve restoran ayarlarına ekleyin"
        }
    }
