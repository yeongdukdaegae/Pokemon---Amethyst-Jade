# 이펙트의 흰 속 색 채도 올리기: lib/battleCore.jbl 에서 "흰 속 색 + 색 빛" 짝을 찾아 속 색을 빛 색 쪽으로 K (기본 0.35) 만큼 섞음
#   ① 한 호출 안에 "흰", "색" 이 나란히 · ② pxCirc / setObject 로 흰 것을 만들고 바로 다음 줄 setGlow 가 색 — 그림에 입히는 흰색 (그림 색 그대로) 은 건드리지 않음
#   쓰는 법: 게임 폴더에서 python3 ../../fxsrc/fx_saturate.py [K] [--dry]   (여러 번 돌리면 그만큼 더 진해짐)
import re, sys
p='lib/battleCore.jbl'; t=open(p,encoding='utf-8').read()
K=float(sys.argv[1]) if len(sys.argv)>1 else 0.35
DRY='--dry' in sys.argv
def rgb(h): return tuple(int(h[i:i+2],16) for i in (1,3,5))
def hexc(c): return '#%02x%02x%02x'%c
def whiteish(h):
    r,g,b=rgb(h); return min(r,g,b)>=0xd8
def colorful(h):
    r,g,b=rgb(h); return max(r,g,b)-min(r,g,b)>=60
def mix(a,b):
    A,B=rgb(a),rgb(b); return hexc(tuple(round(A[i]+(B[i]-A[i])*K) for i in range(3)))
n=0; ex=[]
# 1) 한 호출 안에 "흰" , "색" 이 나란히
def f1(m):
    global n
    a,b=m.group(1),m.group(2)
    if whiteish(a) and colorful(b):
        n+=1; ex.append((a,b,mix(a,b))); return f'"{mix(a,b)}", "{b}"'
    return m.group(0)
t2=re.sub(r'"(#[0-9a-fA-F]{6})", "(#[0-9a-fA-F]{6})"',f1,t)
# 2) pxCirc / setObject 로 흰 것을 만들고 바로 다음 줄에서 색 빛 번짐
def f2(m):
    global n
    a,b=m.group(2),m.group(4)
    if whiteish(a) and colorful(b):
        n+=1; ex.append((a,b,mix(a,b))); return m.group(1)+'"'+mix(a,b)+'"'+m.group(3)+'"'+b+'"'
    return m.group(0)
t3=re.sub(r'((?:pxCirc|dis\.setObject)\([^\n]*?)"(#[0-9a-fA-F]{6})"(\);\n\s*dis\.setGlow\([^,\n]*, )"(#[0-9a-fA-F]{6})"',f2,t2)
print('바뀜',n)
from collections import Counter
for (a,b,c),k in Counter(ex).most_common(12): print(f'  {a} + {b} → {c}  ×{k}')
if not DRY: open(p,'w',encoding='utf-8').write(t3)
