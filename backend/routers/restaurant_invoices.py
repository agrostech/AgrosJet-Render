"""
Restaurant Invoice System
Restoran fatura yönetimi - Haftalık bazda eksik fatura oluşturma, aylık görüntüleme
Cloudflare R2 entegrasyonu ile dosya depolama
"""
from fastapi import APIRouter, HTTPException, UploadFile, File, Form, Depends
from fastapi.responses import Response, StreamingResponse
from pydantic import BaseModel
from typing import Optional, List
from datetime import datetime, timezone, timedelta
import uuid
import base64
import re
import io
import zipfile
from pypdf import PdfWriter, PdfReader
from PIL import Image

from utils.database import db
from utils.helpers import get_turkey_now, ensure_turkey_timezone, TURKEY_TZ
from services.r2_storage import (
    upload_file_to_r2,
    download_file_from_r2,
    delete_file_from_r2,
    generate_presigned_url
)

from utils.jwt_utils import require_admin
router = APIRouter(prefix="/api", tags=["Restoran Faturaları"], dependencies=[Depends(require_admin)])

# R2 klasör prefix'i
R2_RESTAURANT_INVOICE_PREFIX = "RESTORAN_FATURALARI"

# Türkçe ay isimleri
TURKISH_MONTHS = {
    1: "Ocak", 2: "Subat", 3: "Mart", 4: "Nisan",
    5: "Mayis", 6: "Haziran", 7: "Temmuz", 8: "Agustos",
    9: "Eylul", 10: "Ekim", 11: "Kasim", 12: "Aralik"
}


def format_name_for_folder(name: str) -> str:
    """İsmi klasör için uygun formata çevir (Türkçe karakterler ve boşluklar)"""
    if not name:
        return "BILINMEYEN"
    # Türkçe karakterleri değiştir
    replacements = {
        'ğ': 'g', 'Ğ': 'G', 'ü': 'u', 'Ü': 'U',
        'ş': 's', 'Ş': 'S', 'ı': 'i', 'İ': 'I',
        'ö': 'o', 'Ö': 'O', 'ç': 'c', 'Ç': 'C'
    }
    for tr, en in replacements.items():
        name = name.replace(tr, en)
    # Sadece alfanumerik ve alt çizgi bırak
    name = re.sub(r'[^a-zA-Z0-9_]', '_', name)
    return name.upper()


def get_turkish_month_folder(date: datetime = None) -> str:
    """Türkçe ay klasör adı: 'Subat_2026'"""
    if date is None:
        date = datetime.now(timezone(timedelta(hours=3)))
    month_name = TURKISH_MONTHS[date.month]
    return f"{month_name}_{date.year}"


# ========== Models ==========

class InvoiceSettings(BaseModel):
    cash: bool = False           # Nakit
    credit_card: bool = False    # Kredi Kartı
    online: bool = False         # Online
    meal_card: bool = False      # Yemek Kartı
    online_meal_card: bool = False  # Online Yemek Kartı
    percentage: int = 10          # Yüzdelik dilim: 1, 10, 20
    percentage_name: str = "Yeme-İçme"  # Yüzdelik isim
    invoice_penalty_enabled: bool = False  # Eksik fatura cezası otomatik uygulansın mı


class InvoiceVerify(BaseModel):
    invoice_id: str
    amount: float
    admin_id: str
    admin_name: str


class AutoSettingsUpdate(BaseModel):
    enabled: bool


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


