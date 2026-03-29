"""
Haftalık Hakediş API - Kuryelerin teslim edilen siparişlerden toplam hakedişlerini hesaplar
"""
from fastapi import APIRouter, HTTPException, Depends
from pydantic import BaseModel
from typing import Optional
from datetime import datetime, timezone
from utils.database import db
from utils.helpers import ensure_turkey_timezone, get_turkey_now
from utils.jwt_utils import require_admin, require_auth

router = APIRouter(prefix="/api/hakedis", tags=["Hakediş"], dependencies=[Depends(require_auth)])


class HakedisFilter(BaseModel):
    start_date: str  # ISO format
    end_date: str    # ISO format


@router.post("/couriers/{company_id}")
async def get_couriers_hakedis(company_id: str, filters: HakedisFilter):
    """Belirli tarih aralığında kuryelerin toplam hakedişlerini getir"""
    
    # Frontend Türkiye saati gönderiyor, +03:00 formatına çevir
    start_dt_str = ensure_turkey_timezone(filters.start_date)
    end_dt_str = ensure_turkey_timezone(filters.end_date)
    
    try:
        start_dt = datetime.fromisoformat(start_dt_str)
        end_dt = datetime.fromisoformat(end_dt_str)
    except ValueError:
        raise HTTPException(status_code=400, detail="Geçersiz tarih formatı")
    
    # Şirkete ait kuryeleri getir (company_ids array veya company_id string olabilir)
    couriers = await db.couriers.find(
        {
            "$or": [
                {"company_ids": company_id},
                {"company_id": company_id}
            ],
            "is_archived": {"$ne": True}
        },
        {"_id": 0, "id": 1, "name": 1, "phone": 1}
    ).to_list(1000)
    
    courier_map = {c["id"]: c for c in couriers}
    courier_ids = list(courier_map.keys())
    
    # Eğer kurye bulunamadıysa, siparişlerden kuryeleri al
    if not courier_ids:
        # Teslim edilmiş siparişlerdeki kuryeleri bul
        delivered_orders = await db.orders.find(
            {
                "company_id": company_id,
                "status": "delivered",
                "courier_id": {"$exists": True, "$ne": None}
            },
            {"_id": 0, "courier_id": 1, "courier_name": 1}
        ).to_list(1000)
        
        seen_ids = set()
        for order in delivered_orders:
            cid = order.get("courier_id")
            if cid and cid not in seen_ids:
                seen_ids.add(cid)
                courier_map[cid] = {
                    "id": cid,
                    "name": order.get("courier_name", "Kurye"),
                    "phone": ""
                }
        
        courier_ids = list(courier_map.keys())
    
    if not courier_ids:
        return {"couriers": [], "summary": {"total_courier_fee": 0, "total_orders": 0}}
    
    # Teslim edilen siparişleri getir (delivered + tarih aralığında) - Türkiye saati formatında
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
                "total_courier_fee": {"$sum": {"$ifNull": ["$courier_fee", 0]}},
                "total_orders": {"$sum": 1},
                "total_distance": {"$sum": {"$ifNull": ["$distance_km", 0]}}
            }
        }
    ]
    
    results = await db.orders.aggregate(pipeline).to_list(1000)
    
    # Sonuçları kurye bilgileriyle birleştir
    hakedis_map = {r["_id"]: r for r in results}
    
    courier_list = []
    total_fee = 0
    total_orders = 0
    
    for courier_id, courier in courier_map.items():
        hakedis = hakedis_map.get(courier_id, {})
        fee = hakedis.get("total_courier_fee", 0)
        orders = hakedis.get("total_orders", 0)
        distance = hakedis.get("total_distance", 0)
        
        courier_list.append({
            "courier_id": courier_id,
            "courier_name": courier.get("name", ""),
            "courier_phone": courier.get("phone", ""),
            "total_courier_fee": round(fee, 2),
            "total_orders": orders,
            "total_distance": round(distance, 2)
        })
        
        total_fee += fee
        total_orders += orders
    
    # Hakedişe göre sırala (en yüksek en üstte)
    courier_list.sort(key=lambda x: x["total_courier_fee"], reverse=True)
    
    return {
        "couriers": courier_list,
        "summary": {
            "total_courier_fee": round(total_fee, 2),
            "total_orders": total_orders
        },
        "filter": {
            "start_date": filters.start_date,
            "end_date": filters.end_date
        }
    }
