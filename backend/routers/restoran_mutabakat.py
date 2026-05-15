"""
Restoran Mütabakat API
- Hafta bazlı restoran mütabakat görüntüleme
- Toplu mütabakat onaylama (restoran bakiyesine)
- Geri alma
- Otomatik işleme ayarları
"""
from fastapi import APIRouter, HTTPException, Depends
from pydantic import BaseModel
from typing import List, Optional
from datetime import datetime, timezone, timedelta
import uuid

from utils.database import db
from utils.helpers import ensure_turkey_timezone, get_turkey_now, TURKEY_TZ
from utils.jwt_utils import require_auth

router = APIRouter(prefix="/api/restoran-mutabakat", tags=["Restoran Mütabakat"], dependencies=[Depends(require_auth)])


class WeekInfo(BaseModel):
    week_start: str  # ISO format
    week_end: str    # ISO format
    label: str       # "10-17 Şubat 2026"


class ApplyMutabakatItem(BaseModel):
    restaurant_id: str
    restaurant_name: str
    order_count: int
    delivery_fee: float
    delivery_vat: float
    total_delivery: float
    pos_commission: float
    cash_amount: float
    card_amount: float
    net_amount: float  # Sonuç


class ApplyMutabakatRequest(BaseModel):
    week_start: str
    week_end: str
    items: List[ApplyMutabakatItem]
    admin_id: str
    admin_name: str


class RevertMutabakatRequest(BaseModel):
    week_start: str
    week_end: str
    admin_id: str
    admin_name: str
    restaurant_ids: Optional[List[str]] = None


class AutoSettingsUpdate(BaseModel):
    enabled: bool


def get_weeks_list(opening_time: str, closing_time: str, count: int = 8) -> List[dict]:
    """Son N hafta listesini oluştur (Türkiye saati baz alınır)"""
    # Türkiye saatine göre şu anki zaman
    turkey_tz = timezone(timedelta(hours=3))
    now = datetime.now(turkey_tz)
    day = now.weekday()  # 0=Pazartesi
    
    # Bu haftanın pazartesini bul
    this_monday = now - timedelta(days=day)
    
    # Saatleri parse et
    open_h, open_m = map(int, opening_time.split(':'))
    close_h, close_m = map(int, closing_time.split(':'))
    
    weeks = []
    for i in range(count):
        base_monday = this_monday - timedelta(weeks=i)
        week_start = base_monday.replace(hour=open_h, minute=open_m, second=0, microsecond=0, tzinfo=turkey_tz)
        
        week_end = (base_monday + timedelta(weeks=1)).replace(hour=close_h, minute=close_m, second=0, microsecond=0, tzinfo=turkey_tz)
        
        # Label oluştur - başlangıç ve bitiş aylarını ayrı kontrol et
        start_day = week_start.day
        end_day = week_end.day
        start_month = week_start.month
        end_month = week_end.month
        year = week_start.year
        
        # Türkçe ay isimleri
        month_names = {
            1: "Ocak", 2: "Şubat", 3: "Mart", 4: "Nisan", 5: "Mayıs", 6: "Haziran",
            7: "Temmuz", 8: "Ağustos", 9: "Eylül", 10: "Ekim", 11: "Kasım", 12: "Aralık"
        }
        
        if start_month == end_month:
            label = f"{start_day}-{end_day} {month_names[start_month]} {year}"
        else:
            label = f"{start_day} {month_names[start_month]} - {end_day} {month_names[end_month]} {year}"
        
        # Türkiye saati olarak döndür (DB'de Türkiye saati kaydediliyor)
        weeks.append({
            "week_start": week_start.isoformat(),
            "week_end": week_end.isoformat(),
            "label": label,
            "is_current": i == 0
        })
    
    return weeks
    
    return weeks


def get_mutabakat_description(start_dt: datetime, end_dt: datetime) -> str:
    """Mütabakat açıklama metni oluştur"""
    start_day = start_dt.strftime("%d")
    end_day = end_dt.strftime("%d")
    month = start_dt.strftime("%B")
    
    month_tr = {
        "January": "Ocak", "February": "Şubat", "March": "Mart",
        "April": "Nisan", "May": "Mayıs", "June": "Haziran",
        "July": "Temmuz", "August": "Ağustos", "September": "Eylül",
        "October": "Ekim", "November": "Kasım", "December": "Aralık"
    }.get(month, month)
    
    return f"{start_day}-{end_day} {month_tr} Mütabakat Sonucu"


