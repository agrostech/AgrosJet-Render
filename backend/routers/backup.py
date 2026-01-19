from fastapi import APIRouter, HTTPException, BackgroundTasks, Header
from fastapi.responses import StreamingResponse
from pydantic import BaseModel
from typing import Optional
from datetime import datetime, timezone
import json
import io
import zipfile
import uuid
import smtplib
from email.mime.multipart import MIMEMultipart
from email.mime.base import MIMEBase
from email.mime.text import MIMEText
from email import encoders

from utils.database import db
from utils.permissions import require_permission

router = APIRouter(prefix="/api/backup", tags=["Backup"])


class BackupSchedule(BaseModel):
    enabled: bool
    hour: int  # 0-23
    email: str


# Collections to backup - comprehensive list
BACKUP_COLLECTIONS = [
    "companies",
    "admins", 
    "couriers",
    "company_couriers",
    "shifts",
    "shift_assignments",
    "shift_leaves",
    "transactions",  # accounting transactions
    "activity_logs",
    "invoices",
    "products",
    "product_types",
    "zimmet_assignments",
    "zimmet_logs",
    "jetpuan_products",
    "jetpuan_categories",
    "jetpuan_orders",
    "jetpuan_transactions",
    "notifications",
    "dismissed_notifications",
    "documents",
    "academy_trainings",
    "bonus_settings",
    "email_settings",
    "company_settings",
    "backup_settings",
    "installment_products",
    "businesses",
    "vendors"
]


async def create_backup_zip(company_id: str) -> io.BytesIO:
    """Create a ZIP file containing all company data as JSON"""
    zip_buffer = io.BytesIO()
    
    with zipfile.ZipFile(zip_buffer, 'w', zipfile.ZIP_DEFLATED) as zip_file:
        backup_data = {
            "backup_info": {
                "company_id": company_id,
                "created_at": datetime.now(timezone.utc).isoformat(),
                "version": "1.0"
            }
        }
        
        for collection_name in BACKUP_COLLECTIONS:
            try:
                collection = db[collection_name]
                
                # Filter by company_id where applicable
                if collection_name in ["companies"]:
                    query = {"id": company_id}
                elif collection_name in ["admins", "couriers"]:
                    # Get from company_couriers relation
                    if collection_name == "couriers":
                        relations = await db.company_couriers.find({"company_id": company_id}).to_list(10000)
                        courier_ids = [r["courier_id"] for r in relations]
                        query = {"id": {"$in": courier_ids}}
                    else:
                        query = {"company_id": company_id}
                else:
                    query = {"company_id": company_id}
                
                docs = await collection.find(query, {"_id": 0}).to_list(100000)
                
                if docs:
                    # Remove sensitive data
                    for doc in docs:
                        if "password" in doc:
                            doc["password"] = "[ENCRYPTED]"
                    
                    json_content = json.dumps(docs, ensure_ascii=False, indent=2, default=str)
                    zip_file.writestr(f"{collection_name}.json", json_content)
                    backup_data[collection_name] = len(docs)
            except Exception as e:
                print(f"Error backing up {collection_name}: {e}")
        
        # Write manifest
        zip_file.writestr("manifest.json", json.dumps(backup_data, ensure_ascii=False, indent=2))
    
    zip_buffer.seek(0)
    return zip_buffer


@router.get("/company/{company_id}/export")
async def export_company_data(
    company_id: str,
    x_admin_id: Optional[str] = Header(None, alias="X-Admin-Id")
):
    """Export all company data as a ZIP file"""
    await require_permission(x_admin_id, "sistem_backup")
    # Verify company exists
    company = await db.companies.find_one({"id": company_id})
    if not company:
        raise HTTPException(status_code=404, detail="Şirket bulunamadı")
    
    zip_buffer = await create_backup_zip(company_id)
    
    filename = f"backup_{company['name'].replace(' ', '_')}_{datetime.now().strftime('%Y%m%d_%H%M%S')}.zip"
    
    return StreamingResponse(
        zip_buffer,
        media_type="application/zip",
        headers={"Content-Disposition": f"attachment; filename={filename}"}
    )


@router.post("/company/{company_id}/import")
async def import_company_data(
    company_id: str,
    x_admin_id: Optional[str] = Header(None, alias="X-Admin-Id")
):
    """Import company data from a backup file"""
    await require_permission(x_admin_id, "sistem_backup")
    # TODO: Implement import functionality
    raise HTTPException(status_code=501, detail="Import özelliği yakında eklenecek")


