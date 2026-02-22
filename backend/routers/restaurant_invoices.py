"""
Restaurant Invoice System
Restoran fatura yönetimi - Haftalık bazda
"""
from fastapi import APIRouter, HTTPException, UploadFile, File, Form
from pydantic import BaseModel
from typing import Optional, List
from datetime import datetime, timezone, timedelta
import uuid
import base64

from utils.database import db

router = APIRouter(prefix="/api", tags=["Restoran Faturaları"])


# ========== Models ==========

class InvoiceSettings(BaseModel):
    cash: bool = False           # Nakit
    credit_card: bool = False    # Kredi Kartı
    online: bool = False         # Online
    meal_card: bool = False      # Yemek Kartı
    online_meal_card: bool = False  # Online Yemek Kartı


class InvoiceVerify(BaseModel):
    invoice_id: str
    amount: float
    admin_id: str
    admin_name: str


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


def get_weeks_list(opening_time: str, closing_time: str, count: int = 8) -> List[dict]:
    """
    Hafta listesi oluştur.
    Haftalar Pazartesi açılış -> Pazartesi kapanış şeklinde.
    """
    now = datetime.now(timezone.utc)
    open_h, open_m = map(int, opening_time.split(':'))
    close_h, close_m = map(int, closing_time.split(':'))
    
    weeks = []
    
    # Bu haftanın pazartesisini bul
    days_since_monday = now.weekday()
    this_monday = now - timedelta(days=days_since_monday)
    this_monday = this_monday.replace(hour=open_h, minute=open_m, second=0, microsecond=0)
    
    for i in range(count):
        week_start = this_monday - timedelta(weeks=i)
        week_end = week_start + timedelta(days=7)
        week_end = week_end.replace(hour=close_h, minute=close_m)
        
        # Hafta hala devam ediyor mu?
        is_current = week_start <= now < week_end
        is_complete = now >= week_end
        
        weeks.append({
            "week_start": week_start.isoformat(),
            "week_end": week_end.isoformat(),
            "week_start_display": week_start.strftime("%d.%m.%Y"),
            "week_end_display": week_end.strftime("%d.%m.%Y"),
            "is_current": is_current,
            "is_complete": is_complete,
            "label": f"{week_start.strftime('%d.%m')} - {week_end.strftime('%d.%m.%Y')}"
        })
    
    return weeks


def get_week_date_range(week_start_str: str, opening_time: str, closing_time: str) -> tuple:
    """Hafta başlangıç/bitiş datetime objelerini döndür"""
    week_start = datetime.fromisoformat(week_start_str.replace('Z', '+00:00'))
    if week_start.tzinfo is None:
        week_start = week_start.replace(tzinfo=timezone.utc)
    
    open_h, open_m = map(int, opening_time.split(':'))
    close_h, close_m = map(int, closing_time.split(':'))
    
    week_start = week_start.replace(hour=open_h, minute=open_m, second=0, microsecond=0)
    week_end = week_start + timedelta(days=7)
    week_end = week_end.replace(hour=close_h, minute=close_m, second=0, microsecond=0)
    
    return week_start, week_end


# ========== Invoice Settings Endpoints ==========

@router.get("/restaurants/{restaurant_id}/invoice-settings")
async def get_invoice_settings(restaurant_id: str):
    """Restoran fatura ayarlarını getir"""
    restaurant = await db.restaurants.find_one(
        {"id": restaurant_id},
        {"_id": 0, "invoice_settings": 1, "name": 1}
    )
    if not restaurant:
        raise HTTPException(status_code=404, detail="Restoran bulunamadı")
    
    settings = restaurant.get("invoice_settings", {
        "cash": False,
        "credit_card": False,
        "online": False,
        "meal_card": False,
        "online_meal_card": False
    })
    
    return {
        "restaurant_name": restaurant.get("name"),
        "settings": settings
    }


@router.put("/restaurants/{restaurant_id}/invoice-settings")
async def update_invoice_settings(restaurant_id: str, settings: InvoiceSettings):
    """Restoran fatura ayarlarını güncelle"""
    result = await db.restaurants.update_one(
        {"id": restaurant_id},
        {"$set": {"invoice_settings": settings.model_dump()}}
    )
    if result.matched_count == 0:
        raise HTTPException(status_code=404, detail="Restoran bulunamadı")
    
    return {"message": "Fatura ayarları güncellendi"}