@router.get("/weeks/{company_id}")
async def get_available_weeks(company_id: str):
    """Şirket çalışma saatlerine göre hafta listesini döndür"""
    company = await db.companies.find_one(
        {"id": company_id},
        {"_id": 0, "opening_time": 1, "closing_time": 1}
    )
    
    opening_time = company.get("opening_time", "06:00") if company else "06:00"
    closing_time = company.get("closing_time", "06:00") if company else "06:00"
    
    weeks = get_weeks_list(opening_time, closing_time)
    
    return {
        "weeks": weeks,
        "opening_time": opening_time,
        "closing_time": closing_time
    }


class DateRangeRequest(BaseModel):
    start_datetime: str  # ISO format
    end_datetime: str    # ISO format


@router.post("/restaurant/{restaurant_id}")
async def get_restaurant_mutabakat(restaurant_id: str, date_range: DateRangeRequest):
    """Tek bir restoran için mütabakat verilerini getir (tarih aralığına göre)"""
    import logging
    import math
    logger = logging.getLogger(__name__)
    
    # Restoran bilgisini al
    restaurant = await db.restaurants.find_one(
        {"id": restaurant_id},
        {"_id": 0, "id": 1, "name": 1, "company_id": 1, "collection_settings": 1, 
         "pricing_type": 1, "per_package_price": 1, "km_ranges": 1, "kdv_rate": 1}
    )
    
    if not restaurant:
        raise HTTPException(status_code=404, detail="Restoran bulunamadı")
    
    company_id = restaurant["company_id"]
    
    try:
        start_dt_str = ensure_turkey_timezone(date_range.start_datetime)
        end_dt_str = ensure_turkey_timezone(date_range.end_datetime)
        start_dt = datetime.fromisoformat(start_dt_str)
        end_dt = datetime.fromisoformat(end_dt_str)
    except ValueError:
        raise HTTPException(status_code=400, detail="Geçersiz tarih formatı")
    
    logger.info(f"Restoran mutabakat - restaurant_id: {restaurant_id}, start: {start_dt.isoformat()}, end: {end_dt.isoformat()}")
    
    # Şirket ayarlarını al
    company = await db.companies.find_one(
        {"id": company_id},
        {"_id": 0, "vat_rate": 1, "pos_commission_rate": 1}
    )
    
    default_vat_rate = company.get("vat_rate", 10) if company else 10
    pos_commission_rate = company.get("pos_commission_rate", 0) if company else 0
    restaurant_kdv_rate = restaurant.get("kdv_rate") if restaurant.get("kdv_rate") is not None else default_vat_rate
    
    # Tahsilat ayarları
    collection_settings = restaurant.get("collection_settings", {})
    cash_included = collection_settings.get("cash_collection", "courier") == "courier"
    card_included = collection_settings.get("card_collection", "courier") == "courier"
    meal_card_included = collection_settings.get("meal_card_collection", "courier") == "courier"
    
    # Siparişleri getir
    turkey_tz = timezone(timedelta(hours=3))
    all_orders = await db.orders.find(
        {
            "restaurant_id": restaurant_id,
            "status": "delivered",
            "is_restaurant_delivery": {"$ne": True}
        },
        {
            "_id": 0, 
            "total_amount": 1,
            "delivery_fee": 1,
            "restaurant_fee": 1,
            "payment_method": 1,
            "restaurant_location": 1,
            "delivery_location": 1,
            "delivered_at": 1
        }
    ).to_list(10000)
    
    # Tarih filtreleme
    orders = []
    for order in all_orders:
        delivered_at = order.get("delivered_at")
        if not delivered_at:
            continue
        try:
            if isinstance(delivered_at, str):
                order_dt = datetime.fromisoformat(delivered_at.replace('Z', '+00:00'))
            else:
                order_dt = delivered_at
            
            if order_dt.tzinfo is None:
                order_dt = order_dt.replace(tzinfo=turkey_tz)
            
            if start_dt <= order_dt <= end_dt:
                orders.append(order)
        except:
            continue
    
    # Mesafe hesaplama
    def calculate_distance(loc1, loc2):
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
    
    def calculate_fee_from_pricing(pricing_type, per_package_price, km_ranges, distance_km):
        if pricing_type == "per_package":
            return per_package_price or 0.0
        elif pricing_type == "per_km" and km_ranges:
            for km_range in km_ranges:
                min_km = km_range.get("min_km", 0)
                max_km = km_range.get("max_km")
                price = km_range.get("price", 0)
                if max_km is None:
                    if distance_km >= min_km:
                        return price
                else:
                    if min_km <= distance_km < max_km:
                        return price
        return 0.0
    
    # Agregasyon
    order_count = 0
    delivery_fee = 0
    cash_amount = 0
    card_amount = 0
    online_amount = 0
    meal_card_amount = 0
    
    for order in orders:
        order_count += 1
        
        # Taşıma ücreti
        order_delivery_fee = order.get("delivery_fee") or order.get("restaurant_fee") or 0
        if order_delivery_fee == 0:
            distance_km = calculate_distance(
                order.get("restaurant_location"),
                order.get("delivery_location")
            )
            order_delivery_fee = calculate_fee_from_pricing(
                restaurant.get("pricing_type", "per_package"),
                restaurant.get("per_package_price", 0),
                restaurant.get("km_ranges", []),
                distance_km
            )
        delivery_fee += order_delivery_fee
        
        payment = order.get("payment_method", "cash")
        total = order.get("total_amount", 0)
        
        if payment == "cash":
            cash_amount += total
        elif payment in ["meal_card", "online_meal_card"]:
            meal_card_amount += total
        elif payment in ["card", "credit_card"]:
            card_amount += total
        elif payment == "online":
            online_amount += total
    
    # Hesaplamalar
    delivery_vat = delivery_fee * (restaurant_kdv_rate / 100)
    total_delivery = delivery_fee + delivery_vat
    
    cash_for_calc = cash_amount if cash_included else 0
    card_for_calc = card_amount if card_included else 0
    meal_card_for_calc = meal_card_amount if meal_card_included else 0
    
    pos_commission = card_for_calc * (pos_commission_rate / 100)
    net_amount = (total_delivery + pos_commission) - (cash_for_calc + card_for_calc + meal_card_for_calc)
    
    return {
        "restaurant_id": restaurant_id,
        "restaurant_name": restaurant["name"],
        "order_count": order_count,
        "delivery_fee": round(delivery_fee, 2),
        "delivery_vat": round(delivery_vat, 2),
        "total_delivery": round(total_delivery, 2),
        "pos_commission": round(pos_commission, 2),
        "cash_amount": round(cash_amount, 2),
        "card_amount": round(card_amount, 2),
        "online_amount": round(online_amount, 2),
        "meal_card_amount": round(meal_card_amount, 2),
        "net_amount": round(net_amount, 2),
        "vat_rate": restaurant_kdv_rate,
        "pos_commission_rate": pos_commission_rate,
        "cash_included": cash_included,
        "card_included": card_included,
        "meal_card_included": meal_card_included
    }


