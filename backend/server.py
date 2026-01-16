from fastapi import FastAPI, APIRouter, HTTPException
from fastapi.responses import Response
from dotenv import load_dotenv
from starlette.middleware.cors import CORSMiddleware
from motor.motor_asyncio import AsyncIOMotorClient
import os
import logging
from pathlib import Path
from pydantic import BaseModel, Field, ConfigDict
from typing import List, Optional
import uuid
from datetime import datetime, timezone
import hashlib
import httpx

ROOT_DIR = Path(__file__).parent
load_dotenv(ROOT_DIR / '.env')

mongo_url = os.environ['MONGO_URL']
client = AsyncIOMotorClient(mongo_url)
db = client[os.environ['DB_NAME']]

app = FastAPI()
api_router = APIRouter(prefix="/api")

# Helper functions
def hash_password(password: str) -> str:
    return hashlib.sha256(password.encode()).hexdigest()

def format_name(name: str) -> str:
    return ' '.join(word.capitalize() for word in name.strip().split())

# Models
class CompanyCreate(BaseModel):
    name: str
    logo_url: Optional[str] = ""

class CompanyUpdate(BaseModel):
    name: Optional[str] = None
    logo_url: Optional[str] = None

class CompanyResponse(BaseModel):
    model_config = ConfigDict(extra="ignore")
    id: str
    name: str
    logo_url: str
    created_at: str

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

class PermissionUpdate(BaseModel):
    permissions: dict

class AddCourierToCompany(BaseModel):
    phone: str

class CourierResponse(BaseModel):
    model_config = ConfigDict(extra="ignore")
    id: str
    name: str
    phone: str
    address: str
    iban: str
    plate: str
    status: str
    created_at: str

class AdminResponse(BaseModel):
    model_config = ConfigDict(extra="ignore")
    id: str
    name: str
    username: str
    role: str
    permissions: dict
    company_id: Optional[str] = None
    created_at: str

# Initialize system admin on startup
@app.on_event("startup")
async def startup_event():
    existing = await db.admins.find_one({"username": "systemadmin", "role": "systemadmin"})
    if not existing:
        system_admin = {
            "id": str(uuid.uuid4()),
            "name": "Sistem Yöneticisi",
            "username": "systemadmin",
            "password": hash_password("System123!"),
            "role": "systemadmin",
            "permissions": {},
            "company_id": None,
            "created_at": datetime.now(timezone.utc).isoformat()
        }
        await db.admins.insert_one(system_admin)
        logging.info("System admin created: systemadmin / System123!")

# ==================== COMPANY ROUTES ====================
@api_router.get("/companies", response_model=List[CompanyResponse])
async def get_companies():
    companies = await db.companies.find({}, {"_id": 0}).to_list(100)
    return companies

@api_router.get("/companies/{company_id}", response_model=CompanyResponse)
async def get_company(company_id: str):
    company = await db.companies.find_one({"id": company_id}, {"_id": 0})
    if not company:
        raise HTTPException(status_code=404, detail="Şirket bulunamadı")
    return company

@api_router.post("/companies")
async def create_company(data: CompanyCreate):
    company = {
        "id": str(uuid.uuid4()),
        "name": data.name,
        "logo_url": data.logo_url or "",
        "created_at": datetime.now(timezone.utc).isoformat()
    }
    await db.companies.insert_one(company)
    return {"message": "Şirket oluşturuldu", "id": company["id"], "name": company["name"]}

@api_router.put("/companies/{company_id}")
async def update_company(company_id: str, data: CompanyUpdate):
    update_data = {}
    if data.name is not None:
        update_data["name"] = data.name
    if data.logo_url is not None:
        update_data["logo_url"] = data.logo_url
    
    if not update_data:
        raise HTTPException(status_code=400, detail="Güncellenecek veri yok")
    
    result = await db.companies.update_one({"id": company_id}, {"$set": update_data})
    if result.modified_count == 0:
        raise HTTPException(status_code=404, detail="Şirket bulunamadı")
    return {"message": "Şirket güncellendi"}

@api_router.delete("/companies/{company_id}")
async def delete_company(company_id: str):
    await db.companies.delete_one({"id": company_id})
    await db.company_couriers.delete_many({"company_id": company_id})
    await db.admins.delete_many({"company_id": company_id})
    return {"message": "Şirket ve tüm verileri silindi"}

# ==================== AUTH ROUTES ====================
@api_router.post("/auth/courier/register")
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

@api_router.post("/auth/courier/login")
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

@api_router.post("/auth/admin/login")
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
        "company": company
    }

# ==================== COURIER MANAGEMENT ====================
@api_router.get("/couriers")
async def get_all_couriers():
    """Get all couriers in the system (for system admin)"""
    couriers = await db.couriers.find({}, {"_id": 0, "password": 0}).to_list(1000)
    return couriers

@api_router.get("/couriers/search")
async def search_courier(phone: str):
    """Search courier by phone number"""
    courier = await db.couriers.find_one({"phone": phone}, {"_id": 0, "password": 0})
    if not courier:
        raise HTTPException(status_code=404, detail="Kurye bulunamadı")
    return courier

@api_router.get("/companies/{company_id}/couriers")
async def get_company_couriers(company_id: str, include_archived: bool = False):
    """Get couriers assigned to a specific company"""
    query = {"company_id": company_id}
    if not include_archived:
        query["is_archived"] = {"$ne": True}
    relations = await db.company_couriers.find(query, {"_id": 0}).to_list(1000)
    
    couriers = []
    for rel in relations:
        courier = await db.couriers.find_one({"id": rel["courier_id"]}, {"_id": 0, "password": 0})
        if courier:
            courier["company_status"] = rel["status"]
            courier["is_archived"] = rel.get("is_archived", False)
            couriers.append(courier)
    
    return couriers

