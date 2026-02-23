"""
Restoran Faturaları API (Restoran Paneli için)
- Kesilen faturalar: Restoranın kestiği, yöneticiye yüklediği faturalar
- Alınan faturalar: Yöneticinin kestiği, restoran tarafından görüntülenen faturalar
Cloudflare R2 entegrasyonu ile dosya depolama
"""
from fastapi import APIRouter, HTTPException, UploadFile, File, Form
from typing import Optional, List
from datetime import datetime, timezone, timedelta
import uuid
import base64
import re

from utils.database import db
from services.r2_storage import (
    upload_file_to_r2,
    download_file_from_r2,
    delete_file_from_r2
)

router = APIRouter(prefix="/api/restaurant-panel-invoices", tags=["Restoran Panel Faturaları"])

# R2 klasör prefix'i
R2_RESTAURANT_INVOICE_PREFIX = "RESTORAN_FATURALARI"

# Türkçe ay isimleri
TURKISH_MONTHS = {
    1: "Ocak", 2: "Subat", 3: "Mart", 4: "Nisan",
    5: "Mayis", 6: "Haziran", 7: "Temmuz", 8: "Agustos",
    9: "Eylul", 10: "Ekim", 11: "Kasim", 12: "Aralik"
}


def format_name_for_folder(name: str) -> str:
    """İsmi klasör için uygun formata çevir"""
    if not name:
        return "BILINMEYEN"
    replacements = {
        'ğ': 'g', 'Ğ': 'G', 'ü': 'u', 'Ü': 'U',
        'ş': 's', 'Ş': 'S', 'ı': 'i', 'İ': 'I',
        'ö': 'o', 'Ö': 'O', 'ç': 'c', 'Ç': 'C'
    }
    for tr, en in replacements.items():
        name = name.replace(tr, en)
    name = re.sub(r'[^a-zA-Z0-9_]', '_', name)
    return name.upper()


def get_turkish_month_folder(date: datetime = None) -> str:
    """Türkçe ay klasör adı"""
    if date is None:
        date = datetime.now(timezone(timedelta(hours=3)))
    month_name = TURKISH_MONTHS[date.month]
    return f"{month_name}_{date.year}"


# ========== Helpers ==========

async def get_company_work_hours(company_id: str) -> tuple:
    """Şirket açılış/kapanış saatlerini getir"""
    company = await db.companies.find_one(
        {"id": company_id},
        {"_id": 0, "opening_time": 1, "closing_time": 1}
    )
    if not company:
        return "09:00", "23:00"
    return company.get("opening_time", "09:00"), company.get("closing_time", "23:00")


# ========== Kesilen Faturalar (Restoran yükler) ==========

@router.get("/{restaurant_id}/issued")
async def get_restaurant_issued_invoices(restaurant_id: str):
    """
    Restoranın kesmesi gereken faturaları getir.
    Admin panelinde oluşturulan 'restaurant_invoices' kayıtları burada listelenir.
    """
    # Restoran bilgisini al
    restaurant = await db.restaurants.find_one(
        {"id": restaurant_id},
        {"_id": 0, "company_id": 1, "name": 1}
    )
    if not restaurant:
        raise HTTPException(status_code=404, detail="Restoran bulunamadı")
    
    company_id = restaurant.get("company_id")
    
    # Bu restorana ait fatura kayıtlarını getir (Admin panelinde oluşturulan)
    records = await db.restaurant_invoices.find(
        {"restaurant_id": restaurant_id, "company_id": company_id},
        {"_id": 0}
    ).sort("week_start", -1).to_list(50)
    
    turkey_tz = timezone(timedelta(hours=3))
    now = datetime.now(turkey_tz)
    
    result = []
    for record in records:
        # invoices array'inde restoran tarafından yüklenen fatura var mı?
        restaurant_invoice = None
        for inv in record.get("invoices", []):
            if inv.get("uploaded_by_restaurant"):
                restaurant_invoice = inv
                break
        
        # 30 dakika içinde silinebilir mi?
        can_delete = False
        if restaurant_invoice and restaurant_invoice.get("uploaded_at"):
            try:
                upload_time = datetime.fromisoformat(restaurant_invoice["uploaded_at"].replace('Z', '+00:00'))
                diff_minutes = (now - upload_time).total_seconds() / 60
                can_delete = diff_minutes <= 30 and not restaurant_invoice.get("verified", False)
            except (ValueError, TypeError):
                pass
        
        result.append({
            "id": record.get("id"),
            "week_start": record.get("week_start"),
            "week_end": record.get("week_end"),
            "week_label": record.get("week_label", ""),
            "total_amount": record.get("required_amount", 0),
            "order_count": record.get("order_count", 0),
            "created_at": record.get("created_at"),
            "invoice_uploaded": restaurant_invoice is not None,
            "invoice_id": restaurant_invoice.get("id") if restaurant_invoice else None,
            "invoice_filename": restaurant_invoice.get("filename") if restaurant_invoice else None,
            "invoice_verified": restaurant_invoice.get("verified", False) if restaurant_invoice else False,
            "invoice_amount": restaurant_invoice.get("amount") if restaurant_invoice else None,
            "can_delete": can_delete
        })
    
    return result


