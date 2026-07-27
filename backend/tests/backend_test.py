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

    def test_invest_insufficient_balance(self):
        # Create a brand new user without referral earnings to guarantee insufficient balance
        phone = _rand_phone()
        rr = requests.post(f"{BASE_URL}/api/auth/register",
                           json={"phone": phone, "password": "pass1234", "name": "TEST_Insuf"},
                           timeout=15)
        assert rr.status_code == 200
        tok = rr.json()["access_token"]
        products = requests.get(f"{BASE_URL}/api/products",
                                headers=_auth_headers(tok), timeout=15).json()
        # Pick the most expensive product to guarantee insufficient balance
        pid = max(products, key=lambda p: p["price"])["id"]
        r = requests.post(f"{BASE_URL}/api/invest", json={"product_id": pid},
                          headers=_auth_headers(tok), timeout=15)
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
    def test_user_paynow_banks_returns_curated_list(self, user_a):
        # Default now returns curated list (~30 items) with brand metadata
        r = requests.get(f"{BASE_URL}/api/paynow/banks",
                         headers=_auth_headers(user_a["token"]), timeout=30)
        assert r.status_code == 200
        d = r.json()
        assert d.get("enabled") is True
        data = d.get("data") or []
        assert 5 <= len(data) <= 60, f"expected curated list, got {len(data)}"
        # total = full underlying count
        assert d.get("total", 0) > 100, f"total should reflect full list, got {d.get('total')}"
        # brand structure
        for b in data:
            assert "bankCode" in b and "bankName" in b
            assert "brand" in b, f"bank missing brand: {b}"
            assert "initials" in b["brand"] and "bg" in b["brand"] and "fg" in b["brand"]
        names = " | ".join((b.get("bankName") or "").upper() for b in data)
        popular = ["ACCESS", "GUARANTY TRUST", "FIRST BANK", "UNITED BANK FOR AFRICA",
                   "FIDELITY", "UNION BANK", "ECOBANK", "STANBIC IBTC", "STERLING",
                   "WEMA", "POLARIS", "FIRST CITY MONUMENT", "KEYSTONE", "JAIZ",
                   "TITAN TRUST", "PROVIDUS", "STANDARD CHARTERED", "KUDA", "OPAY",
                   "PALMPAY", "MONIEPOINT"]
        missing = [p for p in popular if p not in names]
        assert not missing, f"Missing popular banks: {missing}"

    def test_user_paynow_banks_all_true_returns_full_list(self, user_a):
        import time
        data = []
        for _ in range(3):
            r = requests.get(f"{BASE_URL}/api/paynow/banks?all=true",
                             headers=_auth_headers(user_a["token"]), timeout=30)
            assert r.status_code == 200
            d = r.json()
            data = d.get("data") or []
            if len(data) > 100:
                break
            time.sleep(1.0)
        assert len(data) > 100, f"expected full list > 100, got {len(data)}"
        # required from prev iteration
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


# ---------------------------------------------------------------------------
# Iteration 4 - PayNow verify-account endpoint
# ---------------------------------------------------------------------------
class TestPaynowVerifyAccount:
    def test_verify_account_happy_path(self, user_a):
        # Pick a bankCode from paynow banks list
        rb = requests.get(f"{BASE_URL}/api/paynow/banks",
                          headers=_auth_headers(user_a["token"]), timeout=30)
        assert rb.status_code == 200
        data = rb.json().get("data") or []
        assert data
        code = data[0]["bankCode"]
        r = requests.post(f"{BASE_URL}/api/paynow/verify-account",
                          json={"bank_code": code, "account_number": "0123456789"},
                          headers=_auth_headers(user_a["token"]), timeout=30)
        assert r.status_code == 200, r.text
        body = r.json()
        assert "ok" in body
        assert "exists" in body
        assert "raw" in body
        assert isinstance(body["ok"], bool)
        assert isinstance(body["exists"], bool)
        assert isinstance(body["raw"], dict)

    def test_verify_account_missing_fields_422(self, user_a):
        r = requests.post(f"{BASE_URL}/api/paynow/verify-account",
                          json={"bank_code": "058"},
                          headers=_auth_headers(user_a["token"]), timeout=15)
        assert r.status_code == 422

    def test_verify_account_requires_auth(self):
        r = requests.post(f"{BASE_URL}/api/paynow/verify-account",
                          json={"bank_code": "058", "account_number": "0123456789"},
                          timeout=15)
        assert r.status_code == 401


