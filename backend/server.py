from dotenv import load_dotenv
from pathlib import Path

ROOT_DIR = Path(__file__).parent
load_dotenv(ROOT_DIR / ".env")

import os
import re
import asyncio
import logging
import secrets
import string
from datetime import datetime, timezone, timedelta
from typing import List, Optional, Annotated, Any, Dict
from zoneinfo import ZoneInfo

import bcrypt
import httpx
import jwt
from bson import ObjectId
from fastapi import FastAPI, APIRouter, HTTPException, Depends, Request, Response, Query
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import PlainTextResponse, RedirectResponse
from motor.motor_asyncio import AsyncIOMotorClient
from pydantic import BaseModel, Field, ConfigDict, BeforeValidator

import paynow
import shpay
import onesspay
import juntbest
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

app = FastAPI(title="Luckycart Box Platform API")
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
        # `iat` (issued-at) is the anchor the "force logout all users" admin
        # action uses to invalidate any token issued before session_epoch.
        "iat": int(datetime.now(timezone.utc).timestamp()),
        "exp": datetime.now(timezone.utc) + timedelta(minutes=ACCESS_TOKEN_MINUTES),
    }
    return jwt.encode(payload, get_jwt_secret(), algorithm=JWT_ALGORITHM)


def create_refresh_token(user_id: str) -> str:
    payload = {
        "sub": user_id,
        "type": "refresh",
        "iat": int(datetime.now(timezone.utc).timestamp()),
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
# Outbound IP resolver — deterministic, zero-network. Used in gateway error
# paths to tell the merchant "whitelist THIS IP". Reads HTTPS_PROXY once at
# import time so the hot path is a dict lookup, NOT a 3-second ipify call.
# ---------------------------------------------------------------------------
_OUTBOUND_IP_CACHED: Optional[str] = None


def outbound_ip_fast() -> str:
    """Return the server's egress IP as fast as possible.

    Priority:
      1. HTTPS_PROXY host if it's a numeric IPv4 (the static-proxy case).
      2. Cached value from a previous successful lookup.
      3. Literal 'unknown' — caller can decide whether to try harder.
    """
    global _OUTBOUND_IP_CACHED
    proxy = os.environ.get("HTTPS_PROXY") or os.environ.get("HTTP_PROXY") or ""
    if proxy:
        try:
            from urllib.parse import urlparse
            host = urlparse(proxy).hostname or ""
            if re.match(r"^\d{1,3}(\.\d{1,3}){3}$", host):
                _OUTBOUND_IP_CACHED = host
                return host
        except Exception:
            pass
    return _OUTBOUND_IP_CACHED or "unknown"


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
    # Global "logout all users" gate — any non-admin token issued BEFORE the
    # admin's last force-logout is considered expired. Admin tokens are exempt
    # so an admin can't accidentally kick themselves out with this action.
    if user.get("role") != "admin":
        settings_doc = await db.settings.find_one({}) or {}
        epoch = int(settings_doc.get("session_epoch") or 0)
        if epoch and int(payload.get("iat") or 0) < epoch:
            raise HTTPException(status_code=401, detail="Session revoked")
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
    "site_name": "Luckycart Box",
    "telegram_url": "",
    "whatsapp_url": "",
    "telegram_channel_url": "",
    "whatsapp_channel_url": "",
    "support_hours": "Monday to Sunday, 10:00 AM to 5:00 PM",
    "welcome_message": "Welcome to Luckycart Box — grow your money the smart way. Invest today, cash out tomorrow.",
    "withdrawal_fee_pct": 15.0,
    "auto_payout_enabled": False,
    "deposit_quick_amounts": [500, 1000, 2000, 5000, 10000, 20000],
    "batch_approve_limit": 50,
    # Referral reward levels (milestone bonuses paid on top of the 3-gen
    # commission network). Fully admin-editable from AdminSettings.
    #   min_referrals — how many qualifying gen-1 refs unlock this level
    #   reward         — naira credited to wallet when claimed
    #   name / icon / color — cosmetic identity for the level card
    "referral_levels": [
        {"level": 1, "name": "Ignite",    "icon": "flame",   "color": "#F97316", "min_referrals": 5,   "reward": 500},
        {"level": 2, "name": "Ascend",    "icon": "rocket",  "color": "#10B981", "min_referrals": 10,  "reward": 1500},
        {"level": 3, "name": "Empire",    "icon": "trophy",  "color": "#F5C518", "min_referrals": 25,  "reward": 5000},
        {"level": 4, "name": "Sovereign", "icon": "crown",   "color": "#8B5CF6", "min_referrals": 50,  "reward": 15000},
        {"level": 5, "name": "Titan",     "icon": "gem",     "color": "#22D3EE", "min_referrals": 100, "reward": 50000},
    ],
    # When True, only referred users who have made at least one investment
    # (has_invested=True) count toward the level thresholds. When False, any
    # registered gen-1 referral counts.
    "referral_level_requires_investment": True,
    # ── Daily Bonus Drop — an auto-generated coupon that appears on every
    # invested user's dashboard once per day at a scheduled time (Africa/Lagos).
    "auto_coupon_enabled": True,
    "auto_coupon_time": "17:10",          # HH:MM in Africa/Lagos (24h clock)
    "auto_coupon_amount": 500.0,          # naira per redeem
    "auto_coupon_max_uses": 10,           # how many users can grab today's code
    "auto_coupon_prefix": "LUCKY",        # printed as e.g. LUCKY-A3F7
    "auto_coupon_last_generated_date": "",  # bookkeeping — set by the cron
    # ── Withdrawal window — a daily open/close time (Africa/Lagos) that
    # prevents users from SUBMITTING new withdrawal requests outside the
    # window. Admin manual approval is never blocked.
    "withdrawal_window_enabled": False,
    "withdrawal_open_time": "08:00",
    "withdrawal_close_time": "17:00",
    "withdrawal_closed_message": "Withdrawals close at 5:00 PM daily. See you tomorrow at 8:00 AM!",
    # Admin-controlled gateway visibility. Each gateway can be toggled
    # independently for payin (deposits) and payout (withdrawals). Default:
    # every gateway on both directions is ON; admin can turn any off from the
    # AdminSettings → Payment Gateways panel.
    "gateway_toggles": {
        "paynow":   {"payin": True, "payout": True},
        "shpay":    {"payin": True, "payout": True},
        "onesspay": {"payin": True, "payout": True},
        "juntbest": {"payin": True, "payout": True},
    },
}


# Recognised gateway keys — used to validate admin toggle input.
GATEWAY_KEYS = ("paynow", "shpay", "onesspay", "juntbest")


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
    if gateway == "juntbest": return juntbest.enabled()
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


def classify_gateway_error(gateway_name: str, raw_msg: str) -> str:
    """Turn a raw gateway error string into an actionable user-facing message.

    Different gateway errors need different fixes:
      • IP whitelist  → ask merchant to whitelist server IP
      • Merchant not active / suspended → contact gateway's KYC / activation team
      • Channel not open / permission → ask gateway to enable this payment channel
      • Insufficient balance → top up merchant balance
      • Bank list / bank code → user's bank isn't supported on this gateway
      • Anything else → show raw message + generic hint
    """
    msg = (raw_msg or "").lower()
    label = {
        "paynow":   "Instant Pay",
        "shpay":    "Quick Pay",
        "onesspay": "Fast Pay",
        "juntbest": "Smart Pay",
    }.get(gateway_name, gateway_name)
    dashboard = {
        "paynow":   "PayNow",
        "shpay":    "SHPAY",
        "onesspay": "1SSPay",
        "juntbest": "JuntBest",
    }.get(gateway_name, gateway_name)

    # Merchant status
    if any(k in msg for k in ("merchant is not active", "merchant not active",
                                "merchant inactive", "merchant suspended",
                                "merchant disabled", "merchant is disabled")):
        return (f"{label} is temporarily unavailable — your {dashboard} merchant account is not activated yet. "
                f"Log into your {dashboard} dashboard and complete any pending KYC / activation steps, or contact your {dashboard} account manager to activate the account.")

    # Channel permission
    if any(k in msg for k in ("channel authority", "channel permission",
                                "channel not open", "channel is not open",
                                "channel status", "channel is disabled",
                                "channel stopped")):
        return (f"{label} is temporarily unavailable — your {dashboard} payment channel isn't enabled yet. "
                f"Ask your {dashboard} account manager to enable the Nigeria payin/payout channel for your merchant ID.")

    # IP whitelist
    if any(k in msg for k in ("ip whitelist", "not add ip", "please add ip whitelist",
                                "not in whitelist", "please use the ip you whitelist",
                                "whitelist check", "ip check")):
        return (f"{label} is momentarily unavailable — this server's IP isn't on the {dashboard} whitelist yet. "
                f"Whitelist your server IP in the {dashboard} dashboard and retry.")

    # Insufficient balance (payout only, but include for completeness)
    if any(k in msg for k in ("balance insufficient", "insufficient balance",
                                "not enough balance", "balance not enough")):
        return (f"{label} is temporarily unavailable — your {dashboard} merchant balance is insufficient. "
                f"Top up your {dashboard} merchant balance from their dashboard.")

    # Bank / account
    if any(k in msg for k in ("bank code", "bank not support",
                                "not supported", "invalid bank")):
        return (f"{label} rejected this bank. The bank the user picked isn't supported on {dashboard} for this channel. Please choose another payment option or contact your {dashboard} account manager.")

    # Sign / auth
    if any(k in msg for k in ("sign", "signature")):
        return (f"{label} rejected this request due to a signature error. This is a server-side issue — please contact support.")

    # Unknown — surface the raw message so at least admin can debug
    return (f"{label} is momentarily unavailable ({raw_msg}). Please try another payment option, or contact your {dashboard} account manager if this persists.")


