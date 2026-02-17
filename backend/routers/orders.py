"""
Sipariş Yönetimi API
Mock data ile başlangıç - Adisyo entegrasyonu sonra eklenecek
"""
from fastapi import APIRouter, HTTPException
from pydantic import BaseModel
from typing import Optional, List
from datetime import datetime, timezone, timedelta
import uuid
import random
import re

from utils.database import db
import math

router = APIRouter(prefix="/api/orders", tags=["Sipariş Yönetimi"])


# --- Ücret Hesaplama Fonksiyonları ---
def calculate_distance(restaurant_location: dict, delivery_location: dict) -> float:
    """Haversine formula ile mesafe hesapla (km)"""
    if not restaurant_location or not delivery_location:
        return 0.0
    
    R = 6371  # Dünya yarıçapı km
    lat1 = restaurant_location.get("latitude") or restaurant_location.get("lat") or 0
    lon1 = restaurant_location.get("longitude") or restaurant_location.get("lng") or 0
    lat2 = delivery_location.get("latitude") or delivery_location.get("lat") or 0
    lon2 = delivery_location.get("longitude") or delivery_location.get("lng") or 0
    
    if not all([lat1, lon1, lat2, lon2]):
        return 0.0
    
    dLat = math.radians(lat2 - lat1)
    dLon = math.radians(lon2 - lon1)
    a = math.sin(dLat/2) ** 2 + math.cos(math.radians(lat1)) * math.cos(math.radians(lat2)) * math.sin(dLon/2) ** 2
    c = 2 * math.atan2(math.sqrt(a), math.sqrt(1-a))
    return R * c


import re

def normalize_product_name(name: str) -> str:
    """
    Ürün ismini normalize et - fuzzy matching için.
    "All in One" -> "allinone"
    "AllinOne" -> "allinone"
    "All in one (kutu)" -> "allinonekutu"
    """
    if not name:
        return ""
    # Küçük harfe çevir
    normalized = name.lower()
    # Türkçe karakterleri dönüştür
    tr_map = {'ı': 'i', 'ğ': 'g', 'ü': 'u', 'ş': 's', 'ö': 'o', 'ç': 'c'}
    for tr_char, en_char in tr_map.items():
        normalized = normalized.replace(tr_char, en_char)
    # Sadece alfanumerik karakterleri tut
    normalized = re.sub(r'[^a-z0-9]', '', normalized)
    return normalized


def calculate_preparation_time(restaurant: dict, order_items: list, db_products: list = None) -> int:
    """
    Sipariş için toplam hazırlık süresini hesapla.
    
    Mantık:
    - Standart hazırlık süresi + En uzun ürün bazlı ekstra süre
    - Örnek: Standart 15 dk + max(Lahmacun 10 dk, Pide 8 dk) = 15 + 10 = 25 dk
    
    Args:
        restaurant: Restoran bilgisi (preparation_time, product_preparation_times)
        order_items: Siparişteki ürünler (product_id veya name içermeli)
        db_products: Veritabanındaki ürünler (isim eşleştirmesi için, opsiyonel)
    """
    standard_time = restaurant.get("preparation_time", 15)
    product_times = restaurant.get("product_preparation_times", {})
    
    if not product_times or not order_items:
        return standard_time
    
    # Eğer db_products verilmişse, ürün isimlerine göre ID eşleştirmesi yap
    # (Adisyo, Yemeksepeti gibi platformlardan gelen siparişler için)
    name_to_id_map = {}
    if db_products:
        for p in db_products:
            normalized_name = normalize_product_name(p.get("name", ""))
            if normalized_name:
                name_to_id_map[normalized_name] = p.get("id")
    
    # Siparişteki ürünlerin ekstra sürelerini topla
    extra_times = []
    for item in order_items:
        product_id = item.get("product_id") or item.get("id")
        product_name = item.get("name") or item.get("product_name") or ""
        
        # Önce product_id ile dene
        if product_id and str(product_id) in product_times:
            extra_time = product_times[str(product_id)]
            if extra_time and extra_time > 0:
                extra_times.append(extra_time)
            continue
        
        # product_id yoksa veya bulunamadıysa, isim eşleştirmesi yap
        if product_name and name_to_id_map:
            normalized_item_name = normalize_product_name(product_name)
            
            # Tam eşleşme dene
            if normalized_item_name in name_to_id_map:
                matched_id = name_to_id_map[normalized_item_name]
                if str(matched_id) in product_times:
                    extra_time = product_times[str(matched_id)]
                    if extra_time and extra_time > 0:
                        extra_times.append(extra_time)
                continue
            
            # Kısmi eşleşme dene (siparişteki isim DB'deki ismi içeriyor mu veya tersi)
            for db_normalized, db_id in name_to_id_map.items():
                if (normalized_item_name in db_normalized or db_normalized in normalized_item_name):
                    if str(db_id) in product_times:
                        extra_time = product_times[str(db_id)]
                        if extra_time and extra_time > 0:
                            extra_times.append(extra_time)
                    break
    
    # En uzun ekstra süreyi ekle (birden fazla ürün varsa sadece en uzun olan)
    max_extra = max(extra_times) if extra_times else 0
    
    return standard_time + max_extra


async def calculate_preparation_time_async(restaurant_id: str, order_items: list) -> int:
    """
    Async versiyon - veritabanından restoran ve ürünleri çekip hesaplar.
    Adisyo, Yemeksepeti gibi platformlardan gelen siparişler için kullanılır.
    """
    # Restoran bilgisini al
    restaurant = await db.restaurants.find_one(
        {"id": restaurant_id},
        {"_id": 0, "preparation_time": 1, "product_preparation_times": 1}
    )
    
    if not restaurant:
        return 15  # Default
    
    product_times = restaurant.get("product_preparation_times", {})
    
    # Eğer ürün bazlı süre tanımlı değilse standart süreyi döndür
    if not product_times:
        return restaurant.get("preparation_time", 15)
    
    # Restoran ürünlerini çek (isim eşleştirmesi için)
    db_products = await db.products.find(
        {"restaurant_id": restaurant_id},
        {"_id": 0, "id": 1, "name": 1}
    ).to_list(1000)
    
    return calculate_preparation_time(restaurant, order_items, db_products)


def calculate_fee_from_pricing(pricing_type: str, per_package_price: float, km_ranges: list, distance_km: float) -> float:
    """Ücretlendirme ayarına göre ücret hesapla"""
    if pricing_type == "per_package":
        return per_package_price or 0.0
    elif pricing_type == "per_km" and km_ranges:
        for km_range in km_ranges:
            min_km = km_range.get("min_km", 0)
            max_km = km_range.get("max_km")
            price = km_range.get("price", 0)
            
            # max_km None ise sınırsız (örn: 10+ km)
            if max_km is None:
                if distance_km >= min_km:
                    return price
            else:
                if min_km <= distance_km < max_km:
                    return price
    return 0.0


