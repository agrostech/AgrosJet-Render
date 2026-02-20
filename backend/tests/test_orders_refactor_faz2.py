"""
Backend tests for orders.py Faz 2 refactoring:
1. Admin status endpoint (POST /api/orders/{company_id}/{order_id}/status) - uses update_order_status_core()
2. Admin assign endpoint (POST /api/orders/{company_id}/{order_id}/assign) - uses assign_courier_core()
3. Admin unassign endpoint (DELETE /api/orders/{company_id}/{order_id}/assign)
4. Restaurant status endpoint (PUT /api/orders/{order_id}/status) - uses update_order_status_core()
"""
import pytest
import requests
import os
from datetime import datetime, timezone

BASE_URL = os.environ.get('REACT_APP_BACKEND_URL', '').rstrip('/')

# Test credentials
RESTAURANT_USER = {"username": "bostonddisparta", "password": "123456"}
ADMIN_USER = {"username": "onurertas", "password": "123456"}
COURIER_USER = {"phone": "05527370032", "password": "123456"}


class TestAdminLogin:
    """Admin authentication test"""
    
    def test_admin_login(self):
        """Test admin login returns company_id"""
        response = requests.post(f"{BASE_URL}/api/auth/admin/login", json=ADMIN_USER)
        assert response.status_code == 200, f"Admin login failed: {response.text}"
        
        data = response.json()
        assert "id" in data, "Missing user id"
        assert "company_id" in data, "Missing company_id"
        assert "role" in data, "Missing role"
        print(f"✓ Admin login successful: {data['name']} (company: {data['company_id']})")
        return data


class TestRestaurantLogin:
    """Restaurant authentication test"""
    
    def test_restaurant_login(self):
        """Test restaurant login returns restaurant_id"""
        response = requests.post(f"{BASE_URL}/api/restaurant-users/login", json=RESTAURANT_USER)
        assert response.status_code == 200, f"Restaurant login failed: {response.text}"
        
        data = response.json()
        assert "id" in data, "Missing user id"
        assert "restaurant_id" in data, "Missing restaurant_id"
        assert "company_id" in data, "Missing company_id"
        print(f"✓ Restaurant login successful: {data['name']} (restaurant: {data['restaurant_name']})")
        return data


