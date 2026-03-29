"""
Test JWT Bypass for Location Endpoint and Combined Poll Endpoint
================================================================
Tests for iteration 41:
1. PUT /api/couriers/{courier_id}/location - JWT'siz çalışmalı (konum + batarya)
2. GET /api/couriers/{courier_id}/poll - JWT ile çalışmalı (birleşik endpoint)
3. GET /api/couriers/{courier_id}/poll - JWT olmadan 401 döndürmeli
4. Mevcut JWT korumalı endpoint'ler hala 401 döndürmeli
5. Courier Login akışı çalışmalı
"""
import pytest
import requests
import os
import uuid

BASE_URL = os.environ.get('REACT_APP_BACKEND_URL', '').rstrip('/')

# Test credentials
COURIER_PHONE = "05550003201"
COURIER_PASSWORD = "123456"
COMPANY_ADMIN_USERNAME = "admin"
COMPANY_ADMIN_PASSWORD = "123456"


class TestCourierLogin:
    """Courier login flow tests"""
    
    def test_courier_login_success(self):
        """Courier login should return token and courier data"""
        response = requests.post(f"{BASE_URL}/api/auth/courier/login", json={
            "phone": COURIER_PHONE,
            "password": COURIER_PASSWORD
        })
        
        assert response.status_code == 200, f"Login failed: {response.text}"
        data = response.json()
        
        # Token should be present
        assert "token" in data, "Token not in response"
        assert len(data["token"]) > 0, "Token is empty"
        
        # Courier ID should be at root level (not nested)
        assert "id" in data, "Courier ID not in response root level"
        assert data["id"], "Courier ID is empty"
        
        print(f"✓ Courier login successful, ID: {data['id']}")
        return data
    
    def test_courier_login_invalid_credentials(self):
        """Invalid credentials should return 401"""
        response = requests.post(f"{BASE_URL}/api/auth/courier/login", json={
            "phone": "05550000000",
            "password": "wrongpassword"
        })
        
        assert response.status_code == 401, f"Expected 401, got {response.status_code}"
        print("✓ Invalid credentials correctly return 401")


class TestLocationEndpointNoJWT:
    """Location endpoint should work WITHOUT JWT (moved to courier_native.py)"""
    
    @pytest.fixture
    def courier_id(self):
        """Get courier ID from login"""
        response = requests.post(f"{BASE_URL}/api/auth/courier/login", json={
            "phone": COURIER_PHONE,
            "password": COURIER_PASSWORD
        })
        if response.status_code == 200:
            return response.json().get("id")
        pytest.skip("Could not get courier ID")
    
    def test_location_update_without_jwt(self, courier_id):
        """PUT /api/couriers/{id}/location should work WITHOUT JWT"""
        response = requests.put(
            f"{BASE_URL}/api/couriers/{courier_id}/location",
            json={
                "latitude": 41.0082,
                "longitude": 28.9784,
                "accuracy": 10.5,
                "speed": 5.2
            },
            headers={"Content-Type": "application/json"}
            # NO Authorization header
        )
        
        # Should return 200 (success) or 404 (courier not found), NOT 401
        assert response.status_code in [200, 404], f"Expected 200/404, got {response.status_code}: {response.text}"
        
        if response.status_code == 200:
            data = response.json()
            assert "message" in data, "Response should have message"
            print(f"✓ Location update without JWT: {data['message']}")
        else:
            print(f"✓ Location endpoint accessible without JWT (404 = courier not found)")
    
    def test_location_update_with_battery_without_jwt(self, courier_id):
        """PUT /api/couriers/{id}/location with battery data should work WITHOUT JWT"""
        response = requests.put(
            f"{BASE_URL}/api/couriers/{courier_id}/location",
            json={
                "latitude": 41.0082,
                "longitude": 28.9784,
                "batteryLevel": 0.85,
                "batteryState": "unplugged"
            },
            headers={"Content-Type": "application/json"}
            # NO Authorization header
        )
        
        assert response.status_code in [200, 404], f"Expected 200/404, got {response.status_code}: {response.text}"
        print(f"✓ Location + battery update without JWT: status {response.status_code}")
    
    def test_location_update_nonexistent_courier(self):
        """Location update for non-existent courier should return 404, not 401"""
        fake_id = str(uuid.uuid4())
        response = requests.put(
            f"{BASE_URL}/api/couriers/{fake_id}/location",
            json={
                "latitude": 41.0082,
                "longitude": 28.9784
            },
            headers={"Content-Type": "application/json"}
        )
        
        # Should return 404 (not found), NOT 401 (unauthorized)
        assert response.status_code == 404, f"Expected 404, got {response.status_code}: {response.text}"
        print("✓ Non-existent courier returns 404 (not 401)")


