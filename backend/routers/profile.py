from fastapi import APIRouter, HTTPException, Depends
from pydantic import BaseModel
from typing import Optional

from utils.database import db
from utils.helpers import hash_password

from utils.jwt_utils import require_auth
router = APIRouter(prefix="/api", tags=["Profile"], dependencies=[Depends(require_auth)])


# --- Pydantic Models ---
class ProfileUpdate(BaseModel):
    username: Optional[str] = None
    password: Optional[str] = None
    email: Optional[str] = None  # Only for superadmin
    current_password: str  # Mevcut şifre doğrulaması için


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
    
    # Email update (only for superadmin)
    if data.email is not None and admin.get("role") == "superadmin":
        update_data["email"] = data.email
    
    if not update_data:
        raise HTTPException(status_code=400, detail="Güncellenecek veri yok")
    
    await db.admins.update_one({"id": admin_id}, {"$set": update_data})
    
    return {
        "message": "Profil güncellendi",
        "requires_relogin": requires_relogin,
        "new_username": data.username if data.username else admin["username"]
    }
