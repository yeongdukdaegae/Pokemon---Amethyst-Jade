# 하이드로볼 물 공 텍스쳐 (32 x 32 칸 4 개 = 128 x 32) — 물이 소용돌이치는 반투명 구 (칸 1 ~ 4 = 소용돌이가 도는 프레임)
#   왼쪽 위에서 빛을 받는 물방울 · 가장자리는 진한 파랑 테두리 · 안쪽에 흰 물결 띠가 돌며 · 반짝임 두 점
#   lib/battleCore.jbl 의 spHydroBall 이 프레임을 돌려 가며 씀 (공이 날면서 물이 소용돌이침)
#   python3 fxsrc/make_fx_waterball.py → aj6/Pokémon - KeiKan/assets/textures/battle/fx_waterball.png
from PIL import Image
import math, os
N = 32
PAL = [(26, 70, 170), (40, 105, 215), (62, 145, 240), (100, 185, 252), (150, 215, 255), (205, 238, 255)]
RIM = (20, 52, 130, 255)

def frame(ph):
    im = Image.new("RGBA", (N, N), (0, 0, 0, 0)); px = im.load()
    R = N / 2 - 1.2
    for y in range(N):
        for x in range(N):
            u = (x + 0.5 - N / 2) / R; v = (y + 0.5 - N / 2) / R
            d = math.hypot(u, v)
            if d > 1.0: continue
            if d > 0.9:
                px[x, y] = RIM; continue
            nz = math.sqrt(max(0, 1 - d * d))
            l = max(0, -0.55 * u - 0.6 * v + 0.58 * nz) * 0.8 + 0.2
            # 소용돌이 물결 띠: 각도 + 반지름에 따라 휘는 줄무늬 (ph 로 돎)
            a = math.atan2(v, u)
            w = math.sin(a * 2 + d * 7.0 - ph)
            if w > 0.72 and 0.25 < d < 0.86: l = min(1, l + 0.35)
            elif w < -0.8 and d < 0.86: l = max(0, l - 0.18)
            c = PAL[min(len(PAL) - 1, int(l * len(PAL)))]
            al = int(205 + 50 * (d ** 2))   # 가운데는 조금 비쳐 보이게
            px[x, y] = c + (al,)
    # 반짝임 (왼쪽 위 큰 점 + 오른쪽 아래 작은 점)
    for (hx, hy, r) in ((10.5, 9.5, 2.2), (21.5, 22.5, 1.0)):
        for y in range(N):
            for x in range(N):
                if math.hypot(x + 0.5 - hx, y + 0.5 - hy) <= r: px[x, y] = (255, 255, 255, 255)
    return im

out = Image.new("RGBA", (N * 4, N), (0, 0, 0, 0))
for k in range(4): out.alpha_composite(frame(k * math.pi / 2), (k * N, 0))
root = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
out.save(os.path.join(root, "aj6", "Pokémon - KeiKan", "assets", "textures", "battle", "fx_waterball.png"))
pv = Image.new("RGBA", (N * 4 * 6, N * 6), (60, 110, 60, 255)); pv.alpha_composite(out.resize((N * 4 * 6, N * 6), Image.NEAREST))
pv.save(os.path.join(root, "fxsrc", "fx_waterball_preview.png"))
print("ok")
