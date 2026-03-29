from fastapi import APIRouter, HTTPException, BackgroundTasks, Header, UploadFile, File, Depends
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
from utils.helpers import get_turkey_now, ensure_turkey_timezone, TURKEY_TZ
from services.r2_storage import upload_file_to_r2, get_r2_settings
from utils.jwt_utils import require_super_or_system

router = APIRouter(prefix="/api/backup", tags=["Backup"])


class BackupSchedule(BaseModel):
    enabled: bool
    hour: int  # 0-23
    email: str


class RestoreOptions(BaseModel):
    replace_existing: bool = False  # True: mevcut verileri sil, False: sadece eksikleri ekle


# Collections to backup - comprehensive list
BACKUP_COLLECTIONS = [
    # Temel veriler
    "companies",
    "admins", 
    "couriers",
    "company_couriers",
    # Vardiya
    "shifts",
    "shift_assignments",
    "shift_leaves",
    "leaves",
    # Muhasebe
    "transactions",
    "activity_logs",
    "invoices",
    "businesses",
    "vendors",
    "installment_products",
    "mali_bellek",
    "mali_bellek_logs",
    "invoice_shortfalls",
    "business_invoices",
    "issued_invoices",
    # Günlük Tahsilat ve Raporlar
    "daily_collections",
    "daily_comparisons",
    "daily_excel_reports",
    "admin_collection_status",
    # Zimmet
    "products",
    "product_types",
    "zimmet_assignments",
    "zimmet_logs",
    # JetPuan
    "jetpuan_products",
    "jetpuan_categories",
    "jetpuan_orders",
    "jetpuan_transactions",
    "jetpuan_settings",
    "jetpuan_balances",
    # Bildirimler
    "notifications",
    "dismissed_notifications",
    # Evraklar
    "documents",
    "courier_documents",
    # Akademi
    "academy_trainings",
    # Motosiklet
    "motorcycles",
    "motorcycle_maintenances",
    "dismissed_maintenance_notifications",
    # Ayarlar
    "bonus_settings",
    "email_settings",
    "company_settings",
    "backup_settings",
    "google_settings",
    # Sistem (opsiyonel - genelde yedeklenmez)
    "collection_reset_logs",
    "collection_status",
]


