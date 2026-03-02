"""
Otomatik Atama Sistemi - Kurye Seçimi ve Filtreleme

Kurye adaylık kontrolü, kapasite kontrolü ve sıralama işlemleri.

RESTORAN GRUBU KURALI (KRİTİK):
- Bir kurye üzerinde birden fazla sipariş olabilmesi için siparişlerin 
  restoranları AYNI restoran grubunda olmalıdır.
- Eğer kurye üzerinde aktif sipariş varsa ve yeni siparişin restoran grubu 
  farklıysa → kurye aday listesinden çıkarılır.
- Boş kurye için grup kısıtı yoktur.

ROTA SAPMASI (DETOUR) KURALI:
- Pickup aşamasında (yolda paketi olmayan kurye) siparişler birleştirilirken
  rota sapması kontrolü yapılır.
- Detour = BirleşikMesafe - AyrıToplam
- Detour ≤ MaksimumRotaSapması ise birleştirilebilir.
"""

from typing import List, Dict, Any, Optional, Tuple
from datetime import datetime, timedelta, timezone
from utils.database import db

from .config import (
    ELIGIBLE_COURIER_STATUSES,
    ACTIVE_ORDER_STATUSES,
    ON_THE_WAY_STATUS,
    DEFAULT_MAX_PACKAGES,
)
from .distance import calculate_distance_meters
from .detour import should_combine_orders, calculate_detour, calculate_multi_order_detour, calculate_bearing, calculate_angle_difference


async def get_restaurant_group_for_restaurant(restaurant_id: str, company_id: str) -> Optional[str]:
    """
    Bir restoranın ait olduğu grup ID'sini bulur.
    
    Returns:
        group_id: Grup ID veya None (grupsuz)
    """
    group = await db.restaurant_groups.find_one(
        {
            "company_id": company_id,
            "restaurant_ids": restaurant_id
        },
        {"_id": 0, "id": 1}
    )
    return group.get("id") if group else None


async def is_courier_blocked_for_restaurant(courier_id: str, restaurant_id: str) -> bool:
    """
    Kuryenin bu restoran tarafından engellenip engellenmediğini kontrol eder.
    
    Returns:
        True: Kurye engellenmiş
        False: Kurye engellenmemiş
    """
    if not restaurant_id:
        return False
    
    restaurant = await db.restaurants.find_one(
        {"id": restaurant_id},
        {"_id": 0, "blocked_couriers": 1}
    )
    
    if not restaurant:
        return False
    
    blocked_couriers = restaurant.get("blocked_couriers", [])
    return courier_id in blocked_couriers


async def get_courier_active_restaurant_group(courier_id: str, company_id: str) -> Optional[str]:
    """
    Kuryenin aktif siparişlerinin ait olduğu restoran grubunu bulur.
    
    Returns:
        group_id: Kuryenin aktif siparişlerinin grubu veya None (boş kurye veya grupsuz)
    """
    # Kuryenin aktif siparişlerini al
    active_order = await db.orders.find_one(
        {
            "courier_id": courier_id,
            "company_id": company_id,
            "status": {"$in": ACTIVE_ORDER_STATUSES}
        },
        {"_id": 0, "restaurant_id": 1}
    )
    
    if not active_order:
        return None  # Boş kurye
    
    # Bu restoranın grubunu bul
    restaurant_id = active_order.get("restaurant_id")
    if not restaurant_id:
        return None
    
    return await get_restaurant_group_for_restaurant(restaurant_id, company_id)


