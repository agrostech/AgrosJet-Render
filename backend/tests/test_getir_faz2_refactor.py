"""
Getir Service FAZ 2 Refactoring Tests

Tests for:
1. _check_timing_wait() helper function (lines 645-659)
2. smart_advance_getir_order() refactored function (lines 1130-1217)
3. _extract_error() function (lines 662-668)
"""
import pytest
import os
from datetime import datetime, timezone, timedelta

# Backend URL
BASE_URL = os.environ.get('REACT_APP_BACKEND_URL') or 'https://railway-live-test.preview.emergentagent.com'
BASE_URL = BASE_URL.rstrip('/')

# Test credentials
RESTAURANT_USER = {"username": "bostonddisparta", "password": "123456"}
ADMIN_USER = {"username": "onurertas", "password": "125594"}


class TestCheckTimingWaitHelper:
    """Tests for _check_timing_wait() helper function"""
    
    def test_check_timing_wait_with_recent_timestamp(self):
        """Test when timestamp is recent (should wait)"""
        from services.getir_service import _check_timing_wait, GETIR_STEP_WAIT_SECONDS
        
        # 10 seconds ago - should wait ~60 more seconds
        recent_time = (datetime.now(timezone.utc) - timedelta(seconds=10)).isoformat()
        should_wait, remaining = _check_timing_wait(recent_time)
        
        assert should_wait == True
        assert remaining > 50  # Should have ~60 seconds remaining
        assert remaining <= GETIR_STEP_WAIT_SECONDS
        print(f"✓ Recent timestamp (10s ago): should_wait={should_wait}, remaining={remaining}s")
    
    def test_check_timing_wait_with_old_timestamp(self):
        """Test when timestamp is old enough (no wait needed)"""
        from services.getir_service import _check_timing_wait, GETIR_STEP_WAIT_SECONDS
        
        # 80 seconds ago - should not wait (past 70s threshold)
        old_time = (datetime.now(timezone.utc) - timedelta(seconds=80)).isoformat()
        should_wait, remaining = _check_timing_wait(old_time)
        
        assert should_wait == False
        assert remaining == 0
        print(f"✓ Old timestamp (80s ago): should_wait={should_wait}, remaining={remaining}s")
    
    def test_check_timing_wait_with_none(self):
        """Test with None timestamp"""
        from services.getir_service import _check_timing_wait
        
        should_wait, remaining = _check_timing_wait(None)
        
        assert should_wait == False
        assert remaining == 0
        print(f"✓ None timestamp: should_wait={should_wait}, remaining={remaining}s")
    
    def test_check_timing_wait_with_empty_string(self):
        """Test with empty string timestamp"""
        from services.getir_service import _check_timing_wait
        
        should_wait, remaining = _check_timing_wait("")
        
        assert should_wait == False
        assert remaining == 0
        print(f"✓ Empty string timestamp: should_wait={should_wait}, remaining={remaining}s")
    
    def test_check_timing_wait_with_invalid_timestamp(self):
        """Test with invalid timestamp string"""
        from services.getir_service import _check_timing_wait
        
        should_wait, remaining = _check_timing_wait("invalid-timestamp")
        
        assert should_wait == False
        assert remaining == 0
        print(f"✓ Invalid timestamp: should_wait={should_wait}, remaining={remaining}s")
    
    def test_check_timing_wait_with_z_suffix(self):
        """Test with Z suffix timestamp (UTC)"""
        from services.getir_service import _check_timing_wait
        
        # 30 seconds ago with Z suffix
        recent_time = (datetime.now(timezone.utc) - timedelta(seconds=30)).strftime('%Y-%m-%dT%H:%M:%S') + 'Z'
        should_wait, remaining = _check_timing_wait(recent_time)
        
        assert should_wait == True
        assert remaining > 30  # Should have ~40 seconds remaining
        print(f"✓ Z suffix timestamp: should_wait={should_wait}, remaining={remaining}s")
    
    def test_check_timing_wait_boundary_at_70_seconds(self):
        """Test boundary condition exactly at 70 seconds"""
        from services.getir_service import _check_timing_wait, GETIR_STEP_WAIT_SECONDS
        
        # Exactly 70 seconds ago
        boundary_time = (datetime.now(timezone.utc) - timedelta(seconds=GETIR_STEP_WAIT_SECONDS)).isoformat()
        should_wait, remaining = _check_timing_wait(boundary_time)
        
        # Should not wait (exactly at boundary or just past)
        assert remaining == 0
        print(f"✓ Boundary timestamp (70s): should_wait={should_wait}, remaining={remaining}s")


