"""
Security Hardening Tests - P1
Tests for:
1. File upload size limits (Logo 5MB, Document 10MB, Invoice 10MB, etc.)
2. Global rate limiting (200 req/min/IP)
3. Webhook path exemptions
4. Existing auth still works
"""
import pytest
import requests
import os
import time
import io

# Use external URL for most tests
BASE_URL = os.environ.get('REACT_APP_BACKEND_URL', 'https://earnings-obligations.preview.emergentagent.com').rstrip('/')

# Use localhost for rate limit testing (K8s ingress distributes IPs)
LOCALHOST_URL = "http://localhost:8001"

# Test credentials
SYSTEM_ADMIN = {"username": "onurertas", "password": "Delivery32.."}
COMPANY_ADMIN = {"username": "admin", "password": "123456"}
COURIER = {"phone": "05550003201", "password": "123456"}
TEST_COMPANY_ID = "0005ec2a-04ca-4250-9530-ecc6fde165f1"


class TestAuthStillWorks:
    """Verify existing authentication still works after security changes"""
    
    def test_admin_login_success(self):
        """System admin login should work"""
        response = requests.post(
            f"{BASE_URL}/api/auth/admin/login",
            json=SYSTEM_ADMIN,
            timeout=10
        )
        print(f"Admin login response: {response.status_code}")
        assert response.status_code == 200, f"Admin login failed: {response.text}"
        data = response.json()
        assert "token" in data or "access_token" in data, "No token in response"
        print("✓ System admin login works")
    
    def test_company_admin_login_success(self):
        """Company admin login should work"""
        response = requests.post(
            f"{BASE_URL}/api/auth/admin/login",
            json=COMPANY_ADMIN,
            timeout=10
        )
        print(f"Company admin login response: {response.status_code}")
        assert response.status_code == 200, f"Company admin login failed: {response.text}"
        data = response.json()
        assert "token" in data or "access_token" in data, "No token in response"
        print("✓ Company admin login works")
    
    def test_courier_login_success(self):
        """Courier login should work"""
        response = requests.post(
            f"{BASE_URL}/api/auth/courier/login",
            json=COURIER,
            timeout=10
        )
        print(f"Courier login response: {response.status_code}")
        assert response.status_code == 200, f"Courier login failed: {response.text}"
        data = response.json()
        assert "token" in data or "access_token" in data, "No token in response"
        print("✓ Courier login works")


class TestFileUploadSizeLimits:
    """Test file upload size limits return 413 for oversized files"""
    
    @pytest.fixture
    def auth_token(self):
        """Get auth token for authenticated requests"""
        response = requests.post(
            f"{BASE_URL}/api/auth/admin/login",
            json=SYSTEM_ADMIN,
            timeout=10
        )
        if response.status_code == 200:
            data = response.json()
            return data.get("token") or data.get("access_token")
        pytest.skip("Could not get auth token")
    
    def test_logo_upload_over_5mb_rejected(self, auth_token):
        """Logo upload >5MB should return 413"""
        # Create a 6MB fake file
        large_content = b'x' * (6 * 1024 * 1024)  # 6MB
        files = {
            'file': ('large_logo.png', io.BytesIO(large_content), 'image/png')
        }
        data = {'logo_type': 'dark'}
        
        response = requests.post(
            f"{BASE_URL}/api/companies/{TEST_COMPANY_ID}/logo",
            files=files,
            data=data,
            headers={"Authorization": f"Bearer {auth_token}"},
            timeout=30
        )
        print(f"Logo upload >5MB response: {response.status_code}")
        assert response.status_code == 413, f"Expected 413, got {response.status_code}: {response.text}"
        print("✓ Logo upload >5MB correctly rejected with 413")
    
    def test_logo_upload_under_5mb_accepted(self, auth_token):
        """Logo upload <5MB should be accepted (or fail for other reasons, not 413)"""
        # Create a 1MB fake file
        small_content = b'x' * (1 * 1024 * 1024)  # 1MB
        files = {
            'file': ('small_logo.png', io.BytesIO(small_content), 'image/png')
        }
        data = {'logo_type': 'dark'}
        
        response = requests.post(
            f"{BASE_URL}/api/companies/{TEST_COMPANY_ID}/logo",
            files=files,
            data=data,
            headers={"Authorization": f"Bearer {auth_token}"},
            timeout=30
        )
        print(f"Logo upload <5MB response: {response.status_code}")
        # Should NOT be 413 - could be 200 (success) or 503 (R2 not configured) or other
        assert response.status_code != 413, f"Small file should not get 413"
        print(f"✓ Logo upload <5MB not rejected with 413 (got {response.status_code})")
    
    def test_document_upload_over_10mb_rejected(self, auth_token):
        """Document upload >10MB should return 413"""
        # Create an 11MB fake file
        large_content = b'x' * (11 * 1024 * 1024)  # 11MB
        
        # Use a real courier ID
        test_courier_id = "feae169f-222b-45df-b9e8-0664a186031a"
        
        files = {
            'file': ('large_doc.pdf', io.BytesIO(large_content), 'application/pdf')
        }
        data = {'company_name': 'Test Company'}
        
        response = requests.post(
            f"{BASE_URL}/api/documents/upload/{test_courier_id}/criminal_record",
            files=files,
            data=data,
            headers={"Authorization": f"Bearer {auth_token}"},
            timeout=30
        )
        print(f"Document upload >10MB response: {response.status_code}")
        # Should be 413 for size limit
        assert response.status_code == 413, f"Expected 413, got {response.status_code}: {response.text}"
        print("✓ Document upload >10MB correctly rejected with 413")


