"""NaijaInvest backend API tests.

Runs against REACT_APP_BACKEND_URL from frontend/.env. All auth via Bearer
tokens (cookie set on login but tests use header for portability).
"""
import os
import random
import string
import pytest
import requests
from pathlib import Path

# Load REACT_APP_BACKEND_URL from frontend .env
def _load_base_url() -> str:
    env_path = Path("/app/frontend/.env")
    for line in env_path.read_text().splitlines():
        if line.startswith("REACT_APP_BACKEND_URL="):
            return line.split("=", 1)[1].strip().rstrip("/")
    raise RuntimeError("REACT_APP_BACKEND_URL not found")


BASE_URL = _load_base_url()
ADMIN_PHONE = "+2348000000000"
ADMIN_EMAIL = "billdennis750@gmail.com"
ADMIN_PASSWORD = "djscan30"


def _rand_phone() -> str:
    return "+23480" + "".join(random.choices(string.digits, k=8))


def _auth_headers(token: str) -> dict:
    return {"Authorization": f"Bearer {token}", "Content-Type": "application/json"}


# ---------------------------------------------------------------------------
# Fixtures
# ---------------------------------------------------------------------------
@pytest.fixture(scope="session")
def admin_token() -> str:
    r = requests.post(f"{BASE_URL}/api/auth/login",
                      json={"phone": ADMIN_PHONE, "password": ADMIN_PASSWORD}, timeout=15)
    assert r.status_code == 200, f"Admin login failed: {r.status_code} {r.text}"
    data = r.json()
    assert data["user"]["role"] == "admin"
    return data["access_token"]


@pytest.fixture(scope="session")
def admin_headers(admin_token) -> dict:
    return _auth_headers(admin_token)


@pytest.fixture(scope="session")
def user_a() -> dict:
    """Root referrer user (gen0)."""
    phone = _rand_phone()
    r = requests.post(f"{BASE_URL}/api/auth/register",
                      json={"phone": phone, "password": "pass1234", "name": "TEST_UserA"},
                      timeout=15)
    assert r.status_code == 200, r.text
    d = r.json()
    return {"phone": phone, "token": d["access_token"], "user": d["user"]}


@pytest.fixture(scope="session")
def user_b(user_a, admin_headers) -> dict:
    """gen1 - referred by A. Pre-invested so post-invest gated flows work."""
    phone = _rand_phone()
    r = requests.post(f"{BASE_URL}/api/auth/register",
                      json={"phone": phone, "password": "pass1234", "name": "TEST_UserB",
                            "referral_code": user_a["user"]["referral_code"]}, timeout=15)
    assert r.status_code == 200, r.text
    d = r.json()
    token = d["access_token"]
    uid = d["user"]["id"]
    # Ensure user_b has invested (has_invested=True) so gated flows are testable
    prods = requests.get(f"{BASE_URL}/api/products",
                        headers=_auth_headers(token), timeout=15).json()
    price = prods[0]["price"]
    requests.post(f"{BASE_URL}/api/admin/users/{uid}/add-balance",
                  json={"amount": price + 5000.0}, headers=admin_headers, timeout=15)
    inv = requests.post(f"{BASE_URL}/api/invest", json={"product_id": prods[0]["id"]},
                       headers=_auth_headers(token), timeout=15)
    assert inv.status_code == 200, inv.text
    me = requests.get(f"{BASE_URL}/api/auth/me",
                     headers=_auth_headers(token), timeout=15).json()
    return {"phone": phone, "token": token, "user": me}


