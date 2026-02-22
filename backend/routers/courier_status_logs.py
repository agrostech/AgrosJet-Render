"""
Kurye Durum Log Sistemi
- Durum değişikliklerini kaydet
- Aktif süre hesaplama
- Saatlik kazanç hesaplama
"""
from fastapi import APIRouter, HTTPException, Query
from pydantic import BaseModel
from typing import Optional, List
from datetime import datetime, timezone, timedelta
import uuid

from utils.database import db

router = APIRouter(prefix="/api/courier-status-logs", tags=["Kurye Durum Logları"])


class StatusLogEntry(BaseModel):
    courier_id: str
    old_status: str
    new_status: str
    changed_by: str = "system"  # admin, courier, system
    changed_by_name: Optional[str] = None


async def get_company_work_hours(company_id: str):
    """Şirket açılış/kapanış saatlerini getir"""
    if not company_id:
        return "06:00", "06:00"
    company = await db.companies.find_one(
        {"id": company_id},
        {"_id": 0, "opening_time": 1, "closing_time": 1}
    )
    if not company:
        return "06:00", "06:00"
    return company.get("opening_time", "06:00"), company.get("closing_time", "06:00")


def get_business_date(timestamp: datetime, opening_time: str) -> str:
    """
    Şirket açılış saatine göre iş gününü hesapla.
    Örn: Açılış 06:00 ise, 05:30'da yapılan işlem önceki güne ait.
    """
    open_h, open_m = map(int, opening_time.split(":"))
    
    # Timestamp'in saatini kontrol et
    if timestamp.hour < open_h or (timestamp.hour == open_h and timestamp.minute < open_m):
        # Açılış saatinden önce - önceki iş günü
        business_day = timestamp - timedelta(days=1)
    else:
        business_day = timestamp
    
    return business_day.strftime("%Y-%m-%d")


async def create_status_log(
    courier_id: str,
    old_status: str,
    new_status: str,
    changed_by: str = "system",
    changed_by_name: Optional[str] = None,
    company_id: Optional[str] = None
):
    """
    Durum değişikliği logu oluştur ve aktiflik sayacını güncelle
    
    Mantık:
    - Kurye aktif olduğunda: last_active_at kaydedilir
    - Kurye aktiften çıktığında: geçen süre courier_daily_active'e eklenir
    - Log sadece durum değişikliğini kaydeder (duration yok)
    """
    now = datetime.now(timezone.utc)
    
    # Şirket çalışma saatlerini al
    opening_time, _ = await get_company_work_hours(company_id)
    business_date = get_business_date(now, opening_time)
    
    # Kurye aktif OLDUĞUNDA → last_active_at kaydet
    if new_status == "active" and old_status != "active":
        await db.couriers.update_one(
            {"id": courier_id},
            {"$set": {"last_active_at": now.isoformat()}}
        )
    
    # Kurye aktiften ÇIKTIĞINDA → sayacı güncelle
    if old_status == "active" and new_status != "active":
        courier = await db.couriers.find_one(
            {"id": courier_id},
            {"_id": 0, "last_active_at": 1}
        )
        
        if courier and courier.get("last_active_at"):
            try:
                last_active = datetime.fromisoformat(courier["last_active_at"].replace('Z', '+00:00'))
                active_minutes = int((now - last_active).total_seconds() / 60)
                
                if active_minutes > 0:
                    # courier_daily_active sayacını güncelle
                    await db.courier_daily_active.update_one(
                        {"courier_id": courier_id, "date": business_date},
                        {
                            "$inc": {"active_minutes": active_minutes},
                            "$setOnInsert": {
                                "courier_id": courier_id,
                                "date": business_date,
                                "company_id": company_id
                            }
                        },
                        upsert=True
                    )
            except (ValueError, TypeError):
                pass
        
        # last_active_at'ı temizle
        await db.couriers.update_one(
            {"id": courier_id},
            {"$unset": {"last_active_at": ""}}
        )
    
    # Sadece durum değişikliği logu (duration yok)
    log_entry = {
        "id": str(uuid.uuid4()),
        "courier_id": courier_id,
        "company_id": company_id,
        "status": new_status,
        "changed_by": changed_by,
        "changed_by_name": changed_by_name,
        "timestamp": now.isoformat(),
        "date": business_date
    }
    
    await db.courier_status_logs.insert_one(log_entry)
    return log_entry


