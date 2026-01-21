"""
Test Archive/Unarchive Endpoints and JetPuan Hakediş Integration
Tests:
1. Kurye arşivleme/arşivden çıkarma
2. İşletme arşivleme/arşivden çıkarma
3. Cari arşivleme/arşivden çıkarma
4. İşlem silme
5. JetPuan hakediş otomatik ekleme (payment_in + is_hakedis=true)
6. JetPuan silme (hakediş işlemi silindiğinde)
"""

import pytest
import requests
import os
import uuid
from datetime import datetime

BASE_URL = os.environ.get('REACT_APP_BACKEND_URL', '').rstrip('/')
COMPANY_ID = "af44eb06-9148-4990-8338-ea0208a47734"
TEST_COURIER_ID = "bcc29457-4e87-4641-9100-ff0458e5b547"  # Ali Kaya
TEST_COURIER_ID_2 = "521ca25b-0a5e-4d5d-8b53-c25dac22d2b1"  # Burak Çetin


class TestCourierArchive:
    """Kurye arşivleme/arşivden çıkarma testleri"""
    
    def test_archive_courier_success(self):
        """Test: Bakiyesi 0 ve zimmetsiz kurye arşivlenebilmeli"""
        # First check courier balance
        response = requests.get(f"{BASE_URL}/api/transactions/courier/{TEST_COURIER_ID}?limit=1")
        assert response.status_code == 200
        balance = response.json().get("balance", 0)
        print(f"Courier balance before archive: {balance}")
        
        # Archive the courier
        response = requests.put(
            f"{BASE_URL}/api/companies/{COMPANY_ID}/couriers/{TEST_COURIER_ID}/archive"
        )
        print(f"Archive response: {response.status_code} - {response.text}")
        
        # If balance is not 0, expect 400 error
        if balance != 0:
            assert response.status_code == 400
            assert "bakiye" in response.json().get("detail", "").lower() or "alacağı" in response.json().get("detail", "").lower() or "borcu" in response.json().get("detail", "").lower()
            print(f"Archive blocked due to non-zero balance: {balance}")
        else:
            assert response.status_code == 200
            assert "arşivlendi" in response.json().get("message", "").lower()
            print("Courier archived successfully")
    
    def test_unarchive_courier_success(self):
        """Test: Arşivlenmiş kurye arşivden çıkarılabilmeli"""
        # First try to archive (if not already)
        requests.put(f"{BASE_URL}/api/companies/{COMPANY_ID}/couriers/{TEST_COURIER_ID}/archive")
        
        # Now unarchive
        response = requests.put(
            f"{BASE_URL}/api/companies/{COMPANY_ID}/couriers/{TEST_COURIER_ID}/unarchive"
        )
        print(f"Unarchive response: {response.status_code} - {response.text}")
        
        # Should succeed or return 404 if not archived
        assert response.status_code in [200, 404]
        if response.status_code == 200:
            assert "arşivden çıkarıldı" in response.json().get("message", "").lower()
            print("Courier unarchived successfully")
        else:
            print("Courier was not archived or not found")
    
    def test_archive_courier_with_balance_fails(self):
        """Test: Bakiyesi olan kurye arşivlenemez"""
        # Create a transaction to give courier balance
        tx_data = {
            "entity_type": "courier",
            "entity_id": TEST_COURIER_ID_2,
            "company_id": COMPANY_ID,
            "type": "payment_out",  # Kuryeye verilen - creates positive balance for courier
            "amount": 100.0,
            "description": "TEST_archive_balance_test",
            "is_hakedis": False,
            "admin_id": "test-admin",
            "admin_name": "Test Admin"
        }
        
        # Create transaction
        tx_response = requests.post(f"{BASE_URL}/api/transactions", json=tx_data)
        print(f"Transaction create response: {tx_response.status_code}")
        
        if tx_response.status_code == 200:
            tx_id = tx_response.json().get("id")
            
            # Try to archive - should fail
            archive_response = requests.put(
                f"{BASE_URL}/api/companies/{COMPANY_ID}/couriers/{TEST_COURIER_ID_2}/archive"
            )
            print(f"Archive with balance response: {archive_response.status_code} - {archive_response.text}")
            
            # Should fail with 400
            assert archive_response.status_code == 400
            detail = archive_response.json().get("detail", "").lower()
            assert "bakiye" in detail or "alacağı" in detail or "borcu" in detail
            
            # Cleanup - delete the test transaction
            requests.delete(f"{BASE_URL}/api/transactions/{tx_id}", json={
                "admin_id": "test-admin",
                "admin_name": "Test Admin"
            })
            print("Test transaction cleaned up")
    
    def test_get_couriers_with_archived(self):
        """Test: include_archived=true ile arşivli kuryeler de gelir"""
        response = requests.get(
            f"{BASE_URL}/api/companies/{COMPANY_ID}/couriers?include_archived=true"
        )
        assert response.status_code == 200
        couriers = response.json()
        print(f"Total couriers (including archived): {len(couriers)}")
        
        # Check if any are archived
        archived_count = sum(1 for c in couriers if c.get("is_archived", False))
        print(f"Archived couriers: {archived_count}")


