"""
Haftalık Hakediş Toplu İşlem API
- Hafta bazlı hakediş görüntüleme
- Toplu hakediş ekleme (kurye bakiyesine)
- Son hafta geri alma
- Otomatik işleme ayarları
"""
from fastapi import APIRouter, HTTPException, Depends
from pydantic import BaseModel
from typing import List, Optional
from datetime import datetime, timezone, timedelta
import uuid
import re

from utils.database import db
from utils.helpers import ensure_turkey_timezone, get_turkey_now, TURKEY_TZ
from utils.jwt_utils import require_admin

router = APIRouter(prefix="/api/weekly-hakedis", tags=["Haftalık Hakediş"], dependencies=[Depends(require_admin)])


class WeekInfo(BaseModel):
    week_start: str  # ISO format
    week_end: str    # ISO format
    label: str       # "10-17 Şubat 2026"


class ApplyHakedisItem(BaseModel):
    courier_id: str
    courier_name: str
    amount: float
    order_count: int
    distance_km: float


class ApplyHakedisRequest(BaseModel):
    week_start: str
    week_end: str
    items: List[ApplyHakedisItem]
    admin_id: str
    admin_name: str
    add_hakedis: bool = True
    add_jetpuan: bool = True


class RevertHakedisRequest(BaseModel):
    week_start: str
    week_end: str
    admin_id: str
    admin_name: str
    courier_ids: Optional[List[str]] = None  # Boşsa tümünü geri al


class AutoSettingsUpdate(BaseModel):
    enabled: bool


def get_week_description(start_dt: datetime, end_dt: datetime) -> str:
    """Hafta açıklama metni oluştur"""
    start_str = start_dt.strftime("%d.%m.%Y %H:%M")
    end_str = end_dt.strftime("%d.%m.%Y %H:%M")
    return f"{start_str} - {end_str} Haftalık Hakediş"


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
        # i=0: Bu hafta, i=1: Geçen hafta, ...
        week_start = this_monday - timedelta(weeks=i)
        week_start = week_start.replace(hour=open_h, minute=open_m, second=0, microsecond=0)
        
        week_end = week_start + timedelta(weeks=1)
        week_end = week_end.replace(hour=close_h, minute=close_m, second=0, microsecond=0)
        
        # Label oluştur
        start_day = week_start.strftime("%d")
        end_day = week_end.strftime("%d")
        start_month = week_start.strftime("%B")
        end_month = week_end.strftime("%B")
        year = week_start.strftime("%Y")
        end_year = week_end.strftime("%Y")
        
        # Türkçe ay isimleri
        month_map = {
            "January": "Ocak", "February": "Şubat", "March": "Mart",
            "April": "Nisan", "May": "Mayıs", "June": "Haziran",
            "July": "Temmuz", "August": "Ağustos", "September": "Eylül",
            "October": "Ekim", "November": "Kasım", "December": "Aralık"
        }
        start_month_tr = month_map.get(start_month, start_month)
        end_month_tr = month_map.get(end_month, end_month)
        
        # Ay veya yıl farklıysa her ikisini de göster
        if start_month != end_month:
            if year != end_year:
                label = f"{start_day} {start_month_tr} {year} - {end_day} {end_month_tr} {end_year}"
            else:
                label = f"{start_day} {start_month_tr} - {end_day} {end_month_tr} {year}"
        else:
            label = f"{start_day}-{end_day} {start_month_tr} {year}"
        
        weeks.append({
            "week_start": week_start.isoformat(),
            "week_end": week_end.isoformat(),
            "label": label,
            "is_current": i == 0
        })
    
    return weeks


