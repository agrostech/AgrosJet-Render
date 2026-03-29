"""
Kontör (Credits) Yönetimi Router
- Şirket bazlı kontör yönetimi
- Ortak havuz mantığı (aynı superadmin'e bağlı şirketler)
- İşlem geçmişi
"""
from fastapi import APIRouter, HTTPException, Depends
from pydantic import BaseModel
from typing import List, Optional
from datetime import datetime, timezone
import uuid

from utils.database import db
from utils.helpers import get_turkey_now
from utils.jwt_utils import require_admin

router = APIRouter(prefix="/api/credits", tags=["Credits"], dependencies=[Depends(require_admin)])


# --- Pydantic Models ---
class CreditAdjust(BaseModel):
    amount: int
    note: Optional[str] = None
    admin_name: Optional[str] = None


class UnlimitedToggle(BaseModel):
    unlimited: bool
    admin_name: Optional[str] = None


# --- Helper Functions ---
async def get_company_pool_id(company_id: str) -> str:
    """
    Şirketin ait olduğu havuz ID'sini döndürür.
    Eğer şirket bir superadmin tarafından birden fazla şirketle birlikte yönetiliyorsa,
    bu şirketler aynı havuzu paylaşır.
    """
    # Bu şirketi yöneten superadminleri bul
    superadmins = await db.admins.find(
        {
            "role": "superadmin",
            "company_ids": company_id
        },
        {"_id": 0, "id": 1, "company_ids": 1}
    ).to_list(100)
    
    if not superadmins:
        # Superadmin yoksa, şirketin kendi havuzu
        return company_id
    
    # Tüm superadminlerin yönettiği şirketlerin birleşimini al
    all_company_ids = set()
    for sa in superadmins:
        for cid in (sa.get("company_ids") or []):
            all_company_ids.add(cid)
    
    if len(all_company_ids) <= 1:
        # Sadece bu şirket varsa, kendi havuzu
        return company_id
    
    # Birden fazla şirket varsa, sıralı birleşim ile deterministik havuz ID oluştur
    sorted_ids = sorted(all_company_ids)
    pool_id = "_".join(sorted_ids)
    return pool_id


async def get_or_create_pool(pool_id: str, initial_company_ids: List[str] = None) -> dict:
    """Havuzu getir veya oluştur"""
    pool = await db.credit_pools.find_one({"pool_id": pool_id}, {"_id": 0})
    
    if not pool:
        pool = {
            "pool_id": pool_id,
            "company_ids": initial_company_ids or [pool_id],
            "credits": 0,
            "unlimited": False,
            "last_credit_date": None,
            "created_at": get_turkey_now()
        }
        await db.credit_pools.insert_one(pool)
    
    return pool


async def get_company_credits(company_id: str) -> dict:
    """Şirketin kontör bilgilerini döndürür"""
    pool_id = await get_company_pool_id(company_id)
    pool = await get_or_create_pool(pool_id, [company_id])
    
    return {
        "company_id": company_id,
        "pool_id": pool_id,
        "credits": pool["credits"],
        "unlimited": pool.get("unlimited", False),
        "last_credit_date": pool.get("last_credit_date"),
        "is_shared_pool": "_" in pool_id
    }


async def deduct_credit(company_id: str, order_id: str = None) -> bool:
    """
    Sipariş için 1 kontör düşer.
    Returns: True if deducted successfully, False if unlimited
    """
    pool_id = await get_company_pool_id(company_id)
    pool = await get_or_create_pool(pool_id, [company_id])
    
    # Sınırsız ise düşme
    if pool.get("unlimited", False):
        return False
    
    # Kontör düş
    await db.credit_pools.update_one(
        {"pool_id": pool_id},
        {"$inc": {"credits": -1}}
    )
    
    # İşlem kaydı
    transaction = {
        "id": str(uuid.uuid4()),
        "pool_id": pool_id,
        "company_id": company_id,
        "type": "order_deduct",
        "amount": -1,
        "order_id": order_id,
        "note": "Sipariş kontörü",
        "created_at": get_turkey_now()
    }
    await db.credit_transactions.insert_one(transaction)
    
    return True


async def check_company_access(company_id: str) -> dict:
    """
    Şirketin panel erişim durumunu kontrol eder.
    Returns: {"allowed": bool, "credits": int, "unlimited": bool}
    """
    credit_info = await get_company_credits(company_id)
    
    if credit_info["unlimited"]:
        return {"allowed": True, "credits": None, "unlimited": True}
    
    credits = credit_info["credits"]
    allowed = credits > -101  # -100'e kadar izin var, -101'de kilitlenir
    
    return {
        "allowed": allowed,
        "credits": credits,
        "unlimited": False
    }


# --- API Endpoints ---
@router.get("/companies")
async def get_all_companies_credits():
    """Tüm şirketlerin kontör durumunu listele"""
    companies = await db.companies.find(
        {"is_archived": {"$ne": True}},
        {"_id": 0, "id": 1, "name": 1, "logo_url": 1}
    ).to_list(500)
    
    result = []
    for company in companies:
        credit_info = await get_company_credits(company["id"])
        result.append({
            "id": company["id"],
            "name": company["name"],
            "logo_url": company.get("logo_url"),
            "credits": credit_info["credits"],
            "unlimited": credit_info["unlimited"],
            "last_credit_date": credit_info["last_credit_date"],
            "is_shared_pool": credit_info["is_shared_pool"],
            "pool_id": credit_info["pool_id"]
        })
    
    return {"companies": result}


