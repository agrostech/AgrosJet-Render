"""
Test Router Auth Fix - Iteration 40
Tests that courier panel endpoints are accessible with courier token after changing
shifts.py, accounting.py, hakedis.py, break_system.py from require_admin to require_auth.

Endpoints tested:
- /api/companies/{id}/shifts
- /api/companies/{id}/shift-assignments
- /api/companies/{id}/leaves
- /api/transactions/courier/{id}
- /api/couriers/{id}/installment-products
- /api/companies/{id}/break-status
- /api/couriers/{id}/availability (PUT)
- /api/couriers/{id}/location (PUT)
"""

import pytest
import requests
import os

BASE_URL = os.environ.get('REACT_APP_BACKEND_URL', '').rstrip('/')

# Test credentials
COURIER_PHONE = "05550003201"
COURIER_PASSWORD = "123456"
COURIER_ID = "feae169f-222b-45df-b9e8-0664a186031a"
COMPANY_ID = "0005ec2a-04ca-4250-9530-ecc6fde165f1"
ADMIN_USERNAME = "admin"
ADMIN_PASSWORD = "123456"


class TestCourierAuth:
    """Test courier authentication and token retrieval"""
    
    @pytest.fixture(scope="class")
    def courier_token(self):
        """Get courier authentication token"""
        response = requests.post(f"{BASE_URL}/api/auth/courier/login", json={
            "phone": COURIER_PHONE,
            "password": COURIER_PASSWORD
        })
        assert response.status_code == 200, f"Courier login failed: {response.text}"
        data = response.json()
        assert "token" in data, "No token in courier login response"
        return data["token"]
    
    @pytest.fixture(scope="class")
    def admin_token(self):
        """Get admin authentication token"""
        response = requests.post(f"{BASE_URL}/api/auth/admin/login", json={
            "username": ADMIN_USERNAME,
            "password": ADMIN_PASSWORD
        })
        assert response.status_code == 200, f"Admin login failed: {response.text}"
        data = response.json()
        assert "token" in data, "No token in admin login response"
        return data["token"]
    
    def test_courier_login_success(self, courier_token):
        """Verify courier can login and get token"""
        assert courier_token is not None
        assert len(courier_token) > 0
        print(f"✓ Courier login successful, token length: {len(courier_token)}")