@router.post("/data/{company_id}")
async def get_week_mutabakat_data(company_id: str, week: WeekInfo):
    """Seçili hafta için restoran mütabakat verilerini getir"""
    import logging
    logger = logging.getLogger(__name__)
    
    try:
        # Frontend Türkiye saati gönderiyor, +03:00 formatına çevir
        start_dt_str = ensure_turkey_timezone(week.week_start)
        end_dt_str = ensure_turkey_timezone(week.week_end)
        start_dt = datetime.fromisoformat(start_dt_str)
        end_dt = datetime.fromisoformat(end_dt_str)
            
    except ValueError:
        raise HTTPException(status_code=400, detail="Geçersiz tarih formatı")
    
    logger.info(f"Mutabakat sorgusu - company_id: {company_id}, start: {start_dt.isoformat()}, end: {end_dt.isoformat()}")
    
    # Şirkete ait restoranları getir (collection_settings, pricing ve kdv_rate dahil)
    restaurants = await db.restaurants.find(
        {"company_id": company_id, "is_archived": {"$ne": True}},
        {"_id": 0, "id": 1, "name": 1, "collection_settings": 1, "pricing_type": 1, "per_package_price": 1, "km_ranges": 1, "kdv_rate": 1}
    ).to_list(500)
    
    logger.info(f"Bulunan restoran sayısı: {len(restaurants)}")
    
    if not restaurants:
        return {"restaurants": [], "summary": {"total_orders": 0, "total_net": 0}}
    
    restaurant_map = {r["id"]: r for r in restaurants}
    restaurant_ids = list(restaurant_map.keys())
    
    # Bu hafta için daha önce işlenmiş mütabakatları kontrol et
    processed_records = await db.restoran_mutabakat_records.find(
        {
            "company_id": company_id,
            "week_start": week.week_start,
            "week_end": week.week_end
        },
        {"_id": 0, "restaurant_id": 1, "transaction_id": 1}
    ).to_list(500)
    
    processed_map = {r["restaurant_id"]: r["transaction_id"] for r in processed_records}
    
    # Teslim edilen siparişleri getir (tarih filtresi Python'da yapılacak)
    all_orders = await db.orders.find(
        {
            "company_id": company_id,
            "restaurant_id": {"$in": restaurant_ids},
            "status": "delivered",
            "is_restaurant_delivery": {"$ne": True}
        },
        {
            "_id": 0, 
            "restaurant_id": 1, 
            "total_amount": 1,
            "delivery_fee": 1,
            "restaurant_fee": 1,
            "payment_method": 1,
            "restaurant_location": 1,
            "delivery_location": 1,
            "delivered_at": 1
        }
    ).to_list(10000)
    
    # Python'da delivered_at ile tarih filtrelemesi (Türkiye saati)
    turkey_tz = timezone(timedelta(hours=3))
    orders = []
    for order in all_orders:
        delivered_at = order.get("delivered_at")
        if not delivered_at:
            continue
        try:
            if isinstance(delivered_at, str):
                order_dt = datetime.fromisoformat(delivered_at.replace('Z', '+00:00'))
            else:
                order_dt = delivered_at
            
            # Türkiye saati olarak kabul et (eğer timezone yoksa)
            if order_dt.tzinfo is None:
                order_dt = order_dt.replace(tzinfo=turkey_tz)
            
            if start_dt <= order_dt <= end_dt:
                orders.append(order)
        except:
            continue
    
    logger.info(f"Bulunan sipariş sayısı: {len(orders)}")
    
    # Şirket ayarlarını al (KDV oranı, POS komisyonu)
    company = await db.companies.find_one(
        {"id": company_id},
        {"_id": 0, "vat_rate": 1, "pos_commission_rate": 1}
    )
    
    # Şirket varsayılan KDV ve POS oranları (restoranda tanımlı değilse kullanılır)
    default_vat_rate = company.get("vat_rate", 10) if company else 10  # %10 varsayılan KDV
    pos_commission_rate = company.get("pos_commission_rate", 0) if company else 0  # Tanımlı değilse 0
    
    # Restoran bazlı agregasyon
    restaurant_data = {}
    for r in restaurants:
        # Tahsilat ayarlarını al
        collection_settings = r.get("collection_settings", {})
        # Restoran KDV oranı - restoranda tanımlıysa onu kullan, yoksa şirket varsayılanı
        restaurant_kdv_rate = r.get("kdv_rate") if r.get("kdv_rate") is not None else default_vat_rate
        restaurant_data[r["id"]] = {
            "restaurant_id": r["id"],
            "restaurant_name": r["name"],
            "order_count": 0,
            "delivery_fee": 0,
            "cash_amount": 0,
            "card_amount": 0,
            "online_amount": 0,
            "meal_card_amount": 0,
            # Tahsilat ayarları - "courier" ise mütabakata dahil, "restaurant" ise hariç
            "cash_included": collection_settings.get("cash_collection", "courier") == "courier",
            "card_included": collection_settings.get("card_collection", "courier") == "courier",
            "meal_card_included": collection_settings.get("meal_card_collection", "courier") == "courier",
            # Pricing ayarları (dinamik hesaplama için)
            "pricing_type": r.get("pricing_type", "per_package"),
            "per_package_price": r.get("per_package_price", 0),
            "km_ranges": r.get("km_ranges", []),
            # KDV oranı (restoran bazlı)
            "kdv_rate": restaurant_kdv_rate
        }
    
    # Mesafe hesaplama fonksiyonu
    def calculate_distance(loc1, loc2):
        """Haversine formula ile mesafe hesapla (km)"""
        import math
        if not loc1 or not loc2:
            return 0.0
        lat1 = loc1.get("latitude") or loc1.get("lat") or 0
        lng1 = loc1.get("longitude") or loc1.get("lng") or 0
        lat2 = loc2.get("latitude") or loc2.get("lat") or 0
        lng2 = loc2.get("longitude") or loc2.get("lng") or 0
        if not all([lat1, lng1, lat2, lng2]):
            return 0.0
        R = 6371  # Dünya yarıçapı km
        dLat = math.radians(lat2 - lat1)
        dLon = math.radians(lng2 - lng1)
        a = math.sin(dLat/2) ** 2 + math.cos(math.radians(lat1)) * math.cos(math.radians(lat2)) * math.sin(dLon/2) ** 2
        c = 2 * math.atan2(math.sqrt(a), math.sqrt(1-a))
        return R * c
    
    # Ücret hesaplama fonksiyonu
    def calculate_fee_from_pricing(pricing_type, per_package_price, km_ranges, distance_km):
        """Ücretlendirme ayarına göre ücret hesapla"""
        if pricing_type == "per_package":
            return per_package_price or 0.0
        elif pricing_type == "per_km" and km_ranges:
            for km_range in km_ranges:
                min_km = km_range.get("min_km", 0)
                max_km = km_range.get("max_km")
                price = km_range.get("price", 0)
                if max_km is None:
                    if distance_km >= min_km:
                        return price
                else:
                    if min_km <= distance_km < max_km:
                        return price
        return 0.0
    
    for order in orders:
        rid = order.get("restaurant_id")
        if rid not in restaurant_data:
            continue
        
        data = restaurant_data[rid]
        data["order_count"] += 1
        
        # Taşıma ücreti hesaplama - önce siparişte kayıtlı değere bak
        order_delivery_fee = order.get("delivery_fee") or order.get("restaurant_fee") or 0
        
        # Eğer siparişte ücret yoksa, restoran ayarlarından hesapla
        if order_delivery_fee == 0 and (data["per_package_price"] > 0 or data["km_ranges"]):
            distance_km = calculate_distance(
                order.get("restaurant_location"),
                order.get("delivery_location")
            )
            order_delivery_fee = calculate_fee_from_pricing(
                data["pricing_type"],
                data["per_package_price"],
                data["km_ranges"],
                distance_km
            )
        
        data["delivery_fee"] += order_delivery_fee
        
        payment = order.get("payment_method", "cash")
        total = order.get("total_amount", 0)
        
        if payment == "cash":
            data["cash_amount"] += total
        elif payment in ["meal_card", "online_meal_card"]:
            data["meal_card_amount"] += total
        elif payment in ["card", "credit_card"]:
            data["card_amount"] += total
        elif payment == "online":
            data["online_amount"] += total
    
    # Hesaplamaları yap ve sonuç listesi oluştur
    result = []
    total_orders = 0
    total_net = 0
    
    for rid, data in restaurant_data.items():
        if data["order_count"] == 0:
            continue
        
        # Hesaplamalar - Restoran bazlı KDV oranı kullan
        delivery_fee = data["delivery_fee"]
        restaurant_vat_rate = data.get("kdv_rate", default_vat_rate)  # Restoran KDV oranı
        delivery_vat = delivery_fee * (restaurant_vat_rate / 100)
        total_delivery = delivery_fee + delivery_vat
        
        # Tahsilat ayarlarına göre mütabakata dahil edilecek tutarları belirle
        cash_for_calc = data["cash_amount"] if data["cash_included"] else 0
        card_for_calc = data["card_amount"] if data["card_included"] else 0
        meal_card_for_calc = data["meal_card_amount"] if data["meal_card_included"] else 0
        
        # POS komisyonu sadece dahil edilen kart tutarı üzerinden (yemek kartı dahil değil)
        pos_commission = card_for_calc * (pos_commission_rate / 100)
        
        # Net tutar: (Taşıma + KDV + POS) - (Nakit + Kart + Yemek Kartı) - sadece dahil edilenler
        net_amount = (total_delivery + pos_commission) - (cash_for_calc + card_for_calc + meal_card_for_calc)
        
        result.append({
            "restaurant_id": rid,
            "restaurant_name": data["restaurant_name"],
            "order_count": data["order_count"],
            "delivery_fee": round(delivery_fee, 2),
            "delivery_vat": round(delivery_vat, 2),
            "total_delivery": round(total_delivery, 2),
            "pos_commission": round(pos_commission, 2),
            "cash_amount": round(data["cash_amount"], 2),
            "card_amount": round(data["card_amount"], 2),
            "online_amount": round(data["online_amount"], 2),
            "meal_card_amount": round(data["meal_card_amount"], 2),
            "net_amount": round(net_amount, 2),
            "is_processed": rid in processed_map,
            "transaction_id": processed_map.get(rid),
            # Tahsilat dahil/hariç bilgisi (frontend renklendirme için)
            "cash_included": data["cash_included"],
            "card_included": data["card_included"],
            "meal_card_included": data["meal_card_included"]
        })
        
        total_orders += data["order_count"]
        total_net += net_amount
    
    # Sipariş sayısına göre sırala
    result.sort(key=lambda x: x["order_count"], reverse=True)
    
    return {
        "restaurants": result,
        "summary": {
            "total_orders": total_orders,
            "total_net": round(total_net, 2),
            "restaurant_count": len(result)
        },
        "week_description": get_mutabakat_description(start_dt, end_dt),
        "vat_rate": default_vat_rate,
        "pos_commission_rate": pos_commission_rate
    }