# ---------------------------------------------------------------------------
# Bank code translation between gateways
# ---------------------------------------------------------------------------
# Each gateway uses its own bank code scheme:
#   • PayNow   : NG0xxx    (e.g. OPay = NG0204)
#   • SHPAY    : 6-digit   (e.g. OPay = 100004)
#   • 1SSPay   : NR0xxx    (e.g. OPay = NR0140)
#   • JuntBest : 80000xxx  (e.g. OPay = 80000030)
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


# Common Nigerian-bank aliases — some gateways spell the same bank differently
# ("Guaranty Trust Bank" vs "GTBank", "UBA" vs "United Bank For Africa"). When
# an exact/fuzzy match fails we try each alias against the target bank list.
_BANK_ALIASES: Dict[str, List[str]] = {
    "guaranty trust bank":     ["gtbank", "gtb", "guaranty trust", "gt bank"],
    "gtbank":                  ["guaranty trust bank", "gtb", "guaranty trust", "gt bank"],
    "gtb":                     ["gtbank", "guaranty trust bank"],
    "united bank for africa":  ["uba"],
    "uba":                     ["united bank for africa"],
    "first city monument bank":["fcmb"],
    "fcmb":                    ["first city monument bank"],
    "first bank of nigeria":   ["first bank", "firstbank"],
    "stanbic ibtc bank":       ["stanbic ibtc", "stanbic"],
    "moniepoint mfb":          ["moniepoint"],
    "moniepoint":              ["moniepoint mfb"],
    "kuda bank":               ["kuda mfb", "kuda microfinance bank", "kuda"],
    "kuda mfb":                ["kuda bank", "kuda microfinance bank", "kuda"],
    "opay":                    ["opay paycom", "opay digital services"],
    "palmpay":                 ["palmpay limited"],
    "polaris bank":            ["polaris"],
    "wema bank":               ["wema"],
    "sterling bank":           ["sterling"],
    "fidelity bank":           ["fidelity"],
    "zenith bank":             ["zenith"],
    "access bank":             ["access bank plc"],
    "ecobank nigeria":         ["ecobank"],
    "union bank of nigeria":   ["union bank"],
    "keystone bank":           ["keystone"],
    "jaiz bank":               ["jaiz"],
    "citibank nigeria":        ["citibank", "citi bank"],
    "titan trust bank":        ["titan trust"],
}


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
        # JuntPay v1 uses 6-digit CBN-format bank codes (e.g. "000014" Access,
        # "100004" OPay, "090267" Kuda). The legacy "80000xxx" static codes are
        # NOT accepted by the new API. Skip fast-path for juntbest and always
        # resolve via bank name against the live list (`list_banks_async`).
        # NOTE: SHPAY also uses digit codes but its length range is 4-6 and
        # doesn't overlap with JuntPay's canonical NNNNNN shape enough to
        # trust — so we keep SHPAY on a name-based lookup too when it errors.
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
    if target_gateway == "juntbest":
        # JuntPay v1 uses live CBN-format codes returned by
        # /api/v1/merchant/queryBankCode (see juntbest.list_banks_async).
        # Always resolve via live list; fall back to static only if the API
        # is unreachable (rare — proxy 403 during fetch).
        try:
            banks = await juntbest.list_banks_async()
        except Exception:
            banks = juntbest.NIGERIAN_BANKS
        if not banks:
            banks = juntbest.NIGERIAN_BANKS
        # 1) Exact match on the raw bank name
        for b in banks:
            if _normalize_bank_name(b["name"]) == key:
                return b["code"]
        # 2) Alias exact-match (handles "UBA" ↔ "United Bank For Africa",
        #    "FCMB" ↔ "First City Monument Bank", "GTBank" ↔ "Guaranty Trust
        #    Bank"). Only exact — short aliases must not fuzzy-match wallets
        #    like "UBA MONI" or "FCMB MFB".
        for alias in _BANK_ALIASES.get(key, []):
            alias_key = _normalize_bank_name(alias)
            for b in banks:
                if _normalize_bank_name(b["name"]) == alias_key:
                    return b["code"]
        # 3) Fuzzy substring — only if the key is long enough that a substring
        #    hit is meaningful (>=5 chars). Prefer shorter target names so
        #    "Access Bank" wins over "Access Bank (Diamond)".
        if len(key) >= 5:
            candidates = []
            for b in banks:
                nb = _normalize_bank_name(b["name"])
                if key in nb or nb in key:
                    candidates.append((len(nb), b["code"]))
            if candidates:
                candidates.sort()
                return candidates[0][1]
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

    priority = ["paynow", "shpay", "onesspay", "juntbest"]
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
            if gw == "juntbest":
                w_scoped["juntbest_bank_code"] = translated
                return await _juntbest_payout_withdrawal(w_scoped, note=note)
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
    await db.users.create_index("referred_by")
    await db.products.create_index("active")
    await db.products.create_index([("active", 1), ("price", 1)])
    await db.investments.create_index("user_id")
    await db.investments.create_index([("user_id", 1), ("status", 1)])
    await db.investments.create_index([("user_id", 1), ("created_at", -1)])
    await db.transactions.create_index([("user_id", 1), ("created_at", -1)])
    await db.transactions.create_index([("user_id", 1), ("type", 1)])
    await db.deposits.create_index([("user_id", 1), ("created_at", -1)])
    await db.withdrawals.create_index([("user_id", 1), ("created_at", -1)])
    await db.coupons.create_index("code", unique=True)
    await get_settings()

    admin_email = (os.environ.get("ADMIN_EMAIL") or "").lower().strip()
    admin_phone_raw = os.environ.get("ADMIN_PHONE") or ""
    admin_phone = normalize_phone(admin_phone_raw) if admin_phone_raw else None
    admin_password = os.environ.get("ADMIN_PASSWORD", "Admin@12345")
    admin_name = os.environ.get("ADMIN_NAME", "Platform Admin")

    # Prefer email as the primary admin identifier, but always fall back on the
    # reserved referral_code / role so re-seeding is idempotent even when the
    # admin email or phone changes between environments (this is what killed the
    # Fly.io deploy on 2026-07-29 — DuplicateKeyError on referral_code_1).
    existing = None
    if admin_email:
        existing = await db.users.find_one({"email": admin_email})
    if not existing and admin_phone:
        existing = await db.users.find_one({"phone": admin_phone})
    if not existing:
        existing = await db.users.find_one({"referral_code": "ADMIN001"})
    if not existing:
        existing = await db.users.find_one({"role": "admin"})

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
            # Race: something else inserted first. Re-query and update instead
            # of throwing — never let the seed step take down the app.
            logger.exception("Admin seed insert failed, retrying via update")
            recovered = None
            if admin_email:
                recovered = await db.users.find_one({"email": admin_email})
            if not recovered:
                recovered = await db.users.find_one({"referral_code": "ADMIN001"})
            if recovered:
                updates = {"password_hash": hash_password(admin_password), "role": "admin"}
                if admin_email:
                    updates["email"] = admin_email
                if admin_phone:
                    updates["phone"] = admin_phone
                if admin_name:
                    updates["name"] = admin_name
                await db.users.update_one({"_id": recovered["_id"]}, {"$set": updates})
                logger.info("Recovered admin user %s via post-insert lookup", recovered["_id"])
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
    asyncio.create_task(_juntbest_reconcile_cron())
    asyncio.create_task(_auto_coupon_cron())
    # Warm the JuntPay bank cache so the first payout attempt doesn't hit a
    # cold cache + a flaky-proxy 403. Non-blocking — failures fall back to
    # the static list at request time.
    asyncio.create_task(_juntbest_warm_bank_cache())


async def _juntbest_warm_bank_cache():
    """Fire-and-forget: fetch the JuntPay bank list once so translate_bank_code
    can respond instantly on the first withdrawal approval. Retries every 5
    minutes if the initial call fails (usually IPRoyal 403)."""
    await asyncio.sleep(10)
    while True:
        try:
            if juntbest.enabled():
                banks = await juntbest.list_banks_async(force=True)
                if banks and len(banks) > 50:
                    logger.info("JuntPay bank cache warmed: %d banks", len(banks))
                    return
        except Exception:
            logger.exception("JuntPay bank cache warm-up failed")
        await asyncio.sleep(5 * 60)


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


# --- JuntBest reconciliation cron ---------------------------------------
async def _juntbest_reconcile_cron():
    """Every 5 minutes, poll JuntBest for pending payin/payout orders and settle
    them. Safety net for missed JuntBest webhooks (same pattern as the other
    gateways). Staggered start so we don't hammer the proxy on boot."""
    await asyncio.sleep(105)
    while True:
        try:
            if juntbest.enabled():
                await reconcile_pending_juntbest_deposits()
                await reconcile_pending_juntbest_withdrawals()
        except Exception:
            logger.exception("juntbest reconcile cron error")
        await asyncio.sleep(5 * 60)


async def reconcile_pending_juntbest_deposits() -> int:
    """Query JuntBest for pending juntbest deposits and credit any that show status=1."""
    pending = await db.deposits.find({"gateway": "juntbest", "status": "pending"}).to_list(200)
    credited = 0
    for dep in pending:
        order_sn = dep.get("merchant_order_no")
        if not order_sn:
            continue
        try:
            resp = await juntbest.query_payin(order_sn)
        except Exception:
            logger.exception("JuntBest query_payin failed for %s", order_sn)
            continue
        if int(resp.get("code") if resp.get("code") is not None else -1) != 0:
            continue
        data = resp.get("data") or {}
        status = str(data.get("status") or "")
        if status == "1":  # success
            amount_real = float(data.get("amount") or dep["amount"] or 0)
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
                                  "Deposit auto-credited (JuntBest reconciled)",
                                  {"deposit_id": str(dep["_id"]), "gateway": "juntbest"})
            logger.info("JuntBest reconcile credited user=%s amount=₦%.2f dep=%s",
                        dep["user_id"], credit_amount, dep["_id"])
            credited += 1
        elif status == "9":  # failed
            await db.deposits.update_one(
                {"_id": dep["_id"], "status": "pending"},
                {"$set": {"status": "rejected", "processed_at": now_utc().isoformat(),
                          "gateway_query": data,
                          "gateway_error": data.get("message") or "JuntBest reported failure"}},
            )
    return credited


