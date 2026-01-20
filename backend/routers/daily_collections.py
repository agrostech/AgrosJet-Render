"""
Günlük Tahsilat Girişi Router
Admin kuryelerden nakit ve Z raporu (kredi kartı) tahsilatlarını kaydeder
"""
from fastapi import APIRouter, HTTPException
from pydantic import BaseModel
from typing import Optional, List
from datetime import datetime, timezone
import uuid

from utils.database import db

router = APIRouter(prefix="/api/daily-collections", tags=["Günlük Tahsilat"])


# ============ MODELS ============
class DailyCollectionCreate(BaseModel):
    company_id: str
    courier_id: str
    courier_name: str
    date: str  # YYYY-MM-DD format
    cash_amount: float = 0
    card_percent_1: float = 0
    card_percent_10: float = 0
    card_percent_20: float = 0
    admin_id: str
    admin_name: str


class DailyCollectionResponse(BaseModel):
    id: str
    company_id: str
    courier_id: str
    courier_name: str
    date: str
    cash_amount: float
    card_percent_1: float
    card_percent_10: float
    card_percent_20: float
    card_total: float
    admin_id: str
    admin_name: str
    created_at: str


# ============ ENDPOINTS ============

@router.post("")
async def create_daily_collection(data: DailyCollectionCreate):
    """
    Kurye için günlük tahsilat kaydı oluştur
    NOT: Kayıtlar silinemez ve düzenlenemez
    """
    # Verify courier exists
    courier = await db.couriers.find_one({"id": data.courier_id}, {"_id": 0, "name": 1})
    if not courier:
        raise HTTPException(status_code=404, detail="Kurye bulunamadı")
    
    card_total = data.card_percent_1 + data.card_percent_10 + data.card_percent_20
    
    collection = {
        "id": str(uuid.uuid4()),
        "company_id": data.company_id,
        "courier_id": data.courier_id,
        "courier_name": data.courier_name,
        "date": data.date,
        "cash_amount": data.cash_amount,
        "card_percent_1": data.card_percent_1,
        "card_percent_10": data.card_percent_10,
        "card_percent_20": data.card_percent_20,
        "card_total": card_total,
        "admin_id": data.admin_id,
        "admin_name": data.admin_name,
        "created_at": datetime.now(timezone.utc).isoformat()
    }
    
    await db.daily_collections.insert_one(collection)
    
    return {
        "message": "Tahsilat kaydedildi",
        "id": collection["id"],
        "card_total": card_total
    }


@router.get("/{company_id}")
async def get_daily_collections(
    company_id: str,
    date: Optional[str] = None,
    courier_id: Optional[str] = None
):
    """
    Günlük tahsilat kayıtlarını getir
    """
    query = {"company_id": company_id}
    
    if date:
        query["date"] = date
    
    if courier_id:
        query["courier_id"] = courier_id
    
    collections = await db.daily_collections.find(
        query,
        {"_id": 0}
    ).sort("created_at", -1).to_list(500)
    
    return collections


@router.get("/{company_id}/summary/{date}")
async def get_daily_summary(company_id: str, date: str):
    """
    Belirli bir gün için tüm kuryelerin tahsilat özeti
    """
    collections = await db.daily_collections.find(
        {"company_id": company_id, "date": date},
        {"_id": 0}
    ).to_list(500)
    
    # Kurye bazında grupla (aynı kurye için birden fazla kayıt olabilir)
    courier_totals = {}
    for col in collections:
        cid = col["courier_id"]
        if cid not in courier_totals:
            courier_totals[cid] = {
                "courier_id": cid,
                "courier_name": col["courier_name"],
                "cash_total": 0,
                "card_percent_1": 0,
                "card_percent_10": 0,
                "card_percent_20": 0,
                "card_total": 0,
                "records": []
            }
        courier_totals[cid]["cash_total"] += col["cash_amount"]
        courier_totals[cid]["card_percent_1"] += col["card_percent_1"]
        courier_totals[cid]["card_percent_10"] += col["card_percent_10"]
        courier_totals[cid]["card_percent_20"] += col["card_percent_20"]
        courier_totals[cid]["card_total"] += col["card_total"]
        courier_totals[cid]["records"].append(col)
    
    return {
        "date": date,
        "couriers": list(courier_totals.values()),
        "total_records": len(collections)
    }


@router.get("/{company_id}/couriers-for-date/{date}")
async def get_couriers_with_collections(company_id: str, date: str):
    """
    Belirli bir tarih için kurye listesi ve tahsilat durumları
    """
    # Get company's couriers from company_couriers relation table
    query = {"company_id": company_id, "is_archived": {"$ne": True}, "is_active": {"$ne": False}}
    relations = await db.company_couriers.find(query, {"_id": 0, "courier_id": 1}).to_list(1000)
    
    # Deduplicate courier IDs
    courier_ids = list(set([rel["courier_id"] for rel in relations]))
    
    if not courier_ids:
        return []
    
    # Get courier details
    couriers = await db.couriers.find(
        {"id": {"$in": courier_ids}},
        {"_id": 0, "id": 1, "name": 1, "phone": 1}
    ).to_list(1000)
    
    # Deduplicate couriers by ID (in case of data issues)
    seen_ids = set()
    unique_couriers = []
    for c in couriers:
        if c["id"] not in seen_ids:
            seen_ids.add(c["id"])
            unique_couriers.append(c)
    couriers = unique_couriers
    
    # Get collections for this date
    collections = await db.daily_collections.find(
        {"company_id": company_id, "date": date},
        {"_id": 0}
    ).to_list(500)
    
    # Build courier map with collection totals
    collection_map = {}
    for col in collections:
        cid = col["courier_id"]
        if cid not in collection_map:
            collection_map[cid] = {
                "cash_total": 0,
                "card_total": 0,
                "card_percent_1": 0,
                "card_percent_10": 0,
                "card_percent_20": 0,
                "records": []
            }
        collection_map[cid]["cash_total"] += col["cash_amount"]
        collection_map[cid]["card_total"] += col["card_total"]
        collection_map[cid]["card_percent_1"] += col["card_percent_1"]
        collection_map[cid]["card_percent_10"] += col["card_percent_10"]
        collection_map[cid]["card_percent_20"] += col["card_percent_20"]
        collection_map[cid]["records"].append(col)
    
    result = []
    for courier in couriers:
        courier_data = {
            "id": courier["id"],
            "name": courier["name"],
            "phone": courier.get("phone", ""),
            "has_collection": courier["id"] in collection_map,
            "collection": collection_map.get(courier["id"], {
                "cash_total": 0,
                "card_total": 0,
                "card_percent_1": 0,
                "card_percent_10": 0,
                "card_percent_20": 0,
                "records": []
            })
        }
        result.append(courier_data)
    
    # Sort: those with collections first, then by name
    result.sort(key=lambda x: (not x["has_collection"], x["name"]))
    
    return result
