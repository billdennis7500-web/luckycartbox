"""Verify absolute-count-based progress_pct formula for referral rewards."""
import os
import requests
import pytest

BASE = os.environ.get("REACT_APP_BACKEND_URL") or open("/app/frontend/.env").read().split("REACT_APP_BACKEND_URL=")[1].split()[0]
BASE = BASE.rstrip("/")


def _login(phone, password):
    s = requests.Session()
    r = s.post(f"{BASE}/api/auth/login", json={"phone": phone, "password": password}, timeout=15)
    assert r.status_code == 200, r.text
    return s


def test_progress_pct_regression_user_50pct():
    """Regression user has 5 qualifying refs. Next tier Ascend min=10. Expect 50.0%."""
    s = _login("+2348099887711", "pass1234")
    r = s.get(f"{BASE}/api/referrals/rewards", timeout=15)
    assert r.status_code == 200, r.text
    data = r.json()
    assert data["count"] == 5, data
    # next_tier should be Ascend with min_referrals=10 => 5/10 => 50%
    assert data["next_level_needs"] == 5, data
    assert data["progress_pct"] == 50.0, f"expected 50.0, got {data['progress_pct']}"


def test_progress_pct_fresh_user_zero():
    """Fresh user with 0 refs -> progress_pct == 0."""
    import random
    phone = f"080{random.randint(10000000, 99999999)}"
    reg = requests.post(
        f"{BASE}/api/auth/register",
        json={"name": "TEST_ProgressZero", "phone": phone, "password": "pass1234"},
        timeout=15,
    )
    assert reg.status_code in (200, 201), reg.text
    s = requests.Session()
    lg = s.post(f"{BASE}/api/auth/login", json={"phone": phone, "password": "pass1234"}, timeout=15)
    assert lg.status_code == 200, lg.text
    r = s.get(f"{BASE}/api/referrals/rewards", timeout=15)
    assert r.status_code == 200
    data = r.json()
    assert data["count"] == 0
    assert data["progress_pct"] == 0 or data["progress_pct"] == 0.0
