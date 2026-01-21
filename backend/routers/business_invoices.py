"""
İşletme Faturaları (Alınan Faturalar) API
Restoran Raporu Excel'inden işletme fatura tutarlarını import eder
"""
from fastapi import APIRouter, HTTPException, UploadFile, File, Form
from datetime import datetime, timezone
from typing import Optional
import uuid
import base64
import openpyxl
from io import BytesIO

from utils.database import db

router = APIRouter(prefix="/api/business-invoices", tags=["İşletme Faturaları"])


# --- Get all business invoice records for a month ---
@router.get("/{company_id}/{year}/{month}")
async def get_business_invoices(company_id: str, year: int, month: int):
    """Get all business invoice records for a specific month"""
    records = await db.business_invoices.find(
        {"company_id": company_id, "year": year, "month": month},
        {"_id": 0}
    ).to_list(500)
    
    return records


# --- Get single business invoice record ---
@router.get("/{company_id}/{year}/{month}/{business_id}")
async def get_business_invoice(company_id: str, year: int, month: int, business_id: str):
    """Get a specific business invoice record"""
    record = await db.business_invoices.find_one(
        {
            "company_id": company_id,
            "year": year,
            "month": month,
            "business_id": business_id
        },
        {"_id": 0}
    )
    
    return record


# --- Upload Excel and import invoice amounts ---
@router.post("/{company_id}/import-excel")
async def import_excel(
    company_id: str,
    year: int = Form(...),
    month: int = Form(...),
    file: UploadFile = File(...)
):
    """
    Import business invoice amounts from Restoran Raporu.xlsx
    Reads 'Restoran Adı' and 'Banka/Kredi Kartı' columns
    """
    if not file.filename.endswith(('.xlsx', '.xls')):
        raise HTTPException(status_code=400, detail="Sadece Excel dosyası (.xlsx, .xls) yüklenebilir")
    
    try:
        content = await file.read()
        wb = openpyxl.load_workbook(BytesIO(content), data_only=True)
        ws = wb.active
        
        # Find header row - look for "Restoran Adı" in first 10 rows
        header_row = None
        restoran_col = None
        banka_col = None
        
        for row_idx in range(1, 11):
            for col_idx in range(1, 20):
                cell_value = ws.cell(row=row_idx, column=col_idx).value
                if cell_value and isinstance(cell_value, str):
                    cell_lower = cell_value.strip().lower()
                    if "restoran" in cell_lower and "ad" in cell_lower:
                        header_row = row_idx
                        restoran_col = col_idx
                    elif "banka" in cell_lower or "kredi" in cell_lower:
                        banka_col = col_idx
            
            if header_row and restoran_col and banka_col:
                break
        
        if not header_row or not restoran_col or not banka_col:
            raise HTTPException(
                status_code=400, 
                detail="Excel dosyasında 'Restoran Adı' ve 'Banka/Kredi Kartı' sütunları bulunamadı"
            )
        
        # Get all businesses for matching
        businesses = await db.businesses.find(
            {"company_id": company_id, "is_archived": {"$ne": True}},
            {"_id": 0, "id": 1, "name": 1}
        ).to_list(500)
        
        business_map = {b["name"].strip().lower(): b for b in businesses}
        
        # Parse data rows
        imported_count = 0
        not_found = []
        
        for row_idx in range(header_row + 1, ws.max_row + 1):
            restoran_name = ws.cell(row=row_idx, column=restoran_col).value
            banka_value = ws.cell(row=row_idx, column=banka_col).value
            
            if not restoran_name:
                continue
            
            restoran_name_clean = str(restoran_name).strip()
            restoran_name_lower = restoran_name_clean.lower()
            
            # Try to match business
            matched_business = business_map.get(restoran_name_lower)
            
            if not matched_business:
                # Try partial match
                for bname, bdata in business_map.items():
                    if restoran_name_lower in bname or bname in restoran_name_lower:
                        matched_business = bdata
                        break
            
            if not matched_business:
                not_found.append(restoran_name_clean)
                continue
            
            # Parse amount
            amount = 0.0
            if banka_value is not None:
                try:
                    if isinstance(banka_value, (int, float)):
                        amount = float(banka_value)
                    else:
                        # Clean string and parse
                        amount_str = str(banka_value).replace(',', '.').replace(' ', '').replace('₺', '').replace('TL', '')
                        amount = float(amount_str)
                except (ValueError, TypeError):
                    amount = 0.0
            
            # Update or create record
            existing = await db.business_invoices.find_one({
                "company_id": company_id,
                "year": year,
                "month": month,
                "business_id": matched_business["id"]
            })
            
            if existing:
                await db.business_invoices.update_one(
                    {"id": existing["id"]},
                    {"$set": {
                        "required_amount": amount,
                        "business_name": matched_business["name"],
                        "updated_at": datetime.now(timezone.utc).isoformat()
                    }}
                )
            else:
                record = {
                    "id": str(uuid.uuid4()),
                    "company_id": company_id,
                    "year": year,
                    "month": month,
                    "business_id": matched_business["id"],
                    "business_name": matched_business["name"],
                    "required_amount": amount,
                    "invoice_uploaded": False,
                    "invoice_file": None,
                    "invoice_filename": None,
                    "uploaded_at": None,
                    "created_at": datetime.now(timezone.utc).isoformat()
                }
                await db.business_invoices.insert_one(record)
            
            imported_count += 1
        
        return {
            "message": f"{imported_count} işletme için fatura tutarı aktarıldı",
            "imported_count": imported_count,
            "not_found": not_found[:10],  # First 10 not found
            "not_found_count": len(not_found)
        }
        
    except HTTPException:
        raise
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Excel işleme hatası: {str(e)}")


