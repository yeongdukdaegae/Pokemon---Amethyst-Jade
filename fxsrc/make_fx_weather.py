# 날씨 텍스쳐 (16 x 16 칸 4 개 = 64 x 16) — 배틀의 날씨 연출 (assets/codes/battle/weatherFx.jb)
#   1 빗줄기 (가늘고 기운 줄 · 위가 옅고 아래가 진함 · 연한 하늘빛 흰색)
#   2 모래 (작은 알갱이 몇 개 · 누런 모래색)
#   3 눈송이 (작은 육각 눈 결정 · 흰색 + 하늘빛 가장자리)
#   4 햇빛 알갱이 (부드러운 빛 점 · 가운데 흰색 → 가장자리 옅은 노랑)
#   게임에서 반투명 (알파를 낮춰) 으로 써서 보이되 방해가 안 되게
#   python3 fxsrc/make_fx_weather.py → aj6/Pokémon - KeiKan/assets/textures/battle/fx_weather.png
from PIL import Image
import math, os, random

def rain():
    im = Image.new("RGBA", (16, 16), (0, 0, 0, 0)); px = im.load()
    for k in range(14):   # 위 (k 0) → 아래 (k 13) · 오른쪽 위에서 왼쪽 아래로 조금 기욺
        x = 10 - k * 0.4; y = 1 + k
        a = int(70 + 185 * k / 13)
        px[int(round(x)), y] = (235, 245, 255, a)
        px[int(round(x)) + 1, y] = (205, 225, 250, int(a * 0.7))   # 2 픽셀 굵기 (오른쪽은 조금 옅게)
    return im

def sand():
    random.seed(3); im = Image.new("RGBA", (16, 16), (0, 0, 0, 0)); px = im.load()
    for _ in range(7):
        x = int(random.gauss(8, 2.4)); y = int(random.gauss(8, 2.4))
        if 0 <= x < 15 and 0 <= y < 16:
            c = random.choice([(222, 190, 130), (200, 165, 105), (238, 212, 160)])
            px[x, y] = c + (255,)
            if random.random() < 0.4: px[x + 1, y] = c + (255,)
    return im

def snow():
    im = Image.new("RGBA", (16, 16), (0, 0, 0, 0)); px = im.load()
    cx = cy = 7.5
    for a in range(0, 360, 60):   # 육각 결정의 여섯 팔
        for r in range(0, 6):
            x = cx + math.cos(math.radians(a)) * r; y = cy + math.sin(math.radians(a)) * r
            px[int(round(x)), int(round(y))] = (255, 255, 255, 255) if r < 4 else (200, 230, 255, 255)
    for (dx, dy) in ((0, 0), (1, 0), (0, 1), (-1, 0), (0, -1)):
        px[int(cx) + dx, int(cy) + dy] = (255, 255, 255, 255)
    return im

def mote():
    im = Image.new("RGBA", (16, 16), (0, 0, 0, 0)); px = im.load()
    for y in range(16):
        for x in range(16):
            d = math.hypot(x - 7.5, y - 7.5)
            if d < 7:
                t = d / 7
                px[x, y] = (255, int(255 - 40 * t), int(235 - 120 * t), int(255 * (1 - t) ** 1.5))
    return im

out = Image.new("RGBA", (64, 16), (0, 0, 0, 0))
for k, f in enumerate((rain, sand, snow, mote)):
    out.alpha_composite(f(), (k * 16, 0))
root = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
out.save(os.path.join(root, "aj6", "Pokémon - KeiKan", "assets", "textures", "battle", "fx_weather.png"))
pv = Image.new("RGBA", (64 * 8, 16 * 8), (60, 110, 60, 255)); pv.alpha_composite(out.resize((64 * 8, 16 * 8), Image.NEAREST))
pv.save(os.path.join(root, "fxsrc", "fx_weather_preview.png"))
print("ok")