# ---------------------------------------------------------------------------
# Iteration 5 - /me/bank-account CRUD + withdrawal-with-bound-account
# ---------------------------------------------------------------------------
class TestMyBankAccount:
    def _fresh_user(self) -> dict:
        phone = _rand_phone()
        r = requests.post(f"{BASE_URL}/api/auth/register",
                          json={"phone": phone, "password": "pass1234", "name": "TEST_Bind"},
                          timeout=15)
        assert r.status_code == 200
        d = r.json()
        return {"phone": phone, "token": d["access_token"], "user": d["user"]}

    def test_get_bank_account_null_when_none(self):
        u = self._fresh_user()
        # Ensure clean slate
        requests.delete(f"{BASE_URL}/api/me/bank-account",
                        headers=_auth_headers(u["token"]), timeout=15)
        r = requests.get(f"{BASE_URL}/api/me/bank-account",
                         headers=_auth_headers(u["token"]), timeout=15)
        assert r.status_code == 200
        assert r.json() is None

    def test_post_bank_account_short_number_400(self):
        u = self._fresh_user()
        r = requests.post(f"{BASE_URL}/api/me/bank-account",
                          json={"bank_code": "NG0009", "bank_name": "ACCESS BANK PLC",
                                "account_number": "12345", "account_name": "T"},
                          headers=_auth_headers(u["token"]), timeout=15)
        assert r.status_code == 400
        assert "9-12" in r.json()["detail"]

    def test_post_bank_account_long_number_400(self):
        u = self._fresh_user()
        r = requests.post(f"{BASE_URL}/api/me/bank-account",
                          json={"bank_code": "NG0009", "bank_name": "ACCESS BANK PLC",
                                "account_number": "1234567890123", "account_name": "T"},
                          headers=_auth_headers(u["token"]), timeout=15)
        assert r.status_code == 400

    def test_post_bank_account_empty_name_400(self):
        u = self._fresh_user()
        r = requests.post(f"{BASE_URL}/api/me/bank-account",
                          json={"bank_code": "NG0009", "bank_name": "ACCESS BANK PLC",
                                "account_number": "0123456789", "account_name": "   "},
                          headers=_auth_headers(u["token"]), timeout=15)
        assert r.status_code == 400

    def test_post_bank_account_empty_bank_400(self):
        u = self._fresh_user()
        r = requests.post(f"{BASE_URL}/api/me/bank-account",
                          json={"bank_code": "NG0009", "bank_name": "  ",
                                "account_number": "0123456789", "account_name": "T"},
                          headers=_auth_headers(u["token"]), timeout=15)
        assert r.status_code == 400

    def test_post_and_get_bank_account_roundtrip(self):
        u = self._fresh_user()
        brand = {"initials": "AB", "bg": "#111", "fg": "#fff"}
        payload = {"bank_code": "NG0009", "bank_name": "ACCESS BANK PLC",
                   "account_number": "0123456789", "account_name": "Test User",
                   "brand": brand}
        r = requests.post(f"{BASE_URL}/api/me/bank-account", json=payload,
                          headers=_auth_headers(u["token"]), timeout=15)
        assert r.status_code == 200, r.text
        saved = r.json()
        assert saved["bank_code"] == "NG0009"
        assert saved["bank_name"] == "ACCESS BANK PLC"
        assert saved["account_number"] == "0123456789"
        assert saved["account_name"] == "Test User"
        assert saved["brand"] == brand

        g = requests.get(f"{BASE_URL}/api/me/bank-account",
                         headers=_auth_headers(u["token"]), timeout=15)
        assert g.status_code == 200
        data = g.json()
        assert data["bank_code"] == "NG0009"
        assert data["bank_name"] == "ACCESS BANK PLC"
        assert data["account_number"] == "0123456789"
        assert data["account_name"] == "Test User"
        assert data["brand"] == brand

    def test_delete_bank_account_then_get_null(self):
        u = self._fresh_user()
        requests.post(f"{BASE_URL}/api/me/bank-account",
                      json={"bank_code": "NG0009", "bank_name": "ACCESS BANK PLC",
                            "account_number": "0123456789", "account_name": "T"},
                      headers=_auth_headers(u["token"]), timeout=15)
        d = requests.delete(f"{BASE_URL}/api/me/bank-account",
                            headers=_auth_headers(u["token"]), timeout=15)
        assert d.status_code == 200
        assert d.json().get("ok") is True
        g = requests.get(f"{BASE_URL}/api/me/bank-account",
                         headers=_auth_headers(u["token"]), timeout=15)
        assert g.status_code == 200
        assert g.json() is None


