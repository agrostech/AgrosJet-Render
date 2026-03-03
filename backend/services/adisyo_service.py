"""
Adisyo API Entegrasyon Servisi
- Sipariş çekme (polling)
- Sipariş durumu güncelleme
- Webhook işleme
"""
import httpx
import uuid
import logging
import math
from datetime import datetime, timezone, timedelta
from typing import Optional, List, Dict, Any
from utils.database import db
from utils.helpers import ensure_turkey_timezone, get_turkey_now
from services.credit_service import insert_order

# Türkiye timezone (UTC+3)
TURKEY_TZ = timezone(timedelta(hours=3))

logger = logging.getLogger(__name__)

ADISYO_BASE_URL = "https://ext.adisyo.com/api/External/v2"


# --- Taşıma Ücreti Hesaplama Yardımcı Fonksiyonları ---
def calculate_distance_internal(loc1: dict, loc2: dict) -> float:
    """Haversine formula ile iki nokta arasındaki mesafeyi hesapla (km)"""
    if not loc1 or not loc2:
        return 0.0
    lat1 = loc1.get("latitude") or loc1.get("lat") or 0
    lng1 = loc1.get("longitude") or loc1.get("lng") or 0
    lat2 = loc2.get("latitude") or loc2.get("lat") or 0
    lng2 = loc2.get("longitude") or loc2.get("lng") or 0
    if not all([lat1, lng1, lat2, lng2]):
        return 0.0
    R = 6371
    dLat = math.radians(lat2 - lat1)
    dLon = math.radians(lng2 - lng1)
    a = math.sin(dLat/2) ** 2 + math.cos(math.radians(lat1)) * math.cos(math.radians(lat2)) * math.sin(dLon/2) ** 2
    c = 2 * math.atan2(math.sqrt(a), math.sqrt(1-a))
    return R * c


def calculate_restaurant_fee_internal(restaurant: dict, restaurant_location: dict, delivery_location: dict) -> tuple:
    """Restoran için taşıma ücreti ve KDV hesapla. Returns: (restaurant_fee, restaurant_kdv)"""
    pricing_type = restaurant.get("pricing_type", "per_package")
    per_package_price = restaurant.get("per_package_price", 0)
    km_ranges = restaurant.get("km_ranges", [])
    kdv_rate = restaurant.get("kdv_rate", 10)
    
    if pricing_type == "per_package":
        fee = per_package_price or 0.0
    else:
        distance_km = calculate_distance_internal(restaurant_location, delivery_location)
        fee = 0.0
        if km_ranges:
            for km_range in km_ranges:
                min_km = km_range.get("min_km", 0)
                max_km = km_range.get("max_km")
                price = km_range.get("price", 0)
                if max_km is None:
                    if distance_km >= min_km:
                        fee = price
                        break
                else:
                    if min_km <= distance_km < max_km:
                        fee = price
                        break
    
    kdv = fee * (kdv_rate / 100)
    return round(fee, 2), round(kdv, 2)


async def get_adisyo_headers(restaurant: dict) -> dict:
    """Adisyo API için gerekli header'ları oluştur"""
    # Consumer header ASCII olmalı, Türkçe karakterleri temizle
    import unicodedata
    consumer_name = restaurant.get("name", "ShiftJet")
    # Türkçe karakterleri ASCII'ye çevir
    consumer_ascii = unicodedata.normalize('NFKD', consumer_name).encode('ASCII', 'ignore').decode('ASCII')
    if not consumer_ascii:
        consumer_ascii = "ShiftJet"
    
    return {
        "x-api-key": restaurant.get("adisyo_api_key", ""),
        "x-api-secret": restaurant.get("adisyo_api_secret", ""),
        "x-api-consumer": consumer_ascii,
        "Content-Type": "application/json"
    }


async def test_adisyo_connection(restaurant_id: str) -> dict:
    """Adisyo API bağlantısını test et"""
    restaurant = await db.restaurants.find_one(
        {"id": restaurant_id},
        {"_id": 0}
    )
    
    if not restaurant:
        return {"success": False, "error": "Restoran bulunamadı"}
    
    if not restaurant.get("adisyo_api_key") or not restaurant.get("adisyo_api_secret"):
        return {"success": False, "error": "Adisyo API bilgileri eksik"}
    
    try:
        headers = await get_adisyo_headers(restaurant)
        async with httpx.AsyncClient(timeout=10.0) as client:
            # Recent orders endpoint'ini test amaçlı çağır
            response = await client.get(
                f"{ADISYO_BASE_URL}/RecentOrders",
                headers=headers,
                params={"onlyRestaurantCourier": "true"}
            )
            
            if response.status_code == 200:
                return {"success": True, "message": "Bağlantı başarılı"}
            elif response.status_code == 401:
                return {"success": False, "error": "API anahtarları geçersiz"}
            else:
                return {"success": False, "error": f"API hatası: {response.status_code}"}
                
    except httpx.TimeoutException:
        return {"success": False, "error": "Bağlantı zaman aşımı"}
    except Exception as e:
        return {"success": False, "error": f"Bağlantı hatası: {str(e)}"}


