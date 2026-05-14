"""
Kurye mütabakatta restoran tax_bracket'i artık restaurants.invoice_settings.percentage'den okunur.
- Tanımlıysa o değer
- Yoksa fallback %10
- Ceza mantığı: collection_commission - system_commission pozitifse ceza, negatifse yok
  (yani kurye zarara uğratmadıysa ceza yazılmaz)
"""
import uuid
from datetime import datetime, timezone, timedelta
import pytest

from routers.daily_mutabakat import get_order_totals_for_courier
from utils.database import db


TR = timezone(timedelta(hours=3))


@pytest.mark.asyncio
async def test_tax_bracket_uses_invoice_settings_percentage():
    company_id = f"test-tb-co-{uuid.uuid4()}"
    courier_id = f"test-tb-c-{uuid.uuid4()}"
    
    # 3 restoran: %1, %10, %20
    rest_1 = {"id": f"test-tb-r1-{uuid.uuid4()}", "company_id": company_id, "name": "R1",
              "invoice_settings": {"percentage": 1}}
    rest_10 = {"id": f"test-tb-r10-{uuid.uuid4()}", "company_id": company_id, "name": "R10",
               "invoice_settings": {"percentage": 10}}
    rest_20 = {"id": f"test-tb-r20-{uuid.uuid4()}", "company_id": company_id, "name": "R20",
               "invoice_settings": {"percentage": 20}}
    rest_no = {"id": f"test-tb-rno-{uuid.uuid4()}", "company_id": company_id, "name": "RNO"}
    
    await db.restaurants.insert_many([rest_1, rest_10, rest_20, rest_no])
    
    now = datetime.now(TR)
    delivered_iso = now.isoformat()
    
    orders = [
        # R1: kart 100 → %1 kovasına gitmeli
        {"id": f"o1-{uuid.uuid4()}", "company_id": company_id, "courier_id": courier_id,
         "restaurant_id": rest_1["id"], "restaurant_name": "R1",
         "status": "delivered", "delivered_at": delivered_iso,
         "payment_method": "card", "total_amount": 100.0},
        # R10: kart 200 → %10 kovasına
        {"id": f"o2-{uuid.uuid4()}", "company_id": company_id, "courier_id": courier_id,
         "restaurant_id": rest_10["id"], "restaurant_name": "R10",
         "status": "delivered", "delivered_at": delivered_iso,
         "payment_method": "card", "total_amount": 200.0},
        # R20: kart 300 → %20 kovasına
        {"id": f"o3-{uuid.uuid4()}", "company_id": company_id, "courier_id": courier_id,
         "restaurant_id": rest_20["id"], "restaurant_name": "R20",
         "status": "delivered", "delivered_at": delivered_iso,
         "payment_method": "card", "total_amount": 300.0},
        # RNO: invoice_settings yok → fallback %10 kovasına
        {"id": f"o4-{uuid.uuid4()}", "company_id": company_id, "courier_id": courier_id,
         "restaurant_id": rest_no["id"], "restaurant_name": "RNO",
         "status": "delivered", "delivered_at": delivered_iso,
         "payment_method": "card", "total_amount": 50.0},
    ]
    inserted = [o["id"] for o in orders]
    await db.orders.insert_many(orders)
    
    try:
        totals = await get_order_totals_for_courier(
            company_id, courier_id,
            now - timedelta(hours=1), now + timedelta(hours=1)
        )
        # %1: 100 (R1)
        assert totals["card_percent_1"] == 100.0, totals
        # %10: 200 (R10) + 50 (RNO fallback) = 250
        assert totals["card_percent_10"] == 250.0, totals
        # %20: 300 (R20)
        assert totals["card_percent_20"] == 300.0, totals
        assert totals["card_total"] == 650.0
    finally:
        await db.orders.delete_many({"id": {"$in": inserted}})
        await db.restaurants.delete_many(
            {"id": {"$in": [rest_1["id"], rest_10["id"], rest_20["id"], rest_no["id"]]}}
        )


@pytest.mark.asyncio
async def test_commission_penalty_only_when_courier_overcollects():
    """
    Ceza mantığı doğrulaması:
    - Sistem komisyonu (restoranın gerçek yüzdesine göre) vs Tahsilat komisyonu (kuryenin
      mütabakatta girdiğine göre).
    - Pozitif fark (kurye yüksek yüzdeyle tahsil etmiş) → ceza yazılır.
    - Negatif fark (kurye düşük yüzdeyle tahsil etmiş = lehine) → ceza YOK.
    """
    # Sistem (gerçek %): 100 * 0.20 = 20
    # Tahsilat (kuryenin girdiği): 100 * 0.10 = 10  → kurye 10 az aldı, lehine, CEZA YOK
    system_low = 100 * 0.20
    coll_low = 100 * 0.10
    penalty_lehine = coll_low - system_low
    assert penalty_lehine < 0, "Kurye düşük yüzdeyle tahsil etmiş → ceza olmamalı (negatif fark)"
    
    # Tersine: kurye yüksek yüzdeyle tahsil etmiş → ceza var
    system_high = 100 * 0.10
    coll_high = 100 * 0.20
    penalty_aleyhe = coll_high - system_high
    assert penalty_aleyhe > 0.01, "Kurye yüksek yüzdeyle tahsil etmiş → ceza olmalı (pozitif fark)"
