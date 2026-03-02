"""
Otomatik Atama Sistemi - Ana Dispatch Mantığı

Bu dosya tüm karar mantığını içerir:
- Sipariş sıralama (FIFO)
- Kurye seçimi
- Bekleme modu
- Fallback
"""

import logging
from typing import Dict, Any, Optional, List, Tuple
from datetime import datetime, timezone, timedelta
from utils.database import db

from .config import DEFAULT_SETTINGS, READY_ORDER_STATUS
from .courier_selection import (
    get_eligible_couriers,
    find_best_idle_courier,
    find_best_return_courier,
)

logger = logging.getLogger("auto_dispatch")


async def get_dispatch_settings(company_id: str) -> Dict:
    """
    Şirketin otomatik atama ayarlarını getirir.
    Ayar yoksa varsayılan değerler döner.
    """
    company = await db.companies.find_one(
        {"id": company_id},
        {"_id": 0, "auto_dispatch_settings": 1}
    )
    
    if not company or not company.get("auto_dispatch_settings"):
        return DEFAULT_SETTINGS.copy()
    
    # Varsayılan değerlerle birleştir (eksik alanlar için)
    settings = DEFAULT_SETTINGS.copy()
    settings.update(company.get("auto_dispatch_settings", {}))
    return settings


async def update_dispatch_settings(company_id: str, settings: Dict) -> Dict:
    """
    Şirketin otomatik atama ayarlarını günceller.
    """
    result = await db.companies.update_one(
        {"id": company_id},
        {"$set": {"auto_dispatch_settings": settings}}
    )
    
    if result.matched_count == 0:
        return {"success": False, "error": "Şirket bulunamadı"}
    
    return {"success": True, "message": "Ayarlar güncellendi"}


async def get_ready_orders(company_id: str) -> List[Dict]:
    """
    Hazır durumundaki siparişleri FIFO sırasıyla getirir.
    ready_at ASC sıralama.
    """
    orders = await db.orders.find(
        {
            "company_id": company_id,
            "status": READY_ORDER_STATUS,
            "courier_id": None  # Henüz kurye atanmamış
        },
        {"_id": 0}
    ).sort("ready_at", 1).to_list(100)
    
    return orders


async def get_waiting_orders(company_id: str) -> List[Dict]:
    """
    Bekleme modundaki siparişleri getirir.
    """
    orders = await db.orders.find(
        {
            "company_id": company_id,
            "status": READY_ORDER_STATUS,
            "dispatch_waiting": True,
            "dispatch_waiting_courier_id": {"$ne": None}
        },
        {"_id": 0}
    ).to_list(100)
    
    return orders


async def set_order_waiting(
    order_id: str, 
    courier_id: str, 
    courier_name: str
) -> bool:
    """
    Siparişi bekleme moduna alır.
    """
    result = await db.orders.update_one(
        {"id": order_id},
        {
            "$set": {
                "dispatch_waiting": True,
                "dispatch_waiting_courier_id": courier_id,
                "dispatch_waiting_courier_name": courier_name,
                "dispatch_waiting_started": datetime.now(timezone.utc).isoformat()
            }
        }
    )
    return result.modified_count > 0


async def clear_order_waiting(order_id: str) -> bool:
    """
    Siparişin bekleme modunu temizler.
    """
    result = await db.orders.update_one(
        {"id": order_id},
        {
            "$unset": {
                "dispatch_waiting": "",
                "dispatch_waiting_courier_id": "",
                "dispatch_waiting_courier_name": "",
                "dispatch_waiting_started": ""
            }
        }
    )
    return result.modified_count > 0


async def assign_order_to_courier(order: Dict, courier_data: Dict, reason: str) -> Dict:
    """
    Siparişi kuryeye atar.
    orders.py'deki assign_courier_core fonksiyonunu kullanır.
    """
    from routers.orders import assign_courier_core
    
    courier = courier_data.get("courier", {})
    courier_id = courier.get("id")
    
    # Bekleme modunu temizle
    await clear_order_waiting(order["id"])
    
    result = await assign_courier_core(
        order=order,
        courier_id=courier_id,
        actor_type="system",
        actor_name="Otomatik Atama",
        calculate_fee=True,
        send_push=True
    )
    
    if result.get("success"):
        # Dispatch log kaydet
        await log_dispatch_action(
            company_id=order.get("company_id"),
            order_id=order.get("id"),
            courier_id=courier_id,
            action="assigned",
            reason=reason,
            details={
                "courier_name": courier.get("name"),
                "courier_type": courier_data.get("type"),
                "distance": courier_data.get("distance")
            }
        )
    
    return result