@api_router.post("/companies/{company_id}/couriers")
async def add_courier_to_company(company_id: str, data: AddCourierToCompany):
    """Add a courier to company by phone number"""
    company = await db.companies.find_one({"id": company_id})
    if not company:
        raise HTTPException(status_code=404, detail="Şirket bulunamadı")
    
    courier = await db.couriers.find_one({"phone": data.phone})
    if not courier:
        raise HTTPException(status_code=404, detail="Bu telefon numarasına ait kurye bulunamadı")
    
    existing = await db.company_couriers.find_one({
        "company_id": company_id,
        "courier_id": courier["id"]
    })
    if existing:
        # Eğer arşivlenmişse, arşivden çıkar
        if existing.get("is_archived"):
            await db.company_couriers.update_one(
                {"id": existing["id"]},
                {"$set": {"is_archived": False}}
            )
            return {"message": "Kurye arşivden çıkarıldı ve tekrar eklendi", "courier_name": courier["name"]}
        raise HTTPException(status_code=400, detail="Bu kurye zaten şirketinize ekli")
    
    relation = {
        "id": str(uuid.uuid4()),
        "company_id": company_id,
        "courier_id": courier["id"],
        "status": "approved",
        "is_archived": False,
        "created_at": datetime.now(timezone.utc).isoformat()
    }
    await db.company_couriers.insert_one(relation)
    return {"message": "Kurye şirkete eklendi", "courier_name": courier["name"]}

class CourierUpdate(BaseModel):
    name: Optional[str] = None
    phone: Optional[str] = None
    plate: Optional[str] = None
    address: Optional[str] = None
    password: Optional[str] = None

@api_router.put("/couriers/{courier_id}")
async def update_courier(courier_id: str, data: CourierUpdate):
    """Update courier info (by Super Admin)"""
    courier = await db.couriers.find_one({"id": courier_id})
    if not courier:
        raise HTTPException(status_code=404, detail="Kurye bulunamadı")
    
    update_data = {}
    if data.name:
        update_data["name"] = format_name(data.name)
    if data.phone:
        # Check phone uniqueness
        existing = await db.couriers.find_one({"phone": data.phone})
        if existing and existing["id"] != courier_id:
            raise HTTPException(status_code=400, detail="Bu telefon numarası başka bir kurye tarafından kullanılıyor")
        update_data["phone"] = data.phone
    if data.plate:
        update_data["plate"] = data.plate.upper()
    if data.address is not None:
        update_data["address"] = data.address
    if data.password:
        update_data["password"] = hash_password(data.password)
    
    if not update_data:
        raise HTTPException(status_code=400, detail="Güncellenecek veri yok")
    
    await db.couriers.update_one({"id": courier_id}, {"$set": update_data})
    
    # Şifre değiştiyse session invalidate et
    if data.password:
        await invalidate_user_session(courier_id)
    
    return {"message": "Kurye güncellendi", "password_changed": bool(data.password)}

@api_router.put("/companies/{company_id}/couriers/{courier_id}/archive")
async def archive_company_courier(company_id: str, courier_id: str):
    """Archive a courier from company"""
    result = await db.company_couriers.update_one(
        {"company_id": company_id, "courier_id": courier_id},
        {"$set": {"is_archived": True}}
    )
    if result.matched_count == 0:
        raise HTTPException(status_code=404, detail="Kayıt bulunamadı")
    return {"message": "Kurye arşivlendi"}

@api_router.put("/companies/{company_id}/couriers/{courier_id}/unarchive")
async def unarchive_company_courier(company_id: str, courier_id: str):
    """Unarchive a courier from company"""
    result = await db.company_couriers.update_one(
        {"company_id": company_id, "courier_id": courier_id},
        {"$set": {"is_archived": False}}
    )
    if result.matched_count == 0:
        raise HTTPException(status_code=404, detail="Kayıt bulunamadı")
    return {"message": "Kurye arşivden çıkarıldı"}

@api_router.put("/companies/{company_id}/couriers/{courier_id}/approve")
async def approve_company_courier(company_id: str, courier_id: str):
    result = await db.company_couriers.update_one(
        {"company_id": company_id, "courier_id": courier_id},
        {"$set": {"status": "approved"}}
    )
    if result.modified_count == 0:
        raise HTTPException(status_code=404, detail="Kayıt bulunamadı")
    return {"message": "Kurye onaylandı"}

@api_router.put("/companies/{company_id}/couriers/{courier_id}/reject")
async def reject_company_courier(company_id: str, courier_id: str):
    result = await db.company_couriers.update_one(
        {"company_id": company_id, "courier_id": courier_id},
        {"$set": {"status": "rejected"}}
    )
    if result.modified_count == 0:
        raise HTTPException(status_code=404, detail="Kayıt bulunamadı")
    return {"message": "Kurye reddedildi"}

@api_router.delete("/companies/{company_id}/couriers/{courier_id}")
async def remove_courier_from_company(company_id: str, courier_id: str):
    # Zimmet kontrolü - kuryede zimmetli ürün var mı?
    assigned_products = await db.products.find({
        "company_id": company_id,
        "assigned_to_courier_id": courier_id
    }).to_list(100)
    
    if assigned_products:
        product_names = ", ".join([p["name"] for p in assigned_products[:3]])
        if len(assigned_products) > 3:
            product_names += f" ve {len(assigned_products) - 3} ürün daha"
        raise HTTPException(
            status_code=400, 
            detail=f"Bu kuryede {len(assigned_products)} zimmetli ürün var: {product_names}. Önce zimmetleri geri alın."
        )
    
    result = await db.company_couriers.delete_one({
        "company_id": company_id,
        "courier_id": courier_id
    })
    if result.deleted_count == 0:
        raise HTTPException(status_code=404, detail="Kayıt bulunamadı")
    return {"message": "Kurye şirketten çıkarıldı"}

@api_router.delete("/couriers/{courier_id}")
async def delete_courier(courier_id: str):
    """Delete courier completely (system admin only)"""
    # Zimmet kontrolü - kuryede zimmetli ürün var mı?
    assigned_products = await db.products.find({
        "assigned_to_courier_id": courier_id
    }).to_list(100)
    
    if assigned_products:
        product_names = ", ".join([p["name"] for p in assigned_products[:3]])
        if len(assigned_products) > 3:
            product_names += f" ve {len(assigned_products) - 3} ürün daha"
        raise HTTPException(
            status_code=400, 
            detail=f"Bu kuryede {len(assigned_products)} zimmetli ürün var: {product_names}. Önce zimmetleri geri alın."
        )
    
    result = await db.couriers.delete_one({"id": courier_id})
    if result.deleted_count == 0:
        raise HTTPException(status_code=404, detail="Kurye bulunamadı")
    await db.company_couriers.delete_many({"courier_id": courier_id})
    return {"message": "Kurye silindi"}

# ==================== ADMIN MANAGEMENT ====================
@api_router.get("/admins", response_model=List[AdminResponse])
async def get_admins(company_id: Optional[str] = None):
    if company_id:
        query = {"company_id": company_id}
    else:
        query = {"role": {"$ne": "systemadmin"}}
    admins = await db.admins.find(query, {"_id": 0, "password": 0}).to_list(100)
    return admins

