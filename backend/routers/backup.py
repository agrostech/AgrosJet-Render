from fastapi import APIRouter, HTTPException, BackgroundTasks, Header, UploadFile, File
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
    "backup_settings"
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
    company_id: str
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
    company_id: str
):
    """Get backup schedule settings"""
    settings = await db.backup_settings.find_one({"company_id": company_id}, {"_id": 0})
    if not settings:
        return {"enabled": False, "hour": 3, "email": "", "last_backup": None}
    return settings


@router.post("/company/{company_id}/schedule")
async def set_backup_schedule(
    company_id: str, 
    data: BackupSchedule
):
    """Set backup schedule settings"""
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
    background_tasks: BackgroundTasks
):
    """Manually trigger backup email"""
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