async def create_backup_zip(company_id: str) -> io.BytesIO:
    """Create a ZIP file containing all company data as JSON"""
    zip_buffer = io.BytesIO()
    
    with zipfile.ZipFile(zip_buffer, 'w', zipfile.ZIP_DEFLATED) as zip_file:
        backup_data = {
            "backup_info": {
                "company_id": company_id,
                "created_at": get_turkey_now(),
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
    auth: dict = Depends(require_super_or_system)
):
    """Export all company data as a ZIP file"""
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
    file: UploadFile = File(...),
    auth: dict = Depends(require_super_or_system),
    replace_existing: bool = False
):
    """Import company data from a backup ZIP file
    
    Args:
        company_id: Hedef şirket ID
        file: Yedek ZIP dosyası
        replace_existing: True ise mevcut verileri siler ve yedeği yükler
    """
    # Şirket kontrolü
    company = await db.companies.find_one({"id": company_id})
    if not company:
        raise HTTPException(status_code=404, detail="Şirket bulunamadı")
    
    # Dosya tipi kontrolü
    if not file.filename.endswith('.zip'):
        raise HTTPException(status_code=400, detail="Sadece ZIP dosyası yüklenebilir")
    
    try:
        # ZIP dosyasını oku
        content = await file.read()
        zip_buffer = io.BytesIO(content)
        
        with zipfile.ZipFile(zip_buffer, 'r') as zip_file:
            # Manifest kontrolü
            if 'manifest.json' not in zip_file.namelist():
                raise HTTPException(status_code=400, detail="Geçersiz yedek dosyası: manifest.json bulunamadı")
            
            manifest = json.loads(zip_file.read('manifest.json'))
            backup_info = manifest.get('backup_info', {})
            
            # Yedek bilgilerini logla
            backup_company_id = backup_info.get('company_id')
            backup_date = backup_info.get('backup_date')
            
            restored_counts = {}
            skipped_collections = []
            
            # Her koleksiyonu işle
            for filename in zip_file.namelist():
                if filename == 'manifest.json':
                    continue
                
                if not filename.endswith('.json'):
                    continue
                
                collection_name = filename.replace('.json', '')
                
                # Güvenlik: Sadece bilinen koleksiyonları yükle
                if collection_name not in BACKUP_COLLECTIONS:
                    skipped_collections.append(collection_name)
                    continue
                
                try:
                    data = json.loads(zip_file.read(filename))
                    
                    if not isinstance(data, list):
                        continue
                    
                    if len(data) == 0:
                        continue
                    
                    collection = db[collection_name]
                    
                    # company_id filtrelemesi gereken koleksiyonlar
                    company_filtered = [
                        "couriers", "company_couriers", "shifts", "shift_assignments",
                        "shift_leaves", "leaves", "transactions", "activity_logs",
                        "invoices", "businesses", "vendors", "installment_products",
                        "mali_bellek", "mali_bellek_logs", "products", "product_types",
                        "zimmet_assignments", "zimmet_logs", "jetpuan_products",
                        "jetpuan_categories", "jetpuan_orders", "jetpuan_transactions",
                        "notifications", "dismissed_notifications", "academy_trainings",
                        "bonus_settings", "email_settings", "company_settings", "backup_settings"
                    ]
                    
                    # Mevcut verileri sil (replace_existing ise)
                    if replace_existing and collection_name in company_filtered:
                        await collection.delete_many({"company_id": company_id})
                    
                    # Verileri yükle
                    inserted_count = 0
                    for doc in data:
                        # _id varsa kaldır
                        if '_id' in doc:
                            del doc['_id']
                        
                        # company_id'yi hedef şirkete güncelle
                        if collection_name in company_filtered:
                            doc['company_id'] = company_id
                        
                        # admins için özel kontrol - sadece şirketin adminlerini yükle
                        if collection_name == "admins":
                            if doc.get('company_id') != backup_company_id:
                                continue
                            doc['company_id'] = company_id
                            # Mevcut admin varsa atla
                            existing = await collection.find_one({"username": doc.get('username')})
                            if existing:
                                continue
                        
                        # companies koleksiyonu - güncelleme yap
                        if collection_name == "companies":
                            if doc.get('id') == backup_company_id:
                                # Şirket bilgilerini güncelle (id hariç)
                                update_data = {k: v for k, v in doc.items() if k not in ['id', '_id']}
                                if update_data:
                                    await collection.update_one(
                                        {"id": company_id},
                                        {"$set": update_data}
                                    )
                                    inserted_count = 1
                            continue
                        
                        # Duplikasyon kontrolü (id bazlı)
                        if not replace_existing and 'id' in doc:
                            existing = await collection.find_one({"id": doc['id']})
                            if existing:
                                continue
                        
                        await collection.insert_one(doc)
                        inserted_count += 1
                    
                    if inserted_count > 0:
                        restored_counts[collection_name] = inserted_count
                        
                except Exception as e:
                    print(f"Error restoring {collection_name}: {e}")
                    continue
            
            return {
                "message": "Yedek başarıyla yüklendi",
                "backup_info": {
                    "original_company_id": backup_company_id,
                    "backup_date": backup_date
                },
                "restored_collections": restored_counts,
                "skipped_collections": skipped_collections,
                "replace_mode": replace_existing
            }
            
    except zipfile.BadZipFile:
        raise HTTPException(status_code=400, detail="Geçersiz ZIP dosyası")
    except json.JSONDecodeError as e:
        raise HTTPException(status_code=400, detail=f"JSON parse hatası: {str(e)}")
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Yedek yükleme hatası: {str(e)}")


# --- Scheduled Backup Settings ---
@router.get("/company/{company_id}/schedule")
async def get_backup_schedule(
    company_id: str,
    auth: dict = Depends(require_super_or_system)
):
    """Get backup schedule settings"""
    settings = await db.backup_settings.find_one({"company_id": company_id}, {"_id": 0})
    if not settings:
        return {"enabled": False, "hour": 3, "email": "", "last_backup": None}
    return settings


