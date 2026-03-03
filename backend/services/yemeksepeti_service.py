"""
Yemeksepeti (Delivery Hero) API Entegrasyon Servisi
- OAuth 2.0 token yönetimi (2 saat geçerli)
- Webhook ile sipariş alma
- Sipariş durumu güncelleme

API Base: https://yemeksepeti.partner.deliveryhero.io/v2
"""
import httpx
import hmac
import hashlib
import uuid
import logging
from datetime import datetime, timezone, timedelta
from typing import Optional, Dict, Any
from utils.database import db
from utils.helpers import ensure_turkey_timezone, get_turkey_now
from services.credit_service import insert_order

# Türkiye timezone (UTC+3)
TURKEY_TZ = timezone(timedelta(hours=3))

logger = logging.getLogger(__name__)

YEMEKSEPETI_BASE_URL = "https://yemeksepeti.partner.deliveryhero.io/v2"
YEMEKSEPETI_TOKEN_URL = f"{YEMEKSEPETI_BASE_URL}/oauth/token"


async def get_yemeksepeti_token(restaurant: dict) -> Optional[str]:
    """
    Yemeksepeti OAuth token al veya mevcut geçerli token'ı döndür.
    Token 2 saat geçerli, 110 dakikada yenilenir.
    """
    integration = restaurant.get("platform_integrations", {}).get("yemeksepeti", {})
    
    # Mevcut token kontrolü
    current_token = integration.get("access_token")
    token_expires = integration.get("token_expires")
    
    if current_token and token_expires:
        try:
            expires_dt = datetime.fromisoformat(token_expires.replace('Z', '+00:00'))
            # Token hala geçerli mi? (10 dakika tolerans)
            if expires_dt > datetime.now(TURKEY_TZ) + timedelta(minutes=10):
                return current_token
        except:
            pass
    
    # Yeni token al
    client_id = integration.get("client_id")
    client_secret = integration.get("client_secret")
    
    if not client_id or not client_secret:
        logger.warning(f"Yemeksepeti credentials eksik: restaurant={restaurant.get('id')}")
        return None
    
    try:
        async with httpx.AsyncClient(timeout=15.0) as client:
            response = await client.post(
                YEMEKSEPETI_TOKEN_URL,
                data={
                    "grant_type": "client_credentials",
                    "client_id": client_id,
                    "client_secret": client_secret
                },
                headers={"Content-Type": "application/x-www-form-urlencoded"}
            )
            
            if response.status_code == 200:
                data = response.json()
                new_token = data.get("access_token")
                expires_in = data.get("expires_in", 7200)  # Default 2 saat
                
                if new_token:
                    # Token'ı kaydet
                    expires_at = (datetime.now(TURKEY_TZ) + timedelta(seconds=expires_in - 600)).isoformat()
                    
                    await db.restaurants.update_one(
                        {"id": restaurant.get("id")},
                        {"$set": {
                            "platform_integrations.yemeksepeti.access_token": new_token,
                            "platform_integrations.yemeksepeti.token_expires": expires_at,
                            "platform_integrations.yemeksepeti.connected": True
                        }}
                    )
                    
                    return new_token
            else:
                logger.warning(f"Yemeksepeti token hatası: {response.status_code} - {response.text[:200]}")
                await db.restaurants.update_one(
                    {"id": restaurant.get("id")},
                    {"$set": {"platform_integrations.yemeksepeti.connected": False}}
                )
                
    except Exception as e:
        logger.exception(f"Yemeksepeti token alma hatası: {str(e)}")
    
    return None


async def get_yemeksepeti_headers(restaurant: dict) -> Optional[dict]:
    """Yemeksepeti API için gerekli header'ları oluştur"""
    token = await get_yemeksepeti_token(restaurant)
    
    if not token:
        return None
    
    return {
        "Authorization": f"Bearer {token}",
        "Content-Type": "application/json",
        "Accept": "application/json"
    }


def verify_webhook_signature(payload: bytes, signature: str, secret: str) -> bool:
    """Webhook HMAC imzasını doğrula"""
    if not signature or not secret:
        return False
    
    try:
        expected = hmac.new(
            secret.encode(),
            payload,
            hashlib.sha256
        ).hexdigest()
        
        return hmac.compare_digest(expected, signature)
    except:
        return False


