"""
check_preparation_times TOCTOU race koruma testleri.

Senaryo: Kullanıcı süresi dolmuş 'preparing' siparişe yeni hazırlık süresi
ekleyince, eş zamanlı çalışan check_preparation_times bu siparişi yanlışlıkla
'ready'ye çekmemeli.
"""
import uuid
from datetime import datetime, timezone, timedelta

import pytest

from utils.database import db
from routers.orders import check_preparation_times

TR = timezone(timedelta(hours=3))


@pytest.mark.asyncio
async def test_extended_prep_not_marked_ready():
    """Süresi dolmuş sipariş; uzatılmışsa check_preparation_times atlamalı."""
    now = datetime.now(TR)
    order_id = f"test-prep-race-{uuid.uuid4()}"
    expired = (now - timedelta(minutes=15)).isoformat()
    company_id = f"test-co-prep-race-{uuid.uuid4()}"

    await db.orders.insert_one({
        "id": order_id,
        "order_number": "PREP-RACE-1",
        "company_id": company_id,
        "restaurant_id": "test-r",
        "status": "preparing",
        "preparation_time": 5,
        "preparation_end_at": expired,
        "created_at": now.isoformat(),
        "updated_at": now.isoformat(),
        "is_restaurant_delivery": False,
    })

    try:
        # Kullanıcı süresi uzattı (yeni prep_end = now + 5min)
        new_prep_end = (datetime.now(TR) + timedelta(minutes=5)).isoformat()
        await db.orders.update_one(
            {"id": order_id},
            {"$set": {"preparation_time": 5, "preparation_end_at": new_prep_end}}
        )

        # Şimdi check_preparation_times çalıştığında atomik filter false dönmeli
        await check_preparation_times(company_id=company_id)

        updated = await db.orders.find_one({"id": order_id}, {"_id": 0, "status": 1})
        assert updated["status"] == "preparing", "Süresi uzatılan sipariş ready'ye çekilmemeli"
    finally:
        await db.orders.delete_one({"id": order_id})


@pytest.mark.asyncio
async def test_truly_expired_marked_ready():
    """Süresi gerçekten dolmuş ve uzatılmamış sipariş normal şekilde ready'ye geçmeli."""
    now = datetime.now(TR)
    order_id = f"test-prep-expired-{uuid.uuid4()}"
    expired = (now - timedelta(minutes=10)).isoformat()
    company_id = f"test-co-prep-expire-{uuid.uuid4()}"

    await db.orders.insert_one({
        "id": order_id,
        "order_number": "PREP-EXPIRE-1",
        "company_id": company_id,
        "restaurant_id": "test-r",
        "status": "preparing",
        "preparation_time": 5,
        "preparation_end_at": expired,
        "created_at": now.isoformat(),
        "updated_at": now.isoformat(),
        "is_restaurant_delivery": False,
    })

    try:
        await check_preparation_times(company_id=company_id)
        updated = await db.orders.find_one({"id": order_id}, {"_id": 0, "status": 1})
        assert updated["status"] == "ready", "Süresi dolmuş sipariş ready'ye çekilmeli"
    finally:
        await db.orders.delete_one({"id": order_id})
