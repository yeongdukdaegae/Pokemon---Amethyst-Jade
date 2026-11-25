# 변화 기술 애니메이션 시트 (32 x 32 칸 · 가로 6 프레임 · 세로 12 줄 = 192 x 384) — Jawbreaker 애니메이션 (mag.setasTexture · setasAnime · runAnime) 으로 재생
#   줄: 1 하트 (애교부리기 · 초롱초롱눈동자) · 2 눈물 (거짓울음) · 3 도깨비불 (일렁임 · 이어 돌림) · 4 조준 (록온) · 5 검은 연기 (흑안개)
#       6 괴전파 고리 · 7 물방울 고리 (아쿠아링 · 돎) · 8 뾰족 바위 (스텔스록 · 돎) · 9 돌개바람 (날려버리기) · 10 무지개 반짝임 (흉내내기 · 흉내쟁이)
#       11 갈라지는 하트 (아픔나누기) · 12 물보라 (튀어오르기)
#   lib/battleCore.jbl 의 stAnim / spStatus · main.jb 가 줄마다 애니메이션 "stfx1" ~ "stfx12" 로 등록
#   python3 fxsrc/make_fx_status.py → aj6/Pokémon - KeiKan/assets/textures/battle/fx_status.png
from PIL import Image, ImageDraw
import math, os
N = 32; F = 6; R = 12
SS = 4   # 4 배로 그린 뒤 줄여 테두리를 부드럽게 (그 뒤 알파를 끊어 픽셀 느낌)

def canvas(): return Image.new("RGBA", (N * SS, N * SS), (0, 0, 0, 0))
def fin(im):
    im = im.resize((N, N), Image.LANCZOS); px = im.load()
    for y in range(N):
        for x in range(N):
            r, g, b, a = px[x, y]
            px[x, y] = (r, g, b, 0 if a < 90 else 255)
    return im
def P(v): return v * SS
def ell(d, cx, cy, rx, ry, col, out=None, w=0):
    d.ellipse([P(cx - rx), P(cy - ry), P(cx + rx), P(cy + ry)], fill=col, outline=out, width=w * SS)
def heart_pts(cx, cy, s, split=0.0, side=0):
    pts = []
    for k in range(0, 361, 6):
        t = math.radians(k)
        x = 16 * math.sin(t) ** 3; y = -(13 * math.cos(t) - 5 * math.cos(2 * t) - 2 * math.cos(3 * t) - math.cos(4 * t))
        if side == -1 and x > 0.5: x = 0.5
        if side == 1 and x < -0.5: x = -0.5
        pts.append((P(cx + x * s / 16 + side * split), P(cy + y * s / 16)))
    return pts

def heart(f):   # 톡 튀어나와 (크게 → 제 크기) 반짝이다 옅어짐
    im = canvas(); d = ImageDraw.Draw(im)
    sc = [0.35, 0.8, 1.12, 1.0, 1.0, 0.92][f]; a = 255   # 옅어지는 건 게임에서 (setObjAlpha)
    d.polygon(heart_pts(16, 17, 12 * sc), fill=(255, 110, 170, a), outline=(200, 40, 110, a), width=SS)
    ell(d, 12, 12, 2.2 * sc, 1.6 * sc, (255, 225, 240, a))
    if f in (3, 4):
        for (x, y) in ((26, 6), (5, 25)): d.polygon([(P(x), P(y - 3)), (P(x + 1), P(y)), (P(x), P(y + 3)), (P(x - 1), P(y))], fill=(255, 255, 255, 230)); d.polygon([(P(x - 3), P(y)), (P(x), P(y - 1)), (P(x + 3), P(y)), (P(x), P(y + 1))], fill=(255, 255, 255, 230))
    return fin(im)

def tear(f):   # 눈물이 맺혀 커지고 → 떨어져 → 톡 튐
    im = canvas(); d = ImageDraw.Draw(im)
    col, out = (150, 210, 255, 255), (60, 130, 220, 255)
    if f < 3:
        r = [2.5, 4, 5][f]; cy = 8 + f
        d.polygon([(P(16), P(cy - r * 1.8)), (P(16 + r), P(cy)), (P(16 - r), P(cy))], fill=col); ell(d, 16, cy, r, r, col, out, 1)
        ell(d, 14.8, cy - 0.8, r * 0.3, r * 0.3, (255, 255, 255, 255))
    elif f < 5:
        cy = [17, 25][f - 3]
        d.polygon([(P(16), P(cy - 9)), (P(20), P(cy)), (P(12), P(cy))], fill=col); ell(d, 16, cy, 4, 4, col, out, 1); ell(d, 14.8, cy - 1, 1.2, 1.2, (255, 255, 255, 255))
    else:
        for k in range(5):
            a = math.radians(200 + k * 35); ell(d, 16 + math.cos(a) * 8, 28 + math.sin(a) * 5, 1.6, 1.6, col)
        ell(d, 16, 29.5, 7, 1.5, (120, 190, 250, 200))
    return fin(im)

