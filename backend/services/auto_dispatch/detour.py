"""
Otomatik Atama Sistemi - Rota Sapması (Detour) Hesaplama

PICKUP AŞAMASI İÇİN ROTA SAPMASI MODELİ

Kapsam:
- Sadece hazır siparişler için
- Kurye üzerinde yolda paketi yokken
- Aynı restoran grubundaki siparişleri birleştirirken

Kurye yola çıktıktan sonra bu model devre dışıdır.
"""

import math
from typing import Dict, List, Optional, Tuple
from .distance import calculate_distance_meters


def calculate_bearing(from_location: Dict, to_location: Dict) -> Optional[float]:
    """
    İki nokta arasındaki yön açısını (bearing) hesaplar.
    
    Args:
        from_location: Başlangıç konumu (restoran)
        to_location: Hedef konumu (teslimat)
    
    Returns:
        Açı (derece, 0-360) - Kuzey=0, Doğu=90, Güney=180, Batı=270
        None döner koordinat eksikse
    """
    lat1 = from_location.get("lat") or from_location.get("latitude")
    lng1 = from_location.get("lng") or from_location.get("longitude")
    lat2 = to_location.get("lat") or to_location.get("latitude")
    lng2 = to_location.get("lng") or to_location.get("longitude")
    
    if lat1 is None or lng1 is None or lat2 is None or lng2 is None:
        return None
    
    # Radyana çevir
    lat1_rad = math.radians(lat1)
    lat2_rad = math.radians(lat2)
    delta_lng = math.radians(lng2 - lng1)
    
    # Bearing hesapla
    x = math.sin(delta_lng) * math.cos(lat2_rad)
    y = math.cos(lat1_rad) * math.sin(lat2_rad) - math.sin(lat1_rad) * math.cos(lat2_rad) * math.cos(delta_lng)
    
    bearing = math.atan2(x, y)
    bearing_degrees = math.degrees(bearing)
    
    # 0-360 aralığına normalize et
    return (bearing_degrees + 360) % 360


def calculate_angle_difference(angle1: float, angle2: float) -> float:
    """
    İki açı arasındaki en küçük farkı hesaplar (0-180 derece).
    
    Örnek:
    - 10° ile 350° arası fark = 20° (360° etrafından)
    - 90° ile 270° arası fark = 180°
    """
    diff = abs(angle1 - angle2)
    if diff > 180:
        diff = 360 - diff
    return diff


def calculate_detour(
    restaurant_location: Dict,
    delivery_location_a: Dict,
    delivery_location_b: Dict
) -> Tuple[Optional[float], Optional[float], Optional[float]]:
    """
    İki siparişin birleştirilmesi durumunda rota sapmasını hesaplar.
    
    Args:
        restaurant_location: Restoran konumu
        delivery_location_a: Mevcut sipariş teslimat konumu
        delivery_location_b: Yeni sipariş teslimat konumu
    
    Returns:
        (detour, combined_distance, separate_total)
        - detour: Rota sapması (metre) - negatif = birleştirmek daha verimli
        - combined_distance: Birleşik rota mesafesi
        - separate_total: Ayrı gidilseydi toplam mesafe
        - None döner koordinat eksikse
    """
    # Mesafeleri hesapla
    r_to_a = calculate_distance_meters(restaurant_location, delivery_location_a)
    r_to_b = calculate_distance_meters(restaurant_location, delivery_location_b)
    a_to_b = calculate_distance_meters(delivery_location_a, delivery_location_b)
    
    # Herhangi biri None ise hesaplanamaz
    if r_to_a is None or r_to_b is None or a_to_b is None:
        return None, None, None
    
    # Ayrı kuryeler giderse toplam mesafe
    separate_total = r_to_a + r_to_b
    
    # Aynı kurye giderse - iki olasılık
    # D1: R → A → B
    d1 = r_to_a + a_to_b
    # D2: R → B → A
    d2 = r_to_b + a_to_b
    
    # En kısa olan seçilir
    combined_distance = min(d1, d2)
    
    # Rota sapması
    detour = combined_distance - separate_total
    
    return detour, combined_distance, separate_total


