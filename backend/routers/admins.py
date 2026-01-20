from fastapi import APIRouter, HTTPException
from pydantic import BaseModel, ConfigDict
from typing import List, Optional
from datetime import datetime, timezone
import uuid

from utils.database import db
from utils.helpers import hash_password, format_name

router = APIRouter(prefix="/api", tags=["Admins"])


# --- Granular Permission Definitions ---
def get_default_admin_permissions():
    """Returns default permissions for a new admin (most permissions enabled)"""
    return {
        # Sayfa Erişimi
        "page_vardiya": True,
        "page_muhasebe": True,
        "page_zimmet": True,
        "page_kuryeler": True,
        "page_market": True,
        "page_akademi": True,
        "page_sistem": False,  # Default kapalı - hassas ayarlar
        "page_yoneticiler": False,  # Default kapalı - sadece superadmin
        
        # Muhasebe Modülü
        "muhasebe_view": True,
        "muhasebe_add_transaction": True,
        "muhasebe_edit_transaction": True,
        "muhasebe_delete_transaction": True,
        "muhasebe_archive": True,
        "muhasebe_export_pdf": True,
        "muhasebe_bulk_hakedis": True,
        
        # Kuryeler Modülü
        "kurye_add": True,
        "kurye_edit": True,
        "kurye_remove": False,  # Tehlikeli işlem - default kapalı
        "kurye_deactivate": True,
        "kurye_start_termination": False,  # Tehlikeli işlem - default kapalı
        "kurye_cancel_termination": True,
        
        # Zimmet Modülü
        "zimmet_view": True,
        "zimmet_add_product": True,
        "zimmet_edit_product": True,
        "zimmet_delete_product": False,  # Tehlikeli işlem - default kapalı
        "zimmet_assign": True,
        "zimmet_return": True,
        
        # Market (JetPuan) Modülü
        "market_view": True,
        "market_add_product": True,
        "market_edit_product": True,
        "market_delete_product": False,  # Tehlikeli işlem - default kapalı
        "market_manage_orders": True,
        "market_add_jetpuan": True,
        
        # Akademi Modülü
        "akademi_view": True,
        "akademi_add": True,
        "akademi_edit": True,
        "akademi_delete": False,  # Tehlikeli işlem - default kapalı
        
        # Vardiya Modülü
        "vardiya_view": True,
        "vardiya_add": True,
        "vardiya_delete": False,  # Tehlikeli işlem - default kapalı
        "vardiya_assign": True,
        
        # Sistem Ayarları
        "sistem_company_info": False,
        "sistem_email_settings": False,
        "sistem_backup": False,
        
        # Legacy uyumluluk için eski anahtarlar (migration için)
        "vardiya": True,
        "muhasebe": True,
        "zimmet": True,
        "kuryeler": True,
        "yoneticiler": False
    }


def get_superadmin_permissions():
    """Returns all permissions enabled for superadmin"""
    return {
        # Sayfa Erişimi
        "page_vardiya": True,
        "page_muhasebe": True,
        "page_zimmet": True,
        "page_kuryeler": True,
        "page_market": True,
        "page_akademi": True,
        "page_sistem": True,
        "page_yoneticiler": True,
        
        # Muhasebe Modülü
        "muhasebe_view": True,
        "muhasebe_add_transaction": True,
        "muhasebe_edit_transaction": True,
        "muhasebe_delete_transaction": True,
        "muhasebe_archive": True,
        "muhasebe_export_pdf": True,
        "muhasebe_bulk_hakedis": True,
        
        # Kuryeler Modülü
        "kurye_add": True,
        "kurye_edit": True,
        "kurye_remove": True,
        "kurye_deactivate": True,
        "kurye_start_termination": True,
        "kurye_cancel_termination": True,
        
        # Zimmet Modülü
        "zimmet_view": True,
        "zimmet_add_product": True,
        "zimmet_edit_product": True,
        "zimmet_delete_product": True,
        "zimmet_assign": True,
        "zimmet_return": True,
        
        # Market (JetPuan) Modülü
        "market_view": True,
        "market_add_product": True,
        "market_edit_product": True,
        "market_delete_product": True,
        "market_manage_orders": True,
        "market_add_jetpuan": True,
        
        # Akademi Modülü
        "akademi_view": True,
        "akademi_add": True,
        "akademi_edit": True,
        "akademi_delete": True,
        
        # Vardiya Modülü
        "vardiya_view": True,
        "vardiya_add": True,
        "vardiya_delete": True,
        "vardiya_assign": True,
        
        # Sistem Ayarları
        "sistem_company_info": True,
        "sistem_email_settings": True,
        "sistem_backup": True,
        
        # Legacy uyumluluk
        "vardiya": True,
        "muhasebe": True,
        "zimmet": True,
        "kuryeler": True,
        "yoneticiler": True
    }


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


