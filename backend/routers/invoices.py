from fastapi import APIRouter, HTTPException, UploadFile, File, Form, Depends
from fastapi.responses import FileResponse, StreamingResponse, Response
from datetime import datetime, timezone, timedelta
from pydantic import BaseModel
from typing import Optional, List
import uuid
import os
import io
import zipfile
import re
from pypdf import PdfWriter, PdfReader
from PIL import Image

from utils.database import db
from utils.helpers import get_turkey_now, ensure_turkey_timezone, TURKEY_TZ
from services.r2_storage import (
    upload_file_to_r2, 
    download_file_from_r2, 
    generate_presigned_url,
    delete_file_from_r2,
    check_file_exists
)

from utils.jwt_utils import require_admin, require_auth
router = APIRouter(prefix="/api/invoices", tags=["Invoices"], dependencies=[Depends(require_auth)])

# Legacy local upload dir (for backward compatibility)
UPLOAD_DIR = "/app/uploads/invoices"
os.makedirs(UPLOAD_DIR, exist_ok=True)

# R2 folder prefix for invoices (Turkish)
R2_INVOICE_PREFIX = "FATURALAR"

# Turkish month names
TURKISH_MONTHS = {
    1: "Ocak", 2: "Şubat", 3: "Mart", 4: "Nisan",
    5: "Mayıs", 6: "Haziran", 7: "Temmuz", 8: "Ağustos",
    9: "Eylül", 10: "Ekim", 11: "Kasım", 12: "Aralık"
}

def get_turkish_month_folder(date: datetime = None) -> str:
    """Get Turkish month folder name like 'Ocak 2025'"""
    if date is None:
        date = datetime.now(TURKEY_TZ)
    month_name = TURKISH_MONTHS[date.month]
    return f"{month_name} {date.year}"


def get_week_tuesday(date: datetime = None) -> datetime:
    """Get the Tuesday of the week for given date"""
    if date is None:
        date = datetime.now(TURKEY_TZ)
    
    # Monday = 0, Tuesday = 1, ..., Sunday = 6
    weekday = date.weekday()
    
    # Calculate days to Tuesday
    if weekday <= 1:  # Monday or Tuesday
        days_to_tuesday = 1 - weekday
    else:  # Wednesday to Sunday
        days_to_tuesday = 1 - weekday  # This will be negative, going back
    
    tuesday = date + timedelta(days=days_to_tuesday)
    return tuesday.replace(hour=0, minute=0, second=0, microsecond=0)


def format_courier_name_for_file(name: str) -> str:
    """Format courier name for file naming (remove spaces, Turkish chars)"""
    # Replace Turkish characters
    tr_chars = {'ı': 'i', 'İ': 'I', 'ğ': 'g', 'Ğ': 'G', 'ü': 'u', 'Ü': 'U', 
                'ş': 's', 'Ş': 'S', 'ö': 'o', 'Ö': 'O', 'ç': 'c', 'Ç': 'C'}
    for tr, en in tr_chars.items():
        name = name.replace(tr, en)
    
    # Remove spaces and special chars, keep only alphanumeric
    name = re.sub(r'[^a-zA-Z0-9]', '', name)
    return name