def should_combine_orders(
    restaurant_location: Dict,
    delivery_location_a: Dict,
    delivery_location_b: Dict,
    max_detour: float,
    max_angle_diff: float = 90.0,
    angle_skip_distance: float = 1000.0,
    detour_skip_distance: float = 500.0
) -> Tuple[bool, float, str]:
    """
    İki siparişin aynı kuryeye atanıp atanamayacağını belirler.
    
    Args:
        restaurant_location: Restoran konumu
        delivery_location_a: Mevcut sipariş teslimat konumu (kuryedeki)
        delivery_location_b: Yeni sipariş teslimat konumu
        max_detour: Maksimum izin verilen rota sapması (metre)
        max_angle_diff: Maksimum açı farkı (derece) - varsayılan 90°
        angle_skip_distance: Bu mesafeden yakın paketler için açı kontrolü atlanır (metre) - varsayılan 1000m
        detour_skip_distance: Bu mesafeden yakın paketler için detour kontrolü atlanır (metre) - varsayılan 500m
    
    Returns:
        (should_combine, detour_value, reason)
    """
    # Paketlerin restorana mesafesini hesapla
    dist_a = calculate_distance_meters(restaurant_location, delivery_location_a)
    dist_b = calculate_distance_meters(restaurant_location, delivery_location_b)
    
    # AÇI KONTROLÜ - Restorana yakın paketler için atla (1km)
    skip_angle_check = False
    if dist_a is not None and dist_a <= angle_skip_distance:
        skip_angle_check = True
    if dist_b is not None and dist_b <= angle_skip_distance:
        skip_angle_check = True
    
    # DETOUR KONTROLÜ - Restorana çok yakın paketler için atla (500m)
    skip_detour_check = False
    if dist_a is not None and dist_a <= detour_skip_distance:
        skip_detour_check = True
    if dist_b is not None and dist_b <= detour_skip_distance:
        skip_detour_check = True
    
    bearing_a = calculate_bearing(restaurant_location, delivery_location_a)
    bearing_b = calculate_bearing(restaurant_location, delivery_location_b)
    angle_diff = 0
    
    if bearing_a is not None and bearing_b is not None:
        angle_diff = calculate_angle_difference(bearing_a, bearing_b)
        
        if not skip_angle_check and angle_diff > max_angle_diff:
            return False, 0, f"Açı farkı çok büyük: {angle_diff:.0f}° > {max_angle_diff:.0f}° (farklı yönler)"
    
    # DETOUR HESABI
    detour, combined, separate = calculate_detour(
        restaurant_location,
        delivery_location_a,
        delivery_location_b
    )
    
    if detour is None:
        return False, 0, "Koordinat eksik - detour hesaplanamadı"
    
    # Bilgi mesajı oluştur
    if skip_detour_check:
        return True, detour, f"Yakın paket ({min(dist_a or 9999, dist_b or 9999):.0f}m), detour kontrolü atlandı"
    elif skip_angle_check:
        distance_info = f"Yakın paket ({min(dist_a or 9999, dist_b or 9999):.0f}m), açı kontrolü atlandı"
    else:
        distance_info = f"Açı farkı: {angle_diff:.0f}°"
    
    # Negatif detour = birleştirmek daha verimli (tasarruf)
    if detour < 0:
        return True, detour, f"{distance_info}, {abs(detour):.0f}m tasarruf"
    
    # Pozitif detour - eşik kontrolü (ekstra mesafe)
    if detour <= max_detour:
        return True, detour, f"{distance_info}, detour {detour:.0f}m <= {max_detour}m"
    else:
        return False, detour, f"Detour ({detour:.0f}m) > Eşik ({max_detour}m) - ayrı kurye gerekli"


