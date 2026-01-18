"""
Test suite for Documents API (Evraklar feature)
Tests document upload, status, view, delete, and download-all endpoints
"""
import pytest
import requests
import os
import io

BASE_URL = os.environ.get('REACT_APP_BACKEND_URL', '').rstrip('/')

# Test credentials
COURIER_PHONE = "05551234567"
COURIER_PASSWORD = "123456"
ADMIN_USERNAME = "onurertas"
ADMIN_PASSWORD = "Delivery32.."


class TestDocumentsAPI:
    """Test suite for Documents API endpoints"""
    
    courier_id = None
    company_id = None
    uploaded_doc_ids = []
    
    @pytest.fixture(autouse=True)
    def setup(self):
        """Setup test data"""
        self.session = requests.Session()
        self.session.headers.update({"Content-Type": "application/json"})
        yield
        # Cleanup uploaded documents
        for doc_id in self.uploaded_doc_ids:
            try:
                self.session.delete(f"{BASE_URL}/api/documents/{doc_id}")
            except:
                pass
        self.uploaded_doc_ids.clear()
    
    def test_01_courier_login(self):
        """Test courier login to get courier_id"""
        response = self.session.post(f"{BASE_URL}/api/auth/courier/login", json={
            "phone": COURIER_PHONE,
            "password": COURIER_PASSWORD
        })
        assert response.status_code == 200, f"Courier login failed: {response.text}"
        data = response.json()
        assert "id" in data, "Courier ID not in response"
        assert data["role"] == "courier", "Role should be courier"
        TestDocumentsAPI.courier_id = data["id"]
        if data.get("companies") and len(data["companies"]) > 0:
            TestDocumentsAPI.company_id = data["companies"][0]["id"]
        print(f"Courier logged in: {data['name']}, ID: {data['id']}")
    
    def test_02_get_document_types(self):
        """Test GET /api/documents/types - Get all document types"""
        response = self.session.get(f"{BASE_URL}/api/documents/types")
        assert response.status_code == 200, f"Get document types failed: {response.text}"
        data = response.json()
        
        # Verify all 7 document types exist
        expected_types = [
            "company_contract", "id_front", "id_back", 
            "license_front", "license_back", 
            "criminal_record", "residence_certificate"
        ]
        for doc_type in expected_types:
            assert doc_type in data, f"Missing document type: {doc_type}"
            assert "label" in data[doc_type], f"Missing label for {doc_type}"
            assert "max_count" in data[doc_type], f"Missing max_count for {doc_type}"
            assert "is_pdf" in data[doc_type], f"Missing is_pdf for {doc_type}"
        
        # Verify specific counts
        assert data["company_contract"]["max_count"] == 14, "Contract should allow 14 files"
        assert data["id_front"]["max_count"] == 1, "ID front should allow 1 file"
        assert data["criminal_record"]["is_pdf"] == True, "Criminal record should be PDF"
        assert data["id_front"]["is_pdf"] == False, "ID front should be image"
        print(f"Document types verified: {list(data.keys())}")
    
    def test_03_get_document_status_empty(self):
        """Test GET /api/documents/courier/{courier_id}/status - Initial status"""
        assert TestDocumentsAPI.courier_id, "Courier ID not set"
        
        response = self.session.get(
            f"{BASE_URL}/api/documents/courier/{TestDocumentsAPI.courier_id}/status"
        )
        assert response.status_code == 200, f"Get status failed: {response.text}"
        data = response.json()
        
        # Verify status structure
        assert "all_complete" in data, "Missing all_complete field"
        assert "total_required" in data, "Missing total_required field"
        assert "total_uploaded" in data, "Missing total_uploaded field"
        assert "progress_percent" in data, "Missing progress_percent field"
        assert "details" in data, "Missing details field"
        
        # Total required should be 20 (14 + 1 + 1 + 1 + 1 + 1 + 1)
        assert data["total_required"] == 20, f"Total required should be 20, got {data['total_required']}"
        print(f"Document status: {data['total_uploaded']}/{data['total_required']} ({data['progress_percent']}%)")
    
    def test_04_get_courier_documents_empty(self):
        """Test GET /api/documents/courier/{courier_id} - Get documents (initially empty)"""
        assert TestDocumentsAPI.courier_id, "Courier ID not set"
        
        response = self.session.get(
            f"{BASE_URL}/api/documents/courier/{TestDocumentsAPI.courier_id}"
        )
        assert response.status_code == 200, f"Get documents failed: {response.text}"
        data = response.json()
        assert isinstance(data, list), "Response should be a list"
        print(f"Current documents count: {len(data)}")
    
    def test_05_upload_image_document(self):
        """Test POST /api/documents/upload/{courier_id}/{document_type} - Upload image"""
        assert TestDocumentsAPI.courier_id, "Courier ID not set"
        
        # Create a simple test image (1x1 pixel PNG)
        png_data = bytes([
            0x89, 0x50, 0x4E, 0x47, 0x0D, 0x0A, 0x1A, 0x0A,  # PNG signature
            0x00, 0x00, 0x00, 0x0D, 0x49, 0x48, 0x44, 0x52,  # IHDR chunk
            0x00, 0x00, 0x00, 0x01, 0x00, 0x00, 0x00, 0x01,  # 1x1 pixel
            0x08, 0x02, 0x00, 0x00, 0x00, 0x90, 0x77, 0x53,
            0xDE, 0x00, 0x00, 0x00, 0x0C, 0x49, 0x44, 0x41,  # IDAT chunk
            0x54, 0x08, 0xD7, 0x63, 0xF8, 0xFF, 0xFF, 0x3F,
            0x00, 0x05, 0xFE, 0x02, 0xFE, 0xDC, 0xCC, 0x59,
            0xE7, 0x00, 0x00, 0x00, 0x00, 0x49, 0x45, 0x4E,  # IEND chunk
            0x44, 0xAE, 0x42, 0x60, 0x82
        ])
        
        files = {
            'file': ('test_id_front.png', io.BytesIO(png_data), 'image/png')
        }
        data = {
            'company_name': 'TestCompany'
        }
        
        response = requests.post(
            f"{BASE_URL}/api/documents/upload/{TestDocumentsAPI.courier_id}/id_front",
            files=files,
            data=data
        )
        assert response.status_code == 200, f"Upload failed: {response.text}"
        result = response.json()
        
        assert "document_id" in result, "Missing document_id in response"
        assert "file_name" in result, "Missing file_name in response"
        assert "message" in result, "Missing message in response"
        
        TestDocumentsAPI.uploaded_doc_ids.append(result["document_id"])
        print(f"Uploaded document: {result['file_name']}, ID: {result['document_id']}")
    
    def test_06_upload_pdf_document(self):
        """Test POST /api/documents/upload - Upload PDF document"""
        assert TestDocumentsAPI.courier_id, "Courier ID not set"
        
        # Create a minimal valid PDF
        pdf_content = b"""%PDF-1.4
1 0 obj
<< /Type /Catalog /Pages 2 0 R >>
endobj
2 0 obj
<< /Type /Pages /Kids [3 0 R] /Count 1 >>
endobj
3 0 obj
<< /Type /Page /Parent 2 0 R /MediaBox [0 0 612 792] >>
endobj
xref
0 4
0000000000 65535 f 
0000000009 00000 n 
0000000058 00000 n 
0000000115 00000 n 
trailer
<< /Size 4 /Root 1 0 R >>
startxref
196
%%EOF"""
        
        files = {
            'file': ('test_criminal_record.pdf', io.BytesIO(pdf_content), 'application/pdf')
        }
        data = {
            'company_name': 'TestCompany'
        }
        
        response = requests.post(
            f"{BASE_URL}/api/documents/upload/{TestDocumentsAPI.courier_id}/criminal_record",
            files=files,
            data=data
        )
        assert response.status_code == 200, f"PDF upload failed: {response.text}"
        result = response.json()
        
        assert "document_id" in result, "Missing document_id"
        TestDocumentsAPI.uploaded_doc_ids.append(result["document_id"])
        print(f"Uploaded PDF: {result['file_name']}")
    
    def test_07_verify_status_after_upload(self):
        """Test document status updates after uploads"""
        assert TestDocumentsAPI.courier_id, "Courier ID not set"
        
        response = self.session.get(
            f"{BASE_URL}/api/documents/courier/{TestDocumentsAPI.courier_id}/status"
        )
        assert response.status_code == 200, f"Get status failed: {response.text}"
        data = response.json()
        
        # Should have at least 2 documents uploaded now
        assert data["total_uploaded"] >= 2, f"Expected at least 2 uploads, got {data['total_uploaded']}"
        assert data["progress_percent"] > 0, "Progress should be > 0"
        
        # Check specific document types
        assert data["details"]["id_front"]["uploaded"] >= 1, "ID front should have 1 upload"
        assert data["details"]["criminal_record"]["uploaded"] >= 1, "Criminal record should have 1 upload"
        print(f"Status after uploads: {data['total_uploaded']}/{data['total_required']} ({data['progress_percent']}%)")
    
    def test_08_get_courier_documents_list(self):
        """Test GET /api/documents/courier/{courier_id} - Verify uploaded documents"""
        assert TestDocumentsAPI.courier_id, "Courier ID not set"
        
        response = self.session.get(
            f"{BASE_URL}/api/documents/courier/{TestDocumentsAPI.courier_id}"
        )
        assert response.status_code == 200, f"Get documents failed: {response.text}"
        data = response.json()
        
        assert len(data) >= 2, f"Expected at least 2 documents, got {len(data)}"
        
        # Verify document structure
        for doc in data:
            assert "id" in doc, "Missing id"
            assert "courier_id" in doc, "Missing courier_id"
            assert "document_type" in doc, "Missing document_type"
            assert "file_name" in doc, "Missing file_name"
            assert "uploaded_at" in doc, "Missing uploaded_at"
        
        print(f"Documents list: {[d['document_type'] for d in data]}")
    
    def test_09_view_document(self):
        """Test GET /api/documents/view/{document_id} - View document"""
        assert len(TestDocumentsAPI.uploaded_doc_ids) > 0, "No documents uploaded"
        
        doc_id = TestDocumentsAPI.uploaded_doc_ids[0]
        response = self.session.get(f"{BASE_URL}/api/documents/view/{doc_id}")
        assert response.status_code == 200, f"View document failed: {response.text}"
        
        # Should return file content
        assert len(response.content) > 0, "Document content should not be empty"
        print(f"Document viewed successfully, size: {len(response.content)} bytes")
    
    def test_10_view_nonexistent_document(self):
        """Test GET /api/documents/view/{document_id} - Non-existent document"""
        response = self.session.get(f"{BASE_URL}/api/documents/view/nonexistent-id-12345")
        assert response.status_code == 404, f"Expected 404, got {response.status_code}"
        print("Non-existent document returns 404 as expected")
    
    def test_11_upload_invalid_file_type(self):
        """Test upload with invalid file type"""
        assert TestDocumentsAPI.courier_id, "Courier ID not set"
        
        # Try to upload PDF to image-only field
        pdf_content = b"%PDF-1.4\n%%EOF"
        files = {
            'file': ('test.pdf', io.BytesIO(pdf_content), 'application/pdf')
        }
        data = {
            'company_name': 'TestCompany'
        }
        
        response = requests.post(
            f"{BASE_URL}/api/documents/upload/{TestDocumentsAPI.courier_id}/id_back",
            files=files,
            data=data
        )
        assert response.status_code == 400, f"Expected 400 for invalid file type, got {response.status_code}"
        print("Invalid file type rejected as expected")
    
    def test_12_upload_invalid_document_type(self):
        """Test upload with invalid document type"""
        assert TestDocumentsAPI.courier_id, "Courier ID not set"
        
        png_data = bytes([0x89, 0x50, 0x4E, 0x47, 0x0D, 0x0A, 0x1A, 0x0A])
        files = {
            'file': ('test.png', io.BytesIO(png_data), 'image/png')
        }
        data = {
            'company_name': 'TestCompany'
        }
        
        response = requests.post(
            f"{BASE_URL}/api/documents/upload/{TestDocumentsAPI.courier_id}/invalid_type",
            files=files,
            data=data
        )
        assert response.status_code == 400, f"Expected 400 for invalid document type, got {response.status_code}"
        print("Invalid document type rejected as expected")
    
    def test_13_delete_document(self):
        """Test DELETE /api/documents/{document_id} - Delete document"""
        assert len(TestDocumentsAPI.uploaded_doc_ids) > 0, "No documents to delete"
        
        doc_id = TestDocumentsAPI.uploaded_doc_ids[0]
        response = self.session.delete(f"{BASE_URL}/api/documents/{doc_id}")
        assert response.status_code == 200, f"Delete failed: {response.text}"
        
        result = response.json()
        assert "message" in result, "Missing message in response"
        
        # Remove from tracking list
        TestDocumentsAPI.uploaded_doc_ids.remove(doc_id)
        print(f"Document {doc_id} deleted successfully")
    
    def test_14_delete_nonexistent_document(self):
        """Test DELETE /api/documents/{document_id} - Non-existent document"""
        response = self.session.delete(f"{BASE_URL}/api/documents/nonexistent-id-12345")
        assert response.status_code == 404, f"Expected 404, got {response.status_code}"
        print("Delete non-existent document returns 404 as expected")
    
    def test_15_download_all_documents(self):
        """Test GET /api/documents/courier/{courier_id}/download-all - Download ZIP"""
        assert TestDocumentsAPI.courier_id, "Courier ID not set"
        
        # First ensure we have at least one document
        if len(TestDocumentsAPI.uploaded_doc_ids) == 0:
            # Upload a document first
            png_data = bytes([
                0x89, 0x50, 0x4E, 0x47, 0x0D, 0x0A, 0x1A, 0x0A,
                0x00, 0x00, 0x00, 0x0D, 0x49, 0x48, 0x44, 0x52,
                0x00, 0x00, 0x00, 0x01, 0x00, 0x00, 0x00, 0x01,
                0x08, 0x02, 0x00, 0x00, 0x00, 0x90, 0x77, 0x53,
                0xDE, 0x00, 0x00, 0x00, 0x0C, 0x49, 0x44, 0x41,
                0x54, 0x08, 0xD7, 0x63, 0xF8, 0xFF, 0xFF, 0x3F,
                0x00, 0x05, 0xFE, 0x02, 0xFE, 0xDC, 0xCC, 0x59,
                0xE7, 0x00, 0x00, 0x00, 0x00, 0x49, 0x45, 0x4E,
                0x44, 0xAE, 0x42, 0x60, 0x82
            ])
            files = {'file': ('test.png', io.BytesIO(png_data), 'image/png')}
            data = {'company_name': 'TestCompany'}
            resp = requests.post(
                f"{BASE_URL}/api/documents/upload/{TestDocumentsAPI.courier_id}/license_front",
                files=files, data=data
            )
            if resp.status_code == 200:
                TestDocumentsAPI.uploaded_doc_ids.append(resp.json()["document_id"])
        
        response = self.session.get(
            f"{BASE_URL}/api/documents/courier/{TestDocumentsAPI.courier_id}/download-all"
        )
        
        if response.status_code == 404:
            print("No documents to download (404 expected if no documents)")
            return
        
        assert response.status_code == 200, f"Download all failed: {response.text}"
        
        # Verify it's a ZIP file
        assert response.headers.get('content-type') == 'application/zip', "Should return ZIP file"
        assert len(response.content) > 0, "ZIP content should not be empty"
        
        # Verify ZIP signature (PK)
        assert response.content[:2] == b'PK', "Should be a valid ZIP file"
        print(f"Downloaded ZIP file, size: {len(response.content)} bytes")
    
    def test_16_download_all_nonexistent_courier(self):
        """Test download-all for non-existent courier"""
        response = self.session.get(
            f"{BASE_URL}/api/documents/courier/nonexistent-courier-id/download-all"
        )
        assert response.status_code == 404, f"Expected 404, got {response.status_code}"
        print("Download all for non-existent courier returns 404")


