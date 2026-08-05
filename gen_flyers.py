"""Generate two branded flyers for Luckycart Box using Gemini Nano Banana.

Flyer 1: 5-tier referral rewards showcase (adapted from LuckyPop reference)
Flyer 2: "How to build LCB into your long-term business" 3-pillar infographic

Portrait format (2:3 / 1080x1620) — sized for WhatsApp status, IG story, Telegram.
"""
import asyncio
import base64
import os
from pathlib import Path
from dotenv import load_dotenv

load_dotenv("/app/backend/.env")

# The .env sets HTTPS_PROXY (for payment gateways). Unset it here — LLM
# calls need direct egress or they hit the IPRoyal proxy which blocks
# LLM API hostnames.
for k in ("HTTPS_PROXY", "HTTP_PROXY", "https_proxy", "http_proxy"):
    os.environ.pop(k, None)

from emergentintegrations.llm.chat import LlmChat, UserMessage  # noqa: E402

OUTPUT_DIR = Path("/app/generated_flyers")
OUTPUT_DIR.mkdir(exist_ok=True)


FLYER_1_PROMPT = """
Create a premium PORTRAIT promotional flyer / poster (2:3 aspect ratio, vertical) for a Nigerian
investment app called "LUCKYCART BOX".

Style: Luxury dark theme with gold accents. Deep black background (#0B0906) with subtle radial
glows. Bold, high-contrast, poster-quality infographic. Zero purple — this brand is gold + dark.

HEADER (top ~15%):
- Small gold pill chip: "DAILY REFERRAL CASH BONUS" in tiny uppercase gold letters
- Big serif+sans hero headline: "SPREAD THE WEALTH & GET PAID."
  Split across two lines with "SPREAD THE WEALTH" in bright white and "& GET PAID." in bright gold (#F5C518).
- One-line subtitle: "5 LIVE milestone bonuses — the more friends you bring, the more free cash you unlock."

MIDDLE (5-TIER LADDER, ~60%):
Show a 5-step reward ladder / staircase, each step being a distinct hexagonal or rounded medallion
labelled with:
  Level 1 IGNITE — Invite 5 friends — ₦1,000 cash — flame icon in orange
  Level 2 ASCEND — Invite 10 friends — ₦1,500 cash — rocket icon in emerald green
  Level 3 EMPIRE — Invite 25 friends — ₦5,000 cash — trophy icon in gold
  Level 4 SOVEREIGN — Invite 50 friends — ₦15,000 cash — crown icon in royal purple
  Level 5 TITAN — Invite 100 friends — ₦50,000 cash — gem icon in cyan

Each medallion should have a small number badge (1-5) on top, the tier name in gold caps under
it, "Invite X friends" in white beneath, and a gold "₦XXX" cash reward pill at the bottom.
Ladder ascends from left/bottom to right/top OR shows as a 5-card vertical/grid stack.

MIDDLE-BOTTOM (~10%):
Gold-outlined banner card: "THE ULTIMATE WEALTH LOOP" — "All 5 tiers stack. Invite 100 friends
and pocket ₦72,500 pure cash." (small infinity ∞ icon inline).

BOTTOM (~15%):
- 3 tiny trust pills side-by-side: "100% AUTHENTIC · SECURE & SAFE · INSTANT REWARDS" each with
  a small icon (shield, lock, lightning).
- Very bottom: brand mark line "LUCKYCART BOX — Rewards That Pay Daily"

Overall look: premium marketing poster, sharp geometry, tight kerning, gold hairline dashes as
top/bottom accents, small radial glow bloom in top-right corner. NO stock photos of people.
Design must be text-safe and readable on a phone screen at 1080x1620px.
"""


