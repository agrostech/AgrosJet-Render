"""
Kurye Eksik Fatura (Missing Invoice) Router

İş kuralları:
- Mütabakat sonrası eksik nakit + eksik kart toplamı ≥ 1000 TL ise her gün
  şirket açılış saatinde otomatik tek bir "missing_invoice" kaydı oluşturulur.
- Kurye fatura PDF/foto + numara + tarih yükler.
- Admin onayında declared_amount girer:
    declared_amount >= expected_amount → status=approved (kapanır)
    declared_amount  < expected_amount → status=approved + kalan kadar yeni
                                          pending kayıt (parent/remainder link)
- Kurye'nin pending/uploaded eksik faturası varsa ödeme talebi oluşturamaz.
- Bu sistem courier_balance'ı DOKUNMAZ — açık ayrı, fatura yükümlülüğü ayrı.
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
from services.notifications import send_push_notification

router = APIRouter(prefix="/api/missing-invoices", tags=["MissingInvoices"])
logger = logging.getLogger(__name__)
TR_TZ = timezone(timedelta(hours=3))

MIN_THRESHOLD = 1000.0


class ApproveBody(BaseModel):
    declared_amount: float = Field(..., gt=0)
    invoice_number: Optional[str] = None
    invoice_date: Optional[str] = None


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


# ============ KURYE ENDPOINTS ============

@router.get("/courier/me")
async def courier_list(payload: dict = Depends(require_auth)):
    """Kurye kendi eksik faturalarını listeler (pending ve uploaded)."""
    if not _is_courier(payload):
        raise HTTPException(status_code=403, detail="Yetki yok")
    courier_id = payload.get("sub") or payload.get("user_id")
    company_id = payload.get("company_id")
    items = await db.missing_invoices.find(
        {"company_id": company_id, "courier_id": courier_id, "status": {"$in": ["pending", "uploaded"]}},
        {"_id": 0}
    ).sort("business_date", -1).to_list(200)
    return {"items": [await _serialize(r) for r in items]}


@router.get("/courier/blocking-count")
async def blocking_count(payload: dict = Depends(require_auth)):
    """Ödeme talebi blokajı için sayım: pending+uploaded eksik fatura sayısı."""
    if not _is_courier(payload):
        return {"count": 0}
    courier_id = payload.get("sub") or payload.get("user_id")
    company_id = payload.get("company_id")
    c = await db.missing_invoices.count_documents({
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
    """Kurye eksik faturayı yükler (PDF veya görsel)."""
    if not _is_courier(payload):
        raise HTTPException(status_code=403, detail="Yetki yok")
    courier_id = payload.get("sub") or payload.get("user_id")
    company_id = payload.get("company_id")

    rec = await db.missing_invoices.find_one({"id": req_id, "company_id": company_id, "courier_id": courier_id}, {"_id": 0})
    if not rec:
        raise HTTPException(status_code=404, detail="Kayıt bulunamadı")
    if rec.get("status") != "pending":
        raise HTTPException(status_code=400, detail="Bu kayıt için fatura yükleyemezsiniz")

    if not file or not file.filename:
        raise HTTPException(status_code=400, detail="Dosya zorunlu")
    if not invoice_number.strip() or not invoice_date.strip():
        raise HTTPException(status_code=400, detail="Fatura numarası ve tarihi zorunlu")

    content = await file.read()
    if not content:
        raise HTTPException(status_code=400, detail="Boş dosya")
    if len(content) > 10 * 1024 * 1024:
        raise HTTPException(status_code=400, detail="Dosya 10MB'tan büyük olamaz")
    ext = (file.filename.rsplit(".", 1)[-1] or "pdf").lower()
    if ext not in ("pdf", "jpg", "jpeg", "png", "webp"):
        raise HTTPException(status_code=400, detail="Desteklenmeyen format (PDF/JPG/PNG/WEBP)")

    key = f"missing-invoices/{company_id}/{courier_id}/{req_id}/{uuid.uuid4()}.{ext}"
    upload = await upload_file_to_r2(content, key, content_type=file.content_type or f"application/{ext}")
    if not upload.get("success"):
        raise HTTPException(status_code=500, detail=f"R2 yükleme hatası: {upload.get('error')}")

    now_iso = datetime.now(TR_TZ).isoformat()
    await db.missing_invoices.update_one(
        {"id": req_id},
        {"$set": {
            "status": "uploaded",
            "invoice_file_key": key,
            "invoice_number": invoice_number.strip(),
            "invoice_date": invoice_date.strip(),
            "uploaded_at": now_iso,
        }}
    )
    updated = await db.missing_invoices.find_one({"id": req_id}, {"_id": 0})
    return {"success": True, "item": await _serialize(updated)}


# ============ ADMIN ENDPOINTS ============

@router.get("")
async def admin_list(
    status: Optional[str] = None,
    courier_id: Optional[str] = None,
    date_from: Optional[str] = None,
    date_to: Optional[str] = None,
    payload: dict = Depends(require_auth),
):
    """Admin: tüm eksik faturalar (filtreli)."""
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
        query["business_date"] = rng

    items = await db.missing_invoices.find(query, {"_id": 0}).sort("business_date", -1).to_list(1000)
    return {"items": [await _serialize(r) for r in items]}


@router.get("/badge-count")
async def admin_badge(payload: dict = Depends(require_auth)):
    if not _is_admin(payload):
        return {"count": 0}
    company_id = payload.get("company_id")
    c = await db.missing_invoices.count_documents({"company_id": company_id, "status": "uploaded"})
    return {"count": c}


@router.post("/{req_id}/approve")
async def approve(req_id: str, body: ApproveBody, payload: dict = Depends(require_auth)):
    """Admin onayı: declared_amount eksikse kalan için yeni pending kayıt oluşturur."""
    if not _is_admin(payload):
        raise HTTPException(status_code=403, detail="Yetki yok")
    company_id = payload.get("company_id")
    admin_id = payload.get("sub") or payload.get("user_id")
    admin_doc = await db.admins.find_one({"id": admin_id}, {"_id": 0, "name": 1, "username": 1})
    admin_name = (admin_doc or {}).get("name") or (admin_doc or {}).get("username") or "Admin"

    rec = await db.missing_invoices.find_one({"id": req_id, "company_id": company_id}, {"_id": 0})
    if not rec:
        raise HTTPException(status_code=404, detail="Kayıt bulunamadı")
    if rec.get("status") != "uploaded":
        raise HTTPException(status_code=400, detail="Sadece yüklenmiş kayıtlar onaylanabilir")

    expected = float(rec.get("expected_amount") or 0)
    declared = float(body.declared_amount)
    now_iso = datetime.now(TR_TZ).isoformat()

    update_fields = {
        "status": "approved",
        "declared_amount": declared,
        "decided_at": now_iso,
        "decided_by": admin_id,
        "decided_by_name": admin_name,
    }
    if body.invoice_number:
        update_fields["invoice_number"] = body.invoice_number
    if body.invoice_date:
        update_fields["invoice_date"] = body.invoice_date

    remainder_id = None
    if declared < expected - 0.01:  # küçük yuvarlama toleransı
        remainder = round(expected - declared, 2)
        remainder_id = str(uuid.uuid4())
        new_rec = {
            "id": remainder_id,
            "company_id": company_id,
            "courier_id": rec.get("courier_id"),
            "courier_name": rec.get("courier_name"),
            "business_date": datetime.now(TR_TZ).strftime("%Y-%m-%d"),
            "expected_amount": remainder,
            "cash_amount": 0.0,
            "card_amount": 0.0,
            "status": "pending",
            "parent_invoice_id": req_id,
            "is_remainder": True,
            "created_at": now_iso,
        }
        await db.missing_invoices.insert_one(new_rec)
        update_fields["remainder_invoice_id"] = remainder_id

    await db.missing_invoices.update_one({"id": req_id}, {"$set": update_fields})

    # Kuryeye push
    try:
        courier = await db.couriers.find_one({"id": rec.get("courier_id")}, {"_id": 0, "fcm_token": 1})
        token = (courier or {}).get("fcm_token")
        if token:
            if remainder_id:
                body_text = f"Faturanız onaylandı ({declared:.2f} TL). Kalan {expected - declared:.2f} TL için yeni eksik fatura oluşturuldu."
            else:
                body_text = f"Faturanız onaylandı ({declared:.2f} TL). Yükümlülük kapandı."
            await send_push_notification(token, "Eksik Fatura Onaylandı", body_text, {
                "type": "MISSING_INVOICE_APPROVED", "request_id": req_id,
            })
    except Exception as e:
        logger.warning(f"Push hatası: {e}")

    updated = await db.missing_invoices.find_one({"id": req_id}, {"_id": 0})
    return {"success": True, "item": await _serialize(updated), "remainder_invoice_id": remainder_id}


# ============ HELPER (ödeme talebi guard için) ============

async def courier_has_blocking_missing_invoices(company_id: str, courier_id: str) -> int:
    """Ödeme talebi blokajı için sayım. Diğer modüllerden import edilir."""
    return await db.missing_invoices.count_documents({
        "company_id": company_id, "courier_id": courier_id,
        "status": {"$in": ["pending", "uploaded"]}
    })


# ============ SCHEDULER JOB ============

async def generate_daily_missing_invoices_for_company(company_id: str) -> int:
    """
    Bir şirket için günlük eksik fatura üretimi.
    Önceki iş gününün admin mütabakat reset transaction'larını (transactions
    koleksiyonu, is_admin_mutabakat=True) tarar; kurye başına nakit + kart
    eksiği toplamı ≥ MIN_THRESHOLD ise tek konsolide kayıt oluşturur.

    Returns: oluşturulan kayıt sayısı
    """
    now = datetime.now(TR_TZ)
    # Önceki gün TR-tz başlangıç/bitiş
    today_start = now.replace(hour=0, minute=0, second=0, microsecond=0)
    yesterday_start = today_start - timedelta(days=1)
    yesterday_date_str = yesterday_start.strftime("%Y-%m-%d")
    today_start_iso = today_start.isoformat()
    yesterday_start_iso = yesterday_start.isoformat()

    # transactions koleksiyonundan dünün admin_mutabakat eksik kalemlerini topla
    # Sadece type ∈ {cash, card, card_1, card_10, card_20} (yemek kartı dahil DEĞİL).
    cursor = db.transactions.find({
        "is_admin_mutabakat": True,
        "courier_id": {"$exists": True, "$ne": None},
        "type": {"$in": ["cash", "card", "card_1", "card_10", "card_20"]},
        "created_at": {"$gte": yesterday_start_iso, "$lt": today_start_iso},
    }, {"_id": 0, "courier_id": 1, "type": 1, "amount": 1})

    by_courier = {}
    async for tx in cursor:
        cid = tx.get("courier_id")
        if not cid:
            continue
        amt = float(tx.get("amount") or 0)
        if amt <= 0:
            continue
        bucket = by_courier.setdefault(cid, {"cash": 0.0, "card": 0.0})
        ttype = tx.get("type")
        if ttype == "cash":
            bucket["cash"] += amt
        else:  # card / card_1 / card_10 / card_20
            bucket["card"] += amt

    if not by_courier:
        return 0

    # Kurye isimlerini tek seferde çek
    courier_docs = await db.couriers.find(
        {"id": {"$in": list(by_courier.keys())}, "company_id": company_id},
        {"_id": 0, "id": 1, "name": 1, "fcm_token": 1}
    ).to_list(500)
    courier_map = {c["id"]: c for c in courier_docs}

    created = 0
    for courier_id, sums in by_courier.items():
        courier = courier_map.get(courier_id)
        if not courier:
            # Bu kurye bu şirkete bağlı değil — atla
            continue
        total = round(sums["cash"] + sums["card"], 2)
        if total < MIN_THRESHOLD:
            continue

        # Aynı iş günü için aynı kuryeye non-remainder kayıt var mı?
        exists = await db.missing_invoices.find_one({
            "company_id": company_id,
            "courier_id": courier_id,
            "business_date": yesterday_date_str,
            "is_remainder": {"$ne": True},
        }, {"_id": 0, "id": 1})
        if exists:
            continue

        rec_id = str(uuid.uuid4())
        await db.missing_invoices.insert_one({
            "id": rec_id,
            "company_id": company_id,
            "courier_id": courier_id,
            "courier_name": courier.get("name") or "",
            "business_date": yesterday_date_str,
            "expected_amount": total,
            "cash_amount": round(sums["cash"], 2),
            "card_amount": round(sums["card"], 2),
            "status": "pending",
            "is_remainder": False,
            "is_backfill": False,
            "created_at": now.isoformat(),
        })
        created += 1

        # Kuryeye push
        try:
            token = courier.get("fcm_token")
            if token:
                await send_push_notification(
                    token,
                    "Eksik Faturanız Var",
                    f"{yesterday_date_str} tarihi için {total:.2f} TL tutarında eksik fatura kesmeniz gerekiyor.",
                    {"type": "MISSING_INVOICE_CREATED", "request_id": rec_id},
                )
        except Exception as e:
            logger.warning(f"Push hatası ({courier_id}): {e}")

    if created > 0:
        logger.info(f"[missing_invoices] {company_id} için {created} kayıt oluşturuldu ({yesterday_date_str})")
    return created


async def generate_daily_missing_invoices_all_companies():
    """Tüm şirketler için günlük üretim — scheduler bu fonksiyonu çağırır."""
    companies = await db.companies.find({}, {"_id": 0, "id": 1, "opening_time": 1}).to_list(500)
    now = datetime.now(TR_TZ)
    cur_time = now.strftime("%H:%M")
    total = 0
    for c in companies:
        # Sadece şirketin açılış saatinin ±5 dakika penceresinde çalıştır
        opening = c.get("opening_time") or "06:00"
        try:
            oh, om = [int(x) for x in opening.split(":")]
            ch, cm = [int(x) for x in cur_time.split(":")]
            open_min = oh * 60 + om
            cur_min = ch * 60 + cm
            if abs(cur_min - open_min) > 5:
                continue
        except Exception:
            continue
        try:
            total += await generate_daily_missing_invoices_for_company(c["id"])
        except Exception as e:
            logger.error(f"missing_invoices üretim hatası ({c.get('id')}): {e}")
    return total
