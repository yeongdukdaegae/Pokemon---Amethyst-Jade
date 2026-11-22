# 가루 텍스쳐 (16 x 16 칸 3 개 = 48 x 16) — 가루 기술 (lib/battleCore.jbl 의 spPowder)
#   말 그대로 가루: 작은 알갱이 (1 픽셀 · 가끔 2 픽셀) 가 흩어진 한 줌 · 흰색 ~ 연회색이라 setObjColor 로 색을 입힘 · 가운데가 빽빽하고 가장자리가 성김
#   python3 fxsrc/make_fx_powder.py → aj6/Pokémon - KeiKan/assets/textures/battle/fx_powder.png
from PIL import Image
import math, os, random

C = 16
def cell(seed, n):
    random.seed(seed)
    im = Image.new("RGBA", (C, C), (0, 0, 0, 0)); px = im.load()
    for _ in range(n):
        r = abs(random.gauss(0, 4.2))   # 가운데에 조금 몰림
        a = random.uniform(0, 2 * math.pi)
        x = int(round(C / 2 - 0.5 + math.cos(a) * r)); y = int(round(C / 2 - 0.5 + math.sin(a) * r))
        if not (0 <= x < C and 0 <= y < C):
            continue
        v = random.choice((255, 255, 235, 210))
        px[x, y] = (v, v, v, 255)
        if random.random() < 0.18 and x + 1 < C:   # 가끔 2 픽셀 알갱이
            px[x + 1, y] = (v, v, v, 255)
    return im

out = Image.new("RGBA", (C * 3, C), (0, 0, 0, 0))
for k, n in enumerate((22, 18, 26)):
    out.alpha_composite(cell(k + 7, n), (k * C, 0))
root = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
out.save(os.path.join(root, "aj6", "Pokémon - KeiKan", "assets", "textures", "battle", "fx_powder.png"))
cols = [(192, 128, 240), (255, 224, 96), (128, 224, 192), (200, 232, 144), (255, 255, 255), (255, 96, 80)]
pv = Image.new("RGBA", (C * 8 * 6, C * 8), (40, 44, 60, 255))
for k, col in enumerate(cols):
    g = out.crop(((k % 3) * C, 0, (k % 3 + 1) * C, C)); p = g.load()
    for y in range(C):
        for x in range(C):
            r, gg, b, a = p[x, y]
            p[x, y] = (r * col[0] // 255, gg * col[1] // 255, b * col[2] // 255, a)
    pv.alpha_composite(g.resize((C * 8, C * 8), Image.NEAREST), (k * C * 8, 0))
pv.save(os.path.join(root, "fxsrc", "fx_powder_preview.png"))
print("ok")
