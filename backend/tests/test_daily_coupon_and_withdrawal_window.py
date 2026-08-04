"""Backend tests for daily auto-coupon + withdrawal window (iteration 24)."""
import os
import re
import time
import pytest
import requests

BASE_URL = os.environ.get("REACT_APP_BACKEND_URL", "").rstrip("/") or \
    open("/app/frontend/.env").read().split("REACT_APP_BACKEND_URL=")[1].split("\n")[0].strip()

ADMIN = {"email": "billdennis750@gmail.com", "password": "djscan30"}
USER = {"phone": "+2348099887711", "password": "pass1234"}
CODE_RE = re.compile(r"^LUCKY-[A-HJ-NP-Z2-9]{4}$")


def _login(payload):
    s = requests.Session()
    r = s.post(f"{BASE_URL}/api/auth/login", json=payload, timeout=15)
    assert r.status_code == 200, f"login failed: {r.status_code} {r.text}"
    return s


@pytest.fixture(scope="module")
def admin():
    return _login(ADMIN)


@pytest.fixture(scope="module")
def user():
    return _login(USER)


# ---------- health ----------
def test_health():
    r = requests.get(f"{BASE_URL}/api/health", timeout=10)
    assert r.status_code == 200


# ---------- Daily auto-coupon generation ----------
def test_reset_last_generated_and_generate_now(admin):
    # Ensure enabled + reset bookkeeping via PUT /api/admin/settings
    r = admin.put(f"{BASE_URL}/api/admin/settings",
                  json={"auto_coupon_enabled": True,
                        "auto_coupon_time": "17:10",
                        "auto_coupon_amount": 500,
                        "auto_coupon_max_uses": 10,
                        "auto_coupon_prefix": "LUCKY"}, timeout=15)
    assert r.status_code == 200, r.text

    # Delete any today coupon + reset last_generated_date via mongo helper endpoint if not available -> use generate-now idempotency check
    # First call generate-now
    r1 = admin.post(f"{BASE_URL}/api/admin/coupons/generate-now", timeout=15)
    assert r1.status_code == 200, r1.text
    d1 = r1.json()
    assert d1["ok"] is True
    assert CODE_RE.match(d1["code"]), f"code {d1['code']} does not match pattern"
    assert d1["amount"] == 500
    assert d1["max_uses"] == 10

    # Second call same day should be idempotent
    r2 = admin.post(f"{BASE_URL}/api/admin/coupons/generate-now", timeout=15)
    assert r2.status_code == 200
    d2 = r2.json()
    assert d2["already_existed"] is True
    assert d2["code"] == d1["code"], "generate-now not idempotent"


def test_user_daily_coupon_and_redeem(user, admin):
    # Ensure coupon exists
    admin.post(f"{BASE_URL}/api/admin/coupons/generate-now", timeout=15)

    r = user.get(f"{BASE_URL}/api/coupons/daily", timeout=15)
    assert r.status_code == 200, r.text
    data = r.json()
    assert data["available"] is True
    code = data["code"]
    assert CODE_RE.match(code)

    if data.get("already_redeemed"):
        pytest.skip("User already redeemed today's coupon; skipping credit test")

    assert data["can_redeem"] is True

    # Get wallet before
    me = user.get(f"{BASE_URL}/api/auth/me", timeout=10).json()
    wallet_before = float(me.get("wallet_balance", 0))

    # Redeem
    rr = user.post(f"{BASE_URL}/api/coupons/redeem", json={"code": code}, timeout=15)
    assert rr.status_code == 200, rr.text
    assert rr.json()["amount"] == 500

    # Wallet increased by 500
    me2 = user.get(f"{BASE_URL}/api/auth/me", timeout=10).json()
    wallet_after = float(me2.get("wallet_balance", 0))
    assert round(wallet_after - wallet_before, 2) == 500.0, f"{wallet_before} -> {wallet_after}"

    # Second fetch shows already_redeemed
    r2 = user.get(f"{BASE_URL}/api/coupons/daily", timeout=15)
    assert r2.json()["already_redeemed"] is True

    # Second redeem returns 400
    rr2 = user.post(f"{BASE_URL}/api/coupons/redeem", json={"code": code}, timeout=15)
    assert rr2.status_code == 400


