"""
Kademeli Paket Başı Ücretlendirme Servisi

Mantık:
- Kuryenin aktif paket sayısına göre yeni paket fiyatı belirlenir
- Aktif = assigned/confirmed/on_the_way durumundaki siparişler
- Sadece unassign işleminde fiyatlar kaydırılır
- Teslim/iptal durumlarında fiyatlar sabit kalır
"""

from utils.database import db
from typing import Optional, List
from datetime import datetime


async def get_company_tiered_pricing(company_id: str) -> Optional[dict]:
    """
    Şirketin kademeli ücretlendirme ayarlarını getir.
    
    Returns:
        {
            "enabled": bool,
            "tier_prices": [100, 80, 70, 60, 50],  # 5 kademe
            "hourly_rate": float or None
        }
    """
    company = await db.companies.find_one(
        {"id": company_id},
        {"_id": 0, "tiered_pricing": 1}
    )
    
    if not company or not company.get("tiered_pricing"):
        return None
    
    return company["tiered_pricing"]


async def update_company_tiered_pricing(
    company_id: str, 
    enabled: bool,
    tier_prices: List[float],
    hourly_rate: Optional[float] = None
) -> dict:
    """
    Şirketin kademeli ücretlendirme ayarlarını güncelle.
    
    Args:
        company_id: Şirket ID
        enabled: Aktif mi
        tier_prices: 5 elemanlı liste [1. paket, 2. paket, ...]
        hourly_rate: Saatlik ücret (opsiyonel)
    """
    if len(tier_prices) != 5:
        return {"success": False, "error": "Tam olarak 5 kademe fiyatı gerekli"}
    
    tiered_pricing = {
        "enabled": enabled,
        "tier_prices": tier_prices,
        "hourly_rate": hourly_rate
    }
    
    result = await db.companies.update_one(
        {"id": company_id},
        {"$set": {"tiered_pricing": tiered_pricing}}
    )
    
    if result.matched_count == 0:
        return {"success": False, "error": "Şirket bulunamadı"}
    
    return {"success": True, "message": "Kademeli ücretlendirme güncellendi"}


async def get_courier_active_package_count(courier_id: str, company_id: str) -> int:
    """
    Kuryenin aktif paket sayısını hesapla.
    Aktif = assigned, confirmed, preparing, on_the_way durumundaki siparişler
    """
    active_statuses = ["assigned", "confirmed", "preparing", "on_the_way"]
    
    count = await db.orders.count_documents({
        "courier_id": courier_id,
        "company_id": company_id,
        "status": {"$in": active_statuses}
    })
    
    return count


async def calculate_tiered_fee(courier_id: str, company_id: str) -> Optional[float]:
    """
    Kademeli ücretlendirme aktifse, yeni paket için ücreti hesapla.
    
    Returns:
        float: Hesaplanan ücret
        None: Kademeli ücretlendirme aktif değilse
    """
    # Şirket ayarlarını kontrol et
    tiered_settings = await get_company_tiered_pricing(company_id)
    
    if not tiered_settings or not tiered_settings.get("enabled"):
        return None
    
    tier_prices = tiered_settings.get("tier_prices", [0, 0, 0, 0, 0])
    
    # Kuryenin mevcut aktif paket sayısını al
    active_count = await get_courier_active_package_count(courier_id, company_id)
    
    # Kademe belirle (0 aktif -> 1. kademe, 1 aktif -> 2. kademe, ...)
    tier_index = min(active_count, 4)  # Max 5. kademe (index 4)
    
    return tier_prices[tier_index]


async def get_courier_active_orders_sorted(courier_id: str, company_id: str) -> List[dict]:
    """
    Kuryenin aktif siparişlerini atanma sırasına göre getir.
    """
    active_statuses = ["assigned", "confirmed", "preparing", "on_the_way"]
    
    orders = await db.orders.find(
        {
            "courier_id": courier_id,
            "company_id": company_id,
            "status": {"$in": active_statuses}
        },
        {"_id": 0, "id": 1, "courier_fee": 1, "assigned_at": 1, "tiered_position": 1}
    ).sort("assigned_at", 1).to_list(100)
    
    return orders


async def recalculate_tiered_fees_on_unassign(courier_id: str, company_id: str) -> dict:
    """
    Kurye ataması kaldırıldığında kalan siparişlerin fiyatlarını kaydır.
    
    Mantık:
    - 2. olan -> 1. kademe fiyatı
    - 3. olan -> 2. kademe fiyatı
    - vs.
    
    NOT: Bu artık kurye bazlı çalışır - kuryenin tier_prices ayarlarını kullanır.
    Profil-aware: Restoran ödeme profili belirlemişse, kayan her sipariş için
    restoranın profilindeki tier_prices kullanılır (profil yoksa Profil 1 fallback).
    """
    courier = await db.couriers.find_one(
        {"id": courier_id},
        {"_id": 0, "id": 1, "pricing_type": 1, "tier_prices": 1, "pricing_profiles": 1, "per_package_price": 1, "km_ranges": 1, "hourly_rate": 1}
    )

    if not courier:
        return {"success": True, "message": "Kurye bulunamadı", "updated_count": 0}

    # Profil 1 tiered değil VE hiçbir profilde tiered yoksa: işlem yok
    from services.courier_pricing_service import _extract_profile_config
    any_tiered = False
    for n in range(1, 6):
        cfg = _extract_profile_config(courier, n)
        if cfg and cfg.get("pricing_type") == "tiered" and cfg.get("tier_prices"):
            any_tiered = True
            break
    if not any_tiered:
        return {"success": True, "message": "Kademeli ücretlendirme aktif değil", "updated_count": 0}

    # Kuryenin kalan aktif siparişlerini al (atanma sırasına göre)
    remaining_orders = await get_courier_active_orders_sorted(courier_id, company_id)

    if not remaining_orders:
        return {"success": True, "message": "Kalan sipariş yok", "updated_count": 0}

    from services.courier_pricing_service import get_courier_pricing_for_order
    updated_count = 0

    # Her siparişi yeni pozisyonuna göre güncelle
    for index, order in enumerate(remaining_orders):
        # Bu sipariş için aktif pricing profilini bul
        active_pricing, _profile_no = await get_courier_pricing_for_order(courier, order.get("restaurant_id"))
        if active_pricing.get("pricing_type") != "tiered":
            # Bu sipariş tiered olmayan bir profile sahip, kademeyi atla
            continue
        tier_prices = active_pricing.get("tier_prices") or [0, 0, 0, 0, 0]
        new_tier_index = min(index, 4)
        new_fee = tier_prices[new_tier_index] if new_tier_index < len(tier_prices) else tier_prices[-1]
        old_fee = order.get("courier_fee", 0)

        # Sadece fiyat değiştiyse güncelle
        if abs(new_fee - old_fee) > 0.01:
            await db.orders.update_one(
                {"id": order["id"]},
                {
                    "$set": {
                        "courier_fee": round(new_fee, 2),
                        "tiered_position": new_tier_index + 1
                    },
                    "$push": {
                        "fee_history": {
                            "timestamp": datetime.now().isoformat(),
                            "old_fee": old_fee,
                            "new_fee": new_fee,
                            "reason": "tiered_shift",
                            "new_position": new_tier_index + 1
                        }
                    }
                }
            )
            updated_count += 1
    
    return {
        "success": True, 
        "message": f"{updated_count} sipariş fiyatı kaydırıldı",
        "updated_count": updated_count
    }
