"""Backend regression tests after moving /api/health before include_router."""
import os
import requests
import pytest

BASE_URL = os.environ.get("REACT_APP_BACKEND_URL", "https://dark-gold-ui-build.preview.emergentagent.com").rstrip("/")
API = f"{BASE_URL}/api"

ADMIN_EMAIL = "billdennis750@gmail.com"
ADMIN_PASSWORD = "djscan30"


@pytest.fixture(scope="session")
def admin_session():
    s = requests.Session()
    r = s.post(f"{API}/auth/login", json={"email": ADMIN_EMAIL, "password": ADMIN_PASSWORD}, timeout=15)
    assert r.status_code == 200, f"Admin login failed: {r.status_code} {r.text}"
    data = r.json()
    token = data.get("access_token") or data.get("token")
    if token:
        s.headers.update({"Authorization": f"Bearer {token}"})
    return s


# --- P0: health route ---
def test_health_endpoint():
    r = requests.get(f"{API}/health", timeout=10)
    assert r.status_code == 200, f"got {r.status_code}: {r.text[:200]}"
    j = r.json()
    assert j.get("status") == "ok"
    assert j.get("service") == "luckycartbox-api"
    assert "time" in j


def test_root_api_endpoint():
    r = requests.get(f"{API}/", timeout=10)
    assert r.status_code == 200
    j = r.json()
    assert j.get("ok") is True
    assert j.get("service") == "naija-invest"


# --- Regression: auth ---
def test_admin_login_returns_token():
    r = requests.post(f"{API}/auth/login", json={"email": ADMIN_EMAIL, "password": ADMIN_PASSWORD}, timeout=15)
    assert r.status_code == 200, r.text
    data = r.json()
    # either JWT token in body OR httpOnly cookie
    has_token = bool(data.get("access_token") or data.get("token"))
    has_cookie = any(c.name in ("access_token", "refresh_token") for c in r.cookies)
    assert has_token or has_cookie, f"No token/cookie returned: {data}"


def test_protected_route_without_auth_returns_401():
    # Try a known protected route
    r = requests.get(f"{API}/auth/me", timeout=10)
    assert r.status_code in (401, 403), f"expected 401/403, got {r.status_code}"


# --- Regression: products / plans list ---
def test_products_or_plans_list(admin_session):
    # try several plausible endpoints
    candidates = ["/products", "/plans", "/shop/plans", "/investments/plans"]
    last = None
    for path in candidates:
        r = admin_session.get(f"{API}{path}", timeout=15)
        last = (path, r.status_code, r.text[:200])
        if r.status_code == 200:
            body = r.json()
            assert isinstance(body, (list, dict))
            return
    pytest.fail(f"No products/plans endpoint returned 200. last try: {last}")


# --- Regression: wallet balance ---
def test_wallet_balance(admin_session):
    candidates = ["/wallet/balance", "/wallet", "/user/wallet", "/auth/me"]
    for path in candidates:
        r = admin_session.get(f"{API}{path}", timeout=15)
        if r.status_code == 200:
            j = r.json()
            # check any numeric field exists
            def has_num(d):
                if isinstance(d, dict):
                    return any(isinstance(v, (int, float)) for v in d.values()) or any(has_num(v) for v in d.values() if isinstance(v, (dict, list)))
                if isinstance(d, list):
                    return any(has_num(v) for v in d)
                return False
            assert has_num(j), f"No numeric field in {path}: {j}"
            return
    pytest.fail("No wallet endpoint returned 200")


# --- Regression: admin routes still work ---
def test_admin_shpay_health(admin_session):
    r = admin_session.get(f"{API}/admin/shpay/health", timeout=15)
    assert r.status_code == 200, f"{r.status_code} {r.text[:300]}"


def test_admin_deposits_list(admin_session):
    r = admin_session.get(f"{API}/admin/deposits", timeout=15)
    assert r.status_code == 200, f"{r.status_code} {r.text[:300]}"
    body = r.json()
    assert isinstance(body, (list, dict))


def test_admin_route_without_auth_returns_401():
    r = requests.get(f"{API}/admin/deposits", timeout=10)
    assert r.status_code in (401, 403), f"expected 401/403, got {r.status_code}"