async def fetch_recent_orders(restaurant_id: str) -> dict:
    """Adisyo'dan son siparişleri çek"""
    restaurant = await db.restaurants.find_one(
        {"id": restaurant_id},
        {"_id": 0}
    )
    
    if not restaurant:
        return {"success": False, "error": "Restoran bulunamadı", "orders": []}
    
    if not restaurant.get("adisyo_api_key") or not restaurant.get("adisyo_api_secret"):
        return {"success": False, "error": "Adisyo API bilgileri eksik", "orders": []}
    
    try:
        headers = await get_adisyo_headers(restaurant)
        async with httpx.AsyncClient(timeout=15.0) as client:
            response = await client.get(
                f"{ADISYO_BASE_URL}/RecentOrders",
                headers=headers,
                params={"onlyRestaurantCourier": "true"}
            )
            
            if response.status_code == 200:
                data = response.json()
                orders = data.get("data", [])
                return {"success": True, "orders": orders, "total": data.get("totalCount", 0)}
            else:
                return {"success": False, "error": f"API hatası: {response.status_code}", "orders": []}
                
    except Exception as e:
        return {"success": False, "error": str(e), "orders": []}


async def get_order_details(restaurant_id: str, adisyo_order_id: int) -> dict:
    """Adisyo'dan sipariş detaylarını çek"""
    restaurant = await db.restaurants.find_one(
        {"id": restaurant_id},
        {"_id": 0}
    )
    
    if not restaurant:
        return {"success": False, "error": "Restoran bulunamadı"}
    
    try:
        headers = await get_adisyo_headers(restaurant)
        async with httpx.AsyncClient(timeout=10.0) as client:
            response = await client.get(
                f"{ADISYO_BASE_URL}/Order/{adisyo_order_id}",
                headers=headers
            )
            
            if response.status_code == 200:
                data = response.json()
                return {"success": True, "order": data.get("data")}
            else:
                return {"success": False, "error": f"API hatası: {response.status_code}"}
                
    except Exception as e:
        return {"success": False, "error": str(e)}


def map_adisyo_status(status_id: int, status_name: str) -> str:
    """Adisyo status ID'sini ShiftJet durumuna çevir"""
    # Adisyo status'ları:
    # 1: Beklemede, 2: Hazırlanıyor, 3: Hazır, 4: Teslimatta, 5: Teslim Edildi, 6: İptal
    status_map = {
        1: "preparing",      # Beklemede -> Hazırlanıyor
        2: "preparing",      # Hazırlanıyor
        3: "ready",          # Hazır
        4: "on_the_way",     # Teslimatta -> Yolda
        5: "delivered",      # Teslim Edildi
        6: "cancelled"       # İptal
    }
    return status_map.get(status_id, "preparing")


def map_adisyo_payment(payment_method_id: int, payment_method_name: str, external_app_name: str = "") -> dict:
    """Adisyo ödeme yöntemini ShiftJet'e çevir
    
    Kategoriler:
    - cash: Nakit
    - card: Kapıda Kredi Kartı
    - online: Online ödemeler (platform üzerinden)
    - meal_card: Kapıda Yemek kartları (Multinet, Sodexo, Setcard, vb.)
    - online_meal_card: Online Yemek kartları
    
    Returns:
        dict: {"method": "meal_card", "detail": "Sodexo"} gibi
    """
    payment_name_lower = (payment_method_name or "").lower()
    original_name = payment_method_name or ""
    
    # Debug log
    logger.info(f"[PAYMENT MAP] ID: {payment_method_id}, Name: '{payment_method_name}', External: '{external_app_name}'")
    
    # Yemek kartı türünü tespit et
    def get_meal_card_detail(name_lower, original):
        if "sodexo" in name_lower:
            return "Sodexo"
        elif "multinet" in name_lower:
            return "Multinet"
        elif "setcard" in name_lower or "set card" in name_lower:
            return "Setcard"
        elif "ticket" in name_lower:
            return "Ticket"
        elif "metropol" in name_lower:
            return "Metropol"
        elif "edenred" in name_lower:
            return "Edenred"
        elif "pluxee" in name_lower:
            return "Pluxee"
        return original.split()[0] if original else "Yemek Kartı"
    
    # 1. NAKİT
    nakit_keywords = ["nakit", "cash"]
    if payment_method_id == 1 or any(k in payment_name_lower for k in nakit_keywords):
        # "Kapıda Nakit" da buraya düşer
        if "kapıda" in payment_name_lower or "kapida" in payment_name_lower:
            logger.info(f"[PAYMENT MAP] Result: cash (kapıda nakit)")
            return {"method": "cash", "detail": None}
        logger.info(f"[PAYMENT MAP] Result: cash (nakit)")
        return {"method": "cash", "detail": None}
    
    # 2. KAPIDA KREDİ KARTI
    if ("kapıda" in payment_name_lower or "kapida" in payment_name_lower) and ("kart" in payment_name_lower or "kredi" in payment_name_lower):
        logger.info(f"[PAYMENT MAP] Result: card (kapıda kredi kartı)")
        return {"method": "card", "detail": None}
    
    # 3. YEMEK KARTLARI
    meal_card_keywords = ["multinet", "sodexo", "setcard", "metropol", "ticket", "edenred", "pluxee", "smart ticket"]
    if any(k in payment_name_lower for k in meal_card_keywords):
        detail = get_meal_card_detail(payment_name_lower, original_name)
        # Online yemek kartı mı kontrol et
        if "online" in payment_name_lower or "pass mobil" in payment_name_lower:
            logger.info(f"[PAYMENT MAP] Result: online_meal_card ({detail})")
            return {"method": "online_meal_card", "detail": detail}
        # Kapıda/fiziksel yemek kartı
        logger.info(f"[PAYMENT MAP] Result: meal_card ({detail})")
        return {"method": "meal_card", "detail": detail}
    
    # 4. ONLINE ÖDEMELER
    online_keywords = [
        "online", "çevrimiçi", "cevrimici",
        "yemeksepeti", "ys online",
        "trendyol",
        "getir",
        "migros",
        "moneypay", "money pay",
        "garantipay", "garanti pay",
        "cüzdan", "cuzdan",
        "ödeme alındı", "odeme alindi",
        "diğer ödeme", "diger odeme"
    ]
    if any(k in payment_name_lower for k in online_keywords):
        logger.info(f"[PAYMENT MAP] Result: online (online ödeme)")
        return {"method": "online", "detail": None}
    
    # 5. Sadece "Kredi Kartı" (kapıda olmayan)
    if payment_method_id == 2 or ("kredi" in payment_name_lower or "banka" in payment_name_lower):
        logger.info(f"[PAYMENT MAP] Result: card (kredi kartı)")
        return {"method": "card", "detail": None}
    
    # 6. ID bazlı fallback (Adisyo'da 3+ genellikle online platform ödemeleri)
    if payment_method_id and payment_method_id >= 3:
        logger.info(f"[PAYMENT MAP] Result: online (ID >= 3 fallback)")
        return {"method": "online", "detail": None}
    
    # Varsayılan: online (bilinmeyen ödemeler genelde platform ödemesi)
    logger.info(f"[PAYMENT MAP] Result: online (default)")
    return {"method": "online", "detail": None}


