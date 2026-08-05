"""
JuntPay (formerly JuntBest) OpenAPI v1 client for Luckycart Box.

Migrated 2026-07-30 from the legacy ngn.junt.best v1 API to the new
juntpay.top v1 API. The merchant portal URL is https://merchant.juntpay.top
and the API docs are at https://doc.juntpay.top.

Base URL (prod & test): https://payment.juntpay.top

Signing algorithm (verified against https://doc.juntpay.top/guide/authorization):
  1. Take every non-null / non-empty field in the request body
  2. Sort by key name, case-INSENSITIVE alphabetical (ASCII)
  3. Serialize each field as `key=value`
  4. Join all pairs with `&`
  5. Append `&key=<SECRET_KEY>`
  6. MD5-hex-digest the string, then UPPERCASE

The signed string INCLUDES the field values as-JSON-serialized for lists /
sub-objects (no extra whitespace).

Field mapping vs the old ngn.junt.best v1:
  merchant_sn  →  mchNo          (e.g. "M1785339207")
  ak           →  appId          (e.g. "6a6a1d6700760c368cc3d54e")
  sk           →  key            (secret key used for signing only)
  order_sn     →  mchOrderNo
  platform_osn →  payOrderId (payment) / transferId (payout)

Response shape from v1: {"code": 0|<err>, "msg": "...", "data": {...}, "sign": "..."}
Success is `code == 0`.

Webhook payload:
  {"event": "PAYMENT"|"TRANSFER",
   "data":  {orderId, mchOrderNo, transactionId, amount, realAmount, currency,
             state, extParam, errorMessage},
   "reqTime": "<unix-seconds>",
   "sign": "<md5 of data fields, same algorithm>"}
Webhook response MUST be the literal string "SUCCESS" (case-sensitive).

Public API — unchanged since the old SDK so /server.py needs zero edits:
  enabled(), create_payin(...), query_payin(...), create_payout(...),
  query_payout(...), get_balance(), get_ngn_va(...), list_banks(),
  list_banks_cached(), verify_payin_callback(...), verify_payout_callback(...),
  NIGERIAN_BANKS
"""
import os
import time
import json
import asyncio
import hashlib
import logging
from typing import Any, Dict, Optional, List

import httpx

logger = logging.getLogger("juntbest")


# ---------------------------------------------------------------------------
# Config
# ---------------------------------------------------------------------------

def _config() -> Dict[str, str]:
    """Read env on every call so admin can rotate keys without a restart."""
    return {
        "enabled":     os.environ.get("JUNTBEST_ENABLED", "false").lower(),
        "base":        os.environ.get("JUNTBEST_BASE_URL", "https://payment.juntpay.top").rstrip("/"),
        # NB: legacy env-var names kept for backward compatibility. Values now
        # carry the juntpay.top meanings (see field mapping in module docstring).
        "mch_no":      os.environ.get("JUNTBEST_MERCHANT_SN", ""),   # mchNo    = M-prefixed merchant number
        "app_id":      os.environ.get("JUNTBEST_ACCESS_KEY", ""),    # appId    = 24-hex-char app id
        "key":         os.environ.get("JUNTBEST_SECRET_KEY", ""),    # key      = signing secret (long string)
        "currency":    os.environ.get("JUNTBEST_CURRENCY", "NGN"),
        # Payin channel — check the merchant portal → Developer → Payment Channels
        # for the exact wayCode allowed for NGN bank-transfer payins. Common
        # values: "NGN_TRANSFER", "BANK_TRANSFER", "NGN_BANK". Configurable so
        # you don't need a redeploy to try alternatives.
        # JuntPay v1 requires the SAME wayCode ("BANK_TRANSFER") for both
        # payins and payouts on Nigerian bank rails. The legacy value
        # "BANK_ACCOUNT" was rejected with "Unsupported payment method".
        "payin_way_code":  os.environ.get("JUNTBEST_PAYIN_WAY_CODE",  "BANK_TRANSFER"),
        "payout_way_code": os.environ.get("JUNTBEST_PAYOUT_WAY_CODE", "BANK_TRANSFER"),
        "payin_notify":    os.environ.get("JUNTBEST_PAYIN_NOTIFY_URL",  ""),
        "payout_notify":   os.environ.get("JUNTBEST_PAYOUT_NOTIFY_URL", ""),
    }


def enabled() -> bool:
    c = _config()
    return c["enabled"] == "true" and bool(c["mch_no"]) and bool(c["app_id"]) and bool(c["key"])


# ---------------------------------------------------------------------------
# Signature helpers
# ---------------------------------------------------------------------------

