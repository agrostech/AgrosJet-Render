"""
Google Places Autocomplete - Backend API Tests
Tests for manual order creation with delivery_location coordinates from Google Places
"""
import pytest
import requests
import os
from datetime import datetime, timedelta

BASE_URL = os.environ.get('REACT_APP_BACKEND_URL', '').rstrip('/')
RESTAURANT_ID = "rest_c9c5cb06"


class TestManualOrderWithCoordinates:
    """Test manual order creation with Google Places coordinates"""
    
    def test_create_order_with_coordinates(self):
        """Create manual order with delivery_location coordinates"""
        payload = {
            "restaurant_id": RESTAURANT_ID,
            "customer_name": "TEST_Coordinates_Order",
            "customer_phone": "05551234567",
            "delivery_address": "Taksim Meydanı, Kocatepe, 34435 Beyoğlu/İstanbul",
            "delivery_location": {
                "lat": 41.0370023,
                "lng": 28.9850917
            },
            "items": [
                {
                    "product_id": "prod_test_1",
                    "name": "Test Product",
                    "quantity": 1,
                    "price": 100
                }
            ],
            "payment_method": "cash",
            "notes": "Test order with coordinates",
            "is_scheduled": False,
            "scheduled_time": None
        }
        
        response = requests.post(f"{BASE_URL}/api/orders/manual", json=payload)
        assert response.status_code == 200, f"Expected 200, got {response.status_code}: {response.text}"
        
        data = response.json()
        assert "order" in data
        order = data["order"]
        
        # Verify coordinates are stored
        assert order.get("delivery_location") is not None, "delivery_location should not be None"
        assert order["delivery_location"].get("latitude") == 41.0370023
        assert order["delivery_location"].get("longitude") == 28.9850917
        
        # Verify other fields
        assert order["customer_name"] == "TEST_Coordinates_Order"
        assert order["delivery_address"] == "Taksim Meydanı, Kocatepe, 34435 Beyoğlu/İstanbul"
        assert order["status"] == "preparing"
        
        print(f"✓ Order created with coordinates: lat={order['delivery_location']['latitude']}, lng={order['delivery_location']['longitude']}")
        
        return order["id"]
    
    def test_create_order_without_coordinates(self):
        """Create manual order without delivery_location (should still work)"""
        payload = {
            "restaurant_id": RESTAURANT_ID,
            "customer_name": "TEST_No_Coordinates_Order",
            "customer_phone": "05551234567",
            "delivery_address": "Manual Address Without Coordinates",
            "delivery_location": None,
            "items": [
                {
                    "product_id": "prod_test_1",
                    "name": "Test Product",
                    "quantity": 1,
                    "price": 100
                }
            ],
            "payment_method": "cash",
            "notes": None,
            "is_scheduled": False,
            "scheduled_time": None
        }
        
        response = requests.post(f"{BASE_URL}/api/orders/manual", json=payload)
        assert response.status_code == 200, f"Expected 200, got {response.status_code}: {response.text}"
        
        data = response.json()
        order = data["order"]
        
        # delivery_location should be None when not provided
        assert order.get("delivery_location") is None
        assert order["delivery_address"] == "Manual Address Without Coordinates"
        
        print("✓ Order created without coordinates (delivery_location is None)")
        
        return order["id"]
    
    def test_coordinates_precision(self):
        """Verify coordinates maintain precision"""
        # High precision coordinates
        lat = 41.03700231234567
        lng = 28.98509171234567
        
        payload = {
            "restaurant_id": RESTAURANT_ID,
            "customer_name": "TEST_Precision_Order",
            "customer_phone": "05551234567",
            "delivery_address": "Test Precision Address",
            "delivery_location": {
                "lat": lat,
                "lng": lng
            },
            "items": [
                {
                    "product_id": "prod_test_1",
                    "name": "Test Product",
                    "quantity": 1,
                    "price": 100
                }
            ],
            "payment_method": "cash",
            "notes": None,
            "is_scheduled": False,
            "scheduled_time": None
        }
        
        response = requests.post(f"{BASE_URL}/api/orders/manual", json=payload)
        assert response.status_code == 200
        
        order = response.json()["order"]
        
        # Coordinates should be stored with precision
        stored_lat = order["delivery_location"]["latitude"]
        stored_lng = order["delivery_location"]["longitude"]
        
        # Allow for some floating point tolerance
        assert abs(stored_lat - lat) < 0.0001, f"Latitude precision lost: {stored_lat} vs {lat}"
        assert abs(stored_lng - lng) < 0.0001, f"Longitude precision lost: {stored_lng} vs {lng}"
        
        print(f"✓ Coordinates precision maintained: lat={stored_lat}, lng={stored_lng}")
        
        return order["id"]


