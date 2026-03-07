"""
Test suite for Kuryeler (Couriers) Page Features
Tests: Search, Detail Modal, Add/Remove Courier functionality
"""
import pytest
import requests
import os
import uuid

BASE_URL = os.environ.get('REACT_APP_BACKEND_URL', 'https://break-queue-auto.preview.emergentagent.com')

# Test credentials
SUPER_ADMIN_USERNAME = "onurertas"
SUPER_ADMIN_PASSWORD = "Delivery32.."
COMPANY_ID = "e1c50cea-307e-4889-b33b-4b22e467b0b4"
TEST_COURIER_PHONE = "05321234567"


class TestAdminLogin:
    """Test admin authentication"""
    
    def test_admin_login_success(self):
        """Test super admin login with valid credentials"""
        response = requests.post(
            f"{BASE_URL}/api/auth/admin/login",
            json={"username": SUPER_ADMIN_USERNAME, "password": SUPER_ADMIN_PASSWORD}
        )
        assert response.status_code == 200
        data = response.json()
        assert data["username"] == SUPER_ADMIN_USERNAME
        assert data["role"] == "superadmin"
        assert data["company_id"] == COMPANY_ID
        assert "permissions" in data
        assert data["permissions"]["kuryeler"] == True
        print(f"✓ Admin login successful: {data['name']}")
    
    def test_admin_login_invalid_credentials(self):
        """Test admin login with invalid credentials"""
        response = requests.post(
            f"{BASE_URL}/api/auth/admin/login",
            json={"username": "wronguser", "password": "wrongpass"}
        )
        assert response.status_code == 401
        print("✓ Invalid credentials rejected correctly")


class TestCourierSearch:
    """Test courier search functionality"""
    
    def test_search_courier_by_phone(self):
        """Test searching courier by phone number"""
        response = requests.get(f"{BASE_URL}/api/couriers/search?phone={TEST_COURIER_PHONE}")
        assert response.status_code == 200
        data = response.json()
        assert data["phone"] == TEST_COURIER_PHONE
        assert "name" in data
        assert "plate" in data
        assert "address" in data
        assert "iban" in data
        assert "created_at" in data
        print(f"✓ Courier search successful: {data['name']}")
    
    def test_search_courier_not_found(self):
        """Test searching for non-existent courier"""
        response = requests.get(f"{BASE_URL}/api/couriers/search?phone=05999999999")
        assert response.status_code == 404
        print("✓ Non-existent courier returns 404")


class TestCompanyCouriers:
    """Test company courier management"""
    
    def test_get_company_couriers(self):
        """Test getting couriers for a company"""
        response = requests.get(f"{BASE_URL}/api/companies/{COMPANY_ID}/couriers")
        assert response.status_code == 200
        data = response.json()
        assert isinstance(data, list)
        
        # Check if test courier is in the list
        courier_found = False
        for courier in data:
            if courier["phone"] == TEST_COURIER_PHONE:
                courier_found = True
                # Verify all required fields for detail modal
                assert "id" in courier
                assert "name" in courier
                assert "phone" in courier
                assert "plate" in courier
                assert "address" in courier
                assert "iban" in courier
                assert "created_at" in courier
                print(f"✓ Courier details verified: {courier['name']}")
                break
        
        assert courier_found, "Test courier should be in company couriers list"
        print(f"✓ Company couriers retrieved: {len(data)} couriers")
    
    def test_courier_detail_fields(self):
        """Test that courier has all fields needed for detail modal"""
        response = requests.get(f"{BASE_URL}/api/companies/{COMPANY_ID}/couriers")
        assert response.status_code == 200
        couriers = response.json()
        
        if len(couriers) > 0:
            courier = couriers[0]
            required_fields = ["id", "name", "phone", "plate", "address", "iban", "created_at"]
            for field in required_fields:
                assert field in courier, f"Missing field: {field}"
            print(f"✓ All detail modal fields present: {required_fields}")


