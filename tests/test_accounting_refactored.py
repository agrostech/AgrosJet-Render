"""
Test suite for Accounting API after refactoring
Tests: Transaction CRUD, Installment Products, Activity Logs, Accounting Summary
Refactored from accounting.py (786 lines) -> accounting.py + accounting_service.py + schemas.py
"""
import pytest
import requests
import os
import uuid
from datetime import datetime, timezone

BASE_URL = os.environ.get('REACT_APP_BACKEND_URL', 'https://feature-review-7.preview.emergentagent.com')

# Test credentials
SUPER_ADMIN_USERNAME = "onurertas"
SUPER_ADMIN_PASSWORD = "Delivery32.."
COMPANY_ID = "e1c50cea-307e-4889-b33b-4b22e467b0b4"
ADMIN_ID = "test-admin-id"
ADMIN_NAME = "Test Admin"


@pytest.fixture(scope="module")
def admin_session():
    """Login and get admin session data"""
    response = requests.post(
        f"{BASE_URL}/api/auth/admin/login",
        json={"username": SUPER_ADMIN_USERNAME, "password": SUPER_ADMIN_PASSWORD}
    )
    if response.status_code == 200:
        data = response.json()
        return {
            "admin_id": data.get("id"),
            "admin_name": data.get("name"),
            "company_id": data.get("company_id")
        }
    pytest.skip("Admin login failed")


@pytest.fixture(scope="module")
def test_courier_id():
    """Get a courier ID for testing"""
    response = requests.get(f"{BASE_URL}/api/companies/{COMPANY_ID}/couriers")
    if response.status_code == 200:
        couriers = response.json()
        if len(couriers) > 0:
            return couriers[0]["id"]
    pytest.skip("No couriers available for testing")


class TestAPIHealth:
    """Test API health after refactoring"""
    
    def test_api_health(self):
        """Test API root endpoint"""
        response = requests.get(f"{BASE_URL}/api/")
        assert response.status_code == 200
        data = response.json()
        assert "message" in data
        print(f"✓ API health check passed: {data['message']}")


