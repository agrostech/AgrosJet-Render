from fastapi import APIRouter, HTTPException
from pydantic import BaseModel
from datetime import datetime, timezone
import uuid

from utils.database import db
from utils.helpers import hash_password, format_name

router = APIRouter(prefix="/api/auth", tags=["Auth"])


# --- Session Check ---
@router.get("/check-session/{user_id}")
async def check_session(user_id: str):
    """Check if user's session is still valid"""
    invalidated = await db.invalidated_sessions.find_one({"user_id": user_id})
    if invalidated:
        return {"valid": False, "reason": "Yetkilerin güncellendi, lütfen tekrar giriş yap"}
    return {"valid": True}


@router.delete("/clear-invalidation/{user_id}")
async def clear_invalidation(user_id: str):
    """Clear session invalidation after user logs out"""
    await db.invalidated_sessions.delete_one({"user_id": user_id})
    return {"message": "Cleared"}


# --- Pydantic Models ---
class CourierRegister(BaseModel):
    name: str
    phone: str
    address: str
    iban: str
    plate: str
    password: str


class CourierLogin(BaseModel):
    phone: str
    password: str


class AdminLogin(BaseModel):
    username: str
    password: str


# --- Courier Auth ---
@router.post("/courier/register")
async def register_courier(data: CourierRegister):
    existing = await db.couriers.find_one({"phone": data.phone})
    if existing:
        raise HTTPException(status_code=400, detail="Bu telefon numarası zaten kayıtlı")
    
    courier = {
        "id": str(uuid.uuid4()),
        "name": format_name(data.name),
        "phone": data.phone,
        "address": data.address,
        "iban": data.iban,
        "plate": data.plate.upper(),
        "password": hash_password(data.password),
        "status": "active",
        "created_at": datetime.now(timezone.utc).isoformat()
    }
    await db.couriers.insert_one(courier)
    return {"message": "Kayıt başarılı.", "id": courier["id"]}


@router.post("/courier/login")
async def login_courier(data: CourierLogin):
    courier = await db.couriers.find_one({"phone": data.phone}, {"_id": 0})
    if not courier or courier["password"] != hash_password(data.password):
        raise HTTPException(status_code=401, detail="Geçersiz telefon veya şifre")
    
    # Get companies this courier belongs to
    company_relations = await db.company_couriers.find(
        {"courier_id": courier["id"], "status": "approved"}, 
        {"_id": 0}
    ).to_list(100)
    
    companies = []
    for rel in company_relations:
        company = await db.companies.find_one({"id": rel["company_id"]}, {"_id": 0})
        if company:
            companies.append(company)
    
    return {
        "id": courier["id"],
        "name": courier["name"],
        "phone": courier["phone"],
        "role": "courier",
        "companies": companies
    }


# --- Admin Auth ---
@router.post("/admin/login")
async def login_admin(data: AdminLogin):
    admin = await db.admins.find_one({"username": data.username}, {"_id": 0})
    if not admin or admin["password"] != hash_password(data.password):
        raise HTTPException(status_code=401, detail="Geçersiz kullanıcı adı veya şifre")
    
    company = None
    if admin["company_id"]:
        company = await db.companies.find_one({"id": admin["company_id"]}, {"_id": 0})
    
    return {
        "id": admin["id"],
        "name": admin["name"],
        "username": admin["username"],
        "role": admin["role"],
        "permissions": admin["permissions"],
        "company_id": admin["company_id"],
        "company": company,
        "email": admin.get("email")
    }