async def is_courier_compatible_with_restaurant_group(
    courier_id: str, 
    company_id: str, 
    target_restaurant_id: str
) -> Tuple[bool, str]:
    """
    Kuryenin yeni siparişin restoran grubuyla uyumlu olup olmadığını kontrol eder.
    
    KURAL:
    - Boş kurye → Her zaman uyumlu
    - Aktif siparişi var → Yeni sipariş aynı grupta olmalı
    
    Returns:
        (compatible: bool, reason: str)
    """
    # Kuryenin mevcut aktif siparişlerinin grubunu bul
    courier_group = await get_courier_active_restaurant_group(courier_id, company_id)
    
    # Kurye boşsa (grubu yok) → her zaman uyumlu
    if courier_group is None:
        # Kuryenin gerçekten boş olup olmadığını kontrol et
        active_count = await db.orders.count_documents({
            "courier_id": courier_id,
            "company_id": company_id,
            "status": {"$in": ACTIVE_ORDER_STATUSES}
        })
        if active_count == 0:
            return True, "Boş kurye - grup kısıtı yok"
        else:
            # Aktif siparişi var ama grupsuz restorandan
            # Yeni siparişin grubu da grupsuz mu kontrol et
            target_group = await get_restaurant_group_for_restaurant(target_restaurant_id, company_id)
            if target_group is None:
                return True, "Her iki restoran da grupsuz"
            else:
                return False, "Kuryenin grupsuz restoranı var, yeni sipariş gruplu"
    
    # Kuryenin aktif grubu var - yeni siparişin grubunu kontrol et
    target_group = await get_restaurant_group_for_restaurant(target_restaurant_id, company_id)
    
    # Yeni sipariş grupsuzsa
    if target_group is None:
        return False, "Kurye başka bir grupta aktif, yeni sipariş grupsuz"
    
    # Her ikisi de gruplu - aynı grup mu?
    if courier_group == target_group:
        return True, "Aynı restoran grubunda"
    else:
        return False, f"Farklı restoran grupları: kurye={courier_group}, yeni={target_group}"


async def get_courier_active_orders(courier_id: str, company_id: str) -> List[Dict]:
    """
    Kuryenin aktif siparişlerini getirir.
    
    Returns:
        Aktif siparişler listesi
    """
    orders = await db.orders.find(
        {
            "courier_id": courier_id,
            "company_id": company_id,
            "status": {"$in": ACTIVE_ORDER_STATUSES}
        },
        {"_id": 0, "id": 1, "status": 1, "delivery_location": 1}
    ).to_list(100)
    
    return orders


async def get_courier_on_the_way_orders(courier_id: str, company_id: str) -> List[Dict]:
    """
    Kuryenin yolda olan siparişlerini getirir.
    
    Returns:
        Yolda siparişler listesi
    """
    orders = await db.orders.find(
        {
            "courier_id": courier_id,
            "company_id": company_id,
            "status": ON_THE_WAY_STATUS
        },
        {"_id": 0, "id": 1, "delivery_location": 1}
    ).to_list(100)
    
    return orders


async def get_courier_order_count_last_hour(courier_id: str, company_id: str) -> int:
    """
    Kuryenin son 1 saatte aldığı sipariş sayısını getirir.
    Adalet filtresi için kullanılır.
    """
    one_hour_ago = (datetime.now(timezone.utc) - timedelta(hours=1)).isoformat()
    
    count = await db.orders.count_documents({
        "courier_id": courier_id,
        "company_id": company_id,
        "assigned_at": {"$gte": one_hour_ago}
    })
    
    return count


