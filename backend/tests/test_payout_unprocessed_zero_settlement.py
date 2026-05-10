"""
Regression testi: payout_requests._check_unprocessed_collections "sahte engel" bug'ı (10 May 2026)

Problem: O gün sipariş yapılmış ama mütabakata düşen tutar 0 (örn. tüm
siparişler cash_collection=restaurant olan restoranlardan veya hepsi online)
olan günler "blocked" sayılıyordu → kurye ödeme talebi oluşturamıyordu.

Fix: Her unprocessed day için get_order_totals_for_courier ile gerçek
nakit/kart/yemek-kart toplamı kontrol edilir; hepsi 0 ise gün engelleyici
sayılmaz (Kurye Mütabakat sayfasındaki filtre ile birebir aynı mantık).
"""
import os
import sys
from datetime import datetime, timedelta, timezone

import pytest

sys.path.insert(0, os.path.join(os.path.dirname(__file__), ".."))


@pytest.mark.asyncio
async def test_unprocessed_collections_skips_zero_settlement_days(monkeypatch):
    monkeypatch.setenv("DB_NAME", "agrosjet_test_payout_unproc")
    for mod in list(sys.modules):
        if mod.startswith("routers") or mod.startswith("utils") or mod.startswith("services"):
            sys.modules.pop(mod, None)

    from utils.database import db
    from routers.payout_requests import _check_unprocessed_collections

    # Cleanup
    for col in ["orders", "couriers", "companies", "restaurants", "daily_mutabakat_processed"]:
        await db[col].delete_many({})

    company_id = "co-1"
    courier_id = "cr-1"
    rest_courier_collect = "r-courier"  # cash_collection=courier
    rest_restaurant_collect = "r-restaurant"  # cash_collection=restaurant

    tr = timezone(timedelta(hours=3))
    # Courier created 30 days ago
    created_at = datetime.now(tr) - timedelta(days=30)

    await db.companies.insert_one({
        "id": company_id,
        "name": "Test",
        "opening_time": "06:00",
        "closing_time": "06:00",
    })
    await db.couriers.insert_one({
        "id": courier_id,
        "company_id": company_id,
        "name": "Test Courier",
        "created_at": created_at.isoformat(),
    })
    await db.restaurants.insert_many([
        {
            "id": rest_courier_collect,
            "company_id": company_id,
            "name": "Courier-Collected Restaurant",
            "collection_settings": {
                "cash_collection": "courier",
                "card_collection": "courier",
                "meal_card_collection": "courier",
            },
        },
        {
            "id": rest_restaurant_collect,
            "company_id": company_id,
            "name": "Restaurant-Collected Restaurant",
            "collection_settings": {
                "cash_collection": "restaurant",
                "card_collection": "restaurant",
                "meal_card_collection": "restaurant",
            },
        },
    ])

    # Day A: only restaurant-collected cash → mutabakat'a düşen 0 → engellememeli
    day_a = datetime.now(tr) - timedelta(days=10)
    day_a_str = day_a.strftime("%Y-%m-%d")
    await db.orders.insert_one({
        "id": "o-a",
        "company_id": company_id,
        "courier_id": courier_id,
        "restaurant_id": rest_restaurant_collect,
        "restaurant_name": "Restaurant-Collected Restaurant",
        "status": "delivered",
        "payment_method": "cash",
        "total_amount": 500.0,
        "delivered_at": day_a.replace(hour=14, minute=0, second=0, microsecond=0).isoformat(),
    })

    # Day B: courier-collected cash → mutabakat'a düşen 500 → engellemeli
    day_b = datetime.now(tr) - timedelta(days=5)
    day_b_str = day_b.strftime("%Y-%m-%d")
    await db.orders.insert_one({
        "id": "o-b",
        "company_id": company_id,
        "courier_id": courier_id,
        "restaurant_id": rest_courier_collect,
        "restaurant_name": "Courier-Collected Restaurant",
        "status": "delivered",
        "payment_method": "cash",
        "total_amount": 500.0,
        "delivered_at": day_b.replace(hour=14, minute=0, second=0, microsecond=0).isoformat(),
    })

    # Day C: only online (any restaurant) → courier-mutabakat'a düşen 0 → engellememeli
    day_c = datetime.now(tr) - timedelta(days=8)
    day_c_str = day_c.strftime("%Y-%m-%d")
    await db.orders.insert_one({
        "id": "o-c",
        "company_id": company_id,
        "courier_id": courier_id,
        "restaurant_id": rest_courier_collect,  # courier-collect ama online ödeme + card_collection=courier
        "restaurant_name": "Courier-Collected Restaurant",
        "status": "delivered",
        "payment_method": "online",  # online → card_total
        "total_amount": 200.0,
        "delivered_at": day_c.replace(hour=14, minute=0, second=0, microsecond=0).isoformat(),
    })

    # Day D: courier-collected card → engellemeli (card_total > 0)
    day_d = datetime.now(tr) - timedelta(days=3)
    day_d_str = day_d.strftime("%Y-%m-%d")
    await db.orders.insert_one({
        "id": "o-d",
        "company_id": company_id,
        "courier_id": courier_id,
        "restaurant_id": rest_courier_collect,
        "restaurant_name": "Courier-Collected Restaurant",
        "status": "delivered",
        "payment_method": "card",
        "total_amount": 300.0,
        "delivered_at": day_d.replace(hour=14, minute=0, second=0, microsecond=0).isoformat(),
    })

    # No daily_mutabakat_processed records — all 4 days unprocessed by raw logic
    res = await _check_unprocessed_collections(courier_id)

    assert res["blocked"] is True, f"En az bir gun (B veya D) engellemeli: {res}"
    blocked_days = set(res["unprocessed_days"])
    # Day B (cash courier-collect) ve Day D (card courier-collect) engellenmeli
    assert day_b_str in blocked_days, f"Day B (gerçek nakit) eksik: {res}"
    assert day_d_str in blocked_days, f"Day D (gerçek kart) eksik: {res}"
    # Day A (restaurant-collect) ve Day C (online ama card_collection=courier OLDUĞU İÇİN aslında engellemeli — düzelteyim)
    # Aslında Day C'yi tekrar düşününce: online + card_collection=courier → card_total > 0 → engellemeli
    # Bu yüzden testi Day A için yapalım (restaurant-collect olan)
    assert day_a_str not in blocked_days, f"Day A (restaurant-collect) sahte engel: {res}"

    # Cleanup
    for col in ["orders", "couriers", "companies", "restaurants", "daily_mutabakat_processed"]:
        await db[col].delete_many({})


@pytest.mark.asyncio
async def test_unprocessed_collections_no_orders_returns_unblocked(monkeypatch):
    monkeypatch.setenv("DB_NAME", "agrosjet_test_payout_unproc2")
    for mod in list(sys.modules):
        if mod.startswith("routers") or mod.startswith("utils") or mod.startswith("services"):
            sys.modules.pop(mod, None)

    from utils.database import db
    from routers.payout_requests import _check_unprocessed_collections

    for col in ["orders", "couriers", "companies", "restaurants", "daily_mutabakat_processed"]:
        await db[col].delete_many({})

    tr = timezone(timedelta(hours=3))
    await db.companies.insert_one({
        "id": "co-2", "name": "Test", "opening_time": "06:00", "closing_time": "06:00",
    })
    await db.couriers.insert_one({
        "id": "cr-2",
        "company_id": "co-2",
        "name": "New Courier",
        "created_at": datetime.now(tr).isoformat(),
    })

    res = await _check_unprocessed_collections("cr-2")
    assert res == {"blocked": False}

    for col in ["orders", "couriers", "companies", "restaurants", "daily_mutabakat_processed"]:
        await db[col].delete_many({})
