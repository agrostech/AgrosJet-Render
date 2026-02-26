"""
Test suite for Muhasebe (Accounting) Page API Endpoints
Tests: Transactions API, Businesses, Vendors, Courier transactions
"""
import pytest
import requests
import os
import uuid

BASE_URL = os.environ.get('REACT_APP_BACKEND_URL', 'https://jetpuan-elegance.preview.emergentagent.com')

# Test credentials
SUPER_ADMIN_USERNAME = "onurertas"
SUPER_ADMIN_PASSWORD = "Delivery32.."
COMPANY_ID = "e1c50cea-307e-4889-b33b-4b22e467b0b4"


class TestAPIHealth:
    """Test API health"""
    
    def test_api_health(self):
        """Test API root endpoint"""
        response = requests.get(f"{BASE_URL}/api/")
        assert response.status_code == 200
        data = response.json()
        assert "message" in data
        print(f"✓ API health check passed: {data['message']}")


class TestAdminLogin:
    """Test admin authentication for Muhasebe access"""
    
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
        assert data["permissions"]["muhasebe"] == True
        print(f"✓ Admin login successful with muhasebe permission: {data['name']}")


class TestCourierTransactions:
    """Test courier transaction endpoints for KuryelerTab"""
    
    def test_get_company_couriers(self):
        """Test getting couriers for a company"""
        response = requests.get(f"{BASE_URL}/api/companies/{COMPANY_ID}/couriers")
        assert response.status_code == 200
        data = response.json()
        assert isinstance(data, list)
        print(f"✓ Company couriers retrieved: {len(data)} couriers")
        return data
    
    def test_get_courier_transactions_empty(self):
        """Test getting transactions for a courier (may be empty)"""
        # First get a courier
        couriers_response = requests.get(f"{BASE_URL}/api/companies/{COMPANY_ID}/couriers")
        couriers = couriers_response.json()
        
        if len(couriers) > 0:
            courier_id = couriers[0]["id"]
            response = requests.get(f"{BASE_URL}/api/transactions/courier/{courier_id}")
            assert response.status_code == 200
            data = response.json()
            assert "transactions" in data
            assert "balance" in data
            assert isinstance(data["transactions"], list)
            assert isinstance(data["balance"], (int, float))
            print(f"✓ Courier transactions retrieved: {len(data['transactions'])} transactions, balance: {data['balance']}")
        else:
            pytest.skip("No couriers available for testing")
    
    def test_create_courier_payment_in(self):
        """Test creating a payment_in transaction for courier (Ödeme Al)"""
        couriers_response = requests.get(f"{BASE_URL}/api/companies/{COMPANY_ID}/couriers")
        couriers = couriers_response.json()
        
        if len(couriers) > 0:
            courier_id = couriers[0]["id"]
            
            # Get initial balance
            initial_response = requests.get(f"{BASE_URL}/api/transactions/courier/{courier_id}")
            initial_balance = initial_response.json()["balance"]
            
            # Create payment_in transaction
            response = requests.post(
                f"{BASE_URL}/api/transactions",
                json={
                    "entity_type": "courier",
                    "entity_id": courier_id,
                    "company_id": COMPANY_ID,
                    "type": "payment_in",
                    "amount": 100.50,
                    "description": "TEST_Ödeme alındı",
                    "is_hakedis": False
                }
            )
            assert response.status_code == 200
            data = response.json()
            assert "id" in data
            print(f"✓ Payment_in transaction created: {data['id']}")
            
            # Verify balance changed
            after_response = requests.get(f"{BASE_URL}/api/transactions/courier/{courier_id}")
            after_balance = after_response.json()["balance"]
            assert after_balance == initial_balance - 100.50, "Balance should decrease by payment_in amount"
            print(f"✓ Balance updated correctly: {initial_balance} -> {after_balance}")
        else:
            pytest.skip("No couriers available for testing")
    
    def test_create_courier_payment_out(self):
        """Test creating a payment_out transaction for courier (Ödeme Yap)"""
        couriers_response = requests.get(f"{BASE_URL}/api/companies/{COMPANY_ID}/couriers")
        couriers = couriers_response.json()
        
        if len(couriers) > 0:
            courier_id = couriers[0]["id"]
            
            # Get initial balance
            initial_response = requests.get(f"{BASE_URL}/api/transactions/courier/{courier_id}")
            initial_balance = initial_response.json()["balance"]
            
            # Create payment_out transaction
            response = requests.post(
                f"{BASE_URL}/api/transactions",
                json={
                    "entity_type": "courier",
                    "entity_id": courier_id,
                    "company_id": COMPANY_ID,
                    "type": "payment_out",
                    "amount": 50.25,
                    "description": "TEST_Ödeme yapıldı",
                    "is_hakedis": False
                }
            )
            assert response.status_code == 200
            data = response.json()
            assert "id" in data
            print(f"✓ Payment_out transaction created: {data['id']}")
            
            # Verify balance changed
            after_response = requests.get(f"{BASE_URL}/api/transactions/courier/{courier_id}")
            after_balance = after_response.json()["balance"]
            assert after_balance == initial_balance + 50.25, "Balance should increase by payment_out amount"
            print(f"✓ Balance updated correctly: {initial_balance} -> {after_balance}")
        else:
            pytest.skip("No couriers available for testing")
    
    def test_create_courier_hakedis_transaction(self):
        """Test creating a hakediş transaction for courier"""
        couriers_response = requests.get(f"{BASE_URL}/api/companies/{COMPANY_ID}/couriers")
        couriers = couriers_response.json()
        
        if len(couriers) > 0:
            courier_id = couriers[0]["id"]
            
            # Create hakediş transaction
            response = requests.post(
                f"{BASE_URL}/api/transactions",
                json={
                    "entity_type": "courier",
                    "entity_id": courier_id,
                    "company_id": COMPANY_ID,
                    "type": "payment_in",
                    "amount": 200.00,
                    "description": "TEST_Hakediş ödemesi",
                    "is_hakedis": True
                }
            )
            assert response.status_code == 200
            data = response.json()
            assert "id" in data
            print(f"✓ Hakediş transaction created: {data['id']}")
            
            # Verify transaction has is_hakedis flag
            transactions_response = requests.get(f"{BASE_URL}/api/transactions/courier/{courier_id}")
            transactions = transactions_response.json()["transactions"]
            hakedis_found = any(tx.get("is_hakedis") == True and "TEST_Hakediş" in tx.get("description", "") for tx in transactions)
            assert hakedis_found, "Hakediş transaction should be in transaction list with is_hakedis=True"
            print("✓ Hakediş flag verified in transaction list")
        else:
            pytest.skip("No couriers available for testing")


