"""
Getir Yemek API Entegrasyon Servisi
- Token yönetimi (1 saat geçerli)
- Sipariş çekme (polling) ve webhook
- Sipariş durumu güncelleme (verify, prepare, handover, deliver)
- Restoran/kurye çalışma durumu yönetimi
- POS Status aktivasyonu

API Docs: https://developers.getir.com/food/documentation/introduction
Swagger: https://food-external-api-gateway.development.getirapi.com/documentation
"""
import httpx
import uuid
import logging
from datetime import datetime, timezone, timedelta
from typing import Optional, Dict, Any, List
from utils.database import db

logger = logging.getLogger(__name__)

# Environment URLs
GETIR_TEST_URL = "https://food-external-api-gateway.development.getirapi.com"
GETIR_PROD_URL = "https://food-external-api-gateway.getirapi.com"

# Varsayılan olarak test ortamı kullan
GETIR_BASE_URL = GETIR_TEST_URL

# Ödeme yöntemleri mapping'i (Getir API docs'tan)
GETIR_PAYMENT_METHODS = {
    1: {"name": "MasterPass", "type": "online"},
    2: {"name": "BKM", "type": "online"},
    3: {"name": "Kredi/Banka Kartı", "type": "card"},
    4: {"name": "Nakit", "type": "cash"},
    5: {"name": "Multinet Kart", "type": "meal_card"},
    6: {"name": "Sodexo Kart", "type": "meal_card"},
    7: {"name": "Sodexo Çeki", "type": "meal_card"},
    8: {"name": "Ticket Kart", "type": "meal_card"},
    9: {"name": "Ticket Çeki", "type": "meal_card"},
    10: {"name": "Setcard Kart", "type": "meal_card"},
    11: {"name": "Metropol Kart", "type": "meal_card"},
    12: {"name": "Paye Kart", "type": "meal_card"},
    15: {"name": "MobileExpress", "type": "online"},
    16: {"name": "Getir Finance", "type": "online"},
    17: {"name": "Sodexo Pass Mobil", "type": "meal_card"},
    19: {"name": "Sodexo Online", "type": "meal_card"},
    21: {"name": "Token Flex", "type": "meal_card"},
    22: {"name": "Ticket Online", "type": "meal_card"},
    24: {"name": "Multinet Online", "type": "meal_card"},
    26: {"name": "Online Ödeme", "type": "online"},
    27: {"name": "Multinet QR", "type": "meal_card"},
    28: {"name": "Ticket QR", "type": "meal_card"},
    29: {"name": "Setcard QR", "type": "meal_card"},
    30: {"name": "Metropol QR", "type": "meal_card"},
    31: {"name": "Paye QR", "type": "meal_card"},
    32: {"name": "TokenFlex QR", "type": "meal_card"},
}

# Sipariş durumları mapping'i
GETIR_ORDER_STATUSES = {
    325: "scheduled_pending",    # İleri tarihli sipariş, ön onay bekliyor
    350: "scheduled_approved",   # İleri tarihli sipariş, ön onay alındı
    400: "pending",              # Restoran onayı bekleniyor
    500: "preparing",            # Sipariş hazırlanıyor
    550: "prepared",             # Sipariş hazırlandı (Getir Getirsin)
    600: "handed_over",          # Sipariş kuryeye teslim edildi (Getir Getirsin)
    700: "on_the_way",           # Kurye yola çıktı
    800: "arrived",              # Kurye adrese ulaştı (Getir Getirsin)
    900: "delivered",            # Sipariş teslim edildi
    1500: "cancelled_admin",     # Admin tarafından iptal
    1600: "cancelled",           # Restoran iptal / otomatik iptal
}

# İptal sebepleri
GETIR_CANCEL_REASONS = {
    "5f05b1392765e85c5d0432d2": "Restoranda kurye yok, müsait değil",
    "5f05b13f2765e85c5d0432d3": "Restoran teknik problem yaşıyor",
    "5e1469f7916c7a55cfc2aede": "Müşteri adresi restoran servis alanı dışında",
    "5c5b49b068f6a45d427f0a8f": "Restoran yoğun",
    "5f0875342ce13c10cbf1c0e6": "Hava muhalefeti",
    "5c5b495768f6a45d427f0a8d": "Restoran kapalı",
    "5c5b49a768f6a45d427f0a8e": "Restoranda ürün eksik",
    "5f0875342ce13c10cbf1c0e7": "Kurye müşteri adresini bulamadı",
    "6088226bdaa34255a5693e23": "Sipariş minimum sepet tutarı altında",
}


