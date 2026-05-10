"""
Regression testi: Adisyo Scrape (Chrome Extension) endpoint'i

Mevcut Adisyo webhook entegrasyonundan TAMAMEN AYRI çalışır.
"""
import os
import sys
from datetime import datetime, timedelta, timezone

import pytest

sys.path.insert(0, os.path.join(os.path.dirname(__file__), ".."))


SAMPLE_ORDER = {
    "id": 411395562,
    "orderNumber": 308,
    "status": 2,
    "totalAmount": 390.00,
    "paymentType": 29,
    "paymentTypeName": "YS Online",
    "externalAppId": 21,
    "insertDate": "2026-05-10T22:20:03.157",
    "restaurantCustomer": {
        "name": "Yusuf Furkan",
        "surname": "KALKAN",
        "phone": "5054304865",
        "address": "Konak Burdur Mahallesi Gazi Caddesi",
        "note": "8 | gelince arar mısınız",
        "town": "Konak Burdur",
    },
    "paramObject": {"coordinate": "37,71871|30,28532"},
}


@pytest.mark.asyncio
async def test_scrape_convert_basic_payload(monkeypatch):
    monkeypatch.setenv("DB_NAME", "agrosjet_test_adisyo_scrape_unit")
    for mod in list(sys.modules):
        if mod.startswith("routers") or mod.startswith("utils") or mod.startswith("services"):
            sys.modules.pop(mod, None)

    from routers.adisyo_scrape import _convert_scraped_to_shiftjet

    restaurant = {
        "id": "r-1",
        "name": "Test Restaurant",
        "company_id": "co-1",
        "latitude": 37.7,
        "longitude": 30.28,
        "pricing_type": "per_package",
        "per_package_price": 50,
        "km_ranges": [],
        "kdv_rate": 10,
    }

    out = _convert_scraped_to_shiftjet(SAMPLE_ORDER, restaurant)

    assert out["adisyo_order_id"] == 411395562
    assert out["order_number"] == "ADY-308"
    assert out["customer_name"] == "Yusuf Furkan KALKAN"
    assert out["customer_phone"] == "05054304865"
    assert out["total_amount"] == 390.0
    assert out["payment_method"] == "online"  # YS Online → online
    assert out["external_app_id"] == 21
    assert out["external_app_name"] == "YemekSepeti DeliveryHero"
    assert out["status"] == "preparing"
    assert out["source"] == "adisyo_scrape"
    # Coordinate parse
    assert out["delivery_location"]["latitude"] == 37.71871
    assert out["delivery_location"]["longitude"] == 30.28532
    # Items minimal
    assert len(out["items"]) == 1
    assert out["items"][0]["price"] == 390.0
    # Notes preserved
    assert out["notes"] == "8 | gelince arar mısınız"


@pytest.mark.asyncio
async def test_scrape_post_creates_and_idempotent(monkeypatch):
    """End-to-end: 2x POST aynı order → 1 created + 1 skipped"""
    monkeypatch.setenv("DB_NAME", "agrosjet_test_adisyo_scrape_e2e")
    for mod in list(sys.modules):
        if mod.startswith("routers") or mod.startswith("utils") or mod.startswith("services"):
            sys.modules.pop(mod, None)

    from utils.database import db
    from routers.adisyo_scrape import receive_scraped_orders, AdisyoScrapeBatch, AdisyoScrapeOrder

    # Cleanup
    for col in ["orders", "restaurants", "companies"]:
        await db[col].delete_many({})

    await db.companies.insert_one({"id": "co-1", "name": "Test"})
    await db.restaurants.insert_one({
        "id": "r-1", "name": "Test Rest", "company_id": "co-1",
        "latitude": 37.7, "longitude": 30.28, "is_archived": False,
        "pricing_type": "per_package", "per_package_price": 50, "km_ranges": [], "kdv_rate": 10,
    })

    batch = AdisyoScrapeBatch(restaurant_id="r-1", orders=[AdisyoScrapeOrder(**SAMPLE_ORDER)])
    payload = {"role": "admin", "sub": "u-1", "company_id": "co-1"}

    r1 = await receive_scraped_orders(batch, payload)
    assert r1["created"] == 1
    assert r1["updated"] == 0
    assert r1["received"] == 1

    # Repeat — same payload, status unchanged → skipped
    r2 = await receive_scraped_orders(batch, payload)
    assert r2["created"] == 0
    assert r2["skipped"] == 1

    # Update status (2→3 ready)
    updated_order = dict(SAMPLE_ORDER, status=3)
    batch2 = AdisyoScrapeBatch(restaurant_id="r-1", orders=[AdisyoScrapeOrder(**updated_order)])
    r3 = await receive_scraped_orders(batch2, payload)
    assert r3["updated"] == 1

    # Cleanup
    for col in ["orders", "restaurants", "companies"]:
        await db[col].delete_many({})


@pytest.mark.asyncio
async def test_scrape_does_not_overwrite_assigned_courier(monkeypatch):
    """Kurye atanmış sipariş Adisyo'dan gelen status'la ezilmemeli"""
    monkeypatch.setenv("DB_NAME", "agrosjet_test_adisyo_scrape_assigned")
    for mod in list(sys.modules):
        if mod.startswith("routers") or mod.startswith("utils") or mod.startswith("services"):
            sys.modules.pop(mod, None)

    from utils.database import db
    from routers.adisyo_scrape import receive_scraped_orders, AdisyoScrapeBatch, AdisyoScrapeOrder

    for col in ["orders", "restaurants", "companies"]:
        await db[col].delete_many({})

    await db.companies.insert_one({"id": "co-1", "name": "Test"})
    await db.restaurants.insert_one({
        "id": "r-1", "name": "Test Rest", "company_id": "co-1",
        "latitude": 37.7, "longitude": 30.28, "is_archived": False,
        "pricing_type": "per_package", "per_package_price": 50, "km_ranges": [], "kdv_rate": 10,
    })

    # Önceden 'on_the_way' statüsünde bir sipariş ekle (kurye atanmış senaryosu)
    await db.orders.insert_one({
        "id": "existing-id",
        "adisyo_order_id": 411395562,
        "source": "adisyo_scrape",
        "status": "on_the_way",
        "courier_id": "c-1",
        "company_id": "co-1",
        "restaurant_id": "r-1",
    })

    # Scrape şimdi status=2 (preparing) yolluyor → ezmemeli
    batch = AdisyoScrapeBatch(restaurant_id="r-1", orders=[AdisyoScrapeOrder(**SAMPLE_ORDER)])
    payload = {"role": "admin", "sub": "u-1", "company_id": "co-1"}
    r = await receive_scraped_orders(batch, payload)
    assert r["skipped"] == 1

    existing = await db.orders.find_one({"adisyo_order_id": 411395562})
    assert existing["status"] == "on_the_way", "Kurye atanmış sipariş ezilmemeli"

    # Ama cancel gelirse ezilmeli (iptal her zaman önemli)
    cancelled_order = dict(SAMPLE_ORDER, status=6)
    batch2 = AdisyoScrapeBatch(restaurant_id="r-1", orders=[AdisyoScrapeOrder(**cancelled_order)])
    r2 = await receive_scraped_orders(batch2, payload)
    assert r2["cancelled"] == 1
    existing2 = await db.orders.find_one({"adisyo_order_id": 411395562})
    assert existing2["status"] == "cancelled"

    for col in ["orders", "restaurants", "companies"]:
        await db[col].delete_many({})
