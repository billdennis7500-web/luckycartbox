from dotenv import load_dotenv
from pathlib import Path

ROOT_DIR = Path(__file__).parent
load_dotenv(ROOT_DIR / ".env")

import os
import re
import asyncio
import logging
import secrets
from datetime import datetime, timezone, timedelta
from typing import List, Optional, Annotated

import bcrypt
import httpx
import jwt
from bson import ObjectId
from fastapi import FastAPI, APIRouter, HTTPException, Depends, Request, Response, Query
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import PlainTextResponse
from motor.motor_asyncio import AsyncIOMotorClient
from pydantic import BaseModel, Field, ConfigDict, BeforeValidator

import paynow
import shpay
import onesspay
from nigerian_banks import filter_popular
from pymongo import ReturnDocument

# ---------------------------------------------------------------------------
# Config
# ---------------------------------------------------------------------------
JWT_ALGORITHM = "HS256"
ACCESS_TOKEN_MINUTES = 60 * 24  # 1 day
REFRESH_TOKEN_DAYS = 7

mongo_url = os.environ["MONGO_URL"]
client = AsyncIOMotorClient(mongo_url)
db = client[os.environ["DB_NAME"]]

app = FastAPI(title="Naija Invest Platform API")
api = APIRouter(prefix="/api")

logging.basicConfig(level=logging.INFO, format="%(asctime)s - %(name)s - %(levelname)s - %(message)s")
logger = logging.getLogger(__name__)


# ---------------------------------------------------------------------------
# Helpers - hashing / jwt
# ---------------------------------------------------------------------------
def hash_password(password: str) -> str:
    return bcrypt.hashpw(password.encode("utf-8"), bcrypt.gensalt()).decode("utf-8")


def verify_password(plain: str, hashed: str) -> bool:
    try:
        return bcrypt.checkpw(plain.encode("utf-8"), hashed.encode("utf-8"))
    except Exception:
        return False


def get_jwt_secret() -> str:
    return os.environ["JWT_SECRET"]


def create_access_token(user_id: str, role: str) -> str:
    payload = {
        "sub": user_id,
        "role": role,
        "type": "access",
        "exp": datetime.now(timezone.utc) + timedelta(minutes=ACCESS_TOKEN_MINUTES),
    }
    return jwt.encode(payload, get_jwt_secret(), algorithm=JWT_ALGORITHM)


def create_refresh_token(user_id: str) -> str:
    payload = {
        "sub": user_id,
        "type": "refresh",
        "exp": datetime.now(timezone.utc) + timedelta(days=REFRESH_TOKEN_DAYS),
    }
    return jwt.encode(payload, get_jwt_secret(), algorithm=JWT_ALGORITHM)


def set_auth_cookies(response: Response, access: str, refresh: str) -> None:
    response.set_cookie("access_token", access, httponly=True, secure=True, samesite="none",
                        max_age=ACCESS_TOKEN_MINUTES * 60, path="/")
    response.set_cookie("refresh_token", refresh, httponly=True, secure=True, samesite="none",
                        max_age=REFRESH_TOKEN_DAYS * 86400, path="/")


def clear_auth_cookies(response: Response) -> None:
    response.delete_cookie("access_token", path="/")
    response.delete_cookie("refresh_token", path="/")


def normalize_phone(phone: str) -> str:
    phone = phone.strip().replace(" ", "").replace("-", "")
    if phone.startswith("0") and len(phone) == 11:
        phone = "+234" + phone[1:]
    elif phone.startswith("234") and not phone.startswith("+"):
        phone = "+" + phone
    return phone


PHONE_RE = re.compile(r"^\+234\d{10}$")


def valid_phone(phone: str) -> bool:
    return bool(PHONE_RE.match(phone))


def gen_referral_code() -> str:
    return secrets.token_hex(4).upper()


def now_utc() -> datetime:
    return datetime.now(timezone.utc)


def iso(dt: datetime) -> str:
    if dt.tzinfo is None:
        dt = dt.replace(tzinfo=timezone.utc)
    return dt.isoformat()


def oid(value: str) -> ObjectId:
    try:
        return ObjectId(value)
    except Exception:
        raise HTTPException(status_code=400, detail="Invalid id")


def clean(doc: Optional[dict]) -> Optional[dict]:
    if doc is None:
        return None
    doc = dict(doc)
    if "_id" in doc:
        doc["id"] = str(doc.pop("_id"))
    doc.pop("password_hash", None)
    # Stringify any remaining ObjectId fields to keep FastAPI JSON serializer happy
    for k, v in list(doc.items()):
        if isinstance(v, ObjectId):
            doc[k] = str(v)
        elif isinstance(v, list):
            doc[k] = [str(x) if isinstance(x, ObjectId) else x for x in v]
    return doc


# ---------------------------------------------------------------------------
# Auth deps
# ---------------------------------------------------------------------------
async def get_current_user(request: Request) -> dict:
    token = request.cookies.get("access_token")
    if not token:
        h = request.headers.get("Authorization", "")
        if h.startswith("Bearer "):
            token = h[7:]
    if not token:
        raise HTTPException(status_code=401, detail="Not authenticated")
    try:
        payload = jwt.decode(token, get_jwt_secret(), algorithms=[JWT_ALGORITHM])
    except jwt.ExpiredSignatureError:
        raise HTTPException(status_code=401, detail="Token expired")
    except jwt.InvalidTokenError:
        raise HTTPException(status_code=401, detail="Invalid token")
    if payload.get("type") != "access":
        raise HTTPException(status_code=401, detail="Invalid token type")
    user = await db.users.find_one({"_id": ObjectId(payload["sub"])})
    if not user:
        raise HTTPException(status_code=401, detail="User not found")
    return user


async def get_admin_user(user: dict = Depends(get_current_user)) -> dict:
    if user.get("role") != "admin":
        raise HTTPException(status_code=403, detail="Admin only")
    return user


# ---------------------------------------------------------------------------
# Settings helpers
# ---------------------------------------------------------------------------
DEFAULT_SETTINGS = {
    "referral_gen1_pct": 20.0,
    "referral_gen2_pct": 5.0,
    "referral_gen3_pct": 2.0,
    "welcome_bonus": 500.0,
    "min_withdrawal": 1000.0,
    "min_deposit": 500.0,
    "site_name": "NaijaInvest",
    "telegram_url": "",
    "welcome_message": "Welcome to NaijaInvest — grow your money the smart way. Invest today, cash out tomorrow.",
    "withdrawal_fee_pct": 15.0,
    "auto_payout_enabled": False,
    "deposit_quick_amounts": [500, 1000, 2000, 5000, 10000, 20000],
    "batch_approve_limit": 50,
    # Admin-controlled gateway visibility. Each gateway can be toggled
    # independently for payin (deposits) and payout (withdrawals). Default:
    # every gateway on both directions is ON; admin can turn any off from the
    # AdminSettings → Payment Gateways panel.
    "gateway_toggles": {
        "paynow":   {"payin": True, "payout": True},
        "shpay":    {"payin": True, "payout": True},
        "onesspay": {"payin": True, "payout": True},
    },
}


# Recognised gateway keys — used to validate admin toggle input.
GATEWAY_KEYS = ("paynow", "shpay", "onesspay")


async def get_gateway_toggles() -> dict:
    """Return the current gateway toggles, merged with defaults so newly added
    gateways are always ON until an admin explicitly turns them off."""
    s = await get_settings()
    stored = s.get("gateway_toggles") or {}
    defaults = DEFAULT_SETTINGS["gateway_toggles"]
    out: dict = {}
    for g in GATEWAY_KEYS:
        cfg = stored.get(g) or {}
        out[g] = {
            "payin":  bool(cfg.get("payin",  defaults[g]["payin"])),
            "payout": bool(cfg.get("payout", defaults[g]["payout"])),
        }
    return out


def _gateway_module_enabled(gateway: str) -> bool:
    """Is the gateway module itself configured & enabled at the env level?"""
    if gateway == "paynow":   return paynow.enabled()
    if gateway == "shpay":    return shpay.enabled()
    if gateway == "onesspay": return onesspay.enabled()
    return False


async def gateway_payin_allowed(gateway: str) -> bool:
    """A gateway can serve payins only if BOTH (env-configured) AND (admin
    toggle says payin=True)."""
    if not _gateway_module_enabled(gateway):
        return False
    t = await get_gateway_toggles()
    return bool(t.get(gateway, {}).get("payin"))


async def gateway_payout_allowed(gateway: str) -> bool:
    if not _gateway_module_enabled(gateway):
        return False
    t = await get_gateway_toggles()
    return bool(t.get(gateway, {}).get("payout"))


# ---------------------------------------------------------------------------
# Bank code translation between gateways
# ---------------------------------------------------------------------------
# Each gateway uses its own bank code scheme:
#   • PayNow  : NG0xxx  (e.g. OPay = NG0204)
#   • SHPAY   : 6-digit (e.g. OPay = 100004)
#   • 1SSPay  : NR0xxx  (e.g. OPay = NR0140)
# The user's bank_account is bound with ONE code (usually PayNow's). When we
# route a payout through a different gateway, we translate by BANK NAME.

def _normalize_bank_name(name: str) -> str:
    """Lowercase, strip punctuation & extra whitespace so 'OPAY (PAYCOM)' matches
    'Opay' matches 'OPay (Paycom)'."""
    if not name: return ""
    n = name.lower()
    for ch in "()[]-.,·":
        n = n.replace(ch, " ")
    return " ".join(n.split())


async def translate_bank_code(bank_name: str, target_gateway: str,
                              *, current_code: Optional[str] = None) -> Optional[str]:
    """Given a bank NAME (e.g. 'OPay'), return the target gateway's bank code.
    Returns None if no match is found. If `current_code` is already in the target
    gateway's format (heuristic prefix check) we return it unchanged."""
    if not bank_name:
        return current_code
    # Fast-path: current_code already looks like target's format
    if current_code:
        if target_gateway == "paynow"   and current_code.startswith("NG0"):  return current_code
        if target_gateway == "onesspay" and current_code.startswith("NR0"):  return current_code
        if target_gateway == "shpay"    and current_code.isdigit() and 4 <= len(current_code) <= 6:
            return current_code
    key = _normalize_bank_name(bank_name)
    if not key:
        return None
    if target_gateway == "onesspay":
        for b in onesspay.NIGERIAN_BANKS:
            if _normalize_bank_name(b["name"]) == key:
                return b["code"]
        # fuzzy fallback — substring match either direction
        for b in onesspay.NIGERIAN_BANKS:
            nb = _normalize_bank_name(b["name"])
            if key in nb or nb in key:
                return b["code"]
        return None
    if target_gateway == "shpay":
        try:
            resp = await shpay.list_banks_cached()
        except Exception:
            return None
        rows = (resp.get("result") or []) if resp.get("success") else []
        for r in rows:
            if _normalize_bank_name(r.get("bankName", "")) == key:
                return r.get("bankCode")
        for r in rows:
            nb = _normalize_bank_name(r.get("bankName", ""))
            if key in nb or nb in key:
                return r.get("bankCode")
        return None
    if target_gateway == "paynow":
        try:
            resp = await paynow.list_banks_cached()
        except Exception:
            return None
        rows = (resp.get("data") or []) if resp.get("code") == 0 else []
        for r in rows:
            if _normalize_bank_name(r.get("bankName", "")) == key:
                return r.get("bankCode")
        for r in rows:
            nb = _normalize_bank_name(r.get("bankName", ""))
            if key in nb or nb in key:
                return r.get("bankCode")
        return None
    return None


async def dispatch_payout_via_enabled_gateway(w: dict, note: str = "") -> dict:
    """Try to pay out a withdrawal through each admin-enabled payout gateway,
    in priority order (paynow → shpay → onesspay). Bank codes are translated
    by bank name so a user's PayNow-format code still works via SHPAY/1SSPay.

    Returns the first successful gateway's response. Raises HTTPException(400)
    with a combined error message if all enabled gateways refuse.
    """
    errors: List[str] = []
    original_code = w.get("bank_code")
    bank_name = w.get("bank_name") or ""

    priority = ["paynow", "shpay", "onesspay"]
    tried_any = False
    for gw in priority:
        if not await gateway_payout_allowed(gw):
            continue
        # Translate bank_code for the target gateway; fall through if we can't
        # produce a valid code (missing bank name / no match in the target's list).
        translated = await translate_bank_code(bank_name, gw, current_code=original_code)
        if not translated:
            errors.append(f"{gw}: no matching bank code for '{bank_name}'")
            continue
        tried_any = True
        w_scoped = {**w, "bank_code": translated}
        try:
            if gw == "paynow":
                return await _paynow_payout_withdrawal(w_scoped, note=note)
            if gw == "shpay":
                return await _shpay_payout_withdrawal(w_scoped, note=note)
            if gw == "onesspay":
                w_scoped["onesspay_bank_code"] = translated
                return await _onesspay_payout_withdrawal(w_scoped, note=note)
        except HTTPException as e:
            errors.append(f"{gw}: {e.detail}")
            logger.info("Payout via %s failed for withdrawal %s: %s", gw, w["_id"], e.detail)
        except Exception as e:
            errors.append(f"{gw}: {str(e)}")
            logger.exception("Payout via %s crashed for withdrawal %s", gw, w["_id"])

    if not tried_any and not errors:
        raise HTTPException(400, "No payout gateways are currently enabled. Enable one from Admin → Payment Gateways.")
    raise HTTPException(400, "All enabled payout gateways refused this withdrawal: " + " | ".join(errors))


async def get_settings() -> dict:
    s = await db.settings.find_one({"_id": "global"})
    if not s:
        await db.settings.insert_one({"_id": "global", **DEFAULT_SETTINGS})
        return {"_id": "global", **DEFAULT_SETTINGS}
    # ensure all defaults exist
    for k, v in DEFAULT_SETTINGS.items():
        if k not in s:
            s[k] = v
    return s


