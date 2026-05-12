"""
Regression: Kurye Pricing Profile tip kilitleme (12 May 2026)

Kural:
  - Profil 1 tiered ise tüm profillerin tiered olması zorunlu
  - Profil 1 tiered DEĞİL ise P2-P5 tiered OLAMAZ
"""
import os
import sys

import pytest

sys.path.insert(0, os.path.join(os.path.dirname(__file__), ".."))

from httpx import AsyncClient, ASGITransport


async def _login_admin(client):
    r = await client.post("/api/auth/admin/login", json={"username": "admin", "password": "123456"})
    return r.json()["token"]


async def _ensure_test_courier(monkeypatch):
    """Get any courier for testing"""
    from utils.database import db
    c = await db.couriers.find_one({}, {"_id": 0, "id": 1})
    return c["id"] if c else None


@pytest.mark.asyncio
async def test_pricing_type_lock(monkeypatch):
    # Local prod-like DB (env'den gelen)
    for mod in list(sys.modules):
        if mod.startswith("routers") or mod.startswith("utils") or mod.startswith("services") or mod.startswith("server"):
            sys.modules.pop(mod, None)

    from server import app

    courier_id = await _ensure_test_courier(monkeypatch)
    if not courier_id:
        pytest.skip("Test için kurye yok")

    async with AsyncClient(transport=ASGITransport(app=app), base_url="http://test") as client:
        token = await _login_admin(client)
        headers = {"Authorization": f"Bearer {token}"}

        # Önce mevcut profilleri temizle (test izole olsun)
        for n in range(2, 6):
            await client.delete(f"/api/couriers/{courier_id}/pricing-profiles/{n}", headers=headers)

        # 1) Profil 1 = per_package
        r = await client.put(
            f"/api/couriers/{courier_id}/pricing-profiles/1",
            json={"pricing_type": "per_package", "per_package_price": 50},
            headers=headers,
        )
        assert r.status_code == 200, r.text

        # 2) Profil 2 = tiered → REDDET (Profil 1 tiered değil)
        r = await client.put(
            f"/api/couriers/{courier_id}/pricing-profiles/2",
            json={"pricing_type": "tiered", "tier_prices": [80, 70, 60, 50, 40]},
            headers=headers,
        )
        assert r.status_code == 400
        assert "ayn" in r.json()["detail"].lower() or "tiered" in r.json()["detail"].lower()

        # 3) Profil 2 = per_km → KABUL
        r = await client.put(
            f"/api/couriers/{courier_id}/pricing-profiles/2",
            json={"pricing_type": "per_km", "km_ranges": [{"min_km": 0, "max_km": 5, "price": 30}]},
            headers=headers,
        )
        assert r.status_code == 200, r.text

        # 4) Profil 1'i tiered yap → REDDET (Profil 2 per_km)
        r = await client.put(
            f"/api/couriers/{courier_id}/pricing-profiles/1",
            json={"pricing_type": "tiered", "tier_prices": [80, 70, 60, 50, 40]},
            headers=headers,
        )
        assert r.status_code == 409
        assert "uyumsuz" in r.json()["detail"].lower()

        # 5) Profil 2'yi sil
        r = await client.delete(f"/api/couriers/{courier_id}/pricing-profiles/2", headers=headers)
        assert r.status_code == 200

        # 6) Profil 1'i tiered yap → KABUL
        r = await client.put(
            f"/api/couriers/{courier_id}/pricing-profiles/1",
            json={"pricing_type": "tiered", "tier_prices": [80, 70, 60, 50, 40]},
            headers=headers,
        )
        assert r.status_code == 200, r.text

        # 7) Profil 2 = per_package → REDDET (Profil 1 tiered)
        r = await client.put(
            f"/api/couriers/{courier_id}/pricing-profiles/2",
            json={"pricing_type": "per_package", "per_package_price": 60},
            headers=headers,
        )
        assert r.status_code == 400

        # 8) Profil 2 = tiered → KABUL
        r = await client.put(
            f"/api/couriers/{courier_id}/pricing-profiles/2",
            json={"pricing_type": "tiered", "tier_prices": [90, 80, 70, 60, 50]},
            headers=headers,
        )
        assert r.status_code == 200, r.text

        # 9) GET pricing-profiles → allowed_types_for_other_profiles = ['tiered']
        r = await client.get(f"/api/couriers/{courier_id}/pricing-profiles", headers=headers)
        assert r.status_code == 200
        d = r.json()
        assert d["profile_1_type"] == "tiered"
        assert d["allowed_types_for_other_profiles"] == ["tiered"]

        # Cleanup: profil 1'i per_package'a geri al, P2 sil
        await client.delete(f"/api/couriers/{courier_id}/pricing-profiles/2", headers=headers)
        await client.put(
            f"/api/couriers/{courier_id}/pricing-profiles/1",
            json={"pricing_type": "per_package", "per_package_price": 50},
            headers=headers,
        )
