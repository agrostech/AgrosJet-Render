from fastapi import FastAPI, APIRouter, HTTPException
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
    company_id: str

class CourierLogin(BaseModel):
    phone: str
    password: str
    company_id: str

class AdminLogin(BaseModel):
    username: str
    password: str
    company_id: Optional[str] = None

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

class CourierResponse(BaseModel):
    model_config = ConfigDict(extra="ignore")
    id: str
    name: str
    phone: str
    address: str
    iban: str
    plate: str
    status: str
    company_id: str
    created_at: str

class AdminResponse(BaseModel):
    model_config = ConfigDict(extra="ignore")
    id: str
    name: str
    username: str
    role: str
    permissions: dict
    company_id: Optional[str]
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
    # Delete company and all related data
    await db.companies.delete_one({"id": company_id})
    await db.couriers.delete_many({"company_id": company_id})
    await db.admins.delete_many({"company_id": company_id})
    return {"message": "Şirket ve tüm verileri silindi"}

# ==================== AUTH ROUTES ====================
@api_router.post("/auth/courier/register")
async def register_courier(data: CourierRegister):
    # Verify company exists
    company = await db.companies.find_one({"id": data.company_id})
    if not company:
        raise HTTPException(status_code=404, detail="Şirket bulunamadı")
    
    existing = await db.couriers.find_one({"phone": data.phone, "company_id": data.company_id})
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
        "status": "pending",
        "company_id": data.company_id,
        "created_at": datetime.now(timezone.utc).isoformat()
    }
    await db.couriers.insert_one(courier)
    return {"message": "Kayıt başarılı. Onay bekleniyor.", "id": courier["id"]}

@api_router.post("/auth/courier/login")
async def login_courier(data: CourierLogin):
    courier = await db.couriers.find_one({"phone": data.phone, "company_id": data.company_id}, {"_id": 0})
    if not courier or courier["password"] != hash_password(data.password):
        raise HTTPException(status_code=401, detail="Geçersiz telefon veya şifre")
    if courier["status"] != "approved":
        raise HTTPException(status_code=403, detail="Hesabınız henüz onaylanmadı")
    
    company = await db.companies.find_one({"id": data.company_id}, {"_id": 0})
    return {
        "id": courier["id"],
        "name": courier["name"],
        "phone": courier["phone"],
        "role": "courier",
        "company_id": courier["company_id"],
        "company": company
    }

@api_router.post("/auth/admin/login")
async def login_admin(data: AdminLogin):
    # System admin login (no company required)
    if data.username == "systemadmin":
        admin = await db.admins.find_one({"username": "systemadmin", "role": "systemadmin"}, {"_id": 0})
        if not admin or admin["password"] != hash_password(data.password):
            raise HTTPException(status_code=401, detail="Geçersiz kullanıcı adı veya şifre")
        return {
            "id": admin["id"],
            "name": admin["name"],
            "username": admin["username"],
            "role": admin["role"],
            "permissions": admin["permissions"],
            "company_id": None,
            "company": None
        }
    
    # Company admin/superadmin login
    if not data.company_id:
        raise HTTPException(status_code=400, detail="Şirket seçimi gerekli")
    
    admin = await db.admins.find_one({"username": data.username, "company_id": data.company_id}, {"_id": 0})
    if not admin or admin["password"] != hash_password(data.password):
        raise HTTPException(status_code=401, detail="Geçersiz kullanıcı adı veya şifre")
    
    company = await db.companies.find_one({"id": data.company_id}, {"_id": 0})
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
@api_router.get("/couriers", response_model=List[CourierResponse])
async def get_couriers(company_id: Optional[str] = None):
    query = {"company_id": company_id} if company_id else {}
    couriers = await db.couriers.find(query, {"_id": 0, "password": 0}).to_list(1000)
    return couriers

@api_router.put("/couriers/{courier_id}/approve")
async def approve_courier(courier_id: str):
    result = await db.couriers.update_one({"id": courier_id}, {"$set": {"status": "approved"}})
    if result.modified_count == 0:
        raise HTTPException(status_code=404, detail="Kurye bulunamadı")
    return {"message": "Kurye onaylandı"}

@api_router.put("/couriers/{courier_id}/reject")
async def reject_courier(courier_id: str):
    result = await db.couriers.update_one({"id": courier_id}, {"$set": {"status": "rejected"}})
    if result.modified_count == 0:
        raise HTTPException(status_code=404, detail="Kurye bulunamadı")
    return {"message": "Kurye reddedildi"}

@api_router.delete("/couriers/{courier_id}")
async def delete_courier(courier_id: str):
    result = await db.couriers.delete_one({"id": courier_id})
    if result.deleted_count == 0:
        raise HTTPException(status_code=404, detail="Kurye bulunamadı")
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
    existing = await db.admins.find_one({"username": data.username, "company_id": data.company_id})
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
    # Check if company already has a superadmin
    existing_super = await db.admins.find_one({"company_id": data.company_id, "role": "superadmin"})
    if existing_super:
        raise HTTPException(status_code=400, detail="Bu şirketin zaten bir süper admini var")
    
    existing = await db.admins.find_one({"username": data.username, "company_id": data.company_id})
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
    return {"message": "Yönetici silindi"}

# Health check
@api_router.get("/")
async def root():
    return {"message": "Kurye Yönetim Sistemi API"}

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