# ---------------------------------------------------------------------------
# Startup: indexes + admin seed
# ---------------------------------------------------------------------------
@app.on_event("startup")
async def startup():
    await db.users.create_index("phone", unique=True, sparse=True)
    await db.users.create_index("email", unique=True, sparse=True)
    await db.users.create_index("referral_code", unique=True)
    await db.products.create_index("active")
    await db.investments.create_index("user_id")
    await db.transactions.create_index([("user_id", 1), ("created_at", -1)])
    await db.deposits.create_index([("user_id", 1), ("created_at", -1)])
    await db.withdrawals.create_index([("user_id", 1), ("created_at", -1)])
    await db.coupons.create_index("code", unique=True)
    await get_settings()

    admin_email = (os.environ.get("ADMIN_EMAIL") or "").lower().strip()
    admin_phone_raw = os.environ.get("ADMIN_PHONE") or ""
    admin_phone = normalize_phone(admin_phone_raw) if admin_phone_raw else None
    admin_password = os.environ.get("ADMIN_PASSWORD", "Admin@12345")
    admin_name = os.environ.get("ADMIN_NAME", "Platform Admin")

    # Prefer email as the primary admin identifier
    existing = None
    if admin_email:
        existing = await db.users.find_one({"email": admin_email})
    if not existing and admin_phone:
        existing = await db.users.find_one({"phone": admin_phone})

    admin_doc = {
        "name": admin_name,
        "password_hash": hash_password(admin_password),
        "role": "admin",
        "wallet_balance": 0.0,
        "bonus_balance": 0.0,
        "total_earned": 0.0,
        "total_invested": 0.0,
        "referral_code": "ADMIN001",
        "referred_by": None,
        "has_invested": False,
        "welcome_bonus_given": True,
        "created_at": now_utc().isoformat(),
    }
    if admin_email:
        admin_doc["email"] = admin_email
    if admin_phone:
        admin_doc["phone"] = admin_phone

    if not existing:
        try:
            await db.users.insert_one(admin_doc)
            logger.info("Seeded admin user email=%s phone=%s", admin_email or "-", admin_phone or "-")
        except Exception:
            logger.exception("Admin seed failed (dup?), attempting upsert")
            if admin_email:
                await db.users.update_one({"email": admin_email},
                                          {"$set": admin_doc, "$setOnInsert": {}}, upsert=True)
    else:
        # Update password + ensure email/phone/role are correct
        updates = {"password_hash": hash_password(admin_password), "role": "admin"}
        if admin_email:
            updates["email"] = admin_email
        if admin_phone:
            updates["phone"] = admin_phone
        if admin_name:
            updates["name"] = admin_name
        await db.users.update_one({"_id": existing["_id"]}, {"$set": updates})
        logger.info("Updated admin user %s", existing["_id"])

    # Seed default products if none exist
    if await db.products.count_documents({}) == 0:
        starter = [
            {"name": "Starter Plan", "price": 5000.0, "daily_profit_pct": 5.0, "duration_days": 30,
             "description": "Perfect for new investors. Low entry, steady growth.", "active": True,
             "created_at": now_utc().isoformat()},
            {"name": "Silver Plan", "price": 20000.0, "daily_profit_pct": 6.0, "duration_days": 30,
             "description": "Balanced returns for serious investors.", "active": True,
             "created_at": now_utc().isoformat()},
            {"name": "Gold Plan", "price": 100000.0, "daily_profit_pct": 7.5, "duration_days": 45,
             "description": "Elite tier for maximum ROI.", "active": True,
             "created_at": now_utc().isoformat()},
        ]
        await db.products.insert_many(starter)

    # Kick off background profit-drop cron
    asyncio.create_task(_profit_drop_cron())
    asyncio.create_task(_paynow_reconcile_cron())
    asyncio.create_task(_shpay_reconcile_cron())
    asyncio.create_task(_onesspay_reconcile_cron())


async def _paynow_reconcile_cron():
    """Every 5 minutes, poll PayNow for pending payin/payout orders and settle them."""
    await asyncio.sleep(45)
    while True:
        try:
            if paynow.enabled():
                await reconcile_pending_paynow_deposits()
                await reconcile_pending_paynow_withdrawals()
        except Exception:
            logger.exception("paynow reconcile cron error")
        await asyncio.sleep(5 * 60)


async def _shpay_reconcile_cron():
    """Every 5 minutes, poll SHPAY for pending payin/payout orders and settle them.
    This is a safety net for missed webhooks — the primary settlement path is the
    SHPAY webhook, but if we ever miss one (e.g. signature bug, network flap,
    downtime), the cron catches up within 5 minutes so users don't chase support."""
    await asyncio.sleep(60)  # stagger from paynow cron
    while True:
        try:
            if shpay.enabled():
                await reconcile_pending_shpay_deposits()
        except Exception:
            logger.exception("shpay reconcile cron error")
        await asyncio.sleep(5 * 60)


async def _onesspay_reconcile_cron():
    """Every 5 minutes, poll 1SSPay for pending payin/payout orders and settle them.
    Safety net for missed 1SSPay webhooks (same pattern as SHPAY/PayNow crons)."""
    await asyncio.sleep(75)  # stagger from shpay cron
    while True:
        try:
            if onesspay.enabled():
                await reconcile_pending_onesspay_deposits()
                await reconcile_pending_onesspay_withdrawals()
        except Exception:
            logger.exception("onesspay reconcile cron error")
        await asyncio.sleep(5 * 60)


async def reconcile_pending_onesspay_deposits() -> int:
    """Query 1SSPay for pending onesspay deposits and credit any that show status=2 (success)."""
    pending = await db.deposits.find({"gateway": "onesspay", "status": "pending"}).to_list(200)
    credited = 0
    for dep in pending:
        pay_no = dep.get("platform_order_no")
        if not pay_no:
            continue
        try:
            resp = await onesspay.query_payin(pay_no)
        except Exception:
            logger.exception("1SSPay query_payin failed for %s", pay_no)
            continue
        if int(resp.get("code") or 0) != 200:
            continue
        data = resp.get("data") or {}
        status = str(data.get("status") or "")
        if status == "2":  # success
            amount_real = float(data.get("amountReal") or dep["amount"] or 0)
            updated = await db.deposits.find_one_and_update(
                {"_id": dep["_id"], "status": "pending"},
                {"$set": {"status": "approved", "processed_at": now_utc().isoformat(),
                          "gateway_query": data,
                          "settled_amount": amount_real,
                          "reconciled": True}},
                return_document=ReturnDocument.AFTER,
            )
            if not updated:
                continue
            credit_amount = amount_real if amount_real > 0 else float(dep["amount"])
            await db.users.update_one({"_id": dep["user_id"]},
                                      {"$inc": {"wallet_balance": credit_amount}})
            await add_transaction(dep["user_id"], "deposit", credit_amount,
                                  "Deposit auto-credited (1SSPay reconciled)",
                                  {"deposit_id": str(dep["_id"]), "gateway": "onesspay"})
            logger.info("1SSPay reconcile credited user=%s amount=₦%.2f dep=%s",
                        dep["user_id"], credit_amount, dep["_id"])
            credited += 1
        elif status in ("3", "4"):
            await db.deposits.update_one(
                {"_id": dep["_id"], "status": "pending"},
                {"$set": {"status": "rejected", "processed_at": now_utc().isoformat(),
                          "gateway_query": data,
                          "gateway_error": data.get("failMsg") or "1SSPay reported failure"}},
            )
    return credited


async def reconcile_pending_onesspay_withdrawals() -> int:
    """Query 1SSPay for withdrawals in `processing` and settle them."""
    processing = await db.withdrawals.find({"gateway": "onesspay", "status": "processing"}).to_list(200)
    settled = 0
    for w in processing:
        pay_no = w.get("platform_order_no")
        if not pay_no:
            continue
        try:
            resp = await onesspay.query_payout(pay_no)
        except Exception:
            logger.exception("1SSPay query_payout failed for %s", pay_no)
            continue
        if int(resp.get("code") or 0) != 200:
            continue
        data = resp.get("data") or {}
        status = str(data.get("status") or "")
        if status == "2":  # success
            await db.withdrawals.update_one(
                {"_id": w["_id"], "status": "processing"},
                {"$set": {"status": "approved", "processed_at": now_utc().isoformat(),
                          "gateway_query": data, "reconciled": True}},
            )
            await settle_withdrawal_hold(w["user_id"], str(w["_id"]), "withdrawal",
                                          "Withdrawal paid out (1SSPay reconciled)")
            settled += 1
        elif status in ("3", "5"):
            await db.users.update_one({"_id": w["user_id"]},
                                      {"$inc": {"wallet_balance": float(w["amount"])}})
            await db.withdrawals.update_one(
                {"_id": w["_id"], "status": "processing"},
                {"$set": {"status": "rejected", "processed_at": now_utc().isoformat(),
                          "gateway_query": data,
                          "gateway_error": data.get("failMsg") or "1SSPay reported failure"}},
            )
            await add_transaction(w["user_id"], "withdrawal_refund", float(w["amount"]),
                                  "Withdrawal failed - refunded (1SSPay reconciled)",
                                  {"withdrawal_id": str(w["_id"]), "gateway": "onesspay"})
    return settled



async def reconcile_pending_shpay_deposits() -> int:
    """Query SHPAY for all pending SHPAY deposits and credit the ones that paid.
    Returns number of deposits credited. Uses `shpay.query_trans(out_trade_no=…)`
    per order because SHPAY does not expose a bulk query endpoint."""
    pending = await db.deposits.find({"gateway": "shpay", "status": "pending"}).to_list(200)
    credited = 0
    for dep in pending:
        mon = dep.get("merchant_order_no")
        if not mon:
            continue
        try:
            resp = await shpay.query_trans(out_trade_no=mon)
        except Exception:
            logger.exception("SHPAY query_trans failed for %s", mon)
            continue
        if not resp.get("success"):
            continue
        result = resp.get("result") or {}
        status = (result.get("transStatus") or "").upper()
        if status == "SUCCESS":
            trans_amt = float(result.get("transAmt") or dep["amount"] or 0)
            updated = await db.deposits.find_one_and_update(
                {"_id": dep["_id"], "status": "pending"},
                {"$set": {"status": "approved", "processed_at": now_utc().isoformat(),
                          "gateway_query": result,
                          "settled_amount": trans_amt,
                          "reconciled": True}},
                return_document=ReturnDocument.AFTER,
            )
            if not updated:
                continue  # someone else settled it first
            credit_amount = trans_amt if trans_amt > 0 else float(dep["amount"])
            await db.users.update_one({"_id": dep["user_id"]},
                                      {"$inc": {"wallet_balance": credit_amount}})
            await add_transaction(dep["user_id"], "deposit", credit_amount,
                                  "Deposit auto-credited (SHPAY reconciled)",
                                  {"deposit_id": str(dep["_id"]), "gateway": "shpay"})
            logger.info("SHPAY reconcile credited user=%s amount=₦%.2f dep=%s",
                        dep["user_id"], credit_amount, dep["_id"])
            credited += 1
        elif status == "FAIL":
            await db.deposits.update_one(
                {"_id": dep["_id"], "status": "pending"},
                {"$set": {"status": "rejected", "processed_at": now_utc().isoformat(),
                          "gateway_query": result,
                          "gateway_error": result.get("message") or "SHPAY reported failure"}},
            )
    return credited


async def reconcile_pending_paynow_deposits() -> int:
    """Query PayNow for all pending PayNow deposits and update if resolved. Returns number credited."""
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
        if status_code == 2:  # success
            amount = float(order.get("payAmount") or order.get("amount") or dep["amount"])
            await db.deposits.update_one(
                {"_id": dep["_id"], "status": "pending"},
                {"$set": {"status": "approved", "processed_at": now_utc().isoformat(),
                          "gateway_query": order, "credited_amount": amount,
                          "reconciled": True}},
            )
            await db.users.update_one({"_id": dep["user_id"]}, {"$inc": {"wallet_balance": amount}})
            await add_transaction(dep["user_id"], "deposit", amount,
                                  "Deposit approved (reconciled)",
                                  {"deposit_id": str(dep["_id"]), "gateway": "paynow"})
            credited += 1
        elif status_code in (3, 4, 6):  # failed/expired states
            await db.deposits.update_one(
                {"_id": dep["_id"], "status": "pending"},
                {"$set": {"status": "rejected", "processed_at": now_utc().isoformat(),
                          "gateway_query": order,
                          "admin_note": f"Auto-reject (PayNow status {status_code})"}},
            )
    return credited


async def reconcile_pending_paynow_withdrawals() -> int:
    """Query PayNow for withdrawals in processing state and settle them."""
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
            # Convert the original "withdrawal_hold" row into the final "withdrawal"
            # row (in-place, no duplicate debit line in the user's transaction feed).
            await settle_withdrawal_hold(w["user_id"], str(w["_id"]), "withdrawal",
                                          "Withdrawal paid out")
            settled += 1
        elif status_code in (3, 4, 6):
            # Refund and mark rejected
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


async def _profit_drop_cron():
    """Every 15 minutes, iterate all users with active investments and settle due profit drops."""
    await asyncio.sleep(30)  # let app fully start
    while True:
        try:
            user_ids = await db.investments.distinct("user_id", {"status": "active"})
            for uid in user_ids:
                u = await db.users.find_one({"_id": uid})
                if u:
                    try:
                        await process_profit_drops(u)
                    except Exception:
                        logger.exception("profit drop cron: user %s failed", uid)
            logger.info("profit_drop_cron cycle done (%d active users)", len(user_ids))
        except Exception:
            logger.exception("profit_drop_cron cycle error")
        await asyncio.sleep(15 * 60)


@app.on_event("shutdown")
async def shutdown():
    client.close()


# ---------------------------------------------------------------------------
# Schemas
# ---------------------------------------------------------------------------
class RegisterIn(BaseModel):
    phone: str
    password: str
    name: str
    referral_code: Optional[str] = None


class LoginIn(BaseModel):
    phone: Optional[str] = None
    email: Optional[str] = None
    password: str


class ProductIn(BaseModel):
    name: str
    price: float
    daily_profit_pct: float
    duration_days: int
    description: Optional[str] = ""
    active: bool = True


class InvestIn(BaseModel):
    product_id: str


class DepositCreateIn(BaseModel):
    amount: float
    method: str  # payment account id or name
    reference: Optional[str] = ""


class WithdrawCreateIn(BaseModel):
    amount: float
    # Bank fields optional — if omitted, we use the user's bound bank_account
    bank_name: Optional[str] = None
    account_number: Optional[str] = None
    account_name: Optional[str] = None
    bank_code: Optional[str] = None


class BankAccountIn(BaseModel):
    bank_code: str
    bank_name: str
    account_number: str
    account_name: str
    brand: Optional[dict] = None


class ApprovalIn(BaseModel):
    note: Optional[str] = ""


class BulkApprovalIn(BaseModel):
    ids: List[str]
    note: Optional[str] = ""


class AddBalanceIn(BaseModel):
    amount: float
    note: Optional[str] = "Admin credit"


class CouponIn(BaseModel):
    code: str
    amount: float
    max_uses: int = 1
    active: bool = True


class CouponRedeemIn(BaseModel):
    code: str


class AccountIn(BaseModel):
    bank_name: str
    account_name: str
    account_number: str
    active: bool = True


class SettingsIn(BaseModel):
    referral_gen1_pct: Optional[float] = None
    referral_gen2_pct: Optional[float] = None
    referral_gen3_pct: Optional[float] = None
    welcome_bonus: Optional[float] = None
    min_withdrawal: Optional[float] = None
    min_deposit: Optional[float] = None
    site_name: Optional[str] = None
    telegram_url: Optional[str] = None
    welcome_message: Optional[str] = None
    withdrawal_fee_pct: Optional[float] = None
    auto_payout_enabled: Optional[bool] = None
    deposit_quick_amounts: Optional[List[float]] = None
    batch_approve_limit: Optional[int] = None


