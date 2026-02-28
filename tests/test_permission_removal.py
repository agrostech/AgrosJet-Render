"""
Test suite for verifying permission system removal
Tests:
1. Admin login - no permissions in response
2. Admin CRUD operations work without permission headers
3. Yöneticiler page has no permission-related fields
"""
import pytest
import requests
import os

BASE_URL = os.environ.get('REACT_APP_BACKEND_URL', 'https://persistent-logging.preview.emergentagent.com')

class TestPermissionRemoval:
    """Tests to verify permission system has been removed"""
    
    def test_admin_login_no_permissions_field(self):
        """Admin login response should NOT contain permissions field"""
        response = requests.post(f"{BASE_URL}/api/auth/admin/login", json={
            "username": "onurertas",
            "password": "Delivery32.."
        })
        assert response.status_code == 200, f"Login failed: {response.text}"
        
        data = response.json()
        print(f"Login response keys: {data.keys()}")
        
        # Verify no permissions field
        assert "permissions" not in data, "permissions field should NOT be in login response"
        
        # Verify expected fields exist
        assert "id" in data
        assert "name" in data
        assert "username" in data
        assert "role" in data
        assert "company_id" in data
        
        print(f"✓ Login response has no permissions field")
        print(f"  Role: {data['role']}")
        print(f"  Username: {data['username']}")
        return data
    
    def test_admin_login_wrong_password_single_error(self):
        """Wrong password should return single 401 error"""
        response = requests.post(f"{BASE_URL}/api/auth/admin/login", json={
            "username": "onurertas",
            "password": "wrongpassword123"
        })
        assert response.status_code == 401, f"Expected 401, got {response.status_code}"
        
        data = response.json()
        assert "detail" in data
        print(f"✓ Wrong password returns 401 with message: {data['detail']}")
    
    def test_get_admins_no_permission_header_required(self):
        """GET /api/admins should work without X-Admin-Id header"""
        # First login to get company_id
        login_resp = requests.post(f"{BASE_URL}/api/auth/admin/login", json={
            "username": "onurertas",
            "password": "Delivery32.."
        })
        company_id = login_resp.json()["company_id"]
        
        # Get admins without any special headers
        response = requests.get(f"{BASE_URL}/api/admins?company_id={company_id}")
        assert response.status_code == 200, f"Failed to get admins: {response.text}"
        
        admins = response.json()
        print(f"✓ Got {len(admins)} admins without permission header")
        
        # Verify admin data structure has no permissions
        for admin in admins:
            assert "permissions" not in admin, f"Admin {admin.get('username')} has permissions field"
            print(f"  - {admin.get('name')} ({admin.get('role')})")
    
    def test_create_admin_no_permissions_field(self):
        """Create admin should work without permissions field"""
        # First login to get company_id
        login_resp = requests.post(f"{BASE_URL}/api/auth/admin/login", json={
            "username": "onurertas",
            "password": "Delivery32.."
        })
        company_id = login_resp.json()["company_id"]
        
        # Create admin without permissions
        test_admin = {
            "name": "TEST_PermissionTest Admin",
            "username": "TEST_permtest_" + str(os.urandom(4).hex()),
            "password": "testpass123",
            "company_id": company_id
        }
        
        response = requests.post(f"{BASE_URL}/api/admins", json=test_admin)
        assert response.status_code == 200, f"Failed to create admin: {response.text}"
        
        data = response.json()
        print(f"✓ Created admin without permissions field")
        print(f"  Admin ID: {data.get('id')}")
        
        # Cleanup - delete the test admin
        if "id" in data:
            delete_resp = requests.delete(f"{BASE_URL}/api/admins/{data['id']}")
            print(f"  Cleanup: Deleted test admin (status: {delete_resp.status_code})")
    
    def test_update_admin_no_permissions_field(self):
        """Update admin should work without permissions field"""
        # First login to get company_id
        login_resp = requests.post(f"{BASE_URL}/api/auth/admin/login", json={
            "username": "onurertas",
            "password": "Delivery32.."
        })
        company_id = login_resp.json()["company_id"]
        
        # Create a test admin first
        test_admin = {
            "name": "TEST_UpdateTest Admin",
            "username": "TEST_updatetest_" + str(os.urandom(4).hex()),
            "password": "testpass123",
            "company_id": company_id
        }
        
        create_resp = requests.post(f"{BASE_URL}/api/admins", json=test_admin)
        assert create_resp.status_code == 200
        admin_id = create_resp.json()["id"]
        
        # Update admin without permissions
        update_data = {
            "name": "TEST_Updated Name"
        }
        
        response = requests.put(f"{BASE_URL}/api/admins/{admin_id}", json=update_data)
        assert response.status_code == 200, f"Failed to update admin: {response.text}"
        
        print(f"✓ Updated admin without permissions field")
        
        # Cleanup
        requests.delete(f"{BASE_URL}/api/admins/{admin_id}")
        print(f"  Cleanup: Deleted test admin")
    
    def test_delete_admin_works(self):
        """Delete admin should work"""
        # First login to get company_id
        login_resp = requests.post(f"{BASE_URL}/api/auth/admin/login", json={
            "username": "onurertas",
            "password": "Delivery32.."
        })
        company_id = login_resp.json()["company_id"]
        
        # Create a test admin first
        test_admin = {
            "name": "TEST_DeleteTest Admin",
            "username": "TEST_deletetest_" + str(os.urandom(4).hex()),
            "password": "testpass123",
            "company_id": company_id
        }
        
        create_resp = requests.post(f"{BASE_URL}/api/admins", json=test_admin)
        assert create_resp.status_code == 200
        admin_id = create_resp.json()["id"]
        
        # Delete admin
        response = requests.delete(f"{BASE_URL}/api/admins/{admin_id}")
        assert response.status_code == 200, f"Failed to delete admin: {response.text}"
        
        print(f"✓ Deleted admin successfully")
        
        # Verify admin is deleted
        admins_resp = requests.get(f"{BASE_URL}/api/admins?company_id={company_id}")
        admins = admins_resp.json()
        admin_ids = [a["id"] for a in admins]
        assert admin_id not in admin_ids, "Admin should be deleted"
        print(f"  Verified admin no longer exists")