def wisp(f):   # 파랑 · 보라 불꽃이 일렁임 (6 프레임이 한 바퀴)
    im = canvas(); d = ImageDraw.Draw(im)
    ph = f / F * 2 * math.pi
    for layer, (col, sc) in enumerate((((110, 70, 230, 255), 1.0), ((120, 150, 255, 255), 0.72), ((220, 235, 255, 255), 0.42))):
        pts = []
        for k in range(0, 361, 8):
            t = math.radians(k)
            r = 9 * sc
            x = 16 + math.sin(t) * r * (1 - 0.35 * max(0, -math.cos(t)))
            y = 21 + math.cos(t) * r * 0.9
            if math.cos(t) < 0:   # 위쪽은 뾰족하게 늘어남 + 흔들림
                k2 = -math.cos(t); y -= k2 ** 2 * 11 * sc; x += math.sin(ph + k2 * 3) * 3 * k2 * sc
            pts.append((P(x), P(y)))
        d.polygon(pts, fill=col)
    return fin(im)

def reticle(f):   # 큰 조준 고리가 좁혀 들어옴 → 마지막에 번쩍
    im = canvas(); d = ImageDraw.Draw(im)
    r = [15, 12.5, 10, 8.5, 8, 8][f]; col = (255, 70, 60, 255) if f < 5 else (255, 230, 120, 255)
    w = 2
    d.ellipse([P(16 - r), P(16 - r), P(16 + r), P(16 + r)], outline=col, width=w * SS)
    for (dx, dy) in ((1, 0), (-1, 0), (0, 1), (0, -1)):
        d.line([(P(16 + dx * (r - 3)), P(16 + dy * (r - 3))), (P(16 + dx * (r + 3)), P(16 + dy * (r + 3)))], fill=col, width=w * SS)
    if f >= 4: ell(d, 16, 16, 1.6, 1.6, col)
    return fin(im)

def smoke(f):   # 검은 연기 뭉게뭉게 퍼지다 흩어짐
    im = canvas(); d = ImageDraw.Draw(im)
    sc = [0.35, 0.6, 0.82, 1.0, 1.1, 1.15][f]; a = 255
    for (x, y, r) in ((16, 18, 8), (10, 20, 6), (22, 20, 6.5), (13, 13, 6), (20, 12, 5.5)):
        ell(d, 16 + (x - 16) * sc, 18 + (y - 18) * sc, r * sc, r * sc, (40, 34, 52, a))
    for (x, y, r) in ((12, 12, 2.5), (19, 11, 2)):
        ell(d, 16 + (x - 16) * sc, 18 + (y - 18) * sc, r * sc, r * sc, (95, 85, 115, a))
    return fin(im)

def eerie(f):   # 물결치는 보라 고리가 퍼져 나감 (안쪽에서 새 고리)
    im = canvas(); d = ImageDraw.Draw(im)
    for q in range(2):
        t = (f / F + q * 0.5) % 1.0; r = 3 + t * 12; a = int(255 * (1 - t * 0.7))
        pts = [(P(16 + math.cos(math.radians(k)) * (r + math.sin(math.radians(k * 8) + f) * 1.4)), P(16 + math.sin(math.radians(k)) * (r + math.sin(math.radians(k * 8) + f) * 1.4))) for k in range(0, 361, 5)]
        d.line(pts, fill=(200, 120, 255, a), width=2 * SS)
    ell(d, 16, 16, 2, 2, (240, 210, 255, 255))
    return fin(im)

def aquaring(f):   # 물방울 여덟 개가 고리를 그리며 돎
    im = canvas(); d = ImageDraw.Draw(im)
    d.ellipse([P(4), P(4), P(28), P(28)], outline=(120, 200, 255, 150), width=SS)
    for k in range(8):
        a = math.radians(k * 45 + f * 7.5)
        x, y = 16 + math.cos(a) * 12, 16 + math.sin(a) * 12
        ell(d, x, y, 2.8, 2.8, (90, 170, 250, 255), (40, 110, 210, 255), 1); ell(d, x - 0.8, y - 0.8, 0.8, 0.8, (255, 255, 255, 255))
    return fin(im)

