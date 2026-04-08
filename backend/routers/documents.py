from fastapi import APIRouter, HTTPException, UploadFile, File, Form, Depends
from fastapi.responses import StreamingResponse, Response
from datetime import datetime, timezone
import uuid
import os
import io
import zipfile
import re

from utils.database import db
from utils.helpers import get_turkey_now, ensure_turkey_timezone, TURKEY_TZ
from services.r2_storage import (
    upload_file_to_r2,
    download_file_from_r2,
    delete_file_from_r2
)

from utils.jwt_utils import require_admin, require_auth
router = APIRouter(prefix="/api/documents", tags=["Documents"], dependencies=[Depends(require_auth)])

# Legacy local upload dir (for backward compatibility)
UPLOAD_DIR = "/app/uploads/documents"
os.makedirs(UPLOAD_DIR, exist_ok=True)

# R2 folder prefix for documents (Turkish)
R2_DOCUMENTS_PREFIX = "EVRAKLAR"

# Turkish document type labels for folder names
TURKISH_DOC_FOLDERS = {
    "company_contract": "Sozlesmeler",
    "id_front": "Kimlik",
    "id_back": "Kimlik",
    "driver_license_front": "Ehliyet",
    "driver_license_back": "Ehliyet",
    "criminal_record": "SabıkaKaydi",
    "src_certificate": "SRCBelgesi",
    "psychotechnical": "Psikoteknik",
    "health_report": "SaglikRaporu",
    "vehicle_registration": "Ruhsat",
    "traffic_insurance": "Sigorta",
    "vehicle_inspection": "Muayene"
}