async def log_dispatch_action(
    company_id: str,
    order_id: str,
    courier_id: Optional[str],
    action: str,
    reason: str,
    details: Optional[Dict] = None
):
    """
    Dispatch işlemini loglar.
    """
    log_entry = {
        "timestamp": datetime.now(timezone.utc).isoformat(),
        "company_id": company_id,
        "order_id": order_id,
        "courier_id": courier_id,
        "action": action,
        "reason": reason,
        "details": details or {}
    }
    
    await db.dispatch_logs.insert_one(log_entry)
    logger.info(f"Dispatch: {action} - Order: {order_id} - Courier: {courier_id} - Reason: {reason}")


async def process_single_order(
    order: Dict, 
    settings: Dict,
    assigned_in_this_cycle: Dict = None
) -> Dict:
    """
    Tek bir sipariş için dispatch kararı verir.
    
    İKİ KATMANLI SİSTEM:
    1. Pickup Aşaması (yolda yok): Detour modeli - sipariş birleştirme
    2. On-the-way (1 yolda var): D_return vs D_idle karşılaştırması
    
    Args:
        order: Sipariş bilgileri
        settings: Dispatch ayarları
        assigned_in_this_cycle: Bu döngüde atanan sipariş sayısı {courier_id: count}
    
    Returns:
        {"action": "assigned"|"waiting"|"no_courier", "courier_id": str|None, "reason": str}
    """
    if assigned_in_this_cycle is None:
        assigned_in_this_cycle = {}
    
    company_id = order.get("company_id")
    order_id = order.get("id")
    restaurant_id = order.get("restaurant_id")
    restaurant_location = order.get("restaurant_location")
    delivery_location = order.get("delivery_location")
    
    if not restaurant_location:
        return {"action": "error", "reason": "Restoran konumu yok"}
    
    # Ayarları çıkar
    distance_tolerance = settings.get("distance_tolerance", 500)
    fairness_enabled = settings.get("fairness_enabled", False)
    fairness_threshold = settings.get("fairness_threshold", 200)
    max_detour = settings.get("max_detour", 700)
    same_location_radius = settings.get("same_location_radius", 30)
    same_location_max_packages = settings.get("same_location_max_packages", 10)
    
    # Uygun kuryeleri getir (restoran grubu + detour kontrolü dahil)
    idle_couriers, pickup_couriers, one_on_way_couriers = await get_eligible_couriers(
        company_id, 
        target_restaurant_id=restaurant_id,
        target_restaurant_location=restaurant_location,
        target_delivery_location=delivery_location,
        max_detour=max_detour,
        assigned_in_this_cycle=assigned_in_this_cycle,
        same_location_radius=same_location_radius,
        same_location_max_packages=same_location_max_packages
    )
    
    # Tüm boş ve pickup kuryelerini birleştir (pickup aşaması için)
    # Pickup kuryeleri de aslında "boş" gibi değerlendirilir - restorana gitmeleri gerekiyor
    all_idle_type_couriers = idle_couriers + pickup_couriers
    
    # En iyi boş/pickup kuryeyi bul
    best_idle, d_idle_min = await find_best_idle_courier(
        all_idle_type_couriers, 
        restaurant_location, 
        company_id,
        fairness_enabled,
        fairness_threshold
    )
    
    # En iyi 1-yolda kuryeyi bul
    best_return, d_return_min = await find_best_return_courier(
        one_on_way_couriers, 
        restaurant_location, 
        company_id,
        fairness_enabled,
        fairness_threshold
    )
    
    # Hiç kurye yoksa
    if not best_idle and not best_return:
        return {"action": "no_courier", "reason": "Uygun kurye bulunamadı"}
    
    # Sadece boş/pickup kurye varsa
    if best_idle and not best_return:
        courier_type = best_idle.get("type", "idle")
        reason = "Pickup aşamasında kuryeye eklendi" if courier_type == "pickup_with_orders" else "Boş kurye atandı"
        result = await assign_order_to_courier(order, best_idle, reason)
        if result.get("success"):
            return {"action": "assigned", "courier_id": best_idle["courier"]["id"], "reason": reason}
        return {"action": "error", "reason": result.get("error")}
    
    # Sadece 1-yolda kurye varsa
    if not best_idle and best_return:
        courier = best_return["courier"]
        await set_order_waiting(order_id, courier["id"], courier["name"])
        return {"action": "waiting", "courier_id": courier["id"], "reason": "1-yolda kurye bekleniyor"}
    
    # Her iki tip de varsa - ANA KARAR MANTIĞI
    # Fark = D_idle - D_return
    # Fark <= Tolerans ise → Boş kuryeye ata (bekletme)
    # Fark > Tolerans ise → Yolda kurye için beklet
    distance_difference = d_idle_min - d_return_min
    
    if distance_difference <= distance_tolerance:
        # Fark küçük - boş kuryeye direkt ata, bekletme
        result = await assign_order_to_courier(
            order, 
            best_idle, 
            f"Fark({distance_difference:.0f}m) <= Tolerans({distance_tolerance}m) - boş kurye atandı"
        )
        if result.get("success"):
            return {"action": "assigned", "courier_id": best_idle["courier"]["id"], "reason": f"Boş kurye atandı (fark: {distance_difference:.0f}m)"}
        return {"action": "error", "reason": result.get("error")}
    else:
        # Fark büyük - yolda kurye çok daha yakın, beklet
        courier = best_return["courier"]
        await set_order_waiting(order_id, courier["id"], courier["name"])
        
        await log_dispatch_action(
            company_id=company_id,
            order_id=order_id,
            courier_id=courier["id"],
            action="waiting",
            reason=f"Fark({distance_difference:.0f}m) > Tolerans({distance_tolerance}m) - yolda kurye bekleniyor",
            details={
                "d_return_min": d_return_min,
                "d_idle_min": d_idle_min,
                "distance_difference": distance_difference,
                "distance_tolerance": distance_tolerance
            }
        )
        
        return {"action": "waiting", "courier_id": courier["id"], "reason": f"Yolda kurye bekleniyor (fark: {distance_difference:.0f}m)"}