class TestTransactionCRUD:
    """Test full CRUD operations for transactions"""
    
    def test_create_transaction_for_courier(self, test_courier_id, admin_session):
        """Test creating a transaction for courier with admin info"""
        response = requests.post(
            f"{BASE_URL}/api/transactions",
            json={
                "entity_type": "courier",
                "entity_id": test_courier_id,
                "company_id": COMPANY_ID,
                "type": "payment_out",
                "amount": 100.00,
                "description": "TEST_Transaction_Create",
                "is_hakedis": False,
                "admin_id": admin_session["admin_id"],
                "admin_name": admin_session["admin_name"]
            }
        )
        assert response.status_code == 200
        data = response.json()
        assert "id" in data
        assert data["message"] == "İşlem kaydedildi"
        print(f"✓ Transaction created: {data['id']}")
        return data["id"]
    
    def test_create_transaction_with_custom_date(self, test_courier_id, admin_session):
        """Test creating a transaction with custom date"""
        custom_date = "2025-01-15T10:30:00Z"
        response = requests.post(
            f"{BASE_URL}/api/transactions",
            json={
                "entity_type": "courier",
                "entity_id": test_courier_id,
                "company_id": COMPANY_ID,
                "type": "payment_in",
                "amount": 50.00,
                "description": "TEST_Custom_Date_Transaction",
                "custom_date": custom_date,
                "admin_id": admin_session["admin_id"],
                "admin_name": admin_session["admin_name"]
            }
        )
        assert response.status_code == 200
        data = response.json()
        assert "id" in data
        print(f"✓ Transaction with custom date created: {data['id']}")
        return data["id"]
    
    def test_get_courier_transactions(self, test_courier_id):
        """Test getting transactions for a courier"""
        response = requests.get(f"{BASE_URL}/api/transactions/courier/{test_courier_id}")
        assert response.status_code == 200
        data = response.json()
        assert "transactions" in data
        assert "balance" in data
        assert "total_count" in data
        assert "has_more" in data
        assert isinstance(data["transactions"], list)
        print(f"✓ Courier transactions retrieved: {len(data['transactions'])} transactions, balance: {data['balance']}")
    
    def test_get_courier_transactions_pagination(self, test_courier_id):
        """Test pagination for courier transactions"""
        # Get first page
        response1 = requests.get(f"{BASE_URL}/api/transactions/courier/{test_courier_id}?skip=0&limit=5")
        assert response1.status_code == 200
        data1 = response1.json()
        
        # Get second page
        response2 = requests.get(f"{BASE_URL}/api/transactions/courier/{test_courier_id}?skip=5&limit=5")
        assert response2.status_code == 200
        data2 = response2.json()
        
        print(f"✓ Pagination working: Page 1: {len(data1['transactions'])}, Page 2: {len(data2['transactions'])}")
    
    def test_update_transaction(self, test_courier_id, admin_session):
        """Test updating a transaction"""
        # First create a transaction
        create_response = requests.post(
            f"{BASE_URL}/api/transactions",
            json={
                "entity_type": "courier",
                "entity_id": test_courier_id,
                "company_id": COMPANY_ID,
                "type": "payment_out",
                "amount": 75.00,
                "description": "TEST_To_Update",
                "admin_id": admin_session["admin_id"],
                "admin_name": admin_session["admin_name"]
            }
        )
        assert create_response.status_code == 200
        transaction_id = create_response.json()["id"]
        print(f"✓ Transaction created for update test: {transaction_id}")
        
        # Update the transaction
        update_response = requests.put(
            f"{BASE_URL}/api/transactions/{transaction_id}",
            json={
                "amount": 150.00,
                "description": "TEST_Updated_Description",
                "admin_id": admin_session["admin_id"],
                "admin_name": admin_session["admin_name"]
            }
        )
        assert update_response.status_code == 200
        assert update_response.json()["message"] == "İşlem güncellendi"
        print(f"✓ Transaction updated: {transaction_id}")
        
        # Verify update by getting transactions
        verify_response = requests.get(f"{BASE_URL}/api/transactions/courier/{test_courier_id}")
        transactions = verify_response.json()["transactions"]
        updated_tx = next((tx for tx in transactions if tx["id"] == transaction_id), None)
        assert updated_tx is not None
        assert updated_tx["amount"] == 150.00
        assert updated_tx["description"] == "TEST_Updated_Description"
        print(f"✓ Transaction update verified: amount={updated_tx['amount']}, description={updated_tx['description']}")
        
        return transaction_id
    
    def test_update_transaction_not_found(self, admin_session):
        """Test updating a non-existent transaction"""
        response = requests.put(
            f"{BASE_URL}/api/transactions/non-existent-id",
            json={
                "amount": 100.00,
                "admin_id": admin_session["admin_id"],
                "admin_name": admin_session["admin_name"]
            }
        )
        assert response.status_code == 404
        print("✓ Update non-existent transaction returns 404")
    
    def test_update_transaction_no_fields(self, test_courier_id, admin_session):
        """Test updating a transaction with no update fields"""
        # First create a transaction
        create_response = requests.post(
            f"{BASE_URL}/api/transactions",
            json={
                "entity_type": "courier",
                "entity_id": test_courier_id,
                "company_id": COMPANY_ID,
                "type": "payment_out",
                "amount": 25.00,
                "description": "TEST_No_Update_Fields",
                "admin_id": admin_session["admin_id"],
                "admin_name": admin_session["admin_name"]
            }
        )
        transaction_id = create_response.json()["id"]
        
        # Try to update with no fields
        update_response = requests.put(
            f"{BASE_URL}/api/transactions/{transaction_id}",
            json={
                "admin_id": admin_session["admin_id"],
                "admin_name": admin_session["admin_name"]
            }
        )
        assert update_response.status_code == 400
        print("✓ Update with no fields returns 400")
    
    def test_delete_transaction(self, test_courier_id, admin_session):
        """Test deleting a transaction"""
        # First create a transaction
        create_response = requests.post(
            f"{BASE_URL}/api/transactions",
            json={
                "entity_type": "courier",
                "entity_id": test_courier_id,
                "company_id": COMPANY_ID,
                "type": "payment_in",
                "amount": 30.00,
                "description": "TEST_To_Delete",
                "admin_id": admin_session["admin_id"],
                "admin_name": admin_session["admin_name"]
            }
        )
        assert create_response.status_code == 200
        transaction_id = create_response.json()["id"]
        print(f"✓ Transaction created for delete test: {transaction_id}")
        
        # Delete the transaction
        delete_response = requests.delete(
            f"{BASE_URL}/api/transactions/{transaction_id}",
            json={
                "admin_id": admin_session["admin_id"],
                "admin_name": admin_session["admin_name"]
            }
        )
        assert delete_response.status_code == 200
        assert delete_response.json()["message"] == "İşlem silindi"
        print(f"✓ Transaction deleted: {transaction_id}")
        
        # Verify deletion
        verify_response = requests.get(f"{BASE_URL}/api/transactions/courier/{test_courier_id}")
        transactions = verify_response.json()["transactions"]
        deleted_tx = next((tx for tx in transactions if tx["id"] == transaction_id), None)
        assert deleted_tx is None
        print("✓ Transaction deletion verified")
    
    def test_delete_transaction_not_found(self, admin_session):
        """Test deleting a non-existent transaction"""
        response = requests.delete(
            f"{BASE_URL}/api/transactions/non-existent-id",
            json={
                "admin_id": admin_session["admin_id"],
                "admin_name": admin_session["admin_name"]
            }
        )
        assert response.status_code == 404
        print("✓ Delete non-existent transaction returns 404")


