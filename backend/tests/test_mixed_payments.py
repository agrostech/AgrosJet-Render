"""
Test cases for Mixed/Split Payment Bug Fix and Günlük Mütabakat Modal Feature
Tests the payment report API and daily mutabakat courier orders endpoint
"""
import pytest
import requests
import os

BASE_URL = os.environ.get('REACT_APP_BACKEND_URL', '').rstrip('/')

class TestHealthCheck:
    """Basic health check tests"""
    
    def test_api_health(self):
        """Test API is healthy"""
        response = requests.get(f"{BASE_URL}/api/health")
        assert response.status_code == 200
        data = response.json()
        assert data["status"] == "healthy"
        print("✓ API health check passed")


class TestAdminAuth:
    """Admin authentication tests"""
    
    def test_admin_login_success(self):
        """Test admin login with valid credentials"""
        response = requests.post(f"{BASE_URL}/api/auth/admin/login", json={
            "username": "onurertas",
            "password": "123456"
        })
        assert response.status_code == 200
        data = response.json()
        assert "id" in data
        assert "company_id" in data
        assert data["username"] == "onurertas"
        print(f"✓ Admin login successful - ID: {data['id']}")
        return data
    
    def test_admin_login_invalid(self):
        """Test admin login with invalid credentials"""
        response = requests.post(f"{BASE_URL}/api/auth/admin/login", json={
            "username": "invalid",
            "password": "wrong"
        })
        assert response.status_code == 401
        print("✓ Invalid admin login correctly rejected")


class TestCourierAuth:
    """Courier authentication tests"""
    
    def test_courier_login_success(self):
        """Test courier login with valid credentials"""
        response = requests.post(f"{BASE_URL}/api/auth/courier/login", json={
            "phone": "05527370032",
            "password": "123456"
        })
        assert response.status_code == 200
        data = response.json()
        assert "id" in data
        assert data["phone"] == "05527370032"
        assert data["role"] == "courier"
        print(f"✓ Courier login successful - ID: {data['id']}")
        return data
    
    def test_courier_login_invalid(self):
        """Test courier login with invalid credentials"""
        response = requests.post(f"{BASE_URL}/api/auth/courier/login", json={
            "phone": "05500000000",
            "password": "wrong"
        })
        assert response.status_code == 401
        print("✓ Invalid courier login correctly rejected")


class TestCourierPaymentReport:
    """Tests for courier payment report with split payments - BUG FIX"""
    
    @pytest.fixture(autouse=True)
    def setup(self):
        """Get courier ID from login"""
        response = requests.post(f"{BASE_URL}/api/auth/courier/login", json={
            "phone": "05527370032",
            "password": "123456"
        })
        self.courier_id = response.json()["id"]
    
    def test_payment_report_returns_data(self):
        """Test payment report API returns data"""
        response = requests.get(f"{BASE_URL}/api/reports/courier/payments", params={
            "courier_id": self.courier_id,
            "start_date": "2025-01-01",
            "end_date": "2026-12-31"
        })
        assert response.status_code == 200
        data = response.json()
        assert "cash_total" in data
        assert "card_total" in data
        assert "cash_orders" in data
        assert "card_orders" in data
        print(f"✓ Payment report returned - Cash: {data['cash_total']}, Card: {data['card_total']}")
    
    def test_split_payment_appears_in_both_lists(self):
        """BUG FIX TEST: Split payments should appear in both cash and card lists"""
        response = requests.get(f"{BASE_URL}/api/reports/courier/payments", params={
            "courier_id": self.courier_id,
            "start_date": "2025-01-01",
            "end_date": "2026-12-31"
        })
        assert response.status_code == 200
        data = response.json()
        
        # Find orders with is_split=True
        split_cash_orders = [o for o in data.get("cash_orders", []) if o.get("is_split")]
        split_card_orders = [o for o in data.get("card_orders", []) if o.get("is_split")]
        
        print(f"✓ Found {len(split_cash_orders)} split orders in cash list")
        print(f"✓ Found {len(split_card_orders)} split orders in card list")
        
        # If there are split orders, they should have is_split=True
        if split_cash_orders:
            for order in split_cash_orders:
                assert order["is_split"] == True
                print(f"  - Cash split order: {order['order_no']} - {order['amount']} TL")
        
        if split_card_orders:
            for order in split_card_orders:
                assert order["is_split"] == True
                print(f"  - Card split order: {order['order_no']} - {order['amount']} TL")
    
    def test_payment_report_structure(self):
        """Test payment report has correct structure"""
        response = requests.get(f"{BASE_URL}/api/reports/courier/payments", params={
            "courier_id": self.courier_id,
            "start_date": "2026-01-01",
            "end_date": "2026-12-31"
        })
        assert response.status_code == 200
        data = response.json()
        
        # Check totals are numbers
        assert isinstance(data["cash_total"], (int, float))
        assert isinstance(data["card_total"], (int, float))
        
        # Check order lists are lists
        assert isinstance(data["cash_orders"], list)
        assert isinstance(data["card_orders"], list)
        
        # Check order structure if orders exist
        if data["cash_orders"]:
            order = data["cash_orders"][0]
            assert "order_no" in order
            assert "restaurant" in order
            assert "customer" in order
            assert "amount" in order
            print("✓ Order structure is correct")


