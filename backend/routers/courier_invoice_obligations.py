"""
Kurye Fatura Yükümlülükleri (Haftalık)

Her hafta sonu (Pazartesi açılışta önceki Pzt-Paz blok'u için) otomatik
oluşturulur. Toggle: weekly_obligation_settings (her şirket için aç/kapa).

- Kurye paneli: kendi pending+uploaded yükümlülüklerini görür ve fatura yükler
- Admin paneli: tümünü görür, onaylar (declared_amount, partial chain)
"""
from fastapi import APIRouter, Depends, HTTPException, UploadFile, File, Form
from fastapi.responses import StreamingResponse, Response
from pydantic import BaseModel, Field
from typing import Optional
from datetime import datetime, timezone, timedelta
import uuid
import io
import logging
import re

from utils.database import db
from utils.jwt_utils import require_auth
from services.r2_storage import upload_file_to_r2, generate_presigned_url, download_file_from_r2
from services.notifications import send_push_notification

router = APIRouter(prefix="/api/courier-invoice-obligations", tags=["CourierInvoiceObligations"])
logger = logging.getLogger(__name__)
TR_TZ = timezone(timedelta(hours=3))


async def _log_obligation_activity(company_id: str, payload: dict, action: str,
                                    entity_name: str = "", details: str = ""):
    """Hareketler sekmesi için activity log oluşturur. Hata olursa sessizce yutar.

    Admin adı: payload'da name/username yoksa, sub (user id) ile admin_users
    veya couriers koleksiyonundan çözümlenir; yine bulunamazsa "Sistem" yazılır.
    """
    try:
        admin_id = payload.get("sub") or payload.get("user_id") or ""
        admin_name = payload.get("name") or payload.get("username") or ""
        if not admin_name and admin_id:
            role = payload.get("role")
            # Önce admin_users sonra couriers (kurye yükleyici olabilir)
            if role == "courier" or payload.get("is_courier"):
                doc = await db.couriers.find_one({"id": admin_id}, {"_id": 0, "name": 1})
            else:
                doc = await db.admins.find_one({"id": admin_id}, {"_id": 0, "name": 1, "username": 1})
                if not doc:
                    doc = await db.couriers.find_one({"id": admin_id}, {"_id": 0, "name": 1})
            if doc:
                admin_name = doc.get("name") or doc.get("username") or ""
        if not admin_name:
            admin_name = "Sistem"

        from routers.accounting import create_activity_log
        await create_activity_log({
            "company_id": company_id,
            "admin_id": admin_id,
            "admin_name": admin_name,
            "action": action,
            "entity_type": "courier_invoice_obligation",
            "entity_name": entity_name,
            "details": details,
        })
    except Exception as e:
        logger.warning(f"Activity log oluşturulamadı ({action}): {e}")

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


def _is_super(p: dict) -> bool:
    return p.get("role") in ("superadmin", "systemadmin") or bool(p.get("is_super")) or bool(p.get("is_system"))


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


@router.get("/pending-list/{company_id}")
async def pending_obligations_list(company_id: str, payload: dict = Depends(require_auth)):
    """Tüm zaman 'Bekliyor' durumdaki yükümlülükleri kurye + tutar + hafta ile döner."""
    if not _is_admin(payload):
        raise HTTPException(status_code=403, detail="Yetki yok")
    rows = await db.courier_invoice_obligations.find(
        {"company_id": company_id, "status": "pending"},
        {"_id": 0},
    ).sort("week_start", -1).to_list(2000)
    items = [await _serialize(r) for r in rows]
    return {"items": items, "total": len(items)}


@router.get("/pending-courier-ids/{company_id}")
async def pending_courier_ids(company_id: str, payload: dict = Depends(require_auth)):
    """Admin: bu şirkette pending VEYA uploaded yükümlülüğü olan kuryelerin id listesi."""
    if not _is_admin(payload):
        raise HTTPException(status_code=403, detail="Yetki yok")
    ids = await db.courier_invoice_obligations.distinct(
        "courier_id",
        {"company_id": company_id, "status": {"$in": ["pending", "uploaded"]}},
    )
    return {"courier_ids": [i for i in ids if i]}


