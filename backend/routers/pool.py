"""
Paket Havuzu (Order Pool) API Router

Kuryelerin atanmamış siparişleri görebileceği ve üzerlerine alabileceği havuz sistemi.

Ayarlar:
- Şirket bazlı havuz açma/kapama
- Hangi durumlar gösterilsin (beklemede, hazırlandı)
- Beklemede eşik süresi (kalan hazırlık süresi X dk altı)
- Kurye uzaklık limiti (X metreden uzaktaysa göremez)

Kurye bazlı:
- permissions.pool_access toggle
"""

from fastapi import APIRouter, HTTPException, Depends
from pydantic import BaseModel
from typing import Optional
from datetime import datetime, timezone, timedelta
import math
import logging

from utils.database import db
from utils.jwt_utils import require_admin

router = APIRouter(prefix="/api/pool", tags=["Order Pool"])
logger = logging.getLogger(__name__)

TURKEY_TZ = timezone(timedelta(hours=3))

# ==================== MODELS ====================

class PoolSettingsUpdate(BaseModel):
    enabled: bool = False
    show_pending: bool = True
    show_ready: bool = False
    pending_threshold_minutes: int = 6
    max_courier_distance: int = 5000  # metre


DEFAULT_POOL_SETTINGS = {
    "enabled": False,
    "show_pending": True,
    "show_ready": False,
    "pending_threshold_minutes": 6,
    "max_courier_distance": 5000,
}


# ==================== HELPERS ====================

def haversine_distance(lat1, lon1, lat2, lon2):
    """İki koordinat arası mesafe (metre)"""
    R = 6371000
    phi1 = math.radians(lat1)
    phi2 = math.radians(lat2)
    dphi = math.radians(lat2 - lat1)
    dlam = math.radians(lon2 - lon1)
    a = math.sin(dphi / 2) ** 2 + math.cos(phi1) * math.cos(phi2) * math.sin(dlam / 2) ** 2
    return R * 2 * math.atan2(math.sqrt(a), math.sqrt(1 - a))


# ==================== SETTINGS ENDPOINTS ====================

@router.get("/settings/{company_id}")
async def get_pool_settings(company_id: str):
    """Şirketin paket havuzu ayarlarını getir"""
    settings = await db.system_settings.find_one(
        {"type": "pool_settings", "company_id": company_id},
        {"_id": 0}
    )
    if not settings:
        return {**DEFAULT_POOL_SETTINGS, "company_id": company_id}
    return settings


@router.put("/settings/{company_id}", dependencies=[Depends(require_admin)])
async def update_pool_settings(company_id: str, data: PoolSettingsUpdate):
    """Şirketin paket havuzu ayarlarını güncelle"""
    settings = {
        "type": "pool_settings",
        "company_id": company_id,
        "enabled": data.enabled,
        "show_pending": data.show_pending,
        "show_ready": data.show_ready,
        "pending_threshold_minutes": data.pending_threshold_minutes,
        "max_courier_distance": data.max_courier_distance,
        "updated_at": datetime.now(TURKEY_TZ).isoformat(),
    }
    await db.system_settings.update_one(
        {"type": "pool_settings", "company_id": company_id},
        {"$set": settings},
        upsert=True,
    )
    return {"message": "Paket havuzu ayarları kaydedildi"}


# ==================== POOL ORDERS ENDPOINT ====================

