"""
Test entity-balances bulk endpoint - N+1 query fix verification
Tests the new GET /api/companies/{company_id}/entity-balances endpoint
"""
import pytest
import requests
import os

BASE_URL = os.environ.get('REACT_APP_BACKEND_URL', '').rstrip('/')

# Test company ID from the problem statement
TEST_COMPANY_ID = "c0f66af5-12b5-4ce5-9aea-a06d5b52df74"


class TestEntityBalancesEndpoint:
    """Test the new entity-balances bulk endpoint"""
    
    @pytest.fixture(autouse=True)
    def setup(self):
        """Setup - get auth token"""
        self.session = requests.Session()
        self.session.headers.update({"Content-Type": "application/json"})
        
        # Login as admin
        login_response = self.session.post(
            f"{BASE_URL}/api/auth/admin/login",
            json={"username": "admin", "password": "123456"}
        )
        if login_response.status_code == 200:
            data = login_response.json()
            token = data.get("token") or data.get("access_token")
            if token:
                self.session.headers.update({"Authorization": f"Bearer {token}"})
                self.token = token
            else:
                pytest.skip("No token in login response")
        else:
            pytest.skip(f"Login failed: {login_response.status_code}")
    
    # --- Courier entity-balances tests ---
    def test_courier_entity_balances_endpoint(self):
        """Test GET /api/companies/{company_id}/entity-balances?type=courier"""
        response = self.session.get(
            f"{BASE_URL}/api/companies/{TEST_COMPANY_ID}/entity-balances?type=courier"
        )
        
        assert response.status_code == 200, f"Expected 200, got {response.status_code}: {response.text}"
        
        data = response.json()
        assert "balances" in data, "Response should contain 'balances' key"
        assert isinstance(data["balances"], dict), "balances should be a dictionary"
        
        print(f"Courier balances count: {len(data['balances'])}")
        print(f"Sample balances: {dict(list(data['balances'].items())[:3])}")
    
    def test_courier_archived_entity_balances_endpoint(self):
        """Test GET /api/companies/{company_id}/entity-balances?type=courier_archived"""
        response = self.session.get(
            f"{BASE_URL}/api/companies/{TEST_COMPANY_ID}/entity-balances?type=courier_archived"
        )
        
        assert response.status_code == 200, f"Expected 200, got {response.status_code}: {response.text}"
        
        data = response.json()
        assert "balances" in data, "Response should contain 'balances' key"
        assert isinstance(data["balances"], dict), "balances should be a dictionary"
        
        print(f"Archived courier balances count: {len(data['balances'])}")
    
    # --- Restaurant entity-balances tests ---
    def test_restaurant_entity_balances_endpoint(self):
        """Test GET /api/companies/{company_id}/entity-balances?type=restaurant"""
        response = self.session.get(
            f"{BASE_URL}/api/companies/{TEST_COMPANY_ID}/entity-balances?type=restaurant"
        )
        
        assert response.status_code == 200, f"Expected 200, got {response.status_code}: {response.text}"
        
        data = response.json()
        assert "balances" in data, "Response should contain 'balances' key"
        assert isinstance(data["balances"], dict), "balances should be a dictionary"
        
        print(f"Restaurant balances count: {len(data['balances'])}")
        print(f"Sample balances: {dict(list(data['balances'].items())[:3])}")
    
    def test_restaurant_archived_entity_balances_endpoint(self):
        """Test GET /api/companies/{company_id}/entity-balances?type=restaurant_archived"""
        response = self.session.get(
            f"{BASE_URL}/api/companies/{TEST_COMPANY_ID}/entity-balances?type=restaurant_archived"
        )
        
        assert response.status_code == 200, f"Expected 200, got {response.status_code}: {response.text}"
        
        data = response.json()
        assert "balances" in data, "Response should contain 'balances' key"
        assert isinstance(data["balances"], dict), "balances should be a dictionary"
        
        print(f"Archived restaurant balances count: {len(data['balances'])}")
    
    # --- Vendor entity-balances tests ---
    def test_vendor_entity_balances_endpoint(self):
        """Test GET /api/companies/{company_id}/entity-balances?type=vendor"""
        response = self.session.get(
            f"{BASE_URL}/api/companies/{TEST_COMPANY_ID}/entity-balances?type=vendor"
        )
        
        assert response.status_code == 200, f"Expected 200, got {response.status_code}: {response.text}"
        
        data = response.json()
        assert "balances" in data, "Response should contain 'balances' key"
        assert isinstance(data["balances"], dict), "balances should be a dictionary"
        
        print(f"Vendor balances count: {len(data['balances'])}")
        print(f"Sample balances: {dict(list(data['balances'].items())[:3])}")
    
    def test_vendor_archived_entity_balances_endpoint(self):
        """Test GET /api/companies/{company_id}/entity-balances?type=vendor_archived"""
        response = self.session.get(
            f"{BASE_URL}/api/companies/{TEST_COMPANY_ID}/entity-balances?type=vendor_archived"
        )
        
        assert response.status_code == 200, f"Expected 200, got {response.status_code}: {response.text}"
        
        data = response.json()
        assert "balances" in data, "Response should contain 'balances' key"
        assert isinstance(data["balances"], dict), "balances should be a dictionary"
        
        print(f"Archived vendor balances count: {len(data['balances'])}")
    
    # --- Invalid type test ---
    def test_invalid_type_returns_400(self):
        """Test that invalid type returns 400 error"""
        response = self.session.get(
            f"{BASE_URL}/api/companies/{TEST_COMPANY_ID}/entity-balances?type=invalid_type"
        )
        
        assert response.status_code == 400, f"Expected 400 for invalid type, got {response.status_code}"
    
    # --- Verify balance values are numeric ---
    def test_balance_values_are_numeric(self):
        """Test that all balance values are numeric (int or float)"""
        response = self.session.get(
            f"{BASE_URL}/api/companies/{TEST_COMPANY_ID}/entity-balances?type=courier"
        )
        
        assert response.status_code == 200
        data = response.json()
        
        for entity_id, balance in data["balances"].items():
            assert isinstance(balance, (int, float)), f"Balance for {entity_id} should be numeric, got {type(balance)}"
        
        print("All balance values are numeric - PASS")