async def check_waiting_orders(company_id: str, settings: Dict) -> List[Dict]:
    """
    Bekleme modundaki siparişleri kontrol eder.
    - Kurye boşaldıysa: ata
    - Süre dolduysa: fallback
    """
    results = []
    max_wait_time = settings.get("max_wait_time", 5)  # dakika
    
    waiting_orders = await get_waiting_orders(company_id)
    
    for order in waiting_orders:
        order_id = order.get("id")
        restaurant_id = order.get("restaurant_id")  # Restoran grubu kontrolü için
        waiting_courier_id = order.get("dispatch_waiting_courier_id")
        waiting_started = order.get("dispatch_waiting_started")
        restaurant_location = order.get("restaurant_location")
        
        # Bekleme süresini kontrol et
        if waiting_started:
            started_time = datetime.fromisoformat(waiting_started.replace("Z", "+00:00"))
            elapsed_minutes = (datetime.now(timezone.utc) - started_time).total_seconds() / 60
            
            if elapsed_minutes >= max_wait_time:
                # FALLBACK - Süre doldu, en yakın boş kuryeye ata
                await clear_order_waiting(order_id)
                
                delivery_location = order.get("delivery_location")
                max_detour = settings.get("max_detour", 700)
                
                # Restoran grubu + detour kontrolü ile kurye getir
                idle_couriers, pickup_couriers, _ = await get_eligible_couriers(
                    company_id,
                    target_restaurant_id=restaurant_id,
                    target_restaurant_location=restaurant_location,
                    target_delivery_location=delivery_location,
                    max_detour=max_detour
                )
                all_idle_type = idle_couriers + pickup_couriers
                
                best_idle, d_idle_min = await find_best_idle_courier(
                    all_idle_type, 
                    restaurant_location, 
                    company_id
                )
                
                if best_idle:
                    result = await assign_order_to_courier(
                        order, 
                        best_idle, 
                        f"Fallback - Bekleme süresi doldu ({max_wait_time} dk)"
                    )
                    results.append({
                        "order_id": order_id,
                        "action": "fallback_assigned" if result.get("success") else "fallback_failed",
                        "courier_id": best_idle["courier"]["id"]
                    })
                else:
                    results.append({
                        "order_id": order_id,
                        "action": "fallback_no_courier",
                        "reason": "Fallback için uygun kurye bulunamadı (grup/detour kısıtı)"
                    })
                continue
        
        # Beklenen kuryenin durumunu kontrol et
        if waiting_courier_id:
            courier = await db.couriers.find_one(
                {"id": waiting_courier_id},
                {"_id": 0, "id": 1, "name": 1, "status": 1, "is_on_break": 1}
            )
            
            if not courier:
                # Kurye silinmiş - fallback
                await clear_order_waiting(order_id)
                continue
            
            # Kuryenin yolda siparişi var mı kontrol et
            on_way_count = await db.orders.count_documents({
                "courier_id": waiting_courier_id,
                "company_id": company_id,
                "status": "on_the_way"
            })
            
            if on_way_count == 0:
                # Kurye boşaldı - ata
                result = await assign_order_to_courier(
                    order, 
                    {"courier": courier, "type": "idle"},
                    "Beklenen kurye boşaldı"
                )
                results.append({
                    "order_id": order_id,
                    "action": "waiting_assigned" if result.get("success") else "waiting_failed",
                    "courier_id": waiting_courier_id
                })
    
    return results