async def test_yemeksepeti_connection(restaurant_id: str) -> dict:
    """Yemeksepeti API bağlantısını test et"""
    restaurant = await db.restaurants.find_one(
        {"id": restaurant_id},
        {"_id": 0}
    )
    
    if not restaurant:
        return {"success": False, "error": "Restoran bulunamadı"}
    
    integration = restaurant.get("platform_integrations", {}).get("yemeksepeti", {})
    client_id = integration.get("client_id")
    client_secret = integration.get("client_secret")
    chain_id = integration.get("chain_id")
    
    if not client_id or not client_secret:
        return {"success": False, "error": "Yemeksepeti API bilgileri eksik (Client ID ve Client Secret gerekli)"}
    
    if not chain_id:
        return {"success": False, "error": "Chain ID eksik"}
    
    try:
        # Token almayı dene
        async with httpx.AsyncClient(timeout=15.0) as client:
            response = await client.post(
                YEMEKSEPETI_TOKEN_URL,
                data={
                    "grant_type": "client_credentials",
                    "client_id": client_id,
                    "client_secret": client_secret
                },
                headers={"Content-Type": "application/x-www-form-urlencoded"}
            )
            
            if response.status_code == 200:
                data = response.json()
                token = data.get("access_token")
                expires_in = data.get("expires_in", 7200)
                
                if token:
                    expires_at = (datetime.now(TURKEY_TZ) + timedelta(seconds=expires_in - 600)).isoformat()
                    
                    await db.restaurants.update_one(
                        {"id": restaurant_id},
                        {"$set": {
                            "platform_integrations.yemeksepeti.access_token": token,
                            "platform_integrations.yemeksepeti.token_expires": expires_at,
                            "platform_integrations.yemeksepeti.connected": True,
                            "platform_integrations.yemeksepeti.last_test": datetime.now(TURKEY_TZ).isoformat()
                        }}
                    )
                    
                    return {"success": True, "message": "Yemeksepeti bağlantısı başarılı"}
                else:
                    return {"success": False, "error": "Token alınamadı"}
            elif response.status_code == 401:
                await db.restaurants.update_one(
                    {"id": restaurant_id},
                    {"$set": {"platform_integrations.yemeksepeti.connected": False}}
                )
                return {"success": False, "error": "Client ID veya Client Secret geçersiz"}
            else:
                return {"success": False, "error": f"API hatası: {response.status_code}"}
                
    except httpx.TimeoutException:
        return {"success": False, "error": "Bağlantı zaman aşımı"}
    except Exception as e:
        logger.exception("Yemeksepeti bağlantı testi hatası")
        return {"success": False, "error": f"Bağlantı hatası: {str(e)}"}


def map_yemeksepeti_status(status: str) -> str:
    """Yemeksepeti status'unu ShiftJet durumuna çevir"""
    status_upper = (status or "").upper()
    
    status_map = {
        "RECEIVED": "preparing",
        "READY_FOR_PICKUP": "ready",
        "DISPATCHED": "on_the_way",
        "DELIVERED": "delivered",
        "CANCELLED": "cancelled"
    }
    
    return status_map.get(status_upper, "preparing")


def map_shiftjet_to_yemeksepeti_status(status: str, is_platform_delivery: bool = True) -> Optional[str]:
    """ShiftJet durumunu Yemeksepeti'ye çevir"""
    if is_platform_delivery:
        # Platform teslimatı - Yemeksepeti kuryesi
        status_map = {
            "ready": "READY_FOR_PICKUP",
            "cancelled": "CANCELLED"
        }
    else:
        # Vendor teslimatı - Restoran kuryesi
        status_map = {
            "ready": "READY_FOR_PICKUP",
            "on_the_way": "DISPATCHED",
            "cancelled": "CANCELLED"
        }
    
    return status_map.get(status)


