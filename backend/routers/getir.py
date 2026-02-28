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
from datetime import datetime, timezone, timedelta
import logging

from utils.database import db
from utils.helpers import get_turkey_now, ensure_turkey_timezone, TURKEY_TZ
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

from services.integration_log_service import save_integration_log as _db_log

class _IntLogger:
    def __init__(self, name):
        self._name = name
    async def info(self, msg):
        await ilog.info(msg)
        await _db_log(self._name, "INFO", msg)
    async def warning(self, msg):
        await ilog.warning(msg)
        await _db_log(self._name, "WARNING", msg)
    async def error(self, msg):
        await ilog.error(msg)
        await _db_log(self._name, "ERROR", msg)
    async def exception(self, msg):
        await ilog.exception(msg)
        await _db_log(self._name, "ERROR", msg)

ilog = _IntLogger("getir")

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


# Getir Webhook API Key
import os
GETIR_WEBHOOK_API_KEY = os.environ.get("GETIR_WEBHOOK_API_KEY", "")


def verify_webhook_api_key(x_api_key: str) -> bool:
    """Webhook API key doğrulama"""
    if not GETIR_WEBHOOK_API_KEY:
        # Key tanımlı değilse tüm istekleri kabul et (geliştirme modu)
        logger.warning("GETIR_WEBHOOK_API_KEY tanımlı değil, doğrulama atlandı")
        return True
    return x_api_key == GETIR_WEBHOOK_API_KEY


# --- Webhook Endpoints ---

@router.post("/webhook/order")
async def webhook_new_order(
    request: Request,
    background_tasks: BackgroundTasks,
    x_api_key: str = Header(None, alias="x-api-key")
):
    """
    Getir'den gelen yeni sipariş webhook'u
    
    Getir, yeni sipariş oluştuğunda bu endpoint'e POST yapar.
    30 saniye içinde onay verilmelidir!
    
    Header: x-api-key: [GETIR_WEBHOOK_API_KEY]
    """
    # API Key doğrulama
    if not verify_webhook_api_key(x_api_key):
        await ilog.warning(f"Getir webhook: Geçersiz API key")
        raise HTTPException(status_code=401, detail="Geçersiz API key")
    
    try:
        body = await request.json()
        await ilog.info(f"Getir webhook order received: {body.get('id', 'unknown')}")
        
        result = await handle_getir_webhook_order(body, x_api_key)
        
        if result.get("success"):
            return {"status": "ok", "message": result.get("message")}
        else:
            await ilog.warning(f"Getir webhook order failed: {result.get('error')}")
            return {"status": "error", "message": result.get("error")}
            
    except Exception as e:
        await ilog.exception("Getir webhook order hatası")
        return {"status": "error", "message": str(e)}


