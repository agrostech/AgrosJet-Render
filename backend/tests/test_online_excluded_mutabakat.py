"""
Daily mutabakat: online ödemelerin kart kovasına eklenmediğini doğrula.
"""
import uuid
from datetime import datetime, timezone, timedelta
import pytest

from routers.daily_mutabakat import get_order_totals_for_courier, get_courier_orders_detail
from utils.database import db


@pytest.mark.asyncio
async def test_online_not_included_in_card_totals():
    tz = timezone(timedelta(hours=3))
    now = datetime.now(tz)
    start_dt = now - timedelta(hours=12)
    end_dt = now + timedelta(hours=12)
    
    company_id = f"test-online-co-{uuid.uuid4()}"
    courier_id = f"test-online-c-{uuid.uuid4()}"
    restaurant_id = f"test-online-r-{uuid.uuid4()}"
    
    # Tüm tahsilatları kurye yapsın (default)
    await db.restaurants.insert_one({
        "id": restaurant_id,
        "company_id": company_id,
        "name": "Test Online R",
        "collection_settings": {
            "cash_collection": "courier",
            "card_collection": "courier",
            "meal_card_collection": "courier",
        }
    })
    
    delivered_iso = now.isoformat()
    orders = [
        {"id": f"to-cash-{uuid.uuid4()}", "company_id": company_id, "courier_id": courier_id,
         "restaurant_id": restaurant_id, "restaurant_name": "Test Online R",
         "status": "delivered", "delivered_at": delivered_iso,
         "payment_method": "cash", "total_amount": 100.0},
        {"id": f"to-card-{uuid.uuid4()}", "company_id": company_id, "courier_id": courier_id,
         "restaurant_id": restaurant_id, "restaurant_name": "Test Online R",
         "status": "delivered", "delivered_at": delivered_iso,
         "payment_method": "card", "total_amount": 200.0},
        # Online → ne nakit ne kart kovasına eklenmemeli
        {"id": f"to-online-{uuid.uuid4()}", "company_id": company_id, "courier_id": courier_id,
         "restaurant_id": restaurant_id, "restaurant_name": "Test Online R",
         "status": "delivered", "delivered_at": delivered_iso,
         "payment_method": "online", "total_amount": 500.0},
        # online_meal_card → meal_card'a gitmeli (önceki davranış korunmalı)
        {"id": f"to-omc-{uuid.uuid4()}", "company_id": company_id, "courier_id": courier_id,
         "restaurant_id": restaurant_id, "restaurant_name": "Test Online R",
         "status": "delivered", "delivered_at": delivered_iso,
         "payment_method": "online_meal_card", "total_amount": 50.0},
    ]
    inserted_ids = [o["id"] for o in orders]
    await db.orders.insert_many(orders)
    
    try:
        totals = await get_order_totals_for_courier(company_id, courier_id, start_dt, end_dt)
        # 4 sipariş sayılmalı
        assert totals["order_count"] == 4, f"order_count={totals['order_count']}"
        # Nakit 100
        assert totals["cash_total"] == 100.0, f"cash_total={totals['cash_total']}"
        # Kart sadece 200 (online dahil değil)
        assert totals["card_total"] == 200.0, f"card_total={totals['card_total']} (online 500 dahil olmamalı)"
        # Yemek kartı 50 (online_meal_card hâlâ buraya)
        assert totals["meal_card_total"] == 50.0, f"meal_card_total={totals['meal_card_total']}"
        
        # Detail endpoint - online ne cash_orders'a ne card_orders'a
        detail = await get_courier_orders_detail(company_id, courier_id, start_dt, end_dt)
        all_listed = {o["payment_method"] for o in detail["cash_orders"] + detail["card_orders"]}
        assert "online" not in all_listed, f"Online detail listesinde görünmemeli: {all_listed}"
        assert detail["card_total"] == 200.0, f"detail card_total={detail['card_total']}"
        assert detail["cash_total"] == 100.0
    finally:
        await db.orders.delete_many({"id": {"$in": inserted_ids}})
        await db.restaurants.delete_one({"id": restaurant_id})