def map_yemeksepeti_payment(payment_info: dict) -> str:
    """Yemeksepeti ödeme bilgisini ShiftJet'e çevir"""
    if not payment_info:
        return "online"
    
    payment_type = (payment_info.get("type") or payment_info.get("payment_type") or "").lower()
    
    if "cash" in payment_type:
        return "cash"
    elif "card" in payment_type:
        if "online" in payment_type:
            return "online"
        return "card"
    
    return "online"


async def convert_yemeksepeti_order_to_shiftjet(webhook_data: dict, restaurant: dict) -> dict:
    """Yemeksepeti webhook verisini ShiftJet sipariş formatına çevir"""
    
    order_id = webhook_data.get("order_id", "")
    order_number = webhook_data.get("order_number") or webhook_data.get("display_id") or order_id[:8]
    
    # Müşteri bilgileri
    customer = webhook_data.get("customer", {})
    customer_name = customer.get("name", "Müşteri")
    customer_phone = customer.get("phone", customer.get("phone_number", ""))
    
    # Adres bilgileri
    address = webhook_data.get("delivery_address", {}) or webhook_data.get("address", {})
    address_text = address.get("full_address") or address.get("address", "")
    if not address_text:
        address_parts = []
        if address.get("street"):
            address_parts.append(address["street"])
        if address.get("building"):
            address_parts.append(f"No: {address['building']}")
        if address.get("floor"):
            address_parts.append(f"Kat: {address['floor']}")
        if address.get("apartment"):
            address_parts.append(f"Daire: {address['apartment']}")
        if address.get("district"):
            address_parts.append(address["district"])
        address_text = ", ".join(filter(None, address_parts)) or "Adres belirtilmemiş"
    
    # Koordinatlar
    location = address.get("location", {}) or address.get("coordinates", {})
    delivery_lat = location.get("lat") or location.get("latitude")
    delivery_lng = location.get("lng") or location.get("lon") or location.get("longitude")
    
    # Ürünleri dönüştür
    items = []
    products = webhook_data.get("items", []) or webhook_data.get("products", [])
    
    for product in products:
        item_name = product.get("name", "Ürün")
        quantity = int(product.get("quantity", 1))
        
        # Fiyat hesapla
        pricing = product.get("pricing", {})
        if pricing:
            price = float(pricing.get("unit_price", pricing.get("total_price", 0)))
        else:
            price = float(product.get("price", product.get("unit_price", 0)))
        
        # Seçenekleri ekle (modifier'lar)
        modifiers = product.get("modifiers", []) or product.get("options", [])
        modifier_names = []
        for mod in modifiers:
            mod_name = mod.get("name", "")
            if mod_name:
                modifier_names.append(mod_name)
        
        if modifier_names:
            item_name += f" ({', '.join(modifier_names)})"
        
        items.append({
            "name": item_name,
            "quantity": quantity,
            "price": price,
            "sku": product.get("sku", ""),
            "notes": product.get("note", product.get("comment", ""))
        })
    
    # Toplam tutar
    total_amount = float(webhook_data.get("total_price", webhook_data.get("total", 0)))
    
    # Ödeme yöntemi
    payment_info = webhook_data.get("payment", {}) or webhook_data.get("payment_info", {})
    payment = map_yemeksepeti_payment(payment_info)
    
    # Sipariş notları
    notes_parts = []
    if webhook_data.get("customer_note") or webhook_data.get("note"):
        notes_parts.append(f"CUSTOMER:{webhook_data.get('customer_note') or webhook_data.get('note')}")
    if address.get("description") or address.get("instructions"):
        notes_parts.append(f"ADDRESS:{address.get('description') or address.get('instructions')}")
    order_notes = "|".join(notes_parts)
    
    # Teslimat tipi
    delivery_type = webhook_data.get("delivery_type", "PLATFORM")
    is_platform_delivery = delivery_type.upper() != "VENDOR"
    
    # Oluşturulma zamanı - Türkiye timezone'u ile
    raw_created_at = webhook_data.get("created_at") or webhook_data.get("order_time")
    created_at = ensure_turkey_timezone(raw_created_at) if raw_created_at else get_turkey_now()
    
    # Vendor/Store bilgisi
    vendor_id = webhook_data.get("vendor_id") or webhook_data.get("store_id")
    
    return {
        "id": str(uuid.uuid4()),
        "order_number": f"YS-{order_number}",
        "yemeksepeti_order_id": order_id,
        "yemeksepeti_display_id": webhook_data.get("display_id"),
        "external_app_name": "Yemeksepeti",
        "company_id": restaurant.get("company_id"),
        "restaurant_id": restaurant.get("id"),
        "restaurant_name": restaurant.get("name"),
        "restaurant_phone": restaurant.get("phone"),
        "restaurant_location": {
            "latitude": restaurant.get("latitude"),
            "longitude": restaurant.get("longitude")
        },
        "customer_name": customer_name,
        "customer_phone": customer_phone,
        "delivery_address": address_text,
        "delivery_location": {
            "latitude": delivery_lat,
            "longitude": delivery_lng
        },
        "items": items,
        "total_amount": total_amount,
        "payment_method": payment,
        "status": map_yemeksepeti_status(webhook_data.get("status", "RECEIVED")),
        "notes": order_notes,
        "source": "yemeksepeti",
        "created_at": created_at,
        "updated_at": get_turkey_now(),
        "courier_id": None,
        "courier_name": None,
        "yemeksepeti_raw": {
            "orderId": order_id,
            "status": webhook_data.get("status"),
            "vendorId": vendor_id,
            "deliveryType": delivery_type,
            "isPlatformDelivery": is_platform_delivery,
            "paymentType": payment_info.get("type") if payment_info else None
        }
    }


