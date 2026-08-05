"""Regenerate the Earnings flyer with the daily naira amount per box."""
import asyncio
import base64
import os
from pathlib import Path
from dotenv import load_dotenv

load_dotenv("/app/backend/.env")
for k in ("HTTPS_PROXY", "HTTP_PROXY", "https_proxy", "http_proxy"):
    os.environ.pop(k, None)

from emergentintegrations.llm.chat import LlmChat, UserMessage  # noqa: E402

OUTPUT_DIR = Path("/app/generated_flyers")

PROMPT = """
Create a PORTRAIT promotional flyer (2:3 vertical) for a Nigerian investment
app called "LUCKYCART BOX".

STYLE (critical):
- Deep black background (#0B0906) with subtle top-right gold radial glow.
- Palette: gold (#F5C518) + warm gold light (#FFE580) + emerald (#10B981) as
  the ONLY colored accent. NO purple, NO violet, NO neon.
- Modern high-contrast poster / infographic feel.
- Gold hairline-dashed accents at the very top and very bottom.
- All text crisp and readable on a phone.

TOP:
- Small gold pill chip: "DAILY EARNINGS ENGINE"
- Hero (2 lines, huge): "EARN 15% DAILY" / "FOR UP TO 95 DAYS."
  ("15% DAILY" and "95 DAYS" in bright gold).
- Subtitle: "Every box pays you EVERY DAY. Pick your tier, watch daily naira roll into your wallet."

MIDDLE — Show EXACTLY 7 rounded gold-outlined tier cards in a 4-row layout:
  Row 1: LUCKY CART              | LUCKY CART EXCLUSIVE
  Row 2: LUCKYCART EXCHANGE      | LUCKYCART MYSTERY
  Row 3: LUCKYCART BOX           | LUCKYCART TREASURES [PREMIUM]
  Row 4: (single centered card)  LUCKYCART MUSEUM [PREMIUM]

DO NOT SKIP any tier. All 7 MUST appear. LUCKYCART EXCHANGE (₦20,000) is
between EXCLUSIVE and MYSTERY — do NOT omit it.

ONLY Treasures (₦150K) and Museum (₦200K) are PREMIUM. LUCKYCART BOX
(₦100K) is NOT premium — do not add PREMIUM badge to it.

Each card MUST show, in this EXACT order top-to-bottom:
1) A small gold box icon + tier name in gold caps.
2) The stake amount in big white bold: ₦STAKE.
3) Two small pills side by side: "15%/day" and "90d" (or "95 days" for Treasures/Museum).
4) A subtle divider line.
5) "Daily payout: ₦DAILY" (₦DAILY in emerald green bold).
6) A gold-filled pill: "Total return: ₦TOTAL".

The 7 tier values, exact as follows (do NOT change any number):

  LUCKY CART              — ₦3,000    — 15%/day — 90d   — Daily ₦450     — Total ₦40,500
  LUCKY CART EXCLUSIVE    — ₦5,000    — 15%/day — 90d   — Daily ₦750     — Total ₦67,500
  LUCKYCART EXCHANGE      — ₦20,000   — 15%/day — 90d   — Daily ₦3,000   — Total ₦270,000
  LUCKYCART MYSTERY       — ₦50,000   — 15%/day — 90d   — Daily ₦7,500   — Total ₦675,000
  LUCKYCART BOX           — ₦100,000  — 15%/day — 90d   — Daily ₦15,000  — Total ₦1,350,000
  LUCKYCART TREASURES     — ₦150,000  — 15%/day — 95d   — Daily ₦22,500  — Total ₦2,137,500  (PREMIUM badge)
  LUCKYCART MUSEUM        — ₦200,000  — 15%/day — 95d   — Daily ₦30,000  — Total ₦2,850,000  (PREMIUM badge)

VERIFY before rendering: is LUCKY CART EXCLUSIVE's "Daily payout" ₦750?
(It is — ₦5,000 × 15% = ₦750/day. Not ₦3,000.)
VERIFY LUCKYCART EXCHANGE is present with ₦20,000 stake and ₦3,000 daily.
VERIFY only Treasures and Museum have PREMIUM badge.

BOTTOM:
- Banner: "Compound smart. Cashflow daily. Cash out anytime."
- 3 trust pills: "SECURE PAYOUTS · 4 GATEWAYS · INSTANT WITHDRAWALS"
- Brand mark: "LUCKYCART BOX — Boxes That Pay Every Day."
"""


async def main():
    api_key = os.getenv("EMERGENT_LLM_KEY")
    chat = LlmChat(api_key=api_key, session_id="flyer-earnings-v4",
                   system_message="You are an award-winning graphic designer producing production-ready branded marketing flyers.")
    chat.with_model("gemini", "gemini-3.1-flash-image-preview").with_params(modalities=["image", "text"])
    text, images = await chat.send_message_multimodal_response(UserMessage(text=PROMPT))
    if not images:
        print("NO IMAGES — text:", text[:200])
        return
    path = OUTPUT_DIR / "luckycart_02_earnings.png"
    with open(path, "wb") as f:
        f.write(base64.b64decode(images[0]["data"]))
    print(f"SAVED → {path}  ({path.stat().st_size / 1024:.1f} KB)")


if __name__ == "__main__":
    asyncio.run(main())
