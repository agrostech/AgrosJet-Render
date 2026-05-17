"""
Kurye Fatura Yükümlülükleri (Haftalık)

Her hafta sonu (Pazartesi açılışta önceki Pzt-Paz blok'u için) otomatik
oluşturulur. Toggle: weekly_obligation_settings (her şirket için aç/kapa).

- Kurye paneli: kendi pending+uploaded yükümlülüklerini görür ve fatura yükler
- Admin paneli: tümünü görür, onaylar (declared_amount, partial chain)
"""
from fastapi import APIRouter, Depends, HTTPException, UploadFile, File, Form
from pydantic import BaseModel, Field
from typing import Optional
from datetime import datetime, timezone, timedelta
import uuid
import logging
import re

from utils.database import db
from utils.jwt_utils import require_auth
from services.r2_storage import upload_file_to_r2, generate_presigned_url
from services.notifications import send_push_notification

router = APIRouter(prefix="/api/courier-invoice-obligations", tags=["CourierInvoiceObligations"])
logger = logging.getLogger(__name__)
TR_TZ = timezone(timedelta(hours=3))


class ApproveBody(BaseModel):
    declared_amount: float = Field(..., gt=0)
    invoice_number: Optional[str] = None
    invoice_date: Optional[str] = None


class WeeklyAutoSettings(BaseModel):
    enabled: bool


def _is_admin(p: dict) -> bool:
    return p.get("role") in ("admin", "superadmin", "systemadmin") or bool(p.get("is_super"))


def _is_courier(p: dict) -> bool:
    return p.get("role") == "courier"


async def _serialize(rec: dict) -> dict:
    if not rec:
        return rec
    rec = {k: v for k, v in rec.items() if k != "_id"}
    if rec.get("invoice_file_key"):
        rec["invoice_file_url"] = generate_presigned_url(rec["invoice_file_key"], expiration=3600)
    return rec


# ============ KURYE ============

@router.get("/courier/me")
async def courier_list(payload: dict = Depends(require_auth)):
    if not _is_courier(payload):
        raise HTTPException(status_code=403, detail="Yetki yok")
    courier_id = payload.get("sub") or payload.get("user_id")
    company_id = payload.get("company_id")
    items = await db.courier_invoice_obligations.find(
        {"company_id": company_id, "courier_id": courier_id,
         "status": {"$in": ["pending", "uploaded"]}},
        {"_id": 0}
    ).sort("week_start", -1).to_list(200)
    return {"items": [await _serialize(r) for r in items]}


@router.get("/courier/blocking-count")
async def blocking_count(payload: dict = Depends(require_auth)):
    if not _is_courier(payload):
        return {"count": 0}
    courier_id = payload.get("sub") or payload.get("user_id")
    company_id = payload.get("company_id")
    c = await db.courier_invoice_obligations.count_documents({
        "company_id": company_id, "courier_id": courier_id,
        "status": {"$in": ["pending", "uploaded"]}
    })
    return {"count": c}


