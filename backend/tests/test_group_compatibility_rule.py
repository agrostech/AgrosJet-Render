"""
Restoran grubu uyumluluk kuralı: grup yoksa veya farklı gruplarsa birleştirme yapılmaz.
"""
import uuid
import pytest

from services.auto_dispatch.courier_selection import is_courier_compatible_with_restaurant_group
from utils.database import db


COMPANY_ID = "test-co-group-rule"


@pytest.mark.asyncio
async def test_group_compatibility_rules():
    company_id = COMPANY_ID
    courier_id = f"test-grp-c-{uuid.uuid4()}"
    rest_a = f"test-grp-a-{uuid.uuid4()}"
    rest_b = f"test-grp-b-{uuid.uuid4()}"
    rest_no_group_1 = f"test-grp-ng1-{uuid.uuid4()}"
    rest_no_group_2 = f"test-grp-ng2-{uuid.uuid4()}"
    group_x = f"test-grp-x-{uuid.uuid4()}"
    group_y = f"test-grp-y-{uuid.uuid4()}"
    
    # Gruplar
    await db.restaurant_groups.insert_one({
        "id": group_x,
        "company_id": company_id,
        "name": "Grup X",
        "restaurant_ids": [rest_a],
    })
    await db.restaurant_groups.insert_one({
        "id": group_y,
        "company_id": company_id,
        "name": "Grup Y",
        "restaurant_ids": [rest_b],
    })
    
    inserted_orders = []
    
    try:
        # 1) Boş kurye → her zaman uyumlu (target gruplu)
        compat, reason = await is_courier_compatible_with_restaurant_group(courier_id, company_id, rest_a)
        assert compat, f"Boş kurye uyumlu olmalıydı, reason={reason}"
        
        # 2) Boş kurye → target grupsuz da olsa uyumlu
        compat, reason = await is_courier_compatible_with_restaurant_group(courier_id, company_id, rest_no_group_1)
        assert compat, f"Boş kurye grupsuz hedef de olsa uyumlu olmalı, reason={reason}"
        
        # Kuryeyi grupsuz bir aktif siparişle dolduralım
        order_no_grp = {
            "id": f"test-grp-o-ng-{uuid.uuid4()}",
            "company_id": company_id,
            "courier_id": courier_id,
            "restaurant_id": rest_no_group_1,
            "status": "preparing",
        }
        await db.orders.insert_one(order_no_grp)
        inserted_orders.append(order_no_grp["id"])
        
        # 3) Kurye grupsuz aktif + target grupsuz → KABUL ETMEMELİ (eski hata)
        compat, reason = await is_courier_compatible_with_restaurant_group(courier_id, company_id, rest_no_group_2)
        assert not compat, f"Her iki taraf grupsuz iken birleştirmemeli, reason={reason}"
        
        # 4) Kurye grupsuz aktif + target gruplu → reddet
        compat, reason = await is_courier_compatible_with_restaurant_group(courier_id, company_id, rest_a)
        assert not compat, f"Kurye grupsuz, target gruplu → reddetmeli, reason={reason}"
        
        # Kuryenin aktif siparişini kaldır, gruplu A koy
        await db.orders.delete_many({"id": order_no_grp["id"]})
        order_grp_a = {
            "id": f"test-grp-o-a-{uuid.uuid4()}",
            "company_id": company_id,
            "courier_id": courier_id,
            "restaurant_id": rest_a,
            "status": "preparing",
        }
        await db.orders.insert_one(order_grp_a)
        inserted_orders.append(order_grp_a["id"])
        
        # 5) Kurye Grup X + target Grup X → KABUL
        compat, reason = await is_courier_compatible_with_restaurant_group(courier_id, company_id, rest_a)
        assert compat, f"Aynı grupta birleştirme olmalı, reason={reason}"
        
        # 6) Kurye Grup X + target Grup Y → REDDET
        compat, reason = await is_courier_compatible_with_restaurant_group(courier_id, company_id, rest_b)
        assert not compat, f"Farklı gruplar reddedilmeli, reason={reason}"
        
        # 7) Kurye Grup X + target grupsuz → REDDET
        compat, reason = await is_courier_compatible_with_restaurant_group(courier_id, company_id, rest_no_group_1)
        assert not compat, f"Gruplu kurye + grupsuz hedef reddedilmeli, reason={reason}"
    finally:
        await db.orders.delete_many({"id": {"$in": inserted_orders}})
        await db.restaurant_groups.delete_many({"id": {"$in": [group_x, group_y]}})
