"""
Kesilen Faturalar (Issued Invoices) API
- Haftalık restoran bazlı taşıma ücreti ve KDV hesaplama
- Fatura yükleme ve görüntüleme
- Cloudflare R2 entegrasyonu
"""
from fastapi import APIRouter, HTTPException, UploadFile, File, Form, Depends
from typing import Optional, List
from datetime import datetime, timezone, timedelta
import uuid
import base64
import re

from utils.database import db
from services.r2_storage import (
    upload_file_to_r2,
    download_file_from_r2,
    delete_file_from_r2
)

from utils.jwt_utils import require_admin
router = APIRouter(prefix="/api/issued-invoices", tags=["Kesilen Faturalar"], dependencies=[Depends(require_admin)])

# R2 klasör prefix'i
R2_ISSUED_INVOICE_PREFIX = "KESILEN_FATURALAR"


# ========== Helpers ==========

def format_name_for_file(name: str) -> str:
    """İsmi dosya için uygun formata çevir (Türkçe karakterler)"""
    if not name:
        return "Bilinmeyen"
    replacements = {
        'ğ': 'g', 'Ğ': 'G', 'ü': 'u', 'Ü': 'U',
        'ş': 's', 'Ş': 'S', 'ı': 'i', 'İ': 'I',
        'ö': 'o', 'Ö': 'O', 'ç': 'c', 'Ç': 'C',
        ' ': ''
    }
    for tr, en in replacements.items():
        name = name.replace(tr, en)
    # Sadece alfanumerik karakterler bırak
    name = re.sub(r'[^a-zA-Z0-9]', '', name)
    return name