@router.post("/upload")
async def upload_invoice(
    transaction_id: str = Form(...),
    courier_id: str = Form(...),
    courier_name: str = Form(...),
    company_id: str = Form(...),
    is_shortfall_invoice: bool = Form(False),  # True if this is for shortfall
    file: UploadFile = File(...)
):
    """Upload invoice for a hakediş transaction - stores in Cloudflare R2"""
    
    # Validate file type - PDF ve resim dosyaları kabul edilir
    allowed_extensions = ('.pdf', '.jpg', '.jpeg', '.png', '.heic', '.heif')
    file_ext = os.path.splitext(file.filename.lower())[1]
    if file_ext not in allowed_extensions:
        raise HTTPException(status_code=400, detail="Sadece PDF veya resim dosyası (JPG, PNG, HEIC) yüklenebilir")
    
    # Check transaction exists and is hakediş
    transaction = await db.transactions.find_one({"id": transaction_id})
    if not transaction:
        raise HTTPException(status_code=404, detail="İşlem bulunamadı")
    
    if not transaction.get("is_hakedis"):
        raise HTTPException(status_code=400, detail="Bu işlem hakediş değil")
    
    # Check if invoice already exists for this transaction
    existing = await db.invoices.find_one({"transaction_id": transaction_id})
    
    # If this is a shortfall invoice, allow uploading even if invoice exists
    if existing and not is_shortfall_invoice and not transaction.get("has_shortfall"):
        raise HTTPException(status_code=400, detail="Bu işlem için zaten fatura yüklenmiş")
    
    # Get company name for folder structure
    company = await db.companies.find_one({"id": company_id}, {"_id": 0, "name": 1})
    company_folder = format_courier_name_for_file(company["name"]) if company else company_id
    
    # Get Tuesday of the week
    tuesday = get_week_tuesday()
    tuesday_str = tuesday.strftime("%d.%m.%Y")
    
    # Get Turkish month folder name
    month_folder = get_turkish_month_folder(tuesday)
    
    # Format file name: KuryeAdSoyad_DD.MM.YYYY.ext
    formatted_name = format_courier_name_for_file(courier_name)
    file_name = f"{formatted_name}_{tuesday_str}{file_ext}"
    
    # Create unique R2 key with company folder: FATURALAR/SirketAdi/Ocak 2025/filename
    invoice_id = str(uuid.uuid4())
    unique_id = invoice_id[:8]
    stored_file_name = f"{unique_id}_{file_name}"
    r2_key = f"{R2_INVOICE_PREFIX}/{company_folder}/{month_folder}/{stored_file_name}"
    
    # Read file content
    content = await file.read()
    
    # Boyut kontrolü - Fatura max 10MB
    if len(content) > 10 * 1024 * 1024:
        raise HTTPException(status_code=413, detail="Dosya boyutu 10MB'ı geçemez")
    
    # Determine content type
    content_types = {
        '.pdf': 'application/pdf',
        '.jpg': 'image/jpeg',
        '.jpeg': 'image/jpeg',
        '.png': 'image/png',
        '.heic': 'image/heic',
        '.heif': 'image/heif'
    }
    content_type = content_types.get(file_ext, 'application/octet-stream')
    
    # Upload to R2
    upload_result = await upload_file_to_r2(content, r2_key, content_type)
    if not upload_result['success']:
        raise HTTPException(status_code=503, detail="Dosya depolama servisi (Cloudflare R2) yapılandırılmamış. Sistem ayarlarından R2 bağlantısını yapın.")
    
    # Create invoice record with R2 reference
    invoice = {
        "id": invoice_id,
        "transaction_id": transaction_id,
        "courier_id": courier_id,
        "courier_name": courier_name,
        "company_id": company_id,
        "file_name": file_name,
        "stored_file_name": stored_file_name,
        "r2_key": r2_key,  # R2 storage key
        "storage_type": "r2",  # Indicate R2 storage
        "file_path": None,  # No local path for R2 files
        "week_tuesday": tuesday.isoformat(),
        "week_tuesday_display": tuesday_str,
        "uploaded_at": get_turkey_now(),
        "created_at": get_turkey_now(),
        "is_shortfall_invoice": is_shortfall_invoice,  # Mark if this is for shortfall
        "shortfall_amount": transaction.get("shortfall_amount", 0) if is_shortfall_invoice else None  # Store shortfall amount
    }
    await db.invoices.insert_one(invoice)
    
    # Update transaction - add to invoice_ids array instead of single invoice_id
    if is_shortfall_invoice:
        # For shortfall invoices, add to array
        await db.transactions.update_one(
            {"id": transaction_id},
            {"$addToSet": {"invoice_ids": invoice["id"]}}
        )
        
        # Update shortfall record status to "uploaded"
        shortfall_record = await db.invoice_shortfalls.find_one(
            {"original_transaction_id": transaction_id, "status": "pending"}
        )
        shortfall_amount_for_invoice = shortfall_record.get("shortfall_amount", 0) if shortfall_record else transaction.get("shortfall_amount", 0)
        
        # Update invoice with exact shortfall amount from record
        await db.invoices.update_one(
            {"id": invoice["id"]},
            {"$set": {"shortfall_amount": shortfall_amount_for_invoice}}
        )
        
        await db.invoice_shortfalls.update_one(
            {"original_transaction_id": transaction_id, "status": "pending"},
            {"$set": {
                "status": "uploaded",
                "shortfall_invoice_id": invoice["id"],
                "uploaded_at": get_turkey_now()
            }}
        )
        
        # Recalculate total invoiced and update transaction
        all_tx_invoices = await db.invoices.find(
            {"transaction_id": transaction_id},
            {"_id": 0, "verified_amount": 1}
        ).to_list(100)
        
        # For newly uploaded invoice, use transaction amount as estimate until verified
        total_invoiced = sum(inv.get("verified_amount", 0) for inv in all_tx_invoices if inv.get("verified_amount"))
        
        # Update transaction - shortfall still exists until admin verifies
        await db.transactions.update_one(
            {"id": transaction_id},
            {"$set": {
                "total_invoiced": total_invoiced,
                "pending_shortfall_invoice": True  # Flag that there's an unverified shortfall invoice
            }}
        )
    else:
        # For first invoice, set invoice_id
        await db.transactions.update_one(
            {"id": transaction_id},
            {"$set": {"invoice_id": invoice["id"]}}
        )
    
    # Create notification for admin
    notification = {
        "id": str(uuid.uuid4()),
        "company_id": company_id,
        "type": "invoice_uploaded",
        "title": "Hakediş Faturası Yüklendi" if not is_shortfall_invoice else "Eksik Fatura Yüklendi",
        "message": f"{courier_name} {'eksik ' if is_shortfall_invoice else ''}fatura yükledi",
        "is_read": False,
        "created_at": get_turkey_now(),
        "link": "/admin/muhasebe"
    }
    await db.notifications.insert_one(notification)
    
    return {
        "message": "Fatura başarıyla yüklendi",
        "invoice_id": invoice["id"],
        "file_name": file_name,
        "is_shortfall_invoice": is_shortfall_invoice
    }