@router.get("/{obligation_id}/file")
async def get_obligation_file(obligation_id: str, payload: dict = Depends(require_auth)):
    """
    Fatura dosyasını backend üzerinden proxy'leyerek döner (CORS-safe).
    Yetki: kurye sadece kendi yükümlülüğüne, admin ise tüm yükümlülüklere
    erişebilir (multi-company admin desteği için).
    """
    rec = await db.courier_invoice_obligations.find_one(
        {"id": obligation_id}, {"_id": 0}
    )
    if not rec:
        raise HTTPException(status_code=404, detail="Kayıt bulunamadı")
    if _is_courier(payload):
        courier_id = payload.get("sub") or payload.get("user_id")
        if rec.get("courier_id") != courier_id:
            raise HTTPException(status_code=403, detail="Yetki yok")
    elif not _is_admin(payload):
        raise HTTPException(status_code=403, detail="Yetki yok")

    key = rec.get("invoice_file_key")
    if not key:
        raise HTTPException(status_code=404, detail="Dosya yok")
    data = await download_file_from_r2(key)
    if not data:
        raise HTTPException(status_code=404, detail="Dosya bulunamadı")
    ext = (key.rsplit(".", 1)[-1] or "").lower()
    media_type = "application/pdf" if ext == "pdf" else f"image/{ext or 'jpeg'}"
    safe_name = f"fatura.{ext or 'pdf'}"
    return Response(content=data, media_type=media_type, headers={
        "Cache-Control": "private, max-age=300",
        "Content-Disposition": f'inline; filename="{safe_name}"',
    })


@router.post("/{req_id}/upload")
async def upload_invoice(
    req_id: str,
    file: UploadFile = File(...),
    invoice_number: Optional[str] = Form(None),
    invoice_date: Optional[str] = Form(None),
    payload: dict = Depends(require_auth),
):
    """Kurye veya admin (kuryenin yerine) fatura yükler."""
    is_courier = _is_courier(payload)
    is_admin = _is_admin(payload)
    if not (is_courier or is_admin):
        raise HTTPException(status_code=403, detail="Yetki yok")

    rec = await db.courier_invoice_obligations.find_one({"id": req_id}, {"_id": 0})
    if not rec:
        raise HTTPException(status_code=404, detail="Kayıt bulunamadı")
    if is_courier:
        courier_id_p = payload.get("sub") or payload.get("user_id")
        if rec.get("courier_id") != courier_id_p:
            raise HTTPException(status_code=403, detail="Yetki yok")
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
    company_id = rec.get("company_id")
    courier_id = rec.get("courier_id")
    key = f"courier-invoice-obligations/{company_id}/{courier_id}/{req_id}/{uuid.uuid4()}.{ext}"
    upload = await upload_file_to_r2(content, key, content_type=file.content_type or f"application/{ext}")
    if not upload.get("success"):
        raise HTTPException(status_code=500, detail=f"R2 hatası: {upload.get('error')}")
    update_doc = {
        "status": "uploaded",
        "invoice_file_key": key,
        "invoice_filename": file.filename,
        "uploaded_at": datetime.now(TR_TZ).isoformat(),
        "uploaded_by": "admin" if is_admin and not is_courier else "courier",
    }
    if invoice_number and invoice_number.strip():
        update_doc["invoice_number"] = invoice_number.strip()
    if invoice_date and invoice_date.strip():
        update_doc["invoice_date"] = invoice_date.strip()
    await db.courier_invoice_obligations.update_one({"id": req_id}, {"$set": update_doc})
    updated = await db.courier_invoice_obligations.find_one({"id": req_id}, {"_id": 0})

    # Activity log
    await _log_obligation_activity(
        company_id=rec.get("company_id"),
        payload=payload,
        action="obligation_uploaded",
        entity_name=rec.get("courier_name") or "",
        details=f"{rec.get('week_start')} - {rec.get('week_end')} haftası, {rec.get('expected_amount', 0):.2f} TL"
                + (" (admin tarafından)" if is_admin and not is_courier else ""),
    )

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

    # Activity log
    await _log_obligation_activity(
        company_id=rec.get("company_id"),
        payload=payload,
        action="obligation_approved",
        entity_name=rec.get("courier_name") or "",
        details=f"{rec.get('week_start')} - {rec.get('week_end')} haftası, onaylanan {declared:.2f} TL"
                + (f", kalan {expected - declared:.2f} TL yeni yükümlülük" if remainder_id else ""),
    )

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


