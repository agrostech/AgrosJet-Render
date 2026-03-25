"""
Backend Permission Enforcement Tests
Tests for X-Admin-Id header validation and granular permission checks
"""
import pytest
import requests
import os

BASE_URL = os.environ.get('REACT_APP_BACKEND_URL', 'https://migros-fix.preview.emergentagent.com')

# Test credentials from review request
SUPERADMIN_ID = "0211f951-210a-465a-9937-672ebb16950b"
# Admin with NO permissions (created for testing)
ADMIN_WITHOUT_PERMISSIONS_ID = "64b44a19-1323-482a-9ba3-184d4afde1d1"
# Admin with SOME permissions (atakansari - has vardiya, zimmet, akademi, market perms)
ADMIN_WITH_SOME_PERMISSIONS_ID = "b3eb21e3-e40e-4d60-9c15-983aa7d77358"
COMPANY_ID = "e1c50cea-307e-4889-b33b-4b22e467b0b4"


class TestPermissionEnforcementNoHeader:
    """Test that API requests without X-Admin-Id header return 401"""
    
    def test_businesses_without_header_returns_401(self):
        """GET /api/companies/{id}/businesses without header should return 401"""
        response = requests.get(f"{BASE_URL}/api/companies/{COMPANY_ID}/businesses")
        assert response.status_code == 401
        data = response.json()
        assert "detail" in data
        assert "Yetkilendirme gerekli" in data["detail"]
    
    def test_vendors_without_header_returns_401(self):
        """GET /api/companies/{id}/vendors without header should return 401"""
        response = requests.get(f"{BASE_URL}/api/companies/{COMPANY_ID}/vendors")
        assert response.status_code == 401
        data = response.json()
        assert "Yetkilendirme gerekli" in data["detail"]
    
    def test_shifts_without_header_returns_401(self):
        """GET /api/companies/{id}/shifts without header should return 401"""
        response = requests.get(f"{BASE_URL}/api/companies/{COMPANY_ID}/shifts")
        assert response.status_code == 401
        data = response.json()
        assert "Yetkilendirme gerekli" in data["detail"]
    
    def test_product_types_without_header_returns_401(self):
        """GET /api/companies/{id}/product-types without header should return 401"""
        response = requests.get(f"{BASE_URL}/api/companies/{COMPANY_ID}/product-types")
        assert response.status_code == 401
        data = response.json()
        assert "Yetkilendirme gerekli" in data["detail"]
    
    def test_products_without_header_returns_401(self):
        """GET /api/companies/{id}/products without header should return 401"""
        response = requests.get(f"{BASE_URL}/api/companies/{COMPANY_ID}/products")
        assert response.status_code == 401
        data = response.json()
        assert "Yetkilendirme gerekli" in data["detail"]
    
    def test_academy_trainings_without_header_returns_401(self):
        """GET /api/academy/company/{id}/trainings without header should return 401"""
        response = requests.get(f"{BASE_URL}/api/academy/company/{COMPANY_ID}/trainings")
        assert response.status_code == 401
        data = response.json()
        assert "Yetkilendirme gerekli" in data["detail"]
    
    def test_backup_export_without_header_returns_401(self):
        """GET /api/backup/company/{id}/export without header should return 401"""
        response = requests.get(f"{BASE_URL}/api/backup/company/{COMPANY_ID}/export")
        assert response.status_code == 401
        data = response.json()
        assert "Yetkilendirme gerekli" in data["detail"]
    
    def test_jetpuan_orders_admin_without_header_returns_401(self):
        """GET /api/jetpuan/orders/admin without header should return 401"""
        response = requests.get(f"{BASE_URL}/api/jetpuan/orders/admin")
        assert response.status_code == 401
        data = response.json()
        assert "Yetkilendirme gerekli" in data["detail"]