def get_weeks_in_month(year: int, month: int, opening_time: str, closing_time: str) -> List[dict]:
    """
    Bir ay içindeki hafta aralıklarını döndür.
    Haftalar Pazartesi açılış -> Pazartesi kapanış şeklinde.
    Türkiye saati (UTC+3) baz alınır.
    """
    open_h, open_m = map(int, opening_time.split(':'))
    close_h, close_m = map(int, closing_time.split(':'))
    
    # Türkiye timezone'u
    turkey_tz = timezone(timedelta(hours=3))
    
    # Ayın ilk günü (Türkiye saati)
    first_day = datetime(year, month, 1, tzinfo=turkey_tz)
    
    # Ayın son günü
    if month == 12:
        last_day = datetime(year + 1, 1, 1, tzinfo=turkey_tz) - timedelta(days=1)
    else:
        last_day = datetime(year, month + 1, 1, tzinfo=turkey_tz) - timedelta(days=1)
    
    # İlk günün haftasının pazartesisini bul
    days_since_monday = first_day.weekday()
    first_monday = first_day - timedelta(days=days_since_monday)
    first_monday = first_monday.replace(hour=open_h, minute=open_m, second=0, microsecond=0)
    
    weeks = []
    current_monday = first_monday
    
    while current_monday <= last_day:
        week_start = current_monday
        week_end = week_start + timedelta(days=7)
        week_end = week_end.replace(hour=close_h, minute=close_m, second=0, microsecond=0)
        
        # UTC'ye çevir (veritabanı sorguları için)
        week_start_utc = week_start.astimezone(timezone.utc)
        week_end_utc = week_end.astimezone(timezone.utc)
        
        weeks.append({
            "week_start": week_start_utc.isoformat(),
            "week_end": week_end_utc.isoformat(),
            "week_label": f"{week_start.strftime('%d.%m')} - {week_end.strftime('%d.%m')}"
        })
        
        current_monday = current_monday + timedelta(weeks=1)
    
    return weeks


# ========== Invoice Settings Endpoints ==========

@router.get("/restaurant-invoice-settings/{restaurant_id}")
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
        "online_meal_card": False,
        "percentage": 10,
        "percentage_name": "Yeme-İçme"
    })
    
    # Eski kayıtlar için yeni field'ların default değerlerini ekle
    if "percentage" not in settings:
        settings["percentage"] = 10
    if "percentage_name" not in settings:
        settings["percentage_name"] = "Yeme-İçme"
    if "invoice_penalty_enabled" not in settings:
        settings["invoice_penalty_enabled"] = False
    
    return {
        "restaurant_name": restaurant.get("name"),
        "settings": settings
    }


@router.put("/restaurant-invoice-settings/{restaurant_id}")
async def update_invoice_settings(restaurant_id: str, settings: InvoiceSettings):
    """Restoran fatura ayarlarını güncelle"""
    result = await db.restaurants.update_one(
        {"id": restaurant_id},
        {"$set": {"invoice_settings": settings.model_dump()}}
    )
    if result.matched_count == 0:
        raise HTTPException(status_code=404, detail="Restoran bulunamadı")
    
    return {"message": "Fatura ayarları güncellendi"}


# ========== Restaurants List Endpoint ==========

@router.get("/restaurant-invoices/{company_id}/restaurants")
async def get_restaurants_with_invoice_settings(company_id: str):
    """Fatura ayarı olan tüm restoranları getir"""
    restaurants = await db.restaurants.find(
        {
            "company_id": company_id,
            "is_archived": {"$ne": True},
            "invoice_settings": {"$exists": True}
        },
        {"_id": 0, "id": 1, "name": 1, "invoice_settings": 1}
    ).to_list(500)
    
    # Sadece en az bir ayarı açık olan restoranları filtrele
    filtered = []
    for r in restaurants:
        settings = r.get("invoice_settings", {})
        if any([settings.get("cash"), settings.get("credit_card"), settings.get("online"), 
                settings.get("meal_card"), settings.get("online_meal_card")]):
            filtered.append({
                "restaurant_id": r["id"],
                "restaurant_name": r["name"],
                "invoice_settings": settings
            })
    
    return filtered


# ========== All Missing Invoices Endpoint ====================

@router.get("/restaurant-invoices/{company_id}/missing")
async def get_all_missing_invoices(company_id: str):
    """
    Tüm zamanların eksik faturalarını getir.
    Haftalık bazda oluşturulmuş, tamamlanmamış tüm kayıtları döndürür.
    """
    # Fatura ayarı olan restoranları getir
    restaurants = await db.restaurants.find(
        {
            "company_id": company_id,
            "is_archived": {"$ne": True},
            "invoice_settings": {"$exists": True}
        },
        {"_id": 0}
    ).to_list(500)
    
    restaurant_map = {r["id"]: r for r in restaurants}
    
    # Tamamlanmamış fatura kayıtlarını getir
    incomplete_records = await db.restaurant_invoices.find(
        {
            "company_id": company_id,
            "is_complete": {"$ne": True}
        },
        {"_id": 0}
    ).sort("week_start", -1).to_list(500)
    
    missing_invoices = []
    
    for record in incomplete_records:
        restaurant = restaurant_map.get(record["restaurant_id"])
        if not restaurant:
            continue
        
        settings = restaurant.get("invoice_settings", {})
        
        missing_invoices.append({
            "record_id": record.get("id"),
            "restaurant_id": record["restaurant_id"],
            "restaurant_name": record.get("restaurant_name", restaurant.get("name")),
            "week_start": record["week_start"],
            "week_label": record.get("week_label", ""),
            "required_amount": record.get("required_amount", 0),
            "verified_amount": record.get("verified_amount", 0),
            "remaining_amount": record.get("required_amount", 0) - record.get("verified_amount", 0),
            "breakdown": record.get("breakdown", {}),
            "invoice_settings": settings,
            "invoices": record.get("invoices", [])
        })
    
    return missing_invoices