async def is_courier_eligible(
    courier: Dict, 
    company_id: str,
    target_restaurant_id: Optional[str] = None,
    target_restaurant_location: Optional[Dict] = None,
    target_delivery_location: Optional[Dict] = None,
    max_detour: Optional[float] = None,
    assigned_in_this_cycle: Optional[Dict] = None,
    same_location_radius: Optional[float] = None,
    same_location_max_packages: Optional[int] = None,
    angle_check_enabled: bool = True,
    angle_skip_distance: Optional[float] = None,
    max_angle_diff: Optional[float] = None,
    detour_check_enabled: bool = True,
    detour_skip_distance: Optional[float] = None,
    order_payment_method: Optional[str] = None,
    excluded_courier_ids: Optional[List[str]] = None
) -> Tuple[bool, str, Dict]:
    """
    Kuryenin aday olup olmadığını kontrol eder.
    
    Args:
        courier: Kurye bilgileri
        company_id: Şirket ID
        target_restaurant_id: Hedef siparişin restoran ID'si (grup kontrolü için)
        target_restaurant_location: Hedef siparişin restoran konumu (detour için)
        target_delivery_location: Hedef siparişin teslimat konumu (detour için)
        max_detour: Maksimum izin verilen rota sapması (metre)
        assigned_in_this_cycle: Bu döngüde atanan siparişler {courier_id: [delivery_location_list]}
        same_location_radius: Aynı konum sayılacak mesafe (metre)
        same_location_max_packages: Aynı konumda maksimum paket limiti
        angle_check_enabled: Açı kontrolü aktif mi
        angle_skip_distance: Bu mesafeden yakın paketler için açı kontrolü atlanır
        max_angle_diff: Maksimum açı farkı (derece)
        detour_check_enabled: Detour kontrolü aktif mi
        detour_skip_distance: Bu mesafeden yakın paketler için detour kontrolü atlanır
        order_payment_method: Siparişin ödeme türü (cash, card, online, meal_card, online_meal_card)
        excluded_courier_ids: Bu siparişe atanmaması gereken kurye ID'leri (otomatik iptal edilenler)
    
    Returns:
        (eligible: bool, reason: str, extra_data: dict)
        extra_data: {"type": "idle"|"one_on_way"|"pickup_with_orders", "on_way_order": order|None, "active_orders": list}
    """
    if assigned_in_this_cycle is None:
        assigned_in_this_cycle = {}
    
    courier_id = courier.get("id")
    
    # DIŞLANAN KURYE KONTROLÜ (Otomatik iptal edilenler)
    if excluded_courier_ids and courier_id in excluded_courier_ids:
        return False, "Kurye daha önce bu siparişi onaylamadı", {}
    
    # AKTİFLİK DURUMU KONTROLÜ (Kurye panelinden belirlenen)
    # availability_status: "active", "on_break", "offline"
    availability_status = courier.get("availability_status", "offline")
    if availability_status != "active":
        if availability_status == "on_break":
            return False, "Kurye molada", {}
        else:  # offline veya tanımsız
            return False, "Kurye çevrimdışı", {}
    
    # Konum kontrolü
    if not courier.get("current_location"):
        return False, "Kurye konumu yok", {}
    
    # ENGELLEME KONTROLÜ - Restoran bu kuryeyi engellemiş mi?
    if target_restaurant_id:
        is_blocked = await is_courier_blocked_for_restaurant(courier_id, target_restaurant_id)
        if is_blocked:
            return False, "Kurye bu restoran tarafından engellenmiş", {}
    
    # ÖDEME TÜRÜ KONTROLÜ - Sipariş ödeme türü kuryenin izinli türlerinden biri mi?
    if order_payment_method:
        # Varsayılan: tüm ödeme türlerine izin ver
        default_payment_methods = ["cash", "card", "online", "meal_card", "online_meal_card"]
        courier_allowed_methods = courier.get("allowed_payment_methods", default_payment_methods)
        
        if order_payment_method not in courier_allowed_methods:
            return False, f"Ödeme türü uyumsuz: {order_payment_method}", {}
    
    # Kapasite kontrolü - veritabanı + bu döngüde atananlar
    max_packages = courier.get("max_packages", DEFAULT_MAX_PACKAGES)
    active_orders = await get_courier_active_orders(courier_id, company_id)
    db_active_count = len(active_orders)
    cycle_assigned_locations = assigned_in_this_cycle.get(courier_id, [])
    cycle_assigned_count = len(cycle_assigned_locations)
    total_active_count = db_active_count + cycle_assigned_count
    
    # "Aynı konum" kontrolü - limit aşılabilir mi?
    effective_max_packages = max_packages
    is_same_location = False
    
    if total_active_count >= max_packages and target_delivery_location and same_location_radius:
        # Tüm mevcut teslimat konumlarını topla
        all_delivery_locations = []
        
        # DB'deki aktif siparişlerin teslimat konumları
        for order in active_orders:
            dl = order.get("delivery_location")
            if dl:
                all_delivery_locations.append(dl)
        
        # Bu döngüde atanan siparişlerin teslimat konumları
        for dl in cycle_assigned_locations:
            if dl:
                all_delivery_locations.append(dl)
        
        # Yeni sipariş EN AZ BİR mevcut siparişe yakın mı kontrol et
        # (Aynı bina = en az bir siparişle 30m içinde)
        if all_delivery_locations:
            any_within_radius = False
            for existing_dl in all_delivery_locations:
                distance = calculate_distance_meters(target_delivery_location, existing_dl)
                if distance is not None and distance <= same_location_radius:
                    any_within_radius = True
                    break
            
            if any_within_radius:
                is_same_location = True
                effective_max_packages = same_location_max_packages or 10
    
    if total_active_count >= effective_max_packages:
        if is_same_location:
            return False, f"Aynı konum limiti dolu: {total_active_count}/{effective_max_packages}", {}
        else:
            return False, f"Kapasite dolu: {total_active_count}/{max_packages} (DB:{db_active_count} + Döngü:{cycle_assigned_count})", {}
    
    # Yolda sipariş kontrolü
    on_way_orders = await get_courier_on_the_way_orders(courier_id, company_id)
    on_way_count = len(on_way_orders)
    
    if on_way_count >= 2:
        return False, f"2+ yolda sipariş var: {on_way_count}", {}
    
    # RESTORAN GRUBU KONTROLÜ (KRİTİK)
    # Boş olmayan kurye için grup uyumluluğu kontrol edilmeli
    if (db_active_count > 0 or cycle_assigned_count > 0) and target_restaurant_id:
        compatible, reason = await is_courier_compatible_with_restaurant_group(
            courier_id, company_id, target_restaurant_id
        )
        if not compatible:
            return False, f"Restoran grubu uyumsuz: {reason}", {}
    
    # ROTA SAPMASI (DETOUR) VE AÇI KONTROLÜ
    # Pickup aşamasında (yolda paketi yok) ve aktif siparişi varken (DB veya döngü içi)
    if on_way_count == 0 and (db_active_count > 0 or cycle_assigned_count > 0) and max_detour is not None:
        if target_restaurant_location and target_delivery_location:
            # TÜM mevcut teslimat konumlarını topla
            all_existing_deliveries = []
            
            # DB'deki aktif siparişlerin teslimat konumları
            for order in active_orders:
                dl = order.get("delivery_location")
                if dl:
                    ex_lat = dl.get("lat") or dl.get("latitude")
                    ex_lng = dl.get("lng") or dl.get("longitude")
                    if ex_lat is not None and ex_lng is not None:
                        all_existing_deliveries.append(dl)
            
            # Bu döngüde atanan siparişlerin teslimat konumları
            for dl in cycle_assigned_locations:
                if dl:
                    ex_lat = dl.get("lat") or dl.get("latitude")
                    ex_lng = dl.get("lng") or dl.get("longitude")
                    if ex_lat is not None and ex_lng is not None:
                        all_existing_deliveries.append(dl)
            
            # Kontroller kapalıysa atla
            if not angle_check_enabled and not detour_check_enabled:
                pass  # Kontrol yapma
            elif all_existing_deliveries:
                # AÇI KONTROLÜ - Yeni paketin yönü mevcut paketlerle uyumlu mu?
                if angle_check_enabled:
                    new_bearing = calculate_bearing(target_restaurant_location, target_delivery_location)
                    new_dist = calculate_distance_meters(target_restaurant_location, target_delivery_location)
                    
                    # Yakın paketler için açı kontrolü atlanabilir
                    skip_angle = new_dist is not None and new_dist <= (angle_skip_distance or 1000)
                    
                    if not skip_angle and new_bearing is not None:
                        for existing_delivery in all_existing_deliveries:
                            existing_bearing = calculate_bearing(target_restaurant_location, existing_delivery)
                            existing_dist = calculate_distance_meters(target_restaurant_location, existing_delivery)
                            
                            # Mevcut paket de yakınsa atla
                            if existing_dist is not None and existing_dist <= (angle_skip_distance or 1000):
                                continue
                            
                            if existing_bearing is not None:
                                angle_diff = calculate_angle_difference(new_bearing, existing_bearing)
                                if angle_diff > (max_angle_diff or 90):
                                    return False, f"Açı farkı çok büyük: {angle_diff:.0f}° > {max_angle_diff or 90}° (farklı yönler)", {}
                
                # DETOUR KONTROLÜ - Toplam rota mesafesi üzerinden
                if detour_check_enabled:
                    skip_detour = False
                    
                    # Yeni paket restorana yakınsa atla
                    new_dist_to_restaurant = calculate_distance_meters(target_restaurant_location, target_delivery_location)
                    if new_dist_to_restaurant is not None and new_dist_to_restaurant <= (detour_skip_distance or 500):
                        skip_detour = True
                    
                    # Yeni paket MEVCUT PAKETLERDEN HERHANGİ BİRİNE yakınsa atla
                    if not skip_detour:
                        for existing_delivery in all_existing_deliveries:
                            # Mevcut paket restorana yakınsa
                            existing_dist_to_restaurant = calculate_distance_meters(target_restaurant_location, existing_delivery)
                            if existing_dist_to_restaurant is not None and existing_dist_to_restaurant <= (detour_skip_distance or 500):
                                skip_detour = True
                                break
                            
                            # YENİ: Yeni paket mevcut pakete yakınsa (paketler arası mesafe)
                            dist_between_packages = calculate_distance_meters(target_delivery_location, existing_delivery)
                            if dist_between_packages is not None and dist_between_packages <= (detour_skip_distance or 500):
                                skip_detour = True
                                break
                    
                    if not skip_detour:
                        # TOPLAM ROTA HESABI - Tüm paketler birlikte değerlendirilir
                        detour_value, detour_reason = calculate_multi_order_detour(
                            target_restaurant_location,
                            all_existing_deliveries,
                            target_delivery_location
                        )
                        
                        if detour_value is not None:
                            # max_detour negatif ise: minimum tasarruf gerekli
                            if max_detour < 0:
                                min_savings = abs(max_detour)
                                if detour_value >= 0:
                                    # Tasarruf yok, ekstra mesafe var
                                    return False, f"Rota uyumsuz: Tasarruf yok (+{detour_value:.0f}m), min {min_savings:.0f}m gerekli", {}
                                elif abs(detour_value) < min_savings:
                                    # Tasarruf yetersiz
                                    return False, f"Rota uyumsuz: Tasarruf ({abs(detour_value):.0f}m) < Gerekli ({min_savings:.0f}m)", {}
                            # max_detour pozitif ise: maksimum sapma toleransı
                            elif detour_value > max_detour:
                                return False, f"Rota uyumsuz: Detour ({detour_value:.0f}m) > Eşik ({max_detour:.0f}m)", {}
    
    # Kurye tipi belirleme (total_active_count kullan)
    if on_way_count == 0 and total_active_count == 0:
        return True, "Boş kurye", {"type": "idle", "on_way_order": None, "active_orders": []}
    elif on_way_count == 0 and total_active_count > 0:
        return True, "Pickup aşamasında (yolda yok, aktif var)", {"type": "pickup_with_orders", "on_way_order": None, "active_orders": active_orders}
    else:
        return True, "1 yolda siparişli kurye", {"type": "one_on_way", "on_way_order": on_way_orders[0], "active_orders": active_orders}