async def calculate_order_fees(order: dict) -> dict:
    """Sipariş için kurye ve restoran ücretlerini hesapla"""
    courier_fee = 0.0
    restaurant_fee = 0.0
    restaurant_kdv = 0.0
    pos_commission = 0.0
    distance_km = 0.0
    
    # Mesafe hesapla
    if order.get("restaurant_location") and order.get("delivery_location"):
        distance_km = calculate_distance(order["restaurant_location"], order["delivery_location"])
    
    # Kurye ücret hesaplama
    courier_id = order.get("courier_id")
    if courier_id:
        courier = await db.couriers.find_one(
            {"id": courier_id}, 
            {"_id": 0, "pricing_type": 1, "per_package_price": 1, "km_ranges": 1}
        )
        if courier:
            courier_fee = calculate_fee_from_pricing(
                courier.get("pricing_type", "per_package"),
                courier.get("per_package_price", 0),
                courier.get("km_ranges", []),
                distance_km
            )
    
    # Restoran ücret hesaplama
    restaurant_id = order.get("restaurant_id")
    if restaurant_id:
        restaurant = await db.restaurants.find_one(
            {"id": restaurant_id}, 
            {"_id": 0, "pricing_type": 1, "per_package_price": 1, "km_ranges": 1, "kdv_rate": 1, "pos_commission_rate": 1}
        )
        if restaurant:
            restaurant_fee = calculate_fee_from_pricing(
                restaurant.get("pricing_type", "per_package"),
                restaurant.get("per_package_price", 0),
                restaurant.get("km_ranges", []),
                distance_km
            )
            # KDV hesapla
            kdv_rate = restaurant.get("kdv_rate", 0)
            if kdv_rate > 0:
                restaurant_kdv = restaurant_fee * (kdv_rate / 100)
            
            # POS komisyonu hesapla (sadece kredi kartı ödemeleri için)
            payment_method = order.get("payment_method", "").lower()
            if payment_method == "card":
                pos_rate = restaurant.get("pos_commission_rate", 0)
                if pos_rate > 0:
                    total_amount = order.get("total_amount", 0)
                    pos_commission = total_amount * (pos_rate / 100)
    
    return {
        "courier_fee": round(courier_fee, 2),
        "restaurant_fee": round(restaurant_fee, 2),
        "restaurant_kdv": round(restaurant_kdv, 2),
        "pos_commission": round(pos_commission, 2),
        "distance_km": round(distance_km, 2)
    }


# --- Pydantic Models ---
class OrderAssign(BaseModel):
    courier_id: str
    admin_id: Optional[str] = None
    admin_name: Optional[str] = None


class BulkPickupRequest(BaseModel):
    order_ids: List[str]


class OrderStatusUpdate(BaseModel):
    status: str  # preparing, ready, assigned, on_the_way, delivered, cancelled
    preparation_time: Optional[int] = None  # Hazırlanıyor durumu için süre (dakika)
    courier_id: Optional[str] = None
    admin_id: Optional[str] = None
    admin_name: Optional[str] = None
    actor_type: Optional[str] = None  # admin, courier, system
    is_super_admin: Optional[bool] = False  # Super admin bypass


class OrderFeesUpdate(BaseModel):
    courier_fee: Optional[float] = None
    restaurant_fee: Optional[float] = None
    restaurant_kdv: Optional[float] = None
    pos_commission: Optional[float] = None
    admin_id: Optional[str] = None
    admin_name: Optional[str] = None


class ManualOrderItem(BaseModel):
    product_id: str
    name: str
    quantity: int
    price: float


class DeliveryLocation(BaseModel):
    lat: float
    lng: float


class ManualOrderCreate(BaseModel):
    restaurant_id: str
    customer_name: str
    customer_phone: Optional[str] = None
    delivery_address: str
    delivery_location: Optional[DeliveryLocation] = None  # Koordinatlar
    items: List[ManualOrderItem]
    payment_method: str  # cash, card, online
    notes: Optional[str] = None
    is_scheduled: bool = False
    scheduled_time: Optional[str] = None  # ISO datetime string


# --- Sipariş Durumları ---
ORDER_STATUSES = {
    "pending": {"label": "Beklemede", "color": "gray"},
    "scheduled": {"label": "Programlı", "color": "indigo"},
    "preparing": {"label": "Hazırlanıyor", "color": "yellow"},
    "ready": {"label": "Hazır", "color": "orange"},
    "assigned": {"label": "Kurye Atandı", "color": "purple"},
    "confirmed": {"label": "Onaylandı", "color": "blue"},  # Kurye siparişi onayladı
    "on_the_way": {"label": "Yolda", "color": "cyan"},
    "picked_up": {"label": "Yolda", "color": "cyan"},  # alias for on_the_way
    "delivered": {"label": "Teslim Edildi", "color": "green"},
    "cancelled": {"label": "İptal Edildi", "color": "red"}
}

# Kurye ataması kaldırılacak durumlar
COURIER_REMOVAL_STATUSES = ["preparing", "ready", "cancelled"]

# Admin tarafından seçilemeyen durumlar (sadece kurye seçebilir veya otomatik atanır)
COURIER_ONLY_STATUSES = ["assigned", "confirmed"]


