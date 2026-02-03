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


# ============ ADMIN BAZLI TAHSİLAT ÖZETİ ============

@router.get("/{company_id}/admin-cumulative-summary")
async def get_admin_cumulative_summary(company_id: str):
    """
    Admin bazında kümülatif (tüm zamanlar) tahsilat özeti
    Her admin'in tüm zamanlarda topladığı nakit ve kart tutarlarını gösterir
    Son sıfırlama tarihinden itibaren hesaplanır
    """
    # Önce tüm adminleri bul
    collections = await db.daily_collections.find(
        {"company_id": company_id},
        {"_id": 0}
    ).to_list(10000)
    
    # Admin bazında grupla
    admin_totals = {}
    for col in collections:
        admin_id = col.get("admin_id", "unknown")
        
        # Admin'in son sıfırlama tarihini kontrol et
        if admin_id not in admin_totals:
            reset_info = await db.admin_cumulative_resets.find_one(
                {"company_id": company_id, "admin_id": admin_id},
                {"_id": 0}
            )
            last_reset_at = reset_info.get("reset_at") if reset_info else None
            
            admin_totals[admin_id] = {
                "admin_id": admin_id,
                "admin_name": col.get("admin_name", "Bilinmeyen"),
                "cash_total": 0,
                "card_total": 0,
                "card_percent_1": 0,
                "card_percent_10": 0,
                "card_percent_20": 0,
                "record_count": 0,
                "last_reset_at": last_reset_at
            }
        
        # Sıfırlama tarihinden sonraki kayıtları say
        last_reset = admin_totals[admin_id]["last_reset_at"]
        if last_reset:
            col_created_at = col.get("created_at", "")
            if col_created_at <= last_reset:
                continue  # Bu kayıt sıfırlamadan önce, atla
        
        admin_totals[admin_id]["cash_total"] += col.get("cash_amount", 0)
        admin_totals[admin_id]["card_total"] += col.get("card_total", 0)
        admin_totals[admin_id]["card_percent_1"] += col.get("card_percent_1", 0)
        admin_totals[admin_id]["card_percent_10"] += col.get("card_percent_10", 0)
        admin_totals[admin_id]["card_percent_20"] += col.get("card_percent_20", 0)
        admin_totals[admin_id]["record_count"] += 1
    
    # Grand total
    grand_cash = sum(a["cash_total"] for a in admin_totals.values())
    grand_card = sum(a["card_total"] for a in admin_totals.values())
    
    return {
        "admins": list(admin_totals.values()),
        "grand_total": {
            "cash": grand_cash,
            "card": grand_card,
            "total": grand_cash + grand_card
        }
    }


class ResetAdminCumulativeRequest(BaseModel):
    admin_id: str
    reset_by_id: str
    reset_by_name: str


@router.post("/{company_id}/reset-admin-cumulative")
async def reset_admin_cumulative(company_id: str, data: ResetAdminCumulativeRequest):
    """
    Admin'in kümülatif tahsilat toplamını sıfırla (sadece SuperAdmin)
    Bu işlem kayıtları silmez, sadece yeni bir başlangıç noktası belirler
    """
    now = datetime.now(timezone.utc).isoformat()
    
    # Admin adını bul
    admin = await db.admins.find_one({"id": data.admin_id}, {"_id": 0, "name": 1})
    admin_name = admin.get("name", "Bilinmeyen") if admin else "Bilinmeyen"
    
    # Sıfırlama kaydı oluştur veya güncelle
    await db.admin_cumulative_resets.update_one(
        {"company_id": company_id, "admin_id": data.admin_id},
        {
            "$set": {
                "reset_at": now,
                "reset_by_id": data.reset_by_id,
                "reset_by_name": data.reset_by_name
            },
            "$setOnInsert": {
                "company_id": company_id,
                "admin_id": data.admin_id
            }
        },
        upsert=True
    )
    
    # Log kaydı
    await db.admin_cumulative_reset_logs.insert_one({
        "id": str(uuid.uuid4()),
        "company_id": company_id,
        "admin_id": data.admin_id,
        "admin_name": admin_name,
        "reset_by_id": data.reset_by_id,
        "reset_by_name": data.reset_by_name,
        "reset_at": now
    })
    
    return {"message": f"{admin_name} için tahsilat sıfırlandı"}