def parse_coordinate(coord) -> float:
    """Koordinatı float'a çevir (virgül veya nokta formatını destekle)"""
    if coord is None:
        return None
    if isinstance(coord, (int, float)):
        return float(coord)
    if isinstance(coord, str):
        # Virgülü noktaya çevir
        coord = coord.replace(",", ".")
        try:
            return float(coord)
        except ValueError:
            return None
    return None


def parse_and_categorize_notes(raw_notes: str) -> str:
    """
    Adisyo notlarını ayrıştır ve kategorize et.
    - Ödeme bilgilerini temizle
    - Müşteri notlarını (operasyonel) CUSTOMER: öneki ile işaretle
    - Mutfak notlarını KITCHEN: öneki ile işaretle
    
    Örnek giriş: "Online Kredi/Banka Kartı | ömer aybak çiğköfteye gelicek | çatal bıçak göndermeyin"
    Örnek çıkış: "CUSTOMER:ömer aybak çiğköfteye gelicek|KITCHEN:çatal bıçak göndermeyin"
    """
    import re
    
    if not raw_notes:
        return ""
    
    # Ödeme metinleri - bunları tamamen sil
    payment_patterns = [
        r"Online\s*Kredi/?Banka\s*Kart[ıi]?",
        r"Kredi/?Banka\s*Kart[ıi]?",
        r"Online\s*Ödeme",
        r"Nakit\s*Ödeme",
        r"Kap[ıi]da\s*Ödeme",
        r"Kap[ıi]da\s*Kredi\s*Kart[ıi]?",
        r"Kap[ıi]da\s*Nakit",
        r"POS",
        r"Havale/?EFT",
    ]
    
    # Mutfak notları kalıpları - yiyecekle ilgili talimatlar
    # Daha spesifik olarak sadece yemek/malzeme ile ilgili olanlar
    kitchen_patterns = [
        r"çatal\s*b[ıi]çak",
        r"peçete",
        r"ketchup",
        r"mayonez",
        r"sos\s*(ist|gön|koy)",  # sos istemiyorum, sos gönder gibi
        r"ac[ıi]\s*(ist|gön|koy|olmas)",  # acı istemiyorum gibi
        r"az\s*tuzlu",
        r"tuzsuz",
        r"ekstra\s*(sos|peynir|et)",
        r"fazla\s*(sos|peynir|et)",
        r"yan[ıi]nda\s*(sos|peynir)",
        r"içecek\s*(ist|gön)",
        r"göndermeyin",
        r"gönderin$",
        r"istemiyorum$",
        r"koymay[ıi]n",
        r"\*\*",  # ** işareti genellikle mutfak notu
    ]
    
    # Notu parçalara ayır (| veya ; veya , ile ayrılmış olabilir)
    parts = re.split(r'\s*[\|;]\s*', raw_notes)
    
    customer_notes = []
    kitchen_notes = []
    
    for part in parts:
        part = part.strip()
        if not part:
            continue
        
        # Ödeme bilgisi mi kontrol et
        is_payment = False
        for pattern in payment_patterns:
            if re.search(pattern, part, re.IGNORECASE):
                is_payment = True
                break
        
        if is_payment:
            continue  # Ödeme bilgisini atla
        
        # Mutfak notu mu kontrol et
        is_kitchen = False
        for pattern in kitchen_patterns:
            if re.search(pattern, part, re.IGNORECASE):
                is_kitchen = True
                break
        
        if is_kitchen:
            kitchen_notes.append(part)
        else:
            # Müşteri notu (operasyonel - önemli)
            customer_notes.append(part)
    
    # Sonucu formatla
    result_parts = []
    if customer_notes:
        result_parts.append(f"CUSTOMER:{';'.join(customer_notes)}")
    if kitchen_notes:
        result_parts.append(f"KITCHEN:{';'.join(kitchen_notes)}")
    
    return "|".join(result_parts)


