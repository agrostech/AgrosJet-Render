"""
Test suite for Refactored Couriers and Invoices APIs
Tests: Courier CRUD, Active/Inactive tabs, Edit modal, Invoice endpoints
Refactoring: couriers.py (474→137 lines), courier_service.py (313 lines)
"""
import pytest
import requests
import os

BASE_URL = os.environ.get('REACT_APP_BACKEND_URL', 'https://delivery-analytics-2.preview.emergentagent.com')

# Test credentials
SUPER_ADMIN_USERNAME = "onurertas"
SUPER_ADMIN_PASSWORD = "Delivery32.."
COMPANY_ID = "e1c50cea-307e-4889-b33b-4b22e467b0b4"


class TestCourierEndpoints:
    """Test refactored courier endpoints - couriers.py router"""
    
    def test_get_company_couriers_active(self):
        """GET /api/companies/{company_id}/couriers - Get active couriers"""
        response = requests.get(f"{BASE_URL}/api/companies/{COMPANY_ID}/couriers")
        assert response.status_code == 200
        data = response.json()
        assert isinstance(data, list)
        
        # Verify courier structure
        if len(data) > 0:
            courier = data[0]
            assert "id" in courier
            assert "name" in courier
            assert "phone" in courier
            assert "plate" in courier
            # Check for company_status from relation
            assert "company_status" in courier
            print(f"✓ Active couriers retrieved: {len(data)} couriers")
        else:
            print("✓ Active couriers endpoint working (no couriers)")
    
    def test_get_company_couriers_inactive(self):
        """GET /api/companies/{company_id}/couriers/inactive - Get inactive couriers"""
        response = requests.get(f"{BASE_URL}/api/companies/{COMPANY_ID}/couriers/inactive")
        assert response.status_code == 200
        data = response.json()
        assert isinstance(data, list)
        
        # Verify inactive courier structure
        if len(data) > 0:
            courier = data[0]
            assert "id" in courier
            assert "name" in courier
            assert "is_active" in courier
            assert courier["is_active"] == False
            print(f"✓ Inactive couriers retrieved: {len(data)} couriers")
        else:
            print("✓ Inactive couriers endpoint working (no inactive couriers)")
    
    def test_search_courier_by_phone(self):
        """GET /api/couriers/search - Search courier by phone"""
        # First get a courier to search for
        couriers_response = requests.get(f"{BASE_URL}/api/companies/{COMPANY_ID}/couriers")
        couriers = couriers_response.json()
        
        if len(couriers) > 0:
            test_phone = couriers[0]["phone"]
            response = requests.get(f"{BASE_URL}/api/couriers/search?phone={test_phone}")
            assert response.status_code == 200
            data = response.json()
            assert data["phone"] == test_phone
            assert "name" in data
            assert "plate" in data
            print(f"✓ Courier search successful: {data['name']}")
        else:
            pytest.skip("No couriers available for search test")
    
    def test_search_courier_not_found(self):
        """GET /api/couriers/search - Non-existent phone returns 404"""
        response = requests.get(f"{BASE_URL}/api/couriers/search?phone=05999999999")
        assert response.status_code == 404
        print("✓ Non-existent courier returns 404")
    
    def test_get_all_couriers(self):
        """GET /api/couriers - Get all couriers (system admin)"""
        response = requests.get(f"{BASE_URL}/api/couriers")
        assert response.status_code == 200
        data = response.json()
        assert isinstance(data, list)
        print(f"✓ All couriers endpoint working: {len(data)} couriers")