@api_router.post("/admins")
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
        "permissions": {
            "vardiya": True,
            "muhasebe": True,
            "zimmet": True,
            "kuryeler": True,
            "yoneticiler": False
        },
        "company_id": data.company_id,
        "created_at": datetime.now(timezone.utc).isoformat()
    }
    await db.admins.insert_one(admin)
    return {"message": "Yönetici oluşturuldu", "id": admin["id"]}

@api_router.post("/admins/superadmin")
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
        "permissions": {
            "vardiya": True,
            "muhasebe": True,
            "zimmet": True,
            "kuryeler": True,
            "yoneticiler": True
        },
        "company_id": data.company_id,
        "created_at": datetime.now(timezone.utc).isoformat()
    }
    await db.admins.insert_one(admin)
    return {"message": "Süper admin oluşturuldu", "id": admin["id"]}

@api_router.put("/admins/{admin_id}/permissions")
async def update_admin_permissions(admin_id: str, data: PermissionUpdate):
    result = await db.admins.update_one(
        {"id": admin_id, "role": "admin"},
        {"$set": {"permissions": data.permissions}}
    )
    if result.modified_count == 0:
        raise HTTPException(status_code=404, detail="Yönetici bulunamadı veya güncellenemedi")
    return {"message": "Yetkiler güncellendi"}

@api_router.delete("/admins/{admin_id}")
async def delete_admin(admin_id: str):
    admin = await db.admins.find_one({"id": admin_id})
    if not admin:
        raise HTTPException(status_code=404, detail="Yönetici bulunamadı")
    if admin["role"] == "systemadmin":
        raise HTTPException(status_code=403, detail="Sistem yöneticisi silinemez")
    await db.admins.delete_one({"id": admin_id})
    # Session invalidate et (silinen kullanıcı aktif oturumdaysa çıkış yapsın)
    await db.invalidated_sessions.update_one(
        {"user_id": admin_id},
        {"$set": {
            "user_id": admin_id,
            "invalidated_at": datetime.now(timezone.utc).isoformat(),
            "reason": "user_deleted"
        }},
        upsert=True
    )
    return {"message": "Yönetici silindi", "invalidated_user_id": admin_id}

class AdminUpdate(BaseModel):
    name: Optional[str] = None
    password: Optional[str] = None

class ProfileUpdate(BaseModel):
    username: Optional[str] = None
    password: Optional[str] = None
    current_password: str  # Mevcut şifre doğrulaması için

@api_router.put("/admins/{admin_id}")
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
    
    if not update_data:
        raise HTTPException(status_code=400, detail="Güncellenecek veri yok")
    
    await db.admins.update_one({"id": admin_id}, {"$set": update_data})
    
    # Şifre değiştiyse session invalidate et
    if data.password:
        await invalidate_user_session(admin_id)
    
    return {"message": "Yönetici güncellendi", "password_changed": bool(data.password)}

# ==================== PROFILE MANAGEMENT ====================
async def invalidate_user_session(user_id: str):
    """Kullanıcının oturumunu geçersiz kıl"""
    await db.invalidated_sessions.update_one(
        {"user_id": user_id},
        {"$set": {
            "user_id": user_id,
            "invalidated_at": datetime.now(timezone.utc).isoformat()
        }},
        upsert=True
    )

@api_router.put("/profile/{admin_id}")
async def update_own_profile(admin_id: str, data: ProfileUpdate):
    """Admin kendi profilini günceller"""
    admin = await db.admins.find_one({"id": admin_id})
    if not admin:
        raise HTTPException(status_code=404, detail="Yönetici bulunamadı")
    
    # Mevcut şifre doğrulaması
    if admin["password"] != hash_password(data.current_password):
        raise HTTPException(status_code=401, detail="Mevcut şifre yanlış")
    
    update_data = {}
    requires_relogin = False
    
    if data.username and data.username != admin["username"]:
        # Kullanıcı adı benzersizliği kontrolü
        existing = await db.admins.find_one({"username": data.username})
        if existing and existing["id"] != admin_id:
            raise HTTPException(status_code=400, detail="Bu kullanıcı adı zaten kullanılıyor")
        update_data["username"] = data.username
        requires_relogin = True
    
    if data.password:
        update_data["password"] = hash_password(data.password)
        requires_relogin = True
    
    if not update_data:
        raise HTTPException(status_code=400, detail="Güncellenecek veri yok")
    
    await db.admins.update_one({"id": admin_id}, {"$set": update_data})
    
    # Kullanıcı adı veya şifre değiştiyse session invalidate et
    if requires_relogin:
        await invalidate_user_session(admin_id)
    
    return {
        "message": "Profil güncellendi",
        "requires_relogin": requires_relogin,
        "new_username": data.username if data.username else admin["username"]
    }

@api_router.get("/session/check/{user_id}")
async def check_session_valid(user_id: str):
    """Kullanıcı oturumunun geçerli olup olmadığını kontrol et"""
    # Kullanıcı hala mevcut mu?
    admin = await db.admins.find_one({"id": user_id})
    courier = await db.couriers.find_one({"id": user_id})
    
    if not admin and not courier:
        return {"valid": False, "reason": "user_deleted"}
    
    # Session invalidate edilmiş mi?
    invalidated = await db.invalidated_sessions.find_one({"user_id": user_id})
    if invalidated:
        return {
            "valid": False, 
            "reason": "session_invalidated",
            "invalidated_at": invalidated["invalidated_at"]
        }
    
    return {"valid": True}

@api_router.delete("/session/invalidation/{user_id}")
async def clear_session_invalidation(user_id: str):
    """Kullanıcı yeniden giriş yaptıktan sonra invalidation kaydını temizle"""
    await db.invalidated_sessions.delete_one({"user_id": user_id})
    return {"message": "Invalidation cleared"}

# ==================== SHIFT (VARDIYA) MANAGEMENT ====================
class ShiftCreate(BaseModel):
    name: str  # e.g., "11:00 - 23:00"
    start_time: str  # e.g., "11:00"
    end_time: str  # e.g., "23:00"
    company_id: str

class ShiftUpdate(BaseModel):
    name: Optional[str] = None
    start_time: Optional[str] = None
    end_time: Optional[str] = None

class ShiftAssignment(BaseModel):
    courier_id: str
    day: str  # "pazartesi", "sali", "carsamba", "persembe", "cuma", "cumartesi", "pazar"

