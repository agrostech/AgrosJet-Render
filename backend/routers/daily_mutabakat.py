"""
Günlük Mütabakat Router
- Kuryelerden tahsilat girişi
- Sipariş verileri ile karşılaştırma
- Fark işleme (bakiyeye ekleme)
"""
from fastapi import APIRouter, HTTPException, Depends
from pydantic import BaseModel
from typing import Optional, List, Dict
from datetime import datetime, timezone, timedelta
import uuid

from utils.database import db
from utils.helpers import get_turkey_now, ensure_turkey_timezone, TURKEY_TZ
from utils.jwt_utils import require_admin

router = APIRouter(prefix="/api/daily-mutabakat", tags=["Günlük Mütabakat"], dependencies=[Depends(require_admin)])


# ============ MODELS ============
class CollectionInput(BaseModel):
    courier_id: str
    courier_name: str
    cash_amount: float = 0
    card_percent_1: float = 0
    card_percent_10: float = 0
    card_percent_20: float = 0
    meal_card_amount: float = 0


class SaveCollectionRequest(BaseModel):
    date: str  # YYYY-MM-DD format
    start_datetime: str  # ISO format
    end_datetime: str  # ISO format
    couriers: List[CollectionInput]
    admin_id: str
    admin_name: str


class ProcessMutabakatRequest(BaseModel):
    date: str
    start_datetime: str
    end_datetime: str
    courier_ids: List[str]  # İşlenecek kuryeler
    admin_id: str
    admin_name: str


class RevertMutabakatRequest(BaseModel):
    date: str
    courier_ids: List[str]  # Geri alınacak kuryeler
    admin_id: str
    admin_name: str


class SingleCourierSaveRequest(BaseModel):
    """Tek kurye için tahsilat kaydet ve mütabakat işle"""
    courier_id: str
    courier_name: str
    date: str
    start_datetime: str
    end_datetime: str
    cash_amount: float = 0
    card_percent_1: float = 0
    card_percent_10: float = 0
    card_percent_20: float = 0
    meal_card_amount: float = 0
    admin_id: str
    admin_name: str
    # Sipariş verileri (mütabakat hesaplaması için)
    order_cash: float = 0
    order_card_1: float = 0
    order_card_10: float = 0
    order_card_20: float = 0


class SingleCourierRevertRequest(BaseModel):
    """Tek kurye için mütabakat sıfırla"""
    courier_id: str
    date: str
    admin_id: str
    admin_name: str


# ============ HELPER FUNCTIONS ============
async def get_company_settings(company_id: str):
    """Şirket ayarlarını (açılış/kapanış saati) getir"""
    company = await db.companies.find_one(
        {"id": company_id},
        {"_id": 0, "opening_time": 1, "closing_time": 1}
    )
    if not company:
        return {"opening_time": "09:00", "closing_time": "22:00"}
    return {
        "opening_time": company.get("opening_time", "09:00"),
        "closing_time": company.get("closing_time", "22:00")
    }


def calculate_date_range(date_str: str, opening_time: str, closing_time: str):
    """
    Gün seçiciden tarih aralığı hesapla
    Başlangıç: Seçilen gün + açılış saati (Türkiye saati)
    Bitiş: Sonraki gün + kapanış saati (Türkiye saati)
    
    NOT: Siparişler artık Türkiye saatinde saklanıyor, UTC dönüşümü yapılmıyor
    """
    base_date = datetime.strptime(date_str, "%Y-%m-%d")
    
    # Parse times
    open_h, open_m = map(int, opening_time.split(":"))
    close_h, close_m = map(int, closing_time.split(":"))
    
    # Türkiye timezone
    turkey_tz = timezone(timedelta(hours=3))
    
    # Başlangıç: Seçilen gün + açılış saati (Türkiye saati)
    start_dt = base_date.replace(hour=open_h, minute=open_m, second=0, microsecond=0, tzinfo=turkey_tz)
    
    # Bitiş: Sonraki gün + kapanış saati (Türkiye saati)
    end_dt = (base_date + timedelta(days=1)).replace(hour=close_h, minute=close_m, second=0, microsecond=0, tzinfo=turkey_tz)
    
    return start_dt, end_dt