# ---------------------------------------------------------------------------
# Transactions helper
# ---------------------------------------------------------------------------
async def add_transaction(user_id: ObjectId, tx_type: str, amount: float, note: str = "", meta: Optional[dict] = None):
    doc = {
        "user_id": user_id,
        "type": tx_type,
        "amount": amount,
        "note": note,
        "meta": meta or {},
        "created_at": now_utc().isoformat(),
    }
    await db.transactions.insert_one(doc)


async def settle_withdrawal_hold(user_id: ObjectId, withdrawal_id: str, new_type: str, new_note: str) -> None:
    """Convert the existing ``withdrawal_hold`` transaction for a withdrawal into its
    terminal state (``withdrawal`` on approval). Prevents a second identical-amount
    debit row appearing in the user's transaction history alongside the original hold.

    Falls back to appending a fresh transaction only if the hold row is missing
    (defensive — shouldn't happen but guarantees an audit trail either way).
    """
    result = await db.transactions.update_one(
        {"user_id": user_id, "type": "withdrawal_hold", "meta.withdrawal_id": withdrawal_id},
        {"$set": {"type": new_type, "note": new_note, "settled_at": now_utc().isoformat()}},
    )
    if result.matched_count == 0:
        # Hold row missing — append a normal transaction so the user still has a receipt.
        await add_transaction(user_id, new_type, 0.0, new_note, {"withdrawal_id": withdrawal_id, "orphaned": True})


# ---------------------------------------------------------------------------
# Daily profit drop (lazy on read)
# ---------------------------------------------------------------------------
async def process_profit_drops(user: dict) -> dict:
    """Credit any due daily profits for the user's active investments."""
    now = now_utc()
    active = db.investments.find({"user_id": user["_id"], "status": "active"})
    total_credit = 0.0
    async for inv in active:
        last = inv.get("last_drop_at")
        if isinstance(last, str):
            last = datetime.fromisoformat(last)
        else:
            last = datetime.fromisoformat(inv["created_at"]) if isinstance(inv.get("created_at"), str) else inv["created_at"]
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


# ---------------------------------------------------------------------------
# Auth endpoints
# ---------------------------------------------------------------------------
@api.post("/auth/register")
async def register(payload: RegisterIn, response: Response):
    phone = normalize_phone(payload.phone)
    if not valid_phone(phone):
        raise HTTPException(400, "Invalid Nigerian phone number. Use +234XXXXXXXXXX or 0XXXXXXXXXX")
    if len(payload.password) < 6:
        raise HTTPException(400, "Password must be at least 6 characters")
    if not payload.name.strip():
        raise HTTPException(400, "Name is required")
    if await db.users.find_one({"phone": phone}):
        raise HTTPException(400, "Phone already registered")

    settings = await get_settings()
    referred_by = None
    if payload.referral_code:
        ref_user = await db.users.find_one({"referral_code": payload.referral_code.upper().strip()})
        if not ref_user:
            raise HTTPException(400, "Invalid referral code")
        referred_by = ref_user["_id"]

    # generate unique referral code
    for _ in range(5):
        code = gen_referral_code()
        if not await db.users.find_one({"referral_code": code}):
            break

    welcome = float(settings.get("welcome_bonus", 500.0))
    doc = {
        "phone": phone,
        "name": payload.name.strip(),
        "password_hash": hash_password(payload.password),
        "role": "user",
        # Welcome bonus is credited directly into the spendable wallet_balance so
        # it's usable for investments (purchases debit wallet_balance). The
        # withdrawal endpoint still gates on `has_invested == True`, so the bonus
        # can't be cashed out without investing first — preserving the anti-farm
        # policy while making the bonus visible/useful.
        "wallet_balance": welcome,
        "bonus_balance": 0.0,
        "total_earned": 0.0,
        "total_invested": 0.0,
        "referral_code": code,
        "referred_by": referred_by,
        "has_invested": False,
        "welcome_bonus_given": True,
        "created_at": now_utc().isoformat(),
    }
    res = await db.users.insert_one(doc)
    await add_transaction(res.inserted_id, "welcome_bonus", welcome,
                          f"Welcome bonus (₦{welcome:.0f})",
                          {"credits_wallet": True})

    access = create_access_token(str(res.inserted_id), "user")
    refresh = create_refresh_token(str(res.inserted_id))
    set_auth_cookies(response, access, refresh)
    user = await db.users.find_one({"_id": res.inserted_id})
    return {"user": clean(user), "access_token": access}


@api.post("/auth/login")
async def login(payload: LoginIn, response: Response):
    identifier = (payload.email or payload.phone or "").strip()
    if not identifier or not payload.password:
        raise HTTPException(400, "Email/phone and password required")
    if "@" in identifier:
        user = await db.users.find_one({"email": identifier.lower()})
    else:
        phone = normalize_phone(identifier)
        user = await db.users.find_one({"phone": phone})
    if not user or not verify_password(payload.password, user["password_hash"]):
        raise HTTPException(401, "Invalid credentials")
    access = create_access_token(str(user["_id"]), user.get("role", "user"))
    refresh = create_refresh_token(str(user["_id"]))
    set_auth_cookies(response, access, refresh)
    return {"user": clean(user), "access_token": access}


@api.post("/auth/logout")
async def logout(response: Response, user: dict = Depends(get_current_user)):
    clear_auth_cookies(response)
    return {"ok": True}


@api.get("/auth/me")
async def me(user: dict = Depends(get_current_user)):
    user = await process_profit_drops(user)
    return clean(user)


# ---------------------------------------------------------------------------
# Products (public list + admin CRUD)
# ---------------------------------------------------------------------------
@api.get("/products")
async def list_products(user: dict = Depends(get_current_user)):
    query = {} if user.get("role") == "admin" else {"active": True}
    docs = await db.products.find(query).sort("price", 1).to_list(200)
    return [clean(d) for d in docs]


@api.post("/admin/products")
async def create_product(p: ProductIn, admin: dict = Depends(get_admin_user)):
    doc = p.model_dump()
    doc["created_at"] = now_utc().isoformat()
    res = await db.products.insert_one(doc)
    return clean(await db.products.find_one({"_id": res.inserted_id}))


@api.put("/admin/products/{pid}")
async def update_product(pid: str, p: ProductIn, admin: dict = Depends(get_admin_user)):
    await db.products.update_one({"_id": oid(pid)}, {"$set": p.model_dump()})
    return clean(await db.products.find_one({"_id": oid(pid)}))


@api.delete("/admin/products/{pid}")
async def delete_product(pid: str, admin: dict = Depends(get_admin_user)):
    await db.products.delete_one({"_id": oid(pid)})
    return {"ok": True}


# ---------------------------------------------------------------------------
# Investments
# ---------------------------------------------------------------------------
@api.post("/invest")
async def invest(payload: InvestIn, user: dict = Depends(get_current_user)):
    product = await db.products.find_one({"_id": oid(payload.product_id), "active": True})
    if not product:
        raise HTTPException(404, "Product not found")
    price = float(product["price"])
    if user["wallet_balance"] < price:
        raise HTTPException(400, "Insufficient wallet balance. Please deposit funds.")

    # Deduct
    await db.users.update_one(
        {"_id": user["_id"]},
        {"$inc": {"wallet_balance": -price, "total_invested": price},
         "$set": {"has_invested": True}},
    )
    inv_doc = {
        "user_id": user["_id"],
        "product_id": product["_id"],
        "product_name": product["name"],
        "price": price,
        "daily_profit_pct": float(product["daily_profit_pct"]),
        "duration_days": int(product["duration_days"]),
        "drops_done": 0,
        "total_earned": 0.0,
        "status": "active",
        "created_at": now_utc().isoformat(),
        "last_drop_at": now_utc().isoformat(),
    }
    res = await db.investments.insert_one(inv_doc)
    await add_transaction(user["_id"], "investment", -price,
                          f"Invested in {product['name']}", {"investment_id": str(res.inserted_id)})

    # Referral commissions
    settings = await get_settings()
    pcts = [settings["referral_gen1_pct"], settings["referral_gen2_pct"], settings["referral_gen3_pct"]]
    current_ref = user.get("referred_by")
    for gen, pct in enumerate(pcts, start=1):
        if not current_ref:
            break
        ref_user = await db.users.find_one({"_id": current_ref})
        if not ref_user:
            break
        commission = price * (pct / 100.0)
        if commission > 0:
            await db.users.update_one(
                {"_id": ref_user["_id"]},
                {"$inc": {"wallet_balance": commission, "total_earned": commission}},
            )
            await add_transaction(
                ref_user["_id"], "referral", commission,
                f"Gen {gen} referral commission ({pct}%) from {user['name']}",
                {"generation": gen, "from_user": str(user["_id"])},
            )
        current_ref = ref_user.get("referred_by")

    return clean(await db.investments.find_one({"_id": res.inserted_id}))


@api.get("/investments")
async def my_investments(user: dict = Depends(get_current_user)):
    user = await process_profit_drops(user)
    docs = await db.investments.find({"user_id": user["_id"]}).sort("created_at", -1).to_list(500)
    out = []
    for d in docs:
        d["id"] = str(d.pop("_id"))
        d["user_id"] = str(d["user_id"])
        d["product_id"] = str(d["product_id"])
        out.append(d)
    return out


# ---------------------------------------------------------------------------
# Deposits
# ---------------------------------------------------------------------------
@api.get("/payment-accounts")
async def user_payment_accounts(user: dict = Depends(get_current_user)):
    docs = await db.payment_accounts.find({"active": True}).to_list(50)
    return [clean(d) for d in docs]