class TestSuperadminAccess:
    """Test that superadmin can access all endpoints with proper header"""
    
    def test_superadmin_can_access_businesses(self):
        """Superadmin should be able to access businesses endpoint"""
        response = requests.get(
            f"{BASE_URL}/api/companies/{COMPANY_ID}/businesses",
            headers={"X-Admin-Id": SUPERADMIN_ID}
        )
        assert response.status_code == 200
        assert isinstance(response.json(), list)
    
    def test_superadmin_can_access_vendors(self):
        """Superadmin should be able to access vendors endpoint"""
        response = requests.get(
            f"{BASE_URL}/api/companies/{COMPANY_ID}/vendors",
            headers={"X-Admin-Id": SUPERADMIN_ID}
        )
        assert response.status_code == 200
        assert isinstance(response.json(), list)
    
    def test_superadmin_can_access_shifts(self):
        """Superadmin should be able to access shifts endpoint"""
        response = requests.get(
            f"{BASE_URL}/api/companies/{COMPANY_ID}/shifts",
            headers={"X-Admin-Id": SUPERADMIN_ID}
        )
        assert response.status_code == 200
        assert isinstance(response.json(), list)
    
    def test_superadmin_can_access_product_types(self):
        """Superadmin should be able to access product types endpoint"""
        response = requests.get(
            f"{BASE_URL}/api/companies/{COMPANY_ID}/product-types",
            headers={"X-Admin-Id": SUPERADMIN_ID}
        )
        assert response.status_code == 200
        assert isinstance(response.json(), list)
    
    def test_superadmin_can_access_products(self):
        """Superadmin should be able to access products endpoint"""
        response = requests.get(
            f"{BASE_URL}/api/companies/{COMPANY_ID}/products",
            headers={"X-Admin-Id": SUPERADMIN_ID}
        )
        assert response.status_code == 200
        data = response.json()
        assert "products" in data
        assert "total_count" in data
    
    def test_superadmin_can_access_academy_trainings(self):
        """Superadmin should be able to access academy trainings endpoint"""
        response = requests.get(
            f"{BASE_URL}/api/academy/company/{COMPANY_ID}/trainings",
            headers={"X-Admin-Id": SUPERADMIN_ID}
        )
        assert response.status_code == 200
        assert isinstance(response.json(), list)
    
    def test_superadmin_can_access_shift_assignments(self):
        """Superadmin should be able to access shift assignments endpoint"""
        response = requests.get(
            f"{BASE_URL}/api/companies/{COMPANY_ID}/shift-assignments",
            headers={"X-Admin-Id": SUPERADMIN_ID}
        )
        assert response.status_code == 200
        assert isinstance(response.json(), list)
    
    def test_superadmin_can_access_leaves(self):
        """Superadmin should be able to access leaves endpoint"""
        response = requests.get(
            f"{BASE_URL}/api/companies/{COMPANY_ID}/leaves",
            headers={"X-Admin-Id": SUPERADMIN_ID}
        )
        assert response.status_code == 200
        assert isinstance(response.json(), list)
    
    def test_superadmin_can_access_jetpuan_orders(self):
        """Superadmin should be able to access JetPuan orders endpoint"""
        response = requests.get(
            f"{BASE_URL}/api/jetpuan/orders/admin",
            headers={"X-Admin-Id": SUPERADMIN_ID}
        )
        assert response.status_code == 200
        assert isinstance(response.json(), list)
    
    def test_superadmin_can_access_backup_schedule(self):
        """Superadmin should be able to access backup schedule endpoint"""
        response = requests.get(
            f"{BASE_URL}/api/backup/company/{COMPANY_ID}/schedule",
            headers={"X-Admin-Id": SUPERADMIN_ID}
        )
        assert response.status_code == 200
        data = response.json()
        assert "enabled" in data


