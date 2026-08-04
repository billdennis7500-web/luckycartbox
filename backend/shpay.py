"""
SHPAY OpenAPI client for Luckycart Box.

Docs (private): https://www.showdoc.com.cn/2319656718203863/10355369271356215
Base URL: https://transapi.shpays.com

Signing rule (from SHPAY docs):
  1. Filter request params — drop the `sign` field itself + any empty values.
  2. Sort keys ASCII/dictionary order.
  3. Concatenate as `key1=value1&key2=value2&...`.
  4. Append the merchant signKey (NO leading `&`; just string concat).
     digest = paramString + signKey
  5. sign = MD5(digest).hexdigest().upper()

Callback verification uses the SAME rule (excludes `sign` field).

The client is designed to mirror the shape of `/app/backend/paynow.py` so the
rest of the app can treat both gateways symmetrically.
"""
import os
import time
import hashlib
import logging
from datetime import datetime
from typing import Any, Dict, Optional

import httpx

logger = logging.getLogger("shpay")


def _config() -> Dict[str, str]:
    """Read the SHPAY env config on every call so admin can rotate keys without
    restarting the process. Missing config → returns empty strings (caller
    checks `enabled()`)."""
    return {
        "base":       os.environ.get("SHPAY_BASE_URL", "").rstrip("/"),
        "mcht_id":    os.environ.get("SHPAY_MCHT_ID", ""),
        "app_id":     os.environ.get("SHPAY_APP_ID", ""),
        "sign_key":   os.environ.get("SHPAY_SIGN_KEY", ""),
        "country":    os.environ.get("SHPAY_COUNTRY", "NG"),
        "channel":    os.environ.get("SHPAY_PAYIN_CHANNEL", ""),  # optional; blank = default
        "notify_url": os.environ.get("SHPAY_NOTIFY_URL", ""),      # our webhook URL
    }


def enabled() -> bool:
    c = _config()
    return bool(c["base"] and c["mcht_id"] and c["app_id"] and c["sign_key"])


def _now_string() -> str:
    """SHPAY requires timestamps in 'YYYY-MM-DD HH:MM:SS' (their examples show UTC-ish local)."""
    return datetime.utcnow().strftime("%Y-%m-%d %H:%M:%S")


# ---------------------------------------------------------------------------
# Signing
# ---------------------------------------------------------------------------

def build_sign_digest(params: Dict[str, Any]) -> str:
    """Reproduces the Java example in the SHPAY docs:

        List<String> keyList = new ArrayList<>(params.keySet());
        Collections.sort(keyList);
        for (String key : keyList) { if (empty) continue; sb.append(key=value&) }
        return sb.substring(0, len-1);
    """
    keys = sorted(k for k in params.keys() if k != "sign")
    parts = []
    for k in keys:
        v = params.get(k)
        if v is None:
            continue
        s = str(v)
        if s == "":
            continue
        parts.append(f"{k}={s}")
    return "&".join(parts)


def sign(params: Dict[str, Any], sign_key: str) -> str:
    """MD5(digest + signKey).upper() — sign_key is appended, NOT with `&` prefix
    (the docs are explicit: `digest = stringA + signKey`)."""
    digest = build_sign_digest(params) + sign_key
    return hashlib.md5(digest.encode("utf-8")).hexdigest().upper()


def sign_payload(biz: Dict[str, Any]) -> Dict[str, Any]:
    """Enrich a business payload with the common SHPAY envelope + sign field."""
    cfg = _config()
    envelope = {
        "mchtId":      int(cfg["mcht_id"]),
        "appId":       int(cfg["app_id"]),
        "requestTime": _now_string(),
        "signType":    "MD5",
        **biz,
    }
    envelope["sign"] = sign(envelope, cfg["sign_key"])
    return envelope


def verify_callback_signature(body: Dict[str, Any]) -> bool:
    """SHPAY webhook signature check.

    ⚠️ IMPORTANT: SHPAY's PAYIN callbacks include informational fields
    (`paymentTransNo`, `reference`, `payType`, etc.) that are NOT part of the
    signature. Signing the entire body always fails.

    Empirically verified against a real production callback: PAYIN signatures
    cover exactly `{completionTime, event, outTradeNo, transAmt, transNo,
    transStatus}`. Sort A-Z, concatenate `key=value&…`, append signKey (no `&`),
    MD5, uppercase.

    We try TWO strategies and accept if either matches:
      1) SHPAY's canonical signed subset (defensively — matches production).
      2) The "all body fields except sign" fallback (in case SHPAY updates the
         spec to include more fields in a future event type).
    """
    cfg = _config()
    provided = str(body.get("sign") or "").upper()
    if not provided:
        return False

    # Strategy 1: known-signed subset (production-verified)
    SIGNED_FIELDS = {"completionTime", "event", "outTradeNo",
                     "transAmt", "transNo", "transStatus"}
    subset = {k: v for k, v in body.items() if k in SIGNED_FIELDS}
    expected_subset = sign(subset, cfg["sign_key"])
    if provided == expected_subset:
        return True

    # Strategy 2: full body (fallback for other event types)
    expected_full = sign(body, cfg["sign_key"])
    if provided == expected_full:
        return True

    logger.warning(
        "SHPAY callback signature mismatch. provided=%s expected_subset=%s expected_full=%s "
        "digest_keys_subset=%s digest_keys_full=%s",
        provided, expected_subset, expected_full,
        sorted(subset.keys()),
        sorted(k for k in body.keys() if k != "sign"),
    )
    return False


# ---------------------------------------------------------------------------
# HTTP helpers
# ---------------------------------------------------------------------------