@router.post("/{restaurant_id}/issued/upload")
async def upload_restaurant_invoice(
    restaurant_id: str,
    missing_invoice_id: str = Form(...),
    week_label: str = Form(""),
    file: UploadFile = File(...)
):
    """Restoran fatura yükle - Cloudflare R2'ye kaydet"""
    # Restoran bilgisini al
    restaurant = await db.restaurants.find_one(
        {"id": restaurant_id},
        {"_id": 0, "company_id": 1, "name": 1}
    )
    if not restaurant:
        raise HTTPException(status_code=404, detail="Restoran bulunamadı")
    
    company_id = restaurant.get("company_id")
    restaurant_name = restaurant.get("name", "")
    
    # Şirket adını al
    company = await db.companies.find_one({"id": company_id}, {"_id": 0, "name": 1})
    company_name = company.get("name", "") if company else ""
    
    # Fatura kaydını kontrol et
    invoice_record = await db.restaurant_invoices.find_one(
        {"id": missing_invoice_id, "restaurant_id": restaurant_id}
    )
    if not invoice_record:
        raise HTTPException(status_code=404, detail="Fatura kaydı bulunamadı")
    
    # Dosya kontrolü
    contents = await file.read()
    if len(contents) > 10 * 1024 * 1024:
        raise HTTPException(status_code=400, detail="Dosya boyutu 10MB'ı geçemez")
    
    allowed_extensions = ["pdf"]
    ext = file.filename.split(".")[-1].lower() if "." in file.filename else ""
    if ext not in allowed_extensions:
        raise HTTPException(status_code=400, detail="Sadece PDF dosyaları kabul edilir")
    
    invoice_id = str(uuid.uuid4())
    turkey_tz = timezone(timedelta(hours=3))
    now = datetime.now(turkey_tz)
    
    # Klasör yapısı oluştur
    company_folder = format_name_for_folder(company_name) if company_name else company_id
    restaurant_folder = format_name_for_folder(restaurant_name) if restaurant_name else restaurant_id
    month_folder = get_turkish_month_folder(now)
    
    # R2 Key: RESTORAN_FATURALARI/SIRKET_ADI/RESTORAN_ADI/Subat_2026/dosya.pdf
    r2_key = f"{R2_RESTAURANT_INVOICE_PREFIX}/{company_folder}/{restaurant_folder}/{month_folder}/{file.filename}"
    upload_result = await upload_file_to_r2(contents, r2_key, "application/pdf")
    
    if not upload_result.get("success"):
        # R2 başarısız olursa base64 olarak kaydet (fallback)
        new_invoice = {
            "id": invoice_id,
            "filename": file.filename,
            "file_data": base64.b64encode(contents).decode("utf-8"),
            "extension": ext,
            "storage_type": "base64",
            "amount": invoice_record.get("required_amount", 0),
            "uploaded_at": now.isoformat(),
            "uploaded_by_restaurant": True,
            "verified": False
        }
    else:
        # R2'de başarıyla kaydedildi
        new_invoice = {
            "id": invoice_id,
            "filename": file.filename,
            "r2_key": r2_key,
            "extension": ext,
            "storage_type": "r2",
            "amount": invoice_record.get("required_amount", 0),
            "uploaded_at": now.isoformat(),
            "uploaded_by_restaurant": True,
            "verified": False
        }
    
    # invoices array'ine ekle
    await db.restaurant_invoices.update_one(
        {"id": missing_invoice_id},
        {"$push": {"invoices": new_invoice}}
    )
    
    return {"success": True, "invoice_id": new_invoice["id"]}


