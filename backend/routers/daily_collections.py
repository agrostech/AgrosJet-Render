"""
Günlük Tahsilat Girişi Router
Admin kuryelerden nakit ve Z raporu (kredi kartı) tahsilatlarını kaydeder
"""
from fastapi import APIRouter, HTTPException, Depends
from pydantic import BaseModel
from typing import Optional, List
from datetime import datetime, timezone, timedelta
import uuid

from utils.database import db
from utils.helpers import get_turkey_now, ensure_turkey_timezone, TURKEY_TZ
from utils.jwt_utils import require_admin

router = APIRouter(prefix="/api/daily-collections", tags=["Günlük Tahsilat"], dependencies=[Depends(require_admin)])


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

@router.get("/{company_id}/weekly-summary")
async def get_weekly_summary(company_id: str, week_start: str = None):
    """
    Haftalık tahsilat özeti - her gün için tamamlanan/toplam kurye sayısı
    week_start: Haftanın başlangıç tarihi (Pazartesi), yoksa bu haftanın Pazartesisi
    """
    # Haftanın başlangıcını hesapla
    if week_start:
        start_date = datetime.strptime(week_start, "%Y-%m-%d")
    else:
        today = datetime.now(TURKEY_TZ)
        # Pazartesiye git (weekday 0 = Pazartesi)
        start_date = today - timedelta(days=today.weekday())
    
    start_date = start_date.replace(hour=0, minute=0, second=0, microsecond=0)
    
    # Toplam AKTİF kurye sayısını hesapla (pasif ve arşivlenmiş olanları hariç tut)
    # 1. Doğrudan company_id ile bağlı aktif kuryeler
    direct_couriers = await db.couriers.count_documents({
        "company_id": company_id,
        "$or": [{"is_archived": {"$exists": False}}, {"is_archived": False}],
        "$or": [{"is_active": {"$exists": False}}, {"is_active": True}]
    })
    
    # 2. company_couriers tablosu üzerinden bağlı aktif kuryeler (hayalet dahil)
    relation_count = await db.company_couriers.count_documents({
        "company_id": company_id,
        "$and": [
            {"$or": [{"is_archived": {"$exists": False}}, {"is_archived": False}]},
            {"$or": [{"is_active": {"$exists": False}}, {"is_active": True}]}
        ]
    })
    
    # En büyük değeri al (ikisi de aynı kuryeleri gösterebilir veya farklı olabilir)
    total_couriers = max(direct_couriers, relation_count)
    
    # Eğer hala 0 ise, filtre olmadan dene
    if total_couriers == 0:
        direct_couriers = await db.couriers.count_documents({"company_id": company_id})
        relation_count = await db.company_couriers.count_documents({"company_id": company_id})
        total_couriers = max(direct_couriers, relation_count)
    
    # 7 gün için özet oluştur
    days = []
    day_names_tr = ["Pzt", "Sal", "Çar", "Per", "Cum", "Cmt", "Paz"]
    today_str = datetime.now(TURKEY_TZ).strftime("%Y-%m-%d")
    
    for i in range(7):
        day_date = start_date + timedelta(days=i)
        date_str = day_date.strftime("%Y-%m-%d")
        
        # O gün tahsilat yapılan benzersiz kurye sayısı
        completed_couriers = await db.daily_collections.distinct(
            "courier_id",
            {"company_id": company_id, "date": date_str}
        )
        completed_count = len(completed_couriers)
        
        # Durum belirleme
        is_future = date_str > today_str
        is_today = date_str == today_str
        
        if is_future:
            status = "future"
        elif completed_count == 0:
            status = "empty"
        elif completed_count >= total_couriers:
            status = "complete"
        else:
            status = "partial"
        
        days.append({
            "date": date_str,
            "day_name": day_names_tr[i],
            "day_number": day_date.day,
            "completed": completed_count,
            "total": total_couriers,
            "status": status,
            "is_today": is_today
        })
    
    return {
        "week_start": start_date.strftime("%Y-%m-%d"),
        "total_couriers": total_couriers,
        "days": days
    }


