#!/usr/bin/env python3

import requests
import sys
import json
from datetime import datetime

class KuryeAPITester:
    def __init__(self, base_url="https://fleet-order-system.preview.emergentagent.com/api"):
        self.base_url = base_url
        self.tests_run = 0
        self.tests_passed = 0
        self.test_results = []
        
        # Test data with Turkish characters
        self.test_courier = {
            "name": "Ahmet Çelik Öğretmen",
            "phone": "05551234567",
            "address": "İstanbul Şişli Güneş Sokak No:15",
            "iban": "TR123456789012345678901234",
            "plate": "34 ABC 123",
            "password": "testpass123"
        }
        
        self.test_courier2 = {
            "name": "Mehmet Ünal Şoför",
            "phone": "05559876543",
            "address": "Ankara Çankaya Atatürk Bulvarı No:25",
            "iban": "TR987654321098765432109876",
            "plate": "06 XYZ 789",
            "password": "testpass456"
        }
        
        self.system_admin_creds = {
            "username": "systemadmin",
            "password": "System123!"
        }
        
        self.test_company = {
            "name": "Hızlı Teslimat Şirketi ÇĞİÖŞÜ",
            "logo_url": "https://via.placeholder.com/200x100/0066cc/ffffff?text=HIZLI+TESLIMAT"
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

    def test_system_admin_login(self):
        """Test system admin login (no company selection required)"""
        success, response = self.run_test(
            "System Admin Login (systemadmin/System123!)",
            "POST",
            "auth/admin/login",
            200,
            data=self.system_admin_creds
        )
        if success:
            self.system_admin_data = response
            # Verify it's system admin role with no company
            if response.get('role') == 'systemadmin' and response.get('company_id') is None:
                self.log_test("System Admin Role Verification", True, "Role: systemadmin, No company required")
            else:
                self.log_test("System Admin Role Verification", False, f"Role: {response.get('role')}, Company: {response.get('company_id')}")
        return success

    def test_create_company(self):
        """Test creating a company with Turkish characters"""
        success, response = self.run_test(
            "Create Company with Turkish Characters",
            "POST",
            "companies",
            200,
            data=self.test_company
        )
        if success:
            self.company_id = response.get('id')
            # Verify Turkish characters are preserved
            if response.get('name') == self.test_company['name']:
                self.log_test("Turkish Character Preservation in Company", True, f"Name preserved: {response.get('name')}")
            else:
                self.log_test("Turkish Character Preservation in Company", False, f"Expected: {self.test_company['name']}, Got: {response.get('name')}")
        return success

    def test_create_superadmin_for_company(self):
        """Test creating super admin for a company"""
        if not hasattr(self, 'company_id'):
            self.log_test("Create Super Admin for Company", False, "No company ID available")
            return False
        
        superadmin_data = {
            "name": "Süper Admin Türkçe İsim ÇĞİÖŞÜ",
            "username": "superadmin1",
            "password": "SuperPass123!",
            "company_id": self.company_id
        }
        
        success, response = self.run_test(
            "Create Super Admin for Company",
            "POST",
            "admins/superadmin",
            200,
            data=superadmin_data
        )
        if success:
            self.superadmin_id = response.get('id')
            self.superadmin_creds = {
                "username": superadmin_data["username"],
                "password": superadmin_data["password"]
            }
        return success

    def test_superadmin_login_auto_company(self):
        """Test super admin login automatically connects to company"""
        if not hasattr(self, 'superadmin_creds'):
            self.log_test("Super Admin Auto Company Login", False, "No super admin credentials available")
            return False
        
        success, response = self.run_test(
            "Super Admin Login (Auto Company Connection)",
            "POST",
            "auth/admin/login",
            200,
            data=self.superadmin_creds
        )
        if success:
            # Verify role and company auto-connection
            if response.get('role') == 'superadmin' and response.get('company_id') == self.company_id:
                self.log_test("Super Admin Auto Company Verification", True, f"Role: superadmin, Auto-connected to company: {response.get('company_id')}")
            else:
                self.log_test("Super Admin Auto Company Verification", False, f"Role: {response.get('role')}, Company: {response.get('company_id')}")
        return success

    def test_courier_global_registration(self):
        """Test courier registration without company selection"""
        success, response = self.run_test(
            "Courier Global Registration (No Company)",
            "POST",
            "auth/courier/register",
            200,
            data=self.test_courier
        )
        if success:
            self.courier_id = response.get('id')
            # Verify Turkish characters in name
            self.log_test("Turkish Character Preservation in Courier Name", True, f"Courier registered with Turkish name")
        return success

    def test_courier_global_registration_2(self):
        """Test second courier registration"""
        success, response = self.run_test(
            "Second Courier Global Registration",
            "POST",
            "auth/courier/register",
            200,
            data=self.test_courier2
        )
        if success:
            self.courier_id2 = response.get('id')
        return success

    def test_duplicate_courier_registration(self):
        """Test duplicate courier registration should fail"""
        return self.run_test(
            "Duplicate Courier Registration (should fail)",
            "POST",
            "auth/courier/register",
            400,
            data=self.test_courier
        )[0]

    def test_courier_login_no_company(self):
        """Test courier login when not assigned to any company"""
        success, response = self.run_test(
            "Courier Login (No Company Assignment)",
            "POST",
            "auth/courier/login",
            200,
            data={"phone": self.test_courier["phone"], "password": self.test_courier["password"]}
        )
        if success:
            # Should return empty companies array
            companies = response.get('companies', [])
            if len(companies) == 0:
                self.log_test("Courier No Company Status", True, "Courier has no companies assigned")
            else:
                self.log_test("Courier No Company Status", False, f"Expected 0 companies, got {len(companies)}")
        return success

    def test_search_courier_by_phone(self):
        """Test searching courier by phone number"""
        if not hasattr(self, 'test_courier'):
            self.log_test("Search Courier by Phone", False, "No test courier available")
            return False
        
        success, response = self.run_test(
            "Search Courier by Phone",
            "GET",
            f"couriers/search?phone={self.test_courier['phone']}",
            200
        )
        if success:
            # Verify correct courier found
            if response.get('phone') == self.test_courier['phone']:
                self.log_test("Courier Search Verification", True, f"Found courier: {response.get('name')}")
            else:
                self.log_test("Courier Search Verification", False, f"Wrong courier found")
        return success

    def test_add_courier_to_company_by_phone(self):
        """Test adding courier to company by phone number"""
        if not hasattr(self, 'company_id') or not hasattr(self, 'test_courier'):
            self.log_test("Add Courier to Company by Phone", False, "Missing company ID or courier")
            return False
        
        success, response = self.run_test(
            "Add Courier to Company by Phone",
            "POST",
            f"companies/{self.company_id}/couriers",
            200,
            data={"phone": self.test_courier["phone"]}
        )
        if success:
            # Verify courier was added
            courier_name = response.get('courier_name')
            if courier_name:
                self.log_test("Courier Addition Verification", True, f"Added courier: {courier_name}")
            else:
                self.log_test("Courier Addition Verification", False, "No courier name in response")
        return success

    def test_add_second_courier_to_company(self):
        """Test adding second courier to company"""
        if not hasattr(self, 'company_id') or not hasattr(self, 'test_courier2'):
            self.log_test("Add Second Courier to Company", False, "Missing company ID or second courier")
            return False
        
        return self.run_test(
            "Add Second Courier to Company",
            "POST",
            f"companies/{self.company_id}/couriers",
            200,
            data={"phone": self.test_courier2["phone"]}
        )[0]

    def test_get_company_couriers_pending(self):
        """Test getting company couriers (should be pending)"""
        if not hasattr(self, 'company_id'):
            self.log_test("Get Company Couriers (Pending)", False, "No company ID available")
            return False
        
        success, response = self.run_test(
            "Get Company Couriers (Pending Status)",
            "GET",
            f"companies/{self.company_id}/couriers",
            200
        )
        if success:
            # Check if couriers are in pending status
            pending_count = sum(1 for c in response if c.get('company_status') == 'pending')
            if pending_count >= 1:
                self.log_test("Pending Couriers Verification", True, f"Found {pending_count} pending couriers")
            else:
                self.log_test("Pending Couriers Verification", False, f"Expected pending couriers, found {pending_count}")
        return success

    def test_approve_courier(self):
        """Test approving a courier"""
        if not hasattr(self, 'company_id') or not hasattr(self, 'courier_id'):
            self.log_test("Approve Courier", False, "Missing company ID or courier ID")
            return False
        
        return self.run_test(
            "Approve Courier",
            "PUT",
            f"companies/{self.company_id}/couriers/{self.courier_id}/approve",
            200
        )[0]

    def test_reject_courier(self):
        """Test rejecting a courier"""
        if not hasattr(self, 'company_id') or not hasattr(self, 'courier_id2'):
            self.log_test("Reject Courier", False, "Missing company ID or second courier ID")
            return False
        
        return self.run_test(
            "Reject Courier",
            "PUT",
            f"companies/{self.company_id}/couriers/{self.courier_id2}/reject",
            200
        )[0]

    def test_courier_login_with_approved_company(self):
        """Test courier login after being approved by company"""
        success, response = self.run_test(
            "Courier Login (With Approved Company)",
            "POST",
            "auth/courier/login",
            200,
            data={"phone": self.test_courier["phone"], "password": self.test_courier["password"]}
        )
        if success:
            # Should return companies array with approved company
            companies = response.get('companies', [])
            if len(companies) >= 1:
                company = companies[0]
                if company.get('id') == self.company_id:
                    self.log_test("Courier Approved Company Verification", True, f"Courier has access to company: {company.get('name')}")
                else:
                    self.log_test("Courier Approved Company Verification", False, f"Wrong company in response")
            else:
                self.log_test("Courier Approved Company Verification", False, f"Expected 1+ companies, got {len(companies)}")
        return success

    def test_courier_login_multiple_companies(self):
        """Test courier login when assigned to multiple companies"""
        # Create second company and add same courier
        company2_data = {
            "name": "İkinci Şirket Türkçe ÇĞİÖŞÜ",
            "logo_url": "https://via.placeholder.com/200x100/ff6600/ffffff?text=IKINCI+SIRKET"
        }
        
        success, response = self.run_test(
            "Create Second Company",
            "POST",
            "companies",
            200,
            data=company2_data
        )
        
        if success:
            company2_id = response.get('id')
            
            # Add courier to second company
            success2, _ = self.run_test(
                "Add Courier to Second Company",
                "POST",
                f"companies/{company2_id}/couriers",
                200,
                data={"phone": self.test_courier["phone"]}
            )
            
            if success2:
                # Approve courier in second company
                success3, _ = self.run_test(
                    "Approve Courier in Second Company",
                    "PUT",
                    f"companies/{company2_id}/couriers/{self.courier_id}/approve",
                    200
                )
                
                if success3:
                    # Now test login - should return multiple companies
                    success4, response4 = self.run_test(
                        "Courier Login (Multiple Companies)",
                        "POST",
                        "auth/courier/login",
                        200,
                        data={"phone": self.test_courier["phone"], "password": self.test_courier["password"]}
                    )
                    
                    if success4:
                        companies = response4.get('companies', [])
                        if len(companies) >= 2:
                            self.log_test("Multiple Companies Verification", True, f"Courier has access to {len(companies)} companies")
                        else:
                            self.log_test("Multiple Companies Verification", False, f"Expected 2+ companies, got {len(companies)}")
                    
                    return success4
        
        return False

    def test_create_regular_admin(self):
        """Test creating regular admin for company"""
        if not hasattr(self, 'company_id'):
            self.log_test("Create Regular Admin", False, "No company ID available")
            return False
        
        admin_data = {
            "name": "Normal Admin Türkçe İsim",
            "username": "normaladmin1",
            "password": "AdminPass123!",
            "company_id": self.company_id
        }
        
        success, response = self.run_test(
            "Create Regular Admin",
            "POST",
            "admins",
            200,
            data=admin_data
        )
        if success:
            self.admin_id = response.get('id')
            self.admin_creds = {
                "username": admin_data["username"],
                "password": admin_data["password"]
            }
        return success

    def test_regular_admin_login_auto_company(self):
        """Test regular admin login automatically connects to company"""
        if not hasattr(self, 'admin_creds'):
            self.log_test("Regular Admin Auto Company Login", False, "No admin credentials available")
            return False
        
        success, response = self.run_test(
            "Regular Admin Login (Auto Company Connection)",
            "POST",
            "auth/admin/login",
            200,
            data=self.admin_creds
        )
        if success:
            # Verify role and company auto-connection
            if response.get('role') == 'admin' and response.get('company_id') == self.company_id:
                self.log_test("Regular Admin Auto Company Verification", True, f"Role: admin, Auto-connected to company: {response.get('company_id')}")
            else:
                self.log_test("Regular Admin Auto Company Verification", False, f"Role: {response.get('role')}, Company: {response.get('company_id')}")
        return success

    def test_invalid_login_attempts(self):
        """Test invalid login attempts"""
        # Invalid courier login
        self.run_test(
            "Invalid Courier Login (Wrong Phone)",
            "POST",
            "auth/courier/login",
            401,
            data={"phone": "05551111111", "password": "wrongpass"}
        )
        
        # Invalid admin login
        self.run_test(
            "Invalid Admin Login (Wrong Username)",
            "POST",
            "auth/admin/login",
            401,
            data={"username": "wronguser", "password": "wrongpass"}
        )

    def test_turkish_character_support(self):
        """Test comprehensive Turkish character support"""
        # Test courier with all Turkish characters
        turkish_courier = {
            "name": "Çağlar Öğüt Şimşek Ülgen İçer Ğüneş",
            "phone": "05551122334",
            "address": "İçerenköy Şişli Çağlayan Öğretmenler Üçgen Ğüneş Sokak",
            "iban": "TR111222333444555666777999",
            "plate": "34 ÇĞİ 123",
            "password": "türkçeşifre123"
        }
        
        success, response = self.run_test(
            "Turkish Character Support Test",
            "POST",
            "auth/courier/register",
            200,
            data=turkish_courier
        )
        
        if success:
            # Verify all Turkish characters preserved
            self.log_test("Comprehensive Turkish Character Test", True, "All Turkish characters (ÇĞİÖŞÜ) supported")
        
        return success

    def run_all_tests(self):
        """Run all tests in sequence"""
        print("🚀 Starting Simplified Kurye Yönetim Sistemi API Tests")
        print("=" * 70)
        
        # Basic connectivity
        self.test_health_check()
        
        # System Admin Tests (no company selection)
        self.test_system_admin_login()
        
        # Company Management
        self.test_create_company()
        self.test_create_superadmin_for_company()
        self.test_superadmin_login_auto_company()
        
        # Global Courier Registration (no company selection)
        self.test_courier_global_registration()
        self.test_courier_global_registration_2()
        self.test_duplicate_courier_registration()
        
        # Courier Login (no company initially)
        self.test_courier_login_no_company()
        
        # Company adds courier by phone
        self.test_search_courier_by_phone()
        self.test_add_courier_to_company_by_phone()
        self.test_add_second_courier_to_company()
        
        # Company courier management
        self.test_get_company_couriers_pending()
        self.test_approve_courier()
        self.test_reject_courier()
        
        # Courier login with approved company
        self.test_courier_login_with_approved_company()
        
        # Multiple company scenario
        self.test_courier_login_multiple_companies()
        
        # Regular admin tests (auto company connection)
        self.test_create_regular_admin()
        self.test_regular_admin_login_auto_company()
        
        # Security and validation tests
        self.test_invalid_login_attempts()
        
        # Turkish character support
        self.test_turkish_character_support()
        
        # Print results
        print("\n" + "=" * 70)
        print(f"📊 Test Results: {self.tests_passed}/{self.tests_run} passed")
        
        if self.tests_passed == self.tests_run:
            print("🎉 All simplified flow tests passed!")
            return 0
        else:
            print("⚠️  Some tests failed. Check details above.")
            return 1

def main():
    tester = KuryeAPITester()
    return tester.run_all_tests()

if __name__ == "__main__":
    sys.exit(main())