# ========== Week List Endpoint ==========

@router.get("/restaurant-invoices/{company_id}/weeks")
async def get_weeks(company_id: str, count: int = 8):
    """Hafta listesini getir"""
    opening_time, closing_time = await get_company_work_hours(company_id)
    weeks = get_weeks_list(opening_time, closing_time, count)
    return weeks


# ========== Missing Invoices Endpoint ==========

@router.get("/restaurant-invoices/{company_id}/week/{week_start}")
async def get_week_invoices(company_id: str, week_start: str):
    """
    Belirli bir hafta için restoran faturalarını getir.
    Eksik faturalar ve alınan faturaları döndürür.
    """
    opening_time, closing_time = await get_company_work_hours(company_id)
    week_start_dt, week_end_dt = get_week_date_range(week_start, opening_time, closing_time)
    
    # Fatura ayarı olan restoranları getir
    restaurants = await db.restaurants.find(
        {
            "company_id": company_id,
            "is_archived": {"$ne": True},
            "invoice_settings": {"$exists": True}
        },
        {"_id": 0}
    ).to_list(500)
    
    # Bu hafta için mevcut fatura kayıtlarını getir
    invoice_records = await db.restaurant_invoices.find(
        {
            "company_id": company_id,
            "week_start": week_start
        },
        {"_id": 0}
    ).to_list(500)
    
    invoice_map = {r["restaurant_id"]: r for r in invoice_records}
    
    # Haftalık sipariş toplamlarını hesapla
    order_pipeline = [
        {
            "$match": {
                "company_id": company_id,
                "created_at": {
                    "$gte": week_start_dt.isoformat(),
                    "$lt": week_end_dt.isoformat()
                },
                "status": {"$in": ["delivered", "completed"]}
            }
        },
        {
            "$group": {
                "_id": {
                    "restaurant_id": "$restaurant_id",
                    "payment_method": "$payment_method"
                },
                "total": {"$sum": "$total_amount"}
            }
        }
    ]
    
    order_totals = await db.orders.aggregate(order_pipeline).to_list(1000)
    
    # Restoran bazlı toplamları hesapla
    restaurant_totals = {}
    for item in order_totals:
        rid = item["_id"]["restaurant_id"]
        payment = item["_id"]["payment_method"] or "cash"
        total = item["total"] or 0
        
        if rid not in restaurant_totals:
            restaurant_totals[rid] = {
                "cash": 0,
                "credit_card": 0,
                "online": 0,
                "meal_card": 0,
                "online_meal_card": 0
            }
        
        # Payment method mapping
        if payment in ["cash", "nakit"]:
            restaurant_totals[rid]["cash"] += total
        elif payment in ["credit_card", "kredi_karti", "pos"]:
            restaurant_totals[rid]["credit_card"] += total
        elif payment in ["online", "online_odeme"]:
            restaurant_totals[rid]["online"] += total
        elif payment in ["meal_card", "yemek_karti"]:
            restaurant_totals[rid]["meal_card"] += total
        elif payment in ["online_meal_card", "online_yemek_karti"]:
            restaurant_totals[rid]["online_meal_card"] += total
    
    # Sonuçları oluştur
    missing_invoices = []
    received_invoices = []
    
    for restaurant in restaurants:
        rid = restaurant["id"]
        settings = restaurant.get("invoice_settings", {})
        totals = restaurant_totals.get(rid, {})
        record = invoice_map.get(rid)
        
        # Fatura gereken toplamı hesapla
        required_amount = 0
        breakdown = {}
        
        if settings.get("cash") and totals.get("cash", 0) > 0:
            breakdown["cash"] = totals["cash"]
            required_amount += totals["cash"]
        
        if settings.get("credit_card") and totals.get("credit_card", 0) > 0:
            breakdown["credit_card"] = totals["credit_card"]
            required_amount += totals["credit_card"]
        
        if settings.get("online") and totals.get("online", 0) > 0:
            breakdown["online"] = totals["online"]
            required_amount += totals["online"]
        
        if settings.get("meal_card") and totals.get("meal_card", 0) > 0:
            breakdown["meal_card"] = totals["meal_card"]
            required_amount += totals["meal_card"]
        
        if settings.get("online_meal_card") and totals.get("online_meal_card", 0) > 0:
            breakdown["online_meal_card"] = totals["online_meal_card"]
            required_amount += totals["online_meal_card"]
        
        # Fatura gerekliliği yoksa atla
        if required_amount == 0:
            continue
        
        invoice_data = {
            "restaurant_id": rid,
            "restaurant_name": restaurant["name"],
            "required_amount": required_amount,
            "breakdown": breakdown,
            "invoice_settings": settings
        }
        
        if record:
            invoice_data["record_id"] = record.get("id")
            invoice_data["invoices"] = record.get("invoices", [])
            invoice_data["verified_amount"] = record.get("verified_amount", 0)
            invoice_data["is_complete"] = record.get("is_complete", False)
            invoice_data["remaining_amount"] = required_amount - record.get("verified_amount", 0)
            
            if record.get("is_complete"):
                received_invoices.append(invoice_data)
            else:
                missing_invoices.append(invoice_data)
        else:
            invoice_data["record_id"] = None
            invoice_data["invoices"] = []
            invoice_data["verified_amount"] = 0
            invoice_data["is_complete"] = False
            invoice_data["remaining_amount"] = required_amount
            missing_invoices.append(invoice_data)
    
    # Toplam istatistikler
    total_required = sum(inv["required_amount"] for inv in missing_invoices + received_invoices)
    total_verified = sum(inv["verified_amount"] for inv in received_invoices)
    total_missing = total_required - total_verified
    
    return {
        "week_start": week_start,
        "week_end": week_end_dt.isoformat(),
        "week_label": f"{week_start_dt.strftime('%d.%m')} - {week_end_dt.strftime('%d.%m.%Y')}",
        "missing_invoices": missing_invoices,
        "received_invoices": received_invoices,
        "stats": {
            "total_restaurants": len(missing_invoices) + len(received_invoices),
            "missing_count": len(missing_invoices),
            "received_count": len(received_invoices),
            "total_required": total_required,
            "total_verified": total_verified,
            "total_missing": total_missing
        }
    }


