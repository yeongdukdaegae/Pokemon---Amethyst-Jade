# 베기 자국 텍스쳐 (48 x 48 한 칸) — 베기 기술 (lib/battleCore.jbl 의 spSlash)
#   발톱 자국 (fx_claw.png) 과 비슷하지만 하나 · 크고 얇은 초승달 줄기 (가운데가 가장 굵고 양 끝이 바늘처럼 가늘어짐) · 흰 심 + 연회색 가장자리 (setObjColor 로 색을 입힐 수 있음)
#   오른쪽 위 → 왼쪽 아래로 휘어진 한 줄 (게임에서 rotateObj 로 기울기를 바꿈)
#   python3 fxsrc/make_fx_slash.py → aj6/Pokémon - KeiKan/assets/textures/battle/fx_slash.png
from PIL import Image
import math, os

N = 48
im = Image.new("RGBA", (N, N), (0, 0, 0, 0)); px = im.load()
# 큰 원의 호 (반지름 R · 가운데는 칸 밖 오른쪽 아래) 를 따라 굵기가 변하는 줄기
R = 42.0; cx, cy = N * 0.96, N * 0.96
a0, a1 = math.radians(188), math.radians(262)   # 호의 시작 · 끝 각도
for y in range(N):
    for x in range(N):
        dx, dy = x + 0.5 - cx, y + 0.5 - cy
        d = math.hypot(dx, dy); a = math.atan2(dy, dx) % (2 * math.pi)
        if not (a0 <= a <= a1):
            continue
        t = (a - a0) / (a1 - a0)            # 0 ~ 1 (줄기를 따라)
        w = 1.8 * math.sin(math.pi * t) ** 0.9   # 굵기: 가운데 1.8 · 끝 0 (얇게)
        off = abs(d - R)
        if off <= w:
            core = off <= w * 0.45
            px[x, y] = (255, 255, 255, 255) if core else (205, 210, 222, 255)
root = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
im.save(os.path.join(root, "aj6", "Pokémon - KeiKan", "assets", "textures", "battle", "fx_slash.png"))
pv = Image.new("RGBA", (N, N), (40, 44, 60, 255)); pv.alpha_composite(im)
pv.resize((N * 6, N * 6), Image.NEAREST).save(os.path.join(root, "fxsrc", "fx_slash_preview.png"))
print("ok")
