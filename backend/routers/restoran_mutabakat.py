"""
Restoran Mütabakat API
- Hafta bazlı restoran mütabakat görüntüleme
- Toplu mütabakat onaylama (restoran bakiyesine)
- Geri alma
- Otomatik işleme ayarları
"""
from fastapi import APIRouter, HTTPException
from pydantic import BaseModel
from typing import List, Optional
from datetime import datetime, timezone, timedelta
import uuid

from utils.database import db

router = APIRouter(prefix="/api/restoran-mutabakat", tags=["Restoran Mütabakat"])


class WeekInfo(BaseModel):
    week_start: str  # ISO format
    week_end: str    # ISO format
    label: str       # "10-17 Şubat 2026"


class ApplyMutabakatItem(BaseModel):
    restaurant_id: str
    restaurant_name: str
    business_id: str  # Muhasebe işlemi için
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
    """Son N hafta listesini oluştur"""
    now = datetime.now()
    day = now.weekday()  # 0=Pazartesi
    
    # Bu haftanın pazartesini bul
    this_monday = now - timedelta(days=day)
    
    # Saatleri parse et
    open_h, open_m = map(int, opening_time.split(':'))
    close_h, close_m = map(int, closing_time.split(':'))
    
    weeks = []
    for i in range(count):
        week_start = this_monday - timedelta(weeks=i)
        week_start = week_start.replace(hour=open_h, minute=open_m, second=0, microsecond=0)
        
        week_end = week_start + timedelta(weeks=1)
        week_end = week_end.replace(hour=close_h, minute=close_m, second=0, microsecond=0)
        
        # Label oluştur
        start_day = week_start.strftime("%d")
        end_day = week_end.strftime("%d")
        month = week_start.strftime("%B")
        year = week_start.strftime("%Y")
        
        # Türkçe ay isimleri
        month_tr = {
            "January": "Ocak", "February": "Şubat", "March": "Mart",
            "April": "Nisan", "May": "Mayıs", "June": "Haziran",
            "July": "Temmuz", "August": "Ağustos", "September": "Eylül",
            "October": "Ekim", "November": "Kasım", "December": "Aralık"
        }.get(month, month)
        
        label = f"{start_day}-{end_day} {month_tr} {year}"
        
        weeks.append({
            "week_start": week_start.isoformat(),
            "week_end": week_end.isoformat(),
            "label": label,
            "is_current": i == 0
        })
    
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
    
    opening_time = company.get("opening_time", "09:00") if company else "09:00"
    closing_time = company.get("closing_time", "22:00") if company else "22:00"
    
    weeks = get_weeks_list(opening_time, closing_time)
    
    return {
        "weeks": weeks,
        "opening_time": opening_time,
        "closing_time": closing_time
    }