async def convert_adisyo_order_to_shiftjet(adisyo_order: dict, restaurant: dict) -> dict:
    """Adisyo sipariş formatını ShiftJet formatına çevir"""
    
    # Debug: Raw payment data log
    logger.info(f"[ADISYO RAW] Order ID: {adisyo_order.get('id')}, "
                f"Customer: {adisyo_order.get('customer', {}).get('name', 'N/A')}, "
                f"PaymentMethodId: {adisyo_order.get('paymentMethodId')}, "
                f"PaymentMethodName: {adisyo_order.get('paymentMethodName')}, "
                f"ExternalAppName: {adisyo_order.get('externalAppName')}")
    
    customer = adisyo_order.get("customer", {})
    products = adisyo_order.get("products", [])
    
    # Ürünleri dönüştür
    items = []
    for product in products:
        items.append({
            "name": product.get("productName", "Ürün"),
            "quantity": int(product.get("quantity", 1)),
            "price": float(product.get("unitPrice", 0)),
            "notes": product.get("productNote", "")
        })
    
    # Müşteri adresi - Notları ayır
    address_parts = []
    if customer.get("address"):
        address_parts.append(customer["address"])
    
    # addressDescription'da not olabilir, kontrol et
    address_desc = customer.get("addressDescription", "")
    if address_desc:
        # "**" veya "ÇATAL" gibi not işaretleri içeriyorsa adrese ekleme
        if not ("**" in address_desc or "ÇATAL" in address_desc.upper() or "BIÇAK" in address_desc.upper() or "GÖNDERMEYİN" in address_desc.upper()):
            address_parts.append(address_desc)
    
    if customer.get("region"):
        address_parts.append(customer["region"])
    
    delivery_address = ", ".join(filter(None, address_parts)) or "Adres belirtilmemiş"
    
    # Sipariş notlarını topla
    raw_notes_parts = []
    
    # orderNote'u ekle
    if adisyo_order.get("orderNote"):
        raw_notes_parts.append(adisyo_order["orderNote"])
    
    # addressDescription'daki notları ekle
    if address_desc:
        raw_notes_parts.append(address_desc)
    
    # orderExplanation ekle
    if adisyo_order.get("orderExplanation"):
        raw_notes_parts.append(adisyo_order["orderExplanation"])
    
    # Tüm notları birleştir ve kategorize et
    raw_notes = " | ".join(filter(None, raw_notes_parts))
    order_notes = parse_and_categorize_notes(raw_notes)
    
    # Müşteri adı - None değerlerini filtrele
    customer_name_parts = []
    if customer.get("customerName"):
        customer_name_parts.append(customer["customerName"])
    if customer.get("customerSurname") and customer.get("customerSurname") != "None":
        customer_name_parts.append(customer["customerSurname"])
    customer_name = " ".join(customer_name_parts).strip() or "Müşteri"
    
    # Telefon numarası - 5 ile başlıyorsa başına 0 ekle
    customer_phone = customer.get("customerPhone", "")
    if customer_phone:
        # Boşlukları ve tire işaretlerini kaldır
        clean_phone = customer_phone.replace(" ", "").replace("-", "")
        # 5 ile başlıyorsa ve 10 haneli ise başına 0 ekle
        if clean_phone.startswith("5") and len(clean_phone) == 10:
            customer_phone = "0" + customer_phone
    
    # Koordinatları düzgün parse et
    delivery_lat = parse_coordinate(adisyo_order.get("customerLatitude"))
    delivery_lng = parse_coordinate(adisyo_order.get("customerLongitude"))
    
    # External app adını al (Yemeksepeti, Getir vb.)
    external_app_name = adisyo_order.get("externalAppName", "")
    
    # Ödeme yöntemini ve detayını al
    payment_info = map_adisyo_payment(
        adisyo_order.get("paymentMethodId", 1),
        adisyo_order.get("paymentMethodName", "Nakit"),
        external_app_name
    )
    
    # Taşıma ücreti hesapla
    restaurant_location = {
        "latitude": restaurant.get("latitude"),
        "longitude": restaurant.get("longitude")
    }
    delivery_location = {
        "latitude": delivery_lat,
        "longitude": delivery_lng
    }
    restaurant_fee, restaurant_kdv = calculate_restaurant_fee_internal(
        restaurant, restaurant_location, delivery_location
    )
    
    return {
        "id": str(uuid.uuid4()),
        "order_number": f"ADY-{adisyo_order.get('orderNumber', adisyo_order.get('id'))}",
        "adisyo_order_id": adisyo_order.get("id"),
        "external_app_id": adisyo_order.get("externalAppId"),
        "external_app_name": external_app_name,
        "company_id": restaurant.get("company_id"),
        "restaurant_id": restaurant.get("id"),
        "restaurant_name": restaurant.get("name"),
        "restaurant_phone": restaurant.get("phone"),
        "restaurant_location": restaurant_location,
        "customer_name": customer_name,
        "customer_phone": customer_phone,
        "delivery_address": delivery_address,
        "delivery_location": delivery_location,
        "items": items,
        "total_amount": float(adisyo_order.get("orderTotal", 0)),
        "restaurant_fee": restaurant_fee,
        "restaurant_kdv": restaurant_kdv,
        "payment_method": payment_info["method"],
        "payment_method_detail": payment_info.get("detail"),
        "status": map_adisyo_status(
            adisyo_order.get("statusId", 1),
            adisyo_order.get("status", "Beklemede")
        ),
        "notes": order_notes,
        "source": "adisyo",
        "created_at": ensure_turkey_timezone(adisyo_order.get("insertDate")) if adisyo_order.get("insertDate") else get_turkey_now(),
        "updated_at": get_turkey_now(),
        "courier_id": None,
        "courier_name": None,
        # Ham Adisyo verisini debug için sakla
        "adisyo_raw": {
            "paymentMethodId": adisyo_order.get("paymentMethodId"),
            "paymentMethodName": adisyo_order.get("paymentMethodName"),
            "externalAppName": adisyo_order.get("externalAppName"),
            "statusId": adisyo_order.get("statusId"),
            "status": adisyo_order.get("status"),
            "orderNote": adisyo_order.get("orderNote"),
            "orderExplanation": adisyo_order.get("orderExplanation")
        }
    }


