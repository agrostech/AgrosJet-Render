"""
Durum Hareketleri API
- Kurye ve Admin durum değişiklik loglarını getir
- Belirli bir gün için filtreleme
"""
from fastapi import APIRouter, Query
from typing import Optional, List
from datetime import datetime, timezone

from utils.database import db

router = APIRouter(prefix="/api/status-movements", tags=["Durum Hareketleri"])


@router.get("/{company_id}")
async def get_status_movements(
    company_id: str,
    entity_type: str = Query("courier", description="courier veya admin"),
    date: str = Query(..., description="YYYY-MM-DD formatında tarih"),
    entity_id: Optional[str] = Query(None, description="Belirli bir kişi için filtre")
):
    """
    Belirli bir gün için kurye veya admin durum hareketlerini getir.
    Sonuçlar zamana göre sıralı döner.
    """
    logs = []
    
    if entity_type == "courier":
        # Kurye loglarını çek
        query = {"company_id": company_id, "date": date}
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
        # Admin loglarını çek
        query = {"company_id": company_id, "date": date}
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
        "entity_type": entity_type
    }