@router.delete("/{invoice_id}")
async def delete_invoice(invoice_id: str, courier_id: str):
    """Delete invoice (only within 24 hours of upload)"""
    
    invoice = await db.invoices.find_one({"id": invoice_id})
    if not invoice:
        raise HTTPException(status_code=404, detail="Fatura bulunamadı")
    
    # Check ownership
    if invoice["courier_id"] != courier_id:
        raise HTTPException(status_code=403, detail="Bu faturayı silme yetkiniz yok")
    
    # Check 24 hour limit
    uploaded_at = datetime.fromisoformat(invoice["uploaded_at"].replace("Z", "+00:00"))
    now = datetime.now(TURKEY_TZ)
    hours_passed = (now - uploaded_at).total_seconds() / 3600
    
    if hours_passed > 24:
        raise HTTPException(status_code=400, detail="Fatura yüklendikten 24 saat sonra silinemez")
    
    # Delete file from R2 or local storage
    if invoice.get("storage_type") == "r2" and invoice.get("r2_key"):
        await delete_file_from_r2(invoice["r2_key"])
    elif invoice.get("file_path") and os.path.exists(invoice["file_path"]):
        os.remove(invoice["file_path"])
    
    # Remove invoice_id from transaction
    await db.transactions.update_one(
        {"id": invoice["transaction_id"]},
        {"$unset": {"invoice_id": ""}}
    )
    
    # Delete invoice record
    await db.invoices.delete_one({"id": invoice_id})
    
    return {"message": "Fatura silindi"}


@router.delete("/admin/{invoice_id}")
async def admin_delete_invoice(invoice_id: str):
    """Delete invoice (admin - no restrictions)"""
    
    invoice = await db.invoices.find_one({"id": invoice_id})
    if not invoice:
        raise HTTPException(status_code=404, detail="Fatura bulunamadı")
    
    # Delete file from R2 or local storage
    if invoice.get("storage_type") == "r2" and invoice.get("r2_key"):
        await delete_file_from_r2(invoice["r2_key"])
    elif invoice.get("file_path") and os.path.exists(invoice["file_path"]):
        os.remove(invoice["file_path"])
    
    # Remove invoice_id from transaction
    await db.transactions.update_one(
        {"id": invoice["transaction_id"]},
        {"$unset": {"invoice_id": ""}}
    )
    
    # Delete invoice record
    await db.invoices.delete_one({"id": invoice_id})
    
    return {"message": "Fatura silindi"}


@router.get("/courier/{courier_id}")
async def get_courier_invoices(courier_id: str):
    """Get all invoices for a courier"""
    invoices = await db.invoices.find(
        {"courier_id": courier_id},
        {"_id": 0}
    ).sort("uploaded_at", -1).to_list(100)
    
    # Enrich with transaction amounts
    tx_ids = [inv.get("transaction_id") for inv in invoices if inv.get("transaction_id")]
    if tx_ids:
        transactions = await db.transactions.find(
            {"id": {"$in": tx_ids}},
            {"_id": 0, "id": 1, "amount": 1, "description": 1}
        ).to_list(100)
        tx_map = {tx["id"]: tx for tx in transactions}
        
        for inv in invoices:
            tx = tx_map.get(inv.get("transaction_id"))
            if tx:
                inv["transaction_amount"] = tx.get("amount")
                inv["transaction_description"] = tx.get("description")
    
    return invoices


@router.get("/transaction/{transaction_id}")
async def get_transaction_invoice(transaction_id: str):
    """Get invoice for a specific transaction"""
    invoice = await db.invoices.find_one(
        {"transaction_id": transaction_id},
        {"_id": 0}
    )
    return invoice