class TestAddRemoveCourier:
    """Test adding and removing couriers from company"""
    
    def test_add_courier_to_company_flow(self):
        """Test the full flow of adding a courier to company"""
        # First, create a new test courier
        unique_phone = f"0590{str(uuid.uuid4())[:7].replace('-', '')}"
        
        register_response = requests.post(
            f"{BASE_URL}/api/auth/courier/register",
            json={
                "name": "Test Kurye Ekleme",
                "phone": unique_phone,
                "address": "Test Adres",
                "iban": "TR000000000000000000000000",
                "plate": "34TEST99",
                "password": "test123"
            }
        )
        
        if register_response.status_code == 200:
            # Now add this courier to company
            add_response = requests.post(
                f"{BASE_URL}/api/companies/{COMPANY_ID}/couriers",
                json={"phone": unique_phone}
            )
            assert add_response.status_code == 200
            print(f"✓ Courier added to company: {unique_phone}")
            
            # Verify courier is in company list
            list_response = requests.get(f"{BASE_URL}/api/companies/{COMPANY_ID}/couriers")
            couriers = list_response.json()
            courier_found = any(c["phone"] == unique_phone for c in couriers)
            assert courier_found, "Added courier should appear in company list"
            print("✓ Courier verified in company list")
            
            # Get courier ID for removal
            courier_id = next(c["id"] for c in couriers if c["phone"] == unique_phone)
            
            # Remove courier from company
            remove_response = requests.delete(
                f"{BASE_URL}/api/companies/{COMPANY_ID}/couriers/{courier_id}"
            )
            assert remove_response.status_code == 200
            print("✓ Courier removed from company")
            
            # Verify courier is no longer in company list
            list_response2 = requests.get(f"{BASE_URL}/api/companies/{COMPANY_ID}/couriers")
            couriers2 = list_response2.json()
            courier_still_there = any(c["phone"] == unique_phone for c in couriers2)
            assert not courier_still_there, "Removed courier should not appear in company list"
            print("✓ Courier removal verified")
        else:
            print(f"Note: Could not create test courier (may already exist)")
    
    def test_add_nonexistent_courier(self):
        """Test adding a non-existent courier to company"""
        response = requests.post(
            f"{BASE_URL}/api/companies/{COMPANY_ID}/couriers",
            json={"phone": "05999999999"}
        )
        assert response.status_code == 404
        print("✓ Adding non-existent courier returns 404")
    
    def test_add_duplicate_courier(self):
        """Test adding a courier that's already in the company"""
        response = requests.post(
            f"{BASE_URL}/api/companies/{COMPANY_ID}/couriers",
            json={"phone": TEST_COURIER_PHONE}
        )
        assert response.status_code == 400
        print("✓ Adding duplicate courier returns 400")


class TestFilterFunctionality:
    """Test courier filtering by name or plate"""
    
    def test_filter_data_available(self):
        """Verify couriers have name and plate fields for filtering"""
        response = requests.get(f"{BASE_URL}/api/companies/{COMPANY_ID}/couriers")
        assert response.status_code == 200
        couriers = response.json()
        
        for courier in couriers:
            assert "name" in courier, "Courier must have name for filtering"
            assert "plate" in courier, "Courier must have plate for filtering"
        
        print(f"✓ All {len(couriers)} couriers have name and plate fields for filtering")


class TestAPIHealth:
    """Test API health and basic endpoints"""
    
    def test_api_health(self):
        """Test API root endpoint"""
        response = requests.get(f"{BASE_URL}/api/")
        assert response.status_code == 200
        data = response.json()
        assert "message" in data
        print(f"✓ API health check passed: {data['message']}")
    
    def test_get_all_couriers(self):
        """Test getting all couriers (system admin endpoint)"""
        response = requests.get(f"{BASE_URL}/api/couriers")
        assert response.status_code == 200
        data = response.json()
        assert isinstance(data, list)
        print(f"✓ All couriers endpoint working: {len(data)} couriers")


if __name__ == "__main__":
    pytest.main([__file__, "-v", "--tb=short"])