def _md5_upper(text: str) -> str:
    return hashlib.md5(text.encode("utf-8")).hexdigest().upper()


def _stringify_value(v: Any) -> str:
    """Serialize a signable value for concatenation. Sub-objects / lists become
    compact JSON (no extra whitespace) per the docs' "转为无多余空格的 JSON 字符串"
    (translate to JSON with no extra whitespace) rule."""
    if isinstance(v, (dict, list)):
        return json.dumps(v, separators=(",", ":"), ensure_ascii=False)
    if isinstance(v, bool):
        return "true" if v else "false"
    return str(v)


def sign_body(body: Dict[str, Any], secret: Optional[str] = None) -> str:
    """Build the sign value for a request or webhook body.

    Rules from https://doc.juntpay.top/guide/authorization :
      1. Drop keys whose value is None or an empty string
      2. Sort remaining keys case-INSENSITIVE alphabetical
      3. Concat `key=value` pairs with `&`
      4. Append `&key=<SECRET>`
      5. MD5 hex-digest, then UPPERCASE

    Note: the "sign" field itself must never be included (obviously). We also
    drop it defensively in case a caller passes it through.
    """
    c = _config()
    key = secret if secret is not None else c["key"]
    pairs = []
    for k in sorted(body.keys(), key=lambda x: x.lower()):
        if k == "sign":
            continue
        v = body[k]
        if v is None or v == "":
            continue
        pairs.append(f"{k}={_stringify_value(v)}")
    sign_str = "&".join(pairs) + f"&key={key}"
    return _md5_upper(sign_str)


def verify_body_sign(body: Dict[str, Any]) -> bool:
    """Recompute the signature on a received body (webhook or response) and
    compare to the `sign` field on the body. Returns False if `sign` missing."""
    provided = body.get("sign")
    if not provided:
        return False
    return sign_body(body) == provided


# Public back-compat wrappers so /server.py doesn't need to know about the
# API rename. Both webhooks use the same signing algorithm as regular requests.
def verify_payin_callback(body: Dict[str, Any]) -> bool:
    """Payin webhook signature check. The docs say `sign` covers the `data`
    dict, but in practice v1 gateways sign the whole body — we try body-level
    first (the common case) and fall back to signing just `data`."""
    if verify_body_sign(body):
        return True
    inner = body.get("data") or {}
    if isinstance(inner, dict) and inner:
        # Data-only signature — some deployments sign the wrapped data
        # object instead of the outer envelope.
        provided = body.get("sign")
        if provided and sign_body(inner) == provided:
            return True
    logger.warning("JuntPay payin webhook signature invalid: body=%s", body)
    return False


def verify_payout_callback(body: Dict[str, Any]) -> bool:
    return verify_payin_callback(body)  # identical algorithm


# ---------------------------------------------------------------------------
# HTTP transport
# ---------------------------------------------------------------------------

def _base_body() -> Dict[str, Any]:
    """Common request fields required by every API call."""
    c = _config()
    return {
        "mchNo":   c["mch_no"],
        "appId":   c["app_id"],
        "reqTime": int(time.time()),
        "version": "1.0",
    }


def _proxy_url() -> Optional[str]:
    """Route outbound gateway calls through the IPRoyal static proxy if configured,
    so JuntPay sees a single stable IP that the merchant has whitelisted."""
    return os.environ.get("HTTPS_PROXY") or os.environ.get("HTTP_PROXY")