@router.post("/webhook/cancel")
async def webhook_cancel_order(
    request: Request,
    x_api_key: str = Header(None, alias="x-api-key")
):
    """
    Getir'den gelen sipariş iptal webhook'u
    
    Header: x-api-key: [GETIR_WEBHOOK_API_KEY]
    """
    # API Key doğrulama
    if not verify_webhook_api_key(x_api_key):
        await ilog.warning(f"Getir webhook cancel: Geçersiz API key")
        raise HTTPException(status_code=401, detail="Geçersiz API key")
    
    try:
        body = await request.json()
        await ilog.info(f"Getir webhook cancel received: {body.get('id', 'unknown')}")
        
        result = await handle_getir_webhook_cancel(body, x_api_key)
        
        if result.get("success"):
            return {"status": "ok", "message": result.get("message")}
        else:
            await ilog.warning(f"Getir webhook cancel failed: {result.get('error')}")
            return {"status": "error", "message": result.get("error")}
            
    except Exception as e:
        await ilog.exception("Getir webhook cancel hatası")
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
                "verified_at": get_turkey_now(),
                "updated_at": get_turkey_now()
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
                "prepared_at": get_turkey_now(),
                "updated_at": get_turkey_now()
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
                "handover_at": get_turkey_now(),
                "updated_at": get_turkey_now()
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
        # Türkiye saati (UTC+3)
        turkey_tz = timezone(timedelta(hours=3))
        now_turkey = datetime.now(turkey_tz).isoformat()
        await db.orders.update_one(
            {"id": data.order_id},
            {"$set": {
                "status": "delivered",
                "delivered_at": now_turkey,
                "updated_at": now_turkey
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
        # Türkiye saati (UTC+3)
        turkey_tz = timezone(timedelta(hours=3))
        now_turkey = datetime.now(turkey_tz).isoformat()
        await db.orders.update_one(
            {"id": data.order_id},
            {"$set": {
                "status": "cancelled",
                "cancel_reason": data.cancel_note or data.cancel_reason_id,
                "cancelled_at": now_turkey,
                "cancelled_by": "restaurant",
                "updated_at": now_turkey
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


# --- Menü İşlemleri ---

class ProductStatusRequest(BaseModel):
    product_id: str
    status: int  # 100=Açık, 200=Kapalı
    is_chain: bool = False


class OptionActionRequest(BaseModel):
    product_id: str
    is_chain: bool = False


@router.get("/menu/{restaurant_id}/products")
async def get_menu_products(restaurant_id: str):
    """Restoran menüsünü getir"""
    result = await get_getir_restaurant_menu(restaurant_id)
    return result


@router.get("/menu/{restaurant_id}/option-products")
async def get_menu_option_products(restaurant_id: str):
    """Opsiyon ürünlerini getir"""
    result = await get_option_products(restaurant_id)
    return result


@router.get("/menu/{restaurant_id}/product/{product_id}/status")
async def get_menu_product_status(restaurant_id: str, product_id: str, is_chain: bool = False):
    """Ürün durumunu sorgula"""
    result = await get_product_status(restaurant_id, product_id, is_chain)
    return result


@router.put("/menu/{restaurant_id}/product/status")
async def update_menu_product_status(restaurant_id: str, data: ProductStatusRequest):
    """
    Ürün durumunu güncelle (açık/kapalı)
    status: 100=Açık, 200=Kapalı
    """
    result = await update_product_status(restaurant_id, data.product_id, data.status, data.is_chain)
    return result


@router.post("/menu/{restaurant_id}/option/activate")
async def activate_menu_option(restaurant_id: str, data: OptionActionRequest):
    """Opsiyon ürünü aktif et"""
    result = await activate_option(restaurant_id, data.product_id, data.is_chain)
    return result


@router.post("/menu/{restaurant_id}/option/inactivate")
async def inactivate_menu_option(restaurant_id: str, data: OptionActionRequest):
    """Opsiyon ürünü pasif yap (kapat)"""
    result = await inactivate_option(restaurant_id, data.product_id, data.is_chain)
    return result


# --- Sipariş Fişi (Receipt) ---

@router.get("/orders/{order_id}/receipt")
async def get_order_receipt(order_id: str):
    """
    Getir sipariş fişi verilerini döndür
    
    Sipariş fişinde olması gereken alanlar (Getir gereksinimleri):
    - Getir Logosu
    - Sipariş Notu
    - İndirimli toplam
    - Ürün notu
    - 0850 ile başlayan müşteri numarası
    - Sipariş Doğrulama Kodu
    - Ürün detayları
    - Teslimat tipi
    - Sipariş Tarihi
    - Ödeme Yöntemi
    """
    # Siparişi bul
    order = await db.orders.find_one(
        {"id": order_id},
        {"_id": 0}
    )
    
    if not order:
        raise HTTPException(status_code=404, detail="Sipariş bulunamadı")
    
    if order.get("source") != "getir":
        raise HTTPException(status_code=400, detail="Bu sipariş Getir siparişi değil")
    
    getir_raw = order.get("getir_raw", {})
    
    # Ödeme yöntemi bilgisi
    payment_method_id = getir_raw.get("paymentMethodId")
    payment_method_info = GETIR_PAYMENT_METHODS.get(payment_method_id, {})
    payment_method_name = getir_raw.get("paymentMethodName") or payment_method_info.get("name", "Online Ödeme")
    
    # Teslimat tipi
    delivery_type = getir_raw.get("deliveryType", 1)
    delivery_type_text = "Getir Getirsin" if delivery_type == 1 else "Restoran Getirsin"
    
    # Sipariş fişi verileri
    receipt_data = {
        "logo_url": "https://cdn.getir.com/getirweb-images/common/getir-logo-purple.svg",
        "order_number": order.get("order_number"),
        "confirmation_id": order.get("getir_confirmation_id") or getir_raw.get("confirmationId"),
        "verification_code": order.get("verification_code") or getir_raw.get("verificationCode"),
        
        # Müşteri bilgileri
        "customer_name": order.get("customer_name"),
        "customer_phone": order.get("customer_phone"),  # 0850 ile başlayan numara
        "delivery_address": order.get("delivery_address"),
        
        # Sipariş detayları
        "order_date": order.get("created_at"),
        "delivery_type": delivery_type,
        "delivery_type_text": delivery_type_text,
        "payment_method": order.get("payment_method"),
        "payment_method_name": payment_method_name,
        
        # Ürünler
        "items": order.get("items", []),
        
        # Tutarlar
        "total_price": order.get("total_price", order.get("total_amount", 0)),
        "total_discounted_price": order.get("total_discounted_price", 0),
        "total_amount": order.get("total_amount", 0),
        
        # Notlar
        "order_notes": order.get("notes"),
        
        # İleri tarihli sipariş
        "is_scheduled": getir_raw.get("isScheduled", False),
        "scheduled_date": getir_raw.get("scheduledDate"),
        
        # Getir kuryesi mi?
        "is_getir_courier": getir_raw.get("isGetirCourier", delivery_type == 1),
        
        # Ham veri (debug için)
        "raw_status": getir_raw.get("status"),
        "raw_status_text": getir_raw.get("statusText")
    }
    
    return {
        "success": True,
        "receipt": receipt_data
    }


@router.get("/orders/{order_id}/receipt/html")
async def get_order_receipt_html(order_id: str):
    """
    Getir sipariş fişi HTML formatında
    Yazdırma için optimize edilmiş
    """
    # Siparişi bul
    order = await db.orders.find_one(
        {"id": order_id},
        {"_id": 0}
    )
    
    if not order:
        raise HTTPException(status_code=404, detail="Sipariş bulunamadı")
    
    if order.get("source") != "getir":
        raise HTTPException(status_code=400, detail="Bu sipariş Getir siparişi değil")
    
    getir_raw = order.get("getir_raw", {})
    
    # Ödeme yöntemi
    payment_method_id = getir_raw.get("paymentMethodId")
    payment_method_info = GETIR_PAYMENT_METHODS.get(payment_method_id, {})
    payment_method_name = getir_raw.get("paymentMethodName") or payment_method_info.get("name", "Online Ödeme")
    
    # Teslimat tipi
    delivery_type = getir_raw.get("deliveryType", 1)
    delivery_type_text = "Getir Getirsin" if delivery_type == 1 else "Restoran Getirsin"
    
    # Tarih formatla
    order_date = order.get("created_at", "")
    if order_date:
        try:
            from datetime import datetime
            dt = datetime.fromisoformat(order_date.replace('Z', '+00:00'))
            order_date_formatted = dt.strftime("%d.%m.%Y %H:%M")
        except (ValueError, TypeError):
            order_date_formatted = order_date
    else:
        order_date_formatted = "-"
    
    # Ürünleri HTML'e çevir
    items_html = ""
    for item in order.get("items", []):
        item_name = item.get("name", "Ürün")
        quantity = item.get("quantity", 1)
        price = item.get("price", 0)
        total = quantity * price
        notes = item.get("notes", "")
        
        items_html += f"""
        <tr>
            <td style="padding: 8px; border-bottom: 1px solid #eee;">{item_name}</td>
            <td style="padding: 8px; border-bottom: 1px solid #eee; text-align: center;">{quantity}</td>
            <td style="padding: 8px; border-bottom: 1px solid #eee; text-align: right;">₺{price:.2f}</td>
            <td style="padding: 8px; border-bottom: 1px solid #eee; text-align: right;">₺{total:.2f}</td>
        </tr>
        """
        if notes:
            items_html += f"""
            <tr>
                <td colspan="4" style="padding: 4px 8px; font-size: 12px; color: #666; font-style: italic;">
                    Ürün Notu: {notes}
                </td>
            </tr>
            """
    
    # Toplam tutarlar
    total_price = order.get("total_price", order.get("total_amount", 0))
    total_discounted = order.get("total_discounted_price", 0)
    total_amount = order.get("total_amount", 0)
    
    discount_html = ""
    if total_discounted and total_discounted != total_price:
        discount = total_price - total_discounted
        discount_html = f"""
        <tr>
            <td colspan="3" style="padding: 8px; text-align: right;">İndirim:</td>
            <td style="padding: 8px; text-align: right; color: green;">-₺{discount:.2f}</td>
        </tr>
        """
    
    # Sipariş notu
    order_notes = order.get("notes", "")
    notes_parts = order_notes.split(" | ") if order_notes else []
    customer_note = ""
    address_note = ""
    for part in notes_parts:
        if part.startswith("MÜŞTERİ NOTU:"):
            customer_note = part.replace("MÜŞTERİ NOTU:", "").strip()
        elif part.startswith("ADRES TARIFI:"):
            address_note = part.replace("ADRES TARIFI:", "").strip()
    
    notes_html = ""
    if customer_note:
        notes_html += f'<p><strong>Sipariş Notu:</strong> {customer_note}</p>'
    if address_note:
        notes_html += f'<p><strong>Adres Tarifi:</strong> {address_note}</p>'
    
    # İleri tarihli sipariş
    scheduled_html = ""
    if getir_raw.get("isScheduled"):
        scheduled_date = getir_raw.get("scheduledDate", "")
        scheduled_html = f'<p style="color: orange; font-weight: bold;">⏰ İLERİ TARİHLİ SİPARİŞ: {scheduled_date}</p>'
    
    html = f"""
    <!DOCTYPE html>
    <html>
    <head>
        <meta charset="UTF-8">
        <title>Getir Sipariş Fişi - {order.get('order_number')}</title>
        <style>
            body {{ font-family: Arial, sans-serif; max-width: 400px; margin: 0 auto; padding: 20px; }}
            .header {{ text-align: center; margin-bottom: 20px; }}
            .logo {{ width: 120px; margin-bottom: 10px; }}
            .order-info {{ margin-bottom: 15px; }}
            .order-info p {{ margin: 5px 0; }}
            .verification-code {{ 
                font-size: 24px; 
                font-weight: bold; 
                color: #5D3EBC; 
                text-align: center;
                padding: 10px;
                border: 2px dashed #5D3EBC;
                margin: 15px 0;
            }}
            table {{ width: 100%; border-collapse: collapse; }}
            th {{ background: #5D3EBC; color: white; padding: 10px; text-align: left; }}
            .total-row {{ font-weight: bold; background: #f5f5f5; }}
            .footer {{ margin-top: 20px; text-align: center; font-size: 12px; color: #666; }}
        </style>
    </head>
    <body>
        <div class="header">
            <img src="https://cdn.getir.com/getirweb-images/common/getir-logo-purple.svg" alt="Getir" class="logo">
            <h2>Sipariş Fişi</h2>
        </div>
        
        <div class="verification-code">
            Doğrulama Kodu: {order.get('verification_code') or getir_raw.get('verificationCode') or order.get('getir_confirmation_id', '')[:4]}
        </div>
        
        <div class="order-info">
            <p><strong>Sipariş No:</strong> {order.get('order_number')}</p>
            <p><strong>Tarih:</strong> {order_date_formatted}</p>
            <p><strong>Teslimat Tipi:</strong> {delivery_type_text}</p>
            <p><strong>Ödeme Yöntemi:</strong> {payment_method_name}</p>
        </div>
        
        {scheduled_html}
        
        <div class="customer-info">
            <p><strong>Müşteri:</strong> {order.get('customer_name', '-')}</p>
            <p><strong>Telefon:</strong> {order.get('customer_phone', '-')}</p>
            <p><strong>Adres:</strong> {order.get('delivery_address', '-')}</p>
        </div>
        
        {notes_html}
        
        <table>
            <thead>
                <tr>
                    <th>Ürün</th>
                    <th style="text-align: center;">Adet</th>
                    <th style="text-align: right;">Fiyat</th>
                    <th style="text-align: right;">Tutar</th>
                </tr>
            </thead>
            <tbody>
                {items_html}
                {discount_html}
                <tr class="total-row">
                    <td colspan="3" style="padding: 10px; text-align: right;">İndirimli Toplam:</td>
                    <td style="padding: 10px; text-align: right;">₺{total_amount:.2f}</td>
                </tr>
            </tbody>
        </table>
        
        <div class="footer">
            <p>Getir Yemek - AgrosJet POS Entegrasyonu</p>
            <p>Bu fiş {order_date_formatted} tarihinde oluşturulmuştur.</p>
        </div>
    </body>
    </html>
    """
    
    from fastapi.responses import HTMLResponse
    return HTMLResponse(content=html)