@router.get("/orders/{company_id}")
async def get_pool_orders(
    company_id: str,
    courier_id: str = None,
    lat: float = None,
    lng: float = None,
):
    """
    Havuzdaki siparişleri getir.

    Filtreler:
    - Şirket havuzu aktif mi
    - Kurye havuz erişimi var mı
    - Sipariş durumu (beklemede / hazırlandı)
    - Beklemede eşik süresi
    - Kurye uzaklık limiti
    """
    # 1) Havuz ayarlarını çek
    settings = await db.system_settings.find_one(
        {"type": "pool_settings", "company_id": company_id},
        {"_id": 0}
    )
    if not settings:
        settings = {**DEFAULT_POOL_SETTINGS}

    if not settings.get("enabled"):
        return {"orders": [], "pool_enabled": False, "reason": "Havuz kapalı"}

    # 2) Kurye havuz erişimi kontrolü
    courier_allowed_methods = None
    courier_blocked_restaurants = set()
    if courier_id:
        courier = await db.couriers.find_one(
            {"id": courier_id},
            {"_id": 0, "permissions": 1, "max_packages": 1, "name": 1, "allowed_payment_methods": 1}
        )
        if not courier:
            raise HTTPException(status_code=404, detail="Kurye bulunamadı")

        permissions = courier.get("permissions", {})
        if not permissions.get("pool_access", True):
            return {"orders": [], "pool_enabled": True, "courier_access": False, "reason": "Havuz erişiminiz kapalı"}

        # Kuryenin izin verilen ödeme yöntemleri
        courier_allowed_methods = courier.get("allowed_payment_methods", ["cash", "card", "online", "meal_card", "online_meal_card"])

        # Kuryenin engellendiği restoranları bul
        blocked_restaurants = await db.restaurants.find(
            {"company_id": company_id, "blocked_couriers": courier_id},
            {"_id": 0, "id": 1}
        ).to_list(200)
        courier_blocked_restaurants = set(r["id"] for r in blocked_restaurants)

        # Mevcut paket sayısı kontrolü (bilgi amaçlı)
        active_count = await db.orders.count_documents({
            "courier_id": courier_id,
            "company_id": company_id,
            "status": {"$in": ["assigned", "confirmed", "on_the_way"]}
        })
        max_packages = courier.get("max_packages", 5)
    else:
        active_count = 0
        max_packages = 5

    # 3) Durum filtreleri oluştur
    now = datetime.now(TURKEY_TZ)
    status_conditions = []

    if settings.get("show_pending"):
        status_conditions.append("pending")
    if settings.get("show_ready"):
        status_conditions.append("ready")

    # Hazırlanıyor durumu da dahil (beklemede = pending + preparing)
    if settings.get("show_pending"):
        status_conditions.append("preparing")

    if not status_conditions:
        return {"orders": [], "pool_enabled": True, "reason": "Gösterilecek durum seçilmemiş"}

    # 4) Sorgu
    query = {
        "company_id": company_id,
        "status": {"$in": status_conditions},
        "courier_id": {"$in": [None, ""]},  # Atanmamış siparişler
        "is_restaurant_delivery": {"$ne": True},
    }

    orders_cursor = db.orders.find(query, {"_id": 0}).sort("created_at", 1)
    raw_orders = await orders_cursor.to_list(length=200)

    # 5) Beklemede eşik filtresi
    threshold = settings.get("pending_threshold_minutes", 6)
    filtered_orders = []

    for order in raw_orders:
        status = order.get("status")

        # Hazırlandı (ready) → direkt göster
        if status == "ready":
            filtered_orders.append(order)
            continue

        # Beklemede / Hazırlanıyor → kalan süre kontrolü
        prep_end = order.get("preparation_end_at")
        if prep_end:
            try:
                if isinstance(prep_end, str):
                    prep_end_dt = datetime.fromisoformat(prep_end)
                else:
                    prep_end_dt = prep_end
                # Kalan dakika
                remaining_minutes = (prep_end_dt - now).total_seconds() / 60
                if remaining_minutes > threshold:
                    continue  # Henüz eşiğin üstünde, gösterme
            except (ValueError, TypeError):
                pass  # Parse hatası, göster

        filtered_orders.append(order)

    # 6) Ödeme yöntemi filtresi - kuryenin kapalı ödeme yöntemleri
    if courier_allowed_methods is not None:
        filtered_orders = [
            o for o in filtered_orders
            if o.get("payment_method", "cash") in courier_allowed_methods
        ]

    # 7) Restoran engel filtresi - kuryenin engellendiği restoranlar
    if courier_blocked_restaurants:
        filtered_orders = [
            o for o in filtered_orders
            if o.get("restaurant_id") not in courier_blocked_restaurants
        ]

    # 8) Kurye uzaklık filtresi
    max_dist = settings.get("max_courier_distance", 5000)
    if lat is not None and lng is not None and max_dist > 0:
        distance_filtered = []
        for order in filtered_orders:
            rest_loc = order.get("restaurant_location")
            if rest_loc and rest_loc.get("latitude") and rest_loc.get("longitude"):
                dist = haversine_distance(lat, lng, rest_loc["latitude"], rest_loc["longitude"])
                order["courier_distance"] = round(dist)
                if dist <= max_dist:
                    distance_filtered.append(order)
            else:
                # Konum bilgisi yoksa göster
                order["courier_distance"] = None
                distance_filtered.append(order)
        filtered_orders = distance_filtered

    # 9) Skor hesapla ve sırala
    # Skor = (bekleme_puanı × 0.7) + (yakınlık_puanı × 0.3)
    # Her iki puan da 0-100 arası normalize edilir
    max_distance_for_score = max_dist if max_dist > 0 else 5000

    # Önce tüm bekleme sürelerini hesapla (normalize için max'ı bulmak lazım)
    wait_times = []
    for order in filtered_orders:
        created = order.get("created_at")
        if created:
            try:
                created_dt = datetime.fromisoformat(created) if isinstance(created, str) else created
                wait_minutes = max(0, (now - created_dt).total_seconds() / 60)
            except (ValueError, TypeError):
                wait_minutes = 0
        else:
            wait_minutes = 0
        order["_wait_minutes"] = wait_minutes
        wait_times.append(wait_minutes)

    max_wait = max(wait_times) if wait_times else 1

    for order in filtered_orders:
        # Bekleme puanı normalize (0-100)
        wait_score = (order["_wait_minutes"] / max_wait * 100) if max_wait > 0 else 0

        # Yakınlık puanı (0-100)
        dist = order.get("courier_distance")
        if dist is not None and max_distance_for_score > 0:
            proximity_score = max(0, (max_distance_for_score - dist) / max_distance_for_score) * 100
        else:
            proximity_score = 50

        score = (wait_score * 0.7) + (proximity_score * 0.3)
        order["pool_score"] = round(score, 1)
        # Temizle
        del order["_wait_minutes"]

    filtered_orders.sort(key=lambda o: o.get("pool_score", 0), reverse=True)

    # first_only: kuryenin aktif paketi yoksa sadece ilk paketi alabilir
    first_only = active_count == 0

    return {
        "orders": filtered_orders,
        "pool_enabled": True,
        "courier_access": True,
        "active_count": active_count,
        "max_packages": max_packages,
        "first_only": first_only,
        "settings": {
            "max_courier_distance": max_dist,
            "pending_threshold_minutes": threshold,
        }
    }