class TestShiftsEndpoints:
    """Test shifts.py endpoints - Changed from require_admin to require_auth"""
    
    @pytest.fixture(scope="class")
    def courier_token(self):
        response = requests.post(f"{BASE_URL}/api/auth/courier/login", json={
            "phone": COURIER_PHONE,
            "password": COURIER_PASSWORD
        })
        return response.json().get("token")
    
    @pytest.fixture(scope="class")
    def admin_token(self):
        response = requests.post(f"{BASE_URL}/api/auth/admin/login", json={
            "username": ADMIN_USERNAME,
            "password": ADMIN_PASSWORD
        })
        return response.json().get("token")
    
    def test_courier_can_access_shifts(self, courier_token):
        """Courier can GET /api/companies/{id}/shifts (was 403, should be 200)"""
        headers = {"Authorization": f"Bearer {courier_token}"}
        response = requests.get(f"{BASE_URL}/api/companies/{COMPANY_ID}/shifts", headers=headers)
        assert response.status_code == 200, f"Expected 200, got {response.status_code}: {response.text}"
        data = response.json()
        assert isinstance(data, list), "Response should be a list of shifts"
        print(f"✓ Courier can access shifts endpoint - {len(data)} shifts found")
    
    def test_courier_can_access_shift_assignments(self, courier_token):
        """Courier can GET /api/companies/{id}/shift-assignments (was 403, should be 200)"""
        headers = {"Authorization": f"Bearer {courier_token}"}
        response = requests.get(f"{BASE_URL}/api/companies/{COMPANY_ID}/shift-assignments", headers=headers)
        assert response.status_code == 200, f"Expected 200, got {response.status_code}: {response.text}"
        data = response.json()
        assert isinstance(data, list), "Response should be a list of assignments"
        print(f"✓ Courier can access shift-assignments endpoint - {len(data)} assignments found")
    
    def test_courier_can_access_leaves(self, courier_token):
        """Courier can GET /api/companies/{id}/leaves (was 403, should be 200)"""
        headers = {"Authorization": f"Bearer {courier_token}"}
        response = requests.get(f"{BASE_URL}/api/companies/{COMPANY_ID}/leaves", headers=headers)
        assert response.status_code == 200, f"Expected 200, got {response.status_code}: {response.text}"
        data = response.json()
        assert isinstance(data, list), "Response should be a list of leaves"
        print(f"✓ Courier can access leaves endpoint - {len(data)} leaves found")
    
    def test_unauthenticated_shifts_returns_401(self):
        """Unauthenticated request to shifts returns 401 (security preserved)"""
        response = requests.get(f"{BASE_URL}/api/companies/{COMPANY_ID}/shifts")
        assert response.status_code == 401, f"Expected 401, got {response.status_code}"
        print("✓ Unauthenticated shifts request returns 401 - security preserved")
    
    def test_admin_can_still_access_shifts(self, admin_token):
        """Admin can still access shifts endpoint"""
        headers = {"Authorization": f"Bearer {admin_token}"}
        response = requests.get(f"{BASE_URL}/api/companies/{COMPANY_ID}/shifts", headers=headers)
        assert response.status_code == 200, f"Expected 200, got {response.status_code}: {response.text}"
        print("✓ Admin can still access shifts endpoint")


class TestAccountingEndpoints:
    """Test accounting.py endpoints - Changed from require_admin to require_auth"""
    
    @pytest.fixture(scope="class")
    def courier_token(self):
        response = requests.post(f"{BASE_URL}/api/auth/courier/login", json={
            "phone": COURIER_PHONE,
            "password": COURIER_PASSWORD
        })
        return response.json().get("token")
    
    @pytest.fixture(scope="class")
    def admin_token(self):
        response = requests.post(f"{BASE_URL}/api/auth/admin/login", json={
            "username": ADMIN_USERNAME,
            "password": ADMIN_PASSWORD
        })
        return response.json().get("token")
    
    def test_courier_can_access_transactions(self, courier_token):
        """Courier can GET /api/transactions/courier/{id} (was 403, should be 200)"""
        headers = {"Authorization": f"Bearer {courier_token}"}
        response = requests.get(f"{BASE_URL}/api/transactions/courier/{COURIER_ID}?skip=0&limit=10", headers=headers)
        assert response.status_code == 200, f"Expected 200, got {response.status_code}: {response.text}"
        data = response.json()
        assert "transactions" in data, "Response should contain transactions"
        assert "balance" in data, "Response should contain balance"
        print(f"✓ Courier can access transactions endpoint - balance: {data.get('balance')}")
    
    def test_courier_can_access_installment_products(self, courier_token):
        """Courier can GET /api/couriers/{id}/installment-products (was 403, should be 200)"""
        headers = {"Authorization": f"Bearer {courier_token}"}
        response = requests.get(f"{BASE_URL}/api/couriers/{COURIER_ID}/installment-products?include_completed=false", headers=headers)
        assert response.status_code == 200, f"Expected 200, got {response.status_code}: {response.text}"
        data = response.json()
        assert isinstance(data, list), "Response should be a list of installment products"
        print(f"✓ Courier can access installment-products endpoint - {len(data)} products found")
    
    def test_unauthenticated_transactions_returns_401(self):
        """Unauthenticated request to transactions returns 401 (security preserved)"""
        response = requests.get(f"{BASE_URL}/api/transactions/courier/{COURIER_ID}")
        assert response.status_code == 401, f"Expected 401, got {response.status_code}"
        print("✓ Unauthenticated transactions request returns 401 - security preserved")
    
    def test_admin_can_still_access_transactions(self, admin_token):
        """Admin can still access transactions endpoint"""
        headers = {"Authorization": f"Bearer {admin_token}"}
        response = requests.get(f"{BASE_URL}/api/transactions/courier/{COURIER_ID}?skip=0&limit=10", headers=headers)
        assert response.status_code == 200, f"Expected 200, got {response.status_code}: {response.text}"
        print("✓ Admin can still access transactions endpoint")


