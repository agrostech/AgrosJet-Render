"""
Paket Havuzu filtreleme testleri:
- Ödeme yöntemi filtresi
- Restoran engel filtresi
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
    test_rest_id = f"test-rest-pool-{uuid.uuid4().hex[:6]}"
    now = datetime.now(TURKEY_TZ)
    prep_end = now + timedelta(minutes=2)  # 2dk kalan (eşik 10dk altı)

    # Havuz ayarları aktif
    await db.system_settings.update_one(
        {"type": "pool_settings", "company_id": company_id},
        {"$set": {"type": "pool_settings", "company_id": company_id, "enabled": True,
                  "show_pending": True, "show_ready": True, "pending_threshold_minutes": 10,
                  "max_courier_distance": 50000}},
        upsert=True
    )

    # Test restoran oluştur (kurye engellenmiş)
    await db.restaurants.insert_one({
        "id": test_rest_id,
        "name": "Test Engelli Restoran",
        "company_id": company_id,
        "blocked_couriers": [courier_id],
    })

    # --- TEST 1: Ödeme yöntemi filtresi ---
    # Kuryenin sadece cash ve card izni var (online kapalı)
    await db.couriers.update_one(
        {"id": courier_id},
        {"$set": {"allowed_payment_methods": ["cash", "card"]}}
    )

    # Online ödemeli sipariş
    order_online = f"pool-online-{uuid.uuid4().hex[:6]}"
    await db.orders.insert_one({
        "id": order_online, "status": "preparing", "courier_id": None,
        "company_id": company_id, "restaurant_id": "test-rest-normal",
        "restaurant_name": "Normal Restoran", "customer_name": "Online Müşteri",
        "total_amount": 100, "payment_method": "online",
        "preparation_end_at": prep_end.isoformat(),
        "created_at": now.isoformat(), "updated_at": now.isoformat(),
    })

    # Nakit ödemeli sipariş
    order_cash = f"pool-cash-{uuid.uuid4().hex[:6]}"
    await db.orders.insert_one({
        "id": order_cash, "status": "preparing", "courier_id": None,
        "company_id": company_id, "restaurant_id": "test-rest-normal",
        "restaurant_name": "Normal Restoran", "customer_name": "Nakit Müşteri",
        "total_amount": 80, "payment_method": "cash",
        "preparation_end_at": prep_end.isoformat(),
        "created_at": now.isoformat(), "updated_at": now.isoformat(),
    })

    from routers.pool import get_pool_orders
    result = await get_pool_orders(company_id, courier_id=courier_id)
    pool_ids = [o["id"] for o in result["orders"]]

    assert order_cash in pool_ids, f"Nakit sipariş havuzda olmalı!"
    assert order_online not in pool_ids, f"Online sipariş havuzda OLMAMALI (kurye izni yok)!"
    print("[OK] ✅ Ödeme yöntemi filtresi çalışıyor: online engellendi, nakit gösteriliyor")

    # --- TEST 2: Restoran engel filtresi ---
    order_blocked = f"pool-blocked-{uuid.uuid4().hex[:6]}"
    await db.orders.insert_one({
        "id": order_blocked, "status": "preparing", "courier_id": None,
        "company_id": company_id, "restaurant_id": test_rest_id,
        "restaurant_name": "Engelli Restoran", "customer_name": "Engel Müşteri",
        "total_amount": 60, "payment_method": "cash",
        "preparation_end_at": prep_end.isoformat(),
        "created_at": now.isoformat(), "updated_at": now.isoformat(),
    })

    result2 = await get_pool_orders(company_id, courier_id=courier_id)
    pool_ids2 = [o["id"] for o in result2["orders"]]

    assert order_blocked not in pool_ids2, f"Engellenmiş restoran siparişi havuzda OLMAMALI!"
    assert order_cash in pool_ids2, f"Normal sipariş hala havuzda olmalı"
    print("[OK] ✅ Restoran engel filtresi çalışıyor: engellenmiş restoran siparişi gizlendi")

    # Temizlik
    await db.orders.delete_many({"id": {"$in": [order_online, order_cash, order_blocked]}})
    await db.restaurants.delete_one({"id": test_rest_id})
    await db.couriers.update_one(
        {"id": courier_id},
        {"$set": {"allowed_payment_methods": ["cash", "card", "online", "meal_card", "online_meal_card"]}}
    )
    print("[OK] Temizlik tamamlandı")

    print()
    print("=" * 55)
    print("✅ TÜM FİLTRELEME TESTLERİ BAŞARILI")
    print("=" * 55)
    return True

if __name__ == "__main__":
    ok = asyncio.run(test())
    sys.exit(0 if ok else 1)