# --- Mock Data Generator ---
async def generate_mock_orders(company_id: str, count: int = 5):
    """Test amaçlı mock sipariş oluştur - Şirketin bulunduğu şehirden"""
    
    # Şirket bilgilerini al (şehir koordinatları için)
    company = await db.companies.find_one(
        {"id": company_id},
        {"_id": 0, "city": 1, "city_lat": 1, "city_lng": 1}
    )
    
    # Şirketin restoranlarını al (hazırlık süresi dahil)
    restaurants = await db.restaurants.find(
        {"company_id": company_id, "is_archived": {"$ne": True}},
        {"_id": 0, "id": 1, "name": 1, "latitude": 1, "longitude": 1, "preparation_time": 1}
    ).to_list(50)
    
    if not restaurants:
        return []
    
    # Şirket şehrine göre mahalle ve sokak bilgileri
    city_neighborhoods = {
        "Mersin": {
            "neighborhoods": [
                "Akdeniz", "Mezitli", "Yenişehir", "Toroslar", "Pozcu",
                "Forum", "Liparis", "Güvenevler", "Çankaya", "Bahçe"
            ],
            "streets": [
                "Gazi Mustafa Kemal Bulvarı", "İsmet İnönü Bulvarı", "Atatürk Caddesi",
                "Silifke Caddesi", "Hal Caddesi", "Çankaya Caddesi", "Kuvai Milliye Caddesi",
                "Hastane Caddesi", "Liman Caddesi", "Sahil Yolu"
            ],
            "base_lat": 36.8121,
            "base_lng": 34.6415
        },
        "Isparta": {
            "neighborhoods": [
                "Merkez", "Çünür", "Pirimehmet", "İstiklal", "Yayla",
                "Emre", "Sermet", "Turan", "Keçeci", "Modernevler"
            ],
            "streets": [
                "Süleyman Demirel Bulvarı", "İstasyon Caddesi", "Mimar Sinan Caddesi",
                "Cengiz Topel Caddesi", "113. Cadde", "Doğancı Caddesi", "Gazi Kemal Caddesi",
                "Yaşar Kemal Caddesi", "SDÜ Caddesi", "Gölcük Yolu"
            ],
            "base_lat": 37.7648,
            "base_lng": 30.5566
        },
        "İstanbul": {
            "neighborhoods": [
                "Kadıköy", "Beşiktaş", "Üsküdar", "Maltepe", "Ataşehir",
                "Şişli", "Bakırköy", "Fatih", "Beyoğlu", "Sarıyer"
            ],
            "streets": [
                "Bağdat Caddesi", "Barbaros Bulvarı", "İstiklal Caddesi", "Halaskargazi Caddesi",
                "Moda Caddesi", "Vatan Caddesi", "Bağlarbaşı Caddesi", "Maslak Caddesi"
            ],
            "base_lat": 41.0082,
            "base_lng": 28.9784
        },
        "Ankara": {
            "neighborhoods": [
                "Çankaya", "Kızılay", "Bahçelievler", "Keçiören", "Yenimahalle",
                "Etimesgut", "Mamak", "Altındağ", "Sincan", "Pursaklar"
            ],
            "streets": [
                "Atatürk Bulvarı", "Tunalı Hilmi Caddesi", "Kızılay Caddesi", "Bahçelievler Caddesi",
                "Hoşdere Caddesi", "Çetin Emeç Bulvarı", "Eskişehir Yolu"
            ],
            "base_lat": 39.9334,
            "base_lng": 32.8597
        },
        "İzmir": {
            "neighborhoods": [
                "Alsancak", "Konak", "Karşıyaka", "Bornova", "Buca",
                "Bayraklı", "Çiğli", "Gaziemir", "Balçova", "Narlıdere"
            ],
            "streets": [
                "Kordon Boyu", "Atatürk Caddesi", "Cumhuriyet Bulvarı", "Fevzipaşa Bulvarı",
                "Alsancak Caddesi", "Kıbrıs Şehitleri Caddesi"
            ],
            "base_lat": 38.4192,
            "base_lng": 27.1287
        },
        "Antalya": {
            "neighborhoods": [
                "Muratpaşa", "Konyaaltı", "Kepez", "Lara", "Kaleiçi",
                "Varsak", "Hurma", "Güzeloba", "Şirinyalı", "Meltem"
            ],
            "streets": [
                "Atatürk Caddesi", "Lara Caddesi", "Konyaaltı Caddesi", "Fener Caddesi",
                "Işıklar Caddesi", "Şarampol Caddesi", "Ali Çetinkaya Caddesi"
            ],
            "base_lat": 36.8969,
            "base_lng": 30.7133
        },
        "Bursa": {
            "neighborhoods": [
                "Osmangazi", "Nilüfer", "Yıldırım", "Görükle", "Altıparmak",
                "Çekirge", "Heykel", "Setbaşı", "Mudanya", "Gemlik"
            ],
            "streets": [
                "Atatürk Caddesi", "Altıparmak Caddesi", "Çekirge Caddesi", "Stadyum Caddesi",
                "İzmir Yolu", "FSM Bulvarı", "Mudanya Caddesi"
            ],
            "base_lat": 40.1828,
            "base_lng": 29.0665
        }
    }
    
    # Bilinmeyen şehirler için genel Türkiye mahalle/sokak isimleri
    default_city_data = {
        "neighborhoods": [
            "Merkez", "Yenimahalle", "Cumhuriyet", "Atatürk", "İstiklal",
            "Fatih", "Bahçelievler", "Yeşilyurt", "Güneşli", "Çarşı"
        ],
        "streets": [
            "Atatürk Caddesi", "Cumhuriyet Caddesi", "İstiklal Caddesi", "Hürriyet Caddesi",
            "Gazi Caddesi", "Çarşı Caddesi", "İnönü Caddesi", "Hastane Caddesi"
        ]
    }
    
    # Şirketin şehrini al veya varsayılan kullan
    city_name = company.get("city", "") if company else ""
    city_data = city_neighborhoods.get(city_name, default_city_data)
    
    # Şirketin koordinatlarını kullan veya şehir varsayılanını
    base_lat = company.get("city_lat", city_data["base_lat"]) if company else city_data["base_lat"]
    base_lng = company.get("city_lng", city_data["base_lng"]) if company else city_data["base_lng"]
    
    # Dinamik adresler oluştur (şirket konumu etrafında ~3km yarıçapta)
    def generate_address():
        neighborhood = random.choice(city_data["neighborhoods"])
        street = random.choice(city_data["streets"])
        building_no = random.randint(1, 200)
        
        # Rastgele konum (merkez etrafında ~3km)
        lat_offset = random.uniform(-0.025, 0.025)  # ~2.5km
        lng_offset = random.uniform(-0.025, 0.025)
        
        return {
            "address": f"{neighborhood}, {street} No:{building_no}",
            "lat": base_lat + lat_offset,
            "lng": base_lng + lng_offset
        }
    
    sample_customers = [
        "Ahmet Yılmaz", "Mehmet Demir", "Ayşe Kaya", "Fatma Öztürk", "Ali Çelik",
        "Zeynep Arslan", "Hüseyin Şahin", "Emine Yıldız", "Mustafa Aydın", "Hatice Koç"
    ]
    
    sample_items = [
        [{"name": "Lahmacun", "quantity": 3, "price": 45}],
        [{"name": "Adana Kebap", "quantity": 2, "price": 180}, {"name": "Ayran", "quantity": 2, "price": 15}],
        [{"name": "İskender", "quantity": 1, "price": 220}],
        [{"name": "Pide Karışık", "quantity": 2, "price": 120}, {"name": "Cacık", "quantity": 1, "price": 35}],
        [{"name": "Döner Dürüm", "quantity": 4, "price": 85}],
        [{"name": "Tavuk Şiş", "quantity": 2, "price": 150}, {"name": "Pilav", "quantity": 2, "price": 30}],
        [{"name": "Köfte Ekmek", "quantity": 3, "price": 65}],
        [{"name": "Pizza Margarita", "quantity": 1, "price": 180}, {"name": "Kola", "quantity": 2, "price": 25}],
    ]
    
    orders = []
    
    for i in range(count):
        restaurant = random.choice(restaurants)
        delivery = generate_address()  # Dinamik adres oluştur
        customer = random.choice(sample_customers)
        items = random.choice(sample_items)
        
        total = sum(item["price"] * item["quantity"] for item in items)
        
        # Şimdi oluştur (geri sayım için)
        created_at = datetime.now(timezone.utc)
        
        # Restoran hazırlık süresi (varsayılan 15 dakika)
        prep_time = restaurant.get("preparation_time", 15)
        preparation_end_at = created_at + timedelta(minutes=prep_time)
        
        order = {
            "id": str(uuid.uuid4()),
            "order_number": f"ORD-{random.randint(1000, 9999)}",
            "company_id": company_id,
            "restaurant_id": restaurant["id"],
            "restaurant_name": restaurant["name"],
            "restaurant_location": {
                "latitude": restaurant.get("latitude", base_lat),
                "longitude": restaurant.get("longitude", base_lng)
            },
            "customer_name": customer,
            "customer_phone": f"05{random.randint(30, 59)}{random.randint(1000000, 9999999)}",
            "delivery_address": delivery["address"],
            "delivery_location": {
                "latitude": delivery["lat"],
                "longitude": delivery["lng"]
            },
            "items": items,
            "total_amount": total,
            "payment_method": random.choice(["cash", "card", "online"]),
            "status": "preparing",  # Yeni siparişler hazırlanıyor ile başlar
            "preparation_time": prep_time,  # Hazırlık süresi (dakika)
            "preparation_end_at": preparation_end_at.isoformat(),  # Hazırlık bitiş zamanı
            "courier_id": None,
            "courier_name": None,
            "assigned_at": None,
            "confirmed_at": None,
            "delivered_at": None,
            "notes": random.choice(["", "", "Kapıda ödeme", "Zile basma, ara", "Acele"]),
            "source": "mock",  # mock veya adisyo
            "created_at": created_at.isoformat(),
            "updated_at": created_at.isoformat(),
            "status_history": [
                {
                    "status": "preparing",
                    "label": "Sipariş Alındı",
                    "timestamp": created_at.isoformat(),
                    "note": f"Hazırlık süresi: {prep_time} dakika",
                    "actor_type": "system",  # system, admin, courier
                    "actor_name": "Sistem"
                }
            ]
        }
        
        orders.append(order)
    
    # Veritabanına kaydet
    if orders:
        await db.orders.insert_many(orders)
    
    return orders