async def get_getir_token(restaurant: dict) -> Optional[str]:
    """
    Getir API token'ı al veya mevcut geçerli token'ı döndür.
    Token 1 saat geçerli, 50 dakikada bir yenilenir.
    """
    integration = restaurant.get("platform_integrations", {}).get("getir", {})
    
    # Mevcut token kontrolü
    current_token = integration.get("token")
    token_expires = integration.get("token_expires")
    
    if current_token and token_expires:
        try:
            expires_dt = datetime.fromisoformat(token_expires.replace('Z', '+00:00'))
            # Token hala geçerli mi? (5 dakika tolerans)
            if expires_dt > datetime.now(timezone.utc) + timedelta(minutes=5):
                return current_token
        except:
            pass
    
    # Yeni token al
    app_secret = integration.get("app_secret_key")
    restaurant_secret = integration.get("restaurant_secret_key")
    
    if not app_secret or not restaurant_secret:
        logger.warning(f"Getir credentials eksik: restaurant={restaurant.get('id')}")
        return None
    
    try:
        async with httpx.AsyncClient(timeout=15.0) as client:
            response = await client.post(
                f"{GETIR_BASE_URL}/auth/login",
                json={
                    "appSecretKey": app_secret,
                    "restaurantSecretKey": restaurant_secret
                }
            )
            
            if response.status_code == 200:
                data = response.json()
                new_token = data.get("token")
                
                if new_token:
                    # Token'ı kaydet (50 dakika geçerli olarak işaretle)
                    expires_at = (datetime.now(timezone.utc) + timedelta(minutes=50)).isoformat()
                    
                    await db.restaurants.update_one(
                        {"id": restaurant.get("id")},
                        {"$set": {
                            "platform_integrations.getir.token": new_token,
                            "platform_integrations.getir.token_expires": expires_at,
                            "platform_integrations.getir.connected": True
                        }}
                    )
                    
                    return new_token
            else:
                logger.warning(f"Getir login hatası: {response.status_code} - {response.text[:200]}")
                await db.restaurants.update_one(
                    {"id": restaurant.get("id")},
                    {"$set": {"platform_integrations.getir.connected": False}}
                )
                
    except Exception as e:
        logger.exception(f"Getir token alma hatası: {str(e)}")
    
    return None


async def get_getir_headers(restaurant: dict) -> Optional[dict]:
    """Getir API için gerekli header'ları oluştur"""
    token = await get_getir_token(restaurant)
    
    if not token:
        return None
    
    return {
        "token": token,
        "Content-Type": "application/json"
    }


async def test_getir_connection(restaurant_id: str) -> dict:
    """Getir API bağlantısını test et"""
    restaurant = await db.restaurants.find_one(
        {"id": restaurant_id},
        {"_id": 0}
    )
    
    if not restaurant:
        return {"success": False, "error": "Restoran bulunamadı"}
    
    integration = restaurant.get("platform_integrations", {}).get("getir", {})
    app_secret = integration.get("app_secret_key")
    restaurant_secret = integration.get("restaurant_secret_key")
    
    if not app_secret or not restaurant_secret:
        return {"success": False, "error": "Getir API bilgileri eksik (App Secret Key ve Restaurant Secret Key gerekli)"}
    
    try:
        async with httpx.AsyncClient(timeout=15.0) as client:
            response = await client.post(
                f"{GETIR_BASE_URL}/auth/login",
                json={
                    "appSecretKey": app_secret,
                    "restaurantSecretKey": restaurant_secret
                }
            )
            
            if response.status_code == 200:
                data = response.json()
                token = data.get("token")
                
                if token:
                    # Token'ı kaydet
                    expires_at = (datetime.now(timezone.utc) + timedelta(minutes=50)).isoformat()
                    
                    await db.restaurants.update_one(
                        {"id": restaurant_id},
                        {"$set": {
                            "platform_integrations.getir.token": token,
                            "platform_integrations.getir.token_expires": expires_at,
                            "platform_integrations.getir.connected": True,
                            "platform_integrations.getir.last_test": datetime.now(timezone.utc).isoformat()
                        }}
                    )
                    
                    return {"success": True, "message": "Getir bağlantısı başarılı"}
                else:
                    return {"success": False, "error": "Token alınamadı"}
            elif response.status_code == 401:
                await db.restaurants.update_one(
                    {"id": restaurant_id},
                    {"$set": {"platform_integrations.getir.connected": False}}
                )
                return {"success": False, "error": "API anahtarları geçersiz"}
            else:
                return {"success": False, "error": f"API hatası: {response.status_code}"}
                
    except httpx.TimeoutException:
        return {"success": False, "error": "Bağlantı zaman aşımı"}
    except Exception as e:
        logger.exception("Getir bağlantı testi hatası")
        return {"success": False, "error": f"Bağlantı hatası: {str(e)}"}