# ========== Upcoming Invoices Preview ====================

@router.get("/restaurant-invoices/{company_id}/upcoming-preview")
async def get_upcoming_invoices_preview(company_id: str):
    """
    Bir sonraki otomatik çalışmada oluşturulacak faturaların önizlemesini döndür.
    BU haftanın siparişlerini hesaplar (gelecek Pazartesi oluşturulacak faturalar).
    """
    opening_time, closing_time = await get_company_work_hours(company_id)
    
    # Bu haftanın başlangıcını hesapla (Pazartesi açılış saati)
    turkey_tz = timezone(timedelta(hours=3))
    now = datetime.now(turkey_tz)
    
    # Bu haftanın pazartesisini bul
    days_since_monday = now.weekday()  # 0 = Pazartesi
    this_monday = now - timedelta(days=days_since_monday)
    
    open_h, open_m = map(int, opening_time.split(':'))
    close_h, close_m = map(int, closing_time.split(':'))
    
    week_start_dt = this_monday.replace(hour=open_h, minute=open_m, second=0, microsecond=0)
    week_end_dt = week_start_dt + timedelta(days=7)
    week_end_dt = week_end_dt.replace(hour=close_h, minute=close_m, second=0, microsecond=0)
    
    week_label = f"{week_start_dt.strftime('%d.%m')} - {week_end_dt.strftime('%d.%m.%Y')}"
    week_start_iso = week_start_dt.isoformat()
    
    # Fatura ayarı olan restoranları getir
    restaurants = await db.restaurants.find(
        {
            "company_id": company_id,
            "is_archived": {"$ne": True},
            "invoice_settings": {"$exists": True}
        },
        {"_id": 0}
    ).to_list(500)
    
    # Sadece en az bir ayarı açık olan restoranları filtrele
    active_restaurants = []
    for r in restaurants:
        settings = r.get("invoice_settings", {})
        if any([settings.get("cash"), settings.get("credit_card"), settings.get("online"), 
                settings.get("meal_card"), settings.get("online_meal_card")]):
            active_restaurants.append(r)
    
    if not active_restaurants:
        return {
            "week_label": week_label,
            "week_start": week_start_iso,
            "previews": [],
            "total_amount": 0,
            "restaurant_count": 0
        }
    
    # Mevcut kayıtları kontrol et (zaten oluşturulmuş mu?)
    existing_records = await db.restaurant_invoices.find(
        {
            "company_id": company_id,
            "week_start": week_start_iso
        },
        {"_id": 0, "restaurant_id": 1}
    ).to_list(500)
    existing_restaurant_ids = {r["restaurant_id"] for r in existing_records}
    
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
                "total": {"$sum": "$total_amount"},
                "count": {"$sum": 1}
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
        count = item["count"] or 0
        
        if rid not in restaurant_totals:
            restaurant_totals[rid] = {
                "cash": 0,
                "credit_card": 0,
                "online": 0,
                "meal_card": 0,
                "online_meal_card": 0,
                "order_count": 0
            }
        
        restaurant_totals[rid]["order_count"] += count
        
        # Payment method mapping
        if payment in ["cash", "nakit"]:
            restaurant_totals[rid]["cash"] += total
        elif payment in ["credit_card", "kredi_karti", "pos", "card"]:
            restaurant_totals[rid]["credit_card"] += total
        elif payment in ["online", "online_odeme"]:
            restaurant_totals[rid]["online"] += total
        elif payment in ["meal_card", "yemek_karti"]:
            restaurant_totals[rid]["meal_card"] += total
        elif payment in ["online_meal_card", "online_yemek_karti"]:
            restaurant_totals[rid]["online_meal_card"] += total
    
    previews = []
    total_amount = 0
    
    for restaurant in active_restaurants:
        rid = restaurant["id"]
        
        # Zaten kayıt varsa atla
        if rid in existing_restaurant_ids:
            continue
        
        settings = restaurant.get("invoice_settings", {})
        totals = restaurant_totals.get(rid, {})
        
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
        
        previews.append({
            "restaurant_id": rid,
            "restaurant_name": restaurant["name"],
            "required_amount": required_amount,
            "breakdown": breakdown,
            "order_count": totals.get("order_count", 0),
            "invoice_settings": settings
        })
        total_amount += required_amount
    
    # Tutara göre sırala (en yüksek önce)
    previews.sort(key=lambda x: x["required_amount"], reverse=True)
    
    return {
        "week_label": week_label,
        "week_start": week_start_iso,
        "previews": previews,
        "total_amount": total_amount,
        "restaurant_count": len(previews)
    }