class TestBreakSystemEndpoints:
    """Test break_system.py endpoints - Changed from require_admin to require_auth"""
    
    @pytest.fixture(scope="class")
    def courier_token(self):
        response = requests.post(f"{BASE_URL}/api/auth/courier/login", json={
            "phone": COURIER_PHONE,
            "password": COURIER_PASSWORD
        })
        return response.json().get("token")
    
    @pytest.fixture(scope="class")
    def admin_token(self):
        response = requests.post(f"{BASE_URL}/api/auth/admin/login", json={
            "username": ADMIN_USERNAME,
            "password": ADMIN_PASSWORD
        })
        return response.json().get("token")
    
    def test_courier_can_access_break_status(self, courier_token):
        """Courier can GET /api/companies/{id}/break-status (was 403, should be 200)"""
        headers = {"Authorization": f"Bearer {courier_token}"}
        response = requests.get(f"{BASE_URL}/api/companies/{COMPANY_ID}/break-status", headers=headers)
        assert response.status_code == 200, f"Expected 200, got {response.status_code}: {response.text}"
        data = response.json()
        assert "break_mode" in data, "Response should contain break_mode"
        assert "on_break_count" in data, "Response should contain on_break_count"
        print(f"✓ Courier can access break-status endpoint - mode: {data.get('break_mode')}")
    
    def test_unauthenticated_break_status_returns_401(self):
        """Unauthenticated request to break-status returns 401 (security preserved)"""
        response = requests.get(f"{BASE_URL}/api/companies/{COMPANY_ID}/break-status")
        assert response.status_code == 401, f"Expected 401, got {response.status_code}"
        print("✓ Unauthenticated break-status request returns 401 - security preserved")
    
    def test_admin_can_still_access_break_status(self, admin_token):
        """Admin can still access break-status endpoint"""
        headers = {"Authorization": f"Bearer {admin_token}"}
        response = requests.get(f"{BASE_URL}/api/companies/{COMPANY_ID}/break-status", headers=headers)
        assert response.status_code == 200, f"Expected 200, got {response.status_code}: {response.text}"
        print("✓ Admin can still access break-status endpoint")