async def process_yemeksepeti_webhook(webhook_data: dict, vendor_id: str) -> dict:
    """Yemeksepeti webhook verisini işle"""
    
    # Vendor ID ile restoranı bul
    restaurant = await db.restaurants.find_one(
        {"platform_integrations.yemeksepeti.vendor_id": vendor_id},
        {"_id": 0}
    )
    
    if not restaurant:
        logger.warning(f"Yemeksepeti webhook: Restoran bulunamadı, vendor_id={vendor_id}")
        return {"success": False, "error": "Restoran bulunamadı"}
    
    order_id = webhook_data.get("order_id")
    status = webhook_data.get("status", "").upper()
    
    # Mevcut sipariş var mı kontrol et
    existing = await db.orders.find_one({"yemeksepeti_order_id": order_id})
    
    if status == "RECEIVED":
        # Yeni sipariş
        if existing:
            logger.info(f"Yemeksepeti sipariş zaten var: {order_id}")
            return {"success": True, "message": "Sipariş zaten mevcut", "skipped": True}
        
        # Yeni sipariş oluştur
        shiftjet_order = await convert_yemeksepeti_order_to_shiftjet(webhook_data, restaurant)
        
        # Hazırlama süresini hesapla
        try:
            from routers.orders import calculate_preparation_time_async
            prep_time = await calculate_preparation_time_async(restaurant["id"], shiftjet_order.get("items", []))
        except:
            prep_time = 20
        
        prep_end = datetime.now(TURKEY_TZ) + timedelta(minutes=prep_time)
        shiftjet_order["preparation_time"] = prep_time
        shiftjet_order["preparation_end_at"] = prep_end.isoformat()
        
        await insert_order(shiftjet_order)
        logger.info(f"Yemeksepeti yeni sipariş oluşturuldu: {order_id}")
        
        return {"success": True, "message": "Sipariş oluşturuldu", "order_id": shiftjet_order["id"]}
    
    elif status in ["READY_FOR_PICKUP", "DISPATCHED", "DELIVERED", "CANCELLED"]:
        # Durum güncellemesi
        if not existing:
            logger.warning(f"Yemeksepeti durum güncellemesi: Sipariş bulunamadı, order_id={order_id}")
            return {"success": False, "error": "Sipariş bulunamadı"}
        
        new_status = map_yemeksepeti_status(status)
        
        await db.orders.update_one(
            {"yemeksepeti_order_id": order_id},
            {"$set": {
                "status": new_status,
                "updated_at": datetime.now(TURKEY_TZ).isoformat(),
                "yemeksepeti_raw.status": status
            }}
        )
        
        logger.info(f"Yemeksepeti sipariş durumu güncellendi: {order_id} -> {status}")
        return {"success": True, "message": f"Durum güncellendi: {new_status}"}
    
    else:
        logger.warning(f"Yemeksepeti bilinmeyen durum: {status}")
        return {"success": False, "error": f"Bilinmeyen durum: {status}"}