async def sync_restaurant_orders(restaurant_id: str) -> dict:
    """Restoran için Adisyo siparişlerini senkronize et"""
    restaurant = await db.restaurants.find_one(
        {"id": restaurant_id},
        {"_id": 0}
    )
    
    if not restaurant:
        return {"success": False, "error": "Restoran bulunamadı", "synced": 0}
    
    if not restaurant.get("adisyo_connected"):
        return {"success": False, "error": "Adisyo bağlantısı aktif değil", "synced": 0}
    
    # Adisyo'dan siparişleri çek
    result = await fetch_recent_orders(restaurant_id)
    
    if not result["success"]:
        return {"success": False, "error": result["error"], "synced": 0}
    
    synced_count = 0
    skipped_count = 0
    
    # ShiftJet'te daha ileri durumlar (bunları Adisyo ile ezme)
    shiftjet_priority_statuses = ["assigned", "confirmed", "on_the_way", "delivered", "cancelled"]
    
    for adisyo_order in result["orders"]:
        adisyo_order_id = adisyo_order.get("id")
        
        # Bu sipariş zaten var mı kontrol et
        existing = await db.orders.find_one({"adisyo_order_id": adisyo_order_id})
        
        if existing:
            # Sipariş zaten var
            current_status = existing.get("status")
            
            # Eğer ShiftJet'te kurye atanmış veya ilerlemiş ise, durumu DEĞİŞTİRME
            if current_status in shiftjet_priority_statuses:
                skipped_count += 1
                continue
            
            # Sadece Adisyo'dan teslim edildi veya iptal geldiyse güncelle
            adisyo_status_id = adisyo_order.get("statusId", 1)
            if adisyo_status_id in [5, 6]:  # 5: Teslim Edildi, 6: İptal
                new_status = map_adisyo_status(adisyo_status_id, "")
                if current_status != new_status:
                    await db.orders.update_one(
                        {"adisyo_order_id": adisyo_order_id},
                        {"$set": {
                            "status": new_status,
                            "updated_at": datetime.now(TURKEY_TZ).isoformat()
                        }}
                    )
            skipped_count += 1
            continue
        
        # Yeni sipariş - dönüştür ve kaydet
        shiftjet_order = await convert_adisyo_order_to_shiftjet(adisyo_order, restaurant)
        
        # Hazırlama süresini ürün bazlı hesapla
        from routers.orders import calculate_preparation_time_async
        prep_time = await calculate_preparation_time_async(restaurant_id, shiftjet_order.get("items", []))
        
        prep_end = datetime.now(TURKEY_TZ) + timedelta(minutes=prep_time)
        shiftjet_order["preparation_time"] = prep_time
        shiftjet_order["preparation_end_at"] = prep_end.isoformat()
        
        await insert_order(shiftjet_order)
        synced_count += 1
    
    # Son senkronizasyon zamanını güncelle
    await db.restaurants.update_one(
        {"id": restaurant_id},
        {"$set": {"adisyo_last_sync": datetime.now(TURKEY_TZ).isoformat()}}
    )
    
    return {
        "success": True,
        "synced": synced_count,
        "skipped": skipped_count,
        "total": len(result["orders"])
    }


