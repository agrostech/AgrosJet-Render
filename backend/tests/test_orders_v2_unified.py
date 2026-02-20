"""
Test cases for unified order listing endpoint: GET /api/orders/v2/list
This endpoint replaces 3 separate endpoints for admin, restaurant, and courier panels.
"""
import pytest
import requests
import os

BASE_URL = os.environ.get('REACT_APP_BACKEND_URL', '').rstrip('/')

class TestOrdersV2UnifiedEndpoint:
    """Tests for the new unified /api/orders/v2/list endpoint"""
    
    @pytest.fixture(autouse=True)
    def setup(self):
        """Setup test data IDs"""
        self.session = requests.Session()
        self.session.headers.update({"Content-Type": "application/json"})
        
        # Get a valid company ID and restaurant ID from existing data
        companies_res = self.session.get(f"{BASE_URL}/api/companies")
        if companies_res.status_code == 200 and companies_res.json():
            self.company_id = companies_res.json()[0].get("id")
        else:
            self.company_id = None
        
        # Get a valid restaurant ID
        if self.company_id:
            restaurants_res = self.session.get(f"{BASE_URL}/api/restaurants/{self.company_id}")
            if restaurants_res.status_code == 200 and restaurants_res.json():
                self.restaurant_id = restaurants_res.json()[0].get("id")
            else:
                self.restaurant_id = None
        else:
            self.restaurant_id = None
        
        # Get a courier ID 
        if self.company_id:
            couriers_res = self.session.get(f"{BASE_URL}/api/couriers/companies/{self.company_id}/couriers")
            if couriers_res.status_code == 200 and couriers_res.json():
                self.courier_id = couriers_res.json()[0].get("id")
            else:
                self.courier_id = None
        else:
            self.courier_id = None

    # ==================== PANEL VALIDATION TESTS ====================
    
    def test_invalid_panel_returns_400(self):
        """Test that invalid panel parameter returns 400"""
        response = self.session.get(f"{BASE_URL}/api/orders/v2/list", params={
            "panel": "invalid_panel"
        })
        assert response.status_code == 400
        data = response.json()
        assert "detail" in data
        assert "Geçersiz panel" in data["detail"] or "İzin verilenler" in data["detail"]
        print("✓ Invalid panel returns 400 with error message")

    def test_missing_panel_returns_422(self):
        """Test that missing panel parameter returns validation error"""
        response = self.session.get(f"{BASE_URL}/api/orders/v2/list")
        assert response.status_code == 422  # Pydantic validation error
        print("✓ Missing panel parameter returns 422 validation error")

    # ==================== ADMIN PANEL TESTS ====================
    
    def test_admin_panel_requires_company_id(self):
        """Test that admin panel requires company_id"""
        response = self.session.get(f"{BASE_URL}/api/orders/v2/list", params={
            "panel": "admin"
        })
        assert response.status_code == 400
        data = response.json()
        assert "company_id zorunlu" in data["detail"]
        print("✓ Admin panel returns 400 when company_id is missing")

    def test_admin_panel_with_company_id(self):
        """Test admin panel with valid company_id"""
        if not self.company_id:
            pytest.skip("No company found for testing")
        
        response = self.session.get(f"{BASE_URL}/api/orders/v2/list", params={
            "panel": "admin",
            "company_id": self.company_id
        })
        assert response.status_code == 200
        data = response.json()
        
        # Verify response structure
        assert "success" in data
        assert data["success"] == True
        assert "orders" in data
        assert "total" in data
        assert "limit" in data
        assert "offset" in data
        assert "panel" in data
        assert data["panel"] == "admin"
        assert isinstance(data["orders"], list)
        print(f"✓ Admin panel returns {len(data['orders'])} orders, total: {data['total']}")

    def test_admin_panel_with_status_filter(self):
        """Test admin panel with status filter"""
        if not self.company_id:
            pytest.skip("No company found for testing")
        
        # Test with multiple status filter
        response = self.session.get(f"{BASE_URL}/api/orders/v2/list", params={
            "panel": "admin",
            "company_id": self.company_id,
            "status": "preparing,ready,on_the_way"
        })
        assert response.status_code == 200
        data = response.json()
        
        # If orders exist, verify they have correct status
        for order in data["orders"]:
            assert order.get("status") in ["preparing", "ready", "on_the_way"]
        print(f"✓ Admin panel status filter works - {len(data['orders'])} orders matched")

    def test_admin_panel_active_status(self):
        """Test admin panel with 'active' status filter"""
        if not self.company_id:
            pytest.skip("No company found for testing")
        
        response = self.session.get(f"{BASE_URL}/api/orders/v2/list", params={
            "panel": "admin",
            "company_id": self.company_id,
            "status": "active"
        })
        assert response.status_code == 200
        data = response.json()
        
        # Verify no delivered or cancelled orders
        for order in data["orders"]:
            assert order.get("status") not in ["delivered", "cancelled"]
        print(f"✓ Admin panel 'active' status excludes delivered/cancelled - {len(data['orders'])} orders")

    def test_admin_panel_pagination(self):
        """Test admin panel pagination"""
        if not self.company_id:
            pytest.skip("No company found for testing")
        
        # First request with limit
        response1 = self.session.get(f"{BASE_URL}/api/orders/v2/list", params={
            "panel": "admin",
            "company_id": self.company_id,
            "limit": 5,
            "offset": 0
        })
        assert response1.status_code == 200
        data1 = response1.json()
        assert data1["limit"] == 5
        assert data1["offset"] == 0
        
        # Second request with offset
        if data1["total"] > 5:
            response2 = self.session.get(f"{BASE_URL}/api/orders/v2/list", params={
                "panel": "admin",
                "company_id": self.company_id,
                "limit": 5,
                "offset": 5
            })
            assert response2.status_code == 200
            data2 = response2.json()
            assert data2["offset"] == 5
            
            # Orders should be different
            if len(data1["orders"]) > 0 and len(data2["orders"]) > 0:
                assert data1["orders"][0].get("id") != data2["orders"][0].get("id")
        
        print("✓ Admin panel pagination works correctly")

    # ==================== RESTAURANT PANEL TESTS ====================
    
    def test_restaurant_panel_requires_restaurant_id(self):
        """Test that restaurant panel requires restaurant_id"""
        response = self.session.get(f"{BASE_URL}/api/orders/v2/list", params={
            "panel": "restaurant"
        })
        assert response.status_code == 400
        data = response.json()
        assert "restaurant_id zorunlu" in data["detail"]
        print("✓ Restaurant panel returns 400 when restaurant_id is missing")

    def test_restaurant_panel_with_restaurant_id(self):
        """Test restaurant panel with valid restaurant_id"""
        if not self.restaurant_id:
            pytest.skip("No restaurant found for testing")
        
        response = self.session.get(f"{BASE_URL}/api/orders/v2/list", params={
            "panel": "restaurant",
            "restaurant_id": self.restaurant_id
        })
        assert response.status_code == 200
        data = response.json()
        
        # Verify response structure
        assert data["success"] == True
        assert "orders" in data
        assert data["panel"] == "restaurant"
        
        # Verify all orders belong to this restaurant
        for order in data["orders"]:
            assert order.get("restaurant_id") == self.restaurant_id
        
        print(f"✓ Restaurant panel returns {len(data['orders'])} orders for restaurant")

    def test_restaurant_panel_with_status_filter(self):
        """Test restaurant panel with status filter"""
        if not self.restaurant_id:
            pytest.skip("No restaurant found for testing")
        
        response = self.session.get(f"{BASE_URL}/api/orders/v2/list", params={
            "panel": "restaurant",
            "restaurant_id": self.restaurant_id,
            "status": "delivered"
        })
        assert response.status_code == 200
        data = response.json()
        
        # Verify all orders have delivered status
        for order in data["orders"]:
            assert order.get("status") == "delivered"
        
        print(f"✓ Restaurant panel status filter works - {len(data['orders'])} delivered orders")

    # ==================== COURIER PANEL TESTS ====================
    
    def test_courier_panel_requires_courier_id(self):
        """Test that courier panel requires courier_id"""
        response = self.session.get(f"{BASE_URL}/api/orders/v2/list", params={
            "panel": "courier"
        })
        assert response.status_code == 400
        data = response.json()
        assert "courier_id zorunlu" in data["detail"]
        print("✓ Courier panel returns 400 when courier_id is missing")

    def test_courier_panel_with_courier_id(self):
        """Test courier panel with valid courier_id"""
        if not self.courier_id:
            pytest.skip("No courier found for testing")
        
        response = self.session.get(f"{BASE_URL}/api/orders/v2/list", params={
            "panel": "courier",
            "courier_id": self.courier_id
        })
        assert response.status_code == 200
        data = response.json()
        
        # Verify response structure
        assert data["success"] == True
        assert "orders" in data
        assert data["panel"] == "courier"
        
        # Verify all orders belong to this courier
        for order in data["orders"]:
            assert order.get("courier_id") == self.courier_id
        
        print(f"✓ Courier panel returns {len(data['orders'])} orders for courier")

    def test_courier_panel_default_active_status(self):
        """Test that courier panel defaults to active orders only"""
        if not self.courier_id:
            pytest.skip("No courier found for testing")
        
        # No status param - should default to active
        response = self.session.get(f"{BASE_URL}/api/orders/v2/list", params={
            "panel": "courier",
            "courier_id": self.courier_id
        })
        assert response.status_code == 200
        data = response.json()
        
        # Verify no delivered/cancelled orders
        for order in data["orders"]:
            assert order.get("status") not in ["delivered", "cancelled"]
        
        print(f"✓ Courier panel defaults to active orders - {len(data['orders'])} active orders")

    # ==================== CROSS-PANEL FILTER TESTS ====================
    
    def test_admin_panel_with_restaurant_filter(self):
        """Test admin panel can filter by restaurant"""
        if not self.company_id or not self.restaurant_id:
            pytest.skip("No company or restaurant found for testing")
        
        response = self.session.get(f"{BASE_URL}/api/orders/v2/list", params={
            "panel": "admin",
            "company_id": self.company_id,
            "restaurant_id": self.restaurant_id
        })
        assert response.status_code == 200
        data = response.json()
        
        # Verify all orders are for the specified restaurant
        for order in data["orders"]:
            assert order.get("restaurant_id") == self.restaurant_id
        
        print(f"✓ Admin panel restaurant filter works - {len(data['orders'])} orders")

    def test_admin_panel_with_courier_filter(self):
        """Test admin panel can filter by courier"""
        if not self.company_id or not self.courier_id:
            pytest.skip("No company or courier found for testing")
        
        response = self.session.get(f"{BASE_URL}/api/orders/v2/list", params={
            "panel": "admin",
            "company_id": self.company_id,
            "courier_id": self.courier_id
        })
        assert response.status_code == 200
        data = response.json()
        
        # Verify all orders are assigned to the courier
        for order in data["orders"]:
            assert order.get("courier_id") == self.courier_id
        
        print(f"✓ Admin panel courier filter works - {len(data['orders'])} orders")

    def test_source_filter(self):
        """Test source (platform) filter"""
        if not self.company_id:
            pytest.skip("No company found for testing")
        
        # Test with single source
        response = self.session.get(f"{BASE_URL}/api/orders/v2/list", params={
            "panel": "admin",
            "company_id": self.company_id,
            "source": "getir"
        })
        assert response.status_code == 200
        data = response.json()
        
        for order in data["orders"]:
            assert order.get("source") == "getir"
        
        print(f"✓ Source filter (getir) works - {len(data['orders'])} orders")

    def test_multiple_source_filter(self):
        """Test multiple source (platform) filter"""
        if not self.company_id:
            pytest.skip("No company found for testing")
        
        response = self.session.get(f"{BASE_URL}/api/orders/v2/list", params={
            "panel": "admin",
            "company_id": self.company_id,
            "source": "getir,trendyol"
        })
        assert response.status_code == 200
        data = response.json()
        
        for order in data["orders"]:
            assert order.get("source") in ["getir", "trendyol"]
        
        print(f"✓ Multiple source filter works - {len(data['orders'])} orders")