async def get_eligible_couriers(
    company_id: str,
    target_restaurant_id: Optional[str] = None,
    target_restaurant_location: Optional[Dict] = None,
    target_delivery_location: Optional[Dict] = None,
    max_detour: Optional[float] = None,
    assigned_in_this_cycle: Optional[Dict] = None,
    same_location_radius: Optional[float] = None,
    same_location_max_packages: Optional[int] = None,
    angle_check_enabled: bool = True,
    angle_skip_distance: Optional[float] = None,
    max_angle_diff: Optional[float] = None,
    detour_check_enabled: bool = True,
    detour_skip_distance: Optional[float] = None,
    order_payment_method: Optional[str] = None,
    excluded_courier_ids: Optional[List[str]] = None
) -> Tuple[List[Dict], List[Dict], List[Dict]]:
    """
    Şirkete ait uygun kuryeleri getirir ve kategorize eder.
    
    Args:
        company_id: Şirket ID
        target_restaurant_id: Hedef siparişin restoran ID'si (grup kontrolü için)
        target_restaurant_location: Hedef siparişin restoran konumu (detour için)
        target_delivery_location: Hedef siparişin teslimat konumu (detour için)
        max_detour: Maksimum izin verilen rota sapması (metre)
        assigned_in_this_cycle: Bu döngüde atanan sipariş sayısı {courier_id: count}
        same_location_radius: Aynı konum sayılacak mesafe (metre)
        same_location_max_packages: Aynı konumda maksimum paket limiti
        angle_check_enabled: Açı kontrolü aktif mi
        angle_skip_distance: Bu mesafeden yakın paketler için açı kontrolü atlanır
        max_angle_diff: Maksimum açı farkı (derece)
        detour_check_enabled: Detour kontrolü aktif mi
        detour_skip_distance: Bu mesafeden yakın paketler için detour kontrolü atlanır
        order_payment_method: Siparişin ödeme türü
        excluded_courier_ids: Bu siparişe atanmaması gereken kurye ID'leri
    
    Returns:
        (idle_couriers, pickup_couriers, one_on_way_couriers)
        - idle_couriers: Tamamen boş kuryeler
        - pickup_couriers: Pickup aşamasında (aktif var, yolda yok) - detour uygun
        - one_on_way_couriers: 1 yolda siparişi olan kuryeler
    """
    if assigned_in_this_cycle is None:
        assigned_in_this_cycle = {}
    
    # Aktif kuryeleri getir
    couriers = await db.couriers.find(
        {
            "company_id": company_id,
            "availability_status": "active"  # Sadece aktif kuryeler
        },
        {"_id": 0}
    ).to_list(500)
    
    idle_couriers = []
    pickup_couriers = []
    one_on_way_couriers = []
    
    for courier in couriers:
        eligible, reason, extra = await is_courier_eligible(
            courier, 
            company_id, 
            target_restaurant_id,
            target_restaurant_location,
            target_delivery_location,
            max_detour,
            assigned_in_this_cycle,
            same_location_radius,
            same_location_max_packages,
            angle_check_enabled,
            angle_skip_distance,
            max_angle_diff,
            detour_check_enabled,
            detour_skip_distance,
            order_payment_method,
            excluded_courier_ids
        )
        
        if not eligible:
            continue
        
        courier_data = {
            "courier": courier,
            "type": extra.get("type"),
            "on_way_order": extra.get("on_way_order"),
            "active_orders": extra.get("active_orders", [])
        }
        
        courier_type = extra.get("type")
        if courier_type == "idle":
            idle_couriers.append(courier_data)
        elif courier_type == "pickup_with_orders":
            pickup_couriers.append(courier_data)
        elif courier_type == "one_on_way":
            one_on_way_couriers.append(courier_data)
    
    return idle_couriers, pickup_couriers, one_on_way_couriers