# ---------------------------------------------------------------------------
# Auth
# ---------------------------------------------------------------------------
class TestAuth:
    def test_admin_login_returns_admin_role_and_cookies(self):
        r = requests.post(f"{BASE_URL}/api/auth/login",
                          json={"phone": ADMIN_PHONE, "password": ADMIN_PASSWORD}, timeout=15)
        assert r.status_code == 200
        data = r.json()
        assert data["user"]["role"] == "admin"
        assert "access_token" in data
        # cookies
        cookie_names = {c.name for c in r.cookies}
        assert "access_token" in cookie_names
        assert "refresh_token" in cookie_names

    def test_register_normalizes_local_phone_and_credits_welcome_bonus(self):
        local = "080" + "".join(random.choices(string.digits, k=8))
        r = requests.post(f"{BASE_URL}/api/auth/register",
                          json={"phone": local, "password": "pass1234", "name": "TEST_Norm"},
                          timeout=15)
        assert r.status_code == 200, r.text
        user = r.json()["user"]
        assert user["phone"].startswith("+23480")
        assert user["phone"] == "+234" + local[1:]
        assert user["bonus_balance"] == 500.0
        assert user["welcome_bonus_given"] is True
        # verify welcome_bonus transaction created
        token = r.json()["access_token"]
        tx = requests.get(f"{BASE_URL}/api/transactions", headers=_auth_headers(token), timeout=15).json()
        assert any(t["type"] == "welcome_bonus" and t["amount"] == 500.0 for t in tx)

    def test_register_with_referral_links_referred_by(self, user_a, user_b):
        assert user_b["user"]["referred_by"] == user_a["user"]["id"]

    def test_me_endpoint_returns_current_user(self, admin_headers):
        r = requests.get(f"{BASE_URL}/api/auth/me", headers=admin_headers, timeout=15)
        assert r.status_code == 200
        assert r.json()["role"] == "admin"

    def test_bearer_auth_accepted_when_cookie_missing(self, user_a):
        r = requests.get(f"{BASE_URL}/api/auth/me",
                         headers={"Authorization": f"Bearer {user_a['token']}"}, timeout=15)
        assert r.status_code == 200
        assert r.json()["phone"] == user_a["phone"]

    def test_login_bad_password(self):
        r = requests.post(f"{BASE_URL}/api/auth/login",
                          json={"phone": ADMIN_PHONE, "password": "wrong"}, timeout=15)
        assert r.status_code == 401


# ---------------------------------------------------------------------------
# Products
# ---------------------------------------------------------------------------
class TestProducts:
    def test_list_products_user(self, user_a):
        r = requests.get(f"{BASE_URL}/api/products",
                         headers=_auth_headers(user_a["token"]), timeout=15)
        assert r.status_code == 200
        products = r.json()
        assert len(products) >= 3
        assert all(p["active"] for p in products)

    def test_admin_can_crud_products(self, admin_headers):
        # CREATE
        payload = {"name": "TEST_Plan", "price": 1000.0, "daily_profit_pct": 3.0,
                   "duration_days": 10, "description": "test", "active": True}
        r = requests.post(f"{BASE_URL}/api/admin/products", json=payload,
                          headers=admin_headers, timeout=15)
        assert r.status_code == 200, r.text
        pid = r.json()["id"]
        assert r.json()["name"] == "TEST_Plan"

        # UPDATE
        payload["price"] = 1500.0
        r = requests.put(f"{BASE_URL}/api/admin/products/{pid}", json=payload,
                         headers=admin_headers, timeout=15)
        assert r.status_code == 200
        assert r.json()["price"] == 1500.0

        # DELETE
        r = requests.delete(f"{BASE_URL}/api/admin/products/{pid}",
                            headers=admin_headers, timeout=15)
        assert r.status_code == 200

    def test_non_admin_cannot_access_admin(self, user_a):
        r = requests.get(f"{BASE_URL}/api/admin/products",
                         headers=_auth_headers(user_a["token"]), timeout=15)
        # /admin/products has no GET; but admin stats does
        r = requests.get(f"{BASE_URL}/api/admin/stats",
                         headers=_auth_headers(user_a["token"]), timeout=15)
        assert r.status_code == 403