def map_getir_status(status: str) -> str:
    """Getir status'unu ShiftJet durumuna çevir"""
    status_lower = (status or "").lower()
    
    status_map = {
        "pending": "preparing",
        "approved": "preparing",
        "verified": "preparing",
        "preparing": "preparing",
        "prepared": "ready",
        "handedover": "on_the_way",
        "ontheway": "on_the_way",
        "delivered": "delivered",
        "cancelled": "cancelled",
        "rejected": "cancelled"
    }
    
    return status_map.get(status_lower, "preparing")


def map_getir_payment(payment_method: dict) -> str:
    """Getir ödeme yöntemini ShiftJet'e çevir"""
    if not payment_method:
        return "online"
    
    payment_type = (payment_method.get("type") or payment_method.get("name") or "").lower()
    
    if "cash" in payment_type or "nakit" in payment_type:
        return "cash"
    elif "card" in payment_type or "kart" in payment_type:
        if "online" in payment_type:
            return "online"
        return "card"
    elif "online" in payment_type:
        return "online"
    
    return "online"


async def fetch_getir_active_orders(restaurant_id: str) -> dict:
    """Getir'den aktif siparişleri çek"""
    restaurant = await db.restaurants.find_one(
        {"id": restaurant_id},
        {"_id": 0}
    )
    
    if not restaurant:
        return {"success": False, "error": "Restoran bulunamadı", "orders": []}
    
    headers = await get_getir_headers(restaurant)
    if not headers:
        return {"success": False, "error": "Getir token alınamadı", "orders": []}
    
    try:
        async with httpx.AsyncClient(timeout=20.0) as client:
            response = await client.post(
                f"{GETIR_BASE_URL}/food-orders/active",
                headers=headers
            )
            
            if response.status_code == 200:
                data = response.json()
                orders = data if isinstance(data, list) else data.get("foodOrders", [])
                return {
                    "success": True,
                    "orders": orders,
                    "total": len(orders)
                }
            elif response.status_code == 401:
                # Token geçersiz, yenile
                await db.restaurants.update_one(
                    {"id": restaurant_id},
                    {"$set": {
                        "platform_integrations.getir.token": None,
                        "platform_integrations.getir.token_expires": None
                    }}
                )
                return {"success": False, "error": "Token geçersiz, yeniden bağlanın", "orders": []}
            else:
                return {"success": False, "error": f"API hatası: {response.status_code}", "orders": []}
                
    except Exception as e:
        logger.exception("Getir sipariş çekme hatası")
        return {"success": False, "error": str(e), "orders": []}


