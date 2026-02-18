"""
Webhook Endpoints
- Yemeksepeti Webhook
- Getir Webhook (Sipariş + İptal)
"""
from fastapi import APIRouter, HTTPException, Request, Header
from typing import Optional
import logging
import uuid
from datetime import datetime, timezone, timedelta

from services.yemeksepeti_service import (
    process_yemeksepeti_webhook,
    verify_webhook_signature
)
from services.getir_service import (
    map_getir_status,
    map_getir_payment,
    convert_getir_order_to_shiftjet
)
from utils.database import db

router = APIRouter(prefix="/api/webhooks", tags=["Webhooks"])
logger = logging.getLogger(__name__)


# ==================== GETİR WEBHOOKS ====================

async def verify_getir_api_key(api_key: str, restaurant_id: str = None) -> dict:
    """
    Getir webhook API key doğrulama.
    Eğer restaurant_id verilmişse o restoran için kontrol eder,
    verilmemişse tüm restoranlar arasında arar.
    """
    if not api_key:
        return {"valid": False, "restaurant": None}
    
    query = {"platform_integrations.getir.webhook_api_key": api_key}
    if restaurant_id:
        query["id"] = restaurant_id
    
    restaurant = await db.restaurants.find_one(query, {"_id": 0})
    
    if restaurant:
        return {"valid": True, "restaurant": restaurant}
    
    return {"valid": False, "restaurant": None}


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
            raise HTTPException(status_code=401, detail="Geçersiz API key")
        
        restaurant = auth_result["restaurant"]
        restaurant_id = restaurant.get("id")
        
        # JSON parse
        try:
            webhook_data = await request.json()
        except:
            logger.error("Getir webhook: JSON parse hatası")
            raise HTTPException(status_code=400, detail="Geçersiz JSON")
        
        logger.info(f"Getir sipariş webhook alındı: restaurant={restaurant_id}, order_id={webhook_data.get('id')}")
        
        # Sipariş ID kontrol
        getir_order_id = webhook_data.get("id")
        if not getir_order_id:
            logger.warning("Getir webhook: Sipariş ID bulunamadı")
            return {"status": "error", "message": "Sipariş ID bulunamadı"}
        
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
                        "updated_at": datetime.now(timezone.utc).isoformat(),
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
        
        prep_end = datetime.now(timezone.utc) + timedelta(minutes=prep_time)
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
        x-api-key: Restoran için tanımlanan API key
    
    Body: İptal bilgisi (order_id, cancel_reason, etc.)
    """
    try:
        # API Key doğrulama
        auth_result = await verify_getir_api_key(x_api_key)
        
        if not auth_result["valid"]:
            logger.warning(f"Getir iptal webhook: Geçersiz API key")
            raise HTTPException(status_code=401, detail="Geçersiz API key")
        
        restaurant = auth_result["restaurant"]
        restaurant_id = restaurant.get("id")
        
        # JSON parse
        try:
            webhook_data = await request.json()
        except:
            logger.error("Getir iptal webhook: JSON parse hatası")
            raise HTTPException(status_code=400, detail="Geçersiz JSON")
        
        logger.info(f"Getir iptal webhook alındı: restaurant={restaurant_id}, data={webhook_data}")
        
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
        
        # Siparişi iptal et
        await db.orders.update_one(
            {"getir_order_id": getir_order_id},
            {"$set": {
                "status": "cancelled",
                "updated_at": datetime.now(timezone.utc).isoformat(),
                "cancel_reason": cancel_reason,
                "cancelled_by": "getir_webhook",
                "cancelled_at": datetime.now(timezone.utc).isoformat(),
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


@router.get("/getir/health")
async def getir_webhook_health():
    """Getir Webhook Endpoint Sağlık Kontrolü"""
    return {
        "status": "healthy",
        "service": "getir_webhook",
        "timestamp": datetime.now(timezone.utc).isoformat(),
        "endpoints": {
            "order": "/api/webhooks/getir/order",
            "cancel": "/api/webhooks/getir/cancel"
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
