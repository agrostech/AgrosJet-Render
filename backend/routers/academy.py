from fastapi import APIRouter, HTTPException, UploadFile, File, Form, Header
from pydantic import BaseModel
from typing import Optional
from datetime import datetime, timezone
import uuid
import os
import shutil

from utils.database import db

router = APIRouter(prefix="/api/academy", tags=["Academy"])

# Upload directories
UPLOAD_DIR = "/app/uploads/academy"
IMAGES_DIR = "/app/uploads/academy/images"
os.makedirs(UPLOAD_DIR, exist_ok=True)
os.makedirs(IMAGES_DIR, exist_ok=True)

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
        
        # Save video
        video_filename = f"{training_id}{file_ext}"
        video_path = os.path.join(UPLOAD_DIR, video_filename)
        
        try:
            with open(video_path, "wb") as buffer:
                shutil.copyfileobj(video.file, buffer)
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
        "created_at": datetime.now(timezone.utc).isoformat(),
        "updated_at": datetime.now(timezone.utc).isoformat()
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
    
    update_data = {"updated_at": datetime.now(timezone.utc).isoformat()}
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
