from fastapi import APIRouter, HTTPException, UploadFile, File, Form, Header, Depends
from pydantic import BaseModel
from typing import Optional
from datetime import datetime, timezone
import uuid
import os
import shutil

from utils.database import db
from utils.helpers import get_turkey_now, ensure_turkey_timezone, TURKEY_TZ
from services.r2_storage import (
    upload_file_to_r2,
    download_file_from_r2,
    delete_file_from_r2
)

from utils.jwt_utils import require_admin, require_auth
router = APIRouter(prefix="/api/academy", tags=["Academy"], dependencies=[Depends(require_auth)])

# Legacy upload directories (for backward compatibility)
UPLOAD_DIR = "/app/uploads/academy"
IMAGES_DIR = "/app/uploads/academy/images"
os.makedirs(UPLOAD_DIR, exist_ok=True)
os.makedirs(IMAGES_DIR, exist_ok=True)

# R2 folder prefix for academy (Turkish)
R2_ACADEMY_PREFIX = "AKADEMI"

# Allowed video extensions
ALLOWED_VIDEO_EXTENSIONS = {".mp4", ".webm", ".mov", ".avi", ".mkv"}
ALLOWED_VIDEO_SIZE = 500 * 1024 * 1024  # 500MB max

# Allowed image extensions
ALLOWED_IMAGE_EXTENSIONS = {".jpg", ".jpeg", ".png", ".gif", ".webp"}
ALLOWED_IMAGE_SIZE = 10 * 1024 * 1024  # 10MB max


class TrainingCreate(BaseModel):
    title: str
    content: Optional[str] = None  # Written content
    training_type: str = "video"  # "video" or "text"
    content_blocks: Optional[list] = None  # For rich text content: [{"type": "text", "value": "..."}, {"type": "image", "value": "image_id"}]


class TrainingUpdate(BaseModel):
    title: Optional[str] = None
    content: Optional[str] = None
    content_blocks: Optional[list] = None


# --- Training CRUD ---
@router.get("/company/{company_id}/trainings")
async def get_trainings(company_id: str):
    """Get all trainings for a company - oldest first"""
    # GET işlemi - kurye panelinden de erişilebilir
    trainings = await db.academy_trainings.find(
        {"company_id": company_id},
        {"_id": 0}
    ).sort("created_at", 1).to_list(100)
    return trainings


@router.get("/training/{training_id}")
async def get_training(training_id: str):
    """Get a single training"""
    training = await db.academy_trainings.find_one(
        {"id": training_id},
        {"_id": 0}
    )
    if not training:
        raise HTTPException(status_code=404, detail="Eğitim bulunamadı")
    return training


@router.post("/company/{company_id}/trainings")
async def create_training(
    company_id: str,
    title: str = Form(...),
    content: Optional[str] = Form(None),
    training_type: str = Form("video"),
    video: Optional[UploadFile] = File(None)
):
    """Create a new training (video or text)"""
    training_id = str(uuid.uuid4())
    video_path = None
    video_filename = None
    
    # Handle video upload
    if training_type == "video":
        if not video:
            raise HTTPException(status_code=400, detail="Video dosyası gerekli")
        
        # Check extension
        file_ext = os.path.splitext(video.filename)[1].lower()
        if file_ext not in ALLOWED_VIDEO_EXTENSIONS:
            raise HTTPException(
                status_code=400, 
                detail=f"Desteklenmeyen dosya formatı. İzin verilen: {', '.join(ALLOWED_VIDEO_EXTENSIONS)}"
            )
        
        # Save video - önce boyut kontrolü (max 100MB)
        video_content = await video.read()
        if len(video_content) > 100 * 1024 * 1024:
            raise HTTPException(status_code=413, detail="Video dosyası 100MB'ı geçemez")
        
        video_filename = f"{training_id}{file_ext}"
        video_path = os.path.join(UPLOAD_DIR, video_filename)
        
        try:
            with open(video_path, "wb") as buffer:
                buffer.write(video_content)
        except Exception:
            raise HTTPException(status_code=500, detail="Video yüklenemedi")
    
    training = {
        "id": training_id,
        "company_id": company_id,
        "title": title,
        "content": content,
        "content_blocks": [],  # Will be updated later if text type
        "training_type": training_type,
        "video_filename": video_filename,
        "video_path": f"/api/academy/video/{training_id}" if video_filename else None,
        "created_at": get_turkey_now(),
        "updated_at": get_turkey_now()
    }
    
    await db.academy_trainings.insert_one(training)
    
    return {"message": "Eğitim oluşturuldu", "id": training_id}


@router.put("/training/{training_id}")
async def update_training(
    training_id: str, 
    data: TrainingUpdate
):
    """Update training title or content"""
    training = await db.academy_trainings.find_one({"id": training_id})
    if not training:
        raise HTTPException(status_code=404, detail="Eğitim bulunamadı")
    
    update_data = {"updated_at": get_turkey_now()}
    if data.title:
        update_data["title"] = data.title
    if data.content is not None:
        update_data["content"] = data.content
    if data.content_blocks is not None:
        update_data["content_blocks"] = data.content_blocks
    
    await db.academy_trainings.update_one(
        {"id": training_id},
        {"$set": update_data}
    )
    
    return {"message": "Eğitim güncellendi"}


@router.delete("/training/{training_id}")
async def delete_training(
    training_id: str
):
    """Delete a training and its video file"""
    training = await db.academy_trainings.find_one({"id": training_id})
    if not training:
        raise HTTPException(status_code=404, detail="Eğitim bulunamadı")
    
    # Delete video file if exists
    if training.get("video_filename"):
        video_path = os.path.join(UPLOAD_DIR, training["video_filename"])
        if os.path.exists(video_path):
            os.remove(video_path)
    
    await db.academy_trainings.delete_one({"id": training_id})
    
    return {"message": "Eğitim silindi"}


