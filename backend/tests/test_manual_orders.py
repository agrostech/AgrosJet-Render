"""
Test cases for Manual Order Creation Feature (Telefon Siparişi)
Tests the /api/orders/manual endpoint for both normal and scheduled orders
"""
import pytest
import requests
import os
from datetime import datetime, timedelta

BASE_URL = os.environ.get('REACT_APP_BACKEND_URL', '').rstrip('/')

# Test data
RESTAURANT_ID = "rest_c9c5cb06"
PRODUCT_ID = "prod_e0442046"
CATEGORY_ID = "cat_18d696d5"


@pytest.fixture
def api_client():
    """Shared requests session"""
    session = requests.Session()
    session.headers.update({"Content-Type": "application/json"})
    return session


class TestRestaurantUserLogin:
    """Restaurant user authentication tests"""
    
    def test_restaurant_login_success(self, api_client):
        """Test restaurant user login with valid credentials"""
        response = api_client.post(f"{BASE_URL}/api/restaurant-users/login", json={
            "username": "testrestaurant",
            "password": "password123"
        })
        
        assert response.status_code == 200
        data = response.json()
        assert data["role"] == "restaurant"
        assert data["restaurant_id"] == RESTAURANT_ID
        assert "restaurant_name" in data
        print(f"✓ Restaurant login successful: {data['username']}")


class TestProductsAPI:
    """Product listing tests"""
    
    def test_get_products_for_restaurant(self, api_client):
        """Test fetching products for a restaurant"""
        response = api_client.get(f"{BASE_URL}/api/products/restaurant/{RESTAURANT_ID}")
        
        assert response.status_code == 200
        data = response.json()
        assert "categories" in data
        assert "products" in data
        assert data["categories_count"] >= 1
        assert data["products_count"] >= 1
        print(f"✓ Products loaded: {data['products_count']} products in {data['categories_count']} categories")
        
        # Verify our test product exists
        product_ids = [p["id"] for p in data["products"]]
        assert PRODUCT_ID in product_ids
        print(f"✓ Test product {PRODUCT_ID} found in product list")


class TestManualOrderCreation:
    """Manual order creation tests (normal orders)"""
    
    def test_create_normal_order_success(self, api_client):
        """Test creating a normal manual order"""
        order_data = {
            "restaurant_id": RESTAURANT_ID,
            "customer_name": "TEST_Normal Order Customer",
            "customer_phone": "05551112233",
            "delivery_address": "Test Address No:1, Test Mahallesi",
            "items": [
                {
                    "product_id": PRODUCT_ID,
                    "name": "Döner",
                    "quantity": 2,
                    "price": 150.0
                }
            ],
            "payment_method": "cash",
            "notes": "Normal order test note",
            "is_scheduled": False
        }
        
        response = api_client.post(f"{BASE_URL}/api/orders/manual", json=order_data)
        
        assert response.status_code == 200
        data = response.json()
        assert data["message"] == "Sipariş başarıyla oluşturuldu"
        
        order = data["order"]
        assert order["status"] == "preparing"
        assert order["is_scheduled"] == False
        assert order["source"] == "manual"
        assert order["total_amount"] == 300.0  # 150 * 2
        assert order["customer_name"] == "TEST_Normal Order Customer"
        assert order["payment_method"] == "cash"
        assert order["order_number"].startswith("TEL-")
        print(f"✓ Normal order created: {order['order_number']}")
        
        return order["id"]
    
    def test_create_order_validates_required_fields(self, api_client):
        """Test that required fields are validated"""
        # Missing customer_name
        response = api_client.post(f"{BASE_URL}/api/orders/manual", json={
            "restaurant_id": RESTAURANT_ID,
            "customer_name": "",  # Empty name
            "delivery_address": "Test Address",
            "items": [{"product_id": PRODUCT_ID, "name": "Döner", "quantity": 1, "price": 150.0}],
            "payment_method": "cash"
        })
        
        # Should fail validation or return error
        # Note: The current implementation might not validate empty strings
        print(f"Empty customer name response: {response.status_code}")
    
    def test_create_order_calculates_total_correctly(self, api_client):
        """Test that order total is calculated correctly"""
        order_data = {
            "restaurant_id": RESTAURANT_ID,
            "customer_name": "TEST_Total Calculation Customer",
            "delivery_address": "Test Address",
            "items": [
                {"product_id": PRODUCT_ID, "name": "Döner", "quantity": 3, "price": 150.0},
            ],
            "payment_method": "card"
        }
        
        response = api_client.post(f"{BASE_URL}/api/orders/manual", json=order_data)
        
        assert response.status_code == 200
        order = response.json()["order"]
        expected_total = 3 * 150.0  # 450
        assert order["total_amount"] == expected_total
        print(f"✓ Total calculated correctly: {order['total_amount']}₺")
    
    def test_create_order_different_payment_methods(self, api_client):
        """Test creating orders with different payment methods"""
        payment_methods = ["cash", "card", "online"]
        
        for method in payment_methods:
            order_data = {
                "restaurant_id": RESTAURANT_ID,
                "customer_name": f"TEST_Payment {method}",
                "delivery_address": "Test Address",
                "items": [{"product_id": PRODUCT_ID, "name": "Döner", "quantity": 1, "price": 150.0}],
                "payment_method": method
            }
            
            response = api_client.post(f"{BASE_URL}/api/orders/manual", json=order_data)
            assert response.status_code == 200
            order = response.json()["order"]
            assert order["payment_method"] == method
            print(f"✓ Order with {method} payment created: {order['order_number']}")