# ========== Generate Weekly Missing Invoices ====================

@router.post("/restaurant-invoices/{company_id}/generate-weekly")
async def generate_weekly_missing_invoices(company_id: str, week_start: str):
    """
    Belirli bir hafta için eksik fatura kayıtlarını oluştur.
    Bu endpoint haftalık cron job ile veya manuel çağrılabilir.
    """
    opening_time, closing_time = await get_company_work_hours(company_id)
    
    # Parse week_start
    week_start_dt = datetime.fromisoformat(week_start.replace('Z', '+00:00'))
    if week_start_dt.tzinfo is None:
        week_start_dt = week_start_dt.replace(tzinfo=timezone.utc)
    
    open_h, open_m = map(int, opening_time.split(':'))
    close_h, close_m = map(int, closing_time.split(':'))
    
    week_start_dt = week_start_dt.replace(hour=open_h, minute=open_m, second=0, microsecond=0)
    week_end_dt = week_start_dt + timedelta(days=7)
    week_end_dt = week_end_dt.replace(hour=close_h, minute=close_m, second=0, microsecond=0)
    
    week_label = f"{week_start_dt.strftime('%d.%m')} - {week_end_dt.strftime('%d.%m.%Y')}"
    
    # Fatura ayarı olan restoranları getir
    restaurants = await db.restaurants.find(
        {
            "company_id": company_id,
            "is_archived": {"$ne": True},
            "invoice_settings": {"$exists": True}
        },
        {"_id": 0}
    ).to_list(500)
    
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
        elif payment in ["credit_card", "kredi_karti", "pos", "card"]:
            restaurant_totals[rid]["credit_card"] += total
        elif payment in ["online", "online_odeme"]:
            restaurant_totals[rid]["online"] += total
        elif payment in ["meal_card", "yemek_karti"]:
            restaurant_totals[rid]["meal_card"] += total
        elif payment in ["online_meal_card", "online_yemek_karti"]:
            restaurant_totals[rid]["online_meal_card"] += total
    
    created_count = 0
    
    for restaurant in restaurants:
        rid = restaurant["id"]
        settings = restaurant.get("invoice_settings", {})
        totals = restaurant_totals.get(rid, {})
        
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
        
        # Mevcut kayıt var mı kontrol et
        existing = await db.restaurant_invoices.find_one({
            "company_id": company_id,
            "restaurant_id": rid,
            "week_start": week_start
        })
        
        if existing:
            continue  # Zaten var, atla
        
        # Yeni kayıt oluştur
        new_record = {
            "id": str(uuid.uuid4()),
            "company_id": company_id,
            "restaurant_id": rid,
            "restaurant_name": restaurant["name"],
            "week_start": week_start,
            "week_label": week_label,
            "required_amount": required_amount,
            "breakdown": breakdown,
            "invoices": [],
            "verified_amount": 0,
            "is_complete": False,
            "created_at": get_turkey_now()
        }
        await db.restaurant_invoices.insert_one(new_record)
        created_count += 1
    
    return {"message": f"{created_count} eksik fatura kaydı oluşturuldu", "count": created_count}


# ========== Month Invoices Endpoint ====================

