# 배틀 그림 자리 흉내 (PC · battleManager.jb 와 같은 식) — 포켓몬마다 내 쪽 (뒷모습) · 상대 쪽 (앞모습) 을 발판 위에 그려 한 장으로
#   쓰는 법: 게임 폴더 (aj6/Pokémon - KeiKan) 에서 python3 ../../fxsrc/battle_pos_sheet.py <출력.png> → 포켓몬마다 왼쪽 = 내 쪽 (뒷모습) · 오른쪽 = 상대 쪽 (앞모습) · 빨간 + = 발판 가운데
import re, sys, os
from PIL import Image, ImageDraw, ImageFont
G='.'
bm=open('assets/codes/battle/battleManager.jb',encoding='utf-8').read()
bc=open('lib/battleCore.jbl',encoding='utf-8').read()
def lst(name,src):
    m=re.search(r'var list call '+name+r' = \[([^\]]*)\]',src); return [float(x) for x in m.group(1).split(',')]
footIds=[int(x) for x in lst('footIds',bm)]; fX=lst('footXs',bm); fY=lst('footYs',bm)
bt=[float(x) for x in re.search(r'func float backDX\(int id\)\{\s*var list call bt = \[([^\]]*)\]',bc).group(1).split(',')]
bdx={int(bt[i]):(bt[i+1],bt[i+2]) for i in range(0,len(bt),3)}
sc={177:0.75,103:0.82}
DX,DY=1222,720; pfS=390.0
dY=1440/11-360; dH=1440/6.4; battleB=dY+dH/2
mybase=(-DX/2+DX*0.25, battleB+pfS*0.03, pfS*1.3*0.8, pfS*1.3*0.4)
oppbase=(DX/3.8, 170-pfS*0.3, pfS*0.8, pfS*0.4)
myS=pfS*1.3
plat=Image.open('assets/textures/battle/platform.png').convert('RGBA')
def scr(x,y): return (DX/2+x, DY/2-y)
def paste(img,cx,cy,w,h,canvas):
    im=img.resize((max(1,int(w)),max(1,int(h))),Image.NEAREST); x,y=scr(cx,cy)
    canvas.alpha_composite(im,(int(x-w/2),int(y-h/2)))
def scene(pid, front, back):
    c=Image.new('RGBA',(DX,DY),(120,180,90,255)); d=ImageDraw.Draw(c)
    d.rectangle([0,0,DX,int(DY/2-60)],fill=(90,160,240,255))
    paste(plat,oppbase[0],oppbase[1],oppbase[2],oppbase[3],c)
    paste(plat,mybase[0],mybase[1],mybase[2],mybase[3],c)
    s=sc.get(pid,1.0)
    if front:
        oppSz=pfS*s
        if pid in footIds:
            k=footIds.index(pid); px=oppbase[0]-(fX[k]-48)/96*oppSz; py=oppbase[1]+(fY[k]-48)/96*oppSz
        else: px,py=DX/3.8,170
        paste(front,px,py,oppSz,oppSz,c)
    if back:
        mySz=myS*s; ddx,ddy=bdx.get(pid,(0,0))
        px=mybase[0]-ddx/96*mySz; py=mybase[1]+myS*0.02+ddy/96*mySz
        paste(back,px,py,mySz,mySz,c)
    # 대화 상자 (아래)
    x0,y0=scr(-DX/2,battleB); d.rectangle([0,int(y0),DX,DY],fill=(47,95,159,255))
    for b in (oppbase,mybase):
        x,y=scr(b[0],b[1]); d.line([x-6,y,x+6,y],fill=(255,0,0,255)); d.line([x,y-6,x,y+6],fill=(255,0,0,255))
    return c
ids=sorted(set(footIds)|set(bdx))
base='assets/textures/poke'
cells=[]
for pid in ids:
    f=f'{base}/front/{pid}f.png'; b=f'{base}/back/{pid}.png'
    fr=Image.open(f).convert('RGBA') if os.path.exists(f) else None
    bk=Image.open(b).convert('RGBA') if os.path.exists(b) else None
    if not fr and not bk: continue
    im=scene(pid,fr,bk)
    # 두 발판 둘레만 잘라 붙임
    ox,oy=scr(oppbase[0],oppbase[1]); mx,my=scr(mybase[0],mybase[1])
    a=im.crop((int(ox-170),int(oy-250),int(ox+170),int(oy+60))).resize((170,155))
    b2=im.crop((int(mx-230),int(my-330),int(mx+230),int(my+40))).resize((230,185))
    cell=Image.new('RGB',(400,190),(30,30,40)); cell.paste(b2.convert('RGB'),(0,0)); cell.paste(a.convert('RGB'),(230,0))
    ImageDraw.Draw(cell).text((234,160),str(pid),fill=(255,255,0))
    cells.append(cell)
cols=6; rows=(len(cells)+cols-1)//cols
sheet=Image.new('RGB',(cols*400,rows*190),(0,0,0))
for i,c in enumerate(cells): sheet.paste(c,((i%cols)*400,(i//cols)*190))
out=sys.argv[1]; sheet.save(out); print(len(cells),sheet.size)
