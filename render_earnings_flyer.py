"""
render_earnings_flyer.py
--------------------------------------------------------------
Deterministic Pillow-based renderer for the "Daily Earnings Engine"
promotional flyer.

Why Pillow (not Banana Nano)?
- AI image models keep hallucinating numbers (e.g. rendering "Daily
  payout: ₦3,000" for the ₦5,000 tier — should be ₦750). For a page
  whose ENTIRE point is showing exact money math, we cannot risk that.
- This renderer computes daily = stake * 0.15 and total = daily * days
  in Python, then paints the exact strings. Zero hallucination surface.

Output: /app/generated_flyers/luckycart_02_earnings_v3.png
Layout: portrait 900x1350 (~4:6). 2-column grid of tier cards.
"""
from pathlib import Path
from PIL import Image, ImageDraw, ImageFont, ImageFilter

OUT = Path("/app/generated_flyers/luckycart_02_earnings_v3.png")
W, H = 900, 1400
BG = (10, 8, 4)                 # near-black
CARD_BG = (18, 14, 6)           # slightly lifted panel
GOLD = (245, 197, 24)
GOLD_LIGHT = (255, 229, 128)
GOLD_DIM = (200, 155, 20)
WHITE = (255, 255, 255)
MUTED = (185, 175, 155)
GREEN = (16, 185, 129)

FONT_DIR = "/usr/share/fonts/truetype/freefont"
F_BOLD   = f"{FONT_DIR}/FreeSansBold.ttf"
F_REG    = f"{FONT_DIR}/FreeSans.ttf"
F_NARROW = f"{FONT_DIR}/FreeSansBold.ttf"

def font(size, path=F_BOLD):
    return ImageFont.truetype(path, size)

# ---------------------------------------------------------------------
# The tiers — exact math (stake * 0.15 daily, * days cycle)
# ---------------------------------------------------------------------
TIERS = [
    ("LUCKY CART",           3_000,   90, False),
    ("LUCKY CART EXCLUSIVE", 5_000,   90, False),
    ("LUCKYCART EXCHANGE",   20_000,  90, False),
    ("LUCKYCART MYSTERY",    50_000,  90, False),
    ("LUCKYCART BOX",        100_000, 90, False),
    ("LUCKYCART TREASURES",  150_000, 95, True),
    ("LUCKYCART MUSEUM",     200_000, 95, True),
]


def naira(n: int) -> str:
    return f"₦{n:,}"


def rounded_rect(draw: ImageDraw.ImageDraw, xy, radius, fill=None, outline=None, width=1):
    """Compatibility wrapper — PIL's rounded_rectangle exists on newer versions."""
    draw.rounded_rectangle(xy, radius=radius, fill=fill, outline=outline, width=width)


def paint_glow(img: Image.Image, cx: int, cy: int, r: int, color, alpha=110):
    """Soft radial glow, used top-right of the flyer."""
    glow = Image.new("RGBA", (r * 4, r * 4), (0, 0, 0, 0))
    gd = ImageDraw.Draw(glow)
    for i in range(r, 0, -6):
        a = int(alpha * (i / r) ** 2)
        gd.ellipse(
            [r * 2 - i, r * 2 - i, r * 2 + i, r * 2 + i],
            fill=color + (a,),
        )
    glow = glow.filter(ImageFilter.GaussianBlur(20))
    img.alpha_composite(glow, (cx - r * 2, cy - r * 2))


def draw_dashed_line(draw, x0, y0, x1, y1, dash=8, gap=6, color=GOLD, width=2):
    """Horizontal dashed accent line."""
    x = x0
    while x < x1:
        draw.line([(x, y0), (min(x + dash, x1), y0)], fill=color, width=width)
        x += dash + gap