async def get_company_work_hours(company_id: str) -> tuple:
    """Şirket açılış/kapanış saatlerini getir"""
    company = await db.companies.find_one(
        {"id": company_id},
        {"_id": 0, "opening_time": 1, "closing_time": 1}
    )
    if not company:
        return "06:00", "06:00"
    return company.get("opening_time", "06:00"), company.get("closing_time", "06:00")


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
    Restoran pricing ayarları kullanılarak dinamik hesaplama yapılır.
    """
    import math
    
    # Mesafe hesaplama fonksiyonu
    def calculate_distance(loc1, loc2):
        if not loc1 or not loc2:
            return 0.0
        lat1 = loc1.get("latitude") or loc1.get("lat") or 0
        lng1 = loc1.get("longitude") or loc1.get("lng") or 0
        lat2 = loc2.get("latitude") or loc2.get("lat") or 0
        lng2 = loc2.get("longitude") or loc2.get("lng") or 0
        if not all([lat1, lng1, lat2, lng2]):
            return 0.0
        R = 6371
        dLat = math.radians(lat2 - lat1)
        dLon = math.radians(lng2 - lng1)
        a = math.sin(dLat/2) ** 2 + math.cos(math.radians(lat1)) * math.cos(math.radians(lat2)) * math.sin(dLon/2) ** 2
        c = 2 * math.atan2(math.sqrt(a), math.sqrt(1-a))
        return R * c
    
    # Ücret hesaplama fonksiyonu
    def calculate_fee_from_pricing(pricing_type, per_package_price, km_ranges, distance_km):
        if pricing_type == "per_package":
            return per_package_price or 0.0
        elif pricing_type == "per_km" and km_ranges:
            for km_range in km_ranges:
                min_km = km_range.get("min_km", 0)
                max_km = km_range.get("max_km")
                price = km_range.get("price", 0)
                if max_km is None:
                    if distance_km >= min_km:
                        return price
                else:
                    if min_km <= distance_km < max_km:
                        return price
        return 0.0
    
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
            "restaurant_fee": 1,
            "total_amount": 1,
            "restaurant_location": 1,
            "delivery_location": 1
        }
    )
    orders = await orders_cursor.to_list(10000)
    
    # Restoran bilgilerini getir (pricing ve kdv_rate dahil)
    restaurant_ids = list(set(o.get("restaurant_id") for o in orders if o.get("restaurant_id")))
    restaurants_map = {}
    if restaurant_ids:
        restaurants = await db.restaurants.find(
            {"id": {"$in": restaurant_ids}},
            {"_id": 0, "id": 1, "name": 1, "pricing_type": 1, "per_package_price": 1, "km_ranges": 1, "kdv_rate": 1}
        ).to_list(500)
        restaurants_map = {r["id"]: r for r in restaurants}
    
    # Şirket varsayılan KDV oranı
    company = await db.companies.find_one(
        {"id": company_id},
        {"_id": 0, "vat_rate": 1}
    )
    default_kdv_rate = company.get("vat_rate", 10) if company else 10
    
    # Restoran bazlı toplamları hesapla
    restaurant_totals = {}
    for order in orders:
        rid = order.get("restaurant_id")
        if not rid:
            continue
        
        rest_info = restaurants_map.get(rid, {})
        
        if rid not in restaurant_totals:
            # Restoran KDV oranı - restoranda tanımlıysa onu kullan
            rest_kdv_rate = rest_info.get("kdv_rate") if rest_info.get("kdv_rate") is not None else default_kdv_rate
            restaurant_totals[rid] = {
                "restaurant_id": rid,
                "restaurant_name": rest_info.get("name", "İsimsiz Restoran"),
                "order_count": 0,
                "total_delivery_fee": 0,
                "total_amount": 0,
                "kdv_rate": rest_kdv_rate,
                "pricing_type": rest_info.get("pricing_type", "per_package"),
                "per_package_price": rest_info.get("per_package_price", 0),
                "km_ranges": rest_info.get("km_ranges", [])
            }
        
        # Taşıma ücreti - önce siparişte kayıtlı değere bak
        order_delivery_fee = order.get("delivery_fee") or order.get("restaurant_fee") or 0
        
        # Eğer siparişte ücret yoksa, restoran ayarlarından hesapla
        rest_data = restaurant_totals[rid]
        if order_delivery_fee == 0 and (rest_data["per_package_price"] > 0 or rest_data["km_ranges"]):
            distance_km = calculate_distance(
                order.get("restaurant_location"),
                order.get("delivery_location")
            )
            order_delivery_fee = calculate_fee_from_pricing(
                rest_data["pricing_type"],
                rest_data["per_package_price"],
                rest_data["km_ranges"],
                distance_km
            )
        
        restaurant_totals[rid]["order_count"] += 1
        restaurant_totals[rid]["total_delivery_fee"] += order_delivery_fee
        restaurant_totals[rid]["total_amount"] += order.get("total_amount", 0) or 0
    
    # Sonuç listesi oluştur
    result = []
    for rid, data in restaurant_totals.items():
        # Restoran bazlı KDV hesapla
        kdv_rate = data["kdv_rate"] / 100  # yüzdeyi orana çevir
        kdv = data["total_delivery_fee"] * kdv_rate
        
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
            "restaurant_id": data["restaurant_id"],
            "restaurant_name": data["restaurant_name"],
            "order_count": data["order_count"],
            "total_delivery_fee": round(data["total_delivery_fee"], 2),
            "total_amount": round(data["total_amount"], 2),
            "kdv_rate": data["kdv_rate"],
            "kdv": round(kdv, 2),
            "total_with_kdv": round(data["total_delivery_fee"] + kdv, 2),
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
            "total_delivery_fee": round(total_delivery_fee, 2),
            "total_kdv": round(total_kdv, 2),
            "total_with_kdv": round(total_delivery_fee + total_kdv, 2)
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
    """Fatura yükle - Cloudflare R2'ye kaydet"""
    # Dosya boyutu kontrolü (10MB)
    contents = await file.read()
    if len(contents) > 10 * 1024 * 1024:
        raise HTTPException(status_code=413, detail="Dosya boyutu 10MB'ı geçemez")
    
    # Dosya tipi kontrolü
    allowed_extensions = ["pdf", "png", "jpg", "jpeg"]
    ext = file.filename.split(".")[-1].lower() if "." in file.filename else ""
    if ext not in allowed_extensions:
        raise HTTPException(status_code=400, detail="Sadece PDF ve resim dosyaları kabul edilir")
    
    # Şirket ve restoran bilgilerini al
    company = await db.companies.find_one({"id": company_id}, {"_id": 0, "name": 1})
    restaurant = await db.restaurants.find_one({"id": restaurant_id}, {"_id": 0, "name": 1})
    
    company_name = company["name"] if company else "Sirket"
    restaurant_name = restaurant["name"] if restaurant else "Restoran"
    
    # Hafta bitiş tarihini week_label'dan çıkar (örn: "23.02 - 02.03.2026" -> "02.03")
    try:
        week_end_str = week_label.split(" - ")[1].split(".")[0] + "." + week_label.split(" - ")[1].split(".")[1]
    except (IndexError, ValueError):
        week_end_str = "00.00"
    
    # Dosya adı formatı: ŞirketAdı-RestoranAdı-HaftaBitiş.pdf
    # Örnek: AgrosJet-LezzetDuragi-02.03.pdf
    safe_company = format_name_for_file(company_name)
    safe_restaurant = format_name_for_file(restaurant_name)
    filename = f"{safe_company}-{safe_restaurant}-{week_end_str}.{ext}"
    
    # Mevcut faturayı kontrol et
    existing = await db.issued_invoices.find_one({
        "company_id": company_id,
        "restaurant_id": restaurant_id,
        "week_start": week_start
    })
    
    invoice_id = existing.get("id") if existing else str(uuid.uuid4())
    turkey_tz = timezone(timedelta(hours=3))
    now = datetime.now(turkey_tz)
    
    # R2'ye yükle
    month_folder = f"{['Ocak','Subat','Mart','Nisan','Mayis','Haziran','Temmuz','Agustos','Eylul','Ekim','Kasim','Aralik'][now.month-1]}_{now.year}"
    r2_key = f"{R2_ISSUED_INVOICE_PREFIX}/{format_name_for_file(company_name).upper()}/{format_name_for_file(restaurant_name).upper()}/{month_folder}/{filename}"
    
    content_type = "application/pdf" if ext == "pdf" else f"image/{ext}"
    upload_result = await upload_file_to_r2(contents, r2_key, content_type)
    
    if not upload_result.get("success"):
        raise HTTPException(status_code=503, detail="Dosya depolama servisi (Cloudflare R2) yapılandırılmamış. Sistem ayarlarından R2 bağlantısını yapın.")
    
    invoice_data = {
        "id": invoice_id,
        "company_id": company_id,
        "restaurant_id": restaurant_id,
        "week_start": week_start,
        "week_label": week_label,
        "filename": filename,
        "r2_key": r2_key,
        "storage_type": "r2",
        "file_extension": ext,
        "uploaded_at": now.isoformat(),
        "uploaded_by_id": admin_id,
        "uploaded_by_name": admin_name
    }
    
    await db.issued_invoices.update_one(
        {"id": invoice_id},
        {"$set": invoice_data},
        upsert=True
    )
    
    return {"success": True, "invoice_id": invoice_id, "filename": filename}


