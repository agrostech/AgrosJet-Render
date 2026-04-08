"""
Test Courier Document Management Features - Iteration 48
- Reset Contract API: POST /api/contracts/reset-contract/{courier_id}
- Reset Fesih API: POST /api/contracts/reset-fesih/{courier_id}
- Reset Documents API: POST /api/contracts/reset-documents/{courier_id}
- Download Merged PDF: GET /api/documents/courier/{courier_id}/download-merged-pdf
- Document Status: GET /api/documents/courier/{courier_id}/status
- Contract Status with fesih: GET /api/contracts/status/{courier_id}
"""
import pytest
import requests
import os

BASE_URL = os.environ.get('REACT_APP_BACKEND_URL', '').rstrip('/')

# Test credentials
COURIER_PHONE = "05553337766"  # Test courier from request
COURIER_PASSWORD = "123456"
TEST_COURIER_ID = "f7188370-b3c6-46e9-bd49-acf3e18c1df7"  # Test courier ID from request
ADMIN_USERNAME = "admin"
ADMIN_PASSWORD = "123456"
SYSTEM_ADMIN_USERNAME = "onurertas"
SYSTEM_ADMIN_PASSWORD = "Delivery32.."


class TestContractStatusWithFesih:
    """Test GET /api/contracts/status/{courier_id} returns contract and fesih status"""
    
    @pytest.fixture
    def admin_token(self):
        """Get admin auth token"""
        response = requests.post(f"{BASE_URL}/api/auth/admin/login", json={
            "username": ADMIN_USERNAME,
            "password": ADMIN_PASSWORD
        })
        if response.status_code == 200:
            return response.json()["token"]
        pytest.skip("Admin login failed")
    
    def test_contract_status_returns_fesih_accepted(self, admin_token):
        """Verify contract status API returns fesih_accepted field"""
        response = requests.get(
            f"{BASE_URL}/api/contracts/status/{TEST_COURIER_ID}",
            headers={"Authorization": f"Bearer {admin_token}"}
        )
        
        assert response.status_code == 200, f"Contract status failed: {response.text}"
        data = response.json()
        
        # Verify required fields
        assert "accepted" in data, "Missing 'accepted' in contract status response"
        assert "fesih_accepted" in data, "Missing 'fesih_accepted' in contract status response"
        
        print(f"Contract status for {TEST_COURIER_ID}:")
        print(f"  accepted: {data['accepted']}")
        print(f"  fesih_accepted: {data['fesih_accepted']}")
        print(f"  accepted_at: {data.get('accepted_at')}")
        print(f"  fesih_accepted_at: {data.get('fesih_accepted_at')}")
        
        if data.get("contract"):
            print(f"  contract r2_key: {data['contract'].get('r2_key')}")
    
    def test_contract_status_invalid_courier_returns_404(self, admin_token):
        """Verify contract status returns 404 for invalid courier"""
        response = requests.get(
            f"{BASE_URL}/api/contracts/status/invalid-courier-id-xyz",
            headers={"Authorization": f"Bearer {admin_token}"}
        )
        
        assert response.status_code == 404, f"Expected 404, got {response.status_code}"


class TestResetContractAPI:
    """Test POST /api/contracts/reset-contract/{courier_id}"""
    
    @pytest.fixture
    def admin_token(self):
        """Get admin auth token"""
        response = requests.post(f"{BASE_URL}/api/auth/admin/login", json={
            "username": ADMIN_USERNAME,
            "password": ADMIN_PASSWORD
        })
        if response.status_code == 200:
            return response.json()["token"]
        pytest.skip("Admin login failed")
    
    def test_reset_contract_endpoint_exists(self, admin_token):
        """Verify reset-contract endpoint exists and responds"""
        # Use a non-existent courier to avoid modifying real data
        response = requests.post(
            f"{BASE_URL}/api/contracts/reset-contract/test-nonexistent-courier",
            headers={"Authorization": f"Bearer {admin_token}"}
        )
        
        # Should return 404 for non-existent courier, not 405 (method not allowed)
        assert response.status_code == 404, f"Expected 404, got {response.status_code}: {response.text}"
        print("Reset contract endpoint exists and returns 404 for invalid courier")
    
    def test_reset_contract_requires_auth(self):
        """Verify reset-contract requires authentication"""
        response = requests.post(
            f"{BASE_URL}/api/contracts/reset-contract/{TEST_COURIER_ID}"
        )
        
        # Should return 401 or 403 without auth
        assert response.status_code in [401, 403], f"Expected 401/403, got {response.status_code}"


