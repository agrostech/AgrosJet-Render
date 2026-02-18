"""
Integration Stores API Tests
Tests multi-store functionality for platforms (Trendyol, Getir, Yemeksepeti)
"""
import pytest
import requests
import os
import uuid

BASE_URL = os.environ.get('REACT_APP_BACKEND_URL', '').rstrip('/')

# Test credentials
RESTAURANT_ID = "rest_c9c5cb06"
RESTAURANT_USERNAME = "testrestaurant"
RESTAURANT_PASSWORD = "password"


@pytest.fixture(scope="module")
def api_client():
    """Shared requests session"""
    session = requests.Session()
    session.headers.update({"Content-Type": "application/json"})
    return session


class TestIntegrationStoresAPI:
    """Multi-store CRUD tests"""
    
    def test_get_all_stores(self, api_client):
        """Test GET /api/integration-stores/{restaurant_id}"""
        response = api_client.get(f"{BASE_URL}/api/integration-stores/{RESTAURANT_ID}")
        
        assert response.status_code == 200
        data = response.json()
        
        # Verify response structure
        assert "restaurant_id" in data
        assert "stores" in data
        assert "platforms" in data
        
        # Verify platforms
        platforms = data["platforms"]
        assert "trendyol" in platforms
        assert "getir" in platforms
        assert "yemeksepeti" in platforms
        assert "migros" in platforms
        
        # Check platform config
        assert platforms["trendyol"]["name"] == "Trendyol Yemek"
        assert platforms["getir"]["name"] == "Getir Yemek"
        
        print(f"✓ GET stores returned {len(data['stores'])} stores")
    
    def test_get_stores_summary(self, api_client):
        """Test GET /api/integration-stores/{restaurant_id}/summary"""
        response = api_client.get(f"{BASE_URL}/api/integration-stores/{RESTAURANT_ID}/summary")
        
        assert response.status_code == 200
        data = response.json()
        
        assert "restaurant_id" in data
        assert "stores" in data
        assert isinstance(data["stores"], list)
        
        # Summary only shows connected stores
        print(f"✓ GET summary returned {len(data['stores'])} connected stores")
    
    def test_create_getir_store(self, api_client):
        """Test POST /api/integration-stores/{restaurant_id} - Create Getir store"""
        store_name = f"TEST_Getir_Merkez_{uuid.uuid4().hex[:6]}"
        
        payload = {
            "platform": "getir",
            "name": store_name,
            "enabled": True,
            "credentials": {
                "app_secret_key": "test-app-secret-key-123",
                "restaurant_secret_key": "test-restaurant-secret-key-456"
            }
        }
        
        response = api_client.post(f"{BASE_URL}/api/integration-stores/{RESTAURANT_ID}", json=payload)
        
        assert response.status_code == 200
        data = response.json()
        
        assert data["success"] == True
        assert "store" in data
        
        store = data["store"]
        assert store["platform"] == "getir"
        assert store["name"] == store_name
        assert store["enabled"] == True
        assert store["connected"] == False
        assert "id" in store
        
        # Credentials should be masked
        assert "***" in store["credentials"]["app_secret_key"]
        assert "***" in store["credentials"]["restaurant_secret_key"]
        
        print(f"✓ Created Getir store: {store['name']} (ID: {store['id']})")
        
        # Return store ID for cleanup
        return store["id"]
    
    def test_create_trendyol_store(self, api_client):
        """Test POST /api/integration-stores/{restaurant_id} - Create Trendyol store"""
        store_name = f"TEST_Trendyol_Ümraniye_{uuid.uuid4().hex[:6]}"
        
        payload = {
            "platform": "trendyol",
            "name": store_name,
            "enabled": True,
            "credentials": {
                "api_key": "test-api-key-789",
                "api_secret": "test-api-secret-012",
                "supplier_id": "999999",
                "store_id": "555"
            }
        }
        
        response = api_client.post(f"{BASE_URL}/api/integration-stores/{RESTAURANT_ID}", json=payload)
        
        assert response.status_code == 200
        data = response.json()
        
        assert data["success"] == True
        store = data["store"]
        
        assert store["platform"] == "trendyol"
        assert store["name"] == store_name
        assert store["credentials"]["supplier_id"] == "999999"
        
        print(f"✓ Created Trendyol store: {store['name']}")
        return store["id"]
    
    def test_create_yemeksepeti_store(self, api_client):
        """Test POST /api/integration-stores/{restaurant_id} - Create Yemeksepeti store"""
        store_name = f"TEST_YS_Kadıköy_{uuid.uuid4().hex[:6]}"
        
        payload = {
            "platform": "yemeksepeti",
            "name": store_name,
            "enabled": True,
            "credentials": {
                "client_id": "test-client-id",
                "client_secret": "test-client-secret",
                "chain_id": "chain123",
                "vendor_id": "vendor456"
            }
        }
        
        response = api_client.post(f"{BASE_URL}/api/integration-stores/{RESTAURANT_ID}", json=payload)
        
        assert response.status_code == 200
        data = response.json()
        
        assert data["success"] == True
        store = data["store"]
        
        assert store["platform"] == "yemeksepeti"
        assert store["credentials"]["chain_id"] == "chain123"
        
        print(f"✓ Created Yemeksepeti store: {store['name']}")
        return store["id"]
    
    def test_update_store(self, api_client):
        """Test PUT /api/integration-stores/{restaurant_id}/{store_id} - Update store"""
        # First create a store to update
        payload = {
            "platform": "getir",
            "name": f"TEST_Update_Store_{uuid.uuid4().hex[:6]}",
            "enabled": True,
            "credentials": {
                "app_secret_key": "original-key",
                "restaurant_secret_key": "original-secret"
            }
        }
        
        create_res = api_client.post(f"{BASE_URL}/api/integration-stores/{RESTAURANT_ID}", json=payload)
        assert create_res.status_code == 200
        store_id = create_res.json()["store"]["id"]
        
        # Update the store
        update_payload = {
            "name": "TEST_Updated_Store_Name",
            "enabled": False,
            "credentials": {
                "app_secret_key": "updated-key-123"
            }
        }
        
        response = api_client.put(f"{BASE_URL}/api/integration-stores/{RESTAURANT_ID}/{store_id}", json=update_payload)
        
        assert response.status_code == 200
        data = response.json()
        assert data["success"] == True
        
        # Verify the update by fetching all stores
        get_res = api_client.get(f"{BASE_URL}/api/integration-stores/{RESTAURANT_ID}")
        stores = get_res.json()["stores"]
        
        updated_store = next((s for s in stores if s["id"] == store_id), None)
        assert updated_store is not None
        assert updated_store["name"] == "TEST_Updated_Store_Name"
        assert updated_store["enabled"] == False
        
        print(f"✓ Updated store: {updated_store['name']}")
        return store_id
    
    def test_delete_store(self, api_client):
        """Test DELETE /api/integration-stores/{restaurant_id}/{store_id} - Delete store"""
        # First create a store to delete
        payload = {
            "platform": "getir",
            "name": f"TEST_Delete_Store_{uuid.uuid4().hex[:6]}",
            "enabled": True,
            "credentials": {}
        }
        
        create_res = api_client.post(f"{BASE_URL}/api/integration-stores/{RESTAURANT_ID}", json=payload)
        assert create_res.status_code == 200
        store_id = create_res.json()["store"]["id"]
        
        # Delete the store
        response = api_client.delete(f"{BASE_URL}/api/integration-stores/{RESTAURANT_ID}/{store_id}")
        
        assert response.status_code == 200
        data = response.json()
        assert data["success"] == True
        
        # Verify the store is deleted
        get_res = api_client.get(f"{BASE_URL}/api/integration-stores/{RESTAURANT_ID}")
        stores = get_res.json()["stores"]
        
        deleted_store = next((s for s in stores if s["id"] == store_id), None)
        assert deleted_store is None
        
        print(f"✓ Deleted store: {store_id}")
    
    def test_create_multiple_stores_same_platform(self, api_client):
        """Test creating multiple stores for the same platform"""
        # Create first store
        payload1 = {
            "platform": "trendyol",
            "name": f"TEST_Multi_TY_1_{uuid.uuid4().hex[:6]}",
            "enabled": True,
            "credentials": {"api_key": "key1", "supplier_id": "100001"}
        }
        
        res1 = api_client.post(f"{BASE_URL}/api/integration-stores/{RESTAURANT_ID}", json=payload1)
        assert res1.status_code == 200
        store1_id = res1.json()["store"]["id"]
        
        # Create second store for the same platform
        payload2 = {
            "platform": "trendyol",
            "name": f"TEST_Multi_TY_2_{uuid.uuid4().hex[:6]}",
            "enabled": True,
            "credentials": {"api_key": "key2", "supplier_id": "100002"}
        }
        
        res2 = api_client.post(f"{BASE_URL}/api/integration-stores/{RESTAURANT_ID}", json=payload2)
        assert res2.status_code == 200
        store2_id = res2.json()["store"]["id"]
        
        # Verify both stores exist
        get_res = api_client.get(f"{BASE_URL}/api/integration-stores/{RESTAURANT_ID}")
        stores = get_res.json()["stores"]
        
        trendyol_stores = [s for s in stores if s["platform"] == "trendyol"]
        assert len(trendyol_stores) >= 2
        
        print(f"✓ Multiple Trendyol stores exist: {len(trendyol_stores)} stores")
    
    def test_invalid_platform(self, api_client):
        """Test creating store with invalid platform"""
        payload = {
            "platform": "invalid_platform",
            "name": "Invalid Store",
            "enabled": True,
            "credentials": {}
        }
        
        response = api_client.post(f"{BASE_URL}/api/integration-stores/{RESTAURANT_ID}", json=payload)
        
        assert response.status_code == 400
        data = response.json()
        assert "Desteklenmeyen platform" in data["detail"]
        
        print("✓ Invalid platform rejected correctly")
    
    def test_restaurant_not_found(self, api_client):
        """Test with non-existent restaurant"""
        response = api_client.get(f"{BASE_URL}/api/integration-stores/nonexistent_restaurant")
        
        assert response.status_code == 404
        data = response.json()
        assert "Restoran bulunamadı" in data["detail"]
        
        print("✓ Non-existent restaurant handled correctly")


