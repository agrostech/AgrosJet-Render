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

# In-memory cache (60 sn TTL) — weeks-summary için ağır hesaplama
_WEEK_CACHE: dict = {}
_WEEK_CACHE_TTL = 60.0


def _cache_get(key: str):
    import time
    entry = _WEEK_CACHE.get(key)
    if not entry:
        return None
    if time.time() - entry[0] > _WEEK_CACHE_TTL:
        _WEEK_CACHE.pop(key, None)
        return None
    return entry[1]


def _cache_set(key: str, value):
    import time
    _WEEK_CACHE[key] = (time.time(), value)


class ApproveBody(BaseModel):
    declared_amount: float = Field(..., gt=0)
    invoice_number: Optional[str] = None
    invoice_date: Optional[str] = None


class ManualObligationBody(BaseModel):
    courier_id: str
    amount: float = Field(..., gt=0)
    week_start: str  # "YYYY-MM-DD" — hafta seçicide gösterilecek hafta
    description: Optional[str] = None


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


@router.post("/manual/{company_id}")
async def create_manual_obligation(company_id: str, data: ManualObligationBody, payload: dict = Depends(require_auth)):
    """
    Admin manuel olarak bir kurye için fatura yükümlülüğü oluşturur.
    Otomatik üretimden farklı: `is_manual=True` flag ile işaretlenir.
    Kurye, panelindeki Faturalarım modalında bu kaydı görür ve fatura yükler.
    """
    if not _is_admin(payload):
        raise HTTPException(status_code=403, detail="Yetki yok")

    # Hafta validasyonu
    try:
        ws_dt = datetime.strptime(data.week_start, "%Y-%m-%d")
    except ValueError:
        raise HTTPException(status_code=400, detail="Geçersiz hafta (YYYY-MM-DD bekleniyor)")
    week_start_date = ws_dt.strftime("%Y-%m-%d")
    week_end_date = (ws_dt + timedelta(days=6)).strftime("%Y-%m-%d")

    # Kurye varlığını ve şirket eşleşmesini doğrula
    courier = await db.couriers.find_one(
        {"id": data.courier_id, "company_id": company_id},
        {"_id": 0, "id": 1, "name": 1, "fcm_token": 1},
    )
    if not courier:
        raise HTTPException(status_code=404, detail="Kurye bulunamadı")

    rec_id = str(uuid.uuid4())
    now_iso = datetime.now(TR_TZ).isoformat()
    admin_id = payload.get("user_id") or payload.get("id") or ""
    admin_name = payload.get("name") or payload.get("username") or "Admin"

    record = {
        "id": rec_id,
        "company_id": company_id,
        "courier_id": data.courier_id,
        "courier_name": courier.get("name") or "",
        "week_start": week_start_date,
        "week_end": week_end_date,
        "expected_amount": round(float(data.amount), 2),
        "status": "pending",
        "is_remainder": False,
        "is_manual": True,
        "manual_description": (data.description or "").strip() or None,
        "created_by": admin_id,
        "created_by_name": admin_name,
        "created_at": now_iso,
    }
    await db.courier_invoice_obligations.insert_one(record)

    # Cache invalide
    _WEEK_CACHE.clear()

    # Kurye push bildirimi
    try:
        token = courier.get("fcm_token")
        if token:
            await send_push_notification(
                token,
                "Yeni Fatura Yükümlülüğü",
                f"{week_start_date} - {week_end_date} haftası için {data.amount:.2f} TL fatura kesmeniz isteniyor.",
                {"type": "MANUAL_OBLIGATION_CREATED", "request_id": rec_id},
            )
    except Exception as e:
        logger.warning(f"Manuel obligation push hatası ({data.courier_id}): {e}")

    return {"item": await _serialize(record)}



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

    Hakediş transaction'larında `created_at` = işleme zamanıdır (örn. 10 Mayıs
    hakedişi 11 Mayıs 06:00'da yazılır), bu yüzden ham `created_at` ile
    filtreleme off-by-one hatasına yol açar.

    Stratejiler:
      1. Günlük hakediş: `daily_hakedis_meta.business_date` ∈ [week_start_date, week_end_date]
      2. Haftalık (legacy) hakediş: `weekly_hakedis_meta.week_start` ∈ [week_start_iso, week_end_iso)
      3. Hiçbir meta yoksa (manuel): `created_at` penceresi
    """
    return {
        "company_id": company_id, "entity_type": "courier", "is_hakedis": True,
        "$or": [
            # 1) Günlük hakediş → business_date filter
            {"daily_hakedis_meta.business_date": {"$gte": week_start_date, "$lte": week_end_date}},
            # 2) Haftalık (legacy) hakediş → weekly meta filter
            {"weekly_hakedis_meta.week_start": {"$gte": week_start_iso, "$lt": week_end_iso}},
            # 3) Manuel hakediş (hiç meta yok) → created_at fallback
            {
                "daily_hakedis_meta": {"$exists": False},
                "weekly_hakedis_meta": {"$exists": False},
                "created_at": {"$gte": week_start_iso, "$lt": week_end_iso},
            },
        ],
    }


async def generate_weekly_obligations_for_company(company_id: str) -> int:
    """Tek şirket için geçen haftanın hakediş toplamına göre obligation üretir.

    Strateji: O haftanın 7 günü için `calculate_day_hakedis` (saatlik dahil)
    çağrılıp tahmini tutar bulunur. Mevcut işlenmiş transaction'lar da topluca
    sayılır (ikisinden büyük olan = obligation). Bu sayede otomatik işlenmemiş
    günler de obligation'a dahil olur.
    """
    from services.daily_hakedis_service import calculate_day_hakedis

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

    # Mevcut hakediş transaction toplamları
    pipeline = [
        {"$match": _hakedis_window_match(company_id, week_start_date, week_end_date,
                                          week_start_iso, week_end_iso)},
        {"$group": {"_id": "$entity_id", "total": {"$sum": "$amount"}}},
    ]
    rows = await db.transactions.aggregate(pipeline).to_list(2000)
    processed_map = {r["_id"]: float(r["total"]) for r in rows}

    # 7 günün potansiyel hakedişini topla (saatlik dahil, işlenmemiş günler de)
    courier_expected = {}  # courier_id -> {"name": str, "amount": float}
    cur_dt = last_monday
    while cur_dt < this_monday:
        biz_date = cur_dt.strftime("%Y-%m-%d")
        day_data = await calculate_day_hakedis(company_id, biz_date)
        for c in day_data.get("couriers", []):
            amt = float(c.get("amount") or 0)
            if amt <= 0:
                continue
            cid = c["courier_id"]
            slot = courier_expected.setdefault(cid, {"name": c.get("courier_name") or "", "amount": 0.0})
            slot["amount"] += amt
        cur_dt = cur_dt + timedelta(days=1)

    # Birleşik kurye seti
    all_courier_ids = set(processed_map.keys()) | set(courier_expected.keys())
    if not all_courier_ids:
        return 0

    couriers = await db.couriers.find(
        {"id": {"$in": list(all_courier_ids)}},
        {"_id": 0, "id": 1, "name": 1, "fcm_token": 1}
    ).to_list(2000)
    name_map = {c["id"]: c for c in couriers}

    created = 0
    now_iso = datetime.now(TR_TZ).isoformat()
    for cid in all_courier_ids:
        processed_amt = processed_map.get(cid, 0.0)
        expected_amt = courier_expected.get(cid, {}).get("amount", 0.0)
        # Obligation tutarı: işlenmiş ve tahmin'in büyüğü
        total = round(max(processed_amt, expected_amt), 2)
        if total <= 0:
            continue
        rec_id = str(uuid.uuid4())
        await db.courier_invoice_obligations.insert_one({
            "id": rec_id,
            "company_id": company_id,
            "courier_id": cid,
            "courier_name": (name_map.get(cid) or {}).get("name") or courier_expected.get(cid, {}).get("name") or "",
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
    önizlemesi.

    Tahmini yaklaşım: O haftanın 7 günü için `calculate_day_hakedis` çağrılır
    (işlenmiş ya da işlenmemiş — fark etmez). Her kuryenin paket + saatlik dahil
    toplam tutarı toplanır. Bu sayede daily hakediş henüz işlenmemiş olsa bile
    "Pazartesi'de oluşacak olası fatura" doğru gösterilir.

    Ayrıca `processed_amount` (DB'deki mevcut transaction toplamı) ve
    `unprocessed_amount` (henüz yazılmamış tutar) ayrı döndürülür.
    """
    from services.daily_hakedis_service import calculate_day_hakedis

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

    # Zaten oluşturulmuş yükümlülükler
    existing = await db.courier_invoice_obligations.find(
        {
            "company_id": company_id,
            "week_start": week_start_date,
            "is_remainder": {"$ne": True},
        },
        {"_id": 0, "courier_id": 1},
    ).to_list(2000)
    existing_courier_ids = {e["courier_id"] for e in existing}

    settings = await db.weekly_obligation_settings.find_one(
        {"company_id": company_id}, {"_id": 0, "enabled": 1}
    )
    auto_enabled = bool((settings or {}).get("enabled", False))

    # Mevcut işlenmiş transaction toplamı (kurye bazında)
    processed_pipeline = [
        {"$match": _hakedis_window_match(
            company_id, week_start_date, week_end_date,
            this_monday.isoformat(), next_monday.isoformat(),
        )},
        {"$group": {"_id": "$entity_id", "total": {"$sum": "$amount"}, "tx_count": {"$sum": 1}}},
    ]
    processed_rows = await db.transactions.aggregate(processed_pipeline).to_list(2000)
    processed_map = {r["_id"]: {"total": float(r["total"]), "tx_count": int(r.get("tx_count") or 0)}
                     for r in processed_rows}

    # Haftanın 7 günü için potansiyel hakediş hesapla (saatlik dahil)
    courier_totals = {}  # courier_id -> {expected, name, days}
    cur_dt = this_monday
    while cur_dt < next_monday:
        biz_date = cur_dt.strftime("%Y-%m-%d")
        day_data = await calculate_day_hakedis(company_id, biz_date)
        for c in day_data.get("couriers", []):
            amt = float(c.get("amount") or 0)
            if amt <= 0:
                continue
            cid = c["courier_id"]
            slot = courier_totals.setdefault(cid, {
                "courier_id": cid,
                "courier_name": c.get("courier_name") or cid,
                "expected_amount": 0.0,
                "days_with_earnings": 0,
            })
            slot["expected_amount"] += amt
            slot["days_with_earnings"] += 1
        cur_dt = cur_dt + timedelta(days=1)

    previews = []
    total_amount = 0.0
    total_processed = 0.0
    total_unprocessed = 0.0
    for cid, slot in courier_totals.items():
        expected = round(slot["expected_amount"], 2)
        processed_info = processed_map.get(cid, {"total": 0.0, "tx_count": 0})
        processed_amt = round(min(processed_info["total"], expected), 2)
        unprocessed_amt = round(max(expected - processed_amt, 0), 2)
        already = cid in existing_courier_ids
        previews.append({
            "courier_id": cid,
            "courier_name": slot["courier_name"],
            "expected_amount": expected,
            "processed_amount": processed_amt,
            "unprocessed_amount": unprocessed_amt,
            "tx_count": processed_info["tx_count"],
            "days_with_earnings": slot["days_with_earnings"],
            "already_created": already,
        })
        if not already:
            total_amount += expected
            total_processed += processed_amt
            total_unprocessed += unprocessed_amt

    previews.sort(key=lambda x: (x["already_created"], -x["expected_amount"]))

    return {
        "week_label": week_label,
        "week_start": this_monday.isoformat(),
        "week_end": next_monday.isoformat(),
        "auto_enabled": auto_enabled,
        "scheduled_for": next_monday.isoformat(),
        "previews": previews,
        "total_amount": round(total_amount, 2),
        "total_processed": round(total_processed, 2),
        "total_unprocessed": round(total_unprocessed, 2),
        "courier_count": len([p for p in previews if not p["already_created"]]),
    }


