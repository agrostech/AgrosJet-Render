from fastapi import APIRouter, HTTPException, UploadFile, File, Form
from fastapi.responses import StreamingResponse
from pydantic import BaseModel
from typing import Optional, List
from datetime import datetime, timezone
import uuid
import os
import io
import zipfile
import re

from utils.database import db

router = APIRouter(prefix="/api/documents", tags=["Documents"])

UPLOAD_DIR = "/app/uploads/documents"
os.makedirs(UPLOAD_DIR, exist_ok=True)

# Document type definitions
DOCUMENT_TYPES = {
    "company_contract": {
        "label": "Şirket Sözleşmesi",
        "max_count": 14,
        "allowed_types": ["image/jpeg", "image/jpg", "image/png", "image/webp", "image/heic", "image/heif"],
        "extensions": [".jpg", ".jpeg", ".png", ".webp", ".heic", ".heif"]
    },
    "id_front": {
        "label": "Kimlik Ön Yüz",
        "max_count": 1,
        "allowed_types": ["image/jpeg", "image/jpg", "image/png", "image/webp", "image/heic", "image/heif"],
        "extensions": [".jpg", ".jpeg", ".png", ".webp", ".heic", ".heif"]
    },
    "id_back": {
        "label": "Kimlik Arka Yüz",
        "max_count": 1,
        "allowed_types": ["image/jpeg", "image/jpg", "image/png", "image/webp", "image/heic", "image/heif"],
        "extensions": [".jpg", ".jpeg", ".png", ".webp", ".heic", ".heif"]
    },
    "license_front": {
        "label": "Ehliyet Ön Yüz",
        "max_count": 1,
        "allowed_types": ["image/jpeg", "image/jpg", "image/png", "image/webp", "image/heic", "image/heif"],
        "extensions": [".jpg", ".jpeg", ".png", ".webp", ".heic", ".heif"]
    },
    "license_back": {
        "label": "Ehliyet Arka Yüz",
        "max_count": 1,
        "allowed_types": ["image/jpeg", "image/jpg", "image/png", "image/webp", "image/heic", "image/heif"],
        "extensions": [".jpg", ".jpeg", ".png", ".webp", ".heic", ".heif"]
    },
    "criminal_record": {
        "label": "Adli Sicil Kaydı",
        "max_count": 1,
        "allowed_types": ["application/pdf"],
        "extensions": [".pdf"]
    },
    "residence_certificate": {
        "label": "İkametgah Belgesi",
        "max_count": 1,
        "allowed_types": ["application/pdf"],
        "extensions": [".pdf"]
    }
}


def format_name_for_file(name: str) -> str:
    """Format name for file naming (remove spaces, Turkish chars)"""
    tr_chars = {'ı': 'i', 'İ': 'I', 'ğ': 'g', 'Ğ': 'G', 'ü': 'u', 'Ü': 'U', 
                'ş': 's', 'Ş': 'S', 'ö': 'o', 'Ö': 'O', 'ç': 'c', 'Ç': 'C'}
    for tr, en in tr_chars.items():
        name = name.replace(tr, en)
    name = re.sub(r'[^a-zA-Z0-9]', '', name)
    return name


@router.get("/types")
async def get_document_types():
    """Get all document types with their requirements"""
    return {
        key: {
            "label": val["label"],
            "max_count": val["max_count"],
            "is_pdf": val["allowed_types"] == ["application/pdf"]
        }
        for key, val in DOCUMENT_TYPES.items()
    }


@router.post("/upload/{courier_id}/{document_type}")
async def upload_document(
    courier_id: str,
    document_type: str,
    company_name: str = Form(...),
    file: UploadFile = File(...)
):
    """Upload a document for a courier"""
    
    # Validate document type
    if document_type not in DOCUMENT_TYPES:
        raise HTTPException(status_code=400, detail="Geçersiz evrak türü")
    
    doc_config = DOCUMENT_TYPES[document_type]
    
    # Check file extension
    file_ext = os.path.splitext(file.filename)[1].lower()
    if file_ext not in doc_config["extensions"]:
        expected = ", ".join(doc_config["extensions"])
        raise HTTPException(status_code=400, detail=f"Geçersiz dosya formatı. Beklenen: {expected}")
    
    # Check current count for this document type
    existing_count = await db.courier_documents.count_documents({
        "courier_id": courier_id,
        "document_type": document_type
    })
    
    if existing_count >= doc_config["max_count"]:
        raise HTTPException(
            status_code=400, 
            detail=f"Bu evrak türü için maksimum {doc_config['max_count']} dosya yüklenebilir"
        )
    
    # Get courier info
    courier = await db.couriers.find_one({"id": courier_id}, {"_id": 0})
    if not courier:
        raise HTTPException(status_code=404, detail="Kurye bulunamadı")
    
    # Create directory for courier
    courier_dir = os.path.join(UPLOAD_DIR, courier_id)
    os.makedirs(courier_dir, exist_ok=True)
    
    # Generate file name
    formatted_courier_name = format_name_for_file(courier["name"])
    formatted_company_name = format_name_for_file(company_name)
    
    # For contract, include company name in label
    if document_type == "company_contract":
        type_label = f"{formatted_company_name}_Sozlesme"
    else:
        type_label = format_name_for_file(doc_config["label"])
    
    # Add index if multiple files allowed
    if doc_config["max_count"] > 1:
        index = existing_count + 1
        file_name = f"{formatted_courier_name}_{type_label}_{index}{file_ext}"
    else:
        file_name = f"{formatted_courier_name}_{type_label}{file_ext}"
    
    # Unique stored name
    unique_id = str(uuid.uuid4())[:8]
    stored_file_name = f"{unique_id}_{file_name}"
    file_path = os.path.join(courier_dir, stored_file_name)
    
    # Save file
    content = await file.read()
    with open(file_path, "wb") as f:
        f.write(content)
    
    # Create document record
    document = {
        "id": str(uuid.uuid4()),
        "courier_id": courier_id,
        "document_type": document_type,
        "document_label": doc_config["label"] if document_type != "company_contract" else f"{company_name} Sözleşme",
        "file_name": file_name,
        "stored_file_name": stored_file_name,
        "file_path": file_path,
        "file_extension": file_ext,
        "company_name": company_name,
        "uploaded_at": datetime.now(timezone.utc).isoformat(),
        "created_at": datetime.now(timezone.utc).isoformat()
    }
    await db.courier_documents.insert_one(document)
    
    return {
        "message": "Evrak başarıyla yüklendi",
        "document_id": document["id"],
        "file_name": file_name
    }