@router.post("/{req_id}/upload")
async def upload_invoice(
    req_id: str,
    invoice_number: str = Form(...),
    invoice_date: str = Form(...),
    file: UploadFile = File(...),
    payload: dict = Depends(require_auth),
):
    if not _is_courier(payload):
        raise HTTPException(status_code=403, detail="Yetki yok")
    courier_id = payload.get("sub") or payload.get("user_id")
    company_id = payload.get("company_id")
    rec = await db.courier_invoice_obligations.find_one(
        {"id": req_id, "company_id": company_id, "courier_id": courier_id}, {"_id": 0}
    )
    if not rec:
        raise HTTPException(status_code=404, detail="Kayıt bulunamadı")
    if rec.get("status") != "pending":
        raise HTTPException(status_code=400, detail="Bu kayıt için fatura yükleyemezsiniz")
    if not file or not file.filename:
        raise HTTPException(status_code=400, detail="Dosya zorunlu")
    content = await file.read()
    if not content:
        raise HTTPException(status_code=400, detail="Boş dosya")
    if len(content) > 10 * 1024 * 1024:
        raise HTTPException(status_code=400, detail="Dosya 10MB'tan büyük olamaz")
    ext = (file.filename.rsplit(".", 1)[-1] or "pdf").lower()
    if ext not in ("pdf", "jpg", "jpeg", "png", "webp"):
        raise HTTPException(status_code=400, detail="Desteklenmeyen format")
    key = f"courier-invoice-obligations/{company_id}/{courier_id}/{req_id}/{uuid.uuid4()}.{ext}"
    upload = await upload_file_to_r2(content, key, content_type=file.content_type or f"application/{ext}")
    if not upload.get("success"):
        raise HTTPException(status_code=500, detail=f"R2 hatası: {upload.get('error')}")
    await db.courier_invoice_obligations.update_one(
        {"id": req_id},
        {"$set": {
            "status": "uploaded",
            "invoice_file_key": key,
            "invoice_number": invoice_number.strip(),
            "invoice_date": invoice_date.strip(),
            "uploaded_at": datetime.now(TR_TZ).isoformat(),
        }}
    )
    updated = await db.courier_invoice_obligations.find_one({"id": req_id}, {"_id": 0})
    return {"success": True, "item": await _serialize(updated)}


# ============ ADMIN ============

@router.get("")
async def admin_list(status: Optional[str] = None, courier_id: Optional[str] = None,
                     payload: dict = Depends(require_auth)):
    if not _is_admin(payload):
        raise HTTPException(status_code=403, detail="Yetki yok")
    company_id = payload.get("company_id")
    q = {"company_id": company_id}
    if status:
        q["status"] = status
    if courier_id:
        q["courier_id"] = courier_id
    items = await db.courier_invoice_obligations.find(q, {"_id": 0}).sort("week_start", -1).to_list(2000)
    return {"items": [await _serialize(r) for r in items]}


@router.get("/courier/{courier_id}/summary")
async def courier_summary(courier_id: str, payload: dict = Depends(require_auth)):
    """Admin: bir kuryenin pending+uploaded yükümlülüklerini özet listeler (uyarı banner için)."""
    if not _is_admin(payload):
        raise HTTPException(status_code=403, detail="Yetki yok")
    company_id = payload.get("company_id")
    items = await db.courier_invoice_obligations.find(
        {"company_id": company_id, "courier_id": courier_id,
         "status": {"$in": ["pending", "uploaded"]}},
        {"_id": 0}
    ).sort("week_start", -1).to_list(100)
    return {"items": [await _serialize(r) for r in items],
            "count": len(items),
            "total_expected": round(sum(r.get("expected_amount", 0) for r in items), 2)}


@router.post("/{req_id}/approve")
async def approve(req_id: str, body: ApproveBody, payload: dict = Depends(require_auth)):
    if not _is_admin(payload):
        raise HTTPException(status_code=403, detail="Yetki yok")
    company_id = payload.get("company_id")
    admin_id = payload.get("sub") or payload.get("user_id")
    admin_doc = await db.admins.find_one({"id": admin_id}, {"_id": 0, "name": 1, "username": 1})
    admin_name = (admin_doc or {}).get("name") or (admin_doc or {}).get("username") or "Admin"
    rec = await db.courier_invoice_obligations.find_one({"id": req_id, "company_id": company_id}, {"_id": 0})
    if not rec:
        raise HTTPException(status_code=404, detail="Kayıt bulunamadı")
    if rec.get("status") != "uploaded":
        raise HTTPException(status_code=400, detail="Sadece yüklenmiş kayıtlar onaylanabilir")
    expected = float(rec.get("expected_amount") or 0)
    declared = float(body.declared_amount)
    now_iso = datetime.now(TR_TZ).isoformat()
    update = {
        "status": "approved",
        "declared_amount": declared,
        "decided_at": now_iso,
        "decided_by": admin_id,
        "decided_by_name": admin_name,
    }
    if body.invoice_number:
        update["invoice_number"] = body.invoice_number
    if body.invoice_date:
        update["invoice_date"] = body.invoice_date
    remainder_id = None
    if declared < expected - 0.01:
        remainder = round(expected - declared, 2)
        remainder_id = str(uuid.uuid4())
        await db.courier_invoice_obligations.insert_one({
            "id": remainder_id,
            "company_id": company_id,
            "courier_id": rec.get("courier_id"),
            "courier_name": rec.get("courier_name"),
            "week_start": rec.get("week_start"),
            "week_end": rec.get("week_end"),
            "expected_amount": remainder,
            "status": "pending",
            "parent_obligation_id": req_id,
            "is_remainder": True,
            "created_at": now_iso,
        })
        update["remainder_obligation_id"] = remainder_id
    await db.courier_invoice_obligations.update_one({"id": req_id}, {"$set": update})

    # Push
    try:
        c = await db.couriers.find_one({"id": rec.get("courier_id")}, {"_id": 0, "fcm_token": 1})
        token = (c or {}).get("fcm_token")
        if token:
            body_text = (f"Faturanız onaylandı ({declared:.2f} TL). Kalan {expected - declared:.2f} TL için yeni eksik fatura oluşturuldu."
                        if remainder_id else f"Faturanız onaylandı ({declared:.2f} TL).")
            await send_push_notification(token, "Fatura Onaylandı", body_text,
                                         {"type": "OBLIGATION_APPROVED", "request_id": req_id})
    except Exception as e:
        logger.warning(f"Push hatası: {e}")

    updated = await db.courier_invoice_obligations.find_one({"id": req_id}, {"_id": 0})
    return {"success": True, "item": await _serialize(updated), "remainder_obligation_id": remainder_id}


