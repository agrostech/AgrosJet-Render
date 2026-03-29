"""
Yönetici Mütabakat API Router
- Yönetici bazlı tahsilat takibi
- Sıfırlama işlemleri
- Detaylı raporlama
"""
from fastapi import APIRouter, HTTPException, Query, Depends
from pydantic import BaseModel
from typing import Optional, List
from datetime import datetime, timezone
import uuid

from utils.database import db
from utils.helpers import get_turkey_now, ensure_turkey_timezone, TURKEY_TZ
from utils.jwt_utils import require_admin

router = APIRouter(prefix="/api/admin-mutabakat", tags=["Yönetici Mütabakat"], dependencies=[Depends(require_admin)])


class ResetRequest(BaseModel):
    reset_by_id: str
    reset_by_name: str
    note: Optional[str] = None
    is_super_admin: bool = False
    # Alınan tutarlar
    received_cash: float = 0
    received_card_1: float = 0
    received_card_10: float = 0
    received_card_20: float = 0
    received_meal_card: float = 0


@router.get("/{company_id}")
async def get_admin_balances(company_id: str):
    """
    Şirketteki tüm yöneticilerin tahsilat bakiyelerini getir
    Son sıfırlamadan itibaren biriken nakit ve kart toplamları
    """
    # Şirkete ait restoranların meal_card ayarlarını kontrol et
    restaurants_with_meal_card = await db.restaurants.find(
        {
            "company_id": company_id,
            "is_archived": {"$ne": True}
        },
        {"_id": 0, "id": 1, "collection_settings": 1}
    ).to_list(500)
    
    has_meal_card_collection = any(
        r.get("collection_settings", {}).get("meal_card_collection") == "courier"
        for r in restaurants_with_meal_card
    )
    
    # Şirketteki tüm yöneticileri al (linked_courier_id dahil)
    admins = await db.admins.find(
        {
            "$or": [
                {"company_id": company_id},
                {"role": "superadmin"}
            ],
            "is_archived": {"$ne": True}
        },
        {"_id": 0, "id": 1, "name": 1, "role": 1, "linked_courier_id": 1}
    ).to_list(100)
    
    admin_balances = []
    
    for admin in admins:
        admin_id = admin["id"]
        linked_courier_id = admin.get("linked_courier_id")
        
        # Son sıfırlama tarihini bul
        last_reset = await db.admin_mutabakat_resets.find_one(
            {"company_id": company_id, "admin_id": admin_id},
            sort=[("reset_at", -1)]
        )
        
        reset_date = last_reset["reset_at"] if last_reset else None
        
        # Sıfırlamadan sonraki tahsilatları topla
        match_filter = {
            "company_id": company_id,
            "admin_id": admin_id
        }
        
        if reset_date:
            match_filter["created_at"] = {"$gt": reset_date}
        
        # Aggregation ile toplam hesapla
        pipeline = [
            {"$match": match_filter},
            {
                "$group": {
                    "_id": None,
                    "total_cash": {"$sum": "$cash_amount"},
                    "total_card_1": {"$sum": {"$ifNull": ["$card_percent_1", 0]}},
                    "total_card_10": {"$sum": {"$ifNull": ["$card_percent_10", 0]}},
                    "total_card_20": {"$sum": {"$ifNull": ["$card_percent_20", 0]}},
                    "total_card": {"$sum": "$card_total"},
                    "total_meal_card": {"$sum": {"$ifNull": ["$meal_card_amount", 0]}},
                    "collection_count": {"$sum": 1},
                    "courier_count": {"$addToSet": "$courier_id"}
                }
            }
        ]
        
        result = await db.daily_mutabakat_collections.aggregate(pipeline).to_list(1)
        
        if result:
            data = result[0]
            total_cash = data["total_cash"] or 0
            total_card_1 = data["total_card_1"] or 0
            total_card_10 = data["total_card_10"] or 0
            total_card_20 = data["total_card_20"] or 0
            total_card = data["total_card"] or 0
            total_meal_card = data["total_meal_card"] or 0
            collection_count = data["collection_count"] or 0
            courier_count = len(data["courier_count"]) if data["courier_count"] else 0
        else:
            total_cash = 0
            total_card_1 = 0
            total_card_10 = 0
            total_card_20 = 0
            total_card = 0
            total_meal_card = 0
            collection_count = 0
            courier_count = 0
        
        admin_balances.append({
            "admin_id": admin_id,
            "admin_name": admin["name"],
            "role": admin.get("role", "admin"),
            "linked_courier_id": linked_courier_id,
            "has_linked_courier": bool(linked_courier_id),
            "total_cash": round(total_cash, 2),
            "total_card_1": round(total_card_1, 2),
            "total_card_10": round(total_card_10, 2),
            "total_card_20": round(total_card_20, 2),
            "total_card": round(total_card, 2),
            "total_meal_card": round(total_meal_card, 2),
            "total_balance": round(total_cash + total_card + total_meal_card, 2),
            "collection_count": collection_count,
            "courier_count": courier_count,
            "last_reset": reset_date,
            "last_reset_info": {
                "reset_by_name": last_reset.get("reset_by_name") if last_reset else None,
                "note": last_reset.get("note") if last_reset else None
            } if last_reset else None
        })
    
    # Bakiyeye göre sırala (yüksekten düşüğe)
    admin_balances.sort(key=lambda x: x["total_balance"], reverse=True)
    
    # Toplam özet
    summary = {
        "total_cash": round(sum(a["total_cash"] for a in admin_balances), 2),
        "total_card_1": round(sum(a["total_card_1"] for a in admin_balances), 2),
        "total_card_10": round(sum(a["total_card_10"] for a in admin_balances), 2),
        "total_card_20": round(sum(a["total_card_20"] for a in admin_balances), 2),
        "total_card": round(sum(a["total_card"] for a in admin_balances), 2),
        "total_meal_card": round(sum(a["total_meal_card"] for a in admin_balances), 2),
        "total_balance": round(sum(a["total_balance"] for a in admin_balances), 2),
        "admin_count": len([a for a in admin_balances if a["total_balance"] > 0])
    }
    
    return {
        "admins": admin_balances,
        "summary": summary,
        "hasMealCardCollection": has_meal_card_collection
    }


