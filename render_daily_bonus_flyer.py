"""
render_daily_bonus_flyer.py
--------------------------------------------------------------
Deterministic Pillow renderer for the "Daily Bonus Drop" flyer.

Design decision: the previous AI-generated version hard-coded
"₦50" everywhere, which anchors users to a fixed number and
locks the ops team out of adjusting the coupon amount. This
version keeps every callout amount-agnostic — the actual naira
value only lives in Admin Settings and shows up in-app on the
Dashboard's DailyBonusCard.

Output: /app/generated_flyers/luckycart_08_daily_bonus.png
"""
from pathlib import Path
from PIL import Image, ImageDraw, ImageFilter

OUT = Path("/app/generated_flyers/luckycart_08_daily_bonus.png")
W, H = 900, 1400
BG = (10, 8, 4)
CARD = (18, 14, 6)
GOLD = (245, 197, 24)
GOLD_LIGHT = (255, 229, 128)
GOLD_DIM = (200, 155, 20)
WHITE = (255, 255, 255)
MUTED = (185, 175, 155)
DARK_BROWN = (26, 20, 8)

FONT_DIR = "/usr/share/fonts/truetype/freefont"
F_BOLD = f"{FONT_DIR}/FreeSansBold.ttf"
F_REG = f"{FONT_DIR}/FreeSans.ttf"

from PIL import ImageFont
def font(size, path=F_BOLD):
    return ImageFont.truetype(path, size)


def paint_glow(img, cx, cy, r, color, alpha=110):
    glow = Image.new("RGBA", (r * 4, r * 4), (0, 0, 0, 0))
    gd = ImageDraw.Draw(glow)
    for i in range(r, 0, -6):
        a = int(alpha * (i / r) ** 2)
        gd.ellipse([r * 2 - i, r * 2 - i, r * 2 + i, r * 2 + i], fill=color + (a,))
    glow = glow.filter(ImageFilter.GaussianBlur(20))
    img.alpha_composite(glow, (cx - r * 2, cy - r * 2))


def draw_dashed_line(draw, x0, y0, x1, y1, dash=10, gap=8, color=GOLD, width=2):
    x = x0
    while x < x1:
        draw.line([(x, y0), (min(x + dash, x1), y0)], fill=color, width=width)
        x += dash + gap