class LeaveAssignment(BaseModel):
    courier_id: str
    day: str

@api_router.get("/companies/{company_id}/shifts")
async def get_company_shifts(company_id: str):
    """Get all shifts for a company"""
    shifts = await db.shifts.find({"company_id": company_id}, {"_id": 0}).to_list(100)
    
    # Sort by start_time with day starting at 06:00
    # Times before 06:00 are considered "end of day" and sorted last
    def shift_sort_key(shift):
        start_time = shift.get("start_time", "00:00")
        hour = int(start_time.split(":")[0])
        minute = int(start_time.split(":")[1]) if len(start_time.split(":")) > 1 else 0
        # If hour is before 06:00, add 24 to sort at the end
        if hour < 6:
            hour += 24
        return hour * 60 + minute
    
    shifts.sort(key=shift_sort_key)
    return shifts

@api_router.post("/companies/{company_id}/shifts")
async def create_shift(company_id: str, data: ShiftCreate):
    """Create a new shift for a company"""
    shift = {
        "id": str(uuid.uuid4()),
        "name": data.name,
        "start_time": data.start_time,
        "end_time": data.end_time,
        "company_id": company_id,
        "created_at": datetime.now(timezone.utc).isoformat()
    }
    await db.shifts.insert_one(shift)
    return {"message": "Vardiya oluşturuldu", "id": shift["id"]}

@api_router.put("/shifts/{shift_id}")
async def update_shift(shift_id: str, data: ShiftUpdate):
    """Update a shift"""
    update_data = {}
    if data.name is not None:
        update_data["name"] = data.name
    if data.start_time is not None:
        update_data["start_time"] = data.start_time
    if data.end_time is not None:
        update_data["end_time"] = data.end_time
    
    if not update_data:
        raise HTTPException(status_code=400, detail="Güncellenecek veri yok")
    
    result = await db.shifts.update_one({"id": shift_id}, {"$set": update_data})
    if result.modified_count == 0:
        raise HTTPException(status_code=404, detail="Vardiya bulunamadı")
    return {"message": "Vardiya güncellendi"}

@api_router.delete("/shifts/{shift_id}")
async def delete_shift(shift_id: str):
    """Delete a shift and all its assignments"""
    result = await db.shifts.delete_one({"id": shift_id})
    if result.deleted_count == 0:
        raise HTTPException(status_code=404, detail="Vardiya bulunamadı")
    # Also delete all assignments for this shift
    await db.shift_assignments.delete_many({"shift_id": shift_id})
    return {"message": "Vardiya silindi"}

@api_router.get("/companies/{company_id}/shift-assignments")
async def get_shift_assignments(company_id: str):
    """Get all shift assignments for a company"""
    assignments = await db.shift_assignments.find({"company_id": company_id}, {"_id": 0}).to_list(1000)
    return assignments

@api_router.post("/shifts/{shift_id}/assign")
async def assign_courier_to_shift(shift_id: str, data: ShiftAssignment):
    """Assign a courier to a shift for a specific day"""
    shift = await db.shifts.find_one({"id": shift_id})
    if not shift:
        raise HTTPException(status_code=404, detail="Vardiya bulunamadı")
    
    courier = await db.couriers.find_one({"id": data.courier_id})
    if not courier:
        raise HTTPException(status_code=404, detail="Kurye bulunamadı")
    
    # Check if already assigned
    existing = await db.shift_assignments.find_one({
        "shift_id": shift_id,
        "courier_id": data.courier_id,
        "day": data.day
    })
    if existing:
        raise HTTPException(status_code=400, detail="Bu kurye zaten bu vardiyaya atanmış")
    
    # Remove courier from leave if on leave for this day
    await db.leaves.delete_one({
        "company_id": shift["company_id"],
        "courier_id": data.courier_id,
        "day": data.day
    })
    
    assignment = {
        "id": str(uuid.uuid4()),
        "shift_id": shift_id,
        "courier_id": data.courier_id,
        "courier_name": courier["name"],
        "day": data.day,
        "company_id": shift["company_id"],
        "created_at": datetime.now(timezone.utc).isoformat()
    }
    await db.shift_assignments.insert_one(assignment)
    return {"message": "Kurye vardiyaya atandı", "id": assignment["id"]}

@api_router.delete("/shift-assignments/{assignment_id}")
async def remove_shift_assignment(assignment_id: str):
    """Remove a courier from a shift"""
    result = await db.shift_assignments.delete_one({"id": assignment_id})
    if result.deleted_count == 0:
        raise HTTPException(status_code=404, detail="Atama bulunamadı")
    return {"message": "Kurye vardiyadan çıkarıldı"}

# Leave (İzin) Management
@api_router.get("/companies/{company_id}/leaves")
async def get_company_leaves(company_id: str):
    """Get all leaves for a company"""
    leaves = await db.leaves.find({"company_id": company_id}, {"_id": 0}).to_list(1000)
    return leaves

@api_router.post("/companies/{company_id}/leaves")
async def add_leave(company_id: str, data: LeaveAssignment):
    """Add a courier to leave for a specific day"""
    courier = await db.couriers.find_one({"id": data.courier_id})
    if not courier:
        raise HTTPException(status_code=404, detail="Kurye bulunamadı")
    
    # Check if already on leave
    existing = await db.leaves.find_one({
        "company_id": company_id,
        "courier_id": data.courier_id,
        "day": data.day
    })
    if existing:
        raise HTTPException(status_code=400, detail="Bu kurye zaten bu gün izinli")
    
    # Remove courier from all shifts for this day when adding to leave
    deleted_result = await db.shift_assignments.delete_many({
        "company_id": company_id,
        "courier_id": data.courier_id,
        "day": data.day
    })
    
    leave = {
        "id": str(uuid.uuid4()),
        "courier_id": data.courier_id,
        "courier_name": courier["name"],
        "day": data.day,
        "company_id": company_id,
        "created_at": datetime.now(timezone.utc).isoformat()
    }
    await db.leaves.insert_one(leave)
    
    removed_count = deleted_result.deleted_count
    if removed_count > 0:
        return {"message": f"İzin eklendi. {removed_count} vardiya ataması kaldırıldı.", "id": leave["id"]}
    return {"message": "İzin eklendi", "id": leave["id"]}

@api_router.delete("/leaves/{leave_id}")
async def remove_leave(leave_id: str):
    """Remove a leave"""
    result = await db.leaves.delete_one({"id": leave_id})
    if result.deleted_count == 0:
        raise HTTPException(status_code=404, detail="İzin bulunamadı")
    return {"message": "İzin kaldırıldı"}