# --- Yemeksepeti'ye durum güncelleme ---

async def update_yemeksepeti_order_status(restaurant_id: str, order_id: str, new_status: str) -> dict:
    """Yemeksepeti'de sipariş durumunu güncelle"""
    restaurant = await db.restaurants.find_one({"id": restaurant_id}, {"_id": 0})
    if not restaurant:
        return {"success": False, "error": "Restoran bulunamadı"}
    
    integration = restaurant.get("platform_integrations", {}).get("yemeksepeti", {})
    chain_id = integration.get("chain_id")
    
    if not chain_id:
        return {"success": False, "error": "Chain ID eksik"}
    
    order = await db.orders.find_one({"id": order_id})
    if not order:
        return {"success": False, "error": "Sipariş bulunamadı"}
    
    ys_order_id = order.get("yemeksepeti_order_id")
    if not ys_order_id:
        return {"success": False, "error": "Bu sipariş Yemeksepeti siparişi değil"}
    
    # Platform delivery kontrolü
    is_platform_delivery = order.get("yemeksepeti_raw", {}).get("isPlatformDelivery", True)
    
    # ShiftJet durumunu Yemeksepeti'ye çevir
    ys_status = map_shiftjet_to_yemeksepeti_status(new_status, is_platform_delivery)
    if not ys_status:
        # Bu durum Yemeksepeti'ye gönderilmez
        return {"success": True, "message": "Bu durum Yemeksepeti'ye gönderilmez", "skipped": True}
    
    headers = await get_yemeksepeti_headers(restaurant)
    if not headers:
        return {"success": False, "error": "Yemeksepeti token alınamadı"}
    
    try:
        # Sipariş güncelleme için item bilgileri gerekli
        items = []
        for item in order.get("items", []):
            item_data = {
                "sku": item.get("sku", ""),
                "pricing": {
                    "pricing_type": "UNIT",
                    "quantity": item.get("quantity", 1)
                },
                "status": "IN_CART"
            }
            items.append(item_data)
        
        body = {
            "order_id": ys_order_id,
            "items": items,
            "status": ys_status
        }
        
        # İptal için ek bilgi
        if ys_status == "CANCELLED":
            body["cancellation"] = {
                "reason": "TOO_BUSY"  # Default iptal nedeni
            }
        
        async with httpx.AsyncClient(timeout=15.0) as client:
            url = f"{YEMEKSEPETI_BASE_URL}/chains/{chain_id}/orders/{ys_order_id}"
            response = await client.put(url, headers=headers, json=body)
            
            if response.status_code == 200:
                logger.info(f"Yemeksepeti sipariş {ys_order_id} durumu güncellendi: {ys_status}")
                return {"success": True, "message": f"Durum güncellendi: {ys_status}"}
            else:
                error_detail = _extract_error(response)
                logger.warning(f"Yemeksepeti durum güncelleme hatası: {response.status_code} - {error_detail}")
                return {"success": False, "error": f"API hatası: {response.status_code} - {error_detail}"}
                
    except Exception as e:
        logger.exception("Yemeksepeti durum güncelleme hatası")
        return {"success": False, "error": str(e)}


