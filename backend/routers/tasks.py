"""
Görev Yönetimi (Tasks) Router

İş kuralları:
- Sadece superadmin görev oluşturabilir.
- Superadmin admin'lere ve kendine atayabilir; çoklu atamada her admin için ayrı görev oluşturulur (kopya).
- Adminler birbirine görev atayamaz.
- Adminler sadece KENDİ görevlerini görür (assigned_to == kendisi).
- Adminler tamamladıkları görevlere not + max 3 resim ekler (R2'ye `tasks/{company_id}/{admin_id}/{task_id}/...`).
- Superadmin tüm tamamlanmış görevleri görür.
- "Acil" etiketi sadece superadmin set edebilir.
- Atayan superadmin tamamlanmamış görevleri silebilir.
"""
from fastapi import APIRouter, Depends, HTTPException, UploadFile, File, Form
from pydantic import BaseModel, Field
from typing import Optional, List
from datetime import datetime, timezone, timedelta
import uuid
import logging

from utils.database import db
from utils.jwt_utils import require_auth
from services.r2_storage import upload_file_to_r2, generate_presigned_url

router = APIRouter(prefix="/api/tasks", tags=["Tasks"])
logger = logging.getLogger(__name__)
TR_TZ = timezone(timedelta(hours=3))


# ============ MODELS ============
class TaskCreate(BaseModel):
    title: str = Field(..., min_length=1, max_length=200)
    description: Optional[str] = Field(None, max_length=2000)
    assignee_ids: List[str] = Field(..., min_length=1)  # birden fazla admin
    due_date: Optional[str] = None  # ISO string
    is_urgent: bool = False


# ============ HELPERS ============
def _is_superadmin(payload: dict) -> bool:
    role = payload.get("role")
    return role in ("systemadmin", "superadmin") or bool(payload.get("is_super"))


async def _serialize(task: dict) -> dict:
    """Task dict → JSON-safe dict (presigned image URLs eklenir)."""
    if not task:
        return task
    task = {k: v for k, v in task.items() if k != "_id"}
    images = task.get("completion_images") or []
    if images:
        signed = []
        for key in images:
            url = generate_presigned_url(key, expiration=3600)
            signed.append({"key": key, "url": url})
        task["completion_image_urls"] = signed
    return task


# ============ ENDPOINTS ============
@router.post("")
async def create_task(data: TaskCreate, payload: dict = Depends(require_auth)):
    """Görev oluştur (sadece superadmin)."""
    if not _is_superadmin(payload):
        raise HTTPException(status_code=403, detail="Sadece süperadmin görev oluşturabilir")

    company_id = payload.get("company_id")
    if not company_id:
        raise HTTPException(status_code=400, detail="company_id token'da bulunamadı")

    creator_id = payload.get("sub") or payload.get("admin_id") or payload.get("user_id")
    creator_doc = await db.admins.find_one({"id": creator_id}, {"_id": 0, "name": 1, "username": 1})
    creator_name = (creator_doc or {}).get("name") or (creator_doc or {}).get("username") or "Süperadmin"

    # Hedef admin'leri doğrula (aynı şirkette ve admin/superadmin rolünde)
    assignees = await db.admins.find(
        {"id": {"$in": data.assignee_ids}, "company_id": company_id},
        {"_id": 0, "id": 1, "name": 1, "role": 1}
    ).to_list(50)
    if len(assignees) != len(set(data.assignee_ids)):
        raise HTTPException(status_code=400, detail="Bir veya daha fazla admin bulunamadı")

    due_dt = None
    if data.due_date:
        try:
            due_dt = datetime.fromisoformat(data.due_date.replace("Z", "+00:00"))
        except ValueError:
            raise HTTPException(status_code=400, detail="Geçersiz teslim tarihi")

    now = datetime.now(TR_TZ)
    created_tasks = []
    for assignee in assignees:
        task = {
            "id": str(uuid.uuid4()),
            "company_id": company_id,
            "title": data.title.strip(),
            "description": (data.description or "").strip() or None,
            "assigned_to": assignee["id"],
            "assigned_to_name": assignee.get("name") or "",
            "assigned_by": creator_id,
            "assigned_by_name": creator_name,
            "due_date": due_dt.isoformat() if due_dt else None,
            "is_urgent": bool(data.is_urgent),
            "status": "pending",
            "completed_at": None,
            "completion_notes": None,
            "completion_images": [],
            "created_at": now.isoformat(),
            "updated_at": now.isoformat(),
        }
        await db.tasks.insert_one(task)
        created_tasks.append(await _serialize(task))

    return {"success": True, "count": len(created_tasks), "tasks": created_tasks}


