"""Shared helpers for lazy profit-drop settling (used by /auth/me and /investments)."""
from datetime import datetime, timedelta

from db import db
from deps import now_utc, add_transaction


async def process_profit_drops(user: dict) -> dict:
    """Credit any due daily profits for the user's active investments."""
    now = now_utc()
    active = db.investments.find({"user_id": user["_id"], "status": "active"})
    total_credit = 0.0
    async for inv in active:
        last = inv.get("last_drop_at")
        if isinstance(last, str):
            last = datetime.fromisoformat(last)
        elif last is None:
            created = inv.get("created_at")
            last = datetime.fromisoformat(created) if isinstance(created, str) else created
        elapsed = now - last
        cycles_due = int(elapsed.total_seconds() // 86400)
        drops_done = inv.get("drops_done", 0)
        remaining = inv["duration_days"] - drops_done
        cycles = min(cycles_due, remaining)
        if cycles <= 0:
            continue
        daily = inv["price"] * (inv["daily_profit_pct"] / 100.0)
        credit = daily * cycles
        new_drops = drops_done + cycles
        new_last = last + timedelta(days=cycles)
        status = "completed" if new_drops >= inv["duration_days"] else "active"
        await db.investments.update_one(
            {"_id": inv["_id"]},
            {"$set": {"drops_done": new_drops, "last_drop_at": new_last.isoformat(),
                      "total_earned": inv.get("total_earned", 0.0) + credit, "status": status}},
        )
        total_credit += credit
        await add_transaction(user["_id"], "profit", credit,
                              f"Daily profit x{cycles} - {inv.get('product_name', 'Investment')}",
                              {"investment_id": str(inv["_id"])})
    if total_credit > 0:
        await db.users.update_one({"_id": user["_id"]},
                                  {"$inc": {"wallet_balance": total_credit, "total_earned": total_credit}})
        user = await db.users.find_one({"_id": user["_id"]})
    return user
