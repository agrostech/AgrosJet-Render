"""
Kesilen Faturalar (Issued Invoices) API
- Haftalık restoran bazlı taşıma ücreti ve KDV hesaplama
- Fatura yükleme ve görüntüleme
"""
from fastapi import APIRouter, HTTPException, UploadFile, File, Form
from typing import Optional, List
from datetime import datetime, timezone, timedelta
import uuid
import base64

from utils.database import db

router = APIRouter(prefix="/api/issued-invoices", tags=["Kesilen Faturalar"])


# ========== Helpers ==========

async def get_company_work_hours(company_id: str) -> tuple:
    """Şirket açılış/kapanış saatlerini getir"""
    company = await db.companies.find_one(
        {"id": company_id},
        {"_id": 0, "opening_time": 1, "closing_time": 1}
    )
    if not company:
        return "09:00", "23:00"
    return company.get("opening_time", "09:00"), company.get("closing_time", "23:00")


def get_weeks_list(opening_time: str, closing_time: str, count: int = 12) -> List[dict]:
    """
    Son N haftalık dönemleri listele.
    Hafta: Pazartesi açılış -> Pazartesi kapanış (7 gün sonra)
    Türkiye saati baz alınır.
    """
    turkey_tz = timezone(timedelta(hours=3))
    now_turkey = datetime.now(turkey_tz)
    
    # Bu haftanın pazartesisini bul
    days_since_monday = now_turkey.weekday()
    this_monday = now_turkey - timedelta(days=days_since_monday)
    
    open_h, open_m = map(int, opening_time.split(':'))
    close_h, close_m = map(int, closing_time.split(':'))
    
    weeks = []
    for i in range(count):
        # Hafta başlangıcı: Pazartesi açılış (Türkiye saati)
        base_monday = this_monday - timedelta(weeks=i)
        week_start_turkey = base_monday.replace(
            hour=open_h, minute=open_m, second=0, microsecond=0, tzinfo=turkey_tz
        )
        # Hafta bitişi: Bir sonraki Pazartesi kapanış (Türkiye saati)
        week_end_turkey = (base_monday + timedelta(days=7)).replace(
            hour=close_h, minute=close_m, second=0, microsecond=0, tzinfo=turkey_tz
        )
        
        # UTC'ye çevir (veritabanı sorguları için)
        week_start_utc = week_start_turkey.astimezone(timezone.utc)
        week_end_utc = week_end_turkey.astimezone(timezone.utc)
        
        label = f"{week_start_turkey.strftime('%d.%m')} - {week_end_turkey.strftime('%d.%m.%Y')}"
        
        weeks.append({
            "week_start": week_start_utc.isoformat(),
            "week_end": week_end_utc.isoformat(),
            "week_label": label,
            "is_current": i == 0
        })
    
    return weeks


# ========== Endpoints ==========

@router.get("/{company_id}/weeks")
async def get_weeks(company_id: str):
    """Hafta listesini getir"""
    opening_time, closing_time = await get_company_work_hours(company_id)
    weeks = get_weeks_list(opening_time, closing_time, 12)
    return weeks