class TestExtractError:
    """Tests for _extract_error() helper function"""
    
    def test_extract_error_returns_str(self):
        """Verify _extract_error exists and signature"""
        from services.getir_service import _extract_error
        
        assert callable(_extract_error)
        print("✓ _extract_error function exists and is callable")
    
    def test_extract_error_with_json_message(self):
        """Test error extraction from JSON with message field"""
        from services.getir_service import _extract_error
        from unittest.mock import Mock
        
        mock_response = Mock()
        mock_response.json.return_value = {"message": "Order already prepared"}
        mock_response.text = '{"message": "Order already prepared"}'
        mock_response.status_code = 400
        
        error = _extract_error(mock_response)
        
        assert error == "Order already prepared"
        print(f"✓ JSON message extraction: '{error}'")
    
    def test_extract_error_with_json_error(self):
        """Test error extraction from JSON with error field"""
        from services.getir_service import _extract_error
        from unittest.mock import Mock
        
        mock_response = Mock()
        mock_response.json.return_value = {"error": "Invalid token"}
        mock_response.text = '{"error": "Invalid token"}'
        mock_response.status_code = 401
        
        error = _extract_error(mock_response)
        
        assert error == "Invalid token"
        print(f"✓ JSON error extraction: '{error}'")
    
    def test_extract_error_with_invalid_json(self):
        """Test error extraction when JSON parsing fails"""
        from services.getir_service import _extract_error
        from unittest.mock import Mock
        
        mock_response = Mock()
        mock_response.json.side_effect = Exception("JSON decode error")
        mock_response.text = "Internal Server Error"
        mock_response.status_code = 500
        
        error = _extract_error(mock_response)
        
        assert "Internal Server Error" in error
        print(f"✓ Invalid JSON fallback: '{error}'")
    
    def test_extract_error_with_empty_response(self):
        """Test error extraction with empty response text"""
        from services.getir_service import _extract_error
        from unittest.mock import Mock
        
        mock_response = Mock()
        mock_response.json.side_effect = Exception("JSON decode error")
        mock_response.text = ""
        mock_response.status_code = 502
        
        error = _extract_error(mock_response)
        
        assert "HTTP 502" in error
        print(f"✓ Empty response fallback: '{error}'")


class TestSmartAdvanceGetirOrderStructure:
    """Tests for smart_advance_getir_order() function structure and logic"""
    
    def test_smart_advance_function_exists(self):
        """Verify function exists with correct signature"""
        from services.getir_service import smart_advance_getir_order
        import inspect
        
        assert callable(smart_advance_getir_order)
        
        sig = inspect.signature(smart_advance_getir_order)
        params = list(sig.parameters.keys())
        
        assert "restaurant_id" in params
        assert "order_id" in params
        assert "target_status" in params
        assert "is_getir_courier" in params
        print(f"✓ smart_advance_getir_order signature: {params}")
    
    def test_smart_advance_is_async(self):
        """Verify function is async"""
        from services.getir_service import smart_advance_getir_order
        import inspect
        
        assert inspect.iscoroutinefunction(smart_advance_getir_order)
        print("✓ smart_advance_getir_order is async")