@router.post("/bulk-create/{company_id}")
async def bulk_create_obligations(company_id: str, body: dict, payload: dict = Depends(require_auth)):
    """
    Admin, hafta detay panelinden seçtiği kuryeler için manuel olarak
    yükümlülük oluşturur (otomatik scheduler'ı beklemeden).
    Body: {"week_start": "YYYY-MM-DD", "couriers": [{"courier_id": str, "expected_amount": float}]}
    Aynı hafta ve kurye için non-remainder pending kayıt varsa atlanır.
    """
    if not _is_admin(payload):
        raise HTTPException(status_code=403, detail="Yetki yok")

    week_start = body.get("week_start")
    couriers = body.get("couriers") or []
    if not week_start or not couriers:
        raise HTTPException(status_code=400, detail="week_start ve couriers zorunlu")
    try:
        ws_dt = datetime.strptime(week_start, "%Y-%m-%d")
    except ValueError:
        raise HTTPException(status_code=400, detail="Geçersiz hafta")
    week_end_date = (ws_dt + timedelta(days=6)).strftime("%Y-%m-%d")

    courier_ids = [c.get("courier_id") for c in couriers if c.get("courier_id")]
    if not courier_ids:
        return {"created": 0, "skipped": 0, "items": []}
    courier_map = {
        c["id"]: c
        for c in await db.couriers.find(
            {"id": {"$in": courier_ids}},
            {"_id": 0, "id": 1, "name": 1, "fcm_token": 1},
        ).to_list(2000)
    }

    # Aynı hafta için mevcut non-remainder kayıtları
    existing = await db.courier_invoice_obligations.find(
        {
            "company_id": company_id,
            "week_start": week_start,
            "courier_id": {"$in": courier_ids},
            "is_remainder": {"$ne": True},
        },
        {"_id": 0, "courier_id": 1},
    ).to_list(2000)
    existing_ids = {e["courier_id"] for e in existing}

    now_iso = datetime.now(TR_TZ).isoformat()
    created_items = []
    skipped = 0
    for c in couriers:
        cid = c.get("courier_id")
        amt = round(float(c.get("expected_amount") or 0), 2)
        if not cid or amt <= 0:
            skipped += 1
            continue
        if cid in existing_ids:
            skipped += 1
            continue
        info = courier_map.get(cid) or {}
        rec_id = str(uuid.uuid4())
        record = {
            "id": rec_id,
            "company_id": company_id,
            "courier_id": cid,
            "courier_name": info.get("name") or cid,
            "week_start": week_start,
            "week_end": week_end_date,
            "expected_amount": amt,
            "status": "pending",
            "is_remainder": False,
            "created_at": now_iso,
        }
        await db.courier_invoice_obligations.insert_one(record)
        created_items.append(await _serialize(record))
        # Push
        try:
            token = info.get("fcm_token")
            if token:
                await send_push_notification(
                    token, "Eksik Faturanız Var",
                    f"{week_start} - {week_end_date} haftası için {amt:.2f} TL fatura kesmeniz gerekiyor.",
                    {"type": "OBLIGATION_CREATED", "request_id": rec_id},
                )
        except Exception as e:
            logger.warning(f"Bulk obligation push hatası ({cid}): {e}")

    # Activity log: toplu oluşturma
    if created_items:
        names = ", ".join([c.get("courier_name") or "" for c in created_items[:5]])
        if len(created_items) > 5:
            names += f" +{len(created_items) - 5} kurye"
        total_amt = sum(float(c.get("expected_amount") or 0) for c in created_items)
        await _log_obligation_activity(
            company_id=company_id, payload=payload,
            action="obligation_bulk_created",
            entity_name=names,
            details=f"{week_start} haftası, {len(created_items)} yükümlülük, toplam {total_amt:.2f} TL",
        )

    return {"created": len(created_items), "skipped": skipped, "items": created_items}


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

    # Activity log: manuel oluşturma
    await _log_obligation_activity(
        company_id=company_id, payload=payload,
        action="obligation_manual_created",
        entity_name=courier.get("name") or "",
        details=f"{week_start_date} haftası, {data.amount:.2f} TL"
                + (f" - {data.description}" if data.description else ""),
    )

    return {"item": await _serialize(record)}


@router.post("/{obligation_id}/courier-cancel-upload")
async def courier_cancel_upload(obligation_id: str, payload: dict = Depends(require_auth)):
    """
    Kurye yüklediği faturayı 60 dakika içinde geri çekebilir (uploaded statüsünde).
    Onaylandıysa veya 60 dakika geçtiyse 403 döner. R2 dosyası silinir ve
    yükümlülük tekrar 'pending' duruma getirilir.
    """
    if not _is_courier(payload):
        raise HTTPException(status_code=403, detail="Sadece kurye iptal edebilir")

    courier_id = payload.get("sub") or payload.get("user_id")
    rec = await db.courier_invoice_obligations.find_one({"id": obligation_id}, {"_id": 0})
    if not rec:
        raise HTTPException(status_code=404, detail="Kayıt bulunamadı")
    if rec.get("courier_id") != courier_id:
        raise HTTPException(status_code=403, detail="Yetki yok")
    if rec.get("status") != "uploaded":
        raise HTTPException(status_code=400, detail="Sadece yüklenmiş (onay bekleyen) fatura iptal edilebilir")

    # Yükleme zamanını kontrol et (60 dk)
    uploaded_at = rec.get("uploaded_at")
    if not uploaded_at:
        raise HTTPException(status_code=400, detail="Yükleme zamanı bulunamadı")
    try:
        if isinstance(uploaded_at, str):
            up_dt = datetime.fromisoformat(uploaded_at)
            if up_dt.tzinfo is None:
                up_dt = up_dt.replace(tzinfo=TR_TZ)
        else:
            up_dt = uploaded_at
    except Exception:
        raise HTTPException(status_code=400, detail="Yükleme zamanı geçersiz")
    elapsed = (datetime.now(TR_TZ) - up_dt).total_seconds()
    if elapsed > 60 * 60:
        raise HTTPException(status_code=400, detail="60 dakikalık iptal süresi doldu")

    # R2 dosyasını sil
    file_key = rec.get("invoice_file_key")
    if file_key:
        try:
            from services.r2_storage import delete_file_from_r2
            await delete_file_from_r2(file_key)
        except Exception as e:
            logger.warning(f"R2 dosya silme hatası ({file_key}): {e}")

    # Yükümlülüğü pending'e geri al
    await db.courier_invoice_obligations.update_one(
        {"id": obligation_id},
        {
            "$set": {"status": "pending"},
            "$unset": {
                "invoice_file_key": "",
                "invoice_file_url": "",
                "invoice_filename": "",
                "uploaded_at": "",
                "invoice_number": "",
                "invoice_date": "",
            },
        },
    )

    # Activity log
    await _log_obligation_activity(
        company_id=rec.get("company_id"),
        payload=payload,
        action="obligation_cancelled_courier",
        entity_name=rec.get("courier_name") or "",
        details=f"{rec.get('week_start')} - {rec.get('week_end')} haftası, {rec.get('expected_amount', 0):.2f} TL",
    )

    return {"success": True, "obligation_id": obligation_id}


