"""
1SSPay OpenAPI client for Luckycart Box.

Docs (Chinese): https://www.showdoc.com.cn/2598851032522392
Base URL (prod): https://api.1sspay.com/

Signing rule (verified against live API):
  1. Filter out keys with empty / None values AND the `sign` field itself.
  2. Sort keys ASCII/ascending.
  3. Concatenate as `key1=value1&key2=value2&…` (NO url-encoding).
  4. HMAC-SHA1 the string with the merchant's `Key` as secret.
  5. Base64-encode the raw HMAC bytes → the resulting string IS the sign.

Callbacks are `application/x-www-form-urlencoded` (NOT JSON) and expect the
literal string `"success"` (case-sensitive) as the response body. Retries
happen at 30s / 90s / 3m / 6m / 15m / 30m / 60m until we ack.

Nigeria uses `country=4`.

The client mirrors the shape of `shpay.py` / `paynow.py` so the rest of the
app can treat all three gateways symmetrically.
"""
import os
import time
import hmac
import base64
import hashlib
import logging
from typing import Any, Dict, Optional, List

import httpx

logger = logging.getLogger("onesspay")

# Nigeria country code per docs.
COUNTRY_NG = "4"


def _config() -> Dict[str, str]:
    """Read env on every call so admin can rotate keys without restart."""
    return {
        "enabled":     os.environ.get("ONESSPAY_ENABLED", "false").lower(),
        "base":        os.environ.get("ONESSPAY_BASE_URL", "https://api.1sspay.com").rstrip("/"),
        "merchant_id": os.environ.get("ONESSPAY_MERCHANT_ID", ""),
        "key":         os.environ.get("ONESSPAY_KEY", ""),
        "country":     os.environ.get("ONESSPAY_COUNTRY", COUNTRY_NG),
        "payin_notify":  os.environ.get("ONESSPAY_PAYIN_NOTIFY_URL", ""),
        "payout_notify": os.environ.get("ONESSPAY_PAYOUT_NOTIFY_URL", ""),
    }


def enabled() -> bool:
    c = _config()
    return c["enabled"] == "true" and bool(c["merchant_id"]) and bool(c["key"])


# ---------------------------------------------------------------------------
# Signing (HMAC-SHA1 + Base64)
# ---------------------------------------------------------------------------

def build_sign_string(params: Dict[str, Any]) -> str:
    """Sort keys, drop `sign` + empty values, join `key=value` with `&`.
    Values are stringified as-is (no URL encoding — matches all four demos in the docs).
    """
    parts = []
    for k in sorted(params.keys()):
        if k == "sign":
            continue
        v = params.get(k)
        if v is None:
            continue
        s = str(v)
        if s == "":
            continue
        parts.append(f"{k}={s}")
    return "&".join(parts)


def sign(params: Dict[str, Any], key: str) -> str:
    data = build_sign_string(params)
    raw = hmac.new(key.encode("utf-8"), data.encode("utf-8"), hashlib.sha1).digest()
    return base64.b64encode(raw).decode("ascii")


def signed_form(biz: Dict[str, Any]) -> Dict[str, str]:
    """Enrich a business payload with merchantId + sign, return string-only dict
    (form-urlencoded requires strings)."""
    cfg = _config()
    envelope: Dict[str, Any] = {"merchantId": cfg["merchant_id"], **biz}
    envelope["sign"] = sign(envelope, cfg["key"])
    return {k: str(v) for k, v in envelope.items() if v is not None and str(v) != ""}


def verify_callback_signature(body: Dict[str, Any]) -> bool:
    """1SSPay webhook signature check. Callbacks are form-urlencoded so all
    values arrive as strings. Empty values are excluded by the same rule as
    outgoing signing."""
    cfg = _config()
    provided = str(body.get("sign") or "")
    if not provided:
        return False
    expected = sign(body, cfg["key"])
    ok = provided == expected
    if not ok:
        logger.warning(
            "1SSPay callback signature mismatch. provided=%s expected=%s digest_keys=%s",
            provided, expected, sorted(k for k in body.keys() if k != "sign" and str(body.get(k)) != ""),
        )
    return ok