async def _post(path: str, body: Dict[str, Any], timeout: float = 20.0) -> Dict[str, Any]:
    """Sign, send, return the JSON response.

    The path is joined to the configured base URL. All requests are HTTPS POST
    with JSON body. On network errors we return a synthetic
    `{code: -1, msg: str(exc), data: None}` so callers can uniformly branch on
    `resp.get("code") == 0`.
    """
    c = _config()
    body["sign"] = sign_body(body)
    url = f"{c['base']}{path}"
    proxy = _proxy_url()

    # The IPRoyal proxy occasionally returns a 403 (ProxyError) or 5xx on
    # JuntPay hostnames — likely provider-side rate limiting or transient
    # blacklist churn. Retry up to 5 attempts with exponential backoff so a
    # single flaky proxy hop doesn't cascade into a failed withdrawal.
    # We retry on BOTH network exceptions AND 403/429/5xx status codes.
    RETRIES = 5
    last_exc: Optional[Exception] = None
    for attempt in range(1, RETRIES + 1):
        try:
            async with httpx.AsyncClient(timeout=timeout, proxy=proxy) as client:
                r = await client.post(url, json=body,
                                      headers={"Content-Type": "application/json",
                                               "Accept": "application/json"})
                try:
                    data = r.json()
                except Exception:
                    data = {"code": -1, "msg": f"non-json response: {r.text[:200]}", "data": None}
                if r.status_code in (403, 429) or 500 <= r.status_code < 600:
                    logger.warning("JuntPay %s HTTP %s: %s (attempt %d/%d)", path, r.status_code, data, attempt, RETRIES)
                    if attempt < RETRIES:
                        await asyncio.sleep(0.5 * attempt)
                        continue
                return data
        except Exception as exc:
            last_exc = exc
            # ProxyError, ConnectTimeout, ReadTimeout, RemoteProtocolError etc.
            # Retry — these are almost always transient hops through IPRoyal.
            logger.warning("JuntPay %s attempt %d/%d failed: %s", path, attempt, RETRIES, exc)
            if attempt < RETRIES:
                await asyncio.sleep(0.5 * attempt)
                continue
            logger.exception("JuntPay %s exhausted retries", path)
            return {"code": -1, "msg": f"network error: {exc}", "data": None}
    # Unreachable — the loop always returns or raises, but keep mypy happy.
    return {"code": -1, "msg": f"network error: {last_exc}", "data": None}


# ---------------------------------------------------------------------------
# Response normalisation
# ---------------------------------------------------------------------------
#
# The rest of Luckycart Box (server.py, admin views, deposit records) was
# written against the legacy field names (`platform_osn`, `pay_url`,
# `message`). We normalise the new v1 response into the legacy shape at the
# SDK boundary so callers don't need to change.
#
#   Legacy field           New v1 field
#   -----------------      -----------------
#   code                   code       (same, 0=success)
#   message                msg        (renamed — we mirror it into "message")
#   data.platform_osn      data.payOrderId (payin) / data.transferId (payout)
#   data.pay_url           data.payData (when data.payDataType in {payurl, redirectUrl})
#
# We ADD the legacy keys to the response dict; we don't remove the new ones.

def _normalise_payin_response(resp: Dict[str, Any]) -> Dict[str, Any]:
    if not isinstance(resp, dict):
        return resp
    if "msg" in resp and "message" not in resp:
        resp["message"] = resp["msg"]
    data = resp.get("data")
    if isinstance(data, dict):
        # platform_osn ← payOrderId
        if "platform_osn" not in data and "payOrderId" in data:
            data["platform_osn"] = data["payOrderId"]
        # pay_url ← payData (when it's a URL-type payment). payDataType values
        # documented: "payurl", "redirectUrl", "codeUrl" (QR). We treat the
        # first two as redirectable URLs.
        pay_type = (data.get("payDataType") or "").lower()
        if "pay_url" not in data:
            if pay_type in ("payurl", "redirecturl") and data.get("payData"):
                data["pay_url"] = data["payData"]
            elif pay_type == "" and isinstance(data.get("payData"), str) \
                    and data["payData"].startswith(("http://", "https://")):
                # Some gateway variants return payData without a payDataType.
                # If it looks like a URL, treat it as one.
                data["pay_url"] = data["payData"]
    return resp


def _normalise_payout_response(resp: Dict[str, Any]) -> Dict[str, Any]:
    if not isinstance(resp, dict):
        return resp
    if "msg" in resp and "message" not in resp:
        resp["message"] = resp["msg"]
    data = resp.get("data")
    if isinstance(data, dict) and "platform_osn" not in data:
        # For payouts, the platform id is `transferId`.
        if "transferId" in data:
            data["platform_osn"] = data["transferId"]
    return resp


# ---------------------------------------------------------------------------
# API — payins (deposits / collection)
# ---------------------------------------------------------------------------

async def create_payin(order_sn: str, amount: float, *,
                       name: str, phone: str, email: str,
                       remark: str = "Wallet deposit",
                       redirect_url: str = "") -> Dict[str, Any]:
    """Create a deposit order.

    Args match the legacy juntbest SDK exactly so /server.py doesn't need
    to change. The response is normalised so it has `data.pay_url` and
    `data.platform_osn` just like the old API.
    """
    c = _config()
    body = _base_body()
    body.update({
        "mchOrderNo":     order_sn,
        "amount":         float(f"{amount:.2f}"),
        "currency":       c["currency"],
        "wayCode":        c["payin_way_code"],
        "subject":        remark or "Wallet deposit",
        "customerName":   name or "User",
        "customerEmail":  email or "user@luckycartbox.local",
        "customerMobile": phone or "0000000000",
    })
    if c["payin_notify"]:
        body["notifyUrl"] = c["payin_notify"]
    if redirect_url:
        body["returnUrl"] = redirect_url
    resp = await _post("/api/v1/payment/createOrder", body)
    return _normalise_payin_response(resp)