@router.delete("/{obligation_id}")
async def delete_obligation(obligation_id: str, payload: dict = Depends(require_auth)):
    """
    Superadmin: bir fatura yükümlülüğünü siler.
    - Approved/Uploaded ise: R2'deki dosyayı da siler. Kuryeye yeni bir "Bekliyor"
      yükümlülük oluşturulur (aynı hafta, aynı tutar; expected_amount = orijinal expected).
    - Pending/Manuel/Kalan ise: sadece kaydı siler (yeni pending oluşturmaz).
    - Remainder (Kalan) ise: parent referansı zarar görmesin diye sadece sil.
    """
    if not _is_super(payload):
        raise HTTPException(status_code=403, detail="Sadece superadmin silebilir")

    rec = await db.courier_invoice_obligations.find_one({"id": obligation_id}, {"_id": 0})
    if not rec:
        raise HTTPException(status_code=404, detail="Kayıt bulunamadı")

    # R2 dosyasını sil (varsa)
    file_key = rec.get("invoice_file_key")
    if file_key:
        try:
            from services.r2_storage import delete_file_from_r2
            await delete_file_from_r2(file_key)
        except Exception as e:
            logger.warning(f"R2 dosya silme hatası ({file_key}): {e}")

    # Mevcut kaydı sil
    await db.courier_invoice_obligations.delete_one({"id": obligation_id})

    # Eğer onaylı veya yüklenmiş bir kayıt silindiyse: aynı hafta için yeni bir
    # "Bekliyor" yükümlülük oluştur. Remainder/pending'de bunu yapma. Manuel olsa
    # bile, iş hâlâ kuryeden bekleniyor — recreate gerekir.
    recreated = False
    new_id = None
    if (
        rec.get("status") in ("approved", "uploaded")
        and not rec.get("is_remainder")
    ):
        new_id = str(uuid.uuid4())
        now_iso = datetime.now(TR_TZ).isoformat()
        # Asıl beklenen tutar: önce orijinal expected_amount, yoksa declared
        expected = float(rec.get("expected_amount") or rec.get("declared_amount") or 0)
        await db.courier_invoice_obligations.insert_one({
            "id": new_id,
            "company_id": rec.get("company_id"),
            "courier_id": rec.get("courier_id"),
            "courier_name": rec.get("courier_name"),
            "week_start": rec.get("week_start"),
            "week_end": rec.get("week_end"),
            "expected_amount": expected,
            "status": "pending",
            "created_at": now_iso,
            "recreated_from_deleted_id": obligation_id,
        })
        recreated = True

    # Activity log
    await _log_obligation_activity(
        company_id=rec.get("company_id"),
        payload=payload,
        action="obligation_deleted",
        entity_name=rec.get("courier_name") or "",
        details=f"{rec.get('week_start')} - {rec.get('week_end')} haftası, {rec.get('expected_amount', 0):.2f} TL"
                + (" — yeni Bekliyor yükümlülük oluşturuldu" if recreated else ""),
    )

    return {"success": True, "deleted_id": obligation_id, "recreated": recreated, "new_id": new_id}



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