# ---------------------------------------------------------------------------
# Investment + referral commissions
# ---------------------------------------------------------------------------
class TestInvestmentFlow:
    def test_withdraw_blocked_before_invest(self, user_a):
        r = requests.post(f"{BASE_URL}/api/withdrawals",
                          json={"amount": 2000.0, "bank_name": "GTB",
                                "account_number": "0123456789", "account_name": "T"},
                          headers=_auth_headers(user_a["token"]), timeout=15)
        assert r.status_code == 400
        assert "invest" in r.json()["detail"].lower()

    def test_coupon_redeem_blocked_before_invest(self, user_a, admin_headers):
        code = "TESTC" + "".join(random.choices(string.ascii_uppercase, k=4))
        cr = requests.post(f"{BASE_URL}/api/admin/coupons",
                           json={"code": code, "amount": 100.0, "max_uses": 5, "active": True},
                           headers=admin_headers, timeout=15)
        assert cr.status_code == 200
        r = requests.post(f"{BASE_URL}/api/coupons/redeem", json={"code": code},
                          headers=_auth_headers(user_a["token"]), timeout=15)
        assert r.status_code == 400
        assert "invest" in r.json()["detail"].lower()

    def test_invest_insufficient_balance(self, user_a):
        products = requests.get(f"{BASE_URL}/api/products",
                                headers=_auth_headers(user_a["token"]), timeout=15).json()
        pid = products[0]["id"]
        r = requests.post(f"{BASE_URL}/api/invest", json={"product_id": pid},
                          headers=_auth_headers(user_a["token"]), timeout=15)
        assert r.status_code == 400

    def test_full_invest_flow_with_referral_and_admin_credit(self, admin_headers, user_a, user_b):
        # user_b fixture already invested via admin credit; verify has_invested + referral tx
        b_me = requests.get(f"{BASE_URL}/api/auth/me",
                            headers=_auth_headers(user_b["token"]), timeout=15).json()
        assert b_me["has_invested"] is True
        assert b_me["total_invested"] > 0

        # admin_credit tx exists on user_b
        tx_b = requests.get(f"{BASE_URL}/api/transactions",
                            headers=_auth_headers(user_b["token"]), timeout=15).json()
        assert any(t["type"] == "admin_credit" for t in tx_b)
        assert any(t["type"] == "investment" for t in tx_b)

        # user_a should have received gen1 20% commission for user_b's invest
        atx = requests.get(f"{BASE_URL}/api/transactions",
                           headers=_auth_headers(user_a["token"]), timeout=15).json()
        ref_txs = [t for t in atx if t["type"] == "referral"]
        assert ref_txs, "Expected at least one referral commission tx on user_a"
        expected = b_me["total_invested"] * 0.20
        assert any(abs(t["amount"] - expected) < 0.01 for t in ref_txs), \
            f"Expected gen1 commission ≈ {expected}, got {[t['amount'] for t in ref_txs]}"


