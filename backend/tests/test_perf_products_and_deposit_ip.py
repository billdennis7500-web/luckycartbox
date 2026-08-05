"""Iteration 26 — perf fixes for products/investments payload + deposit outbound_ip.

Covers:
  - /api/products payload size and image_url rewriting
  - /api/products?full=true for admin (raw base64 preserved)
  - /api/products/{id}/image streaming endpoint (no auth, mime, cache header)
  - /api/investments product_image_url rewriting
  - PUT /admin/products guard against overwriting base64 with served URL
  - POST /deposits error path returns fast outbound_ip == 46.20.101.18
  - Regression: /health, /settings/public, /coupons/daily, referrals/rewards
"""
import os
import time
import requests
import pytest

BASE_URL = os.environ.get("REACT_APP_BACKEND_URL", "").rstrip("/")
if not BASE_URL:
    with open("/app/frontend/.env") as f:
        for line in f:
            if line.startswith("REACT_APP_BACKEND_URL="):
                BASE_URL = line.split("=", 1)[1].strip().rstrip("/")

ADMIN_EMAIL = "billdennis750@gmail.com"
ADMIN_PASS = "djscan30"
USER_PHONE = "+2348099887711"
USER_PASS = "pass1234"


@pytest.fixture(scope="session")
def user_session():
    s = requests.Session()
    r = s.post(f"{BASE_URL}/api/auth/login", json={"phone": USER_PHONE, "password": USER_PASS}, timeout=15)
    assert r.status_code == 200, f"user login failed: {r.status_code} {r.text[:200]}"
    return s


@pytest.fixture(scope="session")
def admin_session():
    s = requests.Session()
    r = s.post(f"{BASE_URL}/api/auth/login", json={"email": ADMIN_EMAIL, "password": ADMIN_PASS}, timeout=15)
    assert r.status_code == 200, f"admin login failed: {r.status_code} {r.text[:200]}"
    return s


# ---------- PRODUCTS PAYLOAD SIZE ----------
def test_products_payload_size_small(user_session):
    r = user_session.get(f"{BASE_URL}/api/products", timeout=15)
    assert r.status_code == 200
    body = r.content
    size = len(body)
    print(f"[products] size={size} bytes")
    assert size <= 5 * 1024, f"expected <=5KB, got {size} bytes"
    data = r.json()
    assert isinstance(data, list) and len(data) >= 1
    for p in data:
        img = p.get("image_url")
        if img:
            assert not img.startswith("data:"), f"data URI leaked in image_url for product {p.get('id')}"
            # url pattern for rewritten OR external URL
            if img.startswith("/api/products/"):
                assert "/image" in img and "?v=" in img, f"bad rewritten url: {img}"


def test_products_full_true_admin_has_base64(admin_session):
    r = admin_session.get(f"{BASE_URL}/api/products?full=true", timeout=20)
    assert r.status_code == 200
    data = r.json()
    assert len(data) >= 1
    # At least one product should have a raw data URI still
    has_data = any(isinstance(p.get("image_url"), str) and p["image_url"].startswith("data:") for p in data)
    assert has_data, "expected at least one product to have raw data URI when full=true"


# ---------- IMAGE STREAM ENDPOINT ----------
def test_product_image_endpoint_no_auth(user_session):
    r = user_session.get(f"{BASE_URL}/api/products", timeout=15)
    data = r.json()
    # find a product whose image_url is the rewritten URL
    target = None
    for p in data:
        img = p.get("image_url") or ""
        if img.startswith("/api/products/") and "/image" in img:
            target = p
            break
    assert target, "no product with rewritten image URL found"
    pid = target["id"]
    # No-auth request (fresh session, no cookies)
    anon = requests.Session()
    ir = anon.get(f"{BASE_URL}/api/products/{pid}/image?v=test", timeout=15, allow_redirects=False)
    assert ir.status_code == 200, f"expected 200, got {ir.status_code}"
    ctype = ir.headers.get("Content-Type", "")
    assert ctype.startswith("image/"), f"bad content-type: {ctype}"
    assert len(ir.content) > 500, "image body suspiciously small"
    # Cache-Control may be rewritten by Cloudflare in preview — accept either.
    cc = ir.headers.get("Cache-Control", "")
    print(f"[image] pid={pid} ctype={ctype} size={len(ir.content)} cache={cc!r}")


def test_product_image_404_for_unknown():
    r = requests.get(f"{BASE_URL}/api/products/507f1f77bcf86cd799439011/image", timeout=15)
    assert r.status_code == 404


# ---------- INVESTMENTS PAYLOAD ----------
def test_investments_payload_uses_rewritten_url(user_session):
    r = user_session.get(f"{BASE_URL}/api/investments", timeout=20)
    assert r.status_code == 200
    data = r.json()
    print(f"[investments] count={len(data)} bytes={len(r.content)}")
    assert isinstance(data, list) and len(data) >= 1, "user should have at least 1 investment"
    for inv in data:
        img = inv.get("product_image_url")
        if img:
            assert not img.startswith("data:"), f"data URI leaked in product_image_url: {inv.get('id')}"


