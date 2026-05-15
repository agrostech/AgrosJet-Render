"""
SepetTakip /create-package endpoint'inin adres tarifini (address.description)
canonical `address_direction` alanına yazdığını doğrulayan test.

Bug: önceden 'address_description' adıyla yazılıyordu — frontend hiçbir yerde
okumadığı için "Tarif" alanı UI'da gözükmüyordu. Tek satırlık fix sonrası
bu test regresyonu yakalar.
"""
import pytest
from unittest.mock import AsyncMock, patch
import uuid

from routers.sepettakip import (
    create_package,
    CreatePackageRequest,
    AuthInfo,
    RestaurantInfo,
    OrderInfo,
    AddressInfo,
    CustomerInfo,
    ProductInfo,
    PaymentTypeInfo,
)


def _build_request(description_text: str) -> CreatePackageRequest:
    return CreatePackageRequest(
        auth=AuthInfo(username="restoran_test", password="123456"),
        restaurant=RestaurantInfo(id="r-test", name="Test Restoran"),
        order=OrderInfo(
            order_id=f"st-{uuid.uuid4()}",
            platform="getir",
            preparation_time=20,
            note="Müşteri notu",
            amount=120.0,
            is_paid=True,
            payment_type=PaymentTypeInfo(key="online", method="Online"),
            address=AddressInfo(
                neighborhood="Test Mah",
                address="Test Sk",
                building_no="1",
                town="Kadıköy",
                city="İstanbul",
                description=description_text,
                latitude=40.99,
                longitude=29.02,
            ),
            customer=CustomerInfo(full_name="Ali Veli", phone_number="05551112233"),
            products=[ProductInfo(quantity=1, price=120.0, name="Pizza", note="", total_price=120.0)],
        ),
    )


@pytest.mark.asyncio
async def test_address_direction_field_written():
    """address.description alanı 'address_direction' adıyla DB'ye yazılmalı."""
    fake_restaurant = {
        "id": "r-test",
        "company_id": "co-test",
        "name": "Test Restoran",
        "phone": "05550000000",
        "latitude": 41.0,
        "longitude": 29.0,
    }

    inserted_orders = []

    async def fake_insert(order):
        inserted_orders.append(order)
        return order

    with patch("routers.sepettakip.verify_sepettakip_api_key", new=AsyncMock(return_value=True)), \
         patch("routers.sepettakip.verify_restaurant_credentials", new=AsyncMock(return_value={"valid": True, "restaurant": fake_restaurant})), \
         patch("routers.sepettakip.db") as mock_db, \
         patch("routers.sepettakip._db_log", new=AsyncMock(return_value=None)), \
         patch("routers.sepettakip.insert_order", new=AsyncMock(side_effect=fake_insert)), \
         patch("routers.orders.calculate_preparation_time_async", new=AsyncMock(return_value=20)):

        mock_db.sepettakip_logs.insert_one = AsyncMock(return_value=None)
        mock_db.orders.find_one = AsyncMock(return_value=None)

        # Fake raw_request
        class FakeRequest:
            headers = {}
            async def body(self):
                return b"{}"

        req = _build_request("Apartmanın yanından girilir, mavi kapı")
        await create_package(request=req, raw_request=FakeRequest(), api_key="dummy")

        assert len(inserted_orders) == 1
        order = inserted_orders[0]
        assert order["address_direction"] == "Apartmanın yanından girilir, mavi kapı"
        # Eski field adı KALMAMALI
        assert "address_description" not in order
        # Source kontrolü
        assert order["source"] == "sepettakip"


@pytest.mark.asyncio
async def test_address_direction_empty_when_no_description():
    """description boş ise address_direction da boş string olmalı."""
    fake_restaurant = {
        "id": "r-test", "company_id": "co-test", "name": "T", "phone": "0",
        "latitude": 41.0, "longitude": 29.0,
    }
    inserted_orders = []

    async def fake_insert(order):
        inserted_orders.append(order)
        return order

    with patch("routers.sepettakip.verify_sepettakip_api_key", new=AsyncMock(return_value=True)), \
         patch("routers.sepettakip.verify_restaurant_credentials", new=AsyncMock(return_value={"valid": True, "restaurant": fake_restaurant})), \
         patch("routers.sepettakip.db") as mock_db, \
         patch("routers.sepettakip._db_log", new=AsyncMock(return_value=None)), \
         patch("routers.sepettakip.insert_order", new=AsyncMock(side_effect=fake_insert)), \
         patch("routers.orders.calculate_preparation_time_async", new=AsyncMock(return_value=15)):

        mock_db.sepettakip_logs.insert_one = AsyncMock(return_value=None)
        mock_db.orders.find_one = AsyncMock(return_value=None)

        class FakeRequest:
            headers = {}
            async def body(self):
                return b"{}"

        req = _build_request("")
        await create_package(request=req, raw_request=FakeRequest(), api_key="dummy")

        assert inserted_orders[0]["address_direction"] == ""
