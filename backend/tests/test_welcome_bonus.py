"""Welcome bonus fix regression tests."""
import os
import time
import requests
import pytest

BASE_URL = os.environ.get("REACT_APP_BACKEND_URL", "https://returns-hub-21.preview.emergentagent.com").rstrip("/")

# Unique phone per run
_ts = str(int(time.time()))
PHONE = "+2348" + _ts[-9:]  # +234 + 10 digits
PASSWORD = "TestPass123"
NAME = "Welcome Bonus Test"


@pytest.fixture(scope="module")
def welcome_bonus_amount():
    r = requests.get(f"{BASE_URL}/api/settings/public", timeout=15)
    assert r.status_code == 200, f"settings/public {r.status_code} {r.text}"
    data = r.json()
    wb = data.get("welcome_bonus")
    assert wb is not None, f"welcome_bonus missing in settings public: {data}"
    return float(wb)


@pytest.fixture(scope="module")
def registered():
    payload = {"phone": PHONE, "password": PASSWORD, "name": NAME}
    r = requests.post(f"{BASE_URL}/api/auth/register", json=payload, timeout=20)
    assert r.status_code == 200, f"register failed {r.status_code} {r.text}"
    data = r.json()
    assert "user" in data, f"user missing: {data}"
    token = data.get("token") or data.get("access_token")
    return {"resp": data, "token": token}


def test_register_credits_wallet(registered, welcome_bonus_amount):
    user = registered["resp"]["user"]
    assert float(user["wallet_balance"]) == welcome_bonus_amount, (
        f"wallet_balance expected {welcome_bonus_amount}, got {user.get('wallet_balance')}"
    )
    assert float(user.get("bonus_balance", 0)) == 0.0, (
        f"bonus_balance expected 0, got {user.get('bonus_balance')}"
    )


def _auth_headers(registered):
    # Try Bearer token; also try cookie-based
    token = registered["token"]
    return {"Authorization": f"Bearer {token}"} if token else {}


def test_me_reflects_welcome_bonus(registered, welcome_bonus_amount):
    # Try with token first
    headers = _auth_headers(registered)
    if not headers:
        # Login to get token via cookies
        s = requests.Session()
        r = s.post(f"{BASE_URL}/api/auth/login", json={"phone": PHONE, "password": PASSWORD}, timeout=15)
        assert r.status_code == 200, f"login {r.status_code} {r.text}"
        token = r.json().get("token") or r.json().get("access_token")
        headers = {"Authorization": f"Bearer {token}"} if token else {}
        r = s.get(f"{BASE_URL}/api/auth/me", headers=headers, timeout=15)
    else:
        r = requests.get(f"{BASE_URL}/api/auth/me", headers=headers, timeout=15)
    assert r.status_code == 200, f"/auth/me {r.status_code} {r.text}"
    me = r.json()
    assert float(me["wallet_balance"]) == welcome_bonus_amount
    assert float(me.get("bonus_balance", 0)) == 0.0
    assert me.get("welcome_bonus_given") is True, f"welcome_bonus_given={me.get('welcome_bonus_given')}"


def test_welcome_bonus_transaction_exists(registered, welcome_bonus_amount):
    headers = _auth_headers(registered)
    r = requests.get(f"{BASE_URL}/api/transactions", headers=headers, timeout=15)
    assert r.status_code == 200, f"/transactions {r.status_code} {r.text}"
    txs = r.json()
    if isinstance(txs, dict):
        txs = txs.get("transactions") or txs.get("items") or []
    wb_txs = [t for t in txs if t.get("type") == "welcome_bonus"]
    assert len(wb_txs) == 1, f"expected 1 welcome_bonus tx, got {len(wb_txs)}: {wb_txs}"
    tx = wb_txs[0]
    assert float(tx["amount"]) == welcome_bonus_amount
    meta = tx.get("meta") or {}
    assert meta.get("credits_wallet") is True, f"meta.credits_wallet expected True, got {meta}"


def test_withdrawal_still_gated_for_new_user(registered, welcome_bonus_amount):
    headers = _auth_headers(registered)
    payload = {
        "amount": welcome_bonus_amount,
        "bank_code": "057",
        "bank_name": "GTB",
        "account_number": "0123456789",
        "account_name": "Test",
    }
    r = requests.post(f"{BASE_URL}/api/withdrawals", json=payload, headers=headers, timeout=15)
    assert r.status_code == 400, f"expected 400, got {r.status_code} {r.text}"
    body = r.text.lower()
    assert "invest" in body, f"expected invest-gate message, got: {r.text}"