class TestPollEndpointWithJWT:
    """Poll endpoint should require JWT and return combined data"""
    
    @pytest.fixture
    def auth_data(self):
        """Get courier auth data from login"""
        response = requests.post(f"{BASE_URL}/api/auth/courier/login", json={
            "phone": COURIER_PHONE,
            "password": COURIER_PASSWORD
        })
        if response.status_code == 200:
            return response.json()
        pytest.skip("Could not login")
    
    def test_poll_without_jwt_returns_401(self):
        """GET /api/couriers/{id}/poll without JWT should return 401"""
        # First get a valid courier ID
        login_resp = requests.post(f"{BASE_URL}/api/auth/courier/login", json={
            "phone": COURIER_PHONE,
            "password": COURIER_PASSWORD
        })
        courier_id = login_resp.json().get("id") if login_resp.status_code == 200 else "test-id"
        
        response = requests.get(
            f"{BASE_URL}/api/couriers/{courier_id}/poll",
            headers={"Content-Type": "application/json"}
            # NO Authorization header
        )
        
        assert response.status_code == 401, f"Expected 401 without JWT, got {response.status_code}: {response.text}"
        print("✓ Poll endpoint without JWT returns 401")
    
    def test_poll_with_jwt_returns_combined_data(self, auth_data):
        """GET /api/couriers/{id}/poll with JWT should return combined data"""
        courier_id = auth_data["id"]
        token = auth_data["token"]
        company_id = auth_data.get("company_id", "")
        
        params = {}
        if company_id:
            params["company_id"] = company_id
        
        response = requests.get(
            f"{BASE_URL}/api/couriers/{courier_id}/poll",
            params=params,
            headers={
                "Content-Type": "application/json",
                "Authorization": f"Bearer {token}"
            }
        )
        
        assert response.status_code == 200, f"Expected 200, got {response.status_code}: {response.text}"
        
        data = response.json()
        
        # Check required fields in response
        assert "availability_status" in data, "availability_status missing"
        assert "break_status" in data, "break_status missing"
        assert "should_logout" in data, "should_logout missing"
        
        # Check break_status structure
        break_status = data["break_status"]
        assert "daily_break_limit" in break_status, "daily_break_limit missing in break_status"
        assert "used_break_time" in break_status, "used_break_time missing in break_status"
        assert "remaining_break_time" in break_status, "remaining_break_time missing in break_status"
        assert "is_on_break" in break_status, "is_on_break missing in break_status"
        
        print(f"✓ Poll endpoint returns combined data:")
        print(f"  - availability_status: {data['availability_status']}")
        print(f"  - break_status: {break_status}")
        print(f"  - should_logout: {data['should_logout']}")
    
    def test_poll_with_session_id(self, auth_data):
        """GET /api/couriers/{id}/poll with session_id should check for multi-device login"""
        courier_id = auth_data["id"]
        token = auth_data["token"]
        
        response = requests.get(
            f"{BASE_URL}/api/couriers/{courier_id}/poll",
            params={"session_id": "test-session-123"},
            headers={
                "Content-Type": "application/json",
                "Authorization": f"Bearer {token}"
            }
        )
        
        assert response.status_code == 200, f"Expected 200, got {response.status_code}: {response.text}"
        
        data = response.json()
        # resend_token field should be present
        assert "resend_token" in data, "resend_token field missing"
        print(f"✓ Poll with session_id works, resend_token: {data.get('resend_token')}")


