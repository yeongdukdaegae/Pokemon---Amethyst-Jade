# 보석 바위 텍스쳐 (24 x 24 칸 4 개 · 가로로 이어 붙임 = 96 x 24) — 파워젬 (lib/battleCore.jbl 의 spGems)
#   흰색 ~ 회색 조각면으로 그려서 setObjColor 로 밝은 색을 입힘 · 모서리가 조금 날카로운 바위 모양 · 윗면 왼쪽이 밝음 (빛이 왼쪽 위)
#   python3 fxsrc/make_fx_gem.py → aj6/Pokémon - KeiKan/assets/textures/battle/fx_gem.png
from PIL import Image, ImageDraw
import math, os, random

C = 24
SHAPES = [   # 꼭짓점 (각도 · 반지름) — 조금씩 다른 바위 4 개
    [(-90, 10.5), (-35, 9.0), (10, 10.5), (60, 8.5), (110, 10.0), (165, 8.0), (215, 10.0)],
    [(-80, 9.5), (-20, 10.5), (40, 8.0), (95, 10.5), (150, 9.0), (200, 10.5), (250, 8.0)],
    [(-100, 10.0), (-45, 8.5), (0, 10.5), (70, 9.5), (130, 10.5), (190, 8.5)],
    [(-70, 10.5), (-10, 8.5), (45, 10.0), (100, 8.0), (145, 10.5), (205, 9.0), (255, 9.5)],
]

def cell(spec, seed):
    random.seed(seed)
    im = Image.new("RGBA", (C, C), (0, 0, 0, 0))
    d = ImageDraw.Draw(im)
    cx, cy = C / 2 - 0.5, C / 2 - 0.5
    pts = [(cx + math.cos(math.radians(a)) * r, cy + math.sin(math.radians(a)) * r) for a, r in spec]
    # 가운데에서 조금 왼쪽 위 (윗면) 를 꼭짓점으로 조각면을 나눔
    px, py = cx - 1.5, cy - 2.0
    for i in range(len(pts)):
        a, b = pts[i], pts[(i + 1) % len(pts)]
        mx, my = (a[0] + b[0]) / 2 - cx, (a[1] + b[1]) / 2 - cy
        lit = (-mx * 0.7 - my * 0.7) / max(1e-6, math.hypot(mx, my))   # 빛 (왼쪽 위) 쪽이면 1
        v = int(228 + 27 * lit)   # 201 ~ 255 (밝게)
        d.polygon([(px, py), a, b], fill=(v, v, v, 255))
    # 윗면 (가운데 작은 조각) 은 가장 밝게
    top = [(px + (p[0] - px) * 0.38, py + (p[1] - py) * 0.38) for p in pts]
    d.polygon(top, fill=(255, 255, 255, 255))
    # 테두리 (어두운 회색 · 색을 입히면 진한 같은 색)
    d.polygon(pts, outline=(160, 160, 160, 255))
    # 반짝임 두 점
    d.point([(int(px - 1), int(py - 1)), (int(px), int(py - 2))], fill=(255, 255, 255, 255))
    return im

out = Image.new("RGBA", (C * len(SHAPES), C), (0, 0, 0, 0))
for k, sp in enumerate(SHAPES):
    out.alpha_composite(cell(sp, k), (k * C, 0))
root = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
out.save(os.path.join(root, "aj6", "Pokémon - KeiKan", "assets", "textures", "battle", "fx_gem.png"))
# 미리 보기: 색을 입힌 모습 (게임과 같게 곱하기)
cols = [(255, 122, 138), (255, 216, 74), (122, 240, 255), (156, 255, 122), (200, 156, 255), (255, 176, 90)]
pv = Image.new("RGBA", (C * 6 * 6, C * 6), (40, 44, 60, 255))
for k, col in enumerate(cols):
    g = out.crop(((k % 4) * C, 0, (k % 4 + 1) * C, C))
    px = g.load()
    for y in range(C):
        for x in range(C):
            r, gg, b, a = px[x, y]
            px[x, y] = (r * col[0] // 255, gg * col[1] // 255, b * col[2] // 255, a)
    pv.alpha_composite(g.resize((C * 6, C * 6), Image.NEAREST), (k * C * 6, 0))
pv.save(os.path.join(root, "fxsrc", "fx_gem_preview.png"))
print("ok")
