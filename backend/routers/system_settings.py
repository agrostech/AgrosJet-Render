"""
Sistem Ayarları Router
Cloudflare R2, SMTP ve diğer sistem ayarlarını yönetir.
Sadece System Admin (ShiftJet) erişebilir.
"""
from fastapi import APIRouter, HTTPException
from pydantic import BaseModel
from typing import Optional
from datetime import datetime, timezone

from utils.database import db
from utils.helpers import get_turkey_now, ensure_turkey_timezone, TURKEY_TZ

router = APIRouter(prefix="/api/system-settings", tags=["System Settings"])


# --- SMTP Settings Models ---
class SMTPSettings(BaseModel):
    smtp_host: str
    smtp_port: int = 587
    smtp_user: str
    smtp_password: str
    from_email: Optional[str] = None
    from_name: str = "AgrosJet"
    enabled: bool = True


class SMTPSettingsUpdate(BaseModel):
    smtp_host: Optional[str] = None
    smtp_port: Optional[int] = None
    smtp_user: Optional[str] = None
    smtp_password: Optional[str] = None
    from_email: Optional[str] = None
    from_name: Optional[str] = None
    enabled: Optional[bool] = None


class CloudflareR2Settings(BaseModel):
    account_id: str
    access_key_id: str
    secret_access_key: str
    bucket_name: str


class CloudflareR2SettingsUpdate(BaseModel):
    account_id: Optional[str] = None
    access_key_id: Optional[str] = None
    secret_access_key: Optional[str] = None
    bucket_name: Optional[str] = None


@router.get("/cloudflare-r2")
async def get_cloudflare_settings():
    """
    Cloudflare R2 ayarlarını getir.
    Secret key maskelenir.
    """
    settings = await db.system_settings.find_one(
        {"type": "cloudflare_r2"},
        {"_id": 0}
    )
    
    if not settings:
        return {
            "configured": False,
            "account_id": "",
            "access_key_id": "",
            "secret_access_key_masked": "",
            "bucket_name": ""
        }
    
    # Mask the secret key
    secret = settings.get("secret_access_key", "")
    masked_secret = f"{secret[:4]}...{secret[-4:]}" if len(secret) > 8 else "****"
    
    return {
        "configured": True,
        "account_id": settings.get("account_id", ""),
        "access_key_id": settings.get("access_key_id", ""),
        "secret_access_key_masked": masked_secret,
        "bucket_name": settings.get("bucket_name", ""),
        "updated_at": settings.get("updated_at")
    }


@router.post("/cloudflare-r2")
async def save_cloudflare_settings(data: CloudflareR2Settings):
    """
    Cloudflare R2 ayarlarını kaydet.
    """
    settings = {
        "type": "cloudflare_r2",
        "account_id": data.account_id,
        "access_key_id": data.access_key_id,
        "secret_access_key": data.secret_access_key,
        "bucket_name": data.bucket_name,
        "updated_at": get_turkey_now()
    }
    
    await db.system_settings.update_one(
        {"type": "cloudflare_r2"},
        {"$set": settings},
        upsert=True
    )
    
    return {"message": "Cloudflare R2 ayarları kaydedildi"}


@router.put("/cloudflare-r2")
async def update_cloudflare_settings(data: CloudflareR2SettingsUpdate):
    """
    Cloudflare R2 ayarlarını güncelle (sadece değişen alanlar).
    """
    existing = await db.system_settings.find_one({"type": "cloudflare_r2"})
    if not existing:
        raise HTTPException(status_code=404, detail="Önce ayarları kaydedin")
    
    update_data = {"updated_at": get_turkey_now()}
    
    if data.account_id:
        update_data["account_id"] = data.account_id
    if data.access_key_id:
        update_data["access_key_id"] = data.access_key_id
    if data.secret_access_key:
        update_data["secret_access_key"] = data.secret_access_key
    if data.bucket_name:
        update_data["bucket_name"] = data.bucket_name
    
    await db.system_settings.update_one(
        {"type": "cloudflare_r2"},
        {"$set": update_data}
    )
    
    return {"message": "Cloudflare R2 ayarları güncellendi"}


@router.post("/cloudflare-r2/test")
async def test_cloudflare_connection():
    """
    Cloudflare R2 bağlantısını test et.
    """
    settings = await db.system_settings.find_one(
        {"type": "cloudflare_r2"},
        {"_id": 0}
    )
    
    if not settings:
        raise HTTPException(status_code=400, detail="Cloudflare R2 ayarları yapılandırılmamış")
    
    try:
        import boto3
        from botocore.config import Config
        
        endpoint = f"https://{settings['account_id']}.r2.cloudflarestorage.com"
        
        client = boto3.client(
            's3',
            endpoint_url=endpoint,
            aws_access_key_id=settings['access_key_id'],
            aws_secret_access_key=settings['secret_access_key'],
            region_name='auto',
            config=Config(signature_version='s3v4')
        )
        
        # Try to list objects (limited to 1)
        response = client.list_objects_v2(
            Bucket=settings['bucket_name'],
            MaxKeys=1
        )
        
        return {
            "success": True,
            "message": "Bağlantı başarılı!",
            "bucket": settings['bucket_name'],
            "objects_count": response.get('KeyCount', 0)
        }
        
    except Exception as e:
        error_msg = str(e)
        if "SignatureDoesNotMatch" in error_msg:
            return {
                "success": False,
                "message": "İmza hatası - Access Key veya Secret Key yanlış"
            }
        elif "NoSuchBucket" in error_msg:
            return {
                "success": False,
                "message": "Bucket bulunamadı - Bucket adını kontrol edin"
            }
        elif "AccessDenied" in error_msg:
            return {
                "success": False,
                "message": "Erişim reddedildi - Token izinlerini kontrol edin"
            }
        else:
            return {
                "success": False,
                "message": f"Bağlantı hatası: {error_msg[:100]}"
            }