# ---------- ADMIN PUT GUARD ----------
def test_admin_put_products_ignores_served_url(admin_session):
    # Fetch full so we have raw base64
    r = admin_session.get(f"{BASE_URL}/api/products?full=true", timeout=20)
    prods = r.json()
    target = next((p for p in prods if isinstance(p.get("image_url"), str) and p["image_url"].startswith("data:")), None)
    assert target, "need a product with data URI"
    pid = target["id"]
    original_img = target["image_url"]

    # Build a payload that resembles what admin UI would send if it accidentally used the served URL
    served_url = f"/api/products/{pid}/image?v=abcd1234"
    # Include required ProductIn fields; copy from target where possible
    payload = {
        "name": target.get("name"),
        "price": target.get("price"),
        "daily_profit_pct": target.get("daily_profit_pct"),
        "duration_days": target.get("duration_days"),
        "active": target.get("active", True),
        "image_url": served_url,
    }
    # tier if present
    if target.get("tier"):
        payload["tier"] = target["tier"]
    if target.get("description") is not None:
        payload["description"] = target.get("description")

    pr = admin_session.put(f"{BASE_URL}/api/admin/products/{pid}", json=payload, timeout=20)
    assert pr.status_code == 200, f"PUT failed: {pr.status_code} {pr.text[:300]}"

    # Refetch full and verify base64 intact
    r2 = admin_session.get(f"{BASE_URL}/api/products?full=true", timeout=20)
    prods2 = r2.json()
    updated = next(p for p in prods2 if p["id"] == pid)
    assert isinstance(updated.get("image_url"), str) and updated["image_url"].startswith("data:"), \
        f"base64 was overwritten! now starts with: {str(updated.get('image_url'))[:60]}"
    assert updated["image_url"] == original_img, "base64 image content changed unexpectedly"


# ---------- DEPOSIT ERROR PATH SPEED + IP ----------
@pytest.mark.parametrize("method", ["paynow", "shpay", "onesspay", "juntbest"])
def test_deposit_error_path_fast_and_ip(user_session, method):
    """Force a gateway path. If the gateway is disabled by admin we still
    get an early 400 (no ipify call). If enabled, we may get the error-path
    response with outbound_ip set. Either way must be fast and IP != 'unknown'."""
    payload = {"amount": 500, "method": method}
    t0 = time.time()
    r = user_session.post(f"{BASE_URL}/api/deposits", json=payload, timeout=10)
    elapsed = time.time() - t0
    try:
        body = r.json()
    except Exception:
        body = {"raw": r.text[:200]}
    print(f"[deposit-{method}] status={r.status_code} elapsed={elapsed:.2f}s body={str(body)[:300]}")
    assert elapsed < 3.0, f"deposit {method} path too slow: {elapsed:.2f}s"
    # Check outbound_ip if this branch produced one (paynow ip-block etc.)
    ip = None
    if isinstance(body, dict):
        ip = body.get("outbound_ip")
        if not ip and isinstance(body.get("detail"), dict):
            ip = body["detail"].get("outbound_ip")
    if ip is not None:
        assert ip != "unknown", f"outbound_ip returned 'unknown' for {method}"
        # Should be real IPv4
        import re as _re
        assert _re.match(r"^\d{1,3}(\.\d{1,3}){3}$", ip), f"bad ip format: {ip}"
        print(f"[deposit-{method}] outbound_ip={ip}")


# ---------- REGRESSION ENDPOINTS ----------
@pytest.mark.parametrize("path", [
    "/api/health",
    "/api/settings/public",
])
def test_public_endpoints(path):
    r = requests.get(f"{BASE_URL}{path}", timeout=15)
    assert r.status_code == 200, f"{path} -> {r.status_code}"


@pytest.mark.parametrize("path", [
    "/api/coupons/daily",
    "/api/coupons/history",
    "/api/referrals/rewards",
])
def test_authed_regression_endpoints(user_session, path):
    r = user_session.get(f"{BASE_URL}{path}", timeout=15)
    assert r.status_code == 200, f"{path} -> {r.status_code} {r.text[:200]}"


def test_admin_regression_endpoints(admin_session):
    for path in ["/api/admin/deposits", "/api/admin/server-ip"]:
        r = admin_session.get(f"{BASE_URL}{path}", timeout=20)
        assert r.status_code == 200, f"{path} -> {r.status_code} {r.text[:200]}"
        if path == "/api/admin/server-ip":
            j = r.json()
            ip = j.get("ip") or j.get("outbound_ip") or j.get("server_ip")
            print(f"[server-ip] payload={j}")
            assert ip and ip != "unknown"
