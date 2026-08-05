"""Generate 4 more branded flyers for Luckycart Box.

  05 — Referral 3-tier commissions (15% / 3% / 2%)
  06 — How to Deposit (5-step tutorial)
  07 — How to Withdraw (5-step tutorial)
  08 — Daily Bonus Drop (auto coupon system)
"""
import asyncio, base64, os
from pathlib import Path
from dotenv import load_dotenv

load_dotenv("/app/backend/.env")
for k in ("HTTPS_PROXY", "HTTP_PROXY", "https_proxy", "http_proxy"):
    os.environ.pop(k, None)

from emergentintegrations.llm.chat import LlmChat, UserMessage  # noqa: E402

OUTPUT_DIR = Path("/app/generated_flyers")
OUTPUT_DIR.mkdir(exist_ok=True)


COMMON = """
STYLE (critical, do NOT deviate):
- PORTRAIT 2:3 (phone-story friendly, WhatsApp/IG story format).
- Deep black background (#0B0906) with subtle top-right gold radial glow.
- Palette: gold (#F5C518) + warm gold (#FFE580) + emerald (#10B981).
  NO purple, NO violet, NO neon. NO stock photos of people.
- Bold sans-serif, high-contrast poster / infographic look.
- Gold hairline-dashed accents at very top and very bottom.
- Brand mark: "LUCKYCART BOX" in gold caps at bottom.
- All text CRISP + spelled EXACTLY as specified.
"""


