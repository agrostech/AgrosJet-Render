"""
Otomatik Atama Sistemi - Rota Sapması (Detour) Hesaplama

PICKUP AŞAMASI İÇİN ROTA SAPMASI MODELİ

Kapsam:
- Sadece hazır siparişler için
- Kurye üzerinde yolda paketi yokken
- Aynı restoran grubundaki siparişleri birleştirirken

Kurye yola çıktıktan sonra bu model devre dışıdır.
"""

from typing import Dict, List, Optional, Tuple
from .distance import calculate_distance_meters


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
    max_detour: float
) -> Tuple[bool, float, str]:
    """
    İki siparişin aynı kuryeye atanıp atanamayacağını belirler.
    
    Args:
        restaurant_location: Restoran konumu
        delivery_location_a: Mevcut sipariş teslimat konumu (kuryedeki)
        delivery_location_b: Yeni sipariş teslimat konumu
        max_detour: Maksimum izin verilen rota sapması (metre)
    
    Returns:
        (should_combine, detour_value, reason)
    """
    detour, combined, separate = calculate_detour(
        restaurant_location,
        delivery_location_a,
        delivery_location_b
    )
    
    if detour is None:
        return False, 0, "Koordinat eksik - detour hesaplanamadı"
    
    # Mutlak değer kontrolü - negatif veya pozitif fark etmez
    abs_detour = abs(detour)
    
    if abs_detour <= max_detour:
        return True, detour, f"Detour ({detour:.0f}m, |{abs_detour:.0f}m|) <= Eşik ({max_detour}m) - birleştirilebilir"
    else:
        return False, detour, f"Detour ({detour:.0f}m, |{abs_detour:.0f}m|) > Eşik ({max_detour}m) - ayrı kurye gerekli"


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