class TestCourierUpdate:
    """Test courier update endpoint - PUT /api/couriers/{courier_id}"""
    
    def test_update_courier_name(self):
        """PUT /api/couriers/{courier_id} - Update courier name"""
        # Get a courier to update
        couriers_response = requests.get(f"{BASE_URL}/api/companies/{COMPANY_ID}/couriers")
        couriers = couriers_response.json()
        
        if len(couriers) > 0:
            courier = couriers[0]
            original_name = courier["name"]
            
            # Update name
            response = requests.put(
                f"{BASE_URL}/api/couriers/{courier['id']}",
                json={"name": original_name}  # Keep same name to not break data
            )
            assert response.status_code == 200
            data = response.json()
            assert "message" in data
            print(f"✓ Courier update endpoint working")
        else:
            pytest.skip("No couriers available for update test")
    
    def test_update_courier_plate(self):
        """PUT /api/couriers/{courier_id} - Update courier plate"""
        couriers_response = requests.get(f"{BASE_URL}/api/companies/{COMPANY_ID}/couriers")
        couriers = couriers_response.json()
        
        if len(couriers) > 0:
            courier = couriers[0]
            original_plate = courier.get("plate", "")
            
            # Update plate (keep same to not break data)
            response = requests.put(
                f"{BASE_URL}/api/couriers/{courier['id']}",
                json={"plate": original_plate}
            )
            assert response.status_code == 200
            print(f"✓ Courier plate update working")
        else:
            pytest.skip("No couriers available for plate update test")
    
    def test_update_courier_not_found(self):
        """PUT /api/couriers/{courier_id} - Non-existent courier returns 404"""
        response = requests.put(
            f"{BASE_URL}/api/couriers/non-existent-id",
            json={"name": "Test"}
        )
        assert response.status_code == 404
        print("✓ Non-existent courier update returns 404")
    
    def test_update_courier_no_data(self):
        """PUT /api/couriers/{courier_id} - Empty update returns error"""
        couriers_response = requests.get(f"{BASE_URL}/api/companies/{COMPANY_ID}/couriers")
        couriers = couriers_response.json()
        
        if len(couriers) > 0:
            courier = couriers[0]
            response = requests.put(
                f"{BASE_URL}/api/couriers/{courier['id']}",
                json={}
            )
            # Should return 400 for no data to update
            assert response.status_code == 400
            print("✓ Empty update returns 400")
        else:
            pytest.skip("No couriers available")


class TestCourierActivation:
    """Test courier activation/deactivation endpoints"""
    
    def test_deactivate_activate_flow(self):
        """Test deactivate and activate courier flow"""
        # Get active couriers
        couriers_response = requests.get(f"{BASE_URL}/api/companies/{COMPANY_ID}/couriers")
        couriers = couriers_response.json()
        
        if len(couriers) > 0:
            # Find a courier without balance/zimmet issues
            # Just test the endpoint response format
            courier = couriers[0]
            
            # Try to deactivate - may fail due to balance/zimmet
            deactivate_response = requests.put(
                f"{BASE_URL}/api/companies/{COMPANY_ID}/couriers/{courier['id']}/deactivate"
            )
            
            # Either 200 (success) or 400 (has balance/zimmet)
            assert deactivate_response.status_code in [200, 400]
            
            if deactivate_response.status_code == 200:
                print(f"✓ Courier deactivated successfully")
                
                # Activate back
                activate_response = requests.put(
                    f"{BASE_URL}/api/companies/{COMPANY_ID}/couriers/{courier['id']}/activate"
                )
                assert activate_response.status_code == 200
                print(f"✓ Courier activated successfully")
            else:
                data = deactivate_response.json()
                print(f"✓ Deactivation blocked (expected): {data.get('detail', 'balance/zimmet issue')}")
        else:
            pytest.skip("No couriers available")


class TestTerminationEndpoints:
    """Test termination (fesih) endpoints"""
    
    def test_termination_status(self):
        """GET /api/couriers/{courier_id}/termination-status"""
        couriers_response = requests.get(f"{BASE_URL}/api/companies/{COMPANY_ID}/couriers")
        couriers = couriers_response.json()
        
        if len(couriers) > 0:
            courier = couriers[0]
            response = requests.get(
                f"{BASE_URL}/api/couriers/{courier['id']}/termination-status?company_id={COMPANY_ID}"
            )
            assert response.status_code == 200
            data = response.json()
            assert "has_termination" in data
            print(f"✓ Termination status endpoint working: has_termination={data['has_termination']}")
        else:
            pytest.skip("No couriers available")