class TestAdminDocumentAccess:
    """Test admin access to courier documents"""
    
    @pytest.fixture(autouse=True)
    def setup(self):
        self.session = requests.Session()
        self.session.headers.update({"Content-Type": "application/json"})
        yield
    
    def test_01_admin_login(self):
        """Test admin login"""
        response = self.session.post(f"{BASE_URL}/api/auth/admin/login", json={
            "username": ADMIN_USERNAME,
            "password": ADMIN_PASSWORD
        })
        assert response.status_code == 200, f"Admin login failed: {response.text}"
        data = response.json()
        assert "id" in data, "Admin ID not in response"
        print(f"Admin logged in: {data['name']}")
    
    def test_02_admin_can_view_courier_documents(self):
        """Test admin can view courier documents"""
        # First get courier ID
        courier_response = self.session.post(f"{BASE_URL}/api/auth/courier/login", json={
            "phone": COURIER_PHONE,
            "password": COURIER_PASSWORD
        })
        assert courier_response.status_code == 200
        courier_id = courier_response.json()["id"]
        
        # Admin views courier documents
        response = self.session.get(f"{BASE_URL}/api/documents/courier/{courier_id}")
        assert response.status_code == 200, f"Admin view documents failed: {response.text}"
        print(f"Admin can view courier documents: {len(response.json())} documents")
    
    def test_03_admin_can_view_courier_status(self):
        """Test admin can view courier document status"""
        courier_response = self.session.post(f"{BASE_URL}/api/auth/courier/login", json={
            "phone": COURIER_PHONE,
            "password": COURIER_PASSWORD
        })
        courier_id = courier_response.json()["id"]
        
        response = self.session.get(f"{BASE_URL}/api/documents/courier/{courier_id}/status")
        assert response.status_code == 200, f"Admin view status failed: {response.text}"
        data = response.json()
        print(f"Admin can view status: {data['progress_percent']}% complete")


if __name__ == "__main__":
    pytest.main([__file__, "-v", "--tb=short"])
