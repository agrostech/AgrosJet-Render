from fastapi import APIRouter, HTTPException
from pydantic import BaseModel
from typing import Optional
from datetime import datetime, timezone

from utils.database import db
from utils.helpers import hash_password

router = APIRouter(prefix="/api", tags=["Profile"])


# --- Pydantic Models ---
class ProfileUpdate(BaseModel):
    username: Optional[str] = None
    password: Optional[str] = None
    email: Optional[str] = None  # Only for superadmin
    current_password: str  # Mevcut şifre doğrulaması için


# --- Helper ---
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


# --- Profile Management ---
@router.put("/profile/{admin_id}")
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


@router.get("/session/check/{user_id}")
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


@router.delete("/session/invalidation/{user_id}")
async def clear_session_invalidation(user_id: str):
    """Kullanıcı yeniden giriş yaptıktan sonra invalidation kaydını temizle"""
    await db.invalidated_sessions.delete_one({"user_id": user_id})
    return {"message": "Invalidation cleared"}
