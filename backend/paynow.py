"""
PayNow® OpenAPI client for NaijaInvest.

Signing rule (from https://merchant.paynow.money OpenAPI docs):
  string_to_sign = merchantNo + params_sorted_json + signType + timestamp + merchantKey
  sign           = md5(string_to_sign).hexdigest()   (lowercase)
Where `params_sorted_json` is the compact JSON of business parameters with
keys sorted A-Z ASCII ascending; empty values excluded. UTF-8 encoding.
Common request/response fields envelope: {"code": 0, "data": ..., "msg": ""}.
"""
import os
import json
import time
import hashlib
import logging
from typing import Any, Dict, Optional

import httpx

logger = logging.getLogger("paynow")

SIGN_KEYS_EXCLUDED = {"merchantNo", "timestamp", "signType", "sign", "key"}

# PayNow error code 10000039 = "The IP address fails to pass the whitelist check".
# When the pod's outbound IP is not whitelisted, EVERY PayNow call returns this.
# Rather than fail every single request loudly, we detect it once, cache "blocked"
# for a short TTL, and gracefully report `enabled=False` so the UI hides the Instant
# tile and users transparently fall back to manual bank deposits.
IP_BLOCK_ERROR_CODE = 10000039
_IP_BLOCK_TTL_SECONDS = 300  # 5 min — long enough to prevent spamming, short enough to auto-recover
_ip_block_state: Dict[str, Any] = {"blocked_until": 0.0, "last_seen_ip_note": ""}


def _mark_ip_blocked(msg: str = "") -> None:
    _ip_block_state["blocked_until"] = time.time() + _IP_BLOCK_TTL_SECONDS
    _ip_block_state["last_seen_ip_note"] = msg or "IP whitelist check failed"
    logger.warning("PayNow marked IP-blocked for %ss (%s)", _IP_BLOCK_TTL_SECONDS, msg)


def _clear_ip_blocked() -> None:
    if _ip_block_state["blocked_until"]:
        logger.info("PayNow IP-block cleared — gateway responsive again.")
    _ip_block_state["blocked_until"] = 0.0
    _ip_block_state["last_seen_ip_note"] = ""


def ip_blocked() -> bool:
    return _ip_block_state["blocked_until"] > time.time()


def ip_block_note() -> str:
    return _ip_block_state["last_seen_ip_note"] if ip_blocked() else ""


def _observe_response(data: Dict[str, Any]) -> Dict[str, Any]:
    """Sniff a PayNow response for the whitelist error code. Returns the response unchanged."""
    try:
        if int(data.get("code")) == IP_BLOCK_ERROR_CODE:
            _mark_ip_blocked(str(data.get("msg") or "IP whitelist check failed"))
        elif int(data.get("code")) == 0:
            # A successful call means the pod IP IS being accepted — clear the flag.
            if ip_blocked():
                _clear_ip_blocked()
    except Exception:
        pass
    return data


def enabled() -> bool:
    return os.environ.get("PAYNOW_ENABLED", "false").lower() == "true" \
        and bool(os.environ.get("PAYNOW_MERCHANT_NO")) \
        and bool(os.environ.get("PAYNOW_MERCHANT_KEY"))


def _config() -> Dict[str, str]:
    return {
        "base": os.environ["PAYNOW_BASE_URL"].rstrip("/"),
        "merchant_no": os.environ["PAYNOW_MERCHANT_NO"],
        "key": os.environ["PAYNOW_MERCHANT_KEY"],
        "payin_channel": os.environ.get("PAYNOW_PAYIN_CHANNEL", "NGN_TRANSFER"),
        "payout_channel": os.environ.get("PAYNOW_PAYOUT_CHANNEL", "NGN_PAYOUT"),
        "currency": os.environ.get("PAYNOW_CURRENCY", "NGN"),
    }


def _params_string(biz: Dict[str, Any]) -> str:
    """Sorted compact JSON of business params, excluding empty values and common keys."""
    filtered = {}
    for k, v in biz.items():
        if k in SIGN_KEYS_EXCLUDED:
            continue
        if v is None:
            continue
        if isinstance(v, str) and v == "":
            continue
        filtered[k] = v
    return json.dumps(dict(sorted(filtered.items())), separators=(",", ":"), ensure_ascii=False)


