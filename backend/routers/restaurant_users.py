"""
Restaurant Users API
Restoran kullanıcı yönetimi ve auth
"""
from fastapi import APIRouter, HTTPException, Request
from pydantic import BaseModel
from typing import Optional, List
from datetime import datetime, timezone
import uuid

from utils.database import db
from utils.helpers import hash_password
from utils.rate_limit import limiter

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


# --- Auth ---
@router.post("/login")
@limiter.limit("5/minute")
async def login_restaurant_user(request: Request, data: RestaurantUserLogin):
    """Restoran kullanıcı girişi"""
    user = await db.restaurant_users.find_one(
        {"username": data.username.lower()},
        {"_id": 0}
    )
    
    if not user or user.get("password_hash") != hash_password(data.password):
        raise HTTPException(status_code=401, detail="Geçersiz kullanıcı adı veya şifre")
    
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
        "company_name": company["name"] if company else None
    }


# --- CRUD ---
@router.get("/restaurant/{restaurant_id}")
async def get_restaurant_users(restaurant_id: str):
    """Restoranın tüm kullanıcılarını listele"""
    users = await db.restaurant_users.find(
        {"restaurant_id": restaurant_id},
        {"_id": 0, "password_hash": 0}
    ).to_list(100)
    
    return users


@router.post("")
async def create_restaurant_user(data: RestaurantUserCreate):
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
async def update_restaurant_user(user_id: str, data: RestaurantUserUpdate):
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
async def delete_restaurant_user(user_id: str):
    """Restoran kullanıcısını sil"""
    result = await db.restaurant_users.delete_one({"id": user_id})
    
    if result.deleted_count == 0:
        raise HTTPException(status_code=404, detail="Kullanıcı bulunamadı")
    
    return {"message": "Kullanıcı silindi"}