@router.post("/company/{company_id}/schedule")
async def set_backup_schedule(
    company_id: str, 
    data: BackupSchedule,
    auth: dict = Depends(require_super_or_system)
):
    """Set backup schedule settings"""
    if data.hour < 0 or data.hour > 23:
        raise HTTPException(status_code=400, detail="Saat 0-23 arasında olmalı")
    
    settings = {
        "company_id": company_id,
        "enabled": data.enabled,
        "hour": data.hour,
        "email": data.email,
        "updated_at": get_turkey_now()
    }
    
    await db.backup_settings.update_one(
        {"company_id": company_id},
        {"$set": settings},
        upsert=True
    )
    
    return {"message": "Yedekleme ayarları kaydedildi"}


async def upload_backup_to_r2(company_id: str, company_name: str, zip_buffer: io.BytesIO) -> Optional[str]:
    """Upload backup file to Cloudflare R2"""
    try:
        r2_settings = await get_r2_settings()
        if not r2_settings.get("account_id"):
            print("R2 not configured for backup upload")
            return None
        
        filename = f"backups/{company_id}/{datetime.now().strftime('%Y%m%d_%H%M%S')}_backup.zip"
        
        # Reset buffer position
        zip_buffer.seek(0)
        file_content = zip_buffer.read()
        
        result = await upload_file_to_r2(
            file_content=file_content,
            file_key=filename,
            content_type='application/zip'
        )
        
        if result.get("success"):
            print(f"Backup uploaded to R2: {filename}")
            return result.get("url") or filename
        else:
            print(f"R2 upload failed: {result.get('error')}")
            return None
    except Exception as e:
        print(f"Failed to upload backup to R2: {e}")
        return None


async def send_backup_email(email: str, company_name: str, zip_buffer: io.BytesIO, r2_url: str = None):
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
        
        r2_info = ""
        if r2_url:
            r2_info = f"\n        Bulut Yedek: Cloudflare R2'ye de yüklendi."
        
        body = f"""
        Merhaba,
        
        {company_name} şirketinin günlük otomatik yedeği ekte yer almaktadır.
        
        Yedek Tarihi: {datetime.now().strftime('%d.%m.%Y %H:%M')}{r2_info}
        
        Bu yedek dosyasını güvenli bir yerde saklayınız.
        
        ShiftJet Kurye Yönetim Sistemi
        """
        
        msg.attach(MIMEText(body, 'plain', 'utf-8'))
        
        # Attach ZIP file
        zip_buffer.seek(0)  # Reset buffer position
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
        
        print(f"Backup email sent to {email}")
        return True
    except Exception as e:
        print(f"Failed to send backup email: {e}")
        return False


@router.post("/company/{company_id}/send-now")
async def send_backup_now(
    company_id: str, 
    background_tasks: BackgroundTasks,
    auth: dict = Depends(require_super_or_system)
):
    """Manually trigger backup email and R2 upload"""
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
        # First upload to R2
        zip_buffer.seek(0)
        r2_url = await upload_backup_to_r2(company_id, company["name"], zip_buffer)
        
        # Then send email
        zip_buffer.seek(0)
        success = await send_backup_email(settings["email"], company["name"], zip_buffer, r2_url)
        
        if success or r2_url:
            await db.backup_settings.update_one(
                {"company_id": company_id},
                {"$set": {
                    "last_backup": get_turkey_now(),
                    "last_r2_backup": r2_url if r2_url else None
                }}
            )
    
    background_tasks.add_task(send_task)
    
    return {"message": "Yedekleme e-postası gönderiliyor ve R2'ye yükleniyor"}


