# 고체 폭탄 공 텍스쳐 (24 x 24 칸 6 개 = 144 x 24) — 빛 덩어리가 아닌 "물건" 같은 공
#   python3 fxsrc/make_fx_ball.py → aj6/Pokémon - KeiKan/assets/textures/battle/fx_ball.png
#   칸: 1 알 (알폭탄) · 2 씨앗 (씨폭탄) · 3 진흙 덩이 (진흙폭탄) · 4 쇠 공 (마그넷봄) · 5 오물 덩이 (오물폭탄) · 6 시럽 방울 (시럽봄)
#   왼쪽 위에서 빛을 받는 구 · 색은 몇 단계로 끊어 픽셀 그림처럼 · 테두리는 진한 색
from PIL import Image
import math, os
N = 24

def shade(pal, l):   # l: 0 (어두움) ~ 1 (밝음) → 팔레트 단계
    return pal[min(len(pal) - 1, max(0, int(l * len(pal))))]

def ball(inside, pal, outline, spots=None, rough=0.0, hi=(255, 255, 255, 255)):
    im = Image.new("RGBA", (N, N), (0, 0, 0, 0))
    lx, ly, lz = -0.55, -0.6, 0.58
    for y in range(N):
        for x in range(N):
            u, v = (x + 0.5 - N / 2) / (N / 2 - 1), (y + 0.5 - N / 2) / (N / 2 - 1)
            r = inside(u, v)
            if r is None: continue
            if r == "edge":
                im.putpixel((x, y), outline); continue
            nx, ny = u, v
            nz = math.sqrt(max(0, 1 - nx * nx - ny * ny))
            l = max(0, nx * lx + ny * ly + nz * lz)
            l = l * 0.85 + 0.15 + rough * math.sin(x * 2.3 + y * 1.7) * math.sin(x * 1.1 - y * 2.9)
            c = shade(pal, l)
            if spots and spots(x, y): c = spots(x, y)
            if l > 0.97: c = hi
            im.putpixel((x, y), c)
    return im

def disc(ax, ay, edge=0.13):
    def f(u, v):
        d = (u / ax) ** 2 + (v / ay) ** 2
        if d > 1: return None
        if d > (1 - edge) ** 2: return "edge"
        return 1
    return f

def egg(u, v):   # 위가 좁은 알
    ax = 0.78 * (1 - 0.18 * (-v))
    d = (u / ax) ** 2 + (v / 0.98) ** 2
    if d > 1: return None
    if d > 0.8: return "edge"
    return 1

def mud(u, v):   # 울퉁불퉁한 흙덩이
    a = math.atan2(v, u)
    rr = 0.92 + 0.08 * math.sin(a * 5) + 0.05 * math.sin(a * 9 + 1)
    d = math.hypot(u, v) / rr
    if d > 1: return None
    if d > 0.86: return "edge"
    return 1

EGG = [(214, 200, 168, 255), (236, 226, 200, 255), (250, 246, 232, 255), (255, 255, 250, 255)]
SEED = [(70, 46, 22, 255), (112, 76, 36, 255), (150, 108, 52, 255), (190, 150, 84, 255)]
MUD = [(64, 42, 24, 255), (96, 64, 36, 255), (128, 90, 52, 255), (160, 120, 74, 255)]
STEEL = [(84, 94, 110, 255), (128, 140, 156, 255), (176, 188, 202, 255), (218, 226, 236, 255)]

def egg_spots(x, y):   # 연두 · 노란 무늬 (알폭탄의 알)
    if (x - 9) ** 2 + (y - 15) ** 2 <= 3 or (x - 15) ** 2 + (y - 10) ** 2 <= 2 or (x - 14) ** 2 + (y - 18) ** 2 <= 2:
        return (150, 210, 90, 255)
    return None

def seed_spots(x, y):   # 씨앗 끝의 초록 싹
    if y <= 6 and abs(x - 12) <= (6 - y) // 2 + 1 and y >= 2:
        return (90, 190, 70, 255)
    return None

def steel_spots(x, y):   # 가운데 띠 (자석 공)
    if 11 <= y <= 12 and 3 <= x <= 20:
        return (70, 80, 96, 255)
    return None


def sludge(u, v):   # 출렁이는 오물 덩이 + 아래로 처진 방울
    a = math.atan2(v, u)
    rr = 0.86 + 0.07 * math.sin(a * 4 + 0.6) + 0.04 * math.sin(a * 7)
    if v > 0.3: rr += 0.12 * max(0, math.cos((u - 0.25) * 6)) * (v - 0.3) * 2.2   # 처진 방울
    d = math.hypot(u, v) / rr
    if d > 1: return None
    if d > 0.86: return "edge"
    return 1

def syrup(u, v):   # 물방울 모양 (아래는 둥글고 위는 뾰족) · 테두리는 바깥 1 칸 이웃을 보고 정함
    def inside(u, v):
        if u * u + (v - 0.22) ** 2 <= 0.74 ** 2: return True
        if -0.95 <= v <= 0.22:
            return abs(u) <= 0.74 * ((v + 0.95) / 1.17) ** 0.85
        return False
    if not inside(u, v): return None
    e = 2.0 / (N - 2)
    for du, dv in ((e, 0), (-e, 0), (0, e), (0, -e)):
        if not inside(u + du, v + dv): return "edge"
    return 1

SLUDGE = [(70, 30, 96, 255), (110, 50, 150, 255), (150, 80, 196, 255), (190, 130, 230, 255)]
SYRUP = [(150, 70, 10, 255), (200, 110, 20, 255), (236, 150, 40, 255), (255, 196, 90, 255)]

def sludge_spots(x, y):   # 떠오르는 거품 (연보라 · 가운데 반짝)
    for cx, cy in ((9, 9), (15, 14), (8, 16)):
        d = (x - cx) ** 2 + (y - cy) ** 2
        if d == 0: return (240, 220, 255, 255)
        if d <= 2: return (196, 140, 236, 255)
    return None

def syrup_spots(x, y):   # 윤기 (왼쪽의 밝은 줄 + 아래 반사)
    if x == 8 and 11 <= y <= 16: return (255, 236, 170, 255)
    if y == 19 and 13 <= x <= 15: return (255, 214, 130, 255)
    return None

cells = [
    ball(egg, EGG, (150, 132, 100, 255), egg_spots),
    ball(disc(0.72, 0.95), SEED, (46, 30, 14, 255), seed_spots),
    ball(mud, MUD, (44, 28, 16, 255), None, rough=0.12),
    ball(disc(0.95, 0.95), STEEL, (56, 62, 74, 255), steel_spots),
    ball(sludge, SLUDGE, (46, 16, 64, 255), sludge_spots),
    ball(syrup, SYRUP, (110, 48, 6, 255), syrup_spots),
]
im = Image.new("RGBA", (N * len(cells), N), (0, 0, 0, 0))
for i, c in enumerate(cells): im.paste(c, (i * N, 0))
root = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
out = os.path.join(root, "aj6", "Pokémon - KeiKan", "assets", "textures", "battle", "fx_ball.png")
im.save(out)
pv = Image.new("RGBA", im.size, (60, 120, 200, 255)); pv.alpha_composite(im)
pv.resize((im.width * 8, im.height * 8), Image.NEAREST).save(os.path.join(root, "fxsrc", "fx_ball_preview.png"))
print("saved", out)
