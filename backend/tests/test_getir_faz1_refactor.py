"""
Getir Service FAZ 1 Refactoring Tests
- _extract_customer_info() (satır 425-432) 
- _extract_address_info() (satır 435-456)
- _extract_items() (satır 459-485)
- convert_getir_order_to_shiftjet() (satır 537-638)
- Order endpoints: /api/orders/restaurant/{restaurant_id}, /api/orders/{company_id}
"""
import pytest
import requests
import os

BASE_URL = os.environ.get('REACT_APP_BACKEND_URL', '').rstrip('/')

# Test credentials
ADMIN_USER = {"username": "onurertas", "password": "125594"}
RESTAURANT_USER = {"username": "bostonddisparta", "password": "123456"}


class TestHelperFunctionsUnit:
    """Unit tests for helper functions"""
    
    def test_extract_customer_info_basic(self):
        """Test _extract_customer_info with basic client data"""
        from services.getir_service import _extract_customer_info
        
        getir_order = {
            "client": {
                "name": "Test Müşteri",
                "clientPhoneNumber": "0532-123-4567",
                "contactPhoneNumber": "0850-123-4567"
            }
        }
        
        result = _extract_customer_info(getir_order)
        
        assert result["name"] == "Test Müşteri"
        assert result["phone"] == "05321234567"  # Tire temizlenmeli
        assert result["support_phone"] == "0850-123-4567"
    
    def test_extract_customer_info_empty(self):
        """Test _extract_customer_info with empty client"""
        from services.getir_service import _extract_customer_info
        
        getir_order = {"client": {}}
        result = _extract_customer_info(getir_order)
        
        assert result["name"] == "Müşteri"
        assert result["phone"] == ""
        assert result["support_phone"] == ""
    
    def test_extract_address_info_basic(self):
        """Test _extract_address_info with address field"""
        from services.getir_service import _extract_address_info
        
        getir_order = {
            "client": {
                "deliveryAddress": {
                    "address": "Test Mahallesi Test Sokak No:1",
                    "description": "Mavi kapı"
                },
                "location": {"lat": 39.9334, "lon": 32.8597}
            }
        }
        
        result = _extract_address_info(getir_order)
        
        assert result["text"] == "Test Mahallesi Test Sokak No:1"
        assert result["description"] == "Mavi kapı"
        assert result["latitude"] == 39.9334
        assert result["longitude"] == 32.8597
    
    def test_extract_address_info_constructed(self):
        """Test _extract_address_info building address from parts"""
        from services.getir_service import _extract_address_info
        
        getir_order = {
            "client": {
                "deliveryAddress": {
                    "neighborhood": "Merkez Mah",
                    "street": "Ana Cad",
                    "building": "12",
                    "aptNo": "5",
                    "district": "Kadıköy",
                    "city": "İstanbul"
                }
            }
        }
        
        result = _extract_address_info(getir_order)
        
        assert "Merkez Mah" in result["text"]
        assert "Ana Cad" in result["text"]
        assert "No: 12" in result["text"]
        assert "Daire: 5" in result["text"]
    
    def test_extract_items_basic(self):
        """Test _extract_items with products"""
        from services.getir_service import _extract_items
        
        getir_order = {
            "products": [
                {
                    "name": "Hamburger",
                    "count": 2,
                    "price": 150.0,
                    "note": "Az acı"
                },
                {
                    "name": "Kola",
                    "quantity": 1,
                    "priceWithOption": 30.0
                }
            ]
        }
        
        result = _extract_items(getir_order)
        
        assert len(result) == 2
        assert result[0]["name"] == "Hamburger"
        assert result[0]["quantity"] == 2
        assert result[0]["price"] == 75.0  # 150 / 2
        assert result[0]["notes"] == "Az acı"
        assert result[1]["name"] == "Kola"
        assert result[1]["quantity"] == 1
    
    def test_extract_items_with_options(self):
        """Test _extract_items with option categories"""
        from services.getir_service import _extract_items
        
        getir_order = {
            "products": [
                {
                    "name": "Pizza",
                    "count": 1,
                    "price": 200.0,
                    "optionCategories": [
                        {
                            "options": [
                                {"name": "Ekstra Peynir"},
                                {"name": "Sucuk"}
                            ]
                        }
                    ]
                }
            ]
        }
        
        result = _extract_items(getir_order)
        
        assert "Ekstra Peynir" in result[0]["name"]
        assert "Sucuk" in result[0]["name"]
    
    def test_extract_items_multilang_name(self):
        """Test _extract_items with multilingual product name"""
        from services.getir_service import _extract_items
        
        getir_order = {
            "products": [
                {
                    "name": {"tr": "Döner", "en": "Doner"},
                    "count": 1,
                    "price": 100.0
                }
            ]
        }
        
        result = _extract_items(getir_order)
        assert result[0]["name"] == "Döner"


