"""
Kurye Ödeme Profili Servisi

Mantık:
  - Her kurye'nin 5 ödeme profili olabilir (Profil 1 = Standart).
  - Profil 1 mevcut courier.pricing_type/per_package_price/km_ranges/tier_prices
    field'larını kullanır (backward-compatible).
  - Profil 2-5 courier.pricing_profiles[N-1] dict'inde tutulur.
  - Her restoran bir profil seçer (restaurants.courier_pricing_profile, default 1).
  - Sipariş kuryeye atandığında: order.restaurant_id → restoran profil no →
    o profilin pricing config'i ile courier_fee hesaplanır.

Defansif fallback:
  - Restoran profil belirtmemişse → Profil 1
  - Kurye'nin belirtilen profili konfigüre değilse → Profil 1
"""
from typing import Optional, Tuple, Dict, Any
import logging

from utils.database import db

logger = logging.getLogger(__name__)


def _extract_profile_config(courier: dict, profile_no: int) -> Optional[Dict[str, Any]]:
    """
    Kurye dict'inden istenen profilin pricing config'ini çıkarır.
    Profil 1 → kuryenin top-level field'larından (eski davranış).
    Profil 2-5 → courier.pricing_profiles dict'inden veya array'inden.
    Konfigüre değilse None döner.
    """
    if profile_no == 1:
        pt = courier.get("pricing_type")
        if not pt:
            return None
        return {
            "pricing_type": pt,
            "per_package_price": courier.get("per_package_price"),
            "km_ranges": courier.get("km_ranges"),
            "tier_prices": courier.get("tier_prices"),
            "hourly_rate": courier.get("hourly_rate"),
        }

    profiles = courier.get("pricing_profiles") or {}
    # Dict (key=str) veya list olabilir — dict tercih edilir (sparse storage)
    key = str(profile_no)
    if isinstance(profiles, dict):
        cfg = profiles.get(key)
    elif isinstance(profiles, list):
        idx = profile_no - 2  # profile 2 → index 0
        cfg = profiles[idx] if 0 <= idx < len(profiles) else None
    else:
        cfg = None

    if not cfg or not cfg.get("pricing_type"):
        return None
    return {
        "pricing_type": cfg.get("pricing_type"),
        "per_package_price": cfg.get("per_package_price"),
        "km_ranges": cfg.get("km_ranges"),
        "tier_prices": cfg.get("tier_prices"),
        "hourly_rate": cfg.get("hourly_rate"),
    }


async def get_restaurant_profile_no(restaurant_id: Optional[str]) -> int:
    """Restoran'ın kurye ödeme profil numarasını döner (1-5, default 1)."""
    if not restaurant_id:
        return 1
    r = await db.restaurants.find_one(
        {"id": restaurant_id},
        {"_id": 0, "courier_pricing_profile": 1}
    )
    if not r:
        return 1
    try:
        n = int(r.get("courier_pricing_profile") or 1)
        if n < 1 or n > 5:
            return 1
        return n
    except Exception:
        return 1


async def get_courier_pricing_for_order(
    courier: dict,
    restaurant_id: Optional[str]
) -> Tuple[Dict[str, Any], int]:
    """
    Sipariş bazında kurye pricing config'ini döner.

    Returns:
        (pricing_config dict, profile_no_used)

    pricing_config içeriği:
        pricing_type, per_package_price, km_ranges, tier_prices, hourly_rate

    Eğer restoran profil 3 seçtiyse AMA kurye'nin profil 3'ü konfigüre değilse,
    sessizce Profil 1'e fallback yapılır.
    """
    profile_no = await get_restaurant_profile_no(restaurant_id)
    cfg = _extract_profile_config(courier, profile_no)
    if cfg:
        return (cfg, profile_no)

    # Fallback: profil 1
    cfg1 = _extract_profile_config(courier, 1)
    if cfg1:
        if profile_no != 1:
            logger.info(
                f"Kurye {courier.get('id')} profil {profile_no} konfigüre değil, "
                f"profil 1'e fallback yapıldı"
            )
        return (cfg1, 1)

    # Hiçbir profil yok — varsayılan boş per_package
    return ({
        "pricing_type": "per_package",
        "per_package_price": 0,
        "km_ranges": [],
        "tier_prices": None,
        "hourly_rate": None,
    }, profile_no)


def get_all_profiles(courier: dict) -> Dict[str, Optional[Dict[str, Any]]]:
    """5 profilin durumunu döner (UI render için)."""
    out = {}
    for n in range(1, 6):
        out[str(n)] = _extract_profile_config(courier, n)
    return out