# ---------- Withdrawal window ----------
def test_withdrawal_window_default_open(user, admin):
    # Ensure disabled first
    r = admin.put(f"{BASE_URL}/api/admin/settings",
                  json={"withdrawal_window_enabled": False}, timeout=15)
    assert r.status_code == 200
    r = user.get(f"{BASE_URL}/api/withdrawals/window", timeout=10)
    assert r.status_code == 200
    d = r.json()
    assert d["enabled"] is False
    assert d["is_open"] is True


def test_withdrawal_blocked_when_closed(user, admin):
    # Set an already-closed window
    r = admin.put(f"{BASE_URL}/api/admin/settings",
                  json={"withdrawal_window_enabled": True,
                        "withdrawal_open_time": "23:00",
                        "withdrawal_close_time": "23:01",
                        "withdrawal_closed_message": "Withdrawals are closed. Try tomorrow!"},
                  timeout=15)
    assert r.status_code == 200, r.text

    # Verify window state
    w = user.get(f"{BASE_URL}/api/withdrawals/window", timeout=10).json()
    assert w["enabled"] is True
    # is_open might be True/False depending on server time; the important gate check below
    # Try to submit withdrawal
    rr = user.post(f"{BASE_URL}/api/withdrawals",
                   json={"amount": 100,
                         "bank_code": "058", "bank_name": "GTBank",
                         "account_number": "0123456789", "account_name": "UI Tester"},
                   timeout=15)
    if not w["is_open"]:
        assert rr.status_code == 423, f"expected 423 got {rr.status_code}: {rr.text}"
        assert "closed" in (rr.json().get("detail") or "").lower()
    else:
        # server clock happens to be inside 23:00-23:01 window; skip
        pytest.skip("window happens to be open right now")

    # Reset
    r = admin.put(f"{BASE_URL}/api/admin/settings",
                  json={"withdrawal_window_enabled": False}, timeout=15)
    assert r.status_code == 200
    w2 = user.get(f"{BASE_URL}/api/withdrawals/window", timeout=10).json()
    assert w2["is_open"] is True


# ---------- Admin settings persistence ----------
def test_admin_settings_persistence(admin):
    payload = {
        "auto_coupon_time": "17:15",
        "auto_coupon_amount": 500,
        "auto_coupon_max_uses": 10,
        "auto_coupon_prefix": "LUCKY",
        "auto_coupon_enabled": True,
        "withdrawal_window_enabled": False,
        "withdrawal_open_time": "08:00",
        "withdrawal_close_time": "17:00",
        "withdrawal_closed_message": "Withdrawals are closed for the day.",
    }
    r = admin.put(f"{BASE_URL}/api/admin/settings", json=payload, timeout=15)
    assert r.status_code == 200, r.text
    got = admin.get(f"{BASE_URL}/api/admin/settings", timeout=10).json()
    for k, v in payload.items():
        assert got.get(k) == v, f"setting {k} not persisted: expected {v} got {got.get(k)}"
    # Reset time back to 17:10
    admin.put(f"{BASE_URL}/api/admin/settings", json={"auto_coupon_time": "17:10"}, timeout=15)


# ---------- Regression ----------
def test_regression_endpoints(user, admin):
    for path in ["/api/settings/public", "/api/referrals/rewards"]:
        r = user.get(f"{BASE_URL}{path}", timeout=10)
        assert r.status_code == 200, f"{path} -> {r.status_code}"
    for path in ["/api/admin/deposits", "/api/admin/server-ip"]:
        r = admin.get(f"{BASE_URL}{path}", timeout=10)
        assert r.status_code == 200, f"{path} -> {r.status_code}"