async def get_order_totals_for_courier(company_id: str, courier_id: str, start_dt: datetime, end_dt: datetime):
    """
    Belirli tarih aralığında kuryenin teslim ettiği siparişlerin nakit ve kart toplamlarını hesapla
    Kredi kartı için restoran bazlı tax_bracket dikkate alınır
    Parçalı ödemeler (mixed) de desteklenir
    """
    # Teslim edilmiş siparişleri getir
    # delivered_at alanı ile filtreleme (teslim tarihi)
    orders = await db.orders.find({
        "company_id": company_id,
        "courier_id": courier_id,
        "status": "delivered"
    }, {"_id": 0, "id": 1, "payment_method": 1, "total_amount": 1, "restaurant_name": 1, "restaurant_id": 1, "delivered_at": 1, "payment_details": 1}).to_list(1000)
    
    cash_total = 0
    card_percent_1 = 0
    card_percent_10 = 0
    card_percent_20 = 0
    meal_card_total = 0
    order_count = 0
    modified_payment_count = 0  # Ödeme yöntemi değiştirilen sipariş sayısı
    
    # Restoran tax_bracket'lerini cache'le
    restaurant_tax_cache = {}
    
    async def get_restaurant_tax_bracket(restaurant_id, restaurant_name):
        """Restoran tax_bracket'ini bul"""
        cache_key = restaurant_id or restaurant_name
        if cache_key in restaurant_tax_cache:
            return restaurant_tax_cache[cache_key]
        
        business = None
        if restaurant_id:
            business = await db.businesses.find_one(
                {"id": restaurant_id},
                {"_id": 0, "tax_bracket": 1}
            )
        
        if not business and restaurant_name:
            business = await db.businesses.find_one(
                {"company_id": company_id, "name": {"$regex": f"^{restaurant_name}$", "$options": "i"}},
                {"_id": 0, "tax_bracket": 1}
            )
        
        tax_bracket = business.get("tax_bracket") if business else 1
        restaurant_tax_cache[cache_key] = tax_bracket
        return tax_bracket
    
    for order in orders:
        # Tarih kontrolü - delivered_at alanını parse et
        delivered_at = order.get("delivered_at")
        if delivered_at:
            try:
                if isinstance(delivered_at, str):
                    order_dt = datetime.fromisoformat(delivered_at.replace('Z', '+00:00'))
                elif isinstance(delivered_at, datetime):
                    order_dt = delivered_at
                else:
                    continue
                
                if not (start_dt <= order_dt < end_dt):
                    continue
            except Exception:
                continue
        else:
            continue
        
        order_count += 1
        payment_method = (order.get("payment_method", "") or "").lower()
        payment_details = order.get("payment_details", {})
        
        # Parçalı ödeme kontrolü
        if payment_method == "mixed" or (payment_details.get("cash_amount", 0) > 0 and payment_details.get("card_amount", 0) > 0):
            # Parçalı ödeme
            cash_amt = payment_details.get("cash_amount", 0) or 0
            card_amt = payment_details.get("card_amount", 0) or 0
            meal_card_amt = payment_details.get("meal_card_amount", 0) or 0
            
            cash_total += cash_amt
            meal_card_total += meal_card_amt
            
            if card_amt > 0:
                tax_bracket = await get_restaurant_tax_bracket(
                    order.get("restaurant_id"),
                    order.get("restaurant_name", "")
                )
                if tax_bracket == 10:
                    card_percent_10 += card_amt
                elif tax_bracket == 20:
                    card_percent_20 += card_amt
                else:
                    card_percent_1 += card_amt
            
            if payment_details.get("original_method"):
                modified_payment_count += 1
        
        # Tek ödeme - Nakit
        elif "cash" in payment_method or "nakit" in payment_method:
            price = order.get("total_amount", 0) or 0
            cash_total += price
            if payment_details.get("original_method"):
                modified_payment_count += 1
        
        # Tek ödeme - Yemek Kartı
        elif "meal" in payment_method or "yemek" in payment_method:
            price = order.get("total_amount", 0) or 0
            meal_card_total += price
            if payment_details.get("original_method"):
                modified_payment_count += 1
        
        # Tek ödeme - Kart/Online
        elif "online" in payment_method or "card" in payment_method or "kredi" in payment_method or "kart" in payment_method:
            price = order.get("total_amount", 0) or 0
            tax_bracket = await get_restaurant_tax_bracket(
                order.get("restaurant_id"),
                order.get("restaurant_name", "")
            )
            if tax_bracket == 10:
                card_percent_10 += price
            elif tax_bracket == 20:
                card_percent_20 += price
            else:
                card_percent_1 += price
            
            if payment_details.get("original_method"):
                modified_payment_count += 1
    
    return {
        "order_count": order_count,
        "cash_total": cash_total,
        "card_percent_1": card_percent_1,
        "card_percent_10": card_percent_10,
        "card_percent_20": card_percent_20,
        "card_total": card_percent_1 + card_percent_10 + card_percent_20,
        "meal_card_total": meal_card_total,
        "modified_payment_count": modified_payment_count
    }


async def get_courier_orders_detail(company_id: str, courier_id: str, start_dt: datetime, end_dt: datetime):
    """
    Kuryenin belirli tarih aralığındaki siparişlerinin detaylı listesini getir
    """
    orders = await db.orders.find({
        "company_id": company_id,
        "courier_id": courier_id,
        "status": "delivered"
    }, {
        "_id": 0, 
        "id": 1,
        "order_number": 1,
        "restaurant_name": 1,
        "customer_name": 1,
        "delivery_address": 1,
        "total_amount": 1,
        "payment_method": 1, 
        "payment_details": 1,
        "delivered_at": 1,
        "created_at": 1
    }).to_list(1000)
    
    cash_orders = []
    card_orders = []
    
    for order in orders:
        # Tarih kontrolü - delivered_at ile
        delivered_at = order.get("delivered_at")
        if not delivered_at:
            continue
        try:
            if isinstance(delivered_at, str):
                order_dt = datetime.fromisoformat(delivered_at.replace('Z', '+00:00'))
            elif isinstance(delivered_at, datetime):
                order_dt = delivered_at
            else:
                continue
            
            # Timezone yoksa Türkiye saati kabul et
            if order_dt.tzinfo is None:
                turkey_tz = timezone(timedelta(hours=3))
                order_dt = order_dt.replace(tzinfo=turkey_tz)
            
            if not (start_dt <= order_dt < end_dt):
                continue
        except Exception:
            continue
        
        payment_method = (order.get("payment_method", "") or "").lower()
        payment_details = order.get("payment_details") or {}
        total_amount = order.get("total_amount", 0) or 0
        
        base_data = {
            "order_number": order.get("order_number", "-"),
            "restaurant_name": order.get("restaurant_name", "-"),
            "customer_name": order.get("customer_name", "-"),
            "delivery_address": order.get("delivery_address", "-"),
            "total_amount": total_amount,
            "payment_method": payment_method,
            "original_method": payment_details.get("original_method"),
            "is_modified": bool(payment_details.get("original_method")),
            "created_at": order.get("created_at", "")[:16].replace("T", " ") if order.get("created_at") else ""
        }
        
        cash_amt = payment_details.get("cash_amount", 0) or 0
        card_amt = payment_details.get("card_amount", 0) or 0
        
        # Parçalı ödeme
        if payment_method == "mixed" or (cash_amt > 0 and card_amt > 0):
            if cash_amt > 0:
                cash_orders.append({
                    **base_data,
                    "amount": cash_amt,
                    "is_split": True,
                    "split_details": {"cash": cash_amt, "card": card_amt}
                })
            if card_amt > 0:
                card_orders.append({
                    **base_data,
                    "amount": card_amt,
                    "is_split": True,
                    "split_details": {"cash": cash_amt, "card": card_amt}
                })
        elif "cash" in payment_method or "nakit" in payment_method:
            cash_orders.append({**base_data, "amount": total_amount, "is_split": False})
        elif "online" in payment_method or "card" in payment_method or "kart" in payment_method:
            card_orders.append({**base_data, "amount": total_amount, "is_split": False})
    
    return {
        "cash_orders": cash_orders,
        "card_orders": card_orders,
        "cash_total": sum(o["amount"] for o in cash_orders),
        "card_total": sum(o["amount"] for o in card_orders)
    }


