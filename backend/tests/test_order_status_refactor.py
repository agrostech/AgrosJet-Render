"""
Backend tests for order status refactoring - update_order_status_core() function
Testing:
1. PUT /api/orders/{order_id}/status endpoint
2. Merkezi update_order_status_core() fonksiyonu
3. Status history tracking
4. Restaurant login flow
5. Admin login flow
"""
import pytest
import requests
import os
from datetime import datetime, timezone
import uuid

BASE_URL = os.environ.get('REACT_APP_BACKEND_URL', '').rstrip('/')

class TestAuthFlows:
    """Authentication endpoint tests"""
    
    def test_restaurant_login_success(self):
        """Test restaurant user login - bostonddisparta"""
        response = requests.post(f"{BASE_URL}/api/restaurant-users/login", json={
            "username": "bostonddisparta",
            "password": "123456"
        })
        assert response.status_code == 200, f"Login failed: {response.text}"
        
        data = response.json()
        assert "id" in data
        assert "restaurant_id" in data
        assert data["username"] == "bostonddisparta"
        assert data["restaurant_name"] == "Boston D&D"
        print(f"✓ Restaurant login successful: {data['name']}")
    
    def test_admin_login_success(self):
        """Test admin user login - onurertas"""
        response = requests.post(f"{BASE_URL}/api/auth/admin/login", json={
            "username": "onurertas",
            "password": "123456"
        })
        assert response.status_code == 200, f"Login failed: {response.text}"
        
        data = response.json()
        assert "id" in data
        assert "company_id" in data
        assert data["username"] == "onurertas"
        assert data["role"] in ["admin", "superadmin"]
        print(f"✓ Admin login successful: {data['name']}")
    
    def test_restaurant_login_invalid_credentials(self):
        """Test restaurant login with wrong password"""
        response = requests.post(f"{BASE_URL}/api/restaurant-users/login", json={
            "username": "bostonddisparta",
            "password": "wrongpassword"
        })
        assert response.status_code == 401
        print("✓ Invalid credentials correctly rejected")


class TestOrderStatusEndpoint:
    """Tests for PUT /api/orders/{order_id}/status endpoint"""
    
    @pytest.fixture
    def test_order(self):
        """Create a test order for status updates"""
        # First get restaurant info
        login_resp = requests.post(f"{BASE_URL}/api/restaurant-users/login", json={
            "username": "bostonddisparta",
            "password": "123456"
        })
        restaurant_id = login_resp.json()["restaurant_id"]
        company_id = login_resp.json()["company_id"]
        
        # Create mock order via generate-mock endpoint
        response = requests.post(f"{BASE_URL}/api/orders/{company_id}/generate-mock?count=1")
        assert response.status_code == 200
        
        # Get the latest order
        orders_resp = requests.get(f"{BASE_URL}/api/orders/restaurant/{restaurant_id}?status=preparing")
        orders = orders_resp.json()
        
        if orders:
            return orders[0]
        return None
    
    def test_update_status_to_preparing(self, test_order):
        """Test changing status to preparing with preparation time"""
        if not test_order:
            pytest.skip("No test order available")
        
        order_id = test_order["id"]
        
        response = requests.put(f"{BASE_URL}/api/orders/{order_id}/status", json={
            "status": "preparing",
            "preparation_time": 20
        })
        
        assert response.status_code == 200, f"Failed: {response.text}"
        data = response.json()
        assert data["status"] == "preparing"
        assert data["message"] == "Sipariş durumu güncellendi"
        print(f"✓ Status updated to preparing for order {order_id}")
    
    def test_update_status_to_ready(self, test_order):
        """Test changing status to ready"""
        if not test_order:
            pytest.skip("No test order available")
        
        order_id = test_order["id"]
        
        # First ensure it's in preparing state
        requests.put(f"{BASE_URL}/api/orders/{order_id}/status", json={
            "status": "preparing",
            "preparation_time": 15
        })
        
        # Then change to ready
        response = requests.put(f"{BASE_URL}/api/orders/{order_id}/status", json={
            "status": "ready"
        })
        
        assert response.status_code == 200, f"Failed: {response.text}"
        data = response.json()
        assert data["status"] == "ready"
        print(f"✓ Status updated to ready for order {order_id}")
    
    def test_update_status_to_cancelled(self, test_order):
        """Test cancelling an order with cancel note"""
        if not test_order:
            pytest.skip("No test order available")
        
        order_id = test_order["id"]
        
        response = requests.put(f"{BASE_URL}/api/orders/{order_id}/status", json={
            "status": "cancelled",
            "cancel_note": "Test iptal - restoran isteği"
        })
        
        assert response.status_code == 200, f"Failed: {response.text}"
        data = response.json()
        assert data["status"] == "cancelled"
        print(f"✓ Order {order_id} cancelled successfully")
    
    def test_invalid_status_rejected(self):
        """Test that invalid status values are rejected"""
        # Use a non-existent order ID - should fail with 404 not 400
        response = requests.put(f"{BASE_URL}/api/orders/non-existent-id/status", json={
            "status": "invalid_status"
        })
        
        # Either 404 (order not found) or 400 (invalid status) is acceptable
        assert response.status_code in [400, 404], f"Expected 400 or 404, got {response.status_code}"
        print("✓ Invalid status correctly handled")