async def sync_all_company_orders(company_id: str) -> dict:
    """Şirketteki tüm restoranların Adisyo siparişlerini senkronize et"""
    restaurants = await db.restaurants.find(
        {
            "company_id": company_id,
            "adisyo_connected": True,
            "is_archived": {"$ne": True}
        },
        {"_id": 0, "id": 1, "name": 1}
    ).to_list(100)
    
    total_synced = 0
    results = []
    
    for restaurant in restaurants:
        result = await sync_restaurant_orders(restaurant["id"])
        total_synced += result.get("synced", 0)
        results.append({
            "restaurant": restaurant["name"],
            "synced": result.get("synced", 0),
            "error": result.get("error")
        })
    
    return {
        "success": True,
        "total_synced": total_synced,
        "restaurants": results
    }


# --- Adisyo Kurye İşlemleri ---

async def fetch_adisyo_couriers(restaurant_id: str) -> dict:
    """
    Adisyo'dan kurye listesini çek.
    GET /api/External/v2/Couriers
    """
    restaurant = await db.restaurants.find_one(
        {"id": restaurant_id},
        {"_id": 0}
    )
    
    if not restaurant:
        return {"success": False, "error": "Restoran bulunamadı", "couriers": []}
    
    if not restaurant.get("adisyo_api_key") or not restaurant.get("adisyo_api_secret"):
        return {"success": False, "error": "Adisyo API bilgileri eksik", "couriers": []}
    
    try:
        headers = await get_adisyo_headers(restaurant)
        async with httpx.AsyncClient(timeout=10.0) as client:
            response = await client.get(
                f"{ADISYO_BASE_URL}/Couriers",
                headers=headers
            )
            
            if response.status_code == 200:
                data = response.json()
                couriers = data.get("couriers", [])
                return {"success": True, "couriers": couriers}
            else:
                return {"success": False, "error": f"API hatası: {response.status_code}", "couriers": []}
                
    except Exception as e:
        return {"success": False, "error": str(e), "couriers": []}


async def get_adisyo_courier_id(restaurant_id: str, shiftjet_courier_id: str) -> Optional[int]:
    """
    ShiftJet kurye ID'sini Adisyo kurye ID'sine eşleştir.
    
    Eşleştirme önceliği:
    1. Kurye'nin adisyo_courier_id alanı
    2. Telefon numarası ile eşleştirme
    3. İsim ile eşleştirme
    """
    # ShiftJet kuryesini al
    courier = await db.couriers.find_one(
        {"id": shiftjet_courier_id},
        {"_id": 0, "id": 1, "name": 1, "phone": 1, "adisyo_courier_id": 1}
    )
    
    if not courier:
        return None
    
    # 1. Doğrudan eşleştirme varsa kullan
    if courier.get("adisyo_courier_id"):
        return int(courier["adisyo_courier_id"])
    
    # 2. Adisyo kuryelerini çek ve eşleştir
    result = await fetch_adisyo_couriers(restaurant_id)
    
    if not result["success"] or not result["couriers"]:
        return None
    
    adisyo_couriers = result["couriers"]
    courier_phone = courier.get("phone", "").replace(" ", "").replace("-", "")
    courier_name = courier.get("name", "").lower()
    
    # Telefon numarasını normalize et
    if courier_phone.startswith("0"):
        courier_phone = courier_phone[1:]
    if courier_phone.startswith("+90"):
        courier_phone = courier_phone[3:]
    
    for adisyo_courier in adisyo_couriers:
        adisyo_phone = (adisyo_courier.get("phoneNumber") or "").replace(" ", "").replace("-", "")
        adisyo_name = (adisyo_courier.get("name") or "").lower()
        
        # Telefon eşleşmesi
        if adisyo_phone and courier_phone:
            if adisyo_phone.startswith("0"):
                adisyo_phone = adisyo_phone[1:]
            if adisyo_phone.startswith("+90"):
                adisyo_phone = adisyo_phone[3:]
            
            if adisyo_phone == courier_phone:
                adisyo_id = adisyo_courier.get("id")
                # Eşleşmeyi kaydet
                await db.couriers.update_one(
                    {"id": shiftjet_courier_id},
                    {"$set": {"adisyo_courier_id": adisyo_id}}
                )
                logger.info(f"Adisyo kurye eşleştirildi (telefon): {shiftjet_courier_id} -> {adisyo_id}")
                return adisyo_id
        
        # İsim eşleşmesi (son çare)
        if courier_name and adisyo_name and courier_name in adisyo_name:
            adisyo_id = adisyo_courier.get("id")
            await db.couriers.update_one(
                {"id": shiftjet_courier_id},
                {"$set": {"adisyo_courier_id": adisyo_id}}
            )
            logger.info(f"Adisyo kurye eşleştirildi (isim): {shiftjet_courier_id} -> {adisyo_id}")
            return adisyo_id
    
    return None