# ============ ENDPOINTS ============

@router.get("/{company_id}/date-range/{date}")
async def get_date_range(company_id: str, date: str):
    """
    Seçilen gün için tarih aralığını döndür
    """
    settings = await get_company_settings(company_id)
    start_dt, end_dt = calculate_date_range(date, settings["opening_time"], settings["closing_time"])
    
    return {
        "date": date,
        "start_datetime": start_dt.isoformat(),
        "end_datetime": end_dt.isoformat(),
        "opening_time": settings["opening_time"],
        "closing_time": settings["closing_time"]
    }


@router.get("/{company_id}/courier/{courier_id}/orders/{date}")
async def get_courier_orders_for_date(company_id: str, courier_id: str, date: str):
    """
    Belirli bir tarih için kuryenin sipariş detaylarını getir
    """
    settings = await get_company_settings(company_id)
    start_dt, end_dt = calculate_date_range(date, settings["opening_time"], settings["closing_time"])
    
    result = await get_courier_orders_detail(company_id, courier_id, start_dt, end_dt)
    return result


@router.get("/{company_id}/couriers/{date}")
async def get_couriers_with_data(company_id: str, date: str):
    """
    Belirli bir tarih için kurye listesi, sipariş toplamları ve tahsilat durumları
    """
    # Tarih aralığını hesapla
    settings = await get_company_settings(company_id)
    start_dt, end_dt = calculate_date_range(date, settings["opening_time"], settings["closing_time"])
    
    # Şirkete ait restoranların meal_card ayarlarını kontrol et
    restaurants_with_meal_card = await db.restaurants.find(
        {
            "company_id": company_id,
            "is_archived": {"$ne": True}
        },
        {"_id": 0, "id": 1, "collection_settings": 1}
    ).to_list(500)
    
    has_meal_card_collection = any(
        r.get("collection_settings", {}).get("meal_card_collection") == "courier"
        for r in restaurants_with_meal_card
    )
    
    # Şirkete bağlı kuryeleri getir
    query = {"company_id": company_id, "is_archived": {"$ne": True}, "is_active": {"$ne": False}}
    relations = await db.company_couriers.find(query, {"_id": 0, "courier_id": 1}).to_list(1000)
    courier_ids = list(set([rel["courier_id"] for rel in relations]))
    
    if not courier_ids:
        return {
            "date": date,
            "date_range": {
                "start": start_dt.isoformat(),
                "end": end_dt.isoformat(),
                "label": f"{start_dt.strftime('%d.%m.%Y %H:%M')} - {end_dt.strftime('%d.%m.%Y %H:%M')}"
            },
            "couriers": [],
            "summary": {
                "total_couriers": 0,
                "completed_couriers": 0,
                "processed_couriers": 0
            },
            "hasMealCardCollection": has_meal_card_collection
        }
    
    # Kurye detaylarını getir
    couriers = await db.couriers.find(
        {"id": {"$in": courier_ids}},
        {"_id": 0, "id": 1, "name": 1, "phone": 1}
    ).to_list(1000)
    
    # Deduplicate
    seen_ids = set()
    unique_couriers = []
    for c in couriers:
        if c["id"] not in seen_ids:
            seen_ids.add(c["id"])
            unique_couriers.append(c)
    couriers = unique_couriers
    
    # Tahsilat kayıtlarını getir
    collections = await db.daily_mutabakat_collections.find(
        {"company_id": company_id, "date": date},
        {"_id": 0}
    ).to_list(500)
    collection_map = {col["courier_id"]: col for col in collections}
    
    # Mütabakat işlem kayıtlarını getir
    processed_records = await db.daily_mutabakat_processed.find(
        {"company_id": company_id, "date": date},
        {"_id": 0, "courier_id": 1}
    ).to_list(500)
    processed_ids = set([r["courier_id"] for r in processed_records])
    
    # Her kurye için sipariş toplamlarını hesapla
    result = []
    completed_count = 0
    processed_count = len(processed_ids)
    
    for courier in couriers:
        courier_id = courier["id"]
        
        # Sipariş toplamları
        order_totals = await get_order_totals_for_courier(company_id, courier_id, start_dt, end_dt)
        
        # Tahsilat kaydı
        collection = collection_map.get(courier_id)
        has_collection = collection is not None
        if has_collection:
            completed_count += 1
        
        # İşlenmiş mi?
        is_processed = courier_id in processed_ids
        
        # Farkları hesapla
        cash_diff = 0
        card_diff_1 = 0
        card_diff_10 = 0
        card_diff_20 = 0
        card_diff = 0
        
        if collection:
            # Nakit farkı: Sipariş - Tahsilat (pozitif = eksik teslim)
            cash_diff = order_totals["cash_total"] - collection.get("cash_amount", 0)
            
            # Kart farkı: Her yüzde için ayrı hesapla
            card_diff_1 = order_totals["card_percent_1"] - collection.get("card_percent_1", 0)
            card_diff_10 = order_totals["card_percent_10"] - collection.get("card_percent_10", 0)
            card_diff_20 = order_totals["card_percent_20"] - collection.get("card_percent_20", 0)
            card_diff = card_diff_1 + card_diff_10 + card_diff_20
        
        courier_data = {
            "id": courier_id,
            "name": courier["name"],
            "phone": courier.get("phone", ""),
            # Sipariş verileri (otomatik hesaplanan)
            "order_data": order_totals,
            # Tahsilat verileri (girilen)
            "collection": {
                "cash_amount": collection.get("cash_amount", 0) if collection else 0,
                "card_percent_1": collection.get("card_percent_1", 0) if collection else 0,
                "card_percent_10": collection.get("card_percent_10", 0) if collection else 0,
                "card_percent_20": collection.get("card_percent_20", 0) if collection else 0,
                "card_total": collection.get("card_total", 0) if collection else 0,
                "meal_card_amount": collection.get("meal_card_amount", 0) if collection else 0,
                "admin_name": collection.get("admin_name", "") if collection else ""
            },
            "has_collection": has_collection,
            "is_processed": is_processed,
            # Farklar - detaylı
            "differences": {
                "cash": cash_diff,
                "card_1": card_diff_1,
                "card_10": card_diff_10,
                "card_20": card_diff_20,
                "card": card_diff,
                "total": cash_diff + card_diff
            }
        }
        
        # Nakit ve kart toplamı 0 olan kuryeler gösterilmez
        # Ancak tahsilat kaydı veya mütabakat işlemi varsa gösterilir
        if order_totals["cash_total"] == 0 and order_totals["card_total"] == 0:
            if not has_collection and not is_processed:
                continue
        
        result.append(courier_data)
    
    # Sırala: Önce siparişi olanlar
    result.sort(key=lambda x: (-x["order_data"]["order_count"], x["name"]))
    
    # Summary'de filtered count göster
    couriers_with_orders = len(result)
    
    return {
        "date": date,
        "date_range": {
            "start": start_dt.isoformat(),
            "end": end_dt.isoformat(),
            "label": f"{start_dt.strftime('%d.%m.%Y %H:%M')} - {end_dt.strftime('%d.%m.%Y %H:%M')}"
        },
        "couriers": result,
        "summary": {
            "total_couriers": couriers_with_orders,
            "completed_couriers": completed_count,
            "processed_couriers": processed_count
        },
        "hasMealCardCollection": has_meal_card_collection
    }


