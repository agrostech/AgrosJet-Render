from fastapi import APIRouter, HTTPException, Request
from pydantic import BaseModel
from datetime import datetime, timezone
import uuid

from utils.database import db
from utils.helpers import hash_password, format_name
from utils.rate_limit import limiter

router = APIRouter(prefix="/api/auth", tags=["Auth"])


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
    # Telefon numarası doğrulaması
    phone = data.phone.strip()
    
    # Başında 0 yoksa ekle
    if not phone.startswith("0"):
        phone = "0" + phone
    
    # 11 haneli olmalı
    if len(phone) != 11:
        raise HTTPException(status_code=400, detail="Telefon numarası 11 haneli olmalıdır (örn: 05527370032)")
    
    # Sadece rakam olmalı
    if not phone.isdigit():
        raise HTTPException(status_code=400, detail="Telefon numarası sadece rakam içermelidir")
    
    # 05 ile başlamalı (Türkiye mobil)
    if not phone.startswith("05"):
        raise HTTPException(status_code=400, detail="Geçerli bir cep telefonu numarası giriniz (05 ile başlamalı)")
    
    existing = await db.couriers.find_one({"phone": phone})
    if existing:
        raise HTTPException(status_code=400, detail="Bu telefon numarası zaten kayıtlı")
    
    courier = {
        "id": str(uuid.uuid4()),
        "name": format_name(data.name),
        "phone": phone,
        "address": data.address,
        "iban": data.iban,
        "plate": data.plate.upper(),
        "password": hash_password(data.password),
        "status": "active",
        "created_at": get_turkey_now()
    }
    await db.couriers.insert_one(courier)
    return {"message": "Kayıt başarılı.", "id": courier["id"]}


@router.post("/courier/login")
async def login_courier(data: CourierLogin):
    # Telefon numarasını normalize et
    phone = data.phone.strip()
    if not phone.startswith("0"):
        phone = "0" + phone
    
    courier = await db.couriers.find_one({"phone": phone}, {"_id": 0})
    if not courier or courier["password"] != hash_password(data.password):
        raise HTTPException(status_code=401, detail="Geçersiz telefon veya şifre")
    
    # Kurye tablosundaki pasif kontrolü
    if courier.get("is_active") == False:
        raise HTTPException(status_code=403, detail="Hesabınız pasif durumda. Yöneticinizle iletişime geçin.")
    
    # Get companies this courier belongs to
    # Status can be "approved" or "active" depending on when the relation was created
    company_relations = await db.company_couriers.find(
        {"courier_id": courier["id"], "status": {"$in": ["approved", "active"]}}, 
        {"_id": 0}
    ).to_list(100)
    
    # Tüm şirketlerde pasif mi kontrol et
    active_in_any_company = False
    companies = []
    for rel in company_relations:
        # Pasif değilse şirketi ekle
        if rel.get("is_active") != False:
            company = await db.companies.find_one({"id": rel["company_id"]}, {"_id": 0})
            if company:
                companies.append(company)
                active_in_any_company = True
    
    # Hiçbir şirkette aktif değilse giriş engelle
    if not active_in_any_company and len(company_relations) > 0:
        raise HTTPException(status_code=403, detail="Hesabınız pasif durumda. Yöneticinizle iletişime geçin.")
    
    return {
        "id": courier["id"],
        "name": courier["name"],
        "phone": courier["phone"],
        "role": "courier",
        "companies": companies
    }


@router.get("/courier/{courier_id}/check-status")
async def check_courier_status(courier_id: str, company_id: str = None):
    """Kurye durumunu kontrol et - pasif mi, logout edilmeli mi"""
    # company_couriers'dan kontrol et
    query = {"courier_id": courier_id}
    if company_id:
        query["company_id"] = company_id
    
    relations = await db.company_couriers.find(query, {"_id": 0}).to_list(100)
    
    # Herhangi birinde pasif mi?
    for rel in relations:
        if rel.get("is_active") == False:
            return {
                "should_logout": True,
                "reason": "Hesabınız pasif durumda",
                "forced_logout_at": rel.get("forced_logout_at")
            }
    
    return {"should_logout": False}


