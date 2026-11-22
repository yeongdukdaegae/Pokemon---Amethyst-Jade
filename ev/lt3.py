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
dst="tt/we/Pokémon - KeiKan"
if os.path.isdir("tt/we"): shutil.rmtree("tt/we")
shutil.copytree("aj6/Pokémon - KeiKan",dst); os.makedirs(dst+"/data/save",exist_ok=True)
json.dump(d,open(dst+"/data/save/save.json","w"),ensure_ascii=False)
p=dst+"/assets/codes/places/prtgRoom.jb"; s=open(p,encoding="utf-8").read()
for a,b in json.loads(os.environ.get('PATCH','[]')):
    assert a in s, a; s=s.replace(a,b,1)
open(p,"w",encoding="utf-8").write(s)
os.system("python3 mkzip.py tt/we tt/we.zip >/dev/null")
async def main():
  async with async_playwright() as p:
    b=await p.chromium.launch(args=['--no-sandbox','--headless=new'])
    pg=await b.new_page(viewport={'width':int(os.environ.get('VW','1280')),'height':int(os.environ.get('VH','800'))}); errs=[];pg.on('pageerror',lambda e:errs.append(str(e)))
    await pg.add_init_script("delete window.showOpenFilePicker;delete window.showSaveFilePicker;window.__lt=[];try{new PerformanceObserver(l=>{for(const e of l.getEntries())window.__lt.push([Math.round(e.startTime),Math.round(e.duration)])}).observe({type:'longtask',buffered:true})}catch(e){}")
    await pg.goto('file://'+os.path.abspath(os.environ.get('JB','JawBreaker.html'))+''); await pg.wait_for_timeout(300)
    await pg.set_input_files('#filein','tt/we.zip')
    for q in range(100):
      await pg.wait_for_timeout(100)
      if 'Opened' in await pg.evaluate("document.getElementById('log').innerText"): break
    await pg.wait_for_timeout(800)
    await pg.evaluate("document.getElementById('run').click()")
    async def key(k,ms=120):
      await pg.keyboard.down(k); await pg.wait_for_timeout(ms); await pg.keyboard.up(k)
    async def log(): return await pg.evaluate("document.getElementById('log').innerText")
    async def shot(n): await pg.screenshot(path=f'ev/s_{n}.png')
    for i in range(12):
      await pg.wait_for_timeout(1500)
      if i in (3,4,5): await key('z')
    await pg.wait_for_timeout(1000); await shot('0'); await pg.evaluate('window.__lt=[]')
    K={'L':'ArrowLeft','R':'ArrowRight','U':'ArrowUp','D':'ArrowDown','Z':'z','X':'x'}
    for i,k in enumerate([q for q in os.environ.get('SEQ','').split(',') if q]):
      if k.startswith('w'): await pg.wait_for_timeout(int(k[1:])); continue
      if k.startswith('s'): await shot(k[1:]); continue
      if k.startswith('W'):
        for q in range(150):
          if k[1:] in await log(): break
          await pg.wait_for_timeout(200)
        continue
      if k.startswith('Q'):
        for q in range(60):
          if k[1:] in await log(): break
          await key('z'); await pg.wait_for_timeout(700)
        continue
      ms=130
      if ':' in k: k,ms=k.split(':'); ms=int(ms)
      await key(K[k],ms); await pg.wait_for_timeout(350)
    await pg.wait_for_timeout(800); await shot('end'); print('LONGTASKS',await pg.evaluate('window.__lt'))
    L=await log(); print([l for l in L.split('\n') if any(x in l for x in os.environ.get('GREP','✖|맵|단차|야생|트레이너|보스').split('|'))][-14:]); print('ERR',[l for l in L.split('\n') if '✖' in l][:3], errs[:2])
asyncio.run(main())