async def convert_getir_order_to_shiftjet(getir_order: dict, restaurant: dict) -> dict:
    """Getir sipariş formatını ShiftJet sipariş formatına çevir"""
    
    order_id = getir_order.get("id", "")
    order_number = getir_order.get("confirmationId") or getir_order.get("orderNumber") or order_id[:8]
    
    # Müşteri bilgileri
    client = getir_order.get("client", {})
    customer_name = client.get("name", "Müşteri")
    customer_phone = client.get("phoneNumber", client.get("contactPhoneNumber", ""))
    
    # Adres bilgileri
    address = getir_order.get("address", {}) or getir_order.get("clientAddress", {})
    address_text = address.get("address", "")
    if not address_text:
        address_parts = []
        if address.get("neighborhood"):
            address_parts.append(address["neighborhood"])
        if address.get("street"):
            address_parts.append(address["street"])
        if address.get("building"):
            address_parts.append(f"No: {address['building']}")
        if address.get("apartment"):
            address_parts.append(f"Daire: {address['apartment']}")
        if address.get("district"):
            address_parts.append(address["district"])
        address_text = ", ".join(filter(None, address_parts)) or "Adres belirtilmemiş"
    
    # Koordinatlar
    location = address.get("location", {})
    delivery_lat = location.get("lat") or location.get("latitude")
    delivery_lng = location.get("lon") or location.get("lng") or location.get("longitude")
    
    # Ürünleri dönüştür
    items = []
    products = getir_order.get("products", [])
    
    for product in products:
        item_name = product.get("name", "Ürün")
        quantity = int(product.get("count", product.get("quantity", 1)))
        price = float(product.get("price", product.get("priceWithOption", 0)))
        
        # Seçenekleri ekle
        options = product.get("optionCategories", [])
        option_names = []
        for opt_cat in options:
            for opt in opt_cat.get("options", []):
                opt_name = opt.get("name", "")
                if opt_name:
                    option_names.append(opt_name)
        
        if option_names:
            item_name += f" ({', '.join(option_names)})"
        
        items.append({
            "name": item_name,
            "quantity": quantity,
            "price": price / quantity if quantity > 0 else price,
            "notes": product.get("note", "")
        })
    
    # Toplam tutar
    total_amount = float(getir_order.get("totalPrice", getir_order.get("total", 0)))
    
    # Ödeme yöntemi
    payment_method = getir_order.get("paymentMethod", {})
    payment = map_getir_payment(payment_method)
    
    # Sipariş notları
    notes_parts = []
    if getir_order.get("clientNote"):
        notes_parts.append(f"CUSTOMER:{getir_order['clientNote']}")
    if address.get("description") or address.get("directions"):
        notes_parts.append(f"ADDRESS:{address.get('description') or address.get('directions')}")
    order_notes = "|".join(notes_parts)
    
    # Kurye tipi
    courier_type = getir_order.get("courierType", "")
    is_getir_courier = courier_type.lower() in ["getir", "getir_courier"]
    
    # Oluşturulma zamanı
    created_at = getir_order.get("createdAt") or getir_order.get("checkoutDate") or datetime.now(timezone.utc).isoformat()
    
    return {
        "id": str(uuid.uuid4()),
        "order_number": f"GT-{order_number}",
        "getir_order_id": order_id,
        "getir_confirmation_id": getir_order.get("confirmationId"),
        "external_app_name": "Getir Yemek",
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
        "status": map_getir_status(getir_order.get("status", "pending")),
        "notes": order_notes,
        "source": "getir",
        "created_at": created_at,
        "updated_at": datetime.now(timezone.utc).isoformat(),
        "courier_id": None,
        "courier_name": None,
        "getir_raw": {
            "orderId": order_id,
            "status": getir_order.get("status"),
            "courierType": courier_type,
            "isGetirCourier": is_getir_courier,
            "paymentMethodId": payment_method.get("id") if payment_method else None,
            "isScheduled": getir_order.get("isScheduledOrder", False),
            "scheduledTime": getir_order.get("scheduledTime")
        }
    }


