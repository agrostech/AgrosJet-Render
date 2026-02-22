from fastapi import APIRouter, HTTPException
from pydantic import BaseModel, ConfigDict
from typing import List, Optional, Dict
from datetime import datetime, timezone
import uuid

from utils.database import db
from utils.helpers import hash_password, format_name

router = APIRouter(prefix="/api", tags=["Admins"])


# --- Default Permissions ---
def get_default_permissions() -> Dict[str, bool]:
    """Yeni admin için varsayılan izinler"""
    return {
        "vardiya": True,
        "muhasebe": True,
        "zimmet": True,
        "kuryeler": True,
        "market": True,
        "akademi": True,
        "sistem": False,  # Varsayılan kapalı
    }


def get_full_permissions() -> Dict[str, bool]:
    """Superadmin için tüm izinler"""
    return {
        "vardiya": True,
        "muhasebe": True,
        "zimmet": True,
        "kuryeler": True,
        "market": True,
        "akademi": True,
        "sistem": True,
    }


# --- Pydantic Models ---
class AdminCreate(BaseModel):
    name: str
    username: str
    password: str
    company_id: Optional[str] = None
    company_ids: Optional[List[str]] = None
    role: Optional[str] = "admin"


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
    linked_courier_id: Optional[str] = None
    hourly_rate: Optional[float] = None


class PermissionsUpdate(BaseModel):
    permissions: Dict[str, bool]


class AdminResponse(BaseModel):
    model_config = ConfigDict(extra="ignore")
    id: str
    name: str
    username: str
    role: str
    permissions: Optional[Dict[str, bool]] = None
    company_id: Optional[str] = None
    company_ids: Optional[List[str]] = None
    email: Optional[str] = None
    created_at: str


# --- Admin Management ---
@router.get("/admins/all", response_model=List[AdminResponse])
async def get_all_admins():
    """Tüm adminleri getir (systemadmin hariç) - Sistem paneli için"""
    admins = await db.admins.find(
        {"role": {"$ne": "systemadmin"}}, 
        {"_id": 0, "password": 0}
    ).to_list(500)
    
    # Simple permission keys
    simple_keys = {"vardiya", "muhasebe", "zimmet", "kuryeler", "market", "akademi", "sistem"}
    
    # Normalize permissions to simple format
    for admin in admins:
        db_permissions = admin.get("permissions", {})
        has_simple_format = any(key in db_permissions for key in simple_keys)
        
        if has_simple_format:
            admin["permissions"] = {k: db_permissions.get(k, False) for k in simple_keys}
        else:
            if admin.get("role") == "superadmin":
                admin["permissions"] = get_full_permissions()
            else:
                admin["permissions"] = get_default_permissions()
    
    return admins


@router.get("/admins", response_model=List[AdminResponse])
async def get_admins(company_id: Optional[str] = None):
    if company_id:
        query = {"company_id": company_id}
    else:
        query = {"role": {"$ne": "systemadmin"}}
    admins = await db.admins.find(query, {"_id": 0, "password": 0}).to_list(100)
    
    # Simple permission keys
    simple_keys = {"vardiya", "muhasebe", "zimmet", "kuryeler", "market", "akademi", "sistem"}
    
    # Normalize permissions to simple format
    for admin in admins:
        db_permissions = admin.get("permissions", {})
        has_simple_format = any(key in db_permissions for key in simple_keys)
        
        if has_simple_format:
            # Extract only simple keys
            admin["permissions"] = {k: db_permissions.get(k, False) for k in simple_keys}
        else:
            # No simple format, assign defaults
            if admin.get("role") == "superadmin":
                admin["permissions"] = get_full_permissions()
            else:
                admin["permissions"] = get_default_permissions()
    
    return admins


@router.post("/admins")
async def create_admin(data: AdminCreate):
    existing = await db.admins.find_one({"username": data.username})
    if existing:
        raise HTTPException(status_code=400, detail="Bu kullanıcı adı zaten kullanılıyor")
    
    # Handle company_ids
    company_ids = data.company_ids or []
    if data.company_id and data.company_id not in company_ids:
        company_ids.insert(0, data.company_id)
    
    primary_company_id = company_ids[0] if company_ids else None
    
    # Determine role and permissions
    role = data.role if data.role in ["admin", "superadmin"] else "admin"
    permissions = get_full_permissions() if role == "superadmin" else get_default_permissions()
    
    admin = {
        "id": str(uuid.uuid4()),
        "name": format_name(data.name),
        "username": data.username,
        "password": hash_password(data.password),
        "role": role,
        "permissions": permissions,
        "company_id": primary_company_id,
        "company_ids": company_ids,
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
        "permissions": get_full_permissions(),
        "company_id": data.company_id,
        "email": data.email,
        "created_at": datetime.now(timezone.utc).isoformat()
    }
    await db.admins.insert_one(admin)
    return {"message": "Süper admin oluşturuldu", "id": admin["id"]}


@router.put("/admins/{admin_id}/permissions")
async def update_admin_permissions(admin_id: str, data: PermissionsUpdate):
    """Admin izinlerini güncelle"""
    admin = await db.admins.find_one({"id": admin_id})
    if not admin:
        raise HTTPException(status_code=404, detail="Yönetici bulunamadı")
    if admin["role"] != "admin":
        raise HTTPException(status_code=400, detail="Sadece admin izinleri güncellenebilir")
    
    # Sadece geçerli izin anahtarlarını kabul et
    valid_keys = {"vardiya", "muhasebe", "zimmet", "kuryeler", "market", "akademi", "sistem"}
    filtered_permissions = {k: v for k, v in data.permissions.items() if k in valid_keys}
    
    # İzin güncellendiğinde timestamp kaydet (otomatik çıkış için)
    await db.admins.update_one(
        {"id": admin_id},
        {"$set": {
            "permissions": filtered_permissions,
            "permissions_updated_at": datetime.now(timezone.utc).isoformat()
        }}
    )
    return {"message": "İzinler güncellendi"}


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