# --- Adisyo Ödeme Tipleri ---
# Adisyo PaymentMethodId değerleri
# Adisyo Payment Type ID mapping - ShiftJet'ten Adisyo'ya gönderim için
# meal_card detail'e göre doğru ID'yi bulmak için detaylı mapping
ADISYO_PAYMENT_TYPE_BY_DETAIL = {
    # Yemek kartları (meal_card)
    "multinet": 3,
    "smartticket": 4,
    "smart ticket": 4,
    "setcard": 5,
    "set card": 5,
    "sodexo": 6,
    "metropol": 26,
    "sodexo pass": 91,
    "sodexo pass mobil": 91,
    "sodexo cep": 97,
    "sodexo cep pos": 97,
}

# Temel ödeme tipleri
ADISYO_PAYMENT_TYPES = {
    "cash": 1,           # Nakit
    "card": 2,           # Kredi Kartı
    "online": 53,        # Web Online (varsayılan online)
    "meal_card": 3,      # Multinet (varsayılan yemek kartı)
    "online_meal_card": 41,  # Sodexo Online
}

def get_adisyo_payment_type(payment_method: str, payment_detail: str = None) -> int:
    """
    ShiftJet ödeme yöntemini Adisyo payment type ID'sine çevir.
    
    Args:
        payment_method: cash, card, online, meal_card, online_meal_card
        payment_detail: Sodexo, Setcard, Metropol, Multinet vb.
    
    Returns:
        Adisyo Payment Type ID
    """
    # Eğer meal_card ise ve detail varsa, detaya göre doğru ID'yi bul
    if payment_method == "meal_card" and payment_detail:
        detail_lower = payment_detail.lower().strip()
        
        # Detaylı mapping'de ara
        for key, type_id in ADISYO_PAYMENT_TYPE_BY_DETAIL.items():
            if key in detail_lower:
                return type_id
        
        # Bulunamazsa varsayılan meal_card (Multinet = 3)
        return 3
    
    # Temel mapping'den dön
    return ADISYO_PAYMENT_TYPES.get(payment_method, 1)  # Varsayılan: Nakit


# --- Adisyo'ya durum güncelleme ---

async def mark_adisyo_order_prepared(restaurant_id: str, adisyo_order_id: int) -> dict:
    """
    Adisyo'da siparişi "Hazırlandı" durumuna getir.
    POST /api/External/v2/Prepared
    Body: {"orderId": <order_id>}
    """
    restaurant = await db.restaurants.find_one(
        {"id": restaurant_id},
        {"_id": 0}
    )
    
    if not restaurant:
        return {"success": False, "error": "Restoran bulunamadı"}
    
    try:
        headers = await get_adisyo_headers(restaurant)
        async with httpx.AsyncClient(timeout=10.0) as client:
            response = await client.post(
                f"{ADISYO_BASE_URL}/Prepared",
                headers=headers,
                json={"orderId": adisyo_order_id}
            )
            
            if response.status_code == 200:
                data = response.json()
                if data.get("status") == 100:
                    logger.info(f"Adisyo sipariş hazırlandı: order_id={adisyo_order_id}")
                    return {"success": True, "message": "Sipariş hazırlandı olarak işaretlendi"}
                else:
                    return {"success": False, "error": data.get("message", "Bilinmeyen hata")}
            else:
                return {"success": False, "error": f"API hatası: {response.status_code}"}
                
    except Exception as e:
        logger.error(f"Adisyo hazırlandı hatası: {e}")
        return {"success": False, "error": str(e)}


async def mark_adisyo_order_on_delivery(restaurant_id: str, adisyo_order_id: int, courier_id: str = None) -> dict:
    """
    Adisyo'da siparişi "Yola Çıktı" durumuna getir.
    POST /api/External/v2/OnDelivery
    Body: {"orderId": <order_id>}
    
    NOT: courierId göndermiyoruz - Adisyo tarafında kurye ataması yapılır.
    """
    restaurant = await db.restaurants.find_one(
        {"id": restaurant_id},
        {"_id": 0}
    )
    
    if not restaurant:
        return {"success": False, "error": "Restoran bulunamadı"}
    
    try:
        headers = await get_adisyo_headers(restaurant)
        async with httpx.AsyncClient(timeout=10.0) as client:
            response = await client.post(
                f"{ADISYO_BASE_URL}/OnDelivery",
                headers=headers,
                json={"orderId": adisyo_order_id}
            )
            
            if response.status_code == 200:
                data = response.json()
                if data.get("status") == 100:
                    logger.info(f"Adisyo sipariş yola çıktı: order_id={adisyo_order_id}")
                    return {"success": True, "message": "Sipariş yola çıktı olarak işaretlendi"}
                else:
                    return {"success": False, "error": data.get("message", "Bilinmeyen hata")}
            else:
                return {"success": False, "error": f"API hatası: {response.status_code}"}
                
    except Exception as e:
        logger.error(f"Adisyo yola çıktı hatası: {e}")
        return {"success": False, "error": str(e)}