# ============ WEEK STRIP + BY-WEEK DETAIL ============

def _week_range_for(monday_dt: datetime):
    week_start_iso = monday_dt.isoformat()
    week_end_iso = (monday_dt + timedelta(days=7)).isoformat()
    week_start_date = monday_dt.strftime("%Y-%m-%d")
    week_end_date = (monday_dt + timedelta(days=6)).strftime("%Y-%m-%d")
    return week_start_iso, week_end_iso, week_start_date, week_end_date


async def _expected_couriers_for_week(company_id: str, monday_dt: datetime) -> dict:
    """7 günü tarayıp kurye bazında potansiyel hakediş toplamı döner.
    Return: {courier_id: {"name": str, "amount": float, "days": int}}"""
    from services.daily_hakedis_service import calculate_day_hakedis
    result = {}
    cur = monday_dt
    end = monday_dt + timedelta(days=7)
    while cur < end:
        biz_date = cur.strftime("%Y-%m-%d")
        data = await calculate_day_hakedis(company_id, biz_date)
        for c in data.get("couriers", []):
            amt = float(c.get("amount") or 0)
            if amt <= 0:
                continue
            cid = c["courier_id"]
            slot = result.setdefault(cid, {"name": c.get("courier_name") or "", "amount": 0.0, "days": 0})
            slot["amount"] += amt
            slot["days"] += 1
        cur = cur + timedelta(days=1)
    return result


