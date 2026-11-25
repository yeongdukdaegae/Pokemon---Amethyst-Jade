# 손 기술 · 방어 · 판별 애니메이션 시트 (32 x 32 칸 · 가로 6 프레임 · 세로 10 줄 = 192 x 320) — Jawbreaker 애니메이션 (main.jb 가 "hdfx1" ~ "hdfx10" 으로 등록)
#   손: 흰 장갑 느낌 (흰 손 + 진한 남색 테두리 · 손가락 금) — DPPt 이펙트 느낌
#   줄: 1 손바닥 후려치기 (휘두름) · 2 손날 (내려침) · 3 박수 (두 손이 짝 · 반짝) · 4 손짓 (까딱까딱 · 도발) · 5 움켜쥐기 (펼친 손 → 주먹)
#       6 간지럼 (손가락 꼼지락) · 7 맞잡기 (두 손이 다가와 잡음) · 8 손바닥 밀기 (앞으로 쭉) · 9 "!" 말풍선 (판별) · 10 둥근 보호막 (방어)
#   python3 fxsrc/make_fx_hand.py → aj6/Pokémon - KeiKan/assets/textures/battle/fx_hand.png
from PIL import Image, ImageDraw, ImageFilter, ImageChops
import math, os
N = 32; F = 6; SS = 4; W = N * SS
WHITE = (255, 255, 255, 255); LINE = (40, 44, 80, 255); CREASE = (170, 176, 205, 255)

def capsule(d, x1, y1, x2, y2, r, fill):
    d.line([(x1, y1), (x2, y2)], fill=fill, width=int(r * 2))
    d.ellipse([x1 - r, y1 - r, x1 + r, y1 + r], fill=fill); d.ellipse([x2 - r, y2 - r, x2 + r, y2 + r], fill=fill)

def hand_layer(curl=0.0, spread=1.0, thumb=1.0, wiggle=None, fist=False):
    """손 하나 (손목이 아래 · 손가락이 위) 를 W x W 마스크 + 금 (crease) 그림으로. curl 0 = 쭉 폄 · 1 = 주먹"""
    m = Image.new("L", (W, W), 0); d = ImageDraw.Draw(m)
    cr = Image.new("RGBA", (W, W), (0, 0, 0, 0)); dc = ImageDraw.Draw(cr)
    cx, cy = W / 2, W * 0.62
    pw, ph = W * 0.36, W * 0.30
    d.rounded_rectangle([cx - pw / 2, cy - ph / 2, cx + pw / 2, cy + ph / 2], radius=W * 0.09, fill=255)
    d.rectangle([cx - pw * 0.32, cy + ph / 2 - 4, cx + pw * 0.32, W * 0.95], fill=255)   # 손목
    fr = W * 0.046
    tips = []
    for i in range(4):
        bx = cx - pw / 2 + fr + i * (pw - 2 * fr) / 3
        by = cy - ph / 2 + fr * 0.6
        L = W * [0.22, 0.26, 0.25, 0.19][i] * (1 - 0.72 * curl)
        a = math.radians(-90 + (i - 1.5) * 9 * spread + (wiggle[i] if wiggle else 0))
        ex, ey = bx + math.cos(a) * L, by + math.sin(a) * L
        capsule(d, bx, by, ex, ey, fr, 255)
        tips.append((bx, by, ex, ey))
        if curl < 0.5: dc.line([(bx, by + fr * 1.2), (bx, by + fr * 2.2)], fill=CREASE, width=SS)
        if curl > 0.6: dc.line([(bx - fr * 0.9, ey + fr * 0.2), (bx + fr * 0.9, ey + fr * 0.2)], fill=CREASE, width=SS)
    for i in range(3):   # 손가락 사이 금 (붙어 보이지 않게)
        b1x, b1y, e1x, e1y = tips[i]; b2x, b2y, e2x, e2y = tips[i + 1]
        mx, my = (b1x + b2x) / 2, (b1y + b2y) / 2 + fr * 0.4
        tx, ty = (e1x + e2x) / 2, (e1y + e2y) / 2
        k = 0.78 if curl < 0.6 else 0.0
        if k > 0: dc.line([(mx, my), (mx + (tx - mx) * k, my + (ty - my) * k)], fill=LINE, width=SS)
    ta = math.radians(-150 + 40 * (1 - thumb))
    tx0, ty0 = cx - pw / 2 + fr * 0.5, cy + ph * 0.1
    capsule(d, tx0, ty0, tx0 + math.cos(ta) * W * 0.17, ty0 + math.sin(ta) * W * 0.17, fr * 1.1, 255)
    return m, cr

