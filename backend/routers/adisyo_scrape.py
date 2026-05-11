"""
Adisyo Chrome Extension Scrape Entegrasyonu (AYRI)

Bu router, mevcut Adisyo webhook entegrasyonundan (`adisyo_webhook.py`)
TAMAMEN BAĞIMSIZDIR. Mevcut webhook'a, servis dosyasına ve auto-dispatch
flow'una dokunmaz; sadece kendi endpoint'i ile kendi mapping mantığını
kullanır.

Kullanım:
- Chrome Extension `app.adisyo.com` panelindeki `GetOrdersForList` response'larını
  intercept eder ve buraya POST'lar.
- Items (ürün listesi) çekilmez; her sipariş için tek satır "Adisyo Siparişi"
  oluşturulur (kullanıcı talebi).

Idempotency:
- `adisyo_order_id` (Adisyo internal `id`) unique anahtar olarak kullanılır.
- Aynı sipariş tekrar gelirse status güncellenir ancak kurye atanmışsa
  ezilmez (shiftjet_priority_statuses kontrolü).
"""
from fastapi import APIRouter, HTTPException, Depends
from pydantic import BaseModel, Field
from typing import List, Optional
from datetime import datetime, timezone, timedelta
import logging
import os
import uuid

from utils.database import db
from utils.helpers import get_turkey_now, ensure_turkey_timezone
from utils.jwt_utils import require_auth
from services.credit_service import insert_order
from services.integration_log_service import save_integration_log as _db_log

logger = logging.getLogger(__name__)

router = APIRouter(prefix="/api/adisyo-scrape", tags=["Adisyo Scrape (Chrome Ext)"])

TURKEY_TZ = timezone(timedelta(hours=3))

# Kurye atanmış / ileri statüde olan siparişlerin Adisyo status'u ile ezilmemesi için
SHIFTJET_PRIORITY_STATUSES = {"assigned", "confirmed", "on_the_way", "delivered", "cancelled"}

# Adisyo status_id mapping (GetOrdersForList'ten gelen 'status' alanı)
ADISYO_STATUS_MAP = {
    1: "preparing",
    2: "preparing",
    3: "ready",
    4: "on_the_way",
    5: "delivered",
    6: "cancelled",
}

# Adisyo externalAppId → human readable
ADISYO_EXTERNAL_APP_MAP = {
    15: "Trendyol Yemek",
    21: "YemekSepeti DeliveryHero",
    9: "Getir Yemek",
    23: "Migros Yemek",
    # Diğerleri eklenebilir
}


# ==================== Pydantic Modelleri ====================

class AdisyoScrapeOrder(BaseModel):
    """Adisyo panel `GetOrdersForList` response'undan bir order item"""
    id: int
    orderNumber: Optional[int] = None
    status: Optional[int] = None  # 1..6
    totalAmount: Optional[float] = 0
    paymentType: Optional[int] = None
    paymentTypeName: Optional[str] = ""
    externalAppId: Optional[int] = None
    insertDate: Optional[str] = None
    updateDate: Optional[str] = None
    restaurantCustomer: Optional[dict] = None
    paramObject: Optional[dict] = None

    class Config:
        extra = "allow"  # bilinmeyen alanları ignore et


class AdisyoScrapeBatch(BaseModel):
    """Eklentiden gelen toplu sipariş POST'u"""
    restaurant_id: str = Field(..., description="ShiftJet restoran UUID")
    orders: List[AdisyoScrapeOrder]


# ==================== Helpers ====================

def _parse_coordinate(coord_str: Optional[str]) -> tuple:
    """
    Adisyo paramObject.coordinate formatı: "37,726049|30,295048"
    Virgül ondalık ayırıcı, pipe lat/lng ayırıcı.
    Returns (lat, lng) veya (None, None)
    """
    if not coord_str or not isinstance(coord_str, str):
        return (None, None)
    try:
        parts = coord_str.split("|")
        if len(parts) != 2:
            return (None, None)
        lat = float(parts[0].strip().replace(",", "."))
        lng = float(parts[1].strip().replace(",", "."))
        return (lat, lng)
    except Exception:
        return (None, None)


