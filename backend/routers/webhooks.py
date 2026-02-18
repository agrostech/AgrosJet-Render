"""
Yemeksepeti Webhook Endpoint
Siparişleri webhook üzerinden alır
"""
from fastapi import APIRouter, HTTPException, Request, Header
from typing import Optional
import logging

from services.yemeksepeti_service import (
    process_yemeksepeti_webhook,
    verify_webhook_signature
)
from utils.database import db

router = APIRouter(prefix="/api/webhooks", tags=["Webhooks"])
logger = logging.getLogger(__name__)


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
