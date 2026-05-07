"""
Kurye Ödeme Talepleri (Payout Requests)
- Kurye otomatik bakiyesinden talep oluşturur (fatura zorunlu, PDF)
- Admin onaylar (manuel tutar girer)
- Yüzdeli taksit varsa otomatik kesilir
"""
from fastapi import APIRouter, HTTPException, UploadFile, File, Form, Depends
from datetime import datetime, timezone, timedelta
from typing import Optional
import uuid
import os
import logging

from utils.database import db
from utils.helpers import get_turkey_now, TURKEY_TZ
from utils.jwt_utils import require_auth, require_admin
from services.r2_storage import upload_file_to_r2, download_file_from_r2
from services.accounting_service import get_entity_transactions

logger = logging.getLogger(__name__)
router = APIRouter(prefix="/api/payout-requests", tags=["Ödeme Talepleri"], dependencies=[Depends(require_auth)])

# Sabitler
MIN_PAYOUT_AMOUNT = 1000.0
COOLDOWN_HOURS = 24
R2_INVOICE_PREFIX = "FATURALAR"


# ========== Helpers ==========

def _format_name_for_file(name: str) -> str:
    """İsmi dosya için uygun formata çevir (Türkçe karakterler)"""
    import re
    if not name:
        return "Kurye"
    replacements = {
        'ğ': 'g', 'Ğ': 'G', 'ü': 'u', 'Ü': 'U',
        'ş': 's', 'Ş': 'S', 'ı': 'i', 'İ': 'I',
        'ö': 'o', 'Ö': 'O', 'ç': 'c', 'Ç': 'C', ' ': ''
    }
    for tr, en in replacements.items():
        name = name.replace(tr, en)
    name = re.sub(r'[^a-zA-Z0-9]', '', name)
    return name or "Kurye"


async def _calculate_courier_balance(courier_id: str) -> float:
    """Kuryenin güncel bakiyesi (tüm transactions üzerinden)"""
    pipeline = [
        {"$match": {"entity_type": "courier", "entity_id": courier_id}},
        {"$group": {
            "_id": None,
            "total_out": {"$sum": {"$cond": [{"$in": ["$type", ["payment_out", "given"]]}, "$amount", 0]}},
            "total_in": {"$sum": {"$cond": [{"$in": ["$type", ["payment_in", "received", "earning"]]}, "$amount", 0]}}
        }}
    ]
    result = await db.transactions.aggregate(pipeline).to_list(1)
    if not result:
        return 0.0
    # balance = out - in. Negatif balance = kurye alacaklı.
    # Alacak tutarı = -balance
    return float(result[0]["total_in"] - result[0]["total_out"])


async def _get_active_percent_installment(courier_id: str) -> Optional[dict]:
    """Kuryenin aktif yüzdeli taksit ürününü getir (varsa ilki)"""
    product = await db.installment_products.find_one(
        {
            "courier_id": courier_id,
            "installment_type": "percent",
            "is_completed": {"$ne": True}
        },
        {"_id": 0}
    )
    return product