@router.get("/company/{company_id}")
async def get_company_credit_info(company_id: str):
    """Şirketin kontör bilgisini getir"""
    company = await db.companies.find_one({"id": company_id}, {"_id": 0})
    if not company:
        raise HTTPException(status_code=404, detail="Şirket bulunamadı")
    
    credit_info = await get_company_credits(company_id)
    access_info = await check_company_access(company_id)
    
    return {
        **credit_info,
        "company_name": company.get("name"),
        "access_allowed": access_info["allowed"]
    }


@router.post("/company/{company_id}/add")
async def add_credits(company_id: str, data: CreditAdjust):
    """Şirkete kontör ekle"""
    if data.amount <= 0:
        raise HTTPException(status_code=400, detail="Miktar pozitif olmalı")
    
    company = await db.companies.find_one({"id": company_id}, {"_id": 0, "name": 1})
    if not company:
        raise HTTPException(status_code=404, detail="Şirket bulunamadı")
    
    pool_id = await get_company_pool_id(company_id)
    await get_or_create_pool(pool_id, [company_id])
    
    # Kontör ekle ve tarihi güncelle
    now = get_turkey_now()
    await db.credit_pools.update_one(
        {"pool_id": pool_id},
        {
            "$inc": {"credits": data.amount},
            "$set": {"last_credit_date": now}
        }
    )
    
    # İşlem kaydı
    transaction = {
        "id": str(uuid.uuid4()),
        "pool_id": pool_id,
        "company_id": company_id,
        "type": "admin_add",
        "amount": data.amount,
        "note": data.note or f"{data.amount} kontör eklendi",
        "admin_name": data.admin_name,
        "created_at": now
    }
    await db.credit_transactions.insert_one(transaction)
    
    # Güncel bakiyeyi döndür
    updated_pool = await db.credit_pools.find_one({"pool_id": pool_id}, {"_id": 0})
    
    return {
        "success": True,
        "new_balance": updated_pool["credits"],
        "message": f"{data.amount} kontör eklendi"
    }


@router.post("/company/{company_id}/deduct")
async def deduct_credits(company_id: str, data: CreditAdjust):
    """Şirketten kontör düş (manuel)"""
    if data.amount <= 0:
        raise HTTPException(status_code=400, detail="Miktar pozitif olmalı")
    
    company = await db.companies.find_one({"id": company_id}, {"_id": 0, "name": 1})
    if not company:
        raise HTTPException(status_code=404, detail="Şirket bulunamadı")
    
    pool_id = await get_company_pool_id(company_id)
    pool = await get_or_create_pool(pool_id, [company_id])
    
    if pool.get("unlimited"):
        raise HTTPException(status_code=400, detail="Sınırsız kontörlü şirketten düşüm yapılamaz")
    
    # Kontör düş
    await db.credit_pools.update_one(
        {"pool_id": pool_id},
        {"$inc": {"credits": -data.amount}}
    )
    
    # İşlem kaydı
    transaction = {
        "id": str(uuid.uuid4()),
        "pool_id": pool_id,
        "company_id": company_id,
        "type": "admin_deduct",
        "amount": -data.amount,
        "note": data.note or f"{data.amount} kontör düşüldü",
        "admin_name": data.admin_name,
        "created_at": get_turkey_now()
    }
    await db.credit_transactions.insert_one(transaction)
    
    # Güncel bakiyeyi döndür
    updated_pool = await db.credit_pools.find_one({"pool_id": pool_id}, {"_id": 0})
    
    return {
        "success": True,
        "new_balance": updated_pool["credits"],
        "message": f"{data.amount} kontör düşüldü"
    }


@router.put("/company/{company_id}/unlimited")
async def toggle_unlimited(company_id: str, data: UnlimitedToggle):
    """Şirketin sınırsız kontör durumunu değiştir"""
    company = await db.companies.find_one({"id": company_id}, {"_id": 0, "name": 1})
    if not company:
        raise HTTPException(status_code=404, detail="Şirket bulunamadı")
    
    pool_id = await get_company_pool_id(company_id)
    await get_or_create_pool(pool_id, [company_id])
    
    # Sınırsız durumunu güncelle
    await db.credit_pools.update_one(
        {"pool_id": pool_id},
        {"$set": {"unlimited": data.unlimited}}
    )
    
    # İşlem kaydı
    transaction = {
        "id": str(uuid.uuid4()),
        "pool_id": pool_id,
        "company_id": company_id,
        "type": "unlimited_toggle",
        "amount": 0,
        "note": f"Sınırsız kontör {'aktif' if data.unlimited else 'pasif'} edildi",
        "admin_name": data.admin_name,
        "created_at": get_turkey_now()
    }
    await db.credit_transactions.insert_one(transaction)
    
    return {
        "success": True,
        "unlimited": data.unlimited,
        "message": f"Sınırsız kontör {'aktif' if data.unlimited else 'pasif'} edildi"
    }


@router.get("/company/{company_id}/transactions")
async def get_company_transactions(company_id: str, limit: int = 50):
    """Şirketin kontör işlem geçmişi"""
    pool_id = await get_company_pool_id(company_id)
    
    transactions = await db.credit_transactions.find(
        {"pool_id": pool_id},
        {"_id": 0}
    ).sort("created_at", -1).limit(limit).to_list(limit)
    
    return {"transactions": transactions}


@router.get("/company/{company_id}/access")
async def check_access(company_id: str):
    """Şirketin panel erişim durumunu kontrol et"""
    access_info = await check_company_access(company_id)
    
    return {
        "company_id": company_id,
        **access_info
    }
