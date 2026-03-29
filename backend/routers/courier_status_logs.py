"""
Kurye Durum Log Sistemi
- Durum değişikliklerini kaydet
- Aktif süre hesaplama
- Saatlik kazanç hesaplama
"""
from fastapi import APIRouter, HTTPException, Query, Depends
from pydantic import BaseModel
from typing import Optional, List
from datetime import datetime, timezone, timedelta
import uuid

from utils.database import db
from utils.helpers import get_turkey_now, ensure_turkey_timezone, TURKEY_TZ

from utils.jwt_utils import require_auth
router = APIRouter(prefix="/api/courier-status-logs", tags=["Kurye Durum Logları"], dependencies=[Depends(require_auth)])


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
    now = datetime.now(TURKEY_TZ)
    
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
    """Kuryenin bugünkü durum logları ve aktiflik süresi"""
    # Türkiye timezone'u (UTC+3)
    turkey_tz = timezone(timedelta(hours=3))
    now_utc = datetime.now(TURKEY_TZ)
    now_turkey = now_utc.astimezone(turkey_tz)
    
    # Kurye bilgilerini al
    courier = await db.couriers.find_one(
        {"id": courier_id}, 
        {"_id": 0, "company_id": 1, "company_ids": 1, "availability_status": 1, "last_active_at": 1, "is_admin_linked": 1}
    )
    
    # Şirket açılış saatini al
    if company_id:
        opening_time, _ = await get_company_work_hours(company_id)
    else:
        if courier:
            c_id = courier.get("company_id") or (courier.get("company_ids", [None])[0] if courier.get("company_ids") else None)
            opening_time, _ = await get_company_work_hours(c_id)
        else:
            opening_time = "06:00"
    
    # Bugünün iş gününü hesapla (Türkiye saatine göre)
    open_h, open_m = map(int, opening_time.split(":"))
    
    # Şu anki Türkiye saati açılış saatinden önce mi?
    if now_turkey.hour < open_h or (now_turkey.hour == open_h and now_turkey.minute < open_m):
        # Açılış saatinden önce - önceki iş günü
        business_day = now_turkey - timedelta(days=1)
    else:
        business_day = now_turkey
    
    today = business_day.strftime("%Y-%m-%d")
    
    # İş günü başlangıç zamanını hesapla (Türkiye saatinde)
    business_day_start_turkey = business_day.replace(hour=open_h, minute=open_m, second=0, microsecond=0)
    business_day_start_utc = business_day_start_turkey.astimezone(timezone.utc)
    
    # Kurye durum loglarını getir
    courier_logs = await db.courier_status_logs.find(
        {"courier_id": courier_id, "date": today},
        {"_id": 0}
    ).sort("timestamp", 1).to_list(100)
    
    # Admin-linked kurye ise, admin loglarını da getir
    admin_logs = []
    if courier and courier.get("is_admin_linked"):
        # Bu kuryeye bağlı admin'i bul
        admin = await db.admins.find_one(
            {"linked_courier_id": courier_id},
            {"_id": 0, "id": 1, "name": 1}
        )
        if admin:
            admin_logs_raw = await db.admin_status_logs.find(
                {"admin_id": admin["id"], "date": today},
                {"_id": 0}
            ).sort("timestamp", 1).to_list(100)
            
            # Admin loglarını kurye log formatına dönüştür
            for log in admin_logs_raw:
                admin_logs.append({
                    "courier_id": courier_id,
                    "company_id": log.get("company_id"),
                    "status": log.get("status"),
                    "changed_by": "admin_panel",
                    "changed_by_name": admin.get("name"),
                    "timestamp": log.get("timestamp"),
                    "date": log.get("date"),
                    "source": "admin"  # Admin panelinden geldiğini belirt
                })
    
    # Tüm logları birleştir ve zamana göre sırala
    all_logs = courier_logs + admin_logs
    all_logs.sort(key=lambda x: x.get("timestamp", ""))
    
    # Aktiflik sayacından oku
    daily_active = await db.courier_daily_active.find_one(
        {"courier_id": courier_id, "date": today},
        {"_id": 0, "active_minutes": 1}
    )
    total_active_minutes = daily_active.get("active_minutes", 0) if daily_active else 0
    
    # Admin aktiflik süresini de ekle (admin-linked ise)
    if courier and courier.get("is_admin_linked"):
        admin = await db.admins.find_one(
            {"linked_courier_id": courier_id},
            {"_id": 0, "id": 1}
        )
        if admin:
            admin_daily_active = await db.admin_daily_active.find_one(
                {"admin_id": admin["id"], "date": today},
                {"_id": 0, "active_minutes": 1}
            )
            if admin_daily_active:
                total_active_minutes += admin_daily_active.get("active_minutes", 0)
    
    current_status = courier.get("availability_status", "offline") if courier else "offline"
    
    # Eğer şu an aktif ise, anlık süreyi ekle (sadece bugünün iş günü içindeki süre)
    if current_status == "active" and courier and courier.get("last_active_at"):
        try:
            last_active = datetime.fromisoformat(courier["last_active_at"].replace('Z', '+00:00'))
            
            # last_active_at bugünün iş gününden önce ise, iş günü başlangıcından itibaren say
            if last_active < business_day_start_utc:
                last_active = business_day_start_utc
            
            current_active_minutes = int((now_utc - last_active).total_seconds() / 60)
            
            # Negatif değer olmamalı ve maksimum 24 saat (1440 dakika)
            if current_active_minutes > 0:
                # Maksimum 24 saat sınırı
                current_active_minutes = min(current_active_minutes, 1440)
                total_active_minutes += current_active_minutes
        except (ValueError, TypeError):
            pass
    
    # Toplam süre maksimum 24 saat olmalı
    total_active_minutes = min(total_active_minutes, 1440)
    
    return {
        "logs": all_logs,
        "total_active_minutes": total_active_minutes,
        "total_active_hours": round(total_active_minutes / 60, 2),
        "current_status": current_status,
        "business_date": today
    }