class TestBusinessCRUD:
    """Test Business (İşletme) CRUD operations"""
    
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
        assert data["message"] == "İşletme oluşturuldu"
        print(f"✓ Business created: {unique_name}")
        return data["id"]
    
    def test_get_businesses(self):
        """Test getting businesses for a company"""
        response = requests.get(f"{BASE_URL}/api/companies/{COMPANY_ID}/businesses")
        assert response.status_code == 200
        data = response.json()
        assert isinstance(data, list)
        print(f"✓ Businesses retrieved: {len(data)} businesses")
    
    def test_get_businesses_include_archived(self):
        """Test getting businesses including archived"""
        response = requests.get(f"{BASE_URL}/api/companies/{COMPANY_ID}/businesses?include_archived=true")
        assert response.status_code == 200
        data = response.json()
        assert isinstance(data, list)
        print(f"✓ Businesses with archived retrieved: {len(data)} businesses")
    
    def test_archive_unarchive_business(self):
        """Test archiving and unarchiving a business"""
        # Create a business
        unique_name = f"TEST_Archive_İşletme_{str(uuid.uuid4())[:8]}"
        create_response = requests.post(
            f"{BASE_URL}/api/companies/{COMPANY_ID}/businesses",
            json={"name": unique_name, "phone": "", "address": ""}
        )
        business_id = create_response.json()["id"]
        
        # Archive
        archive_response = requests.put(f"{BASE_URL}/api/businesses/{business_id}/archive")
        assert archive_response.status_code == 200
        assert archive_response.json()["message"] == "İşletme arşivlendi"
        print(f"✓ Business archived: {business_id}")
        
        # Verify not in active list
        active_response = requests.get(f"{BASE_URL}/api/companies/{COMPANY_ID}/businesses")
        active_businesses = active_response.json()
        assert not any(b["id"] == business_id for b in active_businesses)
        print("✓ Archived business not in active list")
        
        # Unarchive
        unarchive_response = requests.put(f"{BASE_URL}/api/businesses/{business_id}/unarchive")
        assert unarchive_response.status_code == 200
        assert unarchive_response.json()["message"] == "İşletme arşivden çıkarıldı"
        print(f"✓ Business unarchived: {business_id}")
        
        # Cleanup
        requests.delete(f"{BASE_URL}/api/businesses/{business_id}")
    
    def test_delete_business(self):
        """Test deleting a business"""
        # Create a business
        unique_name = f"TEST_Delete_İşletme_{str(uuid.uuid4())[:8]}"
        create_response = requests.post(
            f"{BASE_URL}/api/companies/{COMPANY_ID}/businesses",
            json={"name": unique_name, "phone": "", "address": ""}
        )
        business_id = create_response.json()["id"]
        
        # Delete
        delete_response = requests.delete(f"{BASE_URL}/api/businesses/{business_id}")
        assert delete_response.status_code == 200
        assert delete_response.json()["message"] == "İşletme silindi"
        print(f"✓ Business deleted: {business_id}")
    
    def test_get_business_transactions(self):
        """Test getting transactions for a business"""
        # Create a business
        unique_name = f"TEST_TX_İşletme_{str(uuid.uuid4())[:8]}"
        create_response = requests.post(
            f"{BASE_URL}/api/companies/{COMPANY_ID}/businesses",
            json={"name": unique_name, "phone": "", "address": ""}
        )
        business_id = create_response.json()["id"]
        
        # Get transactions
        response = requests.get(f"{BASE_URL}/api/transactions/business/{business_id}")
        assert response.status_code == 200
        data = response.json()
        assert "transactions" in data
        assert "balance" in data
        assert data["balance"] == 0
        print(f"✓ Business transactions retrieved: balance={data['balance']}")
        
        # Cleanup
        requests.delete(f"{BASE_URL}/api/businesses/{business_id}")


