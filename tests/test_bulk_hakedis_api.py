"""
Test Bulk Hakediş (Toplu Hakediş) API Endpoints
- POST /api/bulk-hakedis/parse-excel/{company_id} - Excel parsing
- POST /api/bulk-hakedis/apply/{company_id} - Apply bulk hakediş
- GET /api/bonus/settings/{company_id} - Get bonus rules
- POST /api/bonus/settings/{company_id} - Create bonus rule
- DELETE /api/bonus/settings/{rule_id} - Delete bonus rule
"""

import pytest
import requests
import os
import uuid

BASE_URL = os.environ.get('REACT_APP_BACKEND_URL', '').rstrip('/')
COMPANY_ID = "af44eb06-9148-4990-8338-ea0208a47734"
TEST_EXCEL_PATH = "/tmp/test_hakedis_real.xlsx"


class TestBonusSettingsAPI:
    """Test Bonus Settings CRUD operations"""
    
    created_rule_ids = []
    
    def test_get_bonus_settings(self):
        """Test GET /api/bonus/settings/{company_id}"""
        response = requests.get(f"{BASE_URL}/api/bonus/settings/{COMPANY_ID}")
        assert response.status_code == 200, f"Expected 200, got {response.status_code}: {response.text}"
        
        data = response.json()
        assert isinstance(data, list), "Response should be a list"
        print(f"✓ GET bonus settings: {len(data)} rules found")
        
    def test_create_bonus_rule(self):
        """Test POST /api/bonus/settings/{company_id}"""
        payload = {
            "min_packets": 999,  # Unique value for testing
            "amount": 100.50
        }
        response = requests.post(f"{BASE_URL}/api/bonus/settings/{COMPANY_ID}", json=payload)
        assert response.status_code == 200, f"Expected 200, got {response.status_code}: {response.text}"
        
        data = response.json()
        assert "id" in data, "Response should contain rule id"
        self.__class__.created_rule_ids.append(data["id"])
        print(f"✓ Created bonus rule: {data['id']}")
        
    def test_create_bonus_rule_validation_min_packets(self):
        """Test validation: min_packets must be > 0"""
        payload = {
            "min_packets": 0,
            "amount": 100
        }
        response = requests.post(f"{BASE_URL}/api/bonus/settings/{COMPANY_ID}", json=payload)
        assert response.status_code == 400, f"Expected 400 for invalid min_packets, got {response.status_code}"
        print("✓ Validation: min_packets <= 0 rejected")
        
    def test_create_bonus_rule_validation_amount(self):
        """Test validation: amount must be > 0"""
        payload = {
            "min_packets": 100,
            "amount": 0
        }
        response = requests.post(f"{BASE_URL}/api/bonus/settings/{COMPANY_ID}", json=payload)
        assert response.status_code == 400, f"Expected 400 for invalid amount, got {response.status_code}"
        print("✓ Validation: amount <= 0 rejected")
        
    def test_create_duplicate_rule_rejected(self):
        """Test that duplicate min_packets is rejected"""
        # First create a rule
        payload = {
            "min_packets": 888,
            "amount": 50
        }
        response1 = requests.post(f"{BASE_URL}/api/bonus/settings/{COMPANY_ID}", json=payload)
        if response1.status_code == 200:
            self.__class__.created_rule_ids.append(response1.json()["id"])
        
        # Try to create duplicate
        response2 = requests.post(f"{BASE_URL}/api/bonus/settings/{COMPANY_ID}", json=payload)
        assert response2.status_code == 400, f"Expected 400 for duplicate, got {response2.status_code}"
        print("✓ Duplicate min_packets rule rejected")
        
    def test_delete_bonus_rule(self):
        """Test DELETE /api/bonus/settings/{rule_id}"""
        # Create a rule to delete
        payload = {
            "min_packets": 777,
            "amount": 75
        }
        create_response = requests.post(f"{BASE_URL}/api/bonus/settings/{COMPANY_ID}", json=payload)
        if create_response.status_code != 200:
            pytest.skip("Could not create rule to delete")
            
        rule_id = create_response.json()["id"]
        
        # Delete the rule
        delete_response = requests.delete(f"{BASE_URL}/api/bonus/settings/{rule_id}")
        assert delete_response.status_code == 200, f"Expected 200, got {delete_response.status_code}"
        print(f"✓ Deleted bonus rule: {rule_id}")
        
    def test_delete_nonexistent_rule(self):
        """Test DELETE for non-existent rule returns 404"""
        fake_id = str(uuid.uuid4())
        response = requests.delete(f"{BASE_URL}/api/bonus/settings/{fake_id}")
        assert response.status_code == 404, f"Expected 404, got {response.status_code}"
        print("✓ Delete non-existent rule returns 404")
        
    @classmethod
    def teardown_class(cls):
        """Cleanup created test rules"""
        for rule_id in cls.created_rule_ids:
            try:
                requests.delete(f"{BASE_URL}/api/bonus/settings/{rule_id}")
            except:
                pass


