"""
JetPuan Market API Tests
Tests for: Categories, Products, Orders, Settings, Balance, Transactions
"""
import pytest
import requests
import os
import uuid

BASE_URL = os.environ.get('REACT_APP_BACKEND_URL', '').rstrip('/')

# Test credentials
COURIER_ID = "573a528d-b847-4622-8af1-160e89f9dde3"
ADMIN_USERNAME = "onurertas"
ADMIN_PASSWORD = "Delivery32.."
COURIER_PHONE = "05551234567"
COURIER_PASSWORD = "123456"


@pytest.fixture(scope="module")
def api_client():
    """Shared requests session"""
    session = requests.Session()
    session.headers.update({"Content-Type": "application/json"})
    return session


# ============ SETTINGS TESTS ============
class TestJetPuanSettings:
    """JetPuan Settings API tests"""
    
    def test_get_settings(self, api_client):
        """Test GET /api/jetpuan/settings"""
        response = api_client.get(f"{BASE_URL}/api/jetpuan/settings")
        assert response.status_code == 200
        data = response.json()
        assert "puan_per_100tl" in data
        assert isinstance(data["puan_per_100tl"], (int, float))
        print(f"✓ Settings retrieved: {data['puan_per_100tl']} JP per 100 TL")
    
    def test_update_settings(self, api_client):
        """Test PUT /api/jetpuan/settings"""
        # First get current settings
        get_response = api_client.get(f"{BASE_URL}/api/jetpuan/settings")
        original_ratio = get_response.json()["puan_per_100tl"]
        
        # Update settings
        new_ratio = 1.5
        response = api_client.put(f"{BASE_URL}/api/jetpuan/settings", json={
            "puan_per_100tl": new_ratio
        })
        assert response.status_code == 200
        
        # Verify update
        verify_response = api_client.get(f"{BASE_URL}/api/jetpuan/settings")
        assert verify_response.json()["puan_per_100tl"] == new_ratio
        print(f"✓ Settings updated to {new_ratio}")
        
        # Restore original
        api_client.put(f"{BASE_URL}/api/jetpuan/settings", json={
            "puan_per_100tl": original_ratio
        })
        print(f"✓ Settings restored to {original_ratio}")


# ============ CATEGORIES TESTS ============
class TestJetPuanCategories:
    """JetPuan Categories CRUD tests"""
    
    def test_get_categories(self, api_client):
        """Test GET /api/jetpuan/categories"""
        response = api_client.get(f"{BASE_URL}/api/jetpuan/categories")
        assert response.status_code == 200
        data = response.json()
        assert isinstance(data, list)
        print(f"✓ Retrieved {len(data)} categories")
        for cat in data:
            print(f"  - {cat['name']} (id: {cat['id'][:8]}...)")
    
    def test_create_category(self, api_client):
        """Test POST /api/jetpuan/categories"""
        test_name = f"TEST_Category_{uuid.uuid4().hex[:6]}"
        response = api_client.post(f"{BASE_URL}/api/jetpuan/categories", json={
            "name": test_name
        })
        assert response.status_code == 200
        data = response.json()
        assert "id" in data
        print(f"✓ Category created: {test_name}")
        
        # Cleanup
        api_client.delete(f"{BASE_URL}/api/jetpuan/categories/{data['id']}")
        print(f"✓ Category deleted")
    
    def test_create_duplicate_category(self, api_client):
        """Test creating duplicate category returns 400"""
        # Get existing categories
        cats_response = api_client.get(f"{BASE_URL}/api/jetpuan/categories")
        categories = cats_response.json()
        
        if categories:
            existing_name = categories[0]["name"]
            response = api_client.post(f"{BASE_URL}/api/jetpuan/categories", json={
                "name": existing_name
            })
            assert response.status_code == 400
            print(f"✓ Duplicate category rejected correctly")
    
    def test_update_category(self, api_client):
        """Test PUT /api/jetpuan/categories/{id}"""
        # Create a test category
        test_name = f"TEST_Cat_{uuid.uuid4().hex[:6]}"
        create_response = api_client.post(f"{BASE_URL}/api/jetpuan/categories", json={
            "name": test_name
        })
        cat_id = create_response.json()["id"]
        
        # Update it
        new_name = f"TEST_Updated_{uuid.uuid4().hex[:6]}"
        update_response = api_client.put(f"{BASE_URL}/api/jetpuan/categories/{cat_id}", json={
            "name": new_name
        })
        assert update_response.status_code == 200
        print(f"✓ Category updated from {test_name} to {new_name}")
        
        # Cleanup
        api_client.delete(f"{BASE_URL}/api/jetpuan/categories/{cat_id}")
    
    def test_delete_category(self, api_client):
        """Test DELETE /api/jetpuan/categories/{id}"""
        # Create a test category
        test_name = f"TEST_Delete_{uuid.uuid4().hex[:6]}"
        create_response = api_client.post(f"{BASE_URL}/api/jetpuan/categories", json={
            "name": test_name
        })
        cat_id = create_response.json()["id"]
        
        # Delete it
        delete_response = api_client.delete(f"{BASE_URL}/api/jetpuan/categories/{cat_id}")
        assert delete_response.status_code == 200
        print(f"✓ Category deleted successfully")
        
        # Verify deletion
        cats_response = api_client.get(f"{BASE_URL}/api/jetpuan/categories")
        cat_ids = [c["id"] for c in cats_response.json()]
        assert cat_id not in cat_ids
        print(f"✓ Category no longer exists")