async def check_unconfirmed_orders(company_id: str, settings: Dict) -> List[Dict]:
    """
    Onaylanmayan siparişleri kontrol eder ve zaman aşımına uğrayanları iptal eder.
    
    Returns:
        İptal edilen sipariş sonuçları listesi
    """
    results = []
    
    # Otomatik iptal kapalıysa çık
    if not settings.get("auto_cancel_enabled", False):
        return results
    
    timeout_minutes = settings.get("auto_cancel_timeout", 5)
    now = datetime.now(timezone.utc)
    timeout_threshold = now - timedelta(minutes=timeout_minutes)
    
    # "assigned" statüsündeki siparişleri bul (henüz onaylanmamış)
    unconfirmed_orders = await db.orders.find(
        {
            "company_id": company_id,
            "status": "assigned",
            "courier_id": {"$ne": None},
            "assigned_at": {"$lt": timeout_threshold.isoformat()}
        },
        {"_id": 0}
    ).to_list(100)
    
    for order in unconfirmed_orders:
        order_id = order.get("id")
        courier_id = order.get("courier_id")
        courier_name = order.get("courier_name", "Bilinmeyen Kurye")
        assigned_at = order.get("assigned_at")
        
        # Siparişi ready durumuna geri al
        update_result = await db.orders.update_one(
            {"id": order_id, "status": "assigned"},
            {
                "$set": {
                    "status": "ready",
                    "courier_id": None,
                    "courier_name": None,
                    "courier_phone": None,
                    "auto_cancelled": True,
                    "auto_cancelled_at": now.isoformat(),
                    "auto_cancelled_reason": f"Kurye {timeout_minutes} dakika içinde onaylamadı"
                },
                "$push": {
                    "status_history": {
                        "status": "ready",
                        "timestamp": now.isoformat(),
                        "note": f"Otomatik iptal - Kurye ({courier_name}) {timeout_minutes} dk içinde onaylamadı"
                    }
                }
            }
        )
        
        if update_result.modified_count > 0:
            # İhlal kaydı ekle
            await add_shift_violation(
                company_id=company_id,
                courier_id=courier_id,
                courier_name=courier_name,
                violation_type="package_not_confirmed",
                description="Paketi onaylamadı, paket otomatik olarak üzerinden alındı",
                order_id=order_id
            )
            
            # Dispatch log
            await log_dispatch_action(
                company_id=company_id,
                order_id=order_id,
                courier_id=courier_id,
                action="auto_cancelled",
                reason=f"Kurye {timeout_minutes} dk içinde onaylamadı",
                details={
                    "courier_name": courier_name,
                    "assigned_at": assigned_at,
                    "timeout_minutes": timeout_minutes
                }
            )
            
            results.append({
                "order_id": order_id,
                "courier_id": courier_id,
                "courier_name": courier_name,
                "action": "auto_cancelled"
            })
            
            logger.info(f"Sipariş {order_id[:8]}... otomatik iptal edildi - Kurye: {courier_name}")
    
    return results