class TestAccountingListEndpoints:
    """Test the list endpoints used by accounting tabs"""
    
    @pytest.fixture(autouse=True)
    def setup(self):
        """Setup - get auth token"""
        self.session = requests.Session()
        self.session.headers.update({"Content-Type": "application/json"})
        
        # Login as admin
        login_response = self.session.post(
            f"{BASE_URL}/api/auth/admin/login",
            json={"username": "admin", "password": "123456"}
        )
        if login_response.status_code == 200:
            data = login_response.json()
            token = data.get("token") or data.get("access_token")
            if token:
                self.session.headers.update({"Authorization": f"Bearer {token}"})
        else:
            pytest.skip(f"Login failed: {login_response.status_code}")
    
    def test_couriers_list_endpoint(self):
        """Test GET /api/companies/{company_id}/couriers"""
        response = self.session.get(
            f"{BASE_URL}/api/companies/{TEST_COMPANY_ID}/couriers"
        )
        
        assert response.status_code == 200, f"Expected 200, got {response.status_code}: {response.text}"
        
        data = response.json()
        assert isinstance(data, list), "Response should be a list"
        
        print(f"Couriers count: {len(data)}")
        if data:
            print(f"First courier: {data[0].get('name', 'N/A')}")
    
    def test_accounting_restaurants_list_endpoint(self):
        """Test GET /api/companies/{company_id}/accounting-restaurants"""
        response = self.session.get(
            f"{BASE_URL}/api/companies/{TEST_COMPANY_ID}/accounting-restaurants"
        )
        
        assert response.status_code == 200, f"Expected 200, got {response.status_code}: {response.text}"
        
        data = response.json()
        assert isinstance(data, list), "Response should be a list"
        
        print(f"Restaurants count: {len(data)}")
        if data:
            print(f"First restaurant: {data[0].get('name', 'N/A')}")
    
    def test_vendors_list_endpoint(self):
        """Test GET /api/companies/{company_id}/vendors"""
        response = self.session.get(
            f"{BASE_URL}/api/companies/{TEST_COMPANY_ID}/vendors"
        )
        
        assert response.status_code == 200, f"Expected 200, got {response.status_code}: {response.text}"
        
        data = response.json()
        assert isinstance(data, list), "Response should be a list"
        
        print(f"Vendors count: {len(data)}")
        if data:
            print(f"First vendor: {data[0].get('name', 'N/A')}")


if __name__ == "__main__":
    pytest.main([__file__, "-v"])