@api.post("/deposits")
async def create_deposit(payload: DepositCreateIn, user: dict = Depends(get_current_user)):
    settings = await get_settings()
    if payload.amount < settings["min_deposit"]:
        raise HTTPException(400, f"Minimum deposit is ₦{settings['min_deposit']:.0f}")

    doc = {
        "user_id": user["_id"],
        "user_name": user["name"],
        "user_phone": user["phone"],
        "amount": float(payload.amount),
        "method": payload.method,
        "reference": payload.reference or "",
        "status": "pending",
        "gateway": "manual",
        "created_at": now_utc().isoformat(),
    }

    # If a payment account id was chosen, enrich with bank details so the
    # admin table can show "which account did the user try to pay into".
    if payload.method and not any(payload.method.startswith(p) for p in ("paynow", "shpay", "onesspay")):
        try:
            pa = await db.payment_accounts.find_one({"_id": oid(payload.method)})
        except Exception:
            pa = None
        if pa:
            doc["payment_account_id"] = str(pa["_id"])
            doc["payment_account_bank"] = pa.get("bank_name")
            doc["payment_account_number"] = pa.get("account_number")
            doc["payment_account_name"] = pa.get("account_name")

    # Enforce admin gateway payin toggles — reject early with a friendly error
    # if the user picked a gateway that admin has switched off.
    method_prefix = (payload.method or "").split("-")[0] if payload.method else ""
    if method_prefix in GATEWAY_KEYS and not await gateway_payin_allowed(method_prefix):
        raise HTTPException(400, "This payment option is temporarily unavailable. Please choose another method.")

    # If Paynow auto-flow is enabled AND user chose it (method starts with "paynow"),
    # create the payin at PayNow and store the checkout URL.
    if paynow.enabled() and (payload.method or "").startswith("paynow"):
        # If the server IP is currently not whitelisted at PayNow, we can't produce
        # a real checkout link. Rather than throw, return a well-formed deposit that
        # tells the UI to show a friendly inline "gateway unavailable" state inside
        # the checkout drawer (with a bank-transfer fallback CTA). This keeps the
        # Instant Pay tile visible to users and stops the "why is it missing?" bug.
        if paynow.ip_blocked():
            # Try to grab the outbound IP so the UI can tell the merchant exactly
            # which IP to whitelist. Best-effort — do not fail the deposit path
            # if the ipify probe is slow.
            outbound_ip = "unknown"
            try:
                async with httpx.AsyncClient(timeout=3.0) as _c:
                    r = await _c.get("https://api.ipify.org")
                    outbound_ip = r.text.strip() or "unknown"
            except Exception:
                pass
            doc.update({
                "status": "failed",
                "gateway": "paynow",
                "gateway_error": paynow.ip_block_note() or "Gateway IP not whitelisted",
            })
            res = await db.deposits.insert_one(doc)
            d = await db.deposits.find_one({"_id": res.inserted_id})
            return clean(d) | {
                "user_id": str(d["user_id"]),
                "gateway": "paynow",
                "checkout_url": None,
                "gateway_ready": False,
                "outbound_ip": outbound_ip,
                "gateway_message": f"Our payment gateway is rejecting requests from this server (IP {outbound_ip}). Whitelist this IP in your PayNow merchant dashboard and tap Retry — Instant Pay will start working immediately.",
            }

        res = await db.deposits.insert_one(doc)
        merchant_order_no = f"D{str(res.inserted_id)[-16:]}{int(datetime.now().timestamp())}"
        name_parts = (user.get("name") or "").split()
        first = name_parts[0] if name_parts else "User"
        last = " ".join(name_parts[1:]) or first
        try:
            pn = await paynow.create_payin(
                merchant_order_no, float(payload.amount),
                payer_key=user["phone"], first_name=first, last_name=last,
            )
        except Exception as e:
            logger.exception("PayNow create_payin failed")
            await db.deposits.update_one({"_id": res.inserted_id},
                                         {"$set": {"status": "failed", "gateway_error": str(e)}})
            # 400 (not 502) so Cloudflare passes our message through instead of
            # replacing the response body with its own error page.
            raise HTTPException(400, f"Payment gateway is not reachable right now. Please try a bank transfer or retry in a minute.")

        pn_data = pn.get("data") or {}
        checkout_url = pn_data.get("link")
        platform_order_no = pn_data.get("orderNo")
        if pn.get("code") != 0 or not checkout_url:
            gateway_error = pn.get("msg") or "no checkout link"
            await db.deposits.update_one({"_id": res.inserted_id},
                                         {"$set": {"status": "failed",
                                                   "gateway_error": gateway_error,
                                                   "gateway_response": pn}})
            # Return the same well-formed "gateway_ready=false" shape as the
            # IP-block branch so the frontend opens the drawer with the retry
            # button + bank-transfer fallback CTA. Without this the user only
            # gets a toast error and no easy recovery path — the "system is
            # busy" case reported to us in production.
            outbound_ip = "unknown"
            try:
                async with httpx.AsyncClient(timeout=3.0) as _c:
                    r = await _c.get("https://api.ipify.org")
                    outbound_ip = r.text.strip() or "unknown"
            except Exception:
                pass
            d = await db.deposits.find_one({"_id": res.inserted_id})
            return clean(d) | {
                "user_id": str(d["user_id"]),
                "gateway": "paynow",
                "checkout_url": None,
                "gateway_ready": False,
                "outbound_ip": outbound_ip,
                "gateway_message": (
                    f"Instant Pay is momentarily unavailable ({gateway_error}). "
                    "Please try again in a few seconds, or pick a bank transfer option."
                ),
            }

        await db.deposits.update_one(
            {"_id": res.inserted_id},
            {"$set": {"gateway": "paynow", "merchant_order_no": merchant_order_no,
                      "platform_order_no": platform_order_no, "checkout_url": checkout_url,
                      "gateway_response": pn}},
        )
        d = await db.deposits.find_one({"_id": res.inserted_id})
        return clean(d) | {"user_id": str(d["user_id"])}

    # SHPAY auto-flow — mirrors PayNow. Users pick this by choosing method "shpay-auto".
    if shpay.enabled() and (payload.method or "").startswith("shpay"):
        res = await db.deposits.insert_one(doc)
        out_trade_no = f"S{str(res.inserted_id)[-16:]}{int(datetime.now().timestamp())}"
        # Defensive lookups — user record may be missing name / email in edge cases
        # (registration-in-progress, admin-created placeholder, migrated data).
        u_phone = (user.get("phone") or "").lstrip("+")
        u_name  = user.get("name") or "User"
        u_email = user.get("email") or f"{u_phone or 'user'}@naijainvest.local"
        try:
            sp = await shpay.create_payin(
                out_trade_no,
                float(payload.amount),
                payer_name=u_name,
                payer_mobile=u_phone[-10:] if u_phone else None,
                payer_email=u_email,
                subject="Wallet deposit",
                body=f"NaijaInvest deposit for {u_name}",
            )
        except Exception as e:
            logger.exception("SHPAY create_payin failed")
            await db.deposits.update_one({"_id": res.inserted_id},
                                         {"$set": {"status": "failed", "gateway_error": str(e)}})
            raise HTTPException(400, "SHPAY is not reachable right now. Please try a bank transfer or retry in a minute.")

        if not sp.get("success"):
            gateway_error = sp.get("message") or "SHPAY declined the order"
            await db.deposits.update_one({"_id": res.inserted_id},
                                         {"$set": {"status": "failed",
                                                   "gateway_error": gateway_error,
                                                   "gateway_response": sp}})
            outbound_ip = "unknown"
            try:
                async with httpx.AsyncClient(timeout=3.0) as _c:
                    r = await _c.get("https://api.ipify.org")
                    outbound_ip = r.text.strip() or "unknown"
            except Exception:
                pass
            d = await db.deposits.find_one({"_id": res.inserted_id})
            return clean(d) | {
                "user_id": str(d["user_id"]),
                "gateway": "shpay",
                "checkout_url": None,
                "gateway_ready": False,
                "outbound_ip": outbound_ip,
                "gateway_message": (
                    f"SHPAY is momentarily unavailable ({gateway_error}). "
                    "If this is your first request, whitelist your server IP in the SHPAY dashboard."
                ),
            }

        sp_result = sp.get("result") or {}
        checkout_url = sp_result.get("link")
        trans_no = sp_result.get("transNo")
        await db.deposits.update_one(
            {"_id": res.inserted_id},
            {"$set": {"gateway": "shpay",
                      "merchant_order_no": out_trade_no,
                      "platform_order_no": trans_no,
                      "checkout_url": checkout_url,
                      "gateway_response": sp}},
        )
        d = await db.deposits.find_one({"_id": res.inserted_id})
        return clean(d) | {"user_id": str(d["user_id"])}

    # 1SSPay auto-flow — third gateway. Users pick method "onesspay-auto".
    if onesspay.enabled() and (payload.method or "").startswith("onesspay"):
        res = await db.deposits.insert_one(doc)
        order_no = f"O{str(res.inserted_id)[-16:]}{int(datetime.now().timestamp())}"
        u_phone = (user.get("phone") or "").lstrip("+")
        u_name  = user.get("name") or "User"
        u_email = user.get("email") or f"{u_phone or 'user'}@naijainvest.local"
        try:
            resp = await onesspay.create_payin(
                order_no=order_no,
                amount=float(payload.amount),
                name=u_name,
                phone=u_phone[-10:] if u_phone else "0000000000",
                email=u_email,
            )
        except Exception as e:
            logger.exception("1SSPay create_payin failed")
            await db.deposits.update_one({"_id": res.inserted_id},
                                         {"$set": {"status": "failed", "gateway_error": str(e)}})
            raise HTTPException(400, "1SSPay is not reachable right now. Please try another payment option.")

        if int(resp.get("code") or 0) != 200:
            gateway_error = resp.get("msg") or "1SSPay declined the order"
            await db.deposits.update_one({"_id": res.inserted_id},
                                         {"$set": {"status": "failed",
                                                   "gateway_error": gateway_error,
                                                   "gateway_response": resp}})
            outbound_ip = "unknown"
            try:
                async with httpx.AsyncClient(timeout=3.0) as _c:
                    r = await _c.get("https://api.ipify.org")
                    outbound_ip = r.text.strip() or "unknown"
            except Exception:
                pass
            d = await db.deposits.find_one({"_id": res.inserted_id})
            return clean(d) | {
                "user_id": str(d["user_id"]),
                "gateway": "onesspay",
                "checkout_url": None,
                "gateway_ready": False,
                "outbound_ip": outbound_ip,
                "gateway_message": (
                    f"Fast Pay is momentarily unavailable ({gateway_error}). "
                    "If this is your first request, ask your merchant to whitelist your server IP in the 1SSPay dashboard."
                ),
            }

        data = resp.get("data") or {}
        checkout_url = data.get("jumpUrl")
        pay_no = data.get("payNo")
        await db.deposits.update_one(
            {"_id": res.inserted_id},
            {"$set": {"gateway": "onesspay",
                      "merchant_order_no": order_no,
                      "platform_order_no": pay_no,
                      "checkout_url": checkout_url,
                      "gateway_response": resp}},
        )
        d = await db.deposits.find_one({"_id": res.inserted_id})
        return clean(d) | {"user_id": str(d["user_id"])}

    # Manual flow (existing behavior)
    res = await db.deposits.insert_one(doc)
    return clean(await db.deposits.find_one({"_id": res.inserted_id}))


@api.get("/deposits")
async def my_deposits(user: dict = Depends(get_current_user)):
    docs = await db.deposits.find({"user_id": user["_id"]}).sort("created_at", -1).to_list(200)
    return [clean(d) | {"user_id": str(d["user_id"])} for d in docs]


@api.post("/deposits/{did}/verify")
async def user_verify_deposit(did: str, user: dict = Depends(get_current_user)):
    """Let a user self-check their own PayNow deposit and credit the wallet if PayNow reports paid.
    Safer than the admin endpoint because it only touches the caller's own deposits."""
    dep = await db.deposits.find_one({"_id": oid(did), "user_id": user["_id"]})
    if not dep:
        raise HTTPException(404, "Deposit not found")
    if dep.get("gateway") != "paynow" or not dep.get("merchant_order_no"):
        raise HTTPException(400, "Only PayNow deposits can be verified")
    if dep["status"] != "pending":
        return {"ok": True, "status": dep["status"]}
    res = await paynow.query_payin([dep["merchant_order_no"]])
    if res.get("code") != 0:
        raise HTTPException(502, f"PayNow query failed: {res.get('msg') or 'unknown'}")
    orders = res.get("data") or []
    order = next((o for o in orders if o.get("merchantOrderNo") == dep["merchant_order_no"]), None)
    if not order:
        return {"ok": True, "status": "pending"}
    status_code = int(order.get("status", 0) or 0)
    if status_code == 2:
        amount = float(order.get("payAmount") or order.get("amount") or dep["amount"])
        await db.deposits.update_one(
            {"_id": dep["_id"], "status": "pending"},
            {"$set": {"status": "approved", "processed_at": now_utc().isoformat(),
                      "gateway_query": order, "credited_amount": amount, "reconciled": True}},
        )
        await db.users.update_one({"_id": dep["user_id"]}, {"$inc": {"wallet_balance": amount}})
        await add_transaction(dep["user_id"], "deposit", amount,
                              "Deposit approved (self-verify)",
                              {"deposit_id": str(dep["_id"]), "gateway": "paynow"})
        return {"ok": True, "status": "approved", "amount": amount}
    return {"ok": True, "status": "pending", "paynow_status": status_code}


# ---------------------------------------------------------------------------
# Withdrawals
# ---------------------------------------------------------------------------
async def _paynow_payout_withdrawal(w: dict, note: str = "") -> dict:
    """Trigger PayNow payout for a withdrawal (net of fee). Raises on gateway error."""
    payout_amount = float(w.get("payout_amount") or w.get("amount") or 0)
    merchant_order_no = f"W{str(w['_id'])[-16:]}{int(datetime.now().timestamp())}"
    pn = await paynow.create_payout(
        merchant_order_no=merchant_order_no,
        amount=payout_amount,
        bank_code=w["bank_code"],
        account_name=w["account_name"],
        account_no=w["account_number"],
        remarks=note or "Withdrawal",
    )
    if pn.get("code") != 0:
        raise HTTPException(400, f"Gateway declined: {pn.get('msg') or 'unknown'}")
    pn_data = pn.get("data") or {}
    await db.withdrawals.update_one(
        {"_id": w["_id"]},
        {"$set": {
            "status": "processing",
            "processed_at": now_utc().isoformat(),
            "admin_note": note or "",
            "gateway": "paynow",
            "merchant_order_no": merchant_order_no,
            "platform_order_no": pn_data.get("orderNo"),
            "gateway_response": pn,
        }},
    )
    return pn


async def _shpay_payout_withdrawal(w: dict, note: str = "") -> dict:
    """Trigger a SHPAY payout for a withdrawal (net of fee). Raises on gateway error.

    Same shape as `_paynow_payout_withdrawal` so admin endpoints can dispatch to
    either gateway without conditional branches.
    """
    payout_amount = float(w.get("payout_amount") or w.get("amount") or 0)
    out_trade_no = f"SW{str(w['_id'])[-15:]}{int(datetime.now().timestamp())}"
    sp = await shpay.create_payout(
        out_trade_no=out_trade_no,
        amount=payout_amount,
        account_name=w["account_name"],
        account_no=w["account_number"],
        bank_code=w["bank_code"],
        subject=note or "Withdrawal",
    )
    if not sp.get("success"):
        raise HTTPException(400, f"SHPAY declined: {sp.get('message') or 'unknown'}")
    result = sp.get("result") or {}
    await db.withdrawals.update_one(
        {"_id": w["_id"]},
        {"$set": {
            "status": "processing",
            "processed_at": now_utc().isoformat(),
            "admin_note": note or "",
            "gateway": "shpay",
            "merchant_order_no": out_trade_no,
            "platform_order_no": result.get("transNo"),
            "gateway_response": sp,
        }},
    )
    return sp


async def _onesspay_payout_withdrawal(w: dict, note: str = "") -> dict:
    """Trigger a 1SSPay payout for a withdrawal (net of fee). Raises on gateway error.

    Note: 1SSPay uses its own bank code scheme (`NR0xxx`). If the withdrawal's
    stored `bank_code` is in PayNow/SHPAY format, admin can either provide the
    1SSPay code manually via the `w["onesspay_bank_code"]` override or the
    caller must map it before calling this helper.
    """
    payout_amount = float(w.get("payout_amount") or w.get("amount") or 0)
    order_no = f"OW{str(w['_id'])[-15:]}{int(datetime.now().timestamp())}"
    bank_code = w.get("onesspay_bank_code") or w.get("bank_code") or ""
    if not bank_code:
        raise HTTPException(400, "This withdrawal has no bank code — user must re-bind their bank first.")
    resp = await onesspay.create_payout(
        order_no=order_no,
        amount=payout_amount,
        name=w["account_name"],
        account_num=w["account_number"],
        bank_code=bank_code,
        phone=(w.get("user_phone") or "").lstrip("+")[-10:] or None,
    )
    if int(resp.get("code") or 0) != 200:
        raise HTTPException(400, f"1SSPay declined: {resp.get('msg') or 'unknown'}")
    data = resp.get("data") or {}
    await db.withdrawals.update_one(
        {"_id": w["_id"]},
        {"$set": {
            "status": "processing",
            "processed_at": now_utc().isoformat(),
            "admin_note": note or "",
            "gateway": "onesspay",
            "merchant_order_no": order_no,
            "platform_order_no": data.get("payNo"),
            "gateway_response": resp,
        }},
    )
    return resp


@api.post("/withdrawals")
async def create_withdrawal(payload: WithdrawCreateIn, user: dict = Depends(get_current_user)):
    if not user.get("has_invested"):
        raise HTTPException(400, "You must invest first before withdrawing")
    settings = await get_settings()
    if payload.amount < settings["min_withdrawal"]:
        raise HTTPException(400, f"Minimum withdrawal is ₦{settings['min_withdrawal']:.0f}")
    if payload.amount > user["wallet_balance"]:
        raise HTTPException(400, "Insufficient balance")

    # Resolve bank details: prefer explicit payload, else fall back to the user's bound account
    bank_code = (payload.bank_code or "").strip()
    bank_name = (payload.bank_name or "").strip()
    account_number = (payload.account_number or "").strip()
    account_name = (payload.account_name or "").strip()
    if not (bank_name and account_number and account_name):
        bound = user.get("bank_account") or {}
        bank_code = bank_code or (bound.get("bank_code") or "")
        bank_name = bank_name or (bound.get("bank_name") or "")
        account_number = account_number or (bound.get("account_number") or "")
        account_name = account_name or (bound.get("account_name") or "")
    if not (bank_name and account_number and account_name):
        raise HTTPException(400, "Please bind a bank account before withdrawing")

    # Compute platform fee + net payout
    fee_pct = float(settings.get("withdrawal_fee_pct") or 0)
    fee = round(float(payload.amount) * fee_pct / 100.0, 2)
    payout_amount = round(float(payload.amount) - fee, 2)

    # Hold the gross amount from the user's wallet
    await db.users.update_one({"_id": user["_id"]}, {"$inc": {"wallet_balance": -payload.amount}})
    doc = {
        "user_id": user["_id"],
        "user_name": user["name"],
        "user_phone": user["phone"],
        "amount": float(payload.amount),
        "fee": fee,
        "fee_pct": fee_pct,
        "payout_amount": payout_amount,
        "bank_name": bank_name,
        "account_number": account_number,
        "account_name": account_name,
        "bank_code": bank_code,
        "status": "pending",
        "created_at": now_utc().isoformat(),
    }
    res = await db.withdrawals.insert_one(doc)
    await add_transaction(user["_id"], "withdrawal_hold", -payload.amount,
                          f"Withdrawal requested (fee ₦{fee:.0f}, payout ₦{payout_amount:.0f})",
                          {"withdrawal_id": str(res.inserted_id), "fee": fee, "payout_amount": payout_amount})

    # Auto-payout when admin has enabled it AND we have a bank_code AND at least one
    # payout gateway toggle is on. The dispatcher tries paynow → shpay → onesspay
    # and translates bank codes across gateway formats by bank name.
    toggles = await get_gateway_toggles()
    any_payout_gateway_on = any(
        _gateway_module_enabled(g) and toggles.get(g, {}).get("payout")
        for g in GATEWAY_KEYS
    )
    auto_ok = bool(settings.get("auto_payout_enabled")) and any_payout_gateway_on and bool(bank_code)
    if auto_ok:
        w = await db.withdrawals.find_one({"_id": res.inserted_id})
        try:
            await dispatch_payout_via_enabled_gateway(w, note="Auto-payout")
        except HTTPException as e:
            # Log the failure but leave withdrawal pending so admin can retry manually
            logger.warning(f"Auto-payout failed for withdrawal {res.inserted_id}: {e.detail}")
        except Exception:
            logger.exception("Auto-payout unexpected failure")

    return clean(await db.withdrawals.find_one({"_id": res.inserted_id}))