@router.get("/company/{company_id}")
async def get_company_invoices(company_id: str, year: int = None, month: int = None):
    """Get all invoices for a company, optionally filtered by month"""
    query = {"company_id": company_id}
    
    if year and month:
        # Filter by month
        start_date = datetime(year, month, 1, tzinfo=timezone.utc)
        if month == 12:
            end_date = datetime(year + 1, 1, 1, tzinfo=timezone.utc)
        else:
            end_date = datetime(year, month + 1, 1, tzinfo=timezone.utc)
        
        query["uploaded_at"] = {
            "$gte": start_date.isoformat(),
            "$lt": end_date.isoformat()
        }
    
    invoices = await db.invoices.find(query, {"_id": 0}).sort("uploaded_at", -1).to_list(500)
    
    # Enrich with transaction amounts
    tx_ids = [inv.get("transaction_id") for inv in invoices if inv.get("transaction_id")]
    if tx_ids:
        transactions = await db.transactions.find(
            {"id": {"$in": tx_ids}},
            {"_id": 0, "id": 1, "amount": 1, "description": 1}
        ).to_list(500)
        tx_map = {tx["id"]: tx for tx in transactions}
        
        for inv in invoices:
            tx = tx_map.get(inv.get("transaction_id"))
            if tx:
                inv["transaction_amount"] = tx.get("amount")
                inv["transaction_description"] = tx.get("description")
    
    return invoices


@router.put("/{invoice_id}/verify")
async def verify_invoice(invoice_id: str):
    """Mark invoice as verified"""
    invoice = await db.invoices.find_one({"id": invoice_id})
    if not invoice:
        raise HTTPException(status_code=404, detail="Fatura bulunamadı")
    
    await db.invoices.update_one(
        {"id": invoice_id},
        {"$set": {
            "verified": True,
            "verified_at": get_turkey_now()
        }}
    )
    
    return {"message": "Fatura kontrol edildi olarak işaretlendi"}


@router.put("/{invoice_id}/unverify")
async def unverify_invoice(invoice_id: str):
    """Remove verified status from invoice"""
    invoice = await db.invoices.find_one({"id": invoice_id})
    if not invoice:
        raise HTTPException(status_code=404, detail="Fatura bulunamadı")
    
    await db.invoices.update_one(
        {"id": invoice_id},
        {"$set": {"verified": False}, "$unset": {"verified_at": ""}}
    )
    
    return {"message": "Fatura kontrol durumu kaldırıldı"}


@router.post("/{invoice_id}/verify-with-amount")
async def verify_invoice_with_amount(
    invoice_id: str,
    invoice_amount: float = Form(...),
    admin_id: str = Form(...),
    admin_name: str = Form(...)
):
    """Verify invoice with amount check - tracks shortfall if amount is less than expected"""
    invoice = await db.invoices.find_one({"id": invoice_id})
    if not invoice:
        raise HTTPException(status_code=404, detail="Fatura bulunamadı")
    
    # Get the original transaction
    transaction = await db.transactions.find_one({"id": invoice.get("transaction_id")})
    if not transaction:
        raise HTTPException(status_code=404, detail="İşlem bulunamadı")
    
    expected_amount = transaction.get("amount", 0)
    
    # Calculate total invoiced amount (including previously uploaded invoices for this transaction)
    existing_invoices = await db.invoices.find(
        {"transaction_id": transaction["id"]},
        {"_id": 0, "verified_amount": 1}
    ).to_list(100)
    
    # Sum up all verified amounts for this transaction
    total_invoiced = sum(inv.get("verified_amount", 0) for inv in existing_invoices if inv.get("verified_amount"))
    # Add current invoice amount (if not already counted)
    if not invoice.get("verified_amount"):
        total_invoiced += invoice_amount
    else:
        # Replace old verified amount with new one
        total_invoiced = total_invoiced - invoice.get("verified_amount", 0) + invoice_amount
    
    shortfall = expected_amount - total_invoiced
    
    # Update invoice with verified amount
    await db.invoices.update_one(
        {"id": invoice_id},
        {"$set": {
            "verified": True,
            "verified_at": get_turkey_now(),
            "verified_amount": invoice_amount,
            "verified_by_id": admin_id,
            "verified_by_name": admin_name
        }}
    )
    
    # Update transaction with shortfall info (no new transaction created)
    await db.transactions.update_one(
        {"id": transaction["id"]},
        {"$set": {
            "has_shortfall": shortfall > 0,
            "shortfall_amount": shortfall if shortfall > 0 else 0,
            "total_invoiced": total_invoiced,
            "last_verified_at": get_turkey_now(),
            "pending_shortfall_invoice": False  # Clear pending flag after verification
        }}
    )
    
    result = {
        "message": "Fatura kontrol edildi",
        "expected_amount": expected_amount,
        "invoice_amount": invoice_amount,
        "total_invoiced": total_invoiced,
        "shortfall": shortfall if shortfall > 0 else 0,
        "has_shortfall": shortfall > 0
    }
    
    # If shortfall exists, create/update shortfall record (NO new transaction)
    if shortfall > 0:
        # Check if shortfall record already exists for this transaction
        existing_shortfall = await db.invoice_shortfalls.find_one({
            "original_transaction_id": transaction["id"],
            "status": "pending"
        })
        
        if existing_shortfall:
            # Update existing shortfall record
            await db.invoice_shortfalls.update_one(
                {"id": existing_shortfall["id"]},
                {"$set": {
                    "shortfall_amount": shortfall,
                    "total_invoiced": total_invoiced,
                    "updated_at": get_turkey_now()
                }}
            )
            result["shortfall_record_id"] = existing_shortfall["id"]
        else:
            # Create new shortfall record
            shortfall_record = {
                "id": str(uuid.uuid4()),
                "original_invoice_id": invoice_id,
                "original_transaction_id": transaction["id"],
                "courier_id": invoice["courier_id"],
                "courier_name": invoice.get("courier_name", ""),
                "company_id": invoice["company_id"],
                "expected_amount": expected_amount,
                "total_invoiced": total_invoiced,
                "shortfall_amount": shortfall,
                "status": "pending",  # pending -> completed
                "created_at": get_turkey_now(),
                "created_by_id": admin_id,
                "created_by_name": admin_name
            }
            await db.invoice_shortfalls.insert_one(shortfall_record)
            result["shortfall_record_id"] = shortfall_record["id"]
    else:
        # No shortfall - mark any existing shortfall as completed
        await db.invoice_shortfalls.update_many(
            {"original_transaction_id": transaction["id"], "status": "pending"},
            {"$set": {"status": "completed", "completed_at": get_turkey_now()}}
        )
    
    return result


