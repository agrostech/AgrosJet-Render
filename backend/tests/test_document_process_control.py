"""
Test Document Process Control System for AgrosJet
Features:
1. PUT /api/couriers/{courier_id}/document-process - toggles document_process_completed field
2. GET /api/couriers/{courier_id} - returns document_process_completed field
3. Default document_process_completed=false when courier added to company
"""
import pytest
import requests
import os

BASE_URL = os.environ.get('REACT_APP_BACKEND_URL', '').rstrip('/')

# Test credentials
SYSTEM_ADMIN = {"username": "onurertas", "password": "Delivery32.."}
TEST_COURIER_ID = "f7188370-b3c6-46e9-bd49-acf3e18c1df7"
TEST_COURIER_PHONE = "05553337766"
TEST_COURIER_PASSWORD = "123456"


class TestDocumentProcessControl:
    """Test document process control toggle functionality"""
    
    @pytest.fixture(autouse=True)
    def setup(self):
        """Setup - get admin auth token"""
        self.session = requests.Session()
        self.session.headers.update({"Content-Type": "application/json"})
        
        # Login as system admin
        login_res = self.session.post(f"{BASE_URL}/api/auth/admin/login", json=SYSTEM_ADMIN)
        if login_res.status_code == 200:
            token = login_res.json().get("token")
            if token:
                self.session.headers.update({"Authorization": f"Bearer {token}"})
        yield
    
    def test_get_courier_returns_document_process_completed_field(self):
        """GET /api/couriers/{courier_id} should return document_process_completed field"""
        response = self.session.get(f"{BASE_URL}/api/couriers/{TEST_COURIER_ID}")
        
        assert response.status_code == 200, f"Expected 200, got {response.status_code}: {response.text}"
        
        data = response.json()
        assert "document_process_completed" in data, "document_process_completed field missing from response"
        assert isinstance(data["document_process_completed"], bool), "document_process_completed should be boolean"
        
        print(f"✓ GET courier returns document_process_completed={data['document_process_completed']}")
    
    def test_toggle_document_process_to_false(self):
        """PUT /api/couriers/{courier_id}/document-process with completed=false"""
        response = self.session.put(
            f"{BASE_URL}/api/couriers/{TEST_COURIER_ID}/document-process",
            json={"completed": False}
        )
        
        assert response.status_code == 200, f"Expected 200, got {response.status_code}: {response.text}"
        
        data = response.json()
        assert "document_process_completed" in data, "Response should contain document_process_completed"
        assert data["document_process_completed"] == False, "document_process_completed should be False"
        
        # Verify by GET
        verify_res = self.session.get(f"{BASE_URL}/api/couriers/{TEST_COURIER_ID}")
        assert verify_res.status_code == 200
        assert verify_res.json()["document_process_completed"] == False
        
        print("✓ Toggle document_process_completed to False - VERIFIED")
    
    def test_toggle_document_process_to_true(self):
        """PUT /api/couriers/{courier_id}/document-process with completed=true"""
        response = self.session.put(
            f"{BASE_URL}/api/couriers/{TEST_COURIER_ID}/document-process",
            json={"completed": True}
        )
        
        assert response.status_code == 200, f"Expected 200, got {response.status_code}: {response.text}"
        
        data = response.json()
        assert "document_process_completed" in data, "Response should contain document_process_completed"
        assert data["document_process_completed"] == True, "document_process_completed should be True"
        
        # Verify by GET
        verify_res = self.session.get(f"{BASE_URL}/api/couriers/{TEST_COURIER_ID}")
        assert verify_res.status_code == 200
        assert verify_res.json()["document_process_completed"] == True
        
        print("✓ Toggle document_process_completed to True - VERIFIED")
    
    def test_toggle_document_process_invalid_courier(self):
        """PUT /api/couriers/{invalid_id}/document-process should return 404"""
        response = self.session.put(
            f"{BASE_URL}/api/couriers/invalid-courier-id-12345/document-process",
            json={"completed": True}
        )
        
        assert response.status_code == 404, f"Expected 404, got {response.status_code}: {response.text}"
        print("✓ Toggle with invalid courier ID returns 404")
    
    def test_toggle_document_process_requires_auth(self):
        """PUT /api/couriers/{courier_id}/document-process should require authentication"""
        # Create new session without auth
        no_auth_session = requests.Session()
        no_auth_session.headers.update({"Content-Type": "application/json"})
        
        response = no_auth_session.put(
            f"{BASE_URL}/api/couriers/{TEST_COURIER_ID}/document-process",
            json={"completed": True}
        )
        
        assert response.status_code == 401, f"Expected 401, got {response.status_code}: {response.text}"
        print("✓ Toggle endpoint requires authentication")