def calculate_idle_courier_distance(courier_data: Dict, restaurant_location: Dict) -> Optional[float]:
    """
    Boş kuryenin restorana olan mesafesini hesaplar.
    D_idle = KuryeKonumu → RestoranKonumu
    """
    courier = courier_data.get("courier", {})
    courier_location = courier.get("current_location")
    
    return calculate_distance_meters(courier_location, restaurant_location)


def calculate_return_courier_distance(courier_data: Dict, restaurant_location: Dict) -> Optional[float]:
    """
    1 yolda siparişli kuryenin dönüş mesafesini hesaplar.
    D_return = MüşteriKonumu (mevcut teslimat) → RestoranKonumu
    """
    on_way_order = courier_data.get("on_way_order", {})
    delivery_location = on_way_order.get("delivery_location")
    
    return calculate_distance_meters(delivery_location, restaurant_location)


async def find_best_idle_courier(
    idle_couriers: List[Dict], 
    restaurant_location: Dict,
    company_id: str,
    fairness_enabled: bool = False,
    fairness_threshold: float = 200
) -> Tuple[Optional[Dict], Optional[float]]:
    """
    En uygun boş kuryeyi bulur.
    
    Returns:
        (best_courier_data, d_idle_min)
    """
    if not idle_couriers:
        return None, None
    
    # Her kurye için mesafe hesapla
    couriers_with_distance = []
    for courier_data in idle_couriers:
        distance = calculate_idle_courier_distance(courier_data, restaurant_location)
        if distance is not None:
            couriers_with_distance.append({
                **courier_data,
                "distance": distance
            })
    
    if not couriers_with_distance:
        return None, None
    
    # Mesafeye göre sırala
    couriers_with_distance.sort(key=lambda x: x["distance"])
    
    best = couriers_with_distance[0]
    d_idle_min = best["distance"]
    
    # Adalet filtresi kontrolü
    if fairness_enabled and len(couriers_with_distance) > 1:
        # Eşik içindeki kuryeleri bul
        candidates_in_threshold = [
            c for c in couriers_with_distance 
            if c["distance"] <= d_idle_min + fairness_threshold
        ]
        
        if len(candidates_in_threshold) > 1:
            # Son 1 saatte en az sipariş alan kuryeyi seç
            for candidate in candidates_in_threshold:
                courier_id = candidate["courier"]["id"]
                candidate["orders_last_hour"] = await get_courier_order_count_last_hour(courier_id, company_id)
            
            candidates_in_threshold.sort(key=lambda x: x["orders_last_hour"])
            best = candidates_in_threshold[0]
    
    return best, d_idle_min