# --- Endpoints ---

@router.get("/{company_id}")
async def get_orders(
    company_id: str, 
    status: Optional[str] = None,
    courier_id: Optional[str] = None,
    restaurant_id: Optional[str] = None,
    limit: int = 50
):
    """Şirkete ait siparişleri getir"""
    # Önce hazırlık süresi dolan siparişleri güncelle
    await check_preparation_times(company_id)
    
    query = {"company_id": company_id}
    
    if status:
        if status == "active":
            # Aktif siparişler: teslim edilmemiş ve iptal edilmemiş
            query["status"] = {"$nin": ["delivered", "cancelled"]}
        else:
            query["status"] = status
    
    if courier_id:
        query["courier_id"] = courier_id
    
    if restaurant_id:
        query["restaurant_id"] = restaurant_id
    
    orders = await db.orders.find(query, {"_id": 0}).sort("created_at", -1).to_list(limit)
    
    return orders


@router.get("/restaurant/{restaurant_id}")
async def get_orders_by_restaurant(restaurant_id: str, limit: int = 100):
    """Restorana ait siparişleri getir - Restoran paneli için"""
    # Today's start
    from datetime import datetime, timezone, timedelta
    today_start = datetime.now(timezone.utc).replace(hour=0, minute=0, second=0, microsecond=0)
    
    # Bugünkü ve aktif siparişleri getir
    query = {
        "restaurant_id": restaurant_id,
        "$or": [
            {"status": {"$nin": ["delivered", "cancelled"]}},  # Aktif siparişler
            {"created_at": {"$gte": today_start.isoformat()}}  # Bugün oluşturulanlar
        ]
    }
    
    orders = await db.orders.find(query, {"_id": 0}).sort("created_at", -1).to_list(limit)
    
    # Kurye bilgilerini zenginleştir (telefon ve konum)
    courier_ids = list(set(o.get("courier_id") for o in orders if o.get("courier_id")))
    
    if courier_ids:
        couriers = await db.couriers.find(
            {"id": {"$in": courier_ids}},
            {"_id": 0, "id": 1, "phone": 1, "current_location": 1}
        ).to_list(100)
        
        courier_map = {c["id"]: c for c in couriers}
        
        for order in orders:
            if order.get("courier_id") and order["courier_id"] in courier_map:
                courier = courier_map[order["courier_id"]]
                order["courier_phone"] = courier.get("phone")
                order["courier_location"] = courier.get("current_location")
    
    return orders


@router.put("/{order_id}/status")
async def update_order_status_simple(order_id: str, data: OrderStatusUpdate):
    """Sipariş durumunu güncelle - Restoran paneli için basit endpoint"""
    order = await db.orders.find_one({"id": order_id})
    if not order:
        raise HTTPException(status_code=404, detail="Sipariş bulunamadı")
    
    # Kurye atandıysa restoran değişiklik yapamaz
    if order.get("courier_id"):
        raise HTTPException(
            status_code=403, 
            detail="Kurye atandıktan sonra sipariş durumu restoran tarafından değiştirilemez"
        )
    
    # Sadece belirli durumlar değiştirilebilir
    allowed_statuses = ["pending", "preparing", "ready", "scheduled", "on_the_way", "delivered"]
    if data.status not in allowed_statuses:
        raise HTTPException(
            status_code=400, 
            detail=f"Bu durum restoran tarafından seçilemez. İzin verilen durumlar: {', '.join(allowed_statuses)}"
        )
    
    now = datetime.now(timezone.utc)
    
    update_fields = {
        "status": data.status,
        "updated_at": now.isoformat()
    }
    
    # Hazırlanıyor durumuna geçişte geri sayım
    if data.status == "preparing":
        # Eğer scheduled siparişse, restoran hazırlık süresini kullan
        prep_time = data.preparation_time or order.get("preparation_time") or 15
        preparation_end_at = now + timedelta(minutes=prep_time)
        update_fields["preparation_time"] = prep_time
        update_fields["preparation_end_at"] = preparation_end_at.isoformat()
        # Scheduled durumundan çıkıyorsa is_scheduled'ı false yap
        if order.get("status") == "scheduled":
            update_fields["is_scheduled"] = False
    
    await db.orders.update_one({"id": order_id}, {"$set": update_fields})
    
    return {"message": "Sipariş durumu güncellendi", "status": data.status}


# --- Mock Data Endpoints (order_id'den önce olmalı) ---

@router.post("/{company_id}/generate-mock")
async def generate_mock(company_id: str, count: int = 5):
    """Test amaçlı mock sipariş oluştur"""
    orders = await generate_mock_orders(company_id, count)
    return {"message": f"{len(orders)} mock sipariş oluşturuldu", "count": len(orders)}


@router.delete("/{company_id}/clear-mock")
async def clear_mock_orders(company_id: str):
    """Tüm mock siparişleri sil"""
    result = await db.orders.delete_many({"company_id": company_id, "source": "mock"})
    return {"message": f"{result.deleted_count} mock sipariş silindi"}


# --- İstatistikler (order_id'den önce olmalı) ---