class TestStoreStatusAPI:
    """Tests for store status update endpoint"""
    
    def test_status_update_requires_connection(self, api_client):
        """Test PUT /api/integration-stores/{restaurant_id}/{store_id}/status requires connected store"""
        # Get existing stores
        get_res = api_client.get(f"{BASE_URL}/api/integration-stores/{RESTAURANT_ID}")
        stores = get_res.json()["stores"]
        
        if not stores:
            pytest.skip("No stores available for testing")
        
        # Find a non-connected store
        non_connected = next((s for s in stores if not s.get("connected")), None)
        if not non_connected:
            pytest.skip("No non-connected stores available")
        
        # Try to update status
        response = api_client.put(
            f"{BASE_URL}/api/integration-stores/{RESTAURANT_ID}/{non_connected['id']}/status",
            json={"is_open": True}
        )
        
        assert response.status_code == 400
        data = response.json()
        assert "bağlantısı yok" in data["detail"].lower()
        
        print(f"✓ Status update blocked for non-connected store")


class TestCleanup:
    """Cleanup test data"""
    
    def test_cleanup_test_stores(self, api_client):
        """Remove all TEST_ prefixed stores"""
        get_res = api_client.get(f"{BASE_URL}/api/integration-stores/{RESTAURANT_ID}")
        stores = get_res.json()["stores"]
        
        deleted_count = 0
        for store in stores:
            if store["name"].startswith("TEST_"):
                del_res = api_client.delete(f"{BASE_URL}/api/integration-stores/{RESTAURANT_ID}/{store['id']}")
                if del_res.status_code == 200:
                    deleted_count += 1
        
        print(f"✓ Cleaned up {deleted_count} test stores")


if __name__ == "__main__":
    pytest.main([__file__, "-v", "--tb=short"])