@router.post("")
async def create_daily_collection(data: DailyCollectionCreate):
    """
    Kurye için günlük tahsilat kaydı oluştur
    NOT: Kayıtlar silinemez ve düzenlenemez
    Sıfır değerler de kaydedilebilir (kuryenin tahsilatı yok anlamında)
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
        "created_at": get_turkey_now()
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
    Detaylı kayıtları da içerir (kurye, tarih, tutarlar)
    """
    # Önce tüm adminleri ve sıfırlama bilgilerini al
    reset_docs = await db.admin_cumulative_resets.find(
        {"company_id": company_id},
        {"_id": 0}
    ).to_list(100)
    reset_map = {r["admin_id"]: r.get("reset_at") for r in reset_docs}
    
    # Tüm tahsilatları al
    collections = await db.daily_collections.find(
        {"company_id": company_id},
        {"_id": 0}
    ).sort("created_at", -1).to_list(10000)
    
    # Admin bazında grupla
    admin_totals = {}
    for col in collections:
        admin_id = col.get("admin_id", "unknown")
        
        # Admin'i ilk kez görüyorsak başlat
        if admin_id not in admin_totals:
            admin_totals[admin_id] = {
                "admin_id": admin_id,
                "admin_name": col.get("admin_name", "Bilinmeyen"),
                "cash_total": 0,
                "card_total": 0,
                "record_count": 0,
                "last_reset_at": reset_map.get(admin_id),
                "records": []  # Detaylı kayıtlar
            }
        
        # Sıfırlama tarihinden sonraki kayıtları say
        last_reset = admin_totals[admin_id]["last_reset_at"]
        if last_reset:
            col_created_at = col.get("created_at", "")
            if col_created_at <= last_reset:
                continue  # Bu kayıt sıfırlamadan önce, atla
        
        admin_totals[admin_id]["cash_total"] += col.get("cash_amount", 0)
        admin_totals[admin_id]["card_total"] += col.get("card_total", 0)
        admin_totals[admin_id]["record_count"] += 1
        
        # Detaylı kayıt ekle
        admin_totals[admin_id]["records"].append({
            "courier_id": col.get("courier_id"),
            "courier_name": col.get("courier_name"),
            "date": col.get("date"),
            "cash_amount": col.get("cash_amount", 0),
            "card_total": col.get("card_total", 0),
            "card_percent_1": col.get("card_percent_1", 0),
            "card_percent_10": col.get("card_percent_10", 0),
            "card_percent_20": col.get("card_percent_20", 0),
            "created_at": col.get("created_at")
        })
    
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
    # Sıfırlama anındaki bakiye bilgisi
    cash_total: float = 0
    card_total: float = 0


@router.get("/{company_id}/admin-cumulative-history/{admin_id}")
async def get_admin_cumulative_history(company_id: str, admin_id: str):
    """
    Admin'in kümülatif tahsilat sıfırlama geçmişi
    """
    logs = await db.admin_cumulative_reset_logs.find(
        {"company_id": company_id, "admin_id": admin_id},
        {"_id": 0}
    ).sort("reset_at", -1).to_list(100)
    
    return {"history": logs}


@router.post("/{company_id}/reset-admin-cumulative")
async def reset_admin_cumulative(company_id: str, data: ResetAdminCumulativeRequest):
    """
    Admin'in kümülatif tahsilat toplamını sıfırla (sadece SuperAdmin)
    Bu işlem kayıtları silmez, sadece yeni bir başlangıç noktası belirler
    """
    now = get_turkey_now()
    
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
    
    # Log kaydı - bakiye bilgisi ile
    await db.admin_cumulative_reset_logs.insert_one({
        "id": str(uuid.uuid4()),
        "company_id": company_id,
        "admin_id": data.admin_id,
        "admin_name": admin_name,
        "reset_by_id": data.reset_by_id,
        "reset_by_name": data.reset_by_name,
        "cash_total": data.cash_total,
        "card_total": data.card_total,
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
    now = get_turkey_now()
    
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
    
    return {"message": "Admin tahsilatı alındı olarak işaretlendi"}


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
    now = get_turkey_now()
    
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
        "reset_at": get_turkey_now()
    })
    
    return {
        "message": f"{courier_name} için {data.date} tarihli kayıtlar sıfırlandı",
        "deleted_count": result.deleted_count
    }