def _map_payment_method(payment_type_id: Optional[int], payment_type_name: Optional[str]) -> dict:
    """
    Adisyo paymentTypeName → ShiftJet payment_method
    Mevcut webhook map_adisyo_payment ile benzer ama AYRI tutuluyor.
    """
    name_lower = (payment_type_name or "").lower()

    if "nakit" in name_lower or "cash" in name_lower:
        return {"method": "cash", "detail": None}

    # Online platformlar
    online_keywords = [
        "online", "çevrimiçi", "trendyol", "yemeksepeti", "ys ", "getir",
        "migros", "moneypay", "garantipay", "cüzdan",
    ]
    if any(k in name_lower for k in online_keywords):
        return {"method": "online", "detail": None}

    # Kapıda kart
    if ("kapıda" in name_lower or "kapida" in name_lower) and ("kart" in name_lower or "kredi" in name_lower):
        return {"method": "card", "detail": None}

    # Yemek kartı
    meal_card_keywords = ["multinet", "sodexo", "setcard", "metropol", "ticket", "edenred", "pluxee"]
    if any(k in name_lower for k in meal_card_keywords):
        return {"method": "meal_card", "detail": payment_type_name}

    # Kredi/Banka kartı genel
    if "kart" in name_lower or "kredi" in name_lower:
        return {"method": "card", "detail": None}

    return {"method": "online", "detail": payment_type_name}


def _build_customer_name(rc: Optional[dict]) -> str:
    if not rc:
        return "Müşteri"
    name = (rc.get("name") or "").strip()
    surname = (rc.get("surname") or "").strip()
    if surname and surname.lower() != "none":
        return f"{name} {surname}".strip() or "Müşteri"
    return name or "Müşteri"


def _build_customer_phone(rc: Optional[dict]) -> str:
    if not rc:
        return ""
    phone = (rc.get("phone") or "").strip()
    if not phone:
        return ""
    clean = phone.replace(" ", "").replace("-", "")
    # "/" ayırıcıyı virgül (DTMF pause) yap
    if "/" in clean:
        clean = clean.replace("/", ",")
    # 10 haneli ve 5 ile başlıyorsa başına 0
    digits_only = "".join(ch for ch in clean if ch.isdigit())
    if clean.startswith("5") and len(digits_only) == 10:
        clean = "0" + clean
    return clean


def _build_delivery_address(rc: Optional[dict]) -> tuple:
    """
    restaurantCustomer.address + .town birleştir.
    Notes da ayrıca toplanır.
    """
    if not rc:
        return ("Adres belirtilmemiş", "")
    address_parts = []
    if rc.get("address"):
        address_parts.append(rc["address"])
    if rc.get("town"):
        address_parts.append(rc["town"])
    delivery_address = ", ".join(filter(None, address_parts)) or "Adres belirtilmemiş"
    notes = (rc.get("note") or "").strip()
    return (delivery_address, notes)


