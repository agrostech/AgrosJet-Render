"""
Test suite for Simple Page-Based Permission System
Tests: Admin login with permissions, permission CRUD, menu filtering logic
"""
import pytest
import requests
import os
import uuid

BASE_URL = os.environ.get('REACT_APP_BACKEND_URL', '').rstrip('/')

class TestAdminLoginPermissions:
    """Test admin login returns permissions field"""
    
    def test_superadmin_login_returns_permissions(self):
        """Superadmin login should return permissions field with all true"""
        response = requests.post(f"{BASE_URL}/api/auth/admin/login", json={
            "username": "onurertas",
            "password": "Delivery32.."
        })
        assert response.status_code == 200
        data = response.json()
        
        # Check permissions field exists
        assert "permissions" in data, "Login response should contain permissions field"
        permissions = data["permissions"]
        
        # Check simple permission keys exist
        simple_keys = ["vardiya", "muhasebe", "zimmet", "kuryeler", "market", "akademi", "sistem"]
        for key in simple_keys:
            assert key in permissions, f"Permission key '{key}' should exist"
    
    def test_admin_login_returns_permissions(self):
        """Regular admin login should return permissions field"""
        response = requests.post(f"{BASE_URL}/api/auth/admin/login", json={
            "username": "testpermadmin",
            "password": "test123"
        })
        assert response.status_code == 200
        data = response.json()
        
        # Check permissions field exists
        assert "permissions" in data, "Login response should contain permissions field"
        permissions = data["permissions"]
        
        # Check simple permission keys exist
        simple_keys = ["vardiya", "muhasebe", "zimmet", "kuryeler", "market", "akademi", "sistem"]
        for key in simple_keys:
            assert key in permissions, f"Permission key '{key}' should exist"


class TestPermissionsCRUD:
    """Test permission update API"""
    
    @pytest.fixture
    def test_admin_id(self):
        """Get test admin ID"""
        response = requests.get(f"{BASE_URL}/api/admins")
        assert response.status_code == 200
        admins = response.json()
        
        for admin in admins:
            if admin.get("username") == "testpermadmin":
                return admin["id"]
        
        pytest.skip("testpermadmin not found")
    
    def test_update_permissions_success(self, test_admin_id):
        """Should successfully update admin permissions"""
        new_permissions = {
            "vardiya": True,
            "muhasebe": True,
            "zimmet": True,
            "kuryeler": True,
            "market": False,
            "akademi": False,
            "sistem": False
        }
        
        response = requests.put(
            f"{BASE_URL}/api/admins/{test_admin_id}/permissions",
            json={"permissions": new_permissions}
        )
        assert response.status_code == 200
        data = response.json()
        assert data["message"] == "İzinler güncellendi"
    
    def test_verify_permissions_persisted(self, test_admin_id):
        """Verify permissions are persisted after update"""
        # First update permissions
        new_permissions = {
            "vardiya": True,
            "muhasebe": False,
            "zimmet": True,
            "kuryeler": False,
            "market": True,
            "akademi": False,
            "sistem": False
        }
        
        response = requests.put(
            f"{BASE_URL}/api/admins/{test_admin_id}/permissions",
            json={"permissions": new_permissions}
        )
        assert response.status_code == 200
        
        # Login to verify
        response = requests.post(f"{BASE_URL}/api/auth/admin/login", json={
            "username": "testpermadmin",
            "password": "test123"
        })
        assert response.status_code == 200
        data = response.json()
        
        permissions = data["permissions"]
        assert permissions["vardiya"] == True
        assert permissions["muhasebe"] == False
        assert permissions["zimmet"] == True
        assert permissions["kuryeler"] == False
        assert permissions["market"] == True
        assert permissions["akademi"] == False
        assert permissions["sistem"] == False
    
    def test_update_permissions_invalid_admin(self):
        """Should return 404 for non-existent admin"""
        response = requests.put(
            f"{BASE_URL}/api/admins/non-existent-id/permissions",
            json={"permissions": {"vardiya": True}}
        )
        assert response.status_code == 404
    
    def test_update_permissions_superadmin_blocked(self):
        """Should not allow updating superadmin permissions"""
        # Get superadmin ID
        response = requests.get(f"{BASE_URL}/api/admins")
        assert response.status_code == 200
        admins = response.json()
        
        superadmin_id = None
        for admin in admins:
            if admin.get("role") == "superadmin":
                superadmin_id = admin["id"]
                break
        
        if not superadmin_id:
            pytest.skip("No superadmin found")
        
        response = requests.put(
            f"{BASE_URL}/api/admins/{superadmin_id}/permissions",
            json={"permissions": {"vardiya": False}}
        )
        assert response.status_code == 400
        assert "admin" in response.json()["detail"].lower()