FLYER_2_PROMPT = """
Create a premium PORTRAIT promotional flyer / poster (2:3 aspect ratio, vertical) for a Nigerian
investment app called "LUCKYCART BOX".

Style: Same luxury dark + gold theme as sibling flyer. Deep black background (#0B0906) with
subtle radial glows. NO purple / violet — brand is gold + dark + a single emerald accent.

HEADER (top ~15%):
- Small gold pill chip: "THE PLAYBOOK" in tiny uppercase gold letters
- Big hero headline over 3 lines:
   "HOW TO TURN"
   "LUCKYCART BOX" (in bright gold #F5C518)
   "INTO YOUR DAILY NAIRA MACHINE"
- Subtitle: "3 core habits to turn your box into daily cash flow — not a get-rich-quick play, but a real long-term business."

MIDDLE (3 PILLARS, ~65%):
Three big rectangular horizontal cards stacked vertically. Each has a large numbered gold circle
on the LEFT (bold 1, 2, 3), and a heading + short paragraph on the right.

Card 1 (accent gold #F5C518): 
  TITLE: "COMPOUND DAILY — SKIP THE GET-RICH-QUICK TRAP"
  Body: "Treat every investment as a small, low-risk cashflow move. Your daily profits compound over 30 days — small wins snowball into serious monthly returns."
  Small icon: trending-up chart

Card 2 (accent emerald #10B981):
  TITLE: "SHOW UP DAILY — BUILD THE RHYTHM"
  Body: "Log in daily, claim your Daily Bonus Drop, and check the Marketplace. Just 5 minutes a day. Consistent action separates a hobby from a business."
  Small icon: calendar

Card 3 (accent gold with warm tint):
  TITLE: "BUILD YOUR TEAM — REAL LEVERAGE"
  Body: "Share your referral link. Earn 3-tier commissions on every friend PLUS up to ₦72,500 in milestone bonuses. Your network becomes your net worth."
  Small icon: people/users

BOTTOM (~15%):
- Motivational quote banner: "Real earnings aren't built on a single lucky day, but on daily persistence."
- 4 mini pills in a row: "LOW RISK · DAILY DISCIPLINE · TEAM BUILDING · REAL RESULTS"
- Bottom mark: "LUCKYCART BOX — Real people. Real earnings."

Overall look: premium marketing infographic, poster quality. Sharp geometry, gold hairline dashes
as top/bottom accents, subtle radial glow bloom in top-right. NO stock photos of people. Text
must be crisp and readable at 1080x1620px on a phone.
"""


async def gen(prompt: str, out_name: str, session_id: str):
    api_key = os.getenv("EMERGENT_LLM_KEY")
    if not api_key:
        raise RuntimeError("EMERGENT_LLM_KEY not set in /app/backend/.env")
    chat = LlmChat(api_key=api_key, session_id=session_id,
                   system_message="You are an expert graphic designer producing production-ready branded marketing flyers.")
    chat.with_model("gemini", "gemini-3.1-flash-image-preview").with_params(modalities=["image", "text"])

    text, images = await chat.send_message_multimodal_response(UserMessage(text=prompt))

    if not images:
        print(f"[{out_name}] NO IMAGES returned. Text response: {text[:200]}")
        return None

    # Save first image
    img = images[0]
    print(f"[{out_name}] mime={img['mime_type']}  saving...")
    image_bytes = base64.b64decode(img['data'])
    path = OUTPUT_DIR / f"{out_name}.png"
    with open(path, "wb") as f:
        f.write(image_bytes)
    size = path.stat().st_size / 1024
    print(f"[{out_name}] SAVED: {path}  ({size:.1f} KB)")
    return path


async def main():
    print("=" * 60)
    print("Generating 2 branded flyers via Gemini Nano Banana…")
    print("=" * 60)
    await gen(FLYER_1_PROMPT, "luckycart_rewards_flyer",   session_id="flyer-rewards-01")
    await gen(FLYER_2_PROMPT, "luckycart_playbook_flyer",  session_id="flyer-playbook-01")
    print("\nAll flyers written to:", OUTPUT_DIR)


if __name__ == "__main__":
    asyncio.run(main())
