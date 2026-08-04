"""Iteration 22: welcome_bonus_credited in register response + admin change mid-flow + regression."""
import os
import time
import requests
import pytest

BASE_URL = os.environ["REACT_APP_BACKEND_URL"].rstrip("/")

ADMIN_EMAIL = "billdennis750@gmail.com"
ADMIN_PASSWORD = "djscan30"

REGRESSION_PHONE = "+2348099887711"
REGRESSION_PASSWORD = "pass1234"


def _fresh_phone():
    ts = str(int(time.time() * 1000))
    # +234 + 10 digits
    return "+234" + ts[-10:]


@pytest.fixture(scope="module")
def admin_session():
    s = requests.Session()
    r = s.post(f"{BASE_URL}/api/auth/login",
               json={"email": ADMIN_EMAIL, "password": ADMIN_PASSWORD}, timeout=15)
    assert r.status_code == 200, f"admin login failed: {r.status_code} {r.text}"
    token = r.json().get("token") or r.json().get("access_token")
    if token:
        s.headers.update({"Authorization": f"Bearer {token}"})
    return s


def _set_welcome_bonus(admin_session, amount):
    r = admin_session.put(f"{BASE_URL}/api/admin/settings",
                          json={"welcome_bonus": amount}, timeout=15)
    assert r.status_code == 200, f"admin PUT settings failed: {r.status_code} {r.text}"
    return r.json()


# --- Test 1: settings public returns welcome_bonus ---
def test_settings_public_has_welcome_bonus():
    r = requests.get(f"{BASE_URL}/api/settings/public", timeout=15)
    assert r.status_code == 200
    data = r.json()
    assert "welcome_bonus" in data
    assert float(data["welcome_bonus"]) > 0


# --- Test 2: register at current setting (1000) ---
def test_register_returns_welcome_bonus_credited(admin_session):
    # Ensure current setting is 1000
    _set_welcome_bonus(admin_session, 1000)
    time.sleep(0.5)

    phone = _fresh_phone()
    r = requests.post(f"{BASE_URL}/api/auth/register",
                      json={"name": "Bonus Display Test", "phone": phone, "password": "pass1234"},
                      timeout=20)
    assert r.status_code == 200, f"register failed: {r.status_code} {r.text}"
    data = r.json()
    assert "welcome_bonus_credited" in data, f"welcome_bonus_credited missing: {data}"
    assert float(data["welcome_bonus_credited"]) == 1000.0
    assert "user" in data
    assert float(data["user"]["wallet_balance"]) == 1000.0


# --- Test 3: admin changes bonus mid-flow ---
def test_admin_change_bonus_reflects_in_register(admin_session):
    # change to 750
    _set_welcome_bonus(admin_session, 750)
    time.sleep(0.5)

    # verify public settings reflect
    r = requests.get(f"{BASE_URL}/api/settings/public", timeout=15)
    assert r.status_code == 200
    assert float(r.json()["welcome_bonus"]) == 750.0

    phone = _fresh_phone()
    r = requests.post(f"{BASE_URL}/api/auth/register",
                      json={"name": "Mid Flow Test", "phone": phone, "password": "pass1234"},
                      timeout=20)
    assert r.status_code == 200, f"register failed: {r.status_code} {r.text}"
    data = r.json()
    assert float(data["welcome_bonus_credited"]) == 750.0
    assert float(data["user"]["wallet_balance"]) == 750.0

    # reset to 1000
    _set_welcome_bonus(admin_session, 1000)
    r = requests.get(f"{BASE_URL}/api/settings/public", timeout=15)
    assert float(r.json()["welcome_bonus"]) == 1000.0


# --- Regression tests ---
def test_health_regression():
    r = requests.get(f"{BASE_URL}/api/health", timeout=15)
    assert r.status_code == 200


def test_login_regression():
    r = requests.post(f"{BASE_URL}/api/auth/login",
                      json={"phone": REGRESSION_PHONE, "password": REGRESSION_PASSWORD},
                      timeout=15)
    assert r.status_code == 200
    assert "user" in r.json()


def test_products_regression(admin_session):
    r = admin_session.get(f"{BASE_URL}/api/products", timeout=15)
    assert r.status_code == 200
    data = r.json()
    assert isinstance(data, list) and len(data) > 0


def test_admin_deposits_regression(admin_session):
    r = admin_session.get(f"{BASE_URL}/api/admin/deposits", timeout=15)
    assert r.status_code == 200


def test_server_ip_deterministic(admin_session):
    r = admin_session.get(f"{BASE_URL}/api/admin/server-ip", timeout=15)
    assert r.status_code == 200
    data = r.json()
    assert data.get("outbound_ip") == "46.20.101.18"
    assert data.get("resolution_method") == "proxy_env"
