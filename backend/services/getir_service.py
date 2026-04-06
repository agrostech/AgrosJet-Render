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
from utils.helpers import ensure_turkey_timezone, get_turkey_now
from services.credit_service import insert_order

# Türkiye timezone (UTC+3)
TURKEY_TZ = timezone(timedelta(hours=3))

logger = logging.getLogger(__name__)

# Environment URLs
GETIR_TEST_URL = "https://food-external-api-gateway.development.getirapi.com"
GETIR_PROD_URL = "https://food-external-api-gateway.getirapi.com"

# Canlı ortam (production) kullan
GETIR_BASE_URL = GETIR_PROD_URL

# Global AgrosJet App Secret Key (Getir tarafından verilen)
GETIR_APP_SECRET = "cb8cb6f888eb4fd561d58ca6a1456f49544f1186"

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

# İptal sebepleri - Getir panelinde sadece bu 4 sebep kabul ediliyor
GETIR_CANCEL_REASONS = {
    "6088226bdaa34255a5693e23": "Sipariş minimum sepet tutarı altında",
    "5e1469f7916c7a55cfc2aede": "Müşteri adresi restoran servis alanı dışında",
    "5c5b49a768f6a45d427f0a8e": "Restoranda ürün eksik",
    "5f05b13f2765e85c5d0432d3": "Restoran teknik problem yaşıyor",
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
            if expires_dt > datetime.now(TURKEY_TZ) + timedelta(minutes=5):
                return current_token
        except:
            pass
    
    # Yeni token al
    app_secret = GETIR_APP_SECRET
    restaurant_secret = integration.get("restaurant_secret_key")
    
    if not restaurant_secret:
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
                    expires_at = (datetime.now(TURKEY_TZ) + timedelta(minutes=50)).isoformat()
                    
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
    app_secret = GETIR_APP_SECRET
    restaurant_secret = integration.get("restaurant_secret_key")
    
    if not restaurant_secret:
        return {"success": False, "error": "Getir API bilgileri eksik (Restaurant Secret Key gerekli)"}
    
    try:
        logger.info(f"Getir bağlantı testi başlıyor: restaurant={restaurant_id}, URL={GETIR_BASE_URL}")
        
        # 1. Önce POS durumunu kontrol et ve gerekirse aktif et (login'den önce yapılmalı!)
        pos_activated = False
        if activate_pos:
            pos_status = await check_pos_status(app_secret, restaurant_secret)
            logger.info(f"Getir POS status: {pos_status}")
            
            if pos_status.get("success") and not pos_status.get("is_active"):
                logger.info(f"Getir POS pasif, aktif ediliyor: restaurant={restaurant_id}")
                activate_result = await activate_pos_status(app_secret, restaurant_secret)
                pos_activated = activate_result.get("success", False)
                logger.info(f"Getir POS aktivasyonu: {activate_result}")
                if not pos_activated:
                    return {"success": False, "error": f"POS aktif edilemedi: {activate_result.get('error', 'Bilinmeyen hata')}"}
            elif pos_status.get("is_active"):
                pos_activated = True
                logger.info(f"Getir POS zaten aktif: restaurant={restaurant_id}")
        
        # 2. Login testi
        async with httpx.AsyncClient(timeout=15.0) as client:
            response = await client.post(
                f"{GETIR_BASE_URL}/auth/login",
                json={
                    "appSecretKey": app_secret,
                    "restaurantSecretKey": restaurant_secret
                }
            )
            
            logger.info(f"Getir login response: status={response.status_code}, body={response.text[:500]}")
            
            if response.status_code == 200:
                data = response.json()
                token = data.get("token")
                
                if token:
                    # Token'ı kaydet
                    expires_at = (datetime.now(TURKEY_TZ) + timedelta(minutes=50)).isoformat()
                    
                    await db.restaurants.update_one(
                        {"id": restaurant_id},
                        {"$set": {
                            "platform_integrations.getir.token": token,
                            "platform_integrations.getir.token_expires": expires_at,
                            "platform_integrations.getir.connected": True,
                            "platform_integrations.getir.pos_active": pos_activated,
                            "platform_integrations.getir.last_test": datetime.now(TURKEY_TZ).isoformat()
                        }}
                    )
                    
                    return {"success": True, "message": "Getir bağlantısı başarılı"}
                else:
                    logger.warning(f"Getir login token alınamadı: restaurant={restaurant_id}, response={data}")
                    return {"success": False, "error": "Token alınamadı"}
            elif response.status_code == 401:
                logger.warning(f"Getir login 401: restaurant={restaurant_id}, response={response.text[:300]}")
                await db.restaurants.update_one(
                    {"id": restaurant_id},
                    {"$set": {"platform_integrations.getir.connected": False}}
                )
                return {"success": False, "error": f"API anahtarları geçersiz (401): {response.text[:200]}"}
            else:
                logger.warning(f"Getir login hata: restaurant={restaurant_id}, status={response.status_code}, response={response.text[:300]}")
                return {"success": False, "error": f"API hatası ({response.status_code}): {response.text[:200]}"}
                
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


# --- Getir Order Conversion Helper Fonksiyonları ---

def _extract_customer_info(getir_order: dict) -> dict:
    """Getir siparişinden müşteri bilgilerini çıkar"""
    client = getir_order.get("client", {})
    raw_phone = client.get("clientPhoneNumber", "")
    
    # Getir telefon formatı: "+90 (850) 3469382 / 855662"
    # Hedef format: "08503469382,,855662"
    formatted_phone = ""
    if raw_phone:
        # "/" ile dahili kod ayrılmış mı kontrol et
        if "/" in raw_phone:
            parts = raw_phone.split("/")
            phone_part = parts[0].strip()
            extension_part = parts[1].strip() if len(parts) > 1 else ""
            
            # Telefon numarasını temizle: +90 (850) 3469382 -> 08503469382
            clean_phone = phone_part.replace("+90", "").replace("(", "").replace(")", "").replace(" ", "").replace("-", "")
            if not clean_phone.startswith("0"):
                clean_phone = "0" + clean_phone
            
            # Dahili kod varsa ekle
            if extension_part:
                formatted_phone = f"{clean_phone},,{extension_part}"
            else:
                formatted_phone = clean_phone
        else:
            # Normal telefon numarası
            formatted_phone = raw_phone.replace("-", "").replace(" ", "").replace("(", "").replace(")", "").replace("+90", "")
            if formatted_phone and not formatted_phone.startswith("0"):
                formatted_phone = "0" + formatted_phone
    
    return {
        "name": client.get("name", "Müşteri"),
        "phone": formatted_phone,
        "support_phone": client.get("contactPhoneNumber", "")
    }


def _extract_address_info(getir_order: dict) -> dict:
    """Getir siparişinden adres bilgilerini çıkar"""
    client = getir_order.get("client", {})
    client_delivery = client.get("deliveryAddress", {})
    address = getir_order.get("address", {}) or getir_order.get("clientAddress", {}) or client_delivery
    
    address_text = client_delivery.get("address", "") or address.get("address", "")
    
    if not address_text:
        addr_source = client_delivery if client_delivery else address
        parts = []
        for key in ["neighborhood", "street"]:
            if addr_source.get(key):
                parts.append(addr_source[key])
        if addr_source.get("building"):
            parts.append(f"No: {addr_source['building']}")
        if addr_source.get("aptNo"):
            parts.append(f"Daire: {addr_source['aptNo']}")
        for key in ["district", "city"]:
            if addr_source.get(key):
                parts.append(addr_source[key])
        address_text = ", ".join(filter(None, parts)) or "Adres belirtilmemiş"
    
    client_location = client.get("location", {})
    location = address.get("location", {}) or client_location
    
    return {
        "text": address_text,
        "description": client_delivery.get("description", "") or address.get("description", ""),
        "latitude": client_location.get("lat") or location.get("lat") or location.get("latitude"),
        "longitude": client_location.get("lon") or location.get("lon") or location.get("lng") or location.get("longitude")
    }


def _extract_items(getir_order: dict) -> list:
    """Getir siparişinden ürün listesini çıkar"""
    items = []
    for product in getir_order.get("products", []):
        item_name = product.get("name", "Ürün")
        if isinstance(item_name, dict):
            item_name = item_name.get("tr", item_name.get("en", "Ürün"))
        
        quantity = int(product.get("count", product.get("quantity", 1)))
        price = float(product.get("price", product.get("priceWithOption", 0)))
        
        option_names = []
        for opt_cat in product.get("optionCategories", []):
            for opt in opt_cat.get("options", []):
                opt_name = opt.get("name", "")
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
    return items


def _calculate_scheduled_preparation(scheduled_date: str) -> tuple:
    """İleri tarihli sipariş için hazırlama süresi hesapla"""
    if not scheduled_date:
        return None, None
    
    try:
        if isinstance(scheduled_date, str):
            clean_date = scheduled_date.replace('Z', '+00:00')
            if '+' not in clean_date and '-' not in clean_date[-6:]:
                clean_date = clean_date + '+03:00'
            
            try:
                scheduled_dt = datetime.fromisoformat(clean_date)
            except:
                from dateutil import parser
                scheduled_dt = parser.parse(scheduled_date)
            
            if scheduled_dt:
                now = datetime.now(TURKEY_TZ)
                if scheduled_dt.tzinfo is None:
                    import pytz
                    scheduled_dt = pytz.timezone('Europe/Istanbul').localize(scheduled_dt)
                
                diff_minutes = (scheduled_dt.astimezone(timezone.utc) - now).total_seconds() / 60
                prep_minutes = max(5, min(int(diff_minutes - 30), 120))
                
                logger.info(f"İleri tarihli sipariş: prep_time={prep_minutes}dk")
                return prep_minutes, (now + timedelta(minutes=prep_minutes)).isoformat()
    except Exception as e:
        logger.warning(f"İleri tarihli hazırlama süresi hesaplanamadı: {e}")
    
    return None, None


async def convert_getir_order_to_shiftjet(getir_order: dict, restaurant: dict) -> dict:
    """Getir sipariş formatını ShiftJet sipariş formatına çevir"""
    
    order_id = getir_order.get("id", "")
    confirmation_id = getir_order.get("confirmationId", "")
    order_number = confirmation_id or getir_order.get("orderNumber") or order_id[:8]
    
    # Helper fonksiyonları kullan
    customer = _extract_customer_info(getir_order)
    address = _extract_address_info(getir_order)
    items = _extract_items(getir_order)
    
    # Toplam tutar
    total_price = float(getir_order.get("totalPrice", 0))
    total_discounted = float(getir_order.get("totalDiscountedPrice", 0))
    total_amount = total_discounted if total_discounted > 0 else total_price
    
    # Ödeme yöntemi
    payment_method = getir_order.get("paymentMethod")
    payment = map_getir_payment(payment_method)
    payment_method_name = get_payment_method_name(payment_method)
    
    # Teslimat tipi
    delivery_type = getir_order.get("deliveryType", 1)
    is_getir_courier = delivery_type == 1
    delivery_type_text = "Getir Getirsin" if is_getir_courier else "Restoran Getirsin"
    
    # İleri tarihli sipariş
    is_scheduled = getir_order.get("isScheduled", False) or getir_order.get("isScheduledOrder", False)
    scheduled_date = getir_order.get("scheduledDate") or getir_order.get("scheduledTime")
    preparation_time, preparation_end_at = _calculate_scheduled_preparation(scheduled_date) if is_scheduled else (None, None)
    
    # Sipariş notları
    notes_parts = []
    if getir_order.get("clientNote"):
        notes_parts.append(f"MÜŞTERİ NOTU: {getir_order['clientNote']}")
    # Plastik çatal bıçak istemiyor mu?
    if getir_order.get("doNotSendCutlery") or getir_order.get("isEcoFriendly"):
        notes_parts.append("MÜŞTERİ NOTU: Lütfen plastik çatal, bıçak, peçete göndermeyin.")
    if address["description"]:
        notes_parts.append(f"ADRES TARIFI: {address['description']}")
    if customer["support_phone"]:
        notes_parts.append(f"GETİR DESTEK: {customer['support_phone']}")
    if is_scheduled and scheduled_date:
        notes_parts.append(f"İLERİ TARİHLİ: {scheduled_date}")
    notes_parts.append(f"TESLİMAT: {delivery_type_text}")
    
    # Diğer bilgiler
    verification_code = getir_order.get("verificationCode") or (confirmation_id[:4] if confirmation_id else "")
    raw_created_at = getir_order.get("createdAt") or getir_order.get("checkoutDate")
    created_at = ensure_turkey_timezone(raw_created_at) if raw_created_at else get_turkey_now()
    raw_status = getir_order.get("status", 400)
    
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
        "customer_name": customer["name"],
        "customer_phone": customer["phone"],
        "delivery_address": address["text"],
        "delivery_location": {
            "latitude": address["latitude"],
            "longitude": address["longitude"]
        },
        "items": items,
        "total_amount": total_amount,
        "total_price": total_price,
        "total_discounted_price": total_discounted,
        "payment_method": payment,
        "payment_method_name": payment_method_name,
        "status": "preparing",  # Getir siparişleri otomatik onaylandığı için direkt hazırlanıyor
        "notes": " | ".join(notes_parts),
        "source": "getir",
        "created_at": created_at,
        "updated_at": get_turkey_now(),
        "courier_id": None,
        "courier_name": None,
        "preparation_time": preparation_time,
        "preparation_end_at": preparation_end_at,
        "is_scheduled": is_scheduled,
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
            "confirmationId": confirmation_id,
            "doNotSendCutlery": getir_order.get("doNotSendCutlery", False),
            "clientNote": getir_order.get("clientNote", "")
        }
    }