@router.get("/{company_id}/download/{invoice_id}")
async def download_invoice(company_id: str, invoice_id: str):
    """Fatura indir/görüntüle - R2 veya base64'ten"""
    invoice = await db.issued_invoices.find_one(
        {"id": invoice_id, "company_id": company_id},
        {"_id": 0}
    )
    
    if not invoice:
        raise HTTPException(status_code=404, detail="Fatura bulunamadı")
    
    # R2'den mi base64'ten mi?
    storage_type = invoice.get("storage_type", "base64")
    
    if storage_type == "r2" and invoice.get("r2_key"):
        file_content = await download_file_from_r2(invoice["r2_key"])
        if file_content:
            file_data = base64.b64encode(file_content).decode("utf-8")
            return {
                "filename": invoice.get("filename"),
                "file_data": file_data,
                "extension": invoice.get("file_extension", "pdf")
            }
        else:
            raise HTTPException(status_code=404, detail="Dosya R2'de bulunamadı")
    else:
        return {
            "filename": invoice.get("filename"),
            "file_data": invoice.get("file_data", ""),
            "extension": invoice.get("file_extension", "pdf")
        }


@router.delete("/{company_id}/invoice/{invoice_id}")
async def delete_invoice(company_id: str, invoice_id: str):
    """Fatura sil - R2'den de sil"""
    invoice = await db.issued_invoices.find_one(
        {"id": invoice_id, "company_id": company_id},
        {"_id": 0}
    )
    
    if not invoice:
        raise HTTPException(status_code=404, detail="Fatura bulunamadı")
    
    # R2'den sil
    if invoice.get("storage_type") == "r2" and invoice.get("r2_key"):
        await delete_file_from_r2(invoice["r2_key"])
    
    result = await db.issued_invoices.delete_one({
        "id": invoice_id,
        "company_id": company_id
    })
    
    if result.deleted_count == 0:
        raise HTTPException(status_code=404, detail="Fatura bulunamadı")
    
    return {"success": True}
