"""Generate a full set of branded flyers for Luckycart Box using
Gemini Nano Banana. Portrait format (2:3, WhatsApp/IG story friendly).

Covers all platform benefits with the CORRECT product data:
  - Box tiers ₦3K – ₦200K
  - 15% daily profit
  - 90-day cycle (regular boxes) OR 95-day cycle (premium)
  - ₦1,000 welcome bonus
  - 5-tier referral rewards up to ₦72,500 stacked
  - 4 payment gateways for instant deposits & withdrawals
"""
import asyncio
import base64
import os
from pathlib import Path
from dotenv import load_dotenv

load_dotenv("/app/backend/.env")
# Kill proxy vars — LLM egress must be direct, not via IPRoyal.
for k in ("HTTPS_PROXY", "HTTP_PROXY", "https_proxy", "http_proxy"):
    os.environ.pop(k, None)

from emergentintegrations.llm.chat import LlmChat, UserMessage  # noqa: E402

OUTPUT_DIR = Path("/app/generated_flyers")
OUTPUT_DIR.mkdir(exist_ok=True)


COMMON_STYLE = """
STYLE (critical, do not deviate):
- PORTRAIT 2:3 aspect ratio (~1080x1620 phone-story friendly).
- Deep black background (#0B0906) with subtle top-right gold radial glow.
- Palette: gold (#F5C518) + warm gold light (#FFE580) + emerald (#10B981) as
  the ONLY colored accent. NO purple, NO violet, NO neon.
- Modern high-contrast poster / infographic feel.
- Small gold pill chip at the very top with the section label.
- Bold sans-serif hero headline in two lines (mix of white + gold).
- Gold hairline-dashed accents at the very top and very bottom of the poster.
- Brand mark line at the bottom: "LUCKYCART BOX" in gold caps.
- All text must be crisp, high-contrast, readable at phone-screen size.
- No stock people photos, no random icons — geometric badges and clean
  symbols only.
"""