@router.post("/{company_id}/save-collection")
async def save_collection(company_id: str, data: SaveCollectionRequest):
    """
    Kurye tahsilatlarını kaydet (birden fazla kurye için)
    """
    saved_count = 0
    
    for courier in data.couriers:
        card_total = courier.card_percent_1 + courier.card_percent_10 + courier.card_percent_20
        
        collection = {
            "id": str(uuid.uuid4()),
            "company_id": company_id,
            "courier_id": courier.courier_id,
            "courier_name": courier.courier_name,
            "date": data.date,
            "start_datetime": data.start_datetime,
            "end_datetime": data.end_datetime,
            "cash_amount": courier.cash_amount,
            "card_percent_1": courier.card_percent_1,
            "card_percent_10": courier.card_percent_10,
            "card_percent_20": courier.card_percent_20,
            "card_total": card_total,
            "meal_card_amount": courier.meal_card_amount,
            "admin_id": data.admin_id,
            "admin_name": data.admin_name,
            "created_at": get_turkey_now()
        }
        
        # Upsert - aynı gün için güncelle veya ekle
        await db.daily_mutabakat_collections.update_one(
            {"company_id": company_id, "courier_id": courier.courier_id, "date": data.date},
            {"$set": collection},
            upsert=True
        )
        saved_count += 1
    
    return {"message": f"{saved_count} kurye tahsilatı kaydedildi", "count": saved_count}