@router.get("/courier/{courier_id}/range")
async def get_logs_by_range(courier_id: str, start_date: str, end_date: str):
    """Belirli tarih aralığındaki durum logları ve aktiflik süresi"""
    now = datetime.now(TURKEY_TZ)
    today = now.strftime("%Y-%m-%d")
    
    # Durum loglarını getir (görsel için)
    logs = await db.courier_status_logs.find(
        {
            "courier_id": courier_id,
            "date": {"$gte": start_date, "$lte": end_date}
        },
        {"_id": 0}
    ).sort("timestamp", 1).to_list(1000)
    
    # Aktiflik sayacından oku
    daily_records = await db.courier_daily_active.find(
        {
            "courier_id": courier_id,
            "date": {"$gte": start_date, "$lte": end_date}
        },
        {"_id": 0, "date": 1, "active_minutes": 1}
    ).to_list(100)
    
    daily_summary = {r["date"]: {"active_minutes": r["active_minutes"]} for r in daily_records}
    total_active_minutes = sum(r["active_minutes"] for r in daily_records)
    
    # Eğer bugün aralıkta ve kurye aktif ise, anlık süreyi ekle
    if start_date <= today <= end_date:
        courier = await db.couriers.find_one(
            {"id": courier_id}, 
            {"_id": 0, "availability_status": 1, "last_active_at": 1}
        )
        if courier and courier.get("availability_status") == "active" and courier.get("last_active_at"):
            try:
                last_active = datetime.fromisoformat(courier["last_active_at"].replace('Z', '+00:00'))
                current_active_minutes = int((now - last_active).total_seconds() / 60)
                total_active_minutes += current_active_minutes
                if today in daily_summary:
                    daily_summary[today]["active_minutes"] += current_active_minutes
                else:
                    daily_summary[today] = {"active_minutes": current_active_minutes}
            except (ValueError, TypeError):
                pass
    
    return {
        "logs": logs,
        "daily_summary": daily_summary,
        "total_active_minutes": total_active_minutes,
        "total_active_hours": round(total_active_minutes / 60, 2)
    }