@router.post("/data/{company_id}")
async def get_week_mutabakat_data(company_id: str, week: WeekInfo):
    """Seçili hafta için restoran mütabakat verilerini getir"""
    try:
        start_dt = datetime.fromisoformat(week.week_start.replace('Z', '+00:00'))
        end_dt = datetime.fromisoformat(week.week_end.replace('Z', '+00:00'))
    except ValueError:
        raise HTTPException(status_code=400, detail="Geçersiz tarih formatı")
    
    # Şirkete ait restoranları getir
    restaurants = await db.restaurants.find(
        {"company_id": company_id, "is_archived": {"$ne": True}},
        {"_id": 0, "id": 1, "name": 1, "business_id": 1}
    ).to_list(500)
    
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
    
    # İlgili business'ları da al (muhasebe işlemi için gerekli)
    businesses = await db.businesses.find(
        {"company_id": company_id},
        {"_id": 0, "id": 1, "name": 1}
    ).to_list(500)
    business_name_map = {b["name"].lower().replace(" ", "").replace("&", ""): b["id"] for b in businesses}
    
    # Teslim edilen siparişleri getir
    orders = await db.orders.find(
        {
            "company_id": company_id,
            "restaurant_id": {"$in": restaurant_ids},
            "status": "delivered",
            "delivered_at": {
                "$gte": start_dt.isoformat(),
                "$lte": end_dt.isoformat()
            }
        },
        {
            "_id": 0, 
            "restaurant_id": 1, 
            "total_amount": 1,
            "delivery_fee": 1,
            "payment_method": 1
        }
    ).to_list(10000)
    
    # Şirket ayarlarını al (KDV oranı, POS komisyonu)
    company = await db.companies.find_one(
        {"id": company_id},
        {"_id": 0, "vat_rate": 1, "pos_commission_rate": 1}
    )
    
    vat_rate = company.get("vat_rate", 10) if company else 10  # %10 varsayılan KDV
    pos_commission_rate = company.get("pos_commission_rate", 1.79) if company else 1.79  # %1.79 varsayılan POS
    
    # Restoran bazlı agregasyon
    restaurant_data = {}
    for r in restaurants:
        restaurant_data[r["id"]] = {
            "restaurant_id": r["id"],
            "restaurant_name": r["name"],
            "business_id": r.get("business_id", ""),
            "order_count": 0,
            "delivery_fee": 0,
            "cash_amount": 0,
            "card_amount": 0
        }
    
    for order in orders:
        rid = order.get("restaurant_id")
        if rid not in restaurant_data:
            continue
        
        data = restaurant_data[rid]
        data["order_count"] += 1
        data["delivery_fee"] += order.get("delivery_fee", 0)
        
        payment = order.get("payment_method", "cash")
        total = order.get("total_amount", 0)
        
        if payment == "cash":
            data["cash_amount"] += total
        else:  # card, online
            data["card_amount"] += total
    
    # Hesaplamaları yap ve sonuç listesi oluştur
    result = []
    total_orders = 0
    total_net = 0
    
    for rid, data in restaurant_data.items():
        if data["order_count"] == 0:
            continue
        
        # Business ID'yi isim eşleştirmesiyle bul (eğer yoksa)
        if not data["business_id"]:
            r_name = data["restaurant_name"].lower().replace(" ", "").replace("&", "")
            for b_name, b_id in business_name_map.items():
                if r_name in b_name or b_name in r_name:
                    data["business_id"] = b_id
                    # Restaurant'a da kaydet
                    await db.restaurants.update_one(
                        {"id": rid},
                        {"$set": {"business_id": b_id}}
                    )
                    break
        
        # Hesaplamalar
        delivery_fee = data["delivery_fee"]
        delivery_vat = delivery_fee * (vat_rate / 100)
        total_delivery = delivery_fee + delivery_vat
        pos_commission = data["card_amount"] * (pos_commission_rate / 100)
        
        # Net tutar: (Taşıma + KDV + POS) - (Nakit + Kart)
        net_amount = (total_delivery + pos_commission) - (data["cash_amount"] + data["card_amount"])
        
        result.append({
            "restaurant_id": rid,
            "restaurant_name": data["restaurant_name"],
            "business_id": data["business_id"],
            "order_count": data["order_count"],
            "delivery_fee": round(delivery_fee, 2),
            "delivery_vat": round(delivery_vat, 2),
            "total_delivery": round(total_delivery, 2),
            "pos_commission": round(pos_commission, 2),
            "cash_amount": round(data["cash_amount"], 2),
            "card_amount": round(data["card_amount"], 2),
            "net_amount": round(net_amount, 2),
            "is_processed": rid in processed_map,
            "transaction_id": processed_map.get(rid)
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
        "vat_rate": vat_rate,
        "pos_commission_rate": pos_commission_rate
    }


@router.post("/apply/{company_id}")
async def apply_mutabakat(company_id: str, data: ApplyMutabakatRequest):
    """Seçili restoranların mütabakatını onayla ve bakiyeye ekle"""
    if not data.items:
        raise HTTPException(status_code=400, detail="İşlenecek restoran seçilmedi")
    
    try:
        start_dt = datetime.fromisoformat(data.week_start.replace('Z', '+00:00'))
        end_dt = datetime.fromisoformat(data.week_end.replace('Z', '+00:00'))
    except ValueError:
        raise HTTPException(status_code=400, detail="Geçersiz tarih formatı")
    
    description = get_mutabakat_description(start_dt, end_dt)
    now = datetime.now(timezone.utc).isoformat()
    
    processed_count = 0
    skipped_count = 0
    
    for item in data.items:
        # Business ID kontrolü
        if not item.business_id:
            skipped_count += 1
            continue
        
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
        
        # İşlem oluştur
        transaction_id = str(uuid.uuid4())
        transaction = {
            "id": transaction_id,
            "company_id": company_id,
            "entity_type": "business",
            "entity_id": item.business_id,
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
            "business_id": item.business_id,
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
                "updated_at": datetime.now(timezone.utc).isoformat()
            }
        },
        upsert=True
    )
    
    return {"success": True, "enabled": data.enabled}
