"""
Test suite for Başvurular (Applications) feature
Tests AgrosJet external API integration for courier, restaurant, and company applications
"""
import pytest
import requests
import os

BASE_URL = os.environ.get('REACT_APP_BACKEND_URL', '').rstrip('/')

class TestApplicationsAPI:
    """Test Applications API endpoints"""
    
    def test_ping_agrosjet_connection(self):
        """Test AgrosJet connection ping endpoint"""
        response = requests.get(f"{BASE_URL}/api/applications/ping")
        print(f"Ping response: {response.status_code} - {response.text[:200] if response.text else 'empty'}")
        # May return 400 if not configured, but endpoint should exist
        assert response.status_code in [200, 400]
        
    def test_get_courier_applications(self):
        """Test GET /api/applications/courier returns data"""
        response = requests.get(f"{BASE_URL}/api/applications/courier?limit=10&offset=0")
        print(f"Courier apps response: {response.status_code} - {response.text[:300] if response.text else 'empty'}")
        # May return 400 if AgrosJet not configured
        assert response.status_code in [200, 400]
        if response.status_code == 200:
            data = response.json()
            assert "data" in data or "total" in data
            
    def test_get_restaurant_applications(self):
        """Test GET /api/applications/restaurant returns data"""
        response = requests.get(f"{BASE_URL}/api/applications/restaurant?limit=10&offset=0")
        print(f"Restaurant apps response: {response.status_code} - {response.text[:300] if response.text else 'empty'}")
        assert response.status_code in [200, 400]
        if response.status_code == 200:
            data = response.json()
            assert "data" in data or "total" in data
            
    def test_get_company_applications(self):
        """Test GET /api/applications/company returns data"""
        response = requests.get(f"{BASE_URL}/api/applications/company?limit=10&offset=0")
        print(f"Company apps response: {response.status_code} - {response.text[:300] if response.text else 'empty'}")
        assert response.status_code in [200, 400]
        if response.status_code == 200:
            data = response.json()
            assert "data" in data or "total" in data
            
    def test_get_courier_statuses(self):
        """Test GET /api/applications/statuses/courier"""
        response = requests.get(f"{BASE_URL}/api/applications/statuses/courier")
        print(f"Courier statuses response: {response.status_code} - {response.text[:200] if response.text else 'empty'}")
        assert response.status_code in [200, 400]
        
    def test_invalid_app_type(self):
        """Test invalid application type returns 400"""
        response = requests.get(f"{BASE_URL}/api/applications/invalid_type")
        assert response.status_code == 400
        data = response.json()
        assert "detail" in data


class TestAgrosJetSystemSettings:
    """Test AgrosJet system settings endpoints"""
    
    def test_get_agrosjet_settings(self):
        """Test GET /api/system-settings/agrosjet returns configuration status"""
        response = requests.get(f"{BASE_URL}/api/system-settings/agrosjet")
        print(f"AgrosJet settings response: {response.status_code} - {response.text[:200] if response.text else 'empty'}")
        assert response.status_code == 200
        data = response.json()
        # Should have configured field
        assert "configured" in data
        print(f"AgrosJet configured: {data.get('configured')}")
        
    def test_agrosjet_connection_test(self):
        """Test POST /api/system-settings/agrosjet/test"""
        response = requests.post(f"{BASE_URL}/api/system-settings/agrosjet/test")
        print(f"AgrosJet test response: {response.status_code} - {response.text[:300] if response.text else 'empty'}")
        assert response.status_code == 200
        data = response.json()
        # Should have success field
        assert "success" in data
        assert "message" in data
        print(f"AgrosJet test success: {data.get('success')}, message: {data.get('message')}")


class TestWebhookEndpoint:
    """Test webhook endpoint for AgrosJet"""
    
    def test_webhook_without_api_key(self):
        """Test webhook rejects requests without valid API key"""
        response = requests.post(
            f"{BASE_URL}/api/webhook/applications",
            json={"event": "test", "app_type": "courier", "application": {}},
            headers={"Content-Type": "application/json"}
        )
        print(f"Webhook without key response: {response.status_code}")
        # Should return 401 without valid API key
        assert response.status_code == 401


class TestHealthCheck:
    """Basic health check"""
    
    def test_api_health(self):
        """Test API is running"""
        response = requests.get(f"{BASE_URL}/api/health")
        assert response.status_code == 200
        data = response.json()
        assert data.get("status") == "healthy"


if __name__ == "__main__":
    pytest.main([__file__, "-v", "--tb=short"])