def build_signature(biz: Dict[str, Any], merchant_no: str, key: str,
                    timestamp: str, sign_type: str = "MD5") -> str:
    string_to_sign = merchant_no + _params_string(biz) + sign_type + timestamp + key
    return hashlib.md5(string_to_sign.encode("utf-8")).hexdigest()


def sign_payload(biz: Dict[str, Any]) -> Dict[str, Any]:
    cfg = _config()
    ts = str(int(time.time() * 1000))
    sign = build_signature(biz, cfg["merchant_no"], cfg["key"], ts, "MD5")
    return {**biz, "merchantNo": cfg["merchant_no"], "timestamp": ts, "signType": "MD5", "sign": sign}


def verify_callback(payload: Dict[str, Any]) -> bool:
    """Recompute the sign for a callback payload and compare."""
    cfg = _config()
    given = payload.get("sign")
    if not given:
        return False
    biz = {k: v for k, v in payload.items() if k not in SIGN_KEYS_EXCLUDED}
    ts = str(payload.get("timestamp", ""))
    sign_type = str(payload.get("signType", "MD5"))
    expected = build_signature(biz, cfg["merchant_no"], cfg["key"], ts, sign_type)
    return expected.lower() == str(given).lower()


async def _post(path: str, biz: Dict[str, Any]) -> Dict[str, Any]:
    cfg = _config()
    body = sign_payload(biz)
    url = cfg["base"] + path
    logger.info("PayNow POST %s payload=%s", path, {k: v for k, v in body.items() if k != "sign"})
    async with httpx.AsyncClient(timeout=20.0) as client:
        r = await client.post(url, json=body, headers={"Content-Type": "application/json"})
    try:
        data = r.json()
    except Exception:
        data = {"code": r.status_code, "msg": r.text, "data": None}
    logger.info("PayNow response %s", data)
    return _observe_response(data)


# PayNow occasionally returns transient "system is busy" / "please try again"
# messages that clear up on a retry a second or two later. We treat any non-zero
# code whose msg contains one of these substrings as retryable.
_TRANSIENT_MSG_HINTS = ("busy", "try again", "timeout", "temporarily",
                        "please retry", "transient")


def _is_transient_paynow_error(resp: Dict[str, Any]) -> bool:
    if not resp:
        return True
    try:
        if int(resp.get("code") or 0) == 0:
            return False
    except (TypeError, ValueError):
        return True
    msg = str(resp.get("msg") or "").lower()
    return any(hint in msg for hint in _TRANSIENT_MSG_HINTS)


async def create_payin(merchant_order_no: str, amount: float,
                       payer_key: Optional[str] = None,
                       first_name: Optional[str] = None,
                       last_name: Optional[str] = None) -> Dict[str, Any]:
    cfg = _config()
    biz = {
        "amount": f"{amount:.2f}",
        "currencyCode": cfg["currency"],
        "channelCode": cfg["payin_channel"],
        "merchantOrderNo": merchant_order_no,
    }
    if payer_key: biz["payerKey"] = payer_key
    if first_name: biz["firstName"] = first_name
    if last_name: biz["lastName"] = last_name

    # Retry up to 2 additional times if PayNow returns a transient error.
    # Backoff 0.6s → 1.5s. `merchantOrderNo` stays the same across retries so
    # PayNow can de-duplicate if the first request actually succeeded but the
    # response was garbled — we'd then get a "duplicate order" code, not a new
    # link, which is intentional.
    import asyncio
    delays = [0.6, 1.5]
    for attempt in range(3):
        resp = await _post("/open/v1/payins/create", biz)
        if not _is_transient_paynow_error(resp):
            return resp
        if attempt < len(delays):
            logger.warning(
                "PayNow create_payin transient error (attempt %d/%d): code=%s msg=%s — retrying in %.1fs",
                attempt + 1, 3, resp.get("code"), resp.get("msg"), delays[attempt],
            )
            await asyncio.sleep(delays[attempt])
    return resp