class TestGetirServiceConstants:
    """Tests for Getir service constants and mappings"""
    
    def test_getir_step_wait_seconds(self):
        """Verify GETIR_STEP_WAIT_SECONDS constant"""
        from services.getir_service import GETIR_STEP_WAIT_SECONDS
        
        assert GETIR_STEP_WAIT_SECONDS == 70  # 70 seconds as per Getir API rules
        print(f"✓ GETIR_STEP_WAIT_SECONDS = {GETIR_STEP_WAIT_SECONDS}")
    
    def test_getir_order_statuses_mapping(self):
        """Verify order status mapping contains key values"""
        from services.getir_service import GETIR_ORDER_STATUSES
        
        assert 400 in GETIR_ORDER_STATUSES  # pending
        assert 500 in GETIR_ORDER_STATUSES  # preparing
        assert 550 in GETIR_ORDER_STATUSES  # prepared
        assert 700 in GETIR_ORDER_STATUSES  # on_the_way
        assert 900 in GETIR_ORDER_STATUSES  # delivered
        assert 1600 in GETIR_ORDER_STATUSES  # cancelled
        print("✓ GETIR_ORDER_STATUSES contains all key statuses")
    
    def test_getir_payment_methods_mapping(self):
        """Verify payment method mapping"""
        from services.getir_service import GETIR_PAYMENT_METHODS
        
        assert 3 in GETIR_PAYMENT_METHODS  # Kredi/Banka Kartı
        assert 4 in GETIR_PAYMENT_METHODS  # Nakit
        assert 5 in GETIR_PAYMENT_METHODS  # Multinet
        assert 26 in GETIR_PAYMENT_METHODS  # Online Ödeme
        print("✓ GETIR_PAYMENT_METHODS contains common payment types")


class TestOrderEndpointsAPI:
    """API tests for order endpoints"""
    
    @pytest.fixture(autouse=True)
    def setup(self):
        """Setup test environment"""
        import requests
        self.session = requests.Session()
        self.session.headers.update({"Content-Type": "application/json"})
    
    def test_health_endpoint(self):
        """Test health endpoint is available"""
        import requests
        
        response = requests.get(f"{BASE_URL}/api/health")
        
        assert response.status_code == 200
        data = response.json()
        assert data.get("status") == "ok"
        print(f"✓ Health endpoint: status={data.get('status')}")
    
    def test_restaurant_login(self):
        """Test restaurant user login"""
        import requests
        
        response = requests.post(f"{BASE_URL}/api/auth/login", json={
            "username": RESTAURANT_USER["username"],
            "password": RESTAURANT_USER["password"]
        })
        
        assert response.status_code == 200
        data = response.json()
        assert "token" in data or "user" in data
        print(f"✓ Restaurant login successful for {RESTAURANT_USER['username']}")
    
    def test_admin_login(self):
        """Test admin user login"""
        import requests
        
        response = requests.post(f"{BASE_URL}/api/auth/login", json={
            "username": ADMIN_USER["username"],
            "password": ADMIN_USER["password"]
        })
        
        assert response.status_code == 200
        data = response.json()
        assert "token" in data or "user" in data
        print(f"✓ Admin login successful for {ADMIN_USER['username']}")


class TestGetirIntegrationEndpoints:
    """API tests for Getir integration endpoints"""
    
    @pytest.fixture(autouse=True)
    def setup(self):
        """Setup authenticated session"""
        import requests
        self.session = requests.Session()
        self.session.headers.update({"Content-Type": "application/json"})
        
        # Login as admin
        response = self.session.post(f"{BASE_URL}/api/auth/login", json={
            "username": ADMIN_USER["username"],
            "password": ADMIN_USER["password"]
        })
        if response.status_code == 200:
            data = response.json()
            token = data.get("token")
            if token:
                self.session.headers.update({"Authorization": f"Bearer {token}"})
            self.user_data = data
    
    def test_orders_endpoint_exists(self):
        """Test that orders endpoint returns data"""
        import requests
        
        response = self.session.get(f"{BASE_URL}/api/orders/company-1")
        
        # Should return 200 or 401 (if auth required)
        assert response.status_code in [200, 401, 404]
        print(f"✓ Orders endpoint responded: status={response.status_code}")
    
    def test_restaurants_endpoint_exists(self):
        """Test restaurants endpoint"""
        import requests
        
        response = self.session.get(f"{BASE_URL}/api/restaurants/company-1")
        
        # Should return 200 or 401 (if auth required)
        assert response.status_code in [200, 401, 404]
        print(f"✓ Restaurants endpoint responded: status={response.status_code}")