# Getir zaman kuralları için bekleme süresi (saniye)
GETIR_STEP_WAIT_SECONDS = 70  # Getir 60 saniye istiyor, güvenlik payı ile 70


def _check_timing_wait(timestamp_str: str) -> tuple:
    """
    70 saniye kuralını kontrol et.
    Returns: (should_wait: bool, remaining_seconds: int)
    """
    if not timestamp_str:
        return False, 0
    
    try:
        timestamp = datetime.fromisoformat(timestamp_str.replace('Z', '+00:00'))
        elapsed = (datetime.now(TURKEY_TZ) - timestamp).total_seconds()
        remaining = int(GETIR_STEP_WAIT_SECONDS - elapsed)
        return remaining > 0, max(0, remaining)
    except:
        return False, 0


def _extract_error(response) -> str:
    """API hata mesajını çıkar"""
    try:
        data = response.json()
        return data.get("message") or data.get("error") or str(data)
    except:
        return response.text[:200] if response.text else f"HTTP {response.status_code}"


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
                        "getir_prepared_at": datetime.now(TURKEY_TZ).isoformat(),
                        "getir_raw.status": 500,
                        "status": "preparing"
                    }}
                )
            else:
                error = _extract_error(response)
                logger.warning(f"Getir delayed_prepare hatası: {getir_order_id} - {error}")
    except Exception:
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
                        "getir_delivered_at": datetime.now(TURKEY_TZ).isoformat(),
                        "getir_raw.status": 900
                    }}
                )
            else:
                error = _extract_error(response)
                logger.warning(f"Getir delayed_deliver hatası: {getir_order_id} - {error}")
    except Exception:
        logger.exception(f"Getir delayed_deliver exception: {getir_order_id}")