class TestWithdrawalWithBoundAccount:
    def test_withdraw_amount_only_uses_bound_account(self, admin_headers, user_b):
        # Bind an account for user_b
        payload = {"bank_code": "NG0009", "bank_name": "ACCESS BANK PLC",
                   "account_number": "0123456789", "account_name": "Bound User",
                   "brand": {"initials": "AB", "bg": "#111", "fg": "#fff"}}
        rb = requests.post(f"{BASE_URL}/api/me/bank-account", json=payload,
                           headers=_auth_headers(user_b["token"]), timeout=15)
        assert rb.status_code == 200
        # Ensure balance
        requests.post(f"{BASE_URL}/api/admin/users/{user_b['user']['id']}/add-balance",
                      json={"amount": 5000.0}, headers=admin_headers, timeout=15)
        # Amount-only withdrawal
        r = requests.post(f"{BASE_URL}/api/withdrawals", json={"amount": 1200.0},
                          headers=_auth_headers(user_b["token"]), timeout=15)
        assert r.status_code == 200, r.text
        d = r.json()
        assert d["bank_name"] == "ACCESS BANK PLC"
        assert d["account_number"] == "0123456789"
        assert d["account_name"] == "Bound User"
        assert d["bank_code"] == "NG0009"
        assert d["status"] == "pending"

    def test_withdraw_amount_only_no_bound_returns_400(self, admin_headers):
        # Fresh user, invest, then attempt amount-only withdraw without bound account
        phone = _rand_phone()
        rr = requests.post(f"{BASE_URL}/api/auth/register",
                           json={"phone": phone, "password": "pass1234", "name": "TEST_NoBind"},
                           timeout=15)
        tok = rr.json()["access_token"]
        uid = rr.json()["user"]["id"]
        prods = requests.get(f"{BASE_URL}/api/products",
                             headers=_auth_headers(tok), timeout=15).json()
        cheapest = min(prods, key=lambda p: p["price"])
        requests.post(f"{BASE_URL}/api/admin/users/{uid}/add-balance",
                      json={"amount": cheapest["price"] + 5000.0}, headers=admin_headers, timeout=15)
        inv = requests.post(f"{BASE_URL}/api/invest", json={"product_id": cheapest["id"]},
                            headers=_auth_headers(tok), timeout=15)
        assert inv.status_code == 200
        # Ensure no bound account
        requests.delete(f"{BASE_URL}/api/me/bank-account",
                        headers=_auth_headers(tok), timeout=15)
        r = requests.post(f"{BASE_URL}/api/withdrawals", json={"amount": 1500.0},
                          headers=_auth_headers(tok), timeout=15)
        assert r.status_code == 400
        assert "bind" in r.json()["detail"].lower()

    def test_withdraw_explicit_bank_still_works(self, admin_headers, user_b):
        # Backwards compatible - explicit payload overrides bound account
        requests.post(f"{BASE_URL}/api/admin/users/{user_b['user']['id']}/add-balance",
                      json={"amount": 5000.0}, headers=admin_headers, timeout=15)
        r = requests.post(f"{BASE_URL}/api/withdrawals",
                          json={"amount": 1300.0, "bank_name": "GTB",
                                "account_number": "1112223334", "account_name": "Explicit"},
                          headers=_auth_headers(user_b["token"]), timeout=15)
        assert r.status_code == 200, r.text
        d = r.json()
        assert d["bank_name"] == "GTB"
        assert d["account_number"] == "1112223334"
        assert d["account_name"] == "Explicit"


# ---------------------------------------------------------------------------
# Iteration 6 - Admin get user regression, debit/overdraft, deposit enrichment
# ---------------------------------------------------------------------------
class TestAdminGetUserRegression:
    """Ensures /api/admin/users/{uid} does not leak ObjectId and works for invested users."""

    def _has_objectid_string(self, obj) -> bool:
        """Recursively check if any value looks like a raw ObjectId('...') string."""
        if isinstance(obj, str):
            return "ObjectId(" in obj
        if isinstance(obj, dict):
            return any(self._has_objectid_string(v) for v in obj.values())
        if isinstance(obj, list):
            return any(self._has_objectid_string(v) for v in obj)
        return False

    def test_admin_get_invested_user_returns_200_and_no_objectid_leak(self, admin_headers, user_b):
        # user_b fixture is guaranteed to be invested
        uid = user_b["user"]["id"]
        r = requests.get(f"{BASE_URL}/api/admin/users/{uid}",
                         headers=admin_headers, timeout=15)
        assert r.status_code == 200, r.text
        data = r.json()
        assert "user" in data
        assert "transactions" in data
        assert "investments" in data
        assert data["user"]["id"] == uid
        # invested user should have >=1 investment
        assert len(data["investments"]) >= 1
        inv = data["investments"][0]
        # FK fields must be stringified, not raw ObjectId
        assert isinstance(inv["user_id"], str)
        assert isinstance(inv["product_id"], str)
        assert "ObjectId" not in inv["user_id"]
        assert "ObjectId" not in inv["product_id"]
        # No _id leak anywhere
        assert "_id" not in inv
        for t in data["transactions"]:
            assert "_id" not in t
        assert "_id" not in data["user"]
        # Deep scan for raw ObjectId(...) strings in serialized output
        assert not self._has_objectid_string(data), "Raw ObjectId string leaked into response"

    def test_admin_get_nonexistent_user_returns_404(self, admin_headers):
        r = requests.get(f"{BASE_URL}/api/admin/users/507f1f77bcf86cd799439011",
                         headers=admin_headers, timeout=15)
        assert r.status_code == 404