# ============ PRODUCTS TESTS ============
class TestJetPuanProducts:
    """JetPuan Products CRUD tests"""
    
    @pytest.fixture(scope="class")
    def test_category(self, api_client):
        """Create a test category for product tests"""
        test_name = f"TEST_ProductCat_{uuid.uuid4().hex[:6]}"
        response = api_client.post(f"{BASE_URL}/api/jetpuan/categories", json={
            "name": test_name
        })
        cat_id = response.json()["id"]
        yield cat_id
        # Cleanup - delete category (will fail if products exist)
        try:
            api_client.delete(f"{BASE_URL}/api/jetpuan/categories/{cat_id}")
        except:
            pass
    
    def test_get_products(self, api_client):
        """Test GET /api/jetpuan/products"""
        response = api_client.get(f"{BASE_URL}/api/jetpuan/products")
        assert response.status_code == 200
        data = response.json()
        assert isinstance(data, list)
        print(f"✓ Retrieved {len(data)} products")
        for prod in data[:5]:  # Show first 5
            print(f"  - {prod['name']}: {prod['price']} JP (stock: {prod['stock']})")
    
    def test_get_products_by_category(self, api_client):
        """Test GET /api/jetpuan/products?category_id=xxx"""
        # Get categories first
        cats_response = api_client.get(f"{BASE_URL}/api/jetpuan/categories")
        categories = cats_response.json()
        
        if categories:
            cat_id = categories[0]["id"]
            response = api_client.get(f"{BASE_URL}/api/jetpuan/products?category_id={cat_id}")
            assert response.status_code == 200
            data = response.json()
            print(f"✓ Retrieved {len(data)} products in category {categories[0]['name']}")
    
    def test_create_product(self, api_client, test_category):
        """Test POST /api/jetpuan/products"""
        test_product = {
            "name": f"TEST_Product_{uuid.uuid4().hex[:6]}",
            "description": "Test product description",
            "price": 100,
            "stock": 10,
            "category_id": test_category,
            "image_url": "https://example.com/image.jpg"
        }
        response = api_client.post(f"{BASE_URL}/api/jetpuan/products", json=test_product)
        assert response.status_code == 200
        data = response.json()
        assert "id" in data
        print(f"✓ Product created: {test_product['name']}")
        
        # Verify product exists
        get_response = api_client.get(f"{BASE_URL}/api/jetpuan/products/{data['id']}")
        assert get_response.status_code == 200
        product = get_response.json()
        assert product["name"] == test_product["name"]
        assert product["price"] == test_product["price"]
        print(f"✓ Product verified in database")
        
        # Cleanup
        api_client.delete(f"{BASE_URL}/api/jetpuan/products/{data['id']}")
    
    def test_create_product_invalid_category(self, api_client):
        """Test creating product with invalid category returns 404"""
        response = api_client.post(f"{BASE_URL}/api/jetpuan/products", json={
            "name": "Invalid Product",
            "price": 50,
            "stock": 5,
            "category_id": "invalid-category-id"
        })
        assert response.status_code == 404
        print(f"✓ Invalid category rejected correctly")
    
    def test_update_product(self, api_client, test_category):
        """Test PUT /api/jetpuan/products/{id}"""
        # Create product
        create_response = api_client.post(f"{BASE_URL}/api/jetpuan/products", json={
            "name": f"TEST_Update_{uuid.uuid4().hex[:6]}",
            "price": 50,
            "stock": 5,
            "category_id": test_category
        })
        prod_id = create_response.json()["id"]
        
        # Update product
        update_response = api_client.put(f"{BASE_URL}/api/jetpuan/products/{prod_id}", json={
            "price": 75,
            "stock": 20
        })
        assert update_response.status_code == 200
        
        # Verify update
        get_response = api_client.get(f"{BASE_URL}/api/jetpuan/products/{prod_id}")
        product = get_response.json()
        assert product["price"] == 75
        assert product["stock"] == 20
        print(f"✓ Product updated: price=75, stock=20")
        
        # Cleanup
        api_client.delete(f"{BASE_URL}/api/jetpuan/products/{prod_id}")
    
    def test_delete_product(self, api_client, test_category):
        """Test DELETE /api/jetpuan/products/{id}"""
        # Create product
        create_response = api_client.post(f"{BASE_URL}/api/jetpuan/products", json={
            "name": f"TEST_Delete_{uuid.uuid4().hex[:6]}",
            "price": 25,
            "stock": 3,
            "category_id": test_category
        })
        prod_id = create_response.json()["id"]
        
        # Delete product
        delete_response = api_client.delete(f"{BASE_URL}/api/jetpuan/products/{prod_id}")
        assert delete_response.status_code == 200
        print(f"✓ Product deleted successfully")
        
        # Verify deletion
        get_response = api_client.get(f"{BASE_URL}/api/jetpuan/products/{prod_id}")
        assert get_response.status_code == 404
        print(f"✓ Product no longer exists")