@router.get("/courier/{courier_id}/today")
async def get_today_logs(courier_id: str, company_id: Optional[str] = Query(None)):
    """Kuryenin bugünkü durum geçmişi (şirket iş gününe göre)"""
    now = datetime.now(timezone.utc)
    
    # Şirket açılış saatini al
    if company_id:
        opening_time, _ = await get_company_work_hours(company_id)
    else:
        # Kuryenin şirketini bul
        courier = await db.couriers.find_one({"id": courier_id}, {"_id": 0, "company_id": 1, "company_ids": 1})
        if courier:
            c_id = courier.get("company_id") or (courier.get("company_ids", [None])[0] if courier.get("company_ids") else None)
            opening_time, _ = await get_company_work_hours(c_id)
        else:
            opening_time = "06:00"
    
    # Bugünün iş gününü hesapla
    today = get_business_date(now, opening_time)
    
    logs = await db.courier_status_logs.find(
        {"courier_id": courier_id, "date": today},
        {"_id": 0}
    ).sort("timestamp", 1).to_list(100)
    
    # Toplam aktif süre hesapla
    total_active_minutes = sum(
        log.get("duration_minutes", 0) 
        for log in logs 
        if log.get("old_status") == "active"
    )
    
    # Eğer şu an aktif ise, son log'dan şimdiye kadar olan süreyi ekle
    courier = await db.couriers.find_one({"id": courier_id}, {"_id": 0, "availability_status": 1})
    current_status = courier.get("availability_status", "offline") if courier else "offline"
    
    current_active_minutes = 0
    if current_status == "active" and logs:
        last_log = logs[-1]
        try:
            last_time = datetime.fromisoformat(last_log["timestamp"].replace('Z', '+00:00'))
            current_active_minutes = int((now - last_time).total_seconds() / 60)
        except (ValueError, TypeError):
            pass
    
    total_active_minutes += current_active_minutes
    
    return {
        "logs": logs,
        "total_active_minutes": total_active_minutes,
        "total_active_hours": round(total_active_minutes / 60, 2),
        "current_status": current_status,
        "business_date": today
    }


@router.get("/courier/{courier_id}/range")
async def get_logs_by_range(courier_id: str, start_date: str, end_date: str):
    """Belirli tarih aralığındaki durum logları"""
    logs = await db.courier_status_logs.find(
        {
            "courier_id": courier_id,
            "date": {"$gte": start_date, "$lte": end_date}
        },
        {"_id": 0}
    ).sort("timestamp", 1).to_list(1000)
    
    # Günlük aktif süreleri hesapla
    daily_summary = {}
    for log in logs:
        date = log.get("date")
        if date not in daily_summary:
            daily_summary[date] = {"active_minutes": 0, "break_minutes": 0}
        
        duration = log.get("duration_minutes", 0)
        old_status = log.get("old_status")
        
        if old_status == "active":
            daily_summary[date]["active_minutes"] += duration
        elif old_status == "on_break":
            daily_summary[date]["break_minutes"] += duration
    
    total_active_minutes = sum(d["active_minutes"] for d in daily_summary.values())
    
    return {
        "logs": logs,
        "daily_summary": daily_summary,
        "total_active_minutes": total_active_minutes,
        "total_active_hours": round(total_active_minutes / 60, 2)
    }


@router.post("/company/{company_id}/weekly-active-hours")
async def get_weekly_active_hours(company_id: str, week_start: str, week_end: str):
    """Haftalık aktif saatleri tüm kuryeler için hesapla"""
    try:
        start_dt = datetime.fromisoformat(week_start.replace('Z', '+00:00'))
        end_dt = datetime.fromisoformat(week_end.replace('Z', '+00:00'))
        start_date = start_dt.strftime("%Y-%m-%d")
        end_date = end_dt.strftime("%Y-%m-%d")
    except ValueError:
        raise HTTPException(status_code=400, detail="Geçersiz tarih formatı")
    
    # Şirkete ait kuryeleri al
    couriers = await db.couriers.find(
        {
            "$or": [
                {"company_ids": company_id},
                {"company_id": company_id}
            ],
            "is_archived": {"$ne": True}
        },
        {"_id": 0, "id": 1, "name": 1, "hourly_rate": 1}
    ).to_list(1000)
    
    courier_ids = [c["id"] for c in couriers]
    courier_map = {c["id"]: c for c in couriers}
    
    # Tüm logları çek
    pipeline = [
        {
            "$match": {
                "courier_id": {"$in": courier_ids},
                "date": {"$gte": start_date, "$lte": end_date},
                "old_status": "active"
            }
        },
        {
            "$group": {
                "_id": "$courier_id",
                "total_active_minutes": {"$sum": "$duration_minutes"}
            }
        }
    ]
    
    results = await db.courier_status_logs.aggregate(pipeline).to_list(1000)
    active_hours_map = {r["_id"]: r["total_active_minutes"] for r in results}
    
    # Sonuçları derle
    courier_hours = []
    for courier_id, courier in courier_map.items():
        active_minutes = active_hours_map.get(courier_id, 0)
        active_hours = round(active_minutes / 60, 2)
        hourly_rate = courier.get("hourly_rate") or 0
        hourly_earnings = round(active_hours * hourly_rate, 2)
        
        courier_hours.append({
            "courier_id": courier_id,
            "courier_name": courier.get("name", ""),
            "active_minutes": active_minutes,
            "active_hours": active_hours,
            "hourly_rate": hourly_rate,
            "hourly_earnings": hourly_earnings
        })
    
    # Aktif saate göre sırala
    courier_hours.sort(key=lambda x: x["active_hours"], reverse=True)
    
    return {
        "couriers": courier_hours,
        "summary": {
            "total_active_hours": round(sum(c["active_hours"] for c in courier_hours), 2),
            "total_hourly_earnings": round(sum(c["hourly_earnings"] for c in courier_hours), 2)
        }
    }


# Index oluşturma (startup'ta çağrılmalı)
async def create_indexes():
    """Performans için index oluştur"""
    await db.courier_status_logs.create_index([("courier_id", 1), ("date", -1)])
    await db.courier_status_logs.create_index([("courier_id", 1), ("timestamp", -1)])
    await db.courier_status_logs.create_index([("date", 1)])