class TestAdminAddBalanceDebit:
    """Negative amount now debits, with overdraft guard."""

    def test_positive_amount_credits_admin_credit_tx(self, admin_headers, user_a):
        uid = user_a["user"]["id"]
        before = requests.get(f"{BASE_URL}/api/auth/me",
                              headers=_auth_headers(user_a["token"]), timeout=15).json()
        r = requests.post(f"{BASE_URL}/api/admin/users/{uid}/add-balance",
                          json={"amount": 250.0, "note": "TEST_credit"},
                          headers=admin_headers, timeout=15)
        assert r.status_code == 200, r.text
        assert r.json()["user"]["wallet_balance"] - before["wallet_balance"] == pytest.approx(250.0, abs=0.01)
        tx = requests.get(f"{BASE_URL}/api/transactions",
                          headers=_auth_headers(user_a["token"]), timeout=15).json()
        assert any(t["type"] == "admin_credit" and t["amount"] == 250.0 for t in tx)

    def test_negative_amount_debits_admin_debit_tx(self, admin_headers, user_b):
        uid = user_b["user"]["id"]
        # Ensure some balance
        requests.post(f"{BASE_URL}/api/admin/users/{uid}/add-balance",
                      json={"amount": 1000.0}, headers=admin_headers, timeout=15)
        before = requests.get(f"{BASE_URL}/api/auth/me",
                              headers=_auth_headers(user_b["token"]), timeout=15).json()
        r = requests.post(f"{BASE_URL}/api/admin/users/{uid}/add-balance",
                          json={"amount": -100.0, "note": "TEST_debit"},
                          headers=admin_headers, timeout=15)
        assert r.status_code == 200, r.text
        after_bal = r.json()["user"]["wallet_balance"]
        assert before["wallet_balance"] - after_bal == pytest.approx(100.0, abs=0.01)
        tx = requests.get(f"{BASE_URL}/api/transactions",
                          headers=_auth_headers(user_b["token"]), timeout=15).json()
        assert any(t["type"] == "admin_debit" and t["amount"] == -100.0 for t in tx)

    def test_overdraft_debit_returns_400(self, admin_headers, user_a):
        uid = user_a["user"]["id"]
        me = requests.get(f"{BASE_URL}/api/auth/me",
                          headers=_auth_headers(user_a["token"]), timeout=15).json()
        wallet = me["wallet_balance"]
        # Try to debit way more than wallet
        r = requests.post(f"{BASE_URL}/api/admin/users/{uid}/add-balance",
                          json={"amount": -(wallet + 999999.0), "note": "TEST_overdraft"},
                          headers=admin_headers, timeout=15)
        assert r.status_code == 400
        assert "cannot debit" in r.json()["detail"].lower()
        # Balance unchanged
        me2 = requests.get(f"{BASE_URL}/api/auth/me",
                           headers=_auth_headers(user_a["token"]), timeout=15).json()
        assert me2["wallet_balance"] == wallet

    def test_zero_amount_rejected(self, admin_headers, user_a):
        r = requests.post(f"{BASE_URL}/api/admin/users/{user_a['user']['id']}/add-balance",
                          json={"amount": 0}, headers=admin_headers, timeout=15)
        assert r.status_code == 400


