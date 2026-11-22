# 타입별 이펙트 텍스쳐 (16 x 16 칸 9 개를 가로로 이은 144 x 16) 를 만듦
#   python3 fxsrc/make_fx_type.py → aj6/Pokémon - KeiKan/assets/textures/battle/fx_type.png
#   칸: 1 불똥 · 2 물거품 · 3 나뭇잎 · 4 스파크 · 5 얼음 결정 · 6 돌 · 7 독 방울 · 8 반짝임 · 9 꽃잎
from PIL import Image
import os
PAL = {
    '.': (0, 0, 0, 0),
    # 불
    'W': (255, 255, 240, 255), 'Y': (255, 230, 90, 255), 'O': (255, 150, 40, 255), 'R': (230, 60, 30, 255), 'r': (150, 30, 20, 255),
    # 물
    'b': (70, 150, 230, 255), 'c': (150, 215, 255, 255), 'i': (200, 235, 255, 110), 'h': (255, 255, 255, 255),
    # 풀
    'G': (40, 110, 40, 255), 'g': (90, 190, 70, 255), 'l': (170, 235, 110, 255),
    # 전기
    'E': (255, 210, 40, 255), 'e': (200, 140, 0, 255),
    # 얼음
    'I': (120, 200, 255, 255), 'j': (220, 248, 255, 255),
    # 돌
    'S': (90, 70, 50, 255), 's': (150, 120, 85, 255), 't': (200, 175, 135, 255),
    # 독
    'P': (90, 40, 120, 255), 'p': (160, 80, 200, 255), 'q': (215, 150, 240, 255),
    # 반짝
    'K': (255, 120, 200, 255), 'k': (255, 200, 235, 255),
    # 꽃잎
    'F': (200, 70, 130, 255), 'f': (255, 140, 190, 255), 'n': (255, 210, 230, 255),
}
CELLS = [
[   # 1 불똥: 위로 솟는 불꽃 (가운데 흰색 → 노랑 → 주황 → 빨강)
"........r.......",
".......rR.......",
"......rRR.......",
"......RRRr......",
".....rROORr.....",
".....RROOR......",
"....rROOOORr....",
"....ROOYYOOR....",
"...rROYYYYORr...",
"...ROYYWWYYOR...",
"...ROYWWWWYOR...",
"...ROYWWWWYOR...",
"...rROYYYYORr...",
"....rROOOORr....",
".....rrRRrr.....",
"................"],
[   # 2 물거품: 테두리 + 하이라이트 · 속은 반쯤 비침
"................",
".....bbbbbb.....",
"...bbciiiiicbb..",
"..bchhiiiiiicb..",
"..bchiiiiiiiicb.",
".bchiiiiiiiiicb.",
".bciiiiiiiiiicb.",
".bciiiiiiiiiicb.",
".bciiiiiiiiiicb.",
".bciiiiiiiiihcb.",
".bciiiiiiiiihcb.",
"..bciiiiiiihcb..",
"..bbciiiiiicbb..",
"...bbcccccbb....",
".....bbbbbb.....",
"................"],
[   # 3 나뭇잎: 비스듬한 잎 + 잎맥
"............GG..",
"..........GGlgG.",
"........GGllgGG.",
"......GGlllgggG.",
".....GllllgGggG.",
"....GlllgGgggG..",
"...GlllgGggggG..",
"...GllgGgggggG..",
"..GllgGgggggG...",
"..GlgGgggggG....",
"..GgGgggggG.....",
"..GGggggGG......",
"..GgGGGG........",
".Gg.............",
"G...............",
"................"],
[   # 4 스파크: 번개 모양 (가운데 흰색)
"........eEEe....",
".......eEhEe....",
"......eEhEe.....",
".....eEhEe......",
"....eEhhEEEEe...",
"...eEhhhhhhEe...",
"...eEEEEEhEe....",
"......eEhEe.....",
".....eEhEe......",
"....eEhEe.......",
"...eEhEEEEe.....",
"...eEhhhhEe.....",
"...eEEEhEe......",
"......eEe.......",
".....eEe........",
".....ee........."],
[   # 5 얼음 결정: 여섯 갈래
"................",
".......j........",
"....I..j..I.....",
".....I.j.I......",
"..j...Ijj...j...",
"...jj.jjj.jj....",
".....jjhjj......",
".jjjjjhhhjjjjj..",
".....jjhjj......",
"...jj.jjj.jj....",
"..j...jjI...j...",
".....I.j.I......",
"....I..j..I.....",
".......j........",
"................",
"................"],
[   # 6 돌: 모난 돌덩이 + 밝은 면
"................",
"......SSSSS.....",
"....SStttsSS....",
"...SttttssssS...",
"..SttttsssssSS..",
"..StttssssssssS.",
".SttttsssssssSS.",
".StttsssssssssS.",
".SttsssssssssSS.",
".SttssssssssSS..",
"..SsssssssssS...",
"..SSsssssssSS...",
"...SSssssSSS....",
".....SSSSS......",
"................",
"................"],
[   # 7 독 방울
".......P........",
"......PpP.......",
"......PpP.......",
".....PpppP......",
".....PppppP.....",
"....PpqppppP....",
"....PqqppppP....",
"...PpqhpppppP...",
"...PpqhpppppP...",
"...PppppppppP...",
"...PppppppppP...",
"...PpppppppPP...",
"....PpppppPP....",
".....PPPPPP.....",
"................",
"................"],
[   # 8 반짝임: 네 갈래 별
".......K........",
".......K........",
"......KkK.......",
"......KkK.......",
".....KkhkK......",
"....KkhhhkK.....",
"KKKkkhhhhhkkKKK.",
"...KkhhhhhkK....",
"....KkhhhkK.....",
".....KkhkK......",
"......KkK.......",
"......KkK.......",
".......K........",
".......K........",
"................",
"................"],
[   # 9 꽃잎
"................",
"......FFFF......",
"....FFnnffF.....",
"...FnnnfffF.....",
"..FnnnffffF.....",
"..FnnffffffF....",
"..FnfffffffF....",
"..FffffffffF....",
"...FfffffffF....",
"...FffffffF.....",
"....FfffffF.....",
".....FffffF.....",
"......FffF......",
".......FF.......",
"................",
"................"],
]
im = Image.new("RGBA", (16 * len(CELLS), 16), (0, 0, 0, 0))
for n, cell in enumerate(CELLS):
    assert len(cell) == 16, n
    for y, row in enumerate(cell):
        assert len(row) == 16, (n, y, row)
        for x, ch in enumerate(row):
            im.putpixel((n * 16 + x, y), PAL[ch])
here = os.path.dirname(os.path.abspath(__file__))
out = os.path.join(here, "..", "aj6", "Pokémon - KeiKan", "assets", "textures", "battle", "fx_type.png")
im.save(out)
im.resize((im.width * 8, im.height * 8), Image.NEAREST).save(os.path.join(here, "fx_type_preview.png"))
print("saved", os.path.normpath(out))