@router.post("/{company_id}/process")
async def process_mutabakat(company_id: str, data: ProcessMutabakatRequest):
    """
    Seçili kuryeler için mütabakat işle
    Farkları kurye bakiyesine ekle
    """
    from routers.accounting import create_activity_log
    
    # Tarih aralığını hesapla
    settings = await get_company_settings(company_id)
    start_dt, end_dt = calculate_date_range(data.date, settings["opening_time"], settings["closing_time"])
    
    processed_count = 0
    transactions_created = 0
    
    for courier_id in data.courier_ids:
        # Zaten işlenmiş mi kontrol et
        existing = await db.daily_mutabakat_processed.find_one({
            "company_id": company_id,
            "courier_id": courier_id,
            "date": data.date
        })
        if existing:
            continue
        
        # Kurye bilgisi
        courier = await db.couriers.find_one({"id": courier_id}, {"_id": 0, "name": 1})
        if not courier:
            continue
        
        courier_name = courier["name"]
        
        # Sipariş toplamları
        order_totals = await get_order_totals_for_courier(company_id, courier_id, start_dt, end_dt)
        
        # Tahsilat kaydı
        collection = await db.daily_mutabakat_collections.find_one({
            "company_id": company_id,
            "courier_id": courier_id,
            "date": data.date
        }, {"_id": 0})
        
        if not collection:
            continue
        
        # Farkları hesapla
        cash_diff = order_totals["cash_total"] - collection.get("cash_amount", 0)
        card_diff_1 = order_totals["card_percent_1"] - collection.get("card_percent_1", 0)
        card_diff_10 = order_totals["card_percent_10"] - collection.get("card_percent_10", 0)
        card_diff_20 = order_totals["card_percent_20"] - collection.get("card_percent_20", 0)
        card_diff = card_diff_1 + card_diff_10 + card_diff_20
        
        # Bakiye işlemleri oluştur
        date_label = datetime.strptime(data.date, "%Y-%m-%d").strftime("%d.%m.%Y")
        
        # Nakit farkı işlemi - Sadece kurye borçluysa işle
        if cash_diff > 0.01:  # Pozitif = kurye eksik teslim etmiş = kurye borçlu
            description = f"{date_label} tarihli mütabakat - Nakit eksik teslim"
            
            await db.transactions.insert_one({
                "id": str(uuid.uuid4()),
                "company_id": company_id,
                "entity_type": "courier",
                "entity_id": courier_id,
                "entity_name": courier_name,
                "type": "payment_out",  # Kurye borçlu
                "amount": cash_diff,
                "description": description,
                "admin_id": data.admin_id,
                "admin_name": data.admin_name,
                "is_mutabakat": True,
                "mutabakat_date": data.date,
                "mutabakat_type": "cash",
                "created_at": get_turkey_now()
            })
            
            # Kurye bakiyesini güncelle
            await db.couriers.update_one(
                {"id": courier_id},
                {"$inc": {"balance": cash_diff}}
            )
            
            transactions_created += 1
        # Negatif fark (kurye fazla teslim etmiş) işlenmez - biz borçlu oluyoruz
        
        # Kart farkı işlemi - Sadece kurye borçluysa işle
        if card_diff > 0.01:  # Pozitif = kurye eksik teslim etmiş = kurye borçlu
            description = f"{date_label} tarihli mütabakat - Kredi kartı eksik teslim"
            
            await db.transactions.insert_one({
                "id": str(uuid.uuid4()),
                "company_id": company_id,
                "entity_type": "courier",
                "entity_id": courier_id,
                "entity_name": courier_name,
                "type": "payment_out",  # Kurye borçlu
                "amount": card_diff,
                "description": description,
                "admin_id": data.admin_id,
                "admin_name": data.admin_name,
                "is_mutabakat": True,
                "mutabakat_date": data.date,
                "mutabakat_type": "card",
                "created_at": get_turkey_now()
            })
            
            await db.couriers.update_one(
                {"id": courier_id},
                {"$inc": {"balance": card_diff}}
            )
            
            transactions_created += 1
        # Negatif fark (kurye fazla teslim etmiş) işlenmez - biz borçlu oluyoruz
        
        # Yanlış yüzde farkı işlemi - Sadece kurye borçluysa işle
        # Sistem komisyonu: restoran tax_bracket'ine göre olması gereken
        system_commission = (
            order_totals["card_percent_1"] * 0.01 +
            order_totals["card_percent_10"] * 0.10 +
            order_totals["card_percent_20"] * 0.20
        )
        # Tahsilat komisyonu: kuryenin girdiği yüzdelere göre
        collection_commission = (
            collection.get("card_percent_1", 0) * 0.01 +
            collection.get("card_percent_10", 0) * 0.10 +
            collection.get("card_percent_20", 0) * 0.20
        )
        # Yüzde farkı (pozitif = kurye yüksek yüzdeyle tahsil etmiş = kurye borçlu)
        commission_penalty = collection_commission - system_commission
        
        if commission_penalty > 0.01:  # Pozitif = kurye fazla komisyon almış = kurye borçlu
            description = f"{date_label} tarihli mütabakat - Yanlış yüzde farkı (fazla tahsil)"
            
            await db.transactions.insert_one({
                "id": str(uuid.uuid4()),
                "company_id": company_id,
                "entity_type": "courier",
                "entity_id": courier_id,
                "entity_name": courier_name,
                "type": "payment_out",  # Kurye borçlu
                "amount": commission_penalty,
                "description": description,
                "admin_id": data.admin_id,
                "admin_name": data.admin_name,
                "is_mutabakat": True,
                "mutabakat_date": data.date,
                "mutabakat_type": "commission",
                "created_at": get_turkey_now()
            })
            
            await db.couriers.update_one(
                {"id": courier_id},
                {"$inc": {"balance": commission_penalty}}
            )
            
            transactions_created += 1
        # Negatif fark (kurye düşük komisyon almış) işlenmez - biz borçlu oluyoruz
        
        # İşlenmiş olarak kaydet
        await db.daily_mutabakat_processed.insert_one({
            "id": str(uuid.uuid4()),
            "company_id": company_id,
            "courier_id": courier_id,
            "courier_name": courier_name,
            "date": data.date,
            "order_data": order_totals,
            "collection_data": {
                "cash_amount": collection.get("cash_amount", 0),
                "card_percent_1": collection.get("card_percent_1", 0),
                "card_percent_10": collection.get("card_percent_10", 0),
                "card_percent_20": collection.get("card_percent_20", 0),
                "card_total": collection.get("card_total", 0)
            },
            "differences": {
                "cash": cash_diff,
                "card": card_diff,
                "commission": commission_penalty,
                "total": cash_diff + card_diff + commission_penalty
            },
            "admin_id": data.admin_id,
            "admin_name": data.admin_name,
            "processed_at": get_turkey_now()
        })
        
        processed_count += 1
    
    return {
        "message": f"{processed_count} kurye mütabakatı işlendi",
        "processed_count": processed_count,
        "transactions_created": transactions_created
    }


