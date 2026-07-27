"""PayNow webhook endpoints (public, sign-verified)."""
from fastapi import APIRouter, HTTPException, Request

import paynow
from db import db, logger
from deps import now_utc, add_transaction

router = APIRouter(prefix="/api/webhooks/paynow", tags=["webhooks"])


@router.post("/payin")
async def webhook_payin(request: Request):
    body = await request.json()
    logger.info("PayNow PAYIN callback: %s", body)
    if not paynow.verify_callback(body):
        logger.warning("PayNow payin callback signature invalid")
        raise HTTPException(400, "Invalid signature")
    merchant_order_no = body.get("merchantOrderNo")
    status_code = int(body.get("status", 0))
    if not merchant_order_no:
        raise HTTPException(400, "Missing merchantOrderNo")
    dep = await db.deposits.find_one({"merchant_order_no": merchant_order_no})
    if not dep:
        return "SUCCESS"
    if dep["status"] == "approved":
        return "SUCCESS"

    if status_code == 2:
        amount = float(body.get("payAmount") or body.get("amount") or dep["amount"])
        await db.deposits.update_one(
            {"_id": dep["_id"]},
            {"$set": {"status": "approved", "processed_at": now_utc().isoformat(),
                      "gateway_callback": body, "credited_amount": amount}},
        )
        await db.users.update_one({"_id": dep["user_id"]}, {"$inc": {"wallet_balance": amount}})
        await add_transaction(dep["user_id"], "deposit", amount, "Deposit approved (auto)",
                              {"deposit_id": str(dep["_id"]), "gateway": "paynow"})
    else:
        await db.deposits.update_one(
            {"_id": dep["_id"]},
            {"$set": {"status": "rejected", "processed_at": now_utc().isoformat(),
                      "gateway_callback": body,
                      "admin_note": body.get("msg") or "gateway failure"}},
        )
    return "SUCCESS"


@router.post("/payout")
async def webhook_payout(request: Request):
    body = await request.json()
    logger.info("PayNow PAYOUT callback: %s", body)
    if not paynow.verify_callback(body):
        logger.warning("PayNow payout callback signature invalid")
        raise HTTPException(400, "Invalid signature")
    merchant_order_no = body.get("merchantOrderNo")
    status_code = int(body.get("status", 0))
    reversal = int(body.get("reversal", 0) or 0)
    if not merchant_order_no:
        raise HTTPException(400, "Missing merchantOrderNo")
    w = await db.withdrawals.find_one({"merchant_order_no": merchant_order_no})
    if not w:
        return "SUCCESS"
    if w["status"] in ("approved", "rejected"):
        return "SUCCESS"

    if status_code == 2 and not reversal:
        await db.withdrawals.update_one(
            {"_id": w["_id"]},
            {"$set": {"status": "approved", "processed_at": now_utc().isoformat(),
                      "gateway_callback": body}},
        )
        await add_transaction(w["user_id"], "withdrawal", -w["amount"],
                              "Withdrawal paid out (auto)",
                              {"withdrawal_id": str(w["_id"]), "gateway": "paynow"})
    else:
        await db.users.update_one({"_id": w["user_id"]}, {"$inc": {"wallet_balance": w["amount"]}})
        await db.withdrawals.update_one(
            {"_id": w["_id"]},
            {"$set": {"status": "rejected", "processed_at": now_utc().isoformat(),
                      "gateway_callback": body,
                      "admin_note": body.get("msg") or "gateway failure/reversal"}},
        )
        await add_transaction(w["user_id"], "withdrawal_refund", w["amount"],
                              "Withdrawal failed - refunded",
                              {"withdrawal_id": str(w["_id"]), "gateway": "paynow"})
    return "SUCCESS"