class TestAdminStatusEndpoint:
    """Tests for POST /api/orders/{company_id}/{order_id}/status - Admin panel status update"""
    
    @pytest.fixture
    def admin_context(self):
        """Get admin context with company_id"""
        response = requests.post(f"{BASE_URL}/api/auth/admin/login", json=ADMIN_USER)
        if response.status_code != 200:
            pytest.skip("Admin login failed")
        return response.json()
    
    @pytest.fixture
    def test_order(self, admin_context):
        """Create or get a test order"""
        company_id = admin_context["company_id"]
        
        # Generate a mock order
        gen_resp = requests.post(f"{BASE_URL}/api/orders/{company_id}/generate-mock?count=1")
        if gen_resp.status_code != 200:
            pytest.skip("Failed to generate mock order")
        
        # Get the latest order
        orders_resp = requests.get(f"{BASE_URL}/api/orders/{company_id}?status=active&limit=5")
        if orders_resp.status_code != 200:
            pytest.skip("Failed to get orders")
        
        orders = orders_resp.json()
        if not orders:
            pytest.skip("No orders available")
        
        return orders[0]
    
    def test_admin_status_endpoint_preparing(self, admin_context, test_order):
        """Test admin changing status to preparing with preparation_time"""
        company_id = admin_context["company_id"]
        order_id = test_order["id"]
        
        response = requests.post(f"{BASE_URL}/api/orders/{company_id}/{order_id}/status", json={
            "status": "preparing",
            "preparation_time": 25,
            "admin_name": "Test Admin"
        })
        
        assert response.status_code == 200, f"Failed: {response.text}"
        data = response.json()
        assert "message" in data
        assert "Hazırlanıyor" in data["message"]
        print(f"✓ Admin status update to 'preparing' successful: {data['message']}")
    
    def test_admin_status_endpoint_ready(self, admin_context, test_order):
        """Test admin changing status to ready"""
        company_id = admin_context["company_id"]
        order_id = test_order["id"]
        
        # First set to preparing
        requests.post(f"{BASE_URL}/api/orders/{company_id}/{order_id}/status", json={
            "status": "preparing",
            "preparation_time": 15,
            "admin_name": "Test Admin"
        })
        
        # Then set to ready
        response = requests.post(f"{BASE_URL}/api/orders/{company_id}/{order_id}/status", json={
            "status": "ready",
            "admin_name": "Test Admin"
        })
        
        assert response.status_code == 200, f"Failed: {response.text}"
        data = response.json()
        assert "message" in data
        assert "Hazır" in data["message"]
        print(f"✓ Admin status update to 'ready' successful: {data['message']}")
    
    def test_admin_status_endpoint_cancelled(self, admin_context, test_order):
        """Test admin cancelling an order"""
        company_id = admin_context["company_id"]
        order_id = test_order["id"]
        
        response = requests.post(f"{BASE_URL}/api/orders/{company_id}/{order_id}/status", json={
            "status": "cancelled",
            "admin_name": "Test Admin",
            "cancel_note": "Test iptal - sistem testi"
        })
        
        assert response.status_code == 200, f"Failed: {response.text}"
        data = response.json()
        assert "message" in data
        print(f"✓ Admin status update to 'cancelled' successful: {data['message']}")
    
    def test_admin_status_invalid_status(self, admin_context):
        """Test admin sending invalid status"""
        company_id = admin_context["company_id"]
        
        response = requests.post(f"{BASE_URL}/api/orders/{company_id}/non-existent-id/status", json={
            "status": "invalid_status",
            "admin_name": "Test Admin"
        })
        
        # Should return 400 (invalid status) or 404 (order not found)
        assert response.status_code in [400, 404], f"Expected 400 or 404, got {response.status_code}"
        print("✓ Invalid status correctly rejected")
    
    def test_admin_status_courier_only_status_rejected(self, admin_context, test_order):
        """Test that admin cannot set courier-only statuses without super_admin flag"""
        company_id = admin_context["company_id"]
        order_id = test_order["id"]
        
        # Try to set 'assigned' status (should be rejected for non-super admin)
        response = requests.post(f"{BASE_URL}/api/orders/{company_id}/{order_id}/status", json={
            "status": "assigned",
            "admin_name": "Test Admin",
            "is_super_admin": False
        })
        
        # Should be rejected since 'assigned' is a courier-only status
        assert response.status_code == 400, f"Expected 400, got {response.status_code}: {response.text}"
        print("✓ Courier-only status correctly rejected for admin")


class TestRestaurantStatusEndpoint:
    """Tests for PUT /api/orders/{order_id}/status - Restaurant panel status update"""
    
    @pytest.fixture
    def restaurant_context(self):
        """Get restaurant context"""
        response = requests.post(f"{BASE_URL}/api/restaurant-users/login", json=RESTAURANT_USER)
        if response.status_code != 200:
            pytest.skip("Restaurant login failed")
        return response.json()
    
    @pytest.fixture
    def restaurant_order(self, restaurant_context):
        """Get or create a test order for restaurant"""
        restaurant_id = restaurant_context["restaurant_id"]
        company_id = restaurant_context["company_id"]
        
        # Generate mock order
        requests.post(f"{BASE_URL}/api/orders/{company_id}/generate-mock?count=1")
        
        # Get orders
        orders_resp = requests.get(f"{BASE_URL}/api/orders/restaurant/{restaurant_id}")
        orders = orders_resp.json()
        
        if not orders:
            pytest.skip("No orders available")
        
        # Return first active order
        active = [o for o in orders if o["status"] not in ["delivered", "cancelled"]]
        return active[0] if active else orders[0]
    
    def test_restaurant_status_preparing(self, restaurant_order):
        """Test restaurant updating status to preparing"""
        order_id = restaurant_order["id"]
        
        response = requests.put(f"{BASE_URL}/api/orders/{order_id}/status", json={
            "status": "preparing",
            "preparation_time": 20
        })
        
        assert response.status_code == 200, f"Failed: {response.text}"
        data = response.json()
        assert "message" in data
        print(f"✓ Restaurant status update to 'preparing' successful")
    
    def test_restaurant_status_ready(self, restaurant_order):
        """Test restaurant updating status to ready"""
        order_id = restaurant_order["id"]
        
        # First ensure preparing
        requests.put(f"{BASE_URL}/api/orders/{order_id}/status", json={
            "status": "preparing",
            "preparation_time": 15
        })
        
        response = requests.put(f"{BASE_URL}/api/orders/{order_id}/status", json={
            "status": "ready"
        })
        
        assert response.status_code == 200, f"Failed: {response.text}"
        print("✓ Restaurant status update to 'ready' successful")