class TestFrontendIntegrationEndpoint:
    """Tests to verify frontend integration with the new endpoint"""
    
    @pytest.fixture(autouse=True)
    def setup(self):
        """Setup test session and get test data"""
        self.session = requests.Session()
        self.session.headers.update({"Content-Type": "application/json"})

    def test_restaurant_login_and_fetch_orders(self):
        """Test restaurant login and fetching orders via new endpoint"""
        # Login as restaurant user
        login_res = self.session.post(f"{BASE_URL}/api/auth/login", json={
            "username": "bostonddisparta",
            "password": "123456"
        })
        
        if login_res.status_code != 200:
            pytest.skip(f"Restaurant login failed: {login_res.text}")
        
        user_data = login_res.json()
        assert user_data.get("role") == "restaurant"
        restaurant_id = user_data.get("restaurant_id")
        assert restaurant_id is not None
        
        # Fetch orders using new endpoint
        orders_res = self.session.get(f"{BASE_URL}/api/orders/v2/list", params={
            "panel": "restaurant",
            "restaurant_id": restaurant_id,
            "limit": 200
        })
        assert orders_res.status_code == 200
        data = orders_res.json()
        
        assert data["success"] == True
        assert data["panel"] == "restaurant"
        assert "orders" in data
        assert "total" in data
        
        print(f"✓ Restaurant login + fetch orders works - {len(data['orders'])} orders, total: {data['total']}")

    def test_admin_login_and_fetch_orders(self):
        """Test admin login and fetching orders via new endpoint"""
        # Login as admin user
        login_res = self.session.post(f"{BASE_URL}/api/auth/login", json={
            "username": "onurertas",
            "password": "125594"
        })
        
        if login_res.status_code != 200:
            pytest.skip(f"Admin login failed: {login_res.text}")
        
        user_data = login_res.json()
        company_id = user_data.get("company_id")
        
        if not company_id:
            pytest.skip("No company_id in admin user data")
        
        # Fetch orders using new endpoint with status filter
        status_filter = "preparing,ready,assigned,confirmed,on_the_way"
        orders_res = self.session.get(f"{BASE_URL}/api/orders/v2/list", params={
            "panel": "admin",
            "company_id": company_id,
            "status": status_filter,
            "limit": 500
        })
        assert orders_res.status_code == 200
        data = orders_res.json()
        
        assert data["success"] == True
        assert data["panel"] == "admin"
        
        print(f"✓ Admin login + fetch orders works - {len(data['orders'])} orders, total: {data['total']}")

    def test_courier_fetch_orders(self):
        """Test courier fetching orders via new endpoint"""
        # Get a courier
        companies_res = self.session.get(f"{BASE_URL}/api/companies")
        if companies_res.status_code != 200 or not companies_res.json():
            pytest.skip("No companies found")
        
        company_id = companies_res.json()[0].get("id")
        couriers_res = self.session.get(f"{BASE_URL}/api/couriers/companies/{company_id}/couriers")
        
        if couriers_res.status_code != 200 or not couriers_res.json():
            pytest.skip("No couriers found")
        
        courier_id = couriers_res.json()[0].get("id")
        
        # Fetch orders using new endpoint
        orders_res = self.session.get(f"{BASE_URL}/api/orders/v2/list", params={
            "panel": "courier",
            "courier_id": courier_id,
            "status": "active",
            "limit": 50
        })
        assert orders_res.status_code == 200
        data = orders_res.json()
        
        assert data["success"] == True
        assert data["panel"] == "courier"
        
        print(f"✓ Courier fetch orders works - {len(data['orders'])} orders, total: {data['total']}")


