from fastapi import APIRouter, HTTPException
from pydantic import BaseModel, ConfigDict
from typing import List, Optional
from datetime import datetime, timezone
import uuid

from utils.database import db
from utils.helpers import hash_password, format_name

router = APIRouter(prefix="/api", tags=["Admins"])


# --- Pydantic Models ---
class AdminCreate(BaseModel):
    name: str
    username: str
    password: str
    company_id: str


class SuperAdminCreate(BaseModel):
    name: str
    username: str
    password: str
    company_id: str
    email: Optional[str] = None


class AdminUpdate(BaseModel):
    name: Optional[str] = None
    password: Optional[str] = None
    email: Optional[str] = None


class AdminResponse(BaseModel):
    model_config = ConfigDict(extra="ignore")
    id: str
    name: str
    username: str
    role: str
    company_id: Optional[str] = None
    email: Optional[str] = None
    created_at: str


# --- Admin Management ---
@router.get("/admins", response_model=List[AdminResponse])
async def get_admins(company_id: Optional[str] = None):
    if company_id:
        query = {"company_id": company_id}
    else:
        query = {"role": {"$ne": "systemadmin"}}
    admins = await db.admins.find(query, {"_id": 0, "password": 0}).to_list(100)
    return admins


@router.post("/admins")
async def create_admin(data: AdminCreate):
    existing = await db.admins.find_one({"username": data.username})
    if existing:
        raise HTTPException(status_code=400, detail="Bu kullanıcı adı zaten kullanılıyor")
    
    admin = {
        "id": str(uuid.uuid4()),
        "name": format_name(data.name),
        "username": data.username,
        "password": hash_password(data.password),
        "role": "admin",
        "company_id": data.company_id,
        "created_at": datetime.now(timezone.utc).isoformat()
    }
    await db.admins.insert_one(admin)
    return {"message": "Yönetici oluşturuldu", "id": admin["id"]}


@router.post("/admins/superadmin")
async def create_superadmin(data: SuperAdminCreate):
    existing_super = await db.admins.find_one({"company_id": data.company_id, "role": "superadmin"})
    if existing_super:
        raise HTTPException(status_code=400, detail="Bu şirketin zaten bir süper admini var")
    
    existing = await db.admins.find_one({"username": data.username})
    if existing:
        raise HTTPException(status_code=400, detail="Bu kullanıcı adı zaten kullanılıyor")
    
    admin = {
        "id": str(uuid.uuid4()),
        "name": format_name(data.name),
        "username": data.username,
        "password": hash_password(data.password),
        "role": "superadmin",
        "company_id": data.company_id,
        "email": data.email,
        "created_at": datetime.now(timezone.utc).isoformat()
    }
    await db.admins.insert_one(admin)
    return {"message": "Süper admin oluşturuldu", "id": admin["id"]}


@router.delete("/admins/{admin_id}")
async def delete_admin(admin_id: str):
    admin = await db.admins.find_one({"id": admin_id})
    if not admin:
        raise HTTPException(status_code=404, detail="Yönetici bulunamadı")
    if admin["role"] == "systemadmin":
        raise HTTPException(status_code=403, detail="Sistem yöneticisi silinemez")
    await db.admins.delete_one({"id": admin_id})
    return {"message": "Yönetici silindi"}


@router.put("/admins/{admin_id}")
async def update_admin(admin_id: str, data: AdminUpdate):
    admin = await db.admins.find_one({"id": admin_id})
    if not admin:
        raise HTTPException(status_code=404, detail="Yönetici bulunamadı")
    if admin["role"] == "systemadmin":
        raise HTTPException(status_code=403, detail="Sistem yöneticisi düzenlenemez")
    
    update_data = {}
    if data.name:
        update_data["name"] = format_name(data.name)
    if data.password:
        update_data["password"] = hash_password(data.password)
    if data.email is not None:
        update_data["email"] = data.email
    
    if not update_data:
        raise HTTPException(status_code=400, detail="Güncellenecek veri yok")
    
    await db.admins.update_one({"id": admin_id}, {"$set": update_data})
    
    return {"message": "Yönetici güncellendi", "password_changed": bool(data.password)}
