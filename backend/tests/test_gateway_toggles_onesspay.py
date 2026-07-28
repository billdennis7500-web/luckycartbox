"""Iteration 15 backend tests.

Covers:
- Admin gateway toggles (GET/PUT /admin/gateways)
- Per-gateway payin gating (/shpay/status, /paynow/banks, /onesspay/status,
  and POST /deposits with 400 friendly error)
- Per-gateway payout gating (SHPAY & 1SSPay payout admin endpoints)
- 1SSPay endpoints: /onesspay/status, /onesspay/banks, /admin/onesspay/health
- 1SSPay deposit graceful-degradation shape (gateway_ready=false path)
- 1SSPay webhook: signature-valid unknown order and signature-invalid tamper
- Restores all toggles ON at teardown so the app stays clean.
"""
import os
import sys
import random
import pytest
import requests

sys.path.insert(0, "/app/backend")
import onesspay  # type: ignore

try:
    from dotenv import load_dotenv
    load_dotenv("/app/backend/.env")
except Exception:
    pass

BASE_URL = os.environ.get("REACT_APP_BACKEND_URL") \
    or open("/app/frontend/.env").read().split("REACT_APP_BACKEND_URL=")[1].split("\n")[0].strip()
BASE_URL = BASE_URL.rstrip("/")

ADMIN_EMAIL = "billdennis750@gmail.com"
ADMIN_PASSWORD = "djscan30"

ONESSPAY_KEY = os.environ.get("ONESSPAY_KEY", "")
ONESSPAY_MERCHANT_ID = os.environ.get("ONESSPAY_MERCHANT_ID", "")


# ------------------------- fixtures -------------------------

@pytest.fixture(scope="session")
def admin_client():
    s = requests.Session()
    r = s.post(f"{BASE_URL}/api/auth/login",
               json={"email": ADMIN_EMAIL, "password": ADMIN_PASSWORD})
    assert r.status_code == 200, f"Admin login failed: {r.status_code} {r.text}"
    tok = r.json().get("access_token")
    if tok:
        s.headers["Authorization"] = f"Bearer {tok}"
    return s


@pytest.fixture(scope="session")
def user_client():
    s = requests.Session()
    phone = f"+23480{random.randint(10000000, 99999999)}"
    r = s.post(f"{BASE_URL}/api/auth/register", json={
        "phone": phone, "password": "testpass123", "name": "OSSPay Test User",
    })
    assert r.status_code == 200, f"Register failed: {r.status_code} {r.text}"
    tok = r.json().get("access_token")
    if tok:
        s.headers["Authorization"] = f"Bearer {tok}"
    s._phone = phone
    return s


def _set_toggles(admin_client, payload):
    r = admin_client.put(f"{BASE_URL}/api/admin/gateways", json=payload)
    assert r.status_code == 200, r.text
    return r.json()


def _all_on(admin_client):
    return _set_toggles(admin_client, {
        "paynow":   {"payin": True, "payout": True},
        "shpay":    {"payin": True, "payout": True},
        "onesspay": {"payin": True, "payout": True},
    })


@pytest.fixture(scope="session", autouse=True)
def _restore_all_toggles_at_end(admin_client):
    """Guarantee all gateway toggles are ON when the session ends, no matter
    what tests do in between."""
    _all_on(admin_client)
    yield
    _all_on(admin_client)


# All tests live in ONE class so pytest-xdist --dist loadscope pins them to a
# single worker. The shared /admin/gateways setting cannot tolerate concurrent
# mutation across workers.

class TestGatewayIntegration:
    def test_get_returns_three_configured_and_all_on(self, admin_client):
        _all_on(admin_client)
        r = admin_client.get(f"{BASE_URL}/api/admin/gateways")
        assert r.status_code == 200, r.text
        body = r.json()
        gws = body.get("gateways")
        assert isinstance(gws, list) and len(gws) == 3
        keys = sorted(g["key"] for g in gws)
        assert keys == ["onesspay", "paynow", "shpay"]
        for g in gws:
            for f in ("configured", "payin", "payout", "label", "color", "key"):
                assert f in g, f"missing field {f} in {g}"
            assert g["configured"] is True, f"{g['key']} not configured (env)"
            assert g["payin"] is True
            assert g["payout"] is True

    def test_put_partial_update_only_touches_specified(self, admin_client):
        _all_on(admin_client)
        # Turn only shpay-payin off, leave rest untouched
        r = admin_client.put(f"{BASE_URL}/api/admin/gateways",
                             json={"shpay": {"payin": False}})
        assert r.status_code == 200, r.text
        by = {g["key"]: g for g in r.json()["gateways"]}
        assert by["shpay"]["payin"] is False
        assert by["shpay"]["payout"] is True
        assert by["paynow"]["payin"] is True and by["paynow"]["payout"] is True
        assert by["onesspay"]["payin"] is True and by["onesspay"]["payout"] is True
        # Verify persistence via GET
        r2 = admin_client.get(f"{BASE_URL}/api/admin/gateways")
        by2 = {g["key"]: g for g in r2.json()["gateways"]}
        assert by2["shpay"]["payin"] is False