class TestBusinesses:
    """Test business (İşletme) endpoints for IsletmelerTab"""
    
    def test_get_businesses(self):
        """Test getting businesses for a company"""
        response = requests.get(f"{BASE_URL}/api/companies/{COMPANY_ID}/businesses")
        assert response.status_code == 200
        data = response.json()
        assert isinstance(data, list)
        print(f"✓ Businesses retrieved: {len(data)} businesses")
        return data
    
    def test_create_business(self):
        """Test creating a new business"""
        unique_name = f"TEST_İşletme_{str(uuid.uuid4())[:8]}"
        response = requests.post(
            f"{BASE_URL}/api/companies/{COMPANY_ID}/businesses",
            json={
                "name": unique_name,
                "phone": "05551234567",
                "address": "Test Adres"
            }
        )
        assert response.status_code == 200
        data = response.json()
        assert "id" in data
        print(f"✓ Business created: {unique_name}")
        return data["id"]
    
    def test_create_and_delete_business(self):
        """Test creating and deleting a business"""
        # Create
        unique_name = f"TEST_Silinecek_İşletme_{str(uuid.uuid4())[:8]}"
        create_response = requests.post(
            f"{BASE_URL}/api/companies/{COMPANY_ID}/businesses",
            json={"name": unique_name, "phone": "", "address": ""}
        )
        assert create_response.status_code == 200
        business_id = create_response.json()["id"]
        print(f"✓ Business created for deletion test: {business_id}")
        
        # Delete
        delete_response = requests.delete(f"{BASE_URL}/api/businesses/{business_id}")
        assert delete_response.status_code == 200
        print(f"✓ Business deleted: {business_id}")
        
        # Verify deleted
        businesses_response = requests.get(f"{BASE_URL}/api/companies/{COMPANY_ID}/businesses")
        businesses = businesses_response.json()
        business_exists = any(b["id"] == business_id for b in businesses)
        assert not business_exists, "Deleted business should not exist"
        print("✓ Business deletion verified")
    
    def test_business_transactions(self):
        """Test business transaction flow"""
        # Create a test business
        unique_name = f"TEST_İşletme_TX_{str(uuid.uuid4())[:8]}"
        create_response = requests.post(
            f"{BASE_URL}/api/companies/{COMPANY_ID}/businesses",
            json={"name": unique_name, "phone": "", "address": ""}
        )
        business_id = create_response.json()["id"]
        
        # Get initial transactions (should be empty)
        initial_response = requests.get(f"{BASE_URL}/api/transactions/business/{business_id}")
        assert initial_response.status_code == 200
        initial_data = initial_response.json()
        assert initial_data["balance"] == 0
        assert len(initial_data["transactions"]) == 0
        print(f"✓ Initial business balance: 0")
        
        # Create payment_in
        requests.post(
            f"{BASE_URL}/api/transactions",
            json={
                "entity_type": "business",
                "entity_id": business_id,
                "company_id": COMPANY_ID,
                "type": "payment_in",
                "amount": 500.00,
                "description": "TEST_İşletme ödeme alındı"
            }
        )
        
        # Create payment_out
        requests.post(
            f"{BASE_URL}/api/transactions",
            json={
                "entity_type": "business",
                "entity_id": business_id,
                "company_id": COMPANY_ID,
                "type": "payment_out",
                "amount": 200.00,
                "description": "TEST_İşletme ödeme yapıldı"
            }
        )
        
        # Verify balance
        after_response = requests.get(f"{BASE_URL}/api/transactions/business/{business_id}")
        after_data = after_response.json()
        expected_balance = 200.00 - 500.00  # payment_out adds, payment_in subtracts
        assert after_data["balance"] == expected_balance
        assert len(after_data["transactions"]) == 2
        print(f"✓ Business balance after transactions: {after_data['balance']}")
        
        # Cleanup
        requests.delete(f"{BASE_URL}/api/businesses/{business_id}")


