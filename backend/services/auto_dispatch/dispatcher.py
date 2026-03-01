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
    
    # Uygun kuryeleri getir (restoran grubu + detour kontrolü dahil)
    idle_couriers, pickup_couriers, one_on_way_couriers = await get_eligible_couriers(
        company_id, 
        target_restaurant_id=restaurant_id,
        target_restaurant_location=restaurant_location,
        target_delivery_location=delivery_location,
        max_detour=max_detour,
        assigned_in_this_cycle=assigned_in_this_cycle
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
    # D_return_min ≤ D_idle_min + MesafeToleransı ?
    if d_return_min <= d_idle_min + distance_tolerance:
        # 1-yolda kurye daha avantajlı - bekleme moduna al
        courier = best_return["courier"]
        await set_order_waiting(order_id, courier["id"], courier["name"])
        
        await log_dispatch_action(
            company_id=company_id,
            order_id=order_id,
            courier_id=courier["id"],
            action="waiting",
            reason=f"D_return({d_return_min:.0f}m) <= D_idle({d_idle_min:.0f}m) + Tolerans({distance_tolerance}m)",
            details={
                "d_return_min": d_return_min,
                "d_idle_min": d_idle_min,
                "distance_tolerance": distance_tolerance
            }
        )
        
        return {"action": "waiting", "courier_id": courier["id"], "reason": f"1-yolda kurye bekleniyor (D_return: {d_return_min:.0f}m)"}
    else:
        # Boş kurye daha avantajlı - direkt ata
        result = await assign_order_to_courier(
            order, 
            best_idle, 
            f"D_return({d_return_min:.0f}m) > D_idle({d_idle_min:.0f}m) + Tolerans({distance_tolerance}m)"
        )
        if result.get("success"):
            return {"action": "assigned", "courier_id": best_idle["courier"]["id"], "reason": f"Boş kurye atandı (D_idle: {d_idle_min:.0f}m)"}
        return {"action": "error", "reason": result.get("error")}


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


async def run_dispatch_cycle(company_id: str) -> Dict:
    """
    Tek bir şirket için dispatch döngüsünü çalıştırır.
    
    Returns:
        {"processed": int, "assigned": int, "waiting": int, "errors": int}
    """
    settings = await get_dispatch_settings(company_id)
    
    # Otomatik atama kapalıysa çık
    if not settings.get("enabled"):
        return {"skipped": True, "reason": "Otomatik atama kapalı"}
    
    stats = {"processed": 0, "assigned": 0, "waiting": 0, "no_courier": 0, "errors": 0}
    
    # Bu döngüde atanan siparişleri takip et (kapasite kontrolü için)
    # {courier_id: atanan_siparis_sayisi}
    assigned_in_this_cycle = {}
    
    # Önce bekleme modundaki siparişleri kontrol et
    waiting_results = await check_waiting_orders(company_id, settings)
    for result in waiting_results:
        if "assigned" in result.get("action", ""):
            stats["assigned"] += 1
            courier_id = result.get("courier_id")
            if courier_id:
                assigned_in_this_cycle[courier_id] = assigned_in_this_cycle.get(courier_id, 0) + 1
    
    # Hazır siparişleri işle (FIFO)
    ready_orders = await get_ready_orders(company_id)
    
    for order in ready_orders:
        stats["processed"] += 1
        result = await process_single_order(order, settings, assigned_in_this_cycle)
        
        action = result.get("action")
        if action == "assigned":
            stats["assigned"] += 1
            courier_id = result.get("courier_id")
            if courier_id:
                assigned_in_this_cycle[courier_id] = assigned_in_this_cycle.get(courier_id, 0) + 1
        elif action == "waiting":
            stats["waiting"] += 1
        elif action == "no_courier":
            stats["no_courier"] += 1
        elif action == "error":
            stats["errors"] += 1
    
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