@router.delete("/{restaurant_id}/issued/{invoice_id}")
async def delete_restaurant_invoice(restaurant_id: str, invoice_id: str):
    """
    Restoran kendi yüklediği faturayı siler.
    Sadece 30 dakika içinde silinebilir.
    """
    # Fatura kaydını bul
    record = await db.restaurant_invoices.find_one(
        {
            "restaurant_id": restaurant_id,
            "invoices.id": invoice_id
        },
        {"_id": 0}
    )
    
    if not record:
        raise HTTPException(status_code=404, detail="Fatura bulunamadı")
    
    # Faturayı bul ve süre kontrolü yap
    invoice = None
    for inv in record.get("invoices", []):
        if inv.get("id") == invoice_id:
            invoice = inv
            break
    
    if not invoice:
        raise HTTPException(status_code=404, detail="Fatura bulunamadı")
    
    # Restoran tarafından yüklenmiş mi kontrol et
    if not invoice.get("uploaded_by_restaurant"):
        raise HTTPException(status_code=403, detail="Bu faturayı silme yetkiniz yok")
    
    # 30 dakika kontrolü
    uploaded_at = invoice.get("uploaded_at")
    if uploaded_at:
        try:
            turkey_tz = timezone(timedelta(hours=3))
            upload_time = datetime.fromisoformat(uploaded_at.replace('Z', '+00:00'))
            now = datetime.now(turkey_tz)
            diff_minutes = (now - upload_time).total_seconds() / 60
            
            if diff_minutes > 30:
                raise HTTPException(status_code=403, detail="Fatura yüklendikten 30 dakika sonra silinemez")
        except ValueError:
            pass
    
    # R2'den sil (eğer R2'de kayıtlıysa)
    if invoice.get("storage_type") == "r2" and invoice.get("r2_key"):
        await delete_file_from_r2(invoice["r2_key"])
    
    # Faturayı sil
    await db.restaurant_invoices.update_one(
        {"restaurant_id": restaurant_id, "invoices.id": invoice_id},
        {"$pull": {"invoices": {"id": invoice_id}}}
    )
    
    return {"success": True, "message": "Fatura silindi"}


@router.get("/{restaurant_id}/issued/download/{invoice_id}")
async def download_restaurant_invoice(restaurant_id: str, invoice_id: str):
    """Restoran faturasını indir - R2 veya base64'ten"""
    # Fatura kaydını bul
    record = await db.restaurant_invoices.find_one(
        {
            "restaurant_id": restaurant_id,
            "invoices.id": invoice_id
        },
        {"_id": 0, "invoices": 1}
    )
    
    if not record:
        raise HTTPException(status_code=404, detail="Fatura bulunamadı")
    
    # invoices array'inden belirli faturayı bul
    invoice = None
    for inv in record.get("invoices", []):
        if inv.get("id") == invoice_id:
            invoice = inv
            break
    
    if not invoice:
        raise HTTPException(status_code=404, detail="Fatura bulunamadı")
    
    # R2'den mi base64'ten mi?
    storage_type = invoice.get("storage_type", "base64")
    
    if storage_type == "r2" and invoice.get("r2_key"):
        # R2'den indir
        file_content = await download_file_from_r2(invoice["r2_key"])
        if file_content:
            file_data = base64.b64encode(file_content).decode("utf-8")
            return {
                "filename": invoice.get("filename"),
                "file_data": file_data,
                "extension": invoice.get("extension", "pdf")
            }
        else:
            raise HTTPException(status_code=404, detail="Dosya R2'de bulunamadı")
    else:
        # Base64 olarak kayıtlı
        return {
            "filename": invoice.get("filename"),
            "file_data": invoice.get("file_data", ""),
            "extension": invoice.get("extension", "pdf")
        }


# ========== Alınan Faturalar (Yönetici yükler, restoran görür) ==========

@router.get("/{restaurant_id}/received")
async def get_restaurant_received_invoices(restaurant_id: str):
    """
    Restoranın aldığı faturaları getir.
    Admin panelinde 'Kesilen Faturalar' sekmesinden yüklenen faturalar.
    """
    # Restoran bilgisini al
    restaurant = await db.restaurants.find_one(
        {"id": restaurant_id},
        {"_id": 0, "company_id": 1}
    )
    if not restaurant:
        raise HTTPException(status_code=404, detail="Restoran bulunamadı")
    
    company_id = restaurant.get("company_id")
    
    # Bu restorana kesilen faturaları getir
    invoices = await db.issued_invoices.find(
        {"company_id": company_id, "restaurant_id": restaurant_id},
        {"_id": 0}
    ).sort("week_start", -1).to_list(50)
    
    return invoices


@router.get("/{restaurant_id}/received/download/{invoice_id}")
async def download_received_invoice(restaurant_id: str, invoice_id: str):
    """Alınan faturayı indir"""
    # Restoran bilgisini al
    restaurant = await db.restaurants.find_one(
        {"id": restaurant_id},
        {"_id": 0, "company_id": 1}
    )
    if not restaurant:
        raise HTTPException(status_code=404, detail="Restoran bulunamadı")
    
    invoice = await db.issued_invoices.find_one(
        {"id": invoice_id, "company_id": restaurant.get("company_id"), "restaurant_id": restaurant_id},
        {"_id": 0}
    )
    
    if not invoice:
        raise HTTPException(status_code=404, detail="Fatura bulunamadı")
    
    return {
        "filename": invoice.get("filename"),
        "file_data": invoice.get("file_data"),
        "extension": invoice.get("file_extension", "pdf")
    }
