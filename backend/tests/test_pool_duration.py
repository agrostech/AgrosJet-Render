"""
Havuz erişim süresi testi
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

    # Temizlik
    await db.orders.delete_many({"id": {"$regex": "^pool-"}})

    # Havuz aktif, erişim süresi 10dk
    await db.system_settings.update_one(
        {"type": "pool_settings", "company_id": company_id},
        {"$set": {"type": "pool_settings", "company_id": company_id, "enabled": True,
                  "show_pending": True, "show_ready": True, "pending_threshold_minutes": 60,
                  "max_courier_distance": 100000, "pool_access_duration": 10}},
        upsert=True
    )

    # Kurye aktif paketini temizle
    await db.orders.update_many(
        {"courier_id": courier_id, "status": {"$in": ["assigned", "confirmed", "on_the_way"]}},
        {"$set": {"status": "cancelled"}}
    )
    await db.couriers.update_one(
        {"id": courier_id},
        {"$set": {"pool_first_claim_at": None, "allowed_payment_methods": ["cash","card","online","meal_card","online_meal_card"]}}
    )

    # Test siparişleri
    order1 = f"pool-dur1-{uuid.uuid4().hex[:6]}"
    order2 = f"pool-dur2-{uuid.uuid4().hex[:6]}"
    for oid, age in [(order1, 20), (order2, 10)]:
        await db.orders.insert_one({
            "id": oid, "status": "preparing", "courier_id": None,
            "company_id": company_id, "restaurant_id": f"rest-{oid}",
            "restaurant_name": f"Restoran {age}dk", "customer_name": f"Müşteri {age}",
            "total_amount": 100, "payment_method": "cash",
            "preparation_end_at": (now + timedelta(minutes=2)).isoformat(),
            "created_at": (now - timedelta(minutes=age)).isoformat(),
            "updated_at": now.isoformat(),
        })

    # 1) İlk paket al → pool_first_claim_at set edilir
    result0 = await get_pool_orders(company_id, courier_id=courier_id)
    assert result0["first_only"] == True
    top_id = result0["orders"][0]["id"]
    await claim_pool_order(top_id, courier_id=courier_id)
    
    courier = await db.couriers.find_one({"id": courier_id}, {"_id": 0, "pool_first_claim_at": 1})
    assert courier.get("pool_first_claim_at") is not None
    print(f"[OK] ✅ İlk claim, pool_first_claim_at kaydedildi: {courier['pool_first_claim_at']}")

    # 2) Süre dolmamışken → havuza erişebilir
    result1 = await get_pool_orders(company_id, courier_id=courier_id)
    assert result1.get("pool_time_expired") is not True
    assert len(result1["orders"]) >= 1
    print(f"[OK] ✅ Süre dolmamış, havuza erişim var ({len(result1['orders'])} sipariş)")

    # 3) pool_first_claim_at'ı 15dk geri al → süre dolmuş
    await db.couriers.update_one(
        {"id": courier_id},
        {"$set": {"pool_first_claim_at": (now - timedelta(minutes=15)).isoformat()}}
    )
    result2 = await get_pool_orders(company_id, courier_id=courier_id)
    assert result2.get("pool_time_expired") == True
    assert len(result2["orders"]) == 0
    print(f"[OK] ✅ Süre doldu, havuz erişimi engellendi: {result2.get('reason')}")

    # 4) Tüm paketleri teslim et → pool_first_claim_at sıfırlanır
    await db.orders.update_many(
        {"courier_id": courier_id, "status": {"$in": ["assigned", "confirmed"]}},
        {"$set": {"status": "delivered"}}
    )
    result3 = await get_pool_orders(company_id, courier_id=courier_id)
    assert result3.get("pool_time_expired") is not True
    assert result3["first_only"] == True  # Yeni tur başladı
    courier2 = await db.couriers.find_one({"id": courier_id}, {"_id": 0, "pool_first_claim_at": 1})
    assert courier2.get("pool_first_claim_at") is None
    print(f"[OK] ✅ Paketler teslim edildi, pool_first_claim_at sıfırlandı, yeni tur")

    # Temizlik
    await db.orders.delete_many({"id": {"$regex": "^pool-"}})
    await db.couriers.update_one({"id": courier_id}, {"$set": {"pool_first_claim_at": None}})

    print()
    print("=" * 55)
    print("✅ HAVUZ ERİŞİM SÜRESİ TESTLERİ BAŞARILI")
    print("=" * 55)
    return True

if __name__ == "__main__":
    ok = asyncio.run(test())
    sys.exit(0 if ok else 1)