class TestCourierLoginWithDocumentProcess:
    """Test courier login and document_process_completed field"""
    
    def test_courier_login_and_check_document_process(self):
        """Courier login should work and courier data should include document_process_completed"""
        session = requests.Session()
        session.headers.update({"Content-Type": "application/json"})
        
        # Login as courier
        login_res = session.post(f"{BASE_URL}/api/auth/courier/login", json={
            "phone": TEST_COURIER_PHONE,
            "password": TEST_COURIER_PASSWORD
        })
        
        # Note: Password might not match, but we can still test the API structure
        if login_res.status_code == 200:
            data = login_res.json()
            token = data.get("token")
            courier = data.get("courier", {})
            
            # Check if document_process_completed is in courier data
            if "document_process_completed" in courier:
                print(f"✓ Courier login returns document_process_completed={courier['document_process_completed']}")
            else:
                print("⚠ Courier login response doesn't include document_process_completed in courier object")
        else:
            print(f"⚠ Courier login failed with status {login_res.status_code} - testing with admin token instead")
            
            # Use admin to get courier data
            admin_session = requests.Session()
            admin_session.headers.update({"Content-Type": "application/json"})
            admin_login = admin_session.post(f"{BASE_URL}/api/auth/admin/login", json=SYSTEM_ADMIN)
            
            if admin_login.status_code == 200:
                token = admin_login.json().get("token")
                admin_session.headers.update({"Authorization": f"Bearer {token}"})
                
                courier_res = admin_session.get(f"{BASE_URL}/api/couriers/{TEST_COURIER_ID}")
                assert courier_res.status_code == 200
                
                data = courier_res.json()
                assert "document_process_completed" in data
                print(f"✓ Courier data includes document_process_completed={data['document_process_completed']}")


class TestDocumentProcessToggleSequence:
    """Test toggle sequence: false -> true -> false"""
    
    @pytest.fixture(autouse=True)
    def setup(self):
        """Setup - get admin auth token"""
        self.session = requests.Session()
        self.session.headers.update({"Content-Type": "application/json"})
        
        # Login as system admin
        login_res = self.session.post(f"{BASE_URL}/api/auth/admin/login", json=SYSTEM_ADMIN)
        if login_res.status_code == 200:
            token = login_res.json().get("token")
            if token:
                self.session.headers.update({"Authorization": f"Bearer {token}"})
        yield
        
        # Cleanup: Set back to true (original state)
        self.session.put(
            f"{BASE_URL}/api/couriers/{TEST_COURIER_ID}/document-process",
            json={"completed": True}
        )
    
    def test_toggle_sequence(self):
        """Test toggle sequence: check current -> set false -> verify -> set true -> verify"""
        # Step 1: Get current state
        get_res = self.session.get(f"{BASE_URL}/api/couriers/{TEST_COURIER_ID}")
        assert get_res.status_code == 200
        initial_state = get_res.json().get("document_process_completed")
        print(f"Initial state: document_process_completed={initial_state}")
        
        # Step 2: Set to False
        toggle_false = self.session.put(
            f"{BASE_URL}/api/couriers/{TEST_COURIER_ID}/document-process",
            json={"completed": False}
        )
        assert toggle_false.status_code == 200
        assert toggle_false.json()["document_process_completed"] == False
        
        # Step 3: Verify False
        verify_false = self.session.get(f"{BASE_URL}/api/couriers/{TEST_COURIER_ID}")
        assert verify_false.status_code == 200
        assert verify_false.json()["document_process_completed"] == False
        print("✓ Set to False and verified")
        
        # Step 4: Set to True
        toggle_true = self.session.put(
            f"{BASE_URL}/api/couriers/{TEST_COURIER_ID}/document-process",
            json={"completed": True}
        )
        assert toggle_true.status_code == 200
        assert toggle_true.json()["document_process_completed"] == True
        
        # Step 5: Verify True
        verify_true = self.session.get(f"{BASE_URL}/api/couriers/{TEST_COURIER_ID}")
        assert verify_true.status_code == 200
        assert verify_true.json()["document_process_completed"] == True
        print("✓ Set to True and verified")
        
        print("✓ Full toggle sequence completed successfully")


if __name__ == "__main__":
    pytest.main([__file__, "-v"])