@router.get("/shortfalls/courier/{courier_id}")
async def get_courier_shortfalls(courier_id: str):
    """Get pending invoice shortfalls for a courier"""
    shortfalls = await db.invoice_shortfalls.find(
        {"courier_id": courier_id, "status": "pending"},
        {"_id": 0}
    ).to_list(100)
    return shortfalls


@router.get("/shortfalls/company/{company_id}")
async def get_company_shortfalls(company_id: str):
    """Get all invoice shortfalls for a company"""
    shortfalls = await db.invoice_shortfalls.find(
        {"company_id": company_id},
        {"_id": 0}
    ).sort("created_at", -1).to_list(500)
    return shortfalls


@router.post("/upload-by-admin")
async def upload_invoice_by_admin(
    transaction_id: str = Form(...),
    courier_id: str = Form(...),
    courier_name: str = Form(...),
    company_id: str = Form(...),
    admin_id: str = Form(...),
    admin_name: str = Form(...),
    file: UploadFile = File(...)
):
    """Upload invoice by admin (for ghost couriers or on behalf of courier)"""
    
    # Validate file type
    allowed_extensions = ('.pdf', '.jpg', '.jpeg', '.png', '.heic', '.heif')
    file_ext = os.path.splitext(file.filename.lower())[1]
    if file_ext not in allowed_extensions:
        raise HTTPException(status_code=400, detail="Sadece PDF veya resim dosyası yüklenebilir")
    
    # Check transaction exists and is hakediş
    transaction = await db.transactions.find_one({"id": transaction_id})
    if not transaction:
        raise HTTPException(status_code=404, detail="İşlem bulunamadı")
    
    if not transaction.get("is_hakedis"):
        raise HTTPException(status_code=400, detail="Bu işlem hakediş değil")
    
    # Check if invoice already exists
    existing = await db.invoices.find_one({"transaction_id": transaction_id})
    if existing:
        raise HTTPException(status_code=400, detail="Bu işlem için zaten fatura yüklenmiş")
    
    # Get company name for folder structure
    company = await db.companies.find_one({"id": company_id}, {"_id": 0, "name": 1})
    company_folder = format_courier_name_for_file(company["name"]) if company else company_id
    
    # Get Tuesday of the week
    tuesday = get_week_tuesday()
    tuesday_str = tuesday.strftime("%d.%m.%Y")
    
    # Get Turkish month folder name
    month_folder = get_turkish_month_folder(tuesday)
    
    # Format file name
    formatted_name = format_courier_name_for_file(courier_name)
    file_name = f"{formatted_name}_{tuesday_str}{file_ext}"
    
    # Create unique R2 key
    invoice_id = str(uuid.uuid4())
    unique_id = invoice_id[:8]
    stored_file_name = f"{unique_id}_{file_name}"
    r2_key = f"{R2_INVOICE_PREFIX}/{company_folder}/{month_folder}/{stored_file_name}"
    
    # Read file content
    content = await file.read()
    
    # Boyut kontrolü - Fatura max 10MB
    if len(content) > 10 * 1024 * 1024:
        raise HTTPException(status_code=413, detail="Dosya boyutu 10MB'ı geçemez")
    
    # Determine content type
    content_types = {
        '.pdf': 'application/pdf',
        '.jpg': 'image/jpeg',
        '.jpeg': 'image/jpeg',
        '.png': 'image/png',
        '.heic': 'image/heic',
        '.heif': 'image/heif'
    }
    content_type = content_types.get(file_ext, 'application/octet-stream')
    
    # Upload to R2
    upload_result = await upload_file_to_r2(content, r2_key, content_type)
    if not upload_result['success']:
        raise HTTPException(status_code=503, detail="Dosya depolama servisi (Cloudflare R2) yapılandırılmamış. Sistem ayarlarından R2 bağlantısını yapın.")
    
    # Create invoice record
    invoice = {
        "id": invoice_id,
        "transaction_id": transaction_id,
        "courier_id": courier_id,
        "courier_name": courier_name,
        "company_id": company_id,
        "file_name": file_name,
        "stored_file_name": stored_file_name,
        "r2_key": r2_key,
        "storage_type": "r2",
        "file_path": None,
        "week_tuesday": tuesday.isoformat(),
        "week_tuesday_display": tuesday_str,
        "uploaded_at": get_turkey_now(),
        "created_at": get_turkey_now(),
        "uploaded_by_admin": True,
        "uploaded_by_admin_id": admin_id,
        "uploaded_by_admin_name": admin_name
    }
    await db.invoices.insert_one(invoice)
    
    # Update transaction with invoice_id
    await db.transactions.update_one(
        {"id": transaction_id},
        {"$set": {"invoice_id": invoice_id}}
    )
    
    # If this was a shortfall transaction, update shortfall record
    if transaction.get("is_shortfall"):
        await db.invoice_shortfalls.update_one(
            {"shortfall_transaction_id": transaction_id},
            {"$set": {
                "status": "uploaded",
                "shortfall_invoice_id": invoice_id,
                "uploaded_at": get_turkey_now()
            }}
        )
    
    return {
        "message": "Fatura başarıyla yüklendi",
        "invoice_id": invoice_id,
        "file_name": file_name
    }


