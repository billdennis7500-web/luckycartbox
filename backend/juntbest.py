"""
JuntBest ("Global business smart payment gateway") OpenAPI client for NaijaInvest.

Docs: https://ngn.junt.best/doc/api.htm

Base URL (prod): https://ngn.junt.best

Signing rules (verified against the docs):
  * Collection request  : md5(ak + order_sn + amount + sk)
  * Collection callback : md5(ak + platform_osn + status + amount + sk)
  * Collection status   : md5(ak + order_sn + sk)
  * Payout request      : md5(ak + order_sn + account + upi_handle + amount + sk)
    (For Nigeria we always send `type=bank` so `upi_handle` is empty and drops
    out of the concatenation as an empty string — the docs are explicit: "如为
    空值不参与签名".)
  * Payout callback     : md5(ak + platform_osn + status + amount + sk)
  * Payout status       : md5(ak + order_sn + sk)
  * Balance             : md5(ak + sk)

All requests are JSON POST. Responses are JSON with `{code, message, data}`.
Success is `code == 0` (differs from PayNow which uses `code == 0` too but
from 1SSPay which uses `code == 200`).

Callback response must be the literal string `SUCCESS` (case-sensitive).

Nigerian bank codes are 8-digit `80000xxx` values — full table shipped inline
below (extracted from the official docs).

The client mirrors the shape of `paynow.py` / `shpay.py` / `onesspay.py` so
the rest of the app can treat all four gateways symmetrically.
"""
import os
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
        "base":        os.environ.get("JUNTBEST_BASE_URL", "https://ngn.junt.best").rstrip("/"),
        "merchant_sn": os.environ.get("JUNTBEST_MERCHANT_SN", ""),
        "ak":          os.environ.get("JUNTBEST_ACCESS_KEY", ""),
        "sk":          os.environ.get("JUNTBEST_SECRET_KEY", ""),
        "payin_notify":  os.environ.get("JUNTBEST_PAYIN_NOTIFY_URL", ""),
        "payout_notify": os.environ.get("JUNTBEST_PAYOUT_NOTIFY_URL", ""),
    }


def enabled() -> bool:
    c = _config()
    return c["enabled"] == "true" and bool(c["merchant_sn"]) and bool(c["ak"]) and bool(c["sk"])


# ---------------------------------------------------------------------------
# Signing helpers (MD5, order-sensitive, per-operation)
# ---------------------------------------------------------------------------

def _md5(text: str) -> str:
    return hashlib.md5(text.encode("utf-8")).hexdigest()


def sign_payin(order_sn: str, amount: str) -> str:
    c = _config()
    return _md5(c["ak"] + order_sn + amount + c["sk"])


def sign_payin_callback(platform_osn: str, status: str, amount: str) -> str:
    c = _config()
    return _md5(c["ak"] + platform_osn + status + amount + c["sk"])


def sign_payin_check(order_sn: str) -> str:
    c = _config()
    return _md5(c["ak"] + order_sn + c["sk"])


def sign_payout(order_sn: str, account: str, upi_handle: str, amount: str) -> str:
    """Empty-value fields drop out of the concatenation (docs: `如为空值不参与签名`).
    For Nigeria we always send type=bank with upi_handle="" so this evaluates
    to md5(ak + order_sn + account + amount + sk)."""
    c = _config()
    return _md5(c["ak"] + order_sn + (account or "") + (upi_handle or "") + amount + c["sk"])


def sign_payout_callback(platform_osn: str, status: str, amount: str) -> str:
    """Payout callback signature — same shape as payin callback."""
    c = _config()
    return _md5(c["ak"] + platform_osn + status + amount + c["sk"])


def sign_payout_check(order_sn: str) -> str:
    c = _config()
    return _md5(c["ak"] + order_sn + c["sk"])


def sign_balance() -> str:
    c = _config()
    return _md5(c["ak"] + c["sk"])


def sign_va(platform_osn: str) -> str:
    """VA (dynamic virtual account for NGN cash-in) signature:
    md5(ak + merchant_sn + platform_osn + sk)."""
    c = _config()
    return _md5(c["ak"] + c["merchant_sn"] + platform_osn + c["sk"])


def verify_payin_callback(body: Dict[str, Any]) -> bool:
    """Payin webhook signature check. Body keys: merchant_sn, order_sn,
    platform_osn, status, message, amount, time_paid, sign."""
    c = _config()
    if str(body.get("merchant_sn") or "") != c["merchant_sn"]:
        logger.warning("JuntBest payin cb merchant_sn mismatch: %s", body.get("merchant_sn"))
        return False
    provided = str(body.get("sign") or "")
    expected = sign_payin_callback(
        str(body.get("platform_osn") or ""),
        str(body.get("status") or ""),
        str(body.get("amount") or ""),
    )
    ok = provided == expected
    if not ok:
        logger.warning("JuntBest payin cb sign mismatch. provided=%s expected=%s", provided, expected)
    return ok


