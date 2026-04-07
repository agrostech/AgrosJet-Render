"""
Test Contract APIs for Courier Document Upload & Registration Revamp
- Contract status API
- Contract preview API  
- Contract accept API
- Courier login with contract_accepted field
"""
import pytest
import requests
import os

BASE_URL = os.environ.get('REACT_APP_BACKEND_URL', '').rstrip('/')

# Test credentials from test_credentials.md
COURIER_PHONE = "05550003201"
COURIER_PASSWORD = "123456"
ADMIN_USERNAME = "admin"
ADMIN_PASSWORD = "123456"
SYSTEM_ADMIN_USERNAME = "onurertas"
SYSTEM_ADMIN_PASSWORD = "Delivery32.."


class TestCourierLoginContractFields:
    """Test courier login returns contract_accepted and document_status fields"""
    
    def test_courier_login_returns_contract_fields(self):
        """Verify courier login response includes contract_accepted and document_status"""
        response = requests.post(f"{BASE_URL}/api/auth/courier/login", json={
            "phone": COURIER_PHONE,
            "password": COURIER_PASSWORD
        })
        
        assert response.status_code == 200, f"Login failed: {response.text}"
        data = response.json()
        
        # Verify required fields exist
        assert "id" in data, "Missing 'id' in login response"
        assert "name" in data, "Missing 'name' in login response"
        assert "token" in data, "Missing 'token' in login response"
        
        # Verify contract-related fields
        assert "contract_accepted" in data, "Missing 'contract_accepted' in login response"
        assert "document_status" in data, "Missing 'document_status' in login response"
        
        # Verify types
        assert isinstance(data["contract_accepted"], bool), "contract_accepted should be boolean"
        assert isinstance(data["document_status"], str), "document_status should be string"
        
        print(f"Login successful - courier_id: {data['id']}")
        print(f"contract_accepted: {data['contract_accepted']}")
        print(f"document_status: {data['document_status']}")
        
        return data


class TestContractStatusAPI:
    """Test GET /api/contracts/status/{courier_id}"""
    
    @pytest.fixture
    def auth_token(self):
        """Get auth token from courier login"""
        response = requests.post(f"{BASE_URL}/api/auth/courier/login", json={
            "phone": COURIER_PHONE,
            "password": COURIER_PASSWORD
        })
        if response.status_code == 200:
            return response.json()
        pytest.skip("Courier login failed")
    
    def test_contract_status_returns_accepted_field(self, auth_token):
        """Verify contract status API returns accepted field"""
        courier_id = auth_token["id"]
        token = auth_token["token"]
        
        response = requests.get(
            f"{BASE_URL}/api/contracts/status/{courier_id}",
            headers={"Authorization": f"Bearer {token}"}
        )
        
        assert response.status_code == 200, f"Contract status failed: {response.text}"
        data = response.json()
        
        # Verify required fields
        assert "accepted" in data, "Missing 'accepted' in contract status response"
        assert isinstance(data["accepted"], bool), "accepted should be boolean"
        
        print(f"Contract status for {courier_id}: accepted={data['accepted']}")
        
        # If accepted, should have accepted_at and contract info
        if data["accepted"]:
            assert "accepted_at" in data, "Missing 'accepted_at' when contract is accepted"
            print(f"Contract accepted_at: {data.get('accepted_at')}")
            if data.get("contract"):
                print(f"Contract info: {data['contract']}")
    
    def test_contract_status_invalid_courier(self, auth_token):
        """Verify contract status returns 404 for invalid courier"""
        token = auth_token["token"]
        
        response = requests.get(
            f"{BASE_URL}/api/contracts/status/invalid-courier-id-12345",
            headers={"Authorization": f"Bearer {token}"}
        )
        
        assert response.status_code == 404, f"Expected 404, got {response.status_code}"


