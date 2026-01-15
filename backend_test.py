#!/usr/bin/env python3

import requests
import sys
import json
from datetime import datetime

class KuryeAPITester:
    def __init__(self, base_url="https://courier-hub-28.preview.emergentagent.com/api"):
        self.base_url = base_url
        self.tests_run = 0
        self.tests_passed = 0
        self.test_results = []
        
        # Test data
        self.test_courier = {
            "name": "test kurye",
            "phone": "05551234567",
            "address": "Test Adres 123",
            "iban": "TR123456789012345678901234",
            "plate": "34 ABC 123",
            "password": "testpass123"
        }
        
        self.test_admin = {
            "name": "test admin",
            "username": "testadmin",
            "password": "testpass123"
        }
        
        self.system_admin_creds = {
            "username": "systemadmin",
            "password": "System123!"
        }
        
        self.test_company = {
            "name": "Test Şirketi İçin Türkçe Karakter Testi ÇĞİÖŞÜ",
            "logo_url": "https://via.placeholder.com/200x100/0066cc/ffffff?text=TEST+LOGO"
        }

    def log_test(self, name, success, details=""):
        """Log test result"""
        self.tests_run += 1
        if success:
            self.tests_passed += 1
            print(f"✅ {name} - PASSED")
        else:
            print(f"❌ {name} - FAILED: {details}")
        
        self.test_results.append({
            "test": name,
            "success": success,
            "details": details
        })

    def run_test(self, name, method, endpoint, expected_status, data=None, headers=None):
        """Run a single API test"""
        url = f"{self.base_url}/{endpoint}"
        default_headers = {'Content-Type': 'application/json'}
        if headers:
            default_headers.update(headers)

        try:
            if method == 'GET':
                response = requests.get(url, headers=default_headers, timeout=10)
            elif method == 'POST':
                response = requests.post(url, json=data, headers=default_headers, timeout=10)
            elif method == 'PUT':
                response = requests.put(url, json=data, headers=default_headers, timeout=10)
            elif method == 'DELETE':
                response = requests.delete(url, headers=default_headers, timeout=10)

            success = response.status_code == expected_status
            details = f"Status: {response.status_code}"
            
            if not success:
                try:
                    error_detail = response.json().get('detail', 'No detail')
                    details += f", Error: {error_detail}"
                except:
                    details += f", Response: {response.text[:100]}"
            
            self.log_test(name, success, details)
            return success, response.json() if success and response.content else {}

        except Exception as e:
            self.log_test(name, False, f"Exception: {str(e)}")
            return False, {}

    def test_health_check(self):
        """Test API health check"""
        return self.run_test("API Health Check", "GET", "", 200)

    def test_courier_registration(self):
        """Test courier registration"""
        success, response = self.run_test(
            "Courier Registration",
            "POST",
            "auth/courier/register",
            200,
            data=self.test_courier
        )
        if success:
            self.courier_id = response.get('id')
        return success

    def test_duplicate_courier_registration(self):
        """Test duplicate courier registration should fail"""
        return self.run_test(
            "Duplicate Courier Registration (should fail)",
            "POST",
            "auth/courier/register",
            400,
            data=self.test_courier
        )

    def test_courier_login_pending(self):
        """Test courier login while pending approval"""
        return self.run_test(
            "Courier Login (pending - should fail)",
            "POST",
            "auth/courier/login",
            403,
            data={"phone": self.test_courier["phone"], "password": self.test_courier["password"]}
        )

    def test_super_admin_login(self):
        """Test super admin login"""
        success, response = self.run_test(
            "Super Admin Login",
            "POST",
            "auth/admin/login",
            200,
            data=self.super_admin_creds
        )
        if success:
            self.super_admin_data = response
        return success

    def test_get_couriers(self):
        """Test getting couriers list"""
        return self.run_test("Get Couriers List", "GET", "couriers", 200)

    def test_approve_courier(self):
        """Test approving a courier"""
        if not hasattr(self, 'courier_id'):
            self.log_test("Approve Courier", False, "No courier ID available")
            return False
        
        return self.run_test(
            "Approve Courier",
            "PUT",
            f"couriers/{self.courier_id}/approve",
            200
        )

    def test_courier_login_approved(self):
        """Test courier login after approval"""
        success, response = self.run_test(
            "Courier Login (approved)",
            "POST",
            "auth/courier/login",
            200,
            data={"phone": self.test_courier["phone"], "password": self.test_courier["password"]}
        )
        if success:
            self.courier_data = response
        return success

    def test_get_admins(self):
        """Test getting admins list"""
        return self.run_test("Get Admins List", "GET", "admins", 200)

    def test_create_admin(self):
        """Test creating new admin"""
        success, response = self.run_test(
            "Create Admin",
            "POST",
            "admins",
            200,
            data=self.test_admin
        )
        if success:
            self.admin_id = response.get('id')
        return success

    def test_update_admin_permissions(self):
        """Test updating admin permissions"""
        if not hasattr(self, 'admin_id'):
            self.log_test("Update Admin Permissions", False, "No admin ID available")
            return False
        
        permissions = {
            "vardiya": True,
            "muhasebe": False,
            "zimmet": True,
            "kuryeler": True,
            "yoneticiler": False
        }
        
        return self.run_test(
            "Update Admin Permissions",
            "PUT",
            f"admins/{self.admin_id}/permissions",
            200,
            data={"permissions": permissions}
        )

    def test_reject_courier(self):
        """Test rejecting a courier (create new one first)"""
        # Create another courier for rejection test
        reject_courier = {
            "name": "reject test",
            "phone": "05559876543",
            "address": "Reject Address",
            "iban": "TR987654321098765432109876",
            "plate": "35 XYZ 789",
            "password": "rejectpass"
        }
        
        success, response = self.run_test(
            "Create Courier for Rejection",
            "POST",
            "auth/courier/register",
            200,
            data=reject_courier
        )
        
        if success:
            reject_id = response.get('id')
            return self.run_test(
                "Reject Courier",
                "PUT",
                f"couriers/{reject_id}/reject",
                200
            )
        return False

    def test_delete_courier(self):
        """Test deleting a courier"""
        if not hasattr(self, 'courier_id'):
            self.log_test("Delete Courier", False, "No courier ID available")
            return False
        
        return self.run_test(
            "Delete Courier",
            "DELETE",
            f"couriers/{self.courier_id}",
            200
        )

    def test_delete_admin(self):
        """Test deleting an admin"""
        if not hasattr(self, 'admin_id'):
            self.log_test("Delete Admin", False, "No admin ID available")
            return False
        
        return self.run_test(
            "Delete Admin",
            "DELETE",
            f"admins/{self.admin_id}",
            200
        )

    def test_invalid_login_attempts(self):
        """Test invalid login attempts"""
        # Invalid courier login
        self.run_test(
            "Invalid Courier Login",
            "POST",
            "auth/courier/login",
            401,
            data={"phone": "05551111111", "password": "wrongpass"}
        )
        
        # Invalid admin login
        self.run_test(
            "Invalid Admin Login",
            "POST",
            "auth/admin/login",
            401,
            data={"username": "wronguser", "password": "wrongpass"}
        )

    def test_name_formatting(self):
        """Test name formatting (should capitalize first letters)"""
        format_test_courier = {
            "name": "lowercase name test",
            "phone": "05551111222",
            "address": "Format Test Address",
            "iban": "TR111222333444555666777888",
            "plate": "36 fmt 999",
            "password": "formattest"
        }
        
        success, response = self.run_test(
            "Name Formatting Test",
            "POST",
            "auth/courier/register",
            200,
            data=format_test_courier
        )
        
        if success:
            # Check if name was formatted correctly by getting couriers list
            success2, couriers = self.run_test("Get Couriers for Format Check", "GET", "couriers", 200)
            if success2:
                # Find our test courier
                for courier in couriers:
                    if courier.get('phone') == format_test_courier['phone']:
                        expected_name = "Lowercase Name Test"
                        actual_name = courier.get('name')
                        if actual_name == expected_name:
                            self.log_test("Name Capitalization Check", True, f"Name correctly formatted: {actual_name}")
                        else:
                            self.log_test("Name Capitalization Check", False, f"Expected: {expected_name}, Got: {actual_name}")
                        break
        
        return success

    def run_all_tests(self):
        """Run all tests in sequence"""
        print("🚀 Starting Kurye Yönetim Sistemi API Tests")
        print("=" * 50)
        
        # Basic connectivity
        self.test_health_check()
        
        # Authentication tests
        self.test_super_admin_login()
        
        # Courier workflow
        self.test_courier_registration()
        self.test_duplicate_courier_registration()
        self.test_courier_login_pending()
        self.test_get_couriers()
        self.test_approve_courier()
        self.test_courier_login_approved()
        
        # Admin management
        self.test_get_admins()
        self.test_create_admin()
        self.test_update_admin_permissions()
        
        # Additional tests
        self.test_reject_courier()
        self.test_invalid_login_attempts()
        self.test_name_formatting()
        
        # Cleanup
        self.test_delete_courier()
        self.test_delete_admin()
        
        # Print results
        print("\n" + "=" * 50)
        print(f"📊 Test Results: {self.tests_passed}/{self.tests_run} passed")
        
        if self.tests_passed == self.tests_run:
            print("🎉 All tests passed!")
            return 0
        else:
            print("⚠️  Some tests failed. Check details above.")
            return 1

def main():
    tester = KuryeAPITester()
    return tester.run_all_tests()

if __name__ == "__main__":
    sys.exit(main())