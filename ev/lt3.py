import asyncio,sys,json,os,shutil,re
from playwright.async_api import async_playwright
d=json.load(open('ns2save.json'))
while len(d)<17: d.append(0)
PL=int(os.environ.get('PL','5')); C=float(os.environ.get('C','76')); Rr=float(os.environ.get('R','37'))
d[4]=PL; d[5]=int(os.environ['WX']) if os.environ.get('WX') else int(9000+(C-77)*16); d[6]=int(os.environ['WY']) if os.environ.get('WY') else int(3000+(37-Rr)*16); d[13]=4; d[15]=3; d[16]=json.loads(os.environ.get('DONE','[2,3,4]'))
d[7]=json.loads(os.environ['PARTY']) if os.environ.get('PARTY') else [[103,60,31,31,31,31,31,31,0,0,0,0,0,0,0,65,"",0,"재희",0,0,[76,188,241,94],[10,10,5,10],[0,0,0,0],200,216000,0,0,0,0,70]]
d[10]=json.loads(os.environ.get('BAG','[[900,1],[4,5]]')); d[12]=3000
if os.environ.get('PCOFF'): d.append(0); d.append(2)
if os.environ.get('GYS'):
    while len(d)<19: d.append(1 if len(d)==17 else 2)
    d.append(json.loads(os.environ['GYS']))
TT=os.environ.get("TT","tt/we")   # 시험용 사본 폴더 (여러 개를 동시에 돌릴 때 TT=tt/we2 처럼 나눔)
dst=TT+"/Pokémon - KeiKan"
if os.path.isdir(TT): shutil.rmtree(TT)
shutil.copytree("aj6/Pokémon - KeiKan",dst); os.makedirs(dst+"/data/save",exist_ok=True)
json.dump(d,open(dst+"/data/save/save.json","w"),ensure_ascii=False)
p=dst+"/assets/codes/places/prtgRoom.jb"; s=open(p,encoding="utf-8").read()
for a,b in json.loads(os.environ.get('PATCH','[]')):
    assert a in s, a; s=s.replace(a,b,1)
open(p,"w",encoding="utf-8").write(s)
# LPATCH: 아무 파일이나 바꿔치기 (시험용 사본에만) — [[게임 폴더 안의 경로, 원래 글, 바꿀 글], …] · 바꿀 글이 "@파일" 이면 그 파일 내용을 원래 글 뒤에 덧붙임
for f,a,b in json.loads(os.environ.get('LPATCH','[]')):
    fp=dst+"/"+f; t=open(fp,encoding="utf-8").read(); assert a in t, (f,a)
    if b.startswith("@"): b=a+open(b[1:],encoding="utf-8").read()
    t=t.replace(a,b,1); open(fp,"w",encoding="utf-8").write(t)
