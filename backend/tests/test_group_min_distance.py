"""
Restoran Grubu Minimum Mesafe Kuralı Testleri.
- Toggle KAPALI: mesafe gözetmez, mevcut davranış.
- Toggle AÇIK + her iki paket >= min: birleştirilebilir.
- Toggle AÇIK + biri < min: birleştirilemez.
- Sadece pickup aşamasında (on_the_way yokken) uygulanır.
"""
import uuid
import pytest

from services.auto_dispatch.courier_selection import is_courier_eligible
from utils.database import db


COMPANY_ID = "test-co-grp-mindist"


def _loc(lat, lng):
    return {"lat": lat, "lng": lng}


@pytest.mark.asyncio
async def test_group_min_distance_rule():
    # Konumlar: restoran (39.92, 32.85) merkez.
    # Yakın teslimat (~1000m): 39.929, 32.85
    # Uzak teslimat (~6000m): 39.974, 32.85
    restaurant_loc = _loc(39.92, 32.85)
    near_delivery = _loc(39.929, 32.85)   # ~1000m
    far_delivery_1 = _loc(39.974, 32.85)  # ~6000m
    far_delivery_2 = _loc(39.975, 32.85)  # ~6100m
    short_delivery = _loc(39.929, 32.855) # ~1200m

    company_id = COMPANY_ID
    courier_id = f"test-grpdist-courier-{uuid.uuid4()}"
    other_restaurant_id = f"test-grpdist-rest1-{uuid.uuid4()}"
    new_restaurant_id = f"test-grpdist-rest2-{uuid.uuid4()}"
    group_id = f"test-grpdist-group-{uuid.uuid4()}"
    existing_order_id_far = f"test-grpdist-order-far-{uuid.uuid4()}"
    existing_order_id_near = f"test-grpdist-order-near-{uuid.uuid4()}"

    # Kurye - aktif, konumu var, max_packages yüksek
    await db.couriers.insert_one({
        "id": courier_id,
        "company_id": company_id,
        "availability_status": "active",
        "current_location": _loc(39.92, 32.85),
        "max_packages": 10,
        "allowed_payment_methods": ["cash", "card", "online", "meal_card", "online_meal_card"],
        "name": "Test Kurye Grp",
    })

    # Restoran grubu (iki restoran aynı grupta)
    await db.restaurant_groups.insert_one({
        "id": group_id,
        "company_id": company_id,
        "name": "Test Grup",
        "restaurant_ids": [other_restaurant_id, new_restaurant_id],
    })

    courier_obj = await db.couriers.find_one({"id": courier_id}, {"_id": 0})

    try:
        # =========================================
        # Senaryo 1: Toggle KAPALI - kısa mesafe olsa bile birleştirilebilir
        # =========================================
        # Kuryede yakın teslimatlı bir paket var (~1000m)
        await db.orders.insert_one({
            "id": existing_order_id_near,
            "company_id": company_id,
            "courier_id": courier_id,
            "restaurant_id": other_restaurant_id,
            "restaurant_location": restaurant_loc,
            "delivery_location": near_delivery,
            "status": "preparing",
        })

        # Yeni paket: kısa mesafeli, aynı gruptan
        eligible, reason, _ = await is_courier_eligible(
            courier_obj,
            company_id,
            target_restaurant_id=new_restaurant_id,
            target_restaurant_location=restaurant_loc,
            target_delivery_location=short_delivery,
            group_min_distance_enabled=False,
            group_min_distance=3500,
        )
        assert eligible, f"Toggle kapalı iken birleştirme bekleniyordu, reason={reason}"

        # =========================================
        # Senaryo 2: Toggle AÇIK + her iki paket de < min → REDDET
        # =========================================
        eligible, reason, _ = await is_courier_eligible(
            courier_obj,
            company_id,
            target_restaurant_id=new_restaurant_id,
            target_restaurant_location=restaurant_loc,
            target_delivery_location=short_delivery,  # ~1200m < 3500
            group_min_distance_enabled=True,
            group_min_distance=3500,
        )
        assert not eligible, "Toggle açık iken kısa paketler reddedilmeliydi"
        assert "min mesafe" in reason.lower(), f"Reason: {reason}"

        # =========================================
        # Senaryo 3: Toggle AÇIK + mevcut paket UZAK ama yeni paket KISA → REDDET
        # =========================================
        # Mevcut paketi uzak yap
        await db.orders.update_one(
            {"id": existing_order_id_near},
            {"$set": {"delivery_location": far_delivery_1}}
        )
        eligible, reason, _ = await is_courier_eligible(
            courier_obj,
            company_id,
            target_restaurant_id=new_restaurant_id,
            target_restaurant_location=restaurant_loc,
            target_delivery_location=short_delivery,
            group_min_distance_enabled=True,
            group_min_distance=3500,
        )
        assert not eligible, "Yeni paket min altında olduğu için reddedilmeli"

        # =========================================
        # Senaryo 4: Toggle AÇIK + her iki paket de UZAK → KABUL ET
        # =========================================
        eligible, reason, _ = await is_courier_eligible(
            courier_obj,
            company_id,
            target_restaurant_id=new_restaurant_id,
            target_restaurant_location=restaurant_loc,
            target_delivery_location=far_delivery_2,
            group_min_distance_enabled=True,
            group_min_distance=3500,
        )
        assert eligible, f"Her iki paket de uzak; kabul beklenirdi, reason={reason}"

        # =========================================
        # Senaryo 5: Toggle AÇIK + mevcut paket on_the_way (yola çıkmış) → KURAL UYGULANMAZ
        # =========================================
        # Mevcut paketi on_the_way ve kısa yap
        await db.orders.update_one(
            {"id": existing_order_id_near},
            {"$set": {"status": "on_the_way", "delivery_location": near_delivery}}
        )
        eligible, reason, _ = await is_courier_eligible(
            courier_obj,
            company_id,
            target_restaurant_id=new_restaurant_id,
            target_restaurant_location=restaurant_loc,
            target_delivery_location=short_delivery,
            group_min_distance_enabled=True,
            group_min_distance=3500,
        )
        # Yolda paketli kurye için min-distance kuralı atlanır.
        # (Yine de "1 yolda + ek paket" senaryosunda diğer kuralların eligible vermesi lazım.)
        # Bu test "min mesafe kuralı" hata mesajı dönmesin diye yazıldı:
        if not eligible:
            assert "min mesafe" not in reason.lower(), f"Pickup-only kuralın on_the_way'de tetiklenmemeli, reason={reason}"

    finally:
        # Cleanup
        await db.couriers.delete_many({"id": courier_id})
        await db.orders.delete_many({"id": {"$in": [existing_order_id_far, existing_order_id_near]}})
        await db.restaurant_groups.delete_many({"id": group_id})
