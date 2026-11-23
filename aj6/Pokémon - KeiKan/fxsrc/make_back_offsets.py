# 내 포켓몬 (뒷모습) 그림 자리 보정표 — lib/battleCore.jbl 의 backDX · backDY 목록 (bt = [번호, DX, DY, …]) 을 새로 씀
#   DX = 아래쪽 (발 · 몸 아래 끝에서 위로 10 줄) 보이는 픽셀의 가운데 - 48 → 꼬리 · 날개가 옆으로 길어도 몸 (발) 이 발판 가운데에
#   DY = 보이는 부분의 아래 끝 - 48 + 뜸 (앞모습 표 footY 가 실제 아래 끝보다 3 픽셀 넘게 아래면 떠 있는 포켓몬 → 그만큼 띄움)
#   python3 fxsrc/make_back_offsets.py   (게임 폴더에서)
import re, os
from PIL import Image
HERE = os.path.dirname(os.path.abspath(__file__)); G = os.path.dirname(HERE)
bm = open(os.path.join(G, 'assets/codes/battle/battleManager.jb'), encoding='utf-8').read()
p = os.path.join(G, 'lib/battleCore.jbl'); bc = open(p, encoding='utf-8').read()
def lst(name, src): return [float(x) for x in re.search(r'var list call ' + name + r' = \[([^\]]*)\]', src).group(1).split(',')]
fid = [int(x) for x in lst('footIds', bm)]; fY = lst('footYs', bm)
old = re.search(r'func float backDX\(int id\)\{\s*var list call bt = \[([^\]]*)\]', bc).group(1)
ov = [float(x) for x in old.split(',')]
ids = [int(ov[i]) for i in range(0, len(ov), 3)]
def bottom_rows(im, n):
    a = im.split()[3].load(); w, h = im.size
    bot = max(y for y in range(h) for x in range(w) if a[x, y] > 0)
    xs = [x for y in range(max(0, bot - n + 1), bot + 1) for x in range(w) if a[x, y] > 0]
    return bot + 1, sum(xs) / len(xs)
out = []; changed = 0
for i in ids:
    bp = os.path.join(G, f'assets/textures/poke/back/{i}.png')
    k = ids.index(i); odx, ody = ov[k * 3 + 1], ov[k * 3 + 2]
    if not os.path.exists(bp):
        out += [i, int(odx), int(ody)]; continue
    bot, cx = bottom_rows(Image.open(bp).convert('RGBA'), 10)
    dx = round(cx - 48); dy = bot - 48
    fp = os.path.join(G, f'assets/textures/poke/front/{i}f.png')
    if i in fid and os.path.exists(fp):
        fbot, _ = bottom_rows(Image.open(fp).convert('RGBA'), 1)
        fl = fY[fid.index(i)] - fbot
        if fl > 3: dy += round(fl)   # 떠 있는 포켓몬
    if (dx, dy) != (odx, ody): changed += 1
    out += [i, dx, dy]
new = ', '.join(str(int(v)) for v in out)
bc = bc.replace('var list call bt = [' + old + ']', 'var list call bt = [' + new + ']')   # backDX · backDY 두 함수 모두 같은 목록
open(p, 'w', encoding='utf-8').write(bc)
print('changed', changed, 'of', len(ids))