@router.post("/{company_id}/revert")
async def revert_mutabakat(company_id: str, data: RevertMutabakatRequest):
    """
    Seçili kuryeler için mütabakatı geri al (Sadece SuperAdmin)
    """
    reverted_count = 0
    
    for courier_id in data.courier_ids:
        # İşlenmiş kaydı bul
        processed = await db.daily_mutabakat_processed.find_one({
            "company_id": company_id,
            "courier_id": courier_id,
            "date": data.date
        }, {"_id": 0})
        
        if not processed:
            continue
        
        # İlgili transaction'ları sil ve bakiyeyi geri al
        transactions = await db.transactions.find({
            "company_id": company_id,
            "entity_id": courier_id,
            "is_mutabakat": True,
            "mutabakat_date": data.date
        }, {"_id": 0}).to_list(100)
        
        for txn in transactions:
            # Bakiyeyi geri al
            if txn["type"] == "given":
                # Verilen = bakiye artmıştı, şimdi azalt
                await db.couriers.update_one(
                    {"id": courier_id},
                    {"$inc": {"balance": -txn["amount"]}}
                )
            else:
                # Alınan = bakiye azalmıştı, şimdi artır
                await db.couriers.update_one(
                    {"id": courier_id},
                    {"$inc": {"balance": txn["amount"]}}
                )
        
        # Transaction'ları sil
        await db.transactions.delete_many({
            "company_id": company_id,
            "entity_id": courier_id,
            "is_mutabakat": True,
            "mutabakat_date": data.date
        })
        
        # İşlenmiş kaydını sil
        await db.daily_mutabakat_processed.delete_one({
            "company_id": company_id,
            "courier_id": courier_id,
            "date": data.date
        })
        
        # Tahsilat kaydını da sil (Yönetici mütabakat bakiyesi için gerekli)
        await db.daily_mutabakat_collections.delete_one({
            "company_id": company_id,
            "courier_id": courier_id,
            "date": data.date
        })
        
        reverted_count += 1
    
    return {
        "message": f"{reverted_count} kurye mütabakatı geri alındı",
        "reverted_count": reverted_count
    }


class ResetCollectionRequest(BaseModel):
    date: str
    courier_ids: List[str]
    admin_id: str
    admin_name: str


@router.post("/{company_id}/reset-collection")
async def reset_collection(company_id: str, data: ResetCollectionRequest):
    """
    Tahsilat değerlerini sıfırla (Sadece SuperAdmin)
    Mütabakat yapılmış kuryeler için sıfırlama yapılamaz
    """
    reset_count = 0
    skipped_processed = 0
    
    for courier_id in data.courier_ids:
        # Mütabakat yapılmış mı kontrol et
        processed = await db.daily_mutabakat_processed.find_one({
            "company_id": company_id,
            "courier_id": courier_id,
            "date": data.date
        })
        
        if processed:
            skipped_processed += 1
            continue
        
        # Tahsilat kaydını sil
        result = await db.daily_mutabakat_collections.delete_one({
            "company_id": company_id,
            "courier_id": courier_id,
            "date": data.date
        })
        
        if result.deleted_count > 0:
            reset_count += 1
    
    message = f"{reset_count} kurye tahsilatı sıfırlandı"
    if skipped_processed > 0:
        message += f" ({skipped_processed} kurye mütabakatı yapılmış, önce geri alın)"
    
    return {
        "message": message,
        "reset_count": reset_count,
        "skipped_processed": skipped_processed
    }