@router.post("/company/{company_id}/weekly-active-hours")
async def get_weekly_active_hours(company_id: str, week_start: str, week_end: str):
    """Haftalık aktif saatleri tüm kuryeler için hesapla - courier_daily_active tablosundan"""
    now = datetime.now(TURKEY_TZ)
    today = now.strftime("%Y-%m-%d")
    
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
        {"_id": 0, "id": 1, "name": 1, "hourly_rate": 1, "availability_status": 1, "last_active_at": 1}
    ).to_list(1000)
    
    courier_ids = [c["id"] for c in couriers]
    courier_map = {c["id"]: c for c in couriers}
    
    # courier_daily_active tablosundan aktif süreleri al
    pipeline = [
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
    
    results = await db.courier_daily_active.aggregate(pipeline).to_list(1000)
    active_hours_map = {r["_id"]: r["total_active_minutes"] for r in results}
    
    # Şu an aktif kuryeler için anlık süre ekle
    if start_date <= today <= end_date:
        for courier in couriers:
            if courier.get("availability_status") == "active" and courier.get("last_active_at"):
                try:
                    last_active = datetime.fromisoformat(courier["last_active_at"].replace('Z', '+00:00'))
                    current_minutes = int((now - last_active).total_seconds() / 60)
                    active_hours_map[courier["id"]] = active_hours_map.get(courier["id"], 0) + current_minutes
                except (ValueError, TypeError):
                    pass
    
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


@router.get("/{company_id}/courier/{courier_id}/weekly-stats")
async def get_courier_weekly_stats(company_id: str, courier_id: str, start_date: str = Query(...), end_date: str = Query(...)):
    """Belirli bir kurye için haftalık aktiflik istatistikleri"""
    now = datetime.now(TURKEY_TZ)
    today = now.strftime("%Y-%m-%d")
    
    # Aktiflik sayacından oku
    daily_records = await db.courier_daily_active.find(
        {
            "courier_id": courier_id,
            "date": {"$gte": start_date, "$lte": end_date}
        },
        {"_id": 0, "date": 1, "active_minutes": 1}
    ).to_list(100)
    
    total_active_minutes = sum(r["active_minutes"] for r in daily_records)
    
    # Admin-linked kurye ise, admin aktiflik süresini de ekle
    courier = await db.couriers.find_one(
        {"id": courier_id}, 
        {"_id": 0, "availability_status": 1, "last_active_at": 1, "is_admin_linked": 1}
    )
    
    if courier and courier.get("is_admin_linked"):
        admin = await db.admins.find_one(
            {"linked_courier_id": courier_id},
            {"_id": 0, "id": 1}
        )
        if admin:
            admin_daily_records = await db.admin_daily_active.find(
                {
                    "admin_id": admin["id"],
                    "date": {"$gte": start_date, "$lte": end_date}
                },
                {"_id": 0, "active_minutes": 1}
            ).to_list(100)
            total_active_minutes += sum(r["active_minutes"] for r in admin_daily_records)
    
    # Eğer bugün aralıkta ve kurye aktif ise, anlık süreyi ekle
    if start_date <= today <= end_date:
        if courier and courier.get("availability_status") == "active" and courier.get("last_active_at"):
            try:
                last_active = datetime.fromisoformat(courier["last_active_at"].replace('Z', '+00:00'))
                current_active_minutes = int((now - last_active).total_seconds() / 60)
                if current_active_minutes > 0:
                    total_active_minutes += current_active_minutes
            except (ValueError, TypeError):
                pass
    
    return {
        "courier_id": courier_id,
        "start_date": start_date,
        "end_date": end_date,
        "total_active_minutes": total_active_minutes,
        "total_active_hours": round(total_active_minutes / 60, 2)
    }


# Index oluşturma (startup'ta çağrılmalı)
async def create_indexes():
    """Performans için index oluştur"""
    await db.courier_status_logs.create_index([("courier_id", 1), ("date", -1)])
    await db.courier_status_logs.create_index([("courier_id", 1), ("timestamp", -1)])
    await db.courier_status_logs.create_index([("date", 1)])