async def _check_unprocessed_collections(courier_id: str) -> dict:
    """
    Kuryenin geçmişteki (bugün hariç) işlenmemiş tahsilat günü var mı?
    Kuryenin kayıt tarihinden bugüne kadar, sipariş yaptığı günler içinde
    daily_mutabakat_processed kaydı olmayan günler.
    """
    # Kurye kayıt tarihi
    courier = await db.couriers.find_one({"id": courier_id}, {"_id": 0, "created_at": 1, "company_id": 1})
    if not courier:
        return {"blocked": False}
    
    company_id = courier.get("company_id")
    if not company_id:
        return {"blocked": False}
    
    courier_created_at = courier.get("created_at")
    if not courier_created_at:
        return {"blocked": False}
    
    # Bugünün başı (Türkiye saati 06:00)
    now_turkey = datetime.now(TURKEY_TZ)
    today_start = now_turkey.replace(hour=6, minute=0, second=0, microsecond=0)
    if now_turkey < today_start:
        # Saat 06:00'dan önceyse "bugün" dünden başlar
        today_start = today_start - timedelta(days=1)
    
    # Kuryenin teslim ettiği siparişlerin günlerini bul (bugün hariç)
    delivered_orders = await db.orders.find(
        {
            "courier_id": courier_id,
            "company_id": company_id,
            "status": "delivered",
            "delivered_at": {"$lt": today_start.isoformat()}
        },
        {"_id": 0, "delivered_at": 1}
    ).to_list(20000)
    
    # Sipariş yapılan günler (YYYY-MM-DD formatında)
    order_days = set()
    for order in delivered_orders:
        delivered_at = order.get("delivered_at")
        if not delivered_at:
            continue
        try:
            d = datetime.fromisoformat(delivered_at.replace("Z", "+00:00"))
            # Türkiye saatine çevir
            d_turkey = d.astimezone(TURKEY_TZ)
            # Mesai günü: 06:00 öncesini önceki güne yaz
            if d_turkey.hour < 6:
                d_turkey = d_turkey - timedelta(days=1)
            order_days.add(d_turkey.strftime("%Y-%m-%d"))
        except Exception:
            continue
    
    if not order_days:
        return {"blocked": False}
    
    # İşlenmiş günleri bul
    processed_records = await db.daily_mutabakat_processed.find(
        {
            "courier_id": courier_id,
            "company_id": company_id,
            "date": {"$in": list(order_days)}
        },
        {"_id": 0, "date": 1}
    ).to_list(20000)
    processed_days = {r["date"] for r in processed_records}
    
    unprocessed = order_days - processed_days
    
    if unprocessed:
        return {
            "blocked": True,
            "unprocessed_count": len(unprocessed),
            "unprocessed_days": sorted(unprocessed)[:5]  # İlk 5'i göster
        }
    return {"blocked": False}


async def _check_cooldown(courier_id: str) -> dict:
    """Son 24 saat içinde talep var mı?"""
    cutoff = (datetime.now(TURKEY_TZ) - timedelta(hours=COOLDOWN_HOURS)).isoformat()
    last_request = await db.payout_requests.find_one(
        {
            "courier_id": courier_id,
            "created_at": {"$gte": cutoff}
        },
        {"_id": 0, "id": 1, "created_at": 1}
    )
    if last_request:
        return {"blocked": True, "last_request_at": last_request["created_at"]}
    return {"blocked": False}


# ========== Endpoints ==========

@router.get("/courier/{courier_id}/can-request")
async def can_request_payout(courier_id: str):
    """
    Pre-check endpoint:
    Kurye talep oluşturabilir mi? Bakiye, taksit, mütabakat, cooldown kontrolü.
    """
    courier = await db.couriers.find_one({"id": courier_id}, {"_id": 0, "company_id": 1, "name": 1})
    if not courier:
        raise HTTPException(status_code=404, detail="Kurye bulunamadı")
    
    balance = await _calculate_courier_balance(courier_id)  # Pozitif = alacak
    cooldown = await _check_cooldown(courier_id)
    mutabakat = await _check_unprocessed_collections(courier_id)
    active_installment = await _get_active_percent_installment(courier_id)
    
    can_request = True
    reason = None
    
    if balance < MIN_PAYOUT_AMOUNT:
        can_request = False
        reason = f"Talep oluşturmak için minimum bakiye {MIN_PAYOUT_AMOUNT:.0f} TL olmalı. Mevcut bakiyeniz: {balance:.2f} TL"
    elif cooldown.get("blocked"):
        can_request = False
        reason = "Son 24 saat içinde bir talep oluşturduğunuz için yeni talep gönderemezsiniz"
    elif mutabakat.get("blocked"):
        days = mutabakat.get("unprocessed_days", [])
        days_str = ", ".join(days) if days else ""
        reason = f"Geçmiş günlerde işlenmemiş tahsilatınız var: {days_str}"
        can_request = False
    
    return {
        "can_request": can_request,
        "reason": reason,
        "balance": round(balance, 2),
        "min_amount": MIN_PAYOUT_AMOUNT,
        "max_amount": round(balance, 2),
        "active_installment": active_installment,  # None veya {total_amount, withdrawal_percent, ...}
        "cooldown_blocked": cooldown.get("blocked", False),
        "mutabakat_blocked": mutabakat.get("blocked", False),
        "unprocessed_days": mutabakat.get("unprocessed_days", [])
    }


