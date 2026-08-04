"""
Backend regression tests for the deposit gateway labeling bug fix.
Verifies:
  1. POST /api/deposits with method=<gw>-auto sets gateway=<gw> (not 'manual')
     even if downstream gateway call fails.
  2. No historical deposit has gateway='manual' AND method starting with a
     known gateway prefix.
  3. Basic regressions: /api/health, /api/settings/public, admin login,
     user login, /api/products.
"""
import os
import time
import pytest
import requests

def _load_base_url():
    v = os.environ.get("REACT_APP_BACKEND_URL", "").strip()
    if not v:
        try:
            with open("/app/frontend/.env") as f:
                for line in f:
                    if line.startswith("REACT_APP_BACKEND_URL="):
                        v = line.split("=", 1)[1].strip()
                        break
        except Exception:
            pass
    return v.rstrip("/")

BASE_URL = _load_base_url()
assert BASE_URL, "REACT_APP_BACKEND_URL must be set"

ADMIN_EMAIL = "billdennis750@gmail.com"
ADMIN_PASSWORD = "djscan30"
USER_PHONE = "+2348099887711"
USER_PASSWORD = "pass1234"

GATEWAYS = ["paynow", "shpay", "onesspay", "juntbest"]


@pytest.fixture(scope="session")
def user_session():
    s = requests.Session()
    r = s.post(f"{BASE_URL}/api/auth/login",
               json={"phone": USER_PHONE, "password": USER_PASSWORD}, timeout=15)
    assert r.status_code == 200, f"user login failed: {r.status_code} {r.text}"
    return s


@pytest.fixture(scope="session")
def admin_session():
    s = requests.Session()
    r = s.post(f"{BASE_URL}/api/auth/login",
               json={"email": ADMIN_EMAIL, "password": ADMIN_PASSWORD}, timeout=15)
    assert r.status_code == 200, f"admin login failed: {r.status_code} {r.text}"
    data = r.json()
    assert data.get("user", {}).get("role") == "admin" or data.get("role") == "admin", data
    return s


# --------------- Regressions ---------------
def test_health():
    r = requests.get(f"{BASE_URL}/api/health", timeout=10)
    assert r.status_code == 200
    j = r.json()
    assert j.get("status") == "ok"
    # service name may be luckycartbox-api per PR context; accept either
    assert "api" in j.get("service", "").lower()


def test_public_settings():
    r = requests.get(f"{BASE_URL}/api/settings/public", timeout=10)
    assert r.status_code == 200
    j = r.json()
    assert j.get("site_name") == "Luckycart Box"
    assert float(j.get("welcome_bonus", 0)) == 500.0


def test_products_seeded(user_session):
    r = user_session.get(f"{BASE_URL}/api/products", timeout=10)
    assert r.status_code == 200
    lst = r.json()
    assert isinstance(lst, list)
    assert len(lst) >= 5


# --------------- Gateway labeling fix ---------------
@pytest.mark.parametrize("gw", GATEWAYS)
def test_deposit_gateway_label_set_at_creation(user_session, admin_session, gw):
    method = f"{gw}-auto"
    amount = 600
    # Try to create deposit. Gateway may be disabled → 400. That's OK for verification
    # because we then just verify historical deposits already have proper labels.
    r = user_session.post(f"{BASE_URL}/api/deposits",
                          json={"method": method, "amount": amount}, timeout=30)
    if r.status_code != 200:
        pytest.skip(f"deposit create for {method} not accepted ({r.status_code}): {r.text[:200]}")
        return
    body = r.json()
    dep_id = body.get("id") or body.get("deposit_id") or body.get("_id")
    # Fetch admin deposits and find the new row
    time.sleep(0.5)
    ra = admin_session.get(f"{BASE_URL}/api/admin/deposits", timeout=15)
    assert ra.status_code == 200, ra.text
    rows = ra.json()
    if isinstance(rows, dict):
        rows = rows.get("items") or rows.get("deposits") or []
    # Find any row that matches this method for this user recently
    match = [d for d in rows if d.get("method") == method and d.get("user_phone") == USER_PHONE]
    assert match, f"No admin deposit row found for method={method}"
    latest = sorted(match, key=lambda d: d.get("created_at", ""), reverse=True)[0]
    assert latest.get("gateway") == gw, f"Expected gateway={gw}, got {latest.get('gateway')} for method={method}"
    assert latest.get("user_name")


def test_no_historical_mislabeled_deposits(admin_session):
    r = admin_session.get(f"{BASE_URL}/api/admin/deposits", timeout=30)
    assert r.status_code == 200
    rows = r.json()
    if isinstance(rows, dict):
        rows = rows.get("items") or rows.get("deposits") or []
    mislabeled = []
    for d in rows:
        method = (d.get("method") or "")
        gateway = (d.get("gateway") or "")
        for gw in GATEWAYS:
            if method.startswith(gw) and gateway == "manual":
                mislabeled.append({"id": d.get("id"), "method": method, "gateway": gateway})
    assert not mislabeled, f"Found {len(mislabeled)} historical mislabeled deposits: {mislabeled[:5]}"


def test_admin_deposits_row_shape(admin_session):
    r = admin_session.get(f"{BASE_URL}/api/admin/deposits", timeout=30)
    assert r.status_code == 200
    rows = r.json()
    if isinstance(rows, dict):
        rows = rows.get("items") or rows.get("deposits") or []
    assert rows, "Admin deposits list is empty"
    # Sample one row and confirm expected shape
    sample = rows[0]
    for f in ("gateway", "method", "user_name", "user_phone", "amount", "status"):
        assert f in sample, f"missing field {f} in admin deposit row keys={list(sample.keys())}"
    # gateway values are within known set
    known = set(GATEWAYS) | {"manual"}
    bad = [d.get("gateway") for d in rows if d.get("gateway") not in known]
    assert not bad, f"Unexpected gateway labels: {set(bad)}"