async def sync_restaurant_getir_orders(restaurant_id: str) -> dict:
    """Restoran için Getir siparişlerini senkronize et"""
    restaurant = await db.restaurants.find_one(
        {"id": restaurant_id},
        {"_id": 0}
    )
    
    if not restaurant:
        return {"success": False, "error": "Restoran bulunamadı", "synced": 0}
    
    integration = restaurant.get("platform_integrations", {}).get("getir", {})
    if not integration.get("enabled") or not integration.get("connected"):
        return {"success": False, "error": "Getir entegrasyonu aktif değil", "synced": 0}
    
    # Aktif siparişleri çek
    result = await fetch_getir_active_orders(restaurant_id)
    
    if not result["success"]:
        return {"success": False, "error": result["error"], "synced": 0}
    
    synced_count = 0
    skipped_count = 0
    updated_count = 0
    
    # ShiftJet'te daha ileri durumlar
    shiftjet_priority_statuses = ["assigned", "confirmed", "on_the_way", "delivered", "cancelled"]
    
    for getir_order in result["orders"]:
        getir_order_id = getir_order.get("id")
        
        # Bu sipariş zaten var mı kontrol et
        existing = await db.orders.find_one({"getir_order_id": getir_order_id})
        
        if existing:
            current_status = existing.get("status")
            
            # Eğer ShiftJet'te kurye atanmış veya ilerlemiş ise, durumu DEĞİŞTİRME
            if current_status in shiftjet_priority_statuses:
                skipped_count += 1
                continue
            
            # Getir'den durum güncellemesi varsa uygula
            new_status = map_getir_status(getir_order.get("status", "pending"))
            if current_status != new_status:
                await db.orders.update_one(
                    {"_id": existing["_id"]},
                    {"$set": {
                        "status": new_status,
                        "updated_at": datetime.now(timezone.utc).isoformat(),
                        "getir_raw.status": getir_order.get("status")
                    }}
                )
                updated_count += 1
            else:
                skipped_count += 1
            continue
        
        # Yeni sipariş - dönüştür ve kaydet
        shiftjet_order = await convert_getir_order_to_shiftjet(getir_order, restaurant)
        
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
        synced_count += 1
    
    # Son senkronizasyon zamanını güncelle
    await db.restaurants.update_one(
        {"id": restaurant_id},
        {"$set": {"platform_integrations.getir.last_sync": datetime.now(timezone.utc).isoformat()}}
    )
    
    return {
        "success": True,
        "synced": synced_count,
        "updated": updated_count,
        "skipped": skipped_count,
        "total": len(result["orders"])
    }


# --- Getir'e durum güncelleme ---

async def verify_getir_order(restaurant_id: str, order_id: str) -> dict:
    """Getir siparişini onayla (verify)"""
    restaurant = await db.restaurants.find_one({"id": restaurant_id}, {"_id": 0})
    if not restaurant:
        return {"success": False, "error": "Restoran bulunamadı"}
    
    order = await db.orders.find_one({"id": order_id})
    if not order:
        return {"success": False, "error": "Sipariş bulunamadı"}
    
    getir_order_id = order.get("getir_order_id")
    if not getir_order_id:
        return {"success": False, "error": "Bu sipariş Getir siparişi değil"}
    
    headers = await get_getir_headers(restaurant)
    if not headers:
        return {"success": False, "error": "Getir token alınamadı"}
    
    # Scheduled order kontrolü
    is_scheduled = order.get("getir_raw", {}).get("isScheduled", False)
    endpoint = "verify-scheduled" if is_scheduled else "verify"
    
    try:
        async with httpx.AsyncClient(timeout=15.0) as client:
            response = await client.post(
                f"{GETIR_BASE_URL}/food-orders/{getir_order_id}/{endpoint}",
                headers=headers
            )
            
            if response.status_code == 200:
                logger.info(f"Getir sipariş {getir_order_id} onaylandı")
                return {"success": True, "message": "Sipariş onaylandı"}
            else:
                error_detail = _extract_error(response)
                logger.warning(f"Getir onay hatası: {response.status_code} - {error_detail}")
                return {"success": False, "error": f"API hatası: {response.status_code} - {error_detail}"}
                
    except Exception as e:
        logger.exception("Getir onay hatası")
        return {"success": False, "error": str(e)}


async def prepare_getir_order(restaurant_id: str, order_id: str) -> dict:
    """Getir siparişini hazırlanıyor olarak işaretle"""
    restaurant = await db.restaurants.find_one({"id": restaurant_id}, {"_id": 0})
    if not restaurant:
        return {"success": False, "error": "Restoran bulunamadı"}
    
    order = await db.orders.find_one({"id": order_id})
    if not order:
        return {"success": False, "error": "Sipariş bulunamadı"}
    
    getir_order_id = order.get("getir_order_id")
    if not getir_order_id:
        return {"success": False, "error": "Bu sipariş Getir siparişi değil"}
    
    headers = await get_getir_headers(restaurant)
    if not headers:
        return {"success": False, "error": "Getir token alınamadı"}
    
    try:
        async with httpx.AsyncClient(timeout=15.0) as client:
            response = await client.post(
                f"{GETIR_BASE_URL}/food-orders/{getir_order_id}/prepare",
                headers=headers
            )
            
            if response.status_code == 200:
                logger.info(f"Getir sipariş {getir_order_id} hazırlanıyor")
                return {"success": True, "message": "Sipariş hazırlanıyor olarak işaretlendi"}
            else:
                error_detail = _extract_error(response)
                return {"success": False, "error": f"API hatası: {response.status_code} - {error_detail}"}
                
    except Exception as e:
        logger.exception("Getir prepare hatası")
        return {"success": False, "error": str(e)}