@router.post("/courier/{courier_id}")
async def create_payout_request(
    courier_id: str,
    requested_amount: float = Form(...),
    file: UploadFile = File(...)
):
    """
    Kurye ödeme talebi oluştur.
    - Tutar: minimum 1000 TL, bakiyeden büyük olamaz (taksit kesintisi dahil)
    - Fatura: zorunlu, sadece PDF
    - 24h cooldown
    - Geçmişte işlenmemiş tahsilat varsa blok
    """
    if requested_amount < MIN_PAYOUT_AMOUNT:
        raise HTTPException(status_code=400, detail=f"Minimum talep tutarı {MIN_PAYOUT_AMOUNT:.0f} TL")
    
    # Sadece PDF
    file_ext = os.path.splitext(file.filename.lower())[1] if file.filename else ""
    if file_ext != ".pdf":
        raise HTTPException(status_code=400, detail="Sadece PDF formatında fatura yüklenebilir")
    
    # Kurye kontrolü
    courier = await db.couriers.find_one({"id": courier_id}, {"_id": 0})
    if not courier:
        raise HTTPException(status_code=404, detail="Kurye bulunamadı")
    
    company_id = courier.get("company_id")
    if not company_id:
        raise HTTPException(status_code=400, detail="Kurye şirketi bulunamadı")
    
    # Cooldown
    cooldown = await _check_cooldown(courier_id)
    if cooldown.get("blocked"):
        raise HTTPException(status_code=429, detail="Son 24 saat içinde tekrar talep gönderemezsiniz")
    
    # Mütabakat blokeri
    mutabakat = await _check_unprocessed_collections(courier_id)
    if mutabakat.get("blocked"):
        days = mutabakat.get("unprocessed_days", [])
        raise HTTPException(
            status_code=400,
            detail=f"Geçmiş günlerde işlenmemiş tahsilatınız var: {', '.join(days)}"
        )
    
    # Bakiye kontrolü (taksit kesintisi dahil)
    balance = await _calculate_courier_balance(courier_id)
    active_installment = await _get_active_percent_installment(courier_id)
    
    expected_deduction = 0.0
    installment_product_id = None
    if active_installment:
        installment_product_id = active_installment.get("id")
        percent = float(active_installment.get("withdrawal_percent") or 0)
        expected_deduction = round(requested_amount * percent / 100.0, 2)
    
    if requested_amount > balance:
        raise HTTPException(
            status_code=400,
            detail=f"Talep tutarı bakiyenizi aşıyor. Maksimum: {balance:.2f} TL"
        )
    
    # Fatura yükleme (R2)
    file_content = await file.read()
    if len(file_content) > 10 * 1024 * 1024:
        raise HTTPException(status_code=413, detail="Fatura 10MB'ı geçemez")
    
    # Şirket adı
    company = await db.companies.find_one({"id": company_id}, {"_id": 0, "name": 1})
    company_folder = _format_name_for_file(company["name"]) if company else company_id
    
    # Türkçe ay
    now = datetime.now(TURKEY_TZ)
    months_tr = ["Ocak","Subat","Mart","Nisan","Mayis","Haziran","Temmuz","Agustos","Eylul","Ekim","Kasim","Aralik"]
    month_folder = f"{months_tr[now.month-1]} {now.year}"
    
    # Dosya adı: KuryeAd_DD.MM.YYYY.pdf
    courier_name_safe = _format_name_for_file(courier.get("name", "Kurye"))
    date_str = now.strftime("%d.%m.%Y")
    invoice_id = str(uuid.uuid4())
    file_name = f"{courier_name_safe}_{date_str}.pdf"
    stored_file_name = f"{invoice_id[:8]}_{file_name}"
    r2_key = f"{R2_INVOICE_PREFIX}/{company_folder}/{month_folder}/{stored_file_name}"
    
    upload_result = await upload_file_to_r2(file_content, r2_key, "application/pdf")
    if not upload_result.get("success"):
        raise HTTPException(status_code=503, detail="Fatura yüklenemedi (R2 hatası)")
    
    # Invoice kaydı
    invoice = {
        "id": invoice_id,
        "courier_id": courier_id,
        "courier_name": courier.get("name", ""),
        "company_id": company_id,
        "file_name": file_name,
        "stored_file_name": stored_file_name,
        "r2_key": r2_key,
        "storage_type": "r2",
        "uploaded_at": get_turkey_now(),
        "created_at": get_turkey_now(),
        "is_payout_invoice": True  # Payout talebi için yüklendi
    }
    await db.invoices.insert_one(invoice)
    
    # Talep kaydı
    request_id = str(uuid.uuid4())
    payout_request = {
        "id": request_id,
        "company_id": company_id,
        "courier_id": courier_id,
        "courier_name": courier.get("name", ""),
        "courier_phone": courier.get("phone", ""),
        "requested_amount": float(requested_amount),
        "approved_amount": None,
        "expected_installment_deduction": expected_deduction,
        "actual_installment_deduction": None,
        "installment_product_id": installment_product_id,
        "invoice_id": invoice_id,
        "status": "pending",
        "created_at": get_turkey_now(),
        "approved_at": None,
        "approved_by_admin_id": None,
        "approved_by_admin_name": None
    }
    await db.payout_requests.insert_one(payout_request)
    
    # Invoice'a request_id bağla
    await db.invoices.update_one(
        {"id": invoice_id},
        {"$set": {"payout_request_id": request_id}}
    )
    
    payout_request.pop("_id", None)
    return {
        "message": "Ödeme talebiniz oluşturuldu, yöneticinin onayını bekliyor",
        "request": payout_request
    }