@router.get("")
async def list_tasks(
    role_filter: Optional[str] = None,  # mine | assigned_by_me | all_completed
    status: Optional[str] = None,        # pending | completed
    assignee: Optional[str] = None,       # filter by admin id (superadmin için)
    payload: dict = Depends(require_auth),
):
    """Görev listesi (rol bazlı)."""
    company_id = payload.get("company_id")
    if not company_id:
        raise HTTPException(status_code=400, detail="company_id eksik")

    user_id = payload.get("sub") or payload.get("admin_id") or payload.get("user_id")
    is_super = _is_superadmin(payload)

    query = {"company_id": company_id}

    if role_filter == "mine":
        # Hem admin hem superadmin için: bana atanmış
        query["assigned_to"] = user_id
    elif role_filter == "assigned_by_me":
        # Sadece superadmin: atadıklarım (kendine atadıkları HARİÇ)
        if not is_super:
            raise HTTPException(status_code=403, detail="Yetki yok")
        query["assigned_by"] = user_id
        query["assigned_to"] = {"$ne": user_id}
    elif role_filter == "all_completed":
        # Sadece superadmin: tüm tamamlananlar
        if not is_super:
            raise HTTPException(status_code=403, detail="Yetki yok")
        query["status"] = "completed"
    else:
        # Default: kullanıcıyı ilgilendiren (admin için)
        if not is_super:
            query["assigned_to"] = user_id

    if status:
        query["status"] = status
    if assignee and is_super:
        query["assigned_to"] = assignee

    tasks = await db.tasks.find(query, {"_id": 0}).sort("created_at", -1).to_list(500)

    # Presigned URL'leri ekle
    for t in tasks:
        await _serialize(t)
        # _serialize task'ı in-place mutasyonla genişletti, ama biz dict döndürüyoruz
    enriched = [await _serialize(t) for t in tasks]
    return {"tasks": enriched}


@router.get("/badge-count")
async def badge_count(payload: dict = Depends(require_auth)):
    """Adminin bekleyen görev sayısı (badge için)."""
    company_id = payload.get("company_id")
    user_id = payload.get("sub") or payload.get("admin_id") or payload.get("user_id")
    if not company_id or not user_id:
        return {"count": 0}
    count = await db.tasks.count_documents({
        "company_id": company_id,
        "assigned_to": user_id,
        "status": "pending"
    })
    return {"count": count}


@router.get("/admins/list")
async def list_admins_for_assignment(payload: dict = Depends(require_auth)):
    """Görev atama için admin listesi (sadece superadmin)."""
    if not _is_superadmin(payload):
        raise HTTPException(status_code=403, detail="Yetki yok")
    company_id = payload.get("company_id")
    admins = await db.admins.find(
        {"company_id": company_id, "is_archived": {"$ne": True}},
        {"_id": 0, "id": 1, "name": 1, "role": 1, "username": 1}
    ).to_list(200)
    return {"admins": admins}