def rock(f):   # 뾰족한 바위가 돎 (6 프레임 = 반 바퀴 · 위아래 대칭이라 이어짐)
    im = canvas(); d = ImageDraw.Draw(im)
    a0 = f * 30
    base = [(0, -13), (5, -3), (7, 6), (0, 11), (-6, 7), (-5, -4)]
    rot = lambda p, a: (16 + p[0] * math.cos(math.radians(a)) - p[1] * math.sin(math.radians(a)), 16 + p[0] * math.sin(math.radians(a)) + p[1] * math.cos(math.radians(a)))
    pts = [rot(p, a0) for p in base]
    d.polygon([(P(x), P(y)) for x, y in pts], fill=(150, 130, 105, 255), outline=(70, 56, 42, 255), width=SS)
    face = [rot(p, a0) for p in ((0, -13), (5, -3), (0, 1), (-5, -4))]
    d.polygon([(P(x), P(y)) for x, y in face], fill=(200, 180, 150, 255))
    return fin(im)

def gust(f):   # 돌개바람: 휘어진 바람 줄기 셋이 돎
    im = canvas(); d = ImageDraw.Draw(im)
    for q in range(3):
        a0 = f * 40 + q * 120
        pts = []
        for k in range(0, 160, 8):
            r = 4 + k / 160 * 10
            a = math.radians(a0 + k)
            pts.append((P(16 + math.cos(a) * r), P(16 + math.sin(a) * r * 0.75)))
        d.line(pts, fill=(235, 248, 255, 255), width=2 * SS)
        d.line(pts[-6:], fill=(180, 220, 240, 255), width=SS)
    return fin(im)

def sparkle(f):   # 무지개 반짝임: 네 갈래 별이 돌며 커졌다 작아짐 · 색이 바뀜
    im = canvas(); d = ImageDraw.Draw(im)
    cols = [(255, 120, 120), (255, 200, 90), (140, 230, 120), (110, 200, 255), (180, 140, 255), (255, 140, 220)]
    sc = [0.5, 0.85, 1.0, 0.9, 1.0, 0.7][f]; a = math.radians(f * 15)
    for (L, wdt, col) in ((13 * sc, 3.2 * sc, cols[f] + (255,)), (8 * sc, 1.6 * sc, (255, 255, 255, 255))):
        pts = []
        for k in range(8):
            r = L if k % 2 == 0 else wdt
            t = a + math.radians(k * 45)
            pts.append((P(16 + math.cos(t) * r), P(16 + math.sin(t) * r)))
        d.polygon(pts, fill=col)
    return fin(im)

def split(f):   # 하트가 금 가며 두 쪽으로 갈라져 벌어짐
    im = canvas(); d = ImageDraw.Draw(im)
    sp = [0, 0, 1.2, 2.4, 3.6, 4.5][f]; a = 255
    for side in (-1, 1):
        d.polygon(heart_pts(16, 17, 9.5, sp, side), fill=(255, 110, 150, a), outline=(190, 40, 90, a), width=SS)
    if f >= 1:   # 금 (지그재그)
        zz = [(16, 7), (14, 11), (18, 15), (14, 19), (17, 23), (16, 27)]
        if f == 1: d.line([(P(x), P(y)) for x, y in zz], fill=(120, 20, 60, 255), width=SS)
    return fin(im)

def splash(f):   # 물보라: 물방울이 위로 튀었다 떨어짐
    im = canvas(); d = ImageDraw.Draw(im)
    t = f / (F - 1)
    for k in range(7):
        ang = math.radians(-160 + k * 23.3)
        sp = 9 + (k % 3) * 2.5
        x = 16 + math.cos(ang) * sp * t * 1.25
        y = 27 + math.sin(ang) * sp * t * 2.4 + 16 * t * t   # 위로 튀었다가 떨어짐
        ell(d, x, y, 2, 2.4, (120, 190, 255, 255), (50, 120, 220, 255), 1)
    if f < 3: ell(d, 16, 28, 4 + f * 3, 2, (100, 170, 245, 255))
    return fin(im)

ROWS = [heart, tear, wisp, reticle, smoke, eerie, aquaring, rock, gust, sparkle, split, splash]
out = Image.new("RGBA", (N * F, N * R), (0, 0, 0, 0))
for r, fn in enumerate(ROWS):
    for f in range(F): out.alpha_composite(fn(f), (f * N, r * N))
root = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
out.save(os.path.join(root, "aj6", "Pokémon - KeiKan", "assets", "textures", "battle", "fx_status.png"))
pv = Image.new("RGBA", (N * F * 4, N * R * 4), (70, 120, 70, 255)); pv.alpha_composite(out.resize((N * F * 4, N * R * 4), Image.NEAREST))
pv.save(os.path.join(root, "fxsrc", "fx_status_preview.png"))
print("ok")