@router.get("/weeks/{company_id}")
async def get_available_weeks(company_id: str):
    """Şirket çalışma saatlerine göre hafta listesini döndür"""
    # Çalışma saatlerini al
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
async def get_week_hakedis_data(company_id: str, week: WeekInfo):
    """Seçili hafta için kurye hakediş verilerini getir"""
    # Frontend Türkiye saati gönderiyor, +03:00 formatına çevir
    start_dt_str = ensure_turkey_timezone(week.week_start)
    end_dt_str = ensure_turkey_timezone(week.week_end)
    
    try:
        start_dt = datetime.fromisoformat(start_dt_str)
        end_dt = datetime.fromisoformat(end_dt_str)
    except ValueError:
        raise HTTPException(status_code=400, detail="Geçersiz tarih formatı")
    
    # Şirkete ait kuryeleri getir (hourly_rate, last_active_at, availability_status, is_admin_linked dahil)
    couriers = await db.couriers.find(
        {
            "$or": [
                {"company_ids": company_id},
                {"company_id": company_id}
            ],
            "is_archived": {"$ne": True}
        },
        {"_id": 0, "id": 1, "name": 1, "phone": 1, "hourly_rate": 1, "availability_status": 1, "last_active_at": 1, "is_admin_linked": 1, "linked_admin_id": 1}
    ).to_list(1000)
    
    courier_map = {c["id"]: c for c in couriers}
    courier_ids = list(courier_map.keys())
    
    if not courier_ids:
        return {"couriers": [], "summary": {"total_amount": 0, "total_orders": 0, "total_hourly_earnings": 0}}
    
    # Teslim edilen siparişleri getir - Türkiye saati (+03:00) formatında sorgu
    pipeline = [
        {
            "$match": {
                "company_id": company_id,
                "status": "delivered",
                "courier_id": {"$in": courier_ids},
                "delivered_at": {
                    "$gte": start_dt_str,
                    "$lte": end_dt_str
                }
            }
        },
        {
            "$group": {
                "_id": "$courier_id",
                "total_amount": {"$sum": {"$ifNull": ["$courier_fee", 0]}},
                "total_orders": {"$sum": 1},
                "total_distance": {"$sum": {"$ifNull": ["$distance_km", 0]}}
            }
        }
    ]
    
    results = await db.orders.aggregate(pipeline).to_list(1000)
    hakedis_map = {r["_id"]: r for r in results}
    
    # Saatlik çalışma sürelerini courier_daily_active tablosundan al
    start_date = start_dt.strftime("%Y-%m-%d")
    end_date = end_dt.strftime("%Y-%m-%d")
    turkey_tz = timezone(timedelta(hours=3))
    now = datetime.now(turkey_tz)
    today = now.strftime("%Y-%m-%d")
    
    # courier_daily_active tablosundan aktif süreleri al
    active_hours_pipeline = [
        {
            "$match": {
                "courier_id": {"$in": courier_ids},
                "date": {"$gte": start_date, "$lte": end_date}
            }
        },
        {
            "$group": {
                "_id": "$courier_id",
                "total_active_minutes": {"$sum": "$active_minutes"}
            }
        }
    ]
    
    active_hours_results = await db.courier_daily_active.aggregate(active_hours_pipeline).to_list(1000)
    active_hours_map = {r["_id"]: r["total_active_minutes"] for r in active_hours_results}
    
    # Şu an aktif kuryeler için anlık süre ekle (eğer bugün aralıkta ise)
    if start_date <= today <= end_date:
        for courier_id, courier in courier_map.items():
            if courier.get("availability_status") == "active" and courier.get("last_active_at"):
                try:
                    last_active = datetime.fromisoformat(courier["last_active_at"].replace('Z', '+00:00'))
                    current_minutes = int((now - last_active).total_seconds() / 60)
                    active_hours_map[courier_id] = active_hours_map.get(courier_id, 0) + current_minutes
                except (ValueError, TypeError):
                    pass
    
    # Hafta açıklaması
    week_description = get_week_description(start_dt, end_dt)
    
    # Regex için özel karakterleri escape et (noktalar regex'te herhangi karakter anlamına gelir)
    week_description_escaped = re.escape(week_description)
    
    # Bu hafta için işlenmiş kuryeleri kontrol et
    processed_txs = await db.transactions.find(
        {
            "company_id": company_id,
            "entity_type": "courier",
            "is_hakedis": True,
            "description": {"$regex": week_description_escaped, "$options": "i"}
        },
        {"_id": 0, "entity_id": 1, "amount": 1, "id": 1}
    ).to_list(1000)
    
    processed_map = {}
    for tx in processed_txs:
        processed_map[tx["entity_id"]] = {
            "amount": tx["amount"],
            "transaction_id": tx["id"]
        }
    
    # Kurye listesini oluştur
    courier_list = []
    total_amount = 0
    total_orders = 0
    total_hourly_earnings = 0
    
    for courier_id, courier in courier_map.items():
        hakedis = hakedis_map.get(courier_id, {})
        package_amount = round(hakedis.get("total_amount", 0), 2)
        orders = hakedis.get("total_orders", 0)
        distance = round(hakedis.get("total_distance", 0), 2)
        
        # Saatlik kazanç hesapla
        active_minutes = active_hours_map.get(courier_id, 0)
        active_hours = round(active_minutes / 60, 2)
        hourly_rate = courier.get("hourly_rate") or 0
        hourly_earnings = round(active_hours * hourly_rate, 2)
        
        # Toplam hakediş = paket kazancı + saatlik kazanç
        amount = round(package_amount + hourly_earnings, 2)
        
        # İşlenmiş mi kontrol et
        processed_info = processed_map.get(courier_id)
        is_processed = False
        transaction_id = None
        
        if processed_info:
            # Tutar eşleşiyor mu?
            if abs(processed_info["amount"] - amount) < 0.01:
                is_processed = True
                transaction_id = processed_info["transaction_id"]
        
        courier_list.append({
            "courier_id": courier_id,
            "courier_name": courier.get("name", ""),
            "courier_phone": courier.get("phone", ""),
            "amount": amount,
            "package_amount": package_amount,
            "order_count": orders,
            "distance_km": distance,
            "active_hours": active_hours,
            "hourly_rate": hourly_rate,
            "hourly_earnings": hourly_earnings,
            "is_processed": is_processed,
            "transaction_id": transaction_id,
            "is_admin_linked": courier.get("is_admin_linked", False),
            "linked_admin_id": courier.get("linked_admin_id")
        })
        
        total_amount += amount
        total_orders += orders
        total_hourly_earnings += hourly_earnings
    
    # Hakediş'e göre sırala
    courier_list.sort(key=lambda x: x["amount"], reverse=True)
    
    return {
        "couriers": courier_list,
        "summary": {
            "total_amount": round(total_amount, 2),
            "total_orders": total_orders,
            "total_hourly_earnings": round(total_hourly_earnings, 2)
        },
        "week_description": week_description,
        "filter": {
            "week_start": week.week_start,
            "week_end": week.week_end
        },
        "date_range_label": f"{start_dt.strftime('%d.%m.%Y %H:%M')} - {end_dt.strftime('%d.%m.%Y %H:%M')}"
    }