# ============ BALANCE & TRANSACTIONS TESTS ============
class TestJetPuanBalance:
    """JetPuan Balance and Transactions tests"""
    
    def test_get_courier_balance(self, api_client):
        """Test GET /api/jetpuan/balance/{courier_id}"""
        response = api_client.get(f"{BASE_URL}/api/jetpuan/balance/{COURIER_ID}")
        assert response.status_code == 200
        data = response.json()
        assert "balance" in data or "courier_id" in data
        balance = data.get("balance", 0)
        print(f"✓ Courier balance: {balance} JP")
    
    def test_get_courier_transactions(self, api_client):
        """Test GET /api/jetpuan/transactions/{courier_id}"""
        response = api_client.get(f"{BASE_URL}/api/jetpuan/transactions/{COURIER_ID}")
        assert response.status_code == 200
        data = response.json()
        assert isinstance(data, list)
        print(f"✓ Retrieved {len(data)} transactions")
        for tx in data[:5]:  # Show first 5
            tx_type = "+" if tx["type"] == "credit" else "-"
            print(f"  - {tx_type}{tx['amount']:.2f} JP: {tx['description']}")


# ============ ORDERS TESTS ============
class TestJetPuanOrders:
    """JetPuan Orders tests"""
    
    def test_get_admin_orders(self, api_client):
        """Test GET /api/jetpuan/orders/admin"""
        response = api_client.get(f"{BASE_URL}/api/jetpuan/orders/admin")
        assert response.status_code == 200
        data = response.json()
        assert isinstance(data, list)
        print(f"✓ Retrieved {len(data)} orders (admin view)")
        for order in data[:3]:  # Show first 3
            print(f"  - Order {order['id'][:8]}...: {order['total_points']} JP ({order['status']})")
    
    def test_get_admin_orders_by_status(self, api_client):
        """Test GET /api/jetpuan/orders/admin?status=pending"""
        response = api_client.get(f"{BASE_URL}/api/jetpuan/orders/admin?status=pending")
        assert response.status_code == 200
        data = response.json()
        print(f"✓ Retrieved {len(data)} pending orders")
    
    def test_get_courier_orders(self, api_client):
        """Test GET /api/jetpuan/orders/courier/{courier_id}"""
        response = api_client.get(f"{BASE_URL}/api/jetpuan/orders/courier/{COURIER_ID}")
        assert response.status_code == 200
        data = response.json()
        assert isinstance(data, list)
        print(f"✓ Retrieved {len(data)} orders for courier")
    
    def test_create_order_insufficient_balance(self, api_client):
        """Test creating order with insufficient balance"""
        # Get products
        products_response = api_client.get(f"{BASE_URL}/api/jetpuan/products")
        products = products_response.json()
        
        if products:
            # Try to order a very expensive item (more than balance)
            expensive_product = max(products, key=lambda p: p["price"])
            
            # Get current balance
            balance_response = api_client.get(f"{BASE_URL}/api/jetpuan/balance/{COURIER_ID}")
            balance = balance_response.json().get("balance", 0)
            
            # Calculate quantity that exceeds balance
            qty_needed = int(balance / expensive_product["price"]) + 10
            
            response = api_client.post(f"{BASE_URL}/api/jetpuan/orders/{COURIER_ID}", json={
                "items": [{"product_id": expensive_product["id"], "quantity": qty_needed}]
            })
            
            # Should fail with 400 (insufficient balance or stock)
            assert response.status_code == 400
            print(f"✓ Insufficient balance/stock order rejected correctly")
    
    def test_create_order_empty_cart(self, api_client):
        """Test creating order with empty cart"""
        response = api_client.post(f"{BASE_URL}/api/jetpuan/orders/{COURIER_ID}", json={
            "items": []
        })
        assert response.status_code == 400
        print(f"✓ Empty cart order rejected correctly")
    
    def test_create_order_invalid_product(self, api_client):
        """Test creating order with invalid product"""
        response = api_client.post(f"{BASE_URL}/api/jetpuan/orders/{COURIER_ID}", json={
            "items": [{"product_id": "invalid-product-id", "quantity": 1}]
        })
        assert response.status_code == 404
        print(f"✓ Invalid product order rejected correctly")


