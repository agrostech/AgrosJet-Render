from fastapi import FastAPI, APIRouter, HTTPException, Depends
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
    created_at: str

class AdminResponse(BaseModel):
    model_config = ConfigDict(extra="ignore")
    id: str
    name: str
    username: str
    role: str
    permissions: dict
    created_at: str

# Initialize super admin on startup
@app.on_event("startup")
async def startup_event():
    existing = await db.admins.find_one({"username": "onurertas"})
    if not existing:
        super_admin = {
            "id": str(uuid.uuid4()),
            "name": "Onur Ertas",
            "username": "onurertas",
            "password": hash_password("Delivery32.."),
            "role": "superadmin",
            "permissions": {
                "vardiya": True,
                "muhasebe": True,
                "zimmet": True,
                "kuryeler": True,
                "yoneticiler": True
            },
            "created_at": datetime.now(timezone.utc).isoformat()
        }
        await db.admins.insert_one(super_admin)
        logging.info("Super admin created: onurertas")

# Auth Routes
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
        "status": "pending",
        "created_at": datetime.now(timezone.utc).isoformat()
    }
    await db.couriers.insert_one(courier)
    return {"message": "Kayıt başarılı. Onay bekleniyor.", "id": courier["id"]}

@api_router.post("/auth/courier/login")
async def login_courier(data: CourierLogin):
    courier = await db.couriers.find_one({"phone": data.phone}, {"_id": 0})
    if not courier or courier["password"] != hash_password(data.password):
        raise HTTPException(status_code=401, detail="Geçersiz telefon veya şifre")
    if courier["status"] != "approved":
        raise HTTPException(status_code=403, detail="Hesabınız henüz onaylanmadı")
    return {
        "id": courier["id"],
        "name": courier["name"],
        "phone": courier["phone"],
        "role": "courier"
    }

@api_router.post("/auth/admin/login")
async def login_admin(data: AdminLogin):
    admin = await db.admins.find_one({"username": data.username}, {"_id": 0})
    if not admin or admin["password"] != hash_password(data.password):
        raise HTTPException(status_code=401, detail="Geçersiz kullanıcı adı veya şifre")
    return {
        "id": admin["id"],
        "name": admin["name"],
        "username": admin["username"],
        "role": admin["role"],
        "permissions": admin["permissions"]
    }

# Courier Management
@api_router.get("/couriers", response_model=List[CourierResponse])
async def get_couriers():
    couriers = await db.couriers.find({}, {"_id": 0, "password": 0}).to_list(1000)
    return couriers

@api_router.put("/couriers/{courier_id}/approve")
async def approve_courier(courier_id: str):
    result = await db.couriers.update_one(
        {"id": courier_id},
        {"$set": {"status": "approved"}}
    )
    if result.modified_count == 0:
        raise HTTPException(status_code=404, detail="Kurye bulunamadı")
    return {"message": "Kurye onaylandı"}

@api_router.put("/couriers/{courier_id}/reject")
async def reject_courier(courier_id: str):
    result = await db.couriers.update_one(
        {"id": courier_id},
        {"$set": {"status": "rejected"}}
    )
    if result.modified_count == 0:
        raise HTTPException(status_code=404, detail="Kurye bulunamadı")
    return {"message": "Kurye reddedildi"}

@api_router.delete("/couriers/{courier_id}")
async def delete_courier(courier_id: str):
    result = await db.couriers.delete_one({"id": courier_id})
    if result.deleted_count == 0:
        raise HTTPException(status_code=404, detail="Kurye bulunamadı")
    return {"message": "Kurye silindi"}

# Admin Management (Super Admin only)
@api_router.get("/admins", response_model=List[AdminResponse])
async def get_admins():
    admins = await db.admins.find({}, {"_id": 0, "password": 0}).to_list(100)
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
        "created_at": datetime.now(timezone.utc).isoformat()
    }
    await db.admins.insert_one(admin)
    return {"message": "Yönetici oluşturuldu", "id": admin["id"]}

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
    if admin["role"] == "superadmin":
        raise HTTPException(status_code=403, detail="Süper admin silinemez")
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
