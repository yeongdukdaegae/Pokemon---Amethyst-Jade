import sys,re
p=sys.argv[1];s=open(p).read();L=s.split('\n')
m=[i for i,l in enumerate(L,1) if l.strip()=='dis.enableObj("battlemenu");'][0]
e=[i for i,l in enumerate(L,1) if l.strip().startswith('// ── 배틀 끝')][0]+1
c=[i for i,l in enumerate(L,1) if l.strip().startswith('// ── 포획 경험치')]
if c: s=re.sub(r'goTo\(\d+\);   // 포획 경험치',f'goTo({c[0]+1});   // 포획 경험치',s)
s=re.sub(r'goTo\(\d+\);   // 배틀 끝',f'goTo({e});   // 배틀 끝',s)
s=re.sub(r'goTo\(\d+\);   // 행동 선택',f'goTo({m});   // 행동 선택',s)
t=[i for i,l in enumerate(L,1) if l.strip()=='if [hzKO == 1]{   // 나올 때 장판으로 쓰러짐: 행동 없이 쓰러짐 처리로']
if t:   # 턴 처리 블록의 시작 (if [pendingMove != 0]{) — 장판으로 쓰러졌을 때 goTo
  k=[i for i in range(t[0]-1,0,-1) if L[i-1].strip()=='if [pendingMove != 0]{'][0]
  s=re.sub(r'goTo\(\d+\);   // 턴 처리',f'goTo({k});   // 턴 처리',s)
open(p,'w').write(s);print(m,e)