class TestDepositEnrichment:
    """POST /api/deposits with method = payment_account id should embed bank fields."""

    def test_deposit_with_payment_account_enriches_bank_fields(self, admin_headers, user_a):
        # Create a payment account
        r1 = requests.post(f"{BASE_URL}/api/admin/payment-accounts",
                           json={"bank_name": "TEST_EnrichBank", "account_name": "Enrich Acc",
                                 "account_number": "5555555555", "active": True},
                           headers=admin_headers, timeout=15)
        assert r1.status_code == 200
        aid = r1.json()["id"]
        try:
            # User creates deposit with method = payment account id
            r = requests.post(f"{BASE_URL}/api/deposits",
                              json={"amount": 1500.0, "method": aid, "reference": "TEST_ENRICH"},
                              headers=_auth_headers(user_a["token"]), timeout=15)
            assert r.status_code == 200, r.text
            dep = r.json()
            did = dep["id"]
            # Response should include enriched fields (from admin GET at least)
            adm = requests.get(f"{BASE_URL}/api/admin/deposits",
                               headers=admin_headers, timeout=15).json()
            match = next((d for d in adm if d["id"] == did), None)
            assert match is not None
            assert match.get("payment_account_id") == aid
            assert match.get("payment_account_bank") == "TEST_EnrichBank"
            assert match.get("payment_account_number") == "5555555555"
            assert match.get("payment_account_name") == "Enrich Acc"
            assert match.get("gateway") == "manual"
            assert match.get("status") == "pending"
        finally:
            requests.delete(f"{BASE_URL}/api/admin/payment-accounts/{aid}",
                            headers=admin_headers, timeout=15)

    def test_deposit_with_non_paynow_free_text_method_no_enrichment(self, admin_headers, user_a):
        # method = "Bank" (a plain string, not a valid ObjectId) should NOT set enrichment
        r = requests.post(f"{BASE_URL}/api/deposits",
                          json={"amount": 1200.0, "method": "Bank", "reference": "TEST_PLAIN"},
                          headers=_auth_headers(user_a["token"]), timeout=15)
        assert r.status_code == 200
        did = r.json()["id"]
        adm = requests.get(f"{BASE_URL}/api/admin/deposits",
                           headers=admin_headers, timeout=15).json()
        match = next((d for d in adm if d["id"] == did), None)
        assert match is not None
        assert "payment_account_bank" not in match or match.get("payment_account_bank") is None
        assert match.get("gateway") == "manual"

    def test_deposit_paynow_method_does_not_enrich_payment_account_fields(self, admin_headers, user_a):
        """method starting with 'paynow' should route through PayNow (not manual enrichment).
        We can't easily assert PayNow success in tests, but even on gateway failure the
        doc must never contain payment_account_bank/number/name.
        """
        # Directly inspect DB: create a paynow deposit; if PayNow disabled or fails, the doc
        # still exists in some state and must not have payment_account_* fields.
        r = requests.post(f"{BASE_URL}/api/deposits",
                          json={"amount": 800.0, "method": "paynow-auto"},
                          headers=_auth_headers(user_a["token"]), timeout=45)
        # Either PayNow is enabled and succeeded (200) or gateway is disabled/errored (502/400).
        # In any case, no manual deposit doc with enrichment should be produced.
        if r.status_code == 200:
            dep = r.json()
            # Gateway should be paynow
            assert dep.get("gateway") == "paynow"
            assert "checkout_url" in dep
            assert "payment_account_bank" not in dep or dep.get("payment_account_bank") is None
            assert "payment_account_number" not in dep or dep.get("payment_account_number") is None
            assert "payment_account_name" not in dep or dep.get("payment_account_name") is None
        else:
            # 502 is acceptable when gateway offline; the created "failed" doc is fine
            assert r.status_code in (400, 502), f"unexpected {r.status_code}: {r.text}"



# ---------------------------------------------------------------------------
# Public settings endpoint + telegram_url/welcome_message admin persistence (iter 8)
# ---------------------------------------------------------------------------
class TestPublicSettingsAndTelegram:
    def test_public_settings_no_auth_returns_200_with_shape(self):
        r = requests.get(f"{BASE_URL}/api/settings/public", timeout=15)
        assert r.status_code == 200, r.text
        d = r.json()
        for k in ("site_name", "telegram_url", "welcome_message",
                  "welcome_bonus", "min_deposit", "min_withdrawal"):
            assert k in d, f"missing key {k}"
        assert isinstance(d["site_name"], str) and len(d["site_name"]) > 0
        assert isinstance(d["telegram_url"], str)
        assert isinstance(d["welcome_message"], str)

    def test_admin_update_persists_telegram_and_welcome(self, admin_headers):
        new_tg = "https://t.me/naijainvest_test"
        new_msg = "TEST_ITER8_welcome_msg custom line"
        r = requests.put(f"{BASE_URL}/api/admin/settings",
                         json={"telegram_url": new_tg, "welcome_message": new_msg},
                         headers=admin_headers, timeout=15)
        assert r.status_code == 200, r.text
        s = r.json()
        assert s["telegram_url"] == new_tg
        assert s["welcome_message"] == new_msg

        # GET admin settings reflects new
        r2 = requests.get(f"{BASE_URL}/api/admin/settings", headers=admin_headers, timeout=15)
        assert r2.status_code == 200
        s2 = r2.json()
        assert s2["telegram_url"] == new_tg
        assert s2["welcome_message"] == new_msg

        # Public endpoint (no auth) also reflects updates
        r3 = requests.get(f"{BASE_URL}/api/settings/public", timeout=15)
        assert r3.status_code == 200
        d3 = r3.json()
        assert d3["telegram_url"] == new_tg
        assert d3["welcome_message"] == new_msg

    def test_public_settings_defaults_present_when_unset(self, admin_headers):
        # Clear telegram_url; welcome_message default should still be non-empty
        r = requests.put(f"{BASE_URL}/api/admin/settings",
                         json={"telegram_url": ""},
                         headers=admin_headers, timeout=15)
        assert r.status_code == 200
        r2 = requests.get(f"{BASE_URL}/api/settings/public", timeout=15)
        assert r2.status_code == 200
        d = r2.json()
        assert d["telegram_url"] == ""
        # welcome_message should still be truthy (either previously set or default)
        assert isinstance(d["welcome_message"], str)


