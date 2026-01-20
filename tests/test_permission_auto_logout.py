"""
Test Permission Auto-Logout Feature
Tests:
1. Permission update should NOT affect password
2. check-permissions endpoint returns updated=True when timestamp differs
3. Superadmin should not be affected by permission updates
"""
import pytest
import requests
import os
import time
from datetime import datetime, timezone

BASE_URL = os.environ.get('REACT_APP_BACKEND_URL', '').rstrip('/')

# Test credentials
SUPERADMIN = {"username": "onurertas", "password": "Delivery32.."}
TEST_ADMIN = {"username": "testpermadmin", "password": "test123"}


class TestPermissionAutoLogout:
    """Test permission update auto-logout feature"""
    
    def test_01_admin_login_before_permission_update(self):
        """Test admin can login with original password"""
        response = requests.post(f"{BASE_URL}/api/auth/admin/login", json=TEST_ADMIN)
        print(f"Login response status: {response.status_code}")
        print(f"Login response: {response.json()}")
        
        assert response.status_code == 200, f"Login failed: {response.text}"
        data = response.json()
        assert data["username"] == TEST_ADMIN["username"]
        assert "permissions_updated_at" in data
        print(f"Initial permissions_updated_at: {data.get('permissions_updated_at')}")
    
    def test_02_superadmin_login(self):
        """Test superadmin can login"""
        response = requests.post(f"{BASE_URL}/api/auth/admin/login", json=SUPERADMIN)
        print(f"Superadmin login status: {response.status_code}")
        
        assert response.status_code == 200, f"Superadmin login failed: {response.text}"
        data = response.json()
        assert data["role"] == "superadmin"
        return data
    
    def test_03_get_admin_id(self):
        """Get test admin ID for permission update"""
        # Login as superadmin to get admin list
        response = requests.get(f"{BASE_URL}/api/admins")
        print(f"Get admins status: {response.status_code}")
        
        assert response.status_code == 200
        admins = response.json()
        
        test_admin = next((a for a in admins if a["username"] == TEST_ADMIN["username"]), None)
        assert test_admin is not None, f"Test admin {TEST_ADMIN['username']} not found"
        
        print(f"Test admin ID: {test_admin['id']}")
        print(f"Test admin current permissions: {test_admin.get('permissions')}")
        return test_admin["id"]
    
    def test_04_check_permissions_before_update(self):
        """Check permissions endpoint before any update"""
        # Get admin ID
        response = requests.get(f"{BASE_URL}/api/admins")
        admins = response.json()
        test_admin = next((a for a in admins if a["username"] == TEST_ADMIN["username"]), None)
        admin_id = test_admin["id"]
        
        # Login to get current timestamp
        login_resp = requests.post(f"{BASE_URL}/api/auth/admin/login", json=TEST_ADMIN)
        current_timestamp = login_resp.json().get("permissions_updated_at", "")
        
        # Check permissions with current timestamp
        check_resp = requests.get(f"{BASE_URL}/api/auth/check-permissions/{admin_id}?timestamp={current_timestamp}")
        print(f"Check permissions status: {check_resp.status_code}")
        print(f"Check permissions response: {check_resp.json()}")
        
        assert check_resp.status_code == 200
        data = check_resp.json()
        assert data["updated"] == False, "Should not be updated when timestamp matches"
    
    def test_05_update_permissions_and_verify_timestamp_changes(self):
        """Update permissions and verify timestamp changes"""
        # Get admin ID
        response = requests.get(f"{BASE_URL}/api/admins")
        admins = response.json()
        test_admin = next((a for a in admins if a["username"] == TEST_ADMIN["username"]), None)
        admin_id = test_admin["id"]
        
        # Get current timestamp before update
        login_before = requests.post(f"{BASE_URL}/api/auth/admin/login", json=TEST_ADMIN)
        timestamp_before = login_before.json().get("permissions_updated_at")
        print(f"Timestamp before update: {timestamp_before}")
        
        # Wait a moment to ensure timestamp difference
        time.sleep(1)
        
        # Update permissions (toggle a permission)
        current_perms = test_admin.get("permissions", {})
        new_perms = current_perms.copy()
        # Toggle sistem permission
        new_perms["sistem"] = not new_perms.get("sistem", False)
        
        update_resp = requests.put(
            f"{BASE_URL}/api/admins/{admin_id}/permissions",
            json={"permissions": new_perms}
        )
        print(f"Update permissions status: {update_resp.status_code}")
        print(f"Update permissions response: {update_resp.json()}")
        
        assert update_resp.status_code == 200
        
        # Get timestamp after update
        login_after = requests.post(f"{BASE_URL}/api/auth/admin/login", json=TEST_ADMIN)
        timestamp_after = login_after.json().get("permissions_updated_at")
        print(f"Timestamp after update: {timestamp_after}")
        
        assert timestamp_after != timestamp_before, "Timestamp should change after permission update"
    
    def test_06_check_permissions_detects_update(self):
        """Check-permissions endpoint should detect update when old timestamp is used"""
        # Get admin ID
        response = requests.get(f"{BASE_URL}/api/admins")
        admins = response.json()
        test_admin = next((a for a in admins if a["username"] == TEST_ADMIN["username"]), None)
        admin_id = test_admin["id"]
        
        # Use an old timestamp
        old_timestamp = "2024-01-01T00:00:00+00:00"
        
        check_resp = requests.get(f"{BASE_URL}/api/auth/check-permissions/{admin_id}?timestamp={old_timestamp}")
        print(f"Check permissions with old timestamp status: {check_resp.status_code}")
        print(f"Check permissions response: {check_resp.json()}")
        
        assert check_resp.status_code == 200
        data = check_resp.json()
        assert data["updated"] == True, "Should detect update when timestamp differs"
        assert "new_timestamp" in data
    
    def test_07_password_not_affected_by_permission_update(self):
        """CRITICAL: Password should NOT be affected by permission update"""
        # Get admin ID
        response = requests.get(f"{BASE_URL}/api/admins")
        admins = response.json()
        test_admin = next((a for a in admins if a["username"] == TEST_ADMIN["username"]), None)
        admin_id = test_admin["id"]
        
        # Update permissions again
        update_resp = requests.put(
            f"{BASE_URL}/api/admins/{admin_id}/permissions",
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
        print(f"Permission update status: {update_resp.status_code}")
        assert update_resp.status_code == 200
        
        # Try to login with SAME password - THIS MUST WORK
        login_resp = requests.post(f"{BASE_URL}/api/auth/admin/login", json=TEST_ADMIN)
        print(f"Login after permission update status: {login_resp.status_code}")
        print(f"Login response: {login_resp.json()}")
        
        assert login_resp.status_code == 200, f"LOGIN FAILED AFTER PERMISSION UPDATE! Password should not be affected. Response: {login_resp.text}"
        data = login_resp.json()
        assert data["username"] == TEST_ADMIN["username"]
        print("SUCCESS: Password not affected by permission update")
    
    def test_08_superadmin_check_permissions_not_applicable(self):
        """Superadmin should not have permissions_updated_at tracking (or it should be ignored)"""
        # Login as superadmin
        login_resp = requests.post(f"{BASE_URL}/api/auth/admin/login", json=SUPERADMIN)
        assert login_resp.status_code == 200
        
        data = login_resp.json()
        print(f"Superadmin role: {data['role']}")
        print(f"Superadmin permissions_updated_at: {data.get('permissions_updated_at')}")
        
        # Superadmin should be role=superadmin
        assert data["role"] == "superadmin"
        # Note: Frontend skips permission check for superadmin (line 62 in AdminDashboard.jsx)
        print("SUCCESS: Superadmin role confirmed - frontend will skip permission check")
    
    def test_09_multiple_permission_updates_same_password(self):
        """Multiple permission updates should not affect password"""
        # Get admin ID
        response = requests.get(f"{BASE_URL}/api/admins")
        admins = response.json()
        test_admin = next((a for a in admins if a["username"] == TEST_ADMIN["username"]), None)
        admin_id = test_admin["id"]
        
        # Do 3 permission updates
        for i in range(3):
            update_resp = requests.put(
                f"{BASE_URL}/api/admins/{admin_id}/permissions",
                json={"permissions": {
                    "vardiya": True,
                    "muhasebe": True,
                    "zimmet": True,
                    "kuryeler": True,
                    "market": i % 2 == 0,  # Toggle
                    "akademi": False,
                    "sistem": False
                }}
            )
            print(f"Permission update {i+1} status: {update_resp.status_code}")
            assert update_resp.status_code == 200
            time.sleep(0.5)
        
        # Login should still work with same password
        login_resp = requests.post(f"{BASE_URL}/api/auth/admin/login", json=TEST_ADMIN)
        print(f"Login after 3 permission updates status: {login_resp.status_code}")
        
        assert login_resp.status_code == 200, f"LOGIN FAILED AFTER MULTIPLE PERMISSION UPDATES! Response: {login_resp.text}"
        print("SUCCESS: Password still works after multiple permission updates")


class TestCheckPermissionsEndpoint:
    """Test the check-permissions endpoint specifically"""
    
    def test_check_permissions_with_no_timestamp(self):
        """Check permissions with no timestamp parameter"""
        # Get admin ID
        response = requests.get(f"{BASE_URL}/api/admins")
        admins = response.json()
        test_admin = next((a for a in admins if a["username"] == TEST_ADMIN["username"]), None)
        admin_id = test_admin["id"]
        
        check_resp = requests.get(f"{BASE_URL}/api/auth/check-permissions/{admin_id}")
        print(f"Check permissions (no timestamp) status: {check_resp.status_code}")
        print(f"Response: {check_resp.json()}")
        
        assert check_resp.status_code == 200
        data = check_resp.json()
        assert "updated" in data
        # With no timestamp, should return updated=False
        assert data["updated"] == False
    
    def test_check_permissions_with_matching_timestamp(self):
        """Check permissions with matching timestamp should return updated=False"""
        # Get admin ID and current timestamp
        response = requests.get(f"{BASE_URL}/api/admins")
        admins = response.json()
        test_admin = next((a for a in admins if a["username"] == TEST_ADMIN["username"]), None)
        admin_id = test_admin["id"]
        
        # Login to get current timestamp
        login_resp = requests.post(f"{BASE_URL}/api/auth/admin/login", json=TEST_ADMIN)
        current_timestamp = login_resp.json().get("permissions_updated_at", "")
        
        check_resp = requests.get(f"{BASE_URL}/api/auth/check-permissions/{admin_id}?timestamp={current_timestamp}")
        print(f"Check permissions (matching timestamp) status: {check_resp.status_code}")
        print(f"Response: {check_resp.json()}")
        
        assert check_resp.status_code == 200
        data = check_resp.json()
        assert data["updated"] == False
    
    def test_check_permissions_invalid_admin_id(self):
        """Check permissions with invalid admin ID should return 404"""
        check_resp = requests.get(f"{BASE_URL}/api/auth/check-permissions/invalid-id-12345")
        print(f"Check permissions (invalid ID) status: {check_resp.status_code}")
        
        assert check_resp.status_code == 404


if __name__ == "__main__":
    pytest.main([__file__, "-v"])
