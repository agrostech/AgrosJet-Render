from fastapi import APIRouter, HTTPException, UploadFile, File, Form
from fastapi.responses import FileResponse, StreamingResponse
from pydantic import BaseModel
from typing import Optional
from datetime import datetime, timezone, timedelta
import uuid
import os
import io
import zipfile
import re

from utils.database import db

router = APIRouter(prefix="/api/invoices", tags=["Invoices"])

UPLOAD_DIR = "/app/uploads/invoices"
os.makedirs(UPLOAD_DIR, exist_ok=True)


def get_week_tuesday(date: datetime = None) -> datetime:
    """Get the Tuesday of the week for given date"""
    if date is None:
        date = datetime.now(timezone.utc)
    
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
    file: UploadFile = File(...)
):
    """Upload invoice for a hakediş transaction"""
    
    # Validate file type
    if not file.filename.lower().endswith('.pdf'):
        raise HTTPException(status_code=400, detail="Sadece PDF dosyası yüklenebilir")
    
    # Check transaction exists and is hakediş
    transaction = await db.transactions.find_one({"id": transaction_id})
    if not transaction:
        raise HTTPException(status_code=404, detail="İşlem bulunamadı")
    
    if not transaction.get("is_hakedis"):
        raise HTTPException(status_code=400, detail="Bu işlem hakediş değil")
    
    # Check if invoice already exists for this transaction
    existing = await db.invoices.find_one({"transaction_id": transaction_id})
    if existing:
        raise HTTPException(status_code=400, detail="Bu işlem için zaten fatura yüklenmiş")
    
    # Get Tuesday of the week
    tuesday = get_week_tuesday()
    tuesday_str = tuesday.strftime("%d.%m.%Y")
    
    # Format file name: KuryeAdSoyad_DD.MM.YYYY.pdf
    formatted_name = format_courier_name_for_file(courier_name)
    file_name = f"{formatted_name}_{tuesday_str}.pdf"
    
    # Create unique file path to avoid conflicts
    unique_id = str(uuid.uuid4())[:8]
    stored_file_name = f"{unique_id}_{file_name}"
    file_path = os.path.join(UPLOAD_DIR, stored_file_name)
    
    # Save file
    content = await file.read()
    with open(file_path, "wb") as f:
        f.write(content)
    
    # Create invoice record
    invoice = {
        "id": str(uuid.uuid4()),
        "transaction_id": transaction_id,
        "courier_id": courier_id,
        "courier_name": courier_name,
        "company_id": company_id,
        "file_name": file_name,
        "stored_file_name": stored_file_name,
        "file_path": file_path,
        "week_tuesday": tuesday.isoformat(),
        "week_tuesday_display": tuesday_str,
        "uploaded_at": datetime.now(timezone.utc).isoformat(),
        "created_at": datetime.now(timezone.utc).isoformat()
    }
    await db.invoices.insert_one(invoice)
    
    # Update transaction with invoice_id
    await db.transactions.update_one(
        {"id": transaction_id},
        {"$set": {"invoice_id": invoice["id"]}}
    )
    
    return {
        "message": "Fatura başarıyla yüklendi",
        "invoice_id": invoice["id"],
        "file_name": file_name
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
    now = datetime.now(timezone.utc)
    hours_passed = (now - uploaded_at).total_seconds() / 3600
    
    if hours_passed > 24:
        raise HTTPException(status_code=400, detail="Fatura yüklendikten 24 saat sonra silinemez")
    
    # Delete file
    if os.path.exists(invoice["file_path"]):
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
    
    # Delete file
    if os.path.exists(invoice["file_path"]):
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
            "verified_at": datetime.now(timezone.utc).isoformat()
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


@router.get("/company/{company_id}/missing")
async def get_missing_invoices(company_id: str):
    """Get hakediş transactions without invoices"""
    # Find all hakediş transactions without invoice_id
    transactions = await db.transactions.find(
        {
            "company_id": company_id,
            "is_hakedis": True,
            "$or": [
                {"invoice_id": {"$exists": False}},
                {"invoice_id": None},
                {"invoice_id": ""}
            ]
        },
        {"_id": 0}
    ).sort("created_at", -1).to_list(500)
    
    # Enrich with courier names if missing
    # Use courier_id or entity_id (for older transactions)
    courier_ids = []
    for tx in transactions:
        if not tx.get("courier_name"):
            cid = tx.get("courier_id") or tx.get("entity_id")
            if cid:
                courier_ids.append(cid)
    
    courier_ids = list(set(courier_ids))
    
    if courier_ids:
        couriers = await db.couriers.find(
            {"id": {"$in": courier_ids}},
            {"_id": 0, "id": 1, "name": 1}
        ).to_list(500)
        courier_map = {c["id"]: c["name"] for c in couriers}
        
        for tx in transactions:
            if not tx.get("courier_name"):
                cid = tx.get("courier_id") or tx.get("entity_id")
                if cid:
                    tx["courier_name"] = courier_map.get(cid, "Bilinmeyen Kurye")
    
    return transactions


@router.get("/company/{company_id}/couriers-summary")
async def get_couriers_invoice_summary(company_id: str, year: int = None, month: int = None):
    """Get invoice summary per courier for a company"""
    
    # Get all couriers for this company
    relations = await db.company_couriers.find(
        {"company_id": company_id, "status": "approved"},
        {"_id": 0}
    ).to_list(500)
    
    courier_ids = [r["courier_id"] for r in relations]
    
    # Get couriers info
    couriers = await db.couriers.find(
        {"id": {"$in": courier_ids}},
        {"_id": 0, "id": 1, "name": 1, "phone": 1}
    ).to_list(500)
    
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
            "invoice_count": invoice_counts.get(courier["id"], 0)
        })
    
    # Sort by name
    summary.sort(key=lambda x: x["courier_name"])
    
    return summary