async def query_payin(merchant_order_nos: list) -> Dict[str, Any]:
    return await _post("/open/v3/payins/query", {"orderList": merchant_order_nos})


async def create_payout(merchant_order_no: str, amount: float,
                        bank_code: str, account_name: str, account_no: str,
                        remarks: str = "") -> Dict[str, Any]:
    cfg = _config()
    biz = {
        "amount": f"{amount:.2f}",
        "currencyCode": cfg["currency"],
        "channelCode": cfg["payout_channel"],
        "bankCode": bank_code,
        "accountName": account_name,
        "accountNo": account_no,
        "remarks": remarks or "Withdrawal",
        "merchantOrderNo": merchant_order_no,
    }
    return await _post("/open/v2/payouts/create", biz)


async def query_payout(merchant_order_nos: list) -> Dict[str, Any]:
    return await _post("/open/v2/payouts/query", {"orderList": merchant_order_nos})


async def list_banks() -> Dict[str, Any]:
    cfg = _config()
    return await _post("/open/v1/merchant/bank", {"channelCode": cfg["payout_channel"]})


# In-memory TTL cache for the bank list (upstream is slow ~1-3s per call)
_BANK_CACHE: Dict[str, Any] = {"data": None, "expires_at": 0.0}


async def list_banks_cached(ttl_seconds: int = 300) -> Dict[str, Any]:
    now = time.time()
    if _BANK_CACHE["data"] and _BANK_CACHE["expires_at"] > now:
        return _BANK_CACHE["data"]
    fresh = await list_banks()
    if fresh.get("code") == 0 and fresh.get("data"):
        _BANK_CACHE["data"] = fresh
        _BANK_CACHE["expires_at"] = now + ttl_seconds
    return fresh


async def query_payee(bank_code: str, account_number: str) -> Dict[str, Any]:
    """GET /open/v1/merchant/payee/query?currencyCode=NGN&payee=<accountNumber>
    Returns {code, data:{exist, closeRchrgTime}, msg}."""
    cfg = _config()
    ts = str(int(time.time() * 1000))
    biz = {"currencyCode": cfg["currency"], "payee": account_number}
    sign = build_signature(biz, cfg["merchant_no"], cfg["key"], ts, "MD5")
    params = {**biz, "merchantNo": cfg["merchant_no"], "timestamp": ts, "signType": "MD5", "sign": sign}
    url = cfg["base"] + "/open/v1/merchant/payee/query"
    async with httpx.AsyncClient(timeout=15.0) as client:
        r = await client.get(url, params=params)
    try:
        return _observe_response(r.json())
    except Exception:
        return {"code": r.status_code, "msg": r.text, "data": None}


async def get_balance() -> Dict[str, Any]:
    """GET /open/v1/merchant/balance?currencyCode=..."""
    cfg = _config()
    ts = str(int(time.time() * 1000))
    biz = {"currencyCode": cfg["currency"]}
    sign = build_signature(biz, cfg["merchant_no"], cfg["key"], ts, "MD5")
    params = {**biz, "merchantNo": cfg["merchant_no"], "timestamp": ts, "signType": "MD5", "sign": sign}
    url = cfg["base"] + "/open/v1/merchant/balance"
    async with httpx.AsyncClient(timeout=20.0) as client:
        r = await client.get(url, params=params)
    try:
        return _observe_response(r.json())
    except Exception:
        return {"code": r.status_code, "msg": r.text, "data": None}


_BALANCE_CACHE: Dict[str, Any] = {"data": None, "expires_at": 0.0}


async def get_balance_cached(ttl_seconds: int = 3) -> Dict[str, Any]:
    """PayNow rate-limits balance to 1 req/sec. Cache successful responses briefly to avoid 429s
    on React StrictMode double-fires or rapid page navigations."""
    now = time.time()
    if _BALANCE_CACHE["data"] and _BALANCE_CACHE["expires_at"] > now:
        return _BALANCE_CACHE["data"]
    fresh = await get_balance()
    if fresh.get("code") == 0:
        _BALANCE_CACHE["data"] = fresh
        _BALANCE_CACHE["expires_at"] = now + ttl_seconds
    return fresh