async def reconcile_pending_juntbest_withdrawals() -> int:
    """Query JuntBest for withdrawals in `processing` and settle them."""
    processing = await db.withdrawals.find({"gateway": "juntbest", "status": "processing"}).to_list(200)
    settled = 0
    for w in processing:
        order_sn = w.get("merchant_order_no")
        if not order_sn:
            continue
        try:
            resp = await juntbest.query_payout(order_sn)
        except Exception:
            logger.exception("JuntBest query_payout failed for %s", order_sn)
            continue
        if int(resp.get("code") if resp.get("code") is not None else -1) != 0:
            continue
        data = resp.get("data") or {}
        status = str(data.get("status") or "")
        if status == "1":  # success
            await db.withdrawals.update_one(
                {"_id": w["_id"], "status": "processing"},
                {"$set": {"status": "approved", "processed_at": now_utc().isoformat(),
                          "gateway_query": data, "reconciled": True}},
            )
            await settle_withdrawal_hold(w["user_id"], str(w["_id"]), "withdrawal",
                                          "Withdrawal paid out (JuntBest reconciled)")
            settled += 1
        elif status == "9":  # failed
            await db.users.update_one({"_id": w["user_id"]},
                                      {"$inc": {"wallet_balance": float(w["amount"])}})
            await db.withdrawals.update_one(
                {"_id": w["_id"], "status": "processing"},
                {"$set": {"status": "rejected", "processed_at": now_utc().isoformat(),
                          "gateway_query": data,
                          "gateway_error": data.get("message") or "JuntBest reported failure"}},
            )
            await add_transaction(w["user_id"], "withdrawal_refund", float(w["amount"]),
                                  "Withdrawal failed - refunded (JuntBest reconciled)",
                                  {"withdrawal_id": str(w["_id"]), "gateway": "juntbest"})
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


# ---------------------------------------------------------------------------
# Africa/Lagos time helpers — every scheduled feature (daily coupon drop,
# withdrawal window) expresses times in local Nigerian time even though the
# server stores UTC. WAT is UTC+1 all year (no DST).
# ---------------------------------------------------------------------------
_LAGOS_TZ = ZoneInfo("Africa/Lagos")


def _lagos_now() -> datetime:
    return datetime.now(_LAGOS_TZ)


def _parse_hhmm(s: str, default_h: int = 0, default_m: int = 0) -> tuple[int, int]:
    """Best-effort parse of admin-entered 'HH:MM' string."""
    try:
        h, m = (s or "").split(":", 1)
        return max(0, min(23, int(h))), max(0, min(59, int(m)))
    except Exception:
        return default_h, default_m


def _random_coupon_suffix(n: int = 4) -> str:
    """Human-friendly 4-char suffix — no ambiguous 0/O or 1/I."""
    alphabet = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789"
    return "".join(secrets.choice(alphabet) for _ in range(n))


async def _generate_daily_coupon(settings: dict) -> Optional[dict]:
    """Atomically create the day's auto-coupon if it hasn't been created yet.

    Idempotent — guarded on `settings.auto_coupon_last_generated_date` so
    concurrent cron invocations OR admin "Generate now" clicks can't
    accidentally spawn two coupons for the same day. Returns the created
    coupon doc or None if today's coupon already exists.
    """
    today = _lagos_now().strftime("%Y-%m-%d")
    # Compare-and-swap on the date field prevents double-generation
    res = await db.settings.update_one(
        {"$or": [
            {"auto_coupon_last_generated_date": {"$ne": today}},
            {"auto_coupon_last_generated_date": {"$exists": False}},
        ]},
        {"$set": {"auto_coupon_last_generated_date": today}},
    )
    if res.modified_count == 0:
        # Another worker already generated today's coupon
        return None

    prefix = (settings.get("auto_coupon_prefix") or "LUCKY").upper().strip()[:10]
    amount = float(settings.get("auto_coupon_amount") or 500)
    max_uses = max(1, int(settings.get("auto_coupon_max_uses") or 10))

    # Loop in case of a rare collision on the random suffix
    for _ in range(6):
        code = f"{prefix}-{_random_coupon_suffix()}"
        existing = await db.coupons.find_one({"code": code})
        if not existing:
            break
    else:
        # Extremely unlikely: 6 collisions in a row → use longer suffix
        code = f"{prefix}-{_random_coupon_suffix(6)}"

    now_iso = now_utc().isoformat()
    doc = {
        "code": code,
        "amount": amount,
        "max_uses": max_uses,
        "used_by": [],
        "active": True,
        "type": "auto_daily",           # distinguishes from admin-manual coupons
        "generated_date": today,        # YYYY-MM-DD in Africa/Lagos
        "created_at": now_iso,
    }
    res2 = await db.coupons.insert_one(doc)
    doc["_id"] = res2.inserted_id
    logger.info("Daily coupon generated: %s (amount=₦%.0f, max_uses=%d)",
                code, amount, max_uses)
    return doc


async def _auto_coupon_cron():
    """Wake up every 30s; when Lagos local time matches admin's configured
    generation time (HH:MM) and today's coupon hasn't been generated yet,
    create it. Robust against sleep-through (checks every 30s so worst-case
    delay from set time is 30s). Also self-heals if pod restarts inside the
    trigger minute."""
    await asyncio.sleep(45)  # let startup settle
    while True:
        try:
            settings = await get_settings()
            if not settings.get("auto_coupon_enabled", True):
                await asyncio.sleep(30)
                continue
            now = _lagos_now()
            target_h, target_m = _parse_hhmm(settings.get("auto_coupon_time") or "17:10", 17, 10)
            today = now.strftime("%Y-%m-%d")
            last = settings.get("auto_coupon_last_generated_date") or ""
            if last == today:
                # Already generated today — sleep until close to next check
                await asyncio.sleep(30)
                continue
            # Fire only when we've reached/passed the target time today
            if now.hour > target_h or (now.hour == target_h and now.minute >= target_m):
                await _generate_daily_coupon(settings)
        except Exception:
            logger.exception("Auto-coupon cron tick failed")
        await asyncio.sleep(30)


# ---------------------------------------------------------------------------
# Withdrawal window — check if user submissions are currently allowed given
# the admin-configured open/close times in Africa/Lagos.
# ---------------------------------------------------------------------------
def _withdrawal_window_state(settings: dict) -> dict:
    """Return {'enabled', 'is_open', 'open_time', 'close_time', 'message',
    'next_open_at'}. `next_open_at` is an ISO datetime of the next opening,
    used by the client to render a friendly countdown."""
    enabled = bool(settings.get("withdrawal_window_enabled", False))
    open_str = settings.get("withdrawal_open_time") or "08:00"
    close_str = settings.get("withdrawal_close_time") or "17:00"
    message = settings.get("withdrawal_closed_message") or "Withdrawals are currently closed."
    if not enabled:
        return {
            "enabled": False, "is_open": True,
            "open_time": open_str, "close_time": close_str,
            "message": None, "next_open_at": None,
        }
    now = _lagos_now()
    oh, om = _parse_hhmm(open_str, 8, 0)
    ch, cm = _parse_hhmm(close_str, 17, 0)
    open_dt = now.replace(hour=oh, minute=om, second=0, microsecond=0)
    close_dt = now.replace(hour=ch, minute=cm, second=0, microsecond=0)

    if open_dt <= close_dt:
        is_open = open_dt <= now < close_dt
        next_open = open_dt if now < open_dt else (open_dt + timedelta(days=1))
    else:
        # Overnight window (rare) e.g. open 22:00 close 06:00
        is_open = now >= open_dt or now < close_dt
        next_open = open_dt if now < open_dt else open_dt

    return {
        "enabled": True, "is_open": is_open,
        "open_time": open_str, "close_time": close_str,
        "message": None if is_open else message,
        "next_open_at": next_open.astimezone(timezone.utc).isoformat(),
    }


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
    image_url: Optional[str] = None  # data-URL (data:image/…;base64,…) or absolute URL
    tier: Optional[str] = None       # legendary | epic | hot | newcomer | tech | fashion — used for the badge color


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
    whatsapp_url: Optional[str] = None
    telegram_channel_url: Optional[str] = None
    whatsapp_channel_url: Optional[str] = None
    support_hours: Optional[str] = None
    welcome_message: Optional[str] = None
    withdrawal_fee_pct: Optional[float] = None
    auto_payout_enabled: Optional[bool] = None
    deposit_quick_amounts: Optional[List[float]] = None
    batch_approve_limit: Optional[int] = None
    referral_levels: Optional[List[dict]] = None
    referral_level_requires_investment: Optional[bool] = None
    auto_coupon_enabled: Optional[bool] = None
    auto_coupon_time: Optional[str] = None
    auto_coupon_amount: Optional[float] = None
    auto_coupon_max_uses: Optional[int] = None
    auto_coupon_prefix: Optional[str] = None
    withdrawal_window_enabled: Optional[bool] = None
    withdrawal_open_time: Optional[str] = None
    withdrawal_close_time: Optional[str] = None
    withdrawal_closed_message: Optional[str] = None


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
    """Credit any due daily profits for the user's active investments.

    Fast-path: 99% of calls have zero drops due (background cron runs every
    15 min and the user hits the page more often than that). We short-circuit
    with a single indexed projection query that reads only `last_drop_at`
    (+ `duration_days` and `drops_done` to know if the plan is still
    running). If no active investment is 24h+ past its last drop, we skip
    the whole loop — saves 2-3 Atlas round trips per read.
    """
    now = now_utc()
    threshold = now - timedelta(days=1)
    threshold_iso = threshold.isoformat()
    # Cheap probe — indexed by (user_id, status). Uses a projection to keep
    # the read small.
    cursor = db.investments.find(
        {"user_id": user["_id"], "status": "active"},
        {"last_drop_at": 1, "created_at": 1, "duration_days": 1, "drops_done": 1},
    )
    needs_drop = False
    async for inv in cursor:
        last = inv.get("last_drop_at") or inv.get("created_at")
        if not last:
            continue
        # Compare as ISO strings when possible — that's how the docs are stored.
        if isinstance(last, str):
            if last < threshold_iso:
                needs_drop = True
                break
        else:
            try:
                last_dt = last if hasattr(last, "tzinfo") else datetime.fromisoformat(str(last))
                if last_dt < threshold:
                    needs_drop = True
                    break
            except Exception:
                continue
    if not needs_drop:
        return user
    # Slow path — at least one investment is due; do the full walk.
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
    return {
        "user": clean(user),
        "access_token": access,
        # Authoritative amount actually credited — the client uses this for the
        # welcome toast so the message can never drift from settings.welcome_bonus.
        "welcome_bonus_credited": welcome,
    }


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


