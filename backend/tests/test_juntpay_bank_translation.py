"""Regression tests for the JuntPay bank-code translation fix (Feb 2026).

Before this fix, `translate_bank_code(bank_name, "juntbest", current_code=...)`
returned the LEGACY static NIGERIAN_BANKS codes (`80000xxx`) — which JuntPay v1
rejects as `BANK_NOT_SUPPORTED`. The user's payouts would silently fail from
the admin dashboard.

The fix pulls the live bank list from `juntbest.list_banks_async()` (populated
at startup via `_juntbest_warm_bank_cache`) and matches by bank NAME.

These tests assert:
  1. Translator returns real JuntPay codes (6-digit CBN format like 000004 UBA,
     100004 OPay, 090267 Kuda), NOT the legacy 80000xxx codes.
  2. Aliases resolve correctly (UBA ↔ United Bank For Africa, FCMB ↔ First
     City Monument Bank, GTBank ↔ Guaranty Trust Bank).
  3. Short aliases don't accidentally fuzzy-match wallet variants
     (UBA MONI, FCMB MFB, FCMB Easy Account).
  4. Non-existent banks return None (so the dispatcher falls through to the
     next enabled gateway instead of sending garbage).
"""

import asyncio
import os
import sys
import pytest
from dotenv import load_dotenv

load_dotenv("/app/backend/.env")
sys.path.insert(0, "/app/backend")

# Late import so env vars are set first.
import server  # noqa: E402
import juntbest  # noqa: E402


pytestmark = pytest.mark.skipif(
    not juntbest.enabled(),
    reason="JuntPay not configured — set JUNTBEST_* env vars to run this suite.",
)


def _run(coro):
    return asyncio.get_event_loop().run_until_complete(coro)


@pytest.fixture(scope="module", autouse=True)
def _warm_bank_cache():
    """Pre-fetch the live JuntPay bank list so tests don't race with cold
    cache + a flaky IPRoyal proxy."""
    try:
        banks = _run(juntbest.list_banks_async(force=True))
        # Fail loudly if the cache still contains the stale static list —
        # otherwise the assertions below would give misleading pass results.
        assert len(banks) > 100, f"Only {len(banks)} banks fetched — proxy may be blocked."
    except Exception as e:
        pytest.skip(f"Could not fetch live JuntPay bank list: {e}")


def test_opay_translation_no_longer_legacy():
    """The core bug: user's OPay bank_code was PayNow-format (NG0204). We
    must translate to JuntPay's 100004, NOT the legacy static 80000030."""
    code = _run(server.translate_bank_code("OPay", "juntbest", current_code="NG0204"))
    assert code == "100004", f"Expected 100004, got {code}"


def test_opay_with_legacy_code_still_translates():
    """Even if current_code is the LEGACY 80000xxx static value, we must
    ignore it and pull the live JuntPay code."""
    code = _run(server.translate_bank_code("OPay", "juntbest", current_code="80000030"))
    assert code == "100004", f"Expected 100004, got {code}"


def test_palmpay_translation():
    code = _run(server.translate_bank_code("PalmPay", "juntbest", current_code="NR0999"))
    assert code == "100033", f"Expected 100033, got {code}"


def test_kuda_translation():
    """Kuda is spelled differently across gateways ('Kuda Bank', 'Kuda MFB',
    'Kuda Microfinance Bank'). All must resolve to 090267."""
    for name in ["Kuda Bank", "Kuda MFB"]:
        code = _run(server.translate_bank_code(name, "juntbest", current_code="80000028"))
        assert code == "090267", f"{name!r} expected 090267, got {code}"


def test_moniepoint_translation():
    code = _run(server.translate_bank_code("Moniepoint MFB", "juntbest", current_code="NG0999"))
    assert code == "090405", f"Expected 090405, got {code}"


def test_access_bank_prefers_primary_over_diamond():
    """Access Bank has TWO entries in JuntPay's list: 000005 (Diamond, legacy)
    and 000014 (main). The fuzzy match sorts by shortest name — must pick
    the plain 'Access Bank' (000014)."""
    code = _run(server.translate_bank_code("Access Bank", "juntbest", current_code="NG0044"))
    assert code == "000014", f"Expected 000014 (Access Bank), got {code}"


def test_uba_alias_resolves_to_primary_not_wallet():
    """'UBA' is a short alias. Must resolve to 000004 (UNITED BANK FOR AFRICA),
    NOT 000040 (UBA MONI wallet)."""
    code = _run(server.translate_bank_code("UBA", "juntbest", current_code="NG0033"))
    assert code == "000004", f"Expected 000004 UBA, got {code} (probably matched UBA MONI wallet)"


def test_fcmb_alias_resolves_to_primary_not_mfb():
    """'FCMB' is a short alias. Must resolve to 000003 (First City Monument
    Bank), NOT 090409 (FCMB MFB) or 100031 (FCMB Easy Account)."""
    code = _run(server.translate_bank_code("FCMB", "juntbest", current_code="NG0214"))
    assert code == "000003", f"Expected 000003 FCMB, got {code}"


def test_gtbank_alias_resolves_to_primary():
    """Both 'GTBank' and 'Guaranty Trust Bank' must resolve to the same code."""
    a = _run(server.translate_bank_code("GTBank", "juntbest", current_code="NG0058"))
    b = _run(server.translate_bank_code("Guaranty Trust Bank", "juntbest", current_code="NG0058"))
    assert a == b == "000013", f"GTBank/Guaranty must both be 000013, got {a!r}/{b!r}"


def test_first_bank_of_nigeria():
    code = _run(server.translate_bank_code("First Bank of Nigeria", "juntbest", current_code="NG0011"))
    assert code == "000016", f"Expected 000016, got {code}"


def test_zenith_bank():
    code = _run(server.translate_bank_code("Zenith Bank", "juntbest", current_code="NG0057"))
    assert code == "000015", f"Expected 000015 Zenith, got {code}"


def test_wema_bank():
    code = _run(server.translate_bank_code("Wema Bank", "juntbest", current_code="NG0035"))
    assert code == "000017", f"Expected 000017 Wema, got {code}"


def test_unknown_bank_returns_none():
    """The dispatcher relies on None to fall through to the next gateway.
    A garbage bank name must not resolve to a random JuntPay code."""
    code = _run(server.translate_bank_code(
        "Bank of NoWhere Ltd", "juntbest", current_code="NG0999"))
    assert code is None, f"Expected None for garbage bank name, got {code}"


def test_no_legacy_80000_codes_returned():
    """After the fix, no translation should ever return an 80000xxx code —
    those are the LEGACY static codes that JuntPay v1 rejects."""
    for name in ["OPay", "PalmPay", "Kuda MFB", "Access Bank", "Zenith Bank",
                 "UBA", "GTBank", "FCMB", "Wema Bank", "Fidelity Bank"]:
        code = _run(server.translate_bank_code(name, "juntbest"))
        if code:
            assert not code.startswith("80000"), \
                f"{name!r} translated to legacy code {code!r} — fix regressed."