# ==================== CLAIM ORDER ENDPOINT ====================

@router.post("/claim/{order_id}")
async def claim_pool_order(order_id: str, courier_id: str = None):
    """
    Kurye havuzdan sipariş alır.
    Sipariş direkt 'confirmed' durumuna geçer.
    """
    if not courier_id:
        raise HTTPException(status_code=400, detail="courier_id zorunlu")

    # Sipariş kontrolü
    order = await db.orders.find_one({"id": order_id}, {"_id": 0})
    if not order:
        raise HTTPException(status_code=404, detail="Sipariş bulunamadı")

    # Zaten atanmış mı?
    if order.get("courier_id"):
        raise HTTPException(status_code=400, detail="Bu sipariş zaten bir kuryeye atanmış")

    # Sipariş uygun durumda mı?
    if order.get("status") not in ["pending", "preparing", "ready"]:
        raise HTTPException(status_code=400, detail="Bu sipariş havuzdan alınamaz")

    company_id = order.get("company_id")

    # Havuz aktif mi?
    settings = await db.system_settings.find_one(
        {"type": "pool_settings", "company_id": company_id},
        {"_id": 0}
    )
    if not settings or not settings.get("enabled"):
        raise HTTPException(status_code=400, detail="Paket havuzu aktif değil")

    # Kurye kontrolü
    courier = await db.couriers.find_one(
        {"id": courier_id},
        {"_id": 0, "name": 1, "phone": 1, "permissions": 1, "max_packages": 1,
         "pricing_type": 1, "per_package_price": 1, "km_ranges": 1, "tier_prices": 1}
    )
    if not courier:
        raise HTTPException(status_code=404, detail="Kurye bulunamadı")

    # Havuz erişimi var mı?
    permissions = courier.get("permissions", {})
    if not permissions.get("pool_access", True):
        raise HTTPException(status_code=403, detail="Havuz erişiminiz kapalı")

    # Paket limiti kontrolü
    max_packages = courier.get("max_packages", 5)
    active_count = await db.orders.count_documents({
        "courier_id": courier_id,
        "company_id": company_id,
        "status": {"$in": ["assigned", "confirmed", "on_the_way"]}
    })

    if active_count >= max_packages:
        raise HTTPException(status_code=400, detail=f"Paket taşıma limitiniz doldu ({max_packages}/{max_packages})")

    # İlk paket kuralı: aktif paketi yoksa sadece en yüksek skorlu paketi alabilir
    if active_count == 0:
        # Havuzdaki siparişleri aynı filtrelerle çekip skorla
        pool_result = await get_pool_orders(company_id, courier_id=courier_id)
        pool_orders = pool_result.get("orders", [])
        if pool_orders and pool_orders[0].get("id") != order_id:
            top_order = pool_orders[0]
            raise HTTPException(
                status_code=400,
                detail=f"İlk paketiniz en öncelikli sipariş olmalıdır. Lütfen önce \"{top_order.get('restaurant_name', '')}\" siparişini alın."
            )

    # Assign + Confirm (tek adımda)
    from routers.orders import assign_courier_core, update_order_status_core

    # 1) Kuryeye ata
    assign_result = await assign_courier_core(
        order=order,
        courier_id=courier_id,
        actor_type="courier_pool",
        actor_name="Paket Havuzu",
        calculate_fee=True,
        send_push=False,  # Kendi aldığı için push gerekmez
    )

    if not assign_result.get("success"):
        raise HTTPException(status_code=400, detail=assign_result.get("error", "Atama başarısız"))

    # 2) Direkt confirmed yap
    await update_order_status_core(
        order_id=order_id,
        new_status="confirmed",
        actor_type="courier_pool",
        actor_name="Paket Havuzu",
        note="Havuzdan alındı",
        notify_platform=False,
    )

    logger.info(f"Havuzdan sipariş alındı: order={order_id}, courier={courier_id}, courier_name={courier.get('name')}")

    return {
        "message": "Sipariş havuzdan alındı",
        "order_id": order_id,
        "courier_name": courier.get("name"),
    }
