"""
Test Category Reorder Feature
Tests the category sorting/reordering functionality in Products page
"""
import pytest
import requests
import os

BASE_URL = os.environ.get('REACT_APP_BACKEND_URL', '').rstrip('/')

class TestCategoryReorder:
    """Category reorder API tests"""
    
    @pytest.fixture(autouse=True)
    def setup(self):
        """Setup test data - restaurant_id from known test data"""
        self.restaurant_id = "rest_c9c5cb06"
        self.session = requests.Session()
        self.session.headers.update({"Content-Type": "application/json"})
    
    def test_get_restaurant_products_returns_ordered_categories(self):
        """Test: GET /api/products/restaurant/{id} returns categories sorted by 'order' field"""
        response = self.session.get(f"{BASE_URL}/api/products/restaurant/{self.restaurant_id}")
        
        assert response.status_code == 200, f"Expected 200, got {response.status_code}"
        
        data = response.json()
        assert "categories" in data
        assert "products" in data
        
        categories = data["categories"]
        assert len(categories) >= 2, "At least 2 categories needed for ordering test"
        
        # Verify categories have 'order' field
        for cat in categories:
            assert "id" in cat
            assert "name" in cat
            assert "order" in cat, f"Category {cat.get('name')} missing 'order' field"
        
        # Verify categories are sorted by order field
        for i in range(len(categories) - 1):
            assert categories[i].get("order", 0) <= categories[i + 1].get("order", 0), \
                f"Categories not sorted by order: {categories[i]['name']} (order={categories[i].get('order')}) should come before {categories[i+1]['name']} (order={categories[i+1].get('order')})"
        
        print(f"✓ Categories returned in correct order: {[c['name'] for c in categories]}")
    
    def test_reorder_categories_endpoint_exists(self):
        """Test: PUT /api/products/categories/reorder endpoint exists and accepts valid payload"""
        # First, get current categories
        get_response = self.session.get(f"{BASE_URL}/api/products/restaurant/{self.restaurant_id}")
        assert get_response.status_code == 200
        
        categories = get_response.json()["categories"]
        
        if len(categories) < 2:
            pytest.skip("Not enough categories to test reordering")
        
        # Build reorder payload (keep same order)
        category_orders = [{"id": cat["id"], "order": idx} for idx, cat in enumerate(categories)]
        
        response = self.session.put(
            f"{BASE_URL}/api/products/categories/reorder",
            json={
                "restaurant_id": self.restaurant_id,
                "category_orders": category_orders
            }
        )
        
        assert response.status_code == 200, f"Expected 200, got {response.status_code}: {response.text}"
        
        data = response.json()
        assert data.get("success") == True
        assert "message" in data
        
        print(f"✓ Reorder endpoint works correctly")
    
    def test_reorder_categories_changes_order(self):
        """Test: Reordering categories actually changes their order in database"""
        # Get current categories
        get_response = self.session.get(f"{BASE_URL}/api/products/restaurant/{self.restaurant_id}")
        assert get_response.status_code == 200
        
        categories = get_response.json()["categories"]
        
        if len(categories) < 2:
            pytest.skip("Not enough categories to test reordering")
        
        # Reverse the order
        reversed_orders = [
            {"id": cat["id"], "order": len(categories) - 1 - idx} 
            for idx, cat in enumerate(categories)
        ]
        
        # Apply reversed order
        response = self.session.put(
            f"{BASE_URL}/api/products/categories/reorder",
            json={
                "restaurant_id": self.restaurant_id,
                "category_orders": reversed_orders
            }
        )
        
        assert response.status_code == 200
        
        # Verify order changed
        verify_response = self.session.get(f"{BASE_URL}/api/products/restaurant/{self.restaurant_id}")
        assert verify_response.status_code == 200
        
        new_categories = verify_response.json()["categories"]
        
        # First category should now be last one from original
        assert new_categories[0]["id"] == categories[-1]["id"], \
            f"Expected first category to be {categories[-1]['name']}, got {new_categories[0]['name']}"
        
        print(f"✓ Categories reordered: {[c['name'] for c in new_categories]}")
        
        # Restore original order for cleanup
        original_orders = [{"id": cat["id"], "order": idx} for idx, cat in enumerate(categories)]
        self.session.put(
            f"{BASE_URL}/api/products/categories/reorder",
            json={
                "restaurant_id": self.restaurant_id,
                "category_orders": original_orders
            }
        )
    
    def test_reorder_with_invalid_restaurant_id(self):
        """Test: Reorder with non-existent restaurant_id should still work (no validation)"""
        # The endpoint doesn't validate restaurant_id strictly - just updates categories
        response = self.session.put(
            f"{BASE_URL}/api/products/categories/reorder",
            json={
                "restaurant_id": "non_existent_restaurant",
                "category_orders": [{"id": "some_id", "order": 0}]
            }
        )
        
        # Should return 200 (no strict validation on restaurant_id)
        assert response.status_code == 200
        print(f"✓ Reorder handles non-existent restaurant gracefully")
    
    def test_reorder_preserves_order_on_page_refresh(self):
        """Test: After reordering, the new order persists on page refresh (GET)"""
        # Get current categories
        get_response = self.session.get(f"{BASE_URL}/api/products/restaurant/{self.restaurant_id}")
        categories = get_response.json()["categories"]
        
        if len(categories) < 2:
            pytest.skip("Not enough categories")
        
        # Swap first two categories
        swap_orders = [{"id": cat["id"], "order": cat.get("order", idx)} for idx, cat in enumerate(categories)]
        swap_orders[0], swap_orders[1] = (
            {"id": swap_orders[0]["id"], "order": swap_orders[1]["order"]},
            {"id": swap_orders[1]["id"], "order": swap_orders[0]["order"]}
        )
        
        # Apply swap
        self.session.put(
            f"{BASE_URL}/api/products/categories/reorder",
            json={
                "restaurant_id": self.restaurant_id,
                "category_orders": swap_orders
            }
        )
        
        # Simulate "page refresh" - get data again
        refresh_response = self.session.get(f"{BASE_URL}/api/products/restaurant/{self.restaurant_id}")
        refreshed_categories = refresh_response.json()["categories"]
        
        # Verify order is preserved
        assert refreshed_categories[0]["id"] == categories[1]["id"], \
            "Order not preserved after refresh"
        assert refreshed_categories[1]["id"] == categories[0]["id"], \
            "Order not preserved after refresh"
        
        print(f"✓ Order persists after page refresh")
        
        # Restore original order
        restore_orders = [{"id": cat["id"], "order": idx} for idx, cat in enumerate(categories)]
        self.session.put(
            f"{BASE_URL}/api/products/categories/reorder",
            json={
                "restaurant_id": self.restaurant_id,
                "category_orders": restore_orders
            }
        )