# Forward declaration for notification
async def send_document_notification(company_id: str, courier_name: str, doc_label: str):
    """Send notification for document upload"""
    try:
        from routers.notifications import create_notification
        await create_notification(
            company_id=company_id,
            notification_type="evrak_yuklendi",
            title="Evrak Yüklendi",
            message=f"{courier_name} yeni evrak yükledi: {doc_label}",
            entity_type="document",
            entity_id=None
        )
    except Exception as e:
        print(f"Document notification failed: {e}")

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
    "vehicle_registration": {
        "label": "Araç Ruhsatı",
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
    
    # Get company info for folder structure
    courier_relation = await db.company_couriers.find_one({"courier_id": courier_id}, {"_id": 0, "company_id": 1})
    company_folder = "Genel"
    if courier_relation:
        company = await db.companies.find_one({"id": courier_relation["company_id"]}, {"_id": 0, "name": 1})
        if company:
            company_folder = format_name_for_file(company["name"])
    
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
    doc_id = str(uuid.uuid4())
    stored_file_name = f"{unique_id}_{file_name}"
    
    # Create R2 key with company folder: EVRAKLAR/SirketAdi/KuryeAdi/DosyaTuru/filename
    doc_folder = TURKISH_DOC_FOLDERS.get(document_type, "Diger")
    r2_key = f"{R2_DOCUMENTS_PREFIX}/{company_folder}/{formatted_courier_name}/{doc_folder}/{stored_file_name}"
    
    # Read file content
    content = await file.read()
    
    # Boyut kontrolü - Belge max 10MB
    if len(content) > 10 * 1024 * 1024:
        raise HTTPException(status_code=413, detail="Dosya boyutu 10MB'ı geçemez")
    
    # Determine content type
    content_type_map = {
        '.jpg': 'image/jpeg',
        '.jpeg': 'image/jpeg',
        '.png': 'image/png',
        '.webp': 'image/webp',
        '.heic': 'image/heic',
        '.heif': 'image/heif',
        '.pdf': 'application/pdf'
    }
    content_type = content_type_map.get(file_ext, 'application/octet-stream')
    
    # Upload to R2
    upload_result = await upload_file_to_r2(content, r2_key, content_type)
    if not upload_result['success']:
        raise HTTPException(status_code=503, detail="Dosya depolama servisi (Cloudflare R2) yapılandırılmamış. Sistem ayarlarından R2 bağlantısını yapın.")
    
    # Create document record with R2 reference
    document = {
        "id": doc_id,
        "courier_id": courier_id,
        "document_type": document_type,
        "document_label": doc_config["label"] if document_type != "company_contract" else f"{company_name} Sözleşme",
        "file_name": file_name,
        "stored_file_name": stored_file_name,
        "r2_key": r2_key,  # R2 storage key
        "storage_type": "r2",  # Indicate R2 storage
        "file_path": None,  # No local path for R2 files
        "file_extension": file_ext,
        "company_name": company_name,
        "uploaded_at": get_turkey_now(),
        "created_at": get_turkey_now()
    }
    await db.courier_documents.insert_one(document)
    
    # Send notification for document upload
    relation = await db.company_couriers.find_one({"courier_id": courier_id}, {"_id": 0, "company_id": 1})
    if relation:
        await send_document_notification(relation["company_id"], courier["name"], document["document_label"])
    
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
        # Sözleşme artık contracts modülünde yönetiliyor, status'tan hariç tut
        if doc_type == "company_contract":
            continue
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
    """Delete a document (admin only) - supports both R2 and local storage"""
    document = await db.courier_documents.find_one({"id": document_id})
    if not document:
        raise HTTPException(status_code=404, detail="Evrak bulunamadı")
    
    # Delete file from R2 or local storage
    if document.get("storage_type") == "r2" and document.get("r2_key"):
        await delete_file_from_r2(document["r2_key"])
    elif document.get("file_path") and os.path.exists(document["file_path"]):
        os.remove(document["file_path"])
    
    # Delete record
    await db.courier_documents.delete_one({"id": document_id})
    
    return {"message": "Evrak silindi"}


@router.get("/view/{document_id}")
async def view_document(document_id: str):
    """View/download a single document - supports both R2 and local storage"""
    from fastapi.responses import FileResponse
    
    document = await db.courier_documents.find_one({"id": document_id})
    if not document:
        raise HTTPException(status_code=404, detail="Evrak bulunamadı")
    
    # Determine media type
    ext = document.get("file_extension", "").lower()
    if ext == ".pdf":
        media_type = "application/pdf"
    elif ext in [".jpg", ".jpeg"]:
        media_type = "image/jpeg"
    elif ext == ".png":
        media_type = "image/png"
    elif ext == ".webp":
        media_type = "image/webp"
    elif ext in [".heic", ".heif"]:
        media_type = "image/heic"
    else:
        media_type = "application/octet-stream"
    
    # Check if stored in R2
    if document.get("storage_type") == "r2" and document.get("r2_key"):
        file_content = await download_file_from_r2(document["r2_key"])
        if file_content is None:
            raise HTTPException(status_code=404, detail="Dosya bulunamadı")
        
        return Response(
            content=file_content,
            media_type=media_type,
            headers={"Content-Disposition": "inline"}
        )
    else:
        # Legacy local file storage
        if not document.get("file_path") or not os.path.exists(document["file_path"]):
            raise HTTPException(status_code=404, detail="Dosya bulunamadı")
        
        return FileResponse(
            document["file_path"],
            media_type=media_type,
            headers={"Content-Disposition": "inline"}
        )


@router.get("/courier/{courier_id}/download-all")
async def download_all_documents(courier_id: str):
    """Download all documents for a courier as ZIP - supports both R2 and local storage"""
    
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
            # Check if stored in R2
            if doc.get("storage_type") == "r2" and doc.get("r2_key"):
                file_content = await download_file_from_r2(doc["r2_key"])
                if file_content:
                    zip_file.writestr(doc["file_name"], file_content)
            elif doc.get("file_path") and os.path.exists(doc["file_path"]):
                # Legacy local storage
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


@router.get("/courier/{courier_id}/download-merged-pdf")
async def download_merged_pdf(courier_id: str):
    """Download all documents merged into a single PDF"""
    from reportlab.lib.pagesizes import A4
    from reportlab.platypus import SimpleDocTemplate, Image as RLImage, Spacer, Paragraph, PageBreak
    from reportlab.lib.styles import getSampleStyleSheet
    from reportlab.lib.units import cm
    from reportlab.lib.enums import TA_CENTER
    from pypdf import PdfReader, PdfWriter
    from PIL import Image as PILImage

    courier = await db.couriers.find_one({"id": courier_id}, {"_id": 0, "name": 1})
    if not courier:
        raise HTTPException(status_code=404, detail="Kurye bulunamadı")

    documents = await db.courier_documents.find(
        {"courier_id": courier_id},
        {"_id": 0}
    ).sort("document_type", 1).to_list(100)

    if not documents:
        raise HTTPException(status_code=404, detail="Evrak bulunamadı")

    # Sort by DOCUMENT_ORDER
    doc_order = [
        "company_contract", "id_front", "id_back",
        "license_front", "license_back", "vehicle_registration",
        "criminal_record", "residence_certificate"
    ]
    def sort_key(d):
        try:
            return doc_order.index(d.get("document_type", ""))
        except ValueError:
            return 99
    documents.sort(key=sort_key)

    merger = PdfWriter()

    for doc in documents:
        file_content = None
        if doc.get("storage_type") == "r2" and doc.get("r2_key"):
            file_content = await download_file_from_r2(doc["r2_key"])
        elif doc.get("file_path") and os.path.exists(doc["file_path"]):
            with open(doc["file_path"], "rb") as f:
                file_content = f.read()

        if not file_content:
            continue

        ext = doc.get("file_extension", "").lower()

        if ext == ".pdf":
            try:
                reader = PdfReader(io.BytesIO(file_content))
                for page in reader.pages:
                    merger.add_page(page)
            except Exception:
                pass
        elif ext in [".jpg", ".jpeg", ".png", ".webp"]:
            try:
                img = PILImage.open(io.BytesIO(file_content))
                if img.mode in ("RGBA", "P"):
                    img = img.convert("RGB")

                page_w, page_h = A4
                margin = 1.5 * cm
                usable_w = page_w - 2 * margin
                usable_h = page_h - 2 * margin

                img_w, img_h = img.size
                ratio = min(usable_w / img_w, usable_h / img_h)
                new_w = img_w * ratio
                new_h = img_h * ratio

                img_buf = io.BytesIO()
                img.save(img_buf, format="JPEG", quality=90)
                img_buf.seek(0)

                pdf_buf = io.BytesIO()
                doc_rl = SimpleDocTemplate(
                    pdf_buf, pagesize=A4,
                    topMargin=margin, bottomMargin=margin,
                    leftMargin=margin, rightMargin=margin
                )
                styles = getSampleStyleSheet()
                label = DOCUMENT_TYPES.get(doc.get("document_type", ""), {}).get("label", doc.get("file_name", ""))

                elements = [
                    Paragraph(f"<b>{label}</b>", styles["Heading3"]),
                    Spacer(1, 10),
                    RLImage(img_buf, width=new_w, height=new_h),
                ]
                doc_rl.build(elements)
                pdf_buf.seek(0)

                reader = PdfReader(pdf_buf)
                for page in reader.pages:
                    merger.add_page(page)
            except Exception:
                pass

    if len(merger.pages) == 0:
        raise HTTPException(status_code=404, detail="Birleştirilecek evrak bulunamadı")

    output = io.BytesIO()
    merger.write(output)
    output.seek(0)

    formatted_name = format_name_for_file(courier["name"])
    filename = f"{formatted_name}_Tum_Evraklar.pdf"

    return StreamingResponse(
        output,
        media_type="application/pdf",
        headers={"Content-Disposition": f"attachment; filename={filename}"}
    )