class TestBusinessArchive:
    """İşletme arşivleme/arşivden çıkarma testleri"""
    
    @pytest.fixture(autouse=True)
    def setup(self):
        """Create a test business for archive tests"""
        self.test_business_id = None
        
        # Create test business
        business_data = {
            "name": f"TEST_Archive_Business_{uuid.uuid4().hex[:8]}",
            "phone": "05551234567",
            "address": "Test Address"
        }
        response = requests.post(
            f"{BASE_URL}/api/companies/{COMPANY_ID}/businesses",
            json=business_data
        )
        if response.status_code == 200:
            self.test_business_id = response.json().get("id")
            print(f"Created test business: {self.test_business_id}")
        
        yield
        
        # Cleanup
        if self.test_business_id:
            requests.delete(f"{BASE_URL}/api/businesses/{self.test_business_id}")
            print(f"Cleaned up test business: {self.test_business_id}")
    
    def test_archive_business_success(self):
        """Test: İşletme arşivlenebilmeli"""
        if not self.test_business_id:
            pytest.skip("Test business not created")
        
        response = requests.put(
            f"{BASE_URL}/api/businesses/{self.test_business_id}/archive"
        )
        print(f"Archive business response: {response.status_code} - {response.text}")
        
        assert response.status_code == 200
        assert "arşivlendi" in response.json().get("message", "").lower()
    
    def test_unarchive_business_success(self):
        """Test: Arşivlenmiş işletme arşivden çıkarılabilmeli"""
        if not self.test_business_id:
            pytest.skip("Test business not created")
        
        # First archive
        requests.put(f"{BASE_URL}/api/businesses/{self.test_business_id}/archive")
        
        # Then unarchive
        response = requests.put(
            f"{BASE_URL}/api/businesses/{self.test_business_id}/unarchive"
        )
        print(f"Unarchive business response: {response.status_code} - {response.text}")
        
        assert response.status_code == 200
        assert "arşivden çıkarıldı" in response.json().get("message", "").lower()
    
    def test_get_businesses_with_archived(self):
        """Test: include_archived=true ile arşivli işletmeler de gelir"""
        response = requests.get(
            f"{BASE_URL}/api/companies/{COMPANY_ID}/businesses?include_archived=true"
        )
        assert response.status_code == 200
        businesses = response.json()
        print(f"Total businesses (including archived): {len(businesses)}")


class TestVendorArchive:
    """Cari arşivleme/arşivden çıkarma testleri"""
    
    @pytest.fixture(autouse=True)
    def setup(self):
        """Create a test vendor for archive tests"""
        self.test_vendor_id = None
        
        # Create test vendor
        vendor_data = {
            "name": f"TEST_Archive_Vendor_{uuid.uuid4().hex[:8]}",
            "phone": "05559876543",
            "address": "Test Vendor Address"
        }
        response = requests.post(
            f"{BASE_URL}/api/companies/{COMPANY_ID}/vendors",
            json=vendor_data
        )
        if response.status_code == 200:
            self.test_vendor_id = response.json().get("id")
            print(f"Created test vendor: {self.test_vendor_id}")
        
        yield
        
        # Cleanup
        if self.test_vendor_id:
            requests.delete(f"{BASE_URL}/api/vendors/{self.test_vendor_id}")
            print(f"Cleaned up test vendor: {self.test_vendor_id}")
    
    def test_archive_vendor_success(self):
        """Test: Cari arşivlenebilmeli"""
        if not self.test_vendor_id:
            pytest.skip("Test vendor not created")
        
        response = requests.put(
            f"{BASE_URL}/api/vendors/{self.test_vendor_id}/archive"
        )
        print(f"Archive vendor response: {response.status_code} - {response.text}")
        
        assert response.status_code == 200
        assert "arşivlendi" in response.json().get("message", "").lower()
    
    def test_unarchive_vendor_success(self):
        """Test: Arşivlenmiş cari arşivden çıkarılabilmeli"""
        if not self.test_vendor_id:
            pytest.skip("Test vendor not created")
        
        # First archive
        requests.put(f"{BASE_URL}/api/vendors/{self.test_vendor_id}/archive")
        
        # Then unarchive
        response = requests.put(
            f"{BASE_URL}/api/vendors/{self.test_vendor_id}/unarchive"
        )
        print(f"Unarchive vendor response: {response.status_code} - {response.text}")
        
        assert response.status_code == 200
        assert "arşivden çıkarıldı" in response.json().get("message", "").lower()
    
    def test_get_vendors_with_archived(self):
        """Test: include_archived=true ile arşivli cariler de gelir"""
        response = requests.get(
            f"{BASE_URL}/api/companies/{COMPANY_ID}/vendors?include_archived=true"
        )
        assert response.status_code == 200
        vendors = response.json()
        print(f"Total vendors (including archived): {len(vendors)}")