# ---------------------------------------------------------------------------
# Deposits / Withdrawals admin flow
# ---------------------------------------------------------------------------
class TestDepositWithdrawalFlow:
    def test_deposit_pending_approve_and_reject(self, admin_headers, user_a):
        # Create pending deposit
        r = requests.post(f"{BASE_URL}/api/deposits",
                          json={"amount": 1000.0, "method": "Bank", "reference": "TEST_REF"},
                          headers=_auth_headers(user_a["token"]), timeout=15)
        assert r.status_code == 200, r.text
        did = r.json()["id"]
        assert r.json()["status"] == "pending"

        # user wallet before
        me_before = requests.get(f"{BASE_URL}/api/auth/me",
                                 headers=_auth_headers(user_a["token"]), timeout=15).json()
        # Approve
        ap = requests.post(f"{BASE_URL}/api/admin/deposits/{did}/approve",
                           json={"note": "ok"}, headers=admin_headers, timeout=15)
        assert ap.status_code == 200
        me_after = requests.get(f"{BASE_URL}/api/auth/me",
                                headers=_auth_headers(user_a["token"]), timeout=15).json()
        assert abs(me_after["wallet_balance"] - me_before["wallet_balance"] - 1000.0) < 0.01

        # Reject flow
        r2 = requests.post(f"{BASE_URL}/api/deposits",
                           json={"amount": 800.0, "method": "Bank"},
                           headers=_auth_headers(user_a["token"]), timeout=15)
        did2 = r2.json()["id"]
        me_pre = requests.get(f"{BASE_URL}/api/auth/me",
                              headers=_auth_headers(user_a["token"]), timeout=15).json()
        rj = requests.post(f"{BASE_URL}/api/admin/deposits/{did2}/reject",
                           json={"note": "no"}, headers=admin_headers, timeout=15)
        assert rj.status_code == 200
        me_post = requests.get(f"{BASE_URL}/api/auth/me",
                               headers=_auth_headers(user_a["token"]), timeout=15).json()
        assert me_pre["wallet_balance"] == me_post["wallet_balance"]

    def test_withdrawal_hold_and_reject_refund(self, admin_headers, user_b):
        # user_b already invested and has some balance (referral only might be small);
        # add balance to guarantee
        requests.post(f"{BASE_URL}/api/admin/users/{user_b['user']['id']}/add-balance",
                      json={"amount": 5000.0}, headers=admin_headers, timeout=15)
        me_before = requests.get(f"{BASE_URL}/api/auth/me",
                                 headers=_auth_headers(user_b["token"]), timeout=15).json()
        # Withdraw request
        r = requests.post(f"{BASE_URL}/api/withdrawals",
                          json={"amount": 2000.0, "bank_name": "GTB",
                                "account_number": "0123456789", "account_name": "T"},
                          headers=_auth_headers(user_b["token"]), timeout=15)
        assert r.status_code == 200, r.text
        wid = r.json()["id"]
        me_held = requests.get(f"{BASE_URL}/api/auth/me",
                               headers=_auth_headers(user_b["token"]), timeout=15).json()
        assert abs(me_before["wallet_balance"] - me_held["wallet_balance"] - 2000.0) < 0.01

        # Reject -> refund
        rj = requests.post(f"{BASE_URL}/api/admin/withdrawals/{wid}/reject",
                           json={"note": "no"}, headers=admin_headers, timeout=15)
        assert rj.status_code == 200
        me_refunded = requests.get(f"{BASE_URL}/api/auth/me",
                                   headers=_auth_headers(user_b["token"]), timeout=15).json()
        assert abs(me_refunded["wallet_balance"] - me_before["wallet_balance"]) < 0.01
        # refund tx exists
        tx = requests.get(f"{BASE_URL}/api/transactions",
                          headers=_auth_headers(user_b["token"]), timeout=15).json()
        assert any(t["type"] == "withdrawal_refund" for t in tx)

    def test_withdrawal_approve_flow(self, admin_headers, user_b):
        requests.post(f"{BASE_URL}/api/admin/users/{user_b['user']['id']}/add-balance",
                      json={"amount": 5000.0}, headers=admin_headers, timeout=15)
        r = requests.post(f"{BASE_URL}/api/withdrawals",
                          json={"amount": 1500.0, "bank_name": "GTB",
                                "account_number": "0123456789", "account_name": "T"},
                          headers=_auth_headers(user_b["token"]), timeout=15)
        wid = r.json()["id"]
        ap = requests.post(f"{BASE_URL}/api/admin/withdrawals/{wid}/approve",
                           json={"note": "paid"}, headers=admin_headers, timeout=15)
        assert ap.status_code == 200


# ---------------------------------------------------------------------------
# Coupons
# ---------------------------------------------------------------------------
class TestCoupons:
    def test_coupon_lifecycle(self, admin_headers, user_b):
        code = "COUP" + "".join(random.choices(string.ascii_uppercase, k=6))
        cr = requests.post(f"{BASE_URL}/api/admin/coupons",
                           json={"code": code, "amount": 250.0, "max_uses": 5, "active": True},
                           headers=admin_headers, timeout=15)
        assert cr.status_code == 200
        # user_b already invested
        me_before = requests.get(f"{BASE_URL}/api/auth/me",
                                 headers=_auth_headers(user_b["token"]), timeout=15).json()
        r = requests.post(f"{BASE_URL}/api/coupons/redeem", json={"code": code},
                          headers=_auth_headers(user_b["token"]), timeout=15)
        assert r.status_code == 200
        assert r.json()["amount"] == 250.0
        me_after = requests.get(f"{BASE_URL}/api/auth/me",
                                headers=_auth_headers(user_b["token"]), timeout=15).json()
        assert abs(me_after["wallet_balance"] - me_before["wallet_balance"] - 250.0) < 0.01
        # Second redeem rejected
        r2 = requests.post(f"{BASE_URL}/api/coupons/redeem", json={"code": code},
                           headers=_auth_headers(user_b["token"]), timeout=15)
        assert r2.status_code == 400
        # usage counter
        clist = requests.get(f"{BASE_URL}/api/admin/coupons", headers=admin_headers, timeout=15).json()
        me_coupon = next(c for c in clist if c["code"] == code)
        assert me_coupon["used_count"] == 1