async def _direct_delivery_fees_for_week(company_id: str, monday_dt: datetime) -> dict:
    """
    Pazartesi açılış → bir sonraki Pazartesi açılış penceresinde:
      • `delivered` siparişlerden kurye bazında `courier_fee` toplamı
        (DOĞRUDAN TESLİMAT ÜCRETLERİ)
      • + saatlik kazançlar: 7 iş günü için
        `courier_daily_active.active_minutes` × kurye `hourly_rate` / 60

    Transactions koleksiyonu HİÇ kullanılmaz — bu yüzden işlem geçmişindeki
    manuel/düzeltilmiş hakediş kayıtları hesaba sapma yapmaz.

    Return: {courier_id: {"name": str, "amount": float, "orders": int,
                          "fcm_token": str|None}}
    """
    start_iso = monday_dt.isoformat()
    end_iso = (monday_dt + timedelta(days=7)).isoformat()

    # 1) Teslimat ücretleri toplamı
    pipeline = [
        {"$match": {
            "company_id": company_id, "status": "delivered",
            "courier_id": {"$ne": None},
            "delivered_at": {"$gte": start_iso, "$lt": end_iso},
        }},
        {"$group": {
            "_id": "$courier_id",
            "amount": {"$sum": {"$ifNull": ["$courier_fee", 0]}},
            "orders": {"$sum": 1},
        }},
    ]
    rows = await db.orders.aggregate(pipeline).to_list(2000)
    out = {}
    for r in rows:
        cid = r.get("_id")
        if not cid:
            continue
        amt = float(r.get("amount") or 0)
        out[cid] = {"amount": amt, "orders": int(r.get("orders") or 0)}

    # 2) Saatlik kazançlar: ilgili haftanın 7 iş günü için
    business_dates = [
        (monday_dt + timedelta(days=i)).strftime("%Y-%m-%d") for i in range(7)
    ]
    active_pipeline = [
        {"$match": {"date": {"$in": business_dates}, "courier_id": {"$ne": None}}},
        {"$group": {"_id": "$courier_id", "minutes": {"$sum": "$active_minutes"}}},
    ]
    active_rows = await db.courier_daily_active.aggregate(active_pipeline).to_list(5000)
    minutes_map = {r["_id"]: int(r.get("minutes") or 0) for r in active_rows if r.get("_id")}

    # Kurye isim + hourly_rate + fcm_token toplu çek
    all_ids = list(set(list(out.keys()) + list(minutes_map.keys())))
    if not all_ids:
        return {}
    couriers = await db.couriers.find(
        {"id": {"$in": all_ids}},
        {"_id": 0, "id": 1, "name": 1, "fcm_token": 1, "hourly_rate": 1},
    ).to_list(2000)
    name_map = {c["id"]: c for c in couriers}

    # 3) Birleştir
    final = {}
    for cid in all_ids:
        delivery_amt = float(out.get(cid, {}).get("amount") or 0)
        minutes = minutes_map.get(cid, 0)
        rate = float((name_map.get(cid) or {}).get("hourly_rate") or 0)
        hourly_earnings = round((minutes / 60.0) * rate, 2) if rate > 0 else 0.0
        total = round(delivery_amt + hourly_earnings, 2)
        if total <= 0:
            continue
        final[cid] = {
            "amount": total,
            "orders": int(out.get(cid, {}).get("orders") or 0),
            "name": (name_map.get(cid) or {}).get("name") or cid,
            "fcm_token": (name_map.get(cid) or {}).get("fcm_token"),
        }
    return final