# ============ SETTINGS ============

@router.get("/auto-settings/{company_id}")
async def get_auto_settings(company_id: str, payload: dict = Depends(require_auth)):
    if not _is_admin(payload):
        raise HTTPException(status_code=403, detail="Yetki yok")
    s = await db.weekly_obligation_settings.find_one({"company_id": company_id}, {"_id": 0})
    return {"enabled": (s or {}).get("enabled", False), "last_auto_run": (s or {}).get("last_auto_run")}


@router.put("/auto-settings/{company_id}")
async def update_auto_settings(company_id: str, data: WeeklyAutoSettings, payload: dict = Depends(require_auth)):
    if not _is_admin(payload):
        raise HTTPException(status_code=403, detail="Yetki yok")
    await db.weekly_obligation_settings.update_one(
        {"company_id": company_id},
        {"$set": {"company_id": company_id, "enabled": data.enabled, "updated_at": datetime.now(TR_TZ).isoformat()}},
        upsert=True,
    )
    return {"enabled": data.enabled}


# ============ SCHEDULER HELPERS ============

def _last_week_pzt_paz(opening_time: str):
    """Geçen haftanın Pazartesi opening_time → bu hafta Pazartesi opening_time penceresi."""
    h, m = 6, 0
    try:
        h, m = [int(x) for x in opening_time.split(":")]
    except Exception:
        pass
    now = datetime.now(TR_TZ)
    # Bugün Pazartesi olduğunu varsayıyoruz (scheduler bu pencerede çalışır)
    this_monday = now.replace(hour=h, minute=m, second=0, microsecond=0)
    # Geçen Pazartesi
    last_monday = this_monday - timedelta(days=7)
    return last_monday, this_monday


def _hakedis_window_match(company_id: str, week_start_date: str, week_end_date: str,
                          week_start_iso: str, week_end_iso: str) -> dict:
    """
    Bir haftanın hakediş transaction'larını eşleştiren $match filtresi.

    Daily hakediş transaction'ları `daily_hakedis_meta.business_date` field'ı içerir
    (created_at değil!). Manual hakediş (eski/legacy) için fallback olarak
    `created_at` penceresi kullanılır. created_at = işleme zamanı olduğundan
    (örn. 10 Mayıs hakedişi 11 Mayıs 06:00'da yazılır) doğrudan created_at ile
    filtreleme off-by-one hatasına yol açar.
    """
    return {
        "company_id": company_id, "entity_type": "courier", "is_hakedis": True,
        "$or": [
            # Günlük hakediş: business_date'e göre filtre
            {"daily_hakedis_meta.business_date": {"$gte": week_start_date, "$lte": week_end_date}},
            # Manuel/legacy hakediş: meta yoksa created_at'a düş
            {
                "daily_hakedis_meta": {"$exists": False},
                "created_at": {"$gte": week_start_iso, "$lt": week_end_iso},
            },
        ],
    }


