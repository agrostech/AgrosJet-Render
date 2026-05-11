"""
Restaurant Users API
Restoran kullanıcı yönetimi ve auth
"""
from fastapi import APIRouter, HTTPException, Request, Depends
from pydantic import BaseModel
from typing import Optional, List
from datetime import datetime, timezone
import uuid

from utils.database import db
from utils.helpers import hash_password, verify_password, get_turkey_now
from utils.rate_limit import limiter
from utils.jwt_utils import create_token, require_auth

router = APIRouter(prefix="/api/restaurant-users", tags=["Restaurant Users"])


# --- Pydantic Models ---
class RestaurantUserCreate(BaseModel):
    username: str
    password: str
    name: str
    phone: Optional[str] = None
    restaurant_id: str


class RestaurantUserUpdate(BaseModel):
    name: Optional[str] = None
    phone: Optional[str] = None
    password: Optional[str] = None
    is_active: Optional[bool] = None


class RestaurantUserLogin(BaseModel):
    username: str
    password: str
    remember_me: bool = False


# --- Auth ---
@router.post("/login")
@limiter.limit("5/minute")
async def login_restaurant_user(request: Request, data: RestaurantUserLogin):
    """Restoran kullanıcı girişi"""
    user = await db.restaurant_users.find_one(
        {"username": data.username.lower()},
        {"_id": 0}
    )
    
    if not user or not verify_password(data.password, user.get("password_hash", "")):
        raise HTTPException(status_code=401, detail="Geçersiz kullanıcı adı veya şifre")
    
    # SHA-256'dan bcrypt'e otomatik yükseltme
    if not user.get("password_hash", "").startswith("$2b$"):
        await db.restaurant_users.update_one(
            {"username": data.username.lower()},
            {"$set": {"password_hash": hash_password(data.password)}}
        )
    
    if not user.get("is_active", True):
        raise HTTPException(status_code=403, detail="Hesabınız pasif durumda")
    
    # Get restaurant info
    restaurant = await db.restaurants.find_one(
        {"id": user["restaurant_id"]},
        {"_id": 0, "id": 1, "name": 1, "company_id": 1}
    )
    
    if not restaurant:
        raise HTTPException(status_code=404, detail="Restoran bulunamadı")
    
    # Get company info
    company = await db.companies.find_one(
        {"id": restaurant["company_id"]},
        {"_id": 0, "id": 1, "name": 1}
    )
    
    return {
        "id": user["id"],
        "name": user["name"],
        "username": user["username"],
        "role": "restaurant",
        "restaurant_id": user["restaurant_id"],
        "restaurant_name": restaurant["name"],
        "company_id": restaurant["company_id"],
        "company_name": company["name"] if company else None,
        "token": create_token(user["id"], "restaurant", {"restaurant_id": user["restaurant_id"], "company_id": restaurant["company_id"]}, remember_me=data.remember_me)
    }


# --- Admin Impersonate ---
@router.post("/admin-impersonate/{restaurant_id}")
async def admin_impersonate_restaurant(restaurant_id: str, request: Request, auth: dict = Depends(require_auth)):
    """Admin olarak restoran paneline geçici erişim tokeni oluştur"""
    body = await request.json()
    admin_id = body.get("admin_id")
    
    if not admin_id:
        raise HTTPException(status_code=400, detail="admin_id gerekli")
    
    # Admin doğrula
    admin = await db.admins.find_one({"id": admin_id}, {"_id": 0, "id": 1, "role": 1, "name": 1, "username": 1})
    if not admin:
        raise HTTPException(status_code=403, detail="Yetkisiz erişim")
    
    # Restoran doğrula
    restaurant = await db.restaurants.find_one(
        {"id": restaurant_id},
        {"_id": 0, "id": 1, "name": 1, "company_id": 1}
    )
    if not restaurant:
        raise HTTPException(status_code=404, detail="Restoran bulunamadı")
    
    # Şirket bilgisi
    company = await db.companies.find_one(
        {"id": restaurant["company_id"]},
        {"_id": 0, "id": 1, "name": 1}
    )
    
    # Geçici token oluştur (5 dk geçerli)
    token = str(uuid.uuid4())
    await db.impersonate_tokens.insert_one({
        "token": token,
        "admin_id": admin_id,
        "admin_name": admin.get("name") or admin.get("username"),
        "restaurant_id": restaurant_id,
        "restaurant_name": restaurant["name"],
        "company_id": restaurant["company_id"],
        "company_name": company["name"] if company else None,
        "created_at": get_turkey_now(),
        "used": False,
    })
    
    return {"token": token}


