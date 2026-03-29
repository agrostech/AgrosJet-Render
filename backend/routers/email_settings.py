"""
Email Settings Router
SMTP configuration for email notifications
"""
from fastapi import APIRouter, HTTPException, Depends
from pydantic import BaseModel
from typing import Optional
from datetime import datetime, timezone
import uuid

from utils.database import db
from utils.helpers import get_turkey_now, ensure_turkey_timezone, TURKEY_TZ
from utils.jwt_utils import require_admin

router = APIRouter(prefix="/api/email", tags=["Email Settings"], dependencies=[Depends(require_admin)])


# --- Pydantic Models ---
class EmailSettingsCreate(BaseModel):
    smtp_host: str
    smtp_port: int = 587
    smtp_user: str
    smtp_password: str
    from_email: Optional[str] = None
    from_name: str = "AgrosJet"
    enabled: bool = True
    # Bildirim türleri
    notify_muhasebe: bool = True      # Hakediş işlemleri
    notify_zimmet: bool = True        # Zimmet işlemleri
    notify_evrak: bool = True         # Evrak yüklemeleri
    notify_jetpuan: bool = True       # Market siparişleri
    notify_fesih: bool = True         # Fesih süreçleri
    # Otomatik atama bildirimleri
    notify_shift_violation: bool = False  # Vardiya ihlalleri
    notify_auto_cancel: bool = False      # Otomatik iptal


# --- Email Settings Routes ---
@router.get("/settings/{company_id}")
async def get_email_settings(company_id: str):
    """Get SMTP email settings for a company"""
    settings = await db.email_settings.find_one({"company_id": company_id}, {"_id": 0})
    if not settings:
        return {"exists": False}
    
    # Mask password
    masked_password = "***" + settings.get("smtp_password", "")[-4:] if settings.get("smtp_password") else ""
    
    return {
        "exists": True,
        "smtp_host": settings.get("smtp_host", ""),
        "smtp_port": settings.get("smtp_port", 587),
        "smtp_user": settings.get("smtp_user", ""),
        "smtp_password_masked": masked_password,
        "from_email": settings.get("from_email", ""),
        "from_name": settings.get("from_name", "AgrosJet"),
        "enabled": settings.get("enabled", True),
        # Bildirim türleri (varsayılan hepsi açık)
        "notify_muhasebe": settings.get("notify_muhasebe", True),
        "notify_zimmet": settings.get("notify_zimmet", True),
        "notify_evrak": settings.get("notify_evrak", True),
        "notify_jetpuan": settings.get("notify_jetpuan", True),
        "notify_fesih": settings.get("notify_fesih", True),
        # Otomatik atama bildirimleri (varsayılan kapalı)
        "notify_shift_violation": settings.get("notify_shift_violation", False),
        "notify_auto_cancel": settings.get("notify_auto_cancel", False),
        "created_at": settings.get("created_at", ""),
        "updated_at": settings.get("updated_at")
    }


@router.post("/settings/{company_id}")
async def save_email_settings(company_id: str, data: EmailSettingsCreate):
    """Save or update SMTP email settings"""
    existing = await db.email_settings.find_one({"company_id": company_id})
    
    now = get_turkey_now()
    
    if existing:
        update_data = {
            "smtp_host": data.smtp_host,
            "smtp_port": data.smtp_port,
            "smtp_user": data.smtp_user,
            "from_email": data.from_email or data.smtp_user,
            "from_name": data.from_name,
            "enabled": data.enabled,
            "notify_muhasebe": data.notify_muhasebe,
            "notify_zimmet": data.notify_zimmet,
            "notify_evrak": data.notify_evrak,
            "notify_jetpuan": data.notify_jetpuan,
            "notify_fesih": data.notify_fesih,
            "notify_shift_violation": data.notify_shift_violation,
            "notify_auto_cancel": data.notify_auto_cancel,
            "updated_at": now
        }
        # Only update password if not masked
        if data.smtp_password and not data.smtp_password.startswith("***"):
            update_data["smtp_password"] = data.smtp_password
        
        await db.email_settings.update_one(
            {"company_id": company_id},
            {"$set": update_data}
        )
        return {"message": "E-posta ayarları güncellendi"}
    else:
        settings = {
            "id": str(uuid.uuid4()),
            "company_id": company_id,
            "smtp_host": data.smtp_host,
            "smtp_port": data.smtp_port,
            "smtp_user": data.smtp_user,
            "smtp_password": data.smtp_password,
            "from_email": data.from_email or data.smtp_user,
            "from_name": data.from_name,
            "enabled": data.enabled,
            "notify_muhasebe": data.notify_muhasebe,
            "notify_zimmet": data.notify_zimmet,
            "notify_evrak": data.notify_evrak,
            "notify_jetpuan": data.notify_jetpuan,
            "notify_fesih": data.notify_fesih,
            "notify_shift_violation": data.notify_shift_violation,
            "notify_auto_cancel": data.notify_auto_cancel,
            "created_at": now
        }
        await db.email_settings.insert_one(settings)
        return {"message": "E-posta ayarları kaydedildi"}


@router.delete("/settings/{company_id}")
async def delete_email_settings(company_id: str):
    """Delete SMTP email settings"""
    await db.email_settings.delete_one({"company_id": company_id})
    return {"message": "E-posta ayarları silindi"}


@router.post("/test/{company_id}")
async def test_email(company_id: str):
    """Test SMTP email connection by sending a test email"""
    try:
        from services.email_service import EmailService, get_superadmin_email
        
        # Get super admin email
        email = await get_superadmin_email(company_id)
        if not email:
            raise HTTPException(status_code=400, detail="Süper admin e-posta adresi tanımlı değil. Profil sayfasından e-posta adresinizi ekleyin.")
        
        # Initialize and test
        service = EmailService()
        if not await service.load_settings(company_id):
            raise HTTPException(status_code=400, detail="SMTP ayarları eksik")
        
        # Send test email
        html_body = """
        <div style="font-family: sans-serif; padding: 20px;">
            <h2>AgrosJet E-posta Test</h2>
            <p>Bu bir test e-postasıdır. E-posta bildirimleri başarıyla yapılandırılmıştır.</p>
            <p style="color: #22c55e; font-weight: bold;">✓ Bağlantı Başarılı</p>
        </div>
        """
        
        result = service.send_email(email, "[AgrosJet] E-posta Test", html_body)
        
        if result.get("success"):
            return {"success": True, "message": f"Test e-postası {email} adresine gönderildi"}
        else:
            error_msg = result.get("error", "E-posta gönderilemedi")
            raise HTTPException(status_code=500, detail=error_msg)
            
    except HTTPException:
        raise
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"E-posta testi başarısız: {str(e)}")