class TestVendors:
    """Test vendor (Cari) endpoints for CarilerTab"""
    
    def test_get_vendors(self):
        """Test getting vendors for a company"""
        response = requests.get(f"{BASE_URL}/api/companies/{COMPANY_ID}/vendors")
        assert response.status_code == 200
        data = response.json()
        assert isinstance(data, list)
        print(f"✓ Vendors retrieved: {len(data)} vendors")
        return data
    
    def test_create_vendor(self):
        """Test creating a new vendor"""
        unique_name = f"TEST_Cari_{str(uuid.uuid4())[:8]}"
        response = requests.post(
            f"{BASE_URL}/api/companies/{COMPANY_ID}/vendors",
            json={
                "name": unique_name,
                "phone": "05559876543",
                "address": "Cari Test Adres"
            }
        )
        assert response.status_code == 200
        data = response.json()
        assert "id" in data
        print(f"✓ Vendor created: {unique_name}")
        return data["id"]
    
    def test_create_and_delete_vendor(self):
        """Test creating and deleting a vendor"""
        # Create
        unique_name = f"TEST_Silinecek_Cari_{str(uuid.uuid4())[:8]}"
        create_response = requests.post(
            f"{BASE_URL}/api/companies/{COMPANY_ID}/vendors",
            json={"name": unique_name, "phone": "", "address": ""}
        )
        assert create_response.status_code == 200
        vendor_id = create_response.json()["id"]
        print(f"✓ Vendor created for deletion test: {vendor_id}")
        
        # Delete
        delete_response = requests.delete(f"{BASE_URL}/api/vendors/{vendor_id}")
        assert delete_response.status_code == 200
        print(f"✓ Vendor deleted: {vendor_id}")
        
        # Verify deleted
        vendors_response = requests.get(f"{BASE_URL}/api/companies/{COMPANY_ID}/vendors")
        vendors = vendors_response.json()
        vendor_exists = any(v["id"] == vendor_id for v in vendors)
        assert not vendor_exists, "Deleted vendor should not exist"
        print("✓ Vendor deletion verified")
    
    def test_vendor_transactions(self):
        """Test vendor transaction flow"""
        # Create a test vendor
        unique_name = f"TEST_Cari_TX_{str(uuid.uuid4())[:8]}"
        create_response = requests.post(
            f"{BASE_URL}/api/companies/{COMPANY_ID}/vendors",
            json={"name": unique_name, "phone": "", "address": ""}
        )
        vendor_id = create_response.json()["id"]
        
        # Get initial transactions (should be empty)
        initial_response = requests.get(f"{BASE_URL}/api/transactions/vendor/{vendor_id}")
        assert initial_response.status_code == 200
        initial_data = initial_response.json()
        assert initial_data["balance"] == 0
        assert len(initial_data["transactions"]) == 0
        print(f"✓ Initial vendor balance: 0")
        
        # Create payment_in
        requests.post(
            f"{BASE_URL}/api/transactions",
            json={
                "entity_type": "vendor",
                "entity_id": vendor_id,
                "company_id": COMPANY_ID,
                "type": "payment_in",
                "amount": 300.00,
                "description": "TEST_Cari ödeme alındı"
            }
        )
        
        # Create payment_out
        requests.post(
            f"{BASE_URL}/api/transactions",
            json={
                "entity_type": "vendor",
                "entity_id": vendor_id,
                "company_id": COMPANY_ID,
                "type": "payment_out",
                "amount": 150.00,
                "description": "TEST_Cari ödeme yapıldı"
            }
        )
        
        # Verify balance
        after_response = requests.get(f"{BASE_URL}/api/transactions/vendor/{vendor_id}")
        after_data = after_response.json()
        expected_balance = 150.00 - 300.00  # payment_out adds, payment_in subtracts
        assert after_data["balance"] == expected_balance
        assert len(after_data["transactions"]) == 2
        print(f"✓ Vendor balance after transactions: {after_data['balance']}")
        
        # Cleanup
        requests.delete(f"{BASE_URL}/api/vendors/{vendor_id}")