class TestAdminWithoutPermissions:
    """Test that admin without specific permissions gets 403"""
    
    def test_admin_without_muhasebe_view_cannot_access_businesses(self):
        """Admin without muhasebe_view permission should get 403 on businesses"""
        response = requests.get(
            f"{BASE_URL}/api/companies/{COMPANY_ID}/businesses",
            headers={"X-Admin-Id": ADMIN_WITHOUT_PERMISSIONS_ID}
        )
        assert response.status_code == 403
        data = response.json()
        assert "detail" in data
        assert "yetkiniz yok" in data["detail"].lower()
    
    def test_admin_without_muhasebe_view_cannot_access_vendors(self):
        """Admin without muhasebe_view permission should get 403 on vendors"""
        response = requests.get(
            f"{BASE_URL}/api/companies/{COMPANY_ID}/vendors",
            headers={"X-Admin-Id": ADMIN_WITHOUT_PERMISSIONS_ID}
        )
        assert response.status_code == 403
        data = response.json()
        assert "yetkiniz yok" in data["detail"].lower()
    
    def test_admin_without_vardiya_view_cannot_access_shifts(self):
        """Admin without vardiya_view permission should get 403 on shifts"""
        response = requests.get(
            f"{BASE_URL}/api/companies/{COMPANY_ID}/shifts",
            headers={"X-Admin-Id": ADMIN_WITHOUT_PERMISSIONS_ID}
        )
        assert response.status_code == 403
        data = response.json()
        assert "yetkiniz yok" in data["detail"].lower()
    
    def test_admin_without_zimmet_view_cannot_access_products(self):
        """Admin without zimmet_view permission should get 403 on products"""
        response = requests.get(
            f"{BASE_URL}/api/companies/{COMPANY_ID}/products",
            headers={"X-Admin-Id": ADMIN_WITHOUT_PERMISSIONS_ID}
        )
        assert response.status_code == 403
        data = response.json()
        assert "yetkiniz yok" in data["detail"].lower()
    
    def test_admin_without_akademi_view_cannot_access_trainings(self):
        """Admin without akademi_view permission should get 403 on trainings"""
        response = requests.get(
            f"{BASE_URL}/api/academy/company/{COMPANY_ID}/trainings",
            headers={"X-Admin-Id": ADMIN_WITHOUT_PERMISSIONS_ID}
        )
        assert response.status_code == 403
        data = response.json()
        assert "yetkiniz yok" in data["detail"].lower()
    
    def test_admin_without_market_manage_orders_cannot_access_orders(self):
        """Admin without market_manage_orders permission should get 403 on orders"""
        response = requests.get(
            f"{BASE_URL}/api/jetpuan/orders/admin",
            headers={"X-Admin-Id": ADMIN_WITHOUT_PERMISSIONS_ID}
        )
        assert response.status_code == 403
        data = response.json()
        assert "yetkiniz yok" in data["detail"].lower()
    
    def test_admin_without_sistem_backup_cannot_access_backup(self):
        """Admin without sistem_backup permission should get 403 on backup"""
        response = requests.get(
            f"{BASE_URL}/api/backup/company/{COMPANY_ID}/schedule",
            headers={"X-Admin-Id": ADMIN_WITHOUT_PERMISSIONS_ID}
        )
        assert response.status_code == 403
        data = response.json()
        assert "yetkiniz yok" in data["detail"].lower()


class TestInvalidAdminId:
    """Test that invalid admin ID returns appropriate error"""
    
    def test_invalid_admin_id_returns_401(self):
        """Invalid admin ID should return 401"""
        response = requests.get(
            f"{BASE_URL}/api/companies/{COMPANY_ID}/businesses",
            headers={"X-Admin-Id": "invalid-uuid-12345"}
        )
        # Should return 403 (invalid admin) or 401 (not found)
        assert response.status_code in [401, 403]
    
    def test_nonexistent_admin_id_returns_error(self):
        """Non-existent admin ID should return error"""
        response = requests.get(
            f"{BASE_URL}/api/companies/{COMPANY_ID}/businesses",
            headers={"X-Admin-Id": "00000000-0000-0000-0000-000000000000"}
        )
        # Should return 403 (permission denied) since admin not found
        assert response.status_code in [401, 403]