class TestVendorCRUD:
    """Test Vendor (Cari) CRUD operations"""
    
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
        assert data["message"] == "Cari oluşturuldu"
        print(f"✓ Vendor created: {unique_name}")
        return data["id"]
    
    def test_get_vendors(self):
        """Test getting vendors for a company"""
        response = requests.get(f"{BASE_URL}/api/companies/{COMPANY_ID}/vendors")
        assert response.status_code == 200
        data = response.json()
        assert isinstance(data, list)
        print(f"✓ Vendors retrieved: {len(data)} vendors")
    
    def test_archive_unarchive_vendor(self):
        """Test archiving and unarchiving a vendor"""
        # Create a vendor
        unique_name = f"TEST_Archive_Cari_{str(uuid.uuid4())[:8]}"
        create_response = requests.post(
            f"{BASE_URL}/api/companies/{COMPANY_ID}/vendors",
            json={"name": unique_name, "phone": "", "address": ""}
        )
        vendor_id = create_response.json()["id"]
        
        # Archive
        archive_response = requests.put(f"{BASE_URL}/api/vendors/{vendor_id}/archive")
        assert archive_response.status_code == 200
        assert archive_response.json()["message"] == "Cari arşivlendi"
        print(f"✓ Vendor archived: {vendor_id}")
        
        # Unarchive
        unarchive_response = requests.put(f"{BASE_URL}/api/vendors/{vendor_id}/unarchive")
        assert unarchive_response.status_code == 200
        assert unarchive_response.json()["message"] == "Cari arşivden çıkarıldı"
        print(f"✓ Vendor unarchived: {vendor_id}")
        
        # Cleanup
        requests.delete(f"{BASE_URL}/api/vendors/{vendor_id}")
    
    def test_delete_vendor(self):
        """Test deleting a vendor"""
        # Create a vendor
        unique_name = f"TEST_Delete_Cari_{str(uuid.uuid4())[:8]}"
        create_response = requests.post(
            f"{BASE_URL}/api/companies/{COMPANY_ID}/vendors",
            json={"name": unique_name, "phone": "", "address": ""}
        )
        vendor_id = create_response.json()["id"]
        
        # Delete
        delete_response = requests.delete(f"{BASE_URL}/api/vendors/{vendor_id}")
        assert delete_response.status_code == 200
        assert delete_response.json()["message"] == "Cari silindi"
        print(f"✓ Vendor deleted: {vendor_id}")
    
    def test_get_vendor_transactions(self):
        """Test getting transactions for a vendor"""
        # Create a vendor
        unique_name = f"TEST_TX_Cari_{str(uuid.uuid4())[:8]}"
        create_response = requests.post(
            f"{BASE_URL}/api/companies/{COMPANY_ID}/vendors",
            json={"name": unique_name, "phone": "", "address": ""}
        )
        vendor_id = create_response.json()["id"]
        
        # Get transactions
        response = requests.get(f"{BASE_URL}/api/transactions/vendor/{vendor_id}")
        assert response.status_code == 200
        data = response.json()
        assert "transactions" in data
        assert "balance" in data
        assert data["balance"] == 0
        print(f"✓ Vendor transactions retrieved: balance={data['balance']}")
        
        # Cleanup
        requests.delete(f"{BASE_URL}/api/vendors/{vendor_id}")