# --- Scheduled Backup Runner ---
async def run_scheduled_backups():
    """Run scheduled backups for all companies with enabled backup settings"""
    try:
        current_hour = datetime.now().hour
        print(f"Running scheduled backup check for hour {current_hour}")
        
        # Find all companies with backup enabled for this hour
        settings_list = await db.backup_settings.find({
            "enabled": True,
            "hour": current_hour
        }).to_list(100)
        
        for settings in settings_list:
            company_id = settings.get("company_id")
            email = settings.get("email")
            
            if not company_id or not email:
                continue
            
            company = await db.companies.find_one({"id": company_id})
            if not company:
                continue
            
            print(f"Running scheduled backup for company: {company.get('name')}")
            
            try:
                # Create backup
                zip_buffer = await create_backup_zip(company_id)
                
                # Upload to R2
                zip_buffer.seek(0)
                r2_url = await upload_backup_to_r2(company_id, company["name"], zip_buffer)
                
                # Send email
                zip_buffer.seek(0)
                success = await send_backup_email(email, company["name"], zip_buffer, r2_url)
                
                if success or r2_url:
                    await db.backup_settings.update_one(
                        {"company_id": company_id},
                        {"$set": {
                            "last_backup": get_turkey_now(),
                            "last_r2_backup": r2_url if r2_url else None
                        }}
                    )
                    print(f"Backup completed for {company.get('name')}")
            except Exception as e:
                print(f"Backup failed for {company.get('name')}: {e}")
                
    except Exception as e:
        print(f"Scheduled backup error: {e}")



@router.post("/test-mongodump")
async def test_mongodump(auth: dict = Depends(require_super_or_system)):
    """R2'ye test mongo dump yüklemesi yap"""
    from services.backup_service import _run_mongodump, _upload_backup, _list_r2_backups, R2_BACKUP_PREFIX
    from services.r2_storage import get_r2_settings
    
    result = {
        "r2_connected": False,
        "mongodump_ok": False,
        "upload_ok": False,
        "dump_size_mb": 0,
        "existing_backups": 0,
        "error": None
    }
    
    # 1. R2 bağlantı kontrolü
    try:
        settings = await get_r2_settings()
        if not settings.get("account_id") or not settings.get("access_key_id"):
            result["error"] = "R2 ayarları yapılandırılmamış"
            return result
        result["r2_connected"] = True
    except Exception as e:
        result["error"] = f"R2 bağlantı hatası: {str(e)}"
        return result
    
    # 2. mongodump test
    try:
        zip_data = _run_mongodump()
        result["mongodump_ok"] = True
        result["dump_size_mb"] = round(len(zip_data) / 1024 / 1024, 2)
    except Exception as e:
        result["error"] = f"mongodump hatası: {str(e)}"
        return result
    
    # 3. R2 upload test
    try:
        from datetime import datetime, timezone, timedelta
        now = datetime.now(timezone(timedelta(hours=3)))
        test_key = f"{R2_BACKUP_PREFIX}/test_{now.strftime('%Y%m%d_%H%M%S')}.zip"
        success = await _upload_backup(zip_data, test_key)
        result["upload_ok"] = success
        if not success:
            result["error"] = "R2 yükleme başarısız"
    except Exception as e:
        result["error"] = f"R2 yükleme hatası: {str(e)}"
        return result
    
    # 4. Mevcut yedek sayısı
    try:
        backups = await _list_r2_backups(f"{R2_BACKUP_PREFIX}/")
        result["existing_backups"] = len(backups)
        if backups:
            result["last_backup"] = backups[-1].get("Key", "")
            result["last_backup_size_mb"] = round(backups[-1].get("Size", 0) / 1024 / 1024, 2)
    except:
        pass
    
    return result


@router.get("/r2-backup-status")
async def get_r2_backup_status(auth: dict = Depends(require_super_or_system)):
    """R2'deki yedeklerin durumunu getir"""
    from services.backup_service import _list_r2_backups, R2_BACKUP_PREFIX, R2_DAILY_PREFIX
    
    frequent = await _list_r2_backups(f"{R2_BACKUP_PREFIX}/")
    daily = await _list_r2_backups(f"{R2_DAILY_PREFIX}/")
    
    def format_backup(b):
        return {
            "key": b.get("Key", ""),
            "size_mb": round(b.get("Size", 0) / 1024 / 1024, 2),
            "last_modified": b.get("LastModified", "").isoformat() if hasattr(b.get("LastModified", ""), "isoformat") else str(b.get("LastModified", ""))
        }
    
    return {
        "frequent_backups": [format_backup(b) for b in frequent],
        "daily_backups": [format_backup(b) for b in daily],
        "frequent_count": len(frequent),
        "daily_count": len(daily)
    }