@router.get("/{company_id}/week-summary")
async def get_week_summary(company_id: str, week_start: str, week_end: str):
    """
    Belirli bir hafta için restoran bazlı taşıma ücreti ve KDV özeti.
    Her restoran için toplam sipariş, taşıma ücreti ve KDV hesaplar.
    """
    # Siparişleri getir - teslim edilmiş veya tamamlanmış
    orders_cursor = db.orders.find(
        {
            "company_id": company_id,
            "created_at": {"$gte": week_start, "$lt": week_end},
            "status": {"$in": ["delivered", "completed"]}
        },
        {
            "_id": 0,
            "restaurant_id": 1,
            "delivery_fee": 1,
            "total_amount": 1
        }
    )
    orders = await orders_cursor.to_list(10000)
    
    # Restoran bilgilerini getir
    restaurant_ids = list(set(o.get("restaurant_id") for o in orders if o.get("restaurant_id")))
    restaurants_map = {}
    if restaurant_ids:
        restaurants = await db.restaurants.find(
            {"id": {"$in": restaurant_ids}},
            {"_id": 0, "id": 1, "name": 1}
        ).to_list(500)
        restaurants_map = {r["id"]: r.get("name", "İsimsiz Restoran") for r in restaurants}
    
    # Restoran bazlı toplamları hesapla
    restaurant_totals = {}
    for order in orders:
        rid = order.get("restaurant_id")
        if not rid:
            continue
        
        if rid not in restaurant_totals:
            restaurant_totals[rid] = {
                "restaurant_id": rid,
                "restaurant_name": restaurants_map.get(rid, "İsimsiz Restoran"),
                "order_count": 0,
                "total_delivery_fee": 0,
                "total_amount": 0
            }
        
        restaurant_totals[rid]["order_count"] += 1
        restaurant_totals[rid]["total_delivery_fee"] += order.get("delivery_fee", 0) or 0
        restaurant_totals[rid]["total_amount"] += order.get("total_amount", 0) or 0
    
    # KDV hesapla (%10)
    KDV_RATE = 0.10
    result = []
    for rid, data in restaurant_totals.items():
        kdv = data["total_delivery_fee"] * KDV_RATE
        
        # Yüklenen faturayı kontrol et
        invoice = await db.issued_invoices.find_one(
            {
                "company_id": company_id,
                "restaurant_id": rid,
                "week_start": week_start
            },
            {"_id": 0}
        )
        
        result.append({
            **data,
            "kdv": kdv,
            "total_with_kdv": data["total_delivery_fee"] + kdv,
            "invoice_uploaded": invoice is not None,
            "invoice_id": invoice.get("id") if invoice else None,
            "invoice_filename": invoice.get("filename") if invoice else None,
            "invoice_uploaded_at": invoice.get("uploaded_at") if invoice else None
        })
    
    # Toplam
    total_delivery_fee = sum(r["total_delivery_fee"] for r in result)
    total_kdv = sum(r["kdv"] for r in result)
    total_order_count = sum(r["order_count"] for r in result)
    
    # Restoran ismine göre sırala
    result.sort(key=lambda x: x["restaurant_name"])
    
    return {
        "restaurants": result,
        "summary": {
            "total_restaurants": len(result),
            "total_orders": total_order_count,
            "total_delivery_fee": total_delivery_fee,
            "total_kdv": total_kdv,
            "total_with_kdv": total_delivery_fee + total_kdv
        }
    }


@router.post("/{company_id}/upload")
async def upload_invoice(
    company_id: str,
    restaurant_id: str = Form(...),
    week_start: str = Form(...),
    week_label: str = Form(...),
    admin_id: str = Form(""),
    admin_name: str = Form(""),
    file: UploadFile = File(...)
):
    """Fatura yükle"""
    # Dosya boyutu kontrolü (10MB)
    contents = await file.read()
    if len(contents) > 10 * 1024 * 1024:
        raise HTTPException(status_code=400, detail="Dosya boyutu 10MB'ı geçemez")
    
    # Dosya tipi kontrolü
    allowed_extensions = ["pdf", "png", "jpg", "jpeg"]
    ext = file.filename.split(".")[-1].lower() if "." in file.filename else ""
    if ext not in allowed_extensions:
        raise HTTPException(status_code=400, detail="Sadece PDF ve resim dosyaları kabul edilir")
    
    # Mevcut faturayı kontrol et
    existing = await db.issued_invoices.find_one({
        "company_id": company_id,
        "restaurant_id": restaurant_id,
        "week_start": week_start
    })
    
    invoice_id = existing.get("id") if existing else str(uuid.uuid4())
    
    invoice_data = {
        "id": invoice_id,
        "company_id": company_id,
        "restaurant_id": restaurant_id,
        "week_start": week_start,
        "week_label": week_label,
        "filename": file.filename,
        "file_data": base64.b64encode(contents).decode("utf-8"),
        "file_extension": ext,
        "uploaded_at": datetime.now(timezone.utc).isoformat(),
        "uploaded_by_id": admin_id,
        "uploaded_by_name": admin_name
    }
    
    await db.issued_invoices.update_one(
        {"id": invoice_id},
        {"$set": invoice_data},
        upsert=True
    )
    
    return {"success": True, "invoice_id": invoice_id}


@router.get("/{company_id}/download/{invoice_id}")
async def download_invoice(company_id: str, invoice_id: str):
    """Fatura indir/görüntüle"""
    invoice = await db.issued_invoices.find_one(
        {"id": invoice_id, "company_id": company_id},
        {"_id": 0}
    )
    
    if not invoice:
        raise HTTPException(status_code=404, detail="Fatura bulunamadı")
    
    return {
        "filename": invoice.get("filename"),
        "file_data": invoice.get("file_data"),
        "extension": invoice.get("file_extension", "pdf")
    }


@router.delete("/{company_id}/invoice/{invoice_id}")
async def delete_invoice(company_id: str, invoice_id: str):
    """Fatura sil"""
    result = await db.issued_invoices.delete_one({
        "id": invoice_id,
        "company_id": company_id
    })
    
    if result.deleted_count == 0:
        raise HTTPException(status_code=404, detail="Fatura bulunamadı")
    
    return {"success": True}
