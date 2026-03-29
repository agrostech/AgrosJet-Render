"""
Durum Hareketleri API
- Kurye ve Admin durum değişiklik loglarını getir
- Belirli bir iş günü için filtreleme (şirket açılış-kapanış saatlerine göre)
"""
from fastapi import APIRouter, Query, Depends
from typing import Optional
from datetime import datetime, timezone, timedelta

from utils.database import db
from utils.jwt_utils import require_admin

router = APIRouter(prefix="/api/status-movements", tags=["Durum Hareketleri"], dependencies=[Depends(require_admin)])


async def get_company_opening_time(company_id: str) -> str:
    """Şirket açılış saatini getir"""
    company = await db.companies.find_one(
        {"id": company_id},
        {"_id": 0, "opening_time": 1}
    )
    if company and company.get("opening_time"):
        return company["opening_time"]
    return "06:00"


def get_business_day_range(date_str: str, opening_time: str):
    """
    İş günü aralığını hesapla (Türkiye saati baz alınarak UTC'ye çevrilir).
    
    Örnek: date=2024-02-22, opening_time=06:00
    Başlangıç: 2024-02-22 06:00:00 TR -> 2024-02-22 03:00:00 UTC
    Bitiş: 2024-02-23 06:00:00 TR -> 2024-02-23 03:00:00 UTC
    
    Bu şekilde tam 24 saatlik iş günü verisi çekilir.
    """
    # Parse date
    base_date = datetime.strptime(date_str, "%Y-%m-%d")
    
    # Parse opening time
    open_hour, open_minute = map(int, opening_time.split(":"))
    
    # Türkiye UTC+3
    turkey_offset = timedelta(hours=3)
    
    # İş günü başlangıcı: seçilen gün + açılış saati (Türkiye) -> UTC
    start_turkey = base_date.replace(hour=open_hour, minute=open_minute, second=0, microsecond=0)
    start_utc = start_turkey - turkey_offset
    
    # İş günü bitişi: ertesi gün + açılış saati (Türkiye) -> UTC
    end_turkey = start_turkey + timedelta(days=1)
    end_utc = end_turkey - turkey_offset
    
    return start_utc.isoformat(), end_utc.isoformat()


@router.get("/{company_id}")
async def get_status_movements(
    company_id: str,
    entity_type: str = Query("courier", description="courier veya admin"),
    date: str = Query(..., description="YYYY-MM-DD formatında tarih"),
    entity_id: Optional[str] = Query(None, description="Belirli bir kişi için filtre")
):
    """
    Belirli bir iş günü için kurye veya admin durum hareketlerini getir.
    İş günü, şirket açılış saatinden ertesi gün açılış saatine kadardır.
    Sonuçlar yeniden eskiye sıralı döner.
    """
    logs = []
    
    # Şirket açılış saatini al
    opening_time = await get_company_opening_time(company_id)
    
    # İş günü aralığını hesapla
    start_time, end_time = get_business_day_range(date, opening_time)
    
    if entity_type == "courier":
        # Kurye loglarını çek - timestamp aralığına göre
        query = {
            "company_id": company_id,
            "timestamp": {"$gte": start_time, "$lt": end_time}
        }
        if entity_id:
            query["courier_id"] = entity_id
        
        cursor = db.courier_status_logs.find(query, {"_id": 0})
        raw_logs = await cursor.sort("timestamp", -1).to_list(500)
        
        # Kurye isimlerini al
        courier_ids = list(set(log.get("courier_id") for log in raw_logs if log.get("courier_id")))
        couriers = {}
        if courier_ids:
            courier_docs = await db.couriers.find(
                {"id": {"$in": courier_ids}},
                {"_id": 0, "id": 1, "name": 1}
            ).to_list(500)
            couriers = {c["id"]: c.get("name", "İsimsiz") for c in courier_docs}
        
        for log in raw_logs:
            logs.append({
                "id": log.get("id"),
                "entity_id": log.get("courier_id"),
                "entity_name": couriers.get(log.get("courier_id"), "İsimsiz Kurye"),
                "status": log.get("status"),
                "timestamp": log.get("timestamp"),
                "changed_by": log.get("changed_by"),
                "changed_by_name": log.get("changed_by_name")
            })
    
    else:  # admin
        # Admin loglarını çek - timestamp aralığına göre
        query = {
            "company_id": company_id,
            "timestamp": {"$gte": start_time, "$lt": end_time}
        }
        if entity_id:
            query["admin_id"] = entity_id
        
        cursor = db.admin_status_logs.find(query, {"_id": 0})
        raw_logs = await cursor.sort("timestamp", -1).to_list(500)
        
        # Admin isimlerini al
        admin_ids = list(set(log.get("admin_id") for log in raw_logs if log.get("admin_id")))
        admins = {}
        if admin_ids:
            admin_docs = await db.admins.find(
                {"id": {"$in": admin_ids}},
                {"_id": 0, "id": 1, "name": 1, "username": 1}
            ).to_list(500)
            admins = {a["id"]: a.get("name") or a.get("username", "İsimsiz") for a in admin_docs}
        
        for log in raw_logs:
            logs.append({
                "id": log.get("id"),
                "entity_id": log.get("admin_id"),
                "entity_name": admins.get(log.get("admin_id"), "İsimsiz Yönetici"),
                "status": log.get("status"),
                "timestamp": log.get("timestamp"),
                "changed_by": log.get("changed_by"),
                "changed_by_name": log.get("changed_by_name")
            })
    
    return {
        "logs": logs,
        "total": len(logs),
        "date": date,
        "entity_type": entity_type,
        "business_day_start": start_time,
        "business_day_end": end_time
    }