os.system(f'python3 mkzip.py "{TT}" "{TT}.zip" >/dev/null')
# ── 배속 (게임 속도): 페이지의 시계 (performance.now · Date.now · setTimeout · setInterval · requestAnimationFrame) 를 가상 시계로 바꿔 끼움
#   SPEED=8 → 처음부터 8 배속 · SEQ 안의 xN → 그때부터 N 배속 (예: x8 로 타이틀 · 조우를 빨리 넘기고 x1 로 이펙트를 찍음 · x0.5 = 느린 화면)
#   게임 · 에디터 파일은 고치지 않음 (시험할 때만) · 스크립트의 기다림 (wN · 처음 타이틀 대기 · 키 누르는 시간) 도 같은 배속으로 줄어듦
#   1 배속보다 빠르면 화면 프레임 (requestAnimationFrame) 도 그만큼 자주 돎 — 그리기가 못 따라가면 그 이상은 빨라지지 않음
CLOCK='''(()=>{const rp=performance.now.bind(performance),rd=Date.now,st=window.setTimeout.bind(window),si=window.setInterval.bind(window),
raf=window.requestAnimationFrame.bind(window),caf=window.cancelAnimationFrame.bind(window),off=rd()-rp();
let base=rp(),vb=base,k=__SPEED__;const vn=()=>vb+(rp()-base)*k;
window.__setSpeed=n=>{vb=vn();base=rp();k=n;};window.__speed=()=>k;
performance.now=vn;Date.now=()=>Math.floor(off+vn());
window.setTimeout=(f,ms,...a)=>st(f,(+ms||0)/k,...a);window.setInterval=(f,ms,...a)=>si(f,(+ms||0)/k,...a);
const fake=new Set();
window.requestAnimationFrame=f=>{if(k>1){const id=st(()=>{fake.delete(id);f(vn());},16.7/k);fake.add(id);return id;}return raf(()=>f(vn()));};
window.cancelAnimationFrame=id=>{if(fake.has(id)){fake.delete(id);clearTimeout(id);}else caf(id);};})();'''
SPD=[float(os.environ.get('SPEED','1'))]
async def main():
  async with async_playwright() as p:
    exe=os.environ.get('CHROME') or next((q for q in ['/opt/pw-browsers/chromium/chrome-linux64/chrome','/opt/pw-browsers/chromium'] if os.path.isfile(q)),None)
    b=await p.chromium.launch(executable_path=exe,args=['--no-sandbox','--headless=new']) if exe else await p.chromium.launch(args=['--no-sandbox','--headless=new'])
    pg=await b.new_page(accept_downloads=True,viewport={'width':int(os.environ.get('VW','1280')),'height':int(os.environ.get('VH','800'))});
    # DLF: 게임이 내려받기 한 파일을 이 경로에 저장 · IMPF: 게임이 파일을 고르게 하면 이 파일을 고름 (리포트 내보내기 · 불러오기 시험)
    if os.environ.get('DLF'): pg.on('download',lambda d: asyncio.ensure_future(d.save_as(os.environ['DLF'])))
    if os.environ.get('IMPF'): pg.on('filechooser',lambda fc: asyncio.ensure_future(fc.set_files(os.environ['IMPF'])))
    errs=[];pg.on('pageerror',lambda e:errs.append(str(e)))
    await pg.add_init_script(CLOCK.replace('__SPEED__',str(SPD[0])))
    await pg.add_init_script("delete window.showOpenFilePicker;delete window.showSaveFilePicker;window.__lt=[];try{new PerformanceObserver(l=>{for(const e of l.getEntries())window.__lt.push([Math.round(e.startTime),Math.round(e.duration)])}).observe({type:'longtask',buffered:true})}catch(e){}")
    # SND=1: 소리 재생 기록 (AudioBufferSourceNode.start 마다 [시각 ms, 길이 s] · 디코드 실패 수) → 끝에 SND 줄로 찍음
    if os.environ.get('SND'): await pg.add_init_script("window.__snd=[];window.__sndErr=0;(()=>{const st=AudioBufferSourceNode.prototype.start;AudioBufferSourceNode.prototype.start=function(...a){try{window.__snd.push([Math.round(performance.now()),this.buffer?+this.buffer.duration.toFixed(2):0])}catch(e){};return st.apply(this,a)};const dc=BaseAudioContext.prototype.decodeAudioData;BaseAudioContext.prototype.decodeAudioData=function(b,ok,er){const p=dc.call(this,b,ok,er);if(p&&p.catch)p.catch(()=>{window.__sndErr++});return p}})()")
    await pg.goto('file://'+os.path.abspath(os.environ.get('JB','JawBreaker.html'))+''); await pg.wait_for_timeout(300)
    await pg.set_input_files('#filein',TT+'.zip')
    for q in range(100):
      await pg.wait_for_timeout(100)
      if 'Opened' in await pg.evaluate("document.getElementById('log').innerText"): break
    await pg.wait_for_timeout(800)
    await pg.evaluate("document.getElementById('run').click()")
    async def w(ms): await pg.wait_for_timeout(ms/SPD[0])
    async def key(k,ms=120):
      await pg.keyboard.down(k); await pg.wait_for_timeout(max(40,ms/SPD[0])); await pg.keyboard.up(k)
    async def log(): return await pg.evaluate("document.getElementById('log').innerText")
    SH=os.environ.get('SHOTS','ev'); os.makedirs(SH,exist_ok=True)   # 스크린샷 폴더 (동시에 돌릴 때 나눔)
    async def shot(n): await pg.screenshot(path=f'{SH}/s_{n}.png')
    for i in range(12):
      await w(1500)
      if i in (3,4,5): await key('z')
    await w(1000); await shot('0'); await pg.evaluate('window.__lt=[]')
    K={'L':'ArrowLeft','R':'ArrowRight','U':'ArrowUp','D':'ArrowDown','Z':'z','X':'x'}
    for i,k in enumerate([q for q in os.environ.get('SEQ','').split(',') if q]):
      if k.startswith('w'): await w(int(k[1:])); continue
      if k.startswith('x'):
        SPD[0]=float(k[1:]); await pg.evaluate(f'window.__setSpeed({SPD[0]})'); continue
      if k.startswith('s'): await shot(k[1:]); continue
      if k.startswith('W'):
        for q in range(150):
          if k[1:] in await log(): break
          await pg.wait_for_timeout(200)
        continue
      if k.startswith('N') and ':' in k:   # N3:글자 — 그 글자가 로그에 3 번째로 나올 때까지 Z (배틀에서 턴마다 같은 줄이 나올 때)
        nn,tx=k[1:].split(':',1); nn=int(nn)
        for q in range(900):
          if (await log()).count(tx) >= nn: break
          if q % 12 == 0: await key('z',90)
          else: await pg.wait_for_timeout(60/SPD[0])
        continue
      if k.startswith('Q'):   # 그 글자가 로그에 나올 때까지 Z (게임 시간 약 0.7 초마다) · 나오면 바로 다음으로
        for q in range(600):
          if k[1:] in await log(): break
          if q % 12 == 0: await key('z',90)
          else: await pg.wait_for_timeout(60/SPD[0])
        continue
      ms=130
      if ':' in k: k,ms=k.split(':'); ms=int(ms)
      if '+' in k:   # 여러 키를 함께 누름 (예: Z+R:1000 = Z 와 오른쪽을 1 초 동안)
        ks=[K.get(q,q.lower()) for q in k.split('+')]
        for q in ks: await pg.keyboard.down(q)
        await pg.wait_for_timeout(max(40,ms/SPD[0]))
        for q in ks: await pg.keyboard.up(q)
        await w(350); continue
      await key(K.get(k,k.lower()),ms); await w(350)
    await w(800); await shot('end'); print('LONGTASKS',await pg.evaluate('window.__lt'))
    if os.environ.get('SND'): print('SND',await pg.evaluate('[window.__sndErr,window.__snd.slice(-12)]'))
    L=await log(); print([l for l in L.split('\n') if any(x in l for x in os.environ.get('GREP','✖|맵|단차|야생|트레이너|보스').split('|'))][-14:]); print('ERR',[l for l in L.split('\n') if '✖' in l][:3], errs[:2])
asyncio.run(main())