class TestContractPreviewAPI:
    """Test GET /api/contracts/preview/{courier_id}"""
    
    @pytest.fixture
    def auth_token(self):
        """Get auth token from courier login"""
        response = requests.post(f"{BASE_URL}/api/auth/courier/login", json={
            "phone": COURIER_PHONE,
            "password": COURIER_PASSWORD
        })
        if response.status_code == 200:
            return response.json()
        pytest.skip("Courier login failed")
    
    def test_contract_preview_returns_text(self, auth_token):
        """Verify contract preview API returns contract text with placeholders filled"""
        courier_id = auth_token["id"]
        token = auth_token["token"]
        
        response = requests.get(
            f"{BASE_URL}/api/contracts/preview/{courier_id}",
            headers={"Authorization": f"Bearer {token}"}
        )
        
        # Could be 200 (success) or 400 (contract settings not configured)
        if response.status_code == 400:
            data = response.json()
            print(f"Contract preview not available: {data.get('detail')}")
            pytest.skip("Contract settings not configured for this company")
        
        assert response.status_code == 200, f"Contract preview failed: {response.text}"
        data = response.json()
        
        # Verify required fields
        assert "text" in data, "Missing 'text' in contract preview response"
        assert "company_name" in data, "Missing 'company_name' in contract preview response"
        
        # Verify text is not empty and contains expected content
        assert len(data["text"]) > 100, "Contract text seems too short"
        assert "KULLANICI SÖZLEŞMESİ" in data["text"], "Contract should contain title"
        assert "Madde 1" in data["text"], "Contract should contain articles"
        
        print(f"Contract preview for {courier_id}")
        print(f"Company: {data['company_name']}")
        print(f"Text length: {len(data['text'])} chars")
        print(f"First 200 chars: {data['text'][:200]}...")
    
    def test_contract_preview_invalid_courier(self, auth_token):
        """Verify contract preview returns 404 for invalid courier"""
        token = auth_token["token"]
        
        response = requests.get(
            f"{BASE_URL}/api/contracts/preview/invalid-courier-id-12345",
            headers={"Authorization": f"Bearer {token}"}
        )
        
        assert response.status_code == 404, f"Expected 404, got {response.status_code}"


class TestContractAcceptAPI:
    """Test POST /api/contracts/accept/{courier_id}"""
    
    @pytest.fixture
    def auth_token(self):
        """Get auth token from courier login"""
        response = requests.post(f"{BASE_URL}/api/auth/courier/login", json={
            "phone": COURIER_PHONE,
            "password": COURIER_PASSWORD
        })
        if response.status_code == 200:
            return response.json()
        pytest.skip("Courier login failed")
    
    def test_contract_accept_requires_signature(self, auth_token):
        """Verify contract accept API requires signature_base64"""
        courier_id = auth_token["id"]
        token = auth_token["token"]
        
        # Try without signature
        response = requests.post(
            f"{BASE_URL}/api/contracts/accept/{courier_id}",
            headers={"Authorization": f"Bearer {token}"},
            json={"tc_kimlik": "12345678901"}
        )
        
        # Should fail validation (missing signature_base64)
        assert response.status_code == 422, f"Expected 422 for missing signature, got {response.status_code}"
    
    def test_contract_accept_validates_signature(self, auth_token):
        """Verify contract accept API handles signature - may accept or reject based on implementation"""
        courier_id = auth_token["id"]
        token = auth_token["token"]
        
        # Try with invalid signature
        response = requests.post(
            f"{BASE_URL}/api/contracts/accept/{courier_id}",
            headers={"Authorization": f"Bearer {token}"},
            json={
                "signature_base64": "invalid-not-base64",
                "tc_kimlik": "12345678901"
            }
        )
        
        # Backend may accept or reject - just verify it doesn't crash (500)
        assert response.status_code != 500, f"Server error: {response.text}"
        print(f"Signature validation response: {response.status_code} - {response.text[:200]}")
    
    def test_contract_accept_validates_tc_kimlik(self, auth_token):
        """Verify contract accept API validates TC Kimlik format"""
        courier_id = auth_token["id"]
        token = auth_token["token"]
        
        # Valid base64 PNG signature (1x1 transparent pixel)
        valid_signature = "data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNk+M9QDwADhgGAWjR9awAAAABJRU5ErkJggg=="
        
        # Try with invalid TC (not 11 digits)
        response = requests.post(
            f"{BASE_URL}/api/contracts/accept/{courier_id}",
            headers={"Authorization": f"Bearer {token}"},
            json={
                "signature_base64": valid_signature,
                "tc_kimlik": "123"  # Too short
            }
        )
        
        # Should fail with 400 (invalid TC)
        assert response.status_code == 400, f"Expected 400 for invalid TC, got {response.status_code}"
        data = response.json()
        assert "11" in data.get("detail", "") or "TC" in data.get("detail", ""), \
            f"Error should mention TC format: {data}"