@router.get("/{company_id}/stats/summary")
async def get_order_stats(company_id: str):
    """Sipariş özet istatistikleri"""
    today_start = datetime.now(timezone.utc).replace(hour=0, minute=0, second=0, microsecond=0)
    
    # Bugünkü siparişler
    today_orders = await db.orders.count_documents({
        "company_id": company_id,
        "created_at": {"$gte": today_start.isoformat()}
    })
    
    # Aktif siparişler
    active = await db.orders.count_documents({
        "company_id": company_id,
        "status": {"$nin": ["delivered", "cancelled"]}
    })
    
    # Teslim edilen
    delivered = await db.orders.count_documents({
        "company_id": company_id,
        "status": "delivered",
        "created_at": {"$gte": today_start.isoformat()}
    })
    
    return {
        "today_orders": today_orders,
        "active_orders": active,
        "delivered_today": delivered
    }


# --- Tek sipariş işlemleri ---

async def check_preparation_times(company_id: str):
    """Hazırlık süresi dolan siparişleri otomatik 'Hazır' durumuna güncelle"""
    now = datetime.now(timezone.utc).isoformat()
    
    # Hazırlanıyor durumunda ve hazırlık süresi dolmuş siparişleri bul
    expired_orders = await db.orders.find(
        {
            "company_id": company_id,
            "status": "preparing",
            "preparation_end_at": {"$lte": now}
        },
        {"_id": 0, "id": 1}
    ).to_list(100)
    
    # Her birini güncelle ve history'ye ekle
    for order in expired_orders:
        history_entry = {
            "status": "ready",
            "label": "Hazır",
            "timestamp": now,
            "note": "Hazırlık süresi doldu",
            "actor_type": "auto",
            "actor_name": "Otomatik"
        }
        
        await db.orders.update_one(
            {"id": order["id"]},
            {
                "$set": {
                    "status": "ready",
                    "updated_at": now
                },
                "$push": {"status_history": history_entry}
            }
        )
    
    return len(expired_orders)


@router.get("/{company_id}/{order_id}")
async def get_order(company_id: str, order_id: str):
    """Tek bir sipariş detayı"""
    order = await db.orders.find_one(
        {"id": order_id, "company_id": company_id},
        {"_id": 0}
    )
    
    if not order:
        raise HTTPException(status_code=404, detail="Sipariş bulunamadı")
    
    return order


@router.post("/{company_id}/{order_id}/assign")
async def assign_courier(company_id: str, order_id: str, data: OrderAssign):
    """Siparişe kurye ata"""
    order = await db.orders.find_one({"id": order_id, "company_id": company_id})
    if not order:
        raise HTTPException(status_code=404, detail="Sipariş bulunamadı")
    
    # Kurye bilgisini al (ücretlendirme ve telefon dahil)
    courier = await db.couriers.find_one(
        {"id": data.courier_id}, 
        {"_id": 0, "name": 1, "phone": 1, "pricing_type": 1, "per_package_price": 1, "km_ranges": 1}
    )
    if not courier:
        raise HTTPException(status_code=404, detail="Kurye bulunamadı")
    
    # Restoran engel kontrolü
    restaurant_id = order.get("restaurant_id")
    if restaurant_id:
        restaurant = await db.restaurants.find_one(
            {"id": restaurant_id},
            {"_id": 0, "blocked_couriers": 1, "name": 1}
        )
        if restaurant:
            blocked_couriers = restaurant.get("blocked_couriers", [])
            if data.courier_id in blocked_couriers:
                raise HTTPException(
                    status_code=400, 
                    detail=f"{courier['name']} bu restoran için engellenmiş"
                )
    
    now = datetime.now(timezone.utc).isoformat()
    
    # Kurye ücretini hesapla
    courier_fee = 0.0
    distance_km = 0.0
    
    if order.get("restaurant_location") and order.get("delivery_location"):
        distance_km = calculate_distance(order["restaurant_location"], order["delivery_location"])
    
    courier_fee = calculate_fee_from_pricing(
        courier.get("pricing_type", "per_package"),
        courier.get("per_package_price", 0),
        courier.get("km_ranges", []),
        distance_km
    )
    
    # History'ye ekle
    history_entry = {
        "status": "assigned",
        "label": "Kurye Atandı",
        "timestamp": now,
        "note": f"Kurye: {courier['name']}",
        "actor_type": "admin" if data.admin_name else "system",
        "actor_name": data.admin_name or "Sistem"
    }
    
    await db.orders.update_one(
        {"id": order_id},
        {
            "$set": {
                "courier_id": data.courier_id,
                "courier_name": courier["name"],
                "courier_phone": courier.get("phone"),
                "courier_fee": round(courier_fee, 2),
                "status": "assigned",
                "assigned_at": now,
                "updated_at": now
            },
            "$push": {"status_history": history_entry}
        }
    )
    
    # Kuryeye push notification gönder
    try:
        from services.push_notification_service import notify_courier_new_order
        order["order_number"] = order.get("order_number", "")
        order["restaurant_name"] = order.get("restaurant_name", "Restoran")
        await notify_courier_new_order(data.courier_id, order)
    except Exception as e:
        print(f"Push notification error: {e}")
    
    return {"message": f"Sipariş {courier['name']} kuryesine atandı"}


@router.delete("/{company_id}/{order_id}/assign")
async def unassign_courier(company_id: str, order_id: str, admin_name: Optional[str] = None):
    """Siparişten kurye atamasını kaldır"""
    order = await db.orders.find_one({"id": order_id, "company_id": company_id})
    if not order:
        raise HTTPException(status_code=404, detail="Sipariş bulunamadı")
    
    if not order.get("courier_id"):
        raise HTTPException(status_code=400, detail="Bu siparişe kurye atanmamış")
    
    # Sipariş teslim edilmiş veya yoldaysa atama kaldırılamaz
    if order.get("status") in ["delivered", "on_the_way"]:
        raise HTTPException(status_code=400, detail="Bu durumda kurye ataması kaldırılamaz")
    
    now = datetime.now(timezone.utc).isoformat()
    courier_name = order.get("courier_name", "Bilinmiyor")
    
    # History'ye ekle
    history_entry = {
        "status": "ready",
        "label": "Kurye Ataması Kaldırıldı",
        "timestamp": now,
        "note": f"Önceki kurye: {courier_name}",
        "actor_type": "admin" if admin_name else "system",
        "actor_name": admin_name or "Sistem"
    }
    
    await db.orders.update_one(
        {"id": order_id},
        {
            "$set": {
                "courier_id": None,
                "courier_name": None,
                "status": "ready",
                "assigned_at": None,
                "confirmed_at": None,
                "updated_at": now
            },
            "$push": {"status_history": history_entry}
        }
    )
    
    return {"message": "Kurye ataması kaldırıldı"}