@router.post("/apply/{company_id}")
async def apply_mutabakat(company_id: str, data: ApplyMutabakatRequest):
    """Seçili restoranların mütabakatını onayla ve bakiyeye ekle"""
    if not data.items:
        raise HTTPException(status_code=400, detail="İşlenecek restoran seçilmedi")
    
    try:
        start_dt_str = ensure_turkey_timezone(data.week_start)
        end_dt_str = ensure_turkey_timezone(data.week_end)
        start_dt = datetime.fromisoformat(start_dt_str)
        end_dt = datetime.fromisoformat(end_dt_str)
    except ValueError:
        raise HTTPException(status_code=400, detail="Geçersiz tarih formatı")
    
    description = get_mutabakat_description(start_dt, end_dt)
    now = get_turkey_now()
    
    processed_count = 0
    skipped_count = 0
    
    for item in data.items:
        # Daha önce işlenmiş mi kontrol et
        existing = await db.restoran_mutabakat_records.find_one({
            "company_id": company_id,
            "restaurant_id": item.restaurant_id,
            "week_start": data.week_start,
            "week_end": data.week_end
        })
        
        if existing:
            skipped_count += 1
            continue
        
        # Net tutara göre işlem tipi belirle
        # Negatif = Alınan (restoran alacaklı, admin borçlu)
        # Pozitif = Verilen (restoran borçlu, admin alacaklı)
        transaction_type = "payment_in" if item.net_amount < 0 else "payment_out"
        amount = abs(item.net_amount)
        
        if amount == 0:
            skipped_count += 1
            continue
        
        # İşlem oluştur - entity_type: "restaurant" kullan
        transaction_id = str(uuid.uuid4())
        transaction = {
            "id": transaction_id,
            "company_id": company_id,
            "entity_type": "restaurant",
            "entity_id": item.restaurant_id,
            "type": transaction_type,
            "amount": amount,
            "description": f"{item.restaurant_name} - {description}",
            "notes": f"Sipariş: {item.order_count}, Taşıma: {item.total_delivery:.2f}, POS: {item.pos_commission:.2f}, Nakit: {item.cash_amount:.2f}, Kart: {item.card_amount:.2f}",
            "date": now,
            "created_at": now,
            "created_by": data.admin_id,
            "created_by_name": data.admin_name,
            "source": "restoran_mutabakat"
        }
        
        await db.transactions.insert_one(transaction)
        
        # Mütabakat kaydı oluştur
        mutabakat_record = {
            "id": str(uuid.uuid4()),
            "company_id": company_id,
            "restaurant_id": item.restaurant_id,
            "restaurant_name": item.restaurant_name,
            "week_start": data.week_start,
            "week_end": data.week_end,
            "transaction_id": transaction_id,
            "order_count": item.order_count,
            "delivery_fee": item.delivery_fee,
            "delivery_vat": item.delivery_vat,
            "total_delivery": item.total_delivery,
            "pos_commission": item.pos_commission,
            "cash_amount": item.cash_amount,
            "card_amount": item.card_amount,
            "net_amount": item.net_amount,
            "processed_at": now,
            "processed_by": data.admin_id,
            "processed_by_name": data.admin_name
        }
        
        await db.restoran_mutabakat_records.insert_one(mutabakat_record)
        processed_count += 1
    
    return {
        "success": True,
        "message": f"{processed_count} restoran mütabakatı işlendi" + (f", {skipped_count} atlandı" if skipped_count else ""),
        "processed_count": processed_count,
        "skipped_count": skipped_count
    }