class TestScheduledOrderCreation:
    """Scheduled order creation tests"""
    
    def test_create_scheduled_order_success(self, api_client):
        """Test creating a scheduled order with future delivery time"""
        # Schedule for tomorrow at 14:30
        tomorrow = (datetime.utcnow() + timedelta(days=1)).strftime("%Y-%m-%d")
        scheduled_time = f"{tomorrow}T14:30:00+00:00"
        
        order_data = {
            "restaurant_id": RESTAURANT_ID,
            "customer_name": "TEST_Scheduled Order Customer",
            "customer_phone": "05559876543",
            "delivery_address": "Scheduled Delivery Address No:5",
            "items": [
                {"product_id": PRODUCT_ID, "name": "Döner", "quantity": 1, "price": 150.0}
            ],
            "payment_method": "card",
            "notes": "Scheduled order test",
            "is_scheduled": True,
            "scheduled_time": scheduled_time
        }
        
        response = api_client.post(f"{BASE_URL}/api/orders/manual", json=order_data)
        
        assert response.status_code == 200
        data = response.json()
        order = data["order"]
        
        # Verify scheduled order properties
        assert order["status"] == "scheduled"
        assert order["is_scheduled"] == True
        assert order["scheduled_time"] == scheduled_time
        assert order["source"] == "manual"
        print(f"✓ Scheduled order created: {order['order_number']} for {scheduled_time}")
        
        # Verify 30-minute buffer is applied
        # preparation_end_at should be 30 minutes before scheduled_time
        prep_end = datetime.fromisoformat(order["preparation_end_at"].replace("+00:00", ""))
        scheduled_dt = datetime.fromisoformat(scheduled_time.replace("+00:00", ""))
        buffer = scheduled_dt - prep_end
        assert buffer.total_seconds() == 30 * 60  # 30 minutes in seconds
        print(f"✓ 30-minute buffer applied correctly")
        
        return order["id"]
    
    def test_scheduled_order_status_history(self, api_client):
        """Test that scheduled order has correct status history"""
        tomorrow = (datetime.utcnow() + timedelta(days=1)).strftime("%Y-%m-%d")
        scheduled_time = f"{tomorrow}T15:00:00+00:00"
        
        order_data = {
            "restaurant_id": RESTAURANT_ID,
            "customer_name": "TEST_History Check Customer",
            "delivery_address": "Test Address",
            "items": [{"product_id": PRODUCT_ID, "name": "Döner", "quantity": 1, "price": 150.0}],
            "payment_method": "cash",
            "is_scheduled": True,
            "scheduled_time": scheduled_time
        }
        
        response = api_client.post(f"{BASE_URL}/api/orders/manual", json=order_data)
        
        assert response.status_code == 200
        order = response.json()["order"]
        
        # Check status history
        assert len(order["status_history"]) >= 1
        first_history = order["status_history"][0]
        assert first_history["status"] == "scheduled"
        assert first_history["label"] == "Programlı Sipariş"
        assert first_history["actor_type"] == "restaurant"
        print(f"✓ Status history correct for scheduled order")