def render(m, cr, ang=0, dx=0, dy=0, sc=1.0, mirror=False, outline=LINE):
    if mirror: m = m.transpose(Image.FLIP_LEFT_RIGHT); cr = cr.transpose(Image.FLIP_LEFT_RIGHT)
    if sc != 1.0:
        nw = max(1, int(W * sc)); m2 = Image.new("L", (W, W), 0); c2 = Image.new("RGBA", (W, W), (0, 0, 0, 0))
        m2.paste(m.resize((nw, nw), Image.LANCZOS), ((W - nw) // 2, (W - nw) // 2)); c2.alpha_composite(cr.resize((nw, nw), Image.LANCZOS), ((W - nw) // 2, (W - nw) // 2)); m, cr = m2, c2
    m = m.rotate(ang, resample=Image.BICUBIC, translate=(dx * SS, dy * SS)); cr = cr.rotate(ang, resample=Image.BICUBIC, translate=(dx * SS, dy * SS))
    big = m.filter(ImageFilter.MaxFilter(2 * SS + 1))
    im = Image.new("RGBA", (W, W), (0, 0, 0, 0))
    im.paste(Image.new("RGBA", (W, W), outline), (0, 0), big)
    im.paste(Image.new("RGBA", (W, W), WHITE), (0, 0), m)
    im.alpha_composite(cr)
    return im

def fin(im):
    im = im.resize((N, N), Image.LANCZOS); px = im.load()
    for y in range(N):
        for x in range(N):
            r, g, b, a = px[x, y]; px[x, y] = (r, g, b, 0 if a < 100 else 255)
    return im
def lines(d, pts, col=(255, 255, 255, 255), w=1):
    for (x1, y1, x2, y2) in pts: d.line([(x1 * SS, y1 * SS), (x2 * SS, y2 * SS)], fill=col, width=w * SS)
def star(d, x, y, r, col):
    for k in range(4):
        a = math.radians(k * 90); b = math.radians(k * 90 + 90)
        d.polygon([(x * SS, y * SS), ((x + math.cos(a) * r) * SS, (y + math.sin(a) * r) * SS), ((x + math.cos(a + 0.6) * r * 0.25) * SS, (y + math.sin(a + 0.6) * r * 0.25) * SS)], fill=col)
    d.ellipse([(x - r * 0.3) * SS, (y - r * 0.3) * SS, (x + r * 0.3) * SS, (y + r * 0.3) * SS], fill=col)

def slap(f):   # 손바닥이 위 → 아래로 휘둘러 내려옴 + 바람 줄
    ang = [70, 45, 15, -10, -20, -20][f]; sc = [0.8, 0.9, 1.0, 1.0, 0.95, 0.9][f]
    m, cr = hand_layer(curl=0.0, spread=0.6)
    im = render(m, cr, ang, 0, 1, sc * 0.82)
    if 1 <= f <= 3:
        d = ImageDraw.Draw(im)
        for k in range(3): d.arc([(4 + k * 2) * SS, (2 + k * 2) * SS, (28 - k * 2) * SS, (30 - k * 2) * SS], 200, 260, fill=(255, 255, 255, 255), width=SS)
    return fin(im)
def chop(f):   # 손날 (옆에서 본 곧은 손) 이 위에서 내려침
    m, cr = hand_layer(curl=0.0, spread=0.0, thumb=0.2)
    ang = [-60, -40, -15, 5, 10, 10][f]
    im = render(m, cr, ang, [4, 3, 1, -1, -1, -1][f], [-4, -2, 0, 2, 3, 3][f], 0.72)
    if f >= 3:
        d = ImageDraw.Draw(im); lines(d, [(6, 26, 2, 30), (12, 28, 10, 31), (22, 27, 26, 31)])
    return fin(im)
def clap(f):   # 두 손이 양쪽에서 와서 짝 → 반짝
    gap = [3, 2, 1.2, 0.3, 0.3, 0.8][f]
    m, cr = hand_layer(curl=0.0, spread=0.2, thumb=0.6)
    im = Image.new("RGBA", (W, W), (0, 0, 0, 0))
    im.alpha_composite(render(m, cr, -12, -gap - 4, 3, 0.56))
    im.alpha_composite(render(m, cr, 12, gap + 4, 3, 0.56, mirror=True))
    if f >= 3:
        d = ImageDraw.Draw(im); r = [0, 0, 0, 4, 5.5, 6.5][f]
        for k in range(6):
            a = math.radians(-90 + (k - 2.5) * 30); lines(d, [(16 + math.cos(a) * r * 0.6, 7 + math.sin(a) * r * 0.6, 16 + math.cos(a) * r, 7 + math.sin(a) * r)], (255, 240, 140, 255))
    return fin(im)
def beckon(f):   # 손등을 보이며 손가락을 까딱까딱 (구부렸다 폈다)
    c = [0.0, 0.45, 0.8, 0.45, 0.0, 0.6][f]
    m, cr = hand_layer(curl=c, spread=0.3)
    return fin(render(m, cr, -20, 0, 1, 0.8))
def grab(f):   # 펼친 손 → 움켜쥠 (주먹) · 꽉 쥐며 떨림
    c = [0.0, 0.2, 0.55, 0.9, 1.0, 1.0][f]; sp = [1.3, 1.2, 0.9, 0.4, 0.2, 0.2][f]
    m, cr = hand_layer(curl=c, spread=sp, thumb=1 - c * 0.6)
    im = render(m, cr, 0, [0, 0, 0, 0, 1, -1][f], 0, 0.82)
    if f >= 4:
        d = ImageDraw.Draw(im); lines(d, [(3, 12, 6, 14), (29, 12, 26, 14), (2, 20, 5, 20), (30, 20, 27, 20)])
    return fin(im)
def tickle(f):   # 손가락 넷이 따로따로 꼼지락
    wg = [[math.sin(f * 1.6 + i * 1.7) * 18 for i in range(4)]][0]
    m, cr = hand_layer(curl=0.25 + 0.15 * math.sin(f * 2), spread=1.1, wiggle=wg)
    im = render(m, cr, 180 + math.sin(f * 1.2) * 8, 0, -1, 0.8)   # 손가락이 아래 (간지르는 쪽)
    return fin(im)
def hold(f):   # 두 손이 다가와 맞잡음 (하트 반짝)
    gap = [2.4, 1.8, 1.4, 1.0, 1.0, 1.0][f]
    m, cr = hand_layer(curl=0.25, spread=0.4, thumb=0.8)
    im = Image.new("RGBA", (W, W), (0, 0, 0, 0))
    im.alpha_composite(render(m, cr, -70, -gap - 3, 3, 0.52))
    im.alpha_composite(render(m, cr, 70, gap + 3, 3, 0.52, mirror=True))
    if f >= 4:
        d = ImageDraw.Draw(im); star(d, 16, 6, 4 + (f - 4) * 2, (255, 230, 120, 255))
    return fin(im)
def push(f):   # 손바닥을 앞으로 쭉 내밂 (커짐) + 충격 줄
    sc = [0.45, 0.62, 0.78, 0.88, 0.82, 0.82][f]
    m, cr = hand_layer(curl=0.0, spread=0.8)
    im = render(m, cr, 0, 0, 1, sc)
    if f >= 3:
        d = ImageDraw.Draw(im)
        for k in range(8):
            a = math.radians(k * 45 + 22); r1, r2 = 13 + (f - 3) * 1.5, 16
            lines(d, [(16 + math.cos(a) * r1, 16 + math.sin(a) * r1, 16 + math.cos(a) * r2, 16 + math.sin(a) * r2)], (255, 250, 200, 255))
    return fin(im)
def bang(f):   # "!" 말풍선이 톡 튀어나옴
    sc = [0.3, 0.75, 1.12, 1.0, 1.0, 1.0][f]
    im = Image.new("RGBA", (W, W), (0, 0, 0, 0)); d = ImageDraw.Draw(im)
    r = 12 * sc; cx, cy = 16, 14
    d.ellipse([(cx - r) * SS, (cy - r * 0.92) * SS, (cx + r) * SS, (cy + r * 0.92) * SS], fill=WHITE, outline=LINE, width=SS * 2)
    d.polygon([((cx - 3 * sc) * SS, (cy + r * 0.75) * SS), ((cx + 2 * sc) * SS, (cy + r * 0.8) * SS), ((cx - 5 * sc) * SS, (cy + r * 1.35) * SS)], fill=WHITE)
    d.line([((cx - 3 * sc) * SS, (cy + r * 0.86) * SS), ((cx - 5 * sc) * SS, (cy + r * 1.35) * SS), ((cx + 2 * sc) * SS, (cy + r * 0.86) * SS)], fill=LINE, width=SS * 2)
    red = (235, 50, 50, 255)
    d.rounded_rectangle([(cx - 1.8 * sc) * SS, (cy - r * 0.62) * SS, (cx + 1.8 * sc) * SS, (cy + r * 0.2) * SS], radius=SS * 2 * sc, fill=red)
    d.ellipse([(cx - 2 * sc) * SS, (cy + r * 0.36) * SS, (cx + 2 * sc) * SS, (cy + r * 0.36 + 4 * sc) * SS], fill=red)
    return fin(im)
def shield(f):   # 둥근 보호막: 가운데에서 퍼지며 나타나 → 육각 무늬가 반짝이며 돎
    im = Image.new("RGBA", (W, W), (0, 0, 0, 0)); d = ImageDraw.Draw(im)
    r = [5, 10, 14.5, 15, 15, 15][f]; cx = cy = 16
    d.ellipse([(cx - r) * SS, (cy - r) * SS, (cx + r) * SS, (cy + r) * SS], fill=(130, 255, 190, 110), outline=(60, 220, 140, 255), width=SS * 2)
    d.ellipse([(cx - r + 2.5) * SS, (cy - r + 2.5) * SS, (cx + r - 2.5) * SS, (cy + r - 2.5) * SS], outline=(200, 255, 225, 255), width=SS)
    if f >= 2:   # 육각 무늬 (돎)
        for k in range(6):
            a = math.radians(k * 60 + f * 10); hx, hy = cx + math.cos(a) * r * 0.55, cy + math.sin(a) * r * 0.55
            pts = [((hx + math.cos(math.radians(j * 60)) * 3.2) * SS, (hy + math.sin(math.radians(j * 60)) * 3.2) * SS) for j in range(6)]
            d.polygon(pts, outline=(170, 255, 210, 255), width=SS)
        d.arc([(cx - r + 4) * SS, (cy - r + 4) * SS, (cx + r - 4) * SS, (cy + r - 4) * SS], 200 + f * 12, 250 + f * 12, fill=(255, 255, 255, 255), width=SS * 2)
    im = im.resize((N, N), Image.LANCZOS); px = im.load()
    for y in range(N):
        for x in range(N):
            rr, g, b, a = px[x, y]
            px[x, y] = (rr, g, b, 0 if a < 40 else (255 if a > 170 else 120))   # 막은 반투명으로 남김
    return im

ROWS = [slap, chop, clap, beckon, grab, tickle, hold, push, bang, shield]
out = Image.new("RGBA", (N * F, N * len(ROWS)), (0, 0, 0, 0))
for r, fn in enumerate(ROWS):
    for f in range(F): out.alpha_composite(fn(f), (f * N, r * N))
root = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
out.save(os.path.join(root, "aj6", "Pokémon - KeiKan", "assets", "textures", "battle", "fx_hand.png"))
pv = Image.new("RGBA", (N * F * 4, N * len(ROWS) * 4), (70, 120, 70, 255)); pv.alpha_composite(out.resize((N * F * 4, N * len(ROWS) * 4), Image.NEAREST))
pv.save(os.path.join(root, "fxsrc", "fx_hand_preview.png"))
print("ok")
