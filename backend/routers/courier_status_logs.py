"""
Kurye Durum Log Sistemi
- Durum değişikliklerini kaydet
- Aktif süre hesaplama
- Saatlik kazanç hesaplama
"""
from fastapi import APIRouter, HTTPException
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


async def create_status_log(
    courier_id: str,
    old_status: str,
    new_status: str,
    changed_by: str = "system",
    changed_by_name: Optional[str] = None,
    company_id: Optional[str] = None
):
    """Durum değişikliği logu oluştur"""
    now = datetime.now(timezone.utc)
    
    # Bir önceki log'u bul ve süre hesapla
    last_log = await db.courier_status_logs.find_one(
        {"courier_id": courier_id},
        sort=[("timestamp", -1)]
    )
    
    duration_minutes = 0
    if last_log and last_log.get("timestamp"):
        try:
            last_time = datetime.fromisoformat(last_log["timestamp"].replace('Z', '+00:00'))
            duration_minutes = int((now - last_time).total_seconds() / 60)
        except:
            pass
    
    log_entry = {
        "id": str(uuid.uuid4()),
        "courier_id": courier_id,
        "company_id": company_id,
        "old_status": old_status,
        "new_status": new_status,
        "changed_by": changed_by,
        "changed_by_name": changed_by_name,
        "timestamp": now.isoformat(),
        "duration_minutes": duration_minutes,  # Önceki durumda kalınan süre
        "date": now.strftime("%Y-%m-%d")  # Günlük gruplama için
    }
    
    await db.courier_status_logs.insert_one(log_entry)
    return log_entry


@router.get("/courier/{courier_id}/today")
async def get_today_logs(courier_id: str):
    """Kuryenin bugünkü durum geçmişi"""
    today = datetime.now(timezone.utc).strftime("%Y-%m-%d")
    
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
            current_active_minutes = int((datetime.now(timezone.utc) - last_time).total_seconds() / 60)
        except:
            pass
    
    total_active_minutes += current_active_minutes
    
    return {
        "logs": logs,
        "total_active_minutes": total_active_minutes,
        "total_active_hours": round(total_active_minutes / 60, 2),
        "current_status": current_status
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