async def handover_getir_order(restaurant_id: str, order_id: str) -> dict:
    """Getir siparişini kuryeye teslim et (handover)"""
    restaurant = await db.restaurants.find_one({"id": restaurant_id}, {"_id": 0})
    if not restaurant:
        return {"success": False, "error": "Restoran bulunamadı"}
    
    order = await db.orders.find_one({"id": order_id})
    if not order:
        return {"success": False, "error": "Sipariş bulunamadı"}
    
    getir_order_id = order.get("getir_order_id")
    if not getir_order_id:
        return {"success": False, "error": "Bu sipariş Getir siparişi değil"}
    
    # Getir kuryesi kontrolü - Getir kuryesi varsa handover zaten otomatik
    is_getir_courier = order.get("getir_raw", {}).get("isGetirCourier", False)
    
    headers = await get_getir_headers(restaurant)
    if not headers:
        return {"success": False, "error": "Getir token alınamadı"}
    
    try:
        async with httpx.AsyncClient(timeout=15.0) as client:
            response = await client.post(
                f"{GETIR_BASE_URL}/food-orders/{getir_order_id}/handover",
                headers=headers
            )
            
            if response.status_code == 200:
                logger.info(f"Getir sipariş {getir_order_id} kuryeye teslim edildi")
                return {"success": True, "message": "Sipariş kuryeye teslim edildi"}
            else:
                error_detail = _extract_error(response)
                return {"success": False, "error": f"API hatası: {response.status_code} - {error_detail}"}
                
    except Exception as e:
        logger.exception("Getir handover hatası")
        return {"success": False, "error": str(e)}


async def deliver_getir_order(restaurant_id: str, order_id: str) -> dict:
    """Getir siparişini teslim edildi olarak işaretle"""
    restaurant = await db.restaurants.find_one({"id": restaurant_id}, {"_id": 0})
    if not restaurant:
        return {"success": False, "error": "Restoran bulunamadı"}
    
    order = await db.orders.find_one({"id": order_id})
    if not order:
        return {"success": False, "error": "Sipariş bulunamadı"}
    
    getir_order_id = order.get("getir_order_id")
    if not getir_order_id:
        return {"success": False, "error": "Bu sipariş Getir siparişi değil"}
    
    # Getir kuryesi kontrolü
    is_getir_courier = order.get("getir_raw", {}).get("isGetirCourier", False)
    if is_getir_courier:
        return {"success": False, "error": "Getir kuryesi ile çalışan siparişlerde bu işlem yapılamaz"}
    
    headers = await get_getir_headers(restaurant)
    if not headers:
        return {"success": False, "error": "Getir token alınamadı"}
    
    try:
        async with httpx.AsyncClient(timeout=15.0) as client:
            response = await client.post(
                f"{GETIR_BASE_URL}/food-orders/{getir_order_id}/deliver",
                headers=headers
            )
            
            if response.status_code == 200:
                logger.info(f"Getir sipariş {getir_order_id} teslim edildi")
                return {"success": True, "message": "Sipariş teslim edildi"}
            else:
                error_detail = _extract_error(response)
                return {"success": False, "error": f"API hatası: {response.status_code} - {error_detail}"}
                
    except Exception as e:
        logger.exception("Getir deliver hatası")
        return {"success": False, "error": str(e)}


