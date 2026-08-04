"""Iteration 23 — Force-logout-all and admin settings tabs regression."""
import time
import pytest
import requests
from pathlib import Path


def _base_url() -> str:
    for line in Path("/app/frontend/.env").read_text().splitlines():
        if line.startswith("REACT_APP_BACKEND_URL="):
            return line.split("=", 1)[1].strip().rstrip("/")
    raise RuntimeError


BASE = _base_url()
ADMIN_EMAIL = "billdennis750@gmail.com"
ADMIN_PASS = "djscan30"
USER_PHONE = "+2348099887711"
USER_PASS = "pass1234"


def _login(payload):
    s = requests.Session()
    r = s.post(f"{BASE}/api/auth/login", json=payload, timeout=15)
    assert r.status_code == 200, r.text
    return s, r.json()


@pytest.fixture(scope="module")
def admin_session():
    s, data = _login({"email": ADMIN_EMAIL, "password": ADMIN_PASS})
    assert data["user"]["role"] == "admin"
    return s, data


@pytest.fixture
def user_session():
    s, data = _login({"phone": USER_PHONE, "password": USER_PASS})
    return s, data


# --- Force logout end-to-end via cookies ---
class TestForceLogoutAll:
    def test_full_force_logout_flow(self, admin_session, user_session):
        admin_s, _ = admin_session
        user_s, user_data = user_session
        assert user_data["user"]["role"] == "user"

        # (1) user /me returns 200
        r = user_s.get(f"{BASE}/api/auth/me", timeout=15)
        assert r.status_code == 200
        assert r.json()["role"] == "user"

        # (2) admin /me returns 200 admin
        r = admin_s.get(f"{BASE}/api/auth/me", timeout=15)
        assert r.status_code == 200
        assert r.json()["role"] == "admin"

        # Ensure at least a 1-second gap so new token iat > session_epoch after relogin
        time.sleep(2)

        # (3) admin triggers logout-all
        r = admin_s.post(f"{BASE}/api/admin/sessions/logout-all", timeout=15)
        assert r.status_code == 200, r.text
        body = r.json()
        assert body.get("ok") is True
        assert isinstance(body.get("session_epoch"), int)
        assert body["session_epoch"] > 0
        assert isinstance(body.get("affected_users"), int)
        assert body["affected_users"] >= 0
        epoch = body["session_epoch"]

        # (4) user token now unauthorized
        r = user_s.get(f"{BASE}/api/auth/me", timeout=15)
        assert r.status_code == 401, f"expected 401 got {r.status_code}: {r.text}"

        # (5) admin still authenticated
        r = admin_s.get(f"{BASE}/api/auth/me", timeout=15)
        assert r.status_code == 200
        assert r.json()["role"] == "admin"

        # (6) user re-logs in — new token > epoch
        time.sleep(2)
        s2, data2 = _login({"phone": USER_PHONE, "password": USER_PASS})
        r = s2.get(f"{BASE}/api/auth/me", timeout=15)
        assert r.status_code == 200
        assert r.json()["role"] == "user"
        assert r.json()["phone"] == USER_PHONE

    def test_logout_all_requires_admin(self, user_session):
        user_s, _ = user_session
        # Re-login user to be safe
        s2, _ = _login({"phone": USER_PHONE, "password": USER_PASS})
        r = s2.post(f"{BASE}/api/admin/sessions/logout-all", timeout=15)
        assert r.status_code == 403


# --- Settings round-trip covering all 4 editable tabs ---
class TestSettingsRoundTrip:
    def test_put_settings_all_new_tab_fields_roundtrip(self, admin_session):
        s, _ = admin_session
        payload = {
            # Branding
            "site_name": "NaijaInvest QA",
            "welcome_bonus": 500.0,
            "welcome_message": "QA welcome msg",
            # Finance
            "min_deposit": 500.0,
            "min_withdrawal": 1000.0,
            "withdrawal_fee_pct": 15.0,
            "auto_payout_enabled": False,
            "batch_approve_limit": 50,
            "deposit_quick_amounts": [500, 1000, 2000, 5000, 10000, 20000],
            # Referrals
            "referral_levels": [
                {"level": 1, "min_referrals": 3, "reward": 500},
                {"level": 2, "min_referrals": 10, "reward": 2000},
            ],
            "referral_level_requires_investment": True,
            # Support
            "whatsapp_url": "https://wa.me/2348000000000",
            "whatsapp_channel_url": "https://whatsapp.com/channel/test",
            "telegram_url": "https://t.me/naijainvest",
            "telegram_channel_url": "https://t.me/naijainvest_channel",
            "support_hours": "Mon-Fri 9am-5pm WAT",
        }
        r = s.put(f"{BASE}/api/admin/settings", json=payload, timeout=15)
        assert r.status_code == 200, r.text
        got = r.json()
        for k, v in payload.items():
            assert got.get(k) == v, f"field {k}: got {got.get(k)!r}, expected {v!r}"

        # GET admin settings reflects
        r2 = s.get(f"{BASE}/api/admin/settings", timeout=15)
        assert r2.status_code == 200
        g = r2.json()
        for k, v in payload.items():
            assert g.get(k) == v, f"persist field {k}: got {g.get(k)!r}"


# --- Regression: existing endpoints unchanged ---
class TestRegressionEndpoints:
    def test_health(self):
        r = requests.get(f"{BASE}/api/health", timeout=15)
        assert r.status_code == 200

    def test_settings_public(self):
        r = requests.get(f"{BASE}/api/settings/public", timeout=15)
        assert r.status_code == 200
        d = r.json()
        assert "site_name" in d and "welcome_bonus" in d

    def test_admin_deposits(self, admin_session):
        s, _ = admin_session
        r = s.get(f"{BASE}/api/admin/deposits", timeout=15)
        assert r.status_code == 200
        assert isinstance(r.json(), list)

    def test_referrals_rewards(self):
        s, _ = _login({"phone": USER_PHONE, "password": USER_PASS})
        r = s.get(f"{BASE}/api/referrals/rewards", timeout=15)
        assert r.status_code == 200

    def test_admin_server_ip(self, admin_session):
        s, _ = admin_session
        r = s.get(f"{BASE}/api/admin/server-ip", timeout=15)
        assert r.status_code == 200
        assert r.json().get("outbound_ip") == "46.20.101.18"

    def test_profile_pendant_user(self):
        s, data = _login({"phone": USER_PHONE, "password": USER_PASS})
        assert data["user"]["phone"] == USER_PHONE
        r = s.get(f"{BASE}/api/auth/me", timeout=15)
        assert r.status_code == 200