class TestAdminAssignEndpoint:
    """Tests for POST /api/orders/{company_id}/{order_id}/assign - Admin kurye atama"""
    
    @pytest.fixture
    def admin_context(self):
        """Get admin context"""
        response = requests.post(f"{BASE_URL}/api/auth/admin/login", json=ADMIN_USER)
        if response.status_code != 200:
            pytest.skip("Admin login failed")
        return response.json()
    
    @pytest.fixture
    def courier_id(self):
        """Get a valid courier ID"""
        response = requests.post(f"{BASE_URL}/api/auth/courier/login", json=COURIER_USER)
        if response.status_code != 200:
            pytest.skip("Courier login failed")
        return response.json()["id"]
    
    @pytest.fixture
    def ready_order(self, admin_context):
        """Get or create a ready order for assignment"""
        company_id = admin_context["company_id"]
        
        # Generate mock order
        requests.post(f"{BASE_URL}/api/orders/{company_id}/generate-mock?count=1")
        
        # Get orders and set one to ready
        orders_resp = requests.get(f"{BASE_URL}/api/orders/{company_id}?status=active&limit=5")
        orders = orders_resp.json()
        
        if not orders:
            pytest.skip("No orders available")
        
        order = orders[0]
        
        # Set to ready
        requests.post(f"{BASE_URL}/api/orders/{company_id}/{order['id']}/status", json={
            "status": "ready",
            "admin_name": "Test Admin"
        })
        
        return order
    
    def test_assign_courier(self, admin_context, courier_id, ready_order):
        """Test assigning a courier to an order"""
        company_id = admin_context["company_id"]
        order_id = ready_order["id"]
        
        response = requests.post(f"{BASE_URL}/api/orders/{company_id}/{order_id}/assign", json={
            "courier_id": courier_id,
            "admin_name": "Test Admin"
        })
        
        assert response.status_code == 200, f"Failed: {response.text}"
        data = response.json()
        assert "message" in data
        assert "kuryesine atandı" in data["message"]
        print(f"✓ Courier assignment successful: {data['message']}")
    
    def test_assign_invalid_courier(self, admin_context, ready_order):
        """Test assigning invalid courier ID"""
        company_id = admin_context["company_id"]
        order_id = ready_order["id"]
        
        response = requests.post(f"{BASE_URL}/api/orders/{company_id}/{order_id}/assign", json={
            "courier_id": "non-existent-courier-id",
            "admin_name": "Test Admin"
        })
        
        # Should return 404 (courier not found)
        assert response.status_code == 404, f"Expected 404, got {response.status_code}: {response.text}"
        print("✓ Invalid courier ID correctly rejected")
    
    def test_assign_to_nonexistent_order(self, admin_context, courier_id):
        """Test assigning courier to non-existent order"""
        company_id = admin_context["company_id"]
        
        response = requests.post(f"{BASE_URL}/api/orders/{company_id}/non-existent-order/assign", json={
            "courier_id": courier_id,
            "admin_name": "Test Admin"
        })
        
        assert response.status_code == 404, f"Expected 404, got {response.status_code}"
        print("✓ Non-existent order correctly rejected")