# ---------------------------------------------------------------------------
# HTTP helper
# ---------------------------------------------------------------------------

async def _post(path: str, biz: Dict[str, Any], timeout: float = 20.0) -> Dict[str, Any]:
    cfg = _config()
    form = signed_form(biz)
    url = cfg["base"] + path
    log_form = {k: v for k, v in form.items() if k != "sign"}
    logger.info("1SSPay POST %s payload=%s", path, log_form)
    async with httpx.AsyncClient(timeout=timeout) as c:
        r = await c.post(url, data=form,
                         headers={"Content-Type": "application/x-www-form-urlencoded"})
    try:
        data = r.json()
    except Exception:
        data = {"code": r.status_code, "msg": r.text, "data": None}
    logger.info("1SSPay response %s", data)
    return data


# ---------------------------------------------------------------------------
# API operations
# ---------------------------------------------------------------------------

async def create_payin(order_no: str, amount: float, *,
                       name: str, phone: str, email: str,
                       notify_url: Optional[str] = None) -> Dict[str, Any]:
    """Create a payin (collection) order. Returns dict with `data.jumpUrl` — the
    hosted checkout page users should be redirected/iframed to.

    Fee model: 1SSPay deducts fee from settlement, not from the user's payment.
    """
    cfg = _config()
    biz: Dict[str, Any] = {
        "country":   cfg["country"],
        "orderNo":   order_no,
        "amount":    f"{amount:.2f}",
        "name":      name,
        "phone":     phone,
        "email":     email,
        "notifyUrl": notify_url or cfg["payin_notify"],
    }
    return await _post("/payment/createOrder", biz)


async def query_payin(pay_no: str) -> Dict[str, Any]:
    """Query the status of a payin order by 1SSPay's `payNo` (NOT our orderNo)."""
    cfg = _config()
    return await _post("/payment/orderStatus", {"country": cfg["country"], "payNo": pay_no})


async def create_payout(order_no: str, amount: float, *,
                        name: str, account_num: str, bank_code: str,
                        phone: Optional[str] = None,
                        email: Optional[str] = None,
                        notify_url: Optional[str] = None) -> Dict[str, Any]:
    """Create a payout (disbursement) to a Nigerian bank account. Bank codes are
    in the `NIGERIAN_BANKS` table below."""
    cfg = _config()
    biz: Dict[str, Any] = {
        "country":    cfg["country"],
        "orderNo":    order_no,
        "amount":     f"{amount:.2f}",
        "name":       name,
        "accountNum": account_num,
        "bankCode":   bank_code,
        "notifyUrl":  notify_url or cfg["payout_notify"],
    }
    if phone: biz["phone"] = phone
    if email: biz["email"] = email
    return await _post("/payout/createOrder", biz)


async def query_payout(pay_no: str) -> Dict[str, Any]:
    """Query the status of a payout order by 1SSPay's `payNo`."""
    cfg = _config()
    return await _post("/payout/orderStatus", {"country": cfg["country"], "payNo": pay_no})


async def get_balance() -> Dict[str, Any]:
    """Query available balance (payin + waitSettle + payoutBalance)."""
    cfg = _config()
    return await _post("/payout/balance", {"country": cfg["country"]})