@router.get("/courier/{courier_id}")
async def get_courier_documents(courier_id: str):
    """Get all documents for a courier"""
    documents = await db.courier_documents.find(
        {"courier_id": courier_id},
        {"_id": 0}
    ).sort("document_type", 1).to_list(100)
    
    return documents


@router.get("/courier/{courier_id}/status")
async def get_document_status(courier_id: str):
    """Check if all required documents are uploaded"""
    documents = await db.courier_documents.find(
        {"courier_id": courier_id},
        {"_id": 0, "document_type": 1}
    ).to_list(100)
    
    # Count documents by type
    type_counts = {}
    for doc in documents:
        doc_type = doc["document_type"]
        type_counts[doc_type] = type_counts.get(doc_type, 0) + 1
    
    # Check each document type
    status = {}
    all_complete = True
    total_required = 0
    total_uploaded = 0
    
    for doc_type, config in DOCUMENT_TYPES.items():
        required = config["max_count"]
        uploaded = type_counts.get(doc_type, 0)
        is_complete = uploaded >= required
        
        status[doc_type] = {
            "label": config["label"],
            "required": required,
            "uploaded": uploaded,
            "is_complete": is_complete
        }
        
        total_required += required
        total_uploaded += min(uploaded, required)
        
        if not is_complete:
            all_complete = False
    
    return {
        "all_complete": all_complete,
        "total_required": total_required,
        "total_uploaded": total_uploaded,
        "progress_percent": round((total_uploaded / total_required) * 100) if total_required > 0 else 0,
        "details": status
    }


@router.delete("/{document_id}")
async def delete_document(document_id: str):
    """Delete a document (admin only)"""
    document = await db.courier_documents.find_one({"id": document_id})
    if not document:
        raise HTTPException(status_code=404, detail="Evrak bulunamadı")
    
    # Delete file
    if os.path.exists(document["file_path"]):
        os.remove(document["file_path"])
    
    # Delete record
    await db.courier_documents.delete_one({"id": document_id})
    
    return {"message": "Evrak silindi"}


@router.get("/view/{document_id}")
async def view_document(document_id: str):
    """View/download a single document"""
    from fastapi.responses import FileResponse
    
    document = await db.courier_documents.find_one({"id": document_id})
    if not document:
        raise HTTPException(status_code=404, detail="Evrak bulunamadı")
    
    if not os.path.exists(document["file_path"]):
        raise HTTPException(status_code=404, detail="Dosya bulunamadı")
    
    # Determine media type
    ext = document["file_extension"].lower()
    if ext == ".pdf":
        media_type = "application/pdf"
    elif ext in [".jpg", ".jpeg"]:
        media_type = "image/jpeg"
    elif ext == ".png":
        media_type = "image/png"
    elif ext == ".webp":
        media_type = "image/webp"
    else:
        media_type = "application/octet-stream"
    
    return FileResponse(
        document["file_path"],
        media_type=media_type,
        headers={"Content-Disposition": "inline"}
    )


@router.get("/courier/{courier_id}/download-all")
async def download_all_documents(courier_id: str):
    """Download all documents for a courier as ZIP"""
    
    # Get courier info
    courier = await db.couriers.find_one({"id": courier_id}, {"_id": 0})
    if not courier:
        raise HTTPException(status_code=404, detail="Kurye bulunamadı")
    
    # Get all documents
    documents = await db.courier_documents.find(
        {"courier_id": courier_id},
        {"_id": 0}
    ).to_list(100)
    
    if not documents:
        raise HTTPException(status_code=404, detail="Evrak bulunamadı")
    
    # Create ZIP in memory
    zip_buffer = io.BytesIO()
    with zipfile.ZipFile(zip_buffer, 'w', zipfile.ZIP_DEFLATED) as zip_file:
        for doc in documents:
            if os.path.exists(doc["file_path"]):
                zip_file.write(doc["file_path"], doc["file_name"])
    
    zip_buffer.seek(0)
    
    # Generate filename
    formatted_name = format_name_for_file(courier["name"])
    zip_filename = f"{formatted_name}_Evraklar.zip"
    
    return StreamingResponse(
        zip_buffer,
        media_type="application/zip",
        headers={"Content-Disposition": f"attachment; filename={zip_filename}"}
    )
