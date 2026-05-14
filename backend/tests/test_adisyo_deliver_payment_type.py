"""
Adisyo Deliver çağrısının orijinal paymentMethodId'yi kullandığını doğrula.
"""
import uuid
import pytest
from unittest.mock import patch, AsyncMock

from services.adisyo_service import mark_adisyo_order_delivered
from utils.database import db


@pytest.mark.asyncio
async def test_deliver_uses_original_payment_method_id():
    restaurant_id = f"test-adisyo-r-{uuid.uuid4()}"
    adisyo_order_id = 999900001
    
    await db.restaurants.insert_one({
        "id": restaurant_id,
        "name": "Test R",
        "company_id": "co1",
        "adisyo_api_key": "fake-key",
        "adisyo_consumer_id": "fake-consumer",
    })
    
    # Senaryo 1: Adisyo'dan orijinal paymentMethodId=53 (online) geldi,
    # AgrosJet'te kullanıcı "cash" olarak değiştirdi.
    # Beklenti: Adisyo'ya 53 gönderilmeli, 1 değil.
    order_id = f"test-o-{uuid.uuid4()}"
    await db.orders.insert_one({
        "id": order_id,
        "restaurant_id": restaurant_id,
        "adisyo_order_id": adisyo_order_id,
        "payment_method": "cash",  # AgrosJet'te değiştirilmiş
        "adisyo_raw": {"paymentMethodId": 53, "paymentMethodName": "Web Online"},
    })
    
    try:
        # mock_response — sadece HTTP çağrısını yakalamak için
        captured = {}
        
        class MockResp:
            status_code = 200
            text = '{"status":100}'
            def json(self):
                return {"status": 100}
        
        class MockClient:
            def __init__(self, *a, **k): pass
            async def __aenter__(self): return self
            async def __aexit__(self, *a): pass
            async def post(self, url, headers=None, json=None):
                captured["url"] = url
                captured["body"] = json
                return MockResp()
        
        with patch("services.adisyo_service.httpx.AsyncClient", MockClient), \
             patch("services.adisyo_service.get_adisyo_headers", AsyncMock(return_value={})):
            result = await mark_adisyo_order_delivered(
                restaurant_id=restaurant_id,
                adisyo_order_id=adisyo_order_id,
                payment_method="cash",  # AgrosJet'te değiştirilmiş ödeme
                payment_detail=None,
            )
        
        assert result["success"], f"Result: {result}"
        assert captured["body"]["paymentType"] == 53, (
            f"Beklenen Adisyo'nun orijinali 53; gelen {captured['body']['paymentType']}"
        )
        assert captured["body"]["orderId"] == adisyo_order_id
        
        # Senaryo 2: adisyo_raw yok → fallback mapping kullan
        order_id_2 = f"test-o2-{uuid.uuid4()}"
        adisyo_order_id_2 = 999900002
        await db.orders.insert_one({
            "id": order_id_2,
            "restaurant_id": restaurant_id,
            "adisyo_order_id": adisyo_order_id_2,
            "payment_method": "cash",
            # adisyo_raw yok
        })
        
        captured.clear()
        with patch("services.adisyo_service.httpx.AsyncClient", MockClient), \
             patch("services.adisyo_service.get_adisyo_headers", AsyncMock(return_value={})):
            result2 = await mark_adisyo_order_delivered(
                restaurant_id=restaurant_id,
                adisyo_order_id=adisyo_order_id_2,
                payment_method="cash",
                payment_detail=None,
            )
        
        assert result2["success"]
        # cash → fallback mapping 1
        assert captured["body"]["paymentType"] == 1, f"Fallback Nakit=1 beklenirdi, geldi {captured['body']['paymentType']}"
    finally:
        await db.orders.delete_many({"restaurant_id": restaurant_id})
        await db.restaurants.delete_one({"id": restaurant_id})