class TestCategoryReorderValidation:
    """Validation tests for category reorder"""
    
    @pytest.fixture(autouse=True)
    def setup(self):
        self.restaurant_id = "rest_c9c5cb06"
        self.session = requests.Session()
        self.session.headers.update({"Content-Type": "application/json"})
    
    def test_reorder_requires_restaurant_id(self):
        """Test: Missing restaurant_id should return 422"""
        response = self.session.put(
            f"{BASE_URL}/api/products/categories/reorder",
            json={
                "category_orders": [{"id": "some_id", "order": 0}]
            }
        )
        
        assert response.status_code == 422, "Missing restaurant_id should return 422"
        print("✓ Missing restaurant_id returns 422")
    
    def test_reorder_requires_category_orders(self):
        """Test: Missing category_orders should return 422"""
        response = self.session.put(
            f"{BASE_URL}/api/products/categories/reorder",
            json={
                "restaurant_id": self.restaurant_id
            }
        )
        
        assert response.status_code == 422, "Missing category_orders should return 422"
        print("✓ Missing category_orders returns 422")
    
    def test_reorder_accepts_empty_category_orders(self):
        """Test: Empty category_orders array should work (no-op)"""
        response = self.session.put(
            f"{BASE_URL}/api/products/categories/reorder",
            json={
                "restaurant_id": self.restaurant_id,
                "category_orders": []
            }
        )
        
        assert response.status_code == 200
        print("✓ Empty category_orders array accepted")


if __name__ == "__main__":
    pytest.main([__file__, "-v"])