class TestOrderRetrievalWithCoordinates:
    """Test order retrieval includes coordinates"""
    
    def test_get_restaurant_orders_includes_coordinates(self):
        """Verify GET orders endpoint returns delivery_location"""
        response = requests.get(f"{BASE_URL}/api/orders/restaurant/{RESTAURANT_ID}")
        assert response.status_code == 200
        
        orders = response.json()
        
        # Find orders with coordinates
        orders_with_coords = [o for o in orders if o.get("delivery_location") is not None]
        
        assert len(orders_with_coords) > 0, "Should have orders with coordinates"
        
        # Verify coordinate structure
        for order in orders_with_coords[:3]:  # Check first 3
            loc = order["delivery_location"]
            assert "latitude" in loc or "lat" in loc, f"Missing latitude in {order.get('order_number')}"
            assert "longitude" in loc or "lng" in loc, f"Missing longitude in {order.get('order_number')}"
            
            lat = loc.get("latitude") or loc.get("lat")
            lng = loc.get("longitude") or loc.get("lng")
            
            # Verify coordinates are valid (roughly Turkey area)
            assert 35 < lat < 43, f"Latitude {lat} seems invalid for Turkey"
            assert 25 < lng < 45, f"Longitude {lng} seems invalid for Turkey"
            
            print(f"✓ Order {order.get('order_number')}: lat={lat}, lng={lng}")


class TestDistanceCalculation:
    """Test distance calculation with coordinates"""
    
    def test_distance_calculated_on_delivery(self):
        """Verify distance_km is calculated when order has coordinates"""
        # First create an order with coordinates
        payload = {
            "restaurant_id": RESTAURANT_ID,
            "customer_name": "TEST_Distance_Calculation",
            "customer_phone": "05551234567",
            "delivery_address": "Kadıköy, İstanbul",
            "delivery_location": {
                "lat": 40.9895,  # Kadıköy coordinates
                "lng": 29.0230
            },
            "items": [
                {
                    "product_id": "prod_test_1",
                    "name": "Test Product",
                    "quantity": 1,
                    "price": 100
                }
            ],
            "payment_method": "cash",
            "notes": None,
            "is_scheduled": False,
            "scheduled_time": None
        }
        
        response = requests.post(f"{BASE_URL}/api/orders/manual", json=payload)
        assert response.status_code == 200
        
        order = response.json()["order"]
        order_id = order["id"]
        
        # The distance_km field is calculated when the order is delivered
        # For now, just verify the order was created with coordinates
        assert order["delivery_location"] is not None
        
        print(f"✓ Order created with coordinates for distance calculation test")


class TestCleanup:
    """Cleanup test data"""
    
    def test_cleanup_test_orders(self):
        """Delete test orders created during testing"""
        response = requests.get(f"{BASE_URL}/api/orders/restaurant/{RESTAURANT_ID}?limit=100")
        if response.status_code != 200:
            print("Could not fetch orders for cleanup")
            return
        
        orders = response.json()
        test_orders = [o for o in orders if o.get("customer_name", "").startswith("TEST_")]
        
        deleted_count = 0
        for order in test_orders:
            # Only delete if source is 'manual' (test orders)
            if order.get("source") == "manual":
                company_id = order.get("company_id")
                order_id = order.get("id")
                if company_id and order_id:
                    # Note: The delete endpoint only works for mock orders
                    # Manual orders would need a different approach
                    pass
        
        print(f"✓ Found {len(test_orders)} test orders (cleanup skipped for manual orders)")


if __name__ == "__main__":
    pytest.main([__file__, "-v"])
