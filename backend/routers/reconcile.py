"""PayNow reconciliation helpers (used by manual admin action + cron)."""
import paynow
from db import db, logger
from deps import now_utc, add_transaction


async def reconcile_pending_paynow_deposits() -> int:
    pending = await db.deposits.find({"gateway": "paynow", "status": "pending"}).to_list(200)
    orders = [d.get("merchant_order_no") for d in pending if d.get("merchant_order_no")]
    if not orders:
        return 0
    res = await paynow.query_payin(orders)
    if res.get("code") != 0:
        return 0
    credited = 0
    for order in (res.get("data") or []):
        mon = order.get("merchantOrderNo")
        status_code = int(order.get("status", 0) or 0)
        dep = next((d for d in pending if d.get("merchant_order_no") == mon), None)
        if not dep:
            continue
        if status_code == 2:
            amount = float(order.get("payAmount") or order.get("amount") or dep["amount"])
            await db.deposits.update_one(
                {"_id": dep["_id"], "status": "pending"},
                {"$set": {"status": "approved", "processed_at": now_utc().isoformat(),
                          "gateway_query": order, "credited_amount": amount, "reconciled": True}},
            )
            await db.users.update_one({"_id": dep["user_id"]}, {"$inc": {"wallet_balance": amount}})
            await add_transaction(dep["user_id"], "deposit", amount, "Deposit approved (reconciled)",
                                  {"deposit_id": str(dep["_id"]), "gateway": "paynow"})
            credited += 1
        elif status_code in (3, 4, 6):
            await db.deposits.update_one(
                {"_id": dep["_id"], "status": "pending"},
                {"$set": {"status": "rejected", "processed_at": now_utc().isoformat(),
                          "gateway_query": order,
                          "admin_note": f"Auto-reject (PayNow status {status_code})"}},
            )
    return credited


async def reconcile_pending_paynow_withdrawals() -> int:
    processing = await db.withdrawals.find({"gateway": "paynow", "status": "processing"}).to_list(200)
    orders = [w.get("merchant_order_no") for w in processing if w.get("merchant_order_no")]
    if not orders:
        return 0
    res = await paynow.query_payout(orders)
    if res.get("code") != 0:
        return 0
    settled = 0
    for order in (res.get("data") or []):
        mon = order.get("merchantOrderNo")
        status_code = int(order.get("status", 0) or 0)
        w = next((x for x in processing if x.get("merchant_order_no") == mon), None)
        if not w:
            continue
        if status_code == 2:
            await db.withdrawals.update_one(
                {"_id": w["_id"], "status": "processing"},
                {"$set": {"status": "approved", "processed_at": now_utc().isoformat(),
                          "gateway_query": order, "reconciled": True}},
            )
            await add_transaction(w["user_id"], "withdrawal", -w["amount"],
                                  "Withdrawal paid out (reconciled)",
                                  {"withdrawal_id": str(w["_id"]), "gateway": "paynow"})
            settled += 1
        elif status_code in (3, 4, 6):
            await db.users.update_one({"_id": w["user_id"]}, {"$inc": {"wallet_balance": w["amount"]}})
            await db.withdrawals.update_one(
                {"_id": w["_id"], "status": "processing"},
                {"$set": {"status": "rejected", "processed_at": now_utc().isoformat(),
                          "gateway_query": order,
                          "admin_note": f"Auto-reject (PayNow status {status_code})"}},
            )
            await add_transaction(w["user_id"], "withdrawal_refund", w["amount"],
                                  "Withdrawal failed - refunded (reconciled)",
                                  {"withdrawal_id": str(w["_id"]), "gateway": "paynow"})
    return settled
