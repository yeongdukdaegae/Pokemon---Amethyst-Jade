# 장판 (설치) 기술 텍스쳐 (32 x 32 칸 4 개 = 128 x 32) — 배틀 중 그 쪽 발판 둘레에 깔려 있는 모습 (lib/battleCore.jbl 의 hazDraw)
#   칸: 1 뾰족 바위 (스텔스록 · 떠다님) · 2 압정 (압정뿌리기 · 회색 쇠 네 갈래) · 3 독압정 (보라 · 끝에 독 방울) · 4 끈적끈적네트 (흰 거미줄 · 납작하게 깔아 씀)
#   python3 fxsrc/make_fx_hazard.py → aj6/Pokémon - KeiKan/assets/textures/battle/fx_hazard.png
from PIL import Image, ImageDraw
import math, os
N = 32; SS = 4; W = N * SS
def P(v): return v * SS
def fin(im):
    im = im.resize((N, N), Image.LANCZOS); px = im.load()
    for y in range(N):
        for x in range(N):
            r, g, b, a = px[x, y]; px[x, y] = (r, g, b, 0 if a < 90 else 255)
    return im
def rock():
    im = Image.new("RGBA", (W, W), (0, 0, 0, 0)); d = ImageDraw.Draw(im)
    pts = [(16, 2), (23, 12), (25, 22), (16, 30), (7, 23), (9, 11)]
    d.polygon([(P(x), P(y)) for x, y in pts], fill=(150, 128, 100, 255), outline=(66, 52, 40, 255), width=SS * 2)
    d.polygon([(P(16), P(2)), (P(23), P(12)), (P(16), P(17)), (P(9), P(11))], fill=(205, 184, 150, 255))
    d.line([(P(16), P(17)), (P(16), P(29))], fill=(110, 92, 70, 255), width=SS)
    return fin(im)
def caltrop(col, edge, tip=None):
    im = Image.new("RGBA", (W, W), (0, 0, 0, 0)); d = ImageDraw.Draw(im)
    c = (16, 19)
    for a, L in ((-90, 14), (210, 11), (330, 11), (90, 6)):   # 위 · 왼아래 · 오른아래 · 아래 (짧게 = 뒤로 숨음)
        t = math.radians(a); ex, ey = c[0] + math.cos(t) * L, c[1] + math.sin(t) * L
        nx, ny = -math.sin(t) * 4.6, math.cos(t) * 4.6
        d.polygon([(P(c[0] + nx), P(c[1] + ny)), (P(ex), P(ey)), (P(c[0] - nx), P(c[1] - ny))], fill=col, outline=edge, width=SS)
        if tip and a == -90: d.ellipse([P(ex - 2.6), P(ey - 1), P(ex + 2.6), P(ey + 4.2)], fill=tip, outline=edge, width=SS)
    d.ellipse([P(c[0] - 4.5), P(c[1] - 4.5), P(c[0] + 4.5), P(c[1] + 4.5)], fill=col, outline=edge, width=SS)
    d.line([(P(c[0] - 1), P(c[1] - 9)), (P(c[0] - 1), P(c[1] - 3))], fill=(255, 255, 255, 200), width=SS)
    return fin(im)
def web():
    im = Image.new("RGBA", (W, W), (0, 0, 0, 0)); d = ImageDraw.Draw(im)
    c = (16, 16); col = (245, 245, 250, 255)
    for k in range(8):
        t = math.radians(k * 45 + 10)
        d.line([(P(c[0]), P(c[1])), (P(c[0] + math.cos(t) * 15), P(c[1] + math.sin(t) * 15))], fill=col, width=SS)
    for r in (4, 8, 12):
        pts = [(P(c[0] + math.cos(math.radians(k * 45 + 10)) * r), P(c[1] + math.sin(math.radians(k * 45 + 10)) * r)) for k in range(9)]
        d.line(pts, fill=col, width=SS)
    return fin(im)
cells = [rock(), caltrop((170, 176, 190, 255), (60, 64, 80, 255)), caltrop((176, 110, 210, 255), (70, 30, 90, 255), (210, 90, 240, 255)), web()]
out = Image.new("RGBA", (N * 4, N), (0, 0, 0, 0))
for i, c in enumerate(cells): out.alpha_composite(c, (i * N, 0))
root = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
out.save(os.path.join(root, "aj6", "Pokémon - KeiKan", "assets", "textures", "battle", "fx_hazard.png"))
pv = Image.new("RGBA", (N * 4 * 6, N * 6), (70, 120, 70, 255)); pv.alpha_composite(out.resize((N * 4 * 6, N * 6), Image.NEAREST))
pv.save(os.path.join(root, "fxsrc", "fx_hazard_preview.png"))
print("ok")