async def generate_weekly_obligations_for_company(company_id: str) -> int:
    """Tek şirket için geçen haftanın hakediş toplamına göre obligation üretir."""
    settings = await db.weekly_obligation_settings.find_one({"company_id": company_id})
    if not settings or not settings.get("enabled"):
        return 0
    company = await db.companies.find_one({"id": company_id}, {"_id": 0, "opening_time": 1})
    opening = (company or {}).get("opening_time") or "06:00"
    last_monday, this_monday = _last_week_pzt_paz(opening)
    week_start_iso = last_monday.isoformat()
    week_end_iso = this_monday.isoformat()
    week_start_date = last_monday.strftime("%Y-%m-%d")
    week_end_date = (this_monday - timedelta(days=1)).strftime("%Y-%m-%d")

    # Bu hafta için zaten oluşturulmuş mu?
    already = await db.courier_invoice_obligations.find_one({
        "company_id": company_id,
        "week_start": week_start_date,
        "is_remainder": {"$ne": True},
    }, {"_id": 0, "id": 1})
    if already:
        return 0

    # Geçen haftanın hakediş transaction'larını topla
    pipeline = [
        {"$match": _hakedis_window_match(company_id, week_start_date, week_end_date,
                                          week_start_iso, week_end_iso)},
        {"$group": {"_id": "$entity_id", "total": {"$sum": "$amount"}}},
    ]
    rows = await db.transactions.aggregate(pipeline).to_list(2000)
    if not rows:
        return 0

    courier_ids = [r["_id"] for r in rows]
    couriers = await db.couriers.find({"id": {"$in": courier_ids}}, {"_id": 0, "id": 1, "name": 1, "fcm_token": 1}).to_list(2000)
    name_map = {c["id"]: c for c in couriers}
    created = 0
    now_iso = datetime.now(TR_TZ).isoformat()
    for r in rows:
        cid = r["_id"]
        total = round(float(r["total"]), 2)
        if total <= 0:
            continue
        rec_id = str(uuid.uuid4())
        await db.courier_invoice_obligations.insert_one({
            "id": rec_id,
            "company_id": company_id,
            "courier_id": cid,
            "courier_name": (name_map.get(cid) or {}).get("name") or "",
            "week_start": week_start_date,
            "week_end": week_end_date,
            "expected_amount": total,
            "status": "pending",
            "is_remainder": False,
            "created_at": now_iso,
        })
        created += 1
        # Push
        try:
            token = (name_map.get(cid) or {}).get("fcm_token")
            if token:
                await send_push_notification(
                    token, "Eksik Faturanız Var",
                    f"{week_start_date} - {week_end_date} haftası için {total:.2f} TL fatura kesmeniz gerekiyor.",
                    {"type": "OBLIGATION_CREATED", "request_id": rec_id},
                )
        except Exception as e:
            logger.warning(f"Push hatası ({cid}): {e}")

    await db.weekly_obligation_settings.update_one(
        {"company_id": company_id},
        {"$set": {"last_auto_run": now_iso}},
    )
    return created


async def generate_weekly_obligations_all_companies():
    """Scheduler bu fonksiyonu Pazartesi açılış ±5dk penceresinde çağırır."""
    now = datetime.now(TR_TZ)
    if now.weekday() != 0:  # 0 = Monday
        return 0
    companies = await db.companies.find({}, {"_id": 0, "id": 1, "opening_time": 1}).to_list(500)
    cur_min = now.hour * 60 + now.minute
    total = 0
    for c in companies:
        opening = c.get("opening_time") or "06:00"
        try:
            h, m = [int(x) for x in opening.split(":")]
            open_min = h * 60 + m
            if abs(cur_min - open_min) > 5:
                continue
        except Exception:
            continue
        try:
            total += await generate_weekly_obligations_for_company(c["id"])
        except Exception as e:
            logger.error(f"obligation üretim hatası ({c.get('id')}): {e}")
    return total