@router.get("/{task_id}")
async def get_task(task_id: str, payload: dict = Depends(require_auth)):
    company_id = payload.get("company_id")
    user_id = payload.get("sub") or payload.get("admin_id") or payload.get("user_id")
    is_super = _is_superadmin(payload)

    task = await db.tasks.find_one({"id": task_id, "company_id": company_id}, {"_id": 0})
    if not task:
        raise HTTPException(status_code=404, detail="Görev bulunamadı")

    # Yetki: superadmin her şeyi görür; admin sadece kendine ait
    if not is_super and task.get("assigned_to") != user_id:
        raise HTTPException(status_code=403, detail="Yetki yok")

    return await _serialize(task)


@router.post("/{task_id}/complete")
async def complete_task(
    task_id: str,
    notes: str = Form(""),
    files: List[UploadFile] = File(default_factory=list),
    payload: dict = Depends(require_auth),
):
    """Görevi tamamla — atanan kişi (admin veya kendine atayan superadmin)."""
    company_id = payload.get("company_id")
    user_id = payload.get("sub") or payload.get("admin_id") or payload.get("user_id")

    task = await db.tasks.find_one({"id": task_id, "company_id": company_id}, {"_id": 0})
    if not task:
        raise HTTPException(status_code=404, detail="Görev bulunamadı")
    if task.get("assigned_to") != user_id:
        raise HTTPException(status_code=403, detail="Bu görev size atanmamış")
    if task.get("status") == "completed":
        raise HTTPException(status_code=400, detail="Görev zaten tamamlanmış")

    if files and len(files) > 3:
        raise HTTPException(status_code=400, detail="En fazla 3 resim yüklenebilir")

    # Resimleri R2'ye yükle
    image_keys: List[str] = []
    for upload in files or []:
        if not upload or not upload.filename:
            continue
        content = await upload.read()
        if not content:
            continue
        if len(content) > 10 * 1024 * 1024:  # 10MB limit
            raise HTTPException(status_code=400, detail=f"{upload.filename}: 10MB üzeri yüklenemez")
        ext = (upload.filename.rsplit(".", 1)[-1] or "jpg").lower()
        if ext not in ("jpg", "jpeg", "png", "webp", "gif"):
            raise HTTPException(status_code=400, detail=f"{upload.filename}: desteklenmeyen format")
        key = f"tasks/{company_id}/{user_id}/{task_id}/{uuid.uuid4()}.{ext}"
        ctype = upload.content_type or f"image/{ext}"
        result = await upload_file_to_r2(content, key, content_type=ctype)
        if not result.get("success"):
            raise HTTPException(status_code=500, detail=f"R2 yükleme hatası: {result.get('error')}")
        image_keys.append(key)

    now = datetime.now(TR_TZ)
    await db.tasks.update_one(
        {"id": task_id},
        {"$set": {
            "status": "completed",
            "completed_at": now.isoformat(),
            "completion_notes": (notes or "").strip() or None,
            "completion_images": image_keys,
            "updated_at": now.isoformat(),
        }}
    )

    updated = await db.tasks.find_one({"id": task_id}, {"_id": 0})
    return {"success": True, "task": await _serialize(updated)}


@router.delete("/{task_id}")
async def delete_task(task_id: str, payload: dict = Depends(require_auth)):
    """Tamamlanmamış görevi sil — sadece atayan superadmin."""
    if not _is_superadmin(payload):
        raise HTTPException(status_code=403, detail="Yetki yok")

    company_id = payload.get("company_id")
    user_id = payload.get("sub") or payload.get("admin_id") or payload.get("user_id")

    task = await db.tasks.find_one({"id": task_id, "company_id": company_id}, {"_id": 0})
    if not task:
        raise HTTPException(status_code=404, detail="Görev bulunamadı")
    if task.get("assigned_by") != user_id:
        raise HTTPException(status_code=403, detail="Sadece atayan süperadmin silebilir")
    if task.get("status") == "completed":
        raise HTTPException(status_code=400, detail="Tamamlanmış görev silinemez")

    await db.tasks.delete_one({"id": task_id})
    return {"success": True}