async def generate_weekly_obligations_for_company(company_id: str) -> dict:
    """Tek şirket için geçen haftanın doğrudan teslimat ücretleri toplamına göre
    obligation üretir.

    Strateji: Pazartesi açılış → bir sonraki Pazartesi açılış penceresinde
    `delivered` siparişlerin `courier_fee` toplamı = beklenen tutar. İşlem
    geçmişindeki hakediş kayıtları (manuel düzeltmeler) bu hesaba dahil
    edilmez; böylece sapma oluşmaz.

    Returns: {"enabled": bool, "created": int, "items": [...], "skipped": [...],
              "week_start": str, "week_end": str}
    """
    settings = await db.weekly_obligation_settings.find_one({"company_id": company_id})
    if not settings or not settings.get("enabled"):
        return {"enabled": False, "created": 0, "items": [], "skipped": [], "week_start": "", "week_end": ""}
    company = await db.companies.find_one({"id": company_id}, {"_id": 0, "opening_time": 1})
    opening = (company or {}).get("opening_time") or "06:00"
    last_monday, this_monday = _last_week_pzt_paz(opening)
    week_start_date = last_monday.strftime("%Y-%m-%d")
    week_end_date = (this_monday - timedelta(days=1)).strftime("%Y-%m-%d")

    # Doğrudan teslimat ücretleri + saatlik kazançlar
    courier_fees = await _direct_delivery_fees_for_week(company_id, last_monday)
    if not courier_fees:
        await db.weekly_obligation_settings.update_one(
            {"company_id": company_id},
            {"$set": {"last_auto_run": datetime.now(TR_TZ).isoformat()}},
        )
        return {"enabled": True, "created": 0, "items": [], "skipped": [],
                "week_start": week_start_date, "week_end": week_end_date}

    # Bu hafta için mevcut (non-remainder, NON-manuel) obligation tutarları toplamı.
    # Manuel faturalar predicted/delta hesabını etkilemez — bağımsız faturalardır.
    existing_pipeline = [
        {"$match": {
            "company_id": company_id,
            "week_start": week_start_date,
            "is_remainder": {"$ne": True},
            "is_manual": {"$ne": True},
        }},
        {"$group": {"_id": "$courier_id", "total": {"$sum": "$expected_amount"}}},
    ]
    existing_rows = await db.courier_invoice_obligations.aggregate(existing_pipeline).to_list(2000)
    existing_map = {r["_id"]: float(r.get("total") or 0) for r in existing_rows if r.get("_id")}

    created = 0
    created_items: list = []
    skipped_items: list = []
    now_iso = datetime.now(TR_TZ).isoformat()
    for cid, info in courier_fees.items():
        total = round(float(info.get("amount") or 0), 2)
        name = info.get("name") or ""
        if total <= 0:
            continue
        already = existing_map.get(cid, 0.0)
        delta = round(total - already, 2)
        # 0.01 TL eşiği — küçük yuvarlama farklarını yoksay
        if delta <= 0.01:
            if already > 0:
                skipped_items.append({"name": name, "reason": f"Zaten oluşturulmuş ({already:.2f} TL)"})
            continue
        rec_id = str(uuid.uuid4())
        await db.courier_invoice_obligations.insert_one({
            "id": rec_id,
            "company_id": company_id,
            "courier_id": cid,
            "courier_name": name,
            "week_start": week_start_date,
            "week_end": week_end_date,
            "expected_amount": delta,
            "status": "pending",
            "is_remainder": False,
            "created_at": now_iso,
        })
        created += 1
        note = ""
        if already > 0:
            note = f"Fark (toplam {total:.2f} - mevcut {already:.2f})"
        created_items.append({"name": name, "amount": delta, "note": note})
        try:
            token = info.get("fcm_token")
            if token:
                await send_push_notification(
                    token, "Eksik Faturanız Var",
                    f"{week_start_date} - {week_end_date} haftası için {delta:.2f} TL fatura kesmeniz gerekiyor.",
                    {"type": "OBLIGATION_CREATED", "request_id": rec_id},
                )
        except Exception as e:
            logger.warning(f"Push hatası ({cid}): {e}")

    await db.weekly_obligation_settings.update_one(
        {"company_id": company_id},
        {"$set": {"last_auto_run": now_iso}},
    )
    return {"enabled": True, "created": created, "items": created_items, "skipped": skipped_items,
            "week_start": week_start_date, "week_end": week_end_date}


async def generate_weekly_obligations_all_companies():
    """Scheduler bu fonksiyonu Pazartesi açılış ±5dk penceresinde çağırır."""
    from services.email_service import send_auto_process_report

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
            result = await generate_weekly_obligations_for_company(c["id"])
            if not result.get("enabled"):
                continue
            total += int(result.get("created") or 0)
            # Süperadminlere rapor e-postası
            try:
                period = ""
                if result.get("week_start") and result.get("week_end"):
                    ws = result["week_start"]
                    we = result["week_end"]
                    period = f"{ws[8:10]}.{ws[5:7]}.{ws[0:4]} – {we[8:10]}.{we[5:7]}.{we[0:4]}"
                await send_auto_process_report(
                    company_id=c["id"],
                    tab_name="Kurye Faturaları (Haftalık Yükümlülük)",
                    period_label=period or "Geçen hafta",
                    success_items=result.get("items") or [],
                    failed_items=result.get("skipped") or [],
                )
            except Exception as e:
                logger.warning(f"obligation report email error ({c.get('id')}): {e}")
        except Exception as e:
            logger.error(f"obligation üretim hatası ({c.get('id')}): {e}")
            try:
                await send_auto_process_report(
                    company_id=c["id"],
                    tab_name="Kurye Faturaları (Haftalık Yükümlülük)",
                    period_label="Geçen hafta",
                    success_items=[],
                    failed_items=[{"name": "Scheduler hatası", "reason": str(e)}],
                )
            except Exception:
                pass
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

    # Mevcut işlenmiş transaction toplamı (sadece bilgilendirme amaçlı — beklenen
    # tutar artık doğrudan teslimat ücretlerinden çekiliyor)
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

    # Doğrudan teslimat ücretleri (saatlik / işlem geçmişi HARİÇ) — obligation
    # tutarı her zaman buradan hesaplanır.
    courier_fees = await _direct_delivery_fees_for_week(company_id, this_monday)
    courier_totals = {}
    for cid, info in courier_fees.items():
        courier_totals[cid] = {
            "courier_id": cid,
            "courier_name": info.get("name") or cid,
            "expected_amount": float(info.get("amount") or 0),
            "days_with_earnings": 1 if (info.get("amount") or 0) > 0 else 0,
        }

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
    """Hafta için kurye bazında BEKLENEN tutar = doğrudan teslimat ücretleri
    toplamı (`delivered orders.courier_fee`). Saatlik kazançlar ve transactions
    DAHİL EDİLMEZ. UI tutarlılığı için otomatik obligation oluşturma ile aynı
    kaynağı kullanır.
    Return: {courier_id: {"name": str, "amount": float, "days": int}}"""
    fees = await _direct_delivery_fees_for_week(company_id, monday_dt)
    return {
        cid: {
            "name": info.get("name") or cid,
            "amount": float(info.get("amount") or 0),
            # "days" bilgisi artık önemli değil ama by-week için 1 koyalım (varlık göstergesi)
            "days": 1 if (info.get("amount") or 0) > 0 else 0,
        }
        for cid, info in fees.items()
    }


