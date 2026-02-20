"""
Getir Yemek API Router
- Webhook endpoints (yeni sipariş, iptal)
- Sipariş yönetimi (verify, prepare, handover, deliver, cancel)
- Restoran durumu (aç/kapa, yoğunluk)
- Kurye durumu
- Menü ve bilgi
"""
from fastapi import APIRouter, HTTPException, Header, Request, BackgroundTasks
from pydantic import BaseModel
from typing import Optional, List
from datetime import datetime, timezone
import logging

from utils.database import db
from services.getir_service import (
    test_getir_connection,
    sync_restaurant_getir_orders,
    fetch_getir_active_orders,
    fetch_getir_unapproved_orders,
    fetch_getir_cancelled_orders,
    verify_getir_order,
    prepare_getir_order,
    handover_getir_order,
    deliver_getir_order,
    cancel_getir_order,
    update_getir_restaurant_status,
    update_getir_courier_status,
    update_getir_busyness,
    get_getir_restaurant_info,
    get_getir_restaurant_menu,
    handle_getir_webhook_order,
    handle_getir_webhook_cancel,
    get_cancel_reasons,
    check_pos_status,
    activate_pos_status,
    get_product_status,
    update_product_status,
    activate_option,
    inactivate_option,
    get_option_products,
    GETIR_CANCEL_REASONS,
    GETIR_PAYMENT_METHODS
)

logger = logging.getLogger(__name__)

router = APIRouter(prefix="/api/getir", tags=["Getir Yemek"])


# --- Request Models ---

class OrderActionRequest(BaseModel):
    order_id: str


class CancelOrderRequest(BaseModel):
    order_id: str
    cancel_reason_id: Optional[str] = None
    cancel_note: Optional[str] = None


class RestaurantStatusRequest(BaseModel):
    is_open: bool
    time_off_amount: Optional[int] = None  # 15, 30, 45


class CourierStatusRequest(BaseModel):
    enabled: bool
    time_off_amount: Optional[int] = None


class BusynessRequest(BaseModel):
    is_busy: bool
    duration_minutes: Optional[int] = None  # 15, 30, 45


# --- Webhook Endpoints ---

@router.post("/webhook/order")
async def webhook_new_order(
    request: Request,
    background_tasks: BackgroundTasks,
    x_api_key: str = Header(None)
):
    """
    Getir'den gelen yeni sipariş webhook'u
    
    Getir, yeni sipariş oluştuğunda bu endpoint'e POST yapar.
    30 saniye içinde onay verilmelidir!
    """
    try:
        body = await request.json()
        logger.info(f"Getir webhook order received: {body.get('id', 'unknown')}")
        
        result = await handle_getir_webhook_order(body, x_api_key)
        
        if result.get("success"):
            return {"status": "ok", "message": result.get("message")}
        else:
            logger.warning(f"Getir webhook order failed: {result.get('error')}")
            return {"status": "error", "message": result.get("error")}
            
    except Exception as e:
        logger.exception("Getir webhook order hatası")
        return {"status": "error", "message": str(e)}


@router.post("/webhook/cancel")
async def webhook_cancel_order(
    request: Request,
    x_api_key: str = Header(None)
):
    """
    Getir'den gelen sipariş iptal webhook'u
    """
    try:
        body = await request.json()
        logger.info(f"Getir webhook cancel received: {body.get('id', 'unknown')}")
        
        result = await handle_getir_webhook_cancel(body, x_api_key)
        
        if result.get("success"):
            return {"status": "ok", "message": result.get("message")}
        else:
            logger.warning(f"Getir webhook cancel failed: {result.get('error')}")
            return {"status": "error", "message": result.get("error")}
            
    except Exception as e:
        logger.exception("Getir webhook cancel hatası")
        return {"status": "error", "message": str(e)}


# --- Test & Sync ---

@router.post("/test/{restaurant_id}")
async def test_connection(restaurant_id: str, activate_pos: bool = True):
    """
    Getir API bağlantısını test et
    
    activate_pos: True ise POS durumunu otomatik aktif eder (ilk bağlantı için gerekli)
    """
    result = await test_getir_connection(restaurant_id, activate_pos)
    return result