# ========== Invoice Upload Endpoint ==========

@router.post("/restaurant-invoices/{company_id}/upload")
async def upload_invoice(
    company_id: str,
    restaurant_id: str = Form(...),
    week_start: str = Form(...),
    admin_id: str = Form(""),
    admin_name: str = Form(""),
    file: UploadFile = File(...)
):
    """Restoran faturası yükle"""
    # Dosya boyutu kontrolü (10MB)
    content = await file.read()
    if len(content) > 10 * 1024 * 1024:
        raise HTTPException(status_code=400, detail="Dosya boyutu 10MB'ı aşamaz")
    
    # Dosya uzantısı
    filename = file.filename or "invoice"
    extension = filename.split(".")[-1].lower() if "." in filename else "pdf"
    
    # Base64 encode
    file_data = base64.b64encode(content).decode("utf-8")
    
    invoice_id = str(uuid.uuid4())
    now = datetime.now(timezone.utc).isoformat()
    
    invoice_entry = {
        "invoice_id": invoice_id,
        "filename": filename,
        "extension": extension,
        "file_data": file_data,
        "uploaded_at": now,
        "uploaded_by_admin_id": admin_id,
        "uploaded_by_admin_name": admin_name,
        "verified": False,
        "verified_amount": 0
    }
    
    # Mevcut kaydı bul veya oluştur
    existing = await db.restaurant_invoices.find_one({
        "company_id": company_id,
        "restaurant_id": restaurant_id,
        "week_start": week_start
    })
    
    if existing:
        await db.restaurant_invoices.update_one(
            {"id": existing["id"]},
            {"$push": {"invoices": invoice_entry}}
        )
    else:
        # Restoran adını al
        restaurant = await db.restaurants.find_one({"id": restaurant_id}, {"_id": 0, "name": 1})
        restaurant_name = restaurant["name"] if restaurant else "Bilinmeyen"
        
        new_record = {
            "id": str(uuid.uuid4()),
            "company_id": company_id,
            "restaurant_id": restaurant_id,
            "restaurant_name": restaurant_name,
            "week_start": week_start,
            "invoices": [invoice_entry],
            "verified_amount": 0,
            "is_complete": False,
            "created_at": now
        }
        await db.restaurant_invoices.insert_one(new_record)
    
    return {"message": "Fatura yüklendi", "invoice_id": invoice_id}


