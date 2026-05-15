"""
Muafiyet Talebi (Exemption Request) Router

İş kuralları:
- Kurye sebep + zorunlu not + zorunlu görsel ile talep oluşturur.
- Aynı gün içinde pending veya approved muafiyeti varsa yeni talep açamaz.
- Adminler talebi onaylar veya reddeder. Onay sonrası bir sonraki gün şirket
  açılış saatine (opening_time, default 06:00) kadar geçerli olur.
- Onaylı muafiyet penceresinde vardiya ihlal kayıtları oluşur ama penalty=0
  ve `is_exempt=True` ile işaretlenir (shift_violations tarafında).
- Reddedilen taleplerin görseli korunur (audit).
"""
from fastapi import APIRouter, Depends, HTTPException, UploadFile, File, Form
from pydantic import BaseModel, Field
from typing import Optional
from datetime import datetime, timezone, timedelta
import uuid
import logging

from utils.database import db
from utils.jwt_utils import require_auth
from services.r2_storage import upload_file_to_r2, generate_presigned_url

router = APIRouter(prefix="/api/exemption-requests", tags=["Exemptions"])
logger = logging.getLogger(__name__)
TR_TZ = timezone(timedelta(hours=3))

REASONS = {
    "health": "Sağlık Sorunu",
    "accident": "Trafik Kazası",
    "equipment": "Ekipman Arızası",
    "other": "Diğer",
}


class RejectBody(BaseModel):
    reason: Optional[str] = Field(None, max_length=500)


def _is_admin(payload: dict) -> bool:
    role = payload.get("role")
    return role in ("admin", "superadmin", "systemadmin") or bool(payload.get("is_super"))


def _is_courier(payload: dict) -> bool:
    return payload.get("role") == "courier"


async def _serialize(req: dict) -> dict:
    if not req:
        return req
    req = {k: v for k, v in req.items() if k != "_id"}
    if req.get("image_key"):
        req["image_url"] = generate_presigned_url(req["image_key"], expiration=3600)
    return req


async def _company_opening_time(company_id: str) -> str:
    company = await db.companies.find_one({"id": company_id}, {"_id": 0, "opening_time": 1})
    return (company or {}).get("opening_time") or "06:00"


async def _exemption_enabled(company_id: str) -> bool:
    """Şirketin muafiyet sistemi açık mı? Default: True (geriye uyumluluk için)."""
    company = await db.companies.find_one({"id": company_id}, {"_id": 0, "exemption_enabled": 1})
    if not company:
        return True
    val = company.get("exemption_enabled")
    return True if val is None else bool(val)


def _next_opening_dt(now: datetime, opening_time: str) -> datetime:
    """Yarın opening_time'a karşılık gelen TR-TZ datetime."""
    try:
        h, m = [int(x) for x in opening_time.split(":")]
    except Exception:
        h, m = 6, 0
    tomorrow = now + timedelta(days=1)
    return tomorrow.replace(hour=h, minute=m, second=0, microsecond=0)


@router.post("")
async def create_request(
    reason: str = Form(...),
    notes: str = Form(...),
    file: UploadFile = File(...),
    payload: dict = Depends(require_auth),
):
    """Kurye muafiyet talebi oluşturur."""
    if not _is_courier(payload):
        raise HTTPException(status_code=403, detail="Sadece kuryeler talep oluşturabilir")
    if reason not in REASONS:
        raise HTTPException(status_code=400, detail="Geçersiz sebep")
    if not notes or len(notes.strip()) < 10:
        raise HTTPException(status_code=400, detail="Notlar en az 10 karakter olmalı")
    if not file or not file.filename:
        raise HTTPException(status_code=400, detail="Görsel zorunlu")

    courier_id = payload.get("sub") or payload.get("courier_id") or payload.get("user_id")
    company_id = payload.get("company_id")
    if not courier_id or not company_id:
        raise HTTPException(status_code=400, detail="Kurye/şirket bilgisi eksik")

    # Şirket muafiyet sistemini kapatmışsa talep alınmaz
    if not await _exemption_enabled(company_id):
        raise HTTPException(status_code=403, detail="Şirketiniz muafiyet sistemini kullanmıyor")

    # Aynı gün için pending veya approved var mı?
    now = datetime.now(TR_TZ)
    today_start_iso = now.replace(hour=0, minute=0, second=0, microsecond=0).isoformat()
    duplicate = await db.exemption_requests.find_one({
        "company_id": company_id,
        "courier_id": courier_id,
        "status": {"$in": ["pending", "approved"]},
        "submitted_at": {"$gte": today_start_iso},
    })
    if duplicate:
        raise HTTPException(status_code=400, detail="Bugün için zaten aktif bir muafiyet talebiniz var")

    # Görseli R2'ye yükle
    content = await file.read()
    if not content:
        raise HTTPException(status_code=400, detail="Boş dosya")
    if len(content) > 10 * 1024 * 1024:
        raise HTTPException(status_code=400, detail="Görsel 10MB'tan büyük olamaz")
    ext = (file.filename.rsplit(".", 1)[-1] or "jpg").lower()
    if ext not in ("jpg", "jpeg", "png", "webp", "heic", "heif"):
        raise HTTPException(status_code=400, detail="Desteklenmeyen format")
    req_id = str(uuid.uuid4())
    key = f"exemptions/{company_id}/{courier_id}/{req_id}/{uuid.uuid4()}.{ext}"
    upload = await upload_file_to_r2(content, key, content_type=file.content_type or f"image/{ext}")
    if not upload.get("success"):
        raise HTTPException(status_code=500, detail=f"R2 yükleme hatası: {upload.get('error')}")

    # Kurye adını cache'e al
    courier_doc = await db.couriers.find_one({"id": courier_id}, {"_id": 0, "name": 1})

    record = {
        "id": req_id,
        "company_id": company_id,
        "courier_id": courier_id,
        "courier_name": (courier_doc or {}).get("name") or "",
        "reason": reason,
        "reason_label": REASONS[reason],
        "notes": notes.strip(),
        "image_key": key,
        "status": "pending",
        "submitted_at": now.isoformat(),
        "decided_at": None,
        "decided_by": None,
        "decided_by_name": None,
        "rejection_reason": None,
        "exempt_from": None,
        "exempt_until": None,
    }
    await db.exemption_requests.insert_one(record)
    return {"success": True, "request": await _serialize(record)}


