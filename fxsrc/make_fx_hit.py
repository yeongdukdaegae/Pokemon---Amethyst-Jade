# 타격 아이콘 텍스쳐 (32 x 32 칸 2 개 = 64 x 32): 1 주먹 · 2 발바닥 — 펀치 · 킥 기술 (lib/battleCore.jbl 의 spImpact)
#   DPPt (다이아몬드 · 펄 · 플라티나) 의 타격 아이콘 느낌: 흰 몸 · 연회색 그늘 · 짙은 테두리 1 픽셀 (흰색이라 setObjColor 로 타입 색을 입힐 수 있음)
#   python3 fxsrc/make_fx_hit.py → aj6/Pokémon - KeiKan/assets/textures/battle/fx_hit.png
from PIL import Image, ImageDraw
import os

C = 32
OUT = (56, 56, 68, 255)     # 테두리
LINE = (150, 150, 160, 255) # 손가락 · 발가락 사이 금
SH = (204, 206, 214, 255)   # 그늘 (오른쪽 아래)
W = (255, 255, 255, 255)

def outline(im):
    # 칠한 곳 (알파 > 0) 의 바깥 둘레 한 줄을 테두리 색으로
    px = im.load(); n = im.size[0]
    m = [[px[x, y][3] > 0 for x in range(n)] for y in range(n)]
    for y in range(n):
        for x in range(n):
            if m[y][x]:
                continue
            if any(0 <= x + dx < n and 0 <= y + dy < n and m[y + dy][x + dx] for dx, dy in ((1, 0), (-1, 0), (0, 1), (0, -1))):
                px[x, y] = OUT

def fist():
    im = Image.new("RGBA", (C, C), (0, 0, 0, 0)); d = ImageDraw.Draw(im)
    # 손등 (둥근 네모 · 손목 없음)
    d.rounded_rectangle([6, 5, 25, 23], radius=5, fill=W)
    # 그늘: 오른쪽 · 아래
    d.rounded_rectangle([20, 7, 25, 23], radius=3, fill=SH)
    d.rectangle([6, 20, 25, 23], fill=SH)
    # 손가락 네 마디 (위쪽 반): 하나씩 둥글게 → 위 끝이 울퉁불퉁 (마디) · 사이 금
    d.rectangle([6, 9, 25, 15], fill=W)
    for k, x in enumerate((6, 11, 16, 21)):
        d.rounded_rectangle([x, 4, x + 4, 15], radius=2, fill=SH if k == 3 else W)
    for x in (10, 15, 20):
        d.line([x, 6, x, 14], fill=LINE)
    d.line([7, 14, 24, 14], fill=LINE)   # 손가락 끝 (접힌 곳)
    # 엄지: 손가락 아래를 가로지름 (왼쪽에서)
    d.rounded_rectangle([6, 15, 19, 19], radius=2, fill=W, outline=LINE)
    # 반짝임
    d.point([(8, 7), (9, 7), (8, 8)], fill=W)
    outline(im)
    sh = Image.new("RGBA", (C, C), (0, 0, 0, 0)); sh.alpha_composite(im, (0, 2))
    return sh

def blob(d, x0, y0, x1, y1, col):
    # 모서리를 깎은 네모 (작은 발가락)
    d.rectangle([x0, y0, x1, y1], fill=col)
    if x1 - x0 >= 2 and y1 - y0 >= 2:
        for (x, y) in ((x0, y0), (x1, y0), (x0, y1), (x1, y1)):
            d.point((x, y), fill=(0, 0, 0, 0))

def foot():
    im = Image.new("RGBA", (C, C), (0, 0, 0, 0)); d = ImageDraw.Draw(im)
    # 발바닥 (앞쪽이 넓고 뒤꿈치가 좁음) — 위 끝 y 10
    d.ellipse([7, 10, 25, 23], fill=W)
    d.ellipse([10, 17, 22, 29], fill=W)
    d.rectangle([10, 16, 22, 24], fill=W)
    # 장심 (안쪽 움푹한 곳) · 뒤꿈치 오른쪽 그늘
    d.ellipse([20, 14, 25, 23], fill=SH)
    d.ellipse([18, 22, 22, 28], fill=SH)
    # 발가락 다섯: 사이 · 발바닥과의 사이를 1 픽셀씩 띄움 → 테두리가 그 틈을 채워 하나하나 나뉨
    blob(d, 6, 3, 10, 8, W)     # 엄지
    blob(d, 12, 2, 14, 7, W)
    blob(d, 16, 2, 18, 7, W)
    blob(d, 20, 4, 22, 8, W)
    blob(d, 24, 6, 25, 8, SH)   # 새끼 (그늘 쪽)
    d.point([(7, 4), (8, 4), (9, 13), (10, 12)], fill=W)
    outline(im)
    return im

out = Image.new("RGBA", (C * 2, C), (0, 0, 0, 0))
out.alpha_composite(fist(), (0, 0))
out.alpha_composite(foot(), (C, 0))
root = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
out.save(os.path.join(root, "aj6", "Pokémon - KeiKan", "assets", "textures", "battle", "fx_hit.png"))
# 미리 보기: 격투 타입 색 (기본) · 불꽃 · 얼음 · 전기 · 강철 · 고스트 색을 입힌 주먹 + 발바닥
cols = [(224, 156, 48), (255, 140, 80), (150, 230, 255), (255, 225, 70), (190, 205, 225), (160, 110, 210)]
pv = Image.new("RGBA", (C * 6 * 7, C * 6), (40, 44, 60, 255))
for k, col in enumerate(cols + [None]):
    g = out.crop((0, 0, C, C)) if col else out.crop((C, 0, C * 2, C))
    col = col or (224, 156, 48)
    p = g.load()
    for y in range(C):
        for x in range(C):
            r, gg, b, a = p[x, y]
            p[x, y] = (r * col[0] // 255, gg * col[1] // 255, b * col[2] // 255, a)
    pv.alpha_composite(g.resize((C * 6, C * 6), Image.NEAREST), (k * C * 6, 0))
pv.save(os.path.join(root, "fxsrc", "fx_hit_preview.png"))
print("ok")