class TestWriteOperationsPermissions:
    """Test write operations require proper permissions"""
    
    def test_create_business_without_header_returns_401(self):
        """POST /api/companies/{id}/businesses without header should return 401"""
        response = requests.post(
            f"{BASE_URL}/api/companies/{COMPANY_ID}/businesses",
            headers={"Content-Type": "application/json"},
            json={"name": "Test Business", "phone": "05551234567"}
        )
        assert response.status_code == 401
    
    def test_create_shift_without_header_returns_401(self):
        """POST /api/companies/{id}/shifts without header should return 401"""
        response = requests.post(
            f"{BASE_URL}/api/companies/{COMPANY_ID}/shifts",
            headers={"Content-Type": "application/json"},
            json={"name": "Test Shift", "start_time": "09:00", "end_time": "17:00", "company_id": COMPANY_ID}
        )
        assert response.status_code == 401
    
    def test_admin_without_permission_cannot_create_business(self):
        """Admin without muhasebe_add_transaction cannot create business"""
        response = requests.post(
            f"{BASE_URL}/api/companies/{COMPANY_ID}/businesses",
            headers={
                "Content-Type": "application/json",
                "X-Admin-Id": ADMIN_WITHOUT_PERMISSIONS_ID
            },
            json={"name": "Test Business", "phone": "05551234567"}
        )
        assert response.status_code == 403
    
    def test_admin_without_permission_cannot_create_shift(self):
        """Admin without vardiya_add cannot create shift"""
        response = requests.post(
            f"{BASE_URL}/api/companies/{COMPANY_ID}/shifts",
            headers={
                "Content-Type": "application/json",
                "X-Admin-Id": ADMIN_WITHOUT_PERMISSIONS_ID
            },
            json={"name": "Test Shift", "start_time": "09:00", "end_time": "17:00", "company_id": COMPANY_ID}
        )
        assert response.status_code == 403


class TestCourierEndpointsPermissions:
    """Test courier management endpoints require proper permissions"""
    
    def test_add_courier_without_header_returns_401(self):
        """POST /api/companies/{id}/couriers without header should return 401"""
        response = requests.post(
            f"{BASE_URL}/api/companies/{COMPANY_ID}/couriers",
            headers={"Content-Type": "application/json"},
            json={"phone": "05551234567"}
        )
        assert response.status_code == 401
    
    def test_admin_without_kurye_add_cannot_add_courier(self):
        """Admin without kurye_add permission cannot add courier"""
        response = requests.post(
            f"{BASE_URL}/api/companies/{COMPANY_ID}/couriers",
            headers={
                "Content-Type": "application/json",
                "X-Admin-Id": ADMIN_WITHOUT_PERMISSIONS_ID
            },
            json={"phone": "05551234567"}
        )
        # Should return 403 for permission denied
        assert response.status_code == 403
        data = response.json()
        assert "yetkiniz yok" in data["detail"].lower()


class TestTransactionEndpointsPermissions:
    """Test transaction endpoints require proper permissions"""
    
    def test_create_transaction_without_header_returns_401(self):
        """POST /api/transactions without header should return 401"""
        response = requests.post(
            f"{BASE_URL}/api/transactions",
            headers={"Content-Type": "application/json"},
            json={
                "entity_type": "business",
                "entity_id": "test-id",
                "company_id": COMPANY_ID,
                "type": "payment_in",
                "amount": 100
            }
        )
        assert response.status_code == 401
    
    def test_admin_without_muhasebe_add_cannot_create_transaction(self):
        """Admin without muhasebe_add_transaction cannot create transaction"""
        response = requests.post(
            f"{BASE_URL}/api/transactions",
            headers={
                "Content-Type": "application/json",
                "X-Admin-Id": ADMIN_WITHOUT_PERMISSIONS_ID
            },
            json={
                "entity_type": "business",
                "entity_id": "test-id",
                "company_id": COMPANY_ID,
                "type": "payment_in",
                "amount": 100
            }
        )
        assert response.status_code == 403


if __name__ == "__main__":
    pytest.main([__file__, "-v", "--tb=short"])
