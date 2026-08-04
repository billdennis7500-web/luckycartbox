"""Backend regression for iteration_19:

  - New settings fields (whatsapp_channel_url, support_hours, referral_levels,
    referral_level_requires_investment) exposed & admin-editable
  - GET  /api/referrals/rewards
  - POST /api/referrals/rewards/claim/{level_id}
    * success (credits wallet + bonus_earnings, adds transaction)
    * duplicate claim -> 400
    * under threshold -> 400
    * unknown level_id -> 404
  - Health + a few regression endpoints
"""
import os
import copy
import pytest
import requests

BASE_URL = os.environ.get("REACT_APP_BACKEND_URL", "https://dark-gold-ui-build.preview.emergentagent.com").rstrip("/")

ADMIN_EMAIL = "billdennis750@gmail.com"
ADMIN_PASSWORD = "djscan30"
USER_PHONE = "+2348099887711"
USER_PASSWORD = "pass1234"


# ---------- fixtures ---------------------------------------------------------
@pytest.fixture(scope="module")
def admin_session():
    s = requests.Session()
    r = s.post(f"{BASE_URL}/api/auth/login", json={"email": ADMIN_EMAIL, "password": ADMIN_PASSWORD})
    assert r.status_code == 200, f"admin login failed {r.status_code} {r.text}"
    return s


@pytest.fixture(scope="module")
def user_session():
    s = requests.Session()
    r = s.post(f"{BASE_URL}/api/auth/login", json={"phone": USER_PHONE, "password": USER_PASSWORD})
    assert r.status_code == 200, f"user login failed {r.status_code} {r.text}"
    return s


@pytest.fixture(scope="module")
def original_settings(admin_session):
    r = admin_session.get(f"{BASE_URL}/api/admin/settings")
    assert r.status_code == 200
    return copy.deepcopy(r.json())


# ---------- health / regression ---------------------------------------------
def test_health():
    r = requests.get(f"{BASE_URL}/api/health")
    assert r.status_code == 200
    assert r.json().get("status") == "ok"


def test_public_settings_exposes_new_fields():
    r = requests.get(f"{BASE_URL}/api/settings/public")
    assert r.status_code == 200
    data = r.json()
    assert "whatsapp_channel_url" in data
    assert "support_hours" in data
    # New default
    assert "10:00 AM to 5:00 PM" in data["support_hours"]


def test_products_endpoint(user_session):
    r = user_session.get(f"{BASE_URL}/api/products")
    assert r.status_code == 200
    assert isinstance(r.json(), list)


# ---------- admin settings ---------------------------------------------------
def test_admin_settings_has_new_fields(admin_session, original_settings):
    s = original_settings
    assert "referral_levels" in s
    assert isinstance(s["referral_levels"], list) and len(s["referral_levels"]) >= 5
    assert "referral_level_requires_investment" in s
    assert "whatsapp_channel_url" in s
    assert "support_hours" in s
    # Ignite default reward 500
    ignite = next((l for l in s["referral_levels"] if l.get("level") == 1), None)
    assert ignite and ignite.get("reward") == 500 and ignite.get("min_referrals") == 5


def test_admin_can_update_channel_urls_and_levels(admin_session, original_settings):
    payload = {
        "whatsapp_url": "https://wa.me/2348012345678",
        "whatsapp_channel_url": "https://whatsapp.com/channel/TEST",
        "telegram_url": "https://t.me/testchat",
        "telegram_channel_url": "https://t.me/testchannel",
        "support_hours": "Monday to Sunday, 10:00 AM to 5:00 PM",
        "referral_level_requires_investment": True,
        "referral_levels": copy.deepcopy(original_settings["referral_levels"]),
    }
    # Bump Ignite reward to 600 to test persistence
    for lv in payload["referral_levels"]:
        if lv.get("level") == 1:
            lv["reward"] = 600

    r = admin_session.put(f"{BASE_URL}/api/admin/settings", json=payload)
    assert r.status_code == 200, r.text

    pub = requests.get(f"{BASE_URL}/api/settings/public").json()
    assert pub["whatsapp_channel_url"] == "https://whatsapp.com/channel/TEST"
    assert pub["whatsapp_url"] == "https://wa.me/2348012345678"

    admin_view = admin_session.get(f"{BASE_URL}/api/admin/settings").json()
    ignite = next(l for l in admin_view["referral_levels"] if l.get("level") == 1)
    assert ignite["reward"] == 600

    # ---- reset ----
    reset = {
        "whatsapp_url": original_settings.get("whatsapp_url", ""),
        "whatsapp_channel_url": original_settings.get("whatsapp_channel_url", ""),
        "telegram_url": original_settings.get("telegram_url", ""),
        "telegram_channel_url": original_settings.get("telegram_channel_url", ""),
        "support_hours": original_settings.get("support_hours", "Monday to Sunday, 10:00 AM to 5:00 PM"),
        "referral_level_requires_investment": original_settings.get("referral_level_requires_investment", True),
        "referral_levels": original_settings["referral_levels"],
    }
    rr = admin_session.put(f"{BASE_URL}/api/admin/settings", json=reset)
    assert rr.status_code == 200


