"""PayNow-related endpoints: bank list, account verify, admin status/balance/banks/reconcile."""
import os
from fastapi import APIRouter, HTTPException, Depends

import paynow
from nigerian_banks import filter_popular
from deps import get_current_user, get_admin_user
from schemas import VerifyAccountIn

router = APIRouter(prefix="/api", tags=["paynow"])


@router.get("/paynow/banks")
async def user_paynow_banks(user: dict = Depends(get_current_user), all: bool = False):
    if not paynow.enabled():
        return {"enabled": False, "data": []}
    resp = await paynow.list_banks_cached()
    data = resp.get("data") or []
    filtered = data if all else filter_popular(data)
    return {"enabled": True, "code": resp.get("code"), "data": filtered,
            "msg": resp.get("msg"), "total": len(data)}


@router.post("/paynow/verify-account")
async def verify_account(payload: VerifyAccountIn, user: dict = Depends(get_current_user)):
    if not paynow.enabled():
        raise HTTPException(400, "PayNow is not configured")
    resp = await paynow.query_payee(payload.bank_code, payload.account_number)
    data = resp.get("data") or {}
    return {"ok": resp.get("code") == 0, "exists": bool(data.get("exist")), "raw": resp}


@router.get("/admin/paynow/status")
async def admin_paynow_status(admin: dict = Depends(get_admin_user)):
    return {
        "enabled": paynow.enabled(),
        "merchant_no": os.environ.get("PAYNOW_MERCHANT_NO", ""),
        "base_url": os.environ.get("PAYNOW_BASE_URL", ""),
        "payin_channel": os.environ.get("PAYNOW_PAYIN_CHANNEL", ""),
        "payout_channel": os.environ.get("PAYNOW_PAYOUT_CHANNEL", ""),
        "currency": os.environ.get("PAYNOW_CURRENCY", "NGN"),
    }


@router.get("/admin/paynow/balance")
async def admin_paynow_balance(admin: dict = Depends(get_admin_user)):
    if not paynow.enabled():
        raise HTTPException(400, "PayNow is not configured")
    return await paynow.get_balance_cached()


@router.get("/admin/paynow/banks")
async def admin_paynow_banks(admin: dict = Depends(get_admin_user)):
    if not paynow.enabled():
        raise HTTPException(400, "PayNow is not configured")
    return await paynow.list_banks_cached()


@router.post("/admin/paynow/reconcile")
async def admin_paynow_reconcile(admin: dict = Depends(get_admin_user)):
    if not paynow.enabled():
        raise HTTPException(400, "PayNow is not configured")
    from routers.reconcile import (
        reconcile_pending_paynow_deposits, reconcile_pending_paynow_withdrawals,
    )
    dep = await reconcile_pending_paynow_deposits()
    wd = await reconcile_pending_paynow_withdrawals()
    return {"ok": True, "deposits_credited": dep, "withdrawals_settled": wd}