@router.post("/apply/{company_id}")
async def apply_weekly_hakedis(company_id: str, data: ApplyHakedisRequest):
    """Seçili kuryelere haftalık hakediş ekle"""
    from routers.jetpuan import calculate_and_credit_points
    from routers.accounting import create_activity_log
    
    # Frontend Türkiye saati gönderiyor, +03:00 formatına çevir
    start_dt_str = ensure_turkey_timezone(data.week_start)
    end_dt_str = ensure_turkey_timezone(data.week_end)
    
    try:
        start_dt = datetime.fromisoformat(start_dt_str)
        end_dt = datetime.fromisoformat(end_dt_str)
    except ValueError:
        raise HTTPException(status_code=400, detail="Geçersiz tarih formatı")
    
    week_description = get_week_description(start_dt, end_dt)
    created_at = get_turkey_now()
    
    results = []
    skipped = []
    
    for item in data.items:
        if item.amount <= 0:
            skipped.append({
                "courier_id": item.courier_id,
                "courier_name": item.courier_name,
                "reason": "Tutar 0 veya negatif"
            })
            continue
        
        # Daha önce işlenmiş mi kontrol et
        week_description_escaped = re.escape(week_description)
        existing = await db.transactions.find_one({
            "company_id": company_id,
            "entity_type": "courier",
            "entity_id": item.courier_id,
            "is_hakedis": True,
            "description": {"$regex": week_description_escaped, "$options": "i"}
        })
        
        if existing:
            skipped.append({
                "courier_id": item.courier_id,
                "courier_name": item.courier_name,
                "reason": "Bu hafta için zaten işlenmiş"
            })
            continue
        
        # Açıklama oluştur
        desc_parts = [week_description]
        if item.order_count > 0:
            desc_parts.append(f"{item.order_count} Sipariş")
        if item.distance_km > 0:
            desc_parts.append(f"{item.distance_km:.1f} km")
        
        description = " | ".join(desc_parts)
        
        # Transaction oluştur
        transaction = {
            "id": str(uuid.uuid4()),
            "entity_type": "courier",
            "entity_id": item.courier_id,
            "company_id": company_id,
            "type": "payment_in",
            "amount": item.amount,
            "description": description,
            "is_hakedis": data.add_hakedis,
            "admin_id": data.admin_id,
            "admin_name": data.admin_name,
            "created_at": created_at,
            "weekly_hakedis_meta": {
                "week_start": data.week_start,
                "week_end": data.week_end,
                "order_count": item.order_count,
                "distance_km": item.distance_km
            }
        }
        
        await db.transactions.insert_one(transaction)
        
        # JetPuan ekle
        if data.add_jetpuan:
            try:
                await calculate_and_credit_points(item.courier_id, item.amount)
            except Exception as e:
                print(f"JetPuan credit failed for {item.courier_id}: {e}")
        
        # Activity log
        try:
            await create_activity_log({
                "company_id": company_id,
                "admin_id": data.admin_id,
                "admin_name": data.admin_name,
                "action": "weekly_hakedis",
                "entity_type": "courier",
                "entity_id": item.courier_id,
                "entity_name": item.courier_name,
                "details": {
                    "transaction_id": transaction["id"],
                    "amount": item.amount,
                    "week_start": data.week_start,
                    "week_end": data.week_end,
                    "order_count": item.order_count
                }
            })
        except Exception as e:
            print(f"Activity log failed: {e}")
        
        results.append({
            "courier_id": item.courier_id,
            "courier_name": item.courier_name,
            "amount": item.amount,
            "transaction_id": transaction["id"]
        })
    
    return {
        "message": f"{len(results)} kuryeye hakediş eklendi",
        "processed": results,
        "skipped": skipped,
        "total_amount": sum(r["amount"] for r in results)
    }