# --- Upload invoice PDF for a business ---
@router.post("/{company_id}/{year}/{month}/{business_id}/upload")
async def upload_invoice(
    company_id: str,
    year: int,
    month: int,
    business_id: str,
    file: UploadFile = File(...)
):
    """Upload the received invoice PDF from a business"""
    if not file.filename.lower().endswith(('.pdf', '.jpg', '.jpeg', '.png')):
        raise HTTPException(status_code=400, detail="Sadece PDF veya resim dosyası yüklenebilir")
    
    # Read file content
    content = await file.read()
    if len(content) > 10 * 1024 * 1024:  # 10MB limit
        raise HTTPException(status_code=400, detail="Dosya boyutu 10MB'dan büyük olamaz")
    
    # Convert to base64
    file_base64 = base64.b64encode(content).decode('utf-8')
    file_extension = file.filename.split('.')[-1].lower()
    
    # Find or create record
    existing = await db.business_invoices.find_one({
        "company_id": company_id,
        "year": year,
        "month": month,
        "business_id": business_id
    })
    
    if existing:
        await db.business_invoices.update_one(
            {"id": existing["id"]},
            {"$set": {
                "invoice_uploaded": True,
                "invoice_file": file_base64,
                "invoice_filename": file.filename,
                "invoice_extension": file_extension,
                "uploaded_at": datetime.now(timezone.utc).isoformat()
            }}
        )
    else:
        # Get business name
        business = await db.businesses.find_one({"id": business_id}, {"_id": 0, "name": 1})
        business_name = business["name"] if business else "Bilinmeyen"
        
        record = {
            "id": str(uuid.uuid4()),
            "company_id": company_id,
            "year": year,
            "month": month,
            "business_id": business_id,
            "business_name": business_name,
            "required_amount": 0,
            "invoice_uploaded": True,
            "invoice_file": file_base64,
            "invoice_filename": file.filename,
            "invoice_extension": file_extension,
            "uploaded_at": datetime.now(timezone.utc).isoformat(),
            "created_at": datetime.now(timezone.utc).isoformat()
        }
        await db.business_invoices.insert_one(record)
    
    return {"message": "Fatura yüklendi"}


# --- Download invoice file ---
@router.get("/{company_id}/{year}/{month}/{business_id}/download")
async def download_invoice(company_id: str, year: int, month: int, business_id: str):
    """Download the uploaded invoice file"""
    record = await db.business_invoices.find_one({
        "company_id": company_id,
        "year": year,
        "month": month,
        "business_id": business_id
    })
    
    if not record or not record.get("invoice_file"):
        raise HTTPException(status_code=404, detail="Fatura bulunamadı")
    
    return {
        "file_data": record["invoice_file"],
        "filename": record.get("invoice_filename", "fatura.pdf"),
        "extension": record.get("invoice_extension", "pdf")
    }


# --- Delete invoice file ---
@router.delete("/{company_id}/{year}/{month}/{business_id}/invoice")
async def delete_invoice(company_id: str, year: int, month: int, business_id: str):
    """Delete the uploaded invoice file"""
    result = await db.business_invoices.update_one(
        {
            "company_id": company_id,
            "year": year,
            "month": month,
            "business_id": business_id
        },
        {"$set": {
            "invoice_uploaded": False,
            "invoice_file": None,
            "invoice_filename": None,
            "uploaded_at": None
        }}
    )
    
    if result.modified_count == 0:
        raise HTTPException(status_code=404, detail="Kayıt bulunamadı")
    
    return {"message": "Fatura silindi"}


# --- Get company invoice details from system settings ---
@router.get("/company-details/{company_id}")
async def get_company_invoice_details(company_id: str):
    """Get company invoice details for WhatsApp message"""
    company = await db.companies.find_one(
        {"id": company_id},
        {"_id": 0, "name": 1, "tckn_vkn": 1, "address": 1, "tax_office": 1, "email": 1}
    )
    
    if not company:
        raise HTTPException(status_code=404, detail="Şirket bulunamadı")
    
    return company


# --- Set manual amount for a business ---
@router.post("/{company_id}/{year}/{month}/{business_id}/set-amount")
async def set_amount(
    company_id: str,
    year: int,
    month: int,
    business_id: str,
    data: dict
):
    """Manually set invoice amount for a business"""
    amount = data.get("amount", 0)
    
    # Get business name
    business = await db.businesses.find_one({"id": business_id}, {"_id": 0, "name": 1})
    if not business:
        raise HTTPException(status_code=404, detail="İşletme bulunamadı")
    
    existing = await db.business_invoices.find_one({
        "company_id": company_id,
        "year": year,
        "month": month,
        "business_id": business_id
    })
    
    if existing:
        await db.business_invoices.update_one(
            {"id": existing["id"]},
            {"$set": {
                "required_amount": amount,
                "updated_at": datetime.now(timezone.utc).isoformat()
            }}
        )
    else:
        record = {
            "id": str(uuid.uuid4()),
            "company_id": company_id,
            "year": year,
            "month": month,
            "business_id": business_id,
            "business_name": business["name"],
            "required_amount": amount,
            "invoice_uploaded": False,
            "invoice_file": None,
            "invoice_filename": None,
            "uploaded_at": None,
            "created_at": datetime.now(timezone.utc).isoformat()
        }
        await db.business_invoices.insert_one(record)
    
    return {"message": "Tutar kaydedildi"}