@router.get("/restaurant-invoices/{company_id}/month/{year}/{month}")
async def get_month_invoices(company_id: str, year: int, month: int):
    """
    Belirli bir ay için yüklenen tüm faturaları getir.
    """
    # Ay başlangıç ve bitiş
    month_start = datetime(year, month, 1, tzinfo=timezone.utc)
    if month == 12:
        month_end = datetime(year + 1, 1, 1, tzinfo=timezone.utc)
    else:
        month_end = datetime(year, month + 1, 1, tzinfo=timezone.utc)
    
    # Bu ay yüklenen faturaları olan kayıtları getir
    records = await db.restaurant_invoices.find(
        {"company_id": company_id},
        {"_id": 0}
    ).to_list(1000)
    
    month_invoices = []
    
    for record in records:
        for inv in record.get("invoices", []):
            uploaded_at = inv.get("uploaded_at", "")
            if uploaded_at:
                try:
                    upload_date = datetime.fromisoformat(uploaded_at.replace('Z', '+00:00'))
                    if month_start <= upload_date < month_end:
                        # invoice_id veya id field'ını normalize et
                        inv_id = inv.get("invoice_id") or inv.get("id")
                        month_invoices.append({
                            **inv,
                            "invoice_id": inv_id,  # Her zaman invoice_id olarak döndür
                            "restaurant_id": record["restaurant_id"],
                            "restaurant_name": record.get("restaurant_name", ""),
                            "week_start": record["week_start"],
                            "week_label": record.get("week_label", ""),
                            "required_amount": record.get("required_amount", 0)
                        })
                except Exception:
                    pass
    
    # Tarihe göre sırala (en yeni en üstte)
    month_invoices.sort(key=lambda x: x.get("uploaded_at", ""), reverse=True)
    
    return month_invoices


# ========== Restaurant Month Invoices Endpoint ====================