# ---------------------------------------------------------------------------
# Iteration 9 — settings extension, withdrawal fee, bulk approve, impersonation,
# admin_get_user shape, admin add-balance total_admin_credited tracker.
# NOTE: PayNow gateway is currently enabled in this env, so we deliberately keep
# `auto_payout_enabled=False` throughout and submit withdrawals with an empty
# bank_code so no live gateway call ever fires.
# ---------------------------------------------------------------------------
def _reset_settings(admin_headers):
    """Restore known baseline for these tests."""
    requests.put(f"{BASE_URL}/api/admin/settings",
                 json={"withdrawal_fee_pct": 15.0,
                       "auto_payout_enabled": False,
                       "deposit_quick_amounts": [500, 1000, 2000, 5000, 10000, 20000],
                       "batch_approve_limit": 50},
                 headers=admin_headers, timeout=15)


class TestSettingsExtension:
    def test_settings_roundtrip_new_fields(self, admin_headers):
        payload = {
            "withdrawal_fee_pct": 12.5,
            "auto_payout_enabled": False,
            "deposit_quick_amounts": [250, 750, 2500, 6000],
            "batch_approve_limit": 25,
        }
        r = requests.put(f"{BASE_URL}/api/admin/settings", json=payload,
                         headers=admin_headers, timeout=15)
        assert r.status_code == 200, r.text
        s = r.json()
        assert s["withdrawal_fee_pct"] == 12.5
        assert s["auto_payout_enabled"] is False
        assert s["deposit_quick_amounts"] == [250, 750, 2500, 6000]
        assert s["batch_approve_limit"] == 25

        pub = requests.get(f"{BASE_URL}/api/settings/public", timeout=15).json()
        assert pub["withdrawal_fee_pct"] == 12.5
        assert pub["auto_payout_enabled"] is False
        assert pub["deposit_quick_amounts"] == [250, 750, 2500, 6000]
        # batch_approve_limit MUST NOT leak on public endpoint
        assert "batch_approve_limit" not in pub
        _reset_settings(admin_headers)


class TestWithdrawFeeCalc:
    def test_withdraw_computes_fee_and_payout_amount(self, admin_headers, user_b):
        _reset_settings(admin_headers)
        # Ensure user_b has enough balance for ₦2000 withdrawal
        requests.post(f"{BASE_URL}/api/admin/users/{user_b['user']['id']}/add-balance",
                      json={"amount": 5000.0}, headers=admin_headers, timeout=15)
        # Submit with explicit bank fields but bank_code="" so auto-payout can't fire
        r = requests.post(f"{BASE_URL}/api/withdrawals",
                          json={"amount": 2000.0,
                                "bank_name": "TEST_Bank",
                                "account_number": "0123456789",
                                "account_name": "TEST User B",
                                "bank_code": ""},
                          headers=_auth_headers(user_b["token"]), timeout=15)
        assert r.status_code == 200, r.text
        w = r.json()
        assert w["amount"] == pytest.approx(2000.0, abs=0.01)
        assert w["fee_pct"] == pytest.approx(15.0, abs=0.01)
        assert w["fee"] == pytest.approx(300.0, abs=0.01)
        assert w["payout_amount"] == pytest.approx(1700.0, abs=0.01)
        assert w["status"] == "pending"

    def test_withdraw_zero_fee_when_pct_zero(self, admin_headers, user_b):
        # temporarily set fee to 0
        requests.put(f"{BASE_URL}/api/admin/settings",
                     json={"withdrawal_fee_pct": 0.0},
                     headers=admin_headers, timeout=15)
        requests.post(f"{BASE_URL}/api/admin/users/{user_b['user']['id']}/add-balance",
                      json={"amount": 5000.0}, headers=admin_headers, timeout=15)
        r = requests.post(f"{BASE_URL}/api/withdrawals",
                          json={"amount": 1500.0,
                                "bank_name": "TEST_Bank",
                                "account_number": "0123456789",
                                "account_name": "TEST User B",
                                "bank_code": ""},
                          headers=_auth_headers(user_b["token"]), timeout=15)
        assert r.status_code == 200, r.text
        w = r.json()
        assert w["fee"] == pytest.approx(0.0, abs=0.01)
        assert w["payout_amount"] == pytest.approx(1500.0, abs=0.01)
        _reset_settings(admin_headers)