async def add_shift_violation(
    company_id: str,
    courier_id: str,
    courier_name: str,
    violation_type: str,
    description: str,
    order_id: str = None
):
    """
    Vardiya ihlali kaydı ekler.
    """
    violation = {
        "id": str(__import__("uuid").uuid4()),
        "company_id": company_id,
        "courier_id": courier_id,
        "courier_name": courier_name,
        "type": violation_type,
        "description": description,
        "order_id": order_id,
        "created_at": datetime.now(timezone.utc).isoformat(),
        "resolved": False
    }
    
    await db.shift_violations.insert_one(violation)
    return violation


async def run_dispatch_cycle(company_id: str) -> Dict:
    """
    Tek bir şirket için dispatch döngüsünü çalıştırır.
    
    EN İYİ EŞLEŞME MODU:
    - Her kurye için tüm uygun siparişlere bakılır
    - En düşük skorlu (en iyi eşleşen) sipariş atanır
    - Bu sayede "ilk gelen alır" yerine "en mantıklı eşleşme" yapılır
    
    Returns:
        {"processed": int, "assigned": int, "waiting": int, "errors": int}
    """
    from .detour import calculate_order_match_score
    
    settings = await get_dispatch_settings(company_id)
    
    # Otomatik atama kapalıysa çık
    if not settings.get("enabled"):
        return {"skipped": True, "reason": "Otomatik atama kapalı"}
    
    stats = {"processed": 0, "assigned": 0, "waiting": 0, "no_courier": 0, "errors": 0, "auto_cancelled": 0}
    
    # Bu döngüde atanan siparişleri takip et
    assigned_in_this_cycle = {}
    assigned_order_ids = set()  # Atanan sipariş ID'leri
    
    # Önce onaylanmayan siparişleri kontrol et ve iptal et
    cancelled_results = await check_unconfirmed_orders(company_id, settings)
    stats["auto_cancelled"] = len(cancelled_results)
    
    # Bekleme modundaki siparişleri kontrol et
    waiting_results = await check_waiting_orders(company_id, settings)
    for result in waiting_results:
        if "assigned" in result.get("action", ""):
            stats["assigned"] += 1
            courier_id = result.get("courier_id")
            delivery_loc = result.get("delivery_location")
            order_id = result.get("order_id")
            if courier_id:
                if courier_id not in assigned_in_this_cycle:
                    assigned_in_this_cycle[courier_id] = []
                assigned_in_this_cycle[courier_id].append(delivery_loc)
            if order_id:
                assigned_order_ids.add(order_id)
    
    # Hazır siparişleri al
    ready_orders = await get_ready_orders(company_id)
    stats["processed"] = len(ready_orders)
    
    # Ayarları çıkar
    max_detour = settings.get("max_detour", 700)
    same_location_radius = settings.get("same_location_radius", 30)
    same_location_max_packages = settings.get("same_location_max_packages", 10)
    angle_check_enabled = settings.get("angle_check_enabled", True)
    angle_skip_distance = settings.get("angle_skip_distance", 1000)
    max_angle_diff = settings.get("max_angle_diff", 90)
    detour_check_enabled = settings.get("detour_check_enabled", True)
    detour_skip_distance = settings.get("detour_skip_distance", 500)
    
    # EN İYİ EŞLEŞME DÖNGÜSÜ
    # Her iterasyonda en iyi kurye-sipariş eşleşmesini bul ve ata
    max_iterations = len(ready_orders) * 2  # Sonsuz döngü koruması
    iteration = 0
    
    while iteration < max_iterations:
        iteration += 1
        best_match = None
        best_score = float('inf')
        
        # Henüz atanmamış siparişleri filtrele
        unassigned_orders = [o for o in ready_orders if o.get("id") not in assigned_order_ids]
        
        if not unassigned_orders:
            break  # Tüm siparişler atandı
        
        # Her sipariş için en iyi kuryeyi bul ve skorla
        for order in unassigned_orders:
            restaurant_id = order.get("restaurant_id")
            restaurant_location = order.get("restaurant_location")
            delivery_location = order.get("delivery_location")
            payment_method = order.get("payment_method")  # Ödeme türü
            
            if not restaurant_location:
                continue
            
            # Bu sipariş için uygun kuryeleri getir
            idle_couriers, pickup_couriers, one_on_way_couriers = await get_eligible_couriers(
                company_id,
                target_restaurant_id=restaurant_id,
                target_restaurant_location=restaurant_location,
                target_delivery_location=delivery_location,
                max_detour=max_detour,
                assigned_in_this_cycle=assigned_in_this_cycle,
                same_location_radius=same_location_radius,
                same_location_max_packages=same_location_max_packages,
                angle_check_enabled=angle_check_enabled,
                angle_skip_distance=angle_skip_distance,
                max_angle_diff=max_angle_diff,
                detour_check_enabled=detour_check_enabled,
                detour_skip_distance=detour_skip_distance,
                order_payment_method=payment_method
            )
            
            all_couriers = idle_couriers + pickup_couriers
            
            for courier_data in all_couriers:
                courier = courier_data.get("courier")
                courier_id = courier.get("id")
                active_orders = courier_data.get("active_orders", [])
                
                # Mevcut teslimat konumu (varsa)
                existing_delivery = None
                if active_orders:
                    existing_delivery = active_orders[0].get("delivery_location")
                elif courier_id in assigned_in_this_cycle and assigned_in_this_cycle[courier_id]:
                    existing_delivery = assigned_in_this_cycle[courier_id][0]
                
                # Skor hesapla
                score, reason = calculate_order_match_score(
                    restaurant_location,
                    existing_delivery,
                    delivery_location,
                    max_detour
                )
                
                # En iyi eşleşmeyi kaydet
                if score < best_score:
                    best_score = score
                    best_match = {
                        "order": order,
                        "courier": courier,
                        "score": score,
                        "reason": reason
                    }
        
        # En iyi eşleşme bulunduysa ata
        if best_match and best_score < 99999:
            order = best_match["order"]
            courier = best_match["courier"]
            courier_data = {"courier": courier, "type": "best_match", "score": best_score}
            
            result = await assign_order_to_courier(
                order,
                courier_data,
                f"En iyi eşleşme (skor: {best_score:.0f})"
            )
            
            if result.get("success"):
                stats["assigned"] += 1
                courier_id = courier.get("id")
                assigned_order_ids.add(order.get("id"))
                
                if courier_id not in assigned_in_this_cycle:
                    assigned_in_this_cycle[courier_id] = []
                assigned_in_this_cycle[courier_id].append(order.get("delivery_location"))
                
                logger.info(f"Dispatch: En iyi eşleşme - Order {order.get('id')[:8]} → Courier {courier.get('name')} (skor: {best_score:.0f})")
            else:
                stats["errors"] += 1
        else:
            # Uygun eşleşme bulunamadı, döngüden çık
            break
    
    # Atanamayan siparişleri say
    unassigned_count = len([o for o in ready_orders if o.get("id") not in assigned_order_ids])
    stats["no_courier"] = unassigned_count
    
    return stats


async def run_all_companies_dispatch():
    """
    Tüm şirketler için dispatch döngüsünü çalıştırır.
    Scheduler tarafından çağrılır.
    """
    companies = await db.companies.find(
        {"auto_dispatch_settings.enabled": True},
        {"_id": 0, "id": 1, "name": 1}
    ).to_list(100)
    
    total_stats = {"companies": 0, "assigned": 0, "waiting": 0}
    
    for company in companies:
        company_id = company.get("id")
        try:
            stats = await run_dispatch_cycle(company_id)
            if not stats.get("skipped"):
                total_stats["companies"] += 1
                total_stats["assigned"] += stats.get("assigned", 0)
                total_stats["waiting"] += stats.get("waiting", 0)
        except Exception as e:
            logger.error(f"Dispatch error for company {company_id}: {e}")
    
    if total_stats["assigned"] > 0 or total_stats["waiting"] > 0:
        logger.info(f"Dispatch cycle completed: {total_stats}")
    
    return total_stats