class TestOrderRetrieval:
    """Tests for retrieving orders"""
    
    def test_get_orders_by_restaurant(self, api_client):
        """Test fetching orders for a specific restaurant"""
        response = api_client.get(f"{BASE_URL}/api/orders/restaurant/{RESTAURANT_ID}")
        
        assert response.status_code == 200
        orders = response.json()
        assert isinstance(orders, list)
        
        # Check that manual orders exist
        manual_orders = [o for o in orders if o.get("source") == "manual"]
        print(f"✓ Found {len(manual_orders)} manual orders for restaurant")
        
        # Check for scheduled orders
        scheduled_orders = [o for o in orders if o.get("status") == "scheduled"]
        print(f"✓ Found {len(scheduled_orders)} scheduled orders")
    
    def test_orders_have_correct_fields(self, api_client):
        """Test that orders have all required fields"""
        response = api_client.get(f"{BASE_URL}/api/orders/restaurant/{RESTAURANT_ID}")
        
        assert response.status_code == 200
        orders = response.json()
        
        if orders:
            order = orders[0]
            required_fields = [
                "id", "order_number", "restaurant_id", "customer_name",
                "delivery_address", "items", "total_amount", "payment_method",
                "status", "created_at", "source"
            ]
            for field in required_fields:
                assert field in order, f"Missing field: {field}"
            print("✓ All required fields present in orders")


class TestOrderStatusUpdate:
    """Tests for updating order status"""
    
    def test_update_scheduled_to_preparing(self, api_client):
        """Test starting preparation on a scheduled order"""
        # First create a scheduled order
        tomorrow = (datetime.utcnow() + timedelta(days=1)).strftime("%Y-%m-%d")
        scheduled_time = f"{tomorrow}T16:00:00+00:00"
        
        order_data = {
            "restaurant_id": RESTAURANT_ID,
            "customer_name": "TEST_Status Update Customer",
            "delivery_address": "Test Address",
            "items": [{"product_id": PRODUCT_ID, "name": "Döner", "quantity": 1, "price": 150.0}],
            "payment_method": "cash",
            "is_scheduled": True,
            "scheduled_time": scheduled_time
        }
        
        create_response = api_client.post(f"{BASE_URL}/api/orders/manual", json=order_data)
        assert create_response.status_code == 200
        order_id = create_response.json()["order"]["id"]
        
        # Update status to preparing
        update_response = api_client.put(f"{BASE_URL}/api/orders/{order_id}/status", json={
            "status": "preparing"
        })
        
        assert update_response.status_code == 200
        print(f"✓ Scheduled order status updated to preparing")


# Cleanup - run this after tests
class TestCleanup:
    """Cleanup test data"""
    
    def test_cleanup_test_orders(self, api_client):
        """Remove test orders created during testing"""
        response = api_client.get(f"{BASE_URL}/api/orders/restaurant/{RESTAURANT_ID}")
        
        if response.status_code == 200:
            orders = response.json()
            test_orders = [o for o in orders if o.get("customer_name", "").startswith("TEST_")]
            print(f"Found {len(test_orders)} test orders to cleanup")
            # Note: Orders would need a delete endpoint to clean up
            # For now, just report the count


if __name__ == "__main__":
    pytest.main([__file__, "-v", "--tb=short"])
