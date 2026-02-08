"""
Test cases for Courier Break Time Management
- GET /api/couriers/{id}/break-status
- PUT /api/couriers/{id}/break-limit
- PUT /api/couriers/{id}/availability (break limit enforcement)
"""
import pytest
import requests
import os

BASE_URL = os.environ.get('REACT_APP_BACKEND_URL', '').rstrip('/')
COURIER_ID = "573a528d-b847-4622-8af1-160e89f9dde3"


class TestCourierBreakStatus:
    """Test GET /api/couriers/{id}/break-status endpoint"""
    
    def test_get_break_status_success(self):
        """Test getting break status for existing courier"""
        response = requests.get(f"{BASE_URL}/api/couriers/{COURIER_ID}/break-status")
        
        assert response.status_code == 200
        data = response.json()
        
        # Verify response structure
        assert "daily_break_limit" in data
        assert "used_break_time" in data
        assert "remaining_break_time" in data
        assert "is_on_break" in data
        
        # Verify data types
        assert isinstance(data["daily_break_limit"], int)
        assert isinstance(data["used_break_time"], int)
        assert isinstance(data["remaining_break_time"], int)
        assert isinstance(data["is_on_break"], bool)
        
        # Verify remaining = limit - used
        assert data["remaining_break_time"] == max(0, data["daily_break_limit"] - data["used_break_time"])
        
        print(f"✓ Break status: limit={data['daily_break_limit']}dk, used={data['used_break_time']}dk, remaining={data['remaining_break_time']}dk")
    
    def test_get_break_status_invalid_courier(self):
        """Test getting break status for non-existent courier"""
        response = requests.get(f"{BASE_URL}/api/couriers/invalid-courier-id/break-status")
        
        assert response.status_code == 404
        data = response.json()
        assert "detail" in data
        print(f"✓ Invalid courier returns 404: {data['detail']}")


class TestCourierBreakLimit:
    """Test PUT /api/couriers/{id}/break-limit endpoint"""
    
    def test_update_break_limit_success(self):
        """Test updating break limit to valid value"""
        # Update to 45 minutes
        response = requests.put(
            f"{BASE_URL}/api/couriers/{COURIER_ID}/break-limit",
            json={"daily_break_limit": 45}
        )
        
        assert response.status_code == 200
        data = response.json()
        assert "message" in data
        assert "45" in data["message"]
        
        # Verify the change persisted
        verify_response = requests.get(f"{BASE_URL}/api/couriers/{COURIER_ID}/break-status")
        assert verify_response.status_code == 200
        verify_data = verify_response.json()
        assert verify_data["daily_break_limit"] == 45
        
        print(f"✓ Break limit updated to 45 minutes")
    
    def test_update_break_limit_various_values(self):
        """Test updating break limit to various valid values"""
        valid_values = [15, 30, 60, 90, 120]
        
        for value in valid_values:
            response = requests.put(
                f"{BASE_URL}/api/couriers/{COURIER_ID}/break-limit",
                json={"daily_break_limit": value}
            )
            assert response.status_code == 200
            print(f"✓ Break limit {value}dk accepted")
        
        # Reset to 45
        requests.put(
            f"{BASE_URL}/api/couriers/{COURIER_ID}/break-limit",
            json={"daily_break_limit": 45}
        )
    
    def test_update_break_limit_invalid_negative(self):
        """Test updating break limit to negative value"""
        response = requests.put(
            f"{BASE_URL}/api/couriers/{COURIER_ID}/break-limit",
            json={"daily_break_limit": -10}
        )
        
        assert response.status_code == 400
        data = response.json()
        assert "detail" in data
        print(f"✓ Negative value rejected: {data['detail']}")
    
    def test_update_break_limit_invalid_too_high(self):
        """Test updating break limit to value > 480 (8 hours)"""
        response = requests.put(
            f"{BASE_URL}/api/couriers/{COURIER_ID}/break-limit",
            json={"daily_break_limit": 500}
        )
        
        assert response.status_code == 400
        data = response.json()
        assert "detail" in data
        print(f"✓ Value > 480 rejected: {data['detail']}")
    
    def test_update_break_limit_invalid_courier(self):
        """Test updating break limit for non-existent courier"""
        response = requests.put(
            f"{BASE_URL}/api/couriers/invalid-courier-id/break-limit",
            json={"daily_break_limit": 30}
        )
        
        assert response.status_code == 404
        print(f"✓ Invalid courier returns 404")


class TestCourierAvailabilityWithBreakLimit:
    """Test break limit enforcement when going on break"""
    
    def test_availability_status_update(self):
        """Test updating availability status"""
        # Set to active first
        response = requests.put(
            f"{BASE_URL}/api/couriers/{COURIER_ID}/availability",
            json={"availability_status": "active"}
        )
        assert response.status_code == 200
        
        # Verify courier is active
        verify = requests.get(f"{BASE_URL}/api/couriers/{COURIER_ID}")
        assert verify.json()["availability_status"] == "active"
        print(f"✓ Courier set to active")
    
    def test_go_on_break_success(self):
        """Test going on break when limit not exhausted"""
        # First ensure courier is active
        requests.put(
            f"{BASE_URL}/api/couriers/{COURIER_ID}/availability",
            json={"availability_status": "active"}
        )
        
        # Try to go on break
        response = requests.put(
            f"{BASE_URL}/api/couriers/{COURIER_ID}/availability",
            json={"availability_status": "on_break"}
        )
        
        assert response.status_code == 200
        data = response.json()
        assert "Molada" in data["message"]
        print(f"✓ Courier went on break successfully")
        
        # Set back to active for other tests
        requests.put(
            f"{BASE_URL}/api/couriers/{COURIER_ID}/availability",
            json={"availability_status": "active"}
        )
    
    def test_invalid_availability_status(self):
        """Test setting invalid availability status"""
        response = requests.put(
            f"{BASE_URL}/api/couriers/{COURIER_ID}/availability",
            json={"availability_status": "invalid_status"}
        )
        
        assert response.status_code == 400
        data = response.json()
        assert "detail" in data
        print(f"✓ Invalid status rejected: {data['detail']}")


class TestCourierOrders:
    """Test courier orders endpoint for assigned/on_the_way grouping"""
    
    def test_get_active_orders(self):
        """Test getting active orders for courier"""
        response = requests.get(f"{BASE_URL}/api/orders/courier/{COURIER_ID}/active")
        
        assert response.status_code == 200
        orders = response.json()
        assert isinstance(orders, list)
        
        # Count orders by status
        assigned_count = len([o for o in orders if o["status"] == "assigned"])
        confirmed_count = len([o for o in orders if o["status"] == "confirmed"])
        on_the_way_count = len([o for o in orders if o["status"] == "on_the_way"])
        
        print(f"✓ Active orders: assigned={assigned_count}, confirmed={confirmed_count}, on_the_way={on_the_way_count}")
        
        # Verify order structure
        if orders:
            order = orders[0]
            assert "id" in order
            assert "status" in order
            assert "customer_name" in order
            assert "delivery_address" in order


if __name__ == "__main__":
    pytest.main([__file__, "-v"])
