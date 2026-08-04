"""Iteration 25 tests: Milestone confetti toast + Coupon History."""
import os
import requests
import pytest
from motor.motor_asyncio import AsyncIOMotorClient
import asyncio

BASE = os.environ["REACT_APP_BACKEND_URL"].rstrip("/")
API = f"{BASE}/api"

USER_PHONE = "+2348099887711"
USER_PASS = "pass1234"


@pytest.fixture(scope="module")
def user_client():
    s = requests.Session()
    r = s.post(f"{API}/auth/login", json={"phone": USER_PHONE, "password": USER_PASS})
    assert r.status_code == 200, r.text
    return s


async def _reset_notified():
    mongo_url = os.environ["MONGO_URL"]
    db_name = os.environ["DB_NAME"]
    client = AsyncIOMotorClient(mongo_url)
    db = client[db_name]
    res = await db.users.update_one(
        {"phone": USER_PHONE},
        {"$set": {"notified_referral_levels": []}},
    )
    client.close()
    return res.modified_count


@pytest.fixture(scope="module")
def reset_notified():
    return asyncio.get_event_loop().run_until_complete(_reset_notified())


# ---------- Milestone / newly_unlocked ----------

def test_newly_unlocked_after_reset(user_client, reset_notified):
    r = user_client.get(f"{API}/referrals/rewards")
    assert r.status_code == 200
    data = r.json()
    assert "newly_unlocked" in data
    levels = [t["level"] for t in data["newly_unlocked"]]
    assert 1 in levels, f"Expected Ignite(1) in newly_unlocked, got {data['newly_unlocked']}"
    ignite = next(t for t in data["newly_unlocked"] if t["level"] == 1)
    # Backend tier names are admin-configurable; regression DB uses "Level 1"
    # (spec doc lists "Ignite" as an example). Just verify shape.
    assert ignite.get("name")
    assert ignite["reward"] > 0
    assert "icon" in ignite and "color" in ignite


def test_acknowledge_returns_ack_list(user_client):
    r = user_client.post(f"{API}/referrals/rewards/acknowledge")
    assert r.status_code == 200, r.text
    body = r.json()
    assert body["ok"] is True
    assert 1 in body["acknowledged"]


def test_newly_unlocked_empty_after_acknowledge(user_client):
    r = user_client.get(f"{API}/referrals/rewards")
    assert r.status_code == 200
    assert r.json()["newly_unlocked"] == []


def test_acknowledge_idempotent(user_client):
    r = user_client.post(f"{API}/referrals/rewards/acknowledge")
    assert r.status_code == 200
    # Second ack still returns unlocked list but nothing changes
    r2 = user_client.get(f"{API}/referrals/rewards")
    assert r2.json()["newly_unlocked"] == []


# ---------- Coupon history ----------

def test_coupon_history_shape(user_client):
    r = user_client.get(f"{API}/coupons/history")
    assert r.status_code == 200, r.text
    data = r.json()
    # Should include items and stats
    assert "items" in data or "history" in data or "coupons" in data or isinstance(data, list)


def test_coupon_history_full_content(user_client):
    r = user_client.get(f"{API}/coupons/history")
    data = r.json()
    print("HISTORY RESPONSE KEYS:", list(data.keys()) if isinstance(data, dict) else "list")
    print("HISTORY:", data)
    if isinstance(data, dict) and "items" in data:
        items = data["items"]
    elif isinstance(data, list):
        items = data
    else:
        items = data.get("history", [])
    # Regression user has redeemed at least 1 coupon in previous iterations
    assert len(items) >= 1
    for it in items:
        assert "amount" in it or "value" in it
        assert "coupon_type" in it or "type" in it


def test_coupon_history_pagination(user_client):
    r = user_client.get(f"{API}/coupons/history", params={"limit": 1, "skip": 0})
    assert r.status_code == 200


# ---------- Regression ----------

def test_health():
    r = requests.get(f"{API}/health")
    assert r.status_code == 200


def test_settings_public():
    r = requests.get(f"{API}/settings/public")
    assert r.status_code == 200


def test_daily_coupon(user_client):
    r = user_client.get(f"{API}/coupons/daily")
    assert r.status_code == 200


def test_withdrawal_window(user_client):
    r = user_client.get(f"{API}/withdrawals/window")
    assert r.status_code == 200


def test_new_user_empty_history():
    """Register a fresh user, empty coupon history."""
    import time
    phone_digits = str(int(time.time()))[-9:]
    phone = "080" + phone_digits[:8]
    s = requests.Session()
    reg = s.post(f"{API}/auth/register", json={
        "name": "TEST_HistTester",
        "phone": phone,
        "password": "pass1234",
    })
    if reg.status_code not in (200, 201):
        pytest.skip(f"register failed: {reg.status_code} {reg.text}")
    r = s.get(f"{API}/coupons/history")
    assert r.status_code == 200
    data = r.json()
    items = data["items"] if isinstance(data, dict) and "items" in data else (data if isinstance(data, list) else data.get("history", []))
    assert items == [] or len(items) == 0