@router.post("/revert/{company_id}")
async def revert_weekly_hakedis(company_id: str, data: RevertHakedisRequest):
    """Son hafta hakedişlerini geri al (seçili kuryeler veya tümü)"""
    from routers.jetpuan import calculate_and_debit_points
    from routers.accounting import create_activity_log
    
    # Frontend Türkiye saati gönderiyor, +03:00 formatına çevir
    start_dt_str = ensure_turkey_timezone(data.week_start)
    end_dt_str = ensure_turkey_timezone(data.week_end)
    
    try:
        start_dt = datetime.fromisoformat(start_dt_str)
        end_dt = datetime.fromisoformat(end_dt_str)
    except ValueError:
        raise HTTPException(status_code=400, detail="Geçersiz tarih formatı")
    
    week_description = get_week_description(start_dt, end_dt)
    
    # Bu hafta için işlenmiş transaction'ları bul
    week_description_escaped = re.escape(week_description)
    query = {
        "company_id": company_id,
        "entity_type": "courier",
        "is_hakedis": True,
        "description": {"$regex": week_description_escaped, "$options": "i"}
    }
    
    # Eğer belirli kuryeler seçildiyse, sadece onları filtrele
    if data.courier_ids and len(data.courier_ids) > 0:
        query["entity_id"] = {"$in": data.courier_ids}
    
    transactions = await db.transactions.find(query).to_list(1000)
    
    if not transactions:
        raise HTTPException(status_code=404, detail="Seçili kuryeler için işlenmiş hakediş bulunamadı")
    
    reverted = []
    
    for tx in transactions:
        tx_id = tx.get("id")
        courier_id = tx.get("entity_id")
        amount = tx.get("amount", 0)
        
        # Transaction'ı sil
        await db.transactions.delete_one({"id": tx_id})
        
        # JetPuan'ı geri al
        try:
            await calculate_and_debit_points(courier_id, amount)
        except Exception as e:
            print(f"JetPuan deduction failed for {courier_id}: {e}")
        
        # Activity log
        try:
            courier = await db.couriers.find_one({"id": courier_id}, {"_id": 0, "name": 1})
            await create_activity_log({
                "company_id": company_id,
                "admin_id": data.admin_id,
                "admin_name": data.admin_name,
                "action": "revert_weekly_hakedis",
                "entity_type": "courier",
                "entity_id": courier_id,
                "entity_name": courier.get("name", "") if courier else "",
                "details": {
                    "reverted_transaction_id": tx_id,
                    "amount": amount,
                    "week_start": data.week_start,
                    "week_end": data.week_end
                }
            })
        except Exception as e:
            print(f"Activity log failed: {e}")
        
        reverted.append({
            "courier_id": courier_id,
            "amount": amount,
            "transaction_id": tx_id
        })
    
    return {
        "message": f"{len(reverted)} kuryenin hakedişi geri alındı",
        "reverted": reverted,
        "total_reverted": sum(r["amount"] for r in reverted)
    }