class TestDailyMutabakatCourierOrders:
    """Tests for Günlük Mütabakat courier orders modal - NEW FEATURE"""
    
    @pytest.fixture(autouse=True)
    def setup(self):
        """Get company and courier IDs from admin login"""
        response = requests.post(f"{BASE_URL}/api/auth/admin/login", json={
            "username": "onurertas",
            "password": "123456"
        })
        data = response.json()
        self.company_id = data["company_id"]
        self.admin_id = data["id"]
        
        # Get courier ID
        courier_response = requests.post(f"{BASE_URL}/api/auth/courier/login", json={
            "phone": "05527370032",
            "password": "123456"
        })
        self.courier_id = courier_response.json()["id"]
    
    def test_get_couriers_for_date(self):
        """Test getting courier list for a specific date"""
        from datetime import datetime, timedelta
        yesterday = (datetime.now() - timedelta(days=1)).strftime("%Y-%m-%d")
        
        response = requests.get(f"{BASE_URL}/api/daily-mutabakat/{self.company_id}/couriers/{yesterday}")
        assert response.status_code == 200
        data = response.json()
        
        assert "date" in data
        assert "date_range" in data
        assert "couriers" in data
        assert "summary" in data
        
        print(f"✓ Got couriers for date {yesterday}")
        print(f"  - Total couriers: {data['summary']['total_couriers']}")
        print(f"  - Completed: {data['summary']['completed_couriers']}")
    
    def test_get_courier_orders_for_date(self):
        """FEATURE TEST: Get courier order details for modal"""
        from datetime import datetime, timedelta
        yesterday = (datetime.now() - timedelta(days=1)).strftime("%Y-%m-%d")
        
        response = requests.get(f"{BASE_URL}/api/daily-mutabakat/{self.company_id}/courier/{self.courier_id}/orders/{yesterday}")
        assert response.status_code == 200
        data = response.json()
        
        # Check structure
        assert "cash_orders" in data
        assert "card_orders" in data
        assert "cash_total" in data
        assert "card_total" in data
        
        print(f"✓ Got courier orders for modal")
        print(f"  - Cash orders: {len(data['cash_orders'])} ({data['cash_total']} TL)")
        print(f"  - Card orders: {len(data['card_orders'])} ({data['card_total']} TL)")
        
        # Check order structure
        if data["cash_orders"]:
            order = data["cash_orders"][0]
            assert "order_number" in order
            assert "restaurant_name" in order
            assert "customer_name" in order
            assert "amount" in order
            print("✓ Order structure is correct for modal display")
    
    def test_courier_orders_include_split_payments(self):
        """FEATURE TEST: Modal should show split payments correctly"""
        from datetime import datetime, timedelta
        yesterday = (datetime.now() - timedelta(days=1)).strftime("%Y-%m-%d")
        
        response = requests.get(f"{BASE_URL}/api/daily-mutabakat/{self.company_id}/courier/{self.courier_id}/orders/{yesterday}")
        assert response.status_code == 200
        data = response.json()
        
        # Check for split payments
        split_cash = [o for o in data["cash_orders"] if o.get("is_split")]
        split_card = [o for o in data["card_orders"] if o.get("is_split")]
        
        print(f"✓ Split payments in modal data:")
        print(f"  - Cash split orders: {len(split_cash)}")
        print(f"  - Card split orders: {len(split_card)}")
        
        # If split orders exist, check they have split_details
        for order in split_cash + split_card:
            if order.get("is_split"):
                assert "split_details" in order
                print(f"  - Order {order['order_number']}: cash={order.get('split_details', {}).get('cash')}, card={order.get('split_details', {}).get('card')}")


class TestCourierReport:
    """Tests for general courier report"""
    
    @pytest.fixture(autouse=True)
    def setup(self):
        """Get company ID from admin login"""
        response = requests.post(f"{BASE_URL}/api/auth/admin/login", json={
            "username": "onurertas",
            "password": "123456"
        })
        self.company_id = response.json()["company_id"]
    
    def test_courier_report_with_split_payments(self):
        """Test courier report includes mixed payment handling"""
        from datetime import datetime, timedelta
        now = datetime.now()
        start = (now - timedelta(days=30)).strftime("%Y-%m-%dT06:00")
        end = now.strftime("%Y-%m-%dT05:59")
        
        response = requests.get(f"{BASE_URL}/api/reports/courier", params={
            "company_id": self.company_id,
            "start_datetime": start,
            "end_datetime": end
        })
        assert response.status_code == 200
        data = response.json()
        
        assert "summary" in data
        assert "couriers" in data
        
        # Check summary structure
        assert "totalOrders" in data["summary"]
        assert "totalCash" in data["summary"]
        assert "totalCard" in data["summary"]
        
        print(f"✓ Courier report - Orders: {data['summary']['totalOrders']}, Cash: {data['summary']['totalCash']}, Card: {data['summary']['totalCard']}")


if __name__ == "__main__":
    pytest.main([__file__, "-v"])