@router.get("/weeks-summary/{company_id}")
async def weeks_summary(
    company_id: str,
    weeks: int = 7,
    offset: int = 0,
    payload: dict = Depends(require_auth),
):
    """
    Son N hafta için aggregate özet: yüklenen/oluşturulan/toplam kurye sayıları.
    Hafta seçicide gösterilir. 60 saniye in-memory cache.
    offset: kaç hafta geriye kaydır (0 = bu hafta dahil son N hafta).
    """
    if not _is_admin(payload):
        raise HTTPException(status_code=403, detail="Yetki yok")

    weeks = max(1, min(int(weeks or 7), 26))
    offset = max(0, min(int(offset or 0), 500))
    cache_key = f"weeks_summary:{company_id}:{weeks}:{offset}"
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
        monday_dt = this_monday - timedelta(weeks=(i + offset))
        ws_iso, we_iso, ws_date, we_date = _week_range_for(monday_dt)
        label = f"{monday_dt.strftime('%d.%m')} - {(monday_dt + timedelta(days=6)).strftime('%d.%m')}"

        # Mevcut obligation kayıtları
        obligs = await db.courier_invoice_obligations.find(
            {"company_id": company_id, "week_start": ws_date},
            {"_id": 0, "courier_id": 1, "status": 1, "is_manual": 1, "is_remainder": 1},
        ).to_list(2000)
        non_remainder_obligs = [o for o in obligs if not o.get("is_remainder")]
        created = len(non_remainder_obligs)
        uploaded = sum(1 for o in non_remainder_obligs if o.get("status") in ("uploaded", "approved"))
        approved = sum(1 for o in non_remainder_obligs if o.get("status") == "approved")
        pending = sum(1 for o in non_remainder_obligs if o.get("status") == "pending")

        # Toplam: listede gerçekten "Bekliyor" statülü kaç fatura varsa onu say.
        # Predicted satırlar (henüz oluşmamış olası faturalar) toplama dahil edilmez —
        # onlar ayrı bir kavram. Bu badge'in amacı admin'e "kaç pending fatura var"
        # bilgisini doğru vermek.
        total_for_strip = pending

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

    # Mevcut non-remainder, NON-MANUAL obligation tutarları (kurye bazında toplam).
    # Manuel faturalar bağımsızdır — predicted hesabını etkilemezler. Aksi halde
    # admin küçük bir manuel oluşturduğunda kalan haftalık tutar yanlış yere düşer.
    courier_existing_total = {}
    for cid, oblig_list in obligs_by_courier.items():
        total = 0.0
        for o in oblig_list:
            if o.get("is_remainder") or o.get("is_manual"):
                continue
            total += float(o.get("expected_amount") or 0)
        courier_existing_total[cid] = round(total, 2)

    rows = []

    # 1) Predicted satırlar: hesaplanan beklenen > mevcut non-remainder obligation
    # toplamı (delta > 0.01). Aradaki fark predicted satır olarak gösterilir; admin
    # checkbox ile bu satırlardan yükümlülük oluşturabilir.
    for cid in expected.keys():
        exp = expected[cid]
        info = courier_info.get(cid, {})
        delta = round(float(exp["amount"]) - courier_existing_total.get(cid, 0.0), 2)
        if delta <= 0.01:
            continue
        rows.append({
            "row_key": f"predicted:{cid}",
            "courier_id": cid,
            "courier_name": info.get("name") or exp.get("name") or cid,
            "phone": info.get("phone") or "",
            "expected_amount": delta,
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

    # Sıralama: önce onaylı OLMAYANLAR alfabetik, sonra onaylılar alfabetik
    def _sort_key(r):
        is_approved = bool(r.get("obligation") and r["obligation"].get("status") == "approved")
        return (
            1 if is_approved else 0,
            (r.get("courier_name") or "").lower(),
        )
    rows.sort(key=_sort_key)

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


@router.get("/monthly-invoices/{company_id}/merged-pdf")
async def monthly_invoices_merged_pdf(company_id: str, year: int, month: int, payload: dict = Depends(require_auth)):
    """
    Bir ayın tüm onaylı faturalarını tek bir PDF'e birleştirir.
    Hem yeni sistem (approved obligation R2 files) hem eski sistem (invoices) dahil.
    """
    from pypdf import PdfReader, PdfWriter
    from PIL import Image

    if not _is_admin(payload):
        raise HTTPException(status_code=403, detail="Yetki yok")
    if not (2020 <= year <= 2099) or not (1 <= month <= 12):
        raise HTTPException(status_code=400, detail="Geçersiz tarih")

    start_dt = datetime(year, month, 1, tzinfo=TR_TZ)
    end_dt = datetime(year + 1, 1, 1, tzinfo=TR_TZ) if month == 12 else datetime(year, month + 1, 1, tzinfo=TR_TZ)
    start_iso = start_dt.isoformat()
    end_iso = end_dt.isoformat()

    writer = PdfWriter()
    pages_added = 0
    failed = []

    def _add_bytes_as_pdf(file_bytes: bytes, filename: str):
        nonlocal pages_added
        if not file_bytes:
            failed.append(filename or "?")
            return
        name = (filename or "").lower()
        try:
            if name.endswith(".pdf") or file_bytes[:4] == b"%PDF":
                reader = PdfReader(io.BytesIO(file_bytes))
                for p in reader.pages:
                    writer.add_page(p)
                    pages_added += 1
            else:
                img = Image.open(io.BytesIO(file_bytes))
                if img.mode in ("RGBA", "P"):
                    img = img.convert("RGB")
                buf = io.BytesIO()
                img.save(buf, format="PDF")
                buf.seek(0)
                reader = PdfReader(buf)
                for p in reader.pages:
                    writer.add_page(p)
                    pages_added += 1
        except Exception as e:
            logger.warning(f"PDF merge hatası ({filename}): {e}")
            failed.append(filename or "?")

    # 1) Yeni sistem: approved obligation'lar (R2'den indir)
    approved = await db.courier_invoice_obligations.find(
        {
            "company_id": company_id,
            "status": "approved",
            "decided_at": {"$gte": start_iso, "$lt": end_iso},
        },
        {"_id": 0, "invoice_r2_key": 1, "invoice_filename": 1, "courier_name": 1, "id": 1},
    ).sort("decided_at", 1).to_list(2000)
    for o in approved:
        r2_key = o.get("invoice_r2_key")
        if not r2_key:
            continue
        try:
            file_bytes = await download_file_from_r2(r2_key)
        except Exception as e:
            logger.warning(f"R2 indirme hatası ({r2_key}): {e}")
            failed.append(o.get("invoice_filename") or o.get("id") or "?")
            continue
        _add_bytes_as_pdf(file_bytes, o.get("invoice_filename") or "")

    # 2) Eski sistem: invoices koleksiyonu (verified=True)
    try:
        invoices = await db.invoices.find(
            {
                "company_id": company_id,
                "verified": True,
                "uploaded_at": {"$gte": start_iso, "$lt": end_iso},
            },
            {"_id": 0},
        ).sort("uploaded_at", 1).to_list(2000)
    except Exception:
        invoices = []
    for inv in invoices:
        file_content = None
        # R2 storage öncelikli
        if inv.get("storage_type") == "r2" and inv.get("r2_key"):
            try:
                file_content = await download_file_from_r2(inv["r2_key"])
            except Exception:
                pass
        # Local file fallback
        if not file_content and inv.get("file_path"):
            import os
            if os.path.exists(inv["file_path"]):
                with open(inv["file_path"], "rb") as f:
                    file_content = f.read()
        # base64 file_data fallback (legacy)
        if not file_content and inv.get("file_data"):
            try:
                import base64
                file_content = base64.b64decode(inv["file_data"])
            except Exception:
                file_content = None
        _add_bytes_as_pdf(file_content, inv.get("file_name") or inv.get("filename") or "")

    if pages_added == 0:
        msg = "Birleştirilebilecek fatura bulunamadı"
        if failed:
            msg += f" (hatalı: {len(failed)})"
        raise HTTPException(status_code=404, detail=msg)

    output = io.BytesIO()
    writer.write(output)
    output.seek(0)
    month_name = ["Ocak", "Subat", "Mart", "Nisan", "Mayis", "Haziran",
                  "Temmuz", "Agustos", "Eylul", "Ekim", "Kasim", "Aralik"][month - 1]
    filename = f"Kurye_Faturalari_{month_name}_{year}.pdf"
    return StreamingResponse(
        output,
        media_type="application/pdf",
        headers={
            "Content-Disposition": f'attachment; filename="{filename}"',
            "X-Pages-Added": str(pages_added),
            "X-Failed-Count": str(len(failed)),
        },
    )