class TestBulkApproveWithdrawals:
    def _create_pending(self, admin_headers, user_b, amount=1200.0):
        requests.post(f"{BASE_URL}/api/admin/users/{user_b['user']['id']}/add-balance",
                      json={"amount": amount + 5000.0}, headers=admin_headers, timeout=15)
        r = requests.post(f"{BASE_URL}/api/withdrawals",
                          json={"amount": amount,
                                "bank_name": "TEST_Bulk",
                                "account_number": "0123456789",
                                "account_name": "TEST Bulk",
                                "bank_code": ""},
                          headers=_auth_headers(user_b["token"]), timeout=15)
        assert r.status_code == 200, r.text
        return r.json()["id"]

    def test_empty_ids_returns_400(self, admin_headers):
        _reset_settings(admin_headers)
        r = requests.post(f"{BASE_URL}/api/admin/withdrawals/bulk-approve",
                          json={"ids": []}, headers=admin_headers, timeout=15)
        assert r.status_code == 400
        assert "no withdrawal ids" in r.json()["detail"].lower()

    def test_over_limit_returns_400(self, admin_headers):
        # Set tight limit to test the over-limit branch without needing 50+ ids
        requests.put(f"{BASE_URL}/api/admin/settings",
                     json={"batch_approve_limit": 2},
                     headers=admin_headers, timeout=15)
        r = requests.post(f"{BASE_URL}/api/admin/withdrawals/bulk-approve",
                          json={"ids": ["a", "b", "c"]},
                          headers=admin_headers, timeout=15)
        assert r.status_code == 400
        assert "batch too large" in r.json()["detail"].lower()
        _reset_settings(admin_headers)

    def test_bulk_approve_happy_path_and_skip_non_pending(self, admin_headers, user_b):
        _reset_settings(admin_headers)
        w1 = self._create_pending(admin_headers, user_b, amount=1100.0)
        w2 = self._create_pending(admin_headers, user_b, amount=1200.0)
        # Approve one via single-approve to make it non-pending -> bulk should skip
        s = requests.post(f"{BASE_URL}/api/admin/withdrawals/{w1}/approve",
                          json={"note": "pre-approve"}, headers=admin_headers, timeout=15)
        assert s.status_code == 200

        r = requests.post(f"{BASE_URL}/api/admin/withdrawals/bulk-approve",
                          json={"ids": [w1, w2], "note": "TEST_bulk"},
                          headers=admin_headers, timeout=15)
        assert r.status_code == 200, r.text
        body = r.json()
        assert body["ok"] is True
        # w1 already approved => skipped ; w2 pending, no bank_code => manual approved
        assert body["skipped"] >= 1
        assert body["approved"] >= 1

        # Verify w2 now approved
        adm = requests.get(f"{BASE_URL}/api/admin/withdrawals",
                           headers=admin_headers, timeout=15).json()
        row = next((x for x in adm if x["id"] == w2), None)
        assert row is not None
        assert row["status"] == "approved"


