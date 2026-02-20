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


async def check_pos_status(app_secret: str, restaurant_secret: str) -> dict:
    """POS durumunu kontrol et"""
    try:
        async with httpx.AsyncClient(timeout=15.0) as client:
            response = await client.post(
                f"{GETIR_BASE_URL}/restaurants/pos-status",
                json={
                    "appSecretKey": app_secret,
                    "restaurantSecretKey": restaurant_secret
                }
            )
            
            if response.status_code == 200:
                data = response.json()
                # posStatus: 100 = Aktif, 200 = Pasif
                return {"success": True, "data": data, "is_active": data.get("posStatus") == 100}
            else:
                return {"success": False, "error": f"API hatası: {response.status_code}"}
    except Exception as e:
        return {"success": False, "error": str(e)}


async def activate_pos_status(app_secret: str, restaurant_secret: str) -> dict:
    """POS durumunu aktif et (100)"""
    try:
        async with httpx.AsyncClient(timeout=15.0) as client:
            response = await client.put(
                f"{GETIR_BASE_URL}/restaurants/pos-status",
                json={
                    "appSecretKey": app_secret,
                    "restaurantSecretKey": restaurant_secret,
                    "posStatus": 100  # Aktif
                }
            )
            
            if response.status_code == 200:
                return {"success": True, "message": "POS durumu aktif edildi"}
            else:
                error_text = response.text[:200] if response.text else "Bilinmeyen hata"
                return {"success": False, "error": f"API hatası: {response.status_code} - {error_text}"}
    except Exception as e:
        return {"success": False, "error": str(e)}


