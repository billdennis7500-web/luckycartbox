"""SHPAY integration backend tests (iteration 13).

Covers:
- /shpay/status (user)
- /shpay/banks (user)
- /admin/shpay/health (admin)
- /deposits with method='shpay-auto' graceful degradation
- /shpay/webhook signature verification (invalid + valid-but-unknown-order)
- /admin/withdrawals/{wid}/shpay-payout 404 branch
- Regression: /paynow/banks, /auth/register, /auth/me, /deposits paynow-auto
"""
import os
import sys
import time
import hashlib
import random
import pytest
import requests

# Allow importing shpay for signature computation
sys.path.insert(0, "/app/backend")
import shpay  # type: ignore

# Load backend env for SHPAY_SIGN_KEY
try:
    from dotenv import load_dotenv
    load_dotenv("/app/backend/.env")
except Exception:
    pass

BASE_URL = os.environ["REACT_APP_BACKEND_URL"].rstrip("/") if os.environ.get("REACT_APP_BACKEND_URL") \
    else open("/app/frontend/.env").read().split("REACT_APP_BACKEND_URL=")[1].split("\n")[0].strip().rstrip("/")

ADMIN_EMAIL = "billdennis750@gmail.com"
ADMIN_PASSWORD = "djscan30"


# ------------------------- fixtures -------------------------

@pytest.fixture(scope="session")
def admin_client():
    s = requests.Session()
    r = s.post(f"{BASE_URL}/api/auth/login", json={"email": ADMIN_EMAIL, "password": ADMIN_PASSWORD})
    assert r.status_code == 200, f"Admin login failed: {r.status_code} {r.text}"
    tok = r.json().get("access_token")
    if tok:
        s.headers["Authorization"] = f"Bearer {tok}"
    return s


@pytest.fixture(scope="session")
def user_client():
    s = requests.Session()
    # Register a fresh user with random NG phone
    phone = f"+23480{random.randint(10000000, 99999999)}"
    r = s.post(f"{BASE_URL}/api/auth/register", json={
        "phone": phone,
        "password": "testpass123",
        "name": "SHPAY Test User",
    })
    assert r.status_code == 200, f"Register failed: {r.status_code} {r.text}"
    tok = r.json().get("access_token")
    if tok:
        s.headers["Authorization"] = f"Bearer {tok}"
    s._phone = phone
    return s


# ------------------------- SHPAY user endpoints -------------------------

class TestShpayUserEndpoints:
    def test_shpay_status(self, user_client):
        r = user_client.get(f"{BASE_URL}/api/shpay/status")
        assert r.status_code == 200, r.text
        data = r.json()
        assert data.get("enabled") is True
        assert data.get("gateway_ready") is False
        assert "whitelist" in (data.get("message") or "").lower()
        assert data.get("bank_count") == 0

    def test_shpay_banks(self, user_client):
        r = user_client.get(f"{BASE_URL}/api/shpay/banks")
        assert r.status_code == 200, r.text
        data = r.json()
        assert data.get("enabled") is True
        assert data.get("gateway_ready") is False
        assert data.get("reason") == "gateway_unreachable"
        assert "whitelist" in (data.get("note") or "").lower()


# ------------------------- Admin health -------------------------

class TestShpayAdminHealth:
    def test_admin_shpay_health(self, admin_client):
        r = admin_client.get(f"{BASE_URL}/api/admin/shpay/health")
        assert r.status_code == 200, r.text
        data = r.json()
        assert data.get("enabled") is True
        ip = data.get("outbound_ip")
        assert isinstance(ip, str) and len(ip.split(".")) == 4, f"outbound_ip not IPv4: {ip}"
        assert data.get("balance") is None
        assert "whitelist" in (data.get("balance_error") or "").lower()
        assert data.get("bank_count") == 0
        assert "whitelist" in (data.get("bank_error") or "").lower()


# ------------------------- Deposit shpay-auto -------------------------