# ==================== MUHASEBE (ACCOUNTING) ====================

# --- Pydantic Models ---
class BusinessCreate(BaseModel):
    name: str
    phone: Optional[str] = None
    address: Optional[str] = None

class VendorCreate(BaseModel):
    name: str
    phone: Optional[str] = None
    address: Optional[str] = None

class TransactionCreate(BaseModel):
    entity_type: str  # "courier", "business", "vendor"
    entity_id: str
    company_id: str
    type: str  # "payment_in" (ödeme al - tahsil), "payment_out" (ödeme yap - borçlandır)
    amount: float
    description: Optional[str] = None
    is_hakedis: Optional[bool] = False
    admin_id: Optional[str] = None
    admin_name: Optional[str] = None
    custom_date: Optional[str] = None

class ActivityLogCreate(BaseModel):
    company_id: str
    admin_id: str
    admin_name: str
    action: str  # "transaction_created", "transaction_deleted"
    entity_type: str  # "courier", "business", "vendor"
    entity_id: str
    entity_name: str
    details: Optional[dict] = None

# --- Activity Logs ---
async def create_activity_log(log_data: dict):
    """Helper to create activity log"""
    log = {
        "id": str(uuid.uuid4()),
        **log_data,
        "created_at": datetime.now(timezone.utc).isoformat()
    }
    await db.activity_logs.insert_one(log)
    return log

@api_router.get("/activity-logs/{company_id}")
async def get_activity_logs(company_id: str, skip: int = 0, limit: int = 10):
    """Get paginated activity logs for a company"""
    total_count = await db.activity_logs.count_documents({"company_id": company_id})
    
    logs = await db.activity_logs.find(
        {"company_id": company_id},
        {"_id": 0}
    ).sort("created_at", -1).skip(skip).limit(limit).to_list(limit)
    
    return {
        "logs": logs,
        "total_count": total_count,
        "has_more": skip + limit < total_count
    }

# --- İşletmeler (Businesses) ---
@api_router.get("/companies/{company_id}/businesses")
async def get_businesses(company_id: str, include_archived: bool = False):
    """Get all businesses for a company"""
    query = {"company_id": company_id}
    if not include_archived:
        query["is_archived"] = {"$ne": True}
    businesses = await db.businesses.find(query, {"_id": 0}).to_list(500)
    return businesses

@api_router.post("/companies/{company_id}/businesses")
async def create_business(company_id: str, data: BusinessCreate):
    """Create a new business"""
    business = {
        "id": str(uuid.uuid4()),
        "name": data.name,
        "phone": data.phone,
        "address": data.address,
        "company_id": company_id,
        "is_archived": False,
        "created_at": datetime.now(timezone.utc).isoformat()
    }
    await db.businesses.insert_one(business)
    return {"message": "İşletme oluşturuldu", "id": business["id"]}

@api_router.put("/businesses/{business_id}/archive")
async def archive_business(business_id: str):
    """Archive a business"""
    result = await db.businesses.update_one(
        {"id": business_id},
        {"$set": {"is_archived": True}}
    )
    if result.matched_count == 0:
        raise HTTPException(status_code=404, detail="İşletme bulunamadı")
    return {"message": "İşletme arşivlendi"}

@api_router.put("/businesses/{business_id}/unarchive")
async def unarchive_business(business_id: str):
    """Unarchive a business"""
    result = await db.businesses.update_one(
        {"id": business_id},
        {"$set": {"is_archived": False}}
    )
    if result.matched_count == 0:
        raise HTTPException(status_code=404, detail="İşletme bulunamadı")
    return {"message": "İşletme arşivden çıkarıldı"}

@api_router.delete("/businesses/{business_id}")
async def delete_business(business_id: str):
    """Delete a business"""
    result = await db.businesses.delete_one({"id": business_id})
    if result.deleted_count == 0:
        raise HTTPException(status_code=404, detail="İşletme bulunamadı")
    return {"message": "İşletme silindi"}

# --- Cariler (Vendors) ---
@api_router.get("/companies/{company_id}/vendors")
async def get_vendors(company_id: str, include_archived: bool = False):
    """Get all vendors for a company"""
    query = {"company_id": company_id}
    if not include_archived:
        query["is_archived"] = {"$ne": True}
    vendors = await db.vendors.find(query, {"_id": 0}).to_list(500)
    return vendors

@api_router.post("/companies/{company_id}/vendors")
async def create_vendor(company_id: str, data: VendorCreate):
    """Create a new vendor"""
    vendor = {
        "id": str(uuid.uuid4()),
        "name": data.name,
        "phone": data.phone,
        "address": data.address,
        "company_id": company_id,
        "is_archived": False,
        "created_at": datetime.now(timezone.utc).isoformat()
    }
    await db.vendors.insert_one(vendor)
    return {"message": "Cari oluşturuldu", "id": vendor["id"]}

@api_router.put("/vendors/{vendor_id}/archive")
async def archive_vendor(vendor_id: str):
    """Archive a vendor"""
    result = await db.vendors.update_one(
        {"id": vendor_id},
        {"$set": {"is_archived": True}}
    )
    if result.matched_count == 0:
        raise HTTPException(status_code=404, detail="Cari bulunamadı")
    return {"message": "Cari arşivlendi"}

@api_router.put("/vendors/{vendor_id}/unarchive")
async def unarchive_vendor(vendor_id: str):
    """Unarchive a vendor"""
    result = await db.vendors.update_one(
        {"id": vendor_id},
        {"$set": {"is_archived": False}}
    )
    if result.matched_count == 0:
        raise HTTPException(status_code=404, detail="Cari bulunamadı")
    return {"message": "Cari arşivden çıkarıldı"}

@api_router.delete("/vendors/{vendor_id}")
async def delete_vendor(vendor_id: str):
    """Delete a vendor"""
    result = await db.vendors.delete_one({"id": vendor_id})
    if result.deleted_count == 0:
        raise HTTPException(status_code=404, detail="Cari bulunamadı")
    return {"message": "Cari silindi"}

