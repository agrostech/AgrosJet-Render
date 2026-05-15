"""
Görev Yönetimi (Tasks) Router

İş kuralları:
- Sadece superadmin görev oluşturabilir.
- Superadmin admin'lere ve kendine atayabilir; çoklu atamada her admin için ayrı görev oluşturulur (kopya).
- Adminler birbirine görev atayamaz.
- Adminler sadece KENDİ görevlerini görür (assigned_to == kendisi).
- Adminler tamamladıkları görevlere not + max 3 resim ekler (R2'ye `tasks/{company_id}/{admin_id}/{task_id}/...`).
- Superadmin tüm tamamlanmış görevleri görür.
- "Acil" etiketi sadece superadmin set edebilir; recurring (tekrarlayan) görevler acil olamaz.
- Atayan superadmin tamamlanmamış görevleri silebilir; recurring template silinince mevcut child instance'lar kalır.

Zamanlama:
- "scheduled_at" set edilirse görev `status="scheduled"` olarak başlar; aktivasyon anına kadar admin görmez.
- "recurrence" set edilirse template oluşur (status="recurring_template", admin görmez).
  - Background job her dakika ilgili gün/saatte child instance üretir (status="pending").
"""
from fastapi import APIRouter, Depends, HTTPException, UploadFile, File, Form
from pydantic import BaseModel, Field, field_validator
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
class RecurrenceConfig(BaseModel):
    days_of_week: List[int] = Field(..., min_length=1)  # 0=Pzt ... 6=Paz
    time_of_day: str  # "HH:MM"
    until: Optional[str] = None  # ISO

    @field_validator("days_of_week")
    @classmethod
    def _valid_days(cls, v):
        if not all(0 <= d <= 6 for d in v):
            raise ValueError("days_of_week 0-6 arasında olmalı")
        return sorted(set(v))

    @field_validator("time_of_day")
    @classmethod
    def _valid_time(cls, v):
        try:
            h, m = v.split(":")
            h, m = int(h), int(m)
            if not (0 <= h <= 23 and 0 <= m <= 59):
                raise ValueError
            return f"{h:02d}:{m:02d}"
        except Exception:
            raise ValueError("time_of_day HH:MM olmalı")


class TaskCreate(BaseModel):
    title: str = Field(..., min_length=1, max_length=200)
    description: Optional[str] = Field(None, max_length=2000)
    assignee_ids: List[str] = Field(..., min_length=1)  # birden fazla admin
    due_date: Optional[str] = None  # ISO string
    is_urgent: bool = False
    scheduled_at: Optional[str] = None  # ISO string — set edilirse status=scheduled
    recurrence: Optional[RecurrenceConfig] = None  # set edilirse template oluşur


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


def _parse_iso(value: Optional[str]) -> Optional[datetime]:
    if not value:
        return None
    try:
        return datetime.fromisoformat(value.replace("Z", "+00:00"))
    except ValueError:
        raise HTTPException(status_code=400, detail="Geçersiz tarih formatı")