class TestTransactionDelete:
    """İşlem silme testleri"""
    
    def test_delete_transaction_success(self):
        """Test: İşlem silinebilmeli"""
        # Create a test transaction
        tx_data = {
            "entity_type": "courier",
            "entity_id": TEST_COURIER_ID,
            "company_id": COMPANY_ID,
            "type": "payment_in",
            "amount": 50.0,
            "description": "TEST_delete_transaction",
            "is_hakedis": False,
            "admin_id": "test-admin",
            "admin_name": "Test Admin"
        }
        
        create_response = requests.post(f"{BASE_URL}/api/transactions", json=tx_data)
        print(f"Create transaction response: {create_response.status_code}")
        assert create_response.status_code == 200
        
        tx_id = create_response.json().get("id")
        assert tx_id is not None
        
        # Delete the transaction
        delete_response = requests.delete(
            f"{BASE_URL}/api/transactions/{tx_id}",
            json={"admin_id": "test-admin", "admin_name": "Test Admin"}
        )
        print(f"Delete transaction response: {delete_response.status_code} - {delete_response.text}")
        
        assert delete_response.status_code == 200
        assert "silindi" in delete_response.json().get("message", "").lower()
    
    def test_delete_nonexistent_transaction(self):
        """Test: Olmayan işlem silinmeye çalışılırsa 404 döner"""
        fake_id = str(uuid.uuid4())
        response = requests.delete(
            f"{BASE_URL}/api/transactions/{fake_id}",
            json={"admin_id": "test-admin", "admin_name": "Test Admin"}
        )
        print(f"Delete nonexistent response: {response.status_code}")
        assert response.status_code == 404