# --- İşlemler (Transactions) ---
@api_router.post("/transactions")
async def create_transaction(data: TransactionCreate):
    """Create a new transaction"""
    # Parse custom date or use current time
    if data.custom_date:
        try:
            tx_date = datetime.fromisoformat(data.custom_date.replace('Z', '+00:00'))
            if tx_date.tzinfo is None:
                tx_date = tx_date.replace(tzinfo=timezone.utc)
            created_at = tx_date.isoformat()
        except:
            created_at = datetime.now(timezone.utc).isoformat()
    else:
        created_at = datetime.now(timezone.utc).isoformat()
    
    transaction = {
        "id": str(uuid.uuid4()),
        "entity_type": data.entity_type,
        "entity_id": data.entity_id,
        "company_id": data.company_id,
        "type": data.type,
        "amount": data.amount,
        "description": data.description or ("Verilen" if data.type == "payment_in" else "Alınan"),
        "is_hakedis": data.is_hakedis if data.entity_type == "courier" else False,
        "created_at": created_at
    }
    await db.transactions.insert_one(transaction)
    
    # Get entity name for log
    entity_name = ""
    if data.entity_type == "courier":
        courier = await db.couriers.find_one({"id": data.entity_id})
        entity_name = courier["name"] if courier else "Bilinmeyen Kurye"
    elif data.entity_type == "business":
        business = await db.businesses.find_one({"id": data.entity_id})
        entity_name = business["name"] if business else "Bilinmeyen İşletme"
    elif data.entity_type == "vendor":
        vendor = await db.vendors.find_one({"id": data.entity_id})
        entity_name = vendor["name"] if vendor else "Bilinmeyen Cari"
    
    # Create activity log
    if data.admin_id and data.admin_name:
        await create_activity_log({
            "company_id": data.company_id,
            "admin_id": data.admin_id,
            "admin_name": data.admin_name,
            "action": "transaction_created",
            "entity_type": data.entity_type,
            "entity_id": data.entity_id,
            "entity_name": entity_name,
            "details": {
                "transaction_id": transaction["id"],
                "type": data.type,
                "amount": data.amount,
                "description": transaction["description"],
                "is_hakedis": transaction["is_hakedis"]
            }
        })
    
    return {"message": "İşlem kaydedildi", "id": transaction["id"]}

async def get_entity_transactions(entity_type: str, entity_id: str, skip: int = 0, limit: int = 10):
    """Helper to get transactions and calculate balance for an entity"""
    # Get total count
    total_count = await db.transactions.count_documents({"entity_type": entity_type, "entity_id": entity_id})
    
    # Get paginated transactions
    transactions = await db.transactions.find(
        {"entity_type": entity_type, "entity_id": entity_id},
        {"_id": 0}
    ).sort("created_at", -1).skip(skip).limit(limit).to_list(limit)
    
    # Calculate balance from ALL transactions (not just paginated)
    all_transactions = await db.transactions.find(
        {"entity_type": entity_type, "entity_id": entity_id},
        {"_id": 0, "type": 1, "amount": 1}
    ).to_list(10000)
    
    balance = 0
    for tx in all_transactions:
        if tx["type"] == "payment_out":
            balance += tx["amount"]
        else:  # payment_in
            balance -= tx["amount"]
    
    return {
        "transactions": transactions, 
        "balance": balance,
        "total_count": total_count,
        "has_more": skip + limit < total_count
    }

@api_router.get("/transactions/courier/{courier_id}")
async def get_courier_transactions(courier_id: str, skip: int = 0, limit: int = 10):
    """Get paginated transactions for a courier"""
    return await get_entity_transactions("courier", courier_id, skip, limit)

@api_router.get("/transactions/business/{business_id}")
async def get_business_transactions(business_id: str, skip: int = 0, limit: int = 10):
    """Get paginated transactions for a business"""
    return await get_entity_transactions("business", business_id, skip, limit)

@api_router.get("/transactions/vendor/{vendor_id}")
async def get_vendor_transactions(vendor_id: str, skip: int = 0, limit: int = 10):
    """Get paginated transactions for a vendor"""
    return await get_entity_transactions("vendor", vendor_id, skip, limit)

class TransactionDeleteRequest(BaseModel):
    admin_id: str
    admin_name: str

@api_router.delete("/transactions/{transaction_id}")
async def delete_transaction(transaction_id: str, data: TransactionDeleteRequest = None):
    """Delete a transaction"""
    # Get transaction before deleting for log
    transaction = await db.transactions.find_one({"id": transaction_id}, {"_id": 0})
    if not transaction:
        raise HTTPException(status_code=404, detail="İşlem bulunamadı")
    
    # Get entity name for log
    entity_name = ""
    if transaction["entity_type"] == "courier":
        courier = await db.couriers.find_one({"id": transaction["entity_id"]})
        entity_name = courier["name"] if courier else "Bilinmeyen Kurye"
    elif transaction["entity_type"] == "business":
        business = await db.businesses.find_one({"id": transaction["entity_id"]})
        entity_name = business["name"] if business else "Bilinmeyen İşletme"
    elif transaction["entity_type"] == "vendor":
        vendor = await db.vendors.find_one({"id": transaction["entity_id"]})
        entity_name = vendor["name"] if vendor else "Bilinmeyen Cari"
    
    # Delete transaction
    await db.transactions.delete_one({"id": transaction_id})
    
    # Create activity log
    if data and data.admin_id and data.admin_name:
        await create_activity_log({
            "company_id": transaction["company_id"],
            "admin_id": data.admin_id,
            "admin_name": data.admin_name,
            "action": "transaction_deleted",
            "entity_type": transaction["entity_type"],
            "entity_id": transaction["entity_id"],
            "entity_name": entity_name,
            "details": {
                "transaction_id": transaction_id,
                "type": transaction["type"],
                "amount": transaction["amount"],
                "description": transaction["description"],
                "is_hakedis": transaction.get("is_hakedis", False)
            }
        })
    
    return {"message": "İşlem silindi"}

# ==================== ZİMMET YÖNETİMİ ====================

# Ürün Tipi Modelleri
class ProductTypeCreate(BaseModel):
    name: str
    has_pos_fields: bool = False  # POS cihazı için ekstra alanlar

class ProductTypeUpdate(BaseModel):
    name: Optional[str] = None
    has_pos_fields: Optional[bool] = None

# Ürün Modelleri
class ProductCreate(BaseModel):
    name: str
    product_type_id: str
    serial_number: Optional[str] = ""
    pos_serial: Optional[str] = ""  # POS seri no
    pos_terminal: Optional[str] = ""  # Banka terminal no
    notes: Optional[str] = ""