@router.get("/{company_id}/admin-summary/{date}")
async def get_admin_summary(company_id: str, date: str):
    """
    Belirli bir tarih için admin bazında tahsilat özeti
    Her admin'in topladığı nakit ve kart tutarlarını gösterir
    """
    collections = await db.daily_collections.find(
        {"company_id": company_id, "date": date},
        {"_id": 0}
    ).to_list(1000)
    
    # Admin bazında grupla
    admin_totals = {}
    for col in collections:
        admin_id = col.get("admin_id", "unknown")
        if admin_id not in admin_totals:
            admin_totals[admin_id] = {
                "admin_id": admin_id,
                "admin_name": col.get("admin_name", "Bilinmeyen"),
                "cash_total": 0,
                "card_total": 0,
                "card_percent_1": 0,
                "card_percent_10": 0,
                "card_percent_20": 0,
                "courier_count": 0,
                "records": []
            }
        admin_totals[admin_id]["cash_total"] += col.get("cash_amount", 0)
        admin_totals[admin_id]["card_total"] += col.get("card_total", 0)
        admin_totals[admin_id]["card_percent_1"] += col.get("card_percent_1", 0)
        admin_totals[admin_id]["card_percent_10"] += col.get("card_percent_10", 0)
        admin_totals[admin_id]["card_percent_20"] += col.get("card_percent_20", 0)
        admin_totals[admin_id]["courier_count"] += 1
        admin_totals[admin_id]["records"].append({
            "courier_id": col.get("courier_id"),
            "courier_name": col.get("courier_name"),
            "cash_amount": col.get("cash_amount", 0),
            "card_total": col.get("card_total", 0),
            "created_at": col.get("created_at")
        })
    
    # Admin alındı durumlarını kontrol et
    for admin_id in admin_totals:
        status = await db.admin_collection_status.find_one({
            "company_id": company_id,
            "date": date,
            "admin_id": admin_id
        }, {"_id": 0})
        
        admin_totals[admin_id]["cash_collected"] = status.get("cash_collected", False) if status else False
        admin_totals[admin_id]["card_collected"] = status.get("card_collected", False) if status else False
        admin_totals[admin_id]["cash_collected_at"] = status.get("cash_collected_at") if status else None
        admin_totals[admin_id]["card_collected_at"] = status.get("card_collected_at") if status else None
    
    # Grand total
    grand_cash = sum(a["cash_total"] for a in admin_totals.values())
    grand_card = sum(a["card_total"] for a in admin_totals.values())
    
    return {
        "date": date,
        "admins": list(admin_totals.values()),
        "grand_total": {
            "cash": grand_cash,
            "card": grand_card,
            "total": grand_cash + grand_card
        }
    }


class MarkAdminCollectedRequest(BaseModel):
    date: str
    admin_id: str
    type: str  # 'cash' or 'card'
    collected_by_id: str
    collected_by_name: str


@router.post("/{company_id}/mark-admin-collected")
async def mark_admin_collected(company_id: str, data: MarkAdminCollectedRequest):
    """
    Belirli bir admin'in topladığı nakit veya kartı alındı olarak işaretle
    Sadece SuperAdmin kullanabilir
    """
    now = datetime.now(timezone.utc).isoformat()
    
    update_data = {"updated_at": now}
    if data.type == "cash":
        update_data["cash_collected"] = True
        update_data["cash_collected_at"] = now
        update_data["cash_collected_by"] = data.collected_by_name
    elif data.type == "card":
        update_data["card_collected"] = True
        update_data["card_collected_at"] = now
        update_data["card_collected_by"] = data.collected_by_name
    else:
        raise HTTPException(status_code=400, detail="Geçersiz tip")
    
    await db.admin_collection_status.update_one(
        {
            "company_id": company_id,
            "date": data.date,
            "admin_id": data.admin_id
        },
        {
            "$set": update_data,
            "$setOnInsert": {
                "company_id": company_id,
                "date": data.date,
                "admin_id": data.admin_id
            }
        },
        upsert=True
    )
    
    return {"message": f"Admin tahsilatı alındı olarak işaretlendi"}