class PermissionUpdate(BaseModel):
    permissions: dict


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
    permissions: dict
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
        "permissions": get_default_admin_permissions(),
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
        "permissions": get_superadmin_permissions(),
        "company_id": data.company_id,
        "email": data.email,
        "created_at": datetime.now(timezone.utc).isoformat()
    }
    await db.admins.insert_one(admin)
    return {"message": "Süper admin oluşturuldu", "id": admin["id"]}


@router.put("/admins/{admin_id}/permissions")
async def update_admin_permissions(admin_id: str, data: PermissionUpdate):
    result = await db.admins.update_one(
        {"id": admin_id, "role": "admin"},
        {"$set": {"permissions": data.permissions}}
    )
    if result.modified_count == 0:
        raise HTTPException(status_code=404, detail="Yönetici bulunamadı veya güncellenemedi")
    
    return {"message": "Yetkiler güncellendi"}


@router.post("/admins/migrate-permissions")
async def migrate_admin_permissions():
    """Migrate all admins to the new granular permission system"""
    admins = await db.admins.find({}).to_list(1000)
    migrated = 0
    
    for admin in admins:
        old_perms = admin.get("permissions", {})
        
        # Check if already migrated (has new permission keys)
        if "page_vardiya" in old_perms:
            continue
        
        # Determine base permissions based on role
        if admin.get("role") == "superadmin" or admin.get("role") == "systemadmin":
            new_perms = get_superadmin_permissions()
        else:
            new_perms = get_default_admin_permissions()
            
            # Apply old page-level permissions to both page access and module permissions
            if old_perms.get("vardiya") == False:
                new_perms["page_vardiya"] = False
                new_perms["vardiya_view"] = False
                new_perms["vardiya_add"] = False
                new_perms["vardiya_delete"] = False
                new_perms["vardiya_assign"] = False
            
            if old_perms.get("muhasebe") == False:
                new_perms["page_muhasebe"] = False
                new_perms["muhasebe_view"] = False
                new_perms["muhasebe_add_transaction"] = False
                new_perms["muhasebe_edit_transaction"] = False
                new_perms["muhasebe_delete_transaction"] = False
                new_perms["muhasebe_archive"] = False
                new_perms["muhasebe_export_pdf"] = False
                new_perms["muhasebe_bulk_hakedis"] = False
            
            if old_perms.get("zimmet") == False:
                new_perms["page_zimmet"] = False
                new_perms["zimmet_view"] = False
                new_perms["zimmet_add_product"] = False
                new_perms["zimmet_edit_product"] = False
                new_perms["zimmet_delete_product"] = False
                new_perms["zimmet_assign"] = False
                new_perms["zimmet_return"] = False
            
            if old_perms.get("kuryeler") == False:
                new_perms["page_kuryeler"] = False
                new_perms["kurye_add"] = False
                new_perms["kurye_edit"] = False
                new_perms["kurye_remove"] = False
                new_perms["kurye_deactivate"] = False
                new_perms["kurye_start_termination"] = False
                new_perms["kurye_cancel_termination"] = False
            
            if old_perms.get("yoneticiler") == True:
                new_perms["page_yoneticiler"] = True
        
        await db.admins.update_one(
            {"id": admin["id"]},
            {"$set": {"permissions": new_perms}}
        )
        migrated += 1
    
    return {"message": f"{migrated} yönetici izinleri yeni sisteme aktarıldı"}


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
    
    # Şifre değiştiyse session invalidate et
    if data.password:
        await invalidate_user_session(admin_id)
    
    return {"message": "Yönetici güncellendi", "password_changed": bool(data.password)}
