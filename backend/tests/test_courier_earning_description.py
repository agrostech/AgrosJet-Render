"""
JetCüzdan earning açıklamasının 'İşletme Adı - Müşteri Adı siparişi hakediş'
formatında yazıldığını doğrulayan test.
"""
import uuid
import pytest

from services.courier_earning_service import credit_courier_earning, revert_courier_earning


@pytest.mark.asyncio
async def test_earning_descriptions():
    # 1. Müşteri adı dolu
    order_id_1 = f"test-order-{uuid.uuid4()}"
    courier_id = f"test-courier-{uuid.uuid4()}"
    order_with = {
        "id": order_id_1,
        "order_number": "TST-001",
        "courier_id": courier_id,
        "courier_fee": 25.0,
        "company_id": "test-co",
        "restaurant_id": "r1",
        "restaurant_name": "Pizza Express",
        "customer_name": "Ahmet Yılmaz",
        "courier_name": "Test Kurye",
    }
    tx1 = await credit_courier_earning(order_with)
    assert tx1 is not None
    assert tx1["description"] == "Pizza Express - Ahmet Yılmaz siparişi hakediş"
    assert tx1["customer_name"] == "Ahmet Yılmaz"
    assert tx1["restaurant_name"] == "Pizza Express"

    # 2. Müşteri adı boş
    order_id_2 = f"test-order-{uuid.uuid4()}"
    order_without = {
        "id": order_id_2,
        "order_number": "TST-002",
        "courier_id": courier_id,
        "courier_fee": 30.0,
        "company_id": "test-co",
        "restaurant_id": "r1",
        "restaurant_name": "Burger King",
        "customer_name": "",
        "courier_name": "Test Kurye",
    }
    tx2 = await credit_courier_earning(order_without)
    assert tx2 is not None
    assert tx2["description"] == "Burger King siparişi hakediş"
    assert tx2["customer_name"] == ""

    # Cleanup
    await revert_courier_earning(order_id_1)
    await revert_courier_earning(order_id_2)