FLYERS = [
    # ==================================================================
    {
        "id": "05_referral_commissions",
        "session": "flyer-commissions-01",
        "prompt": f"""
Create a PORTRAIT promotional flyer for a Nigerian investment app called "LUCKYCART BOX".

{COMMON}

TOP:
- Small gold pill: "3-GENERATION REFERRAL"
- Hero (2 lines, huge): "GET PAID ON EVERY / FRIEND YOU BRING."
  ("EVERY FRIEND" in bright gold).
- Sub: "Earn passive naira across THREE generations — every time your invitees, and their invitees, invest in a box."

MIDDLE — A PYRAMID or 3-tiered stack diagram showing the flow YOU → Gen1 → Gen2 → Gen3 with commission %:

Tier 1 (TOP, biggest, bright gold outline):
  "GENERATION 1" — badge label
  "15% COMMISSION"  ← in giant bright gold text
  "Every direct friend you invite. When they buy a box, you earn 15%
   of their purchase — instantly credited to your wallet."
  small user icon

Tier 2 (MIDDLE, medium, emerald outline):
  "GENERATION 2"
  "3% COMMISSION"
  "Every friend YOUR friend invites. Passive earnings from your extended team."

Tier 3 (BOTTOM, smaller, gold-warm outline):
  "GENERATION 3"
  "2% COMMISSION"
  "Every friend of a friend of a friend. Your network keeps paying you."

Also show a small worked example box below the pyramid:
  "EXAMPLE: A ₦100,000 box purchase
   → Gen 1 earns ₦15,000
   → Gen 2 earns ₦3,000
   → Gen 3 earns ₦2,000
   = ₦20,000 total paid out to the network per box."

BOTTOM:
- Trumpet banner: "One invite. Three streams of passive naira. Forever."
- 3 mini pills: "INSTANT · AUTOMATIC · LIFETIME"
- Brand mark: "LUCKYCART BOX — Your Network. Your Net Worth."
""",
    },

    # ==================================================================
    {
        "id": "06_how_to_deposit",
        "session": "flyer-deposit-01",
        "prompt": f"""
Create a PORTRAIT tutorial-style flyer for a Nigerian investment app called "LUCKYCART BOX".

{COMMON}

TOP:
- Small gold pill: "STEP-BY-STEP GUIDE"
- Hero (2 lines): "HOW TO DEPOSIT / IN 5 EASY STEPS."
  ("5 EASY STEPS" in bright gold).
- Sub: "Funding your wallet takes under a minute. Instant Pay via 4 secure gateways or bank transfer."

MIDDLE — 5 numbered horizontal cards stacked vertically. Each has a bold
gold numbered circle on the LEFT (1, 2, 3, 4, 5) and heading + short body
+ small icon on the RIGHT.

Step 1 [icon: log-in]:
  TITLE: "TAP THE 'DEPOSIT' BUTTON"
  Body: "From your dashboard, tap the gold Deposit button. Choose Instant Pay to auto-fund via a gateway, or select a manual bank transfer."

Step 2 [icon: naira sign / calculator]:
  TITLE: "ENTER AMOUNT (MIN ₦3,000)"
  Body: "Type any amount from ₦3,000 upwards, or tap a quick-amount chip (₦3,000, ₦5,000, ₦10,000, ₦20,000…)."

Step 3 [icon: 4 dots / gateway]:
  TITLE: "PICK A GATEWAY"
  Body: "Choose from PayNow, SHPAY, 1SSPay, or JuntPay — the app auto-picks the most reliable one for you if the first fails."

Step 4 [icon: shield-check]:
  TITLE: "PAY VIA YOUR BANK APP"
  Body: "You're redirected to a secure encrypted payment page. Pay via bank transfer, USSD, or any Nigerian bank app — instant confirmation."

Step 5 [icon: wallet with checkmark]:
  TITLE: "WALLET CREDITED INSTANTLY"
  Body: "Your funds land in your Luckycart Box wallet in seconds. You're ready to activate boxes and start earning 15% daily."

BOTTOM:
- Gold callout banner: "✓ 24/7 available · ✓ Bank-grade encryption · ✓ Zero deposit fees"
- Brand mark: "LUCKYCART BOX — Fund. Grow. Repeat."
""",
    },

    # ==================================================================
    {
        "id": "07_how_to_withdraw",
        "session": "flyer-withdraw-01",
        "prompt": f"""
Create a PORTRAIT tutorial-style flyer for a Nigerian investment app called "LUCKYCART BOX".

{COMMON}

TOP:
- Small gold pill: "STEP-BY-STEP GUIDE"
- Hero (2 lines): "HOW TO WITHDRAW / TO YOUR BANK."
  ("YOUR BANK" in bright gold).
- Sub: "Cash out to any Nigerian bank in under 5 minutes. Automatic. Secure. Direct to your account."

MIDDLE — 5 numbered horizontal cards stacked vertically. Each has a bold
gold numbered circle on the LEFT and heading + short body + small icon.

Step 1 [icon: bank]:
  TITLE: "BIND YOUR BANK ACCOUNT (ONE-TIME)"
  Body: "From your profile, add your Nigerian bank account. Pick your bank from 812+ supported banks. Instant account-name verification."

Step 2 [icon: withdraw arrow]:
  TITLE: "TAP 'WITHDRAW' ON DASHBOARD"
  Body: "Head to your wallet and tap the gold Withdraw button anytime between 10am–5pm WAT (window may vary — check the app)."

Step 3 [icon: naira sign]:
  TITLE: "ENTER AMOUNT (MIN ₦450)"
  Body: "Type any amount from ₦450 upwards. A small 12% network fee applies — you'll see the exact net amount before confirming."

Step 4 [icon: check-circle]:
  TITLE: "CONFIRM & DISPATCH"
  Body: "Tap Confirm. The system auto-routes your payout across our 4 payment gateways for the fastest, most reliable execution."

Step 5 [icon: money-in-bank]:
  TITLE: "MONEY IN YOUR BANK — INSTANTLY"
  Body: "Funds hit your bank account within minutes. Get an SMS from your bank. Withdrawal completed. No admin delay."

BOTTOM:
- Gold callout banner: "MIN WITHDRAWAL: ₦450 · FEE: 12% · WINDOW: 10AM–5PM WAT"
- 3 trust pills: "AUTOMATED · SECURE · INSTANT"
- Brand mark: "LUCKYCART BOX — Cash Out Anytime, To Any Bank."
""",
    },

    # ==================================================================
    {
        "id": "08_daily_bonus",
        "session": "flyer-daily-bonus-01",
        "prompt": f"""
Create a PORTRAIT promotional flyer for a Nigerian investment app called "LUCKYCART BOX".

{COMMON}

TOP:
- Small gold pill: "DAILY BONUS DROP"
- Hero (2 lines): "FREE ₦50 EVERY DAY. / JUST FOR LOGGING IN."
  ("₦50 EVERY DAY" in giant bright gold).
- Sub: "We drop a fresh bonus coupon every day at 5:10pm WAT. First 50 members to grab it win. Are you on the list?"

MIDDLE — A giant central circular gold coupon graphic in the middle with:
  "LUCKY" prefix
  "₦50" in bright gold caps
  "DAILY DROP" subtitle
  "Redeem in-app before the daily reset"
  Small clock icon showing "5:10 PM WAT"

Below the coupon, 3 small support cards:

Card 1 [icon: alarm-clock]:
  "AUTO-GENERATED DAILY"
  "A new coupon spawns automatically at 5:10 PM WAT — no admin action needed."

Card 2 [icon: race / lightning]:
  "FIRST 50 WIN"
  "Only the first 50 members to redeem win. Fastest hands, biggest stack."

Card 3 [icon: piggy-bank]:
  "STACKS ON YOUR EARNINGS"
  "Every ₦50 goes straight to your wallet — combine with daily profits, referral commissions, and milestone bonuses."

BOTTOM:
- Trumpet banner: "Show up daily. Get paid daily. That's the Luckycart Box way."
- 3 mini pills: "FREE · DAILY · AUTOMATIC"
- Brand mark: "LUCKYCART BOX — Rewards That Never Sleep."
""",
    },
]


async def gen(cfg):
    api_key = os.getenv("EMERGENT_LLM_KEY")
    chat = LlmChat(api_key=api_key, session_id=cfg["session"],
                   system_message="You are an award-winning graphic designer producing production-ready branded marketing flyers.")
    chat.with_model("gemini", "gemini-3.1-flash-image-preview").with_params(modalities=["image", "text"])
    text, images = await chat.send_message_multimodal_response(UserMessage(text=cfg["prompt"]))
    name = f"luckycart_{cfg['id']}"
    if not images:
        print(f"[{name}] NO IMAGES — text: {text[:180]}")
        return None
    path = OUTPUT_DIR / f"{name}.png"
    with open(path, "wb") as f:
        f.write(base64.b64decode(images[0]["data"]))
    print(f"[{name}] {path.stat().st_size / 1024:.1f} KB → {path}")
    return path


async def main():
    print("Generating 4 flyers in parallel via Gemini Nano Banana…")
    results = await asyncio.gather(*[gen(f) for f in FLYERS])
    for r in results:
        if r: print("  ✓", r)


if __name__ == "__main__":
    asyncio.run(main())
