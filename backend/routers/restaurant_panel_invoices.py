"""
Restoran Faturaları API (Restoran Paneli için)
- Kesilen faturalar: Restoranın kestiği, yöneticiye yüklediği faturalar
- Alınan faturalar: Yöneticinin kestiği, restoran tarafından görüntülenen faturalar
"""
from fastapi import APIRouter, HTTPException, UploadFile, File, Form
from typing import Optional, List
from datetime import datetime, timezone, timedelta
import uuid
import base64

from utils.database import db

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
    Admin panelinde oluşturulan 'missing invoices' kayıtları burada listelenir.
    """
    # Restoran bilgisini al
    restaurant = await db.restaurants.find_one(
        {"id": restaurant_id},
        {"_id": 0, "company_id": 1, "name": 1}
    )
    if not restaurant:
        raise HTTPException(status_code=404, detail="Restoran bulunamadı")
    
    company_id = restaurant.get("company_id")
    
    # Bu restorana ait missing invoice kayıtlarını getir
    records = await db.missing_invoices.find(
        {"restaurant_id": restaurant_id},
        {"_id": 0}
    ).sort("week_start", -1).to_list(50)
    
    result = []
    for record in records:
        # Bu kayda ait yüklenen fatura var mı?
        invoice = await db.restaurant_invoices.find_one(
            {"missing_invoice_id": record.get("id")},
            {"_id": 0, "id": 1, "uploaded_at": 1, "filename": 1, "verified": 1, "amount": 1}
        )
        
        result.append({
            "id": record.get("id"),
            "week_start": record.get("week_start"),
            "week_end": record.get("week_end"),
            "week_label": record.get("week_label", ""),
            "total_amount": record.get("total_amount", 0),
            "order_count": record.get("order_count", 0),
            "created_at": record.get("created_at"),
            "invoice_uploaded": invoice is not None,
            "invoice_id": invoice.get("id") if invoice else None,
            "invoice_filename": invoice.get("filename") if invoice else None,
            "invoice_verified": invoice.get("verified", False) if invoice else False,
            "invoice_amount": invoice.get("amount") if invoice else None
        })
    
    return result


@router.post("/{restaurant_id}/issued/upload")
async def upload_restaurant_invoice(
    restaurant_id: str,
    missing_invoice_id: str = Form(...),
    week_label: str = Form(""),
    file: UploadFile = File(...)
):
    """Restoran fatura yükle"""
    # Restoran bilgisini al
    restaurant = await db.restaurants.find_one(
        {"id": restaurant_id},
        {"_id": 0, "company_id": 1, "name": 1}
    )
    if not restaurant:
        raise HTTPException(status_code=404, detail="Restoran bulunamadı")
    
    # Missing invoice kaydını kontrol et
    missing_record = await db.missing_invoices.find_one(
        {"id": missing_invoice_id, "restaurant_id": restaurant_id}
    )
    if not missing_record:
        raise HTTPException(status_code=404, detail="Fatura kaydı bulunamadı")
    
    # Dosya kontrolü
    contents = await file.read()
    if len(contents) > 10 * 1024 * 1024:
        raise HTTPException(status_code=400, detail="Dosya boyutu 10MB'ı geçemez")
    
    allowed_extensions = ["pdf", "png", "jpg", "jpeg"]
    ext = file.filename.split(".")[-1].lower() if "." in file.filename else ""
    if ext not in allowed_extensions:
        raise HTTPException(status_code=400, detail="Sadece PDF ve resim dosyaları kabul edilir")
    
    # Mevcut faturayı kontrol et
    existing = await db.restaurant_invoices.find_one({
        "missing_invoice_id": missing_invoice_id
    })
    
    invoice_id = existing.get("id") if existing else str(uuid.uuid4())
    
    invoice_data = {
        "id": invoice_id,
        "company_id": restaurant.get("company_id"),
        "restaurant_id": restaurant_id,
        "restaurant_name": restaurant.get("name"),
        "missing_invoice_id": missing_invoice_id,
        "week_start": missing_record.get("week_start"),
        "week_end": missing_record.get("week_end"),
        "week_label": week_label or missing_record.get("week_label", ""),
        "filename": file.filename,
        "file_data": base64.b64encode(contents).decode("utf-8"),
        "file_extension": ext,
        "uploaded_at": datetime.now(timezone.utc).isoformat(),
        "uploaded_by_restaurant": True,
        "verified": False
    }
    
    await db.restaurant_invoices.update_one(
        {"id": invoice_id},
        {"$set": invoice_data},
        upsert=True
    )
    
    return {"success": True, "invoice_id": invoice_id}


@router.get("/{restaurant_id}/issued/download/{invoice_id}")
async def download_restaurant_invoice(restaurant_id: str, invoice_id: str):
    """Restoran faturasını indir"""
    invoice = await db.restaurant_invoices.find_one(
        {"id": invoice_id, "restaurant_id": restaurant_id},
        {"_id": 0}
    )
    
    if not invoice:
        raise HTTPException(status_code=404, detail="Fatura bulunamadı")
    
    return {
        "filename": invoice.get("filename"),
        "file_data": invoice.get("file_data"),
        "extension": invoice.get("file_extension", "pdf")
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