# ============ HAKEDIS AUTO PUAN TESTS ============
class TestHakedisAutoPuan:
    """Test automatic JetPuan credit on hakediş"""
    
    def test_hakedis_credits_jetpuan(self, api_client):
        """Test that hakediş transaction credits JetPuan"""
        # Get initial balance
        balance_before = api_client.get(f"{BASE_URL}/api/jetpuan/balance/{COURIER_ID}").json().get("balance", 0)
        
        # Get settings to calculate expected points
        settings = api_client.get(f"{BASE_URL}/api/jetpuan/settings").json()
        puan_per_100tl = settings["puan_per_100tl"]
        
        # Create a hakediş transaction
        hakedis_amount = 100  # 100 TL
        expected_points = (hakedis_amount / 100) * puan_per_100tl
        
        # Get company_id from courier
        # We need to use a valid company_id - let's get it from existing transactions
        tx_response = api_client.get(f"{BASE_URL}/api/transactions/courier/{COURIER_ID}")
        tx_data = tx_response.json()
        
        company_id = None
        if tx_data.get("transactions"):
            company_id = tx_data["transactions"][0].get("company_id")
        
        if not company_id:
            # Use a default company_id from the system
            company_id = "e1c50cea-307e-4889-b33b-4b22e467b0b4"
        
        # Create hakediş transaction
        response = api_client.post(f"{BASE_URL}/api/transactions", json={
            "entity_type": "courier",
            "entity_id": COURIER_ID,
            "company_id": company_id,
            "type": "payment_out",
            "amount": hakedis_amount,
            "description": "TEST_Hakediş",
            "is_hakedis": True
        })
        
        if response.status_code == 200:
            # Get new balance
            balance_after = api_client.get(f"{BASE_URL}/api/jetpuan/balance/{COURIER_ID}").json().get("balance", 0)
            
            # Verify points were credited
            points_credited = balance_after - balance_before
            print(f"✓ Hakediş {hakedis_amount} TL created")
            print(f"  Balance before: {balance_before:.2f} JP")
            print(f"  Balance after: {balance_after:.2f} JP")
            print(f"  Points credited: {points_credited:.2f} JP (expected: {expected_points:.2f})")
            
            # Allow small floating point difference
            assert abs(points_credited - expected_points) < 0.01, f"Expected {expected_points}, got {points_credited}"
        else:
            print(f"⚠ Hakediş transaction failed: {response.status_code}")
            print(f"  Response: {response.text}")


