"""
Backend Permission Enforcement Module
Granular permission checking for API endpoints
"""
from fastapi import HTTPException, Request, Header
from typing import Optional
from utils.database import db


# Permission definitions matching frontend
PERMISSIONS = {
    # Sayfa Erişimi
    "page_vardiya": "Vardiya sayfası",
    "page_muhasebe": "Muhasebe sayfası",
    "page_zimmet": "Zimmet sayfası",
    "page_kuryeler": "Kuryeler sayfası",
    "page_market": "JetPuan Market sayfası",
    "page_akademi": "Akademi sayfası",
    "page_sistem": "Sistem ayarları",
    "page_yoneticiler": "Yöneticiler sayfası",
    
    # Muhasebe Modülü
    "muhasebe_view": "İşlemleri görüntüleme",
    "muhasebe_add_transaction": "İşlem ekleme",
    "muhasebe_edit_transaction": "İşlem düzenleme",
    "muhasebe_delete_transaction": "İşlem silme",
    "muhasebe_archive": "Kurye/işletme arşivleme",
    "muhasebe_export_pdf": "PDF dışa aktarma",
    "muhasebe_bulk_hakedis": "Toplu hakediş işlemi",
    
    # Kuryeler Modülü
    "kurye_add": "Kurye ekleme",
    "kurye_edit": "Kurye bilgilerini düzenleme",
    "kurye_remove": "Kuryeyi şirketten çıkarma",
    "kurye_deactivate": "Kuryeyi pasife alma",
    "kurye_start_termination": "Fesih başlatma",
    "kurye_cancel_termination": "Fesih iptal",
    
    # Zimmet Modülü
    "zimmet_view": "Zimmetleri görüntüleme",
    "zimmet_add_product": "Ürün ekleme",
    "zimmet_edit_product": "Ürün düzenleme",
    "zimmet_delete_product": "Ürün silme",
    "zimmet_assign": "Zimmet atama",
    "zimmet_return": "Zimmet iade",
    
    # Market (JetPuan) Modülü
    "market_view": "Market görüntüleme",
    "market_add_product": "Ürün ekleme",
    "market_edit_product": "Ürün düzenleme",
    "market_delete_product": "Ürün silme",
    "market_manage_orders": "Sipariş yönetimi",
    "market_add_jetpuan": "JetPuan ekleme",
    
    # Akademi Modülü
    "akademi_view": "Eğitimleri görüntüleme",
    "akademi_add": "Eğitim ekleme",
    "akademi_edit": "Eğitim düzenleme",
    "akademi_delete": "Eğitim silme",
    
    # Vardiya Modülü
    "vardiya_view": "Vardiyaları görüntüleme",
    "vardiya_add": "Vardiya ekleme",
    "vardiya_delete": "Vardiya silme",
    "vardiya_assign": "Atama yapma",
    
    # Sistem Ayarları
    "sistem_company_info": "Şirket bilgileri düzenleme",
    "sistem_email_settings": "E-posta ayarları",
    "sistem_backup": "Yedekleme işlemleri",
}


async def get_admin_by_id(admin_id: str) -> Optional[dict]:
    """Get admin by ID"""
    admin = await db.admins.find_one({"id": admin_id}, {"_id": 0})
    return admin


async def check_permission(admin_id: str, permission_key: str) -> bool:
    """
    Check if admin has the specified permission.
    Superadmin and systemadmin always have all permissions.
    """
    if not admin_id:
        return False
    
    admin = await get_admin_by_id(admin_id)
    if not admin:
        return False
    
    # Superadmin and systemadmin have all permissions
    if admin.get("role") in ["superadmin", "systemadmin"]:
        return True
    
    permissions = admin.get("permissions", {})
    return permissions.get(permission_key, False)


async def check_page_access(admin_id: str, page_key: str) -> bool:
    """Check if admin can access a specific page"""
    return await check_permission(admin_id, f"page_{page_key}")


async def require_permission(
    admin_id: Optional[str] = None,
    permission_key: str = None
):
    """
    Dependency function to require a specific permission.
    Raises HTTPException 403 if permission denied.
    """
    if not admin_id:
        raise HTTPException(
            status_code=401,
            detail="Yetkilendirme gerekli"
        )
    
    if not permission_key:
        return True
    
    has_permission = await check_permission(admin_id, permission_key)
    if not has_permission:
        perm_name = PERMISSIONS.get(permission_key, permission_key)
        raise HTTPException(
            status_code=403,
            detail=f"Bu işlem için yetkiniz yok: {perm_name}"
        )
    
    return True


async def require_any_permission(
    admin_id: Optional[str] = None,
    permission_keys: list = None
):
    """
    Require at least one of the specified permissions.
    """
    if not admin_id:
        raise HTTPException(
            status_code=401,
            detail="Yetkilendirme gerekli"
        )
    
    if not permission_keys:
        return True
    
    admin = await get_admin_by_id(admin_id)
    if not admin:
        raise HTTPException(
            status_code=401,
            detail="Geçersiz yönetici"
        )
    
    # Superadmin and systemadmin have all permissions
    if admin.get("role") in ["superadmin", "systemadmin"]:
        return True
    
    permissions = admin.get("permissions", {})
    for key in permission_keys:
        if permissions.get(key, False):
            return True
    
    raise HTTPException(
        status_code=403,
        detail="Bu işlem için yetkiniz yok"
    )


async def require_superadmin(admin_id: Optional[str] = None):
    """
    Require superadmin or systemadmin role.
    """
    if not admin_id:
        raise HTTPException(
            status_code=401,
            detail="Yetkilendirme gerekli"
        )
    
    admin = await get_admin_by_id(admin_id)
    if not admin:
        raise HTTPException(
            status_code=401,
            detail="Geçersiz yönetici"
        )
    
    if admin.get("role") not in ["superadmin", "systemadmin"]:
        raise HTTPException(
            status_code=403,
            detail="Bu işlem sadece süper admin tarafından yapılabilir"
        )
    
    return True


def get_admin_id_from_header(x_admin_id: Optional[str] = Header(None, alias="X-Admin-Id")):
    """Extract admin ID from request header"""
    return x_admin_id