async def cancel_yemeksepeti_order(restaurant_id: str, order_id: str, reason: str = "TOO_BUSY") -> dict:
    """Yemeksepeti siparişini iptal et
    
    İptal Nedenleri:
    - CLOSED: Restoran kapalı
    - ITEM_UNAVAILABLE: Ürün yok
    - TOO_BUSY: Çok yoğun
    """
    restaurant = await db.restaurants.find_one({"id": restaurant_id}, {"_id": 0})
    if not restaurant:
        return {"success": False, "error": "Restoran bulunamadı"}
    
    integration = restaurant.get("platform_integrations", {}).get("yemeksepeti", {})
    chain_id = integration.get("chain_id")
    
    if not chain_id:
        return {"success": False, "error": "Chain ID eksik"}
    
    order = await db.orders.find_one({"id": order_id})
    if not order:
        return {"success": False, "error": "Sipariş bulunamadı"}
    
    ys_order_id = order.get("yemeksepeti_order_id")
    if not ys_order_id:
        return {"success": False, "error": "Bu sipariş Yemeksepeti siparişi değil"}
    
    headers = await get_yemeksepeti_headers(restaurant)
    if not headers:
        return {"success": False, "error": "Yemeksepeti token alınamadı"}
    
    # Valid reasons
    valid_reasons = ["CLOSED", "ITEM_UNAVAILABLE", "TOO_BUSY"]
    if reason not in valid_reasons:
        reason = "TOO_BUSY"
    
    try:
        items = []
        for item in order.get("items", []):
            item_data = {
                "sku": item.get("sku", ""),
                "pricing": {
                    "pricing_type": "UNIT",
                    "quantity": item.get("quantity", 1)
                },
                "status": "NOT_FOUND"
            }
            items.append(item_data)
        
        body = {
            "order_id": ys_order_id,
            "items": items,
            "cancellation": {
                "reason": reason
            },
            "status": "CANCELLED"
        }
        
        async with httpx.AsyncClient(timeout=15.0) as client:
            url = f"{YEMEKSEPETI_BASE_URL}/chains/{chain_id}/orders/{ys_order_id}"
            response = await client.put(url, headers=headers, json=body)
            
            if response.status_code == 200:
                logger.info(f"Yemeksepeti sipariş {ys_order_id} iptal edildi")
                return {"success": True, "message": "Sipariş iptal edildi"}
            else:
                error_detail = _extract_error(response)
                logger.warning(f"Yemeksepeti iptal hatası: {response.status_code} - {error_detail}")
                return {"success": False, "error": f"API hatası: {response.status_code} - {error_detail}"}
                
    except Exception as e:
        logger.exception("Yemeksepeti iptal hatası")
        return {"success": False, "error": str(e)}


async def get_yemeksepeti_order(restaurant_id: str, order_id: str) -> dict:
    """Yemeksepeti'den sipariş detayı getir (son 60 gün)"""
    restaurant = await db.restaurants.find_one({"id": restaurant_id}, {"_id": 0})
    if not restaurant:
        return {"success": False, "error": "Restoran bulunamadı"}
    
    integration = restaurant.get("platform_integrations", {}).get("yemeksepeti", {})
    chain_id = integration.get("chain_id")
    
    if not chain_id:
        return {"success": False, "error": "Chain ID eksik"}
    
    headers = await get_yemeksepeti_headers(restaurant)
    if not headers:
        return {"success": False, "error": "Yemeksepeti token alınamadı"}
    
    try:
        async with httpx.AsyncClient(timeout=15.0) as client:
            url = f"{YEMEKSEPETI_BASE_URL}/chains/{chain_id}/orders/{order_id}"
            response = await client.get(url, headers=headers)
            
            if response.status_code == 200:
                return {"success": True, "order": response.json()}
            elif response.status_code == 404:
                return {"success": False, "error": "Sipariş bulunamadı (60 günden eski olabilir)"}
            else:
                error_detail = _extract_error(response)
                return {"success": False, "error": f"API hatası: {response.status_code} - {error_detail}"}
                
    except Exception as e:
        logger.exception("Yemeksepeti sipariş getirme hatası")
        return {"success": False, "error": str(e)}


def _extract_error(response) -> str:
    """API response'dan hata mesajını çıkar"""
    try:
        error_data = response.json()
        return error_data.get("message", error_data.get("error", response.text[:200]))
    except:
        return response.text[:200] if response.text else "Bilinmeyen hata"


def generate_webhook_url(restaurant_id: str, base_url: str) -> str:
    """Restoran için webhook URL'i oluştur"""
    return f"{base_url}/api/webhooks/yemeksepeti/{restaurant_id}"