class TestImpersonation:
    def test_impersonate_happy_path_and_stop(self, admin_headers, user_b):
        uid = user_b["user"]["id"]
        # Get admin id from /auth/me
        adm_me = requests.get(f"{BASE_URL}/api/auth/me",
                              headers=admin_headers, timeout=15).json()
        admin_id = adm_me["id"]

        r = requests.post(f"{BASE_URL}/api/admin/users/{uid}/impersonate",
                         headers=admin_headers, timeout=15)
        assert r.status_code == 200, r.text
        d = r.json()
        assert d["ok"] is True
        assert "access_token" in d
        assert d["user"]["id"] == uid
        assert d["user"]["role"] != "admin"

        # The returned access_token should let us call /auth/me and land on the target user
        r2 = requests.get(f"{BASE_URL}/api/auth/me",
                          headers=_auth_headers(d["access_token"]), timeout=15)
        assert r2.status_code == 200
        assert r2.json()["id"] == uid

        # Stop impersonation - restores admin cookies via admin_id query
        r3 = requests.post(f"{BASE_URL}/api/admin/impersonate/stop",
                           params={"admin_id": admin_id},
                           headers=admin_headers, timeout=15)
        assert r3.status_code == 200
        assert r3.json()["user"]["role"] == "admin"

    def test_impersonate_admin_refused(self, admin_headers):
        adm_me = requests.get(f"{BASE_URL}/api/auth/me",
                              headers=admin_headers, timeout=15).json()
        r = requests.post(f"{BASE_URL}/api/admin/users/{adm_me['id']}/impersonate",
                          headers=admin_headers, timeout=15)
        assert r.status_code == 400
        assert "admin" in r.json()["detail"].lower()

    def test_impersonate_missing_user_404(self, admin_headers):
        # Use a plausible-but-nonexistent ObjectId
        r = requests.post(f"{BASE_URL}/api/admin/users/507f1f77bcf86cd799439011/impersonate",
                          headers=admin_headers, timeout=15)
        assert r.status_code == 404

    def test_impersonate_stop_invalid_admin_id_400(self, admin_headers, user_b):
        # Pass a normal user's id as admin_id -> should 400
        r = requests.post(f"{BASE_URL}/api/admin/impersonate/stop",
                          params={"admin_id": user_b["user"]["id"]},
                          headers=admin_headers, timeout=15)
        assert r.status_code == 400


class TestAdminGetUserShape:
    def test_admin_get_user_includes_new_fields(self, admin_headers, user_b, user_a):
        # user_b was referred by user_a and has invested -> should have inviter + total_invested
        uid = user_b["user"]["id"]
        r = requests.get(f"{BASE_URL}/api/admin/users/{uid}",
                         headers=admin_headers, timeout=15)
        assert r.status_code == 200, r.text
        d = r.json()
        assert "total_deposited" in d
        assert isinstance(d["total_deposited"], (int, float))
        assert "inviter" in d
        # user_b was created with user_a's referral_code
        assert d["inviter"] is not None
        assert d["inviter"]["id"] == user_a["user"]["id"]
        assert "gen1_referrals" in d
        assert isinstance(d["gen1_referrals"], list)

    def test_admin_get_user_regression_no_inviter_no_deposits(self, admin_headers):
        # user_a has no referrer and no approved deposits -> still returns 200 with empty shape
        phone = _rand_phone()
        r = requests.post(f"{BASE_URL}/api/auth/register",
                          json={"phone": phone, "password": "pass1234",
                                "name": "TEST_Solo"}, timeout=15)
        assert r.status_code == 200
        uid = r.json()["user"]["id"]
        d = requests.get(f"{BASE_URL}/api/admin/users/{uid}",
                         headers=admin_headers, timeout=15).json()
        assert d["total_deposited"] == 0
        assert d["inviter"] is None
        assert d["gen1_referrals"] == []


class TestAdminAddBalanceTotalCredited:
    def test_positive_credit_increments_total_admin_credited(self, admin_headers, user_a):
        uid = user_a["user"]["id"]
        # Read current value from admin users list (or 0 if missing)
        users = requests.get(f"{BASE_URL}/api/admin/users",
                             headers=admin_headers, timeout=15).json()
        row = next((u for u in users if u["id"] == uid), None)
        assert row is not None
        before = float(row.get("total_admin_credited") or 0)

        requests.post(f"{BASE_URL}/api/admin/users/{uid}/add-balance",
                      json={"amount": 137.0, "note": "TEST_track"},
                      headers=admin_headers, timeout=15)

        users2 = requests.get(f"{BASE_URL}/api/admin/users",
                              headers=admin_headers, timeout=15).json()
        row2 = next((u for u in users2 if u["id"] == uid), None)
        after = float(row2.get("total_admin_credited") or 0)
        assert after - before == pytest.approx(137.0, abs=0.01)

    def test_transaction_meta_includes_admin_email_and_name(self, admin_headers, user_a):
        uid = user_a["user"]["id"]
        requests.post(f"{BASE_URL}/api/admin/users/{uid}/add-balance",
                      json={"amount": 42.0, "note": "TEST_meta"},
                      headers=admin_headers, timeout=15)
        detail = requests.get(f"{BASE_URL}/api/admin/users/{uid}",
                              headers=admin_headers, timeout=15).json()
        tx = detail["transactions"]
        cred_tx = next((t for t in tx if t.get("note") == "TEST_meta"), None)
        assert cred_tx is not None
        meta = cred_tx.get("meta") or {}
        assert "admin_email" in meta
        assert "admin_name" in meta