# ---------------------------------------------------------------------------
# Nigerian bank codes — 1SSPay's own coding scheme (NR0xxx).
# Provided verbatim by the merchant's docs. This is a static list; there is no
# public /banks endpoint on 1SSPay's API.
# ---------------------------------------------------------------------------
NIGERIAN_BANKS: List[Dict[str, str]] = [
    {"code": "NR0001", "name": "GT Bank"},
    {"code": "NR0002", "name": "United Bank For Africa Plc"},
    {"code": "NR0003", "name": "EVANGEL MFB"},
    {"code": "NR0005", "name": "BRIGHTWAY MFB"},
    {"code": "NR0006", "name": "HACKMAN MICROFINANCE BANK"},
    {"code": "NR0007", "name": "CORONATION MERCHANT BANK"},
    {"code": "NR0008", "name": "NPF MFB"},
    {"code": "NR0009", "name": "GATEWAY MORTGAGE BANK"},
    {"code": "NR0010", "name": "ABBEY MORTGAGE BANK"},
    {"code": "NR0011", "name": "REFUGE MORTGAGE BANK"},
    {"code": "NR0012", "name": "FBNQUEST MERCHANT BANK"},
    {"code": "NR0013", "name": "INFINITY TRUST MORTGAGE BANK"},
    {"code": "NR0014", "name": "HAGGAI MORTGAGE BANK"},
    {"code": "NR0015", "name": "FIRST GENERATION MORTGAGE BANK"},
    {"code": "NR0016", "name": "CELLULANT"},
    {"code": "NR0017", "name": "BRENT MORTGAGE BANK"},
    {"code": "NR0019", "name": "PLATINUM MORTGAGE BANK"},
    {"code": "NR0020", "name": "STERLING BANK PLC"},
    {"code": "NR0021", "name": "GLOBUS BANK"},
    {"code": "NR0023", "name": "JUBILEE LIFE"},
    {"code": "NR0024", "name": "PATRICK GOLD"},
    {"code": "NR0026", "name": "Stanbic IBTC Bank"},
    {"code": "NR0027", "name": "PROVIDUS BANK"},
    {"code": "NR0028", "name": "FIRST CITY MONUMENT BANK"},
    {"code": "NR0029", "name": "PURPLEMONEY MFB"},
    {"code": "NR0030", "name": "BC KASH MFB"},
    {"code": "NR0032", "name": "XSLNCE MICROFINANCE BANK"},
    {"code": "NR0034", "name": "REGENT MFB"},
    {"code": "NR0036", "name": "MONEYTRUST MFB"},
    {"code": "NR0037", "name": "FIDELITY BANK PLC"},
    {"code": "NR0040", "name": "POLARIS BANK"},
    {"code": "NR0042", "name": "AG MORTGAGE BANK PLC"},
    {"code": "NR0043", "name": "INNOVECTIVES KESH"},
    {"code": "NR0044", "name": "RAND MERCHANT BANK"},
    {"code": "NR0048", "name": "AB MICROFINANCE BANK"},
    {"code": "NR0049", "name": "LAVENDER MICROFINANCE BANK"},
    {"code": "NR0050", "name": "VIRTUE MFB"},
    {"code": "NR0052", "name": "TRUSTFUND MICROFINANCE BANK"},
    {"code": "NR0054", "name": "E-BARCS MFB"},
    {"code": "NR0055", "name": "FFS MICROFINANCE BANK"},
    {"code": "NR0056", "name": "PRESTIGE MICROFINANCE BANK"},
    {"code": "NR0057", "name": "CEMCS MFB"},
    {"code": "NR0059", "name": "CREDIT AFRIQUE MFB"},
    {"code": "NR0060", "name": "GLORY MFB"},
    {"code": "NR0061", "name": "FUTO MFB"},
    {"code": "NR0062", "name": "IKIRE MFB"},
    {"code": "NR0063", "name": "TITAN TRUST BANK"},
    {"code": "NR0064", "name": "SUNTRUST BANK"},
    {"code": "NR0065", "name": "QUICKFUND MICROFINANCE BANK"},
    {"code": "NR0066", "name": "CHIKUM MICROFINANCE BANK"},
    {"code": "NR0067", "name": "STELLAS MICROFINANCE BANK"},
    {"code": "NR0068", "name": "CONPRO MICROFINANCE BANK"},
    {"code": "NR0069", "name": "ABOVE ONLY MICROFINANCE BANK"},
    {"code": "NR0071", "name": "CIT MICROFINANCE BANK"},
    {"code": "NR0073", "name": "FULL RANGE MFB"},
    {"code": "NR0076", "name": "YES MFB"},
    {"code": "NR0077", "name": "APEKS MICROFINANCE BANK"},
    {"code": "NR0078", "name": "AUCHI MICROFINANCE BANK"},
    {"code": "NR0079", "name": "BOWEN MFB"},
    {"code": "NR0081", "name": "IRL MICROFINANCE BANK"},
    {"code": "NR0082", "name": "TRIDENT MICROFINANCE BANK"},
    {"code": "NR0083", "name": "ADEYEMI COLLEGE STAFF MICROFINANCE BANK"},
    {"code": "NR0085", "name": "ECOBANK NIGERIA PLC"},
    {"code": "NR0090", "name": "ZENITH BANK"},
    {"code": "NR0091", "name": "FCT MFB"},
    {"code": "NR0093", "name": "INFINITY MFB"},
    {"code": "NR0094", "name": "EAGLE FLIGHT MFB"},
    {"code": "NR0096", "name": "PAGA"},
    {"code": "NR0098", "name": "OMIYE MFB"},
    {"code": "NR0099", "name": "AFEKHAFE MFB"},
    {"code": "NR0100", "name": "MAINSTREET MFB"},
    {"code": "NR0101", "name": "ASTRAPOLARIS MFB"},
    {"code": "NR0103", "name": "KUDA MICROFINANCE BANK"},
    {"code": "NR0104", "name": "FEDERALPOLY NASARAWAMFB"},
    {"code": "NR0105", "name": "LAPO MFB"},
    {"code": "NR0106", "name": "GREENBANK MFB"},
    {"code": "NR0107", "name": "KONTAGORA MFB"},
    {"code": "NR0109", "name": "RUBIES MFB"},
    {"code": "NR0110", "name": "ALERT MFB"},
    {"code": "NR0111", "name": "BOSAK MFB"},
    {"code": "NR0112", "name": "FSDH"},
    {"code": "NR0113", "name": "FAST MFB"},
    {"code": "NR0114", "name": "IBILE MICROFINANCE BANK"},
    {"code": "NR0115", "name": "MEGAPRAISE MICROFINANCE BANK"},
    {"code": "NR0117", "name": "NNEW WOMEN MFB"},
    {"code": "NR0118", "name": "ADDOSSER MFB"},
    {"code": "NR0119", "name": "MINT-FINEX MFB"},
    {"code": "NR0120", "name": "ARISE MFB"},
    {"code": "NR0121", "name": "OKPOGA MFB"},
    {"code": "NR0122", "name": "SPARKLE MICROFINANCE BANK"},
    {"code": "NR0123", "name": "ASSET MATRIX"},
    {"code": "NR0124", "name": "ESO-E MICROFINANCE BANK"},
    {"code": "NR0125", "name": "DAYLIGHT MICROFINANCE BANK"},
    {"code": "NR0126", "name": "FIRST OPTION MFB"},
    {"code": "NR0128", "name": "PETRA MICROFINANCE BANK"},
    {"code": "NR0129", "name": "SAFE HAVEN MFB"},
    {"code": "NR0131", "name": "PILLAR MFB"},
    {"code": "NR0132", "name": "ALPHAKAPITAL MFB"},
    {"code": "NR0133", "name": "MUTUAL TRUST MICROFINANCE BANK"},
    {"code": "NR0135", "name": "TAJ BANK"},
    {"code": "NR0137", "name": "JAIZ BANK"},
    {"code": "NR0139", "name": "GROOMING MICROFINANCE BANK"},
    {"code": "NR0140", "name": "OPAY (PAYCOM)"},
    {"code": "NR0141", "name": "PENNYWISE MICROFINANCE BANK"},
    {"code": "NR0143", "name": "NIRSAL NATIONAL MICROFINANCE BANK"},
    {"code": "NR0144", "name": "ABU MICROFINANCE BANK"},
    {"code": "NR0145", "name": "RENMONEY MICROFINANCE BANK"},
    {"code": "NR0148", "name": "TCF"},
    {"code": "NR0149", "name": "BAINES CREDIT MFB"},
    {"code": "NR0151", "name": "ECOBANK XPRESS ACCOUNT"},
    {"code": "NR0152", "name": "EKONDO MICROFINANCE BANK"},
    {"code": "NR0153", "name": "TEASY MOBILE"},
    {"code": "NR0156", "name": "FIRSTMONIE WALLET"},
    {"code": "NR0157", "name": "COVENANT MICROFINANCE BANK"},
    {"code": "NR0158", "name": "ACCESSMONEY"},
    {"code": "NR0159", "name": "SAGAMU MICROFINANCE BANK"},
    {"code": "NR0160", "name": "SEED CAPITAL MICROFINANCE BANK"},
    {"code": "NR0161", "name": "ACCESS BANK PLC"},
    {"code": "NR0163", "name": "BALOGUN GAMBARI MFB"},
    {"code": "NR0164", "name": "NEWDAWN MICROFINANCE BANK"},
    {"code": "NR0165", "name": "HERITAGE BANK"},
    {"code": "NR0166", "name": "WEMA BANK PLC"},
    {"code": "NR0167", "name": "PAYSTACK PAYMENT LIMITED"},
    {"code": "NR0171", "name": "FLUTTERWAVE TECHNOLOGY SOLUTIONS LIMITED"},
    {"code": "NR0173", "name": "PAYATTITUDE ONLINE"},
    {"code": "NR0174", "name": "FINATRUST MICROFINANCE BANK"},
    {"code": "NR0175", "name": "FORTIS MICROFINANCE BANK"},
    {"code": "NR0176", "name": "AMML MICROFINANCE BANK"},
    {"code": "NR0177", "name": "MICROVIS MFB"},
    {"code": "NR0178", "name": "EMPIRE TRUST MFB"},
    {"code": "NR0179", "name": "OHAFIA MFB"},
    {"code": "NR0181", "name": "HEDONMARK"},
    {"code": "NR0182", "name": "FORTIS MOBILE"},
    {"code": "NR0183", "name": "FIDELITY MOBILE"},
    {"code": "NR0184", "name": "ZENITH MOBILE"},
    {"code": "NR0185", "name": "MONEYBOX"},
    {"code": "NR0186", "name": "ZINTERNET - KONGAPAY"},
    {"code": "NR0189", "name": "UNION BANK OF NIGERIA PLC"},
    {"code": "NR0190", "name": "CONSUMER MFB"},
    {"code": "NR0193", "name": "FIRST BANK OF NIGERIA PLC"},
    {"code": "NR0195", "name": "AL-BARKAH MFB"},
    {"code": "NR0196", "name": "ACCION MFB"},
    {"code": "NR0197", "name": "ALLWORKERS MFB"},
    {"code": "NR0198", "name": "RICHWAY MFB"},
    {"code": "NR0199", "name": "IMO MICROFINANCE BANK"},
    {"code": "NR0200", "name": "PECAN TRUST MICROFINANCE BANK"},
    {"code": "NR0201", "name": "ALEKUN MICROFINANCE BANK"},
    {"code": "NR0202", "name": "ROYAL EXCHANGE MFB"},
    {"code": "NR0203", "name": "PERSONAL TRUST MFB"},
    {"code": "NR0204", "name": "MICROCRED MICROFINANCE BANK"},
    {"code": "NR0205", "name": "VISA MICROFINANCE BANK"},
    {"code": "NR0206", "name": "KEYSTONE BANK PLC"},
    {"code": "NR0209", "name": "STANDARD CHARTERED BANK PLC"},
    {"code": "NR0210", "name": "FCMB EASY ACCOUNT"},
    {"code": "NR0212", "name": "NOVA MERCHANT BANK"},
    {"code": "NR0213", "name": "PALMPAY"},
    {"code": "NR0215", "name": "GOWANS MFB"},
    {"code": "NR0216", "name": "TRUSTBANC J6 MICROFINANCE BANK LIMITED"},
    {"code": "NR0217", "name": "CITI BANK"},
    {"code": "NR0218", "name": "WETLAND MFB"},
    {"code": "NR0220", "name": "FIDFUND MFB"},
    {"code": "NR0222", "name": "MONIEPOINT MICROFINANCE BANK"},
    {"code": "NR0223", "name": "9 PAYMENT SOLUTIONS BANK"},
    {"code": "NR0224", "name": "BIPC MICROFINANCE BANK"},
    {"code": "NR0225", "name": "CASHCONNECT MICROFINANCE BANK"},
    {"code": "NR0226", "name": "CHAMS MOBILE"},
    {"code": "NR0227", "name": "COASTLINE MICROFINANCE BANK"},
    {"code": "NR0228", "name": "CORESTEP MICROFINANCE BANK"},
    {"code": "NR0229", "name": "DAVODANI MICROFINANCE BANK"},
    {"code": "NR0231", "name": "ECOMOBILE"},
    {"code": "NR0232", "name": "EK-RELIABLE MICROFINANCE BANK"},
    {"code": "NR0233", "name": "ENTERPRISE BANK"},
    {"code": "NR0234", "name": "EVERGREEN MICROFINANCE BANK"},
    {"code": "NR0235", "name": "Eyowo"},
    {"code": "NR0236", "name": "FINCA MICROFINANCE BANK"},
    {"code": "NR0237", "name": "FIRMUS MICROFINANCE BANK"},
    {"code": "NR0238", "name": "FIRST TRUST MORTGAGE BANK PLC"},
    {"code": "NR0239", "name": "GTI MICROFINANCE BANK"},
    {"code": "NR0240", "name": "HEADWAY MICROFINANCE BANK"},
    {"code": "NR0241", "name": "IKENNE MICROFINANCE BANK"},
    {"code": "NR0242", "name": "ILISAN MICROFINANCE BANK"},
    {"code": "NR0244", "name": "INTERLAND MICROFINANCE BANK"},
    {"code": "NR0245", "name": "ISALEOYO MICROFINANCE BANK"},
    {"code": "NR0247", "name": "LEGEND MICROFINANCE BANK"},
    {"code": "NR0248", "name": "Letshego MFB"},
    {"code": "NR0249", "name": "MANNY MICROFINANCE BANK"},
    {"code": "NR0250", "name": "MAYFAIR MICROFINANCE BANK"},
    {"code": "NR0251", "name": "MAYFRESH MORTGAGE BANK"},
    {"code": "NR0252", "name": "MOLUSI MICROFINANCE BANK"},
    {"code": "NR0254", "name": "MOZFIN MICROFINANCE BANK"},
    {"code": "NR0255", "name": "NEPTUNE MICROFINANCE BANK"},
    {"code": "NR0256", "name": "NEW GOLDEN PASTURES MICROFINANCE BANK"},
    {"code": "NR0257", "name": "NUTURE MICROFINANCE BANK"},
    {"code": "NR0258", "name": "NWANNEGADI MICROFINANCE BANK"},
    {"code": "NR0259", "name": "OCHE MICROFINANCE BANK"},
    {"code": "NR0262", "name": "PAGE MFBank"},
    {"code": "NR0263", "name": "PARALLEX"},
    {"code": "NR0265", "name": "REPHIDIM MICROFINANCE BANK"},
    {"code": "NR0267", "name": "SEEDVEST MICROFINANCE BANK"},
    {"code": "NR0268", "name": "STANBIC IBTC @Ease WALLET"},
    {"code": "NR0269", "name": "STERLING MOBILE"},
    {"code": "NR0270", "name": "TAGPAY"},
    {"code": "NR0271", "name": "THINK FINANCE MICROFINANCE BANK"},
    {"code": "NR0272", "name": "TRUST MICROFINANCE BANK"},
    {"code": "NR0273", "name": "U & C MICROFINANCE BANK"},
    {"code": "NR0274", "name": "UNAAB MICROFINANCE BANK"},
    {"code": "NR0275", "name": "Unical Microfinance Bank"},
    {"code": "NR0277", "name": "Unity Bank Plc"},
    {"code": "NR0278", "name": "VENTURE GARDEN NIGERIA LIMITED"},
    {"code": "NR0279", "name": "VFD microfinance bank"},
    {"code": "NR0280", "name": "YOBE MICROFINANCE BANK"},
]


def list_banks() -> List[Dict[str, str]]:
    """Return the static bank list. There is no server call for this."""
    return NIGERIAN_BANKS