class TestBackwardCompatibility:
    """Tests to verify old endpoints still work (backward compatibility)"""
    
    @pytest.fixture(autouse=True)
    def setup(self):
        """Setup test session and get test data"""
        self.session = requests.Session()
        self.session.headers.update({"Content-Type": "application/json"})
        
        # Get company ID
        companies_res = self.session.get(f"{BASE_URL}/api/companies")
        if companies_res.status_code == 200 and companies_res.json():
            self.company_id = companies_res.json()[0].get("id")
        else:
            self.company_id = None
        
        # Get restaurant ID
        if self.company_id:
            restaurants_res = self.session.get(f"{BASE_URL}/api/restaurants/{self.company_id}")
            if restaurants_res.status_code == 200 and restaurants_res.json():
                self.restaurant_id = restaurants_res.json()[0].get("id")
            else:
                self.restaurant_id = None
        else:
            self.restaurant_id = None

    def test_old_company_orders_endpoint(self):
        """Test old /api/orders/{company_id} endpoint still works"""
        if not self.company_id:
            pytest.skip("No company found")
        
        response = self.session.get(f"{BASE_URL}/api/orders/{self.company_id}")
        assert response.status_code == 200
        data = response.json()
        assert isinstance(data, list)
        print(f"✓ Old company orders endpoint works - {len(data)} orders")

    def test_old_restaurant_orders_endpoint(self):
        """Test old /api/orders/restaurant/{restaurant_id} endpoint still works"""
        if not self.restaurant_id:
            pytest.skip("No restaurant found")
        
        response = self.session.get(f"{BASE_URL}/api/orders/restaurant/{self.restaurant_id}")
        assert response.status_code == 200
        data = response.json()
        assert isinstance(data, list)
        print(f"✓ Old restaurant orders endpoint works - {len(data)} orders")


if __name__ == "__main__":
    pytest.main([__file__, "-v", "--tb=short"])