# ---------------------------------------------------------------------------
# Payment accounts
# ---------------------------------------------------------------------------
class TestPaymentAccounts:
    def test_crud_and_user_visibility(self, admin_headers, user_a):
        # Create active
        r1 = requests.post(f"{BASE_URL}/api/admin/payment-accounts",
                           json={"bank_name": "TEST_Bank", "account_name": "N",
                                 "account_number": "9999999999", "active": True},
                           headers=admin_headers, timeout=15)
        assert r1.status_code == 200
        aid1 = r1.json()["id"]
        # Create inactive
        r2 = requests.post(f"{BASE_URL}/api/admin/payment-accounts",
                           json={"bank_name": "TEST_BankInactive", "account_name": "N",
                                 "account_number": "8888888888", "active": False},
                           headers=admin_headers, timeout=15)
        aid2 = r2.json()["id"]
        # User sees only active
        u = requests.get(f"{BASE_URL}/api/payment-accounts",
                         headers=_auth_headers(user_a["token"]), timeout=15).json()
        assert all(a["active"] for a in u)
        assert any(a["id"] == aid1 for a in u)
        assert not any(a["id"] == aid2 for a in u)
        # Update
        up = requests.put(f"{BASE_URL}/api/admin/payment-accounts/{aid1}",
                          json={"bank_name": "TEST_BankUpd", "account_name": "N",
                                "account_number": "9999999999", "active": True},
                          headers=admin_headers, timeout=15)
        assert up.status_code == 200 and up.json()["bank_name"] == "TEST_BankUpd"
        # Delete
        for aid in (aid1, aid2):
            d = requests.delete(f"{BASE_URL}/api/admin/payment-accounts/{aid}",
                                headers=admin_headers, timeout=15)
            assert d.status_code == 200


# ---------------------------------------------------------------------------
# Settings & referrals & stats
# ---------------------------------------------------------------------------
class TestSettingsReferralsStats:
    def test_admin_settings_update(self, admin_headers):
        r = requests.put(f"{BASE_URL}/api/admin/settings",
                         json={"welcome_bonus": 500.0, "min_deposit": 500.0,
                               "referral_gen1_pct": 20.0, "referral_gen2_pct": 5.0,
                               "referral_gen3_pct": 2.0, "site_name": "NaijaInvest"},
                         headers=admin_headers, timeout=15)
        assert r.status_code == 200
        s = r.json()
        assert s["referral_gen1_pct"] == 20.0
        assert s["welcome_bonus"] == 500.0

    def test_referrals_endpoint_shape(self, user_a, user_b):
        r = requests.get(f"{BASE_URL}/api/referrals",
                         headers=_auth_headers(user_a["token"]), timeout=15)
        assert r.status_code == 200
        d = r.json()
        assert d["gen1_pct"] == 20.0
        assert any(u["id"] == user_b["user"]["id"] for u in d["gen1"])
        # user_b invested in earlier test, so referral earnings gen1 > 0
        assert d["earnings"]["gen1"] > 0
        assert d["referral_code"] == user_a["user"]["referral_code"]

    def test_admin_stats(self, admin_headers):
        r = requests.get(f"{BASE_URL}/api/admin/stats", headers=admin_headers, timeout=15)
        assert r.status_code == 200
        s = r.json()
        for k in ("total_users", "invested_users", "pending_deposits",
                  "pending_withdrawals", "total_deposited", "total_withdrawn",
                  "total_invested", "total_profit_paid"):
            assert k in s
        assert s["total_users"] >= 2
        assert s["invested_users"] >= 1
        assert s["total_invested"] > 0


# ---------------------------------------------------------------------------
# PayNow bank list (iteration 2)
# ---------------------------------------------------------------------------
REQUIRED_BANKS = [
    "ACCESS BANK PLC", "GUARANTY TRUST BANK PLC", "FIDELITY BANK PLC",
    "STANBIC IBTC BANK PLC", "Kuda Microfinance Bank", "OPay", "PalmPay",
    "UNION BANK OF NIGERIA PLC", "ECOBANK NIGERIA PLC", "POLARIS BANK",
    "WEMA BANK PLC", "STERLING BANK PLC", "UBA", "Providus Bank",
    "KEYSTONE BANK PLC", "JAIZ BANK", "TITAN TRUST BANK", "Citibank Nigeria",
    "STANDARD CHARTERED BANK PLC",
]