@router.post("/{company_id}/{order_id}/status")
async def update_order_status(company_id: str, order_id: str, data: OrderStatusUpdate):
    """Sipariş durumunu güncelle (Admin için)"""
    order = await db.orders.find_one({"id": order_id, "company_id": company_id})
    if not order:
        raise HTTPException(status_code=404, detail="Sipariş bulunamadı")
    
    if data.status not in ORDER_STATUSES:
        raise HTTPException(status_code=400, detail="Geçersiz durum")
    
    # Admin sadece kurye onaylayabileceği durumları seçemez (super admin hariç)
    if data.status in COURIER_ONLY_STATUSES and not data.is_super_admin:
        raise HTTPException(
            status_code=400, 
            detail=f"'{ORDER_STATUSES[data.status]['label']}' durumu sadece kurye tarafından seçilebilir"
        )
    
    # Hazırlanıyor durumuna geçişte süre zorunlu (super admin hariç)
    if data.status == "preparing" and not data.preparation_time and not data.is_super_admin:
        raise HTTPException(
            status_code=400,
            detail="Hazırlanıyor durumu için süre belirtilmeli"
        )
    
    now = datetime.now(timezone.utc)
    
    update_fields = {
        "status": data.status,
        "updated_at": now.isoformat()
    }
    
    # History için note
    history_note = ""
    
    # Durum değiştiğinde geri sayımı sıfırla
    update_fields["preparation_end_at"] = None
    update_fields["preparation_time"] = None
    
    # Hazırlanıyor durumuna geçişte yeni geri sayım başlat
    if data.status == "preparing" and data.preparation_time:
        preparation_end_at = now + timedelta(minutes=data.preparation_time)
        update_fields["preparation_time"] = data.preparation_time
        update_fields["preparation_end_at"] = preparation_end_at.isoformat()
        history_note = f"Hazırlık süresi: {data.preparation_time} dakika"
    
    # Kurye ataması kaldırılacak durumlara geçişte kurye bilgisini sil
    if data.status in COURIER_REMOVAL_STATUSES:
        update_fields["courier_id"] = None
        update_fields["courier_name"] = None
        update_fields["assigned_at"] = None
        update_fields["confirmed_at"] = None
    
    if data.status == "delivered":
        update_fields["delivered_at"] = now.isoformat()
        # Ücretleri hesapla
        fees = await calculate_order_fees(order)
        update_fields["courier_fee"] = fees["courier_fee"]
        update_fields["restaurant_fee"] = fees["restaurant_fee"]
        update_fields["restaurant_kdv"] = fees["restaurant_kdv"]
        update_fields["pos_commission"] = fees["pos_commission"]
        update_fields["distance_km"] = fees["distance_km"]
    
    # History'ye ekle
    history_entry = {
        "status": data.status,
        "label": ORDER_STATUSES[data.status]["label"],
        "timestamp": now.isoformat(),
        "note": history_note,
        "actor_type": "admin" if data.admin_name else "system",
        "actor_name": data.admin_name or "Sistem"
    }
    
    await db.orders.update_one(
        {"id": order_id},
        {
            "$set": update_fields,
            "$push": {"status_history": history_entry}
        }
    )
    
    return {"message": f"Sipariş durumu güncellendi: {ORDER_STATUSES[data.status]['label']}"}


@router.delete("/{company_id}/{order_id}")
async def delete_order(company_id: str, order_id: str):
    """Siparişi sil (sadece mock siparişler için)"""
    result = await db.orders.delete_one({"id": order_id, "company_id": company_id, "source": "mock"})
    
    if result.deleted_count == 0:
        raise HTTPException(status_code=404, detail="Sipariş bulunamadı veya silinemez")
    
    return {"message": "Sipariş silindi"}


# --- Kurye için Endpoints ---

@router.get("/courier/{courier_id}/active")
async def get_courier_active_orders(courier_id: str):
    """Kuryenin aktif siparişlerini getir"""
    orders = await db.orders.find(
        {
            "courier_id": courier_id,
            "status": {"$nin": ["delivered", "cancelled"]}
        },
        {"_id": 0}
    ).sort("assigned_at", 1).to_list(20)
    
    return orders


@router.post("/courier/{courier_id}/order/{order_id}/confirm")
async def courier_confirm_order(courier_id: str, order_id: str):
    """Kurye siparişi kabul eder (Siparişi Gördüm)"""
    order = await db.orders.find_one({"id": order_id, "courier_id": courier_id})
    if not order:
        raise HTTPException(status_code=404, detail="Sipariş bulunamadı")
    
    if order["status"] != "assigned":
        raise HTTPException(status_code=400, detail="Bu sipariş onaylanamaz")
    
    # Kurye bilgisini al
    courier = await db.couriers.find_one({"id": courier_id}, {"_id": 0, "name": 1})
    courier_name = courier.get("name", "Kurye") if courier else "Kurye"
    
    now = datetime.now(timezone.utc).isoformat()
    
    # History entry
    history_entry = {
        "status": "confirmed",
        "label": "Onaylandı",
        "timestamp": now,
        "note": "Kurye siparişi gördü",
        "actor_type": "courier",
        "actor_name": courier_name
    }
    
    await db.orders.update_one(
        {"id": order_id},
        {
            "$set": {
                "status": "confirmed",
                "confirmed_at": now,
                "updated_at": now
            },
            "$push": {"status_history": history_entry}
        }
    )
    
    return {"message": "Sipariş onaylandı"}


@router.post("/courier/{courier_id}/order/{order_id}/pickup")
async def courier_pickup_order(courier_id: str, order_id: str):
    """Kurye siparişi restorandan aldı - Yola Çık"""
    order = await db.orders.find_one({"id": order_id, "courier_id": courier_id})
    if not order:
        raise HTTPException(status_code=404, detail="Sipariş bulunamadı")
    
    if order["status"] != "confirmed":
        raise HTTPException(status_code=400, detail="Önce siparişi onaylamalısınız")
    
    # Kurye bilgisini al
    courier = await db.couriers.find_one({"id": courier_id}, {"_id": 0, "name": 1})
    courier_name = courier.get("name", "Kurye") if courier else "Kurye"
    
    now = datetime.now(timezone.utc).isoformat()
    
    # History entry
    history_entry = {
        "status": "on_the_way",
        "label": "Yolda",
        "timestamp": now,
        "note": "Kurye yola çıktı",
        "actor_type": "courier",
        "actor_name": courier_name
    }
    
    await db.orders.update_one(
        {"id": order_id},
        {
            "$set": {
                "status": "on_the_way",
                "picked_up_at": now,
                "updated_at": now
            },
            "$push": {"status_history": history_entry}
        }
    )
    
    return {"message": "Sipariş yola çıktı"}