# ============ ENDPOINTS ============
@router.post("")
async def create_task(data: TaskCreate, payload: dict = Depends(require_auth)):
    """Görev oluştur (sadece superadmin). Hemen / İleri tarihli / Tekrarlayan üç moddan biri."""
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

    due_dt = _parse_iso(data.due_date)
    scheduled_dt = _parse_iso(data.scheduled_at)
    rec_until = _parse_iso(data.recurrence.until) if data.recurrence and data.recurrence.until else None

    # Recurring + scheduled aynı anda olamaz
    if data.recurrence and scheduled_dt:
        raise HTTPException(status_code=400, detail="Tekrarlayan ve ileri tarihli aynı anda kullanılamaz")
    # Recurring + acil aynı anda olamaz (kullanıcı isteğine göre)
    if data.recurrence and data.is_urgent:
        raise HTTPException(status_code=400, detail="Tekrarlayan görevler acil olamaz")
    # Recurring + due_date aynı anda olamaz
    if data.recurrence and due_dt:
        raise HTTPException(status_code=400, detail="Tekrarlayan görevlerde teslim tarihi kullanılmaz")

    now = datetime.now(TR_TZ)

    # Status belirleme
    def _initial_status() -> str:
        if data.recurrence:
            return "recurring_template"
        if scheduled_dt and scheduled_dt > now:
            return "scheduled"
        return "pending"

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
            "is_urgent": bool(data.is_urgent) and not data.recurrence,
            "status": _initial_status(),
            "completed_at": None,
            "completion_notes": None,
            "completion_images": [],
            "scheduled_at": scheduled_dt.isoformat() if scheduled_dt else None,
            "recurrence": (
                {
                    "days_of_week": data.recurrence.days_of_week,
                    "time_of_day": data.recurrence.time_of_day,
                    "until": rec_until.isoformat() if rec_until else None,
                }
                if data.recurrence else None
            ),
            "parent_task_id": None,
            "created_at": now.isoformat(),
            "updated_at": now.isoformat(),
        }
        await db.tasks.insert_one(task)
        created_tasks.append(await _serialize(task))

    return {"success": True, "count": len(created_tasks), "tasks": created_tasks}


@router.get("")
async def list_tasks(
    role_filter: Optional[str] = None,  # mine | assigned_by_me | all_completed
    status: Optional[str] = None,        # pending | completed | scheduled | recurring_template
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
        # Bana atanmış aktif görevler — adminler scheduled/template GÖREMEZ (backend filtre)
        query["assigned_to"] = user_id
        if not is_super:
            # Admin için sadece pending + completed
            query.setdefault("$or", [{"status": "pending"}, {"status": "completed"}])
        else:
            # Süperadmin: kendine atadıkları tüm görevler (completed hariç default; explicit status varsa override)
            if not status:
                query["status"] = {"$ne": "completed"}
    elif role_filter == "assigned_by_me":
        # Sadece superadmin: atadıklarım (kendine atadıkları HARİÇ)
        # Status'u explicit gelmediyse default = bekleyenler (pending + scheduled + recurring_template)
        if not is_super:
            raise HTTPException(status_code=403, detail="Yetki yok")
        query["assigned_by"] = user_id
        query["assigned_to"] = {"$ne": user_id}
        if not status:
            query["status"] = {"$in": ["pending", "scheduled", "recurring_template"]}
    elif role_filter == "all_completed":
        if not is_super:
            raise HTTPException(status_code=403, detail="Yetki yok")
        query["status"] = "completed"
    else:
        if not is_super:
            query["assigned_to"] = user_id

    if status:
        query["status"] = status
    if assignee and is_super:
        query["assigned_to"] = assignee

    tasks = await db.tasks.find(query, {"_id": 0}).sort("created_at", -1).to_list(500)
    enriched = [await _serialize(t) for t in tasks]
    return {"tasks": enriched}


@router.get("/badge-count")
async def badge_count(payload: dict = Depends(require_auth)):
    """Adminin bekleyen görev sayısı (badge için) — sadece pending'leri sayar (scheduled/template hariç)."""
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

    if not is_super and task.get("assigned_to") != user_id:
        raise HTTPException(status_code=403, detail="Yetki yok")
    # Admin scheduled/template göremesin
    if not is_super and task.get("status") in ("scheduled", "recurring_template"):
        raise HTTPException(status_code=403, detail="Görev henüz aktif değil")

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
    if task.get("status") in ("scheduled", "recurring_template"):
        raise HTTPException(status_code=400, detail="Henüz aktif olmayan görev tamamlanamaz")

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
    """Tamamlanmamış görevi/template'i sil — sadece atayan superadmin.
    Recurring template silinince mevcut child'lar korunur (admin tamamlayabilir)."""
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