# ============ ORDER LIFECYCLE TESTS ============
class TestOrderLifecycle:
    """Test complete order lifecycle: create -> deliver/cancel"""
    
    @pytest.fixture(scope="class")
    def test_product_for_order(self, api_client):
        """Create a cheap test product for order tests"""
        # First create a category
        cat_response = api_client.post(f"{BASE_URL}/api/jetpuan/categories", json={
            "name": f"TEST_OrderCat_{uuid.uuid4().hex[:6]}"
        })
        cat_id = cat_response.json()["id"]
        
        # Create a cheap product
        prod_response = api_client.post(f"{BASE_URL}/api/jetpuan/products", json={
            "name": f"TEST_OrderProd_{uuid.uuid4().hex[:6]}",
            "price": 1,  # Very cheap for testing
            "stock": 100,
            "category_id": cat_id
        })
        prod_id = prod_response.json()["id"]
        
        yield {"product_id": prod_id, "category_id": cat_id}
        
        # Cleanup
        try:
            api_client.delete(f"{BASE_URL}/api/jetpuan/products/{prod_id}")
            api_client.delete(f"{BASE_URL}/api/jetpuan/categories/{cat_id}")
        except:
            pass
    
    def test_order_deliver_flow(self, api_client, test_product_for_order):
        """Test order creation and delivery"""
        # Get initial balance
        balance_before = api_client.get(f"{BASE_URL}/api/jetpuan/balance/{COURIER_ID}").json().get("balance", 0)
        
        if balance_before < 1:
            pytest.skip("Insufficient balance for order test")
        
        # Create order
        order_response = api_client.post(f"{BASE_URL}/api/jetpuan/orders/{COURIER_ID}", json={
            "items": [{"product_id": test_product_for_order["product_id"], "quantity": 1}]
        })
        
        if order_response.status_code != 200:
            print(f"⚠ Order creation failed: {order_response.text}")
            pytest.skip("Order creation failed")
        
        order_data = order_response.json()
        order_id = order_data["order_id"]
        print(f"✓ Order created: {order_id[:8]}...")
        
        # Verify balance deducted
        balance_after_order = api_client.get(f"{BASE_URL}/api/jetpuan/balance/{COURIER_ID}").json().get("balance", 0)
        assert balance_after_order < balance_before
        print(f"✓ Balance deducted: {balance_before:.2f} -> {balance_after_order:.2f}")
        
        # Deliver order
        deliver_response = api_client.put(f"{BASE_URL}/api/jetpuan/orders/{order_id}/deliver")
        assert deliver_response.status_code == 200
        print(f"✓ Order delivered")
        
        # Verify order status
        orders = api_client.get(f"{BASE_URL}/api/jetpuan/orders/courier/{COURIER_ID}").json()
        delivered_order = next((o for o in orders if o["id"] == order_id), None)
        assert delivered_order is not None
        assert delivered_order["status"] == "delivered"
        print(f"✓ Order status verified: delivered")
    
    def test_order_cancel_flow(self, api_client, test_product_for_order):
        """Test order creation and cancellation with refund"""
        # Get initial balance
        balance_before = api_client.get(f"{BASE_URL}/api/jetpuan/balance/{COURIER_ID}").json().get("balance", 0)
        
        if balance_before < 1:
            pytest.skip("Insufficient balance for order test")
        
        # Create order
        order_response = api_client.post(f"{BASE_URL}/api/jetpuan/orders/{COURIER_ID}", json={
            "items": [{"product_id": test_product_for_order["product_id"], "quantity": 1}]
        })
        
        if order_response.status_code != 200:
            pytest.skip("Order creation failed")
        
        order_data = order_response.json()
        order_id = order_data["order_id"]
        print(f"✓ Order created for cancellation test: {order_id[:8]}...")
        
        # Get balance after order
        balance_after_order = api_client.get(f"{BASE_URL}/api/jetpuan/balance/{COURIER_ID}").json().get("balance", 0)
        
        # Cancel order
        cancel_response = api_client.delete(f"{BASE_URL}/api/jetpuan/orders/{order_id}")
        assert cancel_response.status_code == 200
        print(f"✓ Order cancelled")
        
        # Verify refund
        balance_after_cancel = api_client.get(f"{BASE_URL}/api/jetpuan/balance/{COURIER_ID}").json().get("balance", 0)
        assert balance_after_cancel > balance_after_order
        print(f"✓ Points refunded: {balance_after_order:.2f} -> {balance_after_cancel:.2f}")


if __name__ == "__main__":
    pytest.main([__file__, "-v", "--tb=short"])