@router.get("")
async def list_requests(
    status: Optional[str] = None,
    courier_id: Optional[str] = None,
    date_from: Optional[str] = None,
    date_to: Optional[str] = None,
    payload: dict = Depends(require_auth),
):
    """Admin: muafiyet kayıtları listesi (filtreli)."""
    if not _is_admin(payload):
        raise HTTPException(status_code=403, detail="Yetki yok")
    company_id = payload.get("company_id")
    if not company_id:
        raise HTTPException(status_code=400, detail="company_id eksik")

    query = {"company_id": company_id}
    if status:
        query["status"] = status
    if courier_id:
        query["courier_id"] = courier_id
    if date_from or date_to:
        rng = {}
        if date_from:
            rng["$gte"] = date_from
        if date_to:
            rng["$lte"] = date_to
        query["submitted_at"] = rng

    items = await db.exemption_requests.find(query, {"_id": 0}).sort("submitted_at", -1).to_list(500)
    return {"requests": [await _serialize(r) for r in items]}


@router.get("/badge-count")
async def badge_count(payload: dict = Depends(require_auth)):
    if not _is_admin(payload):
        return {"count": 0}
    company_id = payload.get("company_id")
    if not company_id:
        return {"count": 0}
    c = await db.exemption_requests.count_documents({"company_id": company_id, "status": "pending"})
    return {"count": c}


@router.get("/courier/active")
async def courier_active(payload: dict = Depends(require_auth)):
    """Kuryenin şu anda aktif (onaylı + süresi geçerli) muafiyetini döner."""
    if not _is_courier(payload):
        raise HTTPException(status_code=403, detail="Yetki yok")
    courier_id = payload.get("sub") or payload.get("courier_id") or payload.get("user_id")
    company_id = payload.get("company_id")
    now_iso = datetime.now(TR_TZ).isoformat()
    rec = await db.exemption_requests.find_one({
        "company_id": company_id,
        "courier_id": courier_id,
        "status": "approved",
        "exempt_from": {"$lte": now_iso},
        "exempt_until": {"$gt": now_iso},
    }, {"_id": 0})
    return {"active": await _serialize(rec) if rec else None}


@router.get("/courier/today")
async def courier_today(payload: dict = Depends(require_auth)):
    """Kuryenin bugün (TR günü başı sonrası) açtığı talebi döner — UI için duplicate koruması."""
    if not _is_courier(payload):
        raise HTTPException(status_code=403, detail="Yetki yok")
    courier_id = payload.get("sub") or payload.get("courier_id") or payload.get("user_id")
    company_id = payload.get("company_id")
    today_start = datetime.now(TR_TZ).replace(hour=0, minute=0, second=0, microsecond=0).isoformat()
    rec = await db.exemption_requests.find_one({
        "company_id": company_id,
        "courier_id": courier_id,
        "status": {"$in": ["pending", "approved"]},
        "submitted_at": {"$gte": today_start},
    }, {"_id": 0})
    return {"request": await _serialize(rec) if rec else None}


# ============ SETTINGS (route'ları /{req_id}'dan ÖNCE tanımla) ============
class SettingsBody(BaseModel):
    enabled: bool


@router.get("/settings/status")
async def get_settings(payload: dict = Depends(require_auth)):
    """Şirketin muafiyet sistemi açık mı? Hem admin hem kurye okuyabilir."""
    company_id = payload.get("company_id")
    if not company_id:
        return {"enabled": False}
    return {"enabled": await _exemption_enabled(company_id)}