class TestAccountingSummary:
    """Test accounting summary endpoint"""
    
    def test_get_accounting_summary(self):
        """Test getting accounting summary for a company"""
        response = requests.get(f"{BASE_URL}/api/companies/{COMPANY_ID}/accounting-summary")
        assert response.status_code == 200
        data = response.json()
        
        # Verify structure
        assert "couriers" in data
        assert "businesses" in data
        assert "vendors" in data
        
        # Verify courier data
        assert "balance" in data["couriers"]
        assert "count" in data["couriers"]
        assert isinstance(data["couriers"]["balance"], (int, float))
        assert isinstance(data["couriers"]["count"], int)
        
        # Verify business data
        assert "balance" in data["businesses"]
        assert "count" in data["businesses"]
        
        # Verify vendor data
        assert "balance" in data["vendors"]
        assert "count" in data["vendors"]
        
        print(f"✓ Accounting summary retrieved:")
        print(f"  - Couriers: {data['couriers']['count']} (balance: {data['couriers']['balance']})")
        print(f"  - Businesses: {data['businesses']['count']} (balance: {data['businesses']['balance']})")
        print(f"  - Vendors: {data['vendors']['count']} (balance: {data['vendors']['balance']})")


class TestInstallmentProducts:
    """Test installment product (Taksitli Ürün) operations"""
    
    def test_create_installment_product(self, test_courier_id, admin_session):
        """Test creating an installment product for a courier"""
        response = requests.post(
            f"{BASE_URL}/api/couriers/{test_courier_id}/installment-products",
            json={
                "courier_id": test_courier_id,
                "company_id": COMPANY_ID,
                "name": "TEST_Taksitli_Ürün",
                "installment_amount": 100.00,
                "installment_count": 5,
                "admin_id": admin_session["admin_id"],
                "admin_name": admin_session["admin_name"]
            }
        )
        assert response.status_code == 200
        data = response.json()
        assert data["message"] == "Taksitli ürün eklendi"
        assert "product" in data
        product = data["product"]
        assert product["name"] == "TEST_Taksitli_Ürün"
        assert product["installment_amount"] == 100.00
        assert product["installment_count"] == 5
        assert product["remaining_installments"] == 5
        assert product["total_amount"] == 500.00
        assert product["paid_amount"] == 0
        assert product["is_completed"] == False
        print(f"✓ Installment product created: {product['id']}")
        return product["id"]
    
    def test_get_installment_products(self, test_courier_id):
        """Test getting installment products for a courier"""
        response = requests.get(f"{BASE_URL}/api/couriers/{test_courier_id}/installment-products")
        assert response.status_code == 200
        data = response.json()
        assert isinstance(data, list)
        print(f"✓ Installment products retrieved: {len(data)} products")
    
    def test_get_installment_products_include_completed(self, test_courier_id):
        """Test getting installment products including completed"""
        response = requests.get(f"{BASE_URL}/api/couriers/{test_courier_id}/installment-products?include_completed=true")
        assert response.status_code == 200
        data = response.json()
        assert isinstance(data, list)
        print(f"✓ Installment products with completed retrieved: {len(data)} products")
    
    def test_pay_installment(self, test_courier_id, admin_session):
        """Test paying an installment"""
        # Create an installment product
        create_response = requests.post(
            f"{BASE_URL}/api/couriers/{test_courier_id}/installment-products",
            json={
                "courier_id": test_courier_id,
                "company_id": COMPANY_ID,
                "name": "TEST_Pay_Taksit",
                "installment_amount": 50.00,
                "installment_count": 3,
                "admin_id": admin_session["admin_id"],
                "admin_name": admin_session["admin_name"]
            }
        )
        product_id = create_response.json()["product"]["id"]
        print(f"✓ Installment product created for payment test: {product_id}")
        
        # Pay first installment
        pay_response = requests.post(
            f"{BASE_URL}/api/installment-products/{product_id}/pay",
            json={
                "admin_id": admin_session["admin_id"],
                "admin_name": admin_session["admin_name"]
            }
        )
        assert pay_response.status_code == 200
        pay_data = pay_response.json()
        assert "Taksit 1/3" in pay_data["message"]
        assert pay_data["remaining_installments"] == 2
        assert pay_data["is_completed"] == False
        print(f"✓ First installment paid: {pay_data['message']}")
        
        # Pay second installment
        pay_response2 = requests.post(
            f"{BASE_URL}/api/installment-products/{product_id}/pay",
            json={
                "admin_id": admin_session["admin_id"],
                "admin_name": admin_session["admin_name"]
            }
        )
        assert pay_response2.status_code == 200
        pay_data2 = pay_response2.json()
        assert "Taksit 2/3" in pay_data2["message"]
        assert pay_data2["remaining_installments"] == 1
        print(f"✓ Second installment paid: {pay_data2['message']}")
        
        # Pay third (final) installment
        pay_response3 = requests.post(
            f"{BASE_URL}/api/installment-products/{product_id}/pay",
            json={
                "admin_id": admin_session["admin_id"],
                "admin_name": admin_session["admin_name"]
            }
        )
        assert pay_response3.status_code == 200
        pay_data3 = pay_response3.json()
        assert "Taksit 3/3" in pay_data3["message"]
        assert pay_data3["remaining_installments"] == 0
        assert pay_data3["is_completed"] == True
        print(f"✓ Final installment paid: {pay_data3['message']}, is_completed={pay_data3['is_completed']}")
    
    def test_pay_installment_with_custom_date(self, test_courier_id, admin_session):
        """Test paying an installment with custom date"""
        # Create an installment product
        create_response = requests.post(
            f"{BASE_URL}/api/couriers/{test_courier_id}/installment-products",
            json={
                "courier_id": test_courier_id,
                "company_id": COMPANY_ID,
                "name": "TEST_Custom_Date_Taksit",
                "installment_amount": 25.00,
                "installment_count": 2,
                "admin_id": admin_session["admin_id"],
                "admin_name": admin_session["admin_name"]
            }
        )
        product_id = create_response.json()["product"]["id"]
        
        # Pay with custom date
        custom_date = "2025-01-10T14:00:00Z"
        pay_response = requests.post(
            f"{BASE_URL}/api/installment-products/{product_id}/pay",
            json={
                "admin_id": admin_session["admin_id"],
                "admin_name": admin_session["admin_name"],
                "custom_date": custom_date
            }
        )
        assert pay_response.status_code == 200
        print(f"✓ Installment paid with custom date: {custom_date}")
    
    def test_pay_completed_installment(self, test_courier_id, admin_session):
        """Test paying an already completed installment product"""
        # Create an installment product with 1 installment
        create_response = requests.post(
            f"{BASE_URL}/api/couriers/{test_courier_id}/installment-products",
            json={
                "courier_id": test_courier_id,
                "company_id": COMPANY_ID,
                "name": "TEST_Completed_Taksit",
                "installment_amount": 10.00,
                "installment_count": 1,
                "admin_id": admin_session["admin_id"],
                "admin_name": admin_session["admin_name"]
            }
        )
        product_id = create_response.json()["product"]["id"]
        
        # Pay the only installment
        requests.post(
            f"{BASE_URL}/api/installment-products/{product_id}/pay",
            json={
                "admin_id": admin_session["admin_id"],
                "admin_name": admin_session["admin_name"]
            }
        )
        
        # Try to pay again
        pay_response = requests.post(
            f"{BASE_URL}/api/installment-products/{product_id}/pay",
            json={
                "admin_id": admin_session["admin_id"],
                "admin_name": admin_session["admin_name"]
            }
        )
        assert pay_response.status_code == 400
        assert "Tüm taksitler ödenmiş" in pay_response.json()["detail"]
        print("✓ Paying completed installment returns 400")
    
    def test_delete_installment_product_no_payments(self, test_courier_id, admin_session):
        """Test deleting an installment product with no payments"""
        # Create an installment product
        create_response = requests.post(
            f"{BASE_URL}/api/couriers/{test_courier_id}/installment-products",
            json={
                "courier_id": test_courier_id,
                "company_id": COMPANY_ID,
                "name": "TEST_Delete_Taksit",
                "installment_amount": 20.00,
                "installment_count": 2,
                "admin_id": admin_session["admin_id"],
                "admin_name": admin_session["admin_name"]
            }
        )
        product_id = create_response.json()["product"]["id"]
        
        # Delete without any payments
        delete_response = requests.delete(
            f"{BASE_URL}/api/installment-products/{product_id}",
            params={
                "admin_id": admin_session["admin_id"],
                "admin_name": admin_session["admin_name"]
            }
        )
        assert delete_response.status_code == 200
        assert delete_response.json()["message"] == "Ürün silindi"
        print(f"✓ Installment product deleted: {product_id}")
    
    def test_delete_installment_product_with_payments(self, test_courier_id, admin_session):
        """Test deleting an installment product with payments (should fail)"""
        # Create an installment product
        create_response = requests.post(
            f"{BASE_URL}/api/couriers/{test_courier_id}/installment-products",
            json={
                "courier_id": test_courier_id,
                "company_id": COMPANY_ID,
                "name": "TEST_Delete_With_Payment",
                "installment_amount": 15.00,
                "installment_count": 2,
                "admin_id": admin_session["admin_id"],
                "admin_name": admin_session["admin_name"]
            }
        )
        product_id = create_response.json()["product"]["id"]
        
        # Make a payment
        requests.post(
            f"{BASE_URL}/api/installment-products/{product_id}/pay",
            json={
                "admin_id": admin_session["admin_id"],
                "admin_name": admin_session["admin_name"]
            }
        )
        
        # Try to delete
        delete_response = requests.delete(
            f"{BASE_URL}/api/installment-products/{product_id}",
            params={
                "admin_id": admin_session["admin_id"],
                "admin_name": admin_session["admin_name"]
            }
        )
        assert delete_response.status_code == 400
        assert "Ödeme yapılmış ürün silinemez" in delete_response.json()["detail"]
        print("✓ Deleting installment product with payments returns 400")
    
    def test_create_installment_product_invalid_courier(self, admin_session):
        """Test creating an installment product for non-existent courier"""
        response = requests.post(
            f"{BASE_URL}/api/couriers/non-existent-courier/installment-products",
            json={
                "courier_id": "non-existent-courier",
                "company_id": COMPANY_ID,
                "name": "TEST_Invalid_Courier",
                "installment_amount": 10.00,
                "installment_count": 1,
                "admin_id": admin_session["admin_id"],
                "admin_name": admin_session["admin_name"]
            }
        )
        assert response.status_code == 404
        print("✓ Creating installment for non-existent courier returns 404")


