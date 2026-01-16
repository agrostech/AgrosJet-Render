"""
Test Profile Management and Session Check Features
- Profile update endpoint (/api/profile/{admin_id})
- Session check endpoint (/api/session/check/{user_id})
- Session invalidation on admin delete
"""
import pytest
import requests
import os
import uuid

BASE_URL = os.environ.get('REACT_APP_BACKEND_URL', '').rstrip('/')

class TestSessionCheck:
    """Session check endpoint tests"""
    
    def test_session_check_valid_user(self):
        """Test session check for existing user"""
        # First login to get a valid user ID
        login_response = requests.post(f"{BASE_URL}/api/auth/admin/login", json={
            "username": "onurertas",
            "password": "Delivery32.."
        })
        assert login_response.status_code == 200, f"Login failed: {login_response.text}"
        user_data = login_response.json()
        user_id = user_data["id"]
        
        # Check session validity
        response = requests.get(f"{BASE_URL}/api/session/check/{user_id}")
        assert response.status_code == 200
        data = response.json()
        assert "valid" in data
        print(f"Session check response: {data}")
    
    def test_session_check_nonexistent_user(self):
        """Test session check for non-existent user"""
        fake_user_id = str(uuid.uuid4())
        response = requests.get(f"{BASE_URL}/api/session/check/{fake_user_id}")
        assert response.status_code == 200
        data = response.json()
        assert data["valid"] == False
        assert data["reason"] == "user_deleted"
        print(f"Non-existent user session check: {data}")


class TestProfileUpdate:
    """Profile update endpoint tests"""
    
    @pytest.fixture
    def admin_user(self):
        """Login and get admin user data"""
        response = requests.post(f"{BASE_URL}/api/auth/admin/login", json={
            "username": "onurertas",
            "password": "Delivery32.."
        })
        assert response.status_code == 200
        return response.json()
    
    def test_profile_update_wrong_current_password(self, admin_user):
        """Test profile update with wrong current password"""
        response = requests.put(f"{BASE_URL}/api/profile/{admin_user['id']}", json={
            "current_password": "wrongpassword",
            "username": "newusername"
        })
        assert response.status_code == 401
        data = response.json()
        assert "detail" in data
        assert "şifre" in data["detail"].lower() or "password" in data["detail"].lower()
        print(f"Wrong password response: {data}")
    
    def test_profile_update_no_changes(self, admin_user):
        """Test profile update with no actual changes"""
        response = requests.put(f"{BASE_URL}/api/profile/{admin_user['id']}", json={
            "current_password": "Delivery32.."
        })
        # Should return 400 because no changes provided
        assert response.status_code == 400
        print(f"No changes response: {response.json()}")
    
    def test_profile_update_username_already_exists(self, admin_user):
        """Test profile update with existing username"""
        # Try to change to systemadmin username (which exists)
        response = requests.put(f"{BASE_URL}/api/profile/{admin_user['id']}", json={
            "current_password": "Delivery32..",
            "username": "systemadmin"
        })
        assert response.status_code == 400
        data = response.json()
        assert "kullanılıyor" in data["detail"].lower() or "exists" in data["detail"].lower()
        print(f"Username exists response: {data}")
    
    def test_profile_update_nonexistent_user(self):
        """Test profile update for non-existent user"""
        fake_user_id = str(uuid.uuid4())
        response = requests.put(f"{BASE_URL}/api/profile/{fake_user_id}", json={
            "current_password": "anypassword",
            "username": "newusername"
        })
        assert response.status_code == 404
        print(f"Non-existent user profile update: {response.json()}")