@router.get("/company/{company_id}/missing")
async def get_missing_invoices(company_id: str):
    """Get hakediş transactions without invoices OR with shortfall"""
    
    # Find all hakediş transactions without invoice_id (exclude dismissed)
    no_invoice_txs = await db.transactions.find(
        {
            "company_id": company_id,
            "is_hakedis": True,
            "invoice_dismissed": {"$ne": True},
            "$or": [
                {"invoice_id": {"$exists": False}},
                {"invoice_id": None},
                {"invoice_id": ""}
            ]
        },
        {"_id": 0}
    ).sort("created_at", -1).to_list(500)
    
    # Also find transactions with shortfall (has invoice but amount is less, exclude dismissed)
    shortfall_txs = await db.transactions.find(
        {
            "company_id": company_id,
            "is_hakedis": True,
            "has_shortfall": True,
            "shortfall_amount": {"$gt": 0},
            "invoice_dismissed": {"$ne": True}
        },
        {"_id": 0}
    ).sort("created_at", -1).to_list(500)
    
    # Combine and deduplicate
    tx_ids = set()
    transactions = []
    
    for tx in no_invoice_txs:
        if tx["id"] not in tx_ids:
            tx["missing_type"] = "no_invoice"  # No invoice uploaded yet
            tx["display_amount"] = tx["amount"]  # Show full amount
            transactions.append(tx)
            tx_ids.add(tx["id"])
    
    for tx in shortfall_txs:
        if tx["id"] not in tx_ids:
            tx["missing_type"] = "shortfall"  # Has invoice but shortfall
            tx["display_amount"] = tx.get("shortfall_amount", 0)  # Show only shortfall
            transactions.append(tx)
            tx_ids.add(tx["id"])
    
    # Enrich with courier names and phone if missing
    courier_ids = []
    for tx in transactions:
        cid = tx.get("courier_id") or tx.get("entity_id")
        if cid:
            courier_ids.append(cid)
    
    courier_ids = list(set(courier_ids))
    
    if courier_ids:
        couriers = await db.couriers.find(
            {"id": {"$in": courier_ids}},
            {"_id": 0, "id": 1, "name": 1, "phone": 1, "is_ghost": 1}
        ).to_list(500)
        courier_map = {c["id"]: {"name": c["name"], "phone": c.get("phone", ""), "is_ghost": c.get("is_ghost", False)} for c in couriers}
        
        for tx in transactions:
            cid = tx.get("courier_id") or tx.get("entity_id")
            if cid and cid in courier_map:
                if not tx.get("courier_name"):
                    tx["courier_name"] = courier_map[cid]["name"]
                tx["phone"] = courier_map[cid]["phone"]
                tx["courier_id"] = cid  # Ensure courier_id is set
                tx["is_ghost"] = courier_map[cid]["is_ghost"]
    
    # Sort by created_at desc
    transactions.sort(key=lambda x: x.get("created_at", ""), reverse=True)
    
    return transactions