@router.get("/download/{invoice_id}")
async def download_invoice(invoice_id: str):
    """Download a single invoice"""
    invoice = await db.invoices.find_one({"id": invoice_id})
    if not invoice:
        raise HTTPException(status_code=404, detail="Fatura bulunamadı")
    
    if not os.path.exists(invoice["file_path"]):
        raise HTTPException(status_code=404, detail="Fatura dosyası bulunamadı")
    
    return FileResponse(
        invoice["file_path"],
        filename=invoice["file_name"],
        media_type="application/pdf"
    )


@router.get("/view/{invoice_id}")
async def view_invoice(invoice_id: str):
    """View invoice in browser (inline)"""
    invoice = await db.invoices.find_one({"id": invoice_id})
    if not invoice:
        raise HTTPException(status_code=404, detail="Fatura bulunamadı")
    
    if not os.path.exists(invoice["file_path"]):
        raise HTTPException(status_code=404, detail="Fatura dosyası bulunamadı")
    
    return FileResponse(
        invoice["file_path"],
        media_type="application/pdf",
        headers={"Content-Disposition": "inline"}
    )


@router.post("/download-bulk")
async def download_bulk_invoices(invoice_ids: list[str]):
    """Download multiple invoices as ZIP"""
    if not invoice_ids:
        raise HTTPException(status_code=400, detail="En az bir fatura seçilmeli")
    
    invoices = await db.invoices.find(
        {"id": {"$in": invoice_ids}},
        {"_id": 0}
    ).to_list(100)
    
    if not invoices:
        raise HTTPException(status_code=404, detail="Fatura bulunamadı")
    
    # Create ZIP in memory
    zip_buffer = io.BytesIO()
    with zipfile.ZipFile(zip_buffer, 'w', zipfile.ZIP_DEFLATED) as zip_file:
        for invoice in invoices:
            if os.path.exists(invoice["file_path"]):
                zip_file.write(invoice["file_path"], invoice["file_name"])
    
    zip_buffer.seek(0)
    
    # Generate filename with current date
    now = datetime.now(timezone.utc)
    zip_filename = f"Faturalar_{now.strftime('%d.%m.%Y')}.zip"
    
    return StreamingResponse(
        zip_buffer,
        media_type="application/zip",
        headers={"Content-Disposition": f"attachment; filename={zip_filename}"}
    )