@router.get("/{company_id}/admin/{admin_id}/details")
async def get_admin_details(
    company_id: str, 
    admin_id: str,
    page: int = Query(1, ge=1),
    limit: int = Query(50, ge=1, le=200)
):
    """
    Yöneticinin tahsilat detaylarını getir
    Hangi kuryeden, hangi gün, ne kadar nakit/kart alındı
    """
    # Son sıfırlama tarihini bul
    last_reset = await db.admin_mutabakat_resets.find_one(
        {"company_id": company_id, "admin_id": admin_id},
        sort=[("reset_at", -1)]
    )
    
    reset_date = last_reset["reset_at"] if last_reset else None
    
    # Filtre
    match_filter = {
        "company_id": company_id,
        "admin_id": admin_id
    }
    
    if reset_date:
        match_filter["created_at"] = {"$gt": reset_date}
    
    # Toplam kayıt sayısı
    total_count = await db.daily_mutabakat_collections.count_documents(match_filter)
    
    # Sayfalı sonuçlar
    skip = (page - 1) * limit
    
    collections = await db.daily_mutabakat_collections.find(
        match_filter,
        {"_id": 0}
    ).sort("created_at", -1).skip(skip).limit(limit).to_list(limit)
    
    # Kurye bazlı grupla (özet için)
    courier_summary_pipeline = [
        {"$match": match_filter},
        {
            "$group": {
                "_id": "$courier_id",
                "courier_name": {"$first": "$courier_name"},
                "total_cash": {"$sum": "$cash_amount"},
                "total_card_1": {"$sum": {"$ifNull": ["$card_percent_1", 0]}},
                "total_card_10": {"$sum": {"$ifNull": ["$card_percent_10", 0]}},
                "total_card_20": {"$sum": {"$ifNull": ["$card_percent_20", 0]}},
                "total_card": {"$sum": "$card_total"},
                "total_meal_card": {"$sum": {"$ifNull": ["$meal_card_amount", 0]}},
                "count": {"$sum": 1}
            }
        },
        {"$sort": {"total_cash": -1}}
    ]
    
    courier_summary = await db.daily_mutabakat_collections.aggregate(courier_summary_pipeline).to_list(100)
    
    return {
        "collections": collections,
        "courier_summary": courier_summary,
        "pagination": {
            "page": page,
            "limit": limit,
            "total": total_count,
            "pages": (total_count + limit - 1) // limit
        },
        "last_reset": reset_date
    }