class TestTransactionValidation:
    """Test transaction validation and edge cases"""
    
    def test_transaction_required_fields(self):
        """Test that transaction requires all fields"""
        response = requests.post(
            f"{BASE_URL}/api/transactions",
            json={
                "entity_type": "courier",
                # Missing entity_id, company_id, type, amount
            }
        )
        assert response.status_code == 422  # Validation error
        print("✓ Transaction validation working - missing fields rejected")
    
    def test_transaction_types(self):
        """Test that both payment_in and payment_out types work"""
        couriers_response = requests.get(f"{BASE_URL}/api/companies/{COMPANY_ID}/couriers")
        couriers = couriers_response.json()
        
        if len(couriers) > 0:
            courier_id = couriers[0]["id"]
            
            # Test payment_in
            response_in = requests.post(
                f"{BASE_URL}/api/transactions",
                json={
                    "entity_type": "courier",
                    "entity_id": courier_id,
                    "company_id": COMPANY_ID,
                    "type": "payment_in",
                    "amount": 10.00,
                    "description": "TEST_Type validation"
                }
            )
            assert response_in.status_code == 200
            
            # Test payment_out
            response_out = requests.post(
                f"{BASE_URL}/api/transactions",
                json={
                    "entity_type": "courier",
                    "entity_id": courier_id,
                    "company_id": COMPANY_ID,
                    "type": "payment_out",
                    "amount": 10.00,
                    "description": "TEST_Type validation"
                }
            )
            assert response_out.status_code == 200
            print("✓ Both payment_in and payment_out types work correctly")
        else:
            pytest.skip("No couriers available for testing")


if __name__ == "__main__":
    pytest.main([__file__, "-v", "--tb=short"])