class TestActivityLogs:
    """Test activity logs endpoint"""
    
    def test_get_activity_logs(self):
        """Test getting activity logs for a company"""
        response = requests.get(f"{BASE_URL}/api/activity-logs/{COMPANY_ID}")
        assert response.status_code == 200
        data = response.json()
        assert "logs" in data
        assert "total_count" in data
        assert "has_more" in data
        assert isinstance(data["logs"], list)
        print(f"✓ Activity logs retrieved: {len(data['logs'])} logs, total: {data['total_count']}")
    
    def test_get_activity_logs_pagination(self):
        """Test pagination for activity logs"""
        # Get first page
        response1 = requests.get(f"{BASE_URL}/api/activity-logs/{COMPANY_ID}?skip=0&limit=5")
        assert response1.status_code == 200
        data1 = response1.json()
        
        # Get second page
        response2 = requests.get(f"{BASE_URL}/api/activity-logs/{COMPANY_ID}?skip=5&limit=5")
        assert response2.status_code == 200
        data2 = response2.json()
        
        print(f"✓ Activity logs pagination: Page 1: {len(data1['logs'])}, Page 2: {len(data2['logs'])}")
    
    def test_activity_log_created_on_transaction(self, test_courier_id, admin_session):
        """Test that activity log is created when transaction is created"""
        # Get initial log count
        initial_response = requests.get(f"{BASE_URL}/api/activity-logs/{COMPANY_ID}?limit=100")
        initial_count = initial_response.json()["total_count"]
        
        # Create a transaction
        requests.post(
            f"{BASE_URL}/api/transactions",
            json={
                "entity_type": "courier",
                "entity_id": test_courier_id,
                "company_id": COMPANY_ID,
                "type": "payment_out",
                "amount": 5.00,
                "description": "TEST_Activity_Log_Check",
                "admin_id": admin_session["admin_id"],
                "admin_name": admin_session["admin_name"]
            }
        )
        
        # Check log count increased
        after_response = requests.get(f"{BASE_URL}/api/activity-logs/{COMPANY_ID}?limit=100")
        after_count = after_response.json()["total_count"]
        
        assert after_count > initial_count
        print(f"✓ Activity log created on transaction: {initial_count} -> {after_count}")