def verify_payout_callback(body: Dict[str, Any]) -> bool:
    """Payout webhook signature check — same envelope as payin callback."""
    c = _config()
    if str(body.get("merchant_sn") or "") != c["merchant_sn"]:
        logger.warning("JuntBest payout cb merchant_sn mismatch: %s", body.get("merchant_sn"))
        return False
    provided = str(body.get("sign") or "")
    expected = sign_payout_callback(
        str(body.get("platform_osn") or ""),
        str(body.get("status") or ""),
        str(body.get("amount") or ""),
    )
    ok = provided == expected
    if not ok:
        logger.warning("JuntBest payout cb sign mismatch. provided=%s expected=%s", provided, expected)
    return ok


# ---------------------------------------------------------------------------
# HTTP helper — JSON POST, honours HTTPS_PROXY like the other SDKs.
# ---------------------------------------------------------------------------

async def _post(path: str, payload: Dict[str, Any], timeout: float = 20.0) -> Dict[str, Any]:
    cfg = _config()
    url = cfg["base"] + path
    log_payload = {k: v for k, v in payload.items() if k != "sign"}
    logger.info("JuntBest POST %s payload=%s", path, log_payload)
    async with httpx.AsyncClient(timeout=timeout) as c:
        r = await c.post(url, json=payload,
                         headers={"Content-Type": "application/json"})
    try:
        data = r.json()
    except Exception:
        data = {"code": r.status_code, "message": r.text, "data": None}
    logger.info("JuntBest response %s", data)
    return data


# ---------------------------------------------------------------------------
# API operations
# ---------------------------------------------------------------------------

async def create_payin(order_sn: str, amount: float, *,
                       name: str, phone: str, email: str,
                       remark: str = "Wallet deposit",
                       redirect_url: str = "") -> Dict[str, Any]:
    """Create a collection (deposit) order. Returns `data.pay_url` (checkout
    page) + `data.platform_osn` (JuntBest's 5-char order number). The user
    should be redirected to `pay_url`.
    """
    cfg = _config()
    amt = f"{amount:.2f}"
    payload: Dict[str, Any] = {
        "merchant_sn": cfg["merchant_sn"],
        "order_sn":    order_sn,
        "amount":      amt,
        "name":        name,
        "email":       email,
        "phone":       phone,
        "remark":      remark,
        "redirect_url": redirect_url,
        "sign":        sign_payin(order_sn, amt),
    }
    return await _post("/gateway/payin/", payload)


async def query_payin(order_sn: str) -> Dict[str, Any]:
    """Query status of a deposit order by OUR order_sn (the docs' `payincheck`
    endpoint uses order_sn, not platform_osn)."""
    cfg = _config()
    payload: Dict[str, Any] = {
        "merchant_sn": cfg["merchant_sn"],
        "order_sn":    order_sn,
        "sign":        sign_payin_check(order_sn),
    }
    return await _post("/gateway/payincheck/", payload)


async def create_payout(order_sn: str, amount: float, *,
                        name: str, account: str, bank_code: str,
                        remark: str = "Payout") -> Dict[str, Any]:
    """Create a payout to a Nigerian bank account. `bank_code` is JuntBest's
    8-digit `80000xxx` scheme (see NIGERIAN_BANKS below). For Nigeria the docs
    require `type=bank` and `upi_handle=""` (which then drops out of the
    signature per the docs' rule about empty values).
    """
    cfg = _config()
    amt = f"{amount:.2f}"
    upi_handle = ""
    payload: Dict[str, Any] = {
        "merchant_sn": cfg["merchant_sn"],
        "order_sn":    order_sn,
        "amount":      amt,
        "type":        "bank",
        "name":        name,
        "account":     account,
        "ifsc":        bank_code,   # for Nigeria, `ifsc` = the JuntBest bank code
        "upi_handle":  upi_handle,
        "remark":      remark,
        "sign":        sign_payout(order_sn, account, upi_handle, amt),
    }
    return await _post("/gateway/payout/", payload)


async def query_payout(order_sn: str) -> Dict[str, Any]:
    cfg = _config()
    payload: Dict[str, Any] = {
        "merchant_sn": cfg["merchant_sn"],
        "order_sn":    order_sn,
        "sign":        sign_payout_check(order_sn),
    }
    return await _post("/gateway/payoutcheck/", payload)


