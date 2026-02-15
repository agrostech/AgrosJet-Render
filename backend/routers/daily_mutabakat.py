"""
Günlük Mütabakat Router
- Kuryelerden tahsilat girişi
- Sipariş verileri ile karşılaştırma
- Fark işleme (bakiyeye ekleme)
"""
from fastapi import APIRouter, HTTPException
from pydantic import BaseModel
from typing import Optional, List, Dict
from datetime import datetime, timezone, timedelta
import uuid

from utils.database import db

router = APIRouter(prefix="/api/daily-mutabakat", tags=["Günlük Mütabakat"])


# ============ MODELS ============
class CollectionInput(BaseModel):
    courier_id: str
    courier_name: str
    cash_amount: float = 0
    card_percent_1: float = 0
    card_percent_10: float = 0
    card_percent_20: float = 0


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
    Başlangıç: Seçilen gün + açılış saati
    Bitiş: Sonraki gün + kapanış saati
    """
    base_date = datetime.strptime(date_str, "%Y-%m-%d")
    
    # Parse times
    open_h, open_m = map(int, opening_time.split(":"))
    close_h, close_m = map(int, closing_time.split(":"))
    
    start_dt = base_date.replace(hour=open_h, minute=open_m, second=0, microsecond=0, tzinfo=timezone.utc)
    end_dt = (base_date + timedelta(days=1)).replace(hour=close_h, minute=close_m, second=0, microsecond=0, tzinfo=timezone.utc)
    
    return start_dt, end_dt


async def get_order_totals_for_courier(company_id: str, courier_id: str, start_dt: datetime, end_dt: datetime):
    """
    Belirli tarih aralığında kuryenin teslim ettiği siparişlerin nakit ve kart toplamlarını hesapla
    Kredi kartı için restoran bazlı tax_bracket dikkate alınır
    """
    # Teslim edilmiş siparişleri getir
    # updated_at alanı hem ISO string hem de datetime olabilir
    orders = await db.orders.find({
        "company_id": company_id,
        "courier_id": courier_id,
        "status": "delivered"
    }, {"_id": 0, "id": 1, "payment_method": 1, "total_amount": 1, "restaurant_name": 1, "restaurant_id": 1, "updated_at": 1}).to_list(1000)
    
    cash_total = 0
    card_percent_1 = 0
    card_percent_10 = 0
    card_percent_20 = 0
    order_count = 0
    
    # Restoran tax_bracket'lerini cache'le
    restaurant_tax_cache = {}
    
    for order in orders:
        # Tarih kontrolü - updated_at alanını parse et
        updated_at = order.get("updated_at")
        if updated_at:
            try:
                if isinstance(updated_at, str):
                    # ISO string formatında
                    order_dt = datetime.fromisoformat(updated_at.replace('Z', '+00:00'))
                elif isinstance(updated_at, datetime):
                    order_dt = updated_at
                else:
                    continue
                
                # Tarih aralığı kontrolü
                if not (start_dt <= order_dt < end_dt):
                    continue
            except:
                continue
        else:
            continue
        
        price = order.get("total_amount", 0) or 0
        payment_method = (order.get("payment_method", "") or "").lower()
        order_count += 1
        
        # Nakit: "cash" veya "nakit"
        if "cash" in payment_method or "nakit" in payment_method:
            cash_total += price
        # Kart/Online: "online", "card", "kredi", "kart"
        elif "online" in payment_method or "card" in payment_method or "kredi" in payment_method or "kart" in payment_method:
            # Restoran tax_bracket'ini bul
            restaurant_id = order.get("restaurant_id")
            restaurant_name = order.get("restaurant_name", "")
            
            tax_bracket = None
            
            # Cache'den kontrol et
            cache_key = restaurant_id or restaurant_name
            if cache_key in restaurant_tax_cache:
                tax_bracket = restaurant_tax_cache[cache_key]
            else:
                # DB'den bul - önce ID ile, sonra isimle
                business = None
                if restaurant_id:
                    business = await db.businesses.find_one(
                        {"id": restaurant_id},
                        {"_id": 0, "tax_bracket": 1}
                    )
                
                if not business and restaurant_name:
                    # İsimle ara (normalize edilmiş)
                    business = await db.businesses.find_one(
                        {"company_id": company_id, "name": {"$regex": f"^{restaurant_name}$", "$options": "i"}},
                        {"_id": 0, "tax_bracket": 1}
                    )
                
                if business:
                    tax_bracket = business.get("tax_bracket")
                
                restaurant_tax_cache[cache_key] = tax_bracket
            
            # Tax bracket'e göre kategorize et
            if tax_bracket == 1:
                card_percent_1 += price
            elif tax_bracket == 10:
                card_percent_10 += price
            elif tax_bracket == 20:
                card_percent_20 += price
            else:
                # Varsayılan %1
                card_percent_1 += price
    
    return {
        "order_count": order_count,
        "cash_total": cash_total,
        "card_percent_1": card_percent_1,
        "card_percent_10": card_percent_10,
        "card_percent_20": card_percent_20,
        "card_total": card_percent_1 + card_percent_10 + card_percent_20
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


@router.get("/{company_id}/couriers/{date}")
async def get_couriers_with_data(company_id: str, date: str):
    """
    Belirli bir tarih için kurye listesi, sipariş toplamları ve tahsilat durumları
    """
    # Tarih aralığını hesapla
    settings = await get_company_settings(company_id)
    start_dt, end_dt = calculate_date_range(date, settings["opening_time"], settings["closing_time"])
    
    # Şirkete bağlı kuryeleri getir
    query = {"company_id": company_id, "is_archived": {"$ne": True}, "is_active": {"$ne": False}}
    relations = await db.company_couriers.find(query, {"_id": 0, "courier_id": 1}).to_list(1000)
    courier_ids = list(set([rel["courier_id"] for rel in relations]))
    
    if not courier_ids:
        return {
            "date": date,
            "date_range": {
                "start": start_dt.isoformat(),
                "end": end_dt.isoformat()
            },
            "couriers": [],
            "summary": {
                "total_couriers": 0,
                "completed_couriers": 0,
                "processed_couriers": 0
            }
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
        result.append(courier_data)
    
    # Sırala: Önce siparişi olanlar
    result.sort(key=lambda x: (-x["order_data"]["order_count"], x["name"]))
    
    return {
        "date": date,
        "date_range": {
            "start": start_dt.isoformat(),
            "end": end_dt.isoformat()
        },
        "couriers": result,
        "summary": {
            "total_couriers": len(couriers),
            "completed_couriers": completed_count,
            "processed_couriers": processed_count
        }
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
            "admin_id": data.admin_id,
            "admin_name": data.admin_name,
            "created_at": datetime.now(timezone.utc).isoformat()
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
        
        # Nakit farkı işlemi
        if abs(cash_diff) > 0.01:
            description = f"{date_label} tarihli mütabakat - Nakit {'eksik' if cash_diff > 0 else 'fazla'} teslim"
            
            await db.transactions.insert_one({
                "id": str(uuid.uuid4()),
                "company_id": company_id,
                "entity_type": "courier",
                "entity_id": courier_id,
                "entity_name": courier_name,
                "type": "given" if cash_diff > 0 else "received",  # Eksik = borç (given)
                "amount": abs(cash_diff),
                "description": description,
                "admin_id": data.admin_id,
                "admin_name": data.admin_name,
                "is_mutabakat": True,
                "mutabakat_date": data.date,
                "mutabakat_type": "cash",
                "created_at": datetime.now(timezone.utc).isoformat()
            })
            
            # Kurye bakiyesini güncelle
            balance_change = cash_diff if cash_diff > 0 else -abs(cash_diff)
            await db.couriers.update_one(
                {"id": courier_id},
                {"$inc": {"balance": balance_change}}
            )
            
            transactions_created += 1
        
        # Kart farkı işlemi
        if abs(card_diff) > 0.01:
            description = f"{date_label} tarihli mütabakat - Kredi kartı {'eksik' if card_diff > 0 else 'fazla'} teslim"
            
            await db.transactions.insert_one({
                "id": str(uuid.uuid4()),
                "company_id": company_id,
                "entity_type": "courier",
                "entity_id": courier_id,
                "entity_name": courier_name,
                "type": "given" if card_diff > 0 else "received",
                "amount": abs(card_diff),
                "description": description,
                "admin_id": data.admin_id,
                "admin_name": data.admin_name,
                "is_mutabakat": True,
                "mutabakat_date": data.date,
                "mutabakat_type": "card",
                "created_at": datetime.now(timezone.utc).isoformat()
            })
            
            balance_change = card_diff if card_diff > 0 else -abs(card_diff)
            await db.couriers.update_one(
                {"id": courier_id},
                {"$inc": {"balance": balance_change}}
            )
            
            transactions_created += 1
        
        # Komisyon farkı işlemi (yanlış yüzde ile tahsil edilen tutar)
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
        # Komisyon farkı (pozitif = kurye yüksek yüzdeyle tahsil etmiş, ceza)
        commission_penalty = collection_commission - system_commission
        
        if abs(commission_penalty) > 0.01:
            description = f"{date_label} tarihli mütabakat - Yanlış yüzde farkı ({'fazla' if commission_penalty > 0 else 'eksik'} tahsil)"
            
            await db.transactions.insert_one({
                "id": str(uuid.uuid4()),
                "company_id": company_id,
                "entity_type": "courier",
                "entity_id": courier_id,
                "entity_name": courier_name,
                "type": "given" if commission_penalty > 0 else "received",  # Fazla tahsil = borç
                "amount": abs(commission_penalty),
                "description": description,
                "admin_id": data.admin_id,
                "admin_name": data.admin_name,
                "is_mutabakat": True,
                "mutabakat_date": data.date,
                "mutabakat_type": "commission",
                "created_at": datetime.now(timezone.utc).isoformat()
            })
            
            balance_change = commission_penalty if commission_penalty > 0 else -abs(commission_penalty)
            await db.couriers.update_one(
                {"id": courier_id},
                {"$inc": {"balance": balance_change}}
            )
            
            transactions_created += 1
        
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
            "processed_at": datetime.now(timezone.utc).isoformat()
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
        
        # NOT: Tahsilat kaydı silinmez, sadece mütabakat geri alınır
        # Tahsilat değerleri korunur
        
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


@router.get("/{company_id}/weekly-summary")
async def get_weekly_summary(company_id: str, week_start: str = None):
    """
    Haftalık mütabakat özeti - her gün için tamamlanan/toplam kurye sayısı
    """
    if week_start:
        start_date = datetime.strptime(week_start, "%Y-%m-%d")
    else:
        today = datetime.now(timezone.utc)
        start_date = today - timedelta(days=today.weekday())
    
    start_date = start_date.replace(hour=0, minute=0, second=0, microsecond=0)
    
    # Toplam aktif kurye sayısı
    query = {"company_id": company_id, "is_archived": {"$ne": True}, "is_active": {"$ne": False}}
    relations = await db.company_couriers.find(query, {"_id": 0, "courier_id": 1}).to_list(1000)
    total_couriers = len(set([rel["courier_id"] for rel in relations]))
    
    if total_couriers == 0:
        relations = await db.company_couriers.find({"company_id": company_id}, {"_id": 0, "courier_id": 1}).to_list(1000)
        total_couriers = len(set([rel["courier_id"] for rel in relations]))
    
    days = []
    day_names_tr = ["Pzt", "Sal", "Çar", "Per", "Cum", "Cmt", "Paz"]
    today_str = datetime.now(timezone.utc).strftime("%Y-%m-%d")
    
    for i in range(7):
        day_date = start_date + timedelta(days=i)
        date_str = day_date.strftime("%Y-%m-%d")
        
        # O gün tahsilat yapılan kurye sayısı
        completed_couriers = await db.daily_mutabakat_collections.distinct(
            "courier_id",
            {"company_id": company_id, "date": date_str}
        )
        completed_count = len(completed_couriers)
        
        # O gün işlenen kurye sayısı
        processed_couriers = await db.daily_mutabakat_processed.distinct(
            "courier_id",
            {"company_id": company_id, "date": date_str}
        )
        processed_count = len(processed_couriers)
        
        is_future = date_str > today_str
        is_today = date_str == today_str
        
        if is_future:
            status = "future"
        elif processed_count > 0:
            status = "processed"
        elif completed_count >= total_couriers and total_couriers > 0:
            status = "complete"
        elif completed_count > 0:
            status = "partial"
        else:
            status = "empty"
        
        days.append({
            "date": date_str,
            "day_name": day_names_tr[i],
            "day_number": day_date.day,
            "completed": completed_count,
            "processed": processed_count,
            "total": total_couriers,
            "status": status,
            "is_today": is_today
        })
    
    return {
        "week_start": start_date.strftime("%Y-%m-%d"),
        "total_couriers": total_couriers,
        "days": days
    }