@api.get("/me/bank-account")
async def get_my_bank_account(user: dict = Depends(get_current_user)):
    return user.get("bank_account") or None


@api.post("/me/bank-account")
async def save_my_bank_account(payload: BankAccountIn, user: dict = Depends(get_current_user)):
    acc = (payload.account_number or "").strip()
    if not acc.isdigit() or not (9 <= len(acc) <= 12):
        raise HTTPException(400, "Account number must be 9-12 digits")
    if not (payload.account_name or "").strip():
        raise HTTPException(400, "Account name is required")
    if not (payload.bank_name or "").strip():
        raise HTTPException(400, "Bank is required")
    bank_account = {
        "bank_code": (payload.bank_code or "").strip(),
        "bank_name": payload.bank_name.strip(),
        "account_number": acc,
        "account_name": payload.account_name.strip(),
        "brand": payload.brand or None,
        "updated_at": now_utc().isoformat(),
    }
    await db.users.update_one({"_id": user["_id"]}, {"$set": {"bank_account": bank_account}})
    return bank_account


@api.delete("/me/bank-account")
async def delete_my_bank_account(user: dict = Depends(get_current_user)):
    await db.users.update_one({"_id": user["_id"]}, {"$unset": {"bank_account": ""}})
    return {"ok": True}


@api.get("/withdrawals")
async def my_withdrawals(user: dict = Depends(get_current_user)):
    docs = await db.withdrawals.find({"user_id": user["_id"]}).sort("created_at", -1).to_list(200)
    return [clean(d) | {"user_id": str(d["user_id"])} for d in docs]


# ---------------------------------------------------------------------------
# Transactions
# ---------------------------------------------------------------------------
@api.get("/transactions")
async def my_transactions(user: dict = Depends(get_current_user)):
    docs = await db.transactions.find({"user_id": user["_id"]}).sort("created_at", -1).to_list(500)
    return [clean(d) | {"user_id": str(d["user_id"])} for d in docs]


@api.get("/wallet-history")
async def wallet_history(user: dict = Depends(get_current_user), days: int = 30):
    """Daily wallet history for the last N days. Returns credits, debits and running balance ending at the current wallet_balance."""
    user = await process_profit_drops(user)
    days = max(1, min(days, 180))
    now = now_utc()
    start = (now - timedelta(days=days - 1)).replace(hour=0, minute=0, second=0, microsecond=0)

    txs = await db.transactions.find({"user_id": user["_id"]}).sort("created_at", 1).to_list(5000)

    # sum by day, and total pre-start balance
    per_day = {}
    for t in txs:
        d = t.get("created_at")
        if isinstance(d, str):
            d = datetime.fromisoformat(d)
        if d.tzinfo is None:
            d = d.replace(tzinfo=timezone.utc)
        day = d.date().isoformat()
        amt = float(t.get("amount", 0.0))
        # welcome_bonus now credits wallet_balance directly, so it counts toward daily
        # wallet movement just like a deposit.
        bucket = per_day.setdefault(day, {"credit": 0.0, "debit": 0.0})
        if amt >= 0:
            bucket["credit"] += amt
        else:
            bucket["debit"] += -amt

    # build ordered days
    ordered = []
    for i in range(days):
        d = (start + timedelta(days=i)).date().isoformat()
        b = per_day.get(d, {"credit": 0.0, "debit": 0.0})
        ordered.append({"date": d, "credit": round(b["credit"], 2), "debit": round(b["debit"], 2),
                        "net": round(b["credit"] - b["debit"], 2)})

    # walk backwards from current balance to fill running balance
    balances = [0.0] * len(ordered)
    balances[-1] = float(user.get("wallet_balance", 0.0))
    for i in range(len(ordered) - 1, 0, -1):
        balances[i - 1] = balances[i] - ordered[i]["net"]
    for i, o in enumerate(ordered):
        o["balance"] = round(balances[i], 2)

    return {
        "days": days,
        "current_balance": float(user.get("wallet_balance", 0.0)),
        "series": ordered,
    }


# ---------------------------------------------------------------------------
# Referrals
# ---------------------------------------------------------------------------
@api.get("/referrals")
async def my_referrals(user: dict = Depends(get_current_user)):
    settings = await get_settings()
    gen1_docs = await db.users.find({"referred_by": user["_id"]}).to_list(1000)
    gen1_ids = [u["_id"] for u in gen1_docs]
    gen2_docs = await db.users.find({"referred_by": {"$in": gen1_ids}}).to_list(1000) if gen1_ids else []
    gen2_ids = [u["_id"] for u in gen2_docs]
    gen3_docs = await db.users.find({"referred_by": {"$in": gen2_ids}}).to_list(1000) if gen2_ids else []

    def shape(u):
        return {"id": str(u["_id"]), "name": u["name"], "phone": u["phone"][-4:].rjust(len(u["phone"]), "*"),
                "has_invested": u.get("has_invested", False), "joined_at": u.get("created_at")}

    # Total commissions
    tx = await db.transactions.find({"user_id": user["_id"], "type": "referral"}).to_list(2000)
    totals = {1: 0.0, 2: 0.0, 3: 0.0}
    for t in tx:
        g = (t.get("meta") or {}).get("generation")
        if g in totals:
            totals[g] += t["amount"]
    return {
        "referral_code": user["referral_code"],
        "gen1_pct": settings["referral_gen1_pct"],
        "gen2_pct": settings["referral_gen2_pct"],
        "gen3_pct": settings["referral_gen3_pct"],
        "gen1": [shape(u) for u in gen1_docs],
        "gen2": [shape(u) for u in gen2_docs],
        "gen3": [shape(u) for u in gen3_docs],
        "earnings": {"gen1": totals[1], "gen2": totals[2], "gen3": totals[3],
                     "total": totals[1] + totals[2] + totals[3]},
    }


# ---------------------------------------------------------------------------
# Coupon codes
# ---------------------------------------------------------------------------
@api.post("/coupons/redeem")
async def redeem_coupon(payload: CouponRedeemIn, user: dict = Depends(get_current_user)):
    if not user.get("has_invested"):
        raise HTTPException(400, "You must invest before redeeming a coupon")
    code = payload.code.upper().strip()
    coupon = await db.coupons.find_one({"code": code, "active": True})
    if not coupon:
        raise HTTPException(404, "Invalid or inactive coupon code")
    used_by = coupon.get("used_by", [])
    if user["_id"] in used_by:
        raise HTTPException(400, "You already redeemed this coupon")
    if len(used_by) >= coupon["max_uses"]:
        raise HTTPException(400, "This coupon has reached its usage limit")
    amount = float(coupon["amount"])
    await db.coupons.update_one({"_id": coupon["_id"]}, {"$push": {"used_by": user["_id"]}})
    await db.users.update_one({"_id": user["_id"]},
                              {"$inc": {"wallet_balance": amount, "total_earned": amount}})
    await add_transaction(user["_id"], "coupon", amount, f"Redeemed coupon {code}")
    return {"ok": True, "amount": amount}


# ---------------------------------------------------------------------------
# Admin
# ---------------------------------------------------------------------------
@api.get("/admin/stats")
async def admin_stats(admin: dict = Depends(get_admin_user)):
    total_users = await db.users.count_documents({"role": "user"})
    invested_users = await db.users.count_documents({"has_invested": True})
    pending_deposits = await db.deposits.count_documents({"status": "pending"})
    pending_withdrawals = await db.withdrawals.count_documents({"status": "pending"})

    async def sum_field(coll, match, field):
        cur = coll.aggregate([{"$match": match}, {"$group": {"_id": None, "s": {"$sum": f"${field}"}}}])
        async for r in cur:
            return float(r["s"])
        return 0.0

    total_deposited = await sum_field(db.deposits, {"status": "approved"}, "amount")
    total_withdrawn = await sum_field(db.withdrawals, {"status": "approved"}, "amount")
    total_invested = await sum_field(db.investments, {}, "price")
    total_profit_paid = await sum_field(db.transactions, {"type": "profit"}, "amount")
    return {
        "total_users": total_users,
        "invested_users": invested_users,
        "pending_deposits": pending_deposits,
        "pending_withdrawals": pending_withdrawals,
        "total_deposited": total_deposited,
        "total_withdrawn": total_withdrawn,
        "total_invested": total_invested,
        "total_profit_paid": total_profit_paid,
    }


@api.get("/admin/users")
async def admin_list_users(admin: dict = Depends(get_admin_user), q: Optional[str] = Query(None)):
    query: dict = {"role": "user"}
    if q:
        query["$or"] = [
            {"phone": {"$regex": q, "$options": "i"}},
            {"name": {"$regex": q, "$options": "i"}},
        ]
    docs = await db.users.find(query).sort("created_at", -1).to_list(500)
    return [clean(d) for d in docs]


class PlatformResetIn(BaseModel):
    confirm: str = Field(..., description="Must exactly equal 'DELETE ALL DATA' to proceed")


@api.post("/admin/reset")
async def admin_reset_platform(payload: PlatformResetIn, admin: dict = Depends(get_admin_user)):
    """Wipe all user-generated data from the platform.

    Cleared: **users** (except admins), **deposits**, **withdrawals**, **transactions**,
    **investments**, and coupon-redemption metadata on the coupon docs.
    Preserved: **settings**, **products**, **payment_accounts**, **coupons** (as templates),
    and every user with `role == "admin"`.

    Guard rails:
      * caller must be an admin
      * payload.confirm must equal `"DELETE ALL DATA"` verbatim
      * every deletion is logged with the admin identity and per-collection counts
      * admin `wallet_balance` / `bonus_balance` are also reset to 0 so their KPI
        widgets don't keep phantom balances from the old data
    """
    if payload.confirm != "DELETE ALL DATA":
        raise HTTPException(400, "Confirmation phrase mismatch. Type 'DELETE ALL DATA' to proceed.")

    result: dict = {}
    result["users_deleted"] = (await db.users.delete_many({"role": {"$ne": "admin"}})).deleted_count
    result["deposits_deleted"] = (await db.deposits.delete_many({})).deleted_count
    result["withdrawals_deleted"] = (await db.withdrawals.delete_many({})).deleted_count
    result["transactions_deleted"] = (await db.transactions.delete_many({})).deleted_count
    result["investments_deleted"] = (await db.investments.delete_many({})).deleted_count
    # Reset per-coupon redemption trackers so old codes can be re-used cleanly.
    coupon_reset = await db.coupons.update_many(
        {},
        {"$set": {"redemption_count": 0, "redeemed_by": []}},
    )
    result["coupons_reset"] = coupon_reset.modified_count
    # Reset the calling admin's balances so their dashboard KPIs start fresh.
    await db.users.update_many(
        {"role": "admin"},
        {"$set": {"wallet_balance": 0.0, "bonus_balance": 0.0,
                  "total_invested": 0.0, "total_earned": 0.0,
                  "admin_credited_total": 0.0, "has_invested": False}},
    )
    logger.warning(
        "Admin %s wiped the platform: users=%d deposits=%d withdrawals=%d "
        "transactions=%d investments=%d coupons_reset=%d",
        admin.get("email") or admin.get("_id"),
        result["users_deleted"], result["deposits_deleted"], result["withdrawals_deleted"],
        result["transactions_deleted"], result["investments_deleted"], result["coupons_reset"],
    )
    return {"ok": True, **result}


@api.get("/admin/users/{uid}")
async def admin_get_user(uid: str, admin: dict = Depends(get_admin_user)):
    u = await db.users.find_one({"_id": oid(uid)})
    if not u:
        raise HTTPException(404, "User not found")
    tx = await db.transactions.find({"user_id": u["_id"]}).sort("created_at", -1).to_list(200)
    invs = await db.investments.find({"user_id": u["_id"]}).sort("created_at", -1).to_list(200)

    def clean_inv(i: dict) -> dict:
        d = clean(i)
        # `clean()` already stringifies top-level ObjectIds; make sure the FK fields are strings too
        d["user_id"] = str(i.get("user_id")) if i.get("user_id") else None
        d["product_id"] = str(i.get("product_id")) if i.get("product_id") else None
        return d

    # Sum of approved deposits (real cash the user has funded)
    total_deposited = 0.0
    async for r in db.deposits.aggregate([
        {"$match": {"user_id": u["_id"], "status": "approved"}},
        {"$group": {"_id": None, "s": {"$sum": "$amount"}}},
    ]):
        total_deposited = float(r["s"])

    # Inviter (whoever ObjectId matches u.referred_by — this is stored as ObjectId at register)
    inviter = None
    if u.get("referred_by"):
        try:
            inv = await db.users.find_one({"_id": oid(u["referred_by"])} if isinstance(u["referred_by"], str) else {"_id": u["referred_by"]})
        except Exception:
            inv = None
        if inv:
            inviter = {
                "id": str(inv["_id"]),
                "name": inv.get("name"),
                "phone": inv.get("phone"),
                "referral_code": inv.get("referral_code"),
            }

    # Gen-1 referrals (people whose referred_by ObjectId == this user's _id)
    gen1_docs = await db.users.find(
        {"referred_by": u["_id"]}
    ).sort("created_at", -1).to_list(200)

    def shape_ref(x: dict) -> dict:
        return {
            "id": str(x["_id"]),
            "name": x.get("name"),
            "phone": x.get("phone"),
            "has_invested": bool(x.get("has_invested")),
            "total_invested": float(x.get("total_invested") or 0),
            "created_at": x.get("created_at"),
        }

    return {
        "user": clean(u),
        "transactions": [clean(t) for t in tx],
        "investments": [clean_inv(i) for i in invs],
        "total_deposited": total_deposited,
        "inviter": inviter,
        "gen1_referrals": [shape_ref(r) for r in gen1_docs],
    }