@router.put("/settings/status")
async def update_settings(body: SettingsBody, payload: dict = Depends(require_auth)):
    """Sadece admin/superadmin şirket muafiyet sistemini açıp kapatabilir."""
    if not _is_admin(payload):
        raise HTTPException(status_code=403, detail="Yetki yok")
    company_id = payload.get("company_id")
    if not company_id:
        raise HTTPException(status_code=400, detail="company_id eksik")
    await db.companies.update_one(
        {"id": company_id},
        {"$set": {"exemption_enabled": bool(body.enabled)}}
    )
    return {"success": True, "enabled": bool(body.enabled)}


@router.get("/{req_id}")
async def get_request(req_id: str, payload: dict = Depends(require_auth)):
    company_id = payload.get("company_id")
    rec = await db.exemption_requests.find_one({"id": req_id, "company_id": company_id}, {"_id": 0})
    if not rec:
        raise HTTPException(status_code=404, detail="Talep bulunamadı")
    # Kurye sadece kendi talebini görebilir
    if _is_courier(payload):
        cid = payload.get("sub") or payload.get("courier_id") or payload.get("user_id")
        if rec.get("courier_id") != cid:
            raise HTTPException(status_code=403, detail="Yetki yok")
    elif not _is_admin(payload):
        raise HTTPException(status_code=403, detail="Yetki yok")
    return await _serialize(rec)


@router.post("/{req_id}/approve")
async def approve_request(req_id: str, payload: dict = Depends(require_auth)):
    if not _is_admin(payload):
        raise HTTPException(status_code=403, detail="Yetki yok")
    company_id = payload.get("company_id")
    admin_id = payload.get("sub") or payload.get("admin_id") or payload.get("user_id")
    admin_doc = await db.admins.find_one({"id": admin_id}, {"_id": 0, "name": 1, "username": 1})
    admin_name = (admin_doc or {}).get("name") or (admin_doc or {}).get("username") or "Admin"

    rec = await db.exemption_requests.find_one({"id": req_id, "company_id": company_id}, {"_id": 0})
    if not rec:
        raise HTTPException(status_code=404, detail="Talep bulunamadı")
    if rec.get("status") != "pending":
        raise HTTPException(status_code=400, detail="Talep zaten karara bağlanmış")

    now = datetime.now(TR_TZ)
    opening = await _company_opening_time(company_id)
    until = _next_opening_dt(now, opening)
    await db.exemption_requests.update_one(
        {"id": req_id},
        {"$set": {
            "status": "approved",
            "decided_at": now.isoformat(),
            "decided_by": admin_id,
            "decided_by_name": admin_name,
            "exempt_from": now.isoformat(),
            "exempt_until": until.isoformat(),
        }}
    )
    updated = await db.exemption_requests.find_one({"id": req_id}, {"_id": 0})
    return {"success": True, "request": await _serialize(updated)}


@router.post("/{req_id}/reject")
async def reject_request(req_id: str, body: RejectBody, payload: dict = Depends(require_auth)):
    if not _is_admin(payload):
        raise HTTPException(status_code=403, detail="Yetki yok")
    company_id = payload.get("company_id")
    admin_id = payload.get("sub") or payload.get("admin_id") or payload.get("user_id")
    admin_doc = await db.admins.find_one({"id": admin_id}, {"_id": 0, "name": 1, "username": 1})
    admin_name = (admin_doc or {}).get("name") or (admin_doc or {}).get("username") or "Admin"

    rec = await db.exemption_requests.find_one({"id": req_id, "company_id": company_id}, {"_id": 0})
    if not rec:
        raise HTTPException(status_code=404, detail="Talep bulunamadı")
    if rec.get("status") != "pending":
        raise HTTPException(status_code=400, detail="Talep zaten karara bağlanmış")

    now = datetime.now(TR_TZ)
    await db.exemption_requests.update_one(
        {"id": req_id},
        {"$set": {
            "status": "rejected",
            "decided_at": now.isoformat(),
            "decided_by": admin_id,
            "decided_by_name": admin_name,
            "rejection_reason": (body.reason or "").strip() or None,
        }}
    )
    updated = await db.exemption_requests.find_one({"id": req_id}, {"_id": 0})
    return {"success": True, "request": await _serialize(updated)}


# ============ HELPER (shift_violations için) ============
async def is_courier_exempt_at(company_id: str, courier_id: str, when_iso: str) -> Optional[dict]:
    """Belirli zamanda kuryenin onaylı muafiyeti varsa kaydı döner; yoksa None."""
    return await db.exemption_requests.find_one({
        "company_id": company_id,
        "courier_id": courier_id,
        "status": "approved",
        "exempt_from": {"$lte": when_iso},
        "exempt_until": {"$gt": when_iso},
    }, {"_id": 0, "id": 1, "reason": 1, "reason_label": 1})