class TestAdminDeleteSessionInvalidation:
    """Test that deleting an admin creates session invalidation record"""
    
    def test_admin_delete_creates_invalidation(self):
        """Test that deleting admin creates session invalidation"""
        # First login as super admin
        login_response = requests.post(f"{BASE_URL}/api/auth/admin/login", json={
            "username": "onurertas",
            "password": "Delivery32.."
        })
        assert login_response.status_code == 200
        super_admin = login_response.json()
        company_id = super_admin["company_id"]
        
        # Create a test admin
        test_admin_username = f"TEST_admin_{uuid.uuid4().hex[:8]}"
        create_response = requests.post(f"{BASE_URL}/api/admins", json={
            "name": "Test Admin For Delete",
            "username": test_admin_username,
            "password": "TestPass123!",
            "company_id": company_id
        })
        assert create_response.status_code == 200, f"Failed to create admin: {create_response.text}"
        admin_id = create_response.json()["id"]
        print(f"Created test admin: {admin_id}")
        
        # Verify admin can login
        admin_login = requests.post(f"{BASE_URL}/api/auth/admin/login", json={
            "username": test_admin_username,
            "password": "TestPass123!"
        })
        assert admin_login.status_code == 200
        
        # Check session is valid before delete
        session_before = requests.get(f"{BASE_URL}/api/session/check/{admin_id}")
        assert session_before.status_code == 200
        assert session_before.json()["valid"] == True
        print(f"Session before delete: {session_before.json()}")
        
        # Delete the admin
        delete_response = requests.delete(f"{BASE_URL}/api/admins/{admin_id}")
        assert delete_response.status_code == 200
        delete_data = delete_response.json()
        assert "invalidated_user_id" in delete_data
        assert delete_data["invalidated_user_id"] == admin_id
        print(f"Delete response: {delete_data}")
        
        # Check session is now invalid
        session_after = requests.get(f"{BASE_URL}/api/session/check/{admin_id}")
        assert session_after.status_code == 200
        session_data = session_after.json()
        assert session_data["valid"] == False
        # Could be either user_deleted or session_invalidated
        assert session_data["reason"] in ["user_deleted", "session_invalidated"]
        print(f"Session after delete: {session_data}")


class TestProfileUpdateWithRelogin:
    """Test profile update that requires relogin"""
    
    def test_profile_update_username_requires_relogin(self):
        """Test that username change requires relogin"""
        # Login as super admin
        login_response = requests.post(f"{BASE_URL}/api/auth/admin/login", json={
            "username": "onurertas",
            "password": "Delivery32.."
        })
        assert login_response.status_code == 200
        super_admin = login_response.json()
        company_id = super_admin["company_id"]
        
        # Create a test admin for profile update test
        test_username = f"TEST_profile_{uuid.uuid4().hex[:8]}"
        create_response = requests.post(f"{BASE_URL}/api/admins", json={
            "name": "Test Profile Admin",
            "username": test_username,
            "password": "TestPass123!",
            "company_id": company_id
        })
        assert create_response.status_code == 200
        admin_id = create_response.json()["id"]
        print(f"Created test admin for profile update: {admin_id}")
        
        # Update username
        new_username = f"TEST_updated_{uuid.uuid4().hex[:8]}"
        update_response = requests.put(f"{BASE_URL}/api/profile/{admin_id}", json={
            "current_password": "TestPass123!",
            "username": new_username
        })
        assert update_response.status_code == 200
        update_data = update_response.json()
        assert update_data["requires_relogin"] == True
        assert update_data["new_username"] == new_username
        print(f"Profile update response: {update_data}")
        
        # Verify session is invalidated
        session_check = requests.get(f"{BASE_URL}/api/session/check/{admin_id}")
        assert session_check.status_code == 200
        session_data = session_check.json()
        assert session_data["valid"] == False
        print(f"Session after profile update: {session_data}")
        
        # Verify can login with new username
        new_login = requests.post(f"{BASE_URL}/api/auth/admin/login", json={
            "username": new_username,
            "password": "TestPass123!"
        })
        assert new_login.status_code == 200
        print(f"Login with new username successful")
        
        # Cleanup - delete the test admin
        requests.delete(f"{BASE_URL}/api/admins/{admin_id}")
        print(f"Cleaned up test admin")


class TestClearSessionInvalidation:
    """Test clearing session invalidation after relogin"""
    
    def test_clear_invalidation_endpoint(self):
        """Test the clear invalidation endpoint"""
        test_user_id = str(uuid.uuid4())
        
        # Clear invalidation (should work even if no record exists)
        response = requests.delete(f"{BASE_URL}/api/session/invalidation/{test_user_id}")
        assert response.status_code == 200
        data = response.json()
        assert "message" in data
        print(f"Clear invalidation response: {data}")


if __name__ == "__main__":
    pytest.main([__file__, "-v", "--tb=short"])