class ProductUpdate(BaseModel):
    name: Optional[str] = None
    product_type_id: Optional[str] = None
    serial_number: Optional[str] = None
    pos_serial: Optional[str] = None
    pos_terminal: Optional[str] = None
    notes: Optional[str] = None
    is_defective: Optional[bool] = None  # Arızalı
    is_lost: Optional[bool] = None  # Kayıp

# Zimmet İşlemi Modeli
class ZimmetAction(BaseModel):
    courier_id: str
    courier_name: str
    admin_id: str
    admin_name: str
    notes: Optional[str] = ""

class ZimmetReturn(BaseModel):
    admin_id: str
    admin_name: str
    notes: Optional[str] = ""

# --- Ürün Tipleri Endpoint'leri ---
@api_router.get("/companies/{company_id}/product-types")
async def get_product_types(company_id: str):
    """Şirketin ürün tiplerini getir"""
    types = await db.product_types.find(
        {"company_id": company_id},
        {"_id": 0}
    ).sort("name", 1).to_list(100)
    return types

@api_router.post("/companies/{company_id}/product-types")
async def create_product_type(company_id: str, data: ProductTypeCreate):
    """Yeni ürün tipi oluştur"""
    product_type = {
        "id": str(uuid.uuid4()),
        "company_id": company_id,
        "name": data.name.strip(),
        "has_pos_fields": data.has_pos_fields,
        "created_at": datetime.now(timezone.utc).isoformat()
    }
    await db.product_types.insert_one(product_type)
    del product_type["_id"]
    return product_type

@api_router.put("/product-types/{type_id}")
async def update_product_type(type_id: str, data: ProductTypeUpdate):
    """Ürün tipini güncelle"""
    update_data = {k: v for k, v in data.model_dump().items() if v is not None}
    if not update_data:
        raise HTTPException(status_code=400, detail="Güncellenecek veri yok")
    
    result = await db.product_types.update_one(
        {"id": type_id},
        {"$set": update_data}
    )
    if result.matched_count == 0:
        raise HTTPException(status_code=404, detail="Ürün tipi bulunamadı")
    return {"message": "Güncellendi"}

@api_router.delete("/product-types/{type_id}")
async def delete_product_type(type_id: str):
    """Ürün tipini sil (ürün yoksa)"""
    # Önce bu tipte ürün var mı kontrol et
    product_count = await db.products.count_documents({"product_type_id": type_id})
    if product_count > 0:
        raise HTTPException(status_code=400, detail=f"Bu tipte {product_count} ürün var, önce ürünleri silin")
    
    result = await db.product_types.delete_one({"id": type_id})
    if result.deleted_count == 0:
        raise HTTPException(status_code=404, detail="Ürün tipi bulunamadı")
    return {"message": "Silindi"}

# --- Ürünler Endpoint'leri ---
@api_router.get("/companies/{company_id}/products")
async def get_products(company_id: str, skip: int = 0, limit: int = 50):
    """Şirketin ürünlerini getir (pagination)"""
    total = await db.products.count_documents({"company_id": company_id})
    
    products = await db.products.find(
        {"company_id": company_id},
        {"_id": 0}
    ).sort("created_at", -1).skip(skip).limit(limit).to_list(limit)
    
    return {
        "products": products,
        "total_count": total,
        "has_more": skip + limit < total
    }

@api_router.get("/products/{product_id}")
async def get_product(product_id: str):
    """Tek ürün detayı"""
    product = await db.products.find_one({"id": product_id}, {"_id": 0})
    if not product:
        raise HTTPException(status_code=404, detail="Ürün bulunamadı")
    return product

@api_router.post("/companies/{company_id}/products")
async def create_product(company_id: str, data: ProductCreate, admin_id: str = "", admin_name: str = ""):
    """Yeni ürün oluştur"""
    # Ürün tipi kontrolü
    product_type = await db.product_types.find_one({"id": data.product_type_id})
    if not product_type:
        raise HTTPException(status_code=400, detail="Geçersiz ürün tipi")
    
    product = {
        "id": str(uuid.uuid4()),
        "company_id": company_id,
        "name": data.name.strip(),
        "product_type_id": data.product_type_id,
        "product_type_name": product_type["name"],
        "serial_number": data.serial_number or "",
        "pos_serial": data.pos_serial or "",
        "pos_terminal": data.pos_terminal or "",
        "notes": data.notes or "",
        "is_defective": False,
        "is_lost": False,
        "assigned_to_courier_id": None,
        "assigned_to_courier_name": None,
        "assigned_at": None,
        "created_at": datetime.now(timezone.utc).isoformat()
    }
    await db.products.insert_one(product)
    
    # Log oluştur
    if admin_id:
        await create_zimmet_log(company_id, admin_id, admin_name, "product_created", product["id"], product["name"], None, None, {
            "product_type": product_type["name"],
            "serial_number": data.serial_number
        })
    
    del product["_id"]
    return product

@api_router.put("/products/{product_id}")
async def update_product(product_id: str, data: ProductUpdate, admin_id: str = "", admin_name: str = ""):
    """Ürünü güncelle"""
    product = await db.products.find_one({"id": product_id})
    if not product:
        raise HTTPException(status_code=404, detail="Ürün bulunamadı")
    
    update_data = {}
    changes = []
    
    for key, value in data.model_dump().items():
        if value is not None:
            if key == "product_type_id":
                product_type = await db.product_types.find_one({"id": value})
                if product_type:
                    update_data["product_type_id"] = value
                    update_data["product_type_name"] = product_type["name"]
                    if product.get("product_type_id") != value:
                        changes.append(f"Tip: {product_type['name']}")
            elif key == "is_defective":
                update_data[key] = value
                if product.get("is_defective") != value:
                    changes.append("Arızalı" if value else "Arıza kaldırıldı")
            elif key == "is_lost":
                update_data[key] = value
                if product.get("is_lost") != value:
                    changes.append("Kayıp" if value else "Kayıp kaldırıldı")
            else:
                update_data[key] = value
    
    if not update_data:
        raise HTTPException(status_code=400, detail="Güncellenecek veri yok")
    
    await db.products.update_one({"id": product_id}, {"$set": update_data})
    
    # Log oluştur
    if admin_id and changes:
        await create_zimmet_log(
            product["company_id"], admin_id, admin_name, 
            "product_updated", product_id, product["name"],
            product.get("assigned_to_courier_id"), product.get("assigned_to_courier_name"),
            {"changes": ", ".join(changes)}
        )
    
    return {"message": "Güncellendi"}