@router.get("/weeks-summary/{company_id}")
async def weeks_summary(company_id: str, weeks: int = 7, payload: dict = Depends(require_auth)):
    """
    Son N hafta için aggregate özet: yüklenen/oluşturulan/toplam kurye sayıları.
    Hafta seçicide gösterilir. 60 saniye in-memory cache.
    """
    if not _is_admin(payload):
        raise HTTPException(status_code=403, detail="Yetki yok")

    weeks = max(1, min(int(weeks or 7), 26))
    cache_key = f"weeks_summary:{company_id}:{weeks}"
    cached = _cache_get(cache_key)
    if cached:
        return cached

    company = await db.companies.find_one(
        {"id": company_id}, {"_id": 0, "opening_time": 1}
    )
    opening = (company or {}).get("opening_time") or "06:00"
    try:
        oh, om = [int(x) for x in opening.split(":")]
    except Exception:
        oh, om = 6, 0

    now = datetime.now(TR_TZ)
    days_since_monday = now.weekday()
    this_monday = (now - timedelta(days=days_since_monday)).replace(
        hour=oh, minute=om, second=0, microsecond=0
    )

    result_weeks = []
    for i in range(weeks):
        monday_dt = this_monday - timedelta(weeks=i)
        ws_iso, we_iso, ws_date, we_date = _week_range_for(monday_dt)
        label = f"{monday_dt.strftime('%d.%m')} - {(monday_dt + timedelta(days=6)).strftime('%d.%m')}"

        # Tahmini hakediş (calculate_day_hakedis 7 gün toplamı)
        expected = await _expected_couriers_for_week(company_id, monday_dt)

        # Mevcut obligation kayıtları
        obligs = await db.courier_invoice_obligations.find(
            {"company_id": company_id, "week_start": ws_date},
            {"_id": 0, "courier_id": 1, "status": 1, "is_manual": 1, "is_remainder": 1},
        ).to_list(2000)
        non_remainder_obligs = [o for o in obligs if not o.get("is_remainder")]
        created = len(non_remainder_obligs)
        uploaded = sum(1 for o in non_remainder_obligs if o.get("status") in ("uploaded", "approved"))
        approved = sum(1 for o in non_remainder_obligs if o.get("status") == "approved")

        # by-week ile aynı satır sayısını üretelim:
        # predicted (hakediş var, auto-oblig yok) + tüm non-remainder obligation
        courier_has_auto_oblig = {o["courier_id"] for o in non_remainder_obligs if not o.get("is_manual")}
        predicted_no_auto = sum(1 for cid in expected.keys() if cid not in courier_has_auto_oblig)
        total_for_strip = predicted_no_auto + len(non_remainder_obligs)

        result_weeks.append({
            "week_start": ws_date,
            "week_end": we_date,
            "week_start_iso": ws_iso,
            "week_end_iso": we_iso,
            "label": label,
            "is_current": i == 0,
            "total_couriers": total_for_strip,
            "created": created,
            "uploaded": uploaded,
            "approved": approved,
        })

    result = {"weeks": result_weeks}
    _cache_set(cache_key, result)
    return result


