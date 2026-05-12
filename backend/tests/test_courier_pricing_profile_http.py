"""
HTTP-level integration tests for Courier Pricing Profile endpoints (5 profiles).
Hits the public preview URL with admin auth and validates all endpoints listed in
the review request.
"""
import os
import uuid
import pytest
import requests

BASE_URL = os.environ.get("REACT_APP_BACKEND_URL", "https://logo-deployment-test-1.preview.emergentagent.com").rstrip("/")
ADMIN_USERNAME = "admin"
ADMIN_PASSWORD = "123456"


@pytest.fixture(scope="module")
def auth_token():
    r = requests.post(
        f"{BASE_URL}/api/auth/admin/login",
        json={"username": ADMIN_USERNAME, "password": ADMIN_PASSWORD},
        timeout=15,
    )
    assert r.status_code == 200, f"Admin login failed: {r.status_code} {r.text}"
    data = r.json()
    token = data.get("token") or data.get("access_token")
    assert token, f"No token in response: {data}"
    return token


@pytest.fixture(scope="module")
def headers(auth_token):
    return {"Authorization": f"Bearer {auth_token}", "Content-Type": "application/json"}


@pytest.fixture(scope="module")
def courier_id(headers):
    # Find an existing courier from the DB via admin list endpoint
    r = requests.get(f"{BASE_URL}/api/couriers", headers=headers, timeout=15)
    assert r.status_code == 200, f"List couriers failed: {r.status_code} {r.text[:200]}"
    couriers = r.json()
    if isinstance(couriers, dict) and "couriers" in couriers:
        couriers = couriers["couriers"]
    assert couriers, "No couriers in system"
    return couriers[0]["id"]


@pytest.fixture(scope="module")
def restaurant_id(headers):
    # Get company list, then restaurants for first company
    r_co = requests.get(f"{BASE_URL}/api/companies", headers=headers, timeout=15)
    assert r_co.status_code == 200, r_co.text
    companies = r_co.json()
    if isinstance(companies, dict) and "companies" in companies:
        companies = companies["companies"]
    assert companies, "No companies"
    company_id = companies[0]["id"]
    r = requests.get(f"{BASE_URL}/api/restaurants/{company_id}", headers=headers, timeout=15)
    assert r.status_code == 200, r.text
    rests = r.json()
    if isinstance(rests, dict) and "restaurants" in rests:
        rests = rests["restaurants"]
    assert rests, "No restaurants in system"
    return rests[0]["id"]


# ============ Courier pricing-profiles GET ============
def test_get_all_pricing_profiles(headers, courier_id):
    r = requests.get(
        f"{BASE_URL}/api/couriers/{courier_id}/pricing-profiles",
        headers=headers, timeout=15
    )
    assert r.status_code == 200, r.text
    data = r.json()
    assert "profiles" in data
    profiles = data["profiles"]
    # Must contain keys 1-5 (or have 5 entries)
    assert len(profiles) == 5, f"Expected 5 profiles, got {len(profiles)}: {list(profiles.keys())}"
    # Profile 1 must always be present (even if empty) since it's standard
    # It can be a dict or None depending on impl, just verify key exists
    keys = {str(k) for k in profiles.keys()}
    assert keys == {"1", "2", "3", "4", "5"}, f"Unexpected keys: {keys}"


# ============ Courier pricing-profile PUT profile 1 (backward compat) ============
def test_put_profile_1_writes_top_level(headers, courier_id):
    payload = {
        "pricing_type": "per_package",
        "per_package_price": 55,
        "km_ranges": [],
        "tier_prices": None,
        "hourly_rate": None,
    }
    r = requests.put(
        f"{BASE_URL}/api/couriers/{courier_id}/pricing-profiles/1",
        headers=headers, json=payload, timeout=15
    )
    assert r.status_code == 200, r.text
    assert r.json().get("profile") == 1

    # Verify via existing GET /api/couriers/{id}/pricing (top-level)
    r2 = requests.get(f"{BASE_URL}/api/couriers/{courier_id}/pricing", headers=headers, timeout=15)
    assert r2.status_code == 200, r2.text
    body = r2.json()
    assert body.get("pricing_type") == "per_package"
    assert body.get("per_package_price") == 55


# ============ Courier pricing-profile PUT profile 2 (pricing_profiles dict) ============
def test_put_profile_2_writes_dict(headers, courier_id):
    payload = {
        "pricing_type": "per_package",
        "per_package_price": 60,
        "km_ranges": [],
        "tier_prices": None,
        "hourly_rate": None,
    }
    r = requests.put(
        f"{BASE_URL}/api/couriers/{courier_id}/pricing-profiles/2",
        headers=headers, json=payload, timeout=15
    )
    assert r.status_code == 200, r.text
    assert r.json().get("profile") == 2

    # Verify via GET /pricing-profiles
    r2 = requests.get(
        f"{BASE_URL}/api/couriers/{courier_id}/pricing-profiles",
        headers=headers, timeout=15
    )
    assert r2.status_code == 200
    profiles = r2.json()["profiles"]
    p2 = profiles.get("2") or profiles.get(2)
    assert p2 is not None, f"Profile 2 not present: {profiles}"
    assert p2.get("per_package_price") == 60, f"Profile 2 data wrong: {p2}"


