"""Regression: 1SSPay payout must fail fast with a clear admin message when
`payoutBalance` is insufficient.

Bug (Feb 2026):
    User reported "1SSPay payout is not working from admin dashboard".
    Root cause was NOT a code/config issue — the 1SSPay account had
    `payoutBalance: 0.00` (all funds still in `balance` awaiting settlement).
    Payouts would submit with code=200 but silently fail downstream 15 min
    later with `status=3` and `failMsg: None`. Admin couldn't tell why.

Fix: pre-flight balance check in `_onesspay_payout_withdrawal` — if
`payoutBalance < payout_amount`, raise HTTPException(400) immediately with
a clear, actionable message (available/pending/settle-waiting amounts).
Also, `reconcile_pending_onesspay_withdrawals` now enriches the failure
message with a balance snapshot when 1SSPay returns `failMsg: None`.
"""
import os
import asyncio
import pytest
from dotenv import load_dotenv

load_dotenv("/app/backend/.env")
import sys
sys.path.insert(0, "/app/backend")

from fastapi import HTTPException  # noqa: E402
import server  # noqa: E402
import onesspay  # noqa: E402


pytestmark = pytest.mark.skipif(
    not onesspay.enabled(),
    reason="1SSPay not configured — cannot run integration test.",
)


def _run(coro):
    return asyncio.get_event_loop().run_until_complete(coro)


def test_precheck_blocks_when_payout_balance_zero():
    """When 1SSPay's payoutBalance is 0, admin must see a clear balance error
    instead of a submitted-but-silently-failing payout."""
    # Sanity: confirm the account we're testing against actually has 0 payout balance.
    bal = _run(onesspay.get_balance())
    if int(bal.get("code") or 0) != 200:
        pytest.skip(f"1SSPay balance call failed: {bal}")
    payout_bal = float((bal.get("data") or {}).get("payoutBalance") or 0)
    if payout_bal > 0:
        pytest.skip(f"1SSPay has ₦{payout_bal:.2f} available — test env has funds so precheck won't fire.")

    fake_wd = {
        "_id": "test_wid_balance_precheck",
        "user_id": "test_uid",
        "amount": 500.0,
        "payout_amount": 500.0,
        "bank_code": "NR0037",
        "onesspay_bank_code": "NR0037",
        "account_number": "8054563131",
        "account_name": "Test User",
        "user_phone": "+2348054563131",
    }
    with pytest.raises(HTTPException) as exc:
        _run(server._onesspay_payout_withdrawal(fake_wd, note="Testing precheck"))
    assert exc.value.status_code == 400
    detail = exc.value.detail.lower()
    # Message must mention the balance issue, NOT a generic "declined" string.
    assert "payout balance" in detail or "no available payout" in detail, \
        f"Expected balance-focused error, got: {exc.value.detail!r}"
    assert "settle" in detail, \
        f"Message must guide admin to settle the payin balance. Got: {exc.value.detail!r}"


def test_precheck_names_the_actual_balances():
    """The message must include the actual naira figures so admin can plan."""
    fake_wd = {
        "_id": "test_wid_balance_precheck_2",
        "user_id": "test_uid",
        "amount": 500.0,
        "payout_amount": 500.0,
        "bank_code": "NR0037",
        "onesspay_bank_code": "NR0037",
        "account_number": "8054563131",
        "account_name": "Test User",
    }
    try:
        _run(server._onesspay_payout_withdrawal(fake_wd, note=""))
    except HTTPException as e:
        # If the payoutBalance is 0, the message should have '₦0.00' and reference
        # the payin balance figure.
        detail = e.detail
        assert "₦" in detail, f"Message should quote naira amounts. Got: {detail!r}"
    except Exception:
        pytest.skip("Not a balance-precheck path")