class TestAdminsList:
    """Test admins list returns permissions"""
    
    def test_admins_list_includes_permissions(self):
        """GET /api/admins should return permissions for each admin"""
        response = requests.get(f"{BASE_URL}/api/admins")
        assert response.status_code == 200
        admins = response.json()
        
        assert len(admins) > 0, "Should have at least one admin"
        
        for admin in admins:
            assert "permissions" in admin, f"Admin {admin.get('username')} should have permissions"
            permissions = admin["permissions"]
            
            # Check at least some simple keys exist
            simple_keys = ["vardiya", "muhasebe", "zimmet", "kuryeler"]
            for key in simple_keys:
                assert key in permissions, f"Permission key '{key}' should exist for {admin.get('username')}"


class TestNewAdminDefaultPermissions:
    """Test new admin gets default permissions"""
    
    def test_create_admin_gets_default_permissions(self):
        """New admin should get default permissions"""
        # Get company_id from existing admin
        response = requests.post(f"{BASE_URL}/api/auth/admin/login", json={
            "username": "onurertas",
            "password": "Delivery32.."
        })
        company_id = response.json()["company_id"]
        
        # Create new admin
        unique_username = f"test_perm_{uuid.uuid4().hex[:8]}"
        response = requests.post(f"{BASE_URL}/api/admins", json={
            "name": "Test Default Perms",
            "username": unique_username,
            "password": "test123",
            "company_id": company_id
        })
        assert response.status_code == 200
        admin_id = response.json()["id"]
        
        try:
            # Login as new admin
            response = requests.post(f"{BASE_URL}/api/auth/admin/login", json={
                "username": unique_username,
                "password": "test123"
            })
            assert response.status_code == 200
            data = response.json()
            
            permissions = data["permissions"]
            
            # Check default permissions
            assert permissions["vardiya"] == True
            assert permissions["muhasebe"] == True
            assert permissions["zimmet"] == True
            assert permissions["kuryeler"] == True
            assert permissions["market"] == True
            assert permissions["akademi"] == True
            assert permissions["sistem"] == False  # Default is False
            
        finally:
            # Cleanup - delete test admin
            requests.delete(f"{BASE_URL}/api/admins/{admin_id}")


class TestPermissionValidation:
    """Test permission validation"""
    
    @pytest.fixture
    def test_admin_id(self):
        """Get test admin ID"""
        response = requests.get(f"{BASE_URL}/api/admins")
        assert response.status_code == 200
        admins = response.json()
        
        for admin in admins:
            if admin.get("username") == "testpermadmin":
                return admin["id"]
        
        pytest.skip("testpermadmin not found")
    
    def test_invalid_permission_keys_filtered(self, test_admin_id):
        """Invalid permission keys should be filtered out"""
        response = requests.put(
            f"{BASE_URL}/api/admins/{test_admin_id}/permissions",
            json={"permissions": {
                "vardiya": True,
                "invalid_key": True,
                "another_invalid": False,
                "muhasebe": False
            }}
        )
        assert response.status_code == 200
        
        # Verify only valid keys were saved
        response = requests.post(f"{BASE_URL}/api/auth/admin/login", json={
            "username": "testpermadmin",
            "password": "test123"
        })
        permissions = response.json()["permissions"]
        
        assert "invalid_key" not in permissions
        assert "another_invalid" not in permissions
        assert permissions["vardiya"] == True
        assert permissions["muhasebe"] == False


# Cleanup fixture to restore test admin permissions
@pytest.fixture(autouse=True, scope="module")
def restore_test_admin_permissions():
    """Restore test admin permissions after all tests"""
    yield
    
    # Get test admin ID
    response = requests.get(f"{BASE_URL}/api/admins")
    if response.status_code == 200:
        admins = response.json()
        for admin in admins:
            if admin.get("username") == "testpermadmin":
                # Restore default permissions
                requests.put(
                    f"{BASE_URL}/api/admins/{admin['id']}/permissions",
                    json={"permissions": {
                        "vardiya": True,
                        "muhasebe": True,
                        "zimmet": True,
                        "kuryeler": True,
                        "market": False,
                        "akademi": False,
                        "sistem": False
                    }}
                )
                break