async def query_payin(order_sn: str) -> Dict[str, Any]:
    """Query a payin by our mchOrderNo. Returns the normalised response."""
    body = _base_body()
    body["mchOrderNo"] = order_sn
    resp = await _post("/api/v1/payment/queryOrder", body)
    return _normalise_payin_response(resp)


# ---------------------------------------------------------------------------
# API — payouts (withdrawals)
# ---------------------------------------------------------------------------

async def create_payout(order_sn: str, amount: float, *,
                        name: str, account: str, bank_code: str,
                        remark: str = "Payout") -> Dict[str, Any]:
    """Create a payout to a Nigerian bank account.

    `bank_code` is the JuntPay bank code from `list_banks()`. The new
    (JuntPay v1) API returns 6-digit CBN-format codes (`000014` Access,
    `100004` OPay, `090267` Kuda). The legacy static `NIGERIAN_BANKS`
    list is retained below only as a last-resort fallback.

    IMPORTANT: JuntPay v1 rejects every `wayCode` except `BANK_TRANSFER`.
    We enforce that here regardless of env override so a stale/incorrect
    `JUNTBEST_PAYOUT_WAY_CODE` (e.g. `BANK_ACCOUNT`) can't strand real
    withdrawals in production.
    """
    c = _config()
    way_code = c["payout_way_code"]
    # Hard-guard: the only wayCode JuntPay v1 currently accepts is
    # BANK_TRANSFER. Anything else gets "Unsupported payment method" and
    # kills the withdrawal. Log a warning so admin sees the misconfig.
    if way_code != "BANK_TRANSFER":
        logger.warning(
            "JUNTBEST_PAYOUT_WAY_CODE=%r is not supported by JuntPay v1; "
            "forcing BANK_TRANSFER for this payout.", way_code,
        )
        way_code = "BANK_TRANSFER"
    body = _base_body()
    body.update({
        "mchOrderNo":     order_sn,
        "amount":         float(f"{amount:.2f}"),
        "currency":       c["currency"],
        "wayCode":        way_code,
        "transferDesc":   remark or "Payout",
        "accountNumber":  account,
        "bankCode":       bank_code,
        "customerName":   name or "Beneficiary",
        # These two are marked required in the docs even for payouts.
        "customerMobile": "0000000000",
        "customerEmail":  "payee@luckycartbox.local",
    })
    if c["payout_notify"]:
        body["notifyUrl"] = c["payout_notify"]
    resp = await _post("/api/v1/payout/createOrder", body)
    return _normalise_payout_response(resp)


async def query_payout(order_sn: str) -> Dict[str, Any]:
    body = _base_body()
    body["mchOrderNo"] = order_sn
    resp = await _post("/api/v1/payout/queryOrder", body)
    return _normalise_payout_response(resp)


# ---------------------------------------------------------------------------
# API — merchant balance & bank list
# ---------------------------------------------------------------------------

async def get_balance() -> Dict[str, Any]:
    """Query available balance for our merchant account."""
    c = _config()
    body = _base_body()
    body["currency"] = c["currency"]
    return await _post("/api/v1/merchant/queryBalance", body)


async def get_ngn_va(platform_osn: str) -> Dict[str, Any]:
    """Legacy shim — the old API had a dedicated NGN VA lookup, the new API
    returns the checkout URL directly in `create_payin`'s response. If callers
    still invoke this, we just requery the order and return whatever's in
    `data.payData` (which may be the VA info as JSON, a URL, or a QR)."""
    logger.info("get_ngn_va called with payOrderId=%s — new API returns payData in create_payin; querying order",
                platform_osn)
    body = _base_body()
    body["payOrderId"] = platform_osn
    resp = await _post("/api/v1/payment/queryOrder", body)
    return _normalise_payin_response(resp)


# In-memory cache of the live bank list. First call fetches, subsequent calls
# return the cached list. TTL keeps it fresh in case the gateway adds a bank.
_BANK_CACHE: Dict[str, Any] = {"expires_at": 0, "banks": None}


