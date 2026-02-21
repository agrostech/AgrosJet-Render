"""
Yönetici Mütabakat API Router
- Yönetici bazlı tahsilat takibi
- Sıfırlama işlemleri
- Detaylı raporlama
"""
from fastapi import APIRouter, HTTPException, Query
from pydantic import BaseModel
from typing import Optional, List
from datetime import datetime, timezone
import uuid

from utils.database import db

router = APIRouter(prefix="/api/admin-mutabakat", tags=["Yönetici Mütabakat"])


class ResetRequest(BaseModel):
    reset_by_id: str
    reset_by_name: str
    note: Optional[str] = None


@router.get("/{company_id}")
async def get_admin_balances(company_id: str):
    """
    Şirketteki tüm yöneticilerin tahsilat bakiyelerini getir
    Son sıfırlamadan itibaren biriken nakit ve kart toplamları
    """
    # Şirketteki tüm yöneticileri al
    admins = await db.admins.find(
        {
            "$or": [
                {"company_id": company_id},
                {"role": "superadmin"}
            ],
            "is_archived": {"$ne": True}
        },
        {"_id": 0, "id": 1, "name": 1, "role": 1}
    ).to_list(100)
    
    admin_balances = []
    
    for admin in admins:
        admin_id = admin["id"]
        
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
                    "total_card": {"$sum": "$card_total"},
                    "collection_count": {"$sum": 1},
                    "courier_count": {"$addToSet": "$courier_id"}
                }
            }
        ]
        
        result = await db.daily_mutabakat_collections.aggregate(pipeline).to_list(1)
        
        if result:
            data = result[0]
            total_cash = data["total_cash"] or 0
            total_card = data["total_card"] or 0
            collection_count = data["collection_count"] or 0
            courier_count = len(data["courier_count"]) if data["courier_count"] else 0
        else:
            total_cash = 0
            total_card = 0
            collection_count = 0
            courier_count = 0
        
        admin_balances.append({
            "admin_id": admin_id,
            "admin_name": admin["name"],
            "role": admin.get("role", "admin"),
            "total_cash": round(total_cash, 2),
            "total_card": round(total_card, 2),
            "total_balance": round(total_cash + total_card, 2),
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
        "total_card": round(sum(a["total_card"] for a in admin_balances), 2),
        "total_balance": round(sum(a["total_balance"] for a in admin_balances), 2),
        "admin_count": len([a for a in admin_balances if a["total_balance"] > 0])
    }
    
    return {
        "admins": admin_balances,
        "summary": summary
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
                "total_card": {"$sum": "$card_total"},
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
    """
    # Yöneticiyi kontrol et
    admin = await db.admins.find_one(
        {"id": admin_id},
        {"_id": 0, "id": 1, "name": 1}
    )
    
    if not admin:
        raise HTTPException(status_code=404, detail="Yönetici bulunamadı")
    
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
                "total_card": {"$sum": "$card_total"}
            }
        }
    ]
    
    result = await db.daily_mutabakat_collections.aggregate(pipeline).to_list(1)
    
    cash_at_reset = result[0]["total_cash"] if result else 0
    card_at_reset = result[0]["total_card"] if result else 0
    
    # Sıfırlama kaydı oluştur
    reset_record = {
        "id": str(uuid.uuid4()),
        "company_id": company_id,
        "admin_id": admin_id,
        "admin_name": admin["name"],
        "reset_at": datetime.now(timezone.utc).isoformat(),
        "reset_by_id": data.reset_by_id,
        "reset_by_name": data.reset_by_name,
        "cash_at_reset": round(cash_at_reset, 2),
        "card_at_reset": round(card_at_reset, 2),
        "total_at_reset": round(cash_at_reset + card_at_reset, 2),
        "note": data.note
    }
    
    await db.admin_mutabakat_resets.insert_one(reset_record)
    
    return {
        "message": f"{admin['name']} bakiyesi sıfırlandı",
        "reset_amount": {
            "cash": round(cash_at_reset, 2),
            "card": round(card_at_reset, 2),
            "total": round(cash_at_reset + card_at_reset, 2)
        }
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