@router.post("/{company_id}/save-and-process-single-courier")
async def save_and_process_single_courier(company_id: str, data: SingleCourierSaveRequest):
    """
    Tek kurye için tahsilat kaydet VE mütabakat işle (tek aksiyonda)
    """
    # 1. Tahsilat kaydı oluştur/güncelle
    card_total = data.card_percent_1 + data.card_percent_10 + data.card_percent_20
    
    collection = {
        "id": str(uuid.uuid4()),
        "company_id": company_id,
        "courier_id": data.courier_id,
        "courier_name": data.courier_name,
        "date": data.date,
        "start_datetime": data.start_datetime,
        "end_datetime": data.end_datetime,
        "cash_amount": data.cash_amount,
        "card_percent_1": data.card_percent_1,
        "card_percent_10": data.card_percent_10,
        "card_percent_20": data.card_percent_20,
        "card_total": card_total,
        "meal_card_amount": data.meal_card_amount,
        "admin_id": data.admin_id,
        "admin_name": data.admin_name,
        "created_at": get_turkey_now()
    }
    
    await db.daily_mutabakat_collections.update_one(
        {"company_id": company_id, "courier_id": data.courier_id, "date": data.date},
        {"$set": collection},
        upsert=True
    )
    
    # 2. Zaten işlenmiş mi kontrol et
    existing = await db.daily_mutabakat_processed.find_one({
        "company_id": company_id,
        "courier_id": data.courier_id,
        "date": data.date
    })
    if existing:
        return {"message": "Kurye zaten mütabakat yapılmış", "already_processed": True}
    
    # 3. Farkları hesapla (request'teki sipariş verilerini kullan)
    cash_diff = data.order_cash - data.cash_amount
    card_diff_1 = data.order_card_1 - data.card_percent_1
    card_diff_10 = data.order_card_10 - data.card_percent_10
    card_diff_20 = data.order_card_20 - data.card_percent_20
    card_diff = card_diff_1 + card_diff_10 + card_diff_20
    
    # Komisyon hesapla
    system_commission = (
        data.order_card_1 * 0.01 +
        data.order_card_10 * 0.10 +
        data.order_card_20 * 0.20
    )
    collection_commission = (
        data.card_percent_1 * 0.01 +
        data.card_percent_10 * 0.10 +
        data.card_percent_20 * 0.20
    )
    commission_penalty = collection_commission - system_commission
    
    # 4. Bakiye işlemleri oluştur
    date_label = datetime.strptime(data.date, "%Y-%m-%d").strftime("%d.%m.%Y")
    transactions_created = 0
    
    # Nakit farkı - Sadece kurye borçluysa
    if cash_diff > 0.01:
        await db.transactions.insert_one({
            "id": str(uuid.uuid4()),
            "company_id": company_id,
            "entity_type": "courier",
            "entity_id": data.courier_id,
            "entity_name": data.courier_name,
            "type": "payment_out",
            "amount": cash_diff,
            "description": f"{date_label} tarihli mütabakat - Nakit eksik teslim",
            "admin_id": data.admin_id,
            "admin_name": data.admin_name,
            "is_mutabakat": True,
            "mutabakat_date": data.date,
            "mutabakat_type": "cash",
            "created_at": get_turkey_now()
        })
        await db.couriers.update_one(
            {"id": data.courier_id},
            {"$inc": {"balance": cash_diff}}
        )
        transactions_created += 1
    
    # Kart farkı - Sadece kurye borçluysa
    if card_diff > 0.01:
        await db.transactions.insert_one({
            "id": str(uuid.uuid4()),
            "company_id": company_id,
            "entity_type": "courier",
            "entity_id": data.courier_id,
            "entity_name": data.courier_name,
            "type": "payment_out",
            "amount": card_diff,
            "description": f"{date_label} tarihli mütabakat - Kredi kartı eksik teslim",
            "admin_id": data.admin_id,
            "admin_name": data.admin_name,
            "is_mutabakat": True,
            "mutabakat_date": data.date,
            "mutabakat_type": "card",
            "created_at": get_turkey_now()
        })
        await db.couriers.update_one(
            {"id": data.courier_id},
            {"$inc": {"balance": card_diff}}
        )
        transactions_created += 1
    
    # Komisyon cezası - Sadece kurye borçluysa
    if commission_penalty > 0.01:
        await db.transactions.insert_one({
            "id": str(uuid.uuid4()),
            "company_id": company_id,
            "entity_type": "courier",
            "entity_id": data.courier_id,
            "entity_name": data.courier_name,
            "type": "payment_out",
            "amount": commission_penalty,
            "description": f"{date_label} tarihli mütabakat - Yanlış yüzde farkı",
            "admin_id": data.admin_id,
            "admin_name": data.admin_name,
            "is_mutabakat": True,
            "mutabakat_date": data.date,
            "mutabakat_type": "commission",
            "created_at": get_turkey_now()
        })
        await db.couriers.update_one(
            {"id": data.courier_id},
            {"$inc": {"balance": commission_penalty}}
        )
        transactions_created += 1
    
    # 5. İşlenmiş olarak kaydet
    await db.daily_mutabakat_processed.insert_one({
        "id": str(uuid.uuid4()),
        "company_id": company_id,
        "courier_id": data.courier_id,
        "courier_name": data.courier_name,
        "date": data.date,
        "order_data": {
            "cash_total": data.order_cash,
            "card_percent_1": data.order_card_1,
            "card_percent_10": data.order_card_10,
            "card_percent_20": data.order_card_20,
            "card_total": data.order_card_1 + data.order_card_10 + data.order_card_20
        },
        "collection_data": {
            "cash_amount": data.cash_amount,
            "card_percent_1": data.card_percent_1,
            "card_percent_10": data.card_percent_10,
            "card_percent_20": data.card_percent_20,
            "card_total": card_total,
            "meal_card_amount": data.meal_card_amount
        },
        "differences": {
            "cash": cash_diff,
            "card": card_diff,
            "commission": commission_penalty,
            "total": cash_diff + card_diff + commission_penalty
        },
        "admin_id": data.admin_id,
        "admin_name": data.admin_name,
        "processed_at": get_turkey_now()
    })
    
    return {
        "message": f"{data.courier_name} mütabakatı tamamlandı",
        "transactions_created": transactions_created,
        "differences": {
            "cash": cash_diff,
            "card": card_diff,
            "commission": commission_penalty,
            "total": cash_diff + card_diff + commission_penalty
        }
    }


@router.post("/{company_id}/revert-single-courier")
async def revert_single_courier(company_id: str, data: SingleCourierRevertRequest):
    """
    Tek kurye için mütabakatı geri al (Sadece SuperAdmin)
    Hem mütabakat hem tahsilat kaydını siler
    """
    courier_id = data.courier_id
    
    # İşlenmiş kaydı bul
    processed = await db.daily_mutabakat_processed.find_one({
        "company_id": company_id,
        "courier_id": courier_id,
        "date": data.date
    }, {"_id": 0})
    
    if not processed:
        raise HTTPException(status_code=404, detail="Mütabakat kaydı bulunamadı")
    
    # İlgili transaction'ları sil ve bakiyeyi geri al
    transactions = await db.transactions.find({
        "company_id": company_id,
        "entity_id": courier_id,
        "is_mutabakat": True,
        "mutabakat_date": data.date
    }, {"_id": 0}).to_list(100)
    
    for txn in transactions:
        if txn["type"] == "given":
            await db.couriers.update_one(
                {"id": courier_id},
                {"$inc": {"balance": -txn["amount"]}}
            )
        else:
            await db.couriers.update_one(
                {"id": courier_id},
                {"$inc": {"balance": -txn["amount"]}}
            )
    
    # Transaction'ları sil
    await db.transactions.delete_many({
        "company_id": company_id,
        "entity_id": courier_id,
        "is_mutabakat": True,
        "mutabakat_date": data.date
    })
    
    # İşlenmiş kaydını sil
    await db.daily_mutabakat_processed.delete_one({
        "company_id": company_id,
        "courier_id": courier_id,
        "date": data.date
    })
    
    # Tahsilat kaydını da sil
    await db.daily_mutabakat_collections.delete_one({
        "company_id": company_id,
        "courier_id": courier_id,
        "date": data.date
    })
    
    return {
        "message": "Mütabakat sıfırlandı",
        "courier_id": courier_id
    }