class TestResetFesihAPI:
    """Test POST /api/contracts/reset-fesih/{courier_id}"""
    
    @pytest.fixture
    def admin_token(self):
        """Get admin auth token"""
        response = requests.post(f"{BASE_URL}/api/auth/admin/login", json={
            "username": ADMIN_USERNAME,
            "password": ADMIN_PASSWORD
        })
        if response.status_code == 200:
            return response.json()["token"]
        pytest.skip("Admin login failed")
    
    def test_reset_fesih_endpoint_exists(self, admin_token):
        """Verify reset-fesih endpoint exists and responds"""
        response = requests.post(
            f"{BASE_URL}/api/contracts/reset-fesih/test-nonexistent-courier",
            headers={"Authorization": f"Bearer {admin_token}"}
        )
        
        # Should return 404 for non-existent courier
        assert response.status_code == 404, f"Expected 404, got {response.status_code}: {response.text}"
        print("Reset fesih endpoint exists and returns 404 for invalid courier")
    
    def test_reset_fesih_requires_auth(self):
        """Verify reset-fesih requires authentication"""
        response = requests.post(
            f"{BASE_URL}/api/contracts/reset-fesih/{TEST_COURIER_ID}"
        )
        
        assert response.status_code in [401, 403], f"Expected 401/403, got {response.status_code}"


class TestResetDocumentsAPI:
    """Test POST /api/contracts/reset-documents/{courier_id}"""
    
    @pytest.fixture
    def admin_token(self):
        """Get admin auth token"""
        response = requests.post(f"{BASE_URL}/api/auth/admin/login", json={
            "username": ADMIN_USERNAME,
            "password": ADMIN_PASSWORD
        })
        if response.status_code == 200:
            return response.json()["token"]
        pytest.skip("Admin login failed")
    
    def test_reset_documents_endpoint_exists(self, admin_token):
        """Verify reset-documents endpoint exists and responds"""
        response = requests.post(
            f"{BASE_URL}/api/contracts/reset-documents/test-nonexistent-courier",
            headers={"Authorization": f"Bearer {admin_token}"}
        )
        
        # Should return 404 for non-existent courier
        assert response.status_code == 404, f"Expected 404, got {response.status_code}: {response.text}"
        print("Reset documents endpoint exists and returns 404 for invalid courier")
    
    def test_reset_documents_requires_auth(self):
        """Verify reset-documents requires authentication"""
        response = requests.post(
            f"{BASE_URL}/api/contracts/reset-documents/{TEST_COURIER_ID}"
        )
        
        assert response.status_code in [401, 403], f"Expected 401/403, got {response.status_code}"