class ChangePasswordIn(BaseModel):
    current_password: str
    new_password: str


@api.post("/auth/change-password")
async def change_password(payload: ChangePasswordIn, user: dict = Depends(get_current_user)):
    """Authenticated password change. Requires the current password so a stolen
    session token can't silently take over the account. Same bcrypt scheme as
    register + login (`hash_password` / `verify_password`)."""
    if len(payload.new_password or "") < 6:
        raise HTTPException(400, "New password must be at least 6 characters")
    if payload.current_password == payload.new_password:
        raise HTTPException(400, "New password must be different from your current one")
    if not verify_password(payload.current_password, user.get("password_hash") or ""):
        raise HTTPException(400, "Current password is incorrect")
    await db.users.update_one(
        {"_id": user["_id"]},
        {"$set": {"password_hash": hash_password(payload.new_password),
                  "password_changed_at": now_utc().isoformat()}},
    )
    return {"ok": True}


# ---------------------------------------------------------------------------
# Products (public list + admin CRUD)
# ---------------------------------------------------------------------------
@api.get("/products")
async def list_products(
    user: dict = Depends(get_current_user),
    full: bool = False,
):
    """Returns the product catalog.

    Product `image_url` values in the DB can be either an external URL OR a
    huge base64 `data:image/...;base64,...` URI (uploads via the admin UI go
    the latter route). Base64 data URIs bloat the JSON payload — a single
    image easily hits 130 KB, making 5 products = 650 KB and the Marketplace
    feel sluggish on mobile.

    So by default we swap embedded data URIs for a small
    `/api/products/{id}/image` URL that streams the same bytes with proper
    HTTP caching. Admins who need the raw base64 (to display in the edit
    modal thumbnail) can pass `?full=true`. The size drop is >99% for
    typical catalogs.
    """
    query = {} if user.get("role") == "admin" else {"active": True}
    docs = await db.products.find(query).sort("price", 1).to_list(200)
    out = []
    for d in docs:
        c = clean(d)
        img = c.get("image_url")
        if not full and img and isinstance(img, str) and img.startswith("data:"):
            # Cache-buster: last 8 chars of the base64 payload guarantee the
            # URL changes whenever admin uploads a new image, avoiding stale
            # thumbnails.
            c["image_url"] = f"/api/products/{c['id']}/image?v={img[-8:]}"
        out.append(c)
    return out


@api.get("/products/{pid}/image")
async def product_image(pid: str, v: Optional[str] = None):
    """Serve a product's uploaded image as a real HTTP resource so the
    browser can cache it aggressively. The `v` query param is opaque — it
    exists purely as a cache-buster the list endpoint injects."""
    try:
        prod = await db.products.find_one({"_id": oid(pid)}, {"image_url": 1})
    except Exception:
        raise HTTPException(status_code=404, detail="Product not found")
    if not prod or not prod.get("image_url"):
        raise HTTPException(status_code=404, detail="No image")
    raw = prod["image_url"]
    if not isinstance(raw, str) or not raw.startswith("data:"):
        # External URL — 302 redirect so the client fetches directly.
        return RedirectResponse(url=raw, status_code=302)
    # Parse data URI: data:<mime>;base64,<payload>
    import base64
    try:
        header, payload = raw.split(",", 1)
        mime = "image/jpeg"
        if header.startswith("data:") and ";" in header:
            mime = header[5:].split(";", 1)[0] or mime
        blob = base64.b64decode(payload)
    except Exception:
        raise HTTPException(status_code=500, detail="Image decode failed")
    return Response(
        content=blob,
        media_type=mime,
        headers={
            # 30 days, immutable — safe because our URL changes on every
            # upload (cache-buster in `v` query param).
            "Cache-Control": "public, max-age=2592000, immutable",
        },
    )


@api.post("/admin/products")
async def create_product(p: ProductIn, admin: dict = Depends(get_admin_user)):
    doc = p.model_dump()
    doc["created_at"] = now_utc().isoformat()
    res = await db.products.insert_one(doc)
    return clean(await db.products.find_one({"_id": res.inserted_id}))