@router.post("/sync/{restaurant_id}")
async def sync_orders(restaurant_id: str):
    """Restoran için Getir siparişlerini senkronize et"""
    result = await sync_restaurant_getir_orders(restaurant_id)
    return result


@router.get("/orders/active/{restaurant_id}")
async def get_active_orders(restaurant_id: str):
    """Getir'den aktif siparişleri getir"""
    result = await fetch_getir_active_orders(restaurant_id)
    return result


@router.get("/orders/unapproved/{restaurant_id}")
async def get_unapproved_orders(restaurant_id: str):
    """Getir'den onay bekleyen siparişleri getir"""
    result = await fetch_getir_unapproved_orders(restaurant_id)
    return result


@router.get("/orders/cancelled/{restaurant_id}")
async def get_cancelled_orders(restaurant_id: str):
    """Getir'den iptal edilmiş siparişleri getir (son 24 saat)"""
    result = await fetch_getir_cancelled_orders(restaurant_id)
    return result


# --- Sipariş Durumu Güncelleme ---

@router.post("/orders/{restaurant_id}/verify")
async def verify_order(restaurant_id: str, data: OrderActionRequest):
    """
    Siparişi onayla (verify)
    
    Sipariş geldiğinde 30 saniye içinde çağrılmalıdır!
    İleri tarihli siparişler için verify-scheduled kullanılır (otomatik).
    """
    result = await verify_getir_order(restaurant_id, data.order_id)
    
    if result.get("success"):
        # Yerel durumu güncelle
        await db.orders.update_one(
            {"id": data.order_id},
            {"$set": {
                "status": "preparing",
                "verified_at": datetime.now(timezone.utc).isoformat(),
                "updated_at": datetime.now(timezone.utc).isoformat()
            }}
        )
    
    return result


@router.post("/orders/{restaurant_id}/prepare")
async def prepare_order(restaurant_id: str, data: OrderActionRequest):
    """
    Siparişi hazırlanıyor olarak işaretle
    
    verify'dan en az 1 dakika sonra çağrılabilir.
    """
    result = await prepare_getir_order(restaurant_id, data.order_id)
    
    if result.get("success"):
        await db.orders.update_one(
            {"id": data.order_id},
            {"$set": {
                "status": "preparing",
                "prepared_at": datetime.now(timezone.utc).isoformat(),
                "updated_at": datetime.now(timezone.utc).isoformat()
            }}
        )
    
    return result


@router.post("/orders/{restaurant_id}/handover")
async def handover_order(restaurant_id: str, data: OrderActionRequest):
    """
    Siparişi Getir kuryesine teslim et
    
    Sadece Getir Getirsin (deliveryType: 1) siparişlerinde kullanılır.
    prepare'dan en az 1 dakika sonra çağrılabilir.
    """
    result = await handover_getir_order(restaurant_id, data.order_id)
    
    if result.get("success"):
        await db.orders.update_one(
            {"id": data.order_id},
            {"$set": {
                "status": "on_the_way",
                "handover_at": datetime.now(timezone.utc).isoformat(),
                "updated_at": datetime.now(timezone.utc).isoformat()
            }}
        )
    
    return result


@router.post("/orders/{restaurant_id}/deliver")
async def deliver_order(restaurant_id: str, data: OrderActionRequest):
    """
    Siparişi teslim edildi olarak işaretle
    
    Sadece Restoran Getirsin (deliveryType: 2) siparişlerinde kullanılır.
    Getir Getirsin siparişlerinde bu işlemi Getir kuryesi yapar.
    """
    result = await deliver_getir_order(restaurant_id, data.order_id)
    
    if result.get("success"):
        await db.orders.update_one(
            {"id": data.order_id},
            {"$set": {
                "status": "delivered",
                "delivered_at": datetime.now(timezone.utc).isoformat(),
                "updated_at": datetime.now(timezone.utc).isoformat()
            }}
        )
    
    return result


@router.post("/orders/{restaurant_id}/cancel")
async def cancel_order(restaurant_id: str, data: CancelOrderRequest):
    """
    Siparişi iptal et
    
    cancel_reason_id: Getir iptal sebep ID'si (zorunlu değil ama önerilir)
    """
    result = await cancel_getir_order(
        restaurant_id, 
        data.order_id, 
        data.cancel_reason_id, 
        data.cancel_note
    )
    
    if result.get("success"):
        await db.orders.update_one(
            {"id": data.order_id},
            {"$set": {
                "status": "cancelled",
                "cancel_reason": data.cancel_note or data.cancel_reason_id,
                "cancelled_at": datetime.now(timezone.utc).isoformat(),
                "cancelled_by": "restaurant",
                "updated_at": datetime.now(timezone.utc).isoformat()
            }}
        )
    
    return result