# ============ COLLECTION STATUS (SuperAdmin için Alındı takibi) ============

class MarkCollectedRequest(BaseModel):
    date: str
    type: str  # 'cash' or 'card'
    admin_id: str
    admin_name: str


@router.get("/{company_id}/collection-status/{date}")
async def get_collection_status(company_id: str, date: str):
    """
    Belirli bir tarih için nakit/kart alındı durumunu getir
    """
    status = await db.collection_status.find_one(
        {"company_id": company_id, "date": date},
        {"_id": 0}
    )
    
    if not status:
        return {"cash_collected": False, "card_collected": False}
    
    return {
        "cash_collected": status.get("cash_collected", False),
        "card_collected": status.get("card_collected", False),
        "cash_collected_by": status.get("cash_collected_by"),
        "cash_collected_at": status.get("cash_collected_at"),
        "card_collected_by": status.get("card_collected_by"),
        "card_collected_at": status.get("card_collected_at")
    }


@router.post("/{company_id}/mark-collected")
async def mark_collection_collected(company_id: str, data: MarkCollectedRequest):
    """
    Nakit veya kart toplam tutarını alındı olarak işaretle (SuperAdmin için)
    """
    now = datetime.now(timezone.utc).isoformat()
    
    update_data = {}
    if data.type == "cash":
        update_data = {
            "cash_collected": True,
            "cash_collected_by": data.admin_name,
            "cash_collected_at": now
        }
    elif data.type == "card":
        update_data = {
            "card_collected": True,
            "card_collected_by": data.admin_name,
            "card_collected_at": now
        }
    else:
        raise HTTPException(status_code=400, detail="Geçersiz tip. 'cash' veya 'card' olmalı.")
    
    await db.collection_status.update_one(
        {"company_id": company_id, "date": data.date},
        {
            "$set": update_data,
            "$setOnInsert": {
                "company_id": company_id,
                "date": data.date
            }
        },
        upsert=True
    )
    
    return {"message": f"{data.type.capitalize()} alındı olarak işaretlendi"}


# ============ RESET COLLECTION (SuperAdmin için sıfırlama) ============

class ResetCollectionRequest(BaseModel):
    courier_id: str
    date: str
    admin_id: str
    admin_name: str


@router.delete("/{company_id}/reset-courier-collection")
async def reset_courier_collection(company_id: str, data: ResetCollectionRequest):
    """
    Belirli bir kurye ve gün için tahsilat kayıtlarını sıfırla (sadece SuperAdmin)
    Kayıtlar tamamen silinir, kurye tekrar giriş yapabilir hale gelir.
    """
    # Check if there are any collections to delete
    existing = await db.daily_collections.find_one({
        "company_id": company_id,
        "courier_id": data.courier_id,
        "date": data.date
    })
    
    if not existing:
        raise HTTPException(status_code=404, detail="Bu kurye için bu tarihte kayıt bulunamadı")
    
    # Get courier name for logging
    courier = await db.couriers.find_one({"id": data.courier_id}, {"_id": 0, "name": 1})
    courier_name = courier["name"] if courier else data.courier_id
    
    # Delete all collection records for this courier on this date
    result = await db.daily_collections.delete_many({
        "company_id": company_id,
        "courier_id": data.courier_id,
        "date": data.date
    })
    
    # Log the reset action
    await db.collection_reset_logs.insert_one({
        "id": str(uuid.uuid4()),
        "company_id": company_id,
        "courier_id": data.courier_id,
        "courier_name": courier_name,
        "date": data.date,
        "deleted_count": result.deleted_count,
        "reset_by_id": data.admin_id,
        "reset_by_name": data.admin_name,
        "reset_at": datetime.now(timezone.utc).isoformat()
    })
    
    return {
        "message": f"{courier_name} için {data.date} tarihli kayıtlar sıfırlandı",
        "deleted_count": result.deleted_count
    }