# ============ Courier pricing-profile PUT invalid profile no ============
def test_put_profile_invalid_returns_400(headers, courier_id):
    payload = {"pricing_type": "per_package", "per_package_price": 50}
    r = requests.put(
        f"{BASE_URL}/api/couriers/{courier_id}/pricing-profiles/99",
        headers=headers, json=payload, timeout=15
    )
    assert r.status_code == 400, f"Expected 400, got {r.status_code}: {r.text}"


# ============ Courier pricing-profile DELETE profile 2 ============
def test_delete_profile_2(headers, courier_id):
    # Re-create profile 2 first so we have something to delete
    requests.put(
        f"{BASE_URL}/api/couriers/{courier_id}/pricing-profiles/3",
        headers=headers,
        json={"pricing_type": "per_package", "per_package_price": 70},
        timeout=15,
    )
    r = requests.delete(
        f"{BASE_URL}/api/couriers/{courier_id}/pricing-profiles/3",
        headers=headers, timeout=15
    )
    assert r.status_code == 200, r.text
    assert r.json().get("deleted_profile") == 3

    # Verify profile 3 gone from GET
    r2 = requests.get(
        f"{BASE_URL}/api/couriers/{courier_id}/pricing-profiles",
        headers=headers, timeout=15
    )
    profiles = r2.json()["profiles"]
    p3 = profiles.get("3") or profiles.get(3)
    assert p3 is None, f"Profile 3 should be None after delete, got: {p3}"


# ============ Courier pricing-profile DELETE profile 1 → 400 ============
def test_delete_profile_1_forbidden(headers, courier_id):
    r = requests.delete(
        f"{BASE_URL}/api/couriers/{courier_id}/pricing-profiles/1",
        headers=headers, timeout=15
    )
    assert r.status_code == 400, f"Expected 400, got {r.status_code}: {r.text}"


# ============ Restaurant courier-pricing-profile PUT/GET ============
def test_restaurant_set_profile(headers, restaurant_id):
    # Set to profile 3
    r = requests.put(
        f"{BASE_URL}/api/restaurants/{restaurant_id}/courier-pricing-profile",
        headers=headers, json={"profile": 3}, timeout=15
    )
    assert r.status_code == 200, r.text
    assert r.json().get("courier_pricing_profile") == 3

    # Verify via GET
    r2 = requests.get(
        f"{BASE_URL}/api/restaurants/{restaurant_id}/courier-pricing-profile",
        headers=headers, timeout=15
    )
    assert r2.status_code == 200
    assert r2.json().get("courier_pricing_profile") == 3

    # Reset to 1 (cleanup)
    requests.put(
        f"{BASE_URL}/api/restaurants/{restaurant_id}/courier-pricing-profile",
        headers=headers, json={"profile": 1}, timeout=15
    )


def test_restaurant_set_profile_invalid_400(headers, restaurant_id):
    r = requests.put(
        f"{BASE_URL}/api/restaurants/{restaurant_id}/courier-pricing-profile",
        headers=headers, json={"profile": 99}, timeout=15
    )
    assert r.status_code == 400


def test_restaurant_pricing_includes_courier_profile(headers, restaurant_id):
    r = requests.get(
        f"{BASE_URL}/api/restaurants/pricing/{restaurant_id}",
        headers=headers, timeout=15
    )
    assert r.status_code == 200, r.text
    data = r.json()
    assert "courier_pricing_profile" in data, f"Missing field: {list(data.keys())}"
    assert isinstance(data["courier_pricing_profile"], int)
    assert 1 <= data["courier_pricing_profile"] <= 5


# ============ Backward-compat: existing PUT /api/couriers/{id}/pricing still works ============
def test_legacy_pricing_endpoint_works(headers, courier_id):
    payload = {
        "pricing_type": "per_package",
        "per_package_price": 45,
        "km_ranges": [],
        "tier_prices": None,
        "hourly_rate": None,
    }
    r = requests.put(
        f"{BASE_URL}/api/couriers/{courier_id}/pricing",
        headers=headers, json=payload, timeout=15
    )
    assert r.status_code in (200, 204), r.text
    # Verify
    r2 = requests.get(f"{BASE_URL}/api/couriers/{courier_id}/pricing", headers=headers, timeout=15)
    assert r2.status_code == 200
    assert r2.json().get("per_package_price") == 45
