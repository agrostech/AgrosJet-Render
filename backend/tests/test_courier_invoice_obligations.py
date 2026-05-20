"""Tests for Daily Hakedis & Courier Invoice Obligations integration."""
import os
import pytest
import requests
from datetime import datetime, timezone, timedelta

BASE_URL = os.environ.get("REACT_APP_BACKEND_URL", "https://earnings-obligations.preview.emergentagent.com").rstrip("/")
TR_TZ = timezone(timedelta(hours=3))


@pytest.fixture(scope="module")
def admin_login():
    r = requests.post(f"{BASE_URL}/api/auth/admin/login",
                      json={"username": "admin", "password": "123456"}, timeout=15)
    assert r.status_code == 200, f"admin login failed: {r.status_code} {r.text}"
    return r.json()


@pytest.fixture(scope="module")
def admin_token(admin_login):
    tok = admin_login.get("token") or admin_login.get("access_token")
    assert tok
    return tok


@pytest.fixture(scope="module")
def admin_headers(admin_token):
    return {"Authorization": f"Bearer {admin_token}"}


@pytest.fixture(scope="module")
def admin_company_id(admin_login):
    return admin_login.get("company_id") or admin_login.get("default_company_id")


@pytest.fixture(scope="module")
def courier_token():
    # Try multiple credential pairs
    for phone, pw in [("05550003201", "Test123!"), ("05553337766", "123456")]:
        r = requests.post(f"{BASE_URL}/api/auth/courier/login",
                          json={"phone": phone, "password": pw}, timeout=15)
        if r.status_code == 200:
            d = r.json()
            return d.get("token") or d.get("access_token")
    pytest.skip("All courier login attempts failed")


@pytest.fixture(scope="module")
def courier_headers(courier_token):
    return {"Authorization": f"Bearer {courier_token}"}


# ============ Daily Hakedis 7-day grid ============

class TestDailyHakedisGrid:
    def test_daily_data_returns_7_days_with_business_date(self, admin_headers, admin_company_id):
        if not admin_company_id:
            pytest.skip("No company_id for admin")
        now = datetime.now(TR_TZ)
        monday = now - timedelta(days=now.weekday())
        monday = monday.replace(hour=6, minute=0, second=0, microsecond=0)
        sunday_end = monday + timedelta(days=7)
        params = {"week_start": monday.isoformat(), "week_end": sunday_end.isoformat()}
        r = requests.get(f"{BASE_URL}/api/weekly-hakedis/daily-data/{admin_company_id}",
                         headers=admin_headers, params=params, timeout=30)
        assert r.status_code == 200, f"{r.status_code} {r.text}"
        body = r.json()
        assert "days" in body
        assert "summary" in body
        # Must have exactly 7 days
        assert len(body["days"]) == 7, f"expected 7 days, got {len(body['days'])}"
        for d in body["days"]:
            assert "business_date" in d, f"day missing business_date: {d}"
            assert "couriers" in d
            assert "summary" in d
            # business_date format YYYY-MM-DD
            assert len(d["business_date"]) == 10

    def test_daily_data_bad_dates_400(self, admin_headers, admin_company_id):
        if not admin_company_id:
            pytest.skip("No company_id")
        r = requests.get(f"{BASE_URL}/api/weekly-hakedis/daily-data/{admin_company_id}",
                         headers=admin_headers,
                         params={"week_start": "not-a-date", "week_end": "still-bad"}, timeout=15)
        assert r.status_code == 400


# ============ Admin obligation list endpoints ============

class TestAdminObligationList:
    def test_list_pending(self, admin_headers):
        r = requests.get(f"{BASE_URL}/api/courier-invoice-obligations",
                         headers=admin_headers, params={"status": "pending"}, timeout=15)
        assert r.status_code == 200, f"{r.status_code} {r.text}"
        body = r.json()
        assert "items" in body
        assert isinstance(body["items"], list)

    def test_list_uploaded(self, admin_headers):
        r = requests.get(f"{BASE_URL}/api/courier-invoice-obligations",
                         headers=admin_headers, params={"status": "uploaded"}, timeout=15)
        assert r.status_code == 200
        assert isinstance(r.json().get("items"), list)

    def test_list_approved(self, admin_headers):
        r = requests.get(f"{BASE_URL}/api/courier-invoice-obligations",
                         headers=admin_headers, params={"status": "approved"}, timeout=15)
        assert r.status_code == 200
        assert isinstance(r.json().get("items"), list)

    def test_list_all(self, admin_headers):
        r = requests.get(f"{BASE_URL}/api/courier-invoice-obligations",
                         headers=admin_headers, timeout=15)
        assert r.status_code == 200
        assert "items" in r.json()

    def test_courier_summary_admin(self, admin_headers):
        # Onur courier id
        cid = "f7188370-b3c6-46e9-bd49-acf3e18c1df7"
        r = requests.get(f"{BASE_URL}/api/courier-invoice-obligations/courier/{cid}/summary",
                         headers=admin_headers, timeout=15)
        assert r.status_code == 200, f"{r.status_code} {r.text}"
        body = r.json()
        assert "items" in body
        assert "count" in body
        assert "total_expected" in body
        assert isinstance(body["count"], int)

    def test_auto_settings_get(self, admin_headers, admin_company_id):
        if not admin_company_id:
            pytest.skip("No company")
        r = requests.get(f"{BASE_URL}/api/courier-invoice-obligations/auto-settings/{admin_company_id}",
                         headers=admin_headers, timeout=15)
        assert r.status_code == 200
        assert "enabled" in r.json()


# ============ Courier endpoints ============

class TestCourierObligationEndpoints:
    def test_courier_me_requires_courier(self, admin_headers):
        # admin token should be forbidden
        r = requests.get(f"{BASE_URL}/api/courier-invoice-obligations/courier/me",
                         headers=admin_headers, timeout=15)
        assert r.status_code == 403

    def test_courier_me_ok(self, courier_headers):
        r = requests.get(f"{BASE_URL}/api/courier-invoice-obligations/courier/me",
                         headers=courier_headers, timeout=15)
        assert r.status_code == 200, f"{r.status_code} {r.text}"
        body = r.json()
        assert "items" in body
        assert isinstance(body["items"], list)

    def test_courier_blocking_count(self, courier_headers):
        r = requests.get(f"{BASE_URL}/api/courier-invoice-obligations/courier/blocking-count",
                         headers=courier_headers, timeout=15)
        assert r.status_code == 200
        body = r.json()
        assert "count" in body
        assert isinstance(body["count"], int)

    def test_upload_invalid_id_404(self, courier_headers):
        # multipart with bogus id should 404
        files = {"file": ("test.pdf", b"%PDF-1.4 dummy", "application/pdf")}
        data = {"invoice_number": "INV-TEST-001", "invoice_date": "2026-01-01"}
        r = requests.post(f"{BASE_URL}/api/courier-invoice-obligations/non-existent-id/upload",
                          headers=courier_headers, files=files, data=data, timeout=20)
        assert r.status_code == 404


# ============ Auth requirements ============

class TestAuthRequirements:
    def test_admin_list_requires_auth(self):
        r = requests.get(f"{BASE_URL}/api/courier-invoice-obligations", timeout=10)
        assert r.status_code in (401, 403)

    def test_admin_list_blocks_courier(self, courier_headers):
        r = requests.get(f"{BASE_URL}/api/courier-invoice-obligations",
                         headers=courier_headers, timeout=10)
        assert r.status_code == 403