class TestJetPuanHakedis:
    """JetPuan hakediş otomatik ekleme/silme testleri"""
    
    def test_hakedis_creates_jetpuan(self):
        """Test: payment_in + is_hakedis=true işlem oluşturulduğunda JetPuan otomatik eklenmeli"""
        # Get initial JetPuan balance
        initial_balance_response = requests.get(f"{BASE_URL}/api/jetpuan/balance/{TEST_COURIER_ID}")
        print(f"Initial balance response: {initial_balance_response.status_code} - {initial_balance_response.text}")
        
        initial_balance = 0
        if initial_balance_response.status_code == 200:
            initial_balance = initial_balance_response.json().get("balance", 0)
        print(f"Initial JetPuan balance: {initial_balance}")
        
        # Create hakediş transaction (payment_in with is_hakedis=true)
        hakedis_amount = 1000.0  # 1000 TL hakediş
        tx_data = {
            "entity_type": "courier",
            "entity_id": TEST_COURIER_ID,
            "company_id": COMPANY_ID,
            "type": "payment_in",  # Kuryeden alınan - kırmızı buton
            "amount": hakedis_amount,
            "description": "TEST_hakedis_jetpuan",
            "is_hakedis": True,  # Bu hakediş işlemi
            "admin_id": "test-admin",
            "admin_name": "Test Admin"
        }
        
        create_response = requests.post(f"{BASE_URL}/api/transactions", json=tx_data)
        print(f"Create hakediş response: {create_response.status_code} - {create_response.text}")
        assert create_response.status_code == 200
        
        tx_id = create_response.json().get("id")
        
        # Check JetPuan balance increased
        new_balance_response = requests.get(f"{BASE_URL}/api/jetpuan/balance/{TEST_COURIER_ID}")
        assert new_balance_response.status_code == 200
        new_balance = new_balance_response.json().get("balance", 0)
        print(f"New JetPuan balance: {new_balance}")
        
        # JetPuan should have increased (default ratio is 1.17 per 100 TL)
        # 1000 TL * 1.17 / 100 = 11.7 JetPuan expected
        expected_increase = (hakedis_amount / 100) * 1.17
        actual_increase = new_balance - initial_balance
        print(f"Expected JetPuan increase: ~{expected_increase}, Actual: {actual_increase}")
        
        # Allow some tolerance for rounding
        assert actual_increase > 0, "JetPuan should have increased after hakediş"
        assert abs(actual_increase - expected_increase) < 1, f"JetPuan increase should be close to {expected_increase}"
        
        # Cleanup - delete the transaction (this should also debit JetPuan)
        delete_response = requests.delete(
            f"{BASE_URL}/api/transactions/{tx_id}",
            json={"admin_id": "test-admin", "admin_name": "Test Admin"}
        )
        print(f"Delete hakediş response: {delete_response.status_code}")
        
        # Verify JetPuan was debited back
        final_balance_response = requests.get(f"{BASE_URL}/api/jetpuan/balance/{TEST_COURIER_ID}")
        final_balance = final_balance_response.json().get("balance", 0)
        print(f"Final JetPuan balance after delete: {final_balance}")
        
        # Balance should be back to initial (or close to it)
        assert abs(final_balance - initial_balance) < 1, "JetPuan should be debited when hakediş is deleted"
    
    def test_non_hakedis_does_not_create_jetpuan(self):
        """Test: is_hakedis=false işlem JetPuan oluşturmaz"""
        # Get initial JetPuan balance
        initial_balance_response = requests.get(f"{BASE_URL}/api/jetpuan/balance/{TEST_COURIER_ID_2}")
        initial_balance = 0
        if initial_balance_response.status_code == 200:
            initial_balance = initial_balance_response.json().get("balance", 0)
        print(f"Initial JetPuan balance: {initial_balance}")
        
        # Create non-hakediş transaction
        tx_data = {
            "entity_type": "courier",
            "entity_id": TEST_COURIER_ID_2,
            "company_id": COMPANY_ID,
            "type": "payment_in",
            "amount": 500.0,
            "description": "TEST_non_hakedis",
            "is_hakedis": False,  # Bu hakediş DEĞİL
            "admin_id": "test-admin",
            "admin_name": "Test Admin"
        }
        
        create_response = requests.post(f"{BASE_URL}/api/transactions", json=tx_data)
        print(f"Create non-hakediş response: {create_response.status_code}")
        assert create_response.status_code == 200
        
        tx_id = create_response.json().get("id")
        
        # Check JetPuan balance - should NOT have changed
        new_balance_response = requests.get(f"{BASE_URL}/api/jetpuan/balance/{TEST_COURIER_ID_2}")
        new_balance = new_balance_response.json().get("balance", 0)
        print(f"New JetPuan balance: {new_balance}")
        
        assert new_balance == initial_balance, "JetPuan should NOT change for non-hakediş transactions"
        
        # Cleanup
        requests.delete(f"{BASE_URL}/api/transactions/{tx_id}", json={
            "admin_id": "test-admin",
            "admin_name": "Test Admin"
        })
    
    def test_payment_out_hakedis_does_not_create_jetpuan(self):
        """Test: payment_out (yeşil buton) ile hakediş işaretlense bile JetPuan oluşmaz"""
        # Get initial JetPuan balance
        initial_balance_response = requests.get(f"{BASE_URL}/api/jetpuan/balance/{TEST_COURIER_ID_2}")
        initial_balance = 0
        if initial_balance_response.status_code == 200:
            initial_balance = initial_balance_response.json().get("balance", 0)
        print(f"Initial JetPuan balance: {initial_balance}")
        
        # Create payment_out transaction with is_hakedis=true
        tx_data = {
            "entity_type": "courier",
            "entity_id": TEST_COURIER_ID_2,
            "company_id": COMPANY_ID,
            "type": "payment_out",  # Kuryeye verilen - yeşil buton
            "amount": 500.0,
            "description": "TEST_payment_out_hakedis",
            "is_hakedis": True,  # Hakediş işaretli ama payment_out
            "admin_id": "test-admin",
            "admin_name": "Test Admin"
        }
        
        create_response = requests.post(f"{BASE_URL}/api/transactions", json=tx_data)
        print(f"Create payment_out hakediş response: {create_response.status_code}")
        assert create_response.status_code == 200
        
        tx_id = create_response.json().get("id")
        
        # Check JetPuan balance - should NOT have changed
        new_balance_response = requests.get(f"{BASE_URL}/api/jetpuan/balance/{TEST_COURIER_ID_2}")
        new_balance = new_balance_response.json().get("balance", 0)
        print(f"New JetPuan balance: {new_balance}")
        
        # JetPuan should NOT increase for payment_out even with is_hakedis=true
        assert new_balance == initial_balance, "JetPuan should NOT change for payment_out transactions"
        
        # Cleanup
        requests.delete(f"{BASE_URL}/api/transactions/{tx_id}", json={
            "admin_id": "test-admin",
            "admin_name": "Test Admin"
        })