@router.get("/cancel-reasons")
async def list_cancel_reasons():
    """İptal sebeplerini listele"""
    return {
        "success": True,
        "reasons": get_cancel_reasons()
    }


# --- Restoran Durumu ---

@router.put("/restaurant/{restaurant_id}/status")
async def update_restaurant_status(restaurant_id: str, data: RestaurantStatusRequest):
    """
    Restoran açık/kapalı durumunu güncelle
    
    time_off_amount: Kapatma süresi (15, 30, 45 dakika). Sadece is_open=False için geçerli.
    """
    result = await update_getir_restaurant_status(
        restaurant_id, 
        data.is_open, 
        data.time_off_amount
    )
    return result


@router.put("/restaurant/{restaurant_id}/courier")
async def update_courier_status(restaurant_id: str, data: CourierStatusRequest):
    """
    Kurye hizmet durumunu güncelle
    
    Restoran Getirsin siparişleri için kurye hizmetini açıp kapatabilirsiniz.
    """
    result = await update_getir_courier_status(
        restaurant_id, 
        data.enabled, 
        data.time_off_amount
    )
    return result


@router.put("/restaurant/{restaurant_id}/busyness")
async def update_busyness(restaurant_id: str, data: BusynessRequest):
    """
    Restoran yoğunluk durumunu güncelle
    
    Yoğun dönemlerde teslimat süresine +15/30/45 dakika ekler.
    """
    result = await update_getir_busyness(
        restaurant_id, 
        data.is_busy, 
        data.duration_minutes
    )
    return result


# --- Restoran Bilgisi ---

@router.get("/restaurant/{restaurant_id}/info")
async def get_restaurant_info(restaurant_id: str):
    """Getir'den restoran bilgilerini çek"""
    result = await get_getir_restaurant_info(restaurant_id)
    return result


@router.get("/restaurant/{restaurant_id}/menu")
async def get_restaurant_menu(restaurant_id: str):
    """Getir'den restoran menüsünü çek"""
    result = await get_getir_restaurant_menu(restaurant_id)
    return result


# --- POS Durumu ---

@router.get("/restaurant/{restaurant_id}/pos-status")
async def get_pos_status(restaurant_id: str):
    """POS durumunu kontrol et"""
    restaurant = await db.restaurants.find_one(
        {"id": restaurant_id},
        {"_id": 0, "platform_integrations.getir": 1}
    )
    
    if not restaurant:
        raise HTTPException(status_code=404, detail="Restoran bulunamadı")
    
    integration = restaurant.get("platform_integrations", {}).get("getir", {})
    app_secret = integration.get("app_secret_key")
    restaurant_secret = integration.get("restaurant_secret_key")
    
    if not app_secret or not restaurant_secret:
        raise HTTPException(status_code=400, detail="Getir API bilgileri eksik")
    
    result = await check_pos_status(app_secret, restaurant_secret)
    return result


@router.put("/restaurant/{restaurant_id}/pos-status/activate")
async def activate_pos(restaurant_id: str):
    """POS durumunu aktif et"""
    restaurant = await db.restaurants.find_one(
        {"id": restaurant_id},
        {"_id": 0, "platform_integrations.getir": 1}
    )
    
    if not restaurant:
        raise HTTPException(status_code=404, detail="Restoran bulunamadı")
    
    integration = restaurant.get("platform_integrations", {}).get("getir", {})
    app_secret = integration.get("app_secret_key")
    restaurant_secret = integration.get("restaurant_secret_key")
    
    if not app_secret or not restaurant_secret:
        raise HTTPException(status_code=400, detail="Getir API bilgileri eksik")
    
    result = await activate_pos_status(app_secret, restaurant_secret)
    
    if result.get("success"):
        await db.restaurants.update_one(
            {"id": restaurant_id},
            {"$set": {"platform_integrations.getir.pos_active": True}}
        )
    
    return result