# Otomatik işleme ayarları
@router.get("/auto-settings/{company_id}")
async def get_auto_settings(company_id: str):
    """Otomatik hakediş işleme ayarlarını getir"""
    settings = await db.weekly_hakedis_settings.find_one(
        {"company_id": company_id},
        {"_id": 0}
    )
    
    return {
        "enabled": settings.get("enabled", False) if settings else False,
        "last_auto_run": settings.get("last_auto_run") if settings else None
    }


@router.put("/auto-settings/{company_id}")
async def update_auto_settings(company_id: str, data: AutoSettingsUpdate):
    """Otomatik hakediş işleme ayarlarını güncelle"""
    await db.weekly_hakedis_settings.update_one(
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
    
    return {"message": "Ayarlar güncellendi", "enabled": data.enabled}


# Bu fonksiyon scheduler tarafından çağrılacak
async def process_auto_weekly_hakedis(company_id: str):
    """Otomatik haftalık hakediş işleme (scheduler tarafından çağrılır)"""
    from routers.jetpuan import calculate_and_credit_points
    
    # Ayarları kontrol et
    settings = await db.weekly_hakedis_settings.find_one({"company_id": company_id})
    if not settings or not settings.get("enabled"):
        return {"skipped": True, "reason": "Otomatik işlem kapalı"}
    
    # Çalışma saatlerini al
    company = await db.companies.find_one(
        {"id": company_id},
        {"_id": 0, "opening_time": 1, "closing_time": 1}
    )
    
    opening_time = company.get("opening_time", "09:00") if company else "09:00"
    closing_time = company.get("closing_time", "22:00") if company else "22:00"
    
    # Geçen haftayı hesapla
    weeks = get_weeks_list(opening_time, closing_time, 2)
    last_week = weeks[1] if len(weeks) > 1 else None
    
    if not last_week:
        return {"skipped": True, "reason": "Hafta bilgisi hesaplanamadı"}
    
    # Hafta verilerini al
    week_info = WeekInfo(
        week_start=last_week["week_start"],
        week_end=last_week["week_end"],
        label=last_week["label"]
    )
    
    # Mock request for getting data
    data_response = await get_week_hakedis_data(company_id, week_info)
    
    # İşlenmemiş kuryeleri filtrele
    unprocessed = [c for c in data_response["couriers"] if not c["is_processed"] and c["amount"] > 0]
    
    if not unprocessed:
        await db.weekly_hakedis_settings.update_one(
            {"company_id": company_id},
            {"$set": {"last_auto_run": get_turkey_now()}}
        )
        return {"skipped": True, "reason": "İşlenecek kurye yok"}
    
    # Hakediş ekle
    items = [
        ApplyHakedisItem(
            courier_id=c["courier_id"],
            courier_name=c["courier_name"],
            amount=c["amount"],
            order_count=c["order_count"],
            distance_km=c["distance_km"]
        )
        for c in unprocessed
    ]
    
    request = ApplyHakedisRequest(
        week_start=last_week["week_start"],
        week_end=last_week["week_end"],
        items=items,
        admin_id="system",
        admin_name="Sistem",
        add_hakedis=True,
        add_jetpuan=True
    )
    
    result = await apply_weekly_hakedis(company_id, request)
    
    # Son çalışma zamanını güncelle
    await db.weekly_hakedis_settings.update_one(
        {"company_id": company_id},
        {"$set": {"last_auto_run": get_turkey_now()}}
    )
    
    return result