# --- Scheduled Backup Settings ---
@router.get("/company/{company_id}/schedule")
async def get_backup_schedule(
    company_id: str,
    x_admin_id: Optional[str] = Header(None, alias="X-Admin-Id")
):
    """Get backup schedule settings"""
    await require_permission(x_admin_id, "sistem_backup")
    settings = await db.backup_settings.find_one({"company_id": company_id}, {"_id": 0})
    if not settings:
        return {"enabled": False, "hour": 3, "email": "", "last_backup": None}
    return settings


@router.post("/company/{company_id}/schedule")
async def set_backup_schedule(
    company_id: str, 
    data: BackupSchedule,
    x_admin_id: Optional[str] = Header(None, alias="X-Admin-Id")
):
    """Set backup schedule settings"""
    await require_permission(x_admin_id, "sistem_backup")
    if data.hour < 0 or data.hour > 23:
        raise HTTPException(status_code=400, detail="Saat 0-23 arasında olmalı")
    
    settings = {
        "company_id": company_id,
        "enabled": data.enabled,
        "hour": data.hour,
        "email": data.email,
        "updated_at": datetime.now(timezone.utc).isoformat()
    }
    
    await db.backup_settings.update_one(
        {"company_id": company_id},
        {"$set": settings},
        upsert=True
    )
    
    return {"message": "Yedekleme ayarları kaydedildi"}


async def send_backup_email(email: str, company_name: str, zip_buffer: io.BytesIO):
    """Send backup file via email"""
    try:
        # Get email settings
        email_settings = await db.email_settings.find_one({})
        if not email_settings or not email_settings.get("smtp_enabled"):
            print("SMTP not configured for backup email")
            return False
        
        msg = MIMEMultipart()
        msg['From'] = email_settings.get("smtp_from_email", "noreply@shiftjet.com")
        msg['To'] = email
        msg['Subject'] = f"ShiftJet Yedekleme - {company_name} - {datetime.now().strftime('%d.%m.%Y')}"
        
        body = f"""
        Merhaba,
        
        {company_name} şirketinin günlük otomatik yedeği ekte yer almaktadır.
        
        Yedek Tarihi: {datetime.now().strftime('%d.%m.%Y %H:%M')}
        
        Bu yedek dosyasını güvenli bir yerde saklayınız.
        
        ShiftJet Kurye Yönetim Sistemi
        """
        
        msg.attach(MIMEText(body, 'plain', 'utf-8'))
        
        # Attach ZIP file
        filename = f"backup_{company_name.replace(' ', '_')}_{datetime.now().strftime('%Y%m%d')}.zip"
        attachment = MIMEBase('application', 'zip')
        attachment.set_payload(zip_buffer.read())
        encoders.encode_base64(attachment)
        attachment.add_header('Content-Disposition', f'attachment; filename="{filename}"')
        msg.attach(attachment)
        
        # Send email
        with smtplib.SMTP(email_settings["smtp_host"], email_settings["smtp_port"]) as server:
            if email_settings.get("smtp_use_tls"):
                server.starttls()
            if email_settings.get("smtp_username") and email_settings.get("smtp_password"):
                server.login(email_settings["smtp_username"], email_settings["smtp_password"])
            server.send_message(msg)
        
        return True
    except Exception as e:
        print(f"Failed to send backup email: {e}")
        return False


@router.post("/company/{company_id}/send-now")
async def send_backup_now(
    company_id: str, 
    background_tasks: BackgroundTasks,
    x_admin_id: Optional[str] = Header(None, alias="X-Admin-Id")
):
    """Manually trigger backup email"""
    await require_permission(x_admin_id, "sistem_backup")
    company = await db.companies.find_one({"id": company_id})
    if not company:
        raise HTTPException(status_code=404, detail="Şirket bulunamadı")
    
    settings = await db.backup_settings.find_one({"company_id": company_id})
    if not settings or not settings.get("email"):
        raise HTTPException(status_code=400, detail="E-posta adresi ayarlanmamış")
    
    # Create backup
    zip_buffer = await create_backup_zip(company_id)
    
    # Send in background
    async def send_task():
        success = await send_backup_email(settings["email"], company["name"], zip_buffer)
        if success:
            await db.backup_settings.update_one(
                {"company_id": company_id},
                {"$set": {"last_backup": datetime.now(timezone.utc).isoformat()}}
            )
    
    background_tasks.add_task(send_task)
    
    return {"message": "Yedekleme e-postası gönderiliyor"}