@router.get("/courier/{courier_id}/history")
async def get_courier_payout_history(courier_id: str, limit: int = 50):
    """Kurye kendi taleplerini listeler"""
    requests = await db.payout_requests.find(
        {"courier_id": courier_id},
        {"_id": 0}
    ).sort("created_at", -1).limit(limit).to_list(limit)
    return requests


@router.get("/company/{company_id}", dependencies=[Depends(require_admin)])
async def get_company_payout_requests(
    company_id: str,
    status: Optional[str] = None,  # "pending" | "approved" | None (hepsi)
    limit: int = 100,
    skip: int = 0
):
    """Admin: şirket bazlı talep listesi"""
    query = {"company_id": company_id}
    if status:
        query["status"] = status
    
    total = await db.payout_requests.count_documents(query)
    requests = await db.payout_requests.find(
        query, {"_id": 0}
    ).sort("created_at", -1).skip(skip).limit(limit).to_list(limit)
    
    # Her talep için aktif taksit (snapshot olarak ekle)
    for r in requests:
        # Approved ise expected_deduction göstermeye gerek yok
        if r.get("status") == "pending":
            installment = None
            if r.get("installment_product_id"):
                installment = await db.installment_products.find_one(
                    {"id": r["installment_product_id"]},
                    {"_id": 0}
                )
            r["installment_snapshot"] = installment
    
    return {"requests": requests, "total": total, "limit": limit, "skip": skip}