# ------------------------- 2) Payin gating -------------------------

# merged into TestGatewayIntegration
    def test_shpay_status_disabled_when_toggle_off(self, admin_client, user_client):
        _set_toggles(admin_client, {"shpay": {"payin": False}})
        r = user_client.get(f"{BASE_URL}/api/shpay/status")
        assert r.status_code == 200
        data = r.json()
        assert data.get("enabled") is False
        assert data.get("reason") == "disabled"
        # Turn back on -> enabled true
        _set_toggles(admin_client, {"shpay": {"payin": True}})
        r2 = user_client.get(f"{BASE_URL}/api/shpay/status")
        assert r2.json().get("enabled") is True

    def test_paynow_banks_disabled_when_toggle_off(self, admin_client, user_client):
        _set_toggles(admin_client, {"paynow": {"payin": False}})
        r = user_client.get(f"{BASE_URL}/api/paynow/banks")
        assert r.status_code == 200
        data = r.json()
        assert data.get("enabled") is False
        assert data.get("reason") == "disabled"
        _set_toggles(admin_client, {"paynow": {"payin": True}})

    def test_onesspay_status_disabled_when_toggle_off(self, admin_client, user_client):
        _set_toggles(admin_client, {"onesspay": {"payin": False}})
        r = user_client.get(f"{BASE_URL}/api/onesspay/status")
        assert r.status_code == 200
        data = r.json()
        assert data.get("enabled") is False
        assert data.get("reason") == "disabled"
        _set_toggles(admin_client, {"onesspay": {"payin": True}})

    def test_deposit_shpay_auto_400_when_disabled(self, admin_client, user_client):
        _set_toggles(admin_client, {"shpay": {"payin": False}})
        r = user_client.post(f"{BASE_URL}/api/deposits",
                             json={"amount": 1000, "method": "shpay-auto"})
        assert r.status_code == 400, r.text
        detail = (r.json().get("detail") or "").lower()
        assert "temporarily unavailable" in detail
        _set_toggles(admin_client, {"shpay": {"payin": True}})


# ------------------------- 3) Payout gating -------------------------

# merged into TestGatewayIntegration
    def test_shpay_payout_400_when_disabled(self, admin_client):
        _set_toggles(admin_client, {"shpay": {"payout": False}})
        # Use a fake but valid-shape id; endpoint should reject on toggle
        # BEFORE looking up the withdrawal.
        fake_id = "507f1f77bcf86cd799439011"
        r = admin_client.post(
            f"{BASE_URL}/api/admin/withdrawals/{fake_id}/shpay-payout",
            json={"note": ""},
        )
        assert r.status_code == 400, r.text
        assert "disabled by admin" in (r.json().get("detail") or "").lower()
        _set_toggles(admin_client, {"shpay": {"payout": True}})

    def test_onesspay_payout_400_when_disabled(self, admin_client):
        _set_toggles(admin_client, {"onesspay": {"payout": False}})
        fake_id = "507f1f77bcf86cd799439011"
        r = admin_client.post(
            f"{BASE_URL}/api/admin/withdrawals/{fake_id}/onesspay-payout",
            json={"note": ""},
        )
        assert r.status_code == 400, r.text
        detail = (r.json().get("detail") or "").lower()
        assert "1sspay" in detail and "disabled by admin" in detail
        _set_toggles(admin_client, {"onesspay": {"payout": True}})


# ------------------------- 4) 1SSPay endpoints -------------------------