@router.post("/courier/{courier_id}/bulk-pickup")
async def courier_bulk_pickup(courier_id: str, data: BulkPickupRequest):
    """Kurye birden fazla siparişi toplu yola çıkarır - Aynı restorandan siparişler için"""
    if not data.order_ids or len(data.order_ids) == 0:
        raise HTTPException(status_code=400, detail="Sipariş seçilmedi")
    
    # Kurye bilgisini al
    courier = await db.couriers.find_one({"id": courier_id}, {"_id": 0, "name": 1})
    if not courier:
        raise HTTPException(status_code=404, detail="Kurye bulunamadı")
    courier_name = courier.get("name", "Kurye")
    
    # Siparişleri kontrol et
    orders = await db.orders.find({
        "id": {"$in": data.order_ids},
        "courier_id": courier_id,
        "status": "confirmed"
    }).to_list(100)
    
    if len(orders) == 0:
        raise HTTPException(status_code=400, detail="Yola çıkarılacak onaylanmış sipariş bulunamadı")
    
    # Aynı restorandan olduğunu kontrol et
    restaurant_ids = set(o.get("restaurant_id") for o in orders)
    if len(restaurant_ids) > 1:
        raise HTTPException(status_code=400, detail="Toplu yola çıkarma sadece aynı restorandan siparişler için geçerlidir")
    
    now = datetime.now(timezone.utc).isoformat()
    
    # Tüm siparişleri güncelle
    history_entry = {
        "status": "on_the_way",
        "label": "Yolda",
        "timestamp": now,
        "note": f"Kurye {len(orders)} siparişle yola çıktı",
        "actor_type": "courier",
        "actor_name": courier_name
    }
    
    result = await db.orders.update_many(
        {"id": {"$in": [o["id"] for o in orders]}},
        {
            "$set": {
                "status": "on_the_way",
                "picked_up_at": now,
                "updated_at": now
            },
            "$push": {"status_history": history_entry}
        }
    )
    
    return {"message": f"{result.modified_count} sipariş yola çıktı"}


@router.post("/courier/{courier_id}/order/{order_id}/not-ready")
async def courier_order_not_ready(courier_id: str, order_id: str):
    """Sipariş henüz hazır değil - 5dk hazırlık süresi ekle ve atamayı kaldır"""
    order = await db.orders.find_one({"id": order_id, "courier_id": courier_id})
    if not order:
        raise HTTPException(status_code=404, detail="Sipariş bulunamadı")
    
    if order["status"] not in ["assigned", "confirmed"]:
        raise HTTPException(status_code=400, detail="Bu işlem sadece atanmış veya onaylanmış siparişler için yapılabilir")
    
    # Kurye bilgisini al
    courier = await db.couriers.find_one({"id": courier_id}, {"_id": 0, "name": 1})
    courier_name = courier.get("name", "Kurye") if courier else "Kurye"
    
    now = datetime.now(timezone.utc)
    
    # 5 dakika hazırlık süresi ekle
    new_preparation_end = now + timedelta(minutes=5)
    
    # History entry
    history_entry = {
        "status": "preparing",
        "label": "Hazırlanıyor",
        "timestamp": now.isoformat(),
        "note": f"Sipariş hazır değil - {courier_name} tarafından geri gönderildi (+5dk)",
        "actor_type": "courier",
        "actor_name": courier_name
    }
    
    await db.orders.update_one(
        {"id": order_id},
        {
            "$set": {
                "status": "preparing",
                "courier_id": None,
                "courier_name": None,
                "preparation_end_at": new_preparation_end.isoformat(),
                "updated_at": now.isoformat(),
                "confirmed_at": None
            },
            "$push": {"status_history": history_entry}
        }
    )
    
    return {"message": "Sipariş hazırlanıyor olarak işaretlendi ve atama kaldırıldı"}


class PaymentDetails(BaseModel):
    cash_amount: float = 0
    card_amount: float = 0
    payment_method: Optional[str] = None  # "cash", "card", "mixed"

@router.post("/courier/{courier_id}/order/{order_id}/deliver")
async def courier_deliver_order(
    courier_id: str, 
    order_id: str,
    payment_details: Optional[PaymentDetails] = None
):
    """Kurye siparişi teslim etti"""
    order = await db.orders.find_one({"id": order_id, "courier_id": courier_id})
    if not order:
        raise HTTPException(status_code=404, detail="Sipariş bulunamadı")
    
    if order["status"] != "on_the_way":
        raise HTTPException(status_code=400, detail="Önce yola çıkmalısınız")
    
    # Kurye bilgisini al
    courier = await db.couriers.find_one({"id": courier_id}, {"_id": 0, "name": 1})
    courier_name = courier.get("name", "Kurye") if courier else "Kurye"
    
    now = datetime.now(timezone.utc).isoformat()
    
    # Ücretleri hesapla
    fees = await calculate_order_fees(order)
    
    # Ödeme bilgilerini hazırla
    update_data = {
        "status": "delivered",
        "delivered_at": now,
        "updated_at": now,
        "courier_fee": fees["courier_fee"],
        "restaurant_fee": fees["restaurant_fee"],
        "restaurant_kdv": fees["restaurant_kdv"],
        "pos_commission": fees["pos_commission"],
        "distance_km": fees["distance_km"]
    }
    
    # Eğer ödeme detayları gönderildiyse güncelle
    if payment_details:
        if payment_details.payment_method:
            update_data["payment_method"] = payment_details.payment_method
        
        # Parçalı ödeme detaylarını kaydet
        update_data["payment_details"] = {
            "cash_amount": payment_details.cash_amount,
            "card_amount": payment_details.card_amount,
            "original_method": order.get("payment_method", "unknown")
        }
    
    # History entry
    history_entry = {
        "status": "delivered",
        "label": "Teslim Edildi",
        "timestamp": now,
        "note": "Sipariş müşteriye teslim edildi",
        "actor_type": "courier",
        "actor_name": courier_name
    }
    
    await db.orders.update_one(
        {"id": order_id},
        {
            "$set": update_data,
            "$push": {"status_history": history_entry}
        }
    )
    
    return {"message": "Sipariş teslim edildi"}


@router.post("/courier/{courier_id}/order/{order_id}/reject")
async def courier_reject_order(courier_id: str, order_id: str, reason: Optional[str] = None):
    """Kurye siparişi reddeder"""
    order = await db.orders.find_one({"id": order_id, "courier_id": courier_id})
    if not order:
        raise HTTPException(status_code=404, detail="Sipariş bulunamadı")
    
    if order["status"] not in ["assigned", "confirmed"]:
        raise HTTPException(status_code=400, detail="Bu sipariş reddedilemez")
    
    # Kurye bilgisini al
    courier = await db.couriers.find_one({"id": courier_id}, {"_id": 0, "name": 1})
    courier_name = courier.get("name", "Kurye") if courier else "Kurye"
    
    now = datetime.now(timezone.utc).isoformat()
    
    # History entry
    history_entry = {
        "status": "ready",
        "label": "Kurye Reddetti",
        "timestamp": now,
        "note": f"Kurye: {courier_name}" + (f", Sebep: {reason}" if reason else ""),
        "actor_type": "courier",
        "actor_name": courier_name
    }
    
    # Kuryeyi siparişten çıkar, sipariş tekrar atanabilir duruma gelir
    await db.orders.update_one(
        {"id": order_id},
        {
            "$set": {
                "courier_id": None,
                "courier_name": None,
                "status": "ready",  # Tekrar atanmaya hazır
                "rejection_reason": reason,
                "rejected_at": now,
                "updated_at": now
            },
            "$push": {"status_history": history_entry}
        }
    )
    
    return {"message": "Sipariş reddedildi, başka kuryeye atanabilir"}


