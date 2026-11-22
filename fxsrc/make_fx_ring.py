# 파동 고리 텍스쳐 (32 x 32 · 흰색이라 setObjColor 로 색을 입힘) — 가운데가 빈 고리 · 바깥 · 안쪽 테두리는 연회색
#   python3 fxsrc/make_fx_ring.py → aj6/Pokémon - KeiKan/assets/textures/battle/fx_ring.png
from PIL import Image
import math, os
N = 32
im = Image.new("RGBA", (N, N), (0, 0, 0, 0))
for y in range(N):
    for x in range(N):
        d = math.hypot(x + 0.5 - N / 2, y + 0.5 - N / 2)
        if 11.5 <= d <= 15.5:
            core = 12.6 <= d <= 14.4
            im.putpixel((x, y), (255, 255, 255, 255) if core else (190, 190, 190, 255))
root = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
im.save(os.path.join(root, "aj6", "Pokémon - KeiKan", "assets", "textures", "battle", "fx_ring.png"))
pv = Image.new("RGBA", im.size, (40, 44, 60, 255)); pv.alpha_composite(im)
pv.resize((N * 8, N * 8), Image.NEAREST).save(os.path.join(root, "fxsrc", "fx_ring_preview.png"))
print("ok")