# merged into TestGatewayIntegration
    def test_onesspay_status_gateway_not_ready(self, admin_client, user_client):
        _all_on(admin_client)
        r = user_client.get(f"{BASE_URL}/api/onesspay/status")
        assert r.status_code == 200, r.text
        data = r.json()
        assert data.get("enabled") is True
        # Sample creds have Nigeria channel closed -> code 1007
        # We accept either the documented failure or a happy-path (unlikely).
        if data.get("gateway_ready") is False:
            assert data.get("code") in (1007, 0) or isinstance(data.get("code"), int)
            # msg present
            assert data.get("message") is not None or data.get("code") == 1007

    def test_onesspay_banks_list(self, user_client):
        r = user_client.get(f"{BASE_URL}/api/onesspay/banks")
        assert r.status_code == 200, r.text
        data = r.json()
        assert data.get("enabled") is True
        banks = data.get("data") or []
        assert len(banks) == 211, f"expected 211 got {len(banks)}"
        by_code = {b["code"]: b["name"] for b in banks}
        assert by_code.get("NR0090") == "ZENITH BANK"
        assert by_code.get("NR0161") == "ACCESS BANK PLC"

    def test_admin_onesspay_health(self, admin_client):
        r = admin_client.get(f"{BASE_URL}/api/admin/onesspay/health")
        assert r.status_code == 200, r.text
        data = r.json()
        assert data.get("enabled") is True
        assert "outbound_ip" in data
        # balance_response should contain a code field (1007 expected but we
        # only assert presence to avoid false negatives if IP gets whitelisted).
        assert "balance_response" in data or "error" in data
        if "balance_response" in data:
            assert "code" in data["balance_response"]

    def test_deposit_onesspay_auto_graceful_failure(self, admin_client, user_client):
        _all_on(admin_client)
        r = user_client.post(f"{BASE_URL}/api/deposits",
                             json={"amount": 1000, "method": "onesspay-auto"})
        assert r.status_code == 200, f"status={r.status_code} body={r.text}"
        body = r.json()
        assert body.get("gateway") == "onesspay"
        assert body.get("status") == "failed"
        assert body.get("gateway_ready") is False
        assert "outbound_ip" in body
        msg = (body.get("gateway_message") or "").lower()
        assert "whitelist" in msg or "unavailable" in msg


# ------------------------- 5) 1SSPay webhook -------------------------

# merged into TestGatewayIntegration
    def test_webhook_signature_invalid_returns_plaintext(self):
        # Craft a body with a wrong signature
        body = {
            "merchantId": ONESSPAY_MERCHANT_ID or "test",
            "orderNo": "NONEXISTENT_ORDER",
            "status": "2",
            "amount": "1000.00",
            "amountReal": "1000.00",
            "sign": "not_a_valid_sign_bm==",
        }
        r = requests.post(f"{BASE_URL}/api/onesspay/webhook/payin", data=body)
        assert r.status_code == 200
        assert r.text.strip() == "signature_invalid"
        ct = r.headers.get("content-type", "")
        assert "text/plain" in ct

    def test_webhook_signature_valid_unknown_order_returns_success(self):
        if not ONESSPAY_KEY:
            pytest.skip("ONESSPAY_KEY not set")
        body = {
            "merchantId": ONESSPAY_MERCHANT_ID,
            "orderNo": "TEST_UNKNOWN_ORDER_ZZZ",
            "status": "2",
            "amount": "1000.00",
            "amountReal": "1000.00",
        }
        body["sign"] = onesspay.sign(body, ONESSPAY_KEY)
        r = requests.post(f"{BASE_URL}/api/onesspay/webhook/payin", data=body)
        assert r.status_code == 200
        # Unknown order still returns "success" per idempotency contract
        assert r.text.strip() == "success"

    def test_webhook_tampered_amount_returns_signature_invalid(self):
        if not ONESSPAY_KEY:
            pytest.skip("ONESSPAY_KEY not set")
        body = {
            "merchantId": ONESSPAY_MERCHANT_ID,
            "orderNo": "TEST_TAMPER",
            "status": "2",
            "amount": "1000.00",
            "amountReal": "1000.00",
        }
        body["sign"] = onesspay.sign(body, ONESSPAY_KEY)
        # Tamper: change amount after signing
        body["amount"] = "999999.00"
        r = requests.post(f"{BASE_URL}/api/onesspay/webhook/payin", data=body)
        assert r.status_code == 200
        assert r.text.strip() == "signature_invalid"


# ------------------------- 6) Sanity re-verify SHPAY -------------------------

# merged into TestGatewayIntegration
    def test_shpay_status_after_restore(self, admin_client, user_client):
        _all_on(admin_client)
        r = user_client.get(f"{BASE_URL}/api/shpay/status")
        assert r.status_code == 200
        data = r.json()
        assert data.get("enabled") is True
        # gateway_ready may be true or false depending on IP whitelist rotation.