@api.post("/admin/users/{uid}/impersonate")
async def admin_impersonate(uid: str, response: Response, admin: dict = Depends(get_admin_user)):
    """Issue an access token for the target user and swap the auth cookies to it, so the admin
    now navigates the app as the impersonated user. Admin's real cookies are backed up in the
    frontend via localStorage (see AuthContext.impersonate) so the pill can restore them.
    """
    u = await db.users.find_one({"_id": oid(uid)})
    if not u:
        raise HTTPException(404, "User not found")
    if u.get("role") == "admin":
        raise HTTPException(400, "Cannot impersonate another admin")
    access = create_access_token(str(u["_id"]), u.get("role") or "user")
    refresh = create_refresh_token(str(u["_id"]))
    set_auth_cookies(response, access, refresh)
    logger.info(f"Admin {admin.get('email') or admin['_id']} impersonating user {u['_id']}")
    return {"ok": True, "access_token": access, "user": clean(u)}


@api.post("/admin/users/{uid}/impersonate-token")
async def admin_impersonate_token(uid: str, admin: dict = Depends(get_admin_user)):
    """Issue an access token for the target user WITHOUT mutating admin's cookies.

    Used by the frontend to open the impersonated dashboard in a fresh browser tab that
    authenticates via `Authorization: Bearer <token>` (kept in that tab's sessionStorage).
    The admin's own session in the original tab is preserved untouched.
    """
    u = await db.users.find_one({"_id": oid(uid)})
    if not u:
        raise HTTPException(404, "User not found")
    if u.get("role") == "admin":
        raise HTTPException(400, "Cannot impersonate another admin")
    access = create_access_token(str(u["_id"]), u.get("role") or "user")
    logger.info(f"Admin {admin.get('email') or admin['_id']} minted impersonation token for user {u['_id']}")
    return {"ok": True, "access_token": access, "user": clean(u)}


@api.post("/admin/impersonate/stop")
async def admin_impersonate_stop(response: Response, admin_id: str = Query(...)):
    """Restore admin cookies. `admin_id` is the admin's own user_id, provided by the frontend
    from localStorage. We re-issue tokens for that admin id."""
    a = await db.users.find_one({"_id": oid(admin_id)})
    if not a or a.get("role") != "admin":
        raise HTTPException(400, "Invalid admin id")
    access = create_access_token(str(a["_id"]), "admin")
    refresh = create_refresh_token(str(a["_id"]))
    set_auth_cookies(response, access, refresh)
    return {"ok": True, "user": clean(a)}


@api.post("/admin/users/{uid}/add-balance")
async def admin_add_balance(uid: str, payload: AddBalanceIn, admin: dict = Depends(get_admin_user)):
    if payload.amount == 0:
        raise HTTPException(400, "Amount cannot be zero")
    u = await db.users.find_one({"_id": oid(uid)})
    if not u:
        raise HTTPException(404, "User not found")
    # Guard debit from going negative
    if payload.amount < 0 and (u.get("wallet_balance", 0) + payload.amount) < 0:
        raise HTTPException(400, f"Cannot debit ₦{abs(payload.amount):,.0f} — user only has ₦{u.get('wallet_balance', 0):,.0f}")
    tx_type = "admin_credit" if payload.amount > 0 else "admin_debit"
    default_note = "Admin credit" if payload.amount > 0 else "Admin debit"
    # Track lifetime admin-credit / debit totals on the user doc so the admin users list can
    # surface a "Funded by admin" chip without loading transactions per row.
    inc = {"wallet_balance": payload.amount}
    if payload.amount > 0:
        inc["total_admin_credited"] = float(payload.amount)
    else:
        inc["total_admin_debited"] = float(-payload.amount)
    await db.users.update_one({"_id": u["_id"]}, {"$inc": inc})
    await add_transaction(u["_id"], tx_type, payload.amount, payload.note or default_note,
                          {"admin_id": str(admin["_id"]),
                           "admin_email": admin.get("email"),
                           "admin_name": admin.get("name")})
    u = await db.users.find_one({"_id": u["_id"]})
    return {"ok": True, "user": clean(u)}


# Deposits admin
@api.get("/admin/deposits")
async def admin_deposits(admin: dict = Depends(get_admin_user), status: Optional[str] = None):
    query = {}
    if status:
        query["status"] = status
    docs = await db.deposits.find(query).sort("created_at", -1).to_list(500)
    return [clean(d) | {"user_id": str(d["user_id"])} for d in docs]


@api.post("/admin/deposits/{did}/approve")
async def approve_deposit(did: str, payload: ApprovalIn, admin: dict = Depends(get_admin_user)):
    """Admin manually approves a deposit.

    Hardened against double-credit races and silent no-op credits:
      1. Atomically flip status pending → approved via `find_one_and_update` filtered
         on `status == "pending"`, so if a webhook / other admin got there first we
         refuse to double-credit.
      2. Validate the deposit amount is a positive number before touching wallet_balance.
      3. Credit `wallet_balance` via `find_one_and_update` returning the AFTER document
         so we can report the new balance back to the admin dashboard (the previous
         version returned only `{ok: true}`, which made it impossible to visually
         confirm the credit actually landed — the root of the "approved but balance
         didn't change" bug report).
      4. If the user document is missing, roll the deposit back to pending so nothing
         is left half-processed.
    """
    dep = await db.deposits.find_one({"_id": oid(did)})
    if not dep:
        raise HTTPException(404, "Deposit not found")
    if dep["status"] != "pending":
        raise HTTPException(400, f"Already {dep['status']}")
    amount = float(dep.get("amount") or 0)
    if amount <= 0:
        raise HTTPException(400, "Deposit amount must be a positive number")

    updated_dep = await db.deposits.find_one_and_update(
        {"_id": dep["_id"], "status": "pending"},
        {"$set": {"status": "approved", "processed_at": now_utc().isoformat(),
                  "admin_note": payload.note or "",
                  "approved_by": str(admin.get("_id", ""))}},
        return_document=ReturnDocument.AFTER,
    )
    if not updated_dep:
        # Another actor (webhook / another admin) already moved this deposit.
        raise HTTPException(409, "Deposit was already processed. Refresh to see the latest state.")

    updated_user = await db.users.find_one_and_update(
        {"_id": dep["user_id"]},
        {"$inc": {"wallet_balance": amount}},
        return_document=ReturnDocument.AFTER,
    )
    if not updated_user:
        # User missing — undo the deposit status flip so it can be retried.
        await db.deposits.update_one({"_id": dep["_id"]}, {"$set": {"status": "pending"}})
        raise HTTPException(500, "User not found. Deposit reverted to pending.")

    await add_transaction(dep["user_id"], "deposit", amount, "Deposit approved",
                          {"deposit_id": str(dep["_id"])})
    new_bal = float(updated_user.get("wallet_balance") or 0)
    logger.info(
        "Admin %s approved deposit %s (₦%.2f) for user %s → new balance ₦%.2f",
        admin.get("email") or admin.get("_id"), did, amount, dep["user_id"], new_bal,
    )
    return {
        "ok": True,
        "amount": amount,
        "wallet_balance": new_bal,
        "user_name": updated_user.get("name") or updated_user.get("phone"),
    }


@api.post("/admin/deposits/{did}/reject")
async def reject_deposit(did: str, payload: ApprovalIn, admin: dict = Depends(get_admin_user)):
    dep = await db.deposits.find_one({"_id": oid(did)})
    if not dep:
        raise HTTPException(404, "Deposit not found")
    if dep["status"] != "pending":
        raise HTTPException(400, f"Already {dep['status']}")
    await db.deposits.update_one({"_id": dep["_id"]},
                                 {"$set": {"status": "rejected", "processed_at": now_utc().isoformat(),
                                           "admin_note": payload.note or ""}})
    return {"ok": True}


@api.post("/admin/deposits/{did}/verify")
async def verify_deposit(did: str, admin: dict = Depends(get_admin_user)):
    """Query PayNow for the deposit status and credit the wallet if the order is paid."""
    dep = await db.deposits.find_one({"_id": oid(did)})
    if not dep:
        raise HTTPException(404, "Deposit not found")
    if dep.get("gateway") != "paynow" or not dep.get("merchant_order_no"):
        raise HTTPException(400, "Only PayNow deposits can be verified")
    if dep["status"] != "pending":
        raise HTTPException(400, f"Deposit is already {dep['status']}")

    res = await paynow.query_payin([dep["merchant_order_no"]])
    if res.get("code") != 0:
        raise HTTPException(502, f"PayNow query failed: {res.get('msg') or 'unknown error'}")
    orders = res.get("data") or []
    order = next((o for o in orders if o.get("merchantOrderNo") == dep["merchant_order_no"]), None)
    if not order:
        raise HTTPException(404, "Order not found at PayNow")

    status_code = int(order.get("status", 0) or 0)
    if status_code == 2:
        amount = float(order.get("payAmount") or order.get("amount") or dep["amount"])
        await db.deposits.update_one(
            {"_id": dep["_id"], "status": "pending"},
            {"$set": {"status": "approved", "processed_at": now_utc().isoformat(),
                      "gateway_query": order, "credited_amount": amount, "reconciled": True}},
        )
        await db.users.update_one({"_id": dep["user_id"]}, {"$inc": {"wallet_balance": amount}})
        await add_transaction(dep["user_id"], "deposit", amount,
                              "Deposit approved (admin verify)",
                              {"deposit_id": str(dep["_id"]), "gateway": "paynow"})
        return {"ok": True, "status": "approved", "amount": amount, "order": order}
    return {"ok": False, "status": dep["status"], "paynow_status": status_code, "order": order,
            "message": f"PayNow reports status {status_code} — not paid yet."}


@api.post("/admin/paynow/reconcile")
async def admin_paynow_reconcile(admin: dict = Depends(get_admin_user)):
    if not paynow.enabled():
        raise HTTPException(400, "PayNow is not configured")
    dep_credited = await reconcile_pending_paynow_deposits()
    wd_settled = await reconcile_pending_paynow_withdrawals()
    return {"ok": True, "deposits_credited": dep_credited, "withdrawals_settled": wd_settled}


# Withdrawals admin
@api.get("/admin/withdrawals")
async def admin_withdrawals(admin: dict = Depends(get_admin_user), status: Optional[str] = None):
    query = {}
    if status:
        query["status"] = status
    docs = await db.withdrawals.find(query).sort("created_at", -1).to_list(500)
    return [clean(d) | {"user_id": str(d["user_id"])} for d in docs]


@api.post("/admin/withdrawals/{wid}/approve")
async def approve_withdrawal(wid: str, payload: ApprovalIn, admin: dict = Depends(get_admin_user)):
    w = await db.withdrawals.find_one({"_id": oid(wid)})
    if not w:
        raise HTTPException(404, "Withdrawal not found")
    if w["status"] != "pending":
        raise HTTPException(400, f"Already {w['status']}")

    # Try to auto-dispatch through the first enabled payout gateway (paynow →
    # shpay → onesspay). Bank code is translated by bank name so a user's
    # PayNow-format code (NG0xxx) still works if we route through SHPAY/1SSPay.
    # Only requires a bank_code on the withdrawal — the dispatcher handles
    # every gateway's format internally.
    if w.get("bank_code") or w.get("bank_name"):
        toggles = await get_gateway_toggles()
        any_payout_gateway_on = any(
            _gateway_module_enabled(g) and toggles.get(g, {}).get("payout")
            for g in GATEWAY_KEYS
        )
        if any_payout_gateway_on:
            try:
                await dispatch_payout_via_enabled_gateway(w, note=payload.note or "")
                # Which gateway actually settled is reflected in the DB row.
                fresh = await db.withdrawals.find_one({"_id": w["_id"]})
                return {"ok": True, "gateway": fresh.get("gateway"), "status": "processing"}
            except HTTPException:
                raise
            except Exception as e:
                logger.exception("Auto-dispatch payout failed")
                raise HTTPException(502, f"Payment gateway error: {e}")

    # Manual flow — no gateway enabled OR no bank info OR user asked for manual.
    await db.withdrawals.update_one({"_id": w["_id"]},
                                    {"$set": {"status": "approved", "processed_at": now_utc().isoformat(),
                                              "admin_note": payload.note or ""}})
    await settle_withdrawal_hold(w["user_id"], str(w["_id"]), "withdrawal", "Withdrawal approved")
    return {"ok": True}


@api.post("/admin/withdrawals/{wid}/shpay-payout")
async def admin_shpay_payout(wid: str, payload: ApprovalIn, admin: dict = Depends(get_admin_user)):
    """Send a specific pending withdrawal via SHPAY instead of PayNow. Useful when
    PayNow is IP-blocked or returning transient errors, or when the merchant simply
    prefers to route through SHPAY."""
    if not shpay.enabled():
        raise HTTPException(400, "SHPAY is not configured")
    if not await gateway_payout_allowed("shpay"):
        raise HTTPException(400, "SHPAY payouts are currently disabled by admin")
    w = await db.withdrawals.find_one({"_id": oid(wid)})
    if not w:
        raise HTTPException(404, "Withdrawal not found")
    if w["status"] != "pending":
        raise HTTPException(400, f"Already {w['status']}")
    if not w.get("bank_code"):
        raise HTTPException(400, "This withdrawal has no SHPAY bank_code — approve manually or ask the user to re-bind their bank via the SHPAY bank list.")
    try:
        await _shpay_payout_withdrawal(w, note=payload.note or "")
    except HTTPException:
        raise
    except Exception as e:
        logger.exception("SHPAY payout failed")
        raise HTTPException(502, f"SHPAY error: {e}")
    return {"ok": True, "gateway": "shpay", "status": "processing"}


@api.post("/admin/withdrawals/{wid}/onesspay-payout")
async def admin_onesspay_payout(wid: str, payload: ApprovalIn, admin: dict = Depends(get_admin_user)):
    """Send a specific pending withdrawal via 1SSPay. Requires the withdrawal to
    have a `bank_code` in 1SSPay's `NR0xxx` format (see `onesspay.NIGERIAN_BANKS`).
    """
    if not onesspay.enabled():
        raise HTTPException(400, "1SSPay is not configured")
    if not await gateway_payout_allowed("onesspay"):
        raise HTTPException(400, "1SSPay payouts are currently disabled by admin")
    w = await db.withdrawals.find_one({"_id": oid(wid)})
    if not w:
        raise HTTPException(404, "Withdrawal not found")
    if w["status"] != "pending":
        raise HTTPException(400, f"Already {w['status']}")
    try:
        await _onesspay_payout_withdrawal(w, note=payload.note or "")
    except HTTPException:
        raise
    except Exception as e:
        logger.exception("1SSPay payout failed")
        raise HTTPException(502, f"1SSPay error: {e}")
    return {"ok": True, "gateway": "onesspay", "status": "processing"}