class TestAdminUnassignEndpoint:
    """Tests for DELETE /api/orders/{company_id}/{order_id}/assign - Admin kurye atama kaldırma"""
    
    @pytest.fixture
    def admin_context(self):
        """Get admin context"""
        response = requests.post(f"{BASE_URL}/api/auth/admin/login", json=ADMIN_USER)
        if response.status_code != 200:
            pytest.skip("Admin login failed")
        return response.json()
    
    @pytest.fixture
    def courier_id(self):
        """Get a valid courier ID"""
        response = requests.post(f"{BASE_URL}/api/auth/courier/login", json=COURIER_USER)
        if response.status_code != 200:
            pytest.skip("Courier login failed")
        return response.json()["id"]
    
    @pytest.fixture
    def assigned_order(self, admin_context, courier_id):
        """Create an order with courier assigned"""
        company_id = admin_context["company_id"]
        
        # Generate mock order
        requests.post(f"{BASE_URL}/api/orders/{company_id}/generate-mock?count=1")
        
        # Get orders
        orders_resp = requests.get(f"{BASE_URL}/api/orders/{company_id}?status=active&limit=5")
        orders = orders_resp.json()
        
        if not orders:
            pytest.skip("No orders available")
        
        order = orders[0]
        
        # Set to ready first
        requests.post(f"{BASE_URL}/api/orders/{company_id}/{order['id']}/status", json={
            "status": "ready",
            "admin_name": "Test Admin"
        })
        
        # Assign courier
        requests.post(f"{BASE_URL}/api/orders/{company_id}/{order['id']}/assign", json={
            "courier_id": courier_id,
            "admin_name": "Test Admin"
        })
        
        return order
    
    def test_unassign_courier(self, admin_context, assigned_order):
        """Test removing courier from order"""
        company_id = admin_context["company_id"]
        order_id = assigned_order["id"]
        
        response = requests.delete(
            f"{BASE_URL}/api/orders/{company_id}/{order_id}/assign",
            params={"admin_name": "Test Admin"}
        )
        
        assert response.status_code == 200, f"Failed: {response.text}"
        data = response.json()
        assert "message" in data
        assert "kaldırıldı" in data["message"]
        print(f"✓ Courier unassignment successful: {data['message']}")
    
    def test_unassign_no_courier(self, admin_context):
        """Test unassigning from order with no courier"""
        company_id = admin_context["company_id"]
        
        # Generate mock order (no courier assigned)
        requests.post(f"{BASE_URL}/api/orders/{company_id}/generate-mock?count=1")
        
        orders_resp = requests.get(f"{BASE_URL}/api/orders/{company_id}?status=active&limit=5")
        orders = orders_resp.json()
        
        if not orders:
            pytest.skip("No orders available")
        
        # Find an order without courier
        order_without_courier = None
        for o in orders:
            if not o.get("courier_id"):
                order_without_courier = o
                break
        
        if not order_without_courier:
            pytest.skip("No order without courier available")
        
        response = requests.delete(
            f"{BASE_URL}/api/orders/{company_id}/{order_without_courier['id']}/assign"
        )
        
        assert response.status_code == 400, f"Expected 400, got {response.status_code}"
        print("✓ Unassign from order without courier correctly rejected")


class TestOrderListEndpoints:
    """Tests for order list endpoints"""
    
    def test_admin_order_list(self):
        """Test admin getting company orders"""
        response = requests.post(f"{BASE_URL}/api/auth/admin/login", json=ADMIN_USER)
        if response.status_code != 200:
            pytest.skip("Admin login failed")
        
        company_id = response.json()["company_id"]
        
        orders_resp = requests.get(f"{BASE_URL}/api/orders/{company_id}")
        assert orders_resp.status_code == 200
        orders = orders_resp.json()
        assert isinstance(orders, list)
        print(f"✓ Admin retrieved {len(orders)} orders")
    
    def test_restaurant_order_list(self):
        """Test restaurant getting their orders"""
        response = requests.post(f"{BASE_URL}/api/restaurant-users/login", json=RESTAURANT_USER)
        if response.status_code != 200:
            pytest.skip("Restaurant login failed")
        
        restaurant_id = response.json()["restaurant_id"]
        
        orders_resp = requests.get(f"{BASE_URL}/api/orders/restaurant/{restaurant_id}")
        assert orders_resp.status_code == 200
        orders = orders_resp.json()
        assert isinstance(orders, list)
        print(f"✓ Restaurant retrieved {len(orders)} orders")


class TestCleanup:
    """Clean up test data"""
    
    def test_cleanup_mock_orders(self):
        """Delete mock orders created during tests"""
        response = requests.post(f"{BASE_URL}/api/auth/admin/login", json=ADMIN_USER)
        if response.status_code != 200:
            pytest.skip("Admin login failed")
        
        company_id = response.json()["company_id"]
        
        cleanup_resp = requests.delete(f"{BASE_URL}/api/orders/{company_id}/clear-mock")
        assert cleanup_resp.status_code == 200
        data = cleanup_resp.json()
        print(f"✓ Cleanup: {data['message']}")


if __name__ == "__main__":
    pytest.main([__file__, "-v", "--tb=short"])