async def auto_verify_order(restaurant: dict, getir_order_id: str, getir_order: dict, shiftjet_order_id: str) -> dict:
    """
    Yeni sipariş için sadece VERIFY çağır.
    
    PREPARE kullanıcı "Yola Çıkar" butonuna bastığında gönderilecek!
    (70 saniye kuralına uyarak)
    
    Getir Akışı:
    - verify = sipariş onaylandı
    - prepare = sipariş yola çıktı (kullanıcı manuel tetikler)
    - deliver = sipariş teslim edildi (kullanıcı manuel tetikler)
    
    Returns:
        dict: {"success": True/False, "message": str, "error": str}
    """
    headers = await get_getir_headers(restaurant)
    if not headers:
        return {"success": False, "error": "Getir token alınamadı"}
    
    # İleri tarihli sipariş mı?
    is_scheduled = getir_order.get("isScheduled", False) or getir_order.get("isScheduledOrder", False)
    verify_endpoint = "verify-scheduled" if is_scheduled else "verify"
    
    try:
        async with httpx.AsyncClient(timeout=15.0) as client:
            # VERIFY (Onayla) - HEMEN
            verify_response = await client.post(
                f"{GETIR_BASE_URL}/food-orders/{getir_order_id}/{verify_endpoint}",
                headers=headers
            )
            
            if verify_response.status_code != 200:
                error_detail = _extract_error(verify_response)
                return {"success": False, "error": f"Verify hatası: {verify_response.status_code} - {error_detail}"}
            
            logger.info(f"Getir verify başarılı: {getir_order_id}")
            
            # Verify zamanını kaydet
            verify_time = datetime.now(TURKEY_TZ)
            await db.orders.update_one(
                {"id": shiftjet_order_id},
                {"$set": {
                    "getir_verified_at": verify_time.isoformat(),
                    "getir_raw.status": 500
                }}
            )
            
            # NOT: PREPARE artık burada schedule EDİLMİYOR!
            # Kullanıcı "Yola Çıkar" butonuna bastığında gönderilecek
            
            return {
                "success": True, 
                "message": "Sipariş onaylandı (verify). Yola çıkarmak için 'Yola Çıkar' butonunu kullanın.",
                "verified_at": verify_time.isoformat()
            }
            
    except Exception as e:
        logger.exception(f"Getir auto verify exception: {getir_order_id}")
        return {"success": False, "error": str(e)}