@router.get("/restaurant-invoices/{company_id}/restaurant/{restaurant_id}/month/{year}/{month}")
async def get_restaurant_month_invoices(company_id: str, restaurant_id: str, year: int, month: int):
    """
    Belirli bir restoran için belirli bir aydaki faturaları getir.
    """
    # Ay başlangıç ve bitiş
    month_start = datetime(year, month, 1, tzinfo=timezone.utc)
    if month == 12:
        month_end = datetime(year + 1, 1, 1, tzinfo=timezone.utc)
    else:
        month_end = datetime(year, month + 1, 1, tzinfo=timezone.utc)
    
    # Restoranın kayıtlarını getir
    records = await db.restaurant_invoices.find(
        {
            "company_id": company_id,
            "restaurant_id": restaurant_id
        },
        {"_id": 0}
    ).to_list(100)
    
    invoices = []
    total_required = 0
    total_verified = 0
    
    for record in records:
        # Hafta bu ay içinde mi?
        week_start = record.get("week_start", "")
        try:
            week_date = datetime.fromisoformat(week_start.replace('Z', '+00:00'))
            if month_start <= week_date < month_end:
                total_required += record.get("required_amount", 0)
                total_verified += record.get("verified_amount", 0)
                
                for inv in record.get("invoices", []):
                    # invoice_id veya id field'ını normalize et
                    inv_id = inv.get("invoice_id") or inv.get("id")
                    invoices.append({
                        **inv,
                        "invoice_id": inv_id,  # Her zaman invoice_id olarak döndür
                        "week_start": week_start,
                        "week_label": record.get("week_label", ""),
                        "record_required_amount": record.get("required_amount", 0)
                    })
        except Exception:
            pass
    
    # Tarihe göre sırala
    invoices.sort(key=lambda x: x.get("uploaded_at", ""), reverse=True)
    
    return {
        "invoices": invoices,
        "total_required": total_required,
        "total_verified": total_verified,
        "total_remaining": total_required - total_verified
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
    """Restoran faturası yükle - Cloudflare R2'ye kaydet"""
    # Dosya boyutu kontrolü (10MB)
    content = await file.read()
    if len(content) > 10 * 1024 * 1024:
        raise HTTPException(status_code=413, detail="Dosya boyutu 10MB'ı aşamaz")
    
    # Dosya uzantısı
    extension = file.filename.split(".")[-1].lower() if file.filename and "." in file.filename else "pdf"
    
    invoice_id = str(uuid.uuid4())
    turkey_tz = timezone(timedelta(hours=3))
    now = datetime.now(turkey_tz)
    
    # Şirket ve restoran adını al
    company = await db.companies.find_one({"id": company_id}, {"_id": 0, "name": 1})
    restaurant = await db.restaurants.find_one({"id": restaurant_id}, {"_id": 0, "name": 1})
    
    company_name = company["name"] if company else "Sirket"
    restaurant_name = restaurant["name"] if restaurant else "Restoran"
    
    company_folder = format_name_for_folder(company_name)
    restaurant_folder = format_name_for_folder(restaurant_name)
    month_folder = get_turkish_month_folder(now)
    
    # Hafta bitiş tarihini hesapla (week_start + 7 gün)
    try:
        week_start_dt = datetime.fromisoformat(week_start.replace('Z', '+00:00'))
        week_end_dt = week_start_dt + timedelta(days=7)
        week_end_str = week_end_dt.strftime('%d.%m')
    except (ValueError, TypeError):
        week_end_str = "00.00"
    
    # Dosya adı formatı: ŞirketAdı-RestoranAdı-HaftaBitiş.pdf
    # Örnek: AgrosJet-LezzetDuragi-02.03.pdf
    safe_company = format_name_for_folder(company_name).replace("_", "")
    safe_restaurant = format_name_for_folder(restaurant_name).replace("_", "")
    filename = f"{safe_company}-{safe_restaurant}-{week_end_str}.{extension}"
    
    # R2 Key: RESTORAN_FATURALARI/SIRKET_ADI/RESTORAN_ADI/Subat_2026/dosya.pdf
    r2_key = f"{R2_RESTAURANT_INVOICE_PREFIX}/{company_folder}/{restaurant_folder}/{month_folder}/{filename}"
    content_type = "application/pdf" if extension == "pdf" else f"image/{extension}"
    
    upload_result = await upload_file_to_r2(content, r2_key, content_type)
    
    if not upload_result.get("success"):
        raise HTTPException(status_code=503, detail="Dosya depolama servisi (Cloudflare R2) yapılandırılmamış. Sistem ayarlarından R2 bağlantısını yapın.")
    
    # R2'de başarıyla kaydedildi
    invoice_entry = {
        "invoice_id": invoice_id,
        "filename": filename,
        "extension": extension,
        "r2_key": r2_key,
        "storage_type": "r2",
        "uploaded_at": now.isoformat(),
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
    # Fatura kaydını bul (hem invoice_id hem id field'ını kontrol et)
    record = await db.restaurant_invoices.find_one({
        "company_id": company_id,
        "$or": [
            {"invoices.invoice_id": data.invoice_id},
            {"invoices.id": data.invoice_id}
        ]
    })
    
    if not record:
        raise HTTPException(status_code=404, detail="Fatura bulunamadı")
    
    # Faturayı güncelle
    invoices = record.get("invoices", [])
    turkey_tz = timezone(timedelta(hours=3))
    
    for inv in invoices:
        # Her iki field'ı da kontrol et
        if inv.get("invoice_id") == data.invoice_id or inv.get("id") == data.invoice_id:
            inv["verified"] = True
            inv["verified_amount"] = data.amount
            inv["verified_at"] = datetime.now(turkey_tz).isoformat()
            inv["verified_by_admin_id"] = data.admin_id
            inv["verified_by_admin_name"] = data.admin_name
            break
    
    # Toplam onaylanan tutarı hesapla
    total_verified = sum(inv.get("verified_amount", 0) for inv in invoices if inv.get("verified"))
    required_amount = record.get("required_amount", 0)
    is_complete = total_verified >= required_amount
    
    await db.restaurant_invoices.update_one(
        {"id": record["id"]},
        {
            "$set": {
                "invoices": invoices,
                "verified_amount": total_verified,
                "is_complete": is_complete
            }
        }
    )
    
    return {
        "message": "Fatura onaylandı",
        "verified_amount": data.amount,
        "total_verified": total_verified,
        "is_complete": is_complete
    }


# ========== Invoice Download Endpoint ==========

@router.get("/restaurant-invoices/{company_id}/download/{invoice_id}")
async def download_invoice(company_id: str, invoice_id: str):
    """Fatura dosyasını indir - R2 veya base64'ten"""
    # İlk olarak invoice_id ile ara
    record = await db.restaurant_invoices.find_one({
        "company_id": company_id,
        "$or": [
            {"invoices.invoice_id": invoice_id},
            {"invoices.id": invoice_id}
        ]
    })
    
    if not record:
        raise HTTPException(status_code=404, detail="Fatura bulunamadı")
    
    for inv in record.get("invoices", []):
        # Her iki field'ı da kontrol et
        if inv.get("invoice_id") == invoice_id or inv.get("id") == invoice_id:
            # R2'den mi base64'ten mi?
            storage_type = inv.get("storage_type", "base64")
            
            if storage_type == "r2" and inv.get("r2_key"):
                # R2'den indir
                file_content = await download_file_from_r2(inv["r2_key"])
                if file_content:
                    file_data = base64.b64encode(file_content).decode("utf-8")
                    return {
                        "file_data": file_data,
                        "filename": inv["filename"],
                        "extension": inv["extension"]
                    }
                else:
                    raise HTTPException(status_code=404, detail="Dosya R2'de bulunamadı")
            else:
                # Base64 olarak kayıtlı
                return {
                    "file_data": inv.get("file_data", ""),
                    "filename": inv["filename"],
                    "extension": inv["extension"]
                }
    
    raise HTTPException(status_code=404, detail="Fatura dosyası bulunamadı")


# ========== Invoice Delete Endpoint ==========

@router.delete("/restaurant-invoices/{company_id}/invoice/{invoice_id}")
async def delete_invoice(company_id: str, invoice_id: str):
    """Faturayı sil - R2'den de sil"""
    record = await db.restaurant_invoices.find_one({
        "company_id": company_id,
        "$or": [
            {"invoices.invoice_id": invoice_id},
            {"invoices.id": invoice_id}
        ]
    })
    
    if not record:
        raise HTTPException(status_code=404, detail="Fatura bulunamadı")
    
    # Silinecek faturayı bul ve R2'den sil
    for inv in record.get("invoices", []):
        if inv.get("invoice_id") == invoice_id or inv.get("id") == invoice_id:
            if inv.get("storage_type") == "r2" and inv.get("r2_key"):
                await delete_file_from_r2(inv["r2_key"])
            break
    
    # Faturayı listeden çıkar (her iki field'ı da kontrol et)
    invoices = [inv for inv in record.get("invoices", []) if inv.get("invoice_id") != invoice_id and inv.get("id") != invoice_id]
    
    if len(invoices) == 0:
        # Tüm faturalar silindi, kaydı da sil
        await db.restaurant_invoices.delete_one({"id": record["id"]})
    else:
        # Toplam onaylanan tutarı yeniden hesapla
        total_verified = sum(inv.get("verified_amount", 0) for inv in invoices if inv.get("verified"))
        required_amount = record.get("required_amount", 0)
        
        await db.restaurant_invoices.update_one(
            {"id": record["id"]},
            {
                "$set": {
                    "invoices": invoices,
                    "verified_amount": total_verified,
                    "is_complete": total_verified >= required_amount
                }
            }
        )
    
    return {"message": "Fatura silindi"}


# ========== Bulk Download ZIP Endpoint ==========

class BulkDownloadRequest(BaseModel):
    invoice_ids: List[str]


@router.post("/restaurant-invoices/{company_id}/download-zip")
async def download_invoices_merged_pdf(company_id: str, data: BulkDownloadRequest):
    """Seçili faturaları tek bir birleştirilmiş PDF olarak indir (kapak + sayfa numarası)"""
    from utils.pdf_utils import create_cover_page, add_page_numbers, get_logo_bytes

    if not data.invoice_ids:
        raise HTTPException(status_code=400, detail="En az bir fatura seçin")
    
    # Faturaları bul
    records = await db.restaurant_invoices.find(
        {"company_id": company_id},
        {"_id": 0}
    ).to_list(1000)
    
    # Get company info for cover page
    logo_bytes = None
    company_name = ""
    company = await db.companies.find_one({"id": company_id}, {"_id": 0, "name": 1, "logo_light": 1})
    if company:
        company_name = company.get("name", "")
        logo_bytes = get_logo_bytes(company.get("logo_light", ""))

    writer = PdfWriter()
    
    for record in records:
        for inv in record.get("invoices", []):
            inv_id = inv.get("invoice_id") or inv.get("id")
            if inv_id not in data.invoice_ids:
                continue
            
            file_content = None
            storage_type = inv.get("storage_type", "base64")
            
            if storage_type == "r2" and inv.get("r2_key"):
                file_content = await download_file_from_r2(inv["r2_key"])
            elif inv.get("file_data"):
                file_content = base64.b64decode(inv["file_data"])
            
            if not file_content:
                continue
            
            filename = inv.get("filename", "").lower()
            try:
                if filename.endswith(".pdf"):
                    reader = PdfReader(io.BytesIO(file_content))
                    for page in reader.pages:
                        writer.add_page(page)
                else:
                    img = Image.open(io.BytesIO(file_content))
                    if img.mode in ("RGBA", "P"):
                        img = img.convert("RGB")
                    img_pdf_buffer = io.BytesIO()
                    img.save(img_pdf_buffer, format="PDF")
                    img_pdf_buffer.seek(0)
                    reader = PdfReader(img_pdf_buffer)
                    for page in reader.pages:
                        writer.add_page(page)
            except Exception as e:
                print(f"Fatura birleştirme hatası ({filename}): {e}")
                continue
    
    if len(writer.pages) == 0:
        raise HTTPException(status_code=404, detail="Birleştirilebilecek fatura bulunamadı")
    
    turkey_tz = timezone(timedelta(hours=3))
    now = datetime.now(turkey_tz)
    month_name = TURKISH_MONTHS[now.month]

    # Create cover page
    cover_buf = create_cover_page(
        title="Restoran Faturaları",
        subtitle=f"{company_name} - {month_name} {now.year}",
        logo_bytes=logo_bytes,
        invoice_count=len(data.invoice_ids),
        generated_date=now.strftime("%d.%m.%Y %H:%M"),
    )
    cover_reader = PdfReader(cover_buf)

    # Build final: cover + content pages
    final_writer = PdfWriter()
    for page in cover_reader.pages:
        final_writer.add_page(page)
    for page in writer.pages:
        final_writer.add_page(page)

    # Add page numbers
    add_page_numbers(final_writer)

    pdf_buffer = io.BytesIO()
    final_writer.write(pdf_buffer)
    pdf_buffer.seek(0)
    pdf_content = pdf_buffer.getvalue()
    
    pdf_filename = f"Restoran{month_name}Faturalar.pdf"
    
    return {
        "pdf_data": base64.b64encode(pdf_content).decode("utf-8"),
        "filename": pdf_filename
    }


# ========== Delete Missing Invoice Record Endpoint ==========

@router.delete("/restaurant-invoices/{company_id}/missing/{record_id}")
async def delete_missing_invoice_record(company_id: str, record_id: str):
    """
    Eksik fatura kaydını tamamen sil.
    Bu işlem sadece superadmin tarafından yapılabilir.
    R2'deki dosyalar da silinir.
    """
    record = await db.restaurant_invoices.find_one({
        "id": record_id,
        "company_id": company_id
    })
    
    if not record:
        raise HTTPException(status_code=404, detail="Kayıt bulunamadı")
    
    # R2'deki dosyaları sil
    for inv in record.get("invoices", []):
        if inv.get("storage_type") == "r2" and inv.get("r2_key"):
            await delete_file_from_r2(inv["r2_key"])
    
    # Kaydı sil
    await db.restaurant_invoices.delete_one({"id": record_id})
    
    return {"message": "Eksik fatura kaydı silindi"}


# ========== Auto Settings Endpoints ==========

@router.get("/restaurant-invoices/{company_id}/auto-settings")
async def get_auto_settings(company_id: str):
    """Otomatik eksik fatura oluşturma ayarlarını getir"""
    settings = await db.restaurant_invoice_settings.find_one(
        {"company_id": company_id},
        {"_id": 0}
    )
    
    return {
        "enabled": settings.get("enabled", False) if settings else False,
        "last_auto_run": settings.get("last_auto_run") if settings else None
    }


@router.put("/restaurant-invoices/{company_id}/auto-settings")
async def update_auto_settings(company_id: str, data: AutoSettingsUpdate):
    """Otomatik eksik fatura oluşturma ayarlarını güncelle"""
    await db.restaurant_invoice_settings.update_one(
        {"company_id": company_id},
        {
            "$set": {
                "company_id": company_id,
                "enabled": data.enabled,
                "updated_at": get_turkey_now()
            }
        },
        upsert=True
    )
    
    return {"success": True, "enabled": data.enabled}


@router.delete("/restaurant-invoices/{company_id}/clear-all")
async def clear_all_restaurant_invoices(company_id: str):
    """Şirkete ait tüm eksik fatura kayıtlarını sil (Test için)"""
    result = await db.restaurant_invoices.delete_many({"company_id": company_id})
    
    return {
        "message": "Tüm eksik fatura kayıtları silindi",
        "deleted_count": result.deleted_count
    }