# --- Admin Auth ---
@router.post("/admin/login")
async def login_admin(data: AdminLogin):
    admin = await db.admins.find_one({"username": data.username}, {"_id": 0})
    if not admin or admin["password"] != hash_password(data.password):
        raise HTTPException(status_code=401, detail="Geçersiz kullanıcı adı veya şifre")
    
    # Get company_ids array (for multi-company access)
    company_ids = admin.get("company_ids", [])
    
    # If no company_ids array, fall back to single company_id
    if not company_ids and admin.get("company_id"):
        company_ids = [admin["company_id"]]
    
    # Get primary company (first in list or single company_id)
    primary_company_id = company_ids[0] if company_ids else admin.get("company_id")
    
    company = None
    if primary_company_id:
        company = await db.companies.find_one({"id": primary_company_id}, {"_id": 0})
    
    # Fetch all accessible companies
    accessible_companies = []
    if company_ids:
        companies_cursor = db.companies.find({"id": {"$in": company_ids}}, {"_id": 0, "id": 1, "name": 1, "logo_url": 1})
        accessible_companies = await companies_cursor.to_list(100)
    
    # Simple permission keys
    simple_keys = {"vardiya", "muhasebe", "zimmet", "kuryeler", "market", "akademi", "sistem"}
    
    # Get permissions and check if they use the new simple format
    db_permissions = admin.get("permissions", {})
    has_simple_format = any(key in db_permissions for key in simple_keys)
    
    if has_simple_format:
        # Extract only simple keys from permissions
        permissions = {k: db_permissions.get(k, False) for k in simple_keys}
    else:
        # No simple format found, assign defaults
        if admin["role"] == "superadmin":
            permissions = {
                "vardiya": True, "muhasebe": True, "zimmet": True,
                "kuryeler": True, "market": True, "akademi": True, "sistem": True
            }
        else:
            permissions = {
                "vardiya": True, "muhasebe": True, "zimmet": True,
                "kuryeler": True, "market": True, "akademi": True, "sistem": False
            }
    
    # Determine super admin status: either is_super_admin flag or role is superadmin
    is_super = admin.get("is_super_admin", False) or admin.get("role") == "superadmin"
    is_system = admin.get("is_system_admin", False)
    
    return {
        "id": admin["id"],
        "name": admin["name"],
        "username": admin["username"],
        "role": "superadmin" if is_super else admin["role"],
        "is_super_admin": is_super,
        "is_system_admin": is_system,
        "permissions": permissions,
        "permissions_updated_at": admin.get("permissions_updated_at"),
        "company_id": primary_company_id,
        "company_ids": company_ids,
        "company": company,
        "accessible_companies": accessible_companies,
        "email": admin.get("email")
    }


@router.put("/admin/{admin_id}/companies")
async def update_admin_companies(admin_id: str, company_ids: list[str]):
    """Update the list of companies an admin can access (superadmin only)"""
    admin = await db.admins.find_one({"id": admin_id}, {"_id": 0})
    if not admin:
        raise HTTPException(status_code=404, detail="Admin bulunamadı")
    
    # Validate all company_ids exist
    for cid in company_ids:
        company = await db.companies.find_one({"id": cid}, {"_id": 0, "id": 1})
        if not company:
            raise HTTPException(status_code=400, detail=f"Şirket bulunamadı: {cid}")
    
    # Update admin with new company_ids
    primary_company_id = company_ids[0] if company_ids else None
    await db.admins.update_one(
        {"id": admin_id},
        {"$set": {
            "company_ids": company_ids,
            "company_id": primary_company_id
        }}
    )
    
    return {"message": "Şirketler güncellendi", "company_ids": company_ids}


@router.get("/check-permissions/{admin_id}")
async def check_permissions_update(admin_id: str, timestamp: str = None):
    """Admin izinlerinin güncellenip güncellenmediğini kontrol et"""
    admin = await db.admins.find_one({"id": admin_id}, {"_id": 0, "permissions_updated_at": 1})
    if not admin:
        raise HTTPException(status_code=404, detail="Admin bulunamadı")
    
    current_timestamp = admin.get("permissions_updated_at")
    
    # Eğer timestamp verilmişse ve farklıysa, izinler güncellenmiş demektir
    if timestamp and current_timestamp and timestamp != current_timestamp:
        return {"updated": True, "new_timestamp": current_timestamp}
    
    return {"updated": False, "current_timestamp": current_timestamp}