class TestTransactionWithInstallmentRestore:
    """Test transaction deletion with installment restore"""
    
    def test_delete_transaction_with_installment_restore(self, test_courier_id, admin_session):
        """Test deleting a transaction and restoring installment count"""
        # Create an installment product
        create_response = requests.post(
            f"{BASE_URL}/api/couriers/{test_courier_id}/installment-products",
            json={
                "courier_id": test_courier_id,
                "company_id": COMPANY_ID,
                "name": "TEST_Restore_Taksit",
                "installment_amount": 30.00,
                "installment_count": 3,
                "admin_id": admin_session["admin_id"],
                "admin_name": admin_session["admin_name"]
            }
        )
        product_id = create_response.json()["product"]["id"]
        
        # Pay first installment
        pay_response = requests.post(
            f"{BASE_URL}/api/installment-products/{product_id}/pay",
            json={
                "admin_id": admin_session["admin_id"],
                "admin_name": admin_session["admin_name"]
            }
        )
        transaction_id = pay_response.json()["transaction_id"]
        
        # Verify remaining is 2
        products_response = requests.get(f"{BASE_URL}/api/couriers/{test_courier_id}/installment-products")
        product = next((p for p in products_response.json() if p["id"] == product_id), None)
        assert product["remaining_installments"] == 2
        print(f"✓ After payment, remaining installments: {product['remaining_installments']}")
        
        # Delete transaction with installment restore
        delete_response = requests.delete(
            f"{BASE_URL}/api/transactions/{transaction_id}/with-installment-restore",
            json={
                "admin_id": admin_session["admin_id"],
                "admin_name": admin_session["admin_name"]
            }
        )
        assert delete_response.status_code == 200
        assert delete_response.json()["installment_restored"] == True
        print(f"✓ Transaction deleted with installment restore")
        
        # Verify remaining is restored to 3
        products_response2 = requests.get(f"{BASE_URL}/api/couriers/{test_courier_id}/installment-products")
        product2 = next((p for p in products_response2.json() if p["id"] == product_id), None)
        assert product2["remaining_installments"] == 3
        print(f"✓ After restore, remaining installments: {product2['remaining_installments']}")