class TestDepositShpayAuto:
    def test_deposit_shpay_auto_graceful(self, user_client):
        r = user_client.post(f"{BASE_URL}/api/deposits",
                             json={"amount": 1000, "method": "shpay-auto", "reference": ""})
        assert r.status_code == 200, r.text
        d = r.json()
        assert d.get("gateway") == "shpay"
        assert d.get("checkout_url") is None
        assert d.get("gateway_ready") is False
        assert "whitelist your server ip" in (d.get("gateway_message") or "").lower()
        ip = d.get("outbound_ip")
        assert isinstance(ip, str) and ip, f"outbound_ip missing: {ip}"
        assert d.get("status") == "failed"


# ------------------------- Webhook -------------------------

class TestShpayWebhook:
    def test_webhook_invalid_sign(self):
        body = {"event": "PAYIN", "outTradeNo": "notreal",
                "transStatus": "SUCCESS", "transAmt": "100", "sign": "DEADBEEF"}
        r = requests.post(f"{BASE_URL}/api/shpay/webhook", json=body)
        assert r.status_code == 200, r.text
        # STRICT: raw plain-text body, no JSON quoting
        assert r.text == "SIGNATURE_INVALID", f"expected raw SIGNATURE_INVALID, got: {r.text!r}"
        ct = r.headers.get("content-type", "").lower()
        assert "text/plain" in ct, f"expected text/plain content-type, got: {ct}"

    def test_webhook_valid_sign_unknown_order(self):
        sign_key = os.environ.get("SHPAY_SIGN_KEY") or ""
        assert sign_key, "SHPAY_SIGN_KEY not loaded from env"
        params = {
            "event": "PAYIN",
            "outTradeNo": f"nonexistent_{int(time.time())}",
            "transStatus": "SUCCESS",
            "transAmt": "100",
        }
        params["sign"] = shpay.sign(params, sign_key)
        r = requests.post(f"{BASE_URL}/api/shpay/webhook", json=params)
        assert r.status_code == 200, r.text
        assert r.text == "OK", f"expected raw OK, got: {r.text!r}"
        ct = r.headers.get("content-type", "").lower()
        assert "text/plain" in ct, f"expected text/plain content-type, got: {ct}"


# ------------------------- Admin shpay-payout 404 -------------------------

class TestShpayPayout404:
    def test_shpay_payout_nonexistent(self, admin_client):
        r = admin_client.post(f"{BASE_URL}/api/admin/withdrawals/000000000000000000000000/shpay-payout",
                              json={"note": "test"})
        assert r.status_code == 404, f"expected 404, got {r.status_code} {r.text}"
        detail = (r.json().get("detail") or "").lower()
        assert "not found" in detail


# ------------------------- Regression: existing endpoints -------------------------

class TestRegressionPayNow:
    def test_paynow_banks(self, user_client):
        r = user_client.get(f"{BASE_URL}/api/paynow/banks")
        assert r.status_code == 200, r.text

    def test_auth_me(self, user_client):
        r = user_client.get(f"{BASE_URL}/api/auth/me")
        assert r.status_code == 200, r.text
        u = r.json()
        assert u.get("phone") == user_client._phone

    def test_register_fresh(self):
        s = requests.Session()
        phone = f"+23481{random.randint(10000000, 99999999)}"
        r = s.post(f"{BASE_URL}/api/auth/register", json={
            "phone": phone, "password": "testpass123", "name": "Regression User"
        })
        assert r.status_code == 200, r.text
        assert r.json().get("access_token")

    def test_deposit_paynow_auto(self, user_client):
        r = user_client.post(f"{BASE_URL}/api/deposits",
                             json={"amount": 1000, "method": "paynow-auto", "reference": ""})
        # Either success with checkout_url, or graceful degradation w/ gateway_ready=False
        assert r.status_code == 200, r.text
        d = r.json()
        assert d.get("gateway") == "paynow"
        # accept either ready or not-ready shape
        assert ("checkout_url" in d) or ("gateway_ready" in d)