def draw_alarm_icon(draw, cx, cy, s=24, color=GOLD):
    """Simple alarm-clock outline."""
    draw.ellipse([cx - s, cy - s, cx + s, cy + s], outline=color, width=3)
    # bells
    draw.line([(cx - s, cy - s + 4), (cx - s - 6, cy - s - 8)], fill=color, width=3)
    draw.line([(cx + s, cy - s + 4), (cx + s + 6, cy - s - 8)], fill=color, width=3)
    # hands
    draw.line([(cx, cy), (cx, cy - s // 2 - 2)], fill=color, width=3)
    draw.line([(cx, cy), (cx + s // 2 - 2, cy)], fill=color, width=3)


def draw_bolt_icon(draw, cx, cy, s=18, color=GOLD):
    """Lightning bolt."""
    poly = [
        (cx + 2, cy - s),
        (cx - s + 4, cy + 2),
        (cx - 2, cy + 2),
        (cx - 4, cy + s),
        (cx + s - 4, cy - 2),
        (cx + 2, cy - 2),
    ]
    draw.polygon(poly, fill=color)


def draw_piggy_icon(draw, cx, cy, s=22, color=GOLD):
    """Piggy-bank silhouette."""
    # body
    draw.ellipse([cx - s, cy - s // 2, cx + s, cy + s], outline=color, width=3)
    # snout
    draw.ellipse([cx + s - 6, cy, cx + s + 2, cy + s // 2], outline=color, width=2)
    # legs
    draw.rectangle([cx - s // 2, cy + s - 2, cx - s // 2 + 4, cy + s + 6], fill=color)
    draw.rectangle([cx + s // 2 - 4, cy + s - 2, cx + s // 2, cy + s + 6], fill=color)
    # ear
    draw.polygon([(cx - 6, cy - s // 2 - 2), (cx + 4, cy - s // 2 - 2), (cx - 2, cy - s // 2 - 10)], fill=color)


def draw_coin(img, d, cx, cy, r):
    """Big gold coin — outer bevel, notches, centered content."""
    # outer glow
    paint_glow(img, cx, cy, r + 40, GOLD_LIGHT, alpha=140)
    # outer ring (gradient by concentric)
    for i in range(r, r - 8, -1):
        # subtle bevel
        d.ellipse([cx - i, cy - i, cx + i, cy + i], outline=GOLD_LIGHT if i > r - 4 else GOLD, width=1)
    # main disc
    d.ellipse([cx - (r - 8), cy - (r - 8), cx + (r - 8), cy + (r - 8)], fill=GOLD, outline=GOLD_DIM, width=3)
    # inner bevel line
    d.ellipse([cx - (r - 22), cy - (r - 22), cx + (r - 22), cy + (r - 22)], outline=GOLD_LIGHT, width=2)
    # left/right notches (like the reference image)
    notch_r = 24
    d.ellipse([cx - r - notch_r + 6, cy - notch_r, cx - r + notch_r + 6, cy + notch_r], fill=BG, outline=GOLD_DIM, width=2)
    d.ellipse([cx + r - notch_r - 6, cy - notch_r, cx + r + notch_r - 6, cy + notch_r], fill=BG, outline=GOLD_DIM, width=2)


def render():
    img = Image.new("RGBA", (W, H), BG + (255,))
    d = ImageDraw.Draw(img)

    # top-right sunburst
    paint_glow(img, W - 40, 20, 380, GOLD_LIGHT, alpha=90)
    # top dashed accent line
    draw_dashed_line(d, 40, 40, W - 40, 40, dash=10, gap=8, color=GOLD, width=2)

    # ---- header pill ----
    pill_text = "DAILY BONUS DROP"
    pf = font(22)
    tw, th = d.textbbox((0, 0), pill_text, font=pf)[2:]
    pill_x0 = (W - tw - 60) // 2
    pill_y0 = 78
    d.rounded_rectangle(
        [pill_x0, pill_y0, pill_x0 + tw + 60, pill_y0 + th + 24],
        radius=28, fill=(35, 28, 8), outline=GOLD, width=2,
    )
    d.text((pill_x0 + 30, pill_y0 + 10), pill_text, font=pf, fill=GOLD)

    # ---- hero title (2 lines, mixed white + gold accent) ----
    hf = font(60)
    hero_lines = [
        ("SHOW UP DAILY.", [(0, 7, GOLD)]),    # "SHOW UP" in gold
        ("GET PAID DAILY.", [(0, 8, GOLD)]),   # "GET PAID" in gold
    ]
    for i, (line, ranges) in enumerate(hero_lines):
        y = 160 + i * 78
        lw = d.textbbox((0, 0), line, font=hf)[2]
        x = (W - lw) // 2
        d.text((x, y), line, font=hf, fill=WHITE)
        for a, b, col in ranges:
            seg = line[a:b]
            pw = d.textbbox((0, 0), line[:a], font=hf)[2]
            d.text((x + pw, y), seg, font=hf, fill=col)

    # ---- subtitle ----
    sub_lines = [
        "A fresh bonus coupon drops every day at 5:10pm WAT.",
        "Fastest hands claim it. Are you on the list?",
    ]
    sf = font(22, F_REG)
    for i, ln in enumerate(sub_lines):
        lw = d.textbbox((0, 0), ln, font=sf)[2]
        d.text(((W - lw) // 2, 328 + i * 34), ln, font=sf, fill=MUTED)

    # ---- gold coin ----
    coin_cx = W // 2
    coin_cy = 640
    coin_r = 210
    draw_coin(img, d, coin_cx, coin_cy, coin_r)

    # inside coin: LUCKY / gift icon / DAILY DROP / redeem line / time
    tf = font(40)
    d.text_line = None  # noqa (just to keep tools happy)
    # "LUCKY"
    lucky = "LUCKY"
    lw = d.textbbox((0, 0), lucky, font=tf)[2]
    d.text((coin_cx - lw // 2, coin_cy - 130), lucky, font=tf, fill=DARK_BROWN)

    # Gift / present icon (centered, replaces the ₦50)
    gift_cx = coin_cx
    gift_cy = coin_cy - 30
    gs = 50
    # box
    d.rounded_rectangle([gift_cx - gs, gift_cy - gs // 2, gift_cx + gs, gift_cy + gs], radius=8, outline=DARK_BROWN, width=6)
    # ribbon vertical
    d.rectangle([gift_cx - 8, gift_cy - gs // 2, gift_cx + 8, gift_cy + gs], fill=DARK_BROWN)
    # ribbon horizontal
    d.rectangle([gift_cx - gs, gift_cy - 8, gift_cx + gs, gift_cy + 8], fill=DARK_BROWN)
    # bow
    d.ellipse([gift_cx - 30, gift_cy - gs // 2 - 22, gift_cx - 6, gift_cy - gs // 2 + 2], outline=DARK_BROWN, width=6)
    d.ellipse([gift_cx + 6, gift_cy - gs // 2 - 22, gift_cx + 30, gift_cy - gs // 2 + 2], outline=DARK_BROWN, width=6)

    # "DAILY DROP"
    dd = "DAILY DROP"
    df_ = font(36)
    lw = d.textbbox((0, 0), dd, font=df_)[2]
    d.text((coin_cx - lw // 2, coin_cy + 78), dd, font=df_, fill=DARK_BROWN)

    # redeem line (small)
    redeem = "Redeem in-app before the daily reset"
    rf = font(15)
    lw = d.textbbox((0, 0), redeem, font=rf)[2]
    d.text((coin_cx - lw // 2, coin_cy + 120), redeem, font=rf, fill=(70, 50, 8))

    # time chip inside coin
    time_txt = "  5:10 PM WAT"
    tcf = font(18)
    tw = d.textbbox((0, 0), time_txt, font=tcf)[2]
    tcx0 = coin_cx - (tw + 30) // 2
    tcy0 = coin_cy + 150
    d.rounded_rectangle([tcx0, tcy0, tcx0 + tw + 30, tcy0 + 32], radius=16, outline=DARK_BROWN, width=2, fill=(255, 220, 90))
    # clock glyph
    d.ellipse([tcx0 + 10, tcy0 + 8, tcx0 + 26, tcy0 + 24], outline=DARK_BROWN, width=2)
    d.line([(tcx0 + 18, tcy0 + 16), (tcx0 + 18, tcy0 + 12)], fill=DARK_BROWN, width=2)
    d.line([(tcx0 + 18, tcy0 + 16), (tcx0 + 22, tcy0 + 16)], fill=DARK_BROWN, width=2)
    d.text((tcx0 + 30, tcy0 + 6), time_txt.strip(), font=tcf, fill=DARK_BROWN)

    # ---- 3 feature cards ----
    grid_top = 960
    card_w = 260
    card_h = 220
    gap_x = 20
    left_x = (W - (card_w * 3 + gap_x * 2)) // 2
    feats = [
        ("alarm", "AUTO-GENERATED DAILY", "A new coupon spawns automatically at 5:10 PM WAT — no admin action needed."),
        ("bolt",  "FIRST TO WIN",         "Only the fastest members to redeem win. Fastest hands, biggest stack."),
        ("piggy", "STACKS ON EARNINGS",   "Every drop lands straight in your wallet — compounds with daily profits, referrals and milestone bonuses."),
    ]
    for i, (kind, title, body) in enumerate(feats):
        x0 = left_x + i * (card_w + gap_x)
        y0 = grid_top
        x1 = x0 + card_w
        y1 = y0 + card_h
        d.rounded_rectangle([x0, y0, x1, y1], radius=16, fill=CARD, outline=GOLD_DIM, width=1)
        # icon tile
        icon_x = x0 + card_w // 2
        icon_y = y0 + 40
        d.rounded_rectangle([icon_x - 26, icon_y - 26, icon_x + 26, icon_y + 26],
                            radius=10, fill=(28, 22, 8), outline=GOLD_DIM, width=1)
        if kind == "alarm":
            draw_alarm_icon(d, icon_x, icon_y - 2, s=18, color=GOLD_LIGHT)
        elif kind == "bolt":
            draw_bolt_icon(d, icon_x, icon_y, s=18, color=GOLD_LIGHT)
        else:
            draw_piggy_icon(d, icon_x, icon_y, s=18, color=GOLD_LIGHT)
        # title
        tf = font(15)
        tw = d.textbbox((0, 0), title, font=tf)[2]
        d.text((x0 + (card_w - tw) // 2, y0 + 82), title, font=tf, fill=WHITE)
        # body (naive wrap: split on words to width)
        body_words = body.split()
        bf = font(13, F_REG)
        cur = ""
        line_y = y0 + 112
        max_body_w = card_w - 24
        for w in body_words:
            probe = (cur + " " + w).strip()
            if d.textbbox((0, 0), probe, font=bf)[2] > max_body_w:
                lw = d.textbbox((0, 0), cur, font=bf)[2]
                d.text((x0 + (card_w - lw) // 2, line_y), cur, font=bf, fill=MUTED)
                line_y += 18
                cur = w
            else:
                cur = probe
        if cur:
            lw = d.textbbox((0, 0), cur, font=bf)[2]
            d.text((x0 + (card_w - lw) // 2, line_y), cur, font=bf, fill=MUTED)

    # ---- closing banner ----
    banner1 = "Show up daily. Get paid daily."
    banner2 = "That's the Luckycart Box way."
    bf = font(28)
    for i, ln in enumerate([banner1, banner2]):
        lw = d.textbbox((0, 0), ln, font=bf)[2]
        d.text(((W - lw) // 2, 1220 + i * 40), ln, font=bf, fill=GOLD_LIGHT)

    # trust pill
    pill_text = "FREE  •  DAILY  •  AUTOMATIC"
    tpf = font(15)
    tpw, tph = d.textbbox((0, 0), pill_text, font=tpf)[2:]
    px0 = (W - tpw - 60) // 2
    py0 = 1310
    d.rounded_rectangle([px0, py0, px0 + tpw + 60, py0 + tph + 20],
                        radius=24, fill=GOLD, outline=None)
    d.text((px0 + 30, py0 + 10), pill_text, font=tpf, fill=DARK_BROWN)

    # brand line
    brand = "LUCKYCART BOX — Rewards That Never Sleep."
    brf = font(16)
    bw = d.textbbox((0, 0), brand, font=brf)[2]
    d.text(((W - bw) // 2, 1364), brand, font=brf, fill=GOLD)

    OUT.parent.mkdir(parents=True, exist_ok=True)
    img.convert("RGB").save(OUT, format="PNG", optimize=True)
    print(f"Wrote {OUT} ({OUT.stat().st_size} bytes)")


if __name__ == "__main__":
    render()