class TestInvoiceEndpoints:
    """Test invoice endpoints - /api/invoices"""
    
    def test_get_company_invoices(self):
        """GET /api/invoices/company/{company_id} - Get company invoices"""
        response = requests.get(f"{BASE_URL}/api/invoices/company/{COMPANY_ID}")
        assert response.status_code == 200
        data = response.json()
        assert isinstance(data, list)
        print(f"✓ Company invoices retrieved: {len(data)} invoices")
    
    def test_get_company_invoices_with_month_filter(self):
        """GET /api/invoices/company/{company_id}?year=2025&month=1 - Filter by month"""
        response = requests.get(
            f"{BASE_URL}/api/invoices/company/{COMPANY_ID}?year=2025&month=1"
        )
        assert response.status_code == 200
        data = response.json()
        assert isinstance(data, list)
        print(f"✓ Company invoices with month filter: {len(data)} invoices")
    
    def test_get_couriers_invoice_summary(self):
        """GET /api/invoices/company/{company_id}/couriers-summary - Get courier summary"""
        response = requests.get(
            f"{BASE_URL}/api/invoices/company/{COMPANY_ID}/couriers-summary"
        )
        assert response.status_code == 200
        data = response.json()
        assert isinstance(data, list)
        
        # Verify summary structure
        if len(data) > 0:
            summary = data[0]
            assert "courier_id" in summary
            assert "courier_name" in summary
            assert "invoice_count" in summary
            print(f"✓ Couriers invoice summary: {len(data)} couriers")
        else:
            print("✓ Couriers invoice summary endpoint working (no data)")
    
    def test_get_couriers_invoice_summary_with_month(self):
        """GET /api/invoices/company/{company_id}/couriers-summary?year=2025&month=1"""
        response = requests.get(
            f"{BASE_URL}/api/invoices/company/{COMPANY_ID}/couriers-summary?year=2025&month=1"
        )
        assert response.status_code == 200
        data = response.json()
        assert isinstance(data, list)
        print(f"✓ Couriers invoice summary with month filter: {len(data)} couriers")
    
    def test_get_missing_invoices(self):
        """GET /api/invoices/company/{company_id}/missing - Get missing invoices"""
        response = requests.get(
            f"{BASE_URL}/api/invoices/company/{COMPANY_ID}/missing"
        )
        assert response.status_code == 200
        data = response.json()
        assert isinstance(data, list)
        print(f"✓ Missing invoices endpoint: {len(data)} missing")


class TestCourierInvoices:
    """Test courier-specific invoice endpoints"""
    
    def test_get_courier_invoices(self):
        """GET /api/invoices/courier/{courier_id} - Get courier invoices"""
        # Get a courier first
        couriers_response = requests.get(f"{BASE_URL}/api/companies/{COMPANY_ID}/couriers")
        couriers = couriers_response.json()
        
        if len(couriers) > 0:
            courier = couriers[0]
            response = requests.get(f"{BASE_URL}/api/invoices/courier/{courier['id']}")
            assert response.status_code == 200
            data = response.json()
            assert isinstance(data, list)
            print(f"✓ Courier invoices retrieved: {len(data)} invoices")
        else:
            pytest.skip("No couriers available")


class TestAPIHealth:
    """Test API health"""
    
    def test_api_health(self):
        """Test API root endpoint"""
        response = requests.get(f"{BASE_URL}/api/")
        assert response.status_code == 200
        data = response.json()
        assert "message" in data
        print(f"✓ API health check passed")


if __name__ == "__main__":
    pytest.main([__file__, "-v", "--tb=short"])
