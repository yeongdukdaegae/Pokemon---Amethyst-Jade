# 능력 변화 화살표 (16 x 16 칸 2 개 = 32 x 16: 1 오름 · 2 내림) + 방패 (48 x 48 칸 2 개 = 96 x 48: 1 강철 방패 · 2 배리어)
#   화살표: 본가 느낌 (테두리 없이 밝은 화살촉 + 옅어지는 빛 꼬리 · 흰색이라 setObjColor 로 색을 입힘 · 랭크 오름 빨강 / 내림 파랑) — lib/battleCore.jbl 의 statFx · spBoost
#   방패: 강철 = 회색 금속 (위가 밝고 아래가 어두움 · 테두리 · 리벳 · 가운데 무늬) · 배리어 = 같은 모양의 반투명 하늘색 유리 (빗금 반짝임) — spShieldSlam
#   python3 fxsrc/make_fx_stat.py → aj6/Pokémon - KeiKan/assets/textures/battle/fx_stat.png · fx_shield.png
from PIL import Image, ImageDraw
import os

root = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
OUT = (56, 56, 68, 255)

def outline(im, col=OUT):
    px = im.load(); n, m = im.size
    mask = [[px[x, y][3] > 0 for x in range(n)] for y in range(m)]
    for y in range(m):
        for x in range(n):
            if mask[y][x]:
                continue
            if any(0 <= x + dx < n and 0 <= y + dy < m and mask[y + dy][x + dx] for dx, dy in ((1, 0), (-1, 0), (0, 1), (0, -1))):
                px[x, y] = col

# ── 화살표 (본가 느낌): 테두리 없이 · 밝은 화살촉 + 아래로 갈수록 옅어지는 빛 꼬리 (가운데가 흰색 · 가장자리가 연회색) — 색을 입히면 빛나는 화살표
def arrow():
    im = Image.new("RGBA", (16, 16), (0, 0, 0, 0)); px = im.load()
    for y in range(16):
        for x in range(16):
            dx = abs(x - 7.5)
            a = 0; v = 255
            if y <= 7:   # 화살촉: 위 꼭짓점 (y 0) → 아래 (y 7) 로 넓어짐 (반폭 0.5 → 7)
                hw = 0.5 + y * 0.93
                if dx <= hw:
                    a = 255
                    v = 255 if dx <= hw * 0.45 else 222
                    if y == 7 and dx > 2.5:   # 화살촉 아래 끝 (양 날개) 은 조금 옅게
                        a = 200
            else:        # 꼬리: 반폭 2.5 · 아래로 갈수록 옅어짐
                if dx <= 2.5:
                    a = int(235 * (1 - (y - 8) / 8.5))
                    v = 255 if dx <= 1.0 else 215
            if a > 0:
                px[x, y] = (v, v, v, a)
    return im
up = arrow(); dn = up.transpose(Image.FLIP_TOP_BOTTOM)
st = Image.new("RGBA", (32, 16), (0, 0, 0, 0)); st.alpha_composite(up, (0, 0)); st.alpha_composite(dn, (16, 0))
st.save(os.path.join(root, "aj6", "Pokémon - KeiKan", "assets", "textures", "battle", "fx_stat.png"))

# ── 방패 (위가 평평하고 아래가 뾰족한 방패)
def shield_mask():
    im = Image.new("L", (48, 48), 0); d = ImageDraw.Draw(im)
    d.polygon([(6, 5), (42, 5), (42, 22), (36, 34), (24, 44), (12, 34), (6, 22)], fill=255)
    return im
def steel():
    m = shield_mask(); im = Image.new("RGBA", (48, 48), (0, 0, 0, 0)); px = im.load(); mp = m.load()
    for y in range(48):
        for x in range(48):
            if mp[x, y]:
                v = int(225 - (y - 5) * 2.2 + (x < 24) * 10)   # 위 밝음 · 아래 어두움 · 왼쪽 조금 밝음
                v = max(110, min(240, v))
                px[x, y] = (v, v + 4, v + 12, 255)
    d = ImageDraw.Draw(im)
    # 안쪽 테두리 (두 줄 금속 띠)
    d.polygon([(9, 8), (39, 8), (39, 21), (34, 31), (24, 40), (14, 31), (9, 21)], outline=(150, 156, 170, 255))
    # 가운데 무늬 (세로 띠 + 가로 띠)
    d.rectangle([22, 9, 26, 38], fill=(190, 196, 210, 255)); d.rectangle([10, 17, 38, 20], fill=(190, 196, 210, 255))
    # 리벳
    for (x, y) in ((9, 8), (38, 8), (9, 20), (38, 20), (24, 39)):
        d.rectangle([x, y, x + 1, y + 1], fill=(250, 250, 255, 255))
    # 반짝임
    d.line([(12, 10), (17, 10)], fill=(255, 255, 255, 255)); d.line([(12, 11), (14, 11)], fill=(255, 255, 255, 255))
    outline(im, (40, 44, 56, 255))
    return im
def barrier():
    m = shield_mask(); im = Image.new("RGBA", (48, 48), (0, 0, 0, 0)); px = im.load(); mp = m.load()
    for y in range(48):
        for x in range(48):
            if mp[x, y]:
                shine = (x + y) % 9 in (0, 1)   # 빗금 반짝임
                px[x, y] = (235, 250, 255, 220) if shine else (150, 220, 255, 140)
    d = ImageDraw.Draw(im)
    d.polygon([(9, 8), (39, 8), (39, 21), (34, 31), (24, 40), (14, 31), (9, 21)], outline=(230, 250, 255, 230))
    outline(im, (90, 190, 240, 255))
    return im
sh = Image.new("RGBA", (96, 48), (0, 0, 0, 0)); sh.alpha_composite(steel(), (0, 0)); sh.alpha_composite(barrier(), (48, 0))
sh.save(os.path.join(root, "aj6", "Pokémon - KeiKan", "assets", "textures", "battle", "fx_shield.png"))

# 미리 보기: 화살표 (공격 빨강 오름 · 방어 주황 내림 · 스피드 하늘 오름) + 방패 둘
pv = Image.new("RGBA", (96 * 4, 48 * 4 + 16 * 6), (40, 44, 60, 255))
pv.alpha_composite(sh.resize((96 * 4, 48 * 4), Image.NEAREST), (0, 16 * 6))
for k, (cell, col) in enumerate(((0, (255, 106, 80)), (1, (74, 138, 255)), (0, (255, 106, 80)))):
    g = st.crop((cell * 16, 0, cell * 16 + 16, 16)); p = g.load()
    for y in range(16):
        for x in range(16):
            r, gg, b, a = p[x, y]
            p[x, y] = (r * col[0] // 255, gg * col[1] // 255, b * col[2] // 255, a)
    pv.alpha_composite(g.resize((96, 96), Image.NEAREST), (k * 110, 0))
pv.save(os.path.join(root, "fxsrc", "fx_stat_preview.png"))
print("ok")
