"""
Konum Düzeltme Sistemi API

- Teslim edilmiş Adisyo/SepetTakip/Manuel siparişleri listeler
- Admin harita üzerinden konum düzeltmesi yapabilir
- Düzeltilen konumlar address_corrections collection'ına kaydedilir
- Yeni siparişlerde aynı müşteri+adres eşleşirse otomatik konum atanır
"""

from fastapi import APIRouter, HTTPException, Depends
from pydantic import BaseModel
from typing import Optional
from datetime import datetime, timezone, timedelta
import logging

from utils.database import db
from utils.jwt_utils import require_admin

router = APIRouter(prefix="/api/location-corrections", tags=["Location Corrections"])
logger = logging.getLogger(__name__)

TURKEY_TZ = timezone(timedelta(hours=3))


class LocationCorrectionRequest(BaseModel):
    latitude: float
    longitude: float


# ==================== LIST ORDERS FOR CORRECTION ====================

@router.get("/{company_id}/orders")
async def get_orders_for_correction(
    company_id: str,
    limit: int = 500,
    search: str = None,
    auth: dict = Depends(require_admin),
):
    """Son X teslim edilmiş Adisyo/SepetTakip/Manuel sipariş (konum düzeltme için)
    Marketplace siparişleri (yemeksepeti, trendyol, getir, migros) hariç tutulur.
    """
    # Marketplace dışı siparişler
    marketplace_apps = ["yemeksepeti", "ys", "trendyol", "getir", "migros"]
    
    query = {
        "company_id": company_id,
        "status": "delivered",
        "source": {"$in": ["adisyo", "sepettakip", "manual", None]},
    }

    if search:
        query["$or"] = [
            {"customer_name": {"$regex": search, "$options": "i"}},
            {"delivery_address": {"$regex": search, "$options": "i"}},
        ]

    orders_raw = await db.orders.find(
        query,
        {
            "_id": 0, "id": 1, "customer_name": 1, "delivery_address": 1,
            "delivery_location": 1, "restaurant_name": 1, "source": 1,
            "external_app_name": 1, "created_at": 1, "location_corrected": 1,
        }
    ).sort("created_at", -1).limit(limit * 2).to_list(limit * 2)

    # Marketplace siparişlerini filtrele
    orders = []
    for o in orders_raw:
        ext_app = (o.get("external_app_name") or "").lower()
        if any(mp in ext_app for mp in marketplace_apps):
            continue
        orders.append(o)
        if len(orders) >= limit:
            break

    return {"orders": orders, "total": len(orders)}


# ==================== CORRECT LOCATION ====================

@router.put("/{company_id}/orders/{order_id}", dependencies=[Depends(require_admin)])
async def correct_order_location(
    company_id: str,
    order_id: str,
    data: LocationCorrectionRequest,
):
    """Sipariş konumunu düzelt ve adres havuzuna kaydet"""
    order = await db.orders.find_one(
        {"id": order_id, "company_id": company_id},
        {"_id": 0, "customer_name": 1, "delivery_address": 1, "delivery_location": 1}
    )
    if not order:
        raise HTTPException(status_code=404, detail="Sipariş bulunamadı")

    customer_name = (order.get("customer_name") or "").strip()
    delivery_address = (order.get("delivery_address") or "").strip()

    if not customer_name or not delivery_address:
        raise HTTPException(status_code=400, detail="Müşteri adı veya adres bilgisi eksik")

    corrected_location = {
        "latitude": data.latitude,
        "longitude": data.longitude,
    }

    # 1) Siparişin konumunu güncelle
    await db.orders.update_one(
        {"id": order_id},
        {"$set": {
            "delivery_location": corrected_location,
            "location_corrected": True,
            "location_corrected_at": datetime.now(TURKEY_TZ).isoformat(),
        }}
    )

    # 2) Adres havuzuna kaydet (upsert)
    await db.address_corrections.update_one(
        {
            "company_id": company_id,
            "customer_name_lower": customer_name.lower(),
            "delivery_address_lower": delivery_address.lower(),
        },
        {"$set": {
            "company_id": company_id,
            "customer_name": customer_name,
            "customer_name_lower": customer_name.lower(),
            "delivery_address": delivery_address,
            "delivery_address_lower": delivery_address.lower(),
            "corrected_location": corrected_location,
            "updated_at": datetime.now(TURKEY_TZ).isoformat(),
        }},
        upsert=True,
    )

    logger.info(f"Konum düzeltildi: order={order_id}, customer={customer_name}, loc={corrected_location}")

    return {"message": "Konum düzeltildi ve adres havuzuna kaydedildi"}


# ==================== AUTO-MATCH FUNCTION ====================

async def auto_correct_location(company_id: str, customer_name: str, delivery_address: str) -> Optional[dict]:
    """
    Yeni sipariş oluşturulduğunda çağrılır.
    Eğer aynı müşteri adı + adres ile daha önce konum düzeltmesi yapılmışsa
    düzeltilmiş konumu döndürür.
    """
    if not customer_name or not delivery_address:
        return None

    correction = await db.address_corrections.find_one(
        {
            "company_id": company_id,
            "customer_name_lower": customer_name.strip().lower(),
            "delivery_address_lower": delivery_address.strip().lower(),
        },
        {"_id": 0, "corrected_location": 1}
    )

    if correction:
        return correction.get("corrected_location")
    return None


# ==================== STATS ====================

@router.get("/{company_id}/stats", dependencies=[Depends(require_admin)])
async def get_correction_stats(company_id: str):
    """Konum düzeltme istatistikleri"""
    total_corrections = await db.address_corrections.count_documents({"company_id": company_id})
    corrected_orders = await db.orders.count_documents({
        "company_id": company_id,
        "location_corrected": True
    })

    return {
        "total_address_corrections": total_corrections,
        "total_corrected_orders": corrected_orders,
    }
