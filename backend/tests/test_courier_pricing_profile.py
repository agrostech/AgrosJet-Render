"""
Regression: Kurye Ödeme Profili (5 profil) — backward compatibility + fallback
"""
import os
import sys

import pytest

sys.path.insert(0, os.path.join(os.path.dirname(__file__), ".."))


@pytest.mark.asyncio
async def test_extract_profile_1_backward_compat(monkeypatch):
    monkeypatch.setenv("DB_NAME", "agrosjet_test_courier_pricing_p1")
    for mod in list(sys.modules):
        if mod.startswith("routers") or mod.startswith("utils") or mod.startswith("services"):
            sys.modules.pop(mod, None)
    from services.courier_pricing_service import _extract_profile_config

    courier = {
        "id": "c1",
        "pricing_type": "per_package",
        "per_package_price": 50,
        "km_ranges": [],
        "tier_prices": None,
    }
    cfg = _extract_profile_config(courier, 1)
    assert cfg["pricing_type"] == "per_package"
    assert cfg["per_package_price"] == 50


@pytest.mark.asyncio
async def test_extract_profile_3_dict_storage(monkeypatch):
    monkeypatch.setenv("DB_NAME", "agrosjet_test_courier_pricing_p3")
    for mod in list(sys.modules):
        if mod.startswith("routers") or mod.startswith("utils") or mod.startswith("services"):
            sys.modules.pop(mod, None)
    from services.courier_pricing_service import _extract_profile_config

    courier = {
        "id": "c1",
        "pricing_type": "per_package",
        "per_package_price": 50,
        "pricing_profiles": {
            "3": {"pricing_type": "per_km", "km_ranges": [{"min": 0, "max": 5, "price": 70}]},
        },
    }
    cfg = _extract_profile_config(courier, 3)
    assert cfg["pricing_type"] == "per_km"
    assert cfg["km_ranges"][0]["price"] == 70

    # Profil 4 konfigüre değil → None
    assert _extract_profile_config(courier, 4) is None


@pytest.mark.asyncio
async def test_get_pricing_fallback_to_profile_1(monkeypatch):
    monkeypatch.setenv("DB_NAME", "agrosjet_test_courier_pricing_fb")
    for mod in list(sys.modules):
        if mod.startswith("routers") or mod.startswith("utils") or mod.startswith("services"):
            sys.modules.pop(mod, None)

    from utils.database import db
    from services.courier_pricing_service import get_courier_pricing_for_order

    for col in ["restaurants", "couriers"]:
        await db[col].delete_many({})

    await db.restaurants.insert_one({
        "id": "r1", "name": "Test", "company_id": "co1",
        "courier_pricing_profile": 3  # profil 3 seçili
    })

    courier = {
        "id": "c1",
        "pricing_type": "per_package",
        "per_package_price": 40,
        # Profil 3 KONFİGÜRE DEĞİL → fallback profil 1
    }
    cfg, profile_used = await get_courier_pricing_for_order(courier, "r1")
    assert profile_used == 1
    assert cfg["per_package_price"] == 40

    for col in ["restaurants", "couriers"]:
        await db[col].delete_many({})


@pytest.mark.asyncio
async def test_get_pricing_profile_used_when_configured(monkeypatch):
    monkeypatch.setenv("DB_NAME", "agrosjet_test_courier_pricing_used")
    for mod in list(sys.modules):
        if mod.startswith("routers") or mod.startswith("utils") or mod.startswith("services"):
            sys.modules.pop(mod, None)

    from utils.database import db
    from services.courier_pricing_service import get_courier_pricing_for_order

    for col in ["restaurants"]:
        await db[col].delete_many({})

    await db.restaurants.insert_one({
        "id": "r1", "name": "Test", "company_id": "co1",
        "courier_pricing_profile": 2
    })

    courier = {
        "id": "c1",
        "pricing_type": "per_package",
        "per_package_price": 40,  # profil 1
        "pricing_profiles": {
            "2": {"pricing_type": "per_package", "per_package_price": 75}  # profil 2
        }
    }
    cfg, profile_used = await get_courier_pricing_for_order(courier, "r1")
    assert profile_used == 2
    assert cfg["per_package_price"] == 75

    for col in ["restaurants"]:
        await db[col].delete_many({})


@pytest.mark.asyncio
async def test_restaurant_no_profile_field_defaults_to_1(monkeypatch):
    monkeypatch.setenv("DB_NAME", "agrosjet_test_courier_pricing_default")
    for mod in list(sys.modules):
        if mod.startswith("routers") or mod.startswith("utils") or mod.startswith("services"):
            sys.modules.pop(mod, None)

    from utils.database import db
    from services.courier_pricing_service import get_courier_pricing_for_order, get_restaurant_profile_no

    for col in ["restaurants"]:
        await db[col].delete_many({})

    # Hiç courier_pricing_profile field'ı yok
    await db.restaurants.insert_one({"id": "r1", "name": "Test", "company_id": "co1"})
    assert (await get_restaurant_profile_no("r1")) == 1

    courier = {"id": "c1", "pricing_type": "per_km", "km_ranges": [{"min": 0, "max": 5, "price": 30}]}
    cfg, profile_used = await get_courier_pricing_for_order(courier, "r1")
    assert profile_used == 1
    assert cfg["pricing_type"] == "per_km"

    for col in ["restaurants"]:
        await db[col].delete_many({})