@router.delete("/missing/{transaction_id}")
async def dismiss_missing_invoice(transaction_id: str):
    """
    Eksik fatura kaydını sil/kapat (SuperAdmin only - frontend'de kontrol edilir)
    Transaction'ı tamamen silmez, sadece invoice_dismissed olarak işaretler
    """
    # Transaction'ı bul
    tx = await db.transactions.find_one({"id": transaction_id}, {"_id": 0})
    if not tx:
        raise HTTPException(status_code=404, detail="İşlem bulunamadı")
    
    # İşlemi "dismissed" olarak işaretle
    await db.transactions.update_one(
        {"id": transaction_id},
        {
            "$set": {
                "invoice_dismissed": True,
                "invoice_dismissed_at": get_turkey_now()
            }
        }
    )
    
    return {"message": "Eksik fatura kaydı silindi"}


@router.get("/company/{company_id}/couriers-summary")
async def get_couriers_invoice_summary(company_id: str, year: int = None, month: int = None):
    """Get invoice summary per courier for a company"""
    
    # Get all couriers for this company
    relations = await db.company_couriers.find(
        {"company_id": company_id, "status": "approved"},
        {"_id": 0}
    ).to_list(500)
    
    # Deduplicate courier IDs
    courier_ids = list(set([r["courier_id"] for r in relations]))
    
    # Get couriers info (include is_ghost)
    couriers = await db.couriers.find(
        {"id": {"$in": courier_ids}},
        {"_id": 0, "id": 1, "name": 1, "phone": 1, "is_ghost": 1}
    ).to_list(500)
    
    # Deduplicate couriers by ID
    seen_ids = set()
    unique_couriers = []
    for c in couriers:
        if c["id"] not in seen_ids:
            seen_ids.add(c["id"])
            unique_couriers.append(c)
    couriers = unique_couriers
    
    # Build query for invoices
    invoice_query = {"company_id": company_id}
    if year and month:
        start_date = datetime(year, month, 1, tzinfo=timezone.utc)
        if month == 12:
            end_date = datetime(year + 1, 1, 1, tzinfo=timezone.utc)
        else:
            end_date = datetime(year, month + 1, 1, tzinfo=timezone.utc)
        invoice_query["uploaded_at"] = {
            "$gte": start_date.isoformat(),
            "$lt": end_date.isoformat()
        }
    
    # Get invoice counts per courier
    all_invoices = await db.invoices.find(invoice_query, {"_id": 0}).to_list(500)
    
    # Count invoices per courier
    invoice_counts = {}
    for inv in all_invoices:
        cid = inv["courier_id"]
        invoice_counts[cid] = invoice_counts.get(cid, 0) + 1
    
    # Build summary
    summary = []
    for courier in couriers:
        summary.append({
            "courier_id": courier["id"],
            "courier_name": courier["name"],
            "phone": courier.get("phone", ""),
            "is_ghost": courier.get("is_ghost", False),
            "invoice_count": invoice_counts.get(courier["id"], 0)
        })
    
    # Sort by name
    summary.sort(key=lambda x: x["courier_name"])
    
    return summary


@router.get("/download/{invoice_id}")
async def download_invoice(invoice_id: str):
    """Download a single invoice - supports both R2 and local storage"""
    invoice = await db.invoices.find_one({"id": invoice_id})
    if not invoice:
        raise HTTPException(status_code=404, detail="Fatura bulunamadı")
    
    # Check if stored in R2
    if invoice.get("storage_type") == "r2" and invoice.get("r2_key"):
        # Download from R2
        file_content = await download_file_from_r2(invoice["r2_key"])
        if file_content is None:
            raise HTTPException(status_code=404, detail="Fatura dosyası bulunamadı")
        
        # Determine content type
        file_ext = os.path.splitext(invoice["file_name"].lower())[1]
        content_types = {
            '.pdf': 'application/pdf',
            '.jpg': 'image/jpeg',
            '.jpeg': 'image/jpeg',
            '.png': 'image/png',
            '.heic': 'image/heic',
            '.heif': 'image/heif'
        }
        content_type = content_types.get(file_ext, 'application/octet-stream')
        
        return Response(
            content=file_content,
            media_type=content_type,
            headers={"Content-Disposition": f'attachment; filename="{invoice["file_name"]}"'}
        )
    else:
        # Legacy local file storage
        if not invoice.get("file_path") or not os.path.exists(invoice["file_path"]):
            raise HTTPException(status_code=404, detail="Fatura dosyası bulunamadı")
        
        return FileResponse(
            invoice["file_path"],
            filename=invoice["file_name"],
            media_type="application/pdf"
        )