async def _post(path: str, biz: Dict[str, Any]) -> Dict[str, Any]:
    cfg = _config()
    body = sign_payload(biz)
    url = cfg["base"] + path
    logger.info("SHPAY POST %s payload=%s", path, {k: v for k, v in body.items() if k != "sign"})
    async with httpx.AsyncClient(timeout=20.0) as client:
        r = await client.post(url, json=body, headers={"Content-Type": "application/json"})
    try:
        data = r.json()
    except Exception:
        data = {"success": False, "code": r.status_code, "message": r.text}
    logger.info("SHPAY response %s", data)
    return data


async def _get(path: str, biz: Dict[str, Any]) -> Dict[str, Any]:
    cfg = _config()
    body = sign_payload(biz)
    url = cfg["base"] + path
    logger.info("SHPAY GET %s query=%s", path, {k: v for k, v in body.items() if k != "sign"})
    async with httpx.AsyncClient(timeout=20.0) as client:
        r = await client.get(url, params=body)
    try:
        data = r.json()
    except Exception:
        data = {"success": False, "code": r.status_code, "message": r.text}
    logger.info("SHPAY response %s", data)
    return data


# ---------------------------------------------------------------------------
# API operations
# ---------------------------------------------------------------------------

async def create_payin(out_trade_no: str, amount: float, *,
                       payer_name: Optional[str] = None,
                       payer_mobile: Optional[str] = None,
                       payer_email: str,
                       subject: str = "Deposit",
                       body: Optional[str] = None,
                       notify_url: Optional[str] = None,
                       channel_code: Optional[str] = None) -> Dict[str, Any]:
    """Create a collection/payin order. Returns SHPAY response with `result.link`
    which is the cashier URL (we can embed in iframe like PayNow)."""
    cfg = _config()
    biz: Dict[str, Any] = {
        "countryCode": cfg["country"],
        "notifyUrl":   notify_url or cfg["notify_url"],
        "transAmt":    f"{amount:.2f}",
        "email":       payer_email,
        "outTradeNo":  out_trade_no,
        "subject":     subject,
    }
    if payer_name:   biz["name"] = payer_name
    if payer_mobile: biz["mobile"] = payer_mobile
    if body:         biz["body"] = body
    ch = channel_code if channel_code is not None else cfg["channel"]
    if ch:           biz["channelCode"] = ch
    return await _post("/v1/trans/payIn", biz)


async def get_virtual_account(trans_id: str, payment_type: str = "TRANSFER") -> Dict[str, Any]:
    """SHPAY self-cashier — after create_payin returns `link=".../<transId>"`,
    call this to obtain the virtual bank account (account number, account name,
    bank name) that the user should transfer to. This is the equivalent of
    PayNow's virtual account issuance.

    IMPORTANT: this endpoint does NOT require signing per the docs — it's a
    server-side utility for merchants building their own cashier UI.
    """
    cfg = _config()
    url = cfg["base"] + "/v1/cashier/payIn"
    payload = {"transId": trans_id, "paymentType": payment_type}
    async with httpx.AsyncClient(timeout=15.0) as client:
        r = await client.post(url, json=payload, headers={"Content-Type": "application/json"})
    try:
        return r.json()
    except Exception:
        return {"success": False, "code": r.status_code, "message": r.text}


async def create_payout(out_trade_no: str, amount: float, *,
                        account_name: str,
                        account_no: str,
                        bank_code: str,
                        subject: str = "Withdrawal",
                        body: Optional[str] = None,
                        notify_url: Optional[str] = None) -> Dict[str, Any]:
    """Create a payout / withdrawal to a Nigerian bank account."""
    cfg = _config()
    biz: Dict[str, Any] = {
        "countryCode": cfg["country"],
        "notifyUrl":   notify_url or cfg["notify_url"],
        "transAmt":    f"{amount:.2f}",
        "accountName": account_name,
        "accountNo":   account_no,
        "bankCode":    bank_code,
        "outTradeNo":  out_trade_no,
        "subject":     subject,
    }
    if body: biz["body"] = body
    return await _post("/v1/trans/payOut", biz)


async def query_trans(out_trade_no: Optional[str] = None,
                      trans_no: Optional[str] = None) -> Dict[str, Any]:
    """Query the status of a payin or payout. Provide EITHER `out_trade_no` OR
    `trans_no` (the docs mark them as a 2-choice-1 field)."""
    if not (out_trade_no or trans_no):
        raise ValueError("query_trans requires out_trade_no OR trans_no")
    biz: Dict[str, Any] = {}
    if out_trade_no: biz["outTradeNo"] = out_trade_no
    if trans_no:     biz["transNo"] = trans_no
    return await _get("/v1/trans/payQuery", biz)


async def get_balance() -> Dict[str, Any]:
    """Query the app's available balance on SHPAY."""
    return await _get("/v1/trans/appAvailableAmt", {})


async def list_banks() -> Dict[str, Any]:
    """List supported Nigerian banks + their SHPAY bankCodes."""
    cfg = _config()
    return await _get("/v1/trans/payBanks", {"countryCode": cfg["country"]})


# Small in-process cache so we don't hit /payBanks on every page load.
_bank_cache: Dict[str, Any] = {"data": None, "expires_at": 0}


async def list_banks_cached(ttl_seconds: int = 600) -> Dict[str, Any]:
    now = time.time()
    if _bank_cache["data"] is not None and now < _bank_cache["expires_at"]:
        return _bank_cache["data"]
    fresh = await list_banks()
    if fresh.get("success"):
        _bank_cache["data"] = fresh
        _bank_cache["expires_at"] = now + ttl_seconds
    return fresh