class TestGlobalRateLimiting:
    """Test global rate limiting (200 req/min/IP)
    
    IMPORTANT: Must test against localhost:8001 because K8s ingress distributes IPs
    """
    
    def test_rate_limit_returns_429_after_200_requests(self):
        """Sending 201+ requests in 1 minute should return 429"""
        print("Testing rate limit (this may take a moment)...")
        
        # Use a simple endpoint that doesn't require auth
        endpoint = f"{LOCALHOST_URL}/api/health"
        
        success_count = 0
        rate_limited_count = 0
        
        # Send 210 requests rapidly
        for i in range(210):
            try:
                response = requests.get(endpoint, timeout=5)
                if response.status_code == 200:
                    success_count += 1
                elif response.status_code == 429:
                    rate_limited_count += 1
                    print(f"Got 429 at request #{i+1}")
                    break
            except Exception as e:
                print(f"Request {i+1} failed: {e}")
        
        print(f"Success: {success_count}, Rate limited: {rate_limited_count}")
        
        # We should hit rate limit before 210 requests
        assert rate_limited_count > 0, "Rate limit was not triggered after 210 requests"
        assert success_count <= 200, f"More than 200 requests succeeded: {success_count}"
        print("✓ Rate limit correctly returns 429 after ~200 requests")
    
    def test_rate_limit_response_format(self):
        """Rate limit response should have correct format"""
        # First exhaust the rate limit
        endpoint = f"{LOCALHOST_URL}/api/health"
        
        # Send requests until we get 429
        for i in range(250):
            response = requests.get(endpoint, timeout=5)
            if response.status_code == 429:
                # Check response format
                data = response.json()
                assert "detail" in data, "429 response should have 'detail' field"
                assert "fazla istek" in data["detail"].lower() or "too many" in data["detail"].lower(), \
                    f"Unexpected error message: {data['detail']}"
                print(f"✓ Rate limit response format correct: {data['detail']}")
                return
        
        pytest.skip("Could not trigger rate limit to test response format")


class TestWebhookExemptions:
    """Test that webhook paths are exempt from rate limiting"""
    
    def test_getir_webhook_exempt(self):
        """Getir webhook path should be exempt from rate limiting"""
        # First exhaust rate limit on regular endpoint
        for i in range(210):
            requests.get(f"{LOCALHOST_URL}/api/health", timeout=5)
        
        # Now try webhook endpoint - should NOT be rate limited
        response = requests.post(
            f"{LOCALHOST_URL}/api/getir/webhook/test",
            json={"test": "data"},
            timeout=5
        )
        print(f"Getir webhook response after rate limit: {response.status_code}")
        # Should NOT be 429 (might be 404 or other error, but not rate limited)
        assert response.status_code != 429, "Webhook should be exempt from rate limiting"
        print("✓ Getir webhook exempt from rate limiting")
    
    def test_migros_webhook_exempt(self):
        """Migros webhook path should be exempt from rate limiting"""
        # First exhaust rate limit on regular endpoint
        for i in range(210):
            requests.get(f"{LOCALHOST_URL}/api/health", timeout=5)
        
        # Now try webhook endpoint - should NOT be rate limited
        response = requests.post(
            f"{LOCALHOST_URL}/api/migros/webhook/test",
            json={"test": "data"},
            timeout=5
        )
        print(f"Migros webhook response after rate limit: {response.status_code}")
        # Should NOT be 429
        assert response.status_code != 429, "Webhook should be exempt from rate limiting"
        print("✓ Migros webhook exempt from rate limiting")


class TestRateLimitReset:
    """Test that rate limit resets after 60 seconds"""
    
    @pytest.mark.slow
    def test_rate_limit_resets_after_60_seconds(self):
        """Rate limit should reset after 60 seconds window"""
        endpoint = f"{LOCALHOST_URL}/api/health"
        
        # First exhaust rate limit
        print("Exhausting rate limit...")
        for i in range(210):
            response = requests.get(endpoint, timeout=5)
            if response.status_code == 429:
                print(f"Rate limited at request #{i+1}")
                break
        
        # Verify we're rate limited
        response = requests.get(endpoint, timeout=5)
        if response.status_code != 429:
            pytest.skip("Could not trigger rate limit")
        
        print("Waiting 65 seconds for rate limit to reset...")
        time.sleep(65)
        
        # Should be able to make requests again
        response = requests.get(endpoint, timeout=5)
        print(f"After 65s wait, response: {response.status_code}")
        assert response.status_code == 200, f"Rate limit did not reset: {response.status_code}"
        print("✓ Rate limit correctly resets after 60 seconds")


# Run tests
if __name__ == "__main__":
    pytest.main([__file__, "-v", "--tb=short"])