@router.get("/view/{invoice_id}")
async def view_invoice(invoice_id: str):
    """View invoice in browser (inline) - supports both R2 and local storage"""
    invoice = await db.invoices.find_one({"id": invoice_id})
    if not invoice:
        raise HTTPException(status_code=404, detail="Fatura bulunamadı")
    
    # Check if stored in R2
    if invoice.get("storage_type") == "r2" and invoice.get("r2_key"):
        # Download from R2
        file_content = await download_file_from_r2(invoice["r2_key"])
        if file_content is None:
            raise HTTPException(status_code=404, detail="Fatura dosyası bulunamadı")
        
        # Determine content type
        file_ext = os.path.splitext(invoice["file_name"].lower())[1]
        content_types = {
            '.pdf': 'application/pdf',
            '.jpg': 'image/jpeg',
            '.jpeg': 'image/jpeg',
            '.png': 'image/png',
            '.heic': 'image/heic',
            '.heif': 'image/heif'
        }
        content_type = content_types.get(file_ext, 'application/octet-stream')
        
        return Response(
            content=file_content,
            media_type=content_type,
            headers={"Content-Disposition": "inline"}
        )
    else:
        # Legacy local file storage
        if not invoice.get("file_path") or not os.path.exists(invoice["file_path"]):
            raise HTTPException(status_code=404, detail="Fatura dosyası bulunamadı")
        
        return FileResponse(
            invoice["file_path"],
            media_type="application/pdf",
            headers={"Content-Disposition": "inline"}
        )


class BulkPdfRequest(BaseModel):
    invoice_ids: List[str]
    company_id: Optional[str] = None


@router.post("/download-bulk")
async def download_bulk_invoices(data: BulkPdfRequest):
    """Download multiple invoices as a single merged PDF with cover page and page numbers"""
    from utils.pdf_utils import create_cover_page, add_page_numbers, get_logo_bytes

    if not data.invoice_ids:
        raise HTTPException(status_code=400, detail="En az bir fatura seçilmeli")
    
    invoices = await db.invoices.find(
        {"id": {"$in": data.invoice_ids}},
        {"_id": 0}
    ).to_list(100)
    
    if not invoices:
        raise HTTPException(status_code=404, detail="Fatura bulunamadı")
    
    # Get company info for cover page
    logo_bytes = None
    company_name = ""
    company_id = data.company_id or (invoices[0].get("company_id") if invoices else None)
    if company_id:
        company = await db.companies.find_one({"id": company_id}, {"_id": 0, "name": 1, "logo_light": 1})
        if company:
            company_name = company.get("name", "")
            logo_bytes = get_logo_bytes(company.get("logo_light", ""))

    writer = PdfWriter()
    
    for invoice in invoices:
        file_content = None
        if invoice.get("storage_type") == "r2" and invoice.get("r2_key"):
            file_content = await download_file_from_r2(invoice["r2_key"])
        else:
            if invoice.get("file_path") and os.path.exists(invoice["file_path"]):
                with open(invoice["file_path"], "rb") as f:
                    file_content = f.read()
        
        if not file_content:
            continue
        
        file_name = invoice.get("file_name", "").lower()
        try:
            if file_name.endswith(".pdf"):
                reader = PdfReader(io.BytesIO(file_content))
                for page in reader.pages:
                    writer.add_page(page)
            else:
                img = Image.open(io.BytesIO(file_content))
                if img.mode in ("RGBA", "P"):
                    img = img.convert("RGB")
                img_pdf_buffer = io.BytesIO()
                img.save(img_pdf_buffer, format="PDF")
                img_pdf_buffer.seek(0)
                reader = PdfReader(img_pdf_buffer)
                for page in reader.pages:
                    writer.add_page(page)
        except Exception as e:
            print(f"Fatura birleştirme hatası ({file_name}): {e}")
            continue
    
    if len(writer.pages) == 0:
        raise HTTPException(status_code=404, detail="Birleştirilebilecek fatura bulunamadı")
    
    now = datetime.now(TURKEY_TZ)
    month_name = TURKISH_MONTHS[now.month]

    # Create cover page
    cover_buf = create_cover_page(
        title="Kurye Faturaları",
        subtitle=f"{company_name} - {month_name} {now.year}",
        logo_bytes=logo_bytes,
        invoice_count=len(data.invoice_ids),
        generated_date=now.strftime("%d.%m.%Y %H:%M"),
    )
    cover_reader = PdfReader(cover_buf)

    # Build final: cover + content pages
    final_writer = PdfWriter()
    for page in cover_reader.pages:
        final_writer.add_page(page)
    for page in writer.pages:
        final_writer.add_page(page)

    # Add page numbers
    add_page_numbers(final_writer)
    
    pdf_buffer = io.BytesIO()
    final_writer.write(pdf_buffer)
    pdf_buffer.seek(0)
    
    pdf_filename = f"Kurye{month_name}Faturalar.pdf"
    
    return StreamingResponse(
        pdf_buffer,
        media_type="application/pdf",
        headers={"Content-Disposition": f"attachment; filename={pdf_filename}"}
    )