def _convert_scraped_to_shiftjet(adisyo_item: dict, restaurant: dict) -> dict:
    """
    GetOrdersForList payload item → ShiftJet order dict
    NOT: items çekilmez (kullanıcı talebi). Tek satır oluşturulur.
    """
    rc = adisyo_item.get("restaurantCustomer") or {}
    param = adisyo_item.get("paramObject") or {}

    customer_name = _build_customer_name(rc)
    customer_phone = _build_customer_phone(rc)
    delivery_address, customer_note = _build_delivery_address(rc)

    delivery_lat, delivery_lng = _parse_coordinate(param.get("coordinate"))
    restaurant_location = {
        "latitude": restaurant.get("latitude"),
        "longitude": restaurant.get("longitude"),
    }
    delivery_location = {"latitude": delivery_lat, "longitude": delivery_lng}

    total = float(adisyo_item.get("totalAmount") or 0)

    payment_info = _map_payment_method(
        adisyo_item.get("paymentType"),
        adisyo_item.get("paymentTypeName"),
    )

    status_id = adisyo_item.get("status") or 1
    status = ADISYO_STATUS_MAP.get(status_id, "preparing")

    external_app_id = adisyo_item.get("externalAppId")
    external_app_name = ADISYO_EXTERNAL_APP_MAP.get(external_app_id, "Adisyo")

    # Items: tek satır toplam tutar (user talebi)
    items = [{
        "name": "Adisyo Siparişi",
        "quantity": 1,
        "price": total,
        "notes": "",
    }]

    # Taşıma ücreti hesabı için mevcut adisyo_service helper'larını kullanıyoruz
    from services.adisyo_service import calculate_restaurant_fee_internal
    restaurant_fee, restaurant_kdv = calculate_restaurant_fee_internal(
        restaurant, restaurant_location, delivery_location
    )

    insert_iso = adisyo_item.get("insertDate")
    # Adisyo GetOrdersForList endpoint'i insertDate'i timezone bilgisi olmadan
    # UTC olarak yolluyor (ör: "2026-05-11T12:37:00.000"). Bunu naive UTC kabul
    # edip TR (+03:00)'a çevirmemiz lazım, aksi halde sipariş 3 saat geri görünür.
    try:
        if insert_iso:
            iso_clean = str(insert_iso).strip()
            # Eğer timezone bilgisi yoksa Z (UTC) olarak işaretle
            if "+" not in iso_clean and not iso_clean.endswith("Z") and "-" not in iso_clean[-6:]:
                iso_clean = iso_clean + "Z"
            # Şimdi TR-aware datetime'a çevir
            _dt = datetime.fromisoformat(iso_clean.replace("Z", "+00:00"))
            created_at = _dt.astimezone(TURKEY_TZ).isoformat()
        else:
            created_at = get_turkey_now()
    except Exception:
        created_at = get_turkey_now()

    # Hazırlık süresi: webhook ile aynı mantık (NOW + prep_time).
    # Adisyo'nun insertDate'i geçmişte olabilir (geç aktarım) — bu yüzden NOW kullanılır,
    # böylece sipariş AgrosJet'e düştüğü ANDAN itibaren hazırlık geri sayımı başlar.
    # calculate_preparation_time burada async dışında olduğu için manuel hesap:
    standard_prep = int(restaurant.get("preparation_time", 15) or 15)
    # Ürün bazlı süre: scrape items minimal (tek satır), bilinmeyen ürün → ek 0
    # (webhook bile bilinmeyen ürün için 0 ek döner; standart süre yeter)
    prep_time = standard_prep
    now_tr = datetime.now(TURKEY_TZ)
    preparation_end_at = (now_tr + timedelta(minutes=prep_time)).isoformat()

    return {
        "id": str(uuid.uuid4()),
        "order_number": f"ADY-{adisyo_item.get('orderNumber', adisyo_item.get('id'))}",
        "adisyo_order_id": adisyo_item.get("id"),
        "external_app_id": external_app_id,
        "external_app_name": external_app_name,
        "company_id": restaurant.get("company_id"),
        "restaurant_id": restaurant.get("id"),
        "restaurant_name": restaurant.get("name"),
        "restaurant_phone": restaurant.get("phone"),
        "restaurant_location": restaurant_location,
        "customer_name": customer_name,
        "customer_phone": customer_phone,
        "delivery_address": delivery_address,
        "delivery_location": delivery_location,
        "items": items,
        "total_amount": total,
        "restaurant_fee": restaurant_fee,
        "restaurant_kdv": restaurant_kdv,
        "payment_method": payment_info["method"],
        "payment_method_detail": payment_info.get("detail"),
        "status": status,
        "preparation_time": prep_time,
        "preparation_end_at": preparation_end_at,
        "notes": customer_note,
        "source": "adisyo_scrape",  # mevcut "adisyo" webhook source'undan ayrı
        "created_at": created_at,
        "updated_at": get_turkey_now(),
        "courier_id": None,
        "courier_name": None,
    }


# ==================== Endpoints ====================