class TestCourierAvailabilityAndLocation:
    """Test courier availability and location endpoints (couriers.py - already require_auth)"""
    
    @pytest.fixture(scope="class")
    def courier_token(self):
        response = requests.post(f"{BASE_URL}/api/auth/courier/login", json={
            "phone": COURIER_PHONE,
            "password": COURIER_PASSWORD
        })
        return response.json().get("token")
    
    @pytest.fixture(scope="class")
    def initial_status(self, courier_token):
        """Get initial courier status to restore after test"""
        headers = {"Authorization": f"Bearer {courier_token}"}
        response = requests.get(f"{BASE_URL}/api/couriers/{COURIER_ID}", headers=headers)
        if response.status_code == 200:
            return response.json().get("availability_status", "offline")
        return "offline"
    
    def test_courier_can_update_availability(self, courier_token, initial_status):
        """Courier can PUT /api/couriers/{id}/availability (status change works)"""
        headers = {"Authorization": f"Bearer {courier_token}"}
        
        # Try to set to active
        response = requests.put(
            f"{BASE_URL}/api/couriers/{COURIER_ID}/availability",
            headers=headers,
            json={"availability_status": "active"}
        )
        # May fail if courier has active orders, but should not be 401/403
        assert response.status_code in [200, 400], f"Expected 200 or 400, got {response.status_code}: {response.text}"
        
        if response.status_code == 200:
            print("✓ Courier can update availability to active")
            
            # Reset back to initial status
            requests.put(
                f"{BASE_URL}/api/couriers/{COURIER_ID}/availability",
                headers=headers,
                json={"availability_status": initial_status}
            )
            print(f"✓ Reset status back to {initial_status}")
        else:
            print(f"✓ Availability update returned 400 (expected if courier has active orders): {response.json().get('detail')}")
    
    def test_courier_can_update_location(self, courier_token):
        """Courier can PUT /api/couriers/{id}/location (location update works)"""
        headers = {"Authorization": f"Bearer {courier_token}"}
        response = requests.put(
            f"{BASE_URL}/api/couriers/{COURIER_ID}/location",
            headers=headers,
            json={"latitude": 37.75, "longitude": 30.28}
        )
        assert response.status_code == 200, f"Expected 200, got {response.status_code}: {response.text}"
        data = response.json()
        assert "message" in data, "Response should contain message"
        print("✓ Courier can update location")
    
    def test_unauthenticated_availability_returns_401(self):
        """Unauthenticated request to availability returns 401 (security preserved)"""
        response = requests.put(
            f"{BASE_URL}/api/couriers/{COURIER_ID}/availability",
            json={"availability_status": "active"}
        )
        assert response.status_code == 401, f"Expected 401, got {response.status_code}"
        print("✓ Unauthenticated availability request returns 401 - security preserved")
    
    def test_unauthenticated_location_returns_401(self):
        """Unauthenticated request to location returns 401 (security preserved)"""
        response = requests.put(
            f"{BASE_URL}/api/couriers/{COURIER_ID}/location",
            json={"latitude": 37.75, "longitude": 30.28}
        )
        assert response.status_code == 401, f"Expected 401, got {response.status_code}"
        print("✓ Unauthenticated location request returns 401 - security preserved")


class TestHakedisEndpoints:
    """Test hakedis.py endpoints - Changed from require_admin to require_auth"""
    
    @pytest.fixture(scope="class")
    def courier_token(self):
        response = requests.post(f"{BASE_URL}/api/auth/courier/login", json={
            "phone": COURIER_PHONE,
            "password": COURIER_PASSWORD
        })
        return response.json().get("token")
    
    def test_courier_can_access_hakedis(self, courier_token):
        """Courier can POST /api/hakedis/couriers/{company_id} (was 403, should be 200)"""
        headers = {"Authorization": f"Bearer {courier_token}"}
        response = requests.post(
            f"{BASE_URL}/api/hakedis/couriers/{COMPANY_ID}",
            headers=headers,
            json={
                "start_date": "2026-01-01T00:00:00",
                "end_date": "2026-01-31T23:59:59"
            }
        )
        assert response.status_code == 200, f"Expected 200, got {response.status_code}: {response.text}"
        data = response.json()
        assert "couriers" in data, "Response should contain couriers"
        assert "summary" in data, "Response should contain summary"
        print(f"✓ Courier can access hakedis endpoint - {len(data.get('couriers', []))} couriers in result")
    
    def test_unauthenticated_hakedis_returns_401(self):
        """Unauthenticated request to hakedis returns 401 (security preserved)"""
        response = requests.post(
            f"{BASE_URL}/api/hakedis/couriers/{COMPANY_ID}",
            json={
                "start_date": "2026-01-01T00:00:00",
                "end_date": "2026-01-31T23:59:59"
            }
        )
        assert response.status_code == 401, f"Expected 401, got {response.status_code}"
        print("✓ Unauthenticated hakedis request returns 401 - security preserved")


if __name__ == "__main__":
    pytest.main([__file__, "-v", "--tb=short"])
