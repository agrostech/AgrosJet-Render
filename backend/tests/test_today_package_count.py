"""
Kurye bugünkü paket sayısı endpoint testi.
İptaller hariç, yoldakiler + teslim edilenler + diğer aktif durumlar dahil.
Şirket iş günü: bugün opening_time → yarın closing_time.
"""
import uuid
from datetime import datetime, timezone, timedelta
import pytest
from httpx import AsyncClient, ASGITransport

from server import app
from utils.database import db


@pytest.mark.asyncio
async def test_today_package_count_excludes_cancelled():
    tz = timezone(timedelta(hours=3))
    now = datetime.now(tz)
    company_id = f"test-tpc-co-{uuid.uuid4()}"
    courier_id = f"test-tpc-c-{uuid.uuid4()}"
    
    await db.companies.insert_one({
        "id": company_id,
        "name": "Test Co TPC",
        "opening_time": "06:00",
        "closing_time": "06:00",
    })
    
    in_window_iso = now.isoformat()
    
    orders = [
        {"id": f"tpc-o1-{uuid.uuid4()}", "company_id": company_id, "courier_id": courier_id,
         "status": "delivered", "assigned_at": in_window_iso, "created_at": in_window_iso},
        {"id": f"tpc-o2-{uuid.uuid4()}", "company_id": company_id, "courier_id": courier_id,
         "status": "on_the_way", "assigned_at": in_window_iso, "created_at": in_window_iso},
        {"id": f"tpc-o3-{uuid.uuid4()}", "company_id": company_id, "courier_id": courier_id,
         "status": "assigned", "assigned_at": in_window_iso, "created_at": in_window_iso},
        {"id": f"tpc-o4-{uuid.uuid4()}", "company_id": company_id, "courier_id": courier_id,
         "status": "preparing", "assigned_at": in_window_iso, "created_at": in_window_iso},
        # İptal - sayılmamalı
        {"id": f"tpc-o5-{uuid.uuid4()}", "company_id": company_id, "courier_id": courier_id,
         "status": "cancelled", "assigned_at": in_window_iso, "created_at": in_window_iso},
        # Pencere dışı (5 gün öncesi) - sayılmamalı
        {"id": f"tpc-o6-{uuid.uuid4()}", "company_id": company_id, "courier_id": courier_id,
         "status": "delivered", "assigned_at": (now - timedelta(days=5)).isoformat(),
         "created_at": (now - timedelta(days=5)).isoformat()},
        # Başka kuryenin paketi - sayılmamalı
        {"id": f"tpc-o7-{uuid.uuid4()}", "company_id": company_id, "courier_id": "other-courier",
         "status": "delivered", "assigned_at": in_window_iso, "created_at": in_window_iso},
    ]
    inserted_ids = [o["id"] for o in orders]
    await db.orders.insert_many(orders)
    
    try:
        # Direkt fonksiyonu test et
        from routers.couriers import get_courier_today_package_count
        result = await get_courier_today_package_count(courier_id=courier_id, company_id=company_id)
        # 4 valid (delivered, on_the_way, assigned, preparing); cancelled+out-of-window+other-courier yok
        assert result["count"] == 4, f"Beklenen 4, gelen {result['count']}"
        assert result["business_date"] is not None
        assert result["opening_time"] == "06:00"
    finally:
        await db.orders.delete_many({"id": {"$in": inserted_ids}})
        await db.companies.delete_one({"id": company_id})