class TestOtherPagesAccess:
    """Test that all pages are accessible"""
    
    def test_vardiyalar_endpoint(self):
        """Vardiyalar endpoint should work"""
        login_resp = requests.post(f"{BASE_URL}/api/auth/admin/login", json={
            "username": "onurertas",
            "password": "Delivery32.."
        })
        company_id = login_resp.json()["company_id"]
        
        response = requests.get(f"{BASE_URL}/api/companies/{company_id}/shifts")
        assert response.status_code == 200, f"Failed: {response.text}"
        print(f"✓ Vardiyalar endpoint works")
    
    def test_muhasebe_endpoint(self):
        """Muhasebe endpoint should work"""
        login_resp = requests.post(f"{BASE_URL}/api/auth/admin/login", json={
            "username": "onurertas",
            "password": "Delivery32.."
        })
        company_id = login_resp.json()["company_id"]
        
        response = requests.get(f"{BASE_URL}/api/companies/{company_id}/accounting-summary")
        assert response.status_code == 200, f"Failed: {response.text}"
        print(f"✓ Muhasebe endpoint works")
    
    def test_zimmet_endpoint(self):
        """Zimmet endpoint should work"""
        login_resp = requests.post(f"{BASE_URL}/api/auth/admin/login", json={
            "username": "onurertas",
            "password": "Delivery32.."
        })
        company_id = login_resp.json()["company_id"]
        
        response = requests.get(f"{BASE_URL}/api/companies/{company_id}/couriers")
        assert response.status_code == 200, f"Failed: {response.text}"
        print(f"✓ Zimmet/Kuryeler endpoint works")


if __name__ == "__main__":
    pytest.main([__file__, "-v", "--tb=short"])