@router.post("/revert/{company_id}")
async def revert_mutabakat(company_id: str, data: RevertMutabakatRequest):
    """Seçili restoranların mütabakatını geri al"""
    query = {
        "company_id": company_id,
        "week_start": data.week_start,
        "week_end": data.week_end
    }
    
    if data.restaurant_ids:
        query["restaurant_id"] = {"$in": data.restaurant_ids}
    
    # İşlenmiş kayıtları bul
    records = await db.restoran_mutabakat_records.find(query, {"_id": 0}).to_list(500)
    
    if not records:
        raise HTTPException(status_code=404, detail="Geri alınacak kayıt bulunamadı")
    
    reverted_count = 0
    
    for record in records:
        # Transaction'ı sil
        if record.get("transaction_id"):
            await db.transactions.delete_one({"id": record["transaction_id"]})
        
        # Mütabakat kaydını sil
        await db.restoran_mutabakat_records.delete_one({"id": record["id"]})
        reverted_count += 1
    
    return {
        "success": True,
        "message": f"{reverted_count} restoran mütabakatı geri alındı",
        "reverted_count": reverted_count
    }


@router.get("/auto-settings/{company_id}")
async def get_auto_settings(company_id: str):
    """Otomatik işleme ayarlarını getir"""
    settings = await db.restoran_mutabakat_settings.find_one(
        {"company_id": company_id},
        {"_id": 0}
    )
    
    return {
        "enabled": settings.get("enabled", False) if settings else False,
        "last_auto_run": settings.get("last_auto_run") if settings else None
    }