class TestPaynowBanks:
    def test_user_paynow_banks_returns_full_list(self, user_a):
        r = requests.get(f"{BASE_URL}/api/paynow/banks",
                         headers=_auth_headers(user_a["token"]), timeout=30)
        assert r.status_code == 200
        d = r.json()
        assert d.get("enabled") is True
        assert d.get("code") == 0
        data = d.get("data") or []
        assert len(data) > 100, f"expected >100 banks got {len(data)}"
        names_lower = " | ".join((b.get("bankName") or "").lower() for b in data)
        missing = [b for b in REQUIRED_BANKS if b.lower() not in names_lower]
        assert not missing, f"Missing banks: {missing}"

    def test_admin_paynow_banks_matches(self, admin_headers):
        # Retry once - PayNow upstream occasionally returns empty on
        # burst requests when the same list is fetched from another worker.
        import time
        data = []
        for _ in range(3):
            r = requests.get(f"{BASE_URL}/api/admin/paynow/banks",
                             headers=admin_headers, timeout=30)
            assert r.status_code == 200
            data = r.json().get("data") or []
            if len(data) > 100:
                break
            time.sleep(1.0)
        assert len(data) > 100, f"got {len(data)} banks"


# ---------------------------------------------------------------------------
# Iteration 3 - Admin email login & PayNow verify/reconcile endpoints
# ---------------------------------------------------------------------------
class TestAdminEmailLogin:
    def test_login_with_email_admin(self):
        r = requests.post(f"{BASE_URL}/api/auth/login",
                          json={"email": ADMIN_EMAIL, "password": ADMIN_PASSWORD}, timeout=15)
        assert r.status_code == 200, r.text
        data = r.json()
        assert data["user"]["role"] == "admin"
        assert data["user"].get("email") == ADMIN_EMAIL.lower()
        assert data["user"].get("phone") == ADMIN_PHONE
        assert "access_token" in data

    def test_login_email_case_insensitive(self):
        r = requests.post(f"{BASE_URL}/api/auth/login",
                          json={"email": ADMIN_EMAIL.upper(), "password": ADMIN_PASSWORD}, timeout=15)
        assert r.status_code == 200
        assert r.json()["user"]["role"] == "admin"

    def test_login_phone_still_works_same_user(self):
        r = requests.post(f"{BASE_URL}/api/auth/login",
                          json={"phone": ADMIN_PHONE, "password": ADMIN_PASSWORD}, timeout=15)
        assert r.status_code == 200
        assert r.json()["user"]["role"] == "admin"
        assert r.json()["user"].get("email") == ADMIN_EMAIL.lower()

    def test_login_wrong_password_401(self):
        r = requests.post(f"{BASE_URL}/api/auth/login",
                          json={"email": ADMIN_EMAIL, "password": "wrongwrong"}, timeout=15)
        assert r.status_code == 401
        assert "invalid" in r.json().get("detail", "").lower()

    def test_login_missing_identifier_400(self):
        r = requests.post(f"{BASE_URL}/api/auth/login",
                          json={"password": "x"}, timeout=15)
        assert r.status_code in (400, 422)

    def test_me_after_email_login_returns_admin(self):
        r = requests.post(f"{BASE_URL}/api/auth/login",
                          json={"email": ADMIN_EMAIL, "password": ADMIN_PASSWORD}, timeout=15)
        token = r.json()["access_token"]
        me = requests.get(f"{BASE_URL}/api/auth/me", headers=_auth_headers(token), timeout=15)
        assert me.status_code == 200
        assert me.json()["role"] == "admin"


