"""Tests for /api/admin/server-ip stability + admin regression endpoints (iter 21)."""
import os
import re
import pytest
import requests

BASE_URL = os.environ.get("REACT_APP_BACKEND_URL", "https://dark-gold-ui-build.preview.emergentagent.com").rstrip("/")
ADMIN_EMAIL = "billdennis750@gmail.com"
ADMIN_PASSWORD = "djscan30"
EXPECTED_IP = "46.20.101.18"

IPV4_RE = re.compile(r"^\d{1,3}(\.\d{1,3}){3}$")


@pytest.fixture(scope="module")
def admin_session():
    s = requests.Session()
    r = s.post(f"{BASE_URL}/api/auth/login", json={"email": ADMIN_EMAIL, "password": ADMIN_PASSWORD}, timeout=15)
    assert r.status_code == 200, f"admin login failed {r.status_code} {r.text}"
    token = r.json().get("access_token") or r.json().get("token")
    if token:
        s.headers.update({"Authorization": f"Bearer {token}"})
    return s


# ---------- /admin/server-ip determinism ------------------------------------
def test_server_ip_returns_expected_ip(admin_session):
    r = admin_session.get(f"{BASE_URL}/api/admin/server-ip", timeout=15)
    assert r.status_code == 200, r.text
    data = r.json()
    assert data["outbound_ip"] == EXPECTED_IP, data
    assert data["static_proxy_configured"] is True
    assert data["resolution_method"] == "proxy_env"
    assert IPV4_RE.match(data["outbound_ip"])


def test_server_ip_is_stable_across_10_calls(admin_session):
    ips = []
    methods = []
    for i in range(10):
        r = admin_session.get(f"{BASE_URL}/api/admin/server-ip", timeout=15)
        assert r.status_code == 200, f"call {i} failed: {r.status_code} {r.text}"
        d = r.json()
        assert d["outbound_ip"] != "unknown", f"call {i} returned unknown: {d}"
        ips.append(d["outbound_ip"])
        methods.append(d["resolution_method"])
    assert len(set(ips)) == 1, f"IPs varied across calls: {ips}"
    assert ips[0] == EXPECTED_IP
    assert all(m == "proxy_env" for m in methods), methods


# ---------- Regression: admin endpoints -------------------------------------
def test_admin_deposits(admin_session):
    r = admin_session.get(f"{BASE_URL}/api/admin/deposits", timeout=15)
    assert r.status_code == 200, r.text
    body = r.json()
    assert isinstance(body, (list, dict))


def test_admin_settings(admin_session):
    r = admin_session.get(f"{BASE_URL}/api/admin/settings", timeout=15)
    assert r.status_code == 200, r.text
    data = r.json()
    assert isinstance(data, dict)
    # spot-check a few expected keys
    assert "referral_levels" in data or "min_deposit" in data or len(data) > 0


def test_admin_users(admin_session):
    r = admin_session.get(f"{BASE_URL}/api/admin/users", timeout=15)
    assert r.status_code == 200, r.text
    assert isinstance(r.json(), (list, dict))


def test_public_settings_unchanged():
    r = requests.get(f"{BASE_URL}/api/settings/public", timeout=15)
    assert r.status_code == 200, r.text
    assert isinstance(r.json(), dict)


def test_referral_rewards_endpoint():
    """Referral rewards must be reachable (public or user-scoped). Just ensure not 5xx."""
    s = requests.Session()
    # Try with regression user
    r = s.post(f"{BASE_URL}/api/auth/login", json={"phone": "+2348099887711", "password": "pass1234"}, timeout=15)
    if r.status_code == 200:
        token = r.json().get("access_token") or r.json().get("token")
        if token:
            s.headers.update({"Authorization": f"Bearer {token}"})
        rr = s.get(f"{BASE_URL}/api/referrals/rewards", timeout=15)
        assert rr.status_code < 500, rr.text
    else:
        pytest.skip(f"regression user login failed: {r.status_code}")