@api_router.delete("/products/{product_id}")
async def delete_product(product_id: str, admin_id: str = "", admin_name: str = ""):
    """Ürünü sil (zimmetli değilse)"""
    product = await db.products.find_one({"id": product_id})
    if not product:
        raise HTTPException(status_code=404, detail="Ürün bulunamadı")
    
    if product.get("assigned_to_courier_id"):
        raise HTTPException(status_code=400, detail="Zimmetli ürün silinemez, önce zimmeti geri alın")
    
    # Log oluştur
    if admin_id:
        await create_zimmet_log(
            product["company_id"], admin_id, admin_name,
            "product_deleted", product_id, product["name"],
            None, None, {"serial_number": product.get("serial_number", "")}
        )
    
    await db.products.delete_one({"id": product_id})
    await db.zimmet_logs.delete_many({"product_id": product_id})
    
    return {"message": "Silindi"}

# --- Zimmet İşlemleri ---
@api_router.post("/products/{product_id}/assign")
async def assign_product(product_id: str, data: ZimmetAction):
    """Ürünü kuryeye zimmetle"""
    product = await db.products.find_one({"id": product_id})
    if not product:
        raise HTTPException(status_code=404, detail="Ürün bulunamadı")
    
    if product.get("assigned_to_courier_id"):
        raise HTTPException(status_code=400, detail=f"Ürün zaten {product['assigned_to_courier_name']}'a zimmetli")
    
    if product.get("is_lost"):
        raise HTTPException(status_code=400, detail="Kayıp ürün zimmetlenemez")
    
    # Kuryeyi kontrol et
    courier = await db.couriers.find_one({"id": data.courier_id})
    if not courier:
        raise HTTPException(status_code=404, detail="Kurye bulunamadı")
    
    assigned_at = datetime.now(timezone.utc).isoformat()
    
    await db.products.update_one(
        {"id": product_id},
        {"$set": {
            "assigned_to_courier_id": data.courier_id,
            "assigned_to_courier_name": data.courier_name,
            "assigned_at": assigned_at
        }}
    )
    
    # Log oluştur
    await create_zimmet_log(
        product["company_id"], data.admin_id, data.admin_name,
        "assigned", product_id, product["name"],
        data.courier_id, data.courier_name,
        {
            "serial_number": product.get("serial_number", ""),
            "pos_serial": product.get("pos_serial", ""),
            "notes": data.notes
        }
    )
    
    return {"message": f"Ürün {data.courier_name}'a zimmetlendi", "assigned_at": assigned_at}

@api_router.post("/products/{product_id}/return")
async def return_product(product_id: str, data: ZimmetReturn):
    """Zimmeti geri al"""
    product = await db.products.find_one({"id": product_id})
    if not product:
        raise HTTPException(status_code=404, detail="Ürün bulunamadı")
    
    if not product.get("assigned_to_courier_id"):
        raise HTTPException(status_code=400, detail="Ürün zaten zimmetli değil")
    
    old_courier_id = product["assigned_to_courier_id"]
    old_courier_name = product["assigned_to_courier_name"]
    
    await db.products.update_one(
        {"id": product_id},
        {"$set": {
            "assigned_to_courier_id": None,
            "assigned_to_courier_name": None,
            "assigned_at": None
        }}
    )
    
    # Log oluştur
    await create_zimmet_log(
        product["company_id"], data.admin_id, data.admin_name,
        "returned", product_id, product["name"],
        old_courier_id, old_courier_name,
        {"notes": data.notes}
    )
    
    return {"message": f"Zimmet {old_courier_name}'dan geri alındı"}

# --- Zimmet Logları ---
async def create_zimmet_log(company_id: str, admin_id: str, admin_name: str, action: str, product_id: str, product_name: str, courier_id: Optional[str], courier_name: Optional[str], details: dict = None):
    """Zimmet log kaydı oluştur"""
    log = {
        "id": str(uuid.uuid4()),
        "company_id": company_id,
        "admin_id": admin_id,
        "admin_name": admin_name,
        "action": action,
        "product_id": product_id,
        "product_name": product_name,
        "courier_id": courier_id,
        "courier_name": courier_name,
        "details": details or {},
        "created_at": datetime.now(timezone.utc).isoformat()
    }
    await db.zimmet_logs.insert_one(log)

@api_router.get("/companies/{company_id}/zimmet-logs")
async def get_zimmet_logs(company_id: str, skip: int = 0, limit: int = 10):
    """Şirketin zimmet loglarını getir (pagination)"""
    total = await db.zimmet_logs.count_documents({"company_id": company_id})
    
    logs = await db.zimmet_logs.find(
        {"company_id": company_id},
        {"_id": 0}
    ).sort("created_at", -1).skip(skip).limit(limit).to_list(limit)
    
    return {
        "logs": logs,
        "total_count": total,
        "has_more": skip + limit < total
    }

@api_router.get("/products/{product_id}/history")
async def get_product_history(product_id: str):
    """Ürünün zimmet geçmişini getir"""
    logs = await db.zimmet_logs.find(
        {"product_id": product_id},
        {"_id": 0}
    ).sort("created_at", -1).to_list(100)
    return logs

# Health check
@api_router.get("/")
async def root():
    return {"message": "Kurye Yönetim Sistemi API"}

# Image proxy for PDF logo (to avoid CORS issues)
@api_router.get("/proxy-image")
async def proxy_image(url: str):
    """Proxy external images to avoid CORS issues in PDF generation"""
    try:
        headers = {
            "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36",
            "Accept": "image/webp,image/apng,image/*,*/*;q=0.8",
            "Accept-Language": "en-US,en;q=0.9",
            "Referer": url
        }
        async with httpx.AsyncClient() as client:
            response = await client.get(url, timeout=10.0, headers=headers, follow_redirects=True)
            response.raise_for_status()
            content_type = response.headers.get('content-type', 'image/png')
            return Response(content=response.content, media_type=content_type)
    except Exception as e:
        raise HTTPException(status_code=400, detail=f"Görsel yüklenemedi: {str(e)}")

app.include_router(api_router)

app.add_middleware(
    CORSMiddleware,
    allow_credentials=True,
    allow_origins=os.environ.get('CORS_ORIGINS', '*').split(','),
    allow_methods=["*"],
    allow_headers=["*"],
)

logging.basicConfig(
    level=logging.INFO,
    format='%(asctime)s - %(name)s - %(levelname)s - %(message)s'
)
logger = logging.getLogger(__name__)

@app.on_event("shutdown")
async def shutdown_db_client():
    client.close()