def calculate_multi_order_detour(
    restaurant_location: Dict,
    existing_deliveries: List[Dict],
    new_delivery: Dict
) -> Tuple[Optional[float], str]:
    """
    Kurye üzerinde birden fazla sipariş varken yeni sipariş ekleme detour'unu hesaplar.
    
    Bu fonksiyon, kuryenin mevcut teslimat noktalarına yeni bir nokta eklendiğinde
    oluşacak sapma miktarını hesaplar.
    
    Args:
        restaurant_location: Restoran konumu
        existing_deliveries: Kuryedeki mevcut siparişlerin teslimat konumları
        new_delivery: Yeni siparişin teslimat konumu
    
    Returns:
        (detour, reason)
    """
    if not existing_deliveries:
        return 0, "Kurye boş - detour yok"
    
    # Tek mevcut sipariş varsa basit detour hesabı
    if len(existing_deliveries) == 1:
        detour, _, _ = calculate_detour(
            restaurant_location,
            existing_deliveries[0],
            new_delivery
        )
        if detour is None:
            return None, "Koordinat eksik"
        return detour, f"Tek sipariş üzerine ekleme - detour: {detour:.0f}m"
    
    # Birden fazla mevcut sipariş varsa
    # En son teslimat noktasından yeni noktaya mesafe ekle
    # Bu basitleştirilmiş bir yaklaşım
    last_delivery = existing_deliveries[-1]
    
    # Mevcut son noktadan yeni noktaya mesafe
    extension = calculate_distance_meters(last_delivery, new_delivery)
    
    # Yeni noktadan restorana geri dönüş vs direkt
    new_to_restaurant = calculate_distance_meters(new_delivery, restaurant_location)
    last_to_restaurant = calculate_distance_meters(last_delivery, restaurant_location)
    
    if extension is None or new_to_restaurant is None or last_to_restaurant is None:
        return None, "Koordinat eksik"
    
    # Detour = (eski son → yeni) + (yeni → R) - (eski son → R)
    detour = extension + new_to_restaurant - last_to_restaurant
    
    return detour, f"Çoklu sipariş üzerine ekleme - detour: {detour:.0f}m"


def calculate_order_match_score(
    restaurant_location: Dict,
    existing_delivery: Optional[Dict],
    new_delivery: Dict,
    max_detour: float = 700
) -> Tuple[float, str]:
    """
    Bir siparişin kuryeye ne kadar uygun olduğunu puanlar.
    Düşük skor = daha iyi eşleşme.
    
    Args:
        restaurant_location: Restoran konumu
        existing_delivery: Kuryenin mevcut siparişinin teslimat konumu (None = boş kurye)
        new_delivery: Yeni siparişin teslimat konumu
        max_detour: Maksimum detour limiti
    
    Returns:
        (score, reason) - Düşük skor daha iyi
    """
    # Boş kurye için sadece restorana mesafe
    if existing_delivery is None:
        dist = calculate_distance_meters(restaurant_location, new_delivery)
        if dist is None:
            return 99999, "Koordinat eksik"
        return dist, f"Boş kurye, teslimat mesafesi: {dist:.0f}m"
    
    # Açı farkını hesapla
    bearing_existing = calculate_bearing(restaurant_location, existing_delivery)
    bearing_new = calculate_bearing(restaurant_location, new_delivery)
    
    if bearing_existing is None or bearing_new is None:
        return 99999, "Açı hesaplanamadı"
    
    angle_diff = calculate_angle_difference(bearing_existing, bearing_new)
    
    # Detour hesapla
    detour, _, _ = calculate_detour(restaurant_location, existing_delivery, new_delivery)
    if detour is None:
        return 99999, "Detour hesaplanamadı"
    
    # Restorana yakınlık kontrolü (açı istisnası için)
    dist_existing = calculate_distance_meters(restaurant_location, existing_delivery)
    dist_new = calculate_distance_meters(restaurant_location, new_delivery)
    
    is_close = (dist_existing and dist_existing <= 1000) or (dist_new and dist_new <= 1000)
    
    # Skor hesapla:
    # - Açı farkı ne kadar küçükse o kadar iyi (0-180 arası)
    # - Detour ne kadar negatif (tasarruf) o kadar iyi
    # - Açı > 90° ve yakın değilse çok yüksek skor (uyumsuz)
    
    if angle_diff > 90 and not is_close:
        # Ters yön ve uzak - çok kötü eşleşme
        return 99999, f"Ters yön ({angle_diff:.0f}°) ve uzak"
    
    # Skor = açı_farkı * 10 + detour (negatif detour skoru düşürür)
    # Açı 0° ve detour -1000m → skor = 0 + (-1000) = -1000 (çok iyi)
    # Açı 45° ve detour 0 → skor = 450 + 0 = 450 (orta)
    # Açı 89° ve detour 500m → skor = 890 + 500 = 1390 (kötü)
    
    score = (angle_diff * 10) + detour
    
    return score, f"Açı: {angle_diff:.0f}°, Detour: {detour:.0f}m, Skor: {score:.0f}"