@router.get("/{request_id}/invoice", dependencies=[Depends(require_admin)])
async def get_payout_request_invoice(request_id: str):
    """Admin: talebin faturasını base64 olarak getir (önizleme için)"""
    import base64
    request_doc = await db.payout_requests.find_one({"id": request_id}, {"_id": 0})
    if not request_doc:
        raise HTTPException(status_code=404, detail="Talep bulunamadı")
    
    invoice_id = request_doc.get("invoice_id")
    if not invoice_id:
        raise HTTPException(status_code=404, detail="Fatura bulunamadı")
    
    invoice = await db.invoices.find_one({"id": invoice_id}, {"_id": 0})
    if not invoice:
        raise HTTPException(status_code=404, detail="Fatura bulunamadı")
    
    # R2'den indir
    if invoice.get("storage_type") == "r2" and invoice.get("r2_key"):
        content = await download_file_from_r2(invoice["r2_key"])
        if not content:
            raise HTTPException(status_code=404, detail="Fatura dosyası R2'de yok")
        return {
            "filename": invoice.get("file_name", "fatura.pdf"),
            "file_data": base64.b64encode(content).decode("utf-8"),
            "extension": "pdf"
        }
    
    raise HTTPException(status_code=404, detail="Fatura erişilebilir değil")


