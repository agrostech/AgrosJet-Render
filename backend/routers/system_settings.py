"""
Sistem Ayarları Router
Cloudflare R2 ve diğer sistem ayarlarını yönetir.
Sadece System Admin (ShiftJet) erişebilir.
"""
from fastapi import APIRouter, HTTPException
from pydantic import BaseModel
from typing import Optional
from datetime import datetime, timezone

from utils.database import db
from utils.helpers import get_turkey_now, ensure_turkey_timezone, TURKEY_TZ

router = APIRouter(prefix="/api/system-settings", tags=["System Settings"])


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
        "updated_at": datetime.now(timezone.utc).isoformat()
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
    
    update_data = {"updated_at": datetime.now(timezone.utc).isoformat()}
    
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
