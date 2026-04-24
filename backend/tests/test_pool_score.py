"""
Havuz skor sıralama + ilk paket zorunluluğu testi
"""
import asyncio
import sys
import uuid
from datetime import datetime, timezone, timedelta
sys.path.insert(0, '/app/backend')

TURKEY_TZ = timezone(timedelta(hours=3))

async def test():
    from utils.database import db
    from routers.pool import get_pool_orders, claim_pool_order

    company_id = "0005ec2a-04ca-4250-9530-ecc6fde165f1"
    courier_id = "feae169f-222b-45df-b9e8-0664a186031a"
    now = datetime.now(TURKEY_TZ)

    # Havuz aktif
    await db.system_settings.update_one(
        {"type": "pool_settings", "company_id": company_id},
        {"$set": {"type": "pool_settings", "company_id": company_id, "enabled": True,
                  "show_pending": True, "show_ready": True, "pending_threshold_minutes": 60,
                  "max_courier_distance": 100000}},
        upsert=True
    )

    # Kurye ödeme yöntemlerini açık tut
    await db.couriers.update_one(
        {"id": courier_id},
        {"$set": {"allowed_payment_methods": ["cash", "card", "online", "meal_card", "online_meal_card"]}}
    )

    # Kuryenin tüm aktif siparişlerini temizle
    await db.orders.update_many(
        {"courier_id": courier_id, "status": {"$in": ["assigned", "confirmed", "on_the_way"]}},
        {"$set": {"status": "cancelled"}}
    )

    # 2 test sipariş: biri 30dk eski (uzak), biri 5dk eski (yakın)
    order_old = f"pool-old-{uuid.uuid4().hex[:6]}"
    order_new = f"pool-new-{uuid.uuid4().hex[:6]}"

    await db.orders.insert_many([
        {
            "id": order_old, "status": "preparing", "courier_id": None,
            "company_id": company_id, "restaurant_id": "rest-uzak",
            "restaurant_name": "Uzak Restoran", "customer_name": "Eski Müşteri",
            "total_amount": 200, "payment_method": "cash",
            "preparation_end_at": (now + timedelta(minutes=2)).isoformat(),
            "created_at": (now - timedelta(minutes=30)).isoformat(),
            "updated_at": now.isoformat(),
            "restaurant_location": {"latitude": 40.5, "longitude": 29.5},
        },
        {
            "id": order_new, "status": "preparing", "courier_id": None,
            "company_id": company_id, "restaurant_id": "rest-yakin",
            "restaurant_name": "Yakın Restoran", "customer_name": "Yeni Müşteri",
            "total_amount": 100, "payment_method": "cash",
            "preparation_end_at": (now + timedelta(minutes=2)).isoformat(),
            "created_at": (now - timedelta(minutes=5)).isoformat(),
            "updated_at": now.isoformat(),
            "restaurant_location": {"latitude": 40.01, "longitude": 29.01},
        },
    ])
    print("[OK] 2 test sipariş oluşturuldu (30dk eski uzak, 5dk eski yakın)")

    # Havuz listesini al (kurye 40.0, 29.0 konumunda)
    result = await get_pool_orders(company_id, courier_id=courier_id, lat=40.0, lng=29.0)
    orders = result["orders"]
    first_only = result["first_only"]

    assert len(orders) >= 2, f"Havuzda 2 sipariş olmalı, {len(orders)} var"
    assert first_only == True, f"Aktif paketi yok, first_only True olmalı, {first_only}"
    print(f"[OK] first_only = {first_only}")

    # Skor kontrolü: 30dk eski sipariş daha yüksek skora sahip olmalı
    scores = {o["id"]: o.get("pool_score", 0) for o in orders if o["id"] in [order_old, order_new]}
    print(f"[OK] Skorlar: eski={scores.get(order_old)}, yeni={scores.get(order_new)}")
    assert scores.get(order_old, 0) > scores.get(order_new, 0), "Eski sipariş daha yüksek skorlu olmalı!"
    assert orders[0]["id"] == order_old, f"İlk sırada eski sipariş olmalı, {orders[0]['id']} var"
    print(f"[OK] ✅ Eski sipariş (30dk) birinci sırada")

    # İlk paket kuralı: yeni siparişi almaya çalış → reddedilmeli
    try:
        await claim_pool_order(order_new, courier_id=courier_id)
        print("[FAIL] ❌ Yeni sipariş alınabildi, engellenmedi!")
        success = False
    except Exception as e:
        assert "öncelikli" in str(e).lower() or "#1" in str(e).lower() or "ilk" in str(e).lower(), f"Beklenmeyen hata: {e}"
        print(f"[OK] ✅ İlk paket kuralı çalıştı: {e}")
        success = True

    # Doğru siparişi al (eski)
    await claim_pool_order(order_old, courier_id=courier_id)
    print(f"[OK] ✅ Eski sipariş başarıyla alındı")

    # Artık first_only False olmalı (1 aktif paket var)
    result2 = await get_pool_orders(company_id, courier_id=courier_id, lat=40.0, lng=29.0)
    assert result2["first_only"] == False, f"1 aktif paket var, first_only False olmalı"
    print(f"[OK] ✅ İlk paketten sonra first_only = False, özgür seçim")

    # Temizlik
    await db.orders.delete_many({"id": {"$in": [order_old, order_new]}})
    await db.orders.update_many(
        {"courier_id": courier_id, "status": "cancelled"},
        {"$set": {"status": "delivered"}}
    )
    print("[OK] Temizlik tamamlandı")

    print()
    print("=" * 55)
    print("✅ TÜM SKOR + İLK PAKET TESTLERİ BAŞARILI")
    print("=" * 55)
    return success

if __name__ == "__main__":
    ok = asyncio.run(test())
    sys.exit(0 if ok else 1)