@router.post("/{request_id}/approve", dependencies=[Depends(require_admin)])
async def approve_payout_request(
    request_id: str,
    approved_amount: float = Form(...),
    admin_id: str = Form(...),
    admin_name: str = Form(...)
):
    """
    Admin: talep onayı.
    - approved_amount: faturadaki tutar (admin manuel girer)
    - approved_amount ≤ requested_amount ve ≤ kurye bakiyesi olmalı
    - Yüzdeli aktif taksit varsa: deduction = approved_amount × percent
    - Transactions:
        1) payment_in (hakediş ödemesi): amount = approved_amount - deduction, is_hakedis=True
        2) payment_in (taksit kesintisi): amount = deduction (varsa)
    """
    request_doc = await db.payout_requests.find_one({"id": request_id}, {"_id": 0})
    if not request_doc:
        raise HTTPException(status_code=404, detail="Talep bulunamadı")
    
    if request_doc.get("status") == "approved":
        raise HTTPException(status_code=400, detail="Talep zaten onaylanmış")
    
    if approved_amount <= 0:
        raise HTTPException(status_code=400, detail="Onay tutarı 0'dan büyük olmalı")
    
    if approved_amount > request_doc["requested_amount"]:
        raise HTTPException(
            status_code=400,
            detail=f"Onay tutarı talepten ({request_doc['requested_amount']:.2f}) büyük olamaz"
        )
    
    courier_id = request_doc["courier_id"]
    company_id = request_doc["company_id"]
    
    # Bakiye kontrolü (yine kontrol et — onay sırasında yeni transactionlar oluşmuş olabilir)
    balance = await _calculate_courier_balance(courier_id)
    if approved_amount > balance:
        raise HTTPException(
            status_code=400,
            detail=f"Onay tutarı kurye bakiyesini ({balance:.2f}) aşıyor"
        )
    
    # Aktif yüzdeli taksit kontrolü
    deduction = 0.0
    installment_product = None
    if request_doc.get("installment_product_id"):
        installment_product = await db.installment_products.find_one(
            {"id": request_doc["installment_product_id"], "is_completed": {"$ne": True}},
            {"_id": 0}
        )
        if installment_product:
            percent = float(installment_product.get("withdrawal_percent") or 0)
            deduction = round(approved_amount * percent / 100.0, 2)
            # Kalan borçtan büyük olamaz
            remaining = float(installment_product.get("remaining_amount") or 0)
            if deduction > remaining:
                deduction = remaining
    
    cash_payout = round(approved_amount - deduction, 2)
    
    # Türkiye saati
    now_iso = get_turkey_now()
    
    courier_name = request_doc.get("courier_name", "")
    
    # Transaction 1: Hakediş ödemesi (payment_out: alacak kapatır = balance pozitif tarafa)
    # NOT: earning total_in'e yazılıyor, ödeme total_out'a yazılarak alacak azalır
    tx_payment = {
        "id": str(uuid.uuid4()),
        "entity_type": "courier",
        "entity_id": courier_id,
        "company_id": company_id,
        "type": "payment_out",
        "amount": cash_payout,
        "description": f"Hakediş ödemesi (Talep #{request_id[:8]})",
        "is_hakedis": True,
        "admin_id": admin_id,
        "admin_name": admin_name,
        "created_at": now_iso,
        "payout_request_id": request_id,
        "invoice_id": request_doc.get("invoice_id")
    }
    await db.transactions.insert_one(tx_payment)
    
    transaction_ids = [tx_payment["id"]]
    
    # Transaction 2: Taksit kesintisi (payment_out: alacak kapatır + taksit borcu da düşer)
    tx_installment_id = None
    if deduction > 0 and installment_product:
        tx_installment = {
            "id": str(uuid.uuid4()),
            "entity_type": "courier",
            "entity_id": courier_id,
            "company_id": company_id,
            "type": "payment_out",
            "amount": deduction,
            "description": f"Taksit kesintisi: {installment_product.get('name')} (Talep #{request_id[:8]})",
            "is_hakedis": False,
            "admin_id": admin_id,
            "admin_name": admin_name,
            "created_at": now_iso,
            "payout_request_id": request_id,
            "installment_product_id": installment_product["id"]
        }
        await db.transactions.insert_one(tx_installment)
        tx_installment_id = tx_installment["id"]
        transaction_ids.append(tx_installment_id)
        
        # Taksit ürününü güncelle
        new_paid = float(installment_product.get("paid_amount") or 0) + deduction
        new_remaining = float(installment_product.get("remaining_amount") or 0) - deduction
        is_completed = new_remaining <= 0.01
        await db.installment_products.update_one(
            {"id": installment_product["id"]},
            {"$set": {
                "paid_amount": round(new_paid, 2),
                "remaining_amount": max(0, round(new_remaining, 2)),
                "is_completed": is_completed
            }}
        )
    
    # Faturayı doğrulanmış işaretle (verified)
    if request_doc.get("invoice_id"):
        await db.invoices.update_one(
            {"id": request_doc["invoice_id"]},
            {"$set": {
                "verified": True,
                "verified_amount": approved_amount,
                "verified_at": now_iso,
                "verified_by_admin_id": admin_id,
                "verified_by_admin_name": admin_name,
                "transaction_id": tx_payment["id"]
            }}
        )
    
    # Talep kaydını güncelle
    await db.payout_requests.update_one(
        {"id": request_id},
        {"$set": {
            "status": "approved",
            "approved_amount": float(approved_amount),
            "actual_installment_deduction": float(deduction),
            "cash_payout_amount": float(cash_payout),
            "approved_at": now_iso,
            "approved_by_admin_id": admin_id,
            "approved_by_admin_name": admin_name,
            "payment_transaction_id": tx_payment["id"],
            "installment_transaction_id": tx_installment_id
        }}
    )
    
    # Push notification
    try:
        from services.push_notification_service import send_push_notification
        await send_push_notification(
            courier_id=courier_id,
            title="✅ Ödeme Talebiniz Onaylandı",
            body=f"Ödemeniz yapıldı: {cash_payout:.2f} TL",
            data={
                "type": "PAYOUT_APPROVED",
                "requestId": request_id,
                "approvedAmount": approved_amount,
                "cashPayout": cash_payout,
                "deduction": deduction
            },
            sound="notification"
        )
    except Exception as e:
        logger.error(f"Payout approval notification error: {e}")
    
    return {
        "message": "Talep onaylandı ve ödeme yapıldı",
        "approved_amount": approved_amount,
        "cash_payout": cash_payout,
        "installment_deduction": deduction,
        "transaction_ids": transaction_ids,
        "courier_name": courier_name
    }