async def list_banks_async(force: bool = False) -> List[Dict[str, str]]:
    """Fetch the live bank code list from the gateway. Cached for 1 hour.
    Falls back to the static NIGERIAN_BANKS list if the call fails."""
    now = time.time()
    if not force and _BANK_CACHE["banks"] is not None and _BANK_CACHE["expires_at"] > now:
        return _BANK_CACHE["banks"]
    body = _base_body()
    resp = await _post("/api/v1/merchant/queryBankCode", body)
    if resp.get("code") == 0 and isinstance(resp.get("data"), list) and resp["data"]:
        # Normalise to {code, name} to match the shape used by /server.py.
        banks = []
        for b in resp["data"]:
            if not isinstance(b, dict):
                continue
            code = b.get("bankCode") or b.get("code")
            name = b.get("bankName") or b.get("name")
            if code and name:
                banks.append({"code": str(code), "name": str(name)})
        if banks:
            _BANK_CACHE["banks"] = banks
            _BANK_CACHE["expires_at"] = now + 3600
            return banks
    logger.warning("JuntPay queryBankCode failed or empty; using static fallback. resp=%s", resp)
    return NIGERIAN_BANKS


def list_banks() -> List[Dict[str, str]]:
    """Synchronous accessor — returns whatever's in the cache, or the static
    fallback if we haven't fetched yet. Kept for backward compat with the
    existing `/api/juntbest/banks` endpoint in server.py.
    """
    return _BANK_CACHE.get("banks") or NIGERIAN_BANKS


# Alias used by server.py in an earlier iteration
list_banks_cached = list_banks


# ---------------------------------------------------------------------------
# Nigerian bank codes — legacy static list, kept as fallback so existing
# user bank bindings (stored with the old 80000xxx codes) don't break during
# the API migration. The `list_banks_async` call above will replace this at
# runtime with the live juntpay.top list. If the new gateway uses different
# codes than the old ones, users will need to re-bind their bank at withdrawal
# time — the mapping migration is out-of-scope for this SDK swap.
# ---------------------------------------------------------------------------
NIGERIAN_BANKS: List[Dict[str, str]] = [
    {"code": "80000001", "name": "Access Bank"},
    {"code": "80000002", "name": "Citibank Nigeria"},
    {"code": "80000004", "name": "Ecobank Nigeria"},
    {"code": "80000005", "name": "Enterprise Bank"},
    {"code": "80000006", "name": "Fidelity Bank"},
    {"code": "80000007", "name": "First Bank of Nigeria"},
    {"code": "80000008", "name": "First City Monument Bank"},
    {"code": "80000009", "name": "Guaranty Trust Bank"},
    {"code": "80000010", "name": "Heritage Bank"},
    {"code": "80000011", "name": "Jaiz Bank"},
    {"code": "80000012", "name": "Keystone Bank"},
    {"code": "80000013", "name": "MainStreet Bank"},
    {"code": "80000014", "name": "Parallex Bank"},
    {"code": "80000015", "name": "Providus Bank"},
    {"code": "80000016", "name": "Polaris Bank"},
    {"code": "80000017", "name": "Stanbic IBTC Bank"},
    {"code": "80000018", "name": "Standard Chartered Bank"},
    {"code": "80000019", "name": "Sterling Bank"},
    {"code": "80000020", "name": "Suntrust Bank"},
    {"code": "80000021", "name": "Union Bank of Nigeria"},
    {"code": "80000022", "name": "United Bank For Africa"},
    {"code": "80000023", "name": "Unity Bank"},
    {"code": "80000024", "name": "Wema Bank"},
    {"code": "80000025", "name": "Zenith Bank"},
    {"code": "80000026", "name": "eTranzact PocketMoni"},
    {"code": "80000027", "name": "TAJ Bank"},
    {"code": "80000028", "name": "Kuda Bank"},
    {"code": "80000029", "name": "Moniepoint MFB"},
    {"code": "80000030", "name": "OPay"},
    {"code": "80000032", "name": "FINCA Nigeria"},
    {"code": "80000033", "name": "PalmPay"},
    {"code": "80000034", "name": "Rubies MFB"},
    {"code": "80000035", "name": "Titan Trust Bank"},
    {"code": "80000038", "name": "PAGA"},
    {"code": "80000040", "name": "GLOBUS BANK"},
    {"code": "80000041", "name": "NIRSAL NATIONAL MICROFINANCE BANK"},
    {"code": "80000042", "name": "HOPE PSB"},
    {"code": "80000043", "name": "ACCION MICROFINANCE BANK"},
    {"code": "80000044", "name": "VFD microfinance bank"},
    {"code": "80000045", "name": "Lotus bank"},
    {"code": "80000047", "name": "SMARTCASH"},
    {"code": "80000049", "name": "LAPO MICROFINANCE BANK"},
    {"code": "80000050", "name": "PremiumTrust Bank"},
    {"code": "80000053", "name": "FairMoney"},
    {"code": "80000055", "name": "Dot Microfinance Bank"},
]