@router.post("/orders")
async def receive_scraped_orders(batch: AdisyoScrapeBatch, payload: dict = Depends(require_auth)):
    """
    Chrome Extension'dan toplu Adisyo siparişlerini al ve ShiftJet orders'a upsert et.

    Body:
      {
        "restaurant_id": "<ShiftJet restoran UUID>",
        "orders": [ ... GetOrdersForList items ... ]
      }

    Auth: Bearer token (admin / restoran kullanıcısı / kurye olabilir; herhangi geçerli token)
    """
    # 1) Restoran doğrulaması
    restaurant = await db.restaurants.find_one(
        {"id": batch.restaurant_id, "is_archived": {"$ne": True}},
        {"_id": 0}
    )
    if not restaurant:
        raise HTTPException(status_code=404, detail="Restoran bulunamadı")

    # 2) İstek atan kullanıcının bu restorana erişimi var mı?
    company_id = restaurant.get("company_id")
    role = (payload or {}).get("role")
    token_company = (payload or {}).get("company_id")
    token_restaurant = (payload or {}).get("restaurant_id")
    if role not in ("systemadmin", "superadmin"):
        if role == "restaurant":
            # Restoran user'ı sadece kendi restoranına post atabilir
            if token_restaurant and token_restaurant != batch.restaurant_id:
                raise HTTPException(status_code=403, detail="Bu restorana erişim yetkiniz yok")
        else:
            # Admin / kurye: aynı şirket olmalı
            if token_company and company_id and token_company != company_id:
                raise HTTPException(status_code=403, detail="Bu restorana erişim yetkiniz yok")

    created = 0
    updated = 0
    skipped = 0
    cancelled = 0
    errors = []

    for adisyo_item in batch.orders:
        item_dict = adisyo_item.dict()
        adisyo_order_id = item_dict.get("id")
        if not adisyo_order_id:
            continue

        try:
            existing = await db.orders.find_one(
                {"adisyo_order_id": adisyo_order_id, "source": "adisyo_scrape"},
                {"_id": 0}
            )

            converted = _convert_scraped_to_shiftjet(item_dict, restaurant)

            if existing:
                current_status = existing.get("status")
                # ShiftJet'te kurye atanmış/ileri statüdeyse iptal hariç ezme
                if current_status in SHIFTJET_PRIORITY_STATUSES and converted["status"] != "cancelled":
                    skipped += 1
                    continue
                if current_status == converted["status"]:
                    skipped += 1
                    continue
                await db.orders.update_one(
                    {"adisyo_order_id": adisyo_order_id, "source": "adisyo_scrape"},
                    {"$set": {
                        "status": converted["status"],
                        "updated_at": get_turkey_now(),
                    }}
                )
                if converted["status"] == "cancelled":
                    cancelled += 1
                else:
                    updated += 1
            else:
                # Eğer aynı adisyo_order_id mevcut "adisyo" webhook'tan eklenmişse 2. kez ekleme
                webhook_duplicate = await db.orders.find_one(
                    {"adisyo_order_id": adisyo_order_id, "source": "adisyo"},
                    {"_id": 0, "id": 1}
                )
                if webhook_duplicate:
                    skipped += 1
                    continue

                # İptal/teslim geçmişe ait siparişleri tekrar oluşturma
                if converted["status"] in ("cancelled", "delivered"):
                    skipped += 1
                    continue

                await insert_order(converted)
                created += 1
        except Exception as e:
            logger.exception(f"adisyo-scrape order işleme hatası id={adisyo_order_id}: {e}")
            errors.append({"id": adisyo_order_id, "error": str(e)[:200]})

    summary = {
        "created": created,
        "updated": updated,
        "skipped": skipped,
        "cancelled": cancelled,
        "errors": errors,
        "received": len(batch.orders),
    }
    try:
        await _db_log("adisyo_scrape", "INFO", f"Batch processed: {summary}")
    except Exception:
        pass
    return summary


@router.get("/restaurant/{restaurant_id}/info")
async def get_restaurant_info(restaurant_id: str, payload: dict = Depends(require_auth)):
    """
    Chrome Extension config sayfası için kullanılır.
    Restoran adı + company_id bilgisini döner (auth doğrulama da yapar).
    """
    restaurant = await db.restaurants.find_one(
        {"id": restaurant_id, "is_archived": {"$ne": True}},
        {"_id": 0, "id": 1, "name": 1, "company_id": 1}
    )
    if not restaurant:
        raise HTTPException(status_code=404, detail="Restoran bulunamadı")
    return restaurant


@router.get("/health")
async def health(payload: dict = Depends(require_auth)):
    """Eklentinin backend'e erişebildiğini doğrulamak için basit ping"""
    return {"ok": True, "service": "adisyo-scrape", "now": get_turkey_now()}


# Public download endpoint (auth GEREK YOK — eklenti zip dosyası)
public_router = APIRouter(prefix="/api/adisyo-scrape", tags=["Adisyo Scrape (Chrome Ext)"])


@public_router.get("/extension/download")
async def download_extension():
    """Chrome eklentisinin zip paketini indir (auth gerektirmez)"""
    from fastapi.responses import FileResponse
    zip_path = "/app/chrome_extension/agrosjet-adisyo-bridge.zip"
    if not os.path.exists(zip_path):
        raise HTTPException(status_code=404, detail="Eklenti paketi bulunamadı")
    return FileResponse(
        zip_path,
        media_type="application/zip",
        filename="agrosjet-adisyo-bridge.zip",
    )