async def test_getir_connection(restaurant_id: str, activate_pos: bool = True) -> dict:
    """
    Getir API bağlantısını test et
    activate_pos: True ise POS durumunu otomatik aktif et
    """
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
            # 1. Login testi
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
                    
                    # 2. POS durumunu kontrol et ve aktif et
                    pos_status = await check_pos_status(app_secret, restaurant_secret)
                    pos_activated = False
                    
                    if pos_status.get("success") and not pos_status.get("is_active") and activate_pos:
                        # POS pasif, aktif et
                        activate_result = await activate_pos_status(app_secret, restaurant_secret)
                        pos_activated = activate_result.get("success", False)
                        logger.info(f"Getir POS aktivasyonu: {activate_result}")
                    elif pos_status.get("is_active"):
                        pos_activated = True
                    
                    await db.restaurants.update_one(
                        {"id": restaurant_id},
                        {"$set": {
                            "platform_integrations.getir.token": token,
                            "platform_integrations.getir.token_expires": expires_at,
                            "platform_integrations.getir.connected": True,
                            "platform_integrations.getir.pos_active": pos_activated,
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


def map_getir_status(status: Any) -> str:
    """Getir status'unu ShiftJet durumuna çevir"""
    # Eğer numerik status ise
    if isinstance(status, int):
        status_text = GETIR_ORDER_STATUSES.get(status, "pending")
        if status_text in ["pending", "scheduled_pending"]:
            return "pending"
        elif status_text in ["preparing", "scheduled_approved"]:
            return "preparing"
        elif status_text == "prepared":
            return "ready"
        elif status_text in ["handed_over", "on_the_way", "arrived"]:
            return "on_the_way"
        elif status_text == "delivered":
            return "delivered"
        elif status_text in ["cancelled", "cancelled_admin"]:
            return "cancelled"
        return "preparing"
    
    # String status
    status_lower = (str(status) or "").lower()
    
    status_map = {
        "pending": "pending",
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


def map_getir_payment(payment_method: Any) -> str:
    """Getir ödeme yöntemini ShiftJet'e çevir"""
    if not payment_method:
        return "online"
    
    # Numerik payment method ID
    if isinstance(payment_method, int):
        pm_info = GETIR_PAYMENT_METHODS.get(payment_method, {"type": "online"})
        return pm_info["type"]
    
    # Dict format
    if isinstance(payment_method, dict):
        pm_id = payment_method.get("id") or payment_method.get("paymentMethod")
        if isinstance(pm_id, int):
            pm_info = GETIR_PAYMENT_METHODS.get(pm_id, {"type": "online"})
            return pm_info["type"]
        
        # Text-based detection
        payment_type = (payment_method.get("type") or payment_method.get("name") or "").lower()
        
        if "cash" in payment_type or "nakit" in payment_type:
            return "cash"
        elif "card" in payment_type or "kart" in payment_type:
            if "online" in payment_type:
                return "online"
            return "card"
        elif "online" in payment_type:
            return "online"
        elif any(x in payment_type for x in ["sodexo", "ticket", "multinet", "setcard", "metropol", "paye"]):
            return "meal_card"
    
    return "online"


def get_payment_method_name(payment_method: Any) -> str:
    """Ödeme yöntemi adını döndür"""
    if isinstance(payment_method, int):
        pm_info = GETIR_PAYMENT_METHODS.get(payment_method, {})
        return pm_info.get("name", "Online Ödeme")
    
    if isinstance(payment_method, dict):
        pm_id = payment_method.get("id") or payment_method.get("paymentMethod")
        if isinstance(pm_id, int):
            pm_info = GETIR_PAYMENT_METHODS.get(pm_id, {})
            return pm_info.get("name", payment_method.get("name", "Online Ödeme"))
        return payment_method.get("name", "Online Ödeme")
    
    return "Online Ödeme"


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
    confirmation_id = getir_order.get("confirmationId", "")
    order_number = confirmation_id or getir_order.get("orderNumber") or order_id[:8]
    
    # Müşteri bilgileri
    client = getir_order.get("client", {})
    customer_name = client.get("name", "Müşteri")
    
    # Müşteri İletişim Telefonu (0850 ile başlayan maskelenmiş numara + pin kodu)
    # clientPhoneNumber: "+90 (850) 346-9382 / 288339" formatında geliyor
    # Tireleri kaldırıp temiz format yapalım
    raw_customer_phone = client.get("clientPhoneNumber", "")
    customer_phone = raw_customer_phone.replace("-", "") if raw_customer_phone else ""
    
    # Getir Destek Hattı (contactPhoneNumber) - bu müşteri telefonu DEĞİL!
    getir_support_phone = client.get("contactPhoneNumber", "")
    
    # Adres bilgileri - client.deliveryAddress içinde geliyor!
    client_delivery = client.get("deliveryAddress", {})
    address = getir_order.get("address", {}) or getir_order.get("clientAddress", {}) or client_delivery
    
    # Önce client.deliveryAddress'i dene
    address_text = client_delivery.get("address", "") or address.get("address", "")
    
    if not address_text:
        address_parts = []
        addr_source = client_delivery if client_delivery else address
        if addr_source.get("neighborhood"):
            address_parts.append(addr_source["neighborhood"])
        if addr_source.get("street"):
            address_parts.append(addr_source["street"])
        if addr_source.get("building"):
            address_parts.append(f"No: {addr_source['building']}")
        if addr_source.get("aptNo"):
            address_parts.append(f"Daire: {addr_source['aptNo']}")
        if addr_source.get("district"):
            address_parts.append(addr_source["district"])
        if addr_source.get("city"):
            address_parts.append(addr_source["city"])
        address_text = ", ".join(filter(None, address_parts)) or "Adres belirtilmemiş"
    
    # Adres tarifi
    address_description = client_delivery.get("description", "") or address.get("description", "")
    
    # Koordinatlar - client.location içinde geliyor!
    client_location = client.get("location", {})
    location = address.get("location", {}) or client_location
    delivery_lat = client_location.get("lat") or location.get("lat") or location.get("latitude")
    delivery_lng = client_location.get("lon") or location.get("lon") or location.get("lng") or location.get("longitude")
    
    # Ürünleri dönüştür
    items = []
    products = getir_order.get("products", [])
    
    for product in products:
        item_name = product.get("name", "Ürün")
        # name dict ise Türkçe adı al
        if isinstance(item_name, dict):
            item_name = item_name.get("tr", item_name.get("en", "Ürün"))
        
        quantity = int(product.get("count", product.get("quantity", 1)))
        price = float(product.get("price", product.get("priceWithOption", 0)))
        
        # Seçenekleri ekle
        options = product.get("optionCategories", [])
        option_names = []
        for opt_cat in options:
            for opt in opt_cat.get("options", []):
                opt_name = opt.get("name", "")
                # name dict ise Türkçe adı al
                if isinstance(opt_name, dict):
                    opt_name = opt_name.get("tr", opt_name.get("en", ""))
                if opt_name:
                    option_names.append(str(opt_name))
        
        if option_names:
            item_name += f" ({', '.join(option_names)})"
        
        items.append({
            "name": item_name,
            "quantity": quantity,
            "price": price / quantity if quantity > 0 else price,
            "notes": product.get("note", "")
        })
    
    # Toplam tutar
    total_price = float(getir_order.get("totalPrice", 0))
    total_discounted = float(getir_order.get("totalDiscountedPrice", 0))
    total_amount = total_discounted if total_discounted > 0 else total_price
    
    # Ödeme yöntemi
    payment_method = getir_order.get("paymentMethod")
    payment = map_getir_payment(payment_method)
    payment_method_name = get_payment_method_name(payment_method)
    
    # Teslimat tipi: 1 = Getir Getirsin, 2 = Restoran Getirsin
    delivery_type = getir_order.get("deliveryType", 1)
    is_getir_courier = delivery_type == 1
    delivery_type_text = "Getir Getirsin" if is_getir_courier else "Restoran Getirsin"
    
    # İleri tarihli sipariş
    is_scheduled = getir_order.get("isScheduled", False) or getir_order.get("isScheduledOrder", False)
    scheduled_date = getir_order.get("scheduledDate") or getir_order.get("scheduledTime")
    
    # Sipariş notları
    notes_parts = []
    if getir_order.get("clientNote"):
        notes_parts.append(f"MÜŞTERİ NOTU: {getir_order['clientNote']}")
    if address_description:
        notes_parts.append(f"ADRES TARIFI: {address_description}")
    if getir_support_phone:
        notes_parts.append(f"GETİR DESTEK: {getir_support_phone}")
    if is_scheduled and scheduled_date:
        notes_parts.append(f"İLERİ TARİHLİ: {scheduled_date}")
    notes_parts.append(f"TESLİMAT: {delivery_type_text}")
    order_notes = " | ".join(notes_parts)
    
    # Doğrulama kodu (sipariş fişi için)
    verification_code = getir_order.get("verificationCode") or confirmation_id[:4] if confirmation_id else ""
    
    # Oluşturulma zamanı
    created_at = getir_order.get("createdAt") or getir_order.get("checkoutDate") or datetime.now(timezone.utc).isoformat()
    
    # Status
    raw_status = getir_order.get("status", 400)
    mapped_status = map_getir_status(raw_status)
    
    return {
        "id": str(uuid.uuid4()),
        "order_number": f"GT-{order_number}",
        "getir_order_id": order_id,
        "getir_confirmation_id": confirmation_id,
        "verification_code": verification_code,
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
        "total_price": total_price,
        "total_discounted_price": total_discounted,
        "payment_method": payment,
        "payment_method_name": payment_method_name,
        "status": mapped_status,
        "notes": order_notes,
        "source": "getir",
        "created_at": created_at,
        "updated_at": datetime.now(timezone.utc).isoformat(),
        "courier_id": None,
        "courier_name": None,
        "getir_raw": {
            "orderId": order_id,
            "status": raw_status,
            "statusText": GETIR_ORDER_STATUSES.get(raw_status, "unknown"),
            "deliveryType": delivery_type,
            "deliveryTypeText": delivery_type_text,
            "isGetirCourier": is_getir_courier,
            "paymentMethodId": payment_method if isinstance(payment_method, int) else (payment_method.get("id") if payment_method else None),
            "paymentMethodName": payment_method_name,
            "isScheduled": is_scheduled,
            "scheduledDate": scheduled_date,
            "verificationCode": verification_code,
            "confirmationId": confirmation_id
        }
    }


# Getir zaman kuralları için bekleme süresi (saniye)
GETIR_STEP_WAIT_SECONDS = 70  # Getir 60 saniye istiyor, güvenlik payı ile 70


async def delayed_prepare(restaurant_id: str, getir_order_id: str, shiftjet_order_id: str):
    """
    70 saniye bekleyip prepare çağır (background task)
    """
    import asyncio
    
    logger.info(f"Getir delayed_prepare başlatıldı: {getir_order_id}, {GETIR_STEP_WAIT_SECONDS} saniye beklenecek")
    
    await asyncio.sleep(GETIR_STEP_WAIT_SECONDS)
    
    restaurant = await db.restaurants.find_one({"id": restaurant_id}, {"_id": 0})
    if not restaurant:
        logger.error(f"Getir delayed_prepare: Restoran bulunamadı {restaurant_id}")
        return
    
    headers = await get_getir_headers(restaurant)
    if not headers:
        logger.error(f"Getir delayed_prepare: Token alınamadı {restaurant_id}")
        return
    
    try:
        async with httpx.AsyncClient(timeout=15.0) as client:
            response = await client.post(
                f"{GETIR_BASE_URL}/food-orders/{getir_order_id}/prepare",
                headers=headers
            )
            
            if response.status_code == 200:
                logger.info(f"Getir delayed_prepare başarılı: {getir_order_id}")
                # Veritabanını güncelle - prepare status 500'dür, 700 DEĞİL!
                await db.orders.update_one(
                    {"id": shiftjet_order_id},
                    {"$set": {
                        "getir_prepared_at": datetime.now(timezone.utc).isoformat(),
                        "getir_raw.status": 500,
                        "status": "preparing"
                    }}
                )
            else:
                error = _extract_error(response)
                logger.warning(f"Getir delayed_prepare hatası: {getir_order_id} - {error}")
    except Exception as e:
        logger.exception(f"Getir delayed_prepare exception: {getir_order_id}")


async def delayed_deliver(restaurant_id: str, getir_order_id: str, shiftjet_order_id: str, wait_seconds: int):
    """
    Belirtilen süre bekleyip deliver çağır (background task)
    """
    import asyncio
    
    if wait_seconds > 0:
        logger.info(f"Getir delayed_deliver başlatıldı: {getir_order_id}, {wait_seconds} saniye beklenecek")
        await asyncio.sleep(wait_seconds)
    
    restaurant = await db.restaurants.find_one({"id": restaurant_id}, {"_id": 0})
    if not restaurant:
        logger.error(f"Getir delayed_deliver: Restoran bulunamadı {restaurant_id}")
        return
    
    headers = await get_getir_headers(restaurant)
    if not headers:
        logger.error(f"Getir delayed_deliver: Token alınamadı {restaurant_id}")
        return
    
    try:
        async with httpx.AsyncClient(timeout=15.0) as client:
            response = await client.post(
                f"{GETIR_BASE_URL}/food-orders/{getir_order_id}/deliver",
                headers=headers
            )
            
            if response.status_code == 200:
                logger.info(f"Getir delayed_deliver başarılı: {getir_order_id}")
                # Veritabanını güncelle
                await db.orders.update_one(
                    {"id": shiftjet_order_id},
                    {"$set": {
                        "getir_delivered_at": datetime.now(timezone.utc).isoformat(),
                        "getir_raw.status": 900
                    }}
                )
            else:
                error = _extract_error(response)
                logger.warning(f"Getir delayed_deliver hatası: {getir_order_id} - {error}")
    except Exception as e:
        logger.exception(f"Getir delayed_deliver exception: {getir_order_id}")


async def auto_verify_and_schedule_prepare(restaurant: dict, getir_order_id: str, getir_order: dict, shiftjet_order_id: str) -> dict:
    """
    Yeni sipariş için:
    1. Hemen verify çağır (30 saniye kuralı)
    2. 70 saniye sonra otomatik prepare çağır (background task)
    
    Returns:
        dict: {"success": True/False, "message": str, "error": str}
    """
    import asyncio
    
    headers = await get_getir_headers(restaurant)
    if not headers:
        return {"success": False, "error": "Getir token alınamadı"}
    
    restaurant_id = restaurant.get("id")
    
    # İleri tarihli sipariş mı?
    is_scheduled = getir_order.get("isScheduled", False) or getir_order.get("isScheduledOrder", False)
    verify_endpoint = "verify-scheduled" if is_scheduled else "verify"
    
    try:
        async with httpx.AsyncClient(timeout=15.0) as client:
            # 1. VERIFY (Onayla) - HEMEN
            verify_response = await client.post(
                f"{GETIR_BASE_URL}/food-orders/{getir_order_id}/{verify_endpoint}",
                headers=headers
            )
            
            if verify_response.status_code != 200:
                error_detail = _extract_error(verify_response)
                return {"success": False, "error": f"Verify hatası: {verify_response.status_code} - {error_detail}"}
            
            logger.info(f"Getir verify başarılı: {getir_order_id}")
            
            # Verify zamanını kaydet
            verify_time = datetime.now(timezone.utc)
            await db.orders.update_one(
                {"id": shiftjet_order_id},
                {"$set": {
                    "getir_verified_at": verify_time.isoformat(),
                    "getir_raw.status": 500
                }}
            )
            
            # 2. PREPARE - 70 saniye sonra (background task)
            asyncio.create_task(delayed_prepare(restaurant_id, getir_order_id, shiftjet_order_id))
            logger.info(f"Getir prepare {GETIR_STEP_WAIT_SECONDS} saniye sonra çağrılacak: {getir_order_id}")
            
            return {
                "success": True, 
                "message": f"Sipariş onaylandı, {GETIR_STEP_WAIT_SECONDS} saniye sonra hazırlanıyor durumuna geçecek",
                "verified_at": verify_time.isoformat()
            }
            
    except Exception as e:
        logger.exception(f"Getir auto verify exception: {getir_order_id}")
        return {"success": False, "error": str(e)}


async def trigger_getir_deliver(restaurant_id: str, order_id: str) -> dict:
    """
    Yola çıkar tıklandığında çağrılır.
    prepare'den 70 saniye geçmişse hemen deliver çağırır,
    geçmemişse kalan süre kadar bekler ve sonra çağırır.
    """
    import asyncio
    
    order = await db.orders.find_one({"id": order_id}, {"_id": 0})
    if not order:
        return {"success": False, "error": "Sipariş bulunamadı"}
    
    getir_order_id = order.get("getir_order_id")
    if not getir_order_id:
        return {"success": False, "error": "Bu sipariş Getir siparişi değil"}
    
    # prepare zamanını kontrol et
    prepared_at_str = order.get("getir_prepared_at")
    verified_at_str = order.get("getir_verified_at")
    
    now = datetime.now(timezone.utc)
    wait_seconds = 0
    
    if prepared_at_str:
        # prepare yapılmış, deliver için bekleme süresini hesapla
        prepared_at = datetime.fromisoformat(prepared_at_str.replace('Z', '+00:00'))
        elapsed = (now - prepared_at).total_seconds()
        wait_seconds = max(0, GETIR_STEP_WAIT_SECONDS - elapsed)
    elif verified_at_str:
        # prepare henüz yapılmamış, önce prepare bekle sonra deliver bekle
        verified_at = datetime.fromisoformat(verified_at_str.replace('Z', '+00:00'))
        elapsed_since_verify = (now - verified_at).total_seconds()
        # Toplam bekleme: prepare için kalan + deliver için 70 saniye
        wait_for_prepare = max(0, GETIR_STEP_WAIT_SECONDS - elapsed_since_verify)
        wait_seconds = wait_for_prepare + GETIR_STEP_WAIT_SECONDS
    else:
        # Hiç zaman kaydı yok, varsayılan bekleme
        wait_seconds = GETIR_STEP_WAIT_SECONDS
    
    if wait_seconds <= 0:
        # Hemen deliver çağır
        restaurant = await db.restaurants.find_one({"id": restaurant_id}, {"_id": 0})
        if not restaurant:
            return {"success": False, "error": "Restoran bulunamadı"}
        
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
                    await db.orders.update_one(
                        {"id": order_id},
                        {"$set": {
                            "getir_delivered_at": now.isoformat(),
                            "getir_raw.status": 900
                        }}
                    )
                    return {"success": True, "message": "Sipariş Getir'de teslim edildi olarak işaretlendi"}
                else:
                    error = _extract_error(response)
                    return {"success": False, "error": f"Deliver hatası: {error}"}
        except Exception as e:
            return {"success": False, "error": str(e)}
    else:
        # Background task ile bekle ve deliver çağır
        asyncio.create_task(delayed_deliver(restaurant_id, getir_order_id, order_id, int(wait_seconds)))
        
        return {
            "success": True, 
            "message": f"Sipariş {int(wait_seconds)} saniye sonra Getir'de yola çıkacak",
            "wait_seconds": int(wait_seconds),
            "scheduled": True
        }


# Eski fonksiyon - geriye uyumluluk için
async def auto_verify_and_prepare(restaurant: dict, getir_order_id: str, getir_order: dict) -> dict:
    """Eski fonksiyon - artık auto_verify_and_schedule_prepare kullanılıyor"""
    return await auto_verify_and_schedule_prepare(restaurant, getir_order_id, getir_order, "")


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
    auto_approved_count = 0
    
    # ShiftJet'te daha ileri durumlar
    shiftjet_priority_statuses = ["assigned", "confirmed", "on_the_way", "delivered", "cancelled"]
    
    for getir_order in result["orders"]:
        getir_order_id = getir_order.get("id")
        getir_status = getir_order.get("status", 400)
        
        # Bu sipariş zaten var mı kontrol et
        existing = await db.orders.find_one({"getir_order_id": getir_order_id})
        
        if existing:
            current_status = existing.get("status")
            
            # Eğer ShiftJet'te kurye atanmış veya ilerlemiş ise, durumu DEĞİŞTİRME
            if current_status in shiftjet_priority_statuses:
                skipped_count += 1
                continue
            
            # Getir'den SADECE İPTAL durumunu al, diğer durumları yoksay
            # Çünkü ShiftJet'te durum yönetimi manuel yapılıyor (Yola Çıkar, Teslim Et butonları)
            new_status = map_getir_status(getir_status)
            
            # Sadece iptal durumunu Getir'den al
            if new_status == "cancelled" and current_status != "cancelled":
                await db.orders.update_one(
                    {"_id": existing["_id"]},
                    {"$set": {
                        "status": "cancelled",
                        "updated_at": datetime.now(timezone.utc).isoformat(),
                        "getir_raw.status": getir_status,
                        "cancelled_by": "getir",
                        "cancelled_at": datetime.now(timezone.utc).isoformat()
                    }}
                )
                updated_count += 1
                logger.info(f"Getir sipariş iptal edildi (sync): {getir_order_id}")
            else:
                # Sadece getir_raw.status'u güncelle, ShiftJet status'unu değiştirme
                await db.orders.update_one(
                    {"_id": existing["_id"]},
                    {"$set": {
                        "getir_raw.status": getir_status,
                        "updated_at": datetime.now(timezone.utc).isoformat()
                    }}
                )
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
        
        shiftjet_order_id = shiftjet_order.get("id")
        
        # === OTOMATİK ONAYLA (verify) + 70sn SONRA HAZIRLA (prepare) ===
        # Getir kuralı: 30 saniye içinde onaylanmalı
        # verify → prepare: 70 saniye bekleme (background task)
        
        if getir_status == 400:  # Status 400 = Onay bekliyor
            try:
                verify_result = await auto_verify_and_schedule_prepare(restaurant, getir_order_id, getir_order, shiftjet_order_id)
                if verify_result.get("success"):
                    auto_approved_count += 1
                    # Yerel durumu güncelle
                    await db.orders.update_one(
                        {"id": shiftjet_order_id},
                        {"$set": {
                            "status": "preparing",
                            "auto_approved": True,
                            "auto_approved_at": datetime.now(timezone.utc).isoformat()
                        }}
                    )
                    logger.info(f"Getir sipariş onaylandı, prepare {GETIR_STEP_WAIT_SECONDS}sn sonra: {getir_order_id}")
                else:
                    logger.warning(f"Getir otomatik onay hatası: {getir_order_id} - {verify_result.get('error')}")
            except Exception as e:
                logger.exception(f"Getir otomatik onay exception: {getir_order_id}")
    
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


async def smart_advance_getir_order(restaurant_id: str, order_id: str, target_status: str, is_getir_courier: bool) -> dict:
    """
    Akıllı sipariş ilerletme - Getir'deki mevcut duruma göre uygun aksiyonu al
    
    Getir Status Kodları:
    - 400: Onay bekliyor
    - 500: Onaylandı (verify yapılmış)
    - 700: Yolda (prepare yapılmış)
    - 900: Teslim edildi
    
    Getir Kuralları:
    - verify → prepare: 1 dakika bekleme
    - prepare → deliver: 1 dakika bekleme
    
    Bu fonksiyon, hedef duruma ulaşmak için gerekli tüm adımları otomatik atar.
    """
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
            # 1. Önce Getir'deki mevcut durumu öğren
            active_response = await client.post(
                f"{GETIR_BASE_URL}/food-orders/active",
                headers=headers
            )
            
            current_getir_status = None
            if active_response.status_code == 200:
                orders = active_response.json()
                for o in orders:
                    if o.get("id") == getir_order_id:
                        current_getir_status = o.get("status")
                        break
            
            if current_getir_status is None:
                # Sipariş aktif değil, belki tamamlanmış
                return {"success": True, "message": "Sipariş Getir'de aktif değil (tamamlanmış olabilir)"}
            
            logger.info(f"Getir smart_advance: order={getir_order_id}, current={current_getir_status}, target={target_status}")
            
            # 2. Hedef duruma göre gerekli adımları at
            steps_taken = []
            
            if target_status == "on_the_way":
                # Yola çıkar: prepare veya handover/deliver gerekebilir
                
                if current_getir_status == 400:
                    # Henüz onaylanmamış - önce verify
                    verify_resp = await client.post(
                        f"{GETIR_BASE_URL}/food-orders/{getir_order_id}/verify",
                        headers=headers
                    )
                    if verify_resp.status_code == 200:
                        steps_taken.append("verify")
                        current_getir_status = 500
                    else:
                        return {"success": False, "error": f"Verify hatası: {_extract_error(verify_resp)}"}
                
                if current_getir_status == 500:
                    # Onaylanmış ama prepare yapılmamış
                    prepare_resp = await client.post(
                        f"{GETIR_BASE_URL}/food-orders/{getir_order_id}/prepare",
                        headers=headers
                    )
                    if prepare_resp.status_code == 200:
                        steps_taken.append("prepare")
                        current_getir_status = 700
                    else:
                        error = _extract_error(prepare_resp)
                        if "time limit" in error.lower():
                            return {"success": False, "error": "Getir 1 dakika bekleme kuralı - biraz bekleyip tekrar deneyin", "retry": True}
                        return {"success": False, "error": f"Prepare hatası: {error}"}
                
                if current_getir_status == 700:
                    # Zaten yolda durumunda
                    if is_getir_courier:
                        # Getir Getirsin: handover gerekebilir (opsiyonel)
                        steps_taken.append("already_on_the_way")
                    else:
                        # Restoran Getirsin: deliver çağrılabilir
                        # Ama önce 1 dakika geçmiş olmalı
                        deliver_resp = await client.post(
                            f"{GETIR_BASE_URL}/food-orders/{getir_order_id}/deliver",
                            headers=headers
                        )
                        if deliver_resp.status_code == 200:
                            steps_taken.append("deliver")
                        else:
                            error = _extract_error(deliver_resp)
                            if "time limit" in error.lower():
                                # Henüz bekleme süresi dolmamış, ama status zaten 700
                                steps_taken.append("waiting_for_deliver")
                                return {"success": True, "message": "Sipariş yolda, teslim için bekleniyor", "steps": steps_taken}
                            # Diğer hatalar için yine de başarılı say (status zaten 700)
                            steps_taken.append("deliver_skipped")
                
                return {"success": True, "message": f"Sipariş yola çıktı", "steps": steps_taken}
            
            elif target_status == "delivered":
                # Teslim et
                
                if current_getir_status < 700:
                    # Önce yola çıkar durumuna getir
                    on_the_way_result = await smart_advance_getir_order(restaurant_id, order_id, "on_the_way", is_getir_courier)
                    if not on_the_way_result.get("success"):
                        return on_the_way_result
                    steps_taken.extend(on_the_way_result.get("steps", []))
                
                # Şimdi deliver çağır
                if not is_getir_courier:
                    deliver_resp = await client.post(
                        f"{GETIR_BASE_URL}/food-orders/{getir_order_id}/deliver",
                        headers=headers
                    )
                    if deliver_resp.status_code == 200:
                        steps_taken.append("deliver")
                        return {"success": True, "message": "Sipariş teslim edildi", "steps": steps_taken}
                    else:
                        error = _extract_error(deliver_resp)
                        if "time limit" in error.lower():
                            return {"success": False, "error": "Getir 1 dakika bekleme kuralı - biraz bekleyip tekrar deneyin", "retry": True}
                        return {"success": False, "error": f"Deliver hatası: {error}"}
                else:
                    # Getir Getirsin - teslimi Getir kuryesi yapacak
                    return {"success": True, "message": "Getir Getirsin siparişi - teslim Getir kuryesi tarafından yapılacak", "steps": steps_taken}
            
            return {"success": True, "message": "İşlem tamamlandı", "steps": steps_taken}
            
    except Exception as e:
        logger.exception(f"Getir smart_advance exception: order={order_id}")
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


# --- Onay bekleyen siparişler (unapproved) ---

async def fetch_getir_unapproved_orders(restaurant_id: str) -> dict:
    """Getir'den onay bekleyen siparişleri çek"""
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
                f"{GETIR_BASE_URL}/food-orders/periodic/unapproved",
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
            else:
                return {"success": False, "error": f"API hatası: {response.status_code}", "orders": []}
                
    except Exception as e:
        logger.exception("Getir unapproved orders çekme hatası")
        return {"success": False, "error": str(e), "orders": []}


async def fetch_getir_cancelled_orders(restaurant_id: str) -> dict:
    """Getir'den iptal edilmiş siparişleri çek (son 24 saat)"""
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
                f"{GETIR_BASE_URL}/food-orders/periodic/cancelled",
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
            else:
                return {"success": False, "error": f"API hatası: {response.status_code}", "orders": []}
                
    except Exception as e:
        logger.exception("Getir cancelled orders çekme hatası")
        return {"success": False, "error": str(e), "orders": []}


# --- Webhook Handler ---

async def handle_getir_webhook_order(webhook_data: dict, x_api_key: str) -> dict:
    """
    Getir'den gelen yeni sipariş webhook'unu işle
    
    Getir, yeni sipariş geldiğinde bu webhook'u çağırır.
    Siparişi sisteme kaydeder ve otomatik onay gönderir (30 saniye kuralı).
    """
    # X-API-Key doğrulama
    # Bu key'i sistem ayarlarından veya restaurant bazlı ayarlardan alabiliriz
    
    getir_order_id = webhook_data.get("id")
    if not getir_order_id:
        logger.warning("Getir webhook: Sipariş ID eksik")
        return {"success": False, "error": "Sipariş ID eksik"}
    
    # Restaurant ID'yi bul (restaurantId veya restaurant.id)
    restaurant_getir_id = webhook_data.get("restaurant", {}).get("id") or webhook_data.get("restaurantId")
    
    # Getir restaurant ID'sine göre restoran bul
    restaurant = await db.restaurants.find_one(
        {
            "platform_integrations.getir.restaurant_id": restaurant_getir_id,
            "platform_integrations.getir.enabled": True
        },
        {"_id": 0}
    )
    
    if not restaurant:
        # Alternatif: restaurantSecretKey ile eşleşen restoran bul
        logger.warning(f"Getir webhook: Restoran bulunamadı - getir_restaurant_id={restaurant_getir_id}")
        return {"success": False, "error": "Restoran bulunamadı"}
    
    restaurant_id = restaurant.get("id")
    
    # Bu sipariş zaten var mı?
    existing = await db.orders.find_one({"getir_order_id": getir_order_id})
    if existing:
        logger.info(f"Getir webhook: Sipariş zaten mevcut - {getir_order_id}")
        return {"success": True, "message": "Sipariş zaten mevcut", "order_id": existing.get("id")}
    
    # Siparişi ShiftJet formatına dönüştür
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
    shiftjet_order["webhook_received_at"] = datetime.now(timezone.utc).isoformat()
    
    # DB'ye kaydet
    await db.orders.insert_one(shiftjet_order)
    
    # Otomatik onay gönder (30 saniye kuralı!)
    # İleri tarihli sipariş mi kontrol et
    is_scheduled = shiftjet_order.get("getir_raw", {}).get("isScheduled", False)
    raw_status = webhook_data.get("status", 400)
    
    if raw_status == 325:  # İleri tarihli, ön onay bekliyor
        verify_result = await verify_getir_order(restaurant_id, shiftjet_order["id"])
        logger.info(f"Getir webhook: İleri tarihli sipariş ön onay - {verify_result}")
    elif raw_status == 400:  # Normal sipariş, onay bekliyor
        verify_result = await verify_getir_order(restaurant_id, shiftjet_order["id"])
        logger.info(f"Getir webhook: Sipariş onaylandı - {verify_result}")
    
    logger.info(f"Getir webhook: Yeni sipariş kaydedildi - {shiftjet_order['id']}")
    
    return {
        "success": True,
        "message": "Sipariş alındı ve onaylandı",
        "order_id": shiftjet_order["id"],
        "order_number": shiftjet_order["order_number"]
    }


async def handle_getir_webhook_cancel(webhook_data: dict, x_api_key: str) -> dict:
    """
    Getir'den gelen sipariş iptal webhook'unu işle
    """
    getir_order_id = webhook_data.get("id")
    if not getir_order_id:
        return {"success": False, "error": "Sipariş ID eksik"}
    
    # Bu siparişi bul
    order = await db.orders.find_one({"getir_order_id": getir_order_id})
    
    if not order:
        logger.warning(f"Getir cancel webhook: Sipariş bulunamadı - {getir_order_id}")
        return {"success": False, "error": "Sipariş bulunamadı"}
    
    # Siparişi iptal et
    cancel_reason = webhook_data.get("cancelReason", {})
    cancel_note = cancel_reason.get("message") or webhook_data.get("cancelNote", "Getir tarafından iptal edildi")
    
    await db.orders.update_one(
        {"getir_order_id": getir_order_id},
        {"$set": {
            "status": "cancelled",
            "cancel_reason": cancel_note,
            "cancelled_at": datetime.now(timezone.utc).isoformat(),
            "cancelled_by": "getir",
            "updated_at": datetime.now(timezone.utc).isoformat()
        }}
    )
    
    logger.info(f"Getir cancel webhook: Sipariş iptal edildi - {getir_order_id}")
    
    return {
        "success": True,
        "message": "Sipariş iptal edildi",
        "order_id": order.get("id")
    }


# --- Kurye durumu yönetimi ---

async def update_getir_courier_status(restaurant_id: str, enable: bool, time_off_amount: int = None) -> dict:
    """Getir'de kurye hizmet durumunu güncelle"""
    restaurant = await db.restaurants.find_one({"id": restaurant_id}, {"_id": 0})
    if not restaurant:
        return {"success": False, "error": "Restoran bulunamadı"}
    
    headers = await get_getir_headers(restaurant)
    if not headers:
        return {"success": False, "error": "Getir token alınamadı"}
    
    try:
        async with httpx.AsyncClient(timeout=15.0) as client:
            if enable:
                response = await client.post(
                    f"{GETIR_BASE_URL}/restaurants/courier/enable",
                    headers=headers
                )
            else:
                body = {}
                if time_off_amount and time_off_amount in [15, 30, 45]:
                    body["timeOffAmount"] = time_off_amount
                
                response = await client.post(
                    f"{GETIR_BASE_URL}/restaurants/courier/disable",
                    headers=headers,
                    json=body if body else None
                )
            
            if response.status_code == 200:
                status_text = "aktif" if enable else "pasif"
                logger.info(f"Getir kurye durumu güncellendi: {status_text}")
                return {"success": True, "message": f"Kurye hizmeti {status_text} olarak güncellendi"}
            else:
                error_detail = _extract_error(response)
                return {"success": False, "error": f"API hatası: {response.status_code} - {error_detail}"}
                
    except Exception as e:
        logger.exception("Getir kurye durumu güncelleme hatası")
        return {"success": False, "error": str(e)}


# --- Restoran yoğunluk durumu ---

async def update_getir_busyness(restaurant_id: str, is_busy: bool, duration_minutes: int = None) -> dict:
    """
    Restoran yoğunluk durumunu güncelle
    duration_minutes: 15, 30 veya 45 dakika
    """
    restaurant = await db.restaurants.find_one({"id": restaurant_id}, {"_id": 0})
    if not restaurant:
        return {"success": False, "error": "Restoran bulunamadı"}
    
    headers = await get_getir_headers(restaurant)
    if not headers:
        return {"success": False, "error": "Getir token alınamadı"}
    
    try:
        body = {"isBusy": is_busy}
        if is_busy and duration_minutes and duration_minutes in [15, 30, 45]:
            body["busynessDifferenceDuration"] = duration_minutes
        
        async with httpx.AsyncClient(timeout=15.0) as client:
            response = await client.put(
                f"{GETIR_BASE_URL}/restaurants/delivery-duration/busyness",
                headers=headers,
                json=body
            )
            
            if response.status_code == 200:
                if is_busy:
                    return {"success": True, "message": f"Restoran yoğuna alındı (+{duration_minutes or 15} dk)"}
                else:
                    return {"success": True, "message": "Restoran yoğunluk durumu kaldırıldı"}
            else:
                error_detail = _extract_error(response)
                return {"success": False, "error": f"API hatası: {response.status_code} - {error_detail}"}
                
    except Exception as e:
        logger.exception("Getir yoğunluk güncelleme hatası")
        return {"success": False, "error": str(e)}


# --- Restoran bilgisi ve menü ---

async def get_getir_restaurant_info(restaurant_id: str) -> dict:
    """Getir'den restoran bilgilerini çek"""
    restaurant = await db.restaurants.find_one({"id": restaurant_id}, {"_id": 0})
    if not restaurant:
        return {"success": False, "error": "Restoran bulunamadı"}
    
    headers = await get_getir_headers(restaurant)
    if not headers:
        return {"success": False, "error": "Getir token alınamadı"}
    
    try:
        async with httpx.AsyncClient(timeout=15.0) as client:
            response = await client.get(
                f"{GETIR_BASE_URL}/restaurants",
                headers=headers
            )
            
            if response.status_code == 200:
                return {"success": True, "data": response.json()}
            else:
                return {"success": False, "error": f"API hatası: {response.status_code}"}
                
    except Exception as e:
        return {"success": False, "error": str(e)}


async def get_getir_restaurant_menu(restaurant_id: str) -> dict:
    """Getir'den restoran menüsünü çek"""
    restaurant = await db.restaurants.find_one({"id": restaurant_id}, {"_id": 0})
    if not restaurant:
        return {"success": False, "error": "Restoran bulunamadı"}
    
    headers = await get_getir_headers(restaurant)
    if not headers:
        return {"success": False, "error": "Getir token alınamadı"}
    
    try:
        async with httpx.AsyncClient(timeout=30.0) as client:
            response = await client.get(
                f"{GETIR_BASE_URL}/restaurants/menu",
                headers=headers
            )
            
            if response.status_code == 200:
                return {"success": True, "data": response.json()}
            else:
                return {"success": False, "error": f"API hatası: {response.status_code}"}
                
    except Exception as e:
        return {"success": False, "error": str(e)}


# --- İptal sebepleri ---

def get_cancel_reasons() -> List[dict]:
    """Getir iptal sebeplerini döndür"""
    return [
        {"id": k, "message": v} 
        for k, v in GETIR_CANCEL_REASONS.items()
    ]


# --- Menü İşlemleri ---

async def get_product_status(restaurant_id: str, product_id: str, is_chain: bool = False) -> dict:
    """Ürün durumunu sorgula"""
    restaurant = await db.restaurants.find_one({"id": restaurant_id}, {"_id": 0})
    if not restaurant:
        return {"success": False, "error": "Restoran bulunamadı"}
    
    headers = await get_getir_headers(restaurant)
    if not headers:
        return {"success": False, "error": "Getir token alınamadı"}
    
    try:
        endpoint = f"/products/chain-id/{product_id}/status" if is_chain else f"/products/{product_id}/status"
        async with httpx.AsyncClient(timeout=15.0) as client:
            response = await client.get(f"{GETIR_BASE_URL}{endpoint}", headers=headers)
            
            if response.status_code == 200:
                data = response.json()
                # Status: 100=Açık, 200=Kapalı
                return {
                    "success": True, 
                    "data": data,
                    "is_active": data.get("status") == 100
                }
            else:
                return {"success": False, "error": f"API hatası: {response.status_code}"}
    except Exception as e:
        return {"success": False, "error": str(e)}


async def update_product_status(restaurant_id: str, product_id: str, status: int, is_chain: bool = False) -> dict:
    """
    Ürün durumunu güncelle
    status: 100=Açık, 200=Kapalı
    """
    restaurant = await db.restaurants.find_one({"id": restaurant_id}, {"_id": 0})
    if not restaurant:
        return {"success": False, "error": "Restoran bulunamadı"}
    
    headers = await get_getir_headers(restaurant)
    if not headers:
        return {"success": False, "error": "Getir token alınamadı"}
    
    try:
        endpoint = f"/products/chain-id/{product_id}/status" if is_chain else f"/products/{product_id}/status"
        async with httpx.AsyncClient(timeout=15.0) as client:
            response = await client.put(
                f"{GETIR_BASE_URL}{endpoint}",
                headers=headers,
                json={"status": status}
            )
            
            if response.status_code == 200:
                status_text = "açık" if status == 100 else "kapalı"
                return {"success": True, "message": f"Ürün durumu {status_text} olarak güncellendi"}
            else:
                error_detail = _extract_error(response)
                return {"success": False, "error": f"API hatası: {response.status_code} - {error_detail}"}
    except Exception as e:
        return {"success": False, "error": str(e)}


async def activate_option(restaurant_id: str, product_id: str, is_chain: bool = False) -> dict:
    """Opsiyon ürünü aktif et"""
    restaurant = await db.restaurants.find_one({"id": restaurant_id}, {"_id": 0})
    if not restaurant:
        return {"success": False, "error": "Restoran bulunamadı"}
    
    headers = await get_getir_headers(restaurant)
    if not headers:
        return {"success": False, "error": "Getir token alınamadı"}
    
    try:
        if is_chain:
            endpoint = f"/products/chain-id/{product_id}/activate-as-option"
        else:
            endpoint = f"/products/{product_id}/activate-as-option"
        
        async with httpx.AsyncClient(timeout=15.0) as client:
            response = await client.post(f"{GETIR_BASE_URL}{endpoint}", headers=headers)
            
            if response.status_code == 200:
                return {"success": True, "message": "Opsiyon aktif edildi"}
            else:
                error_detail = _extract_error(response)
                return {"success": False, "error": f"API hatası: {response.status_code} - {error_detail}"}
    except Exception as e:
        return {"success": False, "error": str(e)}


async def inactivate_option(restaurant_id: str, product_id: str, is_chain: bool = False) -> dict:
    """Opsiyon ürünü pasif yap"""
    restaurant = await db.restaurants.find_one({"id": restaurant_id}, {"_id": 0})
    if not restaurant:
        return {"success": False, "error": "Restoran bulunamadı"}
    
    headers = await get_getir_headers(restaurant)
    if not headers:
        return {"success": False, "error": "Getir token alınamadı"}
    
    try:
        if is_chain:
            endpoint = f"/products/chain-id/{product_id}/inactivate-as-option"
        else:
            endpoint = f"/products/{product_id}/inactivate-as-option"
        
        async with httpx.AsyncClient(timeout=15.0) as client:
            response = await client.post(f"{GETIR_BASE_URL}{endpoint}", headers=headers)
            
            if response.status_code == 200:
                return {"success": True, "message": "Opsiyon pasif yapıldı"}
            else:
                error_detail = _extract_error(response)
                return {"success": False, "error": f"API hatası: {response.status_code} - {error_detail}"}
    except Exception as e:
        return {"success": False, "error": str(e)}


async def get_option_products(restaurant_id: str) -> dict:
    """Opsiyon ürünlerini getir"""
    restaurant = await db.restaurants.find_one({"id": restaurant_id}, {"_id": 0})
    if not restaurant:
        return {"success": False, "error": "Restoran bulunamadı"}
    
    headers = await get_getir_headers(restaurant)
    if not headers:
        return {"success": False, "error": "Getir token alınamadı"}
    
    try:
        async with httpx.AsyncClient(timeout=30.0) as client:
            response = await client.get(
                f"{GETIR_BASE_URL}/restaurants/option-products",
                headers=headers
            )
            
            if response.status_code == 200:
                return {"success": True, "data": response.json()}
            else:
                return {"success": False, "error": f"API hatası: {response.status_code}"}
    except Exception as e:
        return {"success": False, "error": str(e)}