@router.get("/by-week/{company_id}")
async def by_week(company_id: str, week_start: str, payload: dict = Depends(require_auth)):
    """
    Bir haftanın tüm kuryelerini (obligation olsa da olmasa da) detaylı listeler.
    Hafta detay panelinde gösterilir.
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
    try:
        monday_dt = datetime.strptime(week_start, "%Y-%m-%d").replace(
            hour=oh, minute=om, tzinfo=TR_TZ
        )
    except ValueError:
        raise HTTPException(status_code=400, detail="Geçersiz hafta")

    ws_iso, we_iso, ws_date, we_date = _week_range_for(monday_dt)
    week_label = f"{monday_dt.strftime('%d.%m')} - {(monday_dt + timedelta(days=6)).strftime('%d.%m.%Y')}"

    # Tahmini hakediş (7 gün)
    expected = await _expected_couriers_for_week(company_id, monday_dt)

    # Mevcut obligation kayıtları (remainder dahil — admin görsün)
    obligs = await db.courier_invoice_obligations.find(
        {"company_id": company_id, "week_start": ws_date},
        {"_id": 0},
    ).sort("created_at", 1).to_list(2000)
    obligs_by_courier = {}
    for o in obligs:
        obligs_by_courier.setdefault(o["courier_id"], []).append(o)

    # İşlenmiş hakediş toplamları
    processed_pipeline = [
        {"$match": _hakedis_window_match(company_id, ws_date, we_date, ws_iso, we_iso)},
        {"$group": {"_id": "$entity_id", "total": {"$sum": "$amount"}}},
    ]
    processed_rows = await db.transactions.aggregate(processed_pipeline).to_list(2000)
    processed_map = {r["_id"]: float(r["total"]) for r in processed_rows}

    # Tüm kurye id'leri (expected + obligation)
    all_courier_ids = set(expected.keys()) | set(obligs_by_courier.keys())
    couriers_db = await db.couriers.find(
        {"id": {"$in": list(all_courier_ids)}},
        {"_id": 0, "id": 1, "name": 1, "phone": 1},
    ).to_list(2000) if all_courier_ids else []
    courier_info = {c["id"]: c for c in couriers_db}

    # Hangi kuryelerin auto-generated (non-manual, non-remainder) obligation'ı var?
    # Bu kuryeler için "predicted" satırı eklemiyoruz çünkü obligation zaten temsil ediyor.
    courier_has_auto_oblig = set()
    for cid, oblig_list in obligs_by_courier.items():
        for o in oblig_list:
            if not o.get("is_remainder") and not o.get("is_manual"):
                courier_has_auto_oblig.add(cid)
                break

    rows = []

    # 1) Predicted satırlar: hakediş var ama auto-obligation yok
    for cid in expected.keys():
        if cid in courier_has_auto_oblig:
            continue
        exp = expected[cid]
        info = courier_info.get(cid, {})
        rows.append({
            "row_key": f"predicted:{cid}",
            "courier_id": cid,
            "courier_name": info.get("name") or exp.get("name") or cid,
            "phone": info.get("phone") or "",
            "expected_amount": round(exp["amount"], 2),
            "processed_amount": round(processed_map.get(cid, 0.0), 2),
            "days_with_earnings": exp["days"],
            "obligation": None,
            "is_predicted": True,
        })

    # 2) Obligation satırları (auto + manual + remainder hepsi ayrı satır)
    for cid, oblig_list in obligs_by_courier.items():
        info = courier_info.get(cid, {})
        name = info.get("name") or expected.get(cid, {}).get("name") or cid
        for o in oblig_list:
            s = await _serialize(o)
            is_manual = bool(s.get("is_manual"))
            is_remainder = bool(s.get("is_remainder"))
            rows.append({
                "row_key": f"obligation:{s['id']}",
                "courier_id": cid,
                "courier_name": name,
                "phone": info.get("phone") or "",
                "expected_amount": float(s.get("expected_amount") or 0),
                "processed_amount": 0.0 if (is_manual or is_remainder) else round(processed_map.get(cid, 0.0), 2),
                "days_with_earnings": 0 if (is_manual or is_remainder) else expected.get(cid, {}).get("days", 0),
                "obligation": s,
                "is_predicted": False,
            })

    rows.sort(key=lambda r: (r["courier_name"].lower(), -r["expected_amount"]))

    total_expected = round(sum(r["expected_amount"] for r in rows), 2)
    total_processed = round(sum(r["processed_amount"] for r in rows), 2)
    created = sum(1 for r in rows if r["obligation"] and not r["obligation"].get("is_remainder"))
    uploaded = sum(1 for r in rows if r["obligation"] and r["obligation"].get("status") in ("uploaded", "approved"))
    approved = sum(1 for r in rows if r["obligation"] and r["obligation"].get("status") == "approved")

    return {
        "week_start": ws_date,
        "week_end": we_date,
        "week_label": week_label,
        "total_couriers": len(rows),
        "created": created,
        "uploaded": uploaded,
        "approved": approved,
        "total_expected": total_expected,
        "total_processed": total_processed,
        "rows": rows,
    }


# ============ AY FATURALARI (Birleşik) ============

@router.get("/monthly-invoices/{company_id}")
async def monthly_invoices(company_id: str, year: int, month: int, payload: dict = Depends(require_auth)):
    """
    Bir ayın faturalarını birleşik listeler:
      1) Yeni sistem: status=approved courier_invoice_obligations (decided_at o ayda)
      2) Eski sistem: invoices koleksiyonu (verified=true, uploaded_at o ayda)
    """
    if not _is_admin(payload):
        raise HTTPException(status_code=403, detail="Yetki yok")

    if not (2020 <= year <= 2099) or not (1 <= month <= 12):
        raise HTTPException(status_code=400, detail="Geçersiz tarih")

    start_dt = datetime(year, month, 1, tzinfo=TR_TZ)
    if month == 12:
        end_dt = datetime(year + 1, 1, 1, tzinfo=TR_TZ)
    else:
        end_dt = datetime(year, month + 1, 1, tzinfo=TR_TZ)
    start_iso = start_dt.isoformat()
    end_iso = end_dt.isoformat()

    items = []

    # 1) Yeni sistem: approved obligation'lar
    approved = await db.courier_invoice_obligations.find(
        {
            "company_id": company_id,
            "status": "approved",
            "decided_at": {"$gte": start_iso, "$lt": end_iso},
        },
        {"_id": 0},
    ).sort("decided_at", -1).to_list(2000)
    for a in approved:
        s = await _serialize(a)
        items.append({
            "source": "obligation",
            "id": s["id"],
            "courier_id": s.get("courier_id"),
            "courier_name": s.get("courier_name") or "",
            "amount": s.get("declared_amount") or s.get("expected_amount") or 0,
            "invoice_number": s.get("invoice_number") or "",
            "invoice_date": s.get("invoice_date") or "",
            "file_url": s.get("invoice_file_url"),
            "decided_at": s.get("decided_at"),
            "week_start": s.get("week_start"),
            "week_end": s.get("week_end"),
        })

    # 2) Eski sistem: invoices koleksiyonu
    try:
        invoices = await db.invoices.find(
            {
                "company_id": company_id,
                "verified": True,
                "uploaded_at": {"$gte": start_iso, "$lt": end_iso},
            },
            {"_id": 0, "file_data": 0},  # büyük dosya alanı hariç
        ).sort("uploaded_at", -1).to_list(2000)
    except Exception:
        invoices = []
    for inv in invoices:
        inv = {k: v for k, v in inv.items() if k != "_id"}
        items.append({
            "source": "invoice",
            "id": inv.get("id"),
            "courier_id": inv.get("courier_id"),
            "courier_name": inv.get("courier_name") or "",
            "amount": inv.get("amount") or 0,
            "invoice_number": inv.get("invoice_number") or "",
            "invoice_date": inv.get("invoice_date") or "",
            "file_url": None,  # eski API endpoint'leri kullan
            "decided_at": inv.get("uploaded_at") or inv.get("verified_at"),
            "transaction_id": inv.get("transaction_id"),
            "filename": inv.get("filename"),
        })

    items.sort(key=lambda x: x.get("decided_at") or "", reverse=True)
    return {"items": items, "total_amount": round(sum(float(i.get("amount") or 0) for i in items), 2)}