class TestDownloadMergedPDF:
    """Test GET /api/documents/courier/{courier_id}/download-merged-pdf"""
    
    @pytest.fixture
    def admin_token(self):
        """Get admin auth token"""
        response = requests.post(f"{BASE_URL}/api/auth/admin/login", json={
            "username": ADMIN_USERNAME,
            "password": ADMIN_PASSWORD
        })
        if response.status_code == 200:
            return response.json()["token"]
        pytest.skip("Admin login failed")
    
    def test_download_merged_pdf_returns_pdf(self, admin_token):
        """Verify merged PDF download returns valid PDF"""
        response = requests.get(
            f"{BASE_URL}/api/documents/courier/{TEST_COURIER_ID}/download-merged-pdf",
            headers={"Authorization": f"Bearer {admin_token}"}
        )
        
        # Could be 200 (success) or 404 (no documents)
        if response.status_code == 404:
            print(f"No documents found for courier: {response.json().get('detail')}")
            pytest.skip("No documents to merge")
        
        assert response.status_code == 200, f"Merged PDF download failed: {response.text}"
        
        # Verify content type is PDF
        content_type = response.headers.get("content-type", "")
        assert "application/pdf" in content_type, f"Expected PDF content-type, got {content_type}"
        
        # Verify content is not empty
        assert len(response.content) > 1000, f"PDF content too small: {len(response.content)} bytes"
        
        # Verify PDF magic bytes
        assert response.content[:4] == b'%PDF', "Content does not start with PDF magic bytes"
        
        # Check content-disposition header
        content_disposition = response.headers.get("content-disposition", "")
        print(f"Merged PDF downloaded - size: {len(response.content)} bytes")
        print(f"Content-Disposition: {content_disposition}")
    
    def test_download_merged_pdf_invalid_courier(self, admin_token):
        """Verify merged PDF returns 404 for invalid courier"""
        response = requests.get(
            f"{BASE_URL}/api/documents/courier/invalid-courier-xyz/download-merged-pdf",
            headers={"Authorization": f"Bearer {admin_token}"}
        )
        
        assert response.status_code == 404, f"Expected 404, got {response.status_code}"
    
    def test_download_merged_pdf_requires_auth(self):
        """Verify merged PDF download requires authentication"""
        response = requests.get(
            f"{BASE_URL}/api/documents/courier/{TEST_COURIER_ID}/download-merged-pdf"
        )
        
        assert response.status_code in [401, 403], f"Expected 401/403, got {response.status_code}"


class TestDocumentStatus:
    """Test GET /api/documents/courier/{courier_id}/status"""
    
    @pytest.fixture
    def admin_token(self):
        """Get admin auth token"""
        response = requests.post(f"{BASE_URL}/api/auth/admin/login", json={
            "username": ADMIN_USERNAME,
            "password": ADMIN_PASSWORD
        })
        if response.status_code == 200:
            return response.json()["token"]
        pytest.skip("Admin login failed")
    
    def test_document_status_returns_all_complete(self, admin_token):
        """Verify document status API returns all_complete field"""
        response = requests.get(
            f"{BASE_URL}/api/documents/courier/{TEST_COURIER_ID}/status",
            headers={"Authorization": f"Bearer {admin_token}"}
        )
        
        assert response.status_code == 200, f"Document status failed: {response.text}"
        data = response.json()
        
        # Verify required fields
        assert "all_complete" in data, "Missing 'all_complete' in document status response"
        assert "total_required" in data, "Missing 'total_required' in document status response"
        assert "total_uploaded" in data, "Missing 'total_uploaded' in document status response"
        assert "progress_percent" in data, "Missing 'progress_percent' in document status response"
        assert "details" in data, "Missing 'details' in document status response"
        
        print(f"Document status for {TEST_COURIER_ID}:")
        print(f"  all_complete: {data['all_complete']}")
        print(f"  total_required: {data['total_required']}")
        print(f"  total_uploaded: {data['total_uploaded']}")
        print(f"  progress_percent: {data['progress_percent']}%")
        
        # Verify details structure
        details = data["details"]
        assert isinstance(details, dict), "details should be a dictionary"
        
        for doc_type, doc_status in details.items():
            print(f"  {doc_type}: {doc_status.get('uploaded')}/{doc_status.get('required')} - complete: {doc_status.get('is_complete')}")
    
    def test_document_status_invalid_courier(self, admin_token):
        """Verify document status returns empty for invalid courier (not 404)"""
        response = requests.get(
            f"{BASE_URL}/api/documents/courier/invalid-courier-xyz/status",
            headers={"Authorization": f"Bearer {admin_token}"}
        )
        
        # Document status may return 200 with empty data or 404
        assert response.status_code in [200, 404], f"Unexpected status: {response.status_code}"


