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

from utils.database import db
from services.r2_storage import (
    upload_file_to_r2,
    download_file_from_r2,
    delete_file_from_r2
)

router = APIRouter(prefix="/api/restaurant-panel-invoices", tags=["Restoran Panel Faturaları"])


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
    """Restoran fatura yükle - restaurant_invoices içindeki invoices array'ine ekler"""
    # Restoran bilgisini al
    restaurant = await db.restaurants.find_one(
        {"id": restaurant_id},
        {"_id": 0, "company_id": 1, "name": 1}
    )
    if not restaurant:
        raise HTTPException(status_code=404, detail="Restoran bulunamadı")
    
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
    
    # Yeni fatura verisi
    new_invoice = {
        "id": str(uuid.uuid4()),
        "filename": file.filename,
        "file_data": base64.b64encode(contents).decode("utf-8"),
        "extension": ext,
        "amount": invoice_record.get("required_amount", 0),
        "uploaded_at": datetime.now(timezone(timedelta(hours=3))).isoformat(),
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
    
    # Faturayı sil
    await db.restaurant_invoices.update_one(
        {"restaurant_id": restaurant_id, "invoices.id": invoice_id},
        {"$pull": {"invoices": {"id": invoice_id}}}
    )
    
    return {"success": True, "message": "Fatura silindi"}


@router.get("/{restaurant_id}/issued/download/{invoice_id}")
async def download_restaurant_invoice(restaurant_id: str, invoice_id: str):
    """Restoran faturasını indir - invoices array'inden çeker"""
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
    
    return {
        "filename": invoice.get("filename"),
        "file_data": invoice.get("file_data"),
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