@router.get("/impersonate-verify/{token}")
async def verify_impersonate_token(token: str):
    """Impersonate tokenini doğrula ve kullanıcı bilgisi döndür"""
    record = await db.impersonate_tokens.find_one(
        {"token": token},
        {"_id": 0}
    )
    
    if not record:
        raise HTTPException(status_code=401, detail="Geçersiz token")
    
    # 30 dakika süre kontrolü
    created = record.get("created_at")
    if created:
        from datetime import timedelta
        if isinstance(created, str):
            created = datetime.fromisoformat(created.replace('Z', '+00:00'))
        now = datetime.now(timezone.utc)
        if created.tzinfo is None:
            created = created.replace(tzinfo=timezone.utc)
        if (now - created).total_seconds() > 1800:
            raise HTTPException(status_code=401, detail="Token süresi dolmuş")
    
    return {
        "id": f"impersonate-{record['admin_id']}",
        "name": f"{record['admin_name']} (Admin)",
        "username": "admin-impersonate",
        "role": "restaurant",
        "restaurant_id": record["restaurant_id"],
        "restaurant_name": record["restaurant_name"],
        "company_id": record["company_id"],
        "company_name": record["company_name"],
        "is_impersonate": True,
    }



# --- Company Impersonation (System Admin → Company Admin Panel) ---
@router.post("/company-impersonate/{company_id}")
async def company_impersonate(company_id: str, request: Request, auth: dict = Depends(require_auth)):
    """System admin olarak şirket admin paneline geçici erişim tokeni oluştur"""
    body = await request.json()
    admin_id = body.get("admin_id")
    
    if not admin_id:
        raise HTTPException(status_code=400, detail="admin_id gerekli")
    
    # System admin doğrula
    admin = await db.admins.find_one({"id": admin_id}, {"_id": 0, "id": 1, "role": 1, "name": 1, "username": 1, "is_system_admin": 1})
    if not admin or (admin.get("role") not in ("superadmin", "systemadmin") and not admin.get("is_system_admin")):
        raise HTTPException(status_code=403, detail="Yetkisiz erişim - sadece sistem adminleri")
    
    # Şirket doğrula
    company = await db.companies.find_one({"id": company_id}, {"_id": 0, "id": 1, "name": 1})
    if not company:
        raise HTTPException(status_code=404, detail="Şirket bulunamadı")
    
    # Geçici token oluştur
    token = str(uuid.uuid4())
    await db.impersonate_tokens.insert_one({
        "token": token,
        "admin_id": admin_id,
        "admin_name": admin.get("name") or admin.get("username"),
        "company_id": company_id,
        "company_name": company["name"],
        "type": "company",
        "created_at": get_turkey_now(),
        "used": False,
    })
    
    return {"token": token}