@api.put("/admin/products/{pid}")
async def update_product(pid: str, p: ProductIn, admin: dict = Depends(get_admin_user)):
    payload = p.model_dump()
    # Guard: if the client (admin UI) round-tripped the served `/api/products/{id}/image`
    # URL as image_url, DO NOT overwrite the stored base64 with our own
    # serving URL — keep the existing image.
    img = payload.get("image_url")
    if isinstance(img, str) and img.startswith("/api/products/") and "/image" in img:
        payload.pop("image_url", None)
    await db.products.update_one({"_id": oid(pid)}, {"$set": payload})
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
    # Run the investments-list read IN PARALLEL with the profit-drop probe.
    # Both operate on the same collection with an indexed user_id filter, so
    # Atlas serves them concurrently. `asyncio.gather` accepts any awaitable
    # (motor futures included), while `create_task` needs a native coroutine.
    docs, user = await asyncio.gather(
        db.investments.find({"user_id": user["_id"]}).sort("created_at", -1).to_list(500),
        process_profit_drops(user),
    )
    # Batch-load product images + tiers so the UI can show thumbnails + tier badges.
    prod_ids = list({d["product_id"] for d in docs})
    prods = {}
    if prod_ids:
        async for p in db.products.find({"_id": {"$in": prod_ids}}):
            prods[p["_id"]] = p
    out = []
    for d in docs:
        p = prods.get(d["product_id"], {})
        d["id"] = str(d.pop("_id"))
        d["user_id"] = str(d["user_id"])
        d["product_id"] = str(d["product_id"])
        # Convert huge inline data URIs to the small streaming URL so the
        # /investments payload stays lean (was 130KB+ per row).
        img = p.get("image_url")
        if img and isinstance(img, str) and img.startswith("data:"):
            d["product_image_url"] = f"/api/products/{d['product_id']}/image?v={img[-8:]}"
        else:
            d["product_image_url"] = img or None
        d["product_tier"] = p.get("tier") or None
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

    # Derive the gateway label from the method prefix up-front. This ensures
    # even if the downstream gateway API call fails, the deposit row still
    # shows the gateway the user PICKED (PayNow / SHPAY / 1SSPay / JuntBest)
    # in the admin table — not "manual". Only genuine payment-account
    # transfers stay labeled manual.
    _mp = (payload.method or "").split("-")[0]
    _initial_gateway = _mp if _mp in GATEWAY_KEYS else "manual"

    doc = {
        "user_id": user["_id"],
        "user_name": user["name"],
        "user_phone": user["phone"],
        "amount": float(payload.amount),
        "method": payload.method,
        "reference": payload.reference or "",
        "status": "pending",
        "gateway": _initial_gateway,
        "created_at": now_utc().isoformat(),
    }

    # If a payment account id was chosen, enrich with bank details so the
    # admin table can show "which account did the user try to pay into".
    if payload.method and not any(payload.method.startswith(p) for p in ("paynow", "shpay", "onesspay", "juntbest")):
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
            # Instant static-IP lookup (no external ipify call) — the whole
            # point of the static proxy is that the egress IP is fixed.
            outbound_ip = outbound_ip_fast()
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
                "gateway_message": "Our payment gateway is warming up on our servers. Please try a bank transfer below or tap Retry in a minute.",
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
            # Instant static-IP lookup (no external ipify call) — the whole
            # point of the static proxy is that the egress IP is fixed.
            outbound_ip = outbound_ip_fast()
            d = await db.deposits.find_one({"_id": res.inserted_id})
            return clean(d) | {
                "user_id": str(d["user_id"]),
                "gateway": "paynow",
                "checkout_url": None,
                "gateway_ready": False,
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
        u_email = user.get("email") or f"{u_phone or 'user'}@luckycartbox.local"
        try:
            sp = await shpay.create_payin(
                out_trade_no,
                float(payload.amount),
                payer_name=u_name,
                payer_mobile=u_phone[-10:] if u_phone else None,
                payer_email=u_email,
                subject="Wallet deposit",
                body=f"Luckycart Box deposit for {u_name}",
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
            # Instant static-IP lookup (no external ipify call) — the whole
            # point of the static proxy is that the egress IP is fixed.
            outbound_ip = outbound_ip_fast()
            d = await db.deposits.find_one({"_id": res.inserted_id})
            return clean(d) | {
                "user_id": str(d["user_id"]),
                "gateway": "shpay",
                "checkout_url": None,
                "gateway_ready": False,
                "gateway_message": classify_gateway_error("shpay", gateway_error),
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
        u_email = user.get("email") or f"{u_phone or 'user'}@luckycartbox.local"
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
            # Instant static-IP lookup (no external ipify call) — the whole
            # point of the static proxy is that the egress IP is fixed.
            outbound_ip = outbound_ip_fast()
            d = await db.deposits.find_one({"_id": res.inserted_id})
            return clean(d) | {
                "user_id": str(d["user_id"]),
                "gateway": "onesspay",
                "checkout_url": None,
                "gateway_ready": False,
                "gateway_message": classify_gateway_error("onesspay", gateway_error),
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

    # JuntBest auto-flow — fourth gateway. Users pick method "juntbest-pay".
    if juntbest.enabled() and (payload.method or "").startswith("juntbest"):
        res = await db.deposits.insert_one(doc)
        order_sn = f"JB{str(res.inserted_id)[-16:]}{int(datetime.now().timestamp())}"
        u_phone = (user.get("phone") or "").lstrip("+")
        u_name  = user.get("name") or "User"
        u_email = user.get("email") or f"{u_phone or 'user'}@luckycartbox.local"
        redirect_url = (os.environ.get("FRONTEND_URL") or "").rstrip("/") + "/deposit"
        try:
            resp = await juntbest.create_payin(
                order_sn=order_sn,
                amount=float(payload.amount),
                name=u_name,
                phone=u_phone[-10:] if u_phone else "0000000000",
                email=u_email,
                remark=f"Luckycart Box deposit for {u_name}",
                redirect_url=redirect_url,
            )
        except Exception as e:
            logger.exception("JuntBest create_payin failed")
            await db.deposits.update_one({"_id": res.inserted_id},
                                         {"$set": {"status": "failed", "gateway_error": str(e)}})
            raise HTTPException(400, "JuntBest is not reachable right now. Please try another payment option.")

        # JuntBest success is code == 0. Anything else = declined.
        if int(resp.get("code") if resp.get("code") is not None else -1) != 0:
            gateway_error = resp.get("message") or "JuntBest declined the order"
            await db.deposits.update_one({"_id": res.inserted_id},
                                         {"$set": {"status": "failed",
                                                   "gateway_error": gateway_error,
                                                   "gateway_response": resp}})
            # Instant static-IP lookup (no external ipify call) — the whole
            # point of the static proxy is that the egress IP is fixed.
            outbound_ip = outbound_ip_fast()
            d = await db.deposits.find_one({"_id": res.inserted_id})
            return clean(d) | {
                "user_id": str(d["user_id"]),
                "gateway": "juntbest",
                "checkout_url": None,
                "gateway_ready": False,
                "gateway_message": classify_gateway_error("juntbest", gateway_error),
            }

        data = resp.get("data") or {}
        checkout_url = data.get("pay_url") or data.get("url")
        platform_osn = data.get("platform_osn")
        await db.deposits.update_one(
            {"_id": res.inserted_id},
            {"$set": {"gateway": "juntbest",
                      "merchant_order_no": order_sn,
                      "platform_order_no": platform_osn,
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


async def _juntbest_payout_withdrawal(w: dict, note: str = "") -> dict:
    """Trigger a JuntBest payout for a withdrawal (net of fee). Raises on gateway error.

    JuntBest uses 8-digit `80000xxx` bank codes. When the withdrawal's stored
    bank_code is in a different scheme, translate_bank_code() (in the dispatcher)
    already resolved it to `w["juntbest_bank_code"]` before calling us.
    """
    payout_amount = float(w.get("payout_amount") or w.get("amount") or 0)
    order_sn = f"JW{str(w['_id'])[-15:]}{int(datetime.now().timestamp())}"
    bank_code = w.get("juntbest_bank_code") or w.get("bank_code") or ""
    if not bank_code:
        raise HTTPException(400, "This withdrawal has no bank code — user must re-bind their bank first.")
    resp = await juntbest.create_payout(
        order_sn=order_sn,
        amount=payout_amount,
        name=w["account_name"],
        account=w["account_number"],
        bank_code=bank_code,
        remark=note or f"Luckycart Box payout for {w.get('user_name') or 'user'}",
    )
    # JuntBest returns {code: 0, message, data:{platform_osn,...}}. Success is 0.
    code = resp.get("code") if resp.get("code") is not None else -1
    if int(code) != 0:
        raw_msg = resp.get("message") or resp.get("msg") or "unknown"
        logger.warning(
            "JuntPay payout REJECTED wid=%s bank_code=%s account=%s name=%s amount=%s → code=%s msg=%s full=%s",
            w["_id"], bank_code, w.get("account_number"), w.get("account_name"),
            payout_amount, code, raw_msg, resp,
        )
        # Persist the raw response on the withdrawal so admin UI can show it.
        try:
            await db.withdrawals.update_one(
                {"_id": w["_id"]},
                {"$set": {"last_gateway_attempt": {
                    "gateway": "juntbest",
                    "code": code,
                    "message": raw_msg,
                    "bank_code_sent": bank_code,
                    "at": now_utc().isoformat(),
                }}},
            )
        except Exception:
            pass
        raise HTTPException(400, f"JuntPay declined (code {code}): {raw_msg}")
    data = resp.get("data") or {}
    await db.withdrawals.update_one(
        {"_id": w["_id"]},
        {"$set": {
            "status": "processing",
            "processed_at": now_utc().isoformat(),
            "admin_note": note or "",
            "gateway": "juntbest",
            "merchant_order_no": order_sn,
            "platform_order_no": data.get("platform_osn"),
            "gateway_response": resp,
        }},
    )
    return resp


@api.post("/withdrawals")
async def create_withdrawal(payload: WithdrawCreateIn, user: dict = Depends(get_current_user)):
    if not user.get("has_invested"):
        raise HTTPException(400, "You must invest first before withdrawing")
    settings = await get_settings()
    # Admin-configured daily withdrawal window (blocks user submissions only —
    # admins can still manually approve pending requests at any time).
    win = _withdrawal_window_state(settings)
    if win["enabled"] and not win["is_open"]:
        raise HTTPException(status_code=423, detail=win["message"])
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
    # Parallel step 1: settings + gen1 users + transactions can all fire together
    settings, gen1_docs, tx = await asyncio.gather(
        get_settings(),
        db.users.find({"referred_by": user["_id"]}).to_list(1000),
        db.transactions.find({"user_id": user["_id"], "type": "referral"}).to_list(2000),
    )
    gen1_ids = [u["_id"] for u in gen1_docs]

    # Parallel step 2: gen2 requires gen1_ids; gen3 requires gen2_ids — so gen2
    # runs alone, then gen3 runs alone. Still 3 RTTs total instead of 5.
    gen2_docs = await db.users.find({"referred_by": {"$in": gen1_ids}}).to_list(1000) if gen1_ids else []
    gen2_ids = [u["_id"] for u in gen2_docs]
    gen3_docs = await db.users.find({"referred_by": {"$in": gen2_ids}}).to_list(1000) if gen2_ids else []

    def shape(u):
        return {"id": str(u["_id"]), "name": u["name"], "phone": u["phone"][-4:].rjust(len(u["phone"]), "*"),
                "has_invested": u.get("has_invested", False), "joined_at": u.get("created_at")}

    # Total commissions
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
# Referral reward levels (milestone bonuses on top of the 3-gen commission)
# ---------------------------------------------------------------------------
def _sorted_levels(settings: dict) -> list:
    """Return the admin-configured levels sorted ascending by min_referrals."""
    lvls = settings.get("referral_levels") or []
    return sorted(
        [l for l in lvls if isinstance(l, dict) and "min_referrals" in l and "reward" in l],
        key=lambda l: (l.get("min_referrals", 0), l.get("level", 0)),
    )


async def _qualifying_referral_count(user_id: ObjectId, requires_investment: bool) -> int:
    """Count gen-1 referrals for the given user, optionally filtered to those
    who have invested at least once."""
    q = {"referred_by": user_id}
    if requires_investment:
        q["has_invested"] = True
    return await db.users.count_documents(q)


@api.get("/referrals/rewards")
async def referral_rewards(user: dict = Depends(get_current_user)):
    """Return the user's progress across every admin-configured reward level."""
    settings = await get_settings()
    requires_inv = bool(settings.get("referral_level_requires_investment", True))
    levels = _sorted_levels(settings)
    count = await _qualifying_referral_count(user["_id"], requires_inv)

    claimed = set(user.get("claimed_referral_levels") or [])
    tiers = []
    for lv in levels:
        lvl_id = int(lv.get("level", 0))
        min_r = int(lv.get("min_referrals", 0))
        reward = float(lv.get("reward", 0))
        eligible = count >= min_r
        is_claimed = lvl_id in claimed
        tiers.append({
            "level": lvl_id,
            "name": lv.get("name") or f"Level {lvl_id}",
            "icon": lv.get("icon") or "gem",
            "color": lv.get("color") or "#F5C518",
            "min_referrals": min_r,
            "reward": reward,
            "unlocked": eligible,
            "claimed": is_claimed,
            "claimable": eligible and not is_claimed,
        })

    # Progress toward the next locked tier. We show absolute progress
    # (count / next_tier.min_referrals) so the visual bar always matches
    # the "N / M" text the user sees — no confusing 0% at tier-entry.
    next_tier = next((t for t in tiers if not t["unlocked"]), None)
    prev_tier = next((t for t in reversed(tiers) if t["unlocked"]), None)
    if next_tier:
        span = max(1, next_tier["min_referrals"])
        progress_pct = min(100.0, round(count * 100 / span, 1))
    else:
        progress_pct = 100.0 if tiers else 0.0

    total_earned = sum(t["reward"] for t in tiers if t["claimed"])

    # Newly-unlocked tiers the user hasn't been "notified" of yet — the
    # dashboard listener uses this to fire a confetti milestone toast, then
    # POSTs to /referrals/rewards/acknowledge so the toast fires exactly once
    # per tier across every device the user logs in on.
    notified = set(user.get("notified_referral_levels") or [])
    newly_unlocked = [
        {"level": t["level"], "name": t["name"], "icon": t["icon"],
         "color": t["color"], "reward": t["reward"]}
        for t in tiers if t["unlocked"] and t["level"] not in notified
    ]

    return {
        "count": count,
        "requires_investment": requires_inv,
        "tiers": tiers,
        "current_level": prev_tier["level"] if prev_tier else 0,
        "current_level_name": prev_tier["name"] if prev_tier else "Rookie",
        "next_level": next_tier["level"] if next_tier else None,
        "next_level_name": next_tier["name"] if next_tier else None,
        "next_level_needs": (next_tier["min_referrals"] - count) if next_tier else 0,
        "progress_pct": progress_pct,
        "total_earned": total_earned,
        "newly_unlocked": newly_unlocked,
    }


@api.post("/referrals/rewards/acknowledge")
async def referral_reward_acknowledge(user: dict = Depends(get_current_user)):
    """Mark every currently-unlocked tier as notified so the milestone
    toast fires exactly once per tier per user across every device."""
    settings = await get_settings()
    requires_inv = bool(settings.get("referral_level_requires_investment", True))
    levels = _sorted_levels(settings)
    count = await _qualifying_referral_count(user["_id"], requires_inv)
    unlocked = [int(l["level"]) for l in levels if count >= int(l.get("min_referrals", 0))]
    if not unlocked:
        return {"ok": True, "acknowledged": []}
    await db.users.update_one(
        {"_id": user["_id"]},
        {"$addToSet": {"notified_referral_levels": {"$each": unlocked}}},
    )
    return {"ok": True, "acknowledged": unlocked}


@api.post("/referrals/rewards/claim/{level_id}")
async def referral_reward_claim(level_id: int, user: dict = Depends(get_current_user)):
    """User claims a milestone reward they qualify for. Credits wallet."""
    settings = await get_settings()
    requires_inv = bool(settings.get("referral_level_requires_investment", True))
    levels = _sorted_levels(settings)

    tier = next((l for l in levels if int(l.get("level", 0)) == level_id), None)
    if not tier:
        raise HTTPException(status_code=404, detail="Reward level not found")

    already_claimed = set(user.get("claimed_referral_levels") or [])
    if level_id in already_claimed:
        raise HTTPException(status_code=400, detail="Reward already claimed")

    count = await _qualifying_referral_count(user["_id"], requires_inv)
    if count < int(tier.get("min_referrals", 0)):
        raise HTTPException(
            status_code=400,
            detail=f"You need {tier['min_referrals']} qualifying referrals to claim {tier.get('name','this reward')}",
        )

    reward = float(tier.get("reward", 0))

    # Atomic claim: only credit if we successfully add the level_id to the set.
    # Prevents double-claim via concurrent requests.
    res = await db.users.update_one(
        {"_id": user["_id"], "claimed_referral_levels": {"$ne": level_id}},
        {"$addToSet": {"claimed_referral_levels": level_id},
         "$inc": {"wallet_balance": reward, "bonus_earnings": reward}},
    )
    if res.modified_count == 0:
        raise HTTPException(status_code=400, detail="Reward already claimed")

    await add_transaction(
        user["_id"],
        "referral_bonus",
        reward,
        note=f"{tier.get('name','Referral level')} milestone reward",
        meta={"level": level_id, "level_name": tier.get("name"), "qualifying_referrals": count},
    )

    fresh = await db.users.find_one({"_id": user["_id"]})
    return {
        "ok": True,
        "credited": reward,
        "level": level_id,
        "level_name": tier.get("name"),
        "new_wallet_balance": fresh.get("wallet_balance", 0),
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
    await add_transaction(
        user["_id"], "coupon", amount, f"Redeemed coupon {code}",
        meta={"code": code, "coupon_type": coupon.get("type") or "manual"},
    )
    return {"ok": True, "amount": amount}


@api.get("/coupons/history")
async def coupon_history(
    user: dict = Depends(get_current_user),
    limit: int = 50,
    skip: int = 0,
):
    """Every coupon the user has redeemed, newest first. Reads from the
    transactions log so we get exact amount + timestamp per redemption.
    Enriches each row with the code and coupon_type (daily / manual)."""
    limit = max(1, min(200, int(limit or 50)))
    skip = max(0, int(skip or 0))
    q = {"user_id": user["_id"], "type": "coupon"}
    total = await db.transactions.count_documents(q)
    total_earned = 0.0
    async for tx in db.transactions.aggregate([
        {"$match": q},
        {"$group": {"_id": None, "sum": {"$sum": "$amount"}}},
    ]):
        total_earned = float(tx.get("sum") or 0)

    cur = db.transactions.find(q).sort("created_at", -1).skip(skip).limit(limit)
    raw_txs = await cur.to_list(length=limit)

    # Build a set of coupon codes we need to look up (either the meta was
    # missing or we need to enrich the type). Old transactions never carried
    # `meta.coupon_type`, so join with the coupons collection to recover it.
    codes_to_lookup: set[str] = set()
    for tx in raw_txs:
        meta = tx.get("meta") or {}
        code = meta.get("code")
        if not code:
            note = tx.get("note") or ""
            code = note.replace("Redeemed coupon ", "").strip() or None
        if code and not meta.get("coupon_type"):
            codes_to_lookup.add(code)
    coupon_type_by_code: Dict[str, str] = {}
    if codes_to_lookup:
        async for c in db.coupons.find({"code": {"$in": list(codes_to_lookup)}}, {"code": 1, "type": 1}):
            coupon_type_by_code[c["code"]] = c.get("type") or "manual"

    items = []
    daily_count = 0
    manual_count = 0
    for tx in raw_txs:
        meta = tx.get("meta") or {}
        code = meta.get("code")
        if not code:
            note = tx.get("note") or ""
            code = note.replace("Redeemed coupon ", "").strip() or None
        coupon_type = meta.get("coupon_type") or coupon_type_by_code.get(code or "", "manual")
        if coupon_type == "auto_daily":
            daily_count += 1
        else:
            manual_count += 1
        items.append({
            "id": str(tx["_id"]),
            "code": code,
            "amount": float(tx.get("amount") or 0),
            "created_at": tx.get("created_at"),
            "coupon_type": coupon_type,
        })
    return {
        "items": items,
        "total": total,
        "total_earned": total_earned,
        "daily_count": daily_count,
        "manual_count": manual_count,
    }


@api.get("/coupons/daily")
async def get_daily_coupon(user: dict = Depends(get_current_user)):
    """Today's auto-generated coupon (if any) with per-user redemption context.

    Response shape:
      { available: bool, code?, amount?, max_uses?, used_count?, remaining?,
        already_redeemed?, next_drop_at, drop_time, message }
    """
    settings = await get_settings()
    enabled = bool(settings.get("auto_coupon_enabled", True))
    drop_time = settings.get("auto_coupon_time") or "17:10"
    today = _lagos_now().strftime("%Y-%m-%d")

    # Compute the ISO next-drop timestamp for the client countdown
    now = _lagos_now()
    th, tm = _parse_hhmm(drop_time, 17, 10)
    next_drop = now.replace(hour=th, minute=tm, second=0, microsecond=0)
    if now >= next_drop:
        next_drop = next_drop + timedelta(days=1)

    base = {
        "enabled": enabled,
        "drop_time": drop_time,
        "next_drop_at": next_drop.astimezone(timezone.utc).isoformat(),
    }

    if not enabled:
        return {**base, "available": False, "message": "Daily bonus is currently paused."}

    # Look up today's auto coupon
    coupon = await db.coupons.find_one({"type": "auto_daily", "generated_date": today, "active": True})
    if not coupon:
        return {**base, "available": False, "message": f"Today's bonus code drops at {drop_time}."}

    used_count = len(coupon.get("used_by", []))
    max_uses = int(coupon.get("max_uses", 0))
    remaining = max(0, max_uses - used_count)
    already = user["_id"] in coupon.get("used_by", [])
    can_redeem = user.get("has_invested", False) and not already and remaining > 0

    return {
        **base,
        "available": True,
        "code": coupon["code"],
        "amount": float(coupon.get("amount", 0)),
        "max_uses": max_uses,
        "used_count": used_count,
        "remaining": remaining,
        "already_redeemed": already,
        "can_redeem": can_redeem,
        "requires_investment": not user.get("has_invested", False),
        "sold_out": remaining <= 0 and not already,
        "message": None,
    }


@api.post("/admin/coupons/generate-now")
async def admin_generate_daily_coupon(admin: dict = Depends(get_admin_user)):
    """Manually trigger today's daily coupon generation (idempotent — if
    today's coupon already exists, returns it without creating a new one)."""
    settings = await get_settings()
    today = _lagos_now().strftime("%Y-%m-%d")
    existing = await db.coupons.find_one({"type": "auto_daily", "generated_date": today, "active": True})
    if existing:
        return {
            "ok": True, "already_existed": True,
            "code": existing["code"], "amount": float(existing["amount"]),
            "max_uses": int(existing.get("max_uses", 0)),
            "used_count": len(existing.get("used_by", [])),
        }
    coupon = await _generate_daily_coupon(settings)
    if not coupon:
        # Race — another worker created it between our check and CAS
        coupon = await db.coupons.find_one({"type": "auto_daily", "generated_date": today, "active": True})
    return {
        "ok": True, "already_existed": False,
        "code": coupon["code"], "amount": float(coupon["amount"]),
        "max_uses": int(coupon.get("max_uses", 0)),
        "used_count": len(coupon.get("used_by", [])),
    }


@api.get("/withdrawals/window")
async def withdrawal_window_status(user: dict = Depends(get_current_user)):
    """Whether user-initiated withdrawals are currently allowed."""
    settings = await get_settings()
    return _withdrawal_window_state(settings)


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


@api.post("/admin/sessions/logout-all")
async def admin_force_logout_all_users(admin: dict = Depends(get_admin_user)):
    """Invalidate every currently-signed-in NON-ADMIN user session platform-wide.

    Mechanism: bump `settings.session_epoch` to the current unix timestamp.
    Every access token embeds `iat` (issued-at); `get_current_user` refuses
    any non-admin token whose `iat` predates this epoch. Admins are exempt
    so the caller doesn't kick themselves out.

    Users' next API call returns 401 and the client's silent-refresh path
    boots them to the login screen. No cookies to purge server-side because
    JWTs are stateless.
    """
    now_ts = int(datetime.now(timezone.utc).timestamp())
    await db.settings.update_one({}, {"$set": {"session_epoch": now_ts}}, upsert=True)
    # Count currently active non-admin users for the confirmation toast.
    active_users = await db.users.count_documents({"role": {"$ne": "admin"}})
    logger.warning(
        "Admin %s force-logged out all non-admin users (session_epoch=%d, users=%d)",
        admin.get("email") or admin.get("_id"), now_ts, active_users,
    )
    return {"ok": True, "session_epoch": now_ts, "affected_users": active_users}


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
    """Force-clear the cached IP-block flag and probe PayNow live. The outbound
    IP is intentionally NOT returned to end-users — admins can see it via
    `/api/admin/server-ip`. This endpoint is called by the deposit "Retry now"
    button after the merchant whitelists our IP."""
    is_admin = (user.get("role") == "admin")
    if not paynow.enabled():
        r = {"gateway_ready": False, "reason": "disabled"}
        if is_admin:
            r["outbound_ip"] = outbound_ip_fast()
        return r
    paynow._clear_ip_blocked()
    resp = await paynow.list_banks()
    ok = resp.get("code") == 0 and not paynow.ip_blocked()
    r = {
        "gateway_ready": ok,
        "code": resp.get("code") if is_admin else None,
        "msg": resp.get("msg") if is_admin else None,
        "reason": None if ok else "gateway_ip_blocked",
    }
    if is_admin:
        r["outbound_ip"] = outbound_ip_fast()
    return r


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


@api.get("/juntbest/status")
async def juntbest_status(user: dict = Depends(get_current_user)):
    """Lightweight probe used by the Deposit page to decide whether to render the
    JuntBest Smart Pay tile."""
    if not juntbest.enabled() or not await gateway_payin_allowed("juntbest"):
        return {"enabled": False, "gateway_ready": False, "reason": "disabled"}
    # Ping /balance as a cheap connectivity + auth check. code=0 → live.
    try:
        resp = await juntbest.get_balance()
    except Exception:
        return {"enabled": True, "gateway_ready": False, "reason": "unreachable"}
    code = int(resp.get("code") if resp.get("code") is not None else -1)
    return {
        "enabled": True,
        "gateway_ready": code == 0,
        "message": resp.get("message") if code != 0 else None,
        "code": code,
    }


@api.get("/juntbest/banks")
async def juntbest_banks(user: dict = Depends(get_current_user)):
    """Live JuntPay bank list (CBN-format codes like 000014, 100004, 090267).
    Cached for 1h in juntbest.list_banks_async; falls back to a small static
    list only if the live API is unreachable."""
    if not juntbest.enabled():
        return {"enabled": False, "gateway_ready": False, "data": []}
    try:
        banks = await juntbest.list_banks_async()
    except Exception:
        banks = juntbest.list_banks()
    return {"enabled": True, "gateway_ready": True, "data": banks or []}


# ---------------------------------------------------------------------------
# Fast, config-only deposit-methods endpoint.
#
# Purpose: the four `/…/status` endpoints above each fire a real HTTPS call to
# the gateway (through the IPRoyal proxy) to test live reachability. On a slow
# gateway (SHPAY / 1SSPay have both been known to hang for 10-20s), the tile
# stays hidden for that long — and if the call times out, the tile never
# appears at all, which is exactly what users are reporting ("PayNow doesn't
# show sometimes").
#
# This endpoint returns config-only state (env-configured + admin toggle),
# NO outbound network calls. The Deposit page uses it to render tiles
# instantly. Individual per-gateway "green/amber pill" health probes are still
# available via the existing `/…/status` endpoints and are fired in the
# background so the UI can add a warning badge — but the tiles show up
# immediately regardless.
# ---------------------------------------------------------------------------
@api.get("/deposit/methods")
async def deposit_methods(user: dict = Depends(get_current_user)):
    toggles = await get_gateway_toggles()
    return {
        "paynow":   paynow.enabled()   and bool(toggles.get("paynow",   {}).get("payin")),
        "shpay":    shpay.enabled()    and bool(toggles.get("shpay",    {}).get("payin")),
        "onesspay": onesspay.enabled() and bool(toggles.get("onesspay", {}).get("payin")),
        "juntbest": juntbest.enabled() and bool(toggles.get("juntbest", {}).get("payin")),
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


@api.get("/admin/server-ip")
async def admin_server_ip(admin: dict = Depends(get_admin_user)):
    """Return the outbound egress IP that payment merchants will see on ALL
    server→gateway calls. This is the IP to whitelist at PayNow / SHPAY / 1SSPay.

    When a static-IP proxy is configured (HTTPS_PROXY env var), we PARSE the
    proxy host directly instead of calling an external ip-echo service. This
    is deterministic and never returns "unknown" from a flaky third-party.
    When no proxy is configured we fall back to a multi-service lookup with
    a longer timeout so the pod's egress IP is still discoverable.
    """
    proxy_url = os.environ.get("HTTPS_PROXY") or os.environ.get("HTTP_PROXY") or ""
    proxied = bool(proxy_url)
    display_proxy = None
    proxy_host = None
    proxy_ip_from_env = None
    if proxy_url:
        try:
            from urllib.parse import urlparse
            p = urlparse(proxy_url)
            proxy_host = p.hostname
            display_proxy = f"{p.scheme}://***@{p.hostname}:{p.port}"
            # If the proxy host is already a numeric IPv4, use it directly —
            # this is the whole point of a static-IP proxy.
            if proxy_host and re.match(r"^\d{1,3}(\.\d{1,3}){3}$", proxy_host):
                proxy_ip_from_env = proxy_host
        except Exception:
            display_proxy = "configured"

    outbound_ip = "unknown"
    method = "unknown"

    if proxy_ip_from_env:
        # Deterministic — no external call needed. The proxy IP IS the egress IP.
        outbound_ip = proxy_ip_from_env
        method = "proxy_env"
    elif proxy_host:
        # Proxy configured as a hostname (not raw IP) — resolve it once.
        try:
            import socket
            outbound_ip = socket.gethostbyname(proxy_host)
            method = "proxy_dns"
        except Exception:
            pass

    # Fallback: query a chain of ip-echo services with retries. Any one succeeding
    # is enough. This only runs when no proxy is set OR proxy host DNS failed.
    if outbound_ip == "unknown":
        services = [
            "https://api.ipify.org",
            "https://ifconfig.me/ip",
            "https://icanhazip.com",
            "https://checkip.amazonaws.com",
        ]
        for svc in services:
            try:
                async with httpx.AsyncClient(timeout=8.0, trust_env=True) as c:
                    r = await c.get(svc)
                    ip = (r.text or "").strip().split("\n")[0].strip()
                    # sanity check — must look like an IPv4
                    if re.match(r"^\d{1,3}(\.\d{1,3}){3}$", ip):
                        outbound_ip = ip
                        method = f"echo:{svc.split('//')[1].split('/')[0]}"
                        break
            except Exception:
                continue

    return {
        "outbound_ip": outbound_ip,
        "static_proxy_configured": proxied,
        "proxy": display_proxy,
        "resolution_method": method,
        "instructions": (
            "Whitelist this IP on your PayNow, SHPAY, and 1SSPay merchant dashboards. "
            "With a static proxy configured, this IP stays permanent."
            if proxied
            else "This IP may rotate on pod restarts. Configure a static-IP proxy (HTTPS_PROXY env) or "
                 "request a static egress IP from Emergent Support."
        ),
    }


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


# ---------------------------------------------------------------------------
# JuntBest webhooks + admin balance
# ---------------------------------------------------------------------------
@api.get("/admin/juntbest-balance")
async def admin_juntbest_balance(admin: dict = Depends(get_admin_user)):
    outbound_ip = "unknown"
    try:
        async with httpx.AsyncClient(timeout=5.0) as c:
            r = await c.get("https://api.ipify.org")
            outbound_ip = r.text.strip() or "unknown"
    except Exception:
        pass
    if not juntbest.enabled():
        return {"enabled": False, "outbound_ip": outbound_ip, "reason": "not configured"}
    try:
        bal = await juntbest.get_balance()
    except Exception as e:
        return {"enabled": True, "outbound_ip": outbound_ip, "error": str(e)}
    return {"enabled": True, "outbound_ip": outbound_ip, "balance_response": bal}


# ---------------------------------------------------------------------------
# JuntBest / JuntPay webhook handlers.
#
# The 2026-07-30 migration to the new juntpay.top v1 API changed the webhook
# body shape from flat `{order_sn, status, amount}` to nested
# `{event: "PAYMENT"|"TRANSFER", data: {mchOrderNo, state, amount, realAmount,
# errorMessage, ...}}`. State codes also changed: `state=2` is now "success"
# (was `status="1"`), `state=3` is "failed" (was `status="9"`).
#
# The v1 API also only exposes ONE "Push address" field per merchant — it
# uses the `event` field to distinguish payin vs payout webhooks. We support
# THREE endpoints for maximum operational flexibility:
#   /juntbest/webhook          — unified dispatcher (recommended in portal)
#   /juntbest/webhook/payin    — explicit payin route (fallback)
#   /juntbest/webhook/payout   — explicit payout route (fallback)
# All three delegate to the same shared processors so behavior is identical.
# ---------------------------------------------------------------------------

def _juntbest_extract(body: Dict[str, Any]) -> Dict[str, Any]:
    """Normalise a JuntPay v1 webhook body into flat fields the processors use.
    Also handles the legacy top-level format as a defensive fallback in case an
    old-format webhook ever hits us."""
    if isinstance(body.get("data"), dict):
        d = body["data"]
        state_raw = d.get("state")
        try:
            state = int(state_raw) if state_raw is not None else -1
        except Exception:
            state = -1
        try:
            amount = float(d.get("realAmount") or d.get("amount") or 0)
        except Exception:
            amount = 0.0
        return {
            "event":       str(body.get("event") or "").upper(),
            "order_sn":    str(d.get("mchOrderNo") or ""),
            "platform_id": str(d.get("orderId") or d.get("transferId") or ""),
            "state":       state,
            "succeeded":   state == 2,
            "failed":      state in (3, 4),
            "amount":      amount,
            "error":       str(d.get("errorMessage") or ""),
        }
    # Legacy flat format
    status = str(body.get("status") or "").strip()
    try:
        amount = float(body.get("amount") or 0)
    except Exception:
        amount = 0.0
    return {
        "event":       "",
        "order_sn":    str(body.get("order_sn") or body.get("mchOrderNo") or ""),
        "platform_id": str(body.get("platform_osn") or ""),
        "state":       -1,
        "succeeded":   status == "1",
        "failed":      status == "9",
        "amount":      amount,
        "error":       str(body.get("message") or ""),
    }


async def _juntbest_process_payin(body: Dict[str, Any]) -> str:
    """Handle a JuntPay payin webhook body. Returns the SUCCESS/error string
    to send back to JuntPay. Idempotent by design (safe to receive twice)."""
    e = _juntbest_extract(body)
    order_sn = e["order_sn"]
    if not order_sn:
        logger.warning("JuntPay payin webhook: missing order id in body=%s", body)
        return "SUCCESS"
    dep = await db.deposits.find_one({"merchant_order_no": order_sn, "gateway": "juntbest"})
    if not dep:
        logger.warning("JuntPay payin webhook: unknown order_sn=%s", order_sn)
        return "SUCCESS"
    if e["succeeded"]:
        if dep["status"] != "pending":
            return "SUCCESS"
        updated = await db.deposits.find_one_and_update(
            {"_id": dep["_id"], "status": "pending"},
            {"$set": {"status": "approved", "processed_at": now_utc().isoformat(),
                      "gateway_callback": body,
                      "settled_amount": e["amount"]}},
            return_document=ReturnDocument.AFTER,
        )
        if not updated:
            return "SUCCESS"
        credit_amount = e["amount"] if e["amount"] > 0 else float(dep["amount"])
        await db.users.update_one({"_id": dep["user_id"]},
                                  {"$inc": {"wallet_balance": credit_amount}})
        await add_transaction(dep["user_id"], "deposit", credit_amount,
                              "Deposit auto-credited (JuntPay)",
                              {"deposit_id": str(dep["_id"]), "gateway": "juntbest"})
        logger.info("JuntPay payin credited user=%s amount=₦%.2f dep=%s",
                    dep["user_id"], credit_amount, dep["_id"])
    elif e["failed"]:
        await db.deposits.update_one(
            {"_id": dep["_id"], "status": "pending"},
            {"$set": {"status": "rejected", "processed_at": now_utc().isoformat(),
                      "gateway_error": e["error"] or "JuntPay reported failure",
                      "gateway_callback": body}},
        )
    return "SUCCESS"


async def _juntbest_process_payout(body: Dict[str, Any]) -> str:
    e = _juntbest_extract(body)
    order_sn = e["order_sn"]
    if not order_sn:
        logger.warning("JuntPay payout webhook: missing order id in body=%s", body)
        return "SUCCESS"
    w = await db.withdrawals.find_one({"merchant_order_no": order_sn, "gateway": "juntbest"})
    if not w:
        logger.warning("JuntPay payout webhook: unknown order_sn=%s", order_sn)
        return "SUCCESS"
    if e["succeeded"] and w["status"] not in {"approved"}:
        await db.withdrawals.update_one(
            {"_id": w["_id"]},
            {"$set": {"status": "approved", "processed_at": now_utc().isoformat(),
                      "gateway_callback": body}},
        )
        await settle_withdrawal_hold(w["user_id"], str(w["_id"]), "withdrawal",
                                      "Withdrawal paid out (JuntPay)")
    elif e["failed"] and w["status"] not in {"approved", "rejected"}:
        await db.withdrawals.update_one(
            {"_id": w["_id"]},
            {"$set": {"status": "rejected", "processed_at": now_utc().isoformat(),
                      "gateway_error": e["error"] or "JuntPay reported failure",
                      "gateway_callback": body}},
        )
        await db.users.update_one({"_id": w["user_id"]},
                                  {"$inc": {"wallet_balance": float(w["amount"])}})
        await add_transaction(w["user_id"], "withdrawal_refund", float(w["amount"]),
                              "Withdrawal rejected - refunded (JuntPay)",
                              {"withdrawal_id": str(w["_id"]), "gateway": "juntbest"})
    return "SUCCESS"


async def _juntbest_parse_body(request: Request) -> Dict[str, Any]:
    """JSON body if possible, form-data fallback (some gateways form-encode
    on failure). Returns {} on malformed."""
    try:
        return await request.json()
    except Exception:
        try:
            form = await request.form()
            return {k: str(v) for k, v in form.items()}
        except Exception:
            return {}


@api.post("/juntbest/webhook", response_class=PlainTextResponse)
async def juntbest_unified_webhook(request: Request):
    """Unified JuntPay webhook — this is what you put in the JuntPay merchant
    portal's "Push address" field. Dispatches to payin or payout handler based
    on the `event` field (`PAYMENT` = payin, `TRANSFER` = payout).

    Response is the literal string `SUCCESS` (case-sensitive) — JuntPay retries
    on anything else.
    """
    body = await _juntbest_parse_body(request)
    logger.info("JuntPay unified webhook received: %s", body)
    if not juntbest.verify_payin_callback(body):  # same algo works for both
        logger.warning("JuntPay webhook: signature mismatch, body=%s", body)
        return PlainTextResponse("signature_invalid", status_code=200)
    event = str(body.get("event") or "").upper()
    if event == "TRANSFER":
        return await _juntbest_process_payout(body)
    # PAYMENT (payin) is the default — also handles the case where `event` is
    # absent (some gateway versions omit it and only send payment webhooks
    # through this endpoint).
    return await _juntbest_process_payin(body)


@api.post("/juntbest/webhook/payin", response_class=PlainTextResponse)
async def juntbest_payin_webhook(request: Request):
    """Explicit payin webhook. Kept as an alias in case the portal is
    configured with this URL rather than the unified /juntbest/webhook."""
    body = await _juntbest_parse_body(request)
    logger.info("JuntPay payin webhook received: %s", body)
    if not juntbest.verify_payin_callback(body):
        logger.warning("JuntPay payin webhook: signature mismatch")
        return PlainTextResponse("signature_invalid", status_code=200)
    return await _juntbest_process_payin(body)


@api.post("/juntbest/webhook/payout", response_class=PlainTextResponse)
async def juntbest_payout_webhook(request: Request):
    """Explicit payout webhook. Kept as an alias in case the portal is
    configured with this URL rather than the unified /juntbest/webhook."""
    body = await _juntbest_parse_body(request)
    logger.info("JuntPay payout webhook received: %s", body)
    if not juntbest.verify_payout_callback(body):
        logger.warning("JuntPay payout webhook: signature mismatch")
        return PlainTextResponse("signature_invalid", status_code=200)
    return await _juntbest_process_payout(body)


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
        "site_name": s.get("site_name") or "Luckycart Box",
        "telegram_url": s.get("telegram_url") or "",
        "whatsapp_url": s.get("whatsapp_url") or "",
        "telegram_channel_url": s.get("telegram_channel_url") or "",
        "whatsapp_channel_url": s.get("whatsapp_channel_url") or "",
        "support_hours": s.get("support_hours") or "Monday to Sunday, 10:00 AM to 5:00 PM",
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
    juntbest: Optional[GatewayToggleIn] = None


def _gateway_meta(gateway: str) -> dict:
    """Static per-gateway metadata for the admin UI (labels, colors)."""
    return {
        "paynow":   {"label": "PayNow — Instant Pay",   "color": "#0055FF",
                     "configured": paynow.enabled()},
        "shpay":    {"label": "SHPAY — Quick Pay",      "color": "#8B5CF6",
                     "configured": shpay.enabled()},
        "onesspay": {"label": "1SSPay — Fast Pay",      "color": "#F97316",
                     "configured": onesspay.enabled()},
        "juntbest": {"label": "JuntBest — Smart Pay",   "color": "#10B981",
                     "configured": juntbest.enabled()},
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
# Healthcheck routes — MUST be defined BEFORE app.include_router(api) so that
# FastAPI actually picks them up. Adding routes to an APIRouter after it has
# already been included on the app is a silent no-op (that's the 404 trap).
# ---------------------------------------------------------------------------
@api.get("/")
async def root():
    return {"ok": True, "service": "naija-invest"}


@api.get("/health")
async def health_check():
    """Explicit healthcheck endpoint for Fly.io / Docker HEALTHCHECK / Better Stack /
    UptimeRobot. Returns 200 as long as FastAPI is up. We deliberately do NOT
    ping MongoDB here — a slow-but-alive DB shouldn't force a machine restart.
    Use the separate `/api/admin/*/status` endpoints for gateway health."""
    return {"status": "ok", "service": "luckycartbox-api", "time": now_utc().isoformat()}


# ---------------------------------------------------------------------------
# Router mount + CORS
# ---------------------------------------------------------------------------
app.include_router(api)

frontend_origin = os.environ.get("FRONTEND_URL", "http://localhost:3000")
# Additional CORS origins: comma-separated list of production origins
# (e.g. "https://luckycartbox.com,https://www.luckycartbox.com,https://luckycartbox.pages.dev").
# Set via `fly secrets set CORS_ORIGINS="..."` in production.
# Special case: `CORS_ORIGINS="*"` means "allow every origin" and requires
# credentials to be disabled per the CORS spec — Starlette silently ignores
# wildcards mixed with `allow_credentials=True`, which is exactly the WARN
# the deployment agent flagged.
cors_env = os.environ.get("CORS_ORIGINS", "").strip()
if cors_env == "*":
    allowed_origins = ["*"]
    allow_credentials = False
else:
    extra_origins = [o.strip() for o in cors_env.split(",") if o.strip()]
    allowed_origins = list({
        frontend_origin,
        "http://localhost:3000",
        *extra_origins,
    })
    allow_credentials = True
app.add_middleware(
    CORSMiddleware,
    allow_origins=allowed_origins,
    allow_credentials=allow_credentials,
    allow_methods=["*"],
    allow_headers=["*"],
)