class TestConvertGetirOrder:
    """Integration tests for convert_getir_order_to_shiftjet"""
    
    @pytest.mark.asyncio
    async def test_convert_basic_order(self):
        """Test convert_getir_order_to_shiftjet with a basic order"""
        from services.getir_service import convert_getir_order_to_shiftjet
        
        getir_order = {
            "id": "getir-order-123",
            "confirmationId": "AB1234",
            "client": {
                "name": "Test Müşteri",
                "clientPhoneNumber": "0532-111-2222",
                "deliveryAddress": {
                    "address": "Test Adres",
                    "description": "Kapı kodu 123"
                },
                "location": {"lat": 40.0, "lon": 32.0}
            },
            "products": [
                {"name": "Burger", "count": 1, "price": 100.0}
            ],
            "totalPrice": 100.0,
            "totalDiscountedPrice": 90.0,
            "paymentMethod": 4,  # Nakit
            "deliveryType": 2,  # Restoran Getirsin
            "status": 400,
            "verificationCode": "1234"
        }
        
        restaurant = {
            "id": "rest-123",
            "company_id": "comp-123",
            "name": "Test Restoran",
            "phone": "0212-123-4567",
            "latitude": 39.9,
            "longitude": 32.8
        }
        
        result = await convert_getir_order_to_shiftjet(getir_order, restaurant)
        
        # Verify basic fields
        assert result["order_number"] == "GT-AB1234"
        assert result["getir_order_id"] == "getir-order-123"
        assert result["getir_confirmation_id"] == "AB1234"
        assert result["customer_name"] == "Test Müşteri"
        assert result["customer_phone"] == "05321112222"
        assert result["delivery_address"] == "Test Adres"
        assert result["total_amount"] == 90.0  # totalDiscountedPrice
        assert result["payment_method"] == "cash"  # ID 4 = Nakit
        assert result["source"] == "getir"
        assert result["restaurant_id"] == "rest-123"
        assert result["company_id"] == "comp-123"
        
        # Verify items
        assert len(result["items"]) == 1
        assert result["items"][0]["name"] == "Burger"
        
        # Verify getir_raw
        assert result["getir_raw"]["deliveryType"] == 2
        assert result["getir_raw"]["isGetirCourier"] == False