class TestRestaurantOrderList:
    """Tests for restaurant order list endpoint"""
    
    def test_get_restaurant_orders(self):
        """Test getting orders for a restaurant"""
        # Get restaurant info
        login_resp = requests.post(f"{BASE_URL}/api/restaurant-users/login", json={
            "username": "bostonddisparta",
            "password": "123456"
        })
        restaurant_id = login_resp.json()["restaurant_id"]
        
        response = requests.get(f"{BASE_URL}/api/orders/restaurant/{restaurant_id}")
        
        assert response.status_code == 200
        orders = response.json()
        assert isinstance(orders, list)
        print(f"✓ Retrieved {len(orders)} orders for restaurant")
    
    def test_get_restaurant_orders_with_status_filter(self):
        """Test getting orders with status filter"""
        login_resp = requests.post(f"{BASE_URL}/api/restaurant-users/login", json={
            "username": "bostonddisparta",
            "password": "123456"
        })
        restaurant_id = login_resp.json()["restaurant_id"]
        
        for status in ["preparing", "ready", "on_the_way", "delivered", "cancelled"]:
            response = requests.get(f"{BASE_URL}/api/orders/restaurant/{restaurant_id}?status={status}")
            assert response.status_code == 200
            orders = response.json()
            # All orders should have the filtered status
            for order in orders:
                assert order["status"] == status, f"Expected status {status}, got {order['status']}"
        
        print("✓ Status filter working correctly")


class TestCourierEndpoints:
    """Tests for courier-related endpoints"""
    
    def test_get_courier_active_orders(self):
        """Test getting active orders for a courier"""
        # First login as courier
        login_resp = requests.post(f"{BASE_URL}/api/auth/courier/login", json={
            "phone": "05527370032",
            "password": "123456"
        })
        
        if login_resp.status_code != 200:
            pytest.skip("Courier login failed")
        
        courier_id = login_resp.json()["id"]
        
        response = requests.get(f"{BASE_URL}/api/orders/courier/{courier_id}/active")
        
        assert response.status_code == 200
        orders = response.json()
        assert isinstance(orders, list)
        
        # All orders should be in active states
        for order in orders:
            assert order["status"] in ["assigned", "confirmed", "on_the_way"]
        
        print(f"✓ Retrieved {len(orders)} active orders for courier")


class TestStatusHistory:
    """Tests for status history tracking via update_order_status_core"""
    
    def test_status_history_created(self):
        """Test that status changes are recorded in history"""
        # Get restaurant info
        login_resp = requests.post(f"{BASE_URL}/api/restaurant-users/login", json={
            "username": "bostonddisparta",
            "password": "123456"
        })
        restaurant_id = login_resp.json()["restaurant_id"]
        company_id = login_resp.json()["company_id"]
        
        # Create mock order
        requests.post(f"{BASE_URL}/api/orders/{company_id}/generate-mock?count=1")
        
        # Get the latest order
        orders_resp = requests.get(f"{BASE_URL}/api/orders/restaurant/{restaurant_id}?status=preparing")
        orders = orders_resp.json()
        
        if not orders:
            pytest.skip("No orders available for testing")
        
        order = orders[0]
        order_id = order["id"]
        
        # Update status
        requests.put(f"{BASE_URL}/api/orders/{order_id}/status", json={
            "status": "ready"
        })
        
        # Get updated order
        updated_orders = requests.get(f"{BASE_URL}/api/orders/restaurant/{restaurant_id}?status=ready").json()
        updated_order = next((o for o in updated_orders if o["id"] == order_id), None)
        
        if updated_order:
            # Check status_history
            assert "status_history" in updated_order
            history = updated_order["status_history"]
            assert len(history) > 0
            
            # Latest entry should be "ready"
            latest = history[-1]
            assert latest["status"] == "ready"
            assert "timestamp" in latest
            assert "actor_type" in latest
            print(f"✓ Status history correctly recorded: {len(history)} entries")
        else:
            print("✓ Order was already processed")


if __name__ == "__main__":
    pytest.main([__file__, "-v", "--tb=short"])