# ---------- rewards endpoint (user) -----------------------------------------
def test_referrals_rewards_shape(user_session):
    r = user_session.get(f"{BASE_URL}/api/referrals/rewards")
    assert r.status_code == 200, r.text
    d = r.json()
    for k in ["count", "tiers", "current_level", "next_level", "next_level_needs", "progress_pct", "total_earned"]:
        assert k in d, f"missing key {k}"
    assert isinstance(d["tiers"], list) and len(d["tiers"]) >= 5
    for t in d["tiers"]:
        for k in ["level", "name", "min_referrals", "reward", "unlocked", "claimed", "claimable"]:
            assert k in t
    print(f"[rewards] count={d['count']} current={d['current_level_name']} next={d['next_level_name']} earned={d['total_earned']}")


def test_claim_unknown_level_returns_404(user_session):
    r = user_session.post(f"{BASE_URL}/api/referrals/rewards/claim/99")
    assert r.status_code == 404


def test_claim_under_threshold_returns_400(user_session):
    # Level 5 (Titan) needs 100 refs — regression user has ~5
    r = user_session.post(f"{BASE_URL}/api/referrals/rewards/claim/5")
    assert r.status_code == 400
    assert "qualifying" in r.text.lower() or "need" in r.text.lower()


def test_claim_ignite_flow(user_session):
    """End-to-end claim: qualifies -> credits wallet -> duplicate claim rejected."""
    pre = user_session.get(f"{BASE_URL}/api/referrals/rewards").json()
    ignite = next(t for t in pre["tiers"] if t["level"] == 1)
    if pre["count"] < ignite["min_referrals"]:
        pytest.skip(f"user has only {pre['count']} qualifying refs; need {ignite['min_referrals']}")

    me_before = user_session.get(f"{BASE_URL}/api/auth/me").json()
    wallet_before = float(me_before.get("wallet_balance", 0))
    bonus_before = float(me_before.get("bonus_earnings", 0))

    if ignite["claimed"]:
        # Verify the duplicate-claim path
        dup = user_session.post(f"{BASE_URL}/api/referrals/rewards/claim/1")
        assert dup.status_code == 400
        assert "already claimed" in dup.text.lower()
        pytest.skip("Ignite already claimed on this seeded account — verified duplicate rejection.")

    r = user_session.post(f"{BASE_URL}/api/referrals/rewards/claim/1")
    assert r.status_code == 200, r.text
    body = r.json()
    assert body["ok"] is True
    assert body["level"] == 1
    assert abs(body["credited"] - ignite["reward"]) < 0.01

    me_after = user_session.get(f"{BASE_URL}/api/auth/me").json()
    assert float(me_after["wallet_balance"]) - wallet_before >= ignite["reward"] - 0.01
    assert float(me_after.get("bonus_earnings", 0)) - bonus_before >= ignite["reward"] - 0.01

    # Duplicate should now fail
    dup = user_session.post(f"{BASE_URL}/api/referrals/rewards/claim/1")
    assert dup.status_code == 400
    assert "already claimed" in dup.text.lower()

    # Rewards endpoint reflects claim
    post = user_session.get(f"{BASE_URL}/api/referrals/rewards").json()
    ignite_after = next(t for t in post["tiers"] if t["level"] == 1)
    assert ignite_after["claimed"] is True
    assert post["total_earned"] >= ignite["reward"] - 0.01

    # Verify transaction row
    tx = user_session.get(f"{BASE_URL}/api/transactions").json()
    assert any(t.get("type") == "referral_bonus" for t in tx), "no referral_bonus transaction found"