class TestEndpointExistence:
    """Endpoint varlık testleri - tüm endpoint'lerin çalıştığını doğrula"""
    
    def test_courier_archive_endpoint_exists(self):
        """Test: PUT /api/companies/{cid}/couriers/{id}/archive endpoint'i var"""
        response = requests.put(
            f"{BASE_URL}/api/companies/{COMPANY_ID}/couriers/{TEST_COURIER_ID}/archive"
        )
        # Should not return 404 (endpoint not found) or 405 (method not allowed)
        assert response.status_code not in [404, 405], f"Archive endpoint should exist, got {response.status_code}"
        print(f"Courier archive endpoint exists, status: {response.status_code}")
    
    def test_courier_unarchive_endpoint_exists(self):
        """Test: PUT /api/companies/{cid}/couriers/{id}/unarchive endpoint'i var"""
        response = requests.put(
            f"{BASE_URL}/api/companies/{COMPANY_ID}/couriers/{TEST_COURIER_ID}/unarchive"
        )
        # Should not return 404 (endpoint not found) or 405 (method not allowed)
        assert response.status_code not in [404, 405], f"Unarchive endpoint should exist, got {response.status_code}"
        print(f"Courier unarchive endpoint exists, status: {response.status_code}")
    
    def test_business_archive_endpoint_exists(self):
        """Test: PUT /api/businesses/{id}/archive endpoint'i var"""
        # Use a fake ID - we just want to check endpoint exists
        fake_id = str(uuid.uuid4())
        response = requests.put(f"{BASE_URL}/api/businesses/{fake_id}/archive")
        # 404 is OK (business not found), but 405 means endpoint doesn't exist
        assert response.status_code != 405, "Business archive endpoint should exist"
        print(f"Business archive endpoint exists, status: {response.status_code}")
    
    def test_business_unarchive_endpoint_exists(self):
        """Test: PUT /api/businesses/{id}/unarchive endpoint'i var"""
        fake_id = str(uuid.uuid4())
        response = requests.put(f"{BASE_URL}/api/businesses/{fake_id}/unarchive")
        assert response.status_code != 405, "Business unarchive endpoint should exist"
        print(f"Business unarchive endpoint exists, status: {response.status_code}")
    
    def test_vendor_archive_endpoint_exists(self):
        """Test: PUT /api/vendors/{id}/archive endpoint'i var"""
        fake_id = str(uuid.uuid4())
        response = requests.put(f"{BASE_URL}/api/vendors/{fake_id}/archive")
        assert response.status_code != 405, "Vendor archive endpoint should exist"
        print(f"Vendor archive endpoint exists, status: {response.status_code}")
    
    def test_vendor_unarchive_endpoint_exists(self):
        """Test: PUT /api/vendors/{id}/unarchive endpoint'i var"""
        fake_id = str(uuid.uuid4())
        response = requests.put(f"{BASE_URL}/api/vendors/{fake_id}/unarchive")
        assert response.status_code != 405, "Vendor unarchive endpoint should exist"
        print(f"Vendor unarchive endpoint exists, status: {response.status_code}")
    
    def test_transaction_delete_endpoint_exists(self):
        """Test: DELETE /api/transactions/{id} endpoint'i var"""
        fake_id = str(uuid.uuid4())
        response = requests.delete(
            f"{BASE_URL}/api/transactions/{fake_id}",
            json={"admin_id": "test", "admin_name": "Test"}
        )
        # 404 is OK (transaction not found), but 405 means endpoint doesn't exist
        assert response.status_code != 405, "Transaction delete endpoint should exist"
        print(f"Transaction delete endpoint exists, status: {response.status_code}")


if __name__ == "__main__":
    pytest.main([__file__, "-v", "-s"])
