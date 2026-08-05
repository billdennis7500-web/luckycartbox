"""Regression: `/api/investments` must not 500 after the parallelisation fix.

Bug (Feb 2026):
    File "/app/backend/server.py", line 1816, in my_investments
        invs_task = asyncio.create_task(
            db.investments.find(...).sort(...).to_list(500)
        )
    TypeError: a coroutine was expected, got <Future pending>

Root cause: Motor's `.to_list()` returns a `Future`, not a native `coroutine`.
`asyncio.create_task` rejects Futures. The endpoint 500'd for EVERY user in
production and the "Warehouse / My Purchases" page rendered as empty.

Fix: switched to `asyncio.gather(...)` which accepts any awaitable (motor
Futures, coroutines, tasks). Both the investments-list read and the
profit-drop probe now run concurrently without the Future→Task coercion.

This test hits the live preview server via httpx (the same way real browsers
do). We can't use FastAPI TestClient here because motor's global AsyncIO
client conflicts with TestClient's per-request event loop teardown.
"""

import os
import httpx
import pytest


API_URL = os.environ.get("REACT_APP_BACKEND_URL")
if not API_URL:
    # Fallback: read from frontend .env
    try:
        with open("/app/frontend/.env") as f:
            for line in f:
                if line.startswith("REACT_APP_BACKEND_URL="):
                    API_URL = line.split("=", 1)[1].strip()
                    break
    except Exception:
        pass


pytestmark = pytest.mark.skipif(
    not API_URL, reason="REACT_APP_BACKEND_URL not set — nothing to test against.")


@pytest.fixture(scope="module")
def auth_client():
    """A logged-in httpx client for the UI Tester seed user."""
    c = httpx.Client(base_url=API_URL, timeout=15.0)
    r = c.post("/api/auth/login",
               json={"phone": "+2348099887711", "password": "pass1234"})
    if r.status_code != 200:
        pytest.skip(f"Seed user not present ({r.status_code}) — nothing to test.")
    yield c
    c.close()


def test_investments_endpoint_does_not_500(auth_client):
    """The exact bug the user reported: warehouse page shows no investments
    because the API is returning 500."""
    r = auth_client.get("/api/investments")
    assert r.status_code == 200, (
        f"/api/investments returned {r.status_code} — regressed to the "
        f"asyncio.create_task(Future) bug. Body: {r.text[:300]}"
    )
    body = r.json()
    assert isinstance(body, list), f"Expected list, got {type(body).__name__}"


def test_investments_row_has_ui_fields(auth_client):
    """The UI depends on these keys being present in every row so the
    warehouse card can render."""
    r = auth_client.get("/api/investments")
    assert r.status_code == 200
    rows = r.json()
    if not rows:
        pytest.skip("Test user has no investments — nothing to assert shape on.")
    row = rows[0]
    for k in ("id", "user_id", "product_id", "product_name", "status",
              "price", "duration_days", "drops_done"):
        assert k in row, f"missing key {k!r} in investment row"


def test_referrals_endpoint_does_not_500(auth_client):
    """After my parallelisation refactor, /referrals must still return 200 —
    the fix used asyncio.gather correctly (unlike the initial /investments)."""
    r = auth_client.get("/api/referrals")
    assert r.status_code == 200
    body = r.json()
    for k in ("referral_code", "gen1", "gen2", "gen3", "earnings"):
        assert k in body, f"missing key {k!r} in referrals response"