# Eski fonksiyon adı için alias (geriye uyumluluk)
async def auto_verify_and_schedule_prepare(restaurant: dict, getir_order_id: str, getir_order: dict, shiftjet_order_id: str) -> dict:
    """DEPRECATED: auto_verify_order kullanın. Bu fonksiyon artık sadece verify yapıyor."""
    return await auto_verify_order(restaurant, getir_order_id, getir_order, shiftjet_order_id)


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
    
    now = datetime.now(TURKEY_TZ)
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
                # Türkiye saati (UTC+3)
                turkey_tz = timezone(timedelta(hours=3))
                now_turkey = datetime.now(turkey_tz).isoformat()
                
                await db.orders.update_one(
                    {"_id": existing["_id"]},
                    {"$set": {
                        "status": "cancelled",
                        "updated_at": now_turkey,
                        "getir_raw.status": getir_status,
                        "cancelled_by": "getir",
                        "cancelled_at": now_turkey
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
                        "updated_at": datetime.now(TURKEY_TZ).isoformat()
                    }}
                )
                skipped_count += 1
            continue
        
        # Yeni sipariş - dönüştür ve kaydet
        shiftjet_order = await convert_getir_order_to_shiftjet(getir_order, restaurant)
        
        # İleri tarihli sipariş DEĞİLSE hazırlama süresini ürünlere göre hesapla
        # İleri tarihli siparişlerde convert_getir_order_to_shiftjet zaten doğru süreyi hesapladı
        is_scheduled_order = shiftjet_order.get("is_scheduled", False)
        
        if not is_scheduled_order:
            # Normal sipariş - restoran hazırlama süresini kullan
            try:
                from routers.orders import calculate_preparation_time_async
                prep_time = await calculate_preparation_time_async(restaurant_id, shiftjet_order.get("items", []))
            except:
                # Restoran ayarından al, yoksa 15 dakika
                prep_time = restaurant.get("preparation_time", 15)
            
            prep_end = datetime.now(TURKEY_TZ) + timedelta(minutes=prep_time)
            shiftjet_order["preparation_time"] = prep_time
            shiftjet_order["preparation_end_at"] = prep_end.isoformat()
        else:
            # İleri tarihli sipariş - convert fonksiyonundaki hesaplamayı kullan
            logger.info(f"İleri tarihli sipariş, hesaplanan bekleme: {shiftjet_order.get('preparation_time')} dk")
        
        await insert_order(shiftjet_order)
        synced_count += 1
        
        shiftjet_order_id = shiftjet_order.get("id")
        
        # === OTOMATİK ONAYLA (verify/verify-scheduled) ===
        # Getir kuralı: 30 saniye içinde onaylanmalı
        # Status 400 = Normal sipariş, onay bekliyor
        # Status 325 = İleri tarihli sipariş, onay bekliyor
        
        if getir_status in [400, 325]:  # Onay bekleyen siparişler
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
                            "auto_approved_at": datetime.now(TURKEY_TZ).isoformat()
                        }}
                    )
                    logger.info(f"Getir sipariş onaylandı: {getir_order_id} (status: {getir_status})")
                else:
                    logger.warning(f"Getir otomatik onay hatası: {getir_order_id} - {verify_result.get('error')}")
            except Exception:
                logger.exception(f"Getir otomatik onay exception: {getir_order_id}")
    
    # Son senkronizasyon zamanını güncelle
    await db.restaurants.update_one(
        {"id": restaurant_id},
        {"$set": {"platform_integrations.getir.last_sync": datetime.now(TURKEY_TZ).isoformat()}}
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
    Kullanıcı "Yola Çıkar" veya "Teslim Et" butonuna bastığında çağrılır.
    
    target_status: "on_the_way" → prepare, "delivered" → deliver/handover
    Getir Kuralları: Her adım arasında 70sn bekleme zorunlu.
    """
    import asyncio
    
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
    
    now = datetime.now(TURKEY_TZ)
    
    try:
        if target_status == "on_the_way":
            # "Yola Çıkar" butonu → Getir'e PREPARE gönder
            should_wait, remaining = _check_timing_wait(order.get("getir_verified_at"))
            
            if should_wait:
                logger.info(f"Getir prepare bekletiliyor: {getir_order_id}, {remaining} saniye")
                asyncio.create_task(delayed_prepare(restaurant_id, getir_order_id, order_id))
                return {"success": True, "message": f"Sipariş {remaining} saniye sonra yola çıkacak", "wait_seconds": remaining, "scheduled": True}
            
            # Hemen prepare gönder
            async with httpx.AsyncClient(timeout=15.0) as client:
                response = await client.post(f"{GETIR_BASE_URL}/food-orders/{getir_order_id}/prepare", headers=headers)
                
                if response.status_code == 200:
                    logger.info(f"Getir prepare başarılı: {getir_order_id}")
                    await db.orders.update_one({"id": order_id}, {"$set": {"getir_prepared_at": now.isoformat(), "getir_raw.status": 700}})
                    return {"success": True, "message": "Sipariş Getir'de yola çıktı", "steps": ["prepare"]}
                
                error = _extract_error(response)
                logger.warning(f"Getir prepare hatası: {getir_order_id} - {error}")
                
                # Zaman hatası ise schedule et
                if any(x in error.lower() for x in ["time", "minute", "dakika"]):
                    asyncio.create_task(delayed_prepare(restaurant_id, getir_order_id, order_id))
                    return {"success": True, "message": "Getir 1 dakika kuralı - otomatik gönderilecek", "scheduled": True}
                return {"success": False, "error": f"Prepare hatası: {error}"}
        
        
        elif target_status == "delivered":
            # "Teslim Et" butonu → Getir'e DELIVER gönder (sadece Restoran Getirsin)
            if is_getir_courier:
                return {"success": True, "message": "Getir Getirsin siparişi - teslim otomatik güncellenecek"}
            
            should_wait, remaining = _check_timing_wait(order.get("getir_prepared_at"))
            
            if should_wait:
                logger.info(f"Getir deliver bekletiliyor: {getir_order_id}, {remaining} saniye")
                asyncio.create_task(delayed_deliver(restaurant_id, getir_order_id, order_id, remaining))
                return {"success": True, "message": f"Sipariş {remaining} saniye sonra teslim edilecek", "wait_seconds": remaining, "scheduled": True}
            
            # Hemen deliver gönder
            async with httpx.AsyncClient(timeout=15.0) as client:
                response = await client.post(f"{GETIR_BASE_URL}/food-orders/{getir_order_id}/deliver", headers=headers)
                
                if response.status_code == 200:
                    logger.info(f"Getir deliver başarılı: {getir_order_id}")
                    await db.orders.update_one({"id": order_id}, {"$set": {"getir_delivered_at": now.isoformat(), "getir_raw.status": 900}})
                    return {"success": True, "message": "Sipariş Getir'de teslim edildi", "steps": ["deliver"]}
                
                error = _extract_error(response)
                logger.warning(f"Getir deliver hatası: {getir_order_id} - {error}")
                
                if any(x in error.lower() for x in ["time", "minute"]):
                    asyncio.create_task(delayed_deliver(restaurant_id, getir_order_id, order_id, GETIR_STEP_WAIT_SECONDS))
                    return {"success": True, "message": "Getir 1 dakika kuralı - otomatik gönderilecek", "scheduled": True}
                return {"success": False, "error": f"Deliver hatası: {error}"}
        
        else:
            return {"success": False, "error": f"Geçersiz hedef durum: {target_status}"}
    
    except Exception as e:
        logger.exception(f"Getir smart_advance exception: {getir_order_id}")
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
        # Getir için iptal sebebi zorunlu - varsayılan olarak "Restoranda ürün eksik" kullan
        DEFAULT_CANCEL_REASON = "5c5b49a768f6a45d427f0a8e"  # Restoranda ürün eksik
        
        body = {
            "cancelReasonId": cancel_reason_id if cancel_reason_id else DEFAULT_CANCEL_REASON
        }
        if cancel_note:
            body["cancelNote"] = cancel_note
        
        logger.info(f"Getir cancel request: order={getir_order_id}, body={body}")
        
        async with httpx.AsyncClient(timeout=15.0) as client:
            response = await client.post(
                f"{GETIR_BASE_URL}/food-orders/{getir_order_id}/cancel",
                headers=headers,
                json=body
            )
            
            if response.status_code == 200:
                logger.info(f"Getir sipariş {getir_order_id} iptal edildi")
                return {"success": True, "message": "Sipariş iptal edildi"}
            else:
                error_detail = _extract_error(response)
                logger.warning(f"Getir cancel hatası: {response.status_code} - {error_detail}")
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
            
            # Response body'yi logla (debug için)
            logger.info(f"Getir status response: {response.status_code} - {response.text[:500] if response.text else 'empty'}")
            
            if response.status_code == 200:
                # Response body'yi kontrol et - Getir bazen 200 dönüp body'de hata verebilir
                try:
                    data = response.json()
                    # Getir'in döndürebileceği hata durumları
                    if data.get("success") == False or data.get("error"):
                        error_msg = data.get("message") or data.get("error") or "Bilinmeyen hata"
                        logger.warning(f"Getir status 200 ama hata döndü: {error_msg}")
                        return {"success": False, "error": error_msg}
                    
                    # Çalışma saatleri kontrolü
                    if data.get("isOutOfWorkingHours") or data.get("outOfWorkingHours"):
                        return {"success": False, "error": "Çalışma saatleri dışındasınız. Getir panelinden çalışma saatlerinizi kontrol ediniz."}
                    
                except:
                    # JSON parse edilemezse devam et (bazı endpoint'ler boş 200 döner)
                    pass
                
                status_text = "açık" if is_open else "kapalı"
                logger.info(f"Getir restoran durumu güncellendi: {status_text}")
                
                await db.restaurants.update_one(
                    {"id": restaurant_id},
                    {"$set": {"platform_integrations.getir.is_open": is_open}}
                )
                
                return {"success": True, "message": f"Restoran durumu {status_text} olarak güncellendi"}
            else:
                error_detail = _extract_error(response)
                logger.warning(f"Getir status hatası: {response.status_code} - {error_detail}")
                return {"success": False, "error": f"API hatası: {response.status_code} - {error_detail}"}
                
    except Exception as e:
        logger.exception("Getir restoran durumu güncelleme hatası")
        return {"success": False, "error": str(e)}


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
    
    prep_end = datetime.now(TURKEY_TZ) + timedelta(minutes=prep_time)
    shiftjet_order["preparation_time"] = prep_time
    shiftjet_order["preparation_end_at"] = prep_end.isoformat()
    shiftjet_order["webhook_received_at"] = datetime.now(TURKEY_TZ).isoformat()
    
    # DB'ye kaydet
    await insert_order(shiftjet_order)
    
    # Otomatik onay gönder (30 saniye kuralı!)
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
    
    # Türkiye saati (UTC+3)
    turkey_tz = timezone(timedelta(hours=3))
    now_turkey = datetime.now(turkey_tz).isoformat()
    
    await db.orders.update_one(
        {"getir_order_id": getir_order_id},
        {"$set": {
            "status": "cancelled",
            "cancel_reason": cancel_note,
            "cancelled_at": now_turkey,
            "cancelled_by": "getir",
            "updated_at": now_turkey
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