@api.post("/admin/withdrawals/bulk-approve")
async def bulk_approve_withdrawals(payload: BulkApprovalIn, admin: dict = Depends(get_admin_user)):
    settings = await get_settings()
    limit = int(settings.get("batch_approve_limit") or 50)
    ids = [i for i in (payload.ids or []) if i]
    if not ids:
        raise HTTPException(400, "No withdrawal ids supplied")
    if len(ids) > limit:
        raise HTTPException(400, f"Batch too large — limit is {limit} at a time")

    results = {"approved": 0, "processing": 0, "skipped": 0, "errors": []}
    for wid in ids:
        try:
            w = await db.withdrawals.find_one({"_id": oid(wid)})
        except Exception:
            results["errors"].append({"id": wid, "error": "Invalid id"}); results["skipped"] += 1; continue
        if not w:
            results["errors"].append({"id": wid, "error": "Not found"}); results["skipped"] += 1; continue
        if w["status"] != "pending":
            results["skipped"] += 1; continue

        if w.get("bank_code") or w.get("bank_name"):
            try:
                await dispatch_payout_via_enabled_gateway(w, note=payload.note or "")
                results["processing"] += 1
            except HTTPException as e:
                results["errors"].append({"id": wid, "error": e.detail}); results["skipped"] += 1
            except Exception as e:
                logger.exception("Bulk payout failed")
                results["errors"].append({"id": wid, "error": str(e)}); results["skipped"] += 1
        else:
            await db.withdrawals.update_one(
                {"_id": w["_id"]},
                {"$set": {"status": "approved", "processed_at": now_utc().isoformat(),
                          "admin_note": payload.note or "Bulk approved"}},
            )
            await settle_withdrawal_hold(w["user_id"], str(w["_id"]), "withdrawal", "Withdrawal approved (bulk)")
            results["approved"] += 1

    return {"ok": True, **results}


# Admin: PayNow utilities
@api.get("/admin/paynow/status")
async def admin_paynow_status(admin: dict = Depends(get_admin_user)):
    return {
        "enabled": paynow.enabled(),
        "merchant_no": os.environ.get("PAYNOW_MERCHANT_NO", ""),
        "base_url": os.environ.get("PAYNOW_BASE_URL", ""),
        "payin_channel": os.environ.get("PAYNOW_PAYIN_CHANNEL", ""),
        "payout_channel": os.environ.get("PAYNOW_PAYOUT_CHANNEL", ""),
        "currency": os.environ.get("PAYNOW_CURRENCY", "NGN"),
    }


@api.get("/admin/paynow/balance")
async def admin_paynow_balance(admin: dict = Depends(get_admin_user)):
    if not paynow.enabled():
        raise HTTPException(400, "PayNow is not configured")
    return await paynow.get_balance_cached()


@api.get("/admin/paynow/banks")
async def admin_paynow_banks(admin: dict = Depends(get_admin_user)):
    if not paynow.enabled():
        raise HTTPException(400, "PayNow is not configured")
    return await paynow.list_banks_cached()


@api.post("/paynow/retry")
async def paynow_retry(user: dict = Depends(get_current_user)):
    """Force-clear the cached IP-block flag and probe PayNow live. Returns the
    current outbound IP so admins can see exactly which address to whitelist.
    Called by the deposit "Retry now" button after the merchant whitelists us."""
    outbound_ip = "unknown"
    try:
        async with httpx.AsyncClient(timeout=6.0) as _c:
            r = await _c.get("https://api.ipify.org")
            outbound_ip = r.text.strip() or "unknown"
    except Exception:
        pass
    if not paynow.enabled():
        return {"gateway_ready": False, "reason": "disabled", "outbound_ip": outbound_ip}
    paynow._clear_ip_blocked()
    resp = await paynow.list_banks()
    ok = resp.get("code") == 0 and not paynow.ip_blocked()
    return {
        "gateway_ready": ok,
        "code": resp.get("code"),
        "msg": resp.get("msg"),
        "outbound_ip": outbound_ip,
        "reason": None if ok else "gateway_ip_blocked",
    }


# User: bank code list (for auto withdrawal)
@api.get("/paynow/banks")
async def user_paynow_banks(user: dict = Depends(get_current_user), all: bool = False):
    # Report "enabled" purely based on env configuration. Runtime health (IP block,
    # rate limits) is exposed via `gateway_ready` so the UI can keep the Instant
    # Pay tile visible and still warn users transparently. Hiding the tile on
    # transient errors confuses users (they think the feature was removed).
    if not paynow.enabled() or not await gateway_payin_allowed("paynow"):
        return {"enabled": False, "reason": "disabled", "gateway_ready": False, "data": []}
    # If we previously flagged the IP as blocked, DO a real probe anyway so the
    # dashboard recovers instantly the moment the merchant whitelists this pod's
    # IP — waiting for the 5-min TTL felt broken to users. `force_probe=True`
    # bypasses both the block short-circuit and the bank-list cache.
    force = paynow.ip_blocked()
    resp = await paynow.list_banks_cached(force_probe=force)
    if paynow.ip_blocked():
        return {
            "enabled": True,
            "gateway_ready": False,
            "reason": "gateway_ip_blocked",
            "note": paynow.ip_block_note() or "Payment gateway is verifying server access.",
            "data": [],
        }
    data = resp.get("data") or []
    filtered = data if all else filter_popular(data)
    return {"enabled": True, "gateway_ready": True, "code": resp.get("code"),
            "data": filtered, "msg": resp.get("msg"), "total": len(data)}


# ---------------------------------------------------------------------------
# SHPAY endpoints (mirrors PayNow shape so frontend can treat them uniformly)
# ---------------------------------------------------------------------------


@api.get("/shpay/status")
async def shpay_status(user: dict = Depends(get_current_user)):
    """Lightweight probe used by the Deposit page to decide whether to render the
    SHPAY Instant Pay tile. `enabled` reflects env config; `gateway_ready` reflects
    live reachability (a real call is made and its success flag is echoed)."""
    if not shpay.enabled() or not await gateway_payin_allowed("shpay"):
        return {"enabled": False, "gateway_ready": False, "reason": "disabled"}
    resp = await shpay.list_banks_cached()
    ok = bool(resp.get("success"))
    return {
        "enabled": True,
        "gateway_ready": ok,
        "message": resp.get("message") if not ok else None,
        "bank_count": len(resp.get("result") or []) if ok else 0,
    }


@api.get("/shpay/banks")
async def shpay_banks(user: dict = Depends(get_current_user)):
    if not shpay.enabled():
        return {"enabled": False, "gateway_ready": False, "reason": "disabled", "data": []}
    resp = await shpay.list_banks_cached()
    if not resp.get("success"):
        return {"enabled": True, "gateway_ready": False, "reason": "gateway_unreachable",
                "note": resp.get("message") or "SHPAY unreachable", "data": []}
    return {"enabled": True, "gateway_ready": True, "data": resp.get("result") or []}


@api.get("/admin/shpay/health")
async def admin_shpay_health(admin: dict = Depends(get_admin_user)):
    """Admin-only end-to-end SHPAY health probe. Returns balance + bank count so
    the admin can see at a glance whether the gateway is reachable and funded."""
    if not shpay.enabled():
        raise HTTPException(400, "SHPAY is not configured")
    bal = await shpay.get_balance()
    banks = await shpay.list_banks_cached()
    outbound_ip = "unknown"
    try:
        async with httpx.AsyncClient(timeout=3.0) as _c:
            r = await _c.get("https://api.ipify.org")
            outbound_ip = r.text.strip() or "unknown"
    except Exception:
        pass
    return {
        "enabled": True,
        "outbound_ip": outbound_ip,
        "balance": bal.get("result") if bal.get("success") else None,
        "balance_error": bal.get("message") if not bal.get("success") else None,
        "bank_count": len(banks.get("result") or []) if banks.get("success") else 0,
        "bank_error": banks.get("message") if not banks.get("success") else None,
    }


@api.post("/shpay/webhook", response_class=PlainTextResponse)
async def shpay_webhook(request: Request):
    """Async callback endpoint SHPAY hits when a payin or payout settles.

    Signature is verified via `shpay.verify_callback_signature`. Response body
    must be the literal string 'OK' or 'SUCCESS' (case-insensitive) — anything
    else triggers SHPAY's retry schedule (60s / 600s / 3600s). We use
    PlainTextResponse (not the default JSON) so the response body is the raw
    string, not a JSON-quoted string.

    Idempotency: we key on `outTradeNo` and only credit / settle once. If the
    deposit is already `approved` or the withdrawal is already `approved` we
    silently ack `OK` so SHPAY stops retrying.
    """
    body = await request.json()
    logger.info("SHPAY webhook received: %s", body)
    if not shpay.verify_callback_signature(body):
        logger.warning("SHPAY webhook: signature mismatch, refusing to process")
        return PlainTextResponse("SIGNATURE_INVALID", status_code=200)

    event = (body.get("event") or "").upper()
    out_trade_no = body.get("outTradeNo") or ""
    status = (body.get("transStatus") or "").upper()
    # SHPAY sends the ACTUAL paid amount in `transAmt` (normal orders) OR
    # `paymentAmount` (recharge to the same virtual account).
    trans_amt_str = body.get("transAmt") or body.get("paymentAmount") or "0"
    try:
        trans_amt = float(trans_amt_str)
    except Exception:
        trans_amt = 0.0

    if event == "PAYIN":
        dep = await db.deposits.find_one({"merchant_order_no": out_trade_no,
                                          "gateway": "shpay"})
        if not dep:
            logger.warning("SHPAY payin webhook: unknown outTradeNo=%s", out_trade_no)
            return "OK"  # ack so SHPAY doesn't retry an order we don't own
        if status != "SUCCESS":
            logger.info("SHPAY payin non-final status=%s for %s", status, out_trade_no)
            if status == "FAIL":
                await db.deposits.update_one(
                    {"_id": dep["_id"], "status": "pending"},
                    {"$set": {"status": "rejected", "processed_at": now_utc().isoformat(),
                              "gateway_error": body.get("extInfo") or "SHPAY reported failure",
                              "gateway_callback": body}},
                )
            return "OK"
        # SUCCESS — credit the user's wallet with the AMOUNT SHPAY says was paid.
        if dep["status"] != "pending":
            return "OK"  # already processed
        updated_dep = await db.deposits.find_one_and_update(
            {"_id": dep["_id"], "status": "pending"},
            {"$set": {"status": "approved", "processed_at": now_utc().isoformat(),
                      "gateway_callback": body,
                      "settled_amount": trans_amt}},
            return_document=ReturnDocument.AFTER,
        )
        if not updated_dep:
            return "OK"  # someone else settled it first
        # Credit whichever amount SHPAY confirms (user may have paid a different amount)
        credit_amount = trans_amt if trans_amt > 0 else float(dep["amount"])
        await db.users.update_one({"_id": dep["user_id"]},
                                  {"$inc": {"wallet_balance": credit_amount}})
        await add_transaction(dep["user_id"], "deposit", credit_amount,
                              "Deposit auto-credited (SHPAY)",
                              {"deposit_id": str(dep["_id"]), "gateway": "shpay"})
        logger.info("SHPAY payin credited user=%s amount=₦%.2f dep=%s",
                    dep["user_id"], credit_amount, dep["_id"])
        return "OK"

    if event == "PAYOUT":
        w = await db.withdrawals.find_one({"merchant_order_no": out_trade_no,
                                           "gateway": "shpay"})
        if not w:
            logger.warning("SHPAY payout webhook: unknown outTradeNo=%s", out_trade_no)
            return "OK"
        if status == "SUCCESS" and w["status"] not in {"approved"}:
            await db.withdrawals.update_one(
                {"_id": w["_id"]},
                {"$set": {"status": "approved", "processed_at": now_utc().isoformat(),
                          "gateway_callback": body}},
            )
            await settle_withdrawal_hold(w["user_id"], str(w["_id"]), "withdrawal",
                                          "Withdrawal paid out (SHPAY)")
        elif status == "FAIL" and w["status"] not in {"approved", "rejected"}:
            # Refund the held amount
            await db.withdrawals.update_one(
                {"_id": w["_id"]},
                {"$set": {"status": "rejected", "processed_at": now_utc().isoformat(),
                          "gateway_error": body.get("extInfo") or "SHPAY reported failure",
                          "gateway_callback": body}},
            )
            await db.users.update_one({"_id": w["user_id"]},
                                      {"$inc": {"wallet_balance": float(w["amount"])}})
            await add_transaction(w["user_id"], "withdrawal_refund", float(w["amount"]),
                                  "Withdrawal rejected - refunded (SHPAY)",
                                  {"withdrawal_id": str(w["_id"]), "gateway": "shpay"})
        return "OK"

    logger.warning("SHPAY webhook unknown event=%s outTradeNo=%s", event, out_trade_no)
    return "OK"


# ---------------------------------------------------------------------------
# 1SSPay endpoints (mirrors PayNow / SHPAY shape)
# ---------------------------------------------------------------------------

@api.get("/onesspay/status")
async def onesspay_status(user: dict = Depends(get_current_user)):
    """Lightweight probe used by the Deposit page to decide whether to render the
    1SSPay Fast Pay tile."""
    if not onesspay.enabled() or not await gateway_payin_allowed("onesspay"):
        return {"enabled": False, "gateway_ready": False, "reason": "disabled"}
    # Ping /payout/balance as a cheap connectivity + auth check. code=200 → live.
    # code=1007 (channel_permission_check) also means the credentials worked but
    # this merchant doesn't have Nigeria enabled — we still show the tile but
    # mark gateway_ready=false so the UI can render a friendly warning.
    try:
        resp = await onesspay.get_balance()
    except Exception:
        return {"enabled": True, "gateway_ready": False, "reason": "unreachable"}
    code = int(resp.get("code") or 0)
    return {
        "enabled": True,
        "gateway_ready": code == 200,
        "message": resp.get("msg") if code != 200 else None,
        "code": code,
    }


@api.get("/onesspay/banks")
async def onesspay_banks(user: dict = Depends(get_current_user)):
    """Static bank list (NR0xxx codes) — the docs don't ship a /banks endpoint."""
    if not onesspay.enabled():
        return {"enabled": False, "gateway_ready": False, "data": []}
    return {"enabled": True, "gateway_ready": True, "data": onesspay.list_banks()}