@router.put("/auto-settings/{company_id}")
async def update_auto_settings(company_id: str, data: AutoSettingsUpdate):
    """Otomatik işleme ayarlarını güncelle"""
    await db.restoran_mutabakat_settings.update_one(
        {"company_id": company_id},
        {
            "$set": {
                "company_id": company_id,
                "enabled": data.enabled,
                "updated_at": get_turkey_now()
            }
        },
        upsert=True
    )
    
    return {"success": True, "enabled": data.enabled}



class CiroRequest(BaseModel):
    start_datetime: str
    end_datetime: str


@router.post("/ciro/restaurant/{restaurant_id}")
async def get_restaurant_ciro(restaurant_id: str, req: CiroRequest):
    """Restoran ciro raporu - ödeme yöntemlerine göre + platform kırılımı"""
    
    # Restoran kontrolü
    restaurant = await db.restaurants.find_one(
        {"id": restaurant_id},
        {"_id": 0, "id": 1, "name": 1, "company_id": 1}
    )
    
    if not restaurant:
        raise HTTPException(status_code=404, detail="Restoran bulunamadı")
    
    # Tarihleri parse et
    start_dt = ensure_turkey_timezone(req.start_datetime)
    end_dt = ensure_turkey_timezone(req.end_datetime)
    
    # Teslim edilen siparişleri çek
    orders = await db.orders.find({
        "restaurant_id": restaurant_id,
        "status": "delivered",
        "delivered_at": {"$gte": start_dt, "$lte": end_dt}
    }, {"_id": 0, "total_amount": 1, "payment_method": 1, "customer_name": 1,
        "delivery_address": 1, "order_number": 1, "delivered_at": 1,
        "created_at": 1, "source": 1}).to_list(10000)
    
    method_labels = {
        "cash": "Nakit",
        "card": "Kredi Kartı",
        "meal_card": "Yemek Kartı",
        "online": "Online Kredi Kartı",
        "online_meal_card": "Online Yemek Kartı",
    }

    def _empty_bucket():
        return {
            "order_count": 0,
            "cash_total": 0.0,
            "card_total": 0.0,
            "meal_card_total": 0.0,
            "online_total": 0.0,
            "online_meal_card_total": 0.0,
            "cash_orders": [],
            "card_orders": [],
            "meal_card_orders": [],
            "online_orders": [],
            "online_meal_card_orders": [],
        }

    def _add_to_bucket(bucket, method, amount, row):
        bucket["order_count"] += 1
        if method == "cash":
            bucket["cash_total"] += amount
            bucket["cash_orders"].append(row)
        elif method == "card":
            bucket["card_total"] += amount
            bucket["card_orders"].append(row)
        elif method == "meal_card":
            bucket["meal_card_total"] += amount
            bucket["meal_card_orders"].append(row)
        elif method == "online":
            bucket["online_total"] += amount
            bucket["online_orders"].append(row)
        elif method == "online_meal_card":
            bucket["online_meal_card_total"] += amount
            bucket["online_meal_card_orders"].append(row)

    def _finalize(bucket):
        total = (bucket["cash_total"] + bucket["card_total"] + bucket["meal_card_total"]
                 + bucket["online_total"] + bucket["online_meal_card_total"])
        for k in ("cash_total", "card_total", "meal_card_total", "online_total", "online_meal_card_total"):
            bucket[k] = round(bucket[k], 2)
        bucket["total_ciro"] = round(total, 2)
        return bucket

    # Platform anahtarları: source -> bucket key eşleşmesi.
    # phone bucket: telefonla / panelden / Adisyo POS kaynaklı siparişleri kapsar.
    SOURCE_TO_BUCKET = {
        "yemeksepeti": "yemeksepeti",
        "trendyol": "trendyol",
        "getir": "getir",
        "migros": "migros",
        "phone": "phone",
        "manual": "phone",
        "adisyo": "phone",
    }
    PLATFORM_KEYS = ["yemeksepeti", "trendyol", "getir", "migros", "phone"]
    overall = _empty_bucket()
    by_platform = {k: _empty_bucket() for k in PLATFORM_KEYS}

    for order in orders:
        amount = order.get("total_amount", 0) or 0
        method = order.get("payment_method", "")
        src = (order.get("source") or "").lower()
        row = {
            "order_number": order.get("order_number", "-"),
            "customer_name": order.get("customer_name", "-"),
            "delivery_address": order.get("delivery_address", "-"),
            "payment_method": method_labels.get(method, method),
            "total_amount": amount,
            "date": (order.get("delivered_at") or order.get("created_at") or "")[:16].replace("T", " "),
        }

        _add_to_bucket(overall, method, amount, row)
        bucket_key = SOURCE_TO_BUCKET.get(src)
        if bucket_key:
            _add_to_bucket(by_platform[bucket_key], method, amount, row)

    overall = _finalize(overall)
    by_platform = {k: _finalize(v) for k, v in by_platform.items()}

    return {
        "restaurant_id": restaurant_id,
        "restaurant_name": restaurant.get("name", ""),
        "order_count": overall["order_count"],
        "cash_total": overall["cash_total"],
        "card_total": overall["card_total"],
        "meal_card_total": overall["meal_card_total"],
        "online_total": overall["online_total"],
        "online_meal_card_total": overall["online_meal_card_total"],
        "total_ciro": overall["total_ciro"],
        "cash_orders": overall["cash_orders"],
        "card_orders": overall["card_orders"],
        "meal_card_orders": overall["meal_card_orders"],
        "online_orders": overall["online_orders"],
        "online_meal_card_orders": overall["online_meal_card_orders"],
        "by_platform": by_platform,
    }
