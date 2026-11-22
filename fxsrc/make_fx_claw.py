# 발톱 자국 텍스쳐 (32 x 32 칸 4 개 = 128 x 32) 를 만듦 — 흰색 · 회색이라 setObjColor 로 원하는 색을 입힘
#   python3 fxsrc/make_fx_claw.py → aj6/Pokémon - KeiKan/assets/textures/battle/fx_claw.png
#   칸: 1 그어지는 중 (앞 40 %) · 2 (앞 75 %) · 3 다 그어짐 · 4 가늘어지며 사라지는 중
#   오른쪽 위 → 왼쪽 아래로 조금 휜 줄 세 개 · 가운데 굵고 끝은 뾰족 · 속 흰색 + 테두리 연회색
from PIL import Image
import math, os
N = 32
CORE, EDGE = (255, 255, 255, 255), (185, 185, 185, 255)

def stroke(px, off, upto, wmul):
    # 줄 하나: t = 0 (오른쪽 위) → 1 (왼쪽 아래)
    for k in range(400):
        t = k / 399
        if t > upto: break
        x = 24 - 17 * t + off - 3.0 * math.sin(t * math.pi)   # 바깥으로 살짝 휨
        y = 4 + 24 * t + off * 0.45
        w = (0.5 + 1.3 * math.sin(t * math.pi) ** 0.8) * wmul * min(1.0, 0.35 + (upto - t) * 6)   # 그어지는 끝은 뾰족
        for yy in range(N):
            for xx in range(N):
                d = math.hypot(xx + 0.5 - x, yy + 0.5 - y)
                if d <= w - 0.9: px[(xx, yy)] = CORE
                elif d <= w and px.get((xx, yy)) != CORE: px[(xx, yy)] = EDGE

def cell(upto, wmul):
    px = {}
    for off in (-7, 0, 7):
        stroke(px, off, upto, wmul * (0.85 if off else 1.0))
    return px

cells = [cell(0.4, 1.0), cell(0.75, 1.0), cell(1.0, 1.0), cell(1.0, 0.55)]
im = Image.new("RGBA", (N * 4, N), (0, 0, 0, 0))
for i, px in enumerate(cells):
    for (x, y), c in px.items():
        if 0 <= x < N and 0 <= y < N: im.putpixel((i * N + x, y), c)
root = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
out = os.path.join(root, "aj6", "Pokémon - KeiKan", "assets", "textures", "battle", "fx_claw.png")
im.save(out)
pv = Image.new("RGBA", im.size, (40, 44, 60, 255)); pv.alpha_composite(im)
pv.resize((im.width * 6, im.height * 6), Image.NEAREST).save(os.path.join(root, "fxsrc", "fx_claw_preview.png"))
print("saved", out)