# ==================== SMTP AYARLARI ====================

@router.get("/smtp")
async def get_smtp_settings():
    """
    Sistem SMTP ayarlarını getir.
    Şifre maskelenir.
    """
    settings = await db.system_settings.find_one(
        {"type": "smtp"},
        {"_id": 0}
    )
    
    if not settings:
        return {
            "configured": False,
            "smtp_host": "",
            "smtp_port": 587,
            "smtp_user": "",
            "smtp_password_masked": "",
            "from_email": "",
            "from_name": "AgrosJet",
            "enabled": True
        }
    
    # Mask the password
    password = settings.get("smtp_password", "")
    masked_password = "***" + password[-4:] if len(password) > 4 else "****"
    
    return {
        "configured": True,
        "smtp_host": settings.get("smtp_host", ""),
        "smtp_port": settings.get("smtp_port", 587),
        "smtp_user": settings.get("smtp_user", ""),
        "smtp_password_masked": masked_password,
        "from_email": settings.get("from_email", ""),
        "from_name": settings.get("from_name", "AgrosJet"),
        "enabled": settings.get("enabled", True),
        "updated_at": settings.get("updated_at")
    }


@router.post("/smtp")
async def save_smtp_settings(data: SMTPSettings):
    """
    Sistem SMTP ayarlarını kaydet.
    """
    settings = {
        "type": "smtp",
        "smtp_host": data.smtp_host,
        "smtp_port": data.smtp_port,
        "smtp_user": data.smtp_user,
        "smtp_password": data.smtp_password,
        "from_email": data.from_email or data.smtp_user,
        "from_name": data.from_name,
        "enabled": data.enabled,
        "updated_at": get_turkey_now()
    }
    
    await db.system_settings.update_one(
        {"type": "smtp"},
        {"$set": settings},
        upsert=True
    )
    
    return {"message": "SMTP ayarları kaydedildi"}


@router.put("/smtp")
async def update_smtp_settings(data: SMTPSettingsUpdate):
    """
    Sistem SMTP ayarlarını güncelle (sadece değişen alanlar).
    """
    existing = await db.system_settings.find_one({"type": "smtp"})
    if not existing:
        raise HTTPException(status_code=404, detail="Önce SMTP ayarlarını kaydedin")
    
    update_data = {"updated_at": get_turkey_now()}
    
    if data.smtp_host is not None:
        update_data["smtp_host"] = data.smtp_host
    if data.smtp_port is not None:
        update_data["smtp_port"] = data.smtp_port
    if data.smtp_user is not None:
        update_data["smtp_user"] = data.smtp_user
    if data.smtp_password is not None and not data.smtp_password.startswith("***"):
        update_data["smtp_password"] = data.smtp_password
    if data.from_email is not None:
        update_data["from_email"] = data.from_email
    if data.from_name is not None:
        update_data["from_name"] = data.from_name
    if data.enabled is not None:
        update_data["enabled"] = data.enabled
    
    await db.system_settings.update_one(
        {"type": "smtp"},
        {"$set": update_data}
    )
    
    return {"message": "SMTP ayarları güncellendi"}


@router.post("/smtp/test")
async def test_smtp_connection(test_email: str = None):
    """
    SMTP bağlantısını test et.
    """
    settings = await db.system_settings.find_one(
        {"type": "smtp"},
        {"_id": 0}
    )
    
    if not settings:
        raise HTTPException(status_code=400, detail="SMTP ayarları yapılandırılmamış")
    
    if not settings.get("enabled"):
        raise HTTPException(status_code=400, detail="SMTP devre dışı")
    
    try:
        import smtplib
        import ssl
        from email.mime.text import MIMEText
        from email.mime.multipart import MIMEMultipart
        
        # Test email recipient
        to_email = test_email or settings.get("smtp_user")
        
        msg = MIMEMultipart("alternative")
        msg["Subject"] = "[AgrosJet] SMTP Test"
        msg["From"] = f"{settings.get('from_name', 'AgrosJet')} <{settings.get('from_email', settings['smtp_user'])}>"
        msg["To"] = to_email
        
        html_body = """
        <div style="font-family: sans-serif; padding: 20px;">
            <h2>AgrosJet Sistem E-posta Testi</h2>
            <p>Bu bir test e-postasıdır. Sistem SMTP ayarları başarıyla yapılandırılmıştır.</p>
            <p style="color: #22c55e; font-weight: bold;">✓ Bağlantı Başarılı</p>
        </div>
        """
        
        part = MIMEText(html_body, "html", "utf-8")
        msg.attach(part)
        
        context = ssl.create_default_context()
        
        with smtplib.SMTP(settings["smtp_host"], settings.get("smtp_port", 587)) as server:
            server.starttls(context=context)
            server.login(settings["smtp_user"], settings["smtp_password"])
            server.sendmail(settings.get("from_email", settings["smtp_user"]), to_email, msg.as_string())
        
        return {
            "success": True,
            "message": f"Test e-postası {to_email} adresine gönderildi"
        }
        
    except Exception as e:
        error_msg = str(e)
        if "Authentication" in error_msg:
            return {
                "success": False,
                "message": "Kimlik doğrulama hatası - Kullanıcı adı veya şifre yanlış. Gmail için App Password kullanın."
            }
        elif "Connection" in error_msg:
            return {
                "success": False,
                "message": f"Bağlantı hatası - {settings.get('smtp_host')}:{settings.get('smtp_port')} erişilemiyor"
            }
        else:
            return {
                "success": False,
                "message": f"E-posta gönderilemedi: {error_msg[:100]}"
            }