# --- Sipariş Ücret Güncelleme (Sadece Super Admin) ---
@router.put("/{order_id}/fees")
async def update_order_fees(order_id: str, data: OrderFeesUpdate):
    """Sipariş ücretlerini güncelle (sadece super admin)"""
    order = await db.orders.find_one({"id": order_id})
    if not order:
        raise HTTPException(status_code=404, detail="Sipariş bulunamadı")
    
    # Sadece teslim edilmiş siparişlerin ücreti değiştirilebilir
    if order.get("status") != "delivered":
        raise HTTPException(status_code=400, detail="Sadece teslim edilmiş siparişlerin ücreti değiştirilebilir")
    
    update_data = {"updated_at": datetime.now(timezone.utc).isoformat()}
    
    if data.courier_fee is not None:
        update_data["courier_fee"] = round(data.courier_fee, 2)
    
    if data.restaurant_fee is not None:
        update_data["restaurant_fee"] = round(data.restaurant_fee, 2)
    
    if data.restaurant_kdv is not None:
        update_data["restaurant_kdv"] = round(data.restaurant_kdv, 2)
    
    if data.pos_commission is not None:
        update_data["pos_commission"] = round(data.pos_commission, 2)
    
    # History entry for audit trail
    kdv_info = f", KDV: {data.restaurant_kdv}₺" if data.restaurant_kdv else ""
    pos_info = f", POS: {data.pos_commission}₺" if data.pos_commission else ""
    history_entry = {
        "status": "fee_updated",
        "label": "Ücret Güncellendi",
        "timestamp": datetime.now(timezone.utc).isoformat(),
        "note": f"Kurye: {data.courier_fee}₺, Restoran: {data.restaurant_fee}₺{kdv_info}{pos_info}",
        "actor_type": "super_admin",
        "actor_name": data.admin_name or "Admin"
    }
    
    await db.orders.update_one(
        {"id": order_id},
        {
            "$set": update_data,
            "$push": {"status_history": history_entry}
        }
    )
    
    return {
        "message": "Ücretler güncellendi",
        "courier_fee": update_data.get("courier_fee", order.get("courier_fee")),
        "restaurant_fee": update_data.get("restaurant_fee", order.get("restaurant_fee")),
        "restaurant_kdv": update_data.get("restaurant_kdv", order.get("restaurant_kdv")),
        "pos_commission": update_data.get("pos_commission", order.get("pos_commission"))
    }


# --- Manuel Sipariş Oluşturma (Restoran Paneli) ---

@router.post("/manual")
async def create_manual_order(data: ManualOrderCreate):
    """Restoran panelinden manuel sipariş oluştur (telefon siparişleri için)"""
    
    # Restoran bilgisini al
    restaurant = await db.restaurants.find_one(
        {"id": data.restaurant_id},
        {"_id": 0, "id": 1, "name": 1, "latitude": 1, "longitude": 1, "company_id": 1, "preparation_time": 1, "product_preparation_times": 1}
    )
    
    if not restaurant:
        raise HTTPException(status_code=404, detail="Restoran bulunamadı")
    
    now = datetime.now(timezone.utc)
    
    # Sipariş numarası oluştur
    order_number = f"TEL-{random.randint(1000, 9999)}"
    
    # Toplam tutarı hesapla
    total_amount = sum(item.price * item.quantity for item in data.items)
    
    # Items listesi oluştur
    items = [
        {
            "product_id": item.product_id,
            "name": item.name,
            "quantity": item.quantity,
            "price": item.price
        }
        for item in data.items
    ]
    
    # Hazırlık süresini hesapla (standart + ürün bazlı ekstra)
    prep_time = calculate_preparation_time(restaurant, items)
    
    # Programlı sipariş kontrolü
    if data.is_scheduled and data.scheduled_time:
        # Scheduled time'ı parse et
        try:
            scheduled_dt = datetime.fromisoformat(data.scheduled_time.replace('Z', '+00:00'))
            # 30 dakikalık tampon ekle (kullanıcı istediği için)
            buffer_minutes = 30
            # Hazırlık bitiş zamanı = scheduled_time - buffer (kurye teslim zamanı)
            preparation_end_at = scheduled_dt - timedelta(minutes=buffer_minutes)
            
            initial_status = "scheduled"
            history_note = f"Programlı teslimat: {scheduled_dt.strftime('%d.%m.%Y %H:%M')}"
        except Exception as e:
            raise HTTPException(status_code=400, detail=f"Geçersiz tarih formatı: {str(e)}")
    else:
        preparation_end_at = now + timedelta(minutes=prep_time)
        initial_status = "preparing"
        history_note = f"Hazırlık süresi: {prep_time} dakika"
    
    # Sipariş oluştur
    order = {
        "id": str(uuid.uuid4()),
        "order_number": order_number,
        "company_id": restaurant.get("company_id"),
        "restaurant_id": data.restaurant_id,
        "restaurant_name": restaurant.get("name"),
        "restaurant_location": {
            "latitude": restaurant.get("latitude"),
            "longitude": restaurant.get("longitude")
        },
        "customer_name": data.customer_name,
        "customer_phone": data.customer_phone or "",
        "delivery_address": data.delivery_address,
        "delivery_location": {
            "latitude": data.delivery_location.lat,
            "longitude": data.delivery_location.lng
        } if data.delivery_location else None,
        "items": items,
        "total_amount": total_amount,
        "payment_method": data.payment_method,
        "status": initial_status,
        "preparation_time": prep_time,
        "preparation_end_at": preparation_end_at.isoformat(),
        "courier_id": None,
        "courier_name": None,
        "assigned_at": None,
        "confirmed_at": None,
        "delivered_at": None,
        "notes": data.notes or "",
        "source": "manual",  # manuel, adisyo, mock gibi
        "is_scheduled": data.is_scheduled,
        "scheduled_time": data.scheduled_time if data.is_scheduled else None,
        "created_at": now.isoformat(),
        "updated_at": now.isoformat(),
        "status_history": [
            {
                "status": initial_status,
                "label": "Programlı Sipariş" if data.is_scheduled else "Sipariş Alındı",
                "timestamp": now.isoformat(),
                "note": history_note,
                "actor_type": "restaurant",
                "actor_name": "Restoran Paneli"
            }
        ]
    }
    
    # Veritabanına kaydet
    await db.orders.insert_one(order)
    
    # _id'yi kaldır
    order.pop("_id", None)
    
    return {
        "message": "Sipariş başarıyla oluşturuldu",
        "order": order
    }