@api.get("/admin/onesspay/health")
async def admin_onesspay_health(admin: dict = Depends(get_admin_user)):
    """Admin probe — returns balance + outbound IP so the merchant can whitelist
    the server IP with 1SSPay if calls are being refused."""
    outbound_ip = "unknown"
    try:
        async with httpx.AsyncClient(timeout=3.0) as c:
            r = await c.get("https://api.ipify.org")
            outbound_ip = r.text.strip() or "unknown"
    except Exception:
        pass
    if not onesspay.enabled():
        return {"enabled": False, "outbound_ip": outbound_ip, "reason": "not configured"}
    try:
        bal = await onesspay.get_balance()
    except Exception as e:
        return {"enabled": True, "outbound_ip": outbound_ip, "error": str(e)}
    return {"enabled": True, "outbound_ip": outbound_ip, "balance_response": bal}


@api.post("/onesspay/webhook/payin", response_class=PlainTextResponse)
async def onesspay_payin_webhook(request: Request):
    """1SSPay payin callback. Form-urlencoded body. Response MUST be the literal
    string `"success"` — anything else triggers their retry schedule
    (30s/90s/3m/6m/15m/30m/60m).

    Signature covers all form fields except `sign` itself, HMAC-SHA1 + Base64.
    Idempotent: if the deposit is already approved we still return `"success"`.
    """
    form = await request.form()
    body = {k: str(v) for k, v in form.items()}
    logger.info("1SSPay payin webhook received: %s", body)
    if not onesspay.verify_callback_signature(body):
        logger.warning("1SSPay payin webhook: signature mismatch")
        return PlainTextResponse("signature_invalid", status_code=200)

    order_no = body.get("orderNo") or ""
    status = (body.get("status") or "").strip()  # "2" = success, "3" = fail
    amount_real_str = body.get("amountReal") or body.get("amount") or "0"
    try:
        amount_real = float(amount_real_str)
    except Exception:
        amount_real = 0.0

    dep = await db.deposits.find_one({"merchant_order_no": order_no, "gateway": "onesspay"})
    if not dep:
        logger.warning("1SSPay payin webhook: unknown orderNo=%s", order_no)
        return "success"
    if status == "2":  # success
        if dep["status"] != "pending":
            return "success"
        updated = await db.deposits.find_one_and_update(
            {"_id": dep["_id"], "status": "pending"},
            {"$set": {"status": "approved", "processed_at": now_utc().isoformat(),
                      "gateway_callback": body,
                      "settled_amount": amount_real}},
            return_document=ReturnDocument.AFTER,
        )
        if not updated:
            return "success"
        credit_amount = amount_real if amount_real > 0 else float(dep["amount"])
        await db.users.update_one({"_id": dep["user_id"]},
                                  {"$inc": {"wallet_balance": credit_amount}})
        await add_transaction(dep["user_id"], "deposit", credit_amount,
                              "Deposit auto-credited (1SSPay)",
                              {"deposit_id": str(dep["_id"]), "gateway": "onesspay"})
        logger.info("1SSPay payin credited user=%s amount=₦%.2f dep=%s",
                    dep["user_id"], credit_amount, dep["_id"])
        return "success"
    if status in ("3", "4"):  # fail / expired
        await db.deposits.update_one(
            {"_id": dep["_id"], "status": "pending"},
            {"$set": {"status": "rejected", "processed_at": now_utc().isoformat(),
                      "gateway_error": body.get("failMsg") or "1SSPay reported failure",
                      "gateway_callback": body}},
        )
    return "success"


@api.post("/onesspay/webhook/payout", response_class=PlainTextResponse)
async def onesspay_payout_webhook(request: Request):
    """1SSPay payout callback."""
    form = await request.form()
    body = {k: str(v) for k, v in form.items()}
    logger.info("1SSPay payout webhook received: %s", body)
    if not onesspay.verify_callback_signature(body):
        logger.warning("1SSPay payout webhook: signature mismatch")
        return PlainTextResponse("signature_invalid", status_code=200)

    order_no = body.get("orderNo") or ""
    status = (body.get("status") or "").strip()
    w = await db.withdrawals.find_one({"merchant_order_no": order_no, "gateway": "onesspay"})
    if not w:
        logger.warning("1SSPay payout webhook: unknown orderNo=%s", order_no)
        return "success"
    if status == "2" and w["status"] not in {"approved"}:
        await db.withdrawals.update_one(
            {"_id": w["_id"]},
            {"$set": {"status": "approved", "processed_at": now_utc().isoformat(),
                      "gateway_callback": body}},
        )
        await settle_withdrawal_hold(w["user_id"], str(w["_id"]), "withdrawal",
                                      "Withdrawal paid out (1SSPay)")
    elif status in ("3", "5") and w["status"] not in {"approved", "rejected"}:
        # 3=fail, 5=refunded (success→fail)
        await db.withdrawals.update_one(
            {"_id": w["_id"]},
            {"$set": {"status": "rejected", "processed_at": now_utc().isoformat(),
                      "gateway_error": body.get("failMsg") or "1SSPay reported failure",
                      "gateway_callback": body}},
        )
        await db.users.update_one({"_id": w["user_id"]},
                                  {"$inc": {"wallet_balance": float(w["amount"])}})
        await add_transaction(w["user_id"], "withdrawal_refund", float(w["amount"]),
                              "Withdrawal rejected - refunded (1SSPay)",
                              {"withdrawal_id": str(w["_id"]), "gateway": "onesspay"})
    return "success"


class VerifyAccountIn(BaseModel):
    bank_code: str
    account_number: str


@api.post("/paynow/verify-account")
async def verify_account(payload: VerifyAccountIn, user: dict = Depends(get_current_user)):
    """Ping PayNow's payee query to check whether this bank/account combo is reachable.
    Returns exist=True if PayNow can process a payout to it."""
    if not paynow.enabled():
        raise HTTPException(400, "PayNow is not configured")
    resp = await paynow.query_payee(payload.bank_code, payload.account_number)
    data = resp.get("data") or {}
    return {"ok": resp.get("code") == 0, "exists": bool(data.get("exist")), "raw": resp}


# ---------------------------------------------------------------------------
# PayNow webhooks (public, sign-verified)
# ---------------------------------------------------------------------------
@api.post("/webhooks/paynow/payin")
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
        logger.warning("Deposit not found for %s", merchant_order_no)
        return "SUCCESS"
    if dep["status"] == "approved":
        return "SUCCESS"  # idempotent

    if status_code == 2:  # success
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


@api.post("/webhooks/paynow/payout")
async def webhook_payout(request: Request):
    body = await request.json()
    logger.info("PayNow PAYOUT callback: %s", body)
    if not paynow.verify_callback(body):
        logger.warning("PayNow payout callback signature invalid")
        raise HTTPException(400, "Invalid signature")
    merchant_order_no = body.get("merchantOrderNo")
    status_code = int(body.get("status", 0))
    reversal = int(body.get("reversal", 0))
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
        await settle_withdrawal_hold(w["user_id"], str(w["_id"]), "withdrawal",
                                      "Withdrawal paid out")
    else:
        # Refund held amount
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


@api.post("/admin/withdrawals/{wid}/reject")
async def reject_withdrawal(wid: str, payload: ApprovalIn, admin: dict = Depends(get_admin_user)):
    w = await db.withdrawals.find_one({"_id": oid(wid)})
    if not w:
        raise HTTPException(404, "Withdrawal not found")
    if w["status"] != "pending":
        raise HTTPException(400, f"Already {w['status']}")
    # Refund held amount
    await db.users.update_one({"_id": w["user_id"]}, {"$inc": {"wallet_balance": w["amount"]}})
    await db.withdrawals.update_one({"_id": w["_id"]},
                                    {"$set": {"status": "rejected", "processed_at": now_utc().isoformat(),
                                              "admin_note": payload.note or ""}})
    await add_transaction(w["user_id"], "withdrawal_refund", w["amount"], "Withdrawal rejected - refunded",
                          {"withdrawal_id": str(w["_id"])})
    return {"ok": True}


# Payment accounts admin
@api.get("/admin/payment-accounts")
async def admin_list_accounts(admin: dict = Depends(get_admin_user)):
    docs = await db.payment_accounts.find({}).sort("created_at", -1).to_list(100)
    return [clean(d) for d in docs]


@api.post("/admin/payment-accounts")
async def create_account(p: AccountIn, admin: dict = Depends(get_admin_user)):
    doc = p.model_dump()
    doc["created_at"] = now_utc().isoformat()
    res = await db.payment_accounts.insert_one(doc)
    return clean(await db.payment_accounts.find_one({"_id": res.inserted_id}))


@api.put("/admin/payment-accounts/{aid}")
async def update_account(aid: str, p: AccountIn, admin: dict = Depends(get_admin_user)):
    await db.payment_accounts.update_one({"_id": oid(aid)}, {"$set": p.model_dump()})
    return clean(await db.payment_accounts.find_one({"_id": oid(aid)}))


@api.delete("/admin/payment-accounts/{aid}")
async def delete_account(aid: str, admin: dict = Depends(get_admin_user)):
    await db.payment_accounts.delete_one({"_id": oid(aid)})
    return {"ok": True}


# Coupons admin
@api.get("/admin/coupons")
async def admin_list_coupons(admin: dict = Depends(get_admin_user)):
    docs = await db.coupons.find({}).sort("created_at", -1).to_list(200)
    out = []
    for d in docs:
        d = clean(d)
        d["used_by"] = [str(x) for x in d.get("used_by", [])]
        d["used_count"] = len(d["used_by"])
        out.append(d)
    return out


@api.post("/admin/coupons")
async def create_coupon(p: CouponIn, admin: dict = Depends(get_admin_user)):
    code = p.code.upper().strip()
    if await db.coupons.find_one({"code": code}):
        raise HTTPException(400, "Coupon code already exists")
    doc = {"code": code, "amount": p.amount, "max_uses": p.max_uses, "active": p.active,
           "used_by": [], "created_at": now_utc().isoformat()}
    res = await db.coupons.insert_one(doc)
    d = clean(await db.coupons.find_one({"_id": res.inserted_id}))
    d["used_by"] = []
    return d


@api.put("/admin/coupons/{cid}")
async def update_coupon(cid: str, p: CouponIn, admin: dict = Depends(get_admin_user)):
    await db.coupons.update_one({"_id": oid(cid)},
                                {"$set": {"code": p.code.upper().strip(), "amount": p.amount,
                                          "max_uses": p.max_uses, "active": p.active}})
    return {"ok": True}


@api.delete("/admin/coupons/{cid}")
async def delete_coupon(cid: str, admin: dict = Depends(get_admin_user)):
    await db.coupons.delete_one({"_id": oid(cid)})
    return {"ok": True}


# Settings admin
@api.get("/admin/settings")
async def admin_get_settings(admin: dict = Depends(get_admin_user)):
    s = await get_settings()
    s.pop("_id", None)
    return s


@api.get("/settings/public")
async def public_settings():
    """Non-sensitive settings safe to expose to any authenticated or anonymous client."""
    s = await get_settings()
    return {
        "site_name": s.get("site_name") or "NaijaInvest",
        "telegram_url": s.get("telegram_url") or "",
        "welcome_message": s.get("welcome_message") or "",
        "welcome_bonus": s.get("welcome_bonus") or 0,
        "min_deposit": s.get("min_deposit") or 0,
        "min_withdrawal": s.get("min_withdrawal") or 0,
        "withdrawal_fee_pct": s.get("withdrawal_fee_pct") or 0,
        "auto_payout_enabled": bool(s.get("auto_payout_enabled")),
        "deposit_quick_amounts": s.get("deposit_quick_amounts") or [500, 1000, 2000, 5000, 10000, 20000],
    }


@api.put("/admin/settings")
async def admin_update_settings(payload: SettingsIn, admin: dict = Depends(get_admin_user)):
    updates = {k: v for k, v in payload.model_dump().items() if v is not None}
    if updates:
        await db.settings.update_one({"_id": "global"}, {"$set": updates}, upsert=True)
    s = await get_settings()
    s.pop("_id", None)
    return s


# ---------------------------------------------------------------------------
# Admin: payment-gateway toggles (per gateway × per direction)
# ---------------------------------------------------------------------------

class GatewayToggleIn(BaseModel):
    """Admin toggles for a single gateway."""
    payin: Optional[bool] = None
    payout: Optional[bool] = None


class GatewayTogglesIn(BaseModel):
    """Bulk update of all gateway toggles at once. Each key is optional so
    admin can update just one gateway without clobbering the others."""
    paynow:   Optional[GatewayToggleIn] = None
    shpay:    Optional[GatewayToggleIn] = None
    onesspay: Optional[GatewayToggleIn] = None


def _gateway_meta(gateway: str) -> dict:
    """Static per-gateway metadata for the admin UI (labels, colors)."""
    return {
        "paynow":   {"label": "PayNow — Instant Pay",   "color": "#0055FF",
                     "configured": paynow.enabled()},
        "shpay":    {"label": "SHPAY — Quick Pay",      "color": "#8B5CF6",
                     "configured": shpay.enabled()},
        "onesspay": {"label": "1SSPay — Fast Pay",      "color": "#F97316",
                     "configured": onesspay.enabled()},
    }[gateway]


@api.get("/admin/gateways")
async def admin_get_gateways(admin: dict = Depends(get_admin_user)):
    """Return current toggles + module-level enabled flag + label metadata so
    the admin UI can render toggle switches with the correct state."""
    toggles = await get_gateway_toggles()
    return {
        "gateways": [
            {"key": g, **_gateway_meta(g), **toggles[g]}
            for g in GATEWAY_KEYS
        ],
    }


@api.put("/admin/gateways")
async def admin_update_gateways(payload: GatewayTogglesIn, admin: dict = Depends(get_admin_user)):
    """Update one or more gateway toggles. Only fields present in the payload
    are updated — omitted fields keep their current value."""
    current = await get_gateway_toggles()
    body = payload.model_dump()
    changed = False
    for g in GATEWAY_KEYS:
        req = body.get(g)
        if not req:
            continue
        if req.get("payin") is not None:
            current[g]["payin"] = bool(req["payin"])
            changed = True
        if req.get("payout") is not None:
            current[g]["payout"] = bool(req["payout"])
            changed = True
    if changed:
        await db.settings.update_one(
            {"_id": "global"},
            {"$set": {"gateway_toggles": current}},
            upsert=True,
        )
    return {
        "gateways": [
            {"key": g, **_gateway_meta(g), **current[g]}
            for g in GATEWAY_KEYS
        ],
    }


# ---------------------------------------------------------------------------
# Router mount + CORS
# ---------------------------------------------------------------------------
app.include_router(api)

frontend_origin = os.environ.get("FRONTEND_URL", "http://localhost:3000")
app.add_middleware(
    CORSMiddleware,
    allow_origins=[frontend_origin, "http://localhost:3000"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)


@api.get("/")
async def health():
    return {"ok": True, "service": "naija-invest"}