async def mark_adisyo_order_delivered(restaurant_id: str, adisyo_order_id: int, payment_method: str = "cash", payment_detail: str = None) -> dict:
    """
    Adisyo'da siparişi "Teslim Edildi" durumuna getir.
    POST /api/External/v2/Deliver
    Body: {"orderId": <order_id>, "paymentType": <payment_type_id>}
    
    NOT: paymentType zorunlu!
    
    Args:
        restaurant_id: Restoran ID
        adisyo_order_id: Adisyo sipariş ID
        payment_method: cash, card, online, meal_card
        payment_detail: Yemek kartı detayı (Sodexo, Setcard, Metropol vb.)
    """
    restaurant = await db.restaurants.find_one(
        {"id": restaurant_id},
        {"_id": 0}
    )
    
    if not restaurant:
        return {"success": False, "error": "Restoran bulunamadı"}
    
    # Ödeme tipini Adisyo formatına çevir (detail ile birlikte)
    payment_type_id = get_adisyo_payment_type(payment_method, payment_detail)
    
    try:
        headers = await get_adisyo_headers(restaurant)
        async with httpx.AsyncClient(timeout=10.0) as client:
            response = await client.post(
                f"{ADISYO_BASE_URL}/Deliver",
                headers=headers,
                json={
                    "orderId": adisyo_order_id,
                    "paymentType": payment_type_id
                }
            )
            
            if response.status_code == 200:
                data = response.json()
                if data.get("status") == 100:
                    logger.info(f"Adisyo sipariş teslim edildi: order_id={adisyo_order_id}, payment_type={payment_type_id}")
                    return {"success": True, "message": "Sipariş teslim edildi olarak işaretlendi"}
                else:
                    return {"success": False, "error": data.get("message", "Bilinmeyen hata")}
            else:
                return {"success": False, "error": f"API hatası: {response.status_code}"}
                
    except Exception as e:
        logger.error(f"Adisyo teslim edildi hatası: {e}")
        return {"success": False, "error": str(e)}


async def cancel_adisyo_order(restaurant_id: str, adisyo_order_id: int) -> dict:
    """
    Adisyo'da siparişi iptal et.
    POST /api/External/v2/Cancel (veya uygun cancel endpoint)
    """
    restaurant = await db.restaurants.find_one(
        {"id": restaurant_id},
        {"_id": 0}
    )
    
    if not restaurant:
        return {"success": False, "error": "Restoran bulunamadı"}
    
    try:
        headers = await get_adisyo_headers(restaurant)
        async with httpx.AsyncClient(timeout=10.0) as client:
            # Adisyo'da Cancel endpoint'i farklı olabilir
            # Döküman'da belirtilmemiş, varsayılan endpoint deneyelim
            response = await client.post(
                f"{ADISYO_BASE_URL}/Cancel",
                headers=headers,
                json={"orderId": adisyo_order_id}
            )
            
            if response.status_code == 200:
                data = response.json()
                if data.get("status") == 100:
                    logger.info(f"Adisyo sipariş iptal edildi: order_id={adisyo_order_id}")
                    return {"success": True, "message": "Sipariş iptal edildi"}
                else:
                    return {"success": False, "error": data.get("message", "Bilinmeyen hata")}
            else:
                # İptal endpoint'i olmayabilir, loglayalım
                logger.warning(f"Adisyo iptal API yanıtı: {response.status_code}")
                return {"success": False, "error": f"API hatası: {response.status_code}"}
                
    except Exception as e:
        logger.error(f"Adisyo iptal hatası: {e}")
        return {"success": False, "error": str(e)}


# Eski fonksiyon - geriye uyumluluk için
async def update_adisyo_order_status(restaurant_id: str, adisyo_order_id: int, status: str, courier_id: str = None, payment_method: str = None, payment_detail: str = None) -> dict:
    """
    Adisyo'da sipariş durumunu güncelle.
    Eski API - yeni fonksiyonlara yönlendirir.
    
    Args:
        restaurant_id: Restoran ID
        adisyo_order_id: Adisyo sipariş ID
        status: ready, on_the_way, delivered, cancelled
        courier_id: Kurye ID (on_the_way için)
        payment_method: Ödeme yöntemi (delivered için)
        payment_detail: Yemek kartı detayı - Sodexo, Setcard vb. (delivered için)
    """
    if status == "ready":
        return await mark_adisyo_order_prepared(restaurant_id, adisyo_order_id)
    elif status == "on_the_way":
        return await mark_adisyo_order_on_delivery(restaurant_id, adisyo_order_id, courier_id)
    elif status == "delivered":
        return await mark_adisyo_order_delivered(restaurant_id, adisyo_order_id, payment_method or "cash", payment_detail)
    elif status == "cancelled":
        return await cancel_adisyo_order(restaurant_id, adisyo_order_id)
    else:
        return {"success": False, "error": f"Geçersiz durum: {status}"}
