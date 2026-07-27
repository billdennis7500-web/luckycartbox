"""Curated list of the most relevant Nigerian banks — commercial + top fintech.

Keyword matching is case-insensitive and matches on substring. Brand colors are
used to render the bank "logo" (circle with initials) on the frontend.
"""

# Order matters: this defines UI priority (commercial banks first, then fintech).
POPULAR_BANK_KEYWORDS = [
    "ACCESS BANK",
    "GUARANTY TRUST",  # GTBank
    "FIRST BANK OF NIGERIA",
    "ZENITH BANK",
    "UNITED BANK FOR AFRICA",  # UBA
    "FIDELITY BANK",
    "UNION BANK",
    "ECOBANK",
    "STANBIC IBTC",
    "STERLING BANK",
    "WEMA BANK",
    "POLARIS BANK",
    "FIRST CITY MONUMENT",  # FCMB
    "KEYSTONE BANK",
    "HERITAGE BANK",
    "PROVIDUS BANK",
    "JAIZ BANK",
    "TITAN TRUST",
    "STANDARD CHARTERED",
    "CITIBANK",
    "UNITY BANK",
    "PARALLEX",
    "GLOBUS BANK",
    "CORONATION",
    "SUNTRUST",
    "OPTIMUS BANK",
    # Fintech / neobanks
    "KUDA",
    "OPAY",
    "PALMPAY",
    "MONIEPOINT",
    "VFD",
    "RUBIES",
    "SPARKLE",
    "CARBON",
    "FAIRMONEY",
]


BRAND = {
    "ACCESS BANK": ("AC", "#F04E23", "#FFFFFF"),
    "GUARANTY TRUST": ("GT", "#DE1F26", "#FFFFFF"),
    "FIRST BANK": ("FB", "#00285D", "#FFFFFF"),
    "ZENITH BANK": ("ZE", "#EB1C24", "#FFFFFF"),
    "UBA": ("UB", "#D3212C", "#FFFFFF"),
    "UNITED BANK FOR AFRICA": ("UB", "#D3212C", "#FFFFFF"),
    "FIDELITY BANK": ("FD", "#00A65A", "#FFFFFF"),
    "UNION BANK": ("UN", "#004C97", "#FFFFFF"),
    "ECOBANK": ("EB", "#0055A5", "#FFFFFF"),
    "STANBIC IBTC": ("SI", "#0033A0", "#FFFFFF"),
    "STERLING BANK": ("ST", "#DA231F", "#FFFFFF"),
    "WEMA BANK": ("WM", "#752F8A", "#FFFFFF"),
    "POLARIS BANK": ("PL", "#7B287E", "#FFFFFF"),
    "FIRST CITY MONUMENT": ("FC", "#4E1F73", "#FFFFFF"),
    "FCMB": ("FC", "#4E1F73", "#FFFFFF"),
    "KEYSTONE BANK": ("KS", "#004990", "#FFFFFF"),
    "HERITAGE BANK": ("HB", "#008E4A", "#FFFFFF"),
    "PROVIDUS BANK": ("PV", "#F27F1D", "#FFFFFF"),
    "JAIZ BANK": ("JZ", "#005F3C", "#FFFFFF"),
    "TITAN TRUST": ("TT", "#0072BC", "#FFFFFF"),
    "STANDARD CHARTERED": ("SC", "#0473EA", "#FFFFFF"),
    "CITIBANK": ("CT", "#003B70", "#FFFFFF"),
    "UNITY BANK": ("UT", "#00A551", "#FFFFFF"),
    "PARALLEX": ("PX", "#D71920", "#FFFFFF"),
    "GLOBUS BANK": ("GB", "#F58220", "#FFFFFF"),
    "CORONATION": ("CO", "#941F2A", "#FFFFFF"),
    "SUNTRUST": ("SU", "#F58220", "#FFFFFF"),
    "OPTIMUS BANK": ("OP", "#1D3E7C", "#FFFFFF"),
    "KUDA": ("KU", "#40196D", "#FFFFFF"),
    "OPAY": ("OP", "#1CCB4A", "#FFFFFF"),
    "PALMPAY": ("PP", "#5F259F", "#FFFFFF"),
    "MONIEPOINT": ("MP", "#0F52BA", "#FFFFFF"),
    "VFD": ("VF", "#122745", "#FFFFFF"),
    "RUBIES": ("RB", "#0F1B2E", "#FFFFFF"),
    "SPARKLE": ("SP", "#F09E1F", "#FFFFFF"),
    "CARBON": ("CB", "#000000", "#FFFFFF"),
    "FAIRMONEY": ("FM", "#00C48C", "#FFFFFF"),
}

DEFAULT_BRAND = ("BK", "#0055FF", "#FFFFFF")


def match_brand(bank_name: str):
    up = (bank_name or "").upper()
    for keyword, (initials, bg, fg) in BRAND.items():
        if keyword in up:
            return {"initials": initials, "bg": bg, "fg": fg}
    return {"initials": DEFAULT_BRAND[0], "bg": DEFAULT_BRAND[1], "fg": DEFAULT_BRAND[2]}


def filter_popular(banks: list) -> list:
    """Return only the popular Nigerian banks, in defined priority order, with brand metadata attached."""
    out = []
    seen_codes = set()
    for keyword in POPULAR_BANK_KEYWORDS:
        for bank in banks:
            code = bank.get("bankCode")
            name = (bank.get("bankName") or "").upper()
            if code in seen_codes:
                continue
            if keyword in name:
                seen_codes.add(code)
                brand = match_brand(bank.get("bankName"))
                out.append({**bank, "brand": brand})
                break  # take first match per keyword
    return out