# ============ UPCOMING PREVIEW ============

@router.get("/upcoming-preview/{company_id}")
async def upcoming_preview(company_id: str, payload: dict = Depends(require_auth)):
    """
    Bir sonraki Pazartesi açılışında otomatik oluşturulacak fatura yükümlülüklerinin
    önizlemesi. BU haftanın (Pzt opening → gelecek Pzt opening) hakediş transaction'larını
    kurye bazında toplar.
    """
    if not _is_admin(payload):
        raise HTTPException(status_code=403, detail="Yetki yok")

    company = await db.companies.find_one(
        {"id": company_id}, {"_id": 0, "opening_time": 1}
    )
    opening = (company or {}).get("opening_time") or "06:00"
    try:
        oh, om = [int(x) for x in opening.split(":")]
    except Exception:
        oh, om = 6, 0

    now = datetime.now(TR_TZ)
    days_since_monday = now.weekday()  # 0 = Pazartesi
    this_monday = (now - timedelta(days=days_since_monday)).replace(
        hour=oh, minute=om, second=0, microsecond=0
    )
    next_monday = this_monday + timedelta(days=7)

    week_start_date = this_monday.strftime("%Y-%m-%d")
    week_end_date = (next_monday - timedelta(days=1)).strftime("%Y-%m-%d")
    week_label = f"{this_monday.strftime('%d.%m')} - {(next_monday - timedelta(days=1)).strftime('%d.%m.%Y')}"

    # Aynı hafta için zaten oluşturulmuş yükümlülükler (skip listesi)
    existing = await db.courier_invoice_obligations.find(
        {
            "company_id": company_id,
            "week_start": week_start_date,
            "is_remainder": {"$ne": True},
        },
        {"_id": 0, "courier_id": 1},
    ).to_list(2000)
    existing_courier_ids = {e["courier_id"] for e in existing}

    # Otomatik üretim aktif mi?
    settings = await db.weekly_obligation_settings.find_one(
        {"company_id": company_id}, {"_id": 0, "enabled": 1}
    )
    auto_enabled = bool((settings or {}).get("enabled", False))

    pipeline = [
        {"$match": _hakedis_window_match(
            company_id, week_start_date, week_end_date,
            this_monday.isoformat(), next_monday.isoformat(),
        )},
        {"$group": {"_id": "$entity_id", "total": {"$sum": "$amount"}, "tx_count": {"$sum": 1}}},
    ]
    rows = await db.transactions.aggregate(pipeline).to_list(2000)

    if not rows:
        return {
            "week_label": week_label,
            "week_start": this_monday.isoformat(),
            "week_end": next_monday.isoformat(),
            "auto_enabled": auto_enabled,
            "scheduled_for": next_monday.isoformat(),
            "previews": [],
            "total_amount": 0,
            "courier_count": 0,
        }

    courier_ids = [r["_id"] for r in rows]
    couriers = await db.couriers.find(
        {"id": {"$in": courier_ids}}, {"_id": 0, "id": 1, "name": 1}
    ).to_list(2000)
    name_map = {c["id"]: c.get("name") or "" for c in couriers}

    previews = []
    total_amount = 0.0
    for r in rows:
        cid = r["_id"]
        amount = round(float(r["total"]), 2)
        if amount <= 0:
            continue
        previews.append({
            "courier_id": cid,
            "courier_name": name_map.get(cid) or cid,
            "expected_amount": amount,
            "tx_count": int(r.get("tx_count") or 0),
            "already_created": cid in existing_courier_ids,
        })
        if cid not in existing_courier_ids:
            total_amount += amount

    previews.sort(key=lambda x: (x["already_created"], -x["expected_amount"]))

    return {
        "week_label": week_label,
        "week_start": this_monday.isoformat(),
        "week_end": next_monday.isoformat(),
        "auto_enabled": auto_enabled,
        "scheduled_for": next_monday.isoformat(),
        "previews": previews,
        "total_amount": round(total_amount, 2),
        "courier_count": len([p for p in previews if not p["already_created"]]),
    }