class TestExistingJWTProtectedEndpoints:
    """Existing JWT-protected endpoints should still require JWT"""
    
    @pytest.fixture
    def courier_id(self):
        """Get courier ID from login"""
        response = requests.post(f"{BASE_URL}/api/auth/courier/login", json={
            "phone": COURIER_PHONE,
            "password": COURIER_PASSWORD
        })
        if response.status_code == 200:
            return response.json().get("id")
        pytest.skip("Could not get courier ID")
    
    def test_get_courier_without_jwt_returns_401(self, courier_id):
        """GET /api/couriers/{id} without JWT should return 401"""
        response = requests.get(
            f"{BASE_URL}/api/couriers/{courier_id}",
            headers={"Content-Type": "application/json"}
        )
        
        assert response.status_code == 401, f"Expected 401, got {response.status_code}"
        print("✓ GET /api/couriers/{id} without JWT returns 401")
    
    def test_get_break_status_without_jwt_returns_401(self, courier_id):
        """GET /api/couriers/{id}/break-status without JWT should return 401"""
        response = requests.get(
            f"{BASE_URL}/api/couriers/{courier_id}/break-status",
            headers={"Content-Type": "application/json"}
        )
        
        assert response.status_code == 401, f"Expected 401, got {response.status_code}"
        print("✓ GET /api/couriers/{id}/break-status without JWT returns 401")
    
    def test_put_availability_without_jwt_returns_401(self, courier_id):
        """PUT /api/couriers/{id}/availability without JWT should return 401"""
        response = requests.put(
            f"{BASE_URL}/api/couriers/{courier_id}/availability",
            json={"availability_status": "active"},
            headers={"Content-Type": "application/json"}
        )
        
        assert response.status_code == 401, f"Expected 401, got {response.status_code}"
        print("✓ PUT /api/couriers/{id}/availability without JWT returns 401")


class TestDataPersistence:
    """Test that location and battery data is actually persisted to DB"""
    
    @pytest.fixture
    def auth_data(self):
        """Get courier auth data from login"""
        response = requests.post(f"{BASE_URL}/api/auth/courier/login", json={
            "phone": COURIER_PHONE,
            "password": COURIER_PASSWORD
        })
        if response.status_code == 200:
            return response.json()
        pytest.skip("Could not login")
    
    def test_location_persisted_to_db(self, auth_data):
        """Location update should persist to database"""
        courier_id = auth_data["id"]
        token = auth_data["token"]
        
        # Update location (no JWT needed)
        test_lat = 41.0082 + (uuid.uuid4().int % 1000) / 100000  # Slightly random
        test_lng = 28.9784 + (uuid.uuid4().int % 1000) / 100000
        
        update_resp = requests.put(
            f"{BASE_URL}/api/couriers/{courier_id}/location",
            json={
                "latitude": test_lat,
                "longitude": test_lng,
                "batteryLevel": 0.75,
                "batteryState": "charging"
            }
        )
        
        assert update_resp.status_code == 200, f"Location update failed: {update_resp.text}"
        
        # Verify by fetching courier data (needs JWT)
        get_resp = requests.get(
            f"{BASE_URL}/api/couriers/{courier_id}",
            headers={"Authorization": f"Bearer {token}"}
        )
        
        assert get_resp.status_code == 200, f"Get courier failed: {get_resp.text}"
        
        courier_data = get_resp.json()
        
        # Check location was saved
        if "current_location" in courier_data:
            loc = courier_data["current_location"]
            assert abs(loc.get("latitude", 0) - test_lat) < 0.001, "Latitude not persisted correctly"
            assert abs(loc.get("longitude", 0) - test_lng) < 0.001, "Longitude not persisted correctly"
            print(f"✓ Location persisted: {loc}")
        
        # Check battery was saved
        if "battery" in courier_data:
            battery = courier_data["battery"]
            assert battery.get("level") == 0.75, "Battery level not persisted"
            assert battery.get("state") == "charging", "Battery state not persisted"
            print(f"✓ Battery persisted: {battery}")


if __name__ == "__main__":
    pytest.main([__file__, "-v", "--tb=short"])