FLYERS = [
    {
        "id": "01_playbook",
        "session": "flyer-playbook-v2",
        "prompt": f"""
Create a PORTRAIT promotional flyer for a Nigerian investment app called "LUCKYCART BOX".

{COMMON_STYLE}

TOP:
- Gold pill chip: "THE PLAYBOOK"
- Hero (3 lines): "HOW TO TURN" / "LUCKYCART BOX" (in gold) / "INTO YOUR DAILY NAIRA MACHINE"
- Sub: "3 core habits to turn your box into daily naira cash flow — this is a 90 to 95-day compounding business, not a get-rich-quick play."

MIDDLE — 3 numbered gold-medallion pillar cards stacked vertically:
1) COMPOUND DAILY OVER 90-95 DAYS — accent gold.
   Body: "Every box pays 15% daily for 90 days (or 95 days on premium tiers). Small daily drops snowball into serious naira compounded over the full cycle."
   Small icon: trending-up chart.
2) SHOW UP DAILY — accent emerald.
   Body: "Log in daily, claim your Daily Bonus Drop, and check the Marketplace. Just 5 minutes a day. Consistent action separates a hobby from a business."
   Small icon: calendar.
3) BUILD YOUR TEAM — accent gold (warm).
   Body: "Share your referral link. Earn 3-tier commissions on every friend PLUS stack up to ₦72,500 in milestone bonuses. Your network becomes your net worth."
   Small icon: users/people.

BOTTOM:
- Banner: "Real earnings aren't built on a single lucky day — but on 90 days of daily discipline."
- 4 mini pills: "LOW RISK · DAILY DISCIPLINE · TEAM LEVERAGE · REAL RESULTS"
- Brand mark: "LUCKYCART BOX — Real people. Real earnings."
""",
    },
    {
        "id": "02_earnings",
        "session": "flyer-earnings-v2",
        "prompt": f"""
Create a PORTRAIT promotional flyer for a Nigerian investment app called "LUCKYCART BOX".

{COMMON_STYLE}

TOP:
- Gold pill chip: "DAILY EARNINGS ENGINE"
- Hero (2 lines): "EARN 15% DAILY" / "FOR UP TO 95 DAYS." with the "15% DAILY" and "95 DAYS" in bright gold.
- Sub: "Pick a box, watch it pay you back every day — full 90-day cycle for regular boxes, 95-day cycle for premium."

MIDDLE — Grid of 7 box tiers, each a rounded gold-outlined card with a small box icon, tier name, price, and expected total return over the full cycle:
- LUCKY CART — ₦3,000 stake — 90 days × 15% = ₦40,500 total
- LUCKY CART EXCLUSIVE — ₦5,000 — 90 days × 15% = ₦67,500
- LUCKYCART EXCHANGE — ₦20,000 — 90 days × 15% = ₦270,000
- LUCKYCART MYSTERY — ₦50,000 — 90 days × 15% = ₦675,000
- LUCKYCART BOX — ₦100,000 — 90 days × 15% = ₦1,350,000
- LUCKYCART TREASURES — ₦150,000 — 95 days × 15% = ₦2,137,500 (premium; mark PREMIUM)
- LUCKYCART MUSEUM — ₦200,000 — 95 days × 15% = ₦2,850,000 (premium; mark PREMIUM)

Layout 2 columns × 4 rows (last row single centered card if needed). Each card must
clearly show: tier name (gold), stake amount (white bold), daily rate ("15%/day"),
duration ("90d" or "95d" as tiny pill), and TOTAL RETURN in bright gold.

BOTTOM:
- Banner: "Compound smart. Cashflow daily. Cash out anytime."
- 3 trust pills: "SECURE PAYOUTS · 4 GATEWAYS · INSTANT WITHDRAWALS"
- Brand mark: "LUCKYCART BOX — Boxes That Pay Every Day."
""",
    },
    {
        "id": "03_welcome",
        "session": "flyer-welcome-v2",
        "prompt": f"""
Create a PORTRAIT promotional flyer for a Nigerian investment app called "LUCKYCART BOX".

{COMMON_STYLE}

TOP:
- Gold pill chip: "NEW-MEMBER OFFER"
- Hero (2 lines): "GET ₦1,000 FREE." / "START EARNING TODAY."
  ("₦1,000 FREE" in giant bright gold letters filling half the top area).
- Sub: "Sign up in 60 seconds. Claim your welcome bonus. Buy your first box. Watch daily naira roll into your wallet for the next 90 days."

MIDDLE — 3 numbered horizontal cards, each with a gold circle number badge on left and copy on right:
1) SIGN UP — Small green check icon.
   "Register with your phone. No paperwork. Instant ₦1,000 welcome bonus credited to your wallet."
2) ACTIVATE A BOX — Small gold shopping-bag icon.
   "Grab a starter box from just ₦3,000. Every box pays 15% daily for 90 days — that's ₦40,500 in total returns on a single ₦3,000 stake."
3) CASH OUT DAILY — Small emerald bank icon.
   "Withdraw to your Nigerian bank via 4 automated gateways. No delays, no drama, instant naira in your account."

BOTTOM:
- Trumpet banner: "Sign up bonus + Daily earnings + Referral cash = Real freedom."
- Big bright gold CTA pill: "JOIN LUCKYCART BOX TODAY →"
- Brand mark: "LUCKYCART BOX — Where Naira Meets Freedom."
""",
    },
    {
        "id": "04_overview",
        "session": "flyer-overview-v2",
        "prompt": f"""
Create a PORTRAIT promotional flyer for a Nigerian investment app called "LUCKYCART BOX".

{COMMON_STYLE}

TOP:
- Gold pill chip: "WHY LUCKYCART BOX"
- Hero (3 lines): "5 REASONS" / "NIGERIANS ARE" (in white) / "WAKING UP RICHER" (in gold).
- Sub: "One app. Five ways to grow your naira. All the daily-cashflow power in your pocket."

MIDDLE — 5 rounded rectangular benefit cards, alternating gold + emerald accents, each with a bold icon on the left and clean copy on the right:

1) [icon: gold gift-box] DAILY EARNINGS ENGINE
   "Every box you buy pays you 15% every day for 90 to 95 days. Watch your wallet grow while you sleep."

2) [icon: emerald hand-cash] ₦1,000 WELCOME BONUS
   "Sign up today and we credit your wallet with ₦1,000 — free naira to spend on your first box."

3) [icon: gold users] 3-TIER REFERRALS
   "Invite friends. Get paid on every friend they refer, and every friend those friends refer. Passive network income."

4) [icon: emerald trophy] MILESTONE BONUSES
   "Unlock 5 stacking cash rewards — from ₦1,000 up to ₦72,500 pure cash — as your team grows."

5) [icon: gold shield-check] INSTANT SECURE WITHDRAWALS
   "4 payment gateways, direct to your Nigerian bank. Automated. Encrypted. No admin delay."

BOTTOM:
- Trumpet banner: "Sign up. Show up daily. Stack up cash for 90 days."
- 3 mini pills: "TRUSTED · INSTANT · REWARDING"
- Brand mark line: "LUCKYCART BOX — Nigeria's Smart Wealth Partner."
""",
    },
]


async def gen(flyer_cfg):
    api_key = os.getenv("EMERGENT_LLM_KEY")
    if not api_key:
        raise RuntimeError("EMERGENT_LLM_KEY not set")
    chat = LlmChat(api_key=api_key, session_id=flyer_cfg["session"],
                   system_message="You are an award-winning graphic designer producing production-ready branded marketing flyers.")
    chat.with_model("gemini", "gemini-3.1-flash-image-preview").with_params(modalities=["image", "text"])
    text, images = await chat.send_message_multimodal_response(UserMessage(text=flyer_cfg["prompt"]))
    name = f"luckycart_{flyer_cfg['id']}"
    if not images:
        print(f"[{name}] NO IMAGES — text: {text[:180]}")
        return None
    path = OUTPUT_DIR / f"{name}.png"
    with open(path, "wb") as f:
        f.write(base64.b64decode(images[0]["data"]))
    print(f"[{name}] {path.stat().st_size / 1024:.1f} KB → {path}")
    return path


async def main():
    # Fire all 4 in parallel to save time
    print("Generating 4 flyers via Gemini Nano Banana in parallel…")
    results = await asyncio.gather(*[gen(f) for f in FLYERS])
    print("\nGenerated:")
    for r in results:
        if r: print(" ", r)


if __name__ == "__main__":
    asyncio.run(main())