class TestDownloadAllDocumentsZIP:
    """Test GET /api/documents/courier/{courier_id}/download-all (ZIP)"""
    
    @pytest.fixture
    def admin_token(self):
        """Get admin auth token"""
        response = requests.post(f"{BASE_URL}/api/auth/admin/login", json={
            "username": ADMIN_USERNAME,
            "password": ADMIN_PASSWORD
        })
        if response.status_code == 200:
            return response.json()["token"]
        pytest.skip("Admin login failed")
    
    def test_download_all_returns_zip(self, admin_token):
        """Verify download-all returns valid ZIP file"""
        response = requests.get(
            f"{BASE_URL}/api/documents/courier/{TEST_COURIER_ID}/download-all",
            headers={"Authorization": f"Bearer {admin_token}"}
        )
        
        if response.status_code == 404:
            print(f"No documents found: {response.json().get('detail')}")
            pytest.skip("No documents to download")
        
        assert response.status_code == 200, f"Download all failed: {response.text}"
        
        # Verify content type is ZIP
        content_type = response.headers.get("content-type", "")
        assert "application/zip" in content_type, f"Expected ZIP content-type, got {content_type}"
        
        # Verify ZIP magic bytes (PK)
        assert response.content[:2] == b'PK', "Content does not start with ZIP magic bytes"
        
        print(f"ZIP downloaded - size: {len(response.content)} bytes")


class TestContractPDFView:
    """Test GET /api/contracts/pdf/{courier_id} for admin viewing"""
    
    @pytest.fixture
    def admin_token(self):
        """Get admin auth token"""
        response = requests.post(f"{BASE_URL}/api/auth/admin/login", json={
            "username": ADMIN_USERNAME,
            "password": ADMIN_PASSWORD
        })
        if response.status_code == 200:
            return response.json()["token"]
        pytest.skip("Admin login failed")
    
    def test_contract_pdf_returns_pdf_for_accepted_contract(self, admin_token):
        """Verify contract PDF API returns PDF when contract is accepted"""
        # First check if contract is accepted
        status_response = requests.get(
            f"{BASE_URL}/api/contracts/status/{TEST_COURIER_ID}",
            headers={"Authorization": f"Bearer {admin_token}"}
        )
        
        if status_response.status_code != 200:
            pytest.skip("Could not get contract status")
        
        status_data = status_response.json()
        if not status_data.get("accepted"):
            pytest.skip("Contract not accepted for this courier")
        
        # Now get the PDF
        response = requests.get(
            f"{BASE_URL}/api/contracts/pdf/{TEST_COURIER_ID}",
            headers={"Authorization": f"Bearer {admin_token}"}
        )
        
        assert response.status_code == 200, f"Contract PDF failed: {response.text}"
        
        # Verify content type is PDF
        content_type = response.headers.get("content-type", "")
        assert "application/pdf" in content_type, f"Expected PDF content-type, got {content_type}"
        
        # Verify PDF magic bytes
        assert response.content[:4] == b'%PDF', "Content does not start with PDF magic bytes"
        
        print(f"Contract PDF retrieved - size: {len(response.content)} bytes")


class TestCourierDocumentsList:
    """Test GET /api/documents/courier/{courier_id}"""
    
    @pytest.fixture
    def admin_token(self):
        """Get admin auth token"""
        response = requests.post(f"{BASE_URL}/api/auth/admin/login", json={
            "username": ADMIN_USERNAME,
            "password": ADMIN_PASSWORD
        })
        if response.status_code == 200:
            return response.json()["token"]
        pytest.skip("Admin login failed")
    
    def test_get_courier_documents_list(self, admin_token):
        """Verify documents list API returns document array"""
        response = requests.get(
            f"{BASE_URL}/api/documents/courier/{TEST_COURIER_ID}",
            headers={"Authorization": f"Bearer {admin_token}"}
        )
        
        assert response.status_code == 200, f"Documents list failed: {response.text}"
        data = response.json()
        
        assert isinstance(data, list), "Response should be a list"
        
        print(f"Documents for {TEST_COURIER_ID}: {len(data)} documents")
        
        for doc in data:
            print(f"  - {doc.get('document_type')}: {doc.get('file_name')}")
            assert "id" in doc, "Document missing 'id'"
            assert "document_type" in doc, "Document missing 'document_type'"
            assert "file_name" in doc, "Document missing 'file_name'"


if __name__ == "__main__":
    pytest.main([__file__, "-v", "--tb=short"])