class TestPaynowVerifyReconcile:
    def _insert_fake_pending_paynow_deposit(self, user_id: str, merchant_order_no: str, amount: float = 500.0):
        """Insert a fake pending paynow deposit directly via a helper - use admin add-balance? 
        No direct DB insert; instead use the create deposit endpoint with paynow method.
        Since paynow.enabled() is True, POST /deposits with method='paynow' will call
        the real gateway. We instead reach into mongo using motor? tests are sync.
        Fallback: use pymongo directly."""
        from pymongo import MongoClient
        mongo_url = None
        db_name = None
        for line in Path("/app/backend/.env").read_text().splitlines():
            if line.startswith("MONGO_URL"):
                mongo_url = line.split("=", 1)[1].strip().strip('"')
            if line.startswith("DB_NAME"):
                db_name = line.split("=", 1)[1].strip().strip('"')
        client = MongoClient(mongo_url)
        db = client[db_name]
        from bson import ObjectId
        doc = {
            "user_id": ObjectId(user_id),
            "amount": amount,
            "method": "paynow",
            "gateway": "paynow",
            "merchant_order_no": merchant_order_no,
            "status": "pending",
            "created_at": "2026-01-15T00:00:00+00:00",
        }
        res = db.deposits.insert_one(doc)
        return str(res.inserted_id)

    def test_verify_non_paynow_returns_400(self, admin_headers, user_a):
        # create a manual (non-paynow) pending deposit
        r = requests.post(f"{BASE_URL}/api/deposits",
                          json={"amount": 1000.0, "method": "Bank"},
                          headers=_auth_headers(user_a["token"]), timeout=15)
        did = r.json()["id"]
        v = requests.post(f"{BASE_URL}/api/admin/deposits/{did}/verify",
                          headers=admin_headers, timeout=30)
        assert v.status_code == 400
        assert "paynow" in v.json()["detail"].lower()

    def test_verify_already_processed_returns_400(self, admin_headers, user_a):
        # Use fake paynow deposit, approve, then verify → 400
        fake_did = self._insert_fake_pending_paynow_deposit(user_a["user"]["id"],
                                                            "TESTORDER_NOPE_1", 500.0)
        # Approve directly via admin approve to force status change
        ap = requests.post(f"{BASE_URL}/api/admin/deposits/{fake_did}/approve",
                           json={"note": "manual"}, headers=admin_headers, timeout=15)
        assert ap.status_code == 200
        v = requests.post(f"{BASE_URL}/api/admin/deposits/{fake_did}/verify",
                          headers=admin_headers, timeout=30)
        assert v.status_code == 400

    def test_verify_paynow_pending_returns_502_or_ok_false(self, admin_headers, user_a):
        # Insert fake pending paynow deposit with bogus merchant order number
        fake_did = self._insert_fake_pending_paynow_deposit(user_a["user"]["id"],
                                                            "TESTORDER_BOGUS_XYZ", 500.0)
        v = requests.post(f"{BASE_URL}/api/admin/deposits/{fake_did}/verify",
                          headers=admin_headers, timeout=45)
        # PayNow will either error (502), return not-found (404), or ok=false with non-2 status
        assert v.status_code in (200, 404, 502), f"unexpected {v.status_code}: {v.text}"
        if v.status_code == 200:
            body = v.json()
            assert body.get("ok") is False
            assert body.get("paynow_status") != 2

    def test_verify_nonexistent_deposit_404(self, admin_headers):
        v = requests.post(f"{BASE_URL}/api/admin/deposits/507f1f77bcf86cd799439011/verify",
                          headers=admin_headers, timeout=15)
        assert v.status_code == 404

    def test_verify_requires_admin(self, user_a):
        v = requests.post(f"{BASE_URL}/api/admin/deposits/507f1f77bcf86cd799439011/verify",
                          headers=_auth_headers(user_a["token"]), timeout=15)
        assert v.status_code == 403

    def test_reconcile_endpoint_admin_only(self, admin_headers):
        r = requests.post(f"{BASE_URL}/api/admin/paynow/reconcile",
                          headers=admin_headers, timeout=60)
        assert r.status_code == 200, r.text
        data = r.json()
        assert data.get("ok") is True
        assert "deposits_credited" in data
        assert "withdrawals_settled" in data
        assert isinstance(data["deposits_credited"], int)
        assert isinstance(data["withdrawals_settled"], int)

    def test_reconcile_requires_admin(self, user_a):
        r = requests.post(f"{BASE_URL}/api/admin/paynow/reconcile",
                          headers=_auth_headers(user_a["token"]), timeout=15)
        assert r.status_code == 403
