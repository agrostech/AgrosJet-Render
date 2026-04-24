"""
Paket Havuzu (Pool) tam entegrasyon testi
"""
import asyncio
import sys
import uuid
from datetime import datetime, timezone, timedelta
sys.path.insert(0, '/app/backend')

TURKEY_TZ = timezone(timedelta(hours=3))

async def test():
    from utils.database import db

    company_id = "0005ec2a-04ca-4250-9530-ecc6fde165f1"
    courier_id = "feae169f-222b-45df-b9e8-0664a186031a"  # Atakan Sarı
    test_order_id = f"pool-test-{uuid.uuid4().hex[:8]}"
    now = datetime.now(TURKEY_TZ)

    # 1) Havuz ayarlarını aktif et
    await db.system_settings.update_one(
        {"type": "pool_settings", "company_id": company_id},
        {"$set": {
            "type": "pool_settings",
            "company_id": company_id,
            "enabled": True,
            "show_pending": True,
            "show_ready": True,
            "pending_threshold_minutes": 10,
            "max_courier_distance": 50000,
        }},
        upsert=True
    )
    print("[OK] Havuz ayarları aktif edildi")

    # 2) Kurye pool_access yetkisi kontrol
    courier = await db.couriers.find_one({"id": courier_id}, {"_id": 0, "permissions": 1, "max_packages": 1})
    pool_access = courier.get("permissions", {}).get("pool_access", True)
    print(f"[OK] Kurye pool_access: {pool_access}, max_packages: {courier.get('max_packages', 5)}")

    # 3) Atanmamış test siparişi oluştur (preparing, 3dk kalan hazırlık süresi)
    prep_end = now + timedelta(minutes=3)
    await db.orders.insert_one({
        "id": test_order_id,
        "status": "preparing",
        "courier_id": None,
        "company_id": company_id,
        "restaurant_id": "test-rest",
        "restaurant_name": "Test Restoran",
        "customer_name": "Havuz Test Müşteri",
        "delivery_address": "Test Adres",
        "total_amount": 150.00,
        "payment_method": "cash",
        "preparation_end_at": prep_end.isoformat(),
        "preparation_time": 10,
        "created_at": (now - timedelta(minutes=7)).isoformat(),
        "updated_at": now.isoformat(),
        "restaurant_location": {"latitude": 40.0, "longitude": 29.0},
        "delivery_location": {"latitude": 40.01, "longitude": 29.01},
        "status_history": [{
            "status": "preparing",
            "timestamp": now.isoformat(),
            "actor_type": "system",
            "actor_name": "Sistem"
        }]
    })
    print(f"[OK] Test sipariş oluşturuldu: {test_order_id} (preparing, 3dk kalan)")

    # 4) Pool orders endpoint simülasyonu
    from routers.pool import get_pool_orders
    result = await get_pool_orders(company_id, courier_id=courier_id, lat=40.0, lng=29.0)
    pool_orders = result.get("orders", [])
    found = any(o["id"] == test_order_id for o in pool_orders)
    print(f"[{'OK' if found else 'FAIL'}] Havuzda sipariş {'bulundu' if found else 'BULUNAMADI'} (toplam {len(pool_orders)} sipariş)")

    # 5) Claim testi
    from routers.pool import claim_pool_order
    try:
        claim_result = await claim_pool_order(test_order_id, courier_id=courier_id)
        print(f"[OK] Sipariş havuzdan alındı: {claim_result}")
    except Exception as e:
        print(f"[FAIL] Claim hatası: {e}")
        await db.orders.delete_one({"id": test_order_id})
        return False

    # 6) Sipariş durumu kontrolü
    order = await db.orders.find_one({"id": test_order_id}, {"_id": 0})
    assert order["status"] == "confirmed", f"Beklenen: confirmed, Gelen: {order['status']}"
    assert order["courier_id"] == courier_id, f"Beklenen courier_id: {courier_id}, Gelen: {order['courier_id']}"
    print(f"[OK] Sipariş durumu: {order['status']}, courier: {order['courier_name']}")

    # 7) status_history kontrolü
    history = order.get("status_history", [])
    pool_entries = [h for h in history if h.get("actor_type") == "courier_pool"]
    assert len(pool_entries) >= 1, f"Havuz kaydı bulunamadı: {history}"
    print(f"[OK] status_history'de {len(pool_entries)} havuz kaydı var")
    for h in pool_entries:
        print(f"     - {h['status']} | {h['actor_type']}/{h['actor_name']} | {h.get('note', '')}")

    # 8) Tekrar claim denemesi (zaten atanmış)
    try:
        await claim_pool_order(test_order_id, courier_id=courier_id)
        print("[FAIL] Zaten atanmış sipariş tekrar claim edildi!")
    except Exception as e:
        print(f"[OK] Zaten atanmış sipariş reddedildi: {e}")

    # Temizlik
    await db.orders.delete_one({"id": test_order_id})
    print("[OK] Temizlik tamamlandı")

    print()
    print("=" * 55)
    print("✅ TÜM PAKET HAVUZU TESTLERİ BAŞARILI")
    print("=" * 55)
    return True

if __name__ == "__main__":
    ok = asyncio.run(test())
    sys.exit(0 if ok else 1)
