"""
Test router auth fix - Courier panel endpoints should accept courier tokens
Previously these routers had require_admin dependency, now they have require_auth

Routers fixed:
- motorcycles.py (Line 16)
- zimmet.py (Line 12)
- academy.py (Line 18)
- documents.py (Line 19)
- invoices.py (Line 25)
"""
import pytest
import requests
import os

BASE_URL = os.environ.get('REACT_APP_BACKEND_URL').rstrip('/')

# Test credentials from test_credentials.md
COURIER_PHONE = "05550003201"
COURIER_PASSWORD = "123456"
ADMIN_USERNAME = "admin"
ADMIN_PASSWORD = "123456"


class TestRouterAuthFix:
    """Test that courier tokens can access courier panel endpoints"""
    
    @pytest.fixture(scope="class")
    def courier_token(self):
        """Get courier token via login"""
        response = requests.post(f"{BASE_URL}/api/auth/courier/login", json={
            "phone": COURIER_PHONE,
            "password": COURIER_PASSWORD
        })
        assert response.status_code == 200, f"Courier login failed: {response.text}"
        data = response.json()
        assert "token" in data, "No token in courier login response"
        return data["token"], data.get("courier", {}).get("id") or data.get("courier_id")
    
    @pytest.fixture(scope="class")
    def admin_token(self):
        """Get admin token via login"""
        response = requests.post(f"{BASE_URL}/api/auth/admin/login", json={
            "username": ADMIN_USERNAME,
            "password": ADMIN_PASSWORD
        })
        assert response.status_code == 200, f"Admin login failed: {response.text}"
        data = response.json()
        return data.get("token")
    
    # ============ MOTORCYCLES ROUTER TESTS ============
    
    def test_courier_can_access_motorcycles_endpoint(self, courier_token):
        """Courier should be able to access /api/motorcycles/courier/{id}"""
        token, courier_id = courier_token
        response = requests.get(
            f"{BASE_URL}/api/motorcycles/courier/{courier_id}",
            headers={"Authorization": f"Bearer {token}"}
        )
        # Should NOT be 401 (was the bug) - should be 200
        assert response.status_code == 200, f"Expected 200, got {response.status_code}: {response.text}"
        print(f"✓ Courier can access /api/motorcycles/courier/{courier_id} - Status: {response.status_code}")
    
    def test_admin_can_still_access_motorcycles_endpoint(self, admin_token, courier_token):
        """Admin should still be able to access motorcycles endpoint"""
        _, courier_id = courier_token
        response = requests.get(
            f"{BASE_URL}/api/motorcycles/courier/{courier_id}",
            headers={"Authorization": f"Bearer {admin_token}"}
        )
        assert response.status_code == 200, f"Admin access failed: {response.status_code}"
        print(f"✓ Admin can access /api/motorcycles/courier/{courier_id} - Status: {response.status_code}")
    
    def test_unauthenticated_cannot_access_motorcycles(self, courier_token):
        """Unauthenticated requests should get 401"""
        _, courier_id = courier_token
        response = requests.get(f"{BASE_URL}/api/motorcycles/courier/{courier_id}")
        assert response.status_code == 401, f"Expected 401, got {response.status_code}"
        print(f"✓ Unauthenticated request to motorcycles returns 401")
    
    # ============ ZIMMET ROUTER TESTS ============
    
    def test_courier_can_access_zimmet_assignments(self, courier_token):
        """Courier should be able to access /api/zimmet/courier/{id}/assignments"""
        token, courier_id = courier_token
        response = requests.get(
            f"{BASE_URL}/api/zimmet/courier/{courier_id}/assignments",
            headers={"Authorization": f"Bearer {token}"}
        )
        # Should NOT be 401 (was the bug) - should be 200
        assert response.status_code == 200, f"Expected 200, got {response.status_code}: {response.text}"
        print(f"✓ Courier can access /api/zimmet/courier/{courier_id}/assignments - Status: {response.status_code}")
    
    def test_admin_can_still_access_zimmet_endpoint(self, admin_token, courier_token):
        """Admin should still be able to access zimmet endpoint"""
        _, courier_id = courier_token
        response = requests.get(
            f"{BASE_URL}/api/zimmet/courier/{courier_id}/assignments",
            headers={"Authorization": f"Bearer {admin_token}"}
        )
        assert response.status_code == 200, f"Admin access failed: {response.status_code}"
        print(f"✓ Admin can access /api/zimmet/courier/{courier_id}/assignments - Status: {response.status_code}")
    
    def test_unauthenticated_cannot_access_zimmet(self, courier_token):
        """Unauthenticated requests should get 401"""
        _, courier_id = courier_token
        response = requests.get(f"{BASE_URL}/api/zimmet/courier/{courier_id}/assignments")
        assert response.status_code == 401, f"Expected 401, got {response.status_code}"
        print(f"✓ Unauthenticated request to zimmet returns 401")
    
    # ============ ACADEMY ROUTER TESTS ============
    
    def test_courier_can_access_academy_trainings(self, courier_token):
        """Courier should be able to access /api/academy/company/{id}/trainings"""
        token, courier_id = courier_token
        # First get courier's company_id
        courier_response = requests.get(
            f"{BASE_URL}/api/couriers/{courier_id}",
            headers={"Authorization": f"Bearer {token}"}
        )
        company_id = courier_response.json().get("company_id")
        
        if not company_id:
            # Try to get from company_couriers
            rel_response = requests.get(
                f"{BASE_URL}/api/couriers/{courier_id}/companies",
                headers={"Authorization": f"Bearer {token}"}
            )
            companies = rel_response.json().get("companies", [])
            if companies:
                company_id = companies[0].get("company_id") or companies[0].get("id")
        
        if not company_id:
            pytest.skip("Could not determine company_id for courier")
        
        response = requests.get(
            f"{BASE_URL}/api/academy/company/{company_id}/trainings",
            headers={"Authorization": f"Bearer {token}"}
        )
        # Should NOT be 401 (was the bug) - should be 200
        assert response.status_code == 200, f"Expected 200, got {response.status_code}: {response.text}"
        print(f"✓ Courier can access /api/academy/company/{company_id}/trainings - Status: {response.status_code}")
    
    def test_unauthenticated_cannot_access_academy(self):
        """Unauthenticated requests should get 401"""
        response = requests.get(f"{BASE_URL}/api/academy/company/test-company/trainings")
        assert response.status_code == 401, f"Expected 401, got {response.status_code}"
        print(f"✓ Unauthenticated request to academy returns 401")
    
    # ============ DOCUMENTS ROUTER TESTS ============
    
    def test_courier_can_access_documents_endpoint(self, courier_token):
        """Courier should be able to access /api/documents/courier/{id}"""
        token, courier_id = courier_token
        response = requests.get(
            f"{BASE_URL}/api/documents/courier/{courier_id}",
            headers={"Authorization": f"Bearer {token}"}
        )
        # Should NOT be 401 (was the bug) - should be 200
        assert response.status_code == 200, f"Expected 200, got {response.status_code}: {response.text}"
        print(f"✓ Courier can access /api/documents/courier/{courier_id} - Status: {response.status_code}")
    
    def test_admin_can_still_access_documents_endpoint(self, admin_token, courier_token):
        """Admin should still be able to access documents endpoint"""
        _, courier_id = courier_token
        response = requests.get(
            f"{BASE_URL}/api/documents/courier/{courier_id}",
            headers={"Authorization": f"Bearer {admin_token}"}
        )
        assert response.status_code == 200, f"Admin access failed: {response.status_code}"
        print(f"✓ Admin can access /api/documents/courier/{courier_id} - Status: {response.status_code}")
    
    def test_unauthenticated_cannot_access_documents(self, courier_token):
        """Unauthenticated requests should get 401"""
        _, courier_id = courier_token
        response = requests.get(f"{BASE_URL}/api/documents/courier/{courier_id}")
        assert response.status_code == 401, f"Expected 401, got {response.status_code}"
        print(f"✓ Unauthenticated request to documents returns 401")
    
    # ============ INVOICES ROUTER TESTS ============
    
    def test_courier_can_access_invoices_endpoint(self, courier_token):
        """Courier should be able to access /api/invoices/courier/{id}"""
        token, courier_id = courier_token
        response = requests.get(
            f"{BASE_URL}/api/invoices/courier/{courier_id}",
            headers={"Authorization": f"Bearer {token}"}
        )
        # Should NOT be 401 (was the bug) - should be 200
        assert response.status_code == 200, f"Expected 200, got {response.status_code}: {response.text}"
        print(f"✓ Courier can access /api/invoices/courier/{courier_id} - Status: {response.status_code}")
    
    def test_admin_can_still_access_invoices_endpoint(self, admin_token, courier_token):
        """Admin should still be able to access invoices endpoint"""
        _, courier_id = courier_token
        response = requests.get(
            f"{BASE_URL}/api/invoices/courier/{courier_id}",
            headers={"Authorization": f"Bearer {admin_token}"}
        )
        assert response.status_code == 200, f"Admin access failed: {response.status_code}"
        print(f"✓ Admin can access /api/invoices/courier/{courier_id} - Status: {response.status_code}")
    
    def test_unauthenticated_cannot_access_invoices(self, courier_token):
        """Unauthenticated requests should get 401"""
        _, courier_id = courier_token
        response = requests.get(f"{BASE_URL}/api/invoices/courier/{courier_id}")
        assert response.status_code == 401, f"Expected 401, got {response.status_code}"
        print(f"✓ Unauthenticated request to invoices returns 401")


class TestCourierLoginFlow:
    """Test courier login and token generation"""
    
    def test_courier_login_returns_token(self):
        """Courier login should return a valid token"""
        response = requests.post(f"{BASE_URL}/api/auth/courier/login", json={
            "phone": COURIER_PHONE,
            "password": COURIER_PASSWORD
        })
        assert response.status_code == 200, f"Login failed: {response.text}"
        data = response.json()
        assert "token" in data, "No token in response"
        # Courier info can be in 'id' field directly or nested
        assert data.get("id") or data.get("courier") or data.get("courier_id"), "No courier info in response"
        print(f"✓ Courier login successful, token received")
    
    def test_courier_token_has_courier_role(self):
        """Courier token should have role=courier"""
        import jwt
        response = requests.post(f"{BASE_URL}/api/auth/courier/login", json={
            "phone": COURIER_PHONE,
            "password": COURIER_PASSWORD
        })
        data = response.json()
        token = data.get("token")
        
        # Decode without verification to check payload
        payload = jwt.decode(token, options={"verify_signature": False})
        assert payload.get("role") == "courier", f"Expected role=courier, got {payload.get('role')}"
        print(f"✓ Courier token has role=courier")
