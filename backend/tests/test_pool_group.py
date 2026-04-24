"""
Havuz restoran grubu filtresi testi
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

    rest_a = f"rest-a-{uuid.uuid4().hex[:4]}"
    rest_b = f"rest-b-{uuid.uuid4().hex[:4]}"
    rest_c = f"rest-c-{uuid.uuid4().hex[:4]}"
    group_id = f"grp-{uuid.uuid4().hex[:6]}"

    # Temizlik
    await db.orders.delete_many({"id": {"$regex": "^pool-"}})
    await db.orders.update_many(
        {"courier_id": courier_id, "status": {"$in": ["assigned", "confirmed", "on_the_way"]}},
        {"$set": {"status": "cancelled"}}
    )
    await db.couriers.update_one(
        {"id": courier_id},
        {"$set": {"pool_first_claim_at": None, "pool_first_restaurant_id": None,
                  "allowed_payment_methods": ["cash","card","online","meal_card","online_meal_card"]}}
    )

    # Havuz aktif
    await db.system_settings.update_one(
        {"type": "pool_settings", "company_id": company_id},
        {"$set": {"enabled": True, "show_pending": True, "show_ready": True,
                  "pending_threshold_minutes": 60, "max_courier_distance": 100000,
                  "pool_access_duration": 30}},
        upsert=True
    )

    # Restoran grubu: A ve B aynı grupta, C farklı
    await db.restaurant_groups.insert_one({
        "id": group_id, "name": "Test Grup", "company_id": company_id,
        "restaurant_ids": [rest_a, rest_b]
    })

    # 3 sipariş: A'dan (30dk eski), B'den (10dk eski), C'den (20dk eski)
    orders = []
    for rid, rname, age, oid_prefix in [
        (rest_a, "Restoran A (Grup)", 30, "pool-ga"),
        (rest_b, "Restoran B (Grup)", 10, "pool-gb"),
        (rest_c, "Restoran C (Dışarı)", 20, "pool-gc"),
    ]:
        oid = f"{oid_prefix}-{uuid.uuid4().hex[:4]}"
        orders.append(oid)
        await db.orders.insert_one({
            "id": oid, "status": "preparing", "courier_id": None,
            "company_id": company_id, "restaurant_id": rid,
            "restaurant_name": rname, "customer_name": f"Müşteri {rname}",
            "total_amount": 100, "payment_method": "cash",
            "preparation_end_at": (now + timedelta(minutes=2)).isoformat(),
            "created_at": (now - timedelta(minutes=age)).isoformat(),
            "updated_at": now.isoformat(),
        })

    # 1) İlk paket alınmadan → hepsi görünür
    r1 = await get_pool_orders(company_id, courier_id=courier_id)
    r1_ids = [o["id"] for o in r1["orders"]]
    assert len(r1_ids) == 3, f"3 sipariş olmalı, {len(r1_ids)} var"
    print(f"[OK] İlk paket alınmadan: {len(r1_ids)} sipariş (hepsi görünür)")

    # 2) İlk paketi al (Restoran A - en yüksek skor, 30dk eski)
    top_id = r1["orders"][0]["id"]
    assert "pool-ga" in top_id, f"En yüksek skor A olmalı, {top_id}"
    await claim_pool_order(top_id, courier_id=courier_id)
    print(f"[OK] İlk paket alındı: {top_id} (Restoran A)")

    # pool_first_restaurant_id kontrolü
    c = await db.couriers.find_one({"id": courier_id}, {"_id": 0, "pool_first_restaurant_id": 1})
    assert c.get("pool_first_restaurant_id") == rest_a
    print(f"[OK] pool_first_restaurant_id = {rest_a}")

    # 3) Şimdi havuzda sadece aynı gruptaki restoranlar görünmeli (B), C görünmemeli
    r2 = await get_pool_orders(company_id, courier_id=courier_id)
    r2_rests = [o.get("restaurant_name") for o in r2["orders"]]
    r2_ids = [o["id"] for o in r2["orders"]]

    has_b = any("pool-gb" in oid for oid in r2_ids)
    has_c = any("pool-gc" in oid for oid in r2_ids)

    assert has_b, f"Restoran B (aynı grup) görünmeli! Görünenler: {r2_rests}"
    assert not has_c, f"Restoran C (farklı grup) görünmemeli! Görünenler: {r2_rests}"
    print(f"[OK] ✅ Grup filtresi çalışıyor: Görünen = {r2_rests}")

    # 4) Paketleri teslim et → sıfırlama
    await db.orders.update_many(
        {"courier_id": courier_id, "status": {"$in": ["assigned", "confirmed"]}},
        {"$set": {"status": "delivered"}}
    )
    r3 = await get_pool_orders(company_id, courier_id=courier_id)
    assert len(r3["orders"]) == 2, f"Tüm paketler teslim edildi, 2 sipariş görünmeli (B+C)"
    print(f"[OK] ✅ Teslim sonrası sıfırlandı, tüm restoranlar tekrar görünür")

    # Temizlik
    await db.orders.delete_many({"id": {"$regex": "^pool-"}})
    await db.restaurant_groups.delete_one({"id": group_id})
    await db.couriers.update_one(
        {"id": courier_id},
        {"$set": {"pool_first_claim_at": None, "pool_first_restaurant_id": None}}
    )
    print("[OK] Temizlik tamamlandı")

    print()
    print("=" * 55)
    print("✅ RESTORAN GRUBU FİLTRESİ TESTLERİ BAŞARILI")
    print("=" * 55)
    return True

if __name__ == "__main__":
    ok = asyncio.run(test())
    sys.exit(0 if ok else 1)