@router.get("/company-impersonate-verify/{token}")
async def verify_company_impersonate_token(token: str):
    """Company impersonate tokenini doğrula ve admin bilgisi döndür"""
    record = await db.impersonate_tokens.find_one(
        {"token": token, "type": "company"},
        {"_id": 0}
    )
    
    if not record:
        raise HTTPException(status_code=401, detail="Geçersiz token")
    
    # 30 dakika süre kontrolü
    created = record.get("created_at")
    if created:
        from datetime import timedelta
        if isinstance(created, str):
            created = datetime.fromisoformat(created.replace('Z', '+00:00'))
        now = datetime.now(timezone.utc)
        if created.tzinfo is None:
            created = created.replace(tzinfo=timezone.utc)
        if (now - created).total_seconds() > 1800:
            raise HTTPException(status_code=401, detail="Token süresi dolmuş")
    
    company_id = record["company_id"]
    company = await db.companies.find_one({"id": company_id}, {"_id": 0})
    
    return {
        "id": f"impersonate-{record['admin_id']}",
        "name": f"{record['admin_name']} (Sistem)",
        "username": "system-impersonate",
        "role": "superadmin",
        "is_super_admin": True,
        "is_system_admin": False,
        "permissions": {
            "vardiya": True, "muhasebe": True, "zimmet": True,
            "kuryeler": True, "market": True, "akademi": True, "sistem": False
        },
        "company_id": company_id,
        "company_ids": [company_id],
        "company": company,
        "accessible_companies": [{"id": company["id"], "name": company["name"], "logo_url": company.get("logo_url")}] if company else [],
        "is_impersonate": True,
    }



# --- CRUD ---
@router.get("/restaurant/{restaurant_id}")
async def get_restaurant_users(restaurant_id: str, auth: dict = Depends(require_auth)):
    """Restoranın tüm kullanıcılarını listele"""
    users = await db.restaurant_users.find(
        {"restaurant_id": restaurant_id},
        {"_id": 0, "password_hash": 0}
    ).to_list(100)
    
    return users


@router.post("")
async def create_restaurant_user(data: RestaurantUserCreate, auth: dict = Depends(require_auth)):
    """Yeni restoran kullanıcısı oluştur"""
    # Username'i normalize et
    username = data.username.lower().strip()
    
    # Username uzunluk kontrolü
    if len(username) < 3:
        raise HTTPException(status_code=400, detail="Kullanıcı adı en az 3 karakter olmalı")
    
    # Username zaten var mı?
    existing = await db.restaurant_users.find_one({"username": username})
    if existing:
        raise HTTPException(status_code=400, detail="Bu kullanıcı adı zaten kullanımda")
    
    # Restoran var mı?
    restaurant = await db.restaurants.find_one({"id": data.restaurant_id}, {"_id": 0, "name": 1})
    if not restaurant:
        raise HTTPException(status_code=404, detail="Restoran bulunamadı")
    
    user = {
        "id": str(uuid.uuid4()),
        "username": username,
        "password_hash": hash_password(data.password),
        "name": data.name,
        "phone": data.phone,
        "restaurant_id": data.restaurant_id,
        "is_active": True,
        "created_at": get_turkey_now()
    }
    
    await db.restaurant_users.insert_one(user)
    
    return {
        "message": "Kullanıcı oluşturuldu",
        "id": user["id"],
        "username": username
    }


@router.put("/{user_id}")
async def update_restaurant_user(user_id: str, data: RestaurantUserUpdate, auth: dict = Depends(require_auth)):
    """Restoran kullanıcısını güncelle"""
    user = await db.restaurant_users.find_one({"id": user_id})
    if not user:
        raise HTTPException(status_code=404, detail="Kullanıcı bulunamadı")
    
    update_fields = {}
    
    if data.name is not None:
        update_fields["name"] = data.name
    if data.phone is not None:
        update_fields["phone"] = data.phone
    if data.password is not None:
        update_fields["password_hash"] = hash_password(data.password)
    if data.is_active is not None:
        update_fields["is_active"] = data.is_active
    
    if not update_fields:
        raise HTTPException(status_code=400, detail="Güncellenecek alan belirtilmedi")
    
    update_fields["updated_at"] = get_turkey_now()
    
    await db.restaurant_users.update_one(
        {"id": user_id},
        {"$set": update_fields}
    )
    
    return {"message": "Kullanıcı güncellendi"}


@router.delete("/{user_id}")
async def delete_restaurant_user(user_id: str, auth: dict = Depends(require_auth)):
    """Restoran kullanıcısını sil"""
    result = await db.restaurant_users.delete_one({"id": user_id})
    
    if result.deleted_count == 0:
        raise HTTPException(status_code=404, detail="Kullanıcı bulunamadı")
    
    return {"message": "Kullanıcı silindi"}