def draw_box_icon(draw, cx, cy, size=22, color=GOLD):
    """Tiny lucky-cart box icon."""
    s = size
    # top face
    draw.polygon(
        [(cx - s, cy), (cx, cy - s // 2), (cx + s, cy), (cx, cy + s // 2)],
        outline=color, width=2,
    )
    # left/right sides
    draw.line([(cx - s, cy), (cx - s, cy + s), (cx, cy + s + s // 2)], fill=color, width=2)
    draw.line([(cx + s, cy), (cx + s, cy + s), (cx, cy + s + s // 2)], fill=color, width=2)
    draw.line([(cx, cy + s // 2), (cx, cy + s + s // 2)], fill=color, width=2)
    # gold bow line
    draw.line([(cx - s, cy), (cx + s, cy)], fill=color, width=2)


def render():
    img = Image.new("RGBA", (W, H), BG + (255,))
    d = ImageDraw.Draw(img)

    # ---- top-right sunburst glow ----
    paint_glow(img, W - 40, 20, 380, GOLD_LIGHT, alpha=90)

    # ---- top gold accent line ----
    draw_dashed_line(d, 40, 40, W - 40, 40, dash=10, gap=8, color=GOLD, width=2)

    # ---- header pill ----
    pill_text = "DAILY EARNINGS ENGINE"
    pf = font(22)
    tw, th = d.textbbox((0, 0), pill_text, font=pf)[2:]
    pill_x0 = (W - tw - 60) // 2
    pill_y0 = 78
    rounded_rect(
        d,
        [pill_x0, pill_y0, pill_x0 + tw + 60, pill_y0 + th + 24],
        radius=28, fill=(35, 28, 8), outline=GOLD, width=2,
    )
    d.text((pill_x0 + 30, pill_y0 + 10), pill_text, font=pf, fill=GOLD)

    # ---- hero title ----
    hero1 = "EARN 15% DAILY"
    hero2 = "FOR UP TO 95 DAYS."
    hf = font(64)
    for i, (line, hi_ranges) in enumerate([
        (hero1, [(5, 14, GOLD)]),
        (hero2, [(7, 15, GOLD)]),
    ]):
        y = 160 + i * 78
        # measure whole line
        lw, _ = d.textbbox((0, 0), line, font=hf)[2:]
        x = (W - lw) // 2
        # draw base white
        d.text((x, y), line, font=hf, fill=WHITE)
        # overlay gold segments
        for a, b, col in hi_ranges:
            seg = line[a:b]
            prefix = line[:a]
            pw, _ = d.textbbox((0, 0), prefix, font=hf)[2:]
            d.text((x + pw, y), seg, font=hf, fill=col)

    # ---- subtitle ----
    sub = "Every box pays you EVERY DAY. Pick your tier, watch daily naira roll into your wallet."
    sf = font(22, F_REG)
    # naive wrap: split at comma
    lines = ["Every box pays you EVERY DAY. Pick your tier,",
             "watch daily naira roll into your wallet."]
    for i, ln in enumerate(lines):
        lw, _ = d.textbbox((0, 0), ln, font=sf)[2:]
        d.text(((W - lw) // 2, 328 + i * 34), ln, font=sf, fill=MUTED)

    # ---- tier grid ----
    grid_top = 430
    card_w = 400
    card_h = 172
    gap_x = 28
    gap_y = 22
    left_x = (W - (card_w * 2 + gap_x)) // 2

    for idx, (name, stake, days, premium) in enumerate(TIERS):
        row = idx // 2
        col = idx % 2
        # last odd tier (7th) centered on its own row
        if idx == len(TIERS) - 1 and len(TIERS) % 2 == 1:
            x0 = (W - card_w) // 2
        else:
            x0 = left_x + col * (card_w + gap_x)
        y0 = grid_top + row * (card_h + gap_y)
        x1 = x0 + card_w
        y1 = y0 + card_h

        daily = int(stake * 0.15)
        total = daily * days

        # card fill + gold border
        rounded_rect(d, [x0, y0, x1, y1], radius=18,
                     fill=CARD_BG, outline=GOLD, width=2)

        # small box icon
        draw_box_icon(d, x0 + 32, y0 + 28, size=14, color=GOLD)

        # tier name (auto-shrink to fit — leave 90px for PREMIUM pill on premium cards)
        title_max_w = (card_w - 76) - (78 if premium else 20)
        name_size = 22
        while name_size > 15:
            nf_try = font(name_size)
            if d.textbbox((0, 0), name, font=nf_try)[2] <= title_max_w:
                break
            name_size -= 1
        nf = font(name_size)
        # vertically center the (possibly-shrunk) title on the icon baseline
        d.text((x0 + 60, y0 + 16 + (22 - name_size) // 2), name, font=nf, fill=GOLD)
        # PREMIUM badge for premium tiers
        if premium:
            bf = font(11)
            btxt = "PREMIUM"
            bw, bh = d.textbbox((0, 0), btxt, font=bf)[2:]
            bx1 = x1 - 14
            bx0 = bx1 - bw - 14
            by0 = y0 + 14
            by1 = by0 + bh + 8
            rounded_rect(d, [bx0, by0, bx1, by1], radius=8,
                         fill=(70, 40, 8), outline=GOLD, width=1)
            d.text((bx0 + 7, by0 + 3), btxt, font=bf, fill=GOLD_LIGHT)

        # stake big
        af = font(38)
        stake_txt = naira(stake)
        d.text((x0 + 20, y0 + 48), stake_txt, font=af, fill=WHITE)
        # rate + days pills
        rf = font(14)
        pill_gap = 8
        # rate pill
        rp = "15%/day"
        rpw, rph = d.textbbox((0, 0), rp, font=rf)[2:]
        rpx0 = x0 + 20 + d.textbbox((0, 0), stake_txt, font=af)[2] + 14
        rpy0 = y0 + 66
        rounded_rect(d, [rpx0, rpy0, rpx0 + rpw + 20, rpy0 + rph + 10],
                     radius=14, fill=(30, 24, 8), outline=GOLD_DIM, width=1)
        d.text((rpx0 + 10, rpy0 + 5), rp, font=rf, fill=GOLD_LIGHT)
        # days pill
        dp = f"{days}d"
        dpw, dph = d.textbbox((0, 0), dp, font=rf)[2:]
        dpx0 = rpx0 + rpw + 20 + pill_gap
        rounded_rect(d, [dpx0, rpy0, dpx0 + dpw + 20, rpy0 + dph + 10],
                     radius=14, fill=(30, 24, 8), outline=GOLD_DIM, width=1)
        d.text((dpx0 + 10, rpy0 + 5), dp, font=rf, fill=GOLD_LIGHT)

        # divider (sits above the payout row with breathing room)
        d.line([(x0 + 20, y0 + 108), (x1 - 20, y0 + 108)], fill=GOLD_DIM, width=1)

        # daily payout row
        pf = font(17, F_REG)
        pf2 = font(18)
        d.text((x0 + 20, y0 + 118), "Daily payout: ", font=pf, fill=WHITE)
        prefix_w = d.textbbox((0, 0), "Daily payout: ", font=pf)[2]
        d.text((x0 + 20 + prefix_w, y0 + 118), naira(daily), font=pf2, fill=GREEN)

        # total return pill (bright gold background)
        tp = f"Total return: {naira(total)}"
        tf = font(16)
        tpw, tph = d.textbbox((0, 0), tp, font=tf)[2:]
        tpx0 = x0 + 20
        tpy0 = y1 - 34
        rounded_rect(d, [tpx0, tpy0, tpx0 + tpw + 24, tpy0 + tph + 12],
                     radius=14, fill=GOLD, outline=None)
        d.text((tpx0 + 12, tpy0 + 6), tp, font=tf, fill=(20, 15, 4))

    # ---- footer banner ----
    fb = font(24)
    banner = "Compound smart. Cashflow daily. Cash out anytime."
    bw, _ = d.textbbox((0, 0), banner, font=fb)[2:]
    d.text(((W - bw) // 2, H - 130), banner, font=fb, fill=WHITE)

    # trust pills line
    tp2 = "SECURE PAYOUTS  •  4 GATEWAYS  •  INSTANT WITHDRAWALS"
    tpf = font(15)
    tpw, tph = d.textbbox((0, 0), tp2, font=tpf)[2:]
    px0 = (W - tpw - 60) // 2
    py0 = H - 88
    rounded_rect(d, [px0, py0, px0 + tpw + 60, py0 + tph + 20],
                 radius=24, fill=(24, 18, 6), outline=GOLD, width=2)
    d.text((px0 + 30, py0 + 10), tp2, font=tpf, fill=GOLD_LIGHT)

    # brand line
    brand = "LUCKYCART BOX — Boxes That Pay Every Day."
    brf = font(16)
    bw, _ = d.textbbox((0, 0), brand, font=brf)[2:]
    d.text(((W - bw) // 2, H - 42), brand, font=brf, fill=GOLD)

    OUT.parent.mkdir(parents=True, exist_ok=True)
    img.convert("RGB").save(OUT, format="PNG", optimize=True)
    print(f"Wrote {OUT} ({OUT.stat().st_size} bytes)")


if __name__ == "__main__":
    render()
