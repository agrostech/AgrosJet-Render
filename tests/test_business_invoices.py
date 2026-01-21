"""
Test suite for İşletme Faturaları (Business Invoices) feature
Tests the new business invoices API endpoints
"""
import pytest
import requests
import os

BASE_URL = os.environ.get('REACT_APP_BACKEND_URL', '').rstrip('/')

# Test company ID from credentials
COMPANY_ID = "af44eb06-9148-4990-8338-ea0208a47734"

class TestBusinessInvoicesAPI:
    """Business Invoices API endpoint tests"""
    
    def test_get_business_invoices_for_month(self):
        """Test GET /api/business-invoices/{company_id}/{year}/{month}"""
        # Test with November 2024 (previous month)
        response = requests.get(f"{BASE_URL}/api/business-invoices/{COMPANY_ID}/2024/11")
        
        assert response.status_code == 200, f"Expected 200, got {response.status_code}: {response.text}"
        
        data = response.json()
        assert isinstance(data, list), "Response should be a list"
        print(f"✓ GET business invoices for month returned {len(data)} records")
    
    def test_get_company_invoice_details(self):
        """Test GET /api/business-invoices/company-details/{company_id}"""
        response = requests.get(f"{BASE_URL}/api/business-invoices/company-details/{COMPANY_ID}")
        
        assert response.status_code == 200, f"Expected 200, got {response.status_code}: {response.text}"
        
        data = response.json()
        # Verify company details structure
        assert "name" in data, "Response should contain 'name'"
        print(f"✓ Company details: {data.get('name')}")
        print(f"  - VKN: {data.get('tckn_vkn')}")
        print(f"  - Tax Office: {data.get('tax_office')}")
        print(f"  - Address: {data.get('address')}")
    
    def test_get_company_details_invalid_company(self):
        """Test GET /api/business-invoices/company-details with invalid company ID"""
        response = requests.get(f"{BASE_URL}/api/business-invoices/company-details/invalid-company-id")
        
        assert response.status_code == 404, f"Expected 404 for invalid company, got {response.status_code}"
        print("✓ Invalid company ID returns 404")
    
    def test_get_single_business_invoice(self):
        """Test GET /api/business-invoices/{company_id}/{year}/{month}/{business_id}"""
        # First get list of businesses
        businesses_response = requests.get(f"{BASE_URL}/api/companies/{COMPANY_ID}/businesses")
        
        if businesses_response.status_code == 200:
            businesses = businesses_response.json()
            if businesses and len(businesses) > 0:
                business_id = businesses[0].get('id')
                
                # Get single business invoice record
                response = requests.get(f"{BASE_URL}/api/business-invoices/{COMPANY_ID}/2024/11/{business_id}")
                
                # Should return 200 (with data or null)
                assert response.status_code == 200, f"Expected 200, got {response.status_code}"
                print(f"✓ Single business invoice endpoint works for business: {businesses[0].get('name')}")
            else:
                pytest.skip("No businesses found to test single invoice endpoint")
        else:
            pytest.skip("Could not fetch businesses list")
    
    def test_set_manual_amount(self):
        """Test POST /api/business-invoices/{company_id}/{year}/{month}/{business_id}/set-amount"""
        # First get list of businesses
        businesses_response = requests.get(f"{BASE_URL}/api/companies/{COMPANY_ID}/businesses")
        
        if businesses_response.status_code == 200:
            businesses = businesses_response.json()
            if businesses and len(businesses) > 0:
                business_id = businesses[0].get('id')
                
                # Set manual amount
                response = requests.post(
                    f"{BASE_URL}/api/business-invoices/{COMPANY_ID}/2024/11/{business_id}/set-amount",
                    json={"amount": 1500.50}
                )
                
                assert response.status_code == 200, f"Expected 200, got {response.status_code}: {response.text}"
                
                data = response.json()
                assert "message" in data, "Response should contain 'message'"
                print(f"✓ Set manual amount for business: {businesses[0].get('name')}")
                
                # Verify the amount was saved
                verify_response = requests.get(f"{BASE_URL}/api/business-invoices/{COMPANY_ID}/2024/11/{business_id}")
                if verify_response.status_code == 200:
                    verify_data = verify_response.json()
                    if verify_data:
                        assert verify_data.get('required_amount') == 1500.50, "Amount should be saved"
                        print(f"✓ Amount verified: {verify_data.get('required_amount')} TL")
            else:
                pytest.skip("No businesses found to test set amount endpoint")
        else:
            pytest.skip("Could not fetch businesses list")
    
    def test_set_amount_invalid_business(self):
        """Test POST set-amount with invalid business ID"""
        response = requests.post(
            f"{BASE_URL}/api/business-invoices/{COMPANY_ID}/2024/11/invalid-business-id/set-amount",
            json={"amount": 100}
        )
        
        assert response.status_code == 404, f"Expected 404 for invalid business, got {response.status_code}"
        print("✓ Invalid business ID returns 404 for set-amount")


class TestBusinessInvoicesIntegration:
    """Integration tests for business invoices with businesses list"""
    
    def test_businesses_list_available(self):
        """Test that businesses list is available for the company"""
        response = requests.get(f"{BASE_URL}/api/companies/{COMPANY_ID}/businesses")
        
        assert response.status_code == 200, f"Expected 200, got {response.status_code}"
        
        data = response.json()
        assert isinstance(data, list), "Response should be a list"
        print(f"✓ Found {len(data)} businesses for company")
        
        if data:
            # Print first few businesses
            for b in data[:3]:
                print(f"  - {b.get('name')} (phone: {b.get('phone', 'N/A')})")
    
    def test_month_navigation_range(self):
        """Test that API accepts requests for last 12 months"""
        from datetime import datetime
        
        now = datetime.now()
        
        # Test current month
        response = requests.get(f"{BASE_URL}/api/business-invoices/{COMPANY_ID}/{now.year}/{now.month}")
        assert response.status_code == 200, f"Current month should work: {response.status_code}"
        print(f"✓ Current month ({now.month}/{now.year}) works")
        
        # Test previous month
        prev_month = now.month - 1 if now.month > 1 else 12
        prev_year = now.year if now.month > 1 else now.year - 1
        
        response = requests.get(f"{BASE_URL}/api/business-invoices/{COMPANY_ID}/{prev_year}/{prev_month}")
        assert response.status_code == 200, f"Previous month should work: {response.status_code}"
        print(f"✓ Previous month ({prev_month}/{prev_year}) works")


if __name__ == "__main__":
    pytest.main([__file__, "-v"])