# ========== Invoice Verify Endpoint ==========

@router.post("/restaurant-invoices/{company_id}/verify")
async def verify_invoice(company_id: str, data: InvoiceVerify):
    """
    Faturayı onayla ve tutar gir.
    Eğer tutar eksikse, kalan tutar için eksik fatura oluşturulur.
    """
    # Fatura kaydını bul
    record = await db.restaurant_invoices.find_one({
        "company_id": company_id,
        "invoices.invoice_id": data.invoice_id
    })
    
    if not record:
        raise HTTPException(status_code=404, detail="Fatura bulunamadı")
    
    # Faturayı güncelle
    invoices = record.get("invoices", [])
    for inv in invoices:
        if inv["invoice_id"] == data.invoice_id:
            inv["verified"] = True
            inv["verified_amount"] = data.amount
            inv["verified_at"] = datetime.now(timezone.utc).isoformat()
            inv["verified_by_admin_id"] = data.admin_id
            inv["verified_by_admin_name"] = data.admin_name
            break
    
    # Toplam onaylanan tutarı hesapla
    total_verified = sum(inv.get("verified_amount", 0) for inv in invoices if inv.get("verified"))
    
    await db.restaurant_invoices.update_one(
        {"id": record["id"]},
        {
            "$set": {
                "invoices": invoices,
                "verified_amount": total_verified,
                "is_complete": True  # Bir fatura onaylandığında tamamlandı say
            }
        }
    )
    
    return {
        "message": "Fatura onaylandı",
        "verified_amount": data.amount,
        "total_verified": total_verified
    }


# ========== Invoice Download Endpoint ==========

@router.get("/restaurant-invoices/{company_id}/download/{invoice_id}")
async def download_invoice(company_id: str, invoice_id: str):
    """Fatura dosyasını indir"""
    record = await db.restaurant_invoices.find_one({
        "company_id": company_id,
        "invoices.invoice_id": invoice_id
    })
    
    if not record:
        raise HTTPException(status_code=404, detail="Fatura bulunamadı")
    
    for inv in record.get("invoices", []):
        if inv["invoice_id"] == invoice_id:
            return {
                "file_data": inv["file_data"],
                "filename": inv["filename"],
                "extension": inv["extension"]
            }
    
    raise HTTPException(status_code=404, detail="Fatura dosyası bulunamadı")


# ========== Invoice Delete Endpoint ==========

@router.delete("/restaurant-invoices/{company_id}/invoice/{invoice_id}")
async def delete_invoice(company_id: str, invoice_id: str):
    """Faturayı sil"""
    record = await db.restaurant_invoices.find_one({
        "company_id": company_id,
        "invoices.invoice_id": invoice_id
    })
    
    if not record:
        raise HTTPException(status_code=404, detail="Fatura bulunamadı")
    
    # Faturayı listeden çıkar
    invoices = [inv for inv in record.get("invoices", []) if inv["invoice_id"] != invoice_id]
    
    if len(invoices) == 0:
        # Tüm faturalar silindi, kaydı da sil
        await db.restaurant_invoices.delete_one({"id": record["id"]})
    else:
        # Toplam onaylanan tutarı yeniden hesapla
        total_verified = sum(inv.get("verified_amount", 0) for inv in invoices if inv.get("verified"))
        
        await db.restaurant_invoices.update_one(
            {"id": record["id"]},
            {
                "$set": {
                    "invoices": invoices,
                    "verified_amount": total_verified,
                    "is_complete": total_verified > 0
                }
            }
        )
    
    return {"message": "Fatura silindi"}