@router.get("/{company_id}/weekly-summary")
async def get_weekly_summary(company_id: str, week_start: str = None):
    """
    Haftalık mütabakat özeti - her gün için tahsilat/mütabakat sayıları
    """
    # Türkiye saati
    turkey_tz = timezone(timedelta(hours=3))
    
    if week_start:
        start_date = datetime.strptime(week_start, "%Y-%m-%d")
    else:
        today = datetime.now(turkey_tz)
        start_date = today - timedelta(days=today.weekday())
    
    start_date = start_date.replace(hour=0, minute=0, second=0, microsecond=0)
    
    # Aktif kurye ID'lerini al
    query = {"company_id": company_id, "is_archived": {"$ne": True}, "is_active": {"$ne": False}}
    relations = await db.company_couriers.find(query, {"_id": 0, "courier_id": 1}).to_list(1000)
    courier_ids = list(set([rel["courier_id"] for rel in relations]))
    
    if not courier_ids:
        relations = await db.company_couriers.find({"company_id": company_id}, {"_id": 0, "courier_id": 1}).to_list(1000)
        courier_ids = list(set([rel["courier_id"] for rel in relations]))
    
    # Şirket ayarlarını al (açılış/kapanış saatleri)
    company = await db.companies.find_one({"id": company_id}, {"_id": 0, "opening_time": 1, "closing_time": 1})
    open_time = company.get("opening_time", "06:00") if company else "06:00"
    close_time = company.get("closing_time", "06:00") if company else "06:00"
    
    open_hour, open_min = map(int, open_time.split(":"))
    close_hour, close_min = map(int, close_time.split(":"))
    
    days = []
    day_names_tr = ["Pzt", "Sal", "Çar", "Per", "Cum", "Cmt", "Paz"]
    today_str = datetime.now(turkey_tz).strftime("%Y-%m-%d")
    
    for i in range(7):
        day_date = start_date + timedelta(days=i)
        date_str = day_date.strftime("%Y-%m-%d")
        
        # Gün aralığını hesapla (Türkiye saati)
        start_dt = day_date.replace(hour=open_hour, minute=open_min, second=0, microsecond=0, tzinfo=turkey_tz)
        # Kapanış her zaman ertesi gün (gece işletmesi mantığı)
        end_dt = (day_date + timedelta(days=1)).replace(hour=close_hour, minute=close_min, second=59, microsecond=999999, tzinfo=turkey_tz)
        
        # O gün siparişi olan kurye sayısını hesapla (delivered_at ile)
        # Önce o tarih aralığındaki tüm siparişleri çek
        all_day_orders = await db.orders.find({
            "company_id": company_id,
            "status": "delivered"
        }, {"_id": 0, "delivered_at": 1, "courier_id": 1}).to_list(5000)
        
        couriers_with_orders = set()
        for order in all_day_orders:
            courier_id = order.get("courier_id")
            if not courier_id:
                continue
            delivered_at = order.get("delivered_at")
            if delivered_at:
                try:
                    if isinstance(delivered_at, str):
                        order_dt = datetime.fromisoformat(delivered_at.replace('Z', '+00:00'))
                    elif isinstance(delivered_at, datetime):
                        order_dt = delivered_at
                    else:
                        continue
                    
                    # Timezone yoksa Türkiye saati kabul et
                    if order_dt.tzinfo is None:
                        order_dt = order_dt.replace(tzinfo=turkey_tz)
                    
                    if start_dt <= order_dt < end_dt:
                        couriers_with_orders.add(courier_id)
                except Exception:
                    continue
        
        total_with_orders = len(couriers_with_orders)
        
        # O gün tahsilat kaydı olan kurye sayısı
        completed_couriers = await db.daily_mutabakat_collections.distinct(
            "courier_id",
            {"company_id": company_id, "date": date_str}
        )
        completed_count = len(completed_couriers)
        
        # O gün mütabakat yapılan kurye sayısı
        processed_couriers = await db.daily_mutabakat_processed.distinct(
            "courier_id",
            {"company_id": company_id, "date": date_str}
        )
        processed_count = len(processed_couriers)
        
        is_future = date_str > today_str
        is_today = date_str == today_str
        
        if is_future:
            status = "future"
        elif processed_count >= total_with_orders and total_with_orders > 0:
            status = "processed"
        elif completed_count >= total_with_orders and total_with_orders > 0:
            status = "complete"
        elif completed_count > 0 or processed_count > 0:
            status = "partial"
        else:
            status = "empty"
        
        days.append({
            "date": date_str,
            "day_name": day_names_tr[i],
            "day_number": day_date.day,
            "total_with_orders": total_with_orders,  # Siparişi olan kurye sayısı
            "completed": completed_count,  # Tahsilat kaydı yapılan
            "processed": processed_count,  # Mütabakat yapılan
            "status": status,
            "is_today": is_today
        })
    
    return {
        "week_start": start_date.strftime("%Y-%m-%d"),
        "days": days
    }
