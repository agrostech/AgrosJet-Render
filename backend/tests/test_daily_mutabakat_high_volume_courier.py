"""
Regression testi: Yüksek hacimli kurye (1000+ teslim) için günlük mutabakat sorgusu

Bug history (10 May 2026):
- Nazif Toprak'ın 1111 teslim edilmiş siparişi vardı
- get_order_totals_for_courier() içindeki .to_list(1000) limiti son siparişleri
  kestiği için Cumartesi 299.95₺ nakit (Fast Coffee) admin Kurye Mütabakat
  ekranında görünmüyordu
- Fix: query'ye delivered_at range filter + to_list(None)

Bu test 1500 sahte teslim edilen sipariş üretir ve son tarihteki nakit
toplamının doğru raporlandığını doğrular.
"""
import asyncio
import os
import sys
from datetime import datetime, timedelta, timezone

import pytest

sys.path.insert(0, os.path.join(os.path.dirname(__file__), ".."))


@pytest.mark.asyncio
async def test_high_volume_courier_cash_total_not_truncated(monkeypatch):
    # Use isolated test DB
    test_db_name = "agrosjet_test_mutabakat_volume"
    monkeypatch.setenv("DB_NAME", test_db_name)

    # Force fresh import
    for mod in list(sys.modules):
        if mod.startswith("routers") or mod == "database":
            sys.modules.pop(mod, None)

    from utils.database import db
    from routers.daily_mutabakat import get_order_totals_for_courier

    # Cleanup
    await db.orders.delete_many({})
    await db.restaurants.delete_many({})
    await db.companies.delete_many({})

    company_id = "co-test"
    courier_id = "cr-test"
    restaurant_id = "r-test"

    await db.companies.insert_one({
        "id": company_id,
        "name": "Test",
        "opening_time": "06:00",
        "closing_time": "06:00",
    })
    await db.restaurants.insert_one({
        "id": restaurant_id,
        "company_id": company_id,
        "name": "Test Rest",
        "collection_settings": {
            "cash_collection": "courier",
            "card_collection": "courier",
            "meal_card_collection": "courier",
        },
    })

    tr = timezone(timedelta(hours=3))
    target_date = datetime(2026, 5, 9, 14, 0, tzinfo=tr)
    # 1500 OLD orders (older than target date) — these would fill .to_list(1000) before fix
    old_base = target_date - timedelta(days=10)
    old_docs = []
    for i in range(1500):
        old_docs.append({
            "id": f"old-{i}",
            "company_id": company_id,
            "courier_id": courier_id,
            "restaurant_id": restaurant_id,
            "restaurant_name": "Test Rest",
            "status": "delivered",
            "payment_method": "cash",
            "total_amount": 100.0,
            "delivered_at": (old_base - timedelta(minutes=i)).isoformat(),
        })
    await db.orders.insert_many(old_docs)

    # 1 RECENT cash order on target date — bug would skip this since it falls past first 1000 in insertion order
    await db.orders.insert_one({
        "id": "recent-cash-1",
        "company_id": company_id,
        "courier_id": courier_id,
        "restaurant_id": restaurant_id,
        "restaurant_name": "Test Rest",
        "status": "delivered",
        "payment_method": "cash",
        "total_amount": 299.95,
        "delivered_at": target_date.isoformat(),
    })

    start_dt = datetime(2026, 5, 9, 6, 0, tzinfo=tr)
    end_dt = datetime(2026, 5, 10, 6, 0, tzinfo=tr)
    res = await get_order_totals_for_courier(company_id, courier_id, start_dt, end_dt)

    assert res["order_count"] == 1, f"Expected 1 order, got {res['order_count']}"
    assert res["cash_total"] == 299.95, f"Expected cash 299.95, got {res['cash_total']}"

    # Cleanup
    await db.orders.delete_many({})
    await db.restaurants.delete_many({})
    await db.companies.delete_many({})


if __name__ == "__main__":
    asyncio.run(test_high_volume_courier_cash_total_not_truncated.__wrapped__(type("M", (), {"setenv": lambda *a, **k: os.environ.update({a[1]: a[2]})})()))
    print("PASS")