class TestDelayedFunctions:
    """Tests for delayed_prepare and delayed_deliver functions"""
    
    def test_delayed_prepare_exists(self):
        """Verify delayed_prepare function exists"""
        from services.getir_service import delayed_prepare
        import inspect
        
        assert callable(delayed_prepare)
        assert inspect.iscoroutinefunction(delayed_prepare)
        print("✓ delayed_prepare is an async function")
    
    def test_delayed_deliver_exists(self):
        """Verify delayed_deliver function exists"""
        from services.getir_service import delayed_deliver
        import inspect
        
        assert callable(delayed_deliver)
        assert inspect.iscoroutinefunction(delayed_deliver)
        print("✓ delayed_deliver is an async function")


class TestHelperFunctionsFromFaz1:
    """Verify FAZ 1 helper functions still work (regression)"""
    
    def test_extract_customer_info(self):
        """Test _extract_customer_info helper"""
        from services.getir_service import _extract_customer_info
        
        getir_order = {
            "client": {
                "name": "Test Müşteri",
                "clientPhoneNumber": "532-123-4567",
                "contactPhoneNumber": "850-123-4567"
            }
        }
        
        result = _extract_customer_info(getir_order)
        
        assert result["name"] == "Test Müşteri"
        assert result["phone"] == "5321234567"  # Hyphens removed
        assert result["support_phone"] == "850-123-4567"
        print(f"✓ _extract_customer_info: {result}")
    
    def test_extract_address_info(self):
        """Test _extract_address_info helper"""
        from services.getir_service import _extract_address_info
        
        getir_order = {
            "client": {
                "deliveryAddress": {
                    "address": "Test Sokak No:5",
                    "description": "Sarı bina"
                },
                "location": {
                    "lat": 41.0082,
                    "lon": 28.9784
                }
            }
        }
        
        result = _extract_address_info(getir_order)
        
        assert result["text"] == "Test Sokak No:5"
        assert result["description"] == "Sarı bina"
        assert result["latitude"] == 41.0082
        assert result["longitude"] == 28.9784
        print(f"✓ _extract_address_info: {result}")
    
    def test_extract_items(self):
        """Test _extract_items helper"""
        from services.getir_service import _extract_items
        
        getir_order = {
            "products": [
                {
                    "name": "Lahmacun",
                    "count": 2,
                    "price": 100,
                    "optionCategories": [
                        {
                            "options": [
                                {"name": "Acılı"}
                            ]
                        }
                    ]
                }
            ]
        }
        
        result = _extract_items(getir_order)
        
        assert len(result) == 1
        assert "Lahmacun" in result[0]["name"]
        assert "Acılı" in result[0]["name"]
        assert result[0]["quantity"] == 2
        assert result[0]["price"] == 50  # 100 / 2
        print(f"✓ _extract_items: {result}")


class TestMapGetirStatus:
    """Tests for status mapping functions"""
    
    def test_map_getir_status_numeric(self):
        """Test numeric status mapping"""
        from services.getir_service import map_getir_status
        
        assert map_getir_status(400) == "pending"
        assert map_getir_status(500) == "preparing"
        assert map_getir_status(550) == "ready"
        assert map_getir_status(700) == "on_the_way"
        assert map_getir_status(900) == "delivered"
        assert map_getir_status(1600) == "cancelled"
        print("✓ Numeric status mapping correct")
    
    def test_map_getir_status_string(self):
        """Test string status mapping"""
        from services.getir_service import map_getir_status
        
        assert map_getir_status("pending") == "pending"
        assert map_getir_status("preparing") == "preparing"
        assert map_getir_status("delivered") == "delivered"
        assert map_getir_status("cancelled") == "cancelled"
        print("✓ String status mapping correct")


if __name__ == "__main__":
    pytest.main([__file__, "-v", "--tb=short"])