class TestOrderEndpoints:
    """API endpoint tests for orders"""
    
    @pytest.fixture(autouse=True)
    def setup(self):
        """Setup session for API calls"""
        self.session = requests.Session()
        self.session.headers.update({"Content-Type": "application/json"})
    
    def test_admin_login(self):
        """Test admin login"""
        response = self.session.post(f"{BASE_URL}/api/admin/login", json=ADMIN_USER)
        assert response.status_code == 200, f"Admin login failed: {response.text}"
        
        data = response.json()
        assert "company_id" in data
        assert "user_id" in data
        return data
    
    def test_restaurant_login(self):
        """Test restaurant login"""
        response = self.session.post(f"{BASE_URL}/api/restaurants/login", json=RESTAURANT_USER)
        assert response.status_code == 200, f"Restaurant login failed: {response.text}"
        
        data = response.json()
        assert "restaurant_id" in data or "id" in data
        return data
    
    def test_get_orders_by_company(self):
        """Test /api/orders/{company_id} endpoint"""
        # First login to get company_id
        login_response = self.session.post(f"{BASE_URL}/api/admin/login", json=ADMIN_USER)
        assert login_response.status_code == 200
        
        login_data = login_response.json()
        company_id = login_data.get("company_id")
        assert company_id, "company_id not found in login response"
        
        # Get orders
        response = self.session.get(f"{BASE_URL}/api/orders/{company_id}")
        assert response.status_code == 200, f"Get orders failed: {response.text}"
        
        data = response.json()
        assert isinstance(data, list), "Expected list of orders"
        print(f"✓ Admin panel - Found {len(data)} orders")
        
        # Verify order structure if orders exist
        if len(data) > 0:
            order = data[0]
            assert "id" in order, "Order should have id"
            assert "status" in order, "Order should have status"
            assert "restaurant_id" in order or "restaurant_name" in order
    
    def test_get_orders_by_company_with_status_filter(self):
        """Test /api/orders/{company_id} with status filter"""
        login_response = self.session.post(f"{BASE_URL}/api/admin/login", json=ADMIN_USER)
        assert login_response.status_code == 200
        
        company_id = login_response.json().get("company_id")
        
        # Test status filter
        response = self.session.get(f"{BASE_URL}/api/orders/{company_id}?status=active")
        assert response.status_code == 200
        
        data = response.json()
        assert isinstance(data, list)
        print(f"✓ Admin panel - Found {len(data)} active orders")
    
    def test_get_orders_by_restaurant(self):
        """Test /api/orders/restaurant/{restaurant_id} endpoint"""
        # First login to get restaurant_id
        login_response = self.session.post(f"{BASE_URL}/api/restaurants/login", json=RESTAURANT_USER)
        assert login_response.status_code == 200, f"Restaurant login failed: {login_response.text}"
        
        login_data = login_response.json()
        restaurant_id = login_data.get("restaurant_id") or login_data.get("id")
        assert restaurant_id, f"restaurant_id not found in login response: {login_data}"
        
        # Get orders
        response = self.session.get(f"{BASE_URL}/api/orders/restaurant/{restaurant_id}")
        assert response.status_code == 200, f"Get restaurant orders failed: {response.text}"
        
        data = response.json()
        assert isinstance(data, list), "Expected list of orders"
        print(f"✓ Restaurant panel - Found {len(data)} orders for restaurant")
        
        # Verify all orders belong to this restaurant
        for order in data:
            assert order.get("restaurant_id") == restaurant_id, \
                f"Order {order.get('id')} doesn't belong to restaurant {restaurant_id}"
    
    def test_get_orders_by_restaurant_with_status(self):
        """Test /api/orders/restaurant/{restaurant_id} with status filter"""
        login_response = self.session.post(f"{BASE_URL}/api/restaurants/login", json=RESTAURANT_USER)
        assert login_response.status_code == 200
        
        restaurant_id = login_response.json().get("restaurant_id") or login_response.json().get("id")
        
        # Test with delivered status
        response = self.session.get(f"{BASE_URL}/api/orders/restaurant/{restaurant_id}?status=delivered")
        assert response.status_code == 200
        
        data = response.json()
        assert isinstance(data, list)
        
        # Verify all orders have delivered status
        for order in data:
            assert order.get("status") == "delivered", f"Expected delivered status, got {order.get('status')}"
        
        print(f"✓ Restaurant panel - Found {len(data)} delivered orders")


class TestPaymentMethodMapping:
    """Test payment method mapping"""
    
    def test_map_getir_payment_numeric(self):
        """Test map_getir_payment with numeric IDs"""
        from services.getir_service import map_getir_payment
        
        assert map_getir_payment(4) == "cash"  # Nakit
        assert map_getir_payment(3) == "card"  # Kredi/Banka Kartı
        assert map_getir_payment(5) == "meal_card"  # Multinet Kart
        assert map_getir_payment(26) == "online"  # Online Ödeme
    
    def test_map_getir_payment_dict(self):
        """Test map_getir_payment with dict format"""
        from services.getir_service import map_getir_payment
        
        assert map_getir_payment({"id": 4}) == "cash"
        assert map_getir_payment({"paymentMethod": 3}) == "card"
    
    def test_get_payment_method_name(self):
        """Test get_payment_method_name"""
        from services.getir_service import get_payment_method_name
        
        assert get_payment_method_name(4) == "Nakit"
        assert get_payment_method_name(5) == "Multinet Kart"


class TestStatusMapping:
    """Test status mapping"""
    
    def test_map_getir_status_numeric(self):
        """Test map_getir_status with numeric statuses"""
        from services.getir_service import map_getir_status
        
        assert map_getir_status(400) == "pending"
        assert map_getir_status(500) == "preparing"
        assert map_getir_status(550) == "ready"
        assert map_getir_status(700) == "on_the_way"
        assert map_getir_status(900) == "delivered"
        assert map_getir_status(1600) == "cancelled"
    
    def test_map_getir_status_string(self):
        """Test map_getir_status with string statuses"""
        from services.getir_service import map_getir_status
        
        assert map_getir_status("pending") == "pending"
        assert map_getir_status("preparing") == "preparing"
        assert map_getir_status("delivered") == "delivered"


if __name__ == "__main__":
    pytest.main([__file__, "-v", "--tb=short"])