async def cancel_getir_order(restaurant_id: str, order_id: str, cancel_reason_id: str = None, cancel_note: str = None) -> dict:
    """Getir siparişini iptal et"""
    restaurant = await db.restaurants.find_one({"id": restaurant_id}, {"_id": 0})
    if not restaurant:
        return {"success": False, "error": "Restoran bulunamadı"}
    
    order = await db.orders.find_one({"id": order_id})
    if not order:
        return {"success": False, "error": "Sipariş bulunamadı"}
    
    getir_order_id = order.get("getir_order_id")
    if not getir_order_id:
        return {"success": False, "error": "Bu sipariş Getir siparişi değil"}
    
    headers = await get_getir_headers(restaurant)
    if not headers:
        return {"success": False, "error": "Getir token alınamadı"}
    
    try:
        body = {}
        if cancel_reason_id:
            body["cancelReasonId"] = cancel_reason_id
        if cancel_note:
            body["cancelNote"] = cancel_note
        
        async with httpx.AsyncClient(timeout=15.0) as client:
            response = await client.post(
                f"{GETIR_BASE_URL}/food-orders/{getir_order_id}/cancel",
                headers=headers,
                json=body if body else None
            )
            
            if response.status_code == 200:
                logger.info(f"Getir sipariş {getir_order_id} iptal edildi")
                return {"success": True, "message": "Sipariş iptal edildi"}
            else:
                error_detail = _extract_error(response)
                return {"success": False, "error": f"API hatası: {response.status_code} - {error_detail}"}
                
    except Exception as e:
        logger.exception("Getir cancel hatası")
        return {"success": False, "error": str(e)}


async def update_getir_restaurant_status(restaurant_id: str, is_open: bool, time_off_amount: int = None) -> dict:
    """Getir'de restoran çalışma durumunu güncelle"""
    restaurant = await db.restaurants.find_one({"id": restaurant_id}, {"_id": 0})
    if not restaurant:
        return {"success": False, "error": "Restoran bulunamadı"}
    
    headers = await get_getir_headers(restaurant)
    if not headers:
        return {"success": False, "error": "Getir token alınamadı"}
    
    try:
        async with httpx.AsyncClient(timeout=15.0) as client:
            if is_open:
                response = await client.put(
                    f"{GETIR_BASE_URL}/restaurants/status/open",
                    headers=headers
                )
            else:
                body = {}
                if time_off_amount and time_off_amount in [15, 30, 45]:
                    body["timeOffAmount"] = time_off_amount
                
                response = await client.put(
                    f"{GETIR_BASE_URL}/restaurants/status/close",
                    headers=headers,
                    json=body if body else None
                )
            
            if response.status_code == 200:
                status_text = "açık" if is_open else "kapalı"
                logger.info(f"Getir restoran durumu güncellendi: {status_text}")
                
                await db.restaurants.update_one(
                    {"id": restaurant_id},
                    {"$set": {"platform_integrations.getir.is_open": is_open}}
                )
                
                return {"success": True, "message": f"Restoran durumu {status_text} olarak güncellendi"}
            else:
                error_detail = _extract_error(response)
                return {"success": False, "error": f"API hatası: {response.status_code} - {error_detail}"}
                
    except Exception as e:
        logger.exception("Getir restoran durumu güncelleme hatası")
        return {"success": False, "error": str(e)}


def _extract_error(response) -> str:
    """API response'dan hata mesajını çıkar"""
    try:
        error_data = response.json()
        return error_data.get("message", error_data.get("error", response.text[:200]))
    except:
        return response.text[:200] if response.text else "Bilinmeyen hata"


async def sync_all_company_getir_orders(company_id: str) -> dict:
    """Şirketteki tüm restoranların Getir siparişlerini senkronize et"""
    restaurants = await db.restaurants.find(
        {
            "company_id": company_id,
            "platform_integrations.getir.enabled": True,
            "platform_integrations.getir.connected": True,
            "is_archived": {"$ne": True}
        },
        {"_id": 0, "id": 1, "name": 1}
    ).to_list(100)
    
    total_synced = 0
    results = []
    
    for restaurant in restaurants:
        result = await sync_restaurant_getir_orders(restaurant["id"])
        total_synced += result.get("synced", 0)
        results.append({
            "restaurant": restaurant["name"],
            "synced": result.get("synced", 0),
            "updated": result.get("updated", 0),
            "error": result.get("error")
        })
    
    return {
        "success": True,
        "total_synced": total_synced,
        "restaurants": results
    }