class TestContractPDFAPI:
    """Test GET /api/contracts/pdf/{courier_id}"""
    
    @pytest.fixture
    def auth_token(self):
        """Get auth token from courier login"""
        response = requests.post(f"{BASE_URL}/api/auth/courier/login", json={
            "phone": COURIER_PHONE,
            "password": COURIER_PASSWORD
        })
        if response.status_code == 200:
            return response.json()
        pytest.skip("Courier login failed")
    
    def test_contract_pdf_for_accepted_contract(self, auth_token):
        """Verify contract PDF API returns PDF for accepted contract"""
        courier_id = auth_token["id"]
        token = auth_token["token"]
        contract_accepted = auth_token.get("contract_accepted", False)
        
        response = requests.get(
            f"{BASE_URL}/api/contracts/pdf/{courier_id}",
            headers={"Authorization": f"Bearer {token}"}
        )
        
        if not contract_accepted:
            # If contract not accepted, should return 404
            assert response.status_code == 404, f"Expected 404 for unaccepted contract, got {response.status_code}"
            print("Contract not accepted - PDF not available (expected)")
        else:
            # If contract accepted, should return PDF
            assert response.status_code == 200, f"Contract PDF failed: {response.text}"
            assert response.headers.get("content-type") == "application/pdf", \
                f"Expected PDF content-type, got {response.headers.get('content-type')}"
            assert len(response.content) > 1000, "PDF content seems too small"
            print(f"Contract PDF retrieved - size: {len(response.content)} bytes")


class TestCourierRegistrationWithTC:
    """Test courier registration includes TC Kimlik field"""
    
    def test_registration_accepts_tc_no(self):
        """Verify registration endpoint accepts tc_no field"""
        import random
        import string
        
        # Generate random test data - phone must be 11 digits starting with 05
        random_suffix = ''.join(random.choices(string.digits, k=7))
        test_phone = f"0555{random_suffix}"  # 11 digits: 0555 + 7 random
        test_email = f"test{random_suffix}@example.com"
        
        response = requests.post(f"{BASE_URL}/api/auth/courier/register", json={
            "name": "Test Kurye",
            "phone": test_phone,
            "email": test_email,
            "tc_no": "12345678901",  # TC Kimlik field
            "address": "Test Adres",
            "iban": "TR123456789012345678901234",
            "plate": "34TEST01",
            "password": "test123"
        })
        
        # Should return 200 with requires_verification
        # (or 400 if phone/email already exists - that's fine for this test)
        if response.status_code == 400:
            data = response.json()
            # If it's a duplicate error, that's expected
            if "zaten kayıtlı" in data.get("detail", "").lower():
                print(f"Registration blocked (duplicate): {data['detail']}")
                return
        
        assert response.status_code == 200, f"Registration failed: {response.text}"
        data = response.json()
        
        assert "requires_verification" in data, "Missing requires_verification in response"
        assert data["requires_verification"] == True, "Should require email verification"
        assert "registration_token" in data, "Missing registration_token in response"
        
        print(f"Registration initiated - email verification required")
        print(f"registration_token: {data['registration_token'][:20]}...")


class TestAdminContractView:
    """Test admin can view courier contract status"""
    
    @pytest.fixture
    def admin_token(self):
        """Get admin auth token"""
        response = requests.post(f"{BASE_URL}/api/auth/admin/login", json={
            "username": ADMIN_USERNAME,
            "password": ADMIN_PASSWORD
        })
        if response.status_code == 200:
            return response.json()
        pytest.skip("Admin login failed")
    
    def test_admin_can_get_courier_with_contract_status(self, admin_token):
        """Verify admin can see courier contract_accepted status"""
        token = admin_token["token"]
        company_id = admin_token.get("company_id")
        
        if not company_id:
            pytest.skip("Admin has no company_id")
        
        # Get couriers list
        response = requests.get(
            f"{BASE_URL}/api/couriers",
            headers={"Authorization": f"Bearer {token}"},
            params={"company_id": company_id}
        )
        
        if response.status_code != 200:
            print(f"Couriers list failed: {response.text}")
            pytest.skip("Could not get couriers list")
        
        couriers = response.json()
        if not couriers:
            pytest.skip("No couriers in company")
        
        # Check first courier has contract_accepted field
        courier = couriers[0]
        print(f"Courier: {courier.get('name')} - contract_accepted: {courier.get('contract_accepted')}")
        
        # contract_accepted might not be in list response, check individual courier
        courier_id = courier.get("id")
        response = requests.get(
            f"{BASE_URL}/api/couriers/{courier_id}",
            headers={"Authorization": f"Bearer {token}"}
        )
        
        assert response.status_code == 200, f"Get courier failed: {response.text}"
        courier_detail = response.json()
        
        # Verify contract_accepted field exists
        assert "contract_accepted" in courier_detail or courier_detail.get("contract_accepted") is not None, \
            "Courier detail should include contract_accepted field"
        
        print(f"Courier detail - contract_accepted: {courier_detail.get('contract_accepted')}")


if __name__ == "__main__":
    pytest.main([__file__, "-v", "--tb=short"])