class TestCleanup:
    """Cleanup test data"""
    
    def test_cleanup_test_transactions(self, test_courier_id):
        """Cleanup TEST_ prefixed transactions"""
        # Get all transactions
        response = requests.get(f"{BASE_URL}/api/transactions/courier/{test_courier_id}?limit=100")
        transactions = response.json()["transactions"]
        
        # Delete TEST_ transactions
        deleted_count = 0
        for tx in transactions:
            if tx.get("description", "").startswith("TEST_"):
                requests.delete(f"{BASE_URL}/api/transactions/{tx['id']}")
                deleted_count += 1
        
        print(f"✓ Cleaned up {deleted_count} test transactions")
    
    def test_cleanup_test_businesses(self):
        """Cleanup TEST_ prefixed businesses"""
        response = requests.get(f"{BASE_URL}/api/companies/{COMPANY_ID}/businesses?include_archived=true")
        businesses = response.json()
        
        deleted_count = 0
        for b in businesses:
            if b.get("name", "").startswith("TEST_"):
                requests.delete(f"{BASE_URL}/api/businesses/{b['id']}")
                deleted_count += 1
        
        print(f"✓ Cleaned up {deleted_count} test businesses")
    
    def test_cleanup_test_vendors(self):
        """Cleanup TEST_ prefixed vendors"""
        response = requests.get(f"{BASE_URL}/api/companies/{COMPANY_ID}/vendors?include_archived=true")
        vendors = response.json()
        
        deleted_count = 0
        for v in vendors:
            if v.get("name", "").startswith("TEST_"):
                requests.delete(f"{BASE_URL}/api/vendors/{v['id']}")
                deleted_count += 1
        
        print(f"✓ Cleaned up {deleted_count} test vendors")


if __name__ == "__main__":
    pytest.main([__file__, "-v", "--tb=short"])