async def find_best_return_courier(
    one_on_way_couriers: List[Dict], 
    restaurant_location: Dict,
    company_id: str,
    fairness_enabled: bool = False,
    fairness_threshold: float = 200
) -> Tuple[Optional[Dict], Optional[float]]:
    """
    En uygun 1-yolda kuryeyi bulur.
    
    Returns:
        (best_courier_data, d_return_min)
    """
    if not one_on_way_couriers:
        return None, None
    
    # Her kurye için dönüş mesafesi hesapla
    couriers_with_distance = []
    for courier_data in one_on_way_couriers:
        distance = calculate_return_courier_distance(courier_data, restaurant_location)
        if distance is not None:
            couriers_with_distance.append({
                **courier_data,
                "distance": distance
            })
    
    if not couriers_with_distance:
        return None, None
    
    # Mesafeye göre sırala
    couriers_with_distance.sort(key=lambda x: x["distance"])
    
    best = couriers_with_distance[0]
    d_return_min = best["distance"]
    
    # Adalet filtresi kontrolü
    if fairness_enabled and len(couriers_with_distance) > 1:
        candidates_in_threshold = [
            c for c in couriers_with_distance 
            if c["distance"] <= d_return_min + fairness_threshold
        ]
        
        if len(candidates_in_threshold) > 1:
            for candidate in candidates_in_threshold:
                courier_id = candidate["courier"]["id"]
                candidate["orders_last_hour"] = await get_courier_order_count_last_hour(courier_id, company_id)
            
            candidates_in_threshold.sort(key=lambda x: x["orders_last_hour"])
            best = candidates_in_threshold[0]
    
    return best, d_return_min