# --- Video Streaming ---
from fastapi.responses import FileResponse, StreamingResponse

@router.get("/video/{training_id}")
async def stream_video(training_id: str):
    """Stream video file"""
    training = await db.academy_trainings.find_one({"id": training_id})
    if not training or not training.get("video_filename"):
        raise HTTPException(status_code=404, detail="Video bulunamadı")
    
    video_path = os.path.join(UPLOAD_DIR, training["video_filename"])
    if not os.path.exists(video_path):
        raise HTTPException(status_code=404, detail="Video dosyası bulunamadı")
    
    return FileResponse(
        video_path,
        media_type="video/mp4",
        filename=training["video_filename"]
    )


# --- Image Upload for Text Training ---
@router.post("/training/{training_id}/upload-image")
async def upload_training_image(
    training_id: str,
    image: UploadFile = File(...)
):
    """Upload an image for a text training content block - stores in R2"""
    from fastapi.responses import Response
    
    # Verify training exists
    training = await db.academy_trainings.find_one({"id": training_id})
    if not training:
        raise HTTPException(status_code=404, detail="Eğitim bulunamadı")
    
    # Get company name for folder structure
    company_folder = "Genel"
    if training.get("company_id"):
        company = await db.companies.find_one({"id": training["company_id"]}, {"_id": 0, "name": 1})
        if company:
            # Format company name for folder (remove special chars)
            import re
            tr_chars = {'ı': 'i', 'İ': 'I', 'ğ': 'g', 'Ğ': 'G', 'ü': 'u', 'Ü': 'U', 
                        'ş': 's', 'Ş': 'S', 'ö': 'o', 'Ö': 'O', 'ç': 'c', 'Ç': 'C'}
            company_name = company["name"]
            for tr, en in tr_chars.items():
                company_name = company_name.replace(tr, en)
            company_folder = re.sub(r'[^a-zA-Z0-9]', '', company_name)
    
    # Check extension
    file_ext = os.path.splitext(image.filename)[1].lower()
    if file_ext not in ALLOWED_IMAGE_EXTENSIONS:
        raise HTTPException(
            status_code=400, 
            detail=f"Desteklenmeyen dosya formatı. İzin verilen: {', '.join(ALLOWED_IMAGE_EXTENSIONS)}"
        )
    
    # Generate unique filename
    image_id = str(uuid.uuid4())
    image_filename = f"{training_id}_{image_id}{file_ext}"
    
    # R2 key with company folder: AKADEMI/SirketAdi/Gorseller/filename
    r2_key = f"{R2_ACADEMY_PREFIX}/{company_folder}/Gorseller/{image_filename}"
    
    # Read content
    content = await image.read()
    
    # Boyut kontrolü - Eğitim görseli max 10MB
    if len(content) > 10 * 1024 * 1024:
        raise HTTPException(status_code=413, detail="Görsel dosyası 10MB'ı geçemez")
    
    # Determine content type
    content_types = {
        '.jpg': 'image/jpeg',
        '.jpeg': 'image/jpeg',
        '.png': 'image/png',
        '.gif': 'image/gif',
        '.webp': 'image/webp'
    }
    content_type = content_types.get(file_ext, 'image/jpeg')
    
    # Upload to R2
    upload_result = await upload_file_to_r2(content, r2_key, content_type)
    if not upload_result['success']:
        raise HTTPException(status_code=500, detail="Görsel yüklenemedi")
    
    # Return the image URL (using r2_key in path)
    image_url = f"/api/academy/image/{image_filename}"
    
    # Store R2 key in database for this image
    await db.academy_images.insert_one({
        "id": image_id,
        "training_id": training_id,
        "filename": image_filename,
        "r2_key": r2_key,
        "storage_type": "r2",
        "created_at": get_turkey_now()
    })
    
    return {
        "message": "Görsel yüklendi",
        "image_id": image_id,
        "image_url": image_url,
        "filename": image_filename
    }


@router.get("/image/{filename}")
async def get_training_image(filename: str):
    """Serve training image - supports both R2 and local storage"""
    from fastapi.responses import FileResponse, Response
    
    # Check if image record exists in database (R2 storage)
    image_record = await db.academy_images.find_one({"filename": filename})
    
    if image_record and image_record.get("storage_type") == "r2":
        # Download from R2
        file_content = await download_file_from_r2(image_record["r2_key"])
        if file_content is None:
            raise HTTPException(status_code=404, detail="Görsel bulunamadı")
        
        # Determine media type
        ext = os.path.splitext(filename)[1].lower()
        media_types = {
            ".jpg": "image/jpeg",
            ".jpeg": "image/jpeg",
            ".png": "image/png",
            ".gif": "image/gif",
            ".webp": "image/webp"
        }
        media_type = media_types.get(ext, "image/jpeg")
        
        return Response(content=file_content, media_type=media_type)
    else:
        # Legacy local storage
        image_path = os.path.join(IMAGES_DIR, filename)
        if not os.path.exists(image_path):
            raise HTTPException(status_code=404, detail="Görsel bulunamadı")
        
        # Determine media type
        ext = os.path.splitext(filename)[1].lower()
        media_types = {
            ".jpg": "image/jpeg",
            ".jpeg": "image/jpeg",
            ".png": "image/png",
            ".gif": "image/gif",
            ".webp": "image/webp"
        }
        media_type = media_types.get(ext, "image/jpeg")
        
        return FileResponse(image_path, media_type=media_type)