@router.post("/{company_id}/reset/{admin_id}")
async def reset_admin_balance(company_id: str, admin_id: str, data: ResetRequest):
    """
    Yönetici bakiyesini sıfırla (sadece süper admin yapabilir)
    Mevcut bakiye kaydedilir ve yeni dönem başlar
    Eksik tutarlar bağlı kurye hesabına borç olarak işlenir
    """
    # Yöneticiyi kontrol et
    admin = await db.admins.find_one(
        {"id": admin_id},
        {"_id": 0, "id": 1, "name": 1, "linked_courier_id": 1}
    )
    
    if not admin:
        raise HTTPException(status_code=404, detail="Yönetici bulunamadı")
    
    linked_courier_id = admin.get("linked_courier_id")
    
    # Bağlı kurye yoksa ve superadmin değilse uyarı ver
    if not linked_courier_id and not data.is_super_admin:
        raise HTTPException(
            status_code=400, 
            detail="Bu yöneticinin bağlı kurye hesabı yok. Önce Yöneticiler sayfasından kurye hesabı bağlayın."
        )
    
    # Bağlı kurye bilgilerini al (varsa)
    linked_courier = None
    if linked_courier_id:
        linked_courier = await db.couriers.find_one(
            {"id": linked_courier_id},
            {"_id": 0, "id": 1, "name": 1}
        )
        
        if not linked_courier and not data.is_super_admin:
            raise HTTPException(status_code=404, detail="Bağlı kurye hesabı bulunamadı")
    
    # Mevcut bakiyeyi hesapla
    last_reset = await db.admin_mutabakat_resets.find_one(
        {"company_id": company_id, "admin_id": admin_id},
        sort=[("reset_at", -1)]
    )
    
    reset_date = last_reset["reset_at"] if last_reset else None
    
    match_filter = {
        "company_id": company_id,
        "admin_id": admin_id
    }
    
    if reset_date:
        match_filter["created_at"] = {"$gt": reset_date}
    
    pipeline = [
        {"$match": match_filter},
        {
            "$group": {
                "_id": None,
                "total_cash": {"$sum": "$cash_amount"},
                "total_card_1": {"$sum": {"$ifNull": ["$card_percent_1", 0]}},
                "total_card_10": {"$sum": {"$ifNull": ["$card_percent_10", 0]}},
                "total_card_20": {"$sum": {"$ifNull": ["$card_percent_20", 0]}},
                "total_card": {"$sum": "$card_total"},
                "total_meal_card": {"$sum": {"$ifNull": ["$meal_card_amount", 0]}}
            }
        }
    ]
    
    result = await db.daily_mutabakat_collections.aggregate(pipeline).to_list(1)
    
    if result:
        cash_at_reset = result[0]["total_cash"] or 0
        card_1_at_reset = result[0]["total_card_1"] or 0
        card_10_at_reset = result[0]["total_card_10"] or 0
        card_20_at_reset = result[0]["total_card_20"] or 0
        card_at_reset = result[0]["total_card"] or 0
        meal_card_at_reset = result[0]["total_meal_card"] or 0
    else:
        cash_at_reset = 0
        card_1_at_reset = 0
        card_10_at_reset = 0
        card_20_at_reset = 0
        card_at_reset = 0
        meal_card_at_reset = 0
    
    # Alınan tutarları al
    received_cash = data.received_cash or 0
    received_card_1 = data.received_card_1 or 0
    received_card_10 = data.received_card_10 or 0
    received_card_20 = data.received_card_20 or 0
    received_card = received_card_1 + received_card_10 + received_card_20
    received_meal_card = data.received_meal_card or 0
    
    # Eksik tutarları hesapla
    missing_cash = round(cash_at_reset - received_cash, 2)
    missing_card_1 = round(card_1_at_reset - received_card_1, 2)
    missing_card_10 = round(card_10_at_reset - received_card_10, 2)
    missing_card_20 = round(card_20_at_reset - received_card_20, 2)
    missing_meal_card = round(meal_card_at_reset - received_meal_card, 2)
    
    # Eksik tutarlar için bağlı kurye hesabına işlem ekle (sadece bağlı kurye varsa)
    transactions_added = []
    total_missing = 0
    
    if missing_cash > 0 and linked_courier:
        tx = {
            "id": str(uuid.uuid4()),
            "entity_id": linked_courier_id,
            "entity_type": "courier",
            "courier_id": linked_courier_id,
            "courier_name": linked_courier["name"],
            "company_id": company_id,
            "type": "given",
            "amount": missing_cash,
            "description": f"Yönetici Mütabakat Sıfırlama - Eksik Nakit ({admin['name']})",
            "admin_id": data.reset_by_id,
            "admin_name": data.reset_by_name,
            "is_admin_mutabakat": True,
            "created_at": get_turkey_now()
        }
        await db.transactions.insert_one(tx)
        total_missing += missing_cash
        transactions_added.append({"type": "cash", "amount": missing_cash})
        
        # Kurye bakiyesini güncelle
        await db.couriers.update_one(
            {"id": linked_courier_id},
            {"$inc": {"balance": missing_cash}}
        )
    
    if missing_card_1 > 0 and linked_courier:
        tx = {
            "id": str(uuid.uuid4()),
            "entity_id": linked_courier_id,
            "entity_type": "courier",
            "courier_id": linked_courier_id,
            "courier_name": linked_courier["name"],
            "company_id": company_id,
            "type": "given",
            "amount": missing_card_1,
            "description": f"Yönetici Mütabakat Sıfırlama - Eksik Kart %1 ({admin['name']})",
            "admin_id": data.reset_by_id,
            "admin_name": data.reset_by_name,
            "is_admin_mutabakat": True,
            "created_at": get_turkey_now()
        }
        await db.transactions.insert_one(tx)
        total_missing += missing_card_1
        transactions_added.append({"type": "card_1", "amount": missing_card_1})
        
        await db.couriers.update_one(
            {"id": linked_courier_id},
            {"$inc": {"balance": missing_card_1}}
        )
    
    if missing_card_10 > 0 and linked_courier:
        tx = {
            "id": str(uuid.uuid4()),
            "entity_id": linked_courier_id,
            "entity_type": "courier",
            "courier_id": linked_courier_id,
            "courier_name": linked_courier["name"],
            "company_id": company_id,
            "type": "given",
            "amount": missing_card_10,
            "description": f"Yönetici Mütabakat Sıfırlama - Eksik Kart %10 ({admin['name']})",
            "admin_id": data.reset_by_id,
            "admin_name": data.reset_by_name,
            "is_admin_mutabakat": True,
            "created_at": get_turkey_now()
        }
        await db.transactions.insert_one(tx)
        total_missing += missing_card_10
        transactions_added.append({"type": "card_10", "amount": missing_card_10})
        
        await db.couriers.update_one(
            {"id": linked_courier_id},
            {"$inc": {"balance": missing_card_10}}
        )
    
    if missing_card_20 > 0 and linked_courier:
        tx = {
            "id": str(uuid.uuid4()),
            "entity_id": linked_courier_id,
            "entity_type": "courier",
            "courier_id": linked_courier_id,
            "courier_name": linked_courier["name"],
            "company_id": company_id,
            "type": "given",
            "amount": missing_card_20,
            "description": f"Yönetici Mütabakat Sıfırlama - Eksik Kart %20 ({admin['name']})",
            "admin_id": data.reset_by_id,
            "admin_name": data.reset_by_name,
            "is_admin_mutabakat": True,
            "created_at": get_turkey_now()
        }
        await db.transactions.insert_one(tx)
        total_missing += missing_card_20
        transactions_added.append({"type": "card_20", "amount": missing_card_20})
        
        await db.couriers.update_one(
            {"id": linked_courier_id},
            {"$inc": {"balance": missing_card_20}}
        )
    
    if missing_meal_card > 0 and linked_courier:
        tx = {
            "id": str(uuid.uuid4()),
            "entity_id": linked_courier_id,
            "entity_type": "courier",
            "courier_id": linked_courier_id,
            "courier_name": linked_courier["name"],
            "company_id": company_id,
            "type": "given",
            "amount": missing_meal_card,
            "description": f"Yönetici Mütabakat Sıfırlama - Eksik Yemek Kartı ({admin['name']})",
            "admin_id": data.reset_by_id,
            "admin_name": data.reset_by_name,
            "is_admin_mutabakat": True,
            "created_at": get_turkey_now()
        }
        await db.transactions.insert_one(tx)
        total_missing += missing_meal_card
        transactions_added.append({"type": "meal_card", "amount": missing_meal_card})
        
        await db.couriers.update_one(
            {"id": linked_courier_id},
            {"$inc": {"balance": missing_meal_card}}
        )
    
    # Sıfırlama kaydı oluştur
    reset_record = {
        "id": str(uuid.uuid4()),
        "company_id": company_id,
        "admin_id": admin_id,
        "admin_name": admin["name"],
        "reset_at": get_turkey_now(),
        "reset_by_id": data.reset_by_id,
        "reset_by_name": data.reset_by_name,
        "cash_at_reset": round(cash_at_reset, 2),
        "card_1_at_reset": round(card_1_at_reset, 2),
        "card_10_at_reset": round(card_10_at_reset, 2),
        "card_20_at_reset": round(card_20_at_reset, 2),
        "card_at_reset": round(card_at_reset, 2),
        "meal_card_at_reset": round(meal_card_at_reset, 2),
        "total_at_reset": round(cash_at_reset + card_at_reset + meal_card_at_reset, 2),
        "received_cash": received_cash,
        "received_card_1": received_card_1,
        "received_card_10": received_card_10,
        "received_card_20": received_card_20,
        "received_card": received_card,
        "received_meal_card": received_meal_card,
        "missing_cash": missing_cash if missing_cash > 0 else 0,
        "missing_card": round(max(0, missing_card_1) + max(0, missing_card_10) + max(0, missing_card_20), 2),
        "missing_meal_card": missing_meal_card if missing_meal_card > 0 else 0,
        "note": data.note
    }
    
    await db.admin_mutabakat_resets.insert_one(reset_record)
    
    return {
        "message": f"{admin['name']} bakiyesi sıfırlandı",
        "reset_amount": {
            "cash": round(cash_at_reset, 2),
            "card_1": round(card_1_at_reset, 2),
            "card_10": round(card_10_at_reset, 2),
            "card_20": round(card_20_at_reset, 2),
            "card": round(card_at_reset, 2),
            "meal_card": round(meal_card_at_reset, 2),
            "total": round(cash_at_reset + card_at_reset + meal_card_at_reset, 2)
        },
        "received": {
            "cash": received_cash,
            "card_1": received_card_1,
            "card_10": received_card_10,
            "card_20": received_card_20,
            "card": received_card,
            "meal_card": received_meal_card
        },
        "missing_transactions": transactions_added
    }


@router.get("/{company_id}/admin/{admin_id}/history")
async def get_reset_history(company_id: str, admin_id: str):
    """
    Yöneticinin sıfırlama geçmişini getir
    """
    resets = await db.admin_mutabakat_resets.find(
        {"company_id": company_id, "admin_id": admin_id},
        {"_id": 0}
    ).sort("reset_at", -1).to_list(50)
    
    return {"resets": resets}
