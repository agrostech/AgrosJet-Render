"""
Otomatik Atama Sistemi - Mesafe Hesaplama Fonksiyonları

Haversine formülü ile düz mesafe (metre) hesaplanır.
ETA, açı, zone veya polygon KULLANILMAZ.
"""

import math
from typing import Optional, Dict, Any


def haversine_distance(lat1: float, lon1: float, lat2: float, lon2: float) -> float:
    """
    İki koordinat arasındaki düz mesafeyi metre cinsinden hesaplar.
    
    Args:
        lat1, lon1: Başlangıç koordinatları
        lat2, lon2: Bitiş koordinatları
    
    Returns:
        Mesafe (metre)
    """
    R = 6371000  # Dünya yarıçapı (metre)
    
    phi1 = math.radians(lat1)
    phi2 = math.radians(lat2)
    delta_phi = math.radians(lat2 - lat1)
    delta_lambda = math.radians(lon2 - lon1)
    
    a = math.sin(delta_phi / 2) ** 2 + \
        math.cos(phi1) * math.cos(phi2) * math.sin(delta_lambda / 2) ** 2
    c = 2 * math.atan2(math.sqrt(a), math.sqrt(1 - a))
    
    return R * c


def extract_coordinates(location: Optional[Dict[str, Any]]) -> Optional[tuple]:
    """
    Location objesinden koordinatları çıkarır.
    
    Args:
        location: {"lat": float, "lng": float} veya {"latitude": float, "longitude": float}
    
    Returns:
        (lat, lng) tuple veya None
    """
    if not location:
        return None
    
    lat = location.get("lat") or location.get("latitude")
    lng = location.get("lng") or location.get("longitude")
    
    if lat is None or lng is None:
        return None
    
    try:
        return (float(lat), float(lng))
    except (TypeError, ValueError):
        return None


def calculate_distance_meters(loc1: Optional[Dict], loc2: Optional[Dict]) -> Optional[float]:
    """
    İki konum arasındaki mesafeyi metre cinsinden hesaplar.
    
    Args:
        loc1: Başlangıç konumu
        loc2: Bitiş konumu
    
    Returns:
        Mesafe (metre) veya None (koordinat eksikse)
    """
    coords1 = extract_coordinates(loc1)
    coords2 = extract_coordinates(loc2)
    
    if not coords1 or not coords2:
        return None
    
    return haversine_distance(coords1[0], coords1[1], coords2[0], coords2[1])