async def get_balance() -> Dict[str, Any]:
    """Query available payout balance."""
    cfg = _config()
    payload: Dict[str, Any] = {
        "merchant_sn": cfg["merchant_sn"],
        "sign":        sign_balance(),
    }
    return await _post("/gateway/balance/", payload)


async def get_ngn_va(platform_osn: str) -> Dict[str, Any]:
    """Fetch dynamic virtual-account details for a previously-created payin
    order (Nigeria). Returns `{bank_name, account_number, account_name,
    amount, expires_in}` inside `data`.

    Call this AFTER create_payin returns, ideally >2 seconds later — the docs
    warn that calling it within 2s of order creation yields error 4001.
    """
    cfg = _config()
    payload: Dict[str, Any] = {
        "merchant_sn":  cfg["merchant_sn"],
        "platform_osn": platform_osn,
        "sign":         sign_va(platform_osn),
    }
    return await _post("/gateway/ngnva/", payload)


# ---------------------------------------------------------------------------
# Nigerian bank codes — JuntBest's own coding scheme (8-digit `80000xxx`).
# Verbatim from the docs. Sorted by code.
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
    {"code": "80000036", "name": "Coronation Merchant Bank"},
    {"code": "80000037", "name": "Rand Merchant Bank"},
    {"code": "80000038", "name": "PAGA"},
    {"code": "80000039", "name": "Jubilee Life Mortgage Bank"},
    {"code": "80000040", "name": "GLOBUS BANK"},
    {"code": "80000041", "name": "NIRSAL NATIONAL MICROFINANCE BANK"},
    {"code": "80000042", "name": "HOPE PSB"},
    {"code": "80000043", "name": "ACCION MICROFINANCE BANK"},
    {"code": "80000044", "name": "VFD microfinance bank"},
    {"code": "80000045", "name": "Lotus bank"},
    {"code": "80000046", "name": "FFS MICROFINANCE BANK"},
    {"code": "80000047", "name": "SMARTCASH"},
    {"code": "80000048", "name": "EYOWO"},
    {"code": "80000049", "name": "LAPO MICROFINANCE BANK"},
    {"code": "80000050", "name": "PremiumTrust Bank"},
    {"code": "80000051", "name": "TANADI MFB (CRUST)"},
    {"code": "80000052", "name": "Abbey Mortgage Bank"},
    {"code": "80000053", "name": "FairMoney"},
    {"code": "80000054", "name": "Good News Microfinance Bank"},
    {"code": "80000055", "name": "Dot Microfinance Bank"},
    {"code": "80000056", "name": "Ibom Fadama Microfinance Bank"},
    {"code": "80000057", "name": "AKU Microfinance Bank"},
    {"code": "80000059", "name": "PRISTINE DIVITIS MICROFINANCE BANK LTD"},
    {"code": "80000061", "name": "Moneymaster PSB"},
    {"code": "80000062", "name": "Uhuru Microfinance Bank"},
    {"code": "80000063", "name": "Pillar Microfinance Bank"},
    {"code": "80000064", "name": "Aspire Microfinance Bank"},
    {"code": "80000065", "name": "Haggai Mortgage Bank"},
    {"code": "80000067", "name": "Manny Microfinance Bank"},
    {"code": "80000068", "name": "FSDH"},
    {"code": "80000069", "name": "Titan-Paystack Microfinance Bank"},
    {"code": "80000070", "name": "Rigo Microfinance Bank"},
    {"code": "80000072", "name": "Peace Microfinance Bank"},
    {"code": "80000073", "name": "Infinity Trust Mortgage Bank"},
    {"code": "80000074", "name": "Kredi Money Microfinance Bank"},
    {"code": "80000075", "name": "CORESTEP MICROFINANCE BANK"},
    {"code": "80000076", "name": "MOMO PSB"},
    {"code": "80000077", "name": "CARBON"},
    {"code": "80000078", "name": "Zikora Microfinance Bank"},
    {"code": "80000079", "name": "CROSS RIVER MICROFINANCE BANK LTD"},
    {"code": "80000080", "name": "Chukwunenye MFB"},
    {"code": "80000081", "name": "SPECTRUM MICROFINANCE BANK"},
    {"code": "80000082", "name": "Rehoboth MFB"},
    {"code": "80000083", "name": "Infinity Microfinance Bank"},
    {"code": "80000085", "name": "AB MICROFINANCE BANK"},
    {"code": "80000086", "name": "BRIGHTWAY MICROFINANCE BANK"},
    {"code": "80000087", "name": "Iyamoye Microfinance Bank"},
    {"code": "80000089", "name": "Parkway Microfinance Bank"},
    {"code": "80000090", "name": "Baines Credit MFB"},
    {"code": "80000091", "name": "Yes Microfinance Bank"},
    {"code": "80000093", "name": "Nice Microfinance Bank LTD"},
    {"code": "80000094", "name": "Delta Trust Mortgage Bank"},
    {"code": "80000096", "name": "UNICAL MICROFINANCE BANK"},
    {"code": "80000097", "name": "9 PAYMENT SERVICE BANK"},
    {"code": "80000098", "name": "AG MORTGAGE BANK"},
    {"code": "80000099", "name": "Nomba"},
    {"code": "80000100", "name": "Branch International Financial Services"},
    {"code": "80000101", "name": "GoMoney"},
    {"code": "80000103", "name": "Baobab MFB"},
    {"code": "80000104", "name": "AKWA SAVINGS & LOANS"},
    {"code": "80000106", "name": "NowNow"},
    {"code": "80000107", "name": "Aniocha MFB"},
    {"code": "80000109", "name": "SUPPORT MICROFINANCE BANK"},
    {"code": "80000113", "name": "Firmus Microfiance Bank"},
    {"code": "80000115", "name": "Safe Haven Microfinance Bank"},
    {"code": "80000116", "name": "NPF MFB"},
    {"code": "80000117", "name": "NEPTUNE MICROFINANCE BANK"},
    {"code": "80000119", "name": "KAYVEE MFB"},
    {"code": "80000120", "name": "Regent MFB"},
    {"code": "80000121", "name": "Rigo Microfinance Bank Limited"},
    {"code": "80000122", "name": "Otech Microfinance Bank Ltd"},
    {"code": "80000124", "name": "PREEMINENT MFB"},
    {"code": "80000125", "name": "Mainland Microfinance Bank"},
    {"code": "80000127", "name": "FIDFUND MICROFINANCE BANK LIMITED"},
    {"code": "80000128", "name": "Aztec Microfinance Bank Limited"},
    {"code": "80000129", "name": "Taj_Pinspay"},
    {"code": "80000135", "name": "CAPSTONE MICROFINANCE BANK"},
    {"code": "80000137", "name": "ZENITH EAZY WALLET"},
    {"code": "80000139", "name": "AFEMAI MICROFINANCE BANK"},
    {"code": "80000141", "name": "PAYSTACK PAYMENTS LIMITED"},
    {"code": "80000143", "name": "FEDETH Microfinance Bank"},
    {"code": "80000144", "name": "Oche Microfinance Bank Ltd"},
    {"code": "80000145", "name": "UNN Staff Microfinance Bank Ltd"},
    {"code": "80000146", "name": "Consistent Trust Microfinance Bank"},
    {"code": "80000147", "name": "Uzondu MFBank"},
    {"code": "80000148", "name": "MONARCH MICROFINANCE BANK"},
    {"code": "80000150", "name": "Chibueze microfinance bank"},
    {"code": "80000152", "name": "Platinum Mortgage Bank Limited"},
    {"code": "80000154", "name": "Links Microfinance Bank"},
    {"code": "80000158", "name": "OSCOTECH MICROFINANCE BANK"},
    {"code": "80000159", "name": "ISUOFIA MICROFINANCE BANK"},
    {"code": "80000161", "name": "NWANNEGADI MICROFINANCE BANK"},
    {"code": "80000162", "name": "UNIUYO MICROFINANCE BANK"},
    {"code": "80000163", "name": "OTUO MICROFINANCE BANK"},
    {"code": "80000165", "name": "Balera Microfinance Bank Limited"},
    {"code": "80000166", "name": "Letshego MFB"},
    {"code": "80000169", "name": "OCTOPUS MICROFINANCE BANK"},
    {"code": "80000171", "name": "Citizen Trust Microfinance Bank Limited"},
    {"code": "80000172", "name": "Ampersand Microfinance Bank"},
    {"code": "80000173", "name": "ASO Savings and Loans"},
    {"code": "80000174", "name": "Covenant Microfinance Bank"},
    {"code": "80000175", "name": "Ekondo Microfinance Bank"},
    {"code": "80000176", "name": "Enrich Microfinance Bank"},
    {"code": "80000177", "name": "Hackman Microfinance Bank"},
    {"code": "80000178", "name": "Hasal Microfinance Bank"},
    {"code": "80000179", "name": "IBILE Microfinance Bank"},
    {"code": "80000180", "name": "Imperial Homes Mortgage Bank"},
    {"code": "80000181", "name": "Mint-Finex MICROFINANCE BANK"},
    {"code": "80000183", "name": "Sparkle Microfinance Bank"},
]


def list_banks() -> List[Dict[str, str]]:
    """Return the static bank list. There is no server call for this."""
    return NIGERIAN_BANKS