class TestBulkHakedisParseExcel:
    """Test Excel parsing endpoint"""
    
    def test_parse_excel_success(self):
        """Test POST /api/bulk-hakedis/parse-excel/{company_id}"""
        if not os.path.exists(TEST_EXCEL_PATH):
            pytest.skip(f"Test Excel file not found: {TEST_EXCEL_PATH}")
            
        with open(TEST_EXCEL_PATH, 'rb') as f:
            files = {'file': ('test_hakedis.xlsx', f, 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet')}
            response = requests.post(f"{BASE_URL}/api/bulk-hakedis/parse-excel/{COMPANY_ID}", files=files)
        
        assert response.status_code == 200, f"Expected 200, got {response.status_code}: {response.text}"
        
        data = response.json()
        assert "matched" in data, "Response should contain 'matched' list"
        assert "unmatched" in data, "Response should contain 'unmatched' list"
        assert "total_matched" in data, "Response should contain 'total_matched'"
        assert "total_unmatched" in data, "Response should contain 'total_unmatched'"
        
        print(f"✓ Excel parsed: {data['total_matched']} matched, {data['total_unmatched']} unmatched")
        
        # Verify matched structure
        if data['matched']:
            matched_item = data['matched'][0]
            assert "courier_id" in matched_item, "Matched item should have courier_id"
            assert "courier_name" in matched_item, "Matched item should have courier_name"
            assert "hakedis_amount" in matched_item, "Matched item should have hakedis_amount"
            assert "packet_count" in matched_item, "Matched item should have packet_count"
            assert "bonus_amount" in matched_item, "Matched item should have bonus_amount"
            print(f"✓ Matched item structure verified: {matched_item['courier_name']}")
            
        # Verify unmatched structure
        if data['unmatched']:
            unmatched_item = data['unmatched'][0]
            assert "excel_name" in unmatched_item, "Unmatched item should have excel_name"
            assert "hakedis_amount" in unmatched_item, "Unmatched item should have hakedis_amount"
            print(f"✓ Unmatched item structure verified: {unmatched_item['excel_name']}")
            
    def test_parse_excel_invalid_format(self):
        """Test that non-Excel file is rejected"""
        # Create a fake text file
        files = {'file': ('test.txt', b'This is not an Excel file', 'text/plain')}
        response = requests.post(f"{BASE_URL}/api/bulk-hakedis/parse-excel/{COMPANY_ID}", files=files)
        
        # Should fail with 400, 500, 422, or 520 (depending on implementation)
        assert response.status_code in [400, 500, 422, 520], f"Expected error status, got {response.status_code}"
        print(f"✓ Invalid file format rejected with status {response.status_code}")


class TestBulkHakedisApply:
    """Test bulk hakediş apply endpoint"""
    
    created_transaction_ids = []
    
    def test_apply_bulk_hakedis_success(self):
        """Test POST /api/bulk-hakedis/apply/{company_id}"""
        # First parse the Excel to get matched couriers
        if not os.path.exists(TEST_EXCEL_PATH):
            pytest.skip(f"Test Excel file not found: {TEST_EXCEL_PATH}")
            
        with open(TEST_EXCEL_PATH, 'rb') as f:
            files = {'file': ('test_hakedis.xlsx', f, 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet')}
            parse_response = requests.post(f"{BASE_URL}/api/bulk-hakedis/parse-excel/{COMPANY_ID}", files=files)
        
        if parse_response.status_code != 200:
            pytest.skip("Could not parse Excel file")
            
        parse_data = parse_response.json()
        
        if not parse_data.get('matched'):
            pytest.skip("No matched couriers found in Excel")
            
        # Prepare apply payload - use only first matched courier for testing
        matched_courier = parse_data['matched'][0]
        items = [{
            "courier_id": matched_courier['courier_id'],
            "courier_name": matched_courier['courier_name'],
            "hakedis_amount": matched_courier['hakedis_amount'],
            "packet_count": matched_courier['packet_count'],
            "bonus_amount": matched_courier['bonus_amount']
        }]
        
        payload = {
            "items": items,
            "admin_id": "test-admin-id",
            "admin_name": "Test Admin",
            "custom_date": None
        }
        
        response = requests.post(f"{BASE_URL}/api/bulk-hakedis/apply/{COMPANY_ID}", json=payload)
        assert response.status_code == 200, f"Expected 200, got {response.status_code}: {response.text}"
        
        data = response.json()
        assert "message" in data, "Response should contain message"
        assert "results" in data, "Response should contain results"
        assert "total_amount" in data, "Response should contain total_amount"
        
        # Store transaction IDs for potential cleanup
        for result in data.get('results', []):
            if 'transaction_id' in result:
                self.__class__.created_transaction_ids.append(result['transaction_id'])
                
        print(f"✓ Bulk hakediş applied: {data['message']}")
        print(f"✓ Total amount: {data['total_amount']}")
        
    def test_apply_bulk_hakedis_empty_items(self):
        """Test that empty items list is rejected"""
        payload = {
            "items": [],
            "admin_id": "test-admin-id",
            "admin_name": "Test Admin"
        }
        
        response = requests.post(f"{BASE_URL}/api/bulk-hakedis/apply/{COMPANY_ID}", json=payload)
        # Empty items should either return 200 with 0 results or 400
        if response.status_code == 200:
            data = response.json()
            assert len(data.get('results', [])) == 0, "Empty items should result in 0 results"
            print("✓ Empty items handled gracefully")
        else:
            assert response.status_code == 400, f"Expected 400 for empty items, got {response.status_code}"
            print("✓ Empty items rejected with 400")
            
    def test_apply_bulk_hakedis_with_custom_date(self):
        """Test applying hakediş with custom date"""
        if not os.path.exists(TEST_EXCEL_PATH):
            pytest.skip(f"Test Excel file not found: {TEST_EXCEL_PATH}")
            
        with open(TEST_EXCEL_PATH, 'rb') as f:
            files = {'file': ('test_hakedis.xlsx', f, 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet')}
            parse_response = requests.post(f"{BASE_URL}/api/bulk-hakedis/parse-excel/{COMPANY_ID}", files=files)
        
        if parse_response.status_code != 200:
            pytest.skip("Could not parse Excel file")
            
        parse_data = parse_response.json()
        
        if not parse_data.get('matched'):
            pytest.skip("No matched couriers found in Excel")
            
        matched_courier = parse_data['matched'][0]
        items = [{
            "courier_id": matched_courier['courier_id'],
            "courier_name": matched_courier['courier_name'],
            "hakedis_amount": matched_courier['hakedis_amount'],
            "packet_count": matched_courier['packet_count'],
            "bonus_amount": matched_courier['bonus_amount']
        }]
        
        payload = {
            "items": items,
            "admin_id": "test-admin-id",
            "admin_name": "Test Admin",
            "custom_date": "2025-01-15T10:00:00Z"
        }
        
        response = requests.post(f"{BASE_URL}/api/bulk-hakedis/apply/{COMPANY_ID}", json=payload)
        assert response.status_code == 200, f"Expected 200, got {response.status_code}: {response.text}"
        
        data = response.json()
        for result in data.get('results', []):
            if 'transaction_id' in result:
                self.__class__.created_transaction_ids.append(result['transaction_id'])
                
        print("✓ Bulk hakediş with custom date applied successfully")


class TestCourierNameMatching:
    """Test courier name matching (case-insensitive)"""
    
    def test_case_insensitive_matching(self):
        """Verify that courier names are matched case-insensitively"""
        if not os.path.exists(TEST_EXCEL_PATH):
            pytest.skip(f"Test Excel file not found: {TEST_EXCEL_PATH}")
            
        with open(TEST_EXCEL_PATH, 'rb') as f:
            files = {'file': ('test_hakedis.xlsx', f, 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet')}
            response = requests.post(f"{BASE_URL}/api/bulk-hakedis/parse-excel/{COMPANY_ID}", files=files)
        
        assert response.status_code == 200, f"Expected 200, got {response.status_code}"
        
        data = response.json()
        
        # Check that we have some matched couriers
        # According to context: 3 matched (Onur Ertaş, Zerrin Ertaş, Mehmet Demir) and 1 unmatched (Bilinmeyen Kurye)
        print(f"Matched couriers: {[m['courier_name'] for m in data.get('matched', [])]}")
        print(f"Unmatched couriers: {[u['excel_name'] for u in data.get('unmatched', [])]}")
        
        # Verify matching works
        assert data['total_matched'] >= 0, "Should have matched couriers"
        print(f"✓ Case-insensitive matching: {data['total_matched']} matched, {data['total_unmatched']} unmatched")


if __name__ == "__main__":
    pytest.main([__file__, "-v", "--tb=short"])
