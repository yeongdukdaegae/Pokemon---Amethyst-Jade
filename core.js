
// data: 주소 → ArrayBuffer — fetch 를 쓰지 않고 직접 풂 (미리보기 · 샌드박스처럼 fetch(data:) 가 막힌 곳에서도 소리 · 글꼴을 읽게)
function jbDataBuf(u){
  u=String(u||'');
  const m=/^data:[^,]*?(;base64)?,/i.exec(u);
  if(!m)return fetch(u).then(r=>r.arrayBuffer());
  return new Promise((ok,no)=>{try{
    const body=u.slice(m[0].length);
    if(!m[1]){ok(new TextEncoder().encode(decodeURIComponent(body)).buffer);return;}
    const bin=atob(body),n=bin.length,a=new Uint8Array(n);
    for(let k=0;k<n;k++)a[k]=bin.charCodeAt(k);
    ok(a.buffer);
  }catch(e){no(e);}});
}

/* ===================== Jawbreaker core ===================== */
class JBError extends Error{constructor(m,line,file){super(m);this.line=line;this.file=file;}}
const STOP={stop:true},TERM={terminate:true};
// break() / return() 가 던지는 신호 — target 은 빠져나갈(되돌아갈) loop / if 노드
class JBJump{constructor(kind,target){this.kind=kind;this.target=target;}}
class JBSend{constructor(path){this.path=path;}}   // sendto("경로") — 지금 run 을 끝내고 그 파일로 넘어감
class JBRet{constructor(v){this.v=v;}}
// goTo(줄); — 그 줄의 문장으로 넘어감. 지금 블록부터 바깥 블록 쪽으로 그 줄을 찾음 (못 찾고 빠져나가면 이 메시지가 오류로)
class JBGoto extends JBError{constructor(to,n){super(`goTo(${to}): ${to}번째 줄의 문장을 찾을 수 없습니다 — 지금 있는 블록이나 그 바깥 블록의 문장으로만 갈 수 있습니다 (안쪽 블록 · 다른 함수 · 다른 run 으로는 못 감)`,n.line,n.file);this.to=to;}}   // return(값); — 값을 돌려주는 함수에서 빠져나감
const DIS_ID='DisPlayer';   // 내장 디스플레이 라이브러리 id
const DIS_FUNCS={waitF:{params:['int']},setDisplay:{params:[]},setDisplayColor:{params:['string']},setFont:{params:['string']},setupObject:{params:[]},
  setObject:{params:['mat12','string','mat12','color']},setObjScale:{params:['string','mat12']},setObjPos:{params:['string','mat12']},
  getVar:{params:['string','string']},moveObj:{params:['string']},
  setText:{params:['mat12','string','string','float','bit','color']},nudgeObj:{params:['string','mat12','float','float']},setTextNudge:{params:['string','string']},setObjNudge:{params:['string','string']},
  enableScreenScale:{params:[]},disableScreenScale:{params:[]},setParent:{params:[]},setLink:{params:['string','string']},removeObj:{params:['string']},
  escParent:{params:['string']},splitParent:{params:['string']},setObjLayer:{params:['string','int']},ascendObjLayer:{params:['string','int']},setTxtContent:{params:['string','string']},tagObj:{params:['string','string']},
  setObjCyl:{params:['mat12','string','float','color']},setObjPlg:{params:['mat12','mat12','mat12','mat12','string','color']},setObjAlpha:{params:['string','int']},
  disableObj:{params:['string']},enableObj:{params:['string']},setObjColor:{params:['string','color']},setObjOverlay:{params:['string','color','int']},setGlow:{params:['string','color','float']},
  rotateObj:{params:['string','float','int']},setRenderLimit:{params:['int']},setTilemap:{params:['mat12','string']}};
// 'for ms' 로 시간을 들여 바뀌는 명령 (moveObj 처럼 다 바뀌면 다음 줄)
const TWEEN_SET=new Set(['setObjPos','setObjScale','setObjAlpha','setObjColor','setObjOverlay']);
// id 란에 "<태그>" 를 쓸 수 있는 명령: 명령 → id 가 몇 번째 값인지
const TAG_ARG={setTextNudge:0,setObjNudge:0,setObject:1,setText:2,setObjScale:0,setObjPos:0,moveObj:0,nudgeObj:0,removeObj:0,escParent:0,splitParent:0,
  setObjLayer:0,ascendObjLayer:0,tagObj:0,getVar:0,setObjCyl:1,setObjAlpha:0,setObjColor:0,setObjOverlay:0,setGlow:0,rotateObj:0,setObjTexture:0,wearTexture:0,applyAnime:0,runAnime:0,breakAnime:0,setTxtContent:0,disableObj:0,enableObj:0,setExistableScene:1,setasButton:0,setUi:0,bindInput:0,setLink:0,setVelocity:0,setVelocityX:0,setVelocityY:0,setAnchor:0,setCollider:2,setColider:2,setTrigger:2};
const hget=(o,k)=>Object.hasOwn(o,k)?o[k]:undefined;   // 이름표 객체 조회 — 'constructor' 같은 이름이 기본 속성으로 잡히지 않게
const isTagId=v=>typeof v==='string'&&v.length>2&&v[0]==='<'&&v[v.length-1]==='>';
// Canvas — DisPlayer 의 하위 내장 라이브러리 (입력)
const CAN_ID='Canvas';
const CAN_VARS=new Map([['ScreenClicked','bit'],['MouseX','float'],['MouseY','float'],['SceneName','string']]);   // 이름 → 형식
// Canvas 명령 (장면) — 'obj.이름' 은 can.obj.이름(...) 형태
const CAN_FUNCS={setUi:{params:['string']},setasButton:{params:['string']},bindInput:{params:['string']},setUpScene:{params:[]},nameScene:{params:['string']},setScene:{params:['string']},sendtoScene:{params:['string']},popupScene:{params:['string']},closeScene:{params:[]},
  'obj.setExistableScene':{params:['string','string']}};
const NOSCENE='장면 기능이 꺼져 있습니다 — 먼저 can.setUpScene(); 을 실행하세요';
// Magellan — DisPlayer 의 하위 내장 라이브러리 (이미지 · 텍스쳐)
const MAG_ID='Magellan';
const MAG_FUNCS={importFile:{params:['string']},importFolder:{params:['string']},setObjTexture:{params:['string','string','mat12','mat12']},
  setasTexture:{params:['string','mat12','mat12']},wearTexture:{params:['string','string']},setasAnime:{params:['list','int','string']},
  'obj.applyAnime':{params:['string','string']},'obj.runAnime':{params:['string','string','float']},'obj.breakAnime':{params:['string']}};   // mag.obj.id.runAnime(…)
const IMG_RE=/\.(png|jpe?g|gif|webp|bmp)$/i;
const AUD_RE=/\.(wav|mp3|ogg|m4a)$/i;   // 소리 파일 (soundMaster)
// dis.setTextNudge 기준점: "center" · "left" · "right" · "top" · "bottom" · "top left" (= "topleft" · "left-top" …)
// → [nx, ny] : 글자 가운데 = 위치 + [nx × 폭/2, ny × 높이/2]  (left 면 위치가 왼쪽 끝 → 가운데는 오른쪽으로)
function parseNudge(v){
  const t=String(v).toLowerCase().replace(/[\s\-_,]+/g,'');
  if(t==='center'||t==='middle'||t==='centre')return [0,0];
  const m=/^(top|bottom)?(left|right)?$/.exec(t)||/^(left|right)?(top|bottom)?$/.exec(t);
  if(!m||!t)return null;
  const w=m.slice(1).filter(Boolean);
  return [w.includes('left')?1:w.includes('right')?-1:0,w.includes('top')?-1:w.includes('bottom')?1:0];
}
const NUDGE_BAD=v=>`기준점은 "center" · "left" · "right" · "top" · "bottom" 또는 "top left" 처럼 둘을 합친 것입니다 (받은 값: "${v}")`;
// ease ("이름"): 이동의 빠르기 곡선 — 0 ~ 1 (시간) → 0 ~ 1 (간 거리)
//   linear 한결같이 · sin = 사인 0° ~ 90° (처음에 빠르고 끝에서 느려짐) · sinright = 0° ~ 45° (거의 한결같이, 끝에서 조금 느려짐) · sinleft = 45° ~ 90° (빠르게 나와서 끝에서 확 느려짐)
const EASE_S45=Math.SQRT1_2;
const EASES={linear:k=>k,sin:k=>Math.sin(k*Math.PI/2),sinright:k=>Math.sin(k*Math.PI/4)/EASE_S45,sinleft:k=>(Math.sin(Math.PI/4+k*Math.PI/4)-EASE_S45)/(1-EASE_S45)};
const EASE_ID={linear:0,sin:1,sinright:2,sinleft:3};
const EASE_BAD=v=>`ease 이름은 "linear" · "sin" · "sinleft" · "sinright" 중 하나입니다 (받은 값: "${v}")`;
const TTF_RE=/\.(ttf|otf)$/i;   // 글꼴 파일 (dis.setFont) — .ttf · .otf
const TL_RE=/\.tl$/i;   // 타일맵 파일 (타일맵 에디터 · dis.setTilemap) — 텍스쳐가 안에 들어 있는 JSON 텍스트
// colliders — DisPlayer 의 하위 내장 라이브러리 (같은 파일에 Use DisPlayer 필요)
const COL_ID='colliders';
// soundMaster — Magellan 의 하위 내장 라이브러리 (스피커 · 효과음 · 공간 음향)
const SND_ID='soundMaster';
const SND_FUNCS={setSpeaker:{params:['string']},playSfx:{params:['string','string','int']},setVol:{params:['string','int']},
  repeatingPlay:{params:['string','string','int']},repeatPart:{params:['string','string','int','int']},repatPart:{params:['string','string','int','int']},introPart:{params:['string','string','int','int']},break:{params:['string']},setFadein:{params:['string','int']},setFadeout:{params:['string','int']},
  'spk.belongto':{params:['string','string']},'spk.belongtoScene':{params:['string','string']}};   // sou.spk.스피커.belongto("오브젝트")
// SeongBin — Canvas 의 하위 내장 라이브러리 (카메라)
const CAM_ID='SeongBin';
const CAM_FUNCS={setUpCam:{params:[]},setCam:{params:['string']},setMainCamas:{params:['string']},
  'cam.setZoom':{params:['string','float']},'cam.moveCamto':{params:['string','mat12']},'cam.follow':{params:['string','string']},'cam.followOut':{params:['string']}};
const COL_FUNCS={setVelocity:{params:['string','mat12']},setVelocityX:{params:['string','float']},setVelocityY:{params:['string','float']},setAnchor:{params:['string','bit']},
  setCollider:{params:['mat12','mat12','string','float','bit']},setColider:{params:['mat12','mat12','string','float','bit']},   // setColider = 같은 명령
  setColliderVisible:{params:['bit']},setGravity:{params:['float']},setTrigger:{params:['mat12','mat12','string','bit']},
  setLink:{params:['string','string']}};   // col.setLink = dis.setLink
const GRAVITY=980;   // 중력 1 = 980 px/초² (아래쪽) — col.setGravity(f) 로 배율 지정
const OBJ_SET=new Set(['setObject','setObjScale','setObjPos','moveObj','setText','setVelocity','setVelocityX','setVelocityY','setObjCyl','setObjPlg']);
const OBJ_PROPS={position:'pos',pos:'pos',coord:'pos',scale:'scale',color:'color',text:'text',velocity:'vel',vel:'vel',
  istrigged:'istrig',istriggered:'istrig',triggedid:'trigid',triggeredid:'trigid',iscollided:'iscol',collidedobj:'colid'};
const STR_KEYS=new Set(['color','text','trigid','colid']);   // trigid · colid 는 읽기 전용
// obj.id.Xpos · Ypos · Xscale · Yscale = Position / Scale 의 성분 (읽고 쓰는 float)
function objCompNode(N,line,id,prop){
  const k=hget(OBJ_KEEP,prop.toLowerCase());if(!k)return null;
  const one=v=>N('num',line,{v,isFloat:false,raw:String(v)});
  const base=N('objprop',line,{id,prop:{pos:'Position',scale:'Scale',vel:'Velocity'}[k[0]],key:k[0]});
  return N('idx',line,{base,i:one(1),j:one(k[1]+1)});
}   // 문자열 속성
// 글자 폭 어림값 (화면이 없을 때) — 한글 등 전각 1칸, 나머지 0.55칸
const textWidthEst=(t,size)=>[...String(t)].reduce((w,ch)=>w+(ch.codePointAt(0)>=0x2e80?1:0.55),0)*size;
const OBJ_KEEP={xscale:['scale',0],yscale:['scale',1],xpos:['pos',0],ypos:['pos',1],xvel:['vel',0],yvel:['vel',1]};
const NOOBJ='오브젝트 기능이 꺼져 있습니다 — 먼저 dis.setupObject(); 를 실행하세요';
const matNew=(r,c)=>({r,c,d:new Array(r*c).fill(0)});
const matCopy=m=>({r:m.r,c:m.c,d:m.d.slice()});
const dimsTxt=d=>`matrix[${d[0]}, ${d[1]}]`;
// getVar 의 변수 이름: "coord" / "scale" / "color" / "scale[1, 2]"
function parseObjVar(v){
  const m=/^\s*([A-Za-z]+)\s*(?:\[\s*(\d+)\s*,\s*(\d+)\s*\])?\s*$/.exec(String(v));
  if(!m)return null;
  const key=hget(OBJ_PROPS,m[1].toLowerCase());if(!key||key==='iscol'||key==='colid')return null;
  return{key,idx:m[2]?[+m[2],+m[3]]:null};
}
const DIS_VARS=new Set(['displayX','displayY','idWidthmode']);
const HEX_RE=/^#?([0-9a-fA-F]{3}|[0-9a-fA-F]{6})$/;
const KEYWORDS=new Set(['Use','use','Lib','call','var','public','if','else','loop','while','run','func','true','false','as','obj','cam','spk','to','for']);
const TYPES=new Set(['int','float','string','bit','matrix','list','compound']);
const IDRE='[\\p{L}_][\\p{L}\\p{N}_]*';
const INTRE=new RegExp('^%('+IDRE+'(?:\\.'+IDRE+'){0,2})%','u');
const IDXRE=new RegExp('^%'+IDRE+'(?:\\.'+IDRE+')?(?=\\[)','u');   // %이름[ … ]% 의 앞부분   // %이름% · %별칭.변수% · %obj.id.속성%

/* ---------- lexer ---------- */
function lex(src,file){
  const toks=[];let i=0,line=1;const n=src.length;
  const push=(t,v,l,raw)=>toks.push({t,v,line:l,raw});
  while(i<n){
    const c=src[i];
    if(c==='\n'){line++;i++;continue;}
    if(/\s/.test(c)){i++;continue;}
    if(c==='/'&&src[i+1]==='/'){while(i<n&&src[i]!=='\n')i++;continue;}
    if(c==='/'&&src[i+1]==='*'){
      const st=line;i+=2;
      while(i<n&&!(src[i]==='*'&&src[i+1]==='/')){if(src[i]==='\n')line++;i++;}
      if(i>=n)throw new JBError('주석(/* */)이 닫히지 않았습니다',st,file);
      i+=2;continue;
    }
    if(/[0-9]/.test(c)){
      let j=i;while(j<n&&/[0-9]/.test(src[j]))j++;
      let isF=false;
      if(src[j]==='.'&&j+1<n&&/[0-9]/.test(src[j+1])){isF=true;j++;while(j<n&&/[0-9]/.test(src[j]))j++;}
      push(isF?'float':'int',Number(src.slice(i,j)),line,src.slice(i,j));i=j;continue;
    }
    if(/[\p{L}_]/u.test(c)){
      let j=i;while(j<n&&/[\p{L}\p{N}_]/u.test(src[j]))j++;
      const w=src.slice(i,j);
      push(KEYWORDS.has(w)?'kw':TYPES.has(w)?'type':'id',w,line);i=j;continue;
    }
    if(c==='"'){
      let j=i+1,s='';
      while(j<n&&src[j]!=='"'){
        if(src[j]==='\n')throw new JBError('문자열이 닫히지 않았습니다 (")',line,file);
        if(src[j]==='\\'&&(src[j+1]==='\n'||src[j+1]==='\r'))throw new JBError('문자열이 닫히지 않았습니다 (")',line,file);
        if(src[j]==='\\'){const e=src[j+1];s+=e==='n'?'\n':e==='t'?'\t':(e===undefined?'':e);j+=2;}
        else s+=src[j++];
      }
      if(j>=n)throw new JBError('문자열이 닫히지 않았습니다 (")',line,file);
      push('str',s,line);i=j+1;continue;
    }
    const two=src.substr(i,2);
    if(['==','!=','<=','>=','&&','||'].includes(two)){push('op',two,line);i+=2;continue;}
    if('+-*/%<>=!()[]{};,.|'.includes(c)){push('op',c,line);i++;continue;}
    throw new JBError(`알 수 없는 문자입니다: ${c}`,line,file);
  }
  push('eof','',line);
  return toks;
}

/* ---------- parser ---------- */
// kind: 'jb' (코드 파일) | 'jbl' (라이브러리 파일)
function parse(toks,file,kind){
  let p=0;const ast=[];
  const T=()=>toks[p];
  const isOp=v=>T().t==='op'&&T().v===v;
  const isKw=v=>T().t==='kw'&&T().v===v;
  const E=(m,line)=>new JBError(m,line??T().line,file);
  const desc=t=>t.t==='eof'?'파일 끝':t.t==='str'?'문자열':`'${t.v}'`;
  const N=(k,line,o)=>Object.assign({k,line,file},o);
  function opx(v){if(!isOp(v))throw E(`'${v}' 이(가) 필요합니다 (현재: ${desc(T())})`);return toks[p++];}
  function semi(){if(!isOp(';'))throw E(`문장 끝에 ';' 이(가) 필요합니다`,toks[p-1].line);p++;}
  function ident(what){if(T().t!=='id')throw E(`${what}이(가) 필요합니다 (현재: ${desc(T())})`);return toks[p++];}

  // "...%이름%..." → "" + 이름 + "..." (%% 는 % 글자)
  function strNode(t){
    const s=t.v;
    if(!s.includes('%'))return N('str',t.line,{v:s,lit:true});
    const parts=[];let lit='',i=0;
    const flush=()=>{if(lit){parts.push(N('str',t.line,{v:lit}));lit='';}};
    while(i<s.length){
      const c=s[i];
      if(c==='%'){
        if(s[i+1]==='%'){lit+='%';i+=2;continue;}
        let m=INTRE.exec(s.slice(i));
        if(!m){   // %리스트[번호]% · %행렬[행, 열]% · %c[1][2]% · %별칭.변수[i]% — 대괄호 안은 식
          const mi=IDXRE.exec(s.slice(i));
          if(mi){
            let j=i+mi[0].length,ok=false;
            while(s[j]==='['){let d=0,k=j;for(;k<s.length;k++){if(s[k]==='[')d++;else if(s[k]===']'&&--d===0)break;else if(s[k]==='%'||s[k]==='"')break;}if(s[k]!==']')break;j=k+1;ok=true;}
            if(ok&&s[j]==='%'){
              const src=s.slice(i+1,j);let sub;
              try{sub=lex(src,file);}catch(e){throw E(`문자열 안의 %${src}% 을(를) 읽을 수 없습니다 — ${e.message}`,t.line);}
              for(const q of sub)q.line=t.line;
              const sv=toks,sp=p;toks=sub;p=0;let e;
              try{e=primary();if(T().t!=='eof')throw E(`문자열 안의 %${src}% 은(는) 변수[번호] 형태여야 합니다`,t.line);}
              finally{toks=sv;p=sp;}
              flush();parts.push(e);i=j+1;continue;
            }
          }
        }
        const seg=m?m[1].split('.'):null;
        const isObj=seg&&seg[0]==='obj'&&seg.length>1,oid=isObj&&seg.length===3?seg[1]:null,on=isObj?seg[seg.length-1]:null;
        const comp=isObj?objCompNode(N,t.line,oid,on):null;
        const key=isObj&&!comp?hget(OBJ_PROPS,on.toLowerCase()):null;
        const ovar=isObj&&!comp&&!key&&oid!==null;
        if(m&&(!isObj||comp||key||ovar)){
          flush();
          if(comp)parts.push(comp);
          else if(key)parts.push(N('objprop',t.line,{id:oid,prop:on,key}));
          else if(ovar)parts.push(N('objvar',t.line,{id:oid,name:on}));
          else if(seg.length===2)parts.push(N('member',t.line,{lib:seg[0],name:seg[1]}));
          else parts.push(N('id',t.line,{name:seg[0]}));
          i+=m[0].length;continue;
        }
      }
      lit+=c;i++;
    }
    if(!parts.length)return N('str',t.line,{v:lit,lit:true});
    flush();
    let e=N('str',t.line,{v:''});
    for(const q of parts)e=N('bin',t.line,{op:'+',l:e,r:q});
    e.lit=true;return e;
  }
  // 뒤에 [i, j] 가 오면 행렬 성분
  function withIdx(base){   // 이어 쓸 수 있음: c[3][1] · c[2][1, 2]
    while(isOp('[')){
      const o=toks[p++];const i=expr();
      if(isOp(']')){p++;base=N('idx',o.line,{base,i,j:null});continue;}
      if(!isOp(','))throw E("행렬 성분은 [행, 열], 리스트 항목은 [번호] 로 씁니다 (예: m[1, 2] · list[3])");
      p++;const j=expr();opx(']');
      base=N('idx',o.line,{base,i,j});
    }
    return base;
  }
  // [1, 2, 3 | 4, 5, 6]  — ',' 는 다음 열, '|' 는 다음 행
  function matLit(t){
    if(isOp(']')){p++;return N('mat',t.line,{rows:[[]],empty:true});}   // [] = 빈 리스트 · compound (행렬로는 못 씀)
    const rows=[[]];
    for(;;){
      rows[rows.length-1].push(expr());
      if(isOp(',')){p++;continue;}
      if(isOp('|')){p++;rows.push([]);continue;}
      break;
    }
    opx(']');
    if(rows.some(r=>r.length!==rows[0].length))throw E(`행렬의 각 행은 성분 개수가 같아야 합니다 (${rows.map(r=>r.length).join(' / ')})`,t.line);
    return N('mat',t.line,{rows});
  }
  // obj.id.Position / obj.id.Scale / obj.id.Color   ·   obj.Xscale 같은 '지금 값'
  function objRef(t){
    opx('.');const a=ident("오브젝트 id (또는 Xscale · Yscale · Xpos · Ypos)");
    if(isOp('.')){
      p++;const b=ident('속성 이름 (Position, Scale, Velocity, Color, Text, Xpos, Ypos, Xscale, Yscale, Xvel, Yvel) 또는 귀속된 파일의 변수 이름');
      const comp=objCompNode(N,t.line,a.v,b.v);if(comp)return comp;
      const key=hget(OBJ_PROPS,b.v.toLowerCase());
      if(!key)return N('objvar',t.line,{id:a.v,name:b.v});   // dis.BelongObj 로 귀속된 파일의 변수
      return N('objprop',t.line,{id:a.v,prop:b.v,key});
    }
    const k=hget(OBJ_KEEP,a.v.toLowerCase());
    if(k)return N('objkeep',t.line,{name:a.v,key:k});
    const key=hget(OBJ_PROPS,a.v.toLowerCase());
    if(key)return N('objprop',t.line,{id:null,prop:a.v,key});   // 귀속된 파일에서: 자기 자신
    throw E(`'obj.${a.v}' 을(를) 알 수 없습니다 — obj.id.Position 처럼 쓰거나, obj.Xscale · obj.Yscale · obj.Xpos · obj.Ypos · obj.Xvel · obj.Yvel 을 쓰세요`,a.line);
  }
  // cam.id.속성 = 카메라 오브젝트 (id "cam.id") — obj.id.속성 과 같음
  // cam.id.속성 · spk.id.속성 = 카메라 · 스피커 오브젝트 (id "cam.id" · "spk.id") — obj.id.속성 과 같음
  function camRef(t){
    const r=objRef(t),pre=t.v,what=pre==='cam'?'카메라':'스피커';
    const fix=x=>{
      if(x.k==='idx')return fix(x.base);
      if(x.k==='objprop'||x.k==='objvar'){if(x.id===null)throw E(`${what}는 ${pre}.id.${x.prop||x.name} 처럼 id 를 써야 합니다`,t.line);x.id=pre+'.'+x.id;return;}
      throw E(`${what}는 ${pre}.id.Position · ${pre}.id.Xpos 처럼 씁니다`,t.line);
    };
    fix(r);return r;
  }
  function args(){
    opx('(');const a=[];
    if(!isOp(')')){for(;;){a.push(expr());if(isOp(',')){p++;continue;}break;}}
    opx(')');return a;
  }
  function primary(){
    const t=T();
    if(t.t==='int'||t.t==='float'){p++;return N('num',t.line,{v:t.v,isFloat:t.t==='float',raw:t.raw});}
    if(t.t==='str'){p++;return strNode(t);}
    if(t.t==='kw'&&(t.v==='true'||t.v==='false')){p++;return N('bool',t.line,{v:t.v==='true'});}
    if(t.t==='op'&&t.v==='('){p++;const e=expr();opx(')');return e;}
    if(t.t==='op'&&t.v==='['){p++;return matLit(t);}
    if(t.t==='kw'&&t.v==='obj'){p++;const r=objRef(t);return r.k==='objprop'||r.k==='objvar'?withIdx(r):r;}   // Xpos 등은 이미 성분(idx)
    if(t.t==='kw'&&(t.v==='cam'||t.v==='spk')){p++;const r=camRef(t);return r.k==='objprop'||r.k==='objvar'?withIdx(r):r;}   // cam.id.Xpos
    if(t.t==='id'){
      p++;
      if(isOp('.')){
        p++;
        if(isKw('cam')||isKw('spk')){   // seo.cam.id.setZoom(…) · sou.spk.id.belongto(…)
          const sub=T().v;p++;opx('.');const a=ident(sub==='cam'?'카메라 id':'스피커 id');opx('.');const f=ident('명령어 이름');
          if(!isOp('('))throw E(`'${t.v}.${sub}.${a.v}.${f.v}' 다음에는 ( ) 가 필요합니다 (명령어 호출)`,f.line);
          return N('call',t.line,{lib:t.v,name:f.v,args:[N('str',a.line,{v:a.v}),...args()],sub});
        }
        if(isKw('obj')){   // can.obj.id.isMouseTouched (귀속된 파일에서는 can.obj.isMouseTouched = 자기 자신)
          p++;opx('.');const a=ident('오브젝트 id');
          if(isOp('('))return N('call',t.line,{lib:t.v,name:a.v,args:args(),canObj:true});   // can.obj.setExistableScene(...)
          let id=a.v,prop;
          if(isOp('.')){p++;prop=ident('속성 이름 (isMouseTouched · IsButtonClicked)').v;}else{prop=a.v;id=null;}
          if(id!==null&&isOp('(')){
            const idn=N('str',a.line,{v:id}),as=args();
            return N('call',t.line,{lib:t.v,name:prop,args:prop==='setExistableScene'?[...as,idn]:[idn,...as],canObj:true,objId:true});   // setExistableScene 은 ("장면", "id") 순서
          }   // col.obj.id.setColliderof(...)
          const pl=prop.toLowerCase();
          if(pl==='iscollided'||pl==='collidedobj')return N('objprop',t.line,{id,prop,key:pl==='iscollided'?'iscol':'colid',colLib:t.v});
          if(pl==='animeframe')return N('objprop',t.line,{id,prop,key:'anifr',colLib:t.v});   // mag.obj.id.animeFrame   // col.obj.id.isCollided · collidedObj
          if(pl==='isbuttonpushed'||pl==='isbuttonrelease'||pl==='isbuttonreleased')return N('canobj',t.line,{lib:t.v,id,prop,btn:pl==='isbuttonpushed'?'push':'rel'});   // 누르는 중 · 뗀 순간
          if(pl!=='ismousetouched'&&pl!=='isbuttonclicked')throw E(`'${t.v}.obj.id.' 다음에는 isMouseTouched 나 IsButtonClicked 를 씁니다 (받은 이름: ${prop})`,a.line);
          return N('canobj',t.line,{lib:t.v,id,prop,btn:pl==='isbuttonclicked'?'click':false});
        }
        const m=ident('명령어/변수 이름');
        if(isOp('('))return N('call',t.line,{lib:t.v,name:m.v,args:args()});
        return withIdx(N('member',t.line,{lib:t.v,name:m.v}));
      }
      if(isOp('('))return N('call',t.line,{lib:null,name:t.v,args:args()});
      return withIdx(N('id',t.line,{name:t.v}));
    }
    throw E(`값(식)이 필요합니다 (현재: ${desc(t)})`);
  }
  function unary(){
    if(T().t==='op'&&(T().v==='-'||T().v==='!')){const o=toks[p++];return N('un',o.line,{op:o.v,e:unary()});}
    return primary();
  }
  // 문자열 붙여 쓰기: "Wild " keidex[n] " appeared!"  = "Wild " + keidex[n] + " appeared!"
  //   문자열 바로 뒤에 값, 또는 값 바로 뒤에 문자열이 오면 + 로 이어 붙임 (띄어쓰기는 따옴표 안에)
  const NOTJ=new Set(['and','or','xor','nand','nor','not']);
  const termStart=()=>{const t=T();
    if(t.t==='str'||t.t==='int'||t.t==='float')return true;
    if(t.t==='op')return t.v==='(';
    if(t.t==='kw')return ['obj','cam','spk','true','false'].includes(t.v);
    return t.t==='id'&&!NOTJ.has(t.v);};
  const LV=[['||'],['&&'],['==','!='],['<','>','<=','>='],['+','-'],['*','/','%']];
  function bin(l){
    if(l>=LV.length)return unary();
    let a=bin(l+1),lastLit=!!a.lit;
    for(;;){
      if(T().t==='op'&&LV[l].includes(T().v)){
        const o=toks[p++];const b=bin(l+1);
        a=N('bin',o.line,{op:o.v,l:a,r:b});lastLit=!!b.lit;continue;
      }
      if(LV[l][0]==='+'&&(T().t==='str'||lastLit&&termStart())){   // 붙여 쓴 문자열 → +
        const ln=T().line,b=bin(l+1);
        a=N('bin',ln,{op:'+',l:a,r:b});lastLit=!!b.lit;continue;
      }
      return a;
    }
  }
  const expr=()=>bin(0);
  // 조건: [a] and [b] or not [c] … — 대괄호 조건 여러 개를 and · or · xor · nand · nor · not (&& · || 도) 로 이음
  //   우선순위: not > and · nand > xor > or · nor  ·  ( ) 로 묶기: ([a] or [b]) and [c]
  const LW=w=>T().t==='id'&&T().v===w;
  function condUnit(){
    if(LW('not')){const o=toks[p++];return N('un',o.line,{op:'!',e:condUnit()});}
    if(isOp('(')&&(toks[p+1].t==='op'&&toks[p+1].v==='['||toks[p+1].t==='id'&&toks[p+1].v==='not'&&toks[p+2].t==='op'&&(toks[p+2].v==='['||toks[p+2].v==='('))){
      p++;const e=condOr();opx(')');return e;
    }
    let close;
    if(isOp('['))close=']';else if(isOp('('))close=')';
    else throw E(`조건은 [ ] 안에 써야 합니다 (현재: ${desc(T())})`);
    p++;const e=expr();opx(close);return e;
  }
  const bool=e=>N('un',e.line,{op:'!',e:N('un',e.line,{op:'!',e})});   // 참/거짓 (0 · 1)
  function condJoin(next,words){
    let a=next();
    for(;;){
      const t=T();let w=null;
      if(t.t==='id'&&words.includes(t.v))w=t.v;
      else if(t.t==='op'&&t.v==='&&'&&words.includes('and'))w='and';
      else if(t.t==='op'&&t.v==='||'&&words.includes('or'))w='or';
      if(!w)return a;
      p++;
      if(!(isOp('[')||isOp('(')||LW('not')))throw E(`'${t.v}' 다음에는 [조건] 이 와야 합니다 (예: if [a > 1] ${w} [b < 2]{ })`);
      const b=next();
      if(w==='and'||w==='nand'){a=N('bin',t.line,{op:'&&',l:a,r:b});if(w==='nand')a=N('un',t.line,{op:'!',e:a});}
      else if(w==='or'||w==='nor'){a=N('bin',t.line,{op:'||',l:a,r:b});if(w==='nor')a=N('un',t.line,{op:'!',e:a});}
      else a=N('bin',t.line,{op:'!=',l:bool(a),r:bool(b)});   // xor: 둘 중 하나만 참
    }
  }
  const condAnd=()=>condJoin(condUnit,['and','nand']);
  const condXor=()=>condJoin(condAnd,['xor']);
  const condOr=()=>condJoin(condXor,['or','nor']);
  const cond=condOr;
  function block(){
    opx('{');const b=[];
    while(!isOp('}')){
      if(T().t==='eof')throw E(`'}' 이(가) 필요합니다 — 블록이 닫히지 않았습니다`,toks[p-1].line);
      b.push(stmt());
    }
    p++;return b;
  }
  function varDecl(atTop){
    const t=toks[p++];
    let pub=false;
    if(isKw('public')){
      if(!atTop)throw E('public 변수는 파일 최상위에서만 선언할 수 있습니다 (run{ } · func 밖)');
      p++;pub=true;
    }
    if(T().t!=='type')throw E(`변수 형식(int, float, string, bit, matrix, list, compound)이 필요합니다 (현재: ${desc(T())})`);
    const ty=toks[p++].v;
    let dims=null;
    if(ty==='matrix'){
      if(!isOp('['))throw E("행렬은 크기를 정해야 합니다 (예: var matrix[2, 3] call 이름;)");
      p++;dims=[];
      for(const w of ['행','열']){
        const d=T();
        if(d.t!=='int'||d.v<1)throw E(`행렬의 ${w} 개수는 1 이상의 정수여야 합니다 (예: matrix[2, 3])`);
        p++;dims.push(d.v);
        if(w==='행')opx(',');
      }
      opx(']');
      if(dims[0]*dims[1]>100000)throw E('행렬이 너무 큽니다 (성분 100000개까지)');
    }
    if(!isKw('call'))throw E(`'call' 이(가) 필요합니다 (예: var ${ty==='matrix'?dimsTxt(dims):ty} call 이름;)`);
    p++;
    const nm=ident('변수 이름');
    let init=null;
    if(isOp('=')){
      if(pub)throw E(`public 변수는 선언할 때 값을 넣을 수 없습니다 — run{ } 안에서 '${nm.v} = 값;' 으로 넣으세요`);
      p++;init=expr();
    }
    semi();
    return N('var',t.line,{ty,name:nm.v,init,pub,dims});
  }
  function ifStmt(){
    const t=toks[p++];const c=cond();const th=block();let el=null,elseIf=false;
    if(isKw('else')){
      p++;
      if(isKw('if')){el=[ifStmt()];elseIf=true;}
      else el=block();
    }
    return N('if',t.line,{cond:c,then:th,else:el,elseIf});
  }
  function loopStmt(){
    const t=toks[p++];
    const c=(isOp('[')||isOp('('))?cond():null;   // 조건 없으면 무한 반복
    if(isKw('for')){   // loop for ms{ } · loop [조건] for ms{ } — ms 밀리초 동안 반복
      p++;
      if(isOp('{'))throw E("loop for 다음에는 반복할 시간(ms)을 씁니다 (예: loop for 1000{ } · loop [hp > 0] for 3000{ })");
      const ms=expr();
      return N('loop',t.line,{cond:c,ms,body:block()});
    }
    return N('loop',t.line,{cond:c,body:block()});
  }
  function stmt(){
    const t=T();
    if(t.t==='kw'){
      switch(t.v){
        case 'var':return varDecl(false);
        case 'if':return ifStmt();
        case 'loop':return loopStmt();
        case 'while':throw E("while 은 loop 로 바뀌었습니다 — 'loop [조건]{ }' 형태로 쓰세요");
        case 'obj':case 'cam':case 'spk':{
          p++;const r0=t.v==='obj'?objRef(t):camRef(t);
          const r=r0.k==='objkeep'?objCompNode(N,t.line,null,r0.name):r0.k==='idx'?r0:withIdx(r0);   // obj.Xpos = 값; → 자기 자신
          if(!isOp('='))throw E("obj.id.속성 은 '= 값;' 으로 값을 넣을 때 문장으로 쓸 수 있습니다");
          p++;const e=expr();semi();
          return r.k==='idx'?N('eassign',t.line,{target:r.base,i:r.i,j:r.j,expr:e}):N('oassign',t.line,{target:r,expr:e});
        }
        case 'Use':case 'use':case 'Lib':case 'func':case 'run':
          throw E(`'${t.v}' 은(는) 블록 안에서 쓸 수 없습니다 (파일 최상위에만 쓸 수 있습니다)`);
        case 'else':throw E("else 앞에 짝이 되는 if 가 없습니다 — 바로 위 if 에 이미 else 가 있거나, 위쪽 if 의 { } 가 닫히지 않았는지 확인하세요 (} 하나 빠짐)");
      }
      throw E(`여기서는 '${t.v}' 을(를) 쓸 수 없습니다`);
    }
    if(t.t==='type')throw E(`변수는 'var ${t.v} call 이름;' 형태로 만듭니다`);
    if(t.t==='id'){
      const n=toks[p+1];
      if(n.t==='op'&&n.v==='='){p+=2;const e=expr();semi();return N('assign',t.line,{name:t.v,expr:e});}
      if(n.t==='op'&&n.v==='['){
        p++;const r=withIdx(N('id',t.line,{name:t.v}));
        if(!isOp('='))throw E("행렬 성분은 '이름[행, 열] = 값;', 리스트 항목은 '이름[번호] = 값;' 으로 넣습니다");
        p++;const e=expr();semi();
        return N('eassign',t.line,{target:r.base,i:r.i,j:r.j,expr:e});
      }
      if(n.t==='op'&&(n.v==='('||n.v==='.')){
        const c=primary();
        if(c.k!=='call')throw E('값만 단독으로 쓸 수 없습니다 — 명령어 호출이어야 합니다 (예: jaw.log("hi");)',t.line);
        if(c.name==='setParent'&&isOp('(')){   // dis.setParent() ("자식") as ("부모");
          p++;const ch=expr();opx(')');
          if(!isKw('as'))throw E("'as' 가 필요합니다 (예: dis.setParent() (\"자식\") as (\"부모\");)");
          p++;opx('(');const pa=expr();opx(')');
          c.relChild=ch;c.relParent=pa;
        }
        else if(c.name==='setParent'&&isKw('obj')){   // 예전 형태: dis.setParent() obj.자식 as obj.부모; (그대로 됨)
          p++;opx('.');const ch=ident('자식 오브젝트 id');
          if(!isKw('as'))throw E("'as' 가 필요합니다 (예: dis.setParent() (\"자식\") as (\"부모\");)");
          p++;
          if(!isKw('obj'))throw E("'as' 다음에는 obj.부모id 를 씁니다 (예: dis.setParent() obj.자식 as obj.부모;)");
          p++;opx('.');const pa=ident('부모 오브젝트 id');
          c.relChild=N('str',ch.line,{v:ch.v});c.relParent=N('str',pa.line,{v:pa.v});
        }
        if(T().t==='id'&&T().v==='save'){   // mag.importFile("경로") save as ("id");
          p++;if(!isKw('as'))throw E("'save' 다음에는 'as' 가 필요합니다 (예: mag.importFile(\"img/a.png\") save as (\"hero\");)");
          p++;c.saveAs=expr();
        }
        if(isKw('to')){p++;c.toExpr=expr();if(isKw('for')){p++;c.forExpr=expr();}}
        else if(isKw('for')){p++;c.forExpr=expr();}   // dis.setObjAlpha("id", 0) for 500;
        if(T().t==='id'&&T().v==='ease'){p++;c.easeExpr=expr();}   // dis.moveObj("id") to [x, y] for 500 ease ("sinleft");
        if(isKw('as')){p++;c.asName=ident('받을 변수 이름').v;c.asLine=toks[p-1].line;}
        semi();return c;
      }
    }
    throw E(`알 수 없는 문장입니다: ${desc(t)}`);
  }
  function useStmt(){
    const t=toks[p++];const lib=ident('라이브러리 id');
    if(!isKw('call'))throw E(`'call' 이(가) 필요합니다 (예: Use ${lib.v} call 이름)`);
    p++;const al=ident('별칭 이름');
    if(isOp(';'))p++;
    return N('use',t.line,{lib:lib.v,alias:al.v});
  }
  function libHeader(){
    const t=toks[p++];
    if(ast.length)throw E('Lib 헤더는 파일 맨 위(첫 문장)에 있어야 합니다',t.line);
    if(!(T().t==='id'&&T().v==='id'))throw E("'Lib id 이름;' 형태로 써야 합니다 (예: Lib id greet parent base;)");
    p++;const id=ident('라이브러리 id');
    let parent=null;
    if(T().t==='id'&&T().v==='parent'){p++;parent=ident('부모 라이브러리 id').v;}
    semi();
    return N('lib',t.line,{id:id.v,parent});
  }
  function funcDef(){
    const t=toks[p++];
    let retTy=null,retDims=null;   // func 형식 이름(...) → 값을 돌려주는 함수 (int float string bit matrix[r, c] list compound)
    const mDims=()=>{   // matrix[행, 열]
      if(!isOp('['))throw E("행렬은 크기를 정해야 합니다 (예: matrix[2, 3])");
      p++;const d=[];
      for(const w of ['행','열']){
        const x=T();
        if(x.t!=='int'||x.v<1)throw E(`행렬의 ${w} 개수는 1 이상의 정수여야 합니다 (예: matrix[2, 3])`);
        p++;d.push(x.v);if(w==='행')opx(',');
      }
      opx(']');return d;
    };
    if(T().t==='type'){retTy=toks[p++].v;if(retTy==='matrix')retDims=mDims();}
    const nm=ident('함수 이름');opx('(');const params=[];
    if(!isOp(')')){for(;;){
      if(T().t!=='type')throw E(`매개변수 형식이 필요합니다 (현재: ${desc(T())})`);
      const ty=toks[p++].v,dims=ty==='matrix'?mDims():null;
      const pn=ident('매개변수 이름');
      params.push({ty,name:pn.v,dims});
      if(isOp(',')){p++;continue;}break;
    }}
    opx(')');
    return N('func',t.line,{name:nm.v,params,retTy,retDims,body:block()});
  }
  function top(){
    const t=T();
    if(t.t==='id'&&toks[p+1].t==='op'&&toks[p+1].v==='.'&&toks[p+2].t==='id'&&(toks[p+2].v==='BelongObj'||toks[p+2].v==='BelongScene')){
      const sc=toks[p+2].v==='BelongScene';
      throw E(`${toks[p+2].v} 는 이제 경로 없이 run{ } 안에 씁니다 — 귀속시킬 파일의 run{ } 안에 ${t.v}.${toks[p+2].v}("${sc?'장면':'id'}"); (그 파일 전체가 귀속됨)`);
    }
    if(t.t==='kw'){
      switch(t.v){
        case 'Use':case 'use':return useStmt();
        case 'var':return varDecl(true);
        case 'Lib':
          if(kind!=='jbl')throw E('Lib 헤더는 라이브러리(.jbl) 파일에서만 쓸 수 있습니다');
          return libHeader();
        case 'run':
          if(kind!=='jb')throw E('run{ } 은 코드 파일(.jb) 에서만 쓸 수 있습니다');
          p++;return N('run',t.line,{body:block()});
        case 'func':
          if(kind!=='jbl')throw E('func 는 라이브러리(.jbl) 파일에서만 정의할 수 있습니다');
          return funcDef();
      }
    }
    throw E(kind==='jb'
      ?'코드는 run{ ... } 안에 써야 실행됩니다 (파일 최상위에는 Use, var, run 만 쓸 수 있습니다)'
      :'라이브러리 최상위에는 Lib, Use, var, func 만 쓸 수 있습니다');
  }
  while(T().t!=='eof')ast.push(top());
  return ast;
}

/* ---------- paths / project file (.jbs) ---------- */
function normPath(p){
  const out=[];
  for(const s of String(p).replace(/\\/g,'/').split('/')){
    if(!s||s==='.')continue;
    if(s==='..'){if(!out.length)return null;out.pop();continue;}
    out.push(s);
  }
  return out.join('/');
}
const dirOf=p=>p.includes('/')?p.slice(0,p.lastIndexOf('/')):'';
const baseOf=p=>p.slice(p.lastIndexOf('/')+1);
const isJbsRoot=f=>/^[^/]+\.jbs$/.test(f);

// project.jbs 형식:  첫 줄 'jbs 1',  그 다음  '키 = 값'  (name, main)  — // 주석
function parseJbs(src,file){
  const out={name:'',main:''};let ver=null;
  src.split('\n').forEach((raw,i)=>{
    const line=raw.replace(/(^|\s)\/\/.*$/,'').trim();if(!line)return;const ln=i+1;   // 줄 처음이나 공백 뒤의 // 만 주석 (name = My//Game 은 그대로)
    if(ver===null){
      const m=/^jbs\s+(\d+)$/.exec(line);
      if(!m)throw new JBError("프로젝트 파일의 첫 줄은 'jbs 1' 이어야 합니다",ln,file);
      ver=+m[1];
      if(ver!==1)throw new JBError(`지원하지 않는 jbs 버전입니다: ${ver}`,ln,file);
      return;
    }
    const m=/^([A-Za-z_]+)\s*=\s*(.*)$/.exec(line);
    if(!m)throw new JBError("'키 = 값' 형식이어야 합니다 (예: main = main.jb)",ln,file);
    if(!Object.hasOwn(out,m[1]))throw new JBError(`알 수 없는 항목 '${m[1]}' (사용 가능: name, main)`,ln,file);
    out[m[1]]=m[2].trim();
  });
  if(ver===null)throw new JBError("프로젝트 파일에 'jbs 1' 줄이 필요합니다",1,file);
  return out;
}
function readProject(files){
  const js=Object.keys(files).filter(isJbsRoot);
  if(!js.length)throw new JBError('프로젝트 최상위에 .jbs 파일이 없습니다 (디렉토리임을 나타내는 프로젝트 파일이 필요합니다)',1,'');
  if(js.length>1)throw new JBError(`.jbs 파일이 여러 개입니다: ${js.join(', ')}`,1,js[1]);
  return Object.assign(parseJbs(files[js[0]],js[0]),{file:js[0]});
}
function resolveTaskPath(raw,fromFile){
  let p=String(raw).trim().replace(/\\/g,'/');
  const rel=p.startsWith('./')||p.startsWith('../');
  if(p.startsWith('/'))p=p.slice(1);
  return normPath((rel?dirOf(fromFile)+'/':'')+p);
}
function scanLibId(src,file){
  try{
    const t=lex(src,file);
    if(t[0].t==='kw'&&t[0].v==='Lib'&&t[1].t==='id'&&t[1].v==='id'&&t[2].t==='id')return t[2].v;
  }catch(e){}
  return baseOf(file).replace(/\.jbl$/,'');
}

/* ---------- checker ---------- */
/* 수학 함수 — 값을 돌려주므로 식 안에서 씀. 각도는 기본 '도', 이름 끝에 Rad 를 붙이면 라디안 */
const D2R=Math.PI/180,R2D=180/Math.PI;
// ps: 매개변수 개수 · r: 돌려주는 형식 (float / int / num=int끼리면 int / same=받은 형식) · c: C 코드 (%0 %1 = 인자)
const MATH={
  sin:{n:1,r:'float',f:x=>Math.sin(x*D2R),c:'sin((%0) * JB_D2R)',d:'사인 (각도: 도)'},
  cos:{n:1,r:'float',f:x=>Math.cos(x*D2R),c:'cos((%0) * JB_D2R)',d:'코사인 (각도: 도)'},
  tan:{n:1,r:'float',f:x=>Math.tan(x*D2R),c:'tan((%0) * JB_D2R)',d:'탄젠트 (각도: 도)'},
  asin:{n:1,r:'float',f:x=>Math.asin(x)*R2D,c:'(asin(%0) * JB_R2D)',d:'아크사인 → 도 (값은 -1 ~ 1)'},
  acos:{n:1,r:'float',f:x=>Math.acos(x)*R2D,c:'(acos(%0) * JB_R2D)',d:'아크코사인 → 도 (값은 -1 ~ 1)'},
  atan:{n:1,r:'float',f:x=>Math.atan(x)*R2D,c:'(atan(%0) * JB_R2D)',d:'아크탄젠트 → 도'},
  atan2:{n:2,r:'float',f:(y,x)=>Math.atan2(y,x)*R2D,c:'(atan2(%0, %1) * JB_R2D)',d:'atan2(y, x) → 도 (방향 각도)'},
  sinRad:{n:1,r:'float',f:Math.sin,c:'sin(%0)',d:'사인 (각도: 라디안)'},
  cosRad:{n:1,r:'float',f:Math.cos,c:'cos(%0)',d:'코사인 (각도: 라디안)'},
  tanRad:{n:1,r:'float',f:Math.tan,c:'tan(%0)',d:'탄젠트 (각도: 라디안)'},
  asinRad:{n:1,r:'float',f:Math.asin,c:'asin(%0)',d:'아크사인 → 라디안'},
  acosRad:{n:1,r:'float',f:Math.acos,c:'acos(%0)',d:'아크코사인 → 라디안'},
  atanRad:{n:1,r:'float',f:Math.atan,c:'atan(%0)',d:'아크탄젠트 → 라디안'},
  atan2Rad:{n:2,r:'float',f:Math.atan2,c:'atan2(%0, %1)',d:'atan2(y, x) → 라디안'},
  sqrt:{n:1,r:'float',f:Math.sqrt,c:'sqrt(%0)',d:'제곱근 (0 이상)'},
  pow:{n:2,r:'float',f:Math.pow,c:'pow(%0, %1)',d:'pow(a, b) = a 의 b 제곱'},
  ln:{n:1,r:'float',f:Math.log,c:'log(%0)',d:'자연로그 (0 보다 큰 값)'},
  log10:{n:1,r:'float',f:Math.log10,c:'log10(%0)',d:'상용로그 (0 보다 큰 값)'},
  abs:{n:1,r:'same',f:Math.abs,d:'절댓값'},
  floor:{n:1,r:'int',f:Math.floor,c:'((int)floor(%0))',d:'내림 → int'},
  ceil:{n:1,r:'int',f:Math.ceil,c:'((int)ceil(%0))',d:'올림 → int'},
  round:{n:1,r:'int',f:Math.round,c:'((int)floor((%0) + 0.5))',d:'반올림 → int'},
  min:{n:2,r:'num',f:Math.min,d:'둘 중 작은 값'},
  max:{n:2,r:'num',f:Math.max,d:'둘 중 큰 값'},
  random:{n:2,r:'float',f:(a,b)=>a+(b-a)*Math.random(),c:'jb_rand(%0, %1)',d:'random(a, b) = a 이상 b 미만의 무작위 실수'},
  pi:{n:0,r:'float',f:()=>Math.PI,c:'JB_PI',d:'원주율 3.14159…'}
};
// 문자열 함수 — 식 안에서 (jaw.strLen(s) 도 가능) · 글자 번호는 1 부터 · 한글 · 이모지도 한 글자
// a: 값 형식 (s 문자열 · i 번호) · r: 돌려주는 형식 · c: C 코드
const u8=s=>Array.from(s);
const strWs=/^[ \t\n\r]+|[ \t\n\r]+$/g;
const strNum=s=>{const t=s.replace(strWs,'');if(!t)return 0;const v=Number(t);return Number.isFinite(v)?v:0;};
const subStr=(s,f,n)=>{f=Math.trunc(f);n=Math.trunc(n);if(f<1){n+=f-1;f=1;}if(n<=0)return '';return u8(s).slice(f-1,f-1+n).join('');};
const STRF={
  strLen:{a:['s'],r:'int',sig:'(s)',f:s=>u8(s).length,c:'jb_strLen(%0)',d:'글자 수'},
  subStr:{a:['s','i','i'],r:'string',sig:'(s, from, n)',f:subStr,c:'jb_subStr(%0, (int)(%1), (int)(%2))',d:'from 번째 글자부터 n 글자'},
  charAt:{a:['s','i'],r:'string',sig:'(s, n)',f:(s,i)=>subStr(s,i,1),c:'jb_subStr(%0, (int)(%1), 1)',d:'n 번째 글자 (없으면 "")'},
  findStr:{a:['s','s'],r:'int',sig:'(s, t)',f:(s,t)=>{const i=s.indexOf(t);return i<0?0:u8(s.slice(0,i)).length+1;},c:'jb_findStr(%0, %1)',d:'t 가 처음 나오는 글자 번호 (없으면 0)'},
  replaceStr:{a:['s','s','s'],r:'string',sig:'(s, old, new)',f:(s,a,b)=>a===''?s:s.split(a).join(b),c:'jb_replaceStr(%0, %1, %2)',d:'old 를 모두 new 로 바꿈'},
  upperStr:{a:['s'],r:'string',sig:'(s)',f:s=>s.replace(/[a-z]+/g,x=>x.toUpperCase()),c:'jb_caseStr(%0, 1)',d:'영문을 대문자로'},
  lowerStr:{a:['s'],r:'string',sig:'(s)',f:s=>s.replace(/[A-Z]+/g,x=>x.toLowerCase()),c:'jb_caseStr(%0, 0)',d:'영문을 소문자로'},
  trimStr:{a:['s'],r:'string',sig:'(s)',f:s=>s.replace(strWs,''),c:'jb_trimStr(%0)',d:'앞뒤 공백 · 줄바꿈 제거'},
  startsWith:{a:['s','s'],r:'bit',sig:'(s, t)',f:(s,t)=>s.startsWith(t)?1:0,c:'jb_startsWith(%0, %1)',d:'s 가 t 로 시작하면 1'},
  endsWith:{a:['s','s'],r:'bit',sig:'(s, t)',f:(s,t)=>s.endsWith(t)?1:0,c:'jb_endsWith(%0, %1)',d:'s 가 t 로 끝나면 1'},
  toInt:{a:['s'],r:'int',sig:'(s)',f:s=>Math.trunc(strNum(s))|0,c:'jb_toInt(%0)',d:'문자열 → int (숫자가 아니면 0)'},
  toFloat:{a:['s'],r:'float',sig:'(s)',f:strNum,c:'jb_strNum(%0)',d:'문자열 → float (숫자가 아니면 0)'},
  splitStr:{a:['s','s'],r:'list',sig:'(s, sep)',f:(s,t)=>({items:t===''?u8(s):s.split(t)}),d:'구분자로 나눈 list — 리스트 변수에 바로 넣을 때만'}
};
// 내보내는 파일의 난독화 (jaw.exportFile · jaw.openFile): UTF-8 바이트를 xorshift 키 흐름과 XOR → base64 → 뒤집기 · 앞에 "JBX1"
//   (암호가 아니라 그냥 읽거나 고치기 어렵게 하는 것) — openFile 은 "JBX1" 로 시작하면 풀고, 아니면 그대로 읽음
function jbKeyStream(n){const k=new Uint8Array(n);let x=0x6A62786B>>>0;for(let i=0;i<n;i++){x^=x<<13;x>>>=0;x^=x>>>17;x^=x<<5;x>>>=0;k[i]=(x^(i*131))&255;}return k;}
function jbObf(t){const b=new TextEncoder().encode(t),k=jbKeyStream(b.length);let bin='';for(let i=0;i<b.length;i++)bin+=String.fromCharCode(b[i]^k[i]);return 'JBX1'+btoa(bin).split('').reverse().join('');}
function jbDeobf(t){t=String(t).trim();if(!t.startsWith('JBX1'))return t;const bin=atob(t.slice(4).split('').reverse().join('')),k=jbKeyStream(bin.length),b=new Uint8Array(bin.length);for(let i=0;i<bin.length;i++)b[i]=bin.charCodeAt(i)^k[i];return new TextDecoder().decode(b);}
// JSON 글자로 (jaw.genJson) — 행렬은 한 줄이면 [x, y], 여러 줄이면 [[…], […]]
function jbJson(v){
  if(typeof v==='number')return Number.isFinite(v)?JSON.stringify(v):'null';
  if(typeof v==='string')return JSON.stringify(v);
  if(v.d){const row=i=>'['+v.d.slice(i*v.c,(i+1)*v.c).map(jbJson).join(',')+']';return v.r===1?row(0):'['+Array.from({length:v.r},(_,i)=>row(i)).join(',')+']';}
  return '['+v.items.map(jbJson).join(',')+']';
}
const JSON_PATH=/^([\p{L}\p{N}_-]+\/)*[\p{L}\p{N}_-]+\.json$/u;
// JSON → compound (jaw.loadJson): 배열 → compound · 숫자 · 문자열 그대로 · true/false → 1/0 · null → 0 · 맨 바깥이 배열이 아니면 [값]
function jsonToJb(v){
  if(Array.isArray(v))return {items:v.map(jsonToJb),comp:true};
  if(typeof v==='number'||typeof v==='string')return v;
  if(typeof v==='boolean')return v?1:0;
  if(v===null)return 0;
  throw new Error('obj');
}
// 돌아간 상자 (콜라이더 · 트리거는 오브젝트와 같이 돎 · 간격도 돎)
function obb(o,b){
  const r=(o.angle||0)*D2R,c=Math.cos(r),s=Math.sin(r);
  return {x:o.pos.d[0]+b.off[0]*c-b.off[1]*s,y:o.pos.d[1]+b.off[0]*s+b.off[1]*c,hx:Math.abs(b.size[0])/2,hy:Math.abs(b.size[1])/2,c,s};
}
// 분리축 검사: 겹치면 [nx, ny, 깊이] (B → A 방향) · touch 면 경계에 닿아도 겹침
function satHit(A,B,touch){
  const dx=A.x-B.x,dy=A.y-B.y;let best=Infinity,nx=0,ny=0;
  for(const [lx,ly] of [[A.c,A.s],[-A.s,A.c],[B.c,B.s],[-B.s,B.c]]){
    const ra=A.hx*Math.abs(A.c*lx+A.s*ly)+A.hy*Math.abs(-A.s*lx+A.c*ly);
    const rb=B.hx*Math.abs(B.c*lx+B.s*ly)+B.hy*Math.abs(-B.s*lx+B.c*ly);
    const d=dx*lx+dy*ly,ov=ra+rb-Math.abs(d);
    if(touch?ov<0:ov<=0)return null;
    if(ov<best){best=ov;const sg=d<0?-1:1;nx=lx*sg;ny=ly*sg;}
  }
  return [nx,ny,best];
}
const BUILTINS={
  log:{params:['any']},print:{params:['any']},
  wait:{params:['int']},terminate:{params:[]},sendto:{params:['string']},
  break:{params:[]},return:{params:[]},goTo:{params:['int']},setup:{params:['string']},
  keyClick:{params:['string']},keyPush:{params:['string']},keyRlse:{params:['string']},   // 키를 누른 것처럼 (isKeyInput 에 보임)
  setJson:{params:['string','json']},genJson:{params:['string','string']},loadJson:{params:['string','string']},   // JSON 으로 담아 두고 · 파일로 저장 · 파일에서 compound 로
  exportFile:{params:['string','string']},openFile:{params:['string']}   // 파일을 난독화해서 내려받기 · 기기의 파일을 골라 그 경로로 (난독화된 것도 풀어서 · 고를 때까지 기다림)
};
const isL=t=>t==='list'||t==='compound';
// 키 이름: 소문자 · 별칭 → 기본 이름 ("Space" " " → "space", "ArrowUp" → "up" …)
const KEY_AL={' ':'space',spacebar:'space',return:'enter',escape:'esc',control:'ctrl',arrowup:'up',arrowdown:'down',arrowleft:'left',arrowright:'right',
  shiftleft:'shift',shiftright:'shift',controlleft:'ctrl',controlright:'ctrl',altleft:'alt',altright:'alt',metaleft:'meta',metaright:'meta',numpadenter:'enter'};
function keyCanon(n){n=String(n).toLowerCase();return hget(KEY_AL,n)||n;}   // 리스트처럼 다루는 형식
function assignable(to,from){
  if(to==='matrix'||from==='matrix'||to==='list'||from==='list'||to==='compound'||from==='compound')return to===from;   // 행렬은 크기까지 따로 확인
  if(to==='string')return from==='string';
  if(from==='string')return false;
  if(to==='int')return from==='int'||from==='bit';
  if(to==='bit')return from==='bit'||from==='int';
  return true; // float
}
function chainOf(prog,id){
  const a=[];
  for(let m=prog.byId.get(id);m;m=m.parentId?prog.byId.get(m.parentId):null)a.push(m);
  return a;
}
function resolveFunc(prog,id,n){
  for(const m of chainOf(prog,id)){const f=m.funcs&&m.funcs.get(n);if(f)return{mod:m.name,def:f};}
  return null;
}
function resolveVar(prog,id,n){
  for(const m of chainOf(prog,id)){const v=m.globals&&m.globals.get(n);if(v)return v;}
  return null;
}
function check(mod,prog){
  const isLib=mod.isLib;
  const E=(m,n)=>new JBError(m,n.line,mod.file);
  const gs=new Map();mod.globals=gs;mod.funcs=new Map();
  let runs=0;
  for(const s of mod.ast){
    if(s.k==='func'){
      if(mod.funcs.has(s.name))throw E(`함수 '${s.name}' 이(가) 중복 정의되었습니다`,s);
      mod.funcs.set(s.name,s);
    }else if(s.k==='run')runs++;
  }
  if(!isLib&&runs===0&&!mod.bound&&!mod.sceneBound)throw E('run{ } 블록이 없습니다 — 실행할 코드는 run{ ... } 안에 써야 합니다',{line:1});
  let curLine=1;
  const look=(n,sc)=>{
    for(let i=sc.length-1;i>=0;i--){const v=sc[i].get(n);if(v)return v;}
    const v=isLib&&mod.parentId?resolveVar(prog,mod.parentId,n):null;
    const pv=v||prog.publics.get(n);if(pv)return pv;   // 그다음 프로젝트 전체 public 변수
    if(mod.bound){   // 귀속된 파일: 부모 오브젝트의 변수
      const i=prog.parentVars.get(n);
      if(i&&i.clash)throw new JBError(`부모 변수 '${n}' 의 형식이 파일마다 달라 정할 수 없습니다 (${i.file} · ${i.clash})`,curLine,mod.file);
      if(i){i.used=true;return i;}
    }
    return null;
  };
  let objCtx=false;   // setObject · setObjPos · setObjScale 의 인자를 검사하는 중
  const isNum=t=>t==='int'||t==='float'||t==='bit';
  // 리스트 항목(any)은 실행할 때 형식을 확인 — 쓰이는 곳의 형식을 e.chk 에 적어 둠
  const isNumA=(e,t,w)=>{if(t==='any'){e.chk=w||'float';return true;}return isNum(t);};
  const fit=(e,t,to)=>{if(t==='any'){if(to==='matrix')return false;e.chk=to;return true;}if(to==='int'&&t==='float'&&e&&e.anyInt)return true;return assignable(to,t);};   // 리스트 항목으로 계산한 값(l[1] - 1)은 int 에도 넣을 수 있음   // list · compound 도 실행할 때 확인
  let curFn=null;   // 지금 검사 중인 함수 (return(값) 용)
  let runK=-1,runN=0;   // 지금 검사 중인 run 이 몇 번째인지
  const listOf=(n,sc)=>{if(hget(mod.uses,n))return null;const i=look(n,sc);return i&&isL(i.ty)?i:null;};
  const lnode=(name,info,line)=>({k:'id',name,info,line,file:mod.file,ty:info.ty});
  // 식 안에서 부르는 사용자 함수 (lib.함수(...) · 라이브러리 안에서는 함수(...))
  function userFn(c){
    if(c.lib===null)return isLib?resolveFunc(prog,mod.name,c.name):null;
    const al=hget(mod.uses,c.lib);
    if(!al||al==='jawbreaker'||al===DIS_ID||al===COL_ID||al===CAN_ID||al===MAG_ID||al===SND_ID||al===CAM_ID)return null;
    return resolveFunc(prog,al,c.name);
  }
  function fnArgs(c,def,sc){
    if(c.args.length!==def.params.length)throw E(`'${c.name}' 은(는) 값 ${def.params.length}개가 필요합니다 (받은 값: ${c.args.length}개)`,c);
    c.args.forEach((a,i)=>{
      const pp=def.params[i],pt=pp.ty;
      if(isL(pt)&&a.k==='mat'){a.asList=true;a.comp=pt==='compound';}   // [ … ] 를 바로 넘김
      const t=ex(a,sc);
      if(pt==='matrix'){needMat(a,t,pp.dims,`'${c.name}' 의 ${i+1}번째 값`);return;}
      if(!fit(a,t,pt))throw E(`'${c.name}' 의 ${i+1}번째 값은 ${pt} 형식이어야 합니다 (받은 형식: ${tyTxt(t,a)})`,a);
    });
  }
  // compound 안의 [ … ]: 문자열 · 리스트 · compound · 행렬 변수 · 빈 [] 을 품으면 compound (숫자만이면 그대로 행렬 — [x, y] 위치 등)
  const strish=(y,sc)=>{
    if(y.k==='str')return true;
    if(y.k==='bin'&&y.op==='+')return strish(y.l,sc)||strish(y.r,sc);
    if(y.k==='mat')return wantComp(y,sc);
    if(y.k==='id'){const i=look(y.name,sc);return !!i&&['string','list','compound','matrix'].includes(i.ty);}
    if(y.k==='call')return !!(hget(STRF,y.name)&&hget(STRF,y.name).r==='string');
    return false;
  };
  const wantComp=(x,sc)=>x.k==='mat'&&(x.empty||(x.rows.length===1&&x.rows[0].some(y=>strish(y,sc))));
  const compMark=(x,sc)=>{if(wantComp(x,sc)){x.asList=true;x.comp=true;}};
  // 리스트 항목: 숫자 · 문자열만 (compound 는 무엇이든). 다른 항목(any)은 실행할 때 확인
  const itemOk=(a,t,comp)=>{
    if(comp)return;
    if(t==='any'){a.chk='scalar';return;}
    if(t==='matrix'||isL(t))throw E(`리스트 항목에는 숫자나 문자열만 넣을 수 있습니다 (받은 형식: ${tyTxt(t,a)}) — 행렬 · 리스트까지 넣으려면 compound 를 쓰세요`,a);
  };
  const tyTxt=(t,e)=>t==='matrix'&&e&&e.dims?dimsTxt(e.dims):t;
  const sameDims=(a,b)=>a&&b&&a[0]===b[0]&&a[1]===b[1];
  function needMat(e,t,dims,what){
    if(t==='any'){e.chk='matrix';e.chkDims=dims;e.dims=dims;return;}   // compound 항목: 실행할 때 행렬 · 크기 확인
    if(t!=='matrix'||!sameDims(e.dims,dims))throw E(`${what} 에는 ${dimsTxt(dims)} 행렬이 필요합니다 (받은 값: ${tyTxt(t,e)})`,e);
  }
  function idxCheck(e,sc,dims){
    [[e.i,dims&&dims[0],'행'],[e.j,dims&&dims[1],'열']].forEach(([x,n,w])=>{
      const t=ex(x,sc);
      if(t==='any'){x.chk='int';return;}
      if(t==='float'&&x.anyInt)return;   // selectedBox[1] - 1 처럼 리스트 항목으로 계산한 번호
      if(t!=='int'&&t!=='bit')throw E(`행렬의 ${w} 번호는 int 여야 합니다 (받은 형식: ${t})`,x);
      if(n&&x.k==='num'&&(x.v<1||x.v>n))throw E(`행렬의 ${w} 번호 ${x.v} 이(가) 범위(1~${n})를 벗어났습니다`,x);
    });
  }
  function colorCheck(a,t,what){
    if(t==='any'){a.chk='string';return;}
    if(t!=='string'&&t!=='int'&&t!=='bit')throw E(`${what} 은(는) 헥스코드여야 합니다 (예: "#ff8800" 또는 114514)`,a);
    if(a.k==='str'&&!HEX_RE.test(a.v))throw E(`색은 헥스코드여야 합니다 (예: "#1e90ff", "#fff") — 받은 값: "${a.v}"`,a);
    if(a.k==='num'&&!/^(\d{3}|\d{6})$/.test(a.raw!=null?a.raw:String(a.v)))throw E(`숫자로 쓴 색은 3자리나 6자리여야 합니다 (예: 114514 → #114514) — 받은 값: ${a.v}`,a);
  }
  const aliasErr=(name,n)=>E(`'${name}' 은(는) 라이브러리 별칭이 아닙니다 (파일 위쪽에 'Use 라이브러리id call ${name}' 이 필요합니다)`,n);

  function ex(e,sc){
    switch(e.k){
      case 'num':
        if(!e.isFloat&&e.v>2147483647)throw E('int 범위(최대 2147483647)를 넘는 숫자입니다',e);
        return e.ty=e.isFloat?'float':'int';
      case 'str':return e.ty='string';
      case 'bool':return e.ty='bit';
      case 'id':{
        curLine=e.line;
        const i=look(e.name,sc);
        if(!i)throw E(hget(mod.uses,e.name)?`'${e.name}' 은(는) 라이브러리 별칭입니다 — '${e.name}.명령어' 형태로 쓰세요`:`변수 '${e.name}' 이(가) 선언되지 않았습니다 (var 형식 call ${e.name}; 으로 먼저 만드세요)`,e);
        e.info=i;e.dims=i.dims;return e.ty=i.ty;
      }
      case 'mat':{
        if(e.asList){   // var list call x = [1, "a", 3];
          if(e.rows.length!==1)throw E("리스트는 [a, b, c] 처럼 한 줄로 씁니다 ('|' 는 쓸 수 없음)",e);
          for(const x of e.rows[0]){if(e.comp)compMark(x,sc);itemOk(x,ex(x,sc),e.comp);}
          return e.ty=e.comp?'compound':'list';
        }
        if(e.empty)throw E('빈 행렬은 쓸 수 없습니다',e);
        for(const row of e.rows)for(const x of row){
          const t=ex(x,sc);
          if(!isNumA(x,t))throw E(`행렬에는 숫자(float)만 넣을 수 있습니다 (받은 형식: ${tyTxt(t,x)})`,x);
        }
        e.dims=[e.rows.length,e.rows[0].length];return e.ty='matrix';
      }
      case 'idx':{
        const t=ex(e.base,sc);
        if(t==='any'&&e.j!==null){idxCheck(e,sc,null);e.anyBase=true;return e.ty='float';}   // c[2][1, 2] — 실행할 때 행렬인지 확인
        if(isL(t)||t==='any'){
          if(e.j!==null)throw E('리스트 항목은 [번호] 하나로 씁니다 (예: list[2])',e);
          if(t==='any')e.anyBase=true;   // c[3][1] — 실행할 때 리스트 · compound 인지 확인
          const it=ex(e.i,sc);
          if(it==='any')e.i.chk='int';
          else if(it!=='int'&&it!=='bit'&&!(it==='float'&&e.i.anyInt))throw E(`리스트 번호는 int 여야 합니다 (받은 형식: ${tyTxt(it,e.i)})`,e.i);
          return e.ty='any';
        }
        if(t!=='matrix')throw E(`[행, 열] 은 행렬에만 쓸 수 있습니다 (받은 형식: ${t})`,e);
        if(e.j===null)throw E('행렬 성분은 [행, 열] 두 번호로 씁니다 (예: m[1, 2])',e);
        idxCheck(e,sc,e.base.dims);return e.ty='float';
      }
      case 'objprop':
        if(e.colLib!==undefined){   // col.obj.id.isCollided
          const al=hget(mod.uses,e.colLib);if(!al)throw aliasErr(e.colLib,e);
          if(e.key==='anifr'){if(al!==MAG_ID)throw E(`'${e.colLib}.obj.….${e.prop}' 는 Magellan 라이브러리 값입니다 ('${e.colLib}' 은(는) ${al})`,e);}
          else if(al!==COL_ID)throw E(`'${e.colLib}.obj.….${e.prop}' 는 colliders 라이브러리 값입니다 ('${e.colLib}' 은(는) ${al})`,e);
        }
        if(e.id===null&&!mod.bound)throw E(`obj.${e.prop} 처럼 id 없이 쓰려면 이 파일이 dis.BelongObj 로 오브젝트에 귀속되어 있어야 합니다 (아니면 obj.id.${e.prop})`,e);
        if(STR_KEYS.has(e.key))return e.ty='string';
        if(e.key==='istrig'||e.key==='iscol')return e.ty='bit';
        if(e.key==='anifr')return e.ty='int';
        e.dims=[1,2];return e.ty='matrix';
      case 'objkeep':
        if(!objCtx&&!mod.bound)throw E(`obj.${e.name} 은(는) dis.setObjPos / setObjScale / setObject / col.setVelocity 의 값 안이나, dis.BelongObj 로 오브젝트에 귀속된 파일에서만 쓸 수 있습니다`,e);
        return e.ty='float';
      case 'objvar':{   // obj.id.변수 — dis.BelongObj 로 그 오브젝트에 귀속된 파일의 최상위 변수
        const vm=prog.objVars.get(e.id),i=vm&&vm.get(e.name);
        if(!i)throw E(vm?`오브젝트 '${e.id}' 에 귀속된 파일에 변수 '${e.name}' 이(가) 없습니다 (있는 변수: ${[...vm.keys()].join(', ')||'없음'})`
          :`'${e.name}' 은(는) 오브젝트 속성이 아닙니다 (Position, Scale, Velocity, Color, Text, Xpos, Ypos, Xscale, Yscale, Xvel, Yvel, IsTrigged, TriggedId) — 귀속된 파일의 변수라면 dis.BelongObj 로 '${e.id}' 에 파일을 귀속시키세요`,e);
        e.info=i;e.dims=i.dims;return e.ty=i.ty;
      }
      case 'canobj':{
        const al=hget(mod.uses,e.lib);if(!al)throw aliasErr(e.lib,e);
        if(al!==CAN_ID)throw E(`'${e.lib}.obj.….isMouseTouched' 는 Canvas 라이브러리 값입니다 ('${e.lib}' 은(는) ${al})`,e);
        if(!Object.values(mod.uses).includes(DIS_ID))throw E(`Canvas 는 DisPlayer 의 하위 라이브러리라 이 파일에 'Use DisPlayer call 별칭;' 도 필요합니다`,e);
        if(e.id===null&&!mod.bound)throw E(`${e.lib}.obj.isMouseTouched 처럼 id 없이 쓰려면 이 파일이 dis.BelongObj 로 오브젝트에 귀속되어 있어야 합니다 (아니면 ${e.lib}.obj.id.isMouseTouched)`,e);
        return e.ty='bit';
      }
      case 'member':{
        const li=listOf(e.lib,sc);
        if(li){   // 리스트.length
          if(e.name!=='length')throw E(`리스트 '${e.lib}' 에서 읽을 수 있는 값은 ${e.lib}.length (항목 개수) 와 ${e.lib}.find(값) 입니다`,e);
          e.lnode=lnode(e.lib,li,e.line);return e.ty='int';
        }
        const al=hget(mod.uses,e.lib);if(!al)throw aliasErr(e.lib,e);
        if(al==='jawbreaker')throw E(`jawbreaker 라이브러리에는 변수가 없습니다 (명령어는 ${e.lib}.${e.name}(...) 로 호출)`,e);
        if(al===COL_ID)throw E(`colliders 라이브러리에는 변수가 없습니다 (명령어는 ${e.lib}.${e.name}(...) 로 호출)`,e);
        if(al===MAG_ID)throw E(`Magellan 라이브러리에는 변수가 없습니다 (명령어는 ${e.lib}.${e.name}(...) 로 호출)`,e);
        if(al===CAN_ID){
          if(!Object.values(mod.uses).includes(DIS_ID))throw E(`Canvas 는 DisPlayer 의 하위 라이브러리라 이 파일에 'Use DisPlayer call 별칭;' 도 필요합니다`,e);
          if(!CAN_VARS.has(e.name))throw E(`Canvas 에 변수 '${e.name}' 이(가) 없습니다 (사용 가능: ${[...CAN_VARS.keys()].join(', ')})`,e);
          e.mod=CAN_ID;return e.ty=CAN_VARS.get(e.name);
        }
        if(al===DIS_ID){
          if(!DIS_VARS.has(e.name))throw E(`DisPlayer 에 변수 '${e.name}' 이(가) 없습니다 (사용 가능: ${[...DIS_VARS].join(', ')})`,e);
          e.mod=DIS_ID;return e.ty=e.name==='idWidthmode'?'bit':'int';
        }
        const i=resolveVar(prog,al,e.name);
        if(!i)throw E(`라이브러리 '${al}' (부모 포함) 에 변수 '${e.name}' 이(가) 없습니다`,e);
        e.mod=i.mod;e.info=i;e.dims=i.dims;return e.ty=i.ty;
      }
      case 'call':{
        const fm=hget(MATH,e.name);
        const li=e.lib!==null?listOf(e.lib,sc):null;
        if(li){   // 리스트.find(값) → 처음 나오는 번호 (없으면 0)
          if(e.name!=='find')throw E(`'${e.lib}.${e.name}(...)' 은(는) 값을 돌려주지 않습니다 — 식 안에서는 ${e.lib}.find(값) 과 ${e.lib}.length 를 씁니다`,e);
          if(e.args.length!==1)throw E(`'find' 은(는) 값 1개가 필요합니다 (받은 값: ${e.args.length}개)`,e);
          const ft=ex(e.args[0],sc);if(ft!=='any')itemOk(e.args[0],ft,li.ty==='compound');
          e.lnode=lnode(e.lib,li,e.line);e.lfind=true;return e.ty='int';
        }
        if(e.lib!==null&&hget(mod.uses,e.lib)===CAN_ID&&e.name==='isKeyInput')throw E(`isKeyInput 은 jawbreaker 로 옮겼습니다 — jaw.isKeyInput("키") 로 쓰세요 (Use jawbreaker call jaw;)`,e);
        const uf=userFn(e);
        if(e.name==='isKeyInput'&&(e.lib===null?!uf:hget(mod.uses,e.lib)==='jawbreaker')){   // jaw.isKeyInput("키") → 눌려 있으면 1
          if(e.args.length!==1)throw E(`'isKeyInput' 은(는) 값 1개가 필요합니다 (받은 값: ${e.args.length}개)`,e);
          const kt=ex(e.args[0],sc);
          if(!fit(e.args[0],kt,'string'))throw E(`isKeyInput 에는 키 이름(문자열)을 넣습니다 (예: "a", "space", "up") — 받은 형식: ${tyTxt(kt,e.args[0])}`,e.args[0]);
          e.canKey=true;return e.ty='bit';
        }
        if(e.name==='fileExists'&&(e.lib===null?!uf:hget(mod.uses,e.lib)==='jawbreaker')){   // jaw.fileExists("경로") → 프로젝트에 그 파일(또는 폴더)이 있으면 1
          if(e.args.length!==1)throw E(`'fileExists' 은(는) 값 1개가 필요합니다 (받은 값: ${e.args.length}개)`,e);
          const pt=ex(e.args[0],sc);
          if(!fit(e.args[0],pt,'string'))throw E(`fileExists 에는 경로(문자열)를 넣습니다 (예: "save/s.json") — 받은 형식: ${tyTxt(pt,e.args[0])}`,e.args[0]);
          e.fileEx=true;return e.ty='bit';
        }
        const sf=hget(STRF,e.name);
        if(sf&&(e.lib===null?!uf:hget(mod.uses,e.lib)==='jawbreaker')){   // 문자열 함수
          if(e.args.length!==sf.a.length)throw E(`'${e.name}' 은(는) 값 ${sf.a.length}개가 필요합니다 (받은 값: ${e.args.length}개)`,e);
          e.args.forEach((a,i)=>{
            const t=ex(a,sc);
            if(sf.a[i]==='s'){if(!fit(a,t,'string'))throw E(`'${e.name}' 의 ${i+1}번째 값은 문자열이어야 합니다 (받은 형식: ${tyTxt(t,a)})`,a);}
            else if(!isNumA(a,t))throw E(`'${e.name}' 의 ${i+1}번째 값은 숫자(번호)여야 합니다 (받은 형식: ${tyTxt(t,a)})`,a);
          });
          if(e.name==='splitStr'&&!e.splitOK)throw E(`splitStr 은 리스트 변수에 바로 넣을 때만 씁니다 (예: var list call a = splitStr(s, ","); 또는 a = splitStr(s, ",");)`,e);
          e.strf=e.name;return e.ty=sf.r;
        }
        if(fm&&(e.lib===null||hget(mod.uses,e.lib)==='jawbreaker')&&!(e.lib===null&&uf)){
          if(e.args.length!==fm.n)throw E(`'${e.name}' 은(는) 값 ${fm.n}개가 필요합니다 (받은 값: ${e.args.length}개)`,e);
          const ts=e.args.map(a=>{
            const t=ex(a,sc);
            if(!isNumA(a,t))throw E(`'${e.name}' 에는 숫자만 넣을 수 있습니다 (받은 형식: ${tyTxt(t,a)})`,a);
            return t==='any'?'float':t;
          });
          e.math=e.name;
          if(fm.r==='same')return e.ty=ts[0]==='float'?'float':'int';
          if(fm.r==='num')return e.ty=ts.some(t=>t==='float')?'float':'int';
          return e.ty=fm.r;
        }
        if(uf){
          if(!uf.def.retTy)throw E(`함수 '${e.name}' 은(는) 값을 돌려주지 않아서 식 안에서 쓸 수 없습니다 — 'func 형식 ${e.name}(...)' 로 만들고 return(값); 으로 돌려주세요`,e);
          fnArgs(e,uf.def,sc);
          e.target={mod:uf.mod,name:e.name,def:uf.def};if(uf.def.retTy==='matrix')e.dims=uf.def.retDims;return e.ty=uf.def.retTy;
        }
        if(e.lib!==null&&!hget(mod.uses,e.lib))throw aliasErr(e.lib,e);
        throw E(`'${e.name}' 은(는) 값을 돌려주지 않아서 식 안에서 쓸 수 없습니다 (식 안에서는 수학 함수와 'func 형식 이름(...)' 로 만든 함수만 쓸 수 있음)`,e);
      }
      case 'un':{
        let t=ex(e.e,sc);
        if(t==='any'||e.e.anyInt)e.anyInt=true;   // -l[1] 도 번호 · int 로 씀
        if(t==='any'){e.e.chk='float';t='float';}
        if(isL(t))throw E(`리스트에는 '${e.op}' 를 쓸 수 없습니다`,e);
        if(t==='string')throw E(`문자열에는 '${e.op}' 를 쓸 수 없습니다`,e);
        if(t==='matrix')throw E(`행렬에는 '${e.op}' 를 쓸 수 없습니다`,e);
        return e.ty=e.op==='!'?'bit':(t==='float'?'float':'int');
      }
      case 'bin':{
        let a=ex(e.l,sc),b=ex(e.r,sc);const op=e.op;
        if((isL(a)||isL(b))&&!(op==='+'&&(a==='string'||b==='string'))&&!((op==='=='||op==='!=')&&(a==='any'||b==='any')))
          throw E(`리스트에는 '${op}' 를 쓸 수 없습니다 (항목 list[번호] 는 계산할 수 있고, 문자열과 + 로 이어 붙일 수는 있음)`,e);
        if(a==='any'||b==='any'){   // 리스트 항목: 실행할 때 숫자/문자열 확인
          if(op==='+'){
            if(a==='string'||b==='string')return e.ty='string';
            if(a==='matrix'||b==='matrix')throw E(`행렬에는 '+' 를 쓸 수 없습니다`,e);
            return e.ty='any';   // 둘 중 문자열이 있으면 이어 붙이고, 아니면 더함
          }
          if(op==='=='||op==='!=')return e.ty='bit';   // compound 항목과 행렬 · 리스트 비교는 안쪽까지
          const w=op==='%'?'int':'float';
          if([a,b].every(t=>t==='any'||t==='int'||t==='bit'))e.anyInt=true;   // 항목 - 1 · 항목 * 2 … : 번호로도 씀 (실행할 때 정수 확인)
          if(a==='any'){e.l.chk=w;a=w;}
          if(b==='any'){e.r.chk=w;b=w;}
        }
        if((a==='matrix'||b==='matrix')&&!(op==='+'&&(a==='string'||b==='string')))
          throw E(`행렬에는 '${op}' 를 쓸 수 없습니다 (성분 m[행, 열] 은 계산할 수 있고, 문자열과 + 로 이어 붙일 수는 있음)`,e);
        const intish=(x,t)=>t!=='float'||x.anyInt;   // 정수이거나 리스트 항목으로 계산한 번호
        if(op==='+'){
          if(a==='string'||b==='string')return e.ty='string';
          if(intish(e.l,a)&&intish(e.r,b))e.anyInt=true;
          return e.ty=(a==='float'||b==='float')?'float':'int';
        }
        if(op==='-'||op==='*'||op==='/'){
          if(a==='string'||b==='string')throw E(`문자열에는 '${op}' 를 쓸 수 없습니다 (문자열 연결은 + 만 가능)`,e);
          if(intish(e.l,a)&&intish(e.r,b))e.anyInt=true;
          return e.ty=(a==='float'||b==='float')?'float':'int';
        }
        if(op==='%'){
          if(a==='string'||b==='string'||a==='float'||b==='float')throw E(`'%' 는 int 끼리만 쓸 수 있습니다`,e);
          return e.ty='int';
        }
        if(op==='=='||op==='!='){
          if((a==='string')!==(b==='string'))throw E(`문자열과 숫자는 비교할 수 없습니다 (${a} ${op} ${b})`,e);
          return e.ty='bit';
        }
        if(a==='string'||b==='string')throw E(`문자열에는 '${op}' 를 쓸 수 없습니다`,e);
        return e.ty='bit';
      }
    }
  }
  function call(c,sc,cs){
    let params,target;
    if(hget(MATH,c.name)&&(c.lib===null||hget(mod.uses,c.lib)==='jawbreaker')&&!(c.lib===null&&isLib&&resolveFunc(prog,mod.name,c.name)))
      throw E(`'${c.name}' 은(는) 값을 돌려주는 함수라 식 안에서 씁니다 (예: var float call y = ${c.name}(${hget(MATH,c.name).n?'30':''});)`,c);
    if(hget(STRF,c.name)&&(c.lib===null||hget(mod.uses,c.lib)==='jawbreaker')&&!(c.lib===null&&isLib&&resolveFunc(prog,mod.name,c.name)))
      throw E(`'${c.name}' 은(는) 값을 돌려주는 함수라 식 안에서 씁니다 (예: var int call n = strLen("abc");)`,c);
    const disFn=()=>{
      const sp=hget(DIS_FUNCS,c.name);
      if(!sp)throw E(`DisPlayer 에 '${c.name}' 명령어가 없습니다 (사용 가능: ${Object.keys(DIS_FUNCS).join(', ')})`,c);
      params=sp.params;target={mod:DIS_ID,name:c.name};
    };
    const builtin=()=>{
      const sp=hget(BUILTINS,c.name);
      if(!sp)throw E(`jawbreaker 라이브러리에 '${c.name}' 명령어가 없습니다 (사용 가능: ${Object.keys(BUILTINS).join(', ')})`,c);
      params=sp.params;target={mod:'jawbreaker',name:c.name};
    };
    const fromLib=id=>{
      const f=resolveFunc(prog,id,c.name);
      if(!f)throw E(`라이브러리 '${id}' (부모 포함) 에 함수 '${c.name}' 이(가) 없습니다`,c);
      params=f.def.params.map(p=>p.ty);target={mod:f.mod,name:c.name,def:f.def};
    };
    if(c.lib===null){
      const f=isLib?resolveFunc(prog,mod.name,c.name):null;
      if(f){params=f.def.params.map(p=>p.ty);target={mod:f.mod,name:c.name,def:f.def};}
      else if(hget(BUILTINS,c.name))builtin();
      else throw E(`함수 '${c.name}' 을(를) 찾을 수 없습니다`,c);
    }else{
      const li=listOf(c.lib,sc);
      if(li){   // 리스트.add(값) · insert(번호, 값) · remove(번호) · clear()
        const LM={add:['v'],insert:['i','v'],remove:['i'],clear:[]};
        if(c.name==='find')throw E(`${c.lib}.find(값) 은(는) 번호를 돌려주는 값이라 식 안에서 씁니다 (예: var int call k = ${c.lib}.find(3);)`,c);
        const ps=hget(LM,c.name);
        if(!ps)throw E(`리스트 명령어는 add, insert, remove, clear 입니다 (값: find, length) — 받은 이름: ${c.name}`,c);
        if(c.args.length!==ps.length)throw E(`'${c.name}' 은(는) 값 ${ps.length}개가 필요합니다 (받은 값: ${c.args.length}개)`,c);
        c.args.forEach((a,i)=>{
          if(ps[i]==='v'&&li.ty==='compound')compMark(a,sc);   // party.add(["피카츄", 35]);
          const t=ex(a,sc);
          if(ps[i]==='v')itemOk(a,t,li.ty==='compound');
          else if(t==='any')a.chk='int';
          else if(t!=='int'&&t!=='bit'&&!(t==='float'&&a.anyInt))throw E(`리스트 번호는 int 여야 합니다 (받은 형식: ${tyTxt(t,a)})`,a);
        });
        c.target={mod:'@list',name:c.name};c.lnode=lnode(c.lib,li,c.line);
        return;
      }
      const al=hget(mod.uses,c.lib);if(!al)throw aliasErr(c.lib,c);
      if((al===DIS_ID&&c.name==='BelongObj')||(al===CAN_ID&&c.name==='BelongScene')){   // 귀속 선언 (불러올 때 이미 처리)
        if(al===CAN_ID&&!Object.values(mod.uses).includes(DIS_ID))throw E(`Canvas 는 DisPlayer 의 하위 라이브러리라 이 파일에 'Use DisPlayer call 별칭;' 도 필요합니다`,c);
        if(!c.belongOk)throw E(`${c.name} 은(는) .jb 파일의 run{ } 바로 안에 씁니다 (if · loop · 함수 안은 안 됨) — 그 파일 전체가 귀속됩니다`,c);
        c.target={mod:'@belong',name:c.name};return;
      }
      if(al===CAN_ID){
        if(!Object.values(mod.uses).includes(DIS_ID))throw E(`Canvas 는 DisPlayer 의 하위 라이브러리라 이 파일에 'Use DisPlayer call 별칭;' 도 필요합니다`,c);
        const key=c.canObj?'obj.'+c.name:c.name,sp=hget(CAN_FUNCS,key);
        if(!sp)throw E(c.name==='setExistableScene'?`setExistableScene 은 ${c.lib}.obj.setExistableScene("장면", "id"); 로 씁니다`
          :`Canvas 에 '${c.canObj?'obj.':''}${c.name}' 명령어가 없습니다 (사용 가능: ${Object.keys(CAN_FUNCS).map(n=>c.lib+'.'+n).join(', ')} · 값: ${[...CAN_VARS.keys()].join(', ')})`,c);
        params=sp.params;target={mod:CAN_ID,name:c.name};
      }
      else if(al===SND_ID){
        const us=Object.values(mod.uses);
        if(!us.includes(MAG_ID)||!us.includes(DIS_ID))throw E(`soundMaster 는 Magellan(DisPlayer 하위)의 하위 라이브러리라 이 파일에 'Use DisPlayer call 별칭;' 과 'Use Magellan call 별칭;' 도 필요합니다`,c);
        const key=c.sub==='spk'?'spk.'+c.name:c.name,sp=hget(SND_FUNCS,key);
        if(!sp)throw E(c.name==='belongto'||c.name==='belongSpeakerto'?`스피커 귀속은 ${c.lib}.spk.스피커id.belongto("오브젝트 id"); 로 씁니다`
          :`soundMaster 에 '${c.sub?c.sub+'.id.':''}${c.name}' 명령어가 없습니다 (사용 가능: ${Object.keys(SND_FUNCS).map(n=>c.lib+'.'+(n.startsWith('spk.')?'spk.id.'+n.slice(4):n)).join(', ')})`,c);
        params=sp.params;target={mod:SND_ID,name:c.name};
      }
      else if(al===CAM_ID){
        const us=Object.values(mod.uses);
        if(!us.includes(CAN_ID)||!us.includes(DIS_ID))throw E(`SeongBin 은 Canvas(DisPlayer 하위)의 하위 라이브러리라 이 파일에 'Use DisPlayer call 별칭;' 과 'Use Canvas call 별칭;' 도 필요합니다`,c);
        const key=c.sub==='cam'?'cam.'+c.name:c.name,sp=hget(CAM_FUNCS,key);
        if(!sp)throw E(!c.sub&&hget(CAM_FUNCS,'cam.'+c.name)?`${c.name} 은(는) 카메라마다 씁니다 — ${c.lib}.cam.카메라id.${c.name}(…);`
          :`SeongBin 에 '${c.sub?c.sub+'.id.':''}${c.name}' 명령어가 없습니다 (사용 가능: ${Object.keys(CAM_FUNCS).map(n=>c.lib+'.'+(n.startsWith('cam.')?'cam.id.'+n.slice(4):n)).join(', ')})`,c);
        params=sp.params;target={mod:CAM_ID,name:c.name};
      }
      else if(al===MAG_ID){
        if(!Object.values(mod.uses).includes(DIS_ID))throw E(`Magellan 은 DisPlayer 의 하위 라이브러리라 이 파일에 'Use DisPlayer call 별칭;' 도 필요합니다`,c);
        const sp=hget(MAG_FUNCS,c.canObj?'obj.'+c.name:c.name);
        if(!sp)throw E(`Magellan 에 '${(c.canObj?'obj.':'')+c.name}' 명령어가 없습니다 (사용 가능: ${Object.keys(MAG_FUNCS).map(n=>n.startsWith('obj.')?'obj.id.'+n.slice(4):n).join(', ')})`,c);
        if(c.canObj&&!c.objId){   // mag.obj.runAnime(…) = 자기 자신 (귀속된 파일)
          if(!mod.bound)throw E(`${c.lib}.obj.${c.name}(…) 처럼 id 없이 쓰려면 이 파일이 dis.BelongObj 로 오브젝트에 귀속되어 있어야 합니다 (아니면 ${c.lib}.obj.id.${c.name}(…))`,c);
          c.args.unshift({k:'str',v:'',line:c.line,file:c.file});
        }
        params=sp.params;target={mod:MAG_ID,name:c.name};
      }
      else if(al==='jawbreaker')builtin();else if(al===DIS_ID)disFn();
      else if(al===COL_ID){
        if(!Object.values(mod.uses).includes(DIS_ID))throw E(`colliders 는 DisPlayer 의 하위 라이브러리라 이 파일에 'Use DisPlayer call 별칭;' 도 필요합니다`,c);
        if(c.name==='setColliderof')throw E(`setColliderof 는 setLink 로 바뀌었습니다 — dis.setLink("id1", "id2"); (둘이 묶여 같이 움직임)`,c);
        const sp=hget(COL_FUNCS,c.canObj?'obj.'+c.name:c.name);
        if(!sp)throw E(`colliders 에 '${c.canObj?'obj.':''}${c.name}' 명령어가 없습니다 (사용 가능: ${Object.keys(COL_FUNCS).map(n=>c.lib+'.'+(n.startsWith('obj.')?'obj.id.'+n.slice(4):n)).join(', ')})`,c);
        params=sp.params;target={mod:COL_ID,name:c.name};
      }
      else fromLib(al);
    }
    c.target=target;
    if(target.mod==='jawbreaker'&&target.name==='return'&&c.args.length===1){   // return(값);
      if(!curFn)throw E('return(값) 은 값을 돌려주는 함수(func 형식 이름(...) { }) 안에서만 씁니다',c);
      if(!curFn.retTy)throw E(`함수 '${curFn.name}' 은(는) 값을 돌려주지 않습니다 — 'func 형식 ${curFn.name}(...)' 처럼 돌려줄 형식을 쓰세요`,c);
      const a=c.args[0];
      if(isL(curFn.retTy)&&a.k==='mat'){a.asList=true;a.comp=curFn.retTy==='compound';}
      const t=ex(a,sc);
      if(curFn.retTy==='matrix')needMat(a,t,curFn.retDims,`함수 '${curFn.name}' 이(가) 돌려줄 값`);
      else if(!fit(a,t,curFn.retTy))throw E(`${tyTxt(t,a)} 값을 돌려줄 수 없습니다 (함수 '${curFn.name}' 은(는) ${curFn.retTy} 를 돌려줌)`,a);
      c.ret=true;c.retTy=curFn.retTy;c.retDims=curFn.retDims;return;
    }
    if(target.mod===SND_ID&&c.name==='break'&&c.args.length===2)params=['string','bit'];   // sou.break("스피커", true) = 페이드 무시
    if(target.mod===SND_ID&&c.name==='break'&&c.args.length>2)throw E(`sou.break 는 ("스피커") 또는 ("스피커", 페이드 무시 bit) 입니다 (받은 값: ${c.args.length}개)`,c);
    if(target.mod===DIS_ID&&c.name==='setObjPlg'&&c.args.length===5)params=['mat12','mat12','mat12','string','color'];   // 꼭짓점 3개
    if(target.mod===DIS_ID&&c.name==='setObjPlg'&&c.args.length!==5&&c.args.length!==6)throw E(`setObjPlg 는 꼭짓점 3개 또는 4개 다음에 "id" · 색을 씁니다 (예: dis.setObjPlg([0, 0], [100, 0], [50, 80], "tri", "#ffffff");)`,c);
    if(c.args.length!==params.length)throw E(`'${c.name}' 은(는) 값 ${params.length}개가 필요합니다 (받은 값: ${c.args.length}개)`,c);
    const isObjSet=(target.mod===DIS_ID||target.mod===COL_ID)&&OBJ_SET.has(c.name);
    c.args.forEach((a,i)=>{
      const pt=params[i];
      objCtx=isObjSet;
      if(pt==='json'&&a.k==='mat'){a.asList=true;a.comp=true;}
      if(isL(pt)&&a.k==='mat'){a.asList=true;a.comp=pt==='compound';}   // mag.setasAnime(["a", "b"], …) · 함수의 list · compound 매개변수   // jaw.setJson("id", [1, "a", [2, 3]]) — compound
      let t;try{t=ex(a,sc);}finally{objCtx=false;}
      if(pt==='json')return;
      if(pt==='mat12'){needMat(a,t,[1,2],`'${c.name}' 의 ${i+1}번째 값`);return;}
      if(pt==='matrix'&&target.def){needMat(a,t,target.def.params[i].dims,`'${c.name}' 의 ${i+1}번째 값`);return;}   // 함수의 행렬 매개변수
      if(pt==='color'){colorCheck(a,t,`'${c.name}' 의 ${i+1}번째 값(색)`);return;}
      if(pt!=='any'&&!fit(a,t,pt))throw E(`'${c.name}' 의 ${i+1}번째 값은 ${pt} 형식이어야 합니다 (받은 형식: ${tyTxt(t,a)})`,a);
    });
    if(target.mod==='jawbreaker'&&c.name==='loadJson'){   // jaw.loadJson("경로.json", "compound 변수 이름")
      const a=c.args[1];
      if(a.k!=='str')throw E(`loadJson 의 두 번째 값은 compound 변수 이름을 "따옴표" 로 씁니다 (예: jaw.loadJson("save.json", "data");)`,a);
      const i=look(a.v,sc);
      if(!i)throw E(`변수 '${a.v}' 이(가) 선언되지 않았습니다 (var compound call ${a.v}; 로 먼저 만드세요)`,a);
      if(i.ty!=='compound')throw E(`loadJson 은 compound 변수에만 넣을 수 있습니다 ('${a.v}' 은(는) ${tyTxt(i.ty,i)})`,a);
      c.jinfo=i;c.jname=a.v;
    }
    if(target.mod===DIS_ID&&c.name==='setParent'){
      if(c.relChild===undefined)throw E(`setParent 는 'dis.setParent() ("자식") as ("부모");' 형태로 씁니다`,c);
      for(const x of [c.relChild,c.relParent]){const t=ex(x,sc);if(!fit(x,t,'string'))throw E(`setParent 의 ( ) 안에는 오브젝트 id (문자열)를 씁니다 (받은 형식: ${tyTxt(t,x)})`,x);}
    }
    if(target.mod===COL_ID&&(c.name==='setCollider'||c.name==='setColider')&&c.args[3].k==='num'&&(c.args[3].v<0||c.args[3].v>1))
      throw E(`탄성계수는 0 ~ 1 사이입니다 (받은 값: ${c.args[3].raw})`,c.args[3]);
    // dis.moveObj("id") to [x, y] for ms;
    const isMove=target.mod===DIS_ID&&c.name==='moveObj';
    if(target.mod===CAN_ID&&c.name==='bindInput'){   // can.bindInput("버튼 id") to ("키");
      if(c.toExpr===undefined)throw E(`bindInput 은 ${c.lib}.bindInput("버튼 id") to ("키"); 로 씁니다`,c);
      if(c.forExpr)throw E(`bindInput 뒤에는 for 를 쓸 수 없습니다`,c.forExpr);
      const kt=ex(c.toExpr,sc);
      if(!fit(c.toExpr,kt,'string'))throw E(`bindInput 의 to 에는 키 이름(문자열)을 넣습니다 (예: to ("space")) — 받은 형식: ${tyTxt(kt,c.toExpr)}`,c.toExpr);
    }
    else if(c.toExpr!==undefined&&!isMove)throw E(`'to' 는 dis.moveObj(...) · can.bindInput(...) 뒤에서만 쓸 수 있습니다`,c);
    if(c.forExpr&&!isMove){
      if(!(target.mod===DIS_ID&&TWEEN_SET.has(c.name))&&!(target.mod===CAM_ID&&c.name==='moveCamto'))throw E(`'for' 는 moveObj · setObjPos · setObjScale · setObjAlpha · setObjColor · setObjOverlay 뒤에서만 쓸 수 있습니다 (예: dis.setObjAlpha("id", 0) for 500;)`,c.forExpr);
      const ft=ex(c.forExpr,sc);
      if(ft==='any')c.forExpr.chk='int';
      else if(ft!=='int'&&ft!=='bit')throw E(`for 다음은 걸리는 시간 ms(int)입니다 (받은 형식: ${tyTxt(ft,c.forExpr)})`,c.forExpr);
    }
    if(c.easeExpr){   // ease ("이름"): moveObj · setObjPos 의 for 이동에만
      if(!(isMove||(target.mod===DIS_ID&&c.name==='setObjPos')))throw E(`'ease' 는 dis.moveObj · dis.setObjPos 뒤에서만 쓸 수 있습니다 (예: dis.moveObj("id") to [100, 0] for 500 ease ("sinleft");)`,c.easeExpr);
      if(!c.forExpr)throw E(`'ease' 는 'for ms' 와 함께 씁니다 (예: dis.moveObj("id") to [100, 0] for 500 ease ("sin");)`,c.easeExpr);
      const et=ex(c.easeExpr,sc);
      if(et!=='string'&&et!=='any')throw E(`ease 다음은 이름(문자열)입니다 — "linear" · "sin" · "sinleft" · "sinright" (받은 형식: ${tyTxt(et,c.easeExpr)})`,c.easeExpr);
      if(c.easeExpr.k==='str'&&!EASES[String(c.easeExpr.v).toLowerCase()])throw E(EASE_BAD(c.easeExpr.v),c.easeExpr);
    }
    if(isMove){
      if(c.toExpr===undefined)throw E(`moveObj 는 갈 위치를 'to' 로 정해야 합니다 (예: dis.moveObj("yaju") to [100, 200] for 500;)`,c);
      objCtx=true;let t;try{t=ex(c.toExpr,sc);}finally{objCtx=false;}
      needMat(c.toExpr,t,[1,2],`moveObj 의 to (위치 [x, y])`);
      if(c.forExpr){
        const ft=ex(c.forExpr,sc);
        if(ft!=='int'&&ft!=='bit')throw E(`for 다음은 걸리는 시간 ms(int)입니다 (받은 형식: ${tyTxt(ft,c.forExpr)})`,c.forExpr);
      }
    }
    // mag.importFile("경로") save as ("id");
    const isImport=target.mod===MAG_ID&&c.name==='importFile';
    if(c.saveAs!==undefined&&!isImport&&!(target.mod===MAG_ID&&c.name==='setasTexture'))throw E(`'save as' 는 mag.importFile(...) · mag.setasTexture(...) 뒤에서만 쓸 수 있습니다`,c);
    if(target.mod===MAG_ID&&c.name==='setasTexture'){   // mag.setasTexture("이미지", [x1, y1], [x2, y2]) save as ("텍스쳐 id");
      if(c.saveAs===undefined)throw E(`setasTexture 는 텍스쳐 id 를 'save as' 로 정해야 합니다 (예: ${c.lib}.setasTexture("hero", [0, 0], [32, 32]) save as ("walk1");)`,c);
      const st=ex(c.saveAs,sc);
      if(st!=='string'&&st!=='any')throw E(`save as 다음은 id 문자열입니다 (받은 형식: ${tyTxt(st,c.saveAs)})`,c.saveAs);
      if(st==='any')c.saveAs.chk='string';
    }
    if(target.mod===MAG_ID&&c.name==='setasAnime'&&c.args[0].k==='mat')for(const x of c.args[0].rows[0]){   // C 에서도 바로 쓰게: 항목은 텍스쳐 id 문자열
      if(x.ty==='any')x.chk='string';
      else if(x.ty!=='string')throw E(`애니메이션의 프레임은 텍스쳐 id 문자열입니다 (받은 형식: ${tyTxt(x.ty,x)})`,x);
    }
    if(target.mod===MAG_ID&&c.name==='importFolder'){   // mag.importFolder("경로"); — 그 폴더(하위 폴더 포함)의 파일에 모두 이름을 붙임 · 이름 = 확장자를 뺀 파일 이름
      const a=c.args[0];
      if(a.k!=='str')throw E(`importFolder 경로는 따옴표 안의 문자열 상수여야 합니다 (예: ${c.lib}.importFolder("assets/sounds");)`,a);
      const raw=a.v.replace(/\/+$/,'');
      const n=raw===''||raw==='.'?'':resolveTaskPath(raw,mod.file);
      if(n===null)throw E(`경로가 프로젝트 폴더 밖을 가리킵니다: ${a.v}`,a);
      const pre=n?n+'/':'',seen=new Map(),list=[];
      for(const f of Object.keys(prog.files).sort()){
        if(!f.startsWith(pre))continue;
        if(!IMG_RE.test(f)&&!AUD_RE.test(f)&&!TTF_RE.test(f)&&!TL_RE.test(f))continue;
        const nm=f.slice(f.lastIndexOf('/')+1).replace(/\.[^.]+$/,'');
        if(seen.has(nm))throw E(`importFolder: 이름 '${nm}' 이(가) 겹칩니다 — ${seen.get(nm)} · ${f} (파일 이름을 바꾸거나 importFile 로 따로 이름을 붙이세요)`,a);
        seen.set(nm,f);list.push([nm,f]);
      }
      if(!list.length)throw E(`'${n||'(프로젝트 최상위)'}' 폴더에 불러올 파일이 없습니다 (이미지 · 소리 · 글꼴 · 타일맵)`,a);
      c.folderFiles=list;
    }
    if(isImport){
      if(c.saveAs===undefined)throw E(`importFile 은 저장할 id 를 'save as' 로 정해야 합니다 (예: ${c.lib}.importFile("img/hero.png") save as ("hero");)`,c);
      const a=c.args[0];
      if(a.k!=='str')throw E(`importFile 경로는 따옴표 안의 문자열 상수여야 합니다 (예: ${c.lib}.importFile("img/hero.png") save as ("hero");)`,a);
      const n=resolveTaskPath(a.v,mod.file);
      if(n===null)throw E(`경로가 프로젝트 폴더 밖을 가리킵니다: ${a.v}`,a);
      if(!(Object.hasOwn(prog.files,n)))throw E(`프로젝트에 '${n}' 파일이 없습니다 (이미지는 불러오기 · 끌어다 놓기로 프로젝트에 넣으세요)`,a);
      if(!IMG_RE.test(n)&&!AUD_RE.test(n)&&!TTF_RE.test(n)&&!TL_RE.test(n))throw E(`importFile 은 이미지(.png · .jpg · .gif · .webp · .bmp) · 소리(.wav · .mp3 · .ogg · .m4a) · 글꼴(.ttf · .otf) · 타일맵(.tl) 파일만 불러옵니다: ${n}`,a);
      c.imgPath=n;
      const st=ex(c.saveAs,sc);
      if(st!=='string'&&st!=='any')throw E(`save as 다음은 id 문자열입니다 (받은 형식: ${tyTxt(st,c.saveAs)})`,c.saveAs);
      if(st==='any')c.saveAs.chk='string';
    }
    // dis.getVar("id", "이름") as 변수;
    if(c.asName!==undefined&&!(target.mod===DIS_ID&&c.name==='getVar'))throw E(`'as' 는 dis.getVar(...) 뒤에서만 쓸 수 있습니다`,c);
    if(target.mod===DIS_ID&&c.name==='getVar'){
      if(c.asName===undefined)throw E(`getVar 는 받을 변수를 'as' 로 정해야 합니다 (예: dis.getVar("yaju", "scale[1, 2]") as s;)`,c);
      const info=look(c.asName,sc);
      if(!info)throw E(`변수 '${c.asName}' 이(가) 선언되지 않았습니다 (getVar 로 받을 변수를 먼저 만드세요)`,{line:c.asLine});
      c.asInfo=info;
      const nameArg=c.args[1];
      if(nameArg.k==='str'){
        const pv=parseObjVar(nameArg.v);
        if(!pv)throw E(`getVar 이름은 coord(position) · scale · color · text 중 하나입니다 (성분은 "scale[1, 2]") — 받은 값: "${nameArg.v}"`,nameArg);
        if(pv.idx){
          if(STR_KEYS.has(pv.key)||pv.key==='istrig')throw E(`${pv.key} 에는 [행, 열] 성분이 없습니다`,nameArg);
          if(pv.idx[0]!==1||pv.idx[1]<1||pv.idx[1]>2)throw E(`${pv.key==='pos'?'coord':'scale'} 는 (1, 2) 행렬이라 성분은 [1, 1] 또는 [1, 2] 입니다`,nameArg);
          if(!assignable(info.ty,'float'))throw E(`행렬 성분(float)은 ${tyTxt(info.ty,info)} 변수 '${c.asName}' 에 넣을 수 없습니다 (float 변수가 필요)`,{line:c.asLine});
        }else if(pv.key==='istrig'){
          if(!assignable(info.ty,'bit'))throw E(`istrigged(bit)는 ${tyTxt(info.ty,info)} 변수 '${c.asName}' 에 넣을 수 없습니다`,{line:c.asLine});
        }else if(STR_KEYS.has(pv.key)){
          if(info.ty!=='string')throw E(`${pv.key}(string)는 ${tyTxt(info.ty,info)} 변수 '${c.asName}' 에 넣을 수 없습니다 (string 변수가 필요)`,{line:c.asLine});
        }else if(info.ty!=='matrix'||!sameDims(info.dims,[1,2]))
          throw E(`${pv.key==='pos'?'coord':'scale'} 는 matrix[1, 2] 라서 ${tyTxt(info.ty,info)} 변수 '${c.asName}' 에 넣을 수 없습니다`,{line:c.asLine});
      }
    }
    if(target.mod==='jawbreaker'&&(target.name==='sendto'||target.name==='setup')){
      if(isLib)throw E(`${target.name} 는 코드 파일(.jb) 의 run{ } 안에서만 쓸 수 있습니다`,c);
      if(!c.taskPath)throw E(`${target.name} 경로는 따옴표 안의 문자열 상수여야 합니다 (예: jaw.${target.name}("tools/a.jb");)`,c);
    }
    // break() / return(): 가장 안쪽 loop 가 대상, loop 가 없으면 가장 안쪽 if (else if 묶음 전체)
    if(target.mod==='jawbreaker'&&target.name==='goTo'&&c.args[0]&&c.args[0].k==='num'){
      const ln=c.args[0].v;
      if(!Number.isInteger(ln)||ln<1)throw E(`goTo 의 줄 번호는 1 이상의 정수입니다 (받은 값: ${c.args[0].raw})`,c.args[0]);
      if(!mod.stmtLines){   // 이 파일의 모든 문장 시작 줄 · goTo 마다 '지금 블록이나 바깥 블록' (run · func 몸통까지) 의 문장 목록들
        const set=new Set(),reach=new Map();
        const walk=(l,st)=>{const st2=[...st,l];for(const x of l){set.add(x.line);
          if(x.k==='call')reach.set(x,st2);
          if(x.body)walk(x.body,x.k==='loop'?st2:[]);   // run · func 몸통은 새로 시작 (바깥으로는 못 감)
          if(x.then)walk(x.then,st2);if(x.else)walk(x.else,st2);}};
        for(const x of mod.ast){set.add(x.line);if(x.body)walk(x.body,[]);}
        mod.stmtLines=set;mod.gotoReach=reach;
      }
      if(!mod.stmtLines.has(ln))throw E(`goTo(${ln}): ${ln}번째 줄에 문장이 없습니다 (그 줄에서 시작하는 문장으로만 갈 수 있음)`,c.args[0]);
      {const st=mod.gotoReach.get(c);
       if(st&&!st.some(l=>l.some(x=>x.line===ln)))
         throw E(`goTo(${ln}): ${ln}번째 줄은 지금 있는 블록이나 그 바깥 블록의 문장이 아닙니다 (안쪽 블록 · 다른 함수 · 다른 run 으로는 못 감)`,c.args[0]);}
    }
    if(target.mod==='jawbreaker'&&(target.name==='break'||target.name==='return')){
      let tg=null;
      for(let i=cs.length-1;i>=0;i--)if(cs[i].kind==='loop'){tg=cs[i].node;break;}
      if(!tg&&cs.length)tg=cs[cs.length-1].node;
      if(!tg)throw E(`${target.name}() 는 반복문(loop)이나 조건문(if) 안에서만 쓸 수 있습니다`,c);
      c.jump=tg;if(tg.k==='if'){tg.jumpTarget=true;tg[target.name==='break'?'jBreak':'jReturn']=true;}
    }
    if(target.mod===DIS_ID&&target.name==='setObjAlpha'&&c.args[1].k==='num'&&(c.args[1].v<0||c.args[1].v>255))
      throw E(`투명도는 0 (안 보임) ~ 255 (불투명) 입니다 (받은 값: ${c.args[1].raw})`,c.args[1]);
    if(target.mod===DIS_ID&&target.name==='setObjCyl'&&c.args[2].k==='num'&&c.args[2].v<0)
      throw E(`반지름은 0 이상이어야 합니다 (받은 값: ${c.args[2].raw})`,c.args[2]);
    if(target.mod===DIS_ID&&target.name==='tagObj'&&c.args[1].k==='str'&&(!c.args[1].v||/[<>]/.test(c.args[1].v)))
      throw E(`태그 이름은 비어 있거나 < > 가 들어갈 수 없습니다 (붙일 때는 "enemy", 부를 때는 "<enemy>") — 받은 값: "${c.args[1].v}"`,c.args[1]);
    if(target.mod===DIS_ID&&(target.name==='setTextNudge'||target.name==='setObjNudge')&&c.args[1].k==='str'&&!parseNudge(c.args[1].v))throw E(NUDGE_BAD(c.args[1].v),c.args[1]);
    if(target.mod===DIS_ID&&target.name==='setFont'&&c.args[0].k==='str'){   // 상수: 프로젝트 안 .ttf 경로 · 아니면 (Magellan 이 있으면) importFile 로 붙인 이름
      const a=c.args[0],n=resolveTaskPath(a.v,mod.file),mag=Object.values(mod.uses).includes(MAG_ID);
      if(n!==null&&Object.hasOwn(prog.files,n)){if(!TTF_RE.test(n))throw E(`setFont 은 .ttf · .otf 글꼴 파일만 씁니다: ${n}`,a);c.fontPath=n;}
      else if(!mag)throw E(TTF_RE.test(a.v)?`프로젝트에 '${n||a.v}' 파일이 없습니다 (글꼴은 불러오기 · 끌어다 놓기로 프로젝트에 넣으세요)`:`setFont 에는 .ttf 경로를 씁니다 (Magellan 을 쓰면 mag.importFile 로 붙인 이름도) — 받은 값: "${a.v}"`,a);
    }
    if(target.mod===DIS_ID&&target.name==='setTilemap'){   // 콜라이더를 깔므로 colliders 필요 · 상수 경로면 미리 확인
      if(!Object.values(mod.uses).includes(COL_ID))throw E(`setTilemap 은 콜라이더도 깔아서 이 파일에 'Use colliders call 별칭;' 이 필요합니다`,c);
      const a=c.args[1];
      if(a.k==='str'&&TL_RE.test(a.v)){
        const n=resolveTaskPath(a.v,mod.file);
        if(n===null||!Object.hasOwn(prog.files,n))throw E(`프로젝트에 '${n||a.v}' 파일이 없습니다 (타일맵 에디터에서 저장한 .tl 을 프로젝트에 넣으세요)`,a);
        c.tlPath=n;
      }
    }
    if(target.mod===DIS_ID&&target.name==='setDisplayColor'&&c.args[0].k==='str'&&!HEX_RE.test(c.args[0].v))
      throw E(`색은 헥스코드여야 합니다 (예: "#1e90ff", "#fff") — 받은 값: "${c.args[0].v}"`,c.args[0]);
  }
  function stmt(s,sc,cs,chainHead){
    switch(s.k){
      case 'use':case 'lib':return;
      case 'var':{
        const cur=sc[sc.length-1];
        if(cur.has(s.name))throw E(`'${s.name}' 은(는) 이미 같은 범위에 선언되어 있습니다`,s);
        if(s.pub){s.info=prog.publics.get(s.name);cur.set(s.name,s.info);return;}
        if(s.init){
          if(isL(s.ty)&&s.init.k==='mat'){s.init.asList=true;s.init.comp=s.ty==='compound';}
          if(s.ty==='list'&&s.init.k==='call')s.init.splitOK=true;   // var list call a = splitStr(…);
          const t=ex(s.init,sc);
          if(s.ty==='matrix')needMat(s.init,t,s.dims,`행렬 변수 '${s.name}'`);
          else if(!fit(s.init,t,s.ty))throw E(`${tyTxt(t,s.init)} 값을 ${s.ty} 변수 '${s.name}' 에 넣을 수 없습니다`,s);
        }
        s.info={name:s.name,ty:s.ty,dims:s.dims,kind:sc.length===1?(isLib?'global':'tvar'):(!isLib&&runK>=0&&sc.length===2)?'rvar':'local',mod:mod.name,runK};
        cur.set(s.name,s.info);return;
      }
      case 'assign':{
        curLine=s.line;
        const i=look(s.name,sc);
        if(!i)throw E(`변수 '${s.name}' 이(가) 선언되지 않았습니다 (var 로 먼저 만드세요)`,s);
        if(i.param&&i.ty==='string')throw E(`string 매개변수 '${s.name}' 의 값은 바꿀 수 없습니다`,s);
        if(isL(i.ty)&&s.expr.k==='mat'){s.expr.asList=true;s.expr.comp=i.ty==='compound';}
        if(i.ty==='list'&&s.expr.k==='call')s.expr.splitOK=true;
        const t=ex(s.expr,sc);
        if(i.ty==='matrix')needMat(s.expr,t,i.dims,`행렬 변수 '${s.name}'`);
        else if(!fit(s.expr,t,i.ty))throw E(`${tyTxt(t,s.expr)} 값을 ${i.ty} 변수 '${s.name}' 에 넣을 수 없습니다`,s);
        s.info=i;s.ty=i.ty;s.dims=i.dims;return;
      }
      case 'eassign':{   // m[행, 열] = 값;   obj.id.Position[1, 1] = 값;   list[번호] = 값;
        const bt=ex(s.target,sc);
        if(bt==='any'&&s.j!==null){   // c[2][1, 2] = 값;
          idxCheck(s,sc,null);const t=ex(s.expr,sc);
          if(!isNumA(s.expr,t))throw E(`행렬 성분에는 숫자(float)만 넣을 수 있습니다 (받은 형식: ${tyTxt(t,s.expr)})`,s.expr);
          s.anyMat=true;return;
        }
        if(isL(bt)||bt==='any'){
          if(s.j!==null)throw E('리스트 항목은 [번호] 하나로 씁니다 (예: list[2] = 값;)',s);
          const it=ex(s.i,sc);
          if(it==='any')s.i.chk='int';else if(it!=='int'&&it!=='bit'&&!(it==='float'&&s.i.anyInt))throw E(`리스트 번호는 int 여야 합니다 (받은 형식: ${tyTxt(it,s.i)})`,s.i);
          if(bt==='compound'||bt==='any')compMark(s.expr,sc);   // party[1] = ["라이츄", 60];
          const vt=ex(s.expr,sc);
          if(bt==='any')s.anyBase=true;   // c[3][1] = 값; — 실행할 때 확인 (리스트면 숫자 · 문자열만)
          else itemOk(s.expr,vt,bt==='compound');
          s.isList=true;return;
        }
        if(bt==='matrix'&&s.j===null)throw E('행렬 성분은 [행, 열] 두 번호로 씁니다 (예: m[1, 2] = 값;)',s);
        if(bt!=='matrix')throw E(`[행, 열] 은 행렬에만 쓸 수 있습니다 ('${s.target.name||s.target.prop}' 은(는) ${bt})`,s);
        idxCheck(s,sc,s.target.dims);
        const t=ex(s.expr,sc);
        if(!isNumA(s.expr,t))throw E(`행렬 성분에는 숫자(float)만 넣을 수 있습니다 (받은 형식: ${tyTxt(t,s.expr)})`,s.expr);
        return;
      }
      case 'oassign':{   // obj.id.Position = [x, y];   obj.id.Color = "#fff";   obj.id.변수 = 값;
        const tg=s.target;
        if(tg.k==='objvar'){
          const i=ex(tg,sc);
          if(isL(i)&&s.expr.k==='mat'){s.expr.asList=true;s.expr.comp=i==='compound';}
          if(i==='list'&&s.expr.k==='call')s.expr.splitOK=true;
          const t=ex(s.expr,sc);
          if(i==='matrix')needMat(s.expr,t,tg.dims,`obj.${tg.id}.${tg.name}`);
          else if(!fit(s.expr,t,i))throw E(`${tyTxt(t,s.expr)} 값을 ${i} 변수 obj.${tg.id}.${tg.name} 에 넣을 수 없습니다`,s);
          return;
        }
        ex(tg,sc);   // id 없이 쓴 경우 검사
        const t=ex(s.expr,sc),on=tg.id===null?`obj.${tg.prop}`:`obj.${tg.id}.${tg.prop}`;
        if(tg.key==='trigid'||tg.key==='iscol'||tg.key==='colid')throw E(`${on} 은(는) 읽기 전용입니다`,s);
        if(tg.key==='istrig'){if(!fit(s.expr,t,'bit'))throw E(`${on} 에는 bit(0 · 1)를 넣습니다 (받은 형식: ${tyTxt(t,s.expr)})`,s.expr);}
        else if(tg.key==='color')colorCheck(s.expr,t,on);
        else if(tg.key==='text'){if(!fit(s.expr,t,'string'))throw E(`${on} 에는 문자열이 필요합니다 (숫자는 "" + 값 으로)`,s.expr);}
        else needMat(s.expr,t,[1,2],on);
        return;
      }
      case 'if':{
        const head=chainHead||s;
        const t=ex(s.cond,sc);
        if(t==='any')s.cond.chk='float';
        if(t==='string'||t==='matrix'||isL(t))throw E(`조건에는 ${t==='string'?'문자열':isL(t)?'리스트':'행렬'}을 쓸 수 없습니다`,s.cond);
        const ncs=[...cs,{kind:'if',node:head}];
        body(s.then,[...sc,new Map()],ncs);
        if(s.else){
          if(s.elseIf)stmt(s.else[0],sc,cs,head);else body(s.else,[...sc,new Map()],ncs);
        }
        return;
      }
      case 'loop':{
        if(s.ms){   // loop for ms
          const t=ex(s.ms,sc);
          if(t==='any')s.ms.chk='int';
          else if(!isNum(t))throw E(`loop for 의 시간(ms)은 숫자여야 합니다 (받은 형식: ${tyTxt(t,s.ms)})`,s.ms);
        }
        if(s.cond){
          const t=ex(s.cond,sc);
          if(t==='any')s.cond.chk='float';
          if(t==='string'||t==='matrix'||isL(t))throw E(`조건에는 ${t==='string'?'문자열':isL(t)?'리스트':'행렬'}을 쓸 수 없습니다`,s.cond);
        }
        body(s.body,[...sc,new Map()],[...cs,{kind:'loop',node:s}]);return;
      }
      case 'run':runK=runN++;try{body(s.body,[...sc,new Map()],[]);}finally{runK=-1;}return;
      case 'call':return call(s,sc,cs);
    }
  }
  function body(list,sc,cs){for(const s of list)stmt(s,sc,cs);}
  for(const s of mod.ast){
    if(s.k==='func'){
      const fs=new Map();
      for(const p of s.params){
        if(fs.has(p.name))throw E(`매개변수 '${p.name}' 이(가) 중복되었습니다`,s);
        p.info={name:p.name,ty:p.ty,kind:'local',mod:mod.name,param:true,dims:p.dims};
        fs.set(p.name,p.info);
      }
      curFn=s;
      try{body(s.body,[gs,fs],[]);}finally{curFn=null;}
    }else stmt(s,[gs],[]);
  }
}

/* ---------- program builder ---------- */
function walkCalls(list,fn){
  for(const s of list){
    if(s.k==='call')fn(s);
    else if(s.k==='run'||s.k==='loop')walkCalls(s.body,fn);
    else if(s.k==='if'){walkCalls(s.then,fn);if(s.else)walkCalls(s.else,fn);}
  }
}
function buildProgram(files,mainPath){
  const proj=readProject(files);
  if(!Object.hasOwn(files,mainPath)||!/\.jb$/.test(mainPath))throw new JBError(`실행할 .jb 파일이 없습니다: ${mainPath}`,1,'');
  // 라이브러리 목록: lib/ 아래 .jbl 파일을 id 로 구분
  const reg=new Map();
  for(const f of Object.keys(files)){
    if(/^lib\/.+\.jbl$/.test(f)){
      const id=scanLibId(files[f],f);
      if(!reg.has(id))reg.set(id,[]);
      reg.get(id).push(f);
    }
  }
  const libs=[],byId=new Map(),tasks=new Map(),loading=[];
  function bindUses(mod){
    for(const s of mod.ast){
      if(s.k!=='use')continue;
      if(hget(mod.uses,s.alias))throw new JBError(`별칭 '${s.alias}' 이(가) 중복되었습니다`,s.line,mod.file);
      if(s.lib==='jawbreaker'){mod.uses[s.alias]='jawbreaker';continue;}
      if(s.lib===DIS_ID){mod.uses[s.alias]=DIS_ID;continue;}
      if(s.lib===COL_ID){mod.uses[s.alias]=COL_ID;continue;}
      if(s.lib===CAN_ID){mod.uses[s.alias]=CAN_ID;continue;}
      if(s.lib===MAG_ID){mod.uses[s.alias]=MAG_ID;continue;}
      if(s.lib===SND_ID){mod.uses[s.alias]=SND_ID;continue;}
      if(s.lib===CAM_ID){mod.uses[s.alias]=CAM_ID;continue;}
      loadLib(s.lib,mod.file,s.line);
      mod.uses[s.alias]=s.lib;
    }
  }
  function loadLib(id,fromFile,fromLine){
    if(byId.has(id))return byId.get(id);
    const paths=reg.get(id);
    if(!paths)throw new JBError(`라이브러리 id '${id}' 을(를) 찾을 수 없습니다 (lib/ 폴더의 .jbl 파일 맨 위에 'Lib id ${id};' 가 있어야 합니다)`,fromLine,fromFile);
    if(paths.length>1)throw new JBError(`라이브러리 id '${id}' 이(가) 여러 파일에 중복되었습니다: ${paths.join(', ')}`,fromLine,fromFile);
    if(loading.includes(id))throw new JBError(`라이브러리가 서로를 순환 참조합니다: ${[...loading,id].join(' → ')}`,fromLine,fromFile);
    loading.push(id);
    const file=paths[0];
    const mod={name:id,file,kind:'lib',isLib:true,uses:{},parentId:null};
    mod.ast=parse(lex(files[file],file),file,'jbl');
    const h=mod.ast[0]&&mod.ast[0].k==='lib'?mod.ast[0]:null;
    if(h&&h.parent&&h.parent!=='jawbreaker'){
      mod.parentId=h.parent;
      loadLib(h.parent,file,h.line);
    }
    bindUses(mod);
    loading.pop();
    byId.set(id,mod);libs.push(mod);
    return mod;
  }
  function loadTask(path){
    if(tasks.has(path))return tasks.get(path);
    const mod={name:'@'+path,file:path,kind:'task',isLib:false,uses:{}};
    tasks.set(path,mod);
    mod.ast=parse(lex(files[path],path),path,'jb');
    bindUses(mod);
    // run{ } 바로 안의 dis.BelongObj("id"); · can.BelongScene("장면"); → 이 파일 전체가 귀속
    mod.belongDecl=[];
    for(const r of mod.ast){
      if(r.k!=='run')continue;
      for(const c of r.body){
        if(c.k!=='call'||c.lib===null||(c.name!=='BelongObj'&&c.name!=='BelongScene'))continue;
        const scene=c.name==='BelongScene';
        const al=hget(mod.uses,c.lib);
        if(!al)throw new JBError(`'${c.lib}' 은(는) 라이브러리 별칭이 아닙니다 (파일 위쪽에 'Use ${scene?'Canvas':'DisPlayer'} call ${c.lib};' 이 필요합니다)`,c.line,path);
        if(al!==(scene?CAN_ID:DIS_ID))continue;   // 다른 라이브러리면 검사기가 알려줌
        const ex=`${c.lib}.${c.name}("${scene?'title':'player'}");`;
        if(c.args.length!==1||c.args[0].k!=='str')throw new JBError(`${c.name} 에는 ${scene?'장면 이름':'오브젝트 id'}을(를) 따옴표 안의 문자열 하나로 씁니다 (예: ${ex})`,c.line,path);
        const id=c.args[0].v;
        if(!id)throw new JBError(`${c.name} 의 ${scene?'장면 이름':'id'} 이(가) 비어 있습니다 — 귀속시킬 ${scene?'장면':'오브젝트'}을(를) 써야 합니다 (예: ${ex})`,c.line,path);
        if(scene&&id==='*')throw new JBError(`'*' 은(는) 장면 이름으로 쓸 수 없습니다`,c.line,path);
        if(!scene&&/[<>]/.test(id))throw new JBError(`BelongObj 에는 태그("<태그>")가 아니라 오브젝트 id 를 씁니다`,c.line,path);
        if(path===mainPath&&scene)throw new JBError(`처음 실행하는 파일(${path})은 장면에 귀속시킬 수 없습니다 — 장면 코드는 다른 .jb 파일에 두세요`,c.line,path);
        c.belongOk=true;mod.belongDecl.push({scene,id});
      }
    }
    const found=[];
    walkCalls(mod.ast,c=>{
      if(c.name!=='sendto'&&c.name!=='setup')return;
      if(c.lib!==null&&hget(mod.uses,c.lib)!=='jawbreaker')return;
      if(c.args.length!==1)return;
      if(c.args[0].k!=='str')throw new JBError(`${c.name} 경로는 따옴표 안의 문자열 상수여야 합니다 (예: jaw.${c.name}("tools/a.jb");)`,c.line,path);
      found.push(c);
    });
    for(const c of found){
      const raw=c.args[0].v,n=resolveTaskPath(raw,path);
      if(n===null)throw new JBError(`경로가 프로젝트 폴더 밖을 가리킵니다: ${raw}`,c.line,path);
      if(!Object.hasOwn(files,n))throw new JBError(`프로젝트에 '${n}' 파일이 없습니다`,c.line,path);
      if(!/\.jb$/.test(n))throw new JBError(`${c.name} 는 .jb 코드 파일만 실행할 수 있습니다: ${n}`,c.line,path);
      c.taskPath=n;
      loadTask(n);
    }
    return mod;
  }
  loadTask(mainPath);
  // 귀속 선언(BelongObj · BelongScene)이 있는 .jb 파일은 누가 부르지 않아도 모두 불러옴
  for(const f of Object.keys(files).sort()){
    if(!f.endsWith('.jb')||tasks.has(f))continue;
    if(/\.\s*Belong(?:Obj|Scene)\s*\(/.test(files[f].replace(/\/\/[^\n]*|\/\*[\s\S]*?(?:\*\/|$)/g,'')))loadTask(f);
  }
  // var public — 프로젝트 전체가 함께 쓰는 변수 (같은 이름이면 같은 변수, 형식은 같아야 함)
  const publics=new Map();
  // 실행에 쓰이지 않는 파일도 포함해 프로젝트 안의 모든 .jb · .jbl 에서 public 선언을 모음
  const declSrc=[...libs,...tasks.values()].map(m=>({ast:m.ast,file:m.file}));
  const loaded=new Set(declSrc.map(d=>d.file));
  for(const f of Object.keys(files).sort()){
    if(loaded.has(f)||!/\.(jb|jbl)$/.test(f))continue;
    if(f.endsWith('.jbl')&&!/^lib\//.test(f))continue;
    let ast;
    try{ast=parse(lex(files[f],f),f,f.endsWith('.jbl')?'jbl':'jb');}catch(e){continue;}   // 오류가 있는 파일은 건너뜀
    declSrc.push({ast,file:f});
  }
  for(const m of declSrc)for(const s of m.ast){
    if(s.k!=='var'||!s.pub)continue;
    const ex=publics.get(s.name);
    const tt=(ty,d)=>ty==='matrix'?dimsTxt(d):ty;
    if(ex&&(ex.ty!==s.ty||(s.ty==='matrix'&&(ex.dims[0]!==s.dims[0]||ex.dims[1]!==s.dims[1]))))
      throw new JBError(`public 변수 '${s.name}' 의 형식이 다릅니다 (${ex.file}:${ex.line} 에서는 ${tt(ex.ty,ex.dims)}, 여기서는 ${tt(s.ty,s.dims)})`,s.line,m.file);
    if(!ex)publics.set(s.name,{name:s.name,ty:s.ty,dims:s.dims,kind:'public',mod:'public',file:m.file,line:s.line});
  }
  // 귀속: id → 파일 목록 (프로그램 시작 때 모두 등록) · 파일 → 그 파일이 붙는 오브젝트 id 들
  const belongs=new Map(),boundIds=new Map(),sceneBelongs=new Map(),sceneFiles=new Set();
  const idsOf=f=>{if(!boundIds.has(f))boundIds.set(f,new Set());return boundIds.get(f);};
  for(const m of tasks.values())for(const d of m.belongDecl){
    if(d.scene){   // can.BelongScene("장면")
      if(!sceneBelongs.has(d.id))sceneBelongs.set(d.id,[]);
      if(!sceneBelongs.get(d.id).includes(m.file))sceneBelongs.get(d.id).push(m.file);
      sceneFiles.add(m.file);continue;
    }
    idsOf(m.file).add(d.id);   // obj.id.변수 · id 없는 obj.속성 검사용
    if(m.file===mainPath)continue;   // main 은 그 줄을 실행할 때 귀속 (오브젝트가 생길 때 따로 실행하지 않음)
    if(!belongs.has(d.id))belongs.set(d.id,[]);
    if(!belongs.get(d.id).includes(m.file))belongs.get(d.id).push(m.file);
  }
  // obj.id.변수 — 귀속된 파일의 최상위 변수 (형식은 미리 앎)
  const objVars=new Map();
  for(const m of tasks.values()){
    const ids=idsOf(m.file);m.bound=ids.size>0;m.sceneBound=sceneFiles.has(m.file);
    const ovDecl=[];   // 파일 최상위 var + run{ } 바로 안의 var (runK = 몇 번째 run)
    for(const s of m.ast)if(s.k==='var'&&!s.pub)ovDecl.push([s,null]);
    let rk=0;for(const r of m.ast)if(r.k==='run'){for(const s of r.body)if(s.k==='var'&&!s.pub)ovDecl.push([s,rk]);rk++;}
    for(const [s,runK] of ovDecl){
      for(const id of ids){
        if(!objVars.has(id))objVars.set(id,new Map());
        const ex=objVars.get(id).get(s.name);
        if(ex&&(ex.ty!==s.ty||(s.ty==='matrix'&&(ex.dims[0]!==s.dims[0]||ex.dims[1]!==s.dims[1]))))
          throw new JBError(`오브젝트 '${id}' 에 귀속된 파일들에서 변수 '${s.name}' 의 형식이 다릅니다 (${ex.file} 과 여기)`,s.line,m.file);
        if(!ex)objVars.get(id).set(s.name,{name:s.name,ty:s.ty,dims:s.dims,file:m.file,runK});
      }
    }
  }
  // 부모 변수: 귀속된 코드는 조상 오브젝트(부모, 그 부모 …)에 귀속된 파일의 변수를 이름만으로 씀 — 가까운 조상이 먼저
  const parentVars=new Map();
  for(const vm of objVars.values())for(const [n,i] of vm){
    const ex=parentVars.get(n);
    if(!ex)parentVars.set(n,{name:n,ty:i.ty,dims:i.dims,kind:'pvar',file:i.file});
    else if(ex.ty!==i.ty||(i.ty==='matrix'&&(ex.dims[0]!==i.dims[0]||ex.dims[1]!==i.dims[1])))ex.clash=i.file;
  }
  const prog={libs,byId,tasks,mainPath,proj,publics,belongs,objVars,parentVars,sceneBelongs,files};
  for(const m of [...libs,...tasks.values()])check(m,prog);
  return prog;
}

/* ---------- runtime ---------- */
function fmtFloat(x){
  if(!isFinite(x))return isNaN(x)?'nan':x<0?'-inf':'inf';
  if(x===0)return Object.is(x,-0)?'-0':'0';
  const [m,ex]=x.toExponential(5).split('e');const X=parseInt(ex,10);
  const strip=s=>s.includes('.')?s.replace(/0+$/,'').replace(/\.$/,''):s;
  if(X<-4||X>=6){const a=Math.abs(X);return strip(m)+'e'+(X<0?'-':'+')+(a<10?'0'+a:a);}
  return strip(x.toFixed(5-X));
}
function fmtMat(m){
  const rows=[];
  for(let i=0;i<m.r;i++)rows.push(m.d.slice(i*m.c,(i+1)*m.c).map(fmtFloat).join(', '));
  return '['+rows.join(' | ')+']';
}
// 리스트 항목(any): 숫자 또는 문자열 — 정수면 정수로, 아니면 float 처럼 보여줌
// compound 항목은 행렬 · 리스트 · compound 일 수도 있음 (리스트 안의 문자열은 "따옴표")
const fmtItem=v=>typeof v==='string'?'"'+v+'"':fmtAny(v);
const fmtAny=v=>typeof v==='string'?v:typeof v==='object'?(v.d?fmtMat(v):'['+v.items.map(fmtItem).join(', ')+']'):(Number.isInteger(v)&&Math.abs(v)<1e15?String(v):fmtFloat(v));
const fmtList=fmtAny;
const fmtVal=(v,ty)=>ty==='string'?v:ty==='float'?fmtFloat(v):ty==='matrix'?fmtMat(v):ty==='any'||isL(ty)?fmtAny(v):String(v);
// 값 복사 (compound 는 안쪽까지) · 비교 (안쪽까지)
const deepCopy=v=>typeof v!=='object'?v:v.d?matCopy(v):v.comp?{items:v.items.map(deepCopy),comp:true}:{items:v.items.slice()};
function deepEq(a,b){
  if(a===b)return true;
  if(typeof a!=='object'||typeof b!=='object')return false;
  if(a.d){if(!b.d||a.r!==b.r||a.c!==b.c)return false;for(let i=0;i<a.d.length;i++)if(a.d[i]!==b.d[i])return false;return true;}
  if(!b.items||!a.comp!==!b.comp||a.items.length!==b.items.length)return false;
  for(let i=0;i<a.items.length;i++)if(!deepEq(a.items[i],b.items[i]))return false;
  return true;
}
const kindTxt=v=>typeof v==='string'?`"${v}"`:typeof v!=='object'?fmtAny(v):v.d?dimsTxt([v.r,v.c]):v.comp?'compound':'리스트';
class Env{
  // self: 귀속된 오브젝트 id — 바깥 환경까지 찾아봄 (실행 중에 귀속되면 같은 파일의 모든 run 에 바로 보임) · tk: 귀속 실행 (지우면 멈춤)
  constructor(p){this.p=p;this.m=new Map();this._s=undefined;this.tk=p?p.tk:null;}
  get self(){for(let e=this;e;e=e.p)if(e._s!==undefined)return e._s;return null;}
  set self(v){this._s=v;}
  get(n){for(let e=this;e;e=e.p){const s=e.m.get(n);if(s)return s;}return null;}
  def(n,ty,v){this.m.set(n,{ty,v});}
}
// ---- soundMaster: Web Audio (브라우저) — 실행이 바뀌어도 이전 소리는 모두 멈춤 ----
const SND_LIVE=new Set();
function sndStopAll(){for(const v of SND_LIVE){try{v.src.stop();}catch(e){}}SND_LIVE.clear();}
async function execProgram(prog,io,ctl){
  sndStopAll();
  const envs=new Map(),fns=new Map();
  for(const m of prog.libs){
    const env=new Env(m.parentId?envs.get(m.parentId):null);envs.set(m.name,env);
    for(const s of m.ast)if(s.k==='func')fns.set(m.name+'.'+s.name,{def:s,env});
  }
  const rt=(msg,n)=>new JBError(msg,n.line,n.file);
  const co=(v,ty)=>ty==='int'?(v|0):ty==='bit'?(v!==0?1:0):ty==='matrix'?matCopy(v):ty==='list'?{items:v.items.slice()}:ty==='compound'?deepCopy(v):v;
  const dflt=(ty,dims)=>ty==='string'?'':ty==='matrix'?matNew(dims[0],dims[1]):ty==='list'?{items:[]}:ty==='compound'?{items:[],comp:true}:0;
  const own=v=>typeof v==='object'?deepCopy(v):v;   // 리스트 · compound 에 넣을 때 복사
  // 리스트 항목 형식 확인 (쓰이는 곳이 숫자/문자열을 원할 때)
  function dynChk(v,w,n){
    if(w==='string'){if(typeof v!=='string')throw rt(`리스트 항목이 문자열이 아닙니다 (값: ${kindTxt(v)})`,n);return v;}
    if(w==='scalar'){if(typeof v==='object')throw rt(`리스트에는 숫자나 문자열만 넣을 수 있습니다 (받은 값: ${kindTxt(v)}) — compound 를 쓰세요`,n);return v;}
    if(w==='matrix'){
      if(typeof v!=='object'||!v.d)throw rt(`항목이 행렬이 아닙니다 (값: ${kindTxt(v)})`,n);
      if(n.chkDims&&(v.r!==n.chkDims[0]||v.c!==n.chkDims[1]))throw rt(`${dimsTxt(n.chkDims)} 행렬이 필요합니다 (항목: ${dimsTxt([v.r,v.c])})`,n);
      return v;
    }
    if(w==='list'){if(typeof v!=='object'||!v.items||v.comp)throw rt(`항목이 리스트가 아닙니다 (값: ${kindTxt(v)})`,n);return v;}
    if(w==='compound'){if(typeof v!=='object'||!v.comp)throw rt(`항목이 compound 가 아닙니다 (값: ${kindTxt(v)})`,n);return v;}
    if(typeof v==='string')throw rt(`리스트 항목이 숫자가 아닙니다 (값: "${v}")`,n);
    if(typeof v==='object')throw rt(`항목이 숫자가 아닙니다 (값: ${kindTxt(v)})`,n);
    return w==='int'?Math.trunc(v):v;
  }
  function lix(i,L,n,extra){
    const len=L.items.length+(extra||0);
    if(!len)throw rt('리스트가 비어 있습니다',n);
    if(i<1||i>len)throw rt(`리스트 번호 ${i} 이(가) 범위(1~${len})를 벗어났습니다`,n);
    return i-1;
  }
  let syncDepth=0,syncNode=null,syncStart=0;   // 값을 돌려주는 함수는 기다리지 않고 한 번에 실행
  const raf0=typeof requestAnimationFrame==='function'?requestAnimationFrame:(f=>setTimeout(f,1000/60));
  // 화면 주사율은 그리기 · 대기에만: 대기 중인 작업은 한 화면 프레임에서 함께 깨우고, 다 돈 뒤 그 프레임에 한 번만 그림
  let hubQ=[],hubRq=false,drawPend=false,hubT=0,hubDt=16.7;   // hubT: 이번 화면 프레임 시작 · hubDt: 화면 프레임 간격 (어림)
  function hubKick(){if(hubRq)return;hubRq=true;raf0(hubRun);raf0(hubFlush);}
  function hubRun(){const t=performance.now(),g=t-hubT;if(g>2&&g<50)hubDt=hubDt*0.8+g*0.2;hubT=t;const q=hubQ;hubQ=[];for(const f of q){try{f();}catch(e){}}}
  function hubFlush(){
    hubRq=false;
    if(physT!==null&&!tickCatch())tickEnd();   // 그리기 직전에 밀린 내부 틱 처리 (타이머가 늦어도 화면은 최신 상태)
    if(drawPend){drawPend=false;if(io.dis&&io.dis.draw)io.dis.draw(drawList());}
    if(hubQ.length||physT!==null)hubKick();   // 내부 틱이 도는 동안은 화면 프레임마다 한 번 그림
  }
  const raf=f=>{hubQ.push(f);hubKick();};
  const pub=new Map();for(const [n,i] of prog.publics)pub.set(n,{ty:i.ty,v:dflt(i.ty,i.dims)});
  // DisPlayer 오브젝트 (만든 순서대로 그림)
  let objOn=false,curObj=null,selfNow=null;   // selfNow: 지금 실행 중인 명령의 귀속 오브젝트 id ("" id = 자기 자신)
  const objects=new Map();
  let layerOn=false;   // setObjLayer 를 한 번이라도 쓰면 레이어 순서로 그림
  // 활성: disableObj 로 끄지 않았고, 지금 장면에 있을 수 있음 (부모가 꺼지면 자식도) — 꺼진 오브젝트는 안 그리고 · 안 움직이고 · 충돌 · 트리거 · 마우스 판정도 없음
  let offOn=false,sceneOn=false,curScene=0,sceneN=0,sceneInsts=[];
  const sceneByName=new Map(),sceneNameOf=new Map();   // 이름 → 번호 · 번호 → 이름
  function live(o){
    if(!offOn&&!sceneOn)return true;
    for(let x=o,n=0;x&&n<1000;n++){
      if(x.off)return false;
      if(sceneOn&&x.scenes&&!x.scenes.has('*')&&!x.scenes.has(curScene))return false;
      x=x.parent?objects.get(x.parent):null;
    }
    return true;
  }
  const drawList=()=>{
    let a=[...objects.values()];if(offOn||sceneOn)a=a.filter(live);
    const k=camNow();
    if(renderLim>0){   // dis.setRenderLimit: 메인 카메라 가운데에서 반지름 안 (조금이라도 걸치면 그림)
      const R=renderLim/(k?k.z:1),cx=k?k.x:0,cy=k?k.y:0;
      a=a.filter(o=>{if(o.ui)return true;const dx=o.pos.d[0]-cx,dy=o.pos.d[1]-cy,r=R+Math.hypot(o.scale.d[0],o.scale.d[1])/2;return dx*dx+dy*dy<=r*r;});
    }
    if(layerOn)a.sort((x,y)=>(x.layer||0)-(y.layer||0));a.cam=k;return a;
  };   // 같은 레이어는 만든 순서
  let idOvNode=null,idOv=null;   // "<태그>" 로 부를 때: 그 id 값 대신 쓸 오브젝트 id
  function objOf(id,n){
    if(!objOn)throw rt(NOOBJ,n);
    if(id===''&&selfNow!==null)id=selfNow;
    const o=objects.get(id);
    if(!o)throw rt(`오브젝트 '${id}' 이(가) 없습니다 (dis.setObject 로 먼저 만드세요)`,n);
    return o;
  }
  function parseColor(v,n){
    const six=h=>'#'+(h.length===3?h.replace(/./g,c=>c+c):h);   // 3자리 → 6자리
    if(typeof v==='string'&&HEX_RE.test(v))return six(v.replace(/^#/,''));
    const raw=n&&n.k==='num'&&!n.isFloat&&n.raw!=null?n.raw:String(v);   // 숫자 색은 쓴 그대로 (000000 · 001122)
    if(typeof v==='number'&&/^(\d{3}|\d{6})$/.test(raw))return six(raw);
    throw rt(`색은 헥스코드여야 합니다 (예: "#ff8800" 또는 114514) — 받은 값: ${typeof v==='string'?'"'+v+'"':v}`,n);
  }
  function ix(v,n,w,node){
    if(v<1||v>n)throw rt(`행렬의 ${w} 번호 ${v} 이(가) 범위(1~${n})를 벗어났습니다`,node);
    return v-1;
  }
  // 글자 오브젝트: Scale = [글자 폭, 글자 크기] — 크기(Y)를 바꾸면 폰트 크기가 바뀌고 폭은 다시 잼
  const measure1=(t,size)=>io.dis&&io.dis.measure?io.dis.measure(t,size):textWidthEst(t,size);
  const measure=(t,size)=>{t=String(t);return t.includes('\n')?Math.max(...t.split('\n').map(l=>measure1(l,size))):measure1(t,size);};   // 여러 줄이면 가장 긴 줄
  const textH=o=>Math.abs(o.scale.d[1])*(1+1.2*(String(o.text).split('\n').length-1));   // 글자 높이: 크기 + 줄 간격 1.2 × (줄 수 - 1)
  const nudX=o=>o.nud?o.nud[0]*Math.abs(o.scale.d[0])/2:0,nudY=o=>o.nud?o.nud[1]*(o.kind==='text'?textH(o):Math.abs(o.scale.d[1]))/2:0;   // dis.setTextNudge · setObjNudge: 위치(기준점) → 가운데까지
  function fitText(o){   // 글자나 크기가 바뀐 때만 폭을 다시 잼
    const size=Math.abs(o.scale.d[1])||o.size;
    if(o.fitT===o.text&&o.fitS===size&&o.scale.d[0]===o.fitW)return;
    o.size=size;o.fitT=o.text;o.fitS=size;o.fitW=o.scale.d[0]=measure(o.text,size);o.scale.d[1]=size;
  }
  let drawQ=false;   // 같은 순간에 여러 번 바뀌어도 그리기 요청은 한 번
  const redraw=()=>{
    if(drawQ)return;
    drawQ=true;
    queueMicrotask(()=>{
      drawQ=false;
      checkTriggers();
      for(const o of objects.values())if(o.kind==='text')fitText(o);
      if(io.dis&&io.dis.draw){drawPend=true;hubKick();}   // 그리기는 화면 프레임에 한 번
    });
  };
  // 움직임(colliders 속도 · moveObj): 화면 프레임마다 계산하고 같은 프레임에 그림 → 부드럽게.
  // 속도는 바꾸거나 묶어두기(col.setAnchor) 전까지 유지 — 프로그램이 끝나도 화면이 열려 있으면 계속 움직임
  // (✕ · 다음 실행 · ■ 정지 · terminate() · 오류에서 멈춤)
  let physT=null,physLast=0;
  const anims=new Map();   // id → moveObj 진행 상태
  const imgAlias=new Map();   // mag.importFile: 이름 → 경로 (프로그램 전체 공유 · 파일을 복사하거나 따로 저장하지 않음)
  const imgCache=new Map();   // 경로 → {img, w, h} — 처음 쓰일 때 그 경로의 파일을 읽어 그림에 씀
  function imgOf(path,n){
    let e=imgCache.get(path);
    if(!e){
      e={img:null,w:0,h:0};imgCache.set(path,e);
      if(io.dis&&io.dis.loadImage)io.dis.loadImage(prog.files[path]).then(t=>{e.img=t.img;e.w=t.w;e.h=t.h;redraw();},
        ()=>{if(!halted)halted=rt(`이미지 '${path}' 을(를) 읽지 못했습니다 (손상되었거나 지원하지 않는 형식)`,n);});
    }
    return e;
  }
  // ---- 타일맵 (.tl) ----
  // 레이어마다 한 장의 이미지로 미리 그려 오브젝트 하나로 (타일마다 오브젝트를 만들지 않음 — 가벼움)
  // 콜라이더: 보이는 레이어의 콜라이더 타일을 붙어 있는 것끼리 사각형으로 합쳐 보이지 않는 벽으로 (오르기 블럭 칸은 막지 않음)
  const tlCache=new Map(),tlPlaced=new Map();   // 경로 → 읽은 타일맵 · 타일맵 id → 만든 오브젝트 id 들
  function tlRead(path,n){
    let t=tlCache.get(path);if(t)return t;
    let j;try{j=JSON.parse(prog.files[path]);}catch(e){throw rt(`'${path}' 은(는) 올바른 타일맵 파일이 아닙니다 (JSON 이 아님)`,n);}
    if(!j||j.format!=='jawbreaker-tilemap'||!Array.isArray(j.layers)||!Array.isArray(j.textures))throw rt(`'${path}' 은(는) 타일맵 에디터의 .tl 파일이 아닙니다`,n);
    const w=j.width|0,h=j.height|0,ts=+j.tileSize;
    if(!(w>0&&h>0&&ts>0))throw rt(`'${path}' 의 크기가 올바르지 않습니다`,n);
    const tex=j.textures.map(x=>({data:typeof x.data==='string'?x.data:null,col:!!x.collider,climb:!!x.climb,name:String(x.name||'')}));
    const layers=j.layers.map((l,i)=>{
      if(!Array.isArray(l.tiles)||l.tiles.length!==w*h)throw rt(`'${path}' 레이어 ${i} 의 칸 수가 ${w}×${h} 와 다릅니다`,n);
      return{visible:l.visible!==false,tiles:l.tiles.map(v=>Number.isInteger(v)&&v>=0&&v<tex.length?v:-1)};
    });
    const miss=tex.filter(x=>!x.data).map(x=>x.name);
    if(miss.length)io.sys&&io.sys(`⚠ ${path}: 이미지가 없는 텍스쳐 ${miss.length}개 (${miss.slice(0,4).join(', ')}) — 타일맵 에디터에서 다시 저장하세요`);
    const z=Array.isArray(j.zero)&&Number.isInteger(j.zero[0])&&Number.isInteger(j.zero[1])&&j.zero[0]>=0&&j.zero[1]>=0&&j.zero[0]<w&&j.zero[1]<h?j.zero:null;   // 에디터에서 정한 [0, 0] 칸
    t={w,h,ts,tex,layers,zero:z,imgs:null};tlCache.set(path,t);return t;
  }
  function tlImages(t){   // 텍스쳐 이미지 (한 번만 읽음)
    if(!t.imgs)t.imgs=Promise.all(t.tex.map(x=>x.data&&io.dis&&io.dis.loadImage?io.dis.loadImage(x.data).then(r=>r.img,()=>null):Promise.resolve(null)));
    return t.imgs;
  }
  function tlSolid(t){   // 막힌 칸 → 합친 사각형 [칸 x, 칸 y, 가로 칸 수, 세로 칸 수]
    const {w,h}=t,solid=new Uint8Array(w*h),climb=new Uint8Array(w*h);
    for(const l of t.layers){if(!l.visible)continue;for(let i=0;i<w*h;i++){const v=l.tiles[i];if(v<0)continue;if(t.tex[v].climb)climb[i]=1;else if(t.tex[v].col)solid[i]=1;}}
    for(let i=0;i<w*h;i++)if(climb[i])solid[i]=0;
    const runs=[],out=[];
    for(let y=0;y<h;y++){const r=[];for(let x=0;x<w;){if(!solid[y*w+x]){x++;continue;}let e=x;while(e<w&&solid[y*w+e])e++;r.push([x,e-x]);x=e;}runs.push(r);}
    const open=new Map();   // "x,길이" → 아래로 이어지는 사각형
    for(let y=0;y<=h;y++){
      const cur=new Set(y<h?runs[y].map(r=>r[0]+','+r[1]):[]);
      for(const [k,b] of open)if(!cur.has(k)){out.push(b);open.delete(k);}
      if(y<h)for(const [x,len] of runs[y]){const k=x+','+len;if(open.has(k))open.get(k)[3]++;else open.set(k,[x,y,len,1]);}
    }
    return out;
  }
  function tilemapPlace(id,path,x,y,n){   // [x, y] 에 맵의 [0, 0] 지점 (에디터에서 정한 칸의 가운데 · 없으면 맵 가운데)
    const t=tlRead(path,n),W=t.w*t.ts,H=t.h*t.ts;
    const cx=t.zero?x-((t.zero[0]+0.5)*t.ts-W/2):x,cy=t.zero?y-(H/2-(t.zero[1]+0.5)*t.ts):y;   // 맵 가운데의 위치
    for(const oid of tlPlaced.get(id)||[]){const o=objects.get(oid);if(o){objects.delete(oid);unlinkAll(oid);}}   // 같은 id 로 다시 깔면 예전 것은 지움
    const made=[];
    t.layers.forEach((l,li)=>{
      if(!l.visible)return;
      const oid=`${id}.layer${li}`,o={id:oid,kind:'rect',pos:{r:1,c:2,d:[cx,cy]},scale:{r:1,c:2,d:[W,H]},color:'#ffffff',alpha:0,vel:{r:1,c:2,d:[0,0]},layer:-1000+li};   // 이미지가 준비될 때까지 안 보임
      objects.set(oid,o);born(o,n);made.push(oid);
    });
    for(const [x,y,cw,ch] of tlSolid(t)){
      const oid=`${id}.col${made.length}`,size=[cw*t.ts,ch*t.ts],px=cx-W/2+(x+cw/2)*t.ts,py=cy+H/2-(y+ch/2)*t.ts;
      const o={id:oid,kind:'none',pos:{r:1,c:2,d:[px,py]},scale:{r:1,c:2,d:size.slice()},color:'#000',vel:{r:1,c:2,d:[0,0]},col:{off:[0,0],size,e:0,grav:false}};
      objects.set(oid,o);born(o,n);made.push(oid);colOn=true;
    }
    tlPlaced.set(id,made);layerOn=true;
    const nCol=made.filter(x=>x.includes('.col')).length;
    io.sys&&io.sys(`🗺 타일맵 '${id}' (${t.w} × ${t.h} 칸 · 타일 ${t.ts}) — 레이어 ${made.length-nCol}장 · 콜라이더 ${nCol}개`);
    if(colOn)physStart();redraw();
    if(!io.dis||!io.dis.loadImage||typeof document==='undefined')return;
    return tlImages(t).then(imgs=>{   // 레이어 이미지를 그린 뒤 다음 줄 (깜빡이지 않게)
      t.layers.forEach((l,li)=>{
        const o=objects.get(`${id}.layer${li}`);if(!o||!l.visible)return;
        const cv=document.createElement('canvas');cv.width=Math.max(1,Math.round(W));cv.height=Math.max(1,Math.round(H));
        const x=cv.getContext('2d');x.imageSmoothingEnabled=false;
        for(let i=0;i<l.tiles.length;i++){const v=l.tiles[i];if(v<0||!imgs[v])continue;x.drawImage(imgs[v],(i%t.w)*t.ts,Math.floor(i/t.w)*t.ts,t.ts,t.ts);}
        o.texture={ref:{img:cv,w:cv.width,h:cv.height},x1:0,y1:0,x2:cv.width,y2:cv.height,path:'tilemap:'+path+'#'+li};o.alpha=255;
      });
      redraw();
    });
  }
  const jsons=new Map();   // jaw.setJson: id → 값 (복사본)
  // Magellan: 텍스쳐 id → 이미지의 부분 · 애니메이션 id → {frames, ms} · 애니메이션 재생 중인 오브젝트
  const texDefs=new Map(),animes=new Map(),animObjs=new Set();
  function showTex(o,tid,n){   // 텍스쳐 입히기 (처음 입힐 때만 색을 #ffffff 로)
    const d=texDefs.get(tid);if(!o.texture)o.color='#ffffff';
    o.texture={ref:imgOf(d.path,n||d.n),id:d.img,path:d.path,x1:d.x1,y1:d.y1,x2:d.x2,y2:d.y2};redraw();
  }
  function animeStart(o,aid,sp,t0,n){
    const A=animes.get(aid);
    o.an={id:aid,frames:A.frames,dur:A.ms/sp,start:t0,k:0,next:null,n};showTex(o,A.frames[0],n);animObjs.add(o);physStart();
  }
  function animeStop(o){if(o.an){o.an=null;animObjs.delete(o);}}
  function animeStep(now){   // 프레임마다: 지금 프레임의 텍스쳐 · 끝나면 다음 애니메이션 (없으면 마지막 프레임에서 멈춤)
    for(const o of animObjs){
      if(objects.get(o.id)!==o||!o.an){animObjs.delete(o);continue;}
      if(popStack.length&&!live(o))continue;   // 팝업 장면 때문에 멈춤
      const A=o.an,k=Math.floor((now-A.start)/A.dur);
      if(k>=A.frames.length){
        if(A.next)animeStart(o,A.next.id,A.next.sp,A.start+A.dur*A.frames.length,A.n);
        else{o.an=null;animObjs.delete(o);}
        continue;
      }
      if(k!==A.k&&k>=0){A.k=k;showTex(o,A.frames[k],A.n);}
    }
  }
  const jsonOut=new Map(); // 이번 실행에서 genJson 으로 쓴 파일 (loadJson 이 먼저 봄)
  let renderLim=0;          // dis.setRenderLimit: 메인 카메라 가운데에서 이 반지름(화면 픽셀) 안만 그림 · 0 = 제한 없음
  let physN=1;              // 물리 틱 번호 — 이번 틱에 부딪힌 콜라이더는 colN = physN (isCollided)
  const tweens=new Map();  // "id|속성" → for 로 바뀌는 중 (scale · alpha · color)
  const hexRgb=h=>{let x=String(h).replace(/^#/,'');if(x.length===3)x=x.replace(/./g,c=>c+c);const n=parseInt(x,16);return[n>>16&255,n>>8&255,n&255];};   // "#f00" → "#ff0000" 로 펼쳐서
  const rgbHex=a=>'#'+a.map(v=>Math.max(0,Math.min(255,Math.round(v))).toString(16).padStart(2,'0')).join('');
  function tween(o,prop,to,ms){   // 지금 값 → to 로 ms 동안 (끝나면 다음 줄)
    const key=o.id+'|'+prop,prev=tweens.get(key);if(prev)prev.res();
    const from=prop==='scale'?o.scale.d.slice():prop==='alpha'?[o.alpha==null?255:o.alpha]:prop==='angle'?[o.angle||0]:prop==='ov'?[...hexRgb(o.ov.color),o.ov.a]:hexRgb(o.color);
    return new Promise((res,rej)=>{   // 바뀌기 시작하면 (첫 프레임) 다음 줄 · 끝은 기다리지 않음
      let done=false;const go=()=>{if(done)return;done=true;ctl.last=performance.now();res();};
      tweens.set(key,{o,prop,from,to,start:performance.now(),ms,res:go,first:go,rej:e=>{if(!done){done=true;rej(e);}}});
      physStart();
    });
  }
  function tweenStep(now){
    for(const [key,w] of tweens){
      if(objects.get(w.o.id)!==w.o){tweens.delete(key);w.res();continue;}   // 지워졌으면 끝
      if(popStack.length&&!live(w.o))continue;   // 팝업 장면 때문에 멈춤
      const k=Math.min(1,(now-w.start)/w.ms),v=w.from.map((f,i)=>f+(w.to[i]-f)*k);
      if(w.prop==='scale'){w.o.scale.d[0]=v[0];w.o.scale.d[1]=v[1];}
      else if(w.prop==='alpha')w.o.alpha=Math.round(v[0]);
      else if(w.prop==='angle')setAng(w.o,v[0]);
      else if(w.prop==='ov')w.o.ov={color:rgbHex(v.slice(0,3)),a:Math.max(0,Math.min(255,Math.round(v[3])))};
      else w.o.color=rgbHex(v);
      if(w.first){const f=w.first;w.first=null;f();}
      if(k>=1){tweens.delete(key);w.res();}
    }
  }
  const easeOf=(c,env)=>{if(!c.easeExpr)return null;const v=String(ev(c.easeExpr,env)),f=EASES[v.toLowerCase()];if(!f)throw rt(EASE_BAD(v),c.easeExpr);return f;};
  const tweenMs=(c,env)=>{if(!c.forExpr)return 0;const ms=ev(c.forExpr,env);if(ms<0)throw rt(`바뀌는 시간은 0 이상이어야 합니다 (받은 값: ${ms})`,c.forExpr);return ms;};
  // 부모-자식: 부모가 움직인 만큼 자식(과 그 자식)도 같이 움직임. 자식은 따로도 움직일 수 있음
  const kids=new Map();   // 부모 id → 자식 id Set
  const links=new Map();   // dis.setLink: id → 묶인 오브젝트 id 들 (양쪽 다) — 부모 · 자식과 상관없이 같이 움직임
  function shiftKids(id,dx,dy,seen){
    const ks=kids.get(id),fw=links.get(id);if((!ks&&!fw)||(dx===0&&dy===0))return;
    seen=seen||new Set([id]);
    const mv=k=>{
      if(seen.has(k))return;seen.add(k);
      const c=objects.get(k);if(!c)return;
      c.pos.d[0]+=dx;c.pos.d[1]+=dy;shiftKids(k,dx,dy,seen);
    };
    if(ks)for(const k of ks)mv(k);
    if(fw)for(const k of fw)mv(k);
  }
  function unlinkAll(id){const L=links.get(id);if(!L)return;for(const k of L){const o=links.get(k);if(o){o.delete(id);if(!o.size)links.delete(k);}}links.delete(id);}
  function setLink(c,env){   // dis.setLink("id1", "id2") — 묶인 것끼리는 이어서 다 같이 (a-b, b-c → a b c)
    const a=objOf(idArg(c,0,env),c),bid=String(ev(c.args[1],env));
    if(!bid){unlinkAll(a.id);return;}   // "" = a 를 묶음에서 뺌
    const b=objOf(bid,c.args[1]);
    if(a===b)throw rt(`오브젝트를 자기 자신과 묶을 수는 없습니다 ('${a.id}')`,c);
    for(const [x,y] of [[a.id,b.id],[b.id,a.id]]){if(!links.has(x))links.set(x,new Set());links.get(x).add(y);}
  }
  // o 를 da 도 더 돌림 — 같이 움직이는 것(자식 · setLink 묶음과 그 자식 …)도 한 덩어리로 같이 돎
  // 피벗: setLink 로 묶여 있으면 묶음 오브젝트들 피벗(위치)의 가운데, 아니면 o 의 위치 (자식은 부모 피벗을 축으로)
  function rotGroup(o,da){
    if(!da)return;
    let px=o.pos.d[0],py=o.pos.d[1];
    if(links.has(o.id)){
      const g=new Set([o.id]),st=[o.id];
      while(st.length){const L=links.get(st.pop());if(L)for(const x of L)if(!g.has(x)&&objects.has(x)){g.add(x);st.push(x);}}
      px=0;py=0;for(const k of g){const m=objects.get(k);px+=m.pos.d[0];py+=m.pos.d[1];}px/=g.size;py/=g.size;
    }
    const seen=new Set([o.id]),all=[o];
    const walk=id=>{for(const S of [kids.get(id),links.get(id)])if(S)for(const k of S)if(!seen.has(k)){seen.add(k);const m=objects.get(k);if(m){all.push(m);walk(k);}}};
    walk(o.id);
    const r=da*D2R,c=Math.cos(r),sn=Math.sin(r);
    for(const m of all){const x=m.pos.d[0]-px,y=m.pos.d[1]-py;m.pos.d[0]=px+x*c-y*sn;m.pos.d[1]=py+x*sn+y*c;m.angle=(m.angle||0)+da;}
  }
  function setAng(o,a){rotGroup(o,a-(o.angle||0));o.angle=a;}
  function uiTree(o){o.ui=true;const ks=kids.get(o.id);if(ks)for(const k of ks){const c=objects.get(k);if(c&&!c.ui)uiTree(c);}}   // can.setUi: 자식도 같이
  function movePos(o,x,y){const dx=x-o.pos.d[0],dy=y-o.pos.d[1];o.pos.d[0]=x;o.pos.d[1]=y;shiftKids(o.id,dx,dy);}
  const isAncestor=(a,b)=>{for(let x=objects.get(b),n=0;x&&x.parent&&n<1000;x=objects.get(x.parent),n++)if(x.parent===a)return true;return false;};
  // 콜라이더(AABB) 충돌: 묶인(setAnchor) 오브젝트는 움직이지 않는 벽·바닥
  // 충돌하면 밀려나는 물체인가: 묶어둔(setAnchor) 것 · moveObj 로 옮기는 중인 것 · 멈춰 있는 보이지 않는 콜라이더(벽 · 바닥)는 안 밀림
  const pushable=o=>!o.anchored&&!anims.has(o.id)&&!(o.kind==='none'&&o.vel.d[0]===0&&o.vel.d[1]===0&&!o.col.grav);
  function animBlock(o){const a=anims.get(o.id);if(!a)return;anims.delete(o.id);a.res();if(a.first){const f=a.first;a.first=null;f();}}   // moveObj 이동을 부딪힌 자리에서 끝냄
  // 콜라이더(AABB) 충돌 — x 로 정렬해 겹칠 수 있는 짝만 검사 (오브젝트가 많아도 빠름)
  let colBuf=[];
  function collide(cs){
    const n=cs.length;if(n<2)return;
    const L=colBuf;L.length=n;
    for(let i=0;i<n;i++){
      const o=cs[i];let cx,ex;
      if(o.angle){const B=obb(o,o.col);cx=B.x;ex=B.hx*Math.abs(B.c)+B.hy*Math.abs(B.s);}   // 돌아간 콜라이더: 그 상자를 감싸는 x 범위
      else{cx=o.pos.d[0]+o.col.off[0];ex=Math.abs(o.col.size[0])/2;}
      L[i]={o,x0:cx-ex,x1:cx+ex,d:pushable(o)||(!o.anchored&&anims.has(o.id))};   // moveObj · setObjPos for 로 움직이는 중이어도 막힘
    }
    L.sort((p,q)=>p.x0-q.x0);
    for(let i=0;i<n;i++){
      const A=L[i],a=A.o;
      for(let k=i+1;k<n;k++){
        const B=L[k];if(B.x0>A.x1)break;   // 이 뒤로는 x 가 안 겹침
        if(!A.d&&!B.d)continue;
        const b=B.o;
        if((a.parent||b.parent)&&(isAncestor(a.id,b.id)||isAncestor(b.id,a.id)))continue;
        const lk=links.get(a.id);if(lk&&lk.has(b.id))continue;   // setLink 로 묶인 것끼리는 부딪히지 않음
        const da=A.d,db=B.d;
        let nx,ny,pen;
        if(a.angle||b.angle){   // 돌아간 콜라이더: 분리축
          const h=satHit(obb(a,a.col),obb(b,b.col),false);if(!h)continue;
          nx=h[0];ny=h[1];pen=h[2];
        }else{
          const ax=a.pos.d[0]+a.col.off[0],ay=a.pos.d[1]+a.col.off[1],bx=b.pos.d[0]+b.col.off[0],by=b.pos.d[1]+b.col.off[1];
          const dx=ax-bx,dy=ay-by;
          const px=(Math.abs(a.col.size[0])+Math.abs(b.col.size[0]))/2-Math.abs(dx);
          if(px<=0)continue;
          const py=(Math.abs(a.col.size[1])+Math.abs(b.col.size[1]))/2-Math.abs(dy);
          if(py<=0)continue;
          nx=px<py?(dx<0?-1:1):0;ny=px<py?0:(dy<0?-1:1);pen=px<py?px:py;   // b → a 방향
        }
        a.colN=b.colN=physN;a.colWith=b.id;b.colWith=a.id;   // isCollided · collidedObj
        const e=Math.max(a.col.e,b.col.e);
        const wa=da&&db?0.5:da?1:0,wb=da&&db?0.5:db?1:0;
        if(wa)movePos(a,a.pos.d[0]+nx*pen*wa,a.pos.d[1]+ny*pen*wa);
        if(wb)movePos(b,b.pos.d[0]-nx*pen*wb,b.pos.d[1]-ny*pen*wb);
        if(wa)animBlock(a);if(wb)animBlock(b);   // 움직이던 중 부딪히면 그 자리에서 이동 끝 (통과하지 않음)
        const va=a.vel.d,vb=b.vel.d;
        const rv=(va[0]-(db?vb[0]:0))*nx+(va[1]-(db?vb[1]:0))*ny;   // 다가오는 속도 (음수면 부딪힘)
        if(da&&!db){
          const vn=va[0]*nx+va[1]*ny;
          if(vn<0){let nv=-vn*e;if(nv<40)nv=0;va[0]+=(nv-vn)*nx;va[1]+=(nv-vn)*ny;}
        }else if(!da&&db){
          const vn=-(vb[0]*nx+vb[1]*ny);
          if(vn<0){let nv=-vn*e;if(nv<40)nv=0;vb[0]-=(nv-vn)*nx;vb[1]-=(nv-vn)*ny;}
        }else if(rv<0){
          const jj=-(1+e)*rv/2;
          va[0]+=jj*nx;va[1]+=jj*ny;vb[0]-=jj*nx;vb[1]-=jj*ny;
        }
      }
    }
  }
  // 트리거: 충돌은 없고, 다른 오브젝트가 경계나 안쪽에 닿으면 IsTrigged = 1, TriggedId = 닿은 오브젝트 id
  //   hold false: 닿아 있는 동안만 1 · hold true: 한 번 닿으면 obj.id.IsTrigged = 0; 으로 풀 때까지 1
  let trigOn=false;
  function boxOf(o){
    if(o.col)return [o.pos.d[0]+o.col.off[0],o.pos.d[1]+o.col.off[1],Math.abs(o.col.size[0])/2,Math.abs(o.col.size[1])/2];
    if(o.kind==='none')return null;
    if(o.kind==='text'){fitText(o);return [o.pos.d[0]+nudX(o),o.pos.d[1]+nudY(o),Math.abs(o.scale.d[0])/2,textH(o)/2];}
    return [o.pos.d[0]+nudX(o),o.pos.d[1]+nudY(o),Math.abs(o.scale.d[0])/2,Math.abs(o.scale.d[1])/2];
  }
  function checkTriggers(){
    if(!trigOn)return;
    for(const t of objects.values()){
      if(!t.trig||!live(t)||t.ui)continue;
      const tx=t.pos.d[0]+t.trig.off[0],ty=t.pos.d[1]+t.trig.off[1],tw=Math.abs(t.trig.size[0])/2,th=Math.abs(t.trig.size[1])/2;
      let TB=null;
      const touch=o=>{   // 닿음 (경계 포함) · 둘 중 하나라도 돌아가 있으면 분리축
        const b=boxOf(o);if(!b)return false;
        if(!t.angle&&!o.angle)return Math.abs(b[0]-tx)<=b[2]+tw&&Math.abs(b[1]-ty)<=b[3]+th;
        if(!TB)TB=obb(t,t.trig);
        const r=(o.angle||0)*D2R;
        return !!satHit(TB,o.col?obb(o,o.col):{x:b[0],y:b[1],hx:b[2],hy:b[3],c:Math.cos(r),s:Math.sin(r)},true);
      };
      let hit='';
      if(t.trigId&&objects.has(t.trigId)){   // 지금 닿아 있는 오브젝트가 계속 닿아 있으면 그대로
        if(live(objects.get(t.trigId))&&touch(objects.get(t.trigId)))hit=t.trigId;
      }
      if(!hit)for(const o of objects.values()){
        if(o===t||o.ui||(o.trig&&!o.col&&o.kind==='none')||!live(o)||isAncestor(o.id,t.id)||isAncestor(t.id,o.id))continue;
        if(touch(o)){hit=o.id;break;}   // 경계에 닿아도 포함
      }
      if(hit){t.isTrig=1;t.trigId=hit;}
      else if(!t.trig.hold){t.isTrig=0;t.trigId='';}
    }
  }
  function trigOf(o,n){if(!o.trig)throw rt(`'${o.id}' 은(는) 트리거가 아닙니다 (col.setTrigger 로 만든 오브젝트만)`,n);checkTriggers();return o;}
  const isActive=o=>!o.anchored&&(o.vel.d[0]!==0||o.vel.d[1]!==0||(o.col&&o.col.grav));
  function physTick(dt,kill){
    if(kill||halted||ctl.stop){
      sndStopAll();
      for(const a of anims.values())a.rej(halted||STOP);
      for(const w of tweens.values())w.rej(halted||STOP);
      anims.clear();tweens.clear();return false;
    }
    physN++;
    const now=performance.now();let any=tweens.size>0||animObjs.size>0,active=anims.size>0||tweens.size>0||animObjs.size>0;
    if(animObjs.size)animeStep(now);
    if(tweens.size){const tx=[];for(const w of tweens.values())if(w.o.kind==='text')tx.push(w.o);tweenStep(now);for(const o of tx)fitText(o);}   // 바뀐 글자만 다시 잼 (모든 오브젝트를 훑지 않음)
    if(anims.size)for(const [id,a] of [...anims]){   // 움직이는 오브젝트만 (틱마다 모든 오브젝트를 훑지 않음)
      const o=objects.get(id);if(!o){anims.delete(id);a.res();continue;}
      if(popStack.length&&!live(o))continue;   // 팝업 장면 때문에 멈춤
      const k=Math.min(1,(now-a.start)/a.ms),q=a.ease&&k<1?a.ease(k):k;   // ease: 시간 → 간 거리
      movePos(o,a.from[0]+(a.to[0]-a.from[0])*q,a.from[1]+(a.to[1]-a.from[1])*q);any=true;
      if(a.first){const f=a.first;a.first=null;f();}   // 시작됨
      if(k>=1){anims.delete(id);a.res();}
    }
    // 이번 프레임의 콜라이더 목록 · 나눌 횟수: 가장 빠른 물체가 한 번에 가장 작은 콜라이더 반 크기 이상 가지 않게 (빠른 물체가 뚫지 않음)
    const cs=[];let minH=Infinity,maxV=0;
    if(colOn)for(const o of objects.values())if(o.col&&live(o)&&!o.ui){cs.push(o);minH=Math.min(minH,Math.abs(o.col.size[0])/2||Infinity,Math.abs(o.col.size[1])/2||Infinity);}
    for(const o of objects.values())if(!o.anchored&&(o.vel.d[0]!==0||o.vel.d[1]!==0||(o.col&&o.col.grav))){
      const g=o.col&&o.col.grav?Math.abs(GRAVITY*gravScale)*dt:0;
      maxV=Math.max(maxV,Math.abs(o.vel.d[0])+Math.abs(o.vel.d[1])+g);
    }
    const steps=cs.length&&minH<Infinity?Math.min(16,Math.max(1,Math.ceil(maxV*dt/Math.max(1,minH)))):1,h=dt/steps;
    for(let st=0;st<steps;st++){
      let moved=false;
      for(const o of objects.values()){
        if(anims.has(o.id)||!isActive(o)||!live(o))continue;
        active=true;
        const v=o.vel.d;
        if(o.col&&o.col.grav)v[1]-=GRAVITY*gravScale*h;
        if(v[0]===0&&v[1]===0)continue;
        movePos(o,o.pos.d[0]+v[0]*h,o.pos.d[1]+v[1]*h);moved=true;
      }
      if(cs.length>1&&(moved||st===0))collide(cs);
      any=any||moved;
    }
    if(camOn&&camFollow()){any=true;active=true;}   // 오브젝트를 따라가는 카메라
    if(any||anims.size)checkTriggers();
    if(any&&io.dis&&io.dis.draw)drawPend=true;   // 그리기는 화면 프레임에 한 번 (틱마다 그리지 않음 · hubFlush 가 그림)
    if(snd.timer&&now-spatT>=16){spatT=now;spatial();}
    return active;
  }
  // 내부 작업 (움직임 · 물리 · tween · 애니메이션 · 카메라 · 트리거): 화면 주사율과 따로 기본 250 tps (4ms 틱) 고정 간격
  //   타이머가 깨어날 때마다 밀린 시간만큼 틱을 몰아서 처리 · 화면은 주사율대로 최신 상태만 그림
  const TPS=250,TICK_MS=1000/TPS;
  let tickAcc=0,inTick=false,spatT=0;
  function tickCatch(){   // 밀린 시간만큼 틱 처리 — 움직이는 것이 없거나 멈추면 false
    if(disOn&&io.dis&&io.dis.isOpen&&!io.dis.isOpen()){physTick(0,true);return false;}   // 화면을 닫음 → 멈춤
    const now=performance.now();let el=now-physLast;physLast=now;
    if(el>250)el=250;   // 탭이 가려졌다 돌아온 경우 등 — 너무 밀린 시간은 버림
    tickAcc+=el;inTick=true;
    try{
      let n=0;
      while(tickAcc>=TICK_MS){
        tickAcc-=TICK_MS;
        if(physTick(TICK_MS/1000)===false){tickAcc=0;return false;}
        if(++n*TICK_MS>=250){tickAcc=0;break;}   // 한 번에 0.25초 어치까지
      }
    }finally{inTick=false;}
    return true;
  }
  function tickEnd(){if(physT!==null){clearTimeout(physT);physT=null;}}
  function tickRun(){   // 화면 프레임 사이: 타이머로 (브라우저가 바빠서 늦어도 다음 화면 프레임에서 따라잡음)
    physT=null;
    if(!tickCatch()){tickEnd();return;}
    physT=setTimeout(tickRun,TICK_MS);
  }
  function physStart(){
    if(physT!==null||inTick)return;
    physLast=performance.now();tickAcc=0;
    physT=setTimeout(tickRun,TICK_MS);
    if(io.dis&&io.dis.draw)hubKick();   // 화면 프레임마다 따라잡아 그림
  }
  function physStop(){   // 화면이 없을 때만: 프로그램이 끝나면 멈춤 (화면이 열려 있으면 닫거나 ■ 정지할 때까지 계속 움직임)
    if(io.dis&&io.dis.setTicker)return;
    if(physT===null)return;
    tickEnd();
    for(const a of anims.values())a.rej(halted||STOP);
    for(const w of tweens.values())w.rej(halted||STOP);
    anims.clear();tweens.clear();
  }
  function keepRel(old,o){   // 같은 id 로 다시 만들 때: 부모 · 콜라이더 · 묶음 유지, 자식은 같이 이동
    if(old){
      o.parent=old.parent;o.col=old.col;o.anchored=old.anchored;o.trig=old.trig;o.isTrig=old.isTrig;o.trigId=old.trigId;o.insts=old.insts;o.layer=old.layer;o.tags=old.tags;o.alpha=old.alpha;o.ov=old.ov;o.glow=old.glow;o.off=old.off;o.scenes=old.scenes;o.texture=old.texture;o.angle=old.angle;o.colN=old.colN;o.colWith=old.colWith;o.an=old.an;if(o.an)animObjs.add(o);o.ui=old.ui;o.nud=old.nud;o.btn=old.btn;o.btnSeen=old.btnSeen;o.relSeen=old.relSeen;o.bst=old.bst;   // 버튼도 그대로
      shiftKids(o.id,o.pos.d[0]-old.pos.d[0],o.pos.d[1]-old.pos.d[1]);
    }
    if(o.col)physKick(o);
    return o;
  }
  const velNew=old=>old&&old.vel?old.vel:{r:1,c:2,d:[0,0]};   // 같은 id 로 다시 만들어도 속도는 유지
  let colOn=false;   // 콜라이더가 하나라도 있으면 충돌 검사
  let gravScale=1;   // col.setGravity(f): 1 = 980 px/초², 0 = 무중력, 음수 = 위쪽
  const physKick=o=>{if(isActive(o))physStart();};
  const sameMat=(a,b)=>a&&b&&a.r===b.r&&a.c===b.c&&a.d.every((v,i)=>v===b.d[i]);
  // 값이 실제로 바뀐 때만 다시 그림
  function setMat(o,key,m){
    if(sameMat(o[key],m))return;
    if(key==='pos')movePos(o,m.d[0],m.d[1]);else o[key]=matCopy(m);
    redraw();
  }
  function textOf(o,n){if(o.kind!=='text')throw rt(`'${o.id}' 은(는) 글자 오브젝트가 아니라 Text 가 없습니다 (dis.setText 로 만든 오브젝트만)`,n);return o.text;}
  const bg=new Set();   // setup() 으로 같이 실행 중인 작업
  let disOn=false;
  const slotOf=(info,name,env,n)=>info&&info.kind==='public'?pub.get(name):info&&info.kind==='pvar'?pslot(name,env,n):env.get(name);
  function pslot(name,env,n){   // 부모 → 그 부모 … 순서로, 귀속된 파일의 최상위 변수를 찾음
    if(env.self===null)throw rt(`부모 변수 '${name}' 은(는) 오브젝트에 귀속되어 실행될 때만 쓸 수 있습니다`,n);
    const me=objects.get(env.self);
    for(let pid=me&&me.parent,k=0;pid&&k<256;k++){
      const po=objects.get(pid);if(!po)break;
      const sl=instSlot(po,name);if(sl)return sl;
      pid=po.parent;
    }
    throw rt(`'${name}' 을(를) 찾을 수 없습니다 — 부모 오브젝트들에 귀속된 파일에 이 변수가 없습니다 (지금 부모: ${me&&me.parent?me.parent:'없음'})`,n);
  }
  let depth=0,taskDepth=0,halted=null;
  const dc0={n:0};   // run 밖(라이브러리 변수 초기화 등)에서 부른 함수의 호출 깊이
  const dcOf=env=>{for(let e=env;e;e=e.p)if(e.dc)return e.dc;return dc0;};   // 함수 호출 깊이 — run(task) 마다 따로 셈   // halted: 한 run 에서 terminate/오류가 나면 나머지 run 도 멈춤
  // 동기 우선 실행: 문장은 바로 실행하고, 기다려야 할 때(wait · moveObj · sendto …)만 Promise 를 돌려줌.
  // 반복문은 512번마다 시간을 보고 30ms 가 넘으면 한 번 화면에 양보 (■ 정지 · 화면 갱신이 계속 동작)
  let ops=0;
  const yieldNow=()=>new Promise(r=>setTimeout(r,0)).then(()=>{ctl.last=performance.now();if(halted)throw halted;if(ctl.stop)throw STOP;});
  // 화면이 켜져 있으면: 한 프레임에 6ms 까지만 계속 돌고 다음 프레임으로 (화면 · 물리가 매 프레임 그려지게)
  // 대기 없이 계속 도는 반복은 화면 프레임을 기다리지 않고 잠깐만 양보 (실행 속도는 화면 주사율에 묶이지 않음)
  const mch=typeof MessageChannel==='function'&&typeof document!=='undefined'?new MessageChannel():null,mchQ=[];
  if(mch)mch.port1.onmessage=()=>{const f=mchQ.shift();if(f)f();};
  const yieldFrame=()=>new Promise(r=>{if(mch){mchQ.push(r);mch.port2.postMessage(0);}else setTimeout(r,0);}).then(()=>{ctl.last=performance.now();if(halted)throw halted;if(ctl.stop)throw STOP;});
  function slice(){
    if(halted)throw halted;
    if(ctl.stop)throw STOP;
    if(++ops<(disOn?128:512))return;
    ops=0;
    if(syncDepth>0){
      if(performance.now()-syncStart>8000)throw rt('값을 돌려주는 함수가 8초 넘게 끝나지 않습니다 (무한 반복?)',syncNode);
      return;
    }
    const busy=performance.now()-ctl.last;
    if(disOn){   // 화면 프레임을 기다리지 않음 — 4ms 마다 잠깐 양보해서 입력 · 그리기 · 내부 틱이 끼어들게 (실행 속도는 주사율과 무관)
      if(busy>4)return yieldFrame();
    }
    else if(busy>30)return yieldNow();
  }
  async function sleep(ms,tk,env){
    let end=performance.now()+Math.max(0,ms|0),last=performance.now();
    let waited=false;   // 0 이하여도 최소 한 번은 setTimeout 으로 브라우저에 양보 (정지 버튼 · 화면이 계속 동작)
    for(;;){
      if(halted)throw halted;
      if(ctl.stop)throw STOP;
      if(tk&&tk.dead)throw tk;
      {const now=performance.now();if(frozenEnv(tk,env))end+=now-last;last=now;}   // 팝업 장면이 열려 멈춘 동안은 남은 시간이 줄지 않음
      const rem=end-performance.now();if(rem<=0&&waited)break;
      await new Promise(r=>setTimeout(r,Math.max(0,Math.min(rem,50))));waited=true;
    }
    ctl.last=performance.now();   // 실제로 기다린 뒤에만 갱신
  }
  function ev(e,env){
    switch(e.k){
      case 'num':case 'str':return e.v;
      case 'bool':return e.v?1:0;
      case 'id':return slotOf(e.info,e.name,env,e).v;
      case 'mat':{
        if(e.asList){const it=e.rows[0].map(x=>own(ev(x,env)));return e.comp?{items:it,comp:true}:{items:it};}
        const m=matNew(e.dims[0],e.dims[1]);let k=0;
        for(const row of e.rows)for(const x of row)m.d[k++]=+ev(x,env);
        return m;
      }
      case 'idx':{
        if(e.j===null){   // 리스트 항목
          const L=ev(e.base,env);
          if(e.anyBase&&(typeof L!=='object'||!L.items))throw rt(`[번호] 는 리스트 · compound 에만 쓸 수 있습니다 (값: ${kindTxt(L)})`,e);
          const v=L.items[lix(ev(e.i,env),L,e)];
          return e.chk?dynChk(v,e.chk,e):v;
        }
        const m=ev(e.base,env);
        if(e.anyBase&&(typeof m!=='object'||!m.d))throw rt(`[행, 열] 은 행렬에만 쓸 수 있습니다 (값: ${kindTxt(m)})`,e);
        return m.d[ix(ev(e.i,env),m.r,'행',e)*m.c+ix(ev(e.j,env),m.c,'열',e)];
      }
      case 'call':{   // 수학 함수 · 값을 돌려주는 함수 · 리스트.find
        if(e.lfind){const L=ev(e.lnode,env),x=ev(e.args[0],env);return (typeof x==='object'||L.comp?L.items.findIndex(y=>deepEq(y,x)):L.items.indexOf(x))+1;}
        if(e.canKey)return keyOn(ev(e.args[0],env));
        if(e.fileEx){   // 프로젝트 기준 (./ ../ 는 이 파일 기준) · 이번 실행에서 genJson 으로 만든 파일도 · 폴더면 안에 파일이 있을 때
          const path=resolveTaskPath(String(ev(e.args[0],env)),e.file);
          if(!path)return 0;
          if(jsonOut.has(path)||Object.hasOwn(prog.files,path))return 1;
          const pre=path+'/';for(const k of jsonOut.keys())if(k.startsWith(pre))return 1;
          for(const k in prog.files)if(k.startsWith(pre))return 1;
          return 0;
        }
        if(e.strf)return hget(STRF,e.strf).f(...e.args.map(a=>ev(a,env)));
        if(!e.math)return callValue(e,env);
        const xs=e.args.map(a=>ev(a,env)),v=hget(MATH,e.math).f(...xs);
        if(!Number.isFinite(v))throw rt(`${e.math}(${xs.map(x=>fmtVal(x,'float')).join(', ')}) 은(는) 계산할 수 없습니다 (범위를 벗어난 값)`,e);
        return e.ty==='int'?(v|0):v;
      }
      case 'objprop':{
        const o=objT(e,env);if(o.kind==='text')fitText(o);
        if(e.key==='istrig')return trigOf(o,e).isTrig;
        if(e.key==='trigid')return trigOf(o,e).trigId;
        if(e.key==='anifr')return o.an?o.an.k+1:-1;   // 지금 보이는 애니메이션 프레임 (1 부터) · 재생 중이 아니면 -1
        if(e.key==='iscol')return o.col&&o.colN===physN?1:0;   // 콜라이더가 없으면 0 · ""
        if(e.key==='colid')return o.col&&o.colWith||'';
        return e.key==='color'?o.color:e.key==='text'?textOf(o,e):o[e.key];
      }
      case 'objkeep':{
        const o=curObj||(env.self!==null?selfObj(env,e):null);
        if(!o)throw rt(prog.tasks.get(e.file)&&prog.tasks.get(e.file).bound?`obj.${e.name} 처럼 id 없이 쓰려면 이 실행이 오브젝트에 귀속되어 있어야 합니다 — 아직 귀속되지 않았습니다 (dis.BelongObj("id"); 줄을 먼저 실행하세요)`:`obj.${e.name} 은(는) 이미 있는 오브젝트를 바꿀 때만 쓸 수 있습니다`,e);
        if(o.kind==='text')fitText(o);
        return o[e.key[0]].d[e.key[1]];
      }
      case 'objvar':return ovSlot(e,env).v;
      case 'canobj':{   // isMouseTouched: 마우스(터치)가 오브젝트 위에 있으면 1 · IsButtonClicked: 버튼을 눌렀다 뗐으면 1
        const o=e.id===null?selfObj(env,e):objOf(e.id,e);
        if(e.btn){
          if(!o.btn)throw rt(`'${o.id}' 은(는) 버튼이 아닙니다 (먼저 can.setasButton("${o.id}");)`,e);
          if(!io.dis||!io.dis.clicks||!live(o))return 0;
          if(o.kind==='text')fitText(o);
          const now=performance.now();
          if(e.btn==='push'){   // 누르고 있는 동안 1 (아주 짧게 눌러도 1 프레임은 1)
            if(io.dis.ptrLog){   // 누르고 있는 손가락이 버튼 위에 있으면 1 (밖에서 누르고 들어와도 · 나갔다 다시 들어와도 1)
              btnTrack(o);for(const v of o.bst.held.values())if(v===true)return 1;
            }
            else if(io.dis.pointers)for(const q of io.dis.pointers()){const w=toW(q[0],q[1]);if(inObj(o,w[0],w[1]))return 1;}
            const fn=fno();for(const k of io.dis.clicks()){if(fn<=k.f+1&&(k.df==null||k.f-k.df<=1)){const d=toW(k.dx,k.dy);if(inObj(o,d[0],d[1]))return 1;}}   // 짧게 누른 것만 (꾹 누르다 뗀 뒤에는 0)
            return 0;
          }
          if(e.btn==='rel'){   // 버튼을 누르던 손가락을 뗐거나 버튼 밖으로 나간 순간 1 (한 번만)
            if(io.dis.ptrLog){
              btnTrack(o);const q=o.bst.rel;
              while(q.length&&now-q[0]>500)q.shift();   // 0.5초 지나면 버림
              if(q.length){q.shift();return 1;}
              return 0;
            }
            for(const k of io.dis.clicks()){
              if(k.t<=(o.relSeen||0)||now-k.t>500)continue;
              const d=toW(k.dx,k.dy);
              if(inObj(o,d[0],d[1])){o.relSeen=k.t;return 1;}
            }
            return 0;
          }
          for(const k of io.dis.clicks()){   // 오래된 것부터 · 한 번 알린 클릭은 다시 알리지 않음 · 0.5초 지나면 버림
            if(k.t<=o.btnSeen||now-k.t>500)continue;
            const d=toW(k.dx,k.dy),u=toW(k.ux,k.uy);
            if(inObj(o,d[0],d[1])&&inObj(o,u[0],u[1])){o.btnSeen=k.t;return 1;}
          }
          return 0;
        }
        if(!io.dis||!io.dis.mouseIn||!io.dis.mouseIn()||!live(o))return 0;
        if(o.kind==='text')fitText(o);
        const m0=io.dis.mouse(),m=toW(m0[0],m0[1]);return inObj(o,m[0],m[1])?1:0;
      }
      case 'member':
        if(e.lnode)return ev(e.lnode,env).items.length;
        if(e.mod===CAN_ID){   // can.ScreenClicked · can.MouseX · can.MouseY · can.SceneName
          if(e.name==='SceneName')return sceneOn?sceneNameOf.get(curScene)||'':'';
          if(!io.dis)return 0;
          if(e.name==='ScreenClicked')return io.dis.clicked?io.dis.clicked():0;
          const m0=io.dis.mouse?io.dis.mouse():[0,0],m=toW(m0[0],m0[1]);return e.name==='MouseX'?m[0]:m[1];   // 카메라가 있으면 세계 좌표
        }
        if(e.mod===DIS_ID){if(!disOn||!io.dis)return 0;const z=io.dis.size();return e.name==='idWidthmode'?(z[0]>=z[1]?1:0):e.name==='displayX'?z[0]:z[1];}
        if(e.info&&e.info.kind==='public')return pub.get(e.name).v;
        return envs.get(e.mod).m.get(e.name).v;
      case 'un':{const v=ev(e.e,env);return e.op==='!'?(v===0?1:0):(e.ty==='int'?(-v)|0:-v);}
      case 'bin':{
        const op=e.op;
        if(e.ty==='any'){   // 리스트 항목 + : 문자열이 있으면 이어 붙이고, 아니면 더함
          const a=ev(e.l,env),b=ev(e.r,env);let v;
          if(typeof a==='string'||typeof b==='string')v=fmtVal(a,e.l.ty)+fmtVal(b,e.r.ty);
          else if(typeof a==='object'||typeof b==='object')throw rt(`행렬 · 리스트 항목에는 '+' 를 쓸 수 없습니다 (문자열과 이어 붙이기만 됨)`,e);
          else v=a+b;
          return e.chk?dynChk(v,e.chk,e):v;
        }
        if(op==='&&')return (ev(e.l,env)!==0&&ev(e.r,env)!==0)?1:0;
        if(op==='||')return (ev(e.l,env)!==0||ev(e.r,env)!==0)?1:0;
        const a=ev(e.l,env),b=ev(e.r,env),isI=e.ty==='int';
        switch(op){
          case '+':return e.ty==='string'?fmtVal(a,e.l.ty)+fmtVal(b,e.r.ty):isI?(a+b)|0:a+b;
          case '-':return isI?(a-b)|0:a-b;
          case '*':return isI?Math.imul(a,b):a*b;
          case '/':
            if(isI){if(b===0)throw rt('0으로 나눌 수 없습니다',e);return Math.trunc(a/b)|0;}
            return a/b;
          case '%':if(b===0)throw rt('0으로 나눈 나머지는 구할 수 없습니다',e);return a%b;
          case '==':return a===b||(typeof a==='object'&&deepEq(a,b))?1:0;
          case '!=':return a===b||(typeof a==='object'&&deepEq(a,b))?0:1;
          case '<':return a<b?1:0;
          case '>':return a>b?1:0;
          case '<=':return a<=b?1:0;
          case '>=':return a>=b?1:0;
        }
      }
    }
  }
  // 버튼: 누르고 있는 손가락이 버튼 위에 있으면 누름 (어디서 눌렀든 · 다시 들어와도) — 누른 채 밖으로 나가는 순간 · 버튼 위에서 떼는 순간 뗀 것으로 기록 (o.bst.rel)
  //   held: 포인터 id → true (버튼 위) / false (버튼 밖)
  function btnTrack(o){
    const st=o.bst||(o.bst={s:0,held:new Map(),rel:[]}),lv=live(o);
    const inside=(x,y)=>{if(!lv)return false;const w=toW(x,y);return inObj(o,w[0],w[1]);};
    const L=io.dis.ptrLog();let i0=L.length;while(i0>0&&L[i0-1].s>st.s)i0--;   // 아직 안 본 기록부터 (처음부터 다 훑지 않음)
    for(let i=i0;i<L.length;i++){
      const ev=L[i];st.s=ev.s;
      if(ev.t<=o.relSeen)continue;   // setasButton 전의 기록
      const was=st.held.get(ev.id)||false,now=inside(ev.x,ev.y);
      if(ev.k==='d')st.held.set(ev.id,now);
      else if(ev.k==='m'){if(was&&!now)st.rel.push(ev.t);st.held.set(ev.id,now);}
      else{if(was)st.rel.push(ev.t);st.held.delete(ev.id);}
    }
    const cur=new Set();   // 손가락은 그대로인데 버튼이 움직이거나 꺼져서 밖이 된 경우
    for(const [id,x,y] of io.dis.ptrNow()){
      cur.add(id);const now=inside(x,y);
      if(st.held.get(id)&&!now)st.rel.push(performance.now());
      st.held.set(id,now);
    }
    for(const id of [...st.held.keys()])if(!cur.has(id))st.held.delete(id);
  }
  // 귀속 (dis.BelongObj) — 오브젝트가 생길 때 귀속된 파일을 그 오브젝트 기준으로 실행
  const rid=v=>v===''&&selfNow!==null?selfNow:v;   // id 란이 비어 있으면 자기 자신
  const idArg=(c,k,env)=>idOvNode===c.args[k]?idOv:rid(ev(c.args[k],env));
  // id 란에 "<태그>" → 그 태그가 붙은 오브젝트마다 같은 명령 (만든 순서) · 기다리는 명령은 모두 끝날 때까지
  function forTag(c,env,k,v){
    if(!objOn)throw rt(NOOBJ,c);
    if(c.target.name==='getVar')throw rt(`getVar 는 오브젝트 하나만 읽습니다 — 태그 ${v} 는 쓸 수 없습니다`,c);
    const tag=v.slice(1,-1),list=[...objects.values()].filter(o=>o.tags&&o.tags.has(tag)),ps=[];
    const pn=idOvNode,pv=idOv;
    try{
      for(const o of list){
        if(objects.get(o.id)!==o)continue;   // 앞에서 지워졌으면 건너뜀
        idOvNode=c.args[k];idOv=o.id;
        const r=callFn(c,env);if(r)ps.push(r);
      }
    }finally{idOvNode=pn;idOv=pv;}
    if(ps.length)return Promise.all(ps).then(()=>{});
  }
  // ---- soundMaster ----
  const snd={ctx:null,bufs:new Map(),spk:new Map(),timer:null};
  function actx(){
    if(!snd.ctx){const AC=globalThis.AudioContext||globalThis.webkitAudioContext;if(!AC)return null;try{snd.ctx=new AC();}catch(e){return null;}}
    if(snd.ctx.state==='suspended')snd.ctx.resume().catch(()=>{});
    return snd.ctx;
  }
  // 디코드한 긴 소리 (20 초 이상 · 배경 음악) 는 모두 합쳐 SND_CAP 초까지만 메모리에 둠 — 넘으면 가장 오래 안 쓴 것부터 버림 (재생 중인 것은 남김 · 다시 쓰면 그때 다시 디코드)
  const SND_LONG=20,SND_CAP=300;
  function sndTrim(keep){
    let tot=0;for(const x of snd.bufs.values())if(x.buf&&x.buf.duration>=SND_LONG)tot+=x.buf.duration;
    if(tot<=SND_CAP)return;
    for(const [pth,x] of snd.bufs){
      if(tot<=SND_CAP)break;
      if(pth===keep||!x.buf||x.buf.duration<SND_LONG||x.live>0)continue;
      tot-=x.buf.duration;snd.bufs.delete(pth);
    }
  }
  function sndBuf(path){   // 경로 → 디코드한 소리 (처음 쓸 때 읽음)
    let e=snd.bufs.get(path);if(e){snd.bufs.delete(path);snd.bufs.set(path,e);return e;}   // 최근에 쓴 것을 맨 뒤로 (sndTrim 이 앞에서부터 버림)
    e={buf:null,p:null,live:0};snd.bufs.set(path,e);
    const c=actx(),data=prog.files[path];
    if(c&&data)e.p=jbDataBuf(data).then(a=>c.decodeAudioData(a)).then(b=>{e.buf=b;sndTrim(path);return b;},()=>{if(!halted)halted=new JBError(`소리 파일 '${path}' 을(를) 읽지 못했습니다 (손상되었거나 이 브라우저가 지원하지 않는 형식)`,0,'');return null;});
    else e.p=Promise.resolve(null);
    return e;
  }
  function spkOf(id,n){const k=snd.spk.get(id);if(!k)throw rt(`스피커 '${id}' 이(가) 없습니다 (sou.setSpeaker("${id}"); 로 먼저 만드세요)`,n);return k;}
  function sndPath(fid,n){
    const path=imgAlias.get(fid);
    if(!path||!AUD_RE.test(path))throw rt(`'${fid}' 은(는) 소리 이름이 아닙니다 (mag.importFile("소리.wav") save as ("${fid}"); 로 먼저 이름을 붙이세요)`,n);
    return path;
  }
  function spkNodes(k){   // 스피커: 볼륨 → 공간(거리 · 좌우) → 출력
    if(k.vol)return true;
    const c=actx();if(!c)return false;
    k.vol=c.createGain();k.space=c.createGain();
    k.pan=c.createStereoPanner?c.createStereoPanner():null;
    k.vol.gain.value=k.v/255;
    k.vol.connect(k.space);
    if(k.pan){k.space.connect(k.pan);k.pan.connect(c.destination);}else k.space.connect(c.destination);
    spatial();return true;
  }
  // 소리 하나 재생: ms 동안 (0 이하 = 끝까지) · loops 번 (0 = 무한) · 페이드 인/아웃
  function sndPlay(k,path,ms,loops,part){   // part = [시작 ms, 끝 ms (음수 = 끝까지)] → 그 구간만 무한 반복
    if(!spkNodes(k))return;
    const e=sndBuf(path),gen=k.gen;
    const go=b=>{
      if(!b||halted||ctl.stop||k.gen!==gen)return;
      const c=snd.ctx,src=c.createBufferSource(),g=c.createGain(),t0=c.currentTime;
      src.buffer=b;src.connect(g);g.connect(k.vol);
      let len=loops>0||loops===-1?(loops===-1?b.duration:b.duration*loops):Infinity,off=0;   // -1 = 한 번 (playSfx)
      if(part){   // sou.repeatPart: 시작 ~ 끝 구간 반복
        const a=part[0]/1000,e=part[1]<0?b.duration:Math.min(b.duration,part[1]/1000);
        if(a>=e)return;
        src.loop=true;src.loopStart=a;src.loopEnd=e;off=part[2]?0:a;len=Infinity;   // introPart: 처음부터 재생한 뒤 그 구간 반복
      }else if(loops!==-1){src.loop=true;}
      if(ms>0)len=Math.min(len,ms/1000);
      const fi=k.fin/1000,fo=k.fout/1000;
      if(fi>0){g.gain.setValueAtTime(0,t0);g.gain.linearRampToValueAtTime(1,t0+Math.min(fi,len===Infinity?fi:len));}
      if(len!==Infinity){
        if(fo>0&&len>fo){g.gain.setValueAtTime(1,t0+Math.max(fi,len-fo));g.gain.linearRampToValueAtTime(0,t0+len);}
        src.start(t0);src.stop(t0+len);
      }else src.start(t0,off);
      const v={src,g,k};k.voices.add(v);SND_LIVE.add(v);e.live++;
      src.onended=()=>{k.voices.delete(v);SND_LIVE.delete(v);e.live--;};
    };
    if(e.buf)go(e.buf);else e.p.then(go);
  }
  function sndBreak(k,noFade){   // 스피커의 소리를 모두 끔 — 페이드 아웃을 따름
    k.gen++;
    const c=snd.ctx;
    for(const v of k.voices){
      try{
        if(!noFade&&k.fout>0&&c){const t=c.currentTime;v.g.gain.cancelScheduledValues(t);v.g.gain.setValueAtTime(v.g.gain.value,t);v.g.gain.linearRampToValueAtTime(0,t+k.fout/1000);v.src.stop(t+k.fout/1000);}
        else v.src.stop();
      }catch(e){}
    }
  }
  // 공간 음향: 오브젝트에 귀속된 스피커 — 화면(카메라) 가운데에서 멀수록 작게, 좌우로 나뉨 · 오브젝트가 없거나 꺼지면 바로 무음 (페이드 없음)
  function spatial(){
    let any=false;
    const cam=camNow(),z=cam?cam.z:1,cx=cam?cam.x:0,cy=cam?cam.y:0;
    const sz=io.dis&&io.dis.size?io.dis.size():[800,600],hw=Math.max(1,(sz[0]||800)/2/z);
    for(const k of snd.spk.values()){
      if(!k.space)continue;
      let g=1,pn=0;any=true;
      const so=objects.get(k.oid);
      if(!so||!live(so)||(k.obj&&!objects.has(k.obj)))g=0;   // 스피커가 지워졌거나 · 꺼졌거나 · 지금 장면에 없거나 · 귀속된 오브젝트가 없으면 무음 (페이드 없음)
      else if(k.obj){const dx=so.pos.d[0]-cx,dy=so.pos.d[1]-cy,d=Math.hypot(dx,dy)/hw;g=1/(1+d*d);pn=Math.max(-1,Math.min(1,dx/hw));}   // 공간 음향
      if(k.space.gain.value!==g)k.space.gain.value=g;
      if(k.pan&&k.pan.pan.value!==pn)k.pan.pan.value=pn;
    }
    if(any&&!snd.timer)snd.timer=setInterval(()=>{if(halted||ctl.stop){clearInterval(snd.timer);snd.timer=null;return;}spatial();},33);
    if(!any&&snd.timer){clearInterval(snd.timer);snd.timer=null;}
  }
  // ---- SeongBin: 카메라 ----
  let camOn=false;const camMain=new Map(),camOrder=[];   // 장면 → 메인 카메라 id · 만든 순서
  const sceneKey=()=>sceneOn?curScene:0;
  function camNow(){   // 지금 장면에서 쓰는 카메라 {x, y, z} — setMainCamas 로 고른 것, 없으면 cam.default
    if(!camOn)return null;
    let o=objects.get(camMain.get(sceneKey()));
    if(!o||!live(o))o=objects.get('cam.default');
    return o?{x:o.pos.d[0],y:o.pos.d[1],z:o.zoom||1}:null;
  }
  function camDefault(){   // 장면에 들어갈 때마다 새 cam.default (가운데 [0, 0] · 배율 1 · 모든 장면에 있음)
    if(!camOn)return;
    let o=objects.get('cam.default');
    if(!o){o={id:'cam.default',kind:'none',cam:true,zoom:1,pos:{r:1,c:2,d:[0,0]},scale:{r:1,c:2,d:[0,0]},color:'#000',vel:{r:1,c:2,d:[0,0]}};objects.set(o.id,o);camOrder.unshift(o.id);}
    const a=anims.get(o.id);if(a){anims.delete(o.id);a.res();if(a.first){const f=a.first;a.first=null;f();}}
    o.zoom=1;delete o.follow;o.scenes=new Set(['*']);movePos(o,0,0);
  }
  const toW=(x,y)=>{const c=camNow();return c?[c.x+x/c.z,c.y+y/c.z]:[x,y];};   // 화면 좌표 → 세계 좌표
  function camFollow(){   // 오브젝트를 따라가는 카메라: 매 프레임 그 오브젝트 가운데로
    let any=false;
    for(const id of camOrder){
      const k=objects.get(id);if(!k||!k.follow)continue;
      any=true;const t=objects.get(k.follow);
      if(t&&(k.pos.d[0]!==t.pos.d[0]||k.pos.d[1]!==t.pos.d[1]))movePos(k,t.pos.d[0],t.pos.d[1]);
    }
    return any;
  }
  // 키 입력: 실제 키 · jaw.keyPush/keyClick (가상) · can.bindInput 으로 키에 묶인 버튼을 누르고 있음
  const fno=()=>io.dis&&io.dis.frameNo?io.dis.frameNo():Math.floor(performance.now()/(1000/60));   // 화면 프레임 번호 (화면이 없으면 60fps 로 어림)
  const vHeld=new Set(),vTap=new Map(),keyBinds=new Map();   // keyBinds: 키 → 버튼 id 들
  function keyOn(n){
    n=keyCanon(n);const now=performance.now();
    if(vHeld.has(n)||(vTap.has(n)&&fno()<=vTap.get(n)+1))return 1;
    if(io.dis&&io.dis.key&&io.dis.key(n))return 1;
    const bs=keyBinds.get(n);
    if(bs&&io.dis&&io.dis.pointers)for(const id of bs){
      const o=objects.get(id);if(!o||!live(o))continue;
      if(o.kind==='text')fitText(o);
      for(const q of io.dis.pointers()){const w=toW(q[0],q[1]);if(inObj(o,w[0],w[1]))return 1;}
      {const fn=fno();for(const k of io.dis.clicks()){if(fn>k.f+1)continue;const w=toW(k.dx,k.dy);if(inObj(o,w[0],w[1]))return 1;}}   // 아주 짧게 톡 눌러도 1 프레임
    }
    return 0;
  }
  function camName(id,n){
    if(/^cam\./.test(id))throw rt(`'cam.' 으로 시작하는 이름은 카메라 전용입니다 ('${id}') — 카메라는 seo.setCam("이름"); 으로 만드세요`,n);
    if(/^spk\./.test(id))throw rt(`'spk.' 으로 시작하는 이름은 스피커 전용입니다 ('${id}') — 스피커는 sou.setSpeaker("이름"); 으로 만드세요`,n);
  }
  function inObj(o,x,y){   // 화면 좌표가 오브젝트 안 (원은 타원)
    if(o.ui){const k=camNow();if(k){x=(x-k.x)*k.z;y=(y-k.y)*k.z;}}   // UI: 세계 좌표 → 화면 좌표
    let dx=x-o.pos.d[0],dy=y-o.pos.d[1];const hw=Math.abs(o.scale.d[0])/2,hh=(o.kind==='text'?textH(o):Math.abs(o.scale.d[1]))/2;
    dx-=nudX(o);dy-=nudY(o);   // 기준점이 끝이면 가운데는 옆으로
    if(o.angle){const r=o.angle*D2R,c=Math.cos(r),s=Math.sin(r),rx=dx*c+dy*s;dy=-dx*s+dy*c;dx=rx;}   // 돌아간 오브젝트: 점을 거꾸로 돌림
    if(o.kind==='circle')return hw>0&&hh>0&&(dx*dx)/(hw*hw)+(dy*dy)/(hh*hh)<=1;
    if(o.kind==='poly'){   // 다각형 안 (짝홀 규칙)
      const fx=o.scale.d[0]/o.pbase[0],fy=o.scale.d[1]/o.pbase[1],P=o.pts.map(q=>[q[0]*fx,q[1]*fy]);let inn=false;
      for(let i=0,j=P.length-1;i<P.length;j=i++){const a=P[i],b=P[j];if((a[1]>dy)!==(b[1]>dy)&&dx<(b[0]-a[0])*(dy-a[1])/(b[1]-a[1])+a[0])inn=!inn;}
      return inn;
    }
    return Math.abs(dx)<=hw&&Math.abs(dy)<=hh;
  }
  function selfObj(env,n){
    if(env.self===null)throw rt('id 없는 obj.속성 은 오브젝트에 귀속되어 실행될 때만 쓸 수 있습니다 — 아직 귀속되지 않았습니다 (dis.BelongObj("id"); 줄을 먼저 실행하세요)',n);
    return objOf(env.self,n);
  }
  const objT=(tg,env)=>tg.id===null?selfObj(env,tg):objOf(tg.id,tg);
  function instSlot(o,name){   // 오브젝트에 귀속된 실행들에서 변수 찾기: 파일 최상위 → run{ } 바로 안
    if(!o.insts)return null;
    for(const i of o.insts){
      const sl=i.env.m.get(name);if(sl)return sl;
      if(i.runEnvs)for(const r of i.runEnvs){const s2=r.m.get(name);if(s2)return s2;}
    }
    return null;
  }
  function ovSlot(e,env){   // obj.id.변수
    const o=objOf(e.id,e);
    const sl=instSlot(o,e.name);if(sl)return sl;
    throw rt(`오브젝트 '${o.id}' 에 변수 '${e.name}' 이(가) 아직 없습니다 (귀속된 파일이 실행되지 않았거나, run{ } 안의 그 var 줄까지 아직 오지 않았습니다)`,e);
  }
  function adopt(o){   // 귀속된 코드에서 새로 만든 오브젝트 = 그 오브젝트의 자식
    if(selfNow===null||selfNow===o.id||o.parent||!objects.has(selfNow))return;
    o.parent=selfNow;
    if(!kids.has(selfNow))kids.set(selfNow,new Set());
    kids.get(selfNow).add(o.id);
  }
  let spawnDepth=0;
  function born(o,n){   // 새 오브젝트: 부모 정하고 귀속된 파일 실행
    if(sceneOn&&!o.scenes)o.scenes=new Set([curScene]);   // 기본: 만든 장면에만 있음
    adopt(o);
    const L=prog.belongs.get(o.id);if(!L)return;
    if(spawnDepth>=64)throw rt('귀속된 파일이 오브젝트를 너무 깊게 연달아 만들고 있습니다',n);
    spawnDepth++;
    try{   // 귀속된 파일들의 최상위 var 를 먼저 모두 만든 뒤 run{ } 시작 (파일 순서와 상관없이 서로의 변수를 읽음)
      const made=[];for(const path of L){const i=initInst(o,path);if(i)made.push(i);}
      for(const i of made)if(!i.tk.dead)startInst(o,i);
    }finally{spawnDepth--;}
  }
  function initInst(o,path){   // 오브젝트에 귀속된 실행 하나: 최상위 var
    if(!o.insts)o.insts=[];
    if(o.insts.some(i=>i.path===path))return null;   // 같은 파일은 한 번만
    const tk={dead:false},env=new Env(null);
    env.self=o.id;env.tk=tk;
    const inst={path,env,tk,runEnvs:[]};o.insts.push(inst);
    io.sys&&io.sys(`⊕ ${path} → obj.${o.id}`);
    const prev=selfNow;
    try{for(const s of prog.tasks.get(path).ast)if(s.k==='var')exec(s,env);}
    catch(e){if(e!==tk){if(!halted)halted=e;throw e;}}
    finally{selfNow=prev;}
    return inst;
  }
  // sendto 로 넘어가기: 넘기기 전에 정지 확인 → setTimeout(0) 뒤 (서로 계속 넘어가도 탭이 멈추지 않음)
  function sendLater(path){
    if(halted)return Promise.reject(halted);
    if(ctl.stop)return Promise.reject(STOP);
    return new Promise(r=>setTimeout(r,0)).then(()=>{if(halted)throw halted;if(ctl.stop)throw STOP;return runTask(path);});
  }
  function startInst(o,inst){   // run{ } 들을 시작
    const m=prog.tasks.get(inst.path),tk=inst.tk,env=inst.env;
    const prev=selfNow;
    try{
      for(const r of m.ast){
        if(r.k!=='run')continue;
        const renv=new Env(env);inst.runEnvs.push(renv);   // run{ } 바로 안의 var 도 obj.id.변수 로 보임
        renv.dc={n:0};   // 함수 호출 깊이 — run 마다 따로
        let pr0;
        try{pr0=seq(r.body,0,renv);}catch(e){if(!(e instanceof JBSend))throw e;pr0=sendLater(e.path);}   // 귀속된 파일의 sendto
        if(pr0){const pr=pr0.catch(e=>e instanceof JBSend?sendLater(e.path):Promise.reject(e)).catch(e=>{if(e!==tk&&!halted)halted=e;});bg.add(pr);pr.finally(()=>bg.delete(pr));}
      }
    }catch(e){if(e!==tk){if(!halted)halted=e;throw e;}}
    finally{selfNow=prev;}
  }
  // 장면에 귀속된 파일 (can.BelongScene): 그 장면에 들어오면 실행, 나가면 멈춤
  function runSceneCode(name){
    const L=name&&prog.sceneBelongs.get(name);if(!L)return;
    for(const path of L){
      const m=prog.tasks.get(path),tk={dead:false},env=new Env(null);
      env.tk=tk;sceneInsts.push(tk);
      io.sys&&io.sys(`⊕ ${path} → 장면 ${name}`);
      const prev=selfNow;
      try{
        for(const s of m.ast)if(s.k==='var')exec(s,env);
        for(const r of m.ast){
          if(r.k!=='run')continue;
          const pr0=block(r.body,env);
          if(pr0){const pr=pr0.catch(e=>{if(e!==tk&&!halted)halted=e;});bg.add(pr);pr.finally(()=>bg.delete(pr));}
        }
      }catch(e){if(e!==tk){if(!halted)halted=e;throw e;}}
      finally{selfNow=prev;}
      if(tk.dead)break;   // 장면 코드가 바로 다른 장면으로 보냄
    }
  }
  function leaveScene(){for(const tk of sceneInsts)tk.dead=true;sceneInsts=[];}
  // ---- 팝업 장면 (can.popupScene / can.closeScene) ----
  // 열 때: 지금 장면을 통째로 멈춤 — 장면 코드(BelongScene) · 그 장면 오브젝트의 귀속 코드 · 움직임 · tween · 애니메이션 · wait 남은 시간
  // 닫을 때: 멈춘 그 상태에서 다시 시작 (기다리던 시간도 이어서) · popupScene 을 부른 코드는 닫힌 뒤 다음 줄로
  const popStack=[];
  // 팝업 때문에 기다리는 동안에도 정지 버튼 · 오류 · 귀속 해제가 먹도록 (안 그러면 실행이 끝나지 않아 ▶ 실행이 먹통)
  function popWait(done,tk){
    return new Promise((res,rej)=>{
      const step=()=>{
        if(halted)return rej(halted);
        if(ctl.stop)return rej(STOP);
        if(tk&&tk.dead)return rej(tk);
        if(done())return res();
        setTimeout(step,16);
      };
      step();
    });
  }
  const tkWait=tk=>popWait(()=>!tk.paused||tk.dead,null);
  function frozenEnv(tk,env){   // 팝업 때문에 멈춘 코드인가
    if(!popStack.length)return false;
    if(tk&&tk.paused)return true;
    if(env&&env.self!==null&&env.self!==undefined){const o=objects.get(env.self);if(o&&!live(o))return true;}
    return false;
  }
  function camSave(){const o=objects.get('cam.default');return o?{pos:o.pos.d.slice(),zoom:o.zoom,follow:o.follow}:null;}
  function camLoad(c){const o=objects.get('cam.default');if(!o||!c)return;movePos(o,c.pos[0],c.pos[1]);o.zoom=c.zoom;if(c.follow)o.follow=c.follow;else delete o.follow;}
  function popOpen(k,nm){
    const f={scene:curScene,insts:sceneInsts,at:performance.now(),cam:camSave(),closed:false};
    for(const tk of f.insts)tk.paused=true;
    popStack.push(f);sceneInsts=[];curScene=k;camDefault();
    io.sys&&io.sys('⧉ 팝업 장면 '+nm);
    redraw();physStart();runSceneCode(nm);
    return f;
  }
  function popClose(f,toScene){   // toScene: 이 프레임의 장면으로 돌아감 (false 면 버림 — sendtoScene 등)
    const dur=performance.now()-f.at;
    leaveScene();   // 팝업 장면의 코드는 끝
    for(const [id,a] of anims){const o=objects.get(id);if(o&&!live(o))a.start+=dur;}   // 멈춰 있던 것들의 시간을 미룸 (이어서)
    for(const w of tweens.values())if(!live(w.o))w.start+=dur;
    for(const o of animObjs)if(o.an&&!live(o))o.an.start+=dur;
    if(toScene){curScene=f.scene;sceneInsts=f.insts;camLoad(f.cam);}
    for(const tk of f.insts){tk.paused=false;if(!toScene)tk.dead=true;}
    f.closed=true;
  }
  function popAll(){while(popStack.length)popClose(popStack.pop(),false);}   // sendtoScene: 열린 팝업과 멈춘 장면은 모두 버림
  // 귀속된 오브젝트가 꺼져 있으면(비활성 · 다른 장면) 그 코드는 켜질 때까지 쉼
  function untilLive(id,tk){
    return new Promise((res,rej)=>{
      const step=()=>{
        if(halted)return rej(halted);
        if(ctl.stop)return rej(STOP);
        if(tk&&tk.dead)return rej(tk);
        const o=objects.get(id);
        if(!o||live(o)){ctl.last=performance.now();return res();}
        raf(step);
      };
      raf(step);
    });
  }
  const isJump=(e,s)=>e instanceof JBJump&&e.target===s;
  // goTo: 이 문장 목록에 그 줄로 시작하는 문장이 있으면 그 번호 (없으면 -1 → 바깥 목록에서 찾음)
  const gotoIdx=(list,e)=>e instanceof JBGoto?list.findIndex(x=>x.line===e.to&&x.file===e.file):-1;
  // 문장 목록을 i 번째부터 실행 — 중간에 Promise 가 나오면 나머지는 그 뒤에 이어서
  function seq(list,i,env){
    for(;i<list.length;i++){
      if(halted)throw halted;
      if(ctl.stop)throw STOP;
      if(env.tk!==null&&env.tk.dead)throw env.tk;   // 귀속된 오브젝트가 지워짐 → 그 코드도 멈춤
      if(env.tk!==null&&env.tk.paused){const k=i,tk=env.tk;return tkWait(tk).then(()=>seq(list,k,env));}   // 팝업 장면 때문에 멈춘 장면 코드
      if(env.self!==null&&(offOn||sceneOn)&&syncDepth===0){const so=objects.get(env.self);if(so&&!live(so)){const k=i;return untilLive(env.self,env.tk).then(()=>seq(list,k,env));}}
      let r;
      try{r=exec(list[i],env);}
      catch(e){
        const g=gotoIdx(list,e);if(g<0)throw e;
        const y=slice();if(y)return y.then(()=>seq(list,g,env));   // goTo 로 도는 반복도 화면 · 정지 버튼이 멈추지 않게
        i=g-1;continue;
      }
      if(r){
        if(syncDepth>0){r.catch(()=>{});throw rt('값을 돌려주는 함수 안에서는 기다리는 명령(wait · dis.waitF · moveObj … for · sendto)을 쓸 수 없습니다',list[i]);}const k=i+1;
        return r.then(()=>seq(list,k,env),e=>{const g=gotoIdx(list,e);if(g<0)throw e;return seq(list,g,env);});}
    }
  }
  const block=(list,env)=>seq(list,0,new Env(env));
  function ifBody(s,env){
    if(ev(s.cond,env)!==0)return block(s.then,env);
    if(s.else)return s.elseIf?exec(s.else[0],env):block(s.else,env);
  }
  function runIf(s,env){
    for(;;){
      let r;
      try{r=ifBody(s,env);}
      catch(e){
        if(!isJump(e,s))throw e;
        if(e.kind==='break')return;
        const y=slice();if(y)return y.then(()=>runIf(s,env));   // return(): if 처음(조건 검사)부터 다시
        continue;
      }
      if(r)return r.then(undefined,e=>{if(!isJump(e,s))throw e;return e.kind==='break'?undefined:runIf(s,env);});
      return;
    }
  }
  function runLoop(s,env,end){
    if(s.ms&&end===undefined)end=performance.now()+(+ev(s.ms,env));   // loop for ms: 시작할 때 정한 시각까지
    for(;;){
      if(end!==undefined&&performance.now()>=end)return;
      if(s.cond&&ev(s.cond,env)===0)return;
      let r;
      try{r=block(s.body,env);}
      catch(e){
        if(!isJump(e,s))throw e;
        if(e.kind==='break')return;   // return(): 다음 반복(조건 검사)으로
      }
      if(r)return r.then(()=>runLoop(s,env,end),e=>{if(!isJump(e,s))throw e;return e.kind==='break'?undefined:runLoop(s,env,end);});
      const y=slice();if(y)return y.then(()=>runLoop(s,env,end));
    }
  }
  function exec(s,env){
    switch(s.k){
      case 'use':case 'lib':case 'func':case 'belong':return;
      case 'var':if(s.pub)return;env.def(s.name,s.ty,s.init?co(ev(s.init,env),s.ty):dflt(s.ty,s.dims));return;
      case 'assign':{const sl=slotOf(s.info,s.name,env,s);sl.v=co(ev(s.expr,env),sl.ty);return;}
      case 'eassign':{
        if(s.isList){
          const L=ev(s.target,env);
          if(s.anyBase&&(typeof L!=='object'||!L.items))throw rt(`[번호] 는 리스트 · compound 에만 쓸 수 있습니다 (값: ${kindTxt(L)})`,s);
          const i=ev(s.i,env);
          if(!(i>=1)||!Number.isFinite(i))throw rt(`리스트 번호는 1 이상이어야 합니다 (받은 값: ${i})`,s.i);
          if(i>L.items.length&&i>1e6)throw rt(`리스트 번호 ${i} 이(가) 너무 큽니다 (최대 1000000)`,s.i);
          while(L.items.length<Math.trunc(i))L.items.push(0);   // 범위 밖에 넣으면 거기까지 늘림 · 사이의 빈 항목은 0
          const k=lix(i,L,s),v=ev(s.expr,env);
          if(!L.comp&&typeof v==='object')throw rt(`리스트에는 숫자나 문자열만 넣을 수 있습니다 (받은 값: ${kindTxt(v)}) — compound 를 쓰세요`,s.expr);
          L.items[k]=own(v);return;
        }
        const m=ev(s.target,env);
        if(s.anyMat&&(typeof m!=='object'||!m.d))throw rt(`[행, 열] 은 행렬에만 쓸 수 있습니다 (값: ${kindTxt(m)})`,s);
        const k=ix(ev(s.i,env),m.r,'행',s)*m.c+ix(ev(s.j,env),m.c,'열',s),v=+ev(s.expr,env);
        if(m.d[k]===v)return;
        const old=m.d[k];m.d[k]=v;
        if(s.target.k==='objprop'){
          const o=objT(s.target,env);
          if(s.target.key==='vel')physKick(o);
          else{if(s.target.key==='pos')shiftKids(o.id,k===0?v-old:0,k===1?v-old:0);redraw();}
        }
        return;
      }
      case 'oassign':{
        if(s.target.k==='objvar'){const sl=ovSlot(s.target,env);sl.v=co(ev(s.expr,env),sl.ty);return;}
        const o=objT(s.target,env),v=ev(s.expr,env);
        if(s.target.key==='istrig'){trigOf(o,s);o.isTrig=v!==0?1:0;if(!o.isTrig)o.trigId='';return;}   // hold 트리거 풀기
        if(s.target.key==='color'){const cl=parseColor(v,s);if(cl===o.color)return;o.color=cl;}
        else if(s.target.key==='text'){textOf(o,s);if(o.text===String(v))return;o.text=String(v);}
        else if(s.target.key==='vel'){o.vel=matCopy(v);physKick(o);return;}
        else return setMat(o,s.target.key,v);
        redraw();return;
      }
      case 'if':return runIf(s,env);
      case 'loop':return runLoop(s,env);
      case 'run':return block(s.body,env);
      case 'call':return callFn(s,env);
    }
  }
  // 파일 최상위 var 를 먼저 만들고, run{ } 블록들은 동시에 실행 (변수는 공유)
  function runTask(path){
    const m=prog.tasks.get(path),env=new Env(null);env.runEnvs=[];
    for(const s of m.ast)if(s.k==='var')exec(s,env);
    const fail=e=>{if(!halted)halted=e;throw e;};
    const ps=[];
    for(const r of m.ast){
      if(r.k!=='run')continue;
      let p;
      const renv=new Env(env);env.runEnvs.push(renv);   // 실행 중 귀속되면 run{ } 바로 안의 var 도 obj.id.변수 로 보임
      renv.dc={n:0};   // 함수 호출 깊이 — run 마다 따로
      try{p=seq(r.body,0,renv);}
      catch(e){
        if(!(e instanceof JBSend)){if(!halted)halted=e;continue;}
        p=sendLater(e.path);   // sendto: 이 run 대신 그 파일 (setTimeout 뒤 — 계속 넘어가도 스택이 쌓이지 않고 탭도 멈추지 않음)
      }
      if(p)ps.push(p.catch(e=>e instanceof JBSend?sendLater(e.path):Promise.reject(e)).catch(fail));
    }
    const done=()=>{if(halted)throw halted;};
    if(!ps.length)return done();
    return Promise.allSettled(ps).then(done);
  }
  // 지금 위치 → to 위치로 ms 동안 곧게 이동
  // 이동 경로에 다른 콜라이더(벽 등)가 있으면 true — 시작 위치 → 도착 위치를 덮는 상자로 검사 (닿기만 하는 것은 괜찮음 · 이미 겹쳐 있던 것은 무시)
  function pathBlocked(o,to){
    if(!colOn||!o.col||!live(o)||o.ui)return false;
    const hw=Math.abs(o.col.size[0])/2,hh=Math.abs(o.col.size[1])/2,E=1e-6;
    const sx=o.pos.d[0]+o.col.off[0],sy=o.pos.d[1]+o.col.off[1],ex=to[0]+o.col.off[0],ey=to[1]+o.col.off[1];
    const x0=Math.min(sx,ex)-hw,x1=Math.max(sx,ex)+hw,y0=Math.min(sy,ey)-hh,y1=Math.max(sy,ey)+hh;
    const lk=links.get(o.id);
    for(const b of objects.values()){
      if(b===o||!b.col||!live(b)||b.ui)continue;
      if((o.parent||b.parent)&&(isAncestor(o.id,b.id)||isAncestor(b.id,o.id)))continue;
      if(lk&&lk.has(b.id))continue;
      const bx=b.pos.d[0]+b.col.off[0],by=b.pos.d[1]+b.col.off[1],bw=Math.abs(b.col.size[0])/2,bh=Math.abs(b.col.size[1])/2;
      if(Math.abs(bx-sx)<bw+hw-E&&Math.abs(by-sy)<bh+hh-E)continue;   // 처음부터 겹쳐 있던 것
      if(bx-bw<x1-E&&bx+bw>x0+E&&by-bh<y1-E&&by+bh>y0+E)return true;
    }
    return false;
  }
  function moveAnim(o,to,ms,startOnly,ease){   // 프레임마다 움직이고, 끝나면 다음 줄로 (startOnly: 움직이기 시작하면 다음 줄)
    if(pathBlocked(o,to.d)){   // 움직이는 쪽에 벽이 있으면 아예 움직이지 않음 (바로 다음 줄)
      const prev=anims.get(o.id);if(prev){anims.delete(o.id);prev.res();if(prev.first)prev.first();}
      return;
    }
    return new Promise((res,rej)=>{
      const prev=anims.get(o.id);if(prev){prev.res();if(prev.first)prev.first();}   // 같은 오브젝트의 이전 이동은 여기서 끝
      let done=false;const go=()=>{if(done)return;done=true;ctl.last=performance.now();res();};
      anims.set(o.id,{ease:ease||null,from:o.pos.d.slice(),to:to.d.slice(),start:performance.now(),ms,res:startOnly?()=>{}:go,first:startOnly?go:null,rej:e=>{if(!done){done=true;rej(e);}}});
      physStart();
    });
  }
  function callFn(c,env){
    const t=c.target;selfNow=env.self;
    if(t.mod==='@belong'){   // dis.BelongObj("id"): 아직 귀속되지 않은 실행이면 지금부터 이 파일 전체가 그 오브젝트에 귀속
      if(t.name!=='BelongObj'||env.self!==null)return;   // 이미 귀속된 실행 (오브젝트가 생길 때 시작된 것 등)
      if(!objOn)throw rt(NOOBJ,c);
      const o=objOf(c.args[0].v,c);
      let root=env;while(root.p)root=root.p;
      root.self=o.id;selfNow=o.id;
      if(!o.insts)o.insts=[];
      if(!o.insts.some(i=>i.env===root))o.insts.push({path:c.file,env:root,tk:{dead:false},runEnvs:root.runEnvs||[]});   // obj.id.변수 · 부모 변수
      io.sys&&io.sys(`⊕ ${c.file} → obj.${o.id} (실행 중 귀속)`);
      return;
    }
    if(t.mod==='jawbreaker'){
      switch(t.name){
        case 'log':case 'print':io.log(fmtVal(ev(c.args[0],env),c.args[0].ty));return;
        case 'wait':return sleep(ev(c.args[0],env),env.tk,env);
        case 'keyClick':case 'keyPush':case 'keyRlse':{   // 그 키를 누른 것처럼: 톡 · 누름 · 뗌
          const k=keyCanon(ev(c.args[0],env));
          if(!k)throw rt('키 이름이 비어 있습니다',c.args[0]);
          if(t.name==='keyClick')vTap.set(k,fno());   // 1 프레임 동안
          else if(t.name==='keyPush')vHeld.add(k);
          else{vHeld.delete(k);vTap.delete(k);}
          return;
        }
        case 'setJson':{   // jaw.setJson("id", 값) — 그때의 복사본을 담아 둠
          const id=String(ev(c.args[0],env));
          if(!id)throw rt('JSON id 가 비어 있습니다',c.args[0]);
          jsons.set(id,deepCopy(ev(c.args[1],env)));return;
        }
        case 'genJson':{   // jaw.genJson("경로.json", "id") — 담아 둔 값을 JSON 파일로
          const raw=String(ev(c.args[0],env)),id=String(ev(c.args[1],env)),path=resolveTaskPath(raw,c.file);
          if(!path||!JSON_PATH.test(path))throw rt(`genJson 의 경로는 이름.json 형태여야 합니다 (폴더/이름.json 가능 · 받은 값: "${raw}")`,c.args[0]);
          if(!jsons.has(id))throw rt(`JSON '${id}' 이(가) 없습니다 (먼저 jaw.setJson("${id}", 값);)`,c.args[1]);
          const txt=jbJson(jsons.get(id));
          jsonOut.set(path,txt);if(io.writeFile)io.writeFile(path,txt);
          io.sys&&io.sys(`💾 ${path} ← JSON '${id}'`);
          return;
        }
        case 'exportFile':{   // jaw.exportFile("경로.json", "내려받을 파일 이름") — 그 파일을 난독화해서 기기로 내려받기
          const raw=String(ev(c.args[0],env)),name=String(ev(c.args[1],env))||'file.jbx',path=resolveTaskPath(raw,c.file);
          if(!path||!JSON_PATH.test(path))throw rt(`exportFile 의 경로는 이름.json 형태여야 합니다 (받은 값: "${raw}")`,c.args[0]);
          const txt=jsonOut.has(path)?jsonOut.get(path):prog.files[path];
          if(typeof txt!=='string')throw rt(`프로젝트에 '${path}' 파일이 없습니다`,c.args[0]);
          if(typeof document!=='undefined'){
            const u=URL.createObjectURL(new Blob([jbObf(txt)],{type:'application/octet-stream'})),a=document.createElement('a');
            a.href=u;a.download=name;document.body.appendChild(a);a.click();a.remove();setTimeout(()=>URL.revokeObjectURL(u),10000);
          }
          io.sys&&io.sys(`📤 ${path} → ${name} (난독화)`);
          return;
        }
        case 'openFile':{   // jaw.openFile("경로.json") — 기기의 파일을 고르게 하고 (고르거나 취소할 때까지 기다림) · 올바른 JSON 이면 그 경로에 씀 (genJson 과 같이 저장됨)
          const raw=String(ev(c.args[0],env)),path=resolveTaskPath(raw,c.file);
          if(!path||!JSON_PATH.test(path))throw rt(`openFile 의 경로는 이름.json 형태여야 합니다 (받은 값: "${raw}")`,c.args[0]);
          if(typeof document==='undefined')return;
          return new Promise(res=>{
            const inp=document.createElement('input');inp.type='file';let done=false;
            const fin=()=>{if(!done){done=true;inp.remove();res();}};
            inp.addEventListener('change',async()=>{
              const f=inp.files&&inp.files[0];
              if(f){try{const t=jbDeobf(await f.text());JSON.parse(t);jsonOut.set(path,t);if(io.writeFile)io.writeFile(path,t);io.sys&&io.sys(`📥 ${f.name} → ${path}`);}
                catch(e){io.sys&&io.sys(`📥 ${f.name}: 읽을 수 없는 파일 (JSON 이 아님)`);}}
              fin();
            });
            inp.addEventListener('cancel',fin);
            setTimeout(()=>window.addEventListener('focus',()=>setTimeout(()=>{if(!inp.files||!inp.files.length)fin();},1000),{once:true}),300);   // 취소 이벤트가 없는 브라우저: 창으로 돌아오면
            inp.style.display='none';document.body.appendChild(inp);inp.click();
          });
        }
        case 'loadJson':{   // jaw.loadJson("경로.json", "변수") — JSON 파일을 compound 변수로
          const raw=String(ev(c.args[0],env)),path=resolveTaskPath(raw,c.file);
          if(!path||!JSON_PATH.test(path))throw rt(`loadJson 의 경로는 이름.json 형태여야 합니다 (받은 값: "${raw}")`,c.args[0]);
          const txt=jsonOut.has(path)?jsonOut.get(path):prog.files[path];
          if(typeof txt!=='string')throw rt(`프로젝트에 '${path}' 파일이 없습니다`,c.args[0]);
          let v;
          try{v=JSON.parse(txt);}catch(e){throw rt(`'${path}' 은(는) 올바른 JSON 이 아닙니다`,c.args[0]);}
          try{v=jsonToJb(v);}catch(e){throw rt(`'${path}' 에 { } (객체)가 있습니다 — loadJson 은 [ ] · 숫자 · 문자열 · true/false · null 만 읽습니다`,c.args[0]);}
          if(!v||typeof v!=='object')v={items:[v],comp:true};   // 맨 바깥이 배열이 아니면 [값]
          slotOf(c.jinfo,c.jname,env,c).v=v;
          io.sys&&io.sys(`📂 ${path} → ${c.jname}`);
          return;
        }
        case 'terminate':halted=halted||TERM;throw halted;
        case 'sendto':   // 이 run 은 여기서 끝 — 그 파일로 넘어감 (돌아오지 않음)
          io.sys&&io.sys('→ sendto '+c.taskPath);
          throw new JBSend(c.taskPath);
        case 'goTo':throw new JBGoto(ev(c.args[0],env)|0,c);   // 그 줄의 문장으로 — seq 가 받아서 넘어감
        case 'break':case 'return':
          if(c.ret)throw new JBRet(co(ev(c.args[0],env),c.retTy));   // return(값);
          throw new JBJump(t.name,c.jump);
        case 'setup':{
          if(bg.size>=64)throw rt('setup 으로 동시에 실행 중인 파일이 너무 많습니다 (최대 64개)',c);
          io.sys&&io.sys('⇉ setup '+c.taskPath);
          const pr=Promise.resolve().then(()=>runTask(c.taskPath)).catch(e=>{if(!halted)halted=e;});   // 기다리지 않고 다음 줄로
          bg.add(pr);pr.finally(()=>bg.delete(pr));
          return;
        }
      }
    }
    if(t.mod==='@list'){   // 리스트 명령
      const L=ev(c.lnode,env);
      switch(t.name){
        case 'add':L.items.push(own(ev(c.args[0],env)));return;
        case 'insert':{const k=lix(ev(c.args[0],env),{items:L.items},c,1);L.items.splice(k,0,own(ev(c.args[1],env)));return;}
        case 'remove':L.items.splice(lix(ev(c.args[0],env),L,c),1);return;
        case 'clear':L.items.length=0;return;
      }
    }
    if(t.mod===DIS_ID||t.mod===COL_ID||t.mod===MAG_ID||t.mod===CAN_ID){
      const k=hget(TAG_ARG,t.name);
      if(k!==undefined&&idOvNode!==c.args[k]){
        const v=ev(c.args[k],env);if(isTagId(v))return forTag(c,env,k,v);
        const pn=idOvNode,pv=idOv;idOvNode=c.args[k];idOv=rid(v);   // 계산한 id 를 idArg 가 그대로 씀 (다시 계산하지 않음)
        try{return callFn(c,env);}finally{idOvNode=pn;idOv=pv;}
      }
    }
    if(t.mod===MAG_ID){   // 이미지 · 텍스쳐
      if(t.name==='importFolder'){   // 폴더 안 파일마다 importFile (이름 = 확장자를 뺀 파일 이름)
        for(const [nm,path] of c.folderFiles){
          imgAlias.set(nm,path);
          if(AUD_RE.test(path))sndBuf(path);else if(IMG_RE.test(path))imgOf(path,c);
        }
        io.sys&&io.sys(`📁 importFolder: ${c.folderFiles.length}개 — ${c.folderFiles.map(x=>x[0]).join(', ')}`);
        return;
      }
      if(t.name==='importFile'){   // 경로에 이름만 붙임 (기다리지 않음) — 이후 그 이름이 곧 그 경로
        const id=String(ev(c.saveAs,env));
        if(!id)throw rt('이름(id)이 비어 있습니다',c.saveAs);
        imgAlias.set(id,c.imgPath);
        if(AUD_RE.test(c.imgPath))sndBuf(c.imgPath);else if(IMG_RE.test(c.imgPath))imgOf(c.imgPath,c);   // 쓸 수 있게 미리 읽기 시작
        return;
      }
      if(t.name==='setasTexture'){   // 이미지의 [x1, y1]~[x2, y2] 를 텍스쳐로 — 이름은 save as
        const img=String(ev(c.args[0],env)),a=ev(c.args[1],env),b=ev(c.args[2],env),id=String(ev(c.saveAs,env));
        if(!id)throw rt('이름(id)이 비어 있습니다',c.saveAs);
        const path=imgAlias.get(img);
        if(!path||!IMG_RE.test(path))throw rt(`'${img}' 은(는) 이미지 이름이 아닙니다 (mag.importFile("경로") save as ("${img}"); 로 먼저 이름을 붙이세요)`,c.args[0]);
        const tx=imgOf(path,c),[x1,y1]=a.d,[x2,y2]=b.d;
        if(tx.w&&(Math.min(x1,x2)<0||Math.min(y1,y2)<0||Math.max(x1,x2)>tx.w||Math.max(y1,y2)>tx.h))
          throw rt(`텍스쳐 범위 [${x1}, ${y1}] ~ [${x2}, ${y2}] 이(가) 이미지 크기 ${tx.w} × ${tx.h} 를 벗어났습니다`,c);
        if(x1===x2||y1===y2)throw rt('텍스쳐 범위의 가로나 세로가 0 입니다',c);
        texDefs.set(id,{img,path,x1,y1,x2,y2,n:c});return;
      }
      if(t.name==='setasAnime'){   // 텍스쳐들을 ms 간격으로 이어 애니메이션
        const L=ev(c.args[0],env),ms=+ev(c.args[1],env),id=String(ev(c.args[2],env));
        if(!id)throw rt('이름(id)이 비어 있습니다',c.args[2]);
        if(!L.items.length)throw rt('애니메이션에 넣을 텍스쳐가 없습니다 (리스트가 비어 있음)',c.args[0]);
        if(!(ms>=1))throw rt(`프레임마다 기다리는 시간은 1ms 이상이어야 합니다 (받은 값: ${ms})`,c.args[1]);
        for(const f of L.items){
          if(typeof f!=='string')throw rt(`애니메이션의 프레임은 텍스쳐 id 문자열입니다 (받은 값: ${fmtAny(f)})`,c.args[0]);
          if(!texDefs.has(f))throw rt(`텍스쳐 '${f}' 이(가) 없습니다 (mag.setasTexture("이미지", [x1, y1], [x2, y2]) save as ("${f}"); 로 먼저 만드세요)`,c.args[0]);
        }
        animes.set(id,{frames:L.items.slice(),ms});return;
      }
      if(t.name==='wearTexture'||t.name==='applyAnime'||t.name==='runAnime'||t.name==='breakAnime'){
        const o=objOf(idArg(c,0,env),c);
        if(o.kind==='text'||o.kind==='none'||o.kind==='poly')throw rt(`'${o.id}' 은(는) ${o.kind==='text'?'글자':o.kind==='poly'?'다각형':'보이지 않는'} 오브젝트라 텍스쳐를 입힐 수 없습니다 (사각형 · 원만)`,c);
        if(t.name==='breakAnime'){animeStop(o);return;}   // 지금 프레임에서 멈춤 (그 텍스쳐 그대로)
        if(t.name==='wearTexture'){   // 텍스쳐 입히기 (애니메이션은 멈춤) · "" = 벗기기
          animeStop(o);const tid=String(ev(c.args[1],env));
          if(!tid){if(o.texture){delete o.texture;redraw();}return;}
          if(!texDefs.has(tid))throw rt(`텍스쳐 '${tid}' 이(가) 없습니다 (mag.setasTexture("이미지", [x1, y1], [x2, y2]) save as ("${tid}"); 로 먼저 만드세요)`,c.args[1]);
          showTex(o,tid,c);return;
        }
        const aid=String(ev(c.args[1],env)),sp=t.name==='runAnime'?+ev(c.args[2],env):1;   // applyAnime = 1 배속
        if(!animes.has(aid))throw rt(`애니메이션 '${aid}' 이(가) 없습니다 (mag.setasAnime([...], ms, "${aid}"); 로 먼저 만드세요)`,c.args[1]);
        if(!(sp>0))throw rt(`배속은 0 보다 커야 합니다 (받은 값: ${sp})`,c.args[2]);
        if(o.an)o.an.next={id:aid,sp};   // 재생 중이면 지금 것이 끝난 뒤 바뀜
        else animeStart(o,aid,sp,performance.now(),c);
        return;
      }
      // setObjTexture("id", "파일id", [x1, y1], [x2, y2]) — 이미지의 그 부분을 오브젝트에 입힘 (색은 #ffffff → 색 효과)
      const o=objOf(idArg(c,0,env),c),tid=String(ev(c.args[1],env)),a=ev(c.args[2],env),b=ev(c.args[3],env);
      if(o.kind==='text'||o.kind==='none'||o.kind==='poly')throw rt(`'${o.id}' 은(는) ${o.kind==='text'?'글자':o.kind==='poly'?'다각형':'보이지 않는'} 오브젝트라 텍스쳐를 입힐 수 없습니다 (사각형 · 원만)`,c);
      if(!tid){if(o.texture){delete o.texture;redraw();}return;}   // "" = 텍스쳐 벗기기
      const path=imgAlias.get(tid);
      if(!path||!IMG_RE.test(path))throw rt(`'${tid}' 은(는) 이미지 이름이 아닙니다 (mag.importFile("경로") save as ("${tid}"); 로 먼저 이름을 붙이세요)`,c.args[1]);
      const tx=imgOf(path,c);
      const [x1,y1]=a.d,[x2,y2]=b.d;
      if(tx.w&&(Math.min(x1,x2)<0||Math.min(y1,y2)<0||Math.max(x1,x2)>tx.w||Math.max(y1,y2)>tx.h))
        throw rt(`텍스쳐 범위 [${x1}, ${y1}] ~ [${x2}, ${y2}] 이(가) 이미지 크기 ${tx.w} × ${tx.h} 를 벗어났습니다`,c);
      if(x1===x2||y1===y2)throw rt('텍스쳐 범위의 가로나 세로가 0 입니다',c);
      o.texture={ref:tx,id:tid,path,x1,y1,x2,y2};o.color='#ffffff';redraw();   // 그림은 다 읽히면 나타남
      return;
    }
    if(t.mod===CAN_ID){   // 버튼 · 장면
      if(t.name==='bindInput'){   // 버튼을 누르고 있는 동안 그 키를 누른 것으로 (jaw.isKeyInput) — 버튼이 아니면 버튼으로 만듦
        const o=objOf(idArg(c,0,env),c),k=keyCanon(ev(c.toExpr,env));
        if(!o.btn){o.btn=true;o.btnSeen=o.relSeen=performance.now();}
        for(const set of keyBinds.values())set.delete(o.id);   // 버튼 하나에 키 하나 ("" = 풀기)
        if(k){if(!keyBinds.has(k))keyBinds.set(k,new Set());keyBinds.get(k).add(o.id);}
        return;
      }
      if(t.name==='setUi'){   // 카메라에 고정: 이후 위치 = 화면 좌표 (카메라 · 배율과 상관없이 · 맨 위에 그림 · 충돌 · 트리거 없음)
        uiTree(objOf(idArg(c,0,env),c));redraw();return;   // 자식(과 그 자식)도 같이 UI
      }
      if(t.name==='setasButton'){   // 이후 can.obj.id.IsButtonClicked 로 클릭 확인 (그 전의 클릭은 세지 않음)
        const o=objOf(idArg(c,0,env),c);
        if(!o.btn){o.btn=true;o.btnSeen=o.relSeen=performance.now();}
        return;
      }
      if(t.name==='setUpScene'){
        if(sceneOn)return;
        sceneOn=true;curScene=0;sceneN=0;sceneNameOf.set(0,'');
        for(const o of objects.values())if(!o.scenes)o.scenes=new Set(o.spk?['*']:[0]);   // 이미 있는 오브젝트는 처음 장면에
        io.sys&&io.sys('Canvas: 장면 기능 활성화');return;
      }
      if(!sceneOn)throw rt(NOSCENE,c);
      if(t.name==='closeScene'){   // 팝업 장면 닫기 → 멈춰 둔 장면이 그 상태에서 다시 시작
        if(!popStack.length)throw rt('열려 있는 팝업 장면이 없습니다 (can.popupScene("장면"); 으로 연 장면만 닫을 수 있습니다)',c);
        const f=popStack.pop();
        io.sys&&io.sys('⧉ 팝업 장면 닫음 → '+(sceneNameOf.get(f.scene)||'처음 장면'));
        popClose(f,true);redraw();physStart();return;
      }
      const nm=c.canObj?null:String(ev(c.args[0],env));
      if(nm!==null&&(!nm||nm==='*'))throw rt(`장면 이름이 올바르지 않습니다 (비어 있거나 '*'): "${nm}"`,c.args[0]);
      switch(t.name){
        case 'nameScene':{   // 지금 장면에 이름 붙이기
          const old=sceneNameOf.get(curScene);if(old===nm)return;
          if(sceneByName.has(nm))throw rt(`장면 이름 '${nm}' 은(는) 이미 다른 장면이 쓰고 있습니다`,c.args[0]);
          leaveScene();
          if(old)sceneByName.delete(old);
          sceneByName.set(nm,curScene);sceneNameOf.set(curScene,nm);
          runSceneCode(nm);return;
        }
        case 'popupScene':{   // 지금 장면을 멈춰 두고 그 장면을 엶 — can.closeScene(); 으로 닫으면 멈춘 그 상태에서 다시 시작 · 부른 코드는 닫힌 뒤 다음 줄
          if(!sceneByName.has(nm))throw rt(`장면 '${nm}' 이(가) 없습니다 (can.setScene 으로 먼저 만들거나 can.nameScene 으로 이름을 붙이세요)`,c.args[0]);
          const k=sceneByName.get(nm);
          if(k===curScene)throw rt(`장면 '${nm}' 은(는) 지금 장면입니다 — 다른 장면을 팝업으로 여세요`,c.args[0]);
          if(popStack.some(f=>f.scene===k))throw rt(`장면 '${nm}' 은(는) 이미 팝업 아래에 멈춰 있습니다`,c.args[0]);
          const f=popOpen(k,nm);
          return popWait(()=>f.closed,env.tk);
        }
        case 'setScene':{   // 새 장면 만들기 (이동은 sendtoScene)
          if(sceneByName.has(nm))throw rt(`장면 '${nm}' 은(는) 이미 있습니다`,c.args[0]);
          const k=++sceneN;sceneByName.set(nm,k);sceneNameOf.set(k,nm);return;
        }
        case 'sendtoScene':{   // 장면 이동: 그 장면에 있을 수 있는 오브젝트만 보이고 움직임
          if(!sceneByName.has(nm))throw rt(`장면 '${nm}' 이(가) 없습니다 (can.setScene 으로 먼저 만들거나 can.nameScene 으로 이름을 붙이세요)`,c.args[0]);
          const k=sceneByName.get(nm);if(k===curScene)return;
          popAll();   // 열려 있던 팝업과 멈춰 둔 장면은 버림
          leaveScene();curScene=k;camDefault();
          io.sys&&io.sys('→ 장면 '+nm);
          redraw();physStart();
          runSceneCode(nm);return;
        }
        case 'setExistableScene':{   // can.obj.setExistableScene("장면", "id") — 여러 번 쓰면 여러 장면 · "*" = 모든 장면
          const sn=String(ev(c.args[0],env)),o=objOf(idArg(c,1,env),c);
          if(!sn)throw rt('장면 이름이 비어 있습니다',c.args[0]);
          if(sn!=='*'&&!sceneByName.has(sn))throw rt(`장면 '${sn}' 이(가) 없습니다 (can.setScene 으로 먼저 만들거나 can.nameScene 으로 이름을 붙이세요)`,c.args[0]);
          (o.scenes||(o.scenes=new Set([curScene]))).add(sn==='*'?'*':sceneByName.get(sn));
          redraw();physStart();return;
        }
      }
      return;
    }
    if(t.mod===SND_ID){   // soundMaster
      const sid=String(ev(c.args[0],env));
      if(!sid)throw rt('스피커 id 가 비어 있습니다',c.args[0]);
      if(t.name==='setSpeaker'){   // 스피커 = 보이지 않는 오브젝트 (id "spk.이름") · 만든 장면에 있음
        if(/[<>.]/.test(sid))throw rt(`스피커 이름에는 < > . 를 쓸 수 없습니다: "${sid}"`,c.args[0]);
        if(snd.spk.has(sid)&&objects.has('spk.'+sid))return;
        const oid='spk.'+sid;
        if(!objects.has(oid)){const o={id:oid,kind:'none',spk:true,pos:{r:1,c:2,d:[0,0]},scale:{r:1,c:2,d:[0,0]},color:'#000',vel:{r:1,c:2,d:[0,0]}};objects.set(oid,o);born(o,c);if(sceneOn)o.scenes=new Set(['*']);}   // 기본: 모든 장면
        if(!snd.spk.has(sid))snd.spk.set(sid,{id:sid,oid,v:255,fin:0,fout:0,obj:null,voices:new Set(),gen:0});
        spatial();return;
      }
      const k=spkOf(sid,c.args[0]);
      switch(t.name){
        case 'playSfx':{const pa=sndPath(String(ev(c.args[1],env)),c.args[1]),ms=+ev(c.args[2],env);sndPlay(k,pa,ms,-1);return;}
        case 'repeatingPlay':{
          const pa=sndPath(String(ev(c.args[1],env)),c.args[1]),n=ev(c.args[2],env)|0;
          if(n<0)throw rt(`반복 횟수는 0 (무한) 이상이어야 합니다 (받은 값: ${n})`,c.args[2]);
          sndPlay(k,pa,0,n);return;
        }
        case 'repeatPart':case 'repatPart':case 'introPart':{   // 시작 ms ~ 끝 ms 구간을 무한 반복 (introPart 는 처음부터 재생한 뒤) (끝이 음수면 소리 끝까지) — break 로 끔
          const pa=sndPath(String(ev(c.args[1],env)),c.args[1]),a=ev(c.args[2],env)|0,e=ev(c.args[3],env)|0;
          if(a<0)throw rt(`시작 지점은 0 이상이어야 합니다 (받은 값: ${a})`,c.args[2]);
          if(e>=0&&e<=a)throw rt(`끝 지점은 시작 지점보다 뒤여야 합니다 (받은 값: ${a} ~ ${e}) — 끝을 음수로 하면 소리 끝까지`,c.args[3]);
          sndPlay(k,pa,0,0,[a,e,t.name==='introPart']);return;
        }
        case 'setVol':{   // 0 ~ 255 · 페이드가 있으면 그 시간 동안 천천히
          const v=Math.max(0,Math.min(255,ev(c.args[1],env)|0));
          if(v===k.v)return;
          const up=v>k.v;k.v=v;
          if(k.vol&&snd.ctx){const t0=snd.ctx.currentTime,f=(up?k.fin:k.fout)/1000;k.vol.gain.cancelScheduledValues(t0);if(f>0){k.vol.gain.setValueAtTime(k.vol.gain.value,t0);k.vol.gain.linearRampToValueAtTime(v/255,t0+f);}else k.vol.gain.value=v/255;}
          return;
        }
        case 'break':sndBreak(k,c.args.length>1&&ev(c.args[1],env)!==0);return;   // 두 번째 값이 true 면 페이드 아웃 무시 (바로 끔)
        case 'setFadein':case 'setFadeout':{
          const ms=ev(c.args[1],env)|0;
          if(ms<0)throw rt(`페이드 시간은 0 이상이어야 합니다 (받은 값: ${ms})`,c.args[1]);
          if(t.name==='setFadein')k.fin=ms;else k.fout=ms;return;
        }
        case 'belongtoScene':{   // sou.spk.스피커.belongtoScene("장면") — 그 장면에서만 들림 ("*" = 모든 장면)
          if(!sceneOn)throw rt(NOSCENE,c);
          const sn=String(ev(c.args[1],env)),so=objects.get(k.oid);
          if(!sn)throw rt('장면 이름이 비어 있습니다',c.args[1]);
          if(sn!=='*'&&!sceneByName.has(sn))throw rt(`장면 '${sn}' 이(가) 없습니다 (can.setScene 으로 먼저 만들거나 can.nameScene 으로 이름을 붙이세요)`,c.args[1]);
          if(so)so.scenes=new Set([sn==='*'?'*':sceneByName.get(sn)]);
          spatial();return;
        }
        case 'belongto':{   // sou.spk.스피커.belongto("오브젝트") — 스피커가 그 오브젝트로 가서 자식이 됨 (따라감 · 꺼지면 같이 꺼짐) · "" = 풀기
          const tid=String(ev(c.args[1],env)),so=objects.get(k.oid);
          if(so&&so.parent&&kids.has(so.parent))kids.get(so.parent).delete(so.id);
          if(so)delete so.parent;
          if(tid){
            const g=objOf(tid,c.args[1]);
            if(g.spk||g.cam)throw rt(`스피커는 오브젝트에만 귀속됩니다 ('${g.id}')`,c.args[1]);
            if(so){movePos(so,g.pos.d[0],g.pos.d[1]);so.parent=g.id;if(!kids.has(g.id))kids.set(g.id,new Set());kids.get(g.id).add(so.id);}
          }
          k.obj=tid||null;spatial();return;
        }
      }
      return;
    }
    if(t.mod===CAM_ID){   // SeongBin
      if(t.name==='setUpCam'){if(!camOn){camOn=true;camDefault();io.sys&&io.sys('SeongBin: 카메라 기능 활성화 (cam.default)');redraw();}return;}
      if(!camOn)throw rt('카메라 기능이 꺼져 있습니다 — 먼저 seo.setUpCam(); 을 실행하세요',c);
      if(!objOn)throw rt(NOOBJ,c);
      const nm=String(ev(c.args[0],env));
      if(!nm||/[<>.]/.test(nm))throw rt(`카메라 이름이 올바르지 않습니다 (비어 있거나 < > . 이 들어감): "${nm}"`,c.args[0]);
      const id='cam.'+nm;
      if(t.name==='setCam'){   // 카메라 = 보이지 않는 오브젝트 (지금 장면에 있음) · 장면의 첫 카메라가 메인
        if(objects.has(id))throw rt(`카메라 '${nm}' 은(는) 이미 있습니다`,c.args[0]);
        const o={id,kind:'none',cam:true,zoom:1,pos:{r:1,c:2,d:[0,0]},scale:{r:1,c:2,d:[0,0]},color:'#000',vel:{r:1,c:2,d:[0,0]}};
        objects.set(id,o);camOrder.push(id);born(o,c);
        redraw();return;
      }
      const o=objects.get(id);
      if(!o||!o.cam)throw rt(`카메라 '${nm}' 이(가) 없습니다 (seo.setCam("${nm}"); 으로 먼저 만드세요)`,c.args[0]);
      switch(t.name){
        case 'setMainCamas':camMain.set(sceneKey(),id);redraw();return;
        case 'setZoom':{
          const z=+ev(c.args[1],env);
          if(!(z>0))throw rt(`배율은 0 보다 커야 합니다 (받은 값: ${z})`,c.args[1]);
          if(o.zoom!==z){o.zoom=z;redraw();}return;
        }
        case 'moveCamto':{   // [x, y] 로 ms 동안 (끝날 때까지 기다림 · for 가 없으면 바로)
          let to;curObj=o;try{to=matCopy(ev(c.args[1],env));}finally{curObj=null;}
          const ms=c.forExpr?ev(c.forExpr,env):0;
          if(ms<0)throw rt(`이동 시간은 0 이상이어야 합니다 (받은 값: ${ms})`,c.forExpr);
          if(o.follow)delete o.follow;   // 옮기면 따라가기는 풀림
          if(ms===0){setMat(o,'pos',to);return;}
          return moveAnim(o,to,ms);
        }
        case 'follow':{
          const tid=String(ev(c.args[1],env)),g=objOf(tid,c.args[1]);
          if(g.cam)throw rt(`카메라는 다른 카메라를 따라갈 수 없습니다 ('${g.id}')`,c.args[1]);
          o.follow=g.id;physStart();redraw();return;
        }
        case 'followOut':delete o.follow;return;
      }
      return;
    }
    if(t.mod===COL_ID){
      if(t.name==='setLink')return setLink(c,env);
      if(t.name==='setVelocity'){
        const o=objOf(idArg(c,0,env),c);
        let v;curObj=o;try{v=ev(c.args[1],env);}finally{curObj=null;}   // 행렬 안의 obj.Xvel · obj.Yvel = 지금 속도
        o.vel={r:1,c:2,d:[v.d[0],v.d[1]]};physKick(o);
      }else if(t.name==='setVelocityX'||t.name==='setVelocityY'){   // 속도의 한 방향만 바꿈 (다른 방향은 그대로)
        const o=objOf(idArg(c,0,env),c),k=t.name==='setVelocityX'?0:1;
        let v;curObj=o;try{v=+ev(c.args[1],env);}finally{curObj=null;}   // 값 안의 obj.Xvel · obj.Yvel = 지금 속도
        if(!Number.isFinite(v))throw rt(`속도가 숫자가 아닙니다 (받은 값: ${v})`,c.args[1]);
        const d=o.vel.d.slice();d[k]=v;o.vel={r:1,c:2,d};physKick(o);
      }else if(t.name==='setAnchor'){   // 묶어두기: true 면 속도를 0 으로 하고 속도로는 움직이지 않음
        const o=objOf(idArg(c,0,env),c),on=ev(c.args[1],env)!==0;
        o.anchored=on;
        if(on)o.vel={r:1,c:2,d:[0,0]};else physKick(o);
      }else if(t.name==='setCollider'||t.name==='setColider'){
        // ([x, y], [가로, 세로], "id", 탄성계수, 중력) — [x, y] 는 콜라이더 가운데의 화면 좌표 · id 오브젝트가 있으면 거기 붙음 (그 간격대로 따라감),
        // 없으면 보이지 않는 콜라이더 오브젝트를 그 위치에 만듦 (벽 · 바닥)
        if(!objOn)throw rt(NOOBJ,c);
        const pos=ev(c.args[0],env),size=ev(c.args[1],env),id=idArg(c,2,env),e=+ev(c.args[3],env),grav=ev(c.args[4],env)!==0;
        if(!id)throw rt('콜라이더 id 가 비어 있습니다',c.args[2]);
        if(!(e>=0&&e<=1))throw rt(`탄성계수는 0 ~ 1 사이입니다 (받은 값: ${e})`,c.args[3]);
        let o=objects.get(id);
        if(o)o.col={off:[pos.d[0]-o.pos.d[0],pos.d[1]-o.pos.d[1]],size:[size.d[0],size.d[1]],e,grav};   // [x, y] = 화면 좌표 → 오브젝트와의 간격으로 기억
        else{
          o={id,kind:'none',pos:matCopy(pos),scale:matCopy(size),color:'#000',vel:{r:1,c:2,d:[0,0]},col:{off:[0,0],size:[size.d[0],size.d[1]],e,grav}};
          camName(id,c);objects.set(id,o);born(o,c);
        }
        colOn=true;physKick(o);redraw();
      }else if(t.name==='setGravity'){
        const f=+ev(c.args[0],env);
        if(!Number.isFinite(f))throw rt(`중력 값이 숫자가 아닙니다 (받은 값: ${f})`,c.args[0]);
        gravScale=f;
        for(const o of objects.values())if(o.col&&o.col.grav){physStart();break;}
      }else if(t.name==='setTrigger'){
        // ([x, y], [가로, 세로], "id", hold) — 충돌 없는 판정 영역. id 오브젝트가 있으면 붙고, 없으면 보이지 않는 트리거를 만듦
        if(!objOn)throw rt(NOOBJ,c);
        const pos=ev(c.args[0],env),size=ev(c.args[1],env),id=idArg(c,2,env),hold=ev(c.args[3],env)!==0;
        if(!id)throw rt('트리거 id 가 비어 있습니다',c.args[2]);
        let o=objects.get(id);
        if(o)o.trig={off:[pos.d[0]-o.pos.d[0],pos.d[1]-o.pos.d[1]],size:[size.d[0],size.d[1]],hold};   // [x, y] = 화면 좌표
        else{
          o={id,kind:'none',pos:matCopy(pos),scale:matCopy(size),color:'#000',vel:{r:1,c:2,d:[0,0]},trig:{off:[0,0],size:[size.d[0],size.d[1]],hold}};
          camName(id,c);objects.set(id,o);o.nw=1;
        }
        o.isTrig=0;o.trigId='';trigOn=true;checkTriggers();redraw();
        if(o.nw){delete o.nw;born(o,c);}
      }else if(t.name==='setColliderVisible'){
        if(io.dis&&io.dis.showColliders)io.dis.showColliders(ev(c.args[0],env)!==0);
        redraw();
      }
      return;
    }
    if(t.mod===DIS_ID){
      switch(t.name){
        case 'setDisplay':disOn=true;if(io.dis)io.dis.open();return;
        case 'waitF':return waitFrames(ev(c.args[0],env),env.tk,env);   // 화면 프레임 n 개만큼 기다림
        case 'setLink':return setLink(c,env);
        case 'escParent':{   // 부모 상속 해제 — 이 오브젝트가 부모에게서 떨어짐 (위치는 그대로)
          const o=objOf(idArg(c,0,env),c);
          if(o.parent){if(kids.has(o.parent))kids.get(o.parent).delete(o.id);delete o.parent;}
          return;
        }
        case 'splitParent':{   // 부모의 가정해체 — 이 오브젝트의 자식을 모두 떼어냄 (자식 위치는 그대로)
          const o=objOf(idArg(c,0,env),c);
          for(const k of kids.get(o.id)||[]){const ch=objects.get(k);if(ch&&ch.parent===o.id)delete ch.parent;}
          kids.delete(o.id);
          return;
        }
        case 'setObjPlg':{   // 다각형: 꼭짓점 3 · 4개 (세계 좌표) — 위치 = 꼭짓점을 감싸는 사각형의 가운데 · Scale = 그 크기
          if(!objOn)throw rt(NOOBJ,c);
          const nv=c.args.length-2,id=idArg(c,nv,env);
          if(!id)throw rt('오브젝트 id 가 비어 있습니다',c.args[nv]);
          curObj=objects.get(id)||null;
          let vs,color;
          try{vs=c.args.slice(0,nv).map(a=>ev(a,env).d.slice());color=parseColor(ev(c.args[nv+1],env),c.args[nv+1]);}
          finally{curObj=null;}
          const xs=vs.map(v=>v[0]),ys=vs.map(v=>v[1]),x0=Math.min(...xs),x1=Math.max(...xs),y0=Math.min(...ys),y1=Math.max(...ys);
          const cx=(x0+x1)/2,cy=(y0+y1)/2,w=x1-x0,h=y1-y0;
          const pos={r:1,c:2,d:[cx,cy]},scale={r:1,c:2,d:[w,h]},old=objects.get(id);
          const pts=vs.map(v=>[v[0]-cx,v[1]-cy]);
          if(old&&old.kind==='poly'&&old.color===color&&sameMat(old.pos,pos)&&sameMat(old.scale,scale)&&old.pts.length===pts.length&&old.pts.every((q,i)=>q[0]===pts[i][0]&&q[1]===pts[i][1]))return;   // 같으면 그대로 (매 프레임 불러도 가벼움)
          const no=keepRel(old,{id,kind:'poly',pos,scale,color,vel:velNew(old),pts:vs.map(v=>[v[0]-cx,v[1]-cy]),pbase:[w||1,h||1]});
          camName(id,c);objects.set(id,no);redraw();if(!old)born(no,c);return;
        }
        case 'setObjCyl':{   // 원 오브젝트: ([x, y], "id", 반지름, 색) — Scale = [지름, 지름] (Scale 을 바꾸면 타원)
          if(!objOn)throw rt(NOOBJ,c);
          const id=idArg(c,1,env);
          if(!id)throw rt('오브젝트 id 가 비어 있습니다',c.args[1]);
          curObj=objects.get(id)||null;
          let pos,r,color;
          try{pos=matCopy(ev(c.args[0],env));r=+ev(c.args[2],env);color=parseColor(ev(c.args[3],env),c.args[3]);}
          finally{curObj=null;}
          if(!(r>=0))throw rt(`반지름은 0 이상이어야 합니다 (받은 값: ${r})`,c.args[2]);
          const scale={r:1,c:2,d:[r*2,r*2]},old=objects.get(id);
          if(old&&old.kind==='circle'&&old.color===color&&sameMat(old.pos,pos)&&sameMat(old.scale,scale))return;
          const no=keepRel(old,{id,kind:'circle',pos,scale,color,vel:velNew(old)});
          camName(id,c);objects.set(id,no);redraw();if(!old)born(no,c);return;
        }
        case 'setObjAlpha':{   // 투명도 0 (안 보임) ~ 255 (불투명) · 범위 밖은 0 · 255 로 맞춤 · for ms 면 천천히
          const o=objOf(idArg(c,0,env),c),a=Math.max(0,Math.min(255,Math.round(+ev(c.args[1],env))||0)),ms=tweenMs(c,env);
          if(ms>0)return tween(o,'alpha',[a],ms);
          if((o.alpha==null?255:o.alpha)!==a){o.alpha=a;redraw();}
          return;
        }
        case 'setObjColor':{   // 색 바꾸기 · for ms 면 천천히
          const o=objOf(idArg(c,0,env),c),cl=parseColor(ev(c.args[1],env),c.args[1]),ms=tweenMs(c,env);
          if(ms>0)return tween(o,'color',hexRgb(cl),ms);
          if(o.color!==cl){o.color=cl;redraw();}
          return;
        }
        case 'setObjOverlay':{   // 오브젝트 모양 그대로 색을 덧씌움 — 투명도 0 (없음) ~ 255 (그 색으로 완전히 덮음) · for ms 면 천천히
          const o=objOf(idArg(c,0,env),c),cl=parseColor(ev(c.args[1],env),c.args[1]),a=Math.max(0,Math.min(255,Math.round(+ev(c.args[2],env))||0)),ms=tweenMs(c,env);
          if(ms>0){if(!o.ov||!o.ov.a)o.ov={color:cl,a:0};return tween(o,'ov',[...hexRgb(cl),a],ms);}
          const pw=tweens.get(o.id+'|ov');if(pw){tweens.delete(o.id+'|ov');pw.res();}
          if(!o.ov||o.ov.color!==cl||o.ov.a!==a){o.ov={color:cl,a};redraw();}
          return;
        }
        case 'setGlow':{   // 빛 번짐: 오브젝트 모양 둘레로 그 색이 번짐 — 세기 = 완전히 투명해질 때까지의 거리 (화면 단위 픽셀 · 0 = 없앰)
          const o=objOf(idArg(c,0,env),c),cl=parseColor(ev(c.args[1],env),c.args[1]),st=+ev(c.args[2],env);
          if(!(st>=0))throw rt(`빛 번짐 세기는 0 이상이어야 합니다 (받은 값: ${st})`,c.args[2]);
          const ng=st>0?{color:cl,s:st}:null;
          if((o.glow?o.glow.color+'|'+o.glow.s:'')!==(ng?ng.color+'|'+ng.s:'')){o.glow=ng;redraw();}
          return;
        }
        case 'rotateObj':{   // 지금 각도에서 a 도 더 (시계 반대 방향 +) — ms 동안 서서히 (시작하면 다음 줄)
          const o=objOf(idArg(c,0,env),c),a=+ev(c.args[1],env)||0,ms=+ev(c.args[2],env);
          if(!(ms>=0))throw rt(`돌리는 시간은 0 이상이어야 합니다 (받은 값: ${ms})`,c.args[2]);
          const p=tweens.get(o.id+'|angle'),to=(p?p.to[0]:(o.angle||0))+a;   // 돌고 있는 중이면 그 목표에서 더
          if(ms>0)return tween(o,'angle',[to],ms);
          if(p){tweens.delete(o.id+'|angle');p.res();}
          if((o.angle||0)!==to){setAng(o,to);redraw();}
          return;
        }
        case 'setRenderLimit':{
          const r=+ev(c.args[0],env);
          if(!(r>=0))throw rt(`그리기 반지름은 0 이상이어야 합니다 (받은 값: ${r}) — 0 = 제한 없음`,c.args[0]);
          renderLim=r;redraw();return;
        }
        case 'disableObj':case 'enableObj':{   // 비활성 = 안 그리고 · 안 움직이고 · 충돌 · 트리거 없음 · 귀속된 코드는 쉼 (자식도 같이)
          const o=objOf(idArg(c,0,env),c),off=t.name==='disableObj';
          if(o.cam&&off)throw rt(`카메라 '${o.id}' 는 비활성화할 수 없습니다`,c);
          if(!!o.off===off)return;
          o.off=off;if(off)offOn=true;
          redraw();if(!off)physStart();return;
        }
        case 'setTxtContent':{   // 글자 오브젝트의 내용 바꾸기 (obj.id.Text = 값; 과 같음)
          const o=objOf(idArg(c,0,env),c),v=String(ev(c.args[1],env));
          textOf(o,c);if(o.text!==v){o.text=v;redraw();}
          return;
        }
        case 'setTilemap':{   // dis.setTilemap([x, y], "타일맵 id 또는 경로.tl") — [x, y] = 맵의 [0, 0] 지점 (기본: 맵 가운데) · 레이어마다 한 장으로 그림 · 콜라이더 자동
          if(!objOn)throw rt(NOOBJ,c);
          const pos=ev(c.args[0],env),raw=String(ev(c.args[1],env));
          let path=imgAlias.get(raw);
          if(!path){const n=resolveTaskPath(raw,c.file);if(n!==null&&Object.hasOwn(prog.files,n))path=n;}
          if(!path||!TL_RE.test(path))throw rt(`'${raw}' 은(는) 타일맵(.tl)이 아닙니다 (mag.importFile("경로.tl") save as ("${raw}"); 로 이름을 붙이거나 .tl 경로를 쓰세요)`,c.args[1]);
          return tilemapPlace(raw,path,pos.d[0],pos.d[1],c);
        }
        case 'setObjLayer':{   // 그리는 순서 — 레이어가 클수록 위 (기본 0 · 같으면 만든 순서)
          const o=objOf(idArg(c,0,env),c),n=ev(c.args[1],env)|0;
          if((o.layer||0)!==n||!layerOn){o.layer=n;layerOn=true;redraw();}
          return;
        }
        case 'ascendObjLayer':{   // 오브젝트와 자식(과 그 자식) 의 레이어를 n 만큼 올림 (음수 = 내림)
          const o=objOf(idArg(c,0,env),c),n=ev(c.args[1],env)|0;
          const seen=new Set();
          const up=x=>{if(seen.has(x.id))return;seen.add(x.id);x.layer=(x.layer||0)+n;const ks=kids.get(x.id);if(ks)for(const k of ks){const m=objects.get(k);if(m)up(m);}};
          up(o);layerOn=true;redraw();return;
        }
        case 'tagObj':{   // 태그 붙이기 — 이후 id 란에 "<태그>" 로 태그가 붙은 오브젝트를 모두 부름
          const o=objOf(idArg(c,0,env),c),tg=String(ev(c.args[1],env));
          if(!tg||/[<>]/.test(tg))throw rt(`태그 이름은 비어 있거나 < > 가 들어갈 수 없습니다 — 받은 값: "${tg}"`,c.args[1]);
          (o.tags||(o.tags=new Set())).add(tg);
          return;
        }
        case 'removeObj':{   // 오브젝트 지우기 — 자식은 남고 부모 관계만 풀림
          const o=objOf(idArg(c,0,env),c);
          const a=anims.get(o.id);if(a){anims.delete(o.id);a.res();if(a.first){const f=a.first;a.first=null;f();}}
          for(const [key,w] of tweens)if(w.o===o){tweens.delete(key);w.res();}
          if(o.parent&&kids.has(o.parent))kids.get(o.parent).delete(o.id);
          for(const k of kids.get(o.id)||[]){const ch=objects.get(k);if(ch)delete ch.parent;}
          kids.delete(o.id);objects.delete(o.id);
          unlinkAll(o.id);   // 묶음(setLink)도 풀림
          if(o.insts)for(const i of o.insts)i.tk.dead=true;   // 귀속된 코드도 멈춤
          for(const t of objects.values())if(t.trigId===o.id){if(!t.trig.hold)t.isTrig=0;if(!t.trig.hold)t.trigId='';}
          redraw();return;
        }
        case 'enableScreenScale':case 'disableScreenScale':if(io.dis&&io.dis.screenScale)io.dis.screenScale(t.name==='enableScreenScale');return;
        case 'setParent':{   // dis.setParent() ("자식") as ("부모");
          const ch=objOf(rid(String(ev(c.relChild,env))),c.relChild),pa=objOf(rid(String(ev(c.relParent,env))),c.relParent);   // "" = 자기 자신
          if(ch===pa)throw rt(`오브젝트 '${ch.id}' 을(를) 자기 자신의 부모로 할 수 없습니다`,c);
          if(isAncestor(ch.id,pa.id))throw rt(`'${pa.id}' 은(는) 이미 '${ch.id}' 의 자식이라 부모로 할 수 없습니다 (순환)`,c);
          if(ch.parent&&kids.has(ch.parent))kids.get(ch.parent).delete(ch.id);
          ch.parent=pa.id;
          if(!kids.has(pa.id))kids.set(pa.id,new Set());
          kids.get(pa.id).add(ch.id);
          if(pa.ui&&!ch.ui){uiTree(ch);redraw();}   // UI 의 자식이 되면 자식도 UI
          return;
        }
        case 'setFont':{   // 글꼴 바꾸기 — 다 읽으면 다음 줄 · 글자 오브젝트는 모두 새 글꼴로 다시 잼
          const v=String(ev(c.args[0],env));
          let path=c.fontPath||imgAlias.get(v);
          if(!path){const n=resolveTaskPath(v,c.file);if(n!==null&&Object.hasOwn(prog.files,n))path=n;}
          if(!path)throw rt(`'${v}' 은(는) 글꼴 경로나 이름이 아닙니다 (프로젝트 안 .ttf 경로 · mag.importFile 로 붙인 이름)`,c.args[0]);
          if(!TTF_RE.test(path))throw rt(`setFont 은 .ttf · .otf 글꼴 파일만 씁니다: ${path}`,c.args[0]);
          if(!io.dis||!io.dis.setFont)return;
          return io.dis.setFont(prog.files[path]).then(()=>{
            for(const o of objects.values())if(o.kind==='text')o.fitT=null;
            redraw();ctl.last=performance.now();
          },()=>{throw rt(`글꼴 '${path}' 을(를) 읽지 못했습니다 (손상되었거나 .ttf 가 아님)`,c.args[0]);});
        }
        case 'setDisplayColor':{
          const h=ev(c.args[0],env);
          if(!HEX_RE.test(h))throw rt(`색은 헥스코드여야 합니다 (예: "#1e90ff") — 받은 값: "${h}"`,c);
          if(io.dis)io.dis.color('#'+h.replace(/^#/,''));
          return;
        }
        case 'setupObject':objOn=true;if(io.dis)io.dis.setupObject();io.sys&&io.sys('DisPlayer: 오브젝트 기능 활성화');return;
        case 'setObject':{
          if(!objOn)throw rt(NOOBJ,c);
          const id=idArg(c,1,env);
          if(!id)throw rt('오브젝트 id 가 비어 있습니다',c.args[1]);
          curObj=objects.get(id)||null;
          let pos,scale,color;
          try{pos=matCopy(ev(c.args[0],env));scale=matCopy(ev(c.args[2],env));color=parseColor(ev(c.args[3],env),c.args[3]);}
          finally{curObj=null;}
          const old=objects.get(id);
          if(old&&old.kind==='rect'&&old.color===color&&sameMat(old.pos,pos)&&sameMat(old.scale,scale))return;
          const no=keepRel(old,{id,kind:'rect',pos,scale,color,vel:velNew(old)});
          camName(id,c);objects.set(id,no);redraw();if(!old)born(no,c);return;
        }
        case 'setText':{   // 글자 오브젝트: ([x, y], "글자 내용", "id", 크기, 테두리, 색)
          if(!objOn)throw rt(NOOBJ,c);
          const id=idArg(c,2,env);
          if(!id)throw rt('글자 오브젝트 id 가 비어 있습니다',c.args[2]);
          const old=objects.get(id);
          curObj=old||null;
          let pos,text,size,outline,color;
          try{pos=matCopy(ev(c.args[0],env));text=String(ev(c.args[1],env));size=+ev(c.args[3],env);outline=ev(c.args[4],env)!==0;color=parseColor(ev(c.args[5],env),c.args[5]);}
          finally{curObj=null;}
          if(!(size>0))throw rt(`폰트 크기는 0 보다 커야 합니다 (받은 값: ${size})`,c.args[3]);
          if(old&&old.kind==='text'&&old.text===text&&old.size===size&&old.outline===outline&&old.color===color&&sameMat(old.pos,pos))return;
          const no=keepRel(old,{id,kind:'text',text,size,outline,color,pos,scale:{r:1,c:2,d:[0,size]},vel:velNew(old)});
          camName(id,c);objects.set(id,no);redraw();if(!old)born(no,c);return;
        }
        case 'setTextNudge':{   // 글자 오브젝트의 위치 기준점: 가운데 · 각 방향의 끝
          const o=objOf(idArg(c,0,env),c),v=String(ev(c.args[1],env)),n=parseNudge(v);
          if(o.kind!=='text')throw rt(`'${o.id}' 은(는) 글자 오브젝트가 아니라 기준점을 바꿀 수 없습니다 (dis.setText 로 만든 오브젝트만)`,c);
          if(!n)throw rt(NUDGE_BAD(v),c.args[1]);
          if(o.nud&&o.nud[0]===n[0]&&o.nud[1]===n[1])return;
          if(n[0]||n[1])o.nud=n;else delete o.nud;
          if(o.col)physKick(o);redraw();return;
        }
        case 'setObjNudge':{   // 오브젝트의 위치 기준점(피벗): 가운데 · 각 방향의 끝 — 크기가 바뀌어도 기준점은 그대로
          const o=objOf(idArg(c,0,env),c),v=String(ev(c.args[1],env)),n=parseNudge(v);
          if(!n)throw rt(NUDGE_BAD(v),c.args[1]);
          if(o.nud&&o.nud[0]===n[0]&&o.nud[1]===n[1])return;
          if(n[0]||n[1])o.nud=n;else delete o.nud;
          if(o.col)physKick(o);redraw();return;
        }
        case 'nudgeObj':{   // 화면 가장자리에 붙이기: [왼쪽?, 위?] — 1 이면 왼쪽/위, 0 이면 오른쪽/아래
          const o=objOf(idArg(c,0,env),c),side=ev(c.args[1],env),gx=+ev(c.args[2],env),gy=+ev(c.args[3],env);
          if(!disOn||!io.dis)throw rt('화면이 없습니다 — 먼저 dis.setDisplay(); 를 실행하세요',c);
          if(o.kind==='text')fitText(o);
          const [W,H]=io.dis.size(),w=Math.abs(o.scale.d[0]),h=Math.abs(o.scale.d[1]);
          const ox=nudX(o),oy=nudY(o);   // setTextNudge · setObjNudge: 위치 = 기준점
          setMat(o,'pos',{r:1,c:2,d:[(side.d[0]!==0?-W/2+gx+w/2:W/2-gx-w/2)-ox,(side.d[1]!==0?H/2-gy-h/2:-H/2+gy+h/2)-oy]});return;   // (0,0) = 가운데
        }
        case 'setObjScale':case 'setObjPos':{
          const o=objOf(idArg(c,0,env),c);
          curObj=o;
          let m;try{m=ev(c.args[1],env);}finally{curObj=null;}
          const ms=tweenMs(c,env);
          if(ms>0)return t.name==='setObjPos'?moveAnim(o,matCopy(m),ms,true,easeOf(c,env)):tween(o,'scale',[m.d[0],m.d[1]],ms);
          setMat(o,t.name==='setObjPos'?'pos':'scale',m);return;
        }
        case 'moveObj':{   // 지금 위치 → to 위치로 ms 동안 곧게 이동 (끝날 때까지 기다림)
          const o=objOf(idArg(c,0,env),c);
          let to;curObj=o;
          try{to=matCopy(ev(c.toExpr,env));}finally{curObj=null;}
          const ms=c.forExpr?ev(c.forExpr,env):0;
          if(ms<0)throw rt(`이동 시간은 0 이상이어야 합니다 (받은 값: ${ms})`,c.forExpr);
          if(ms===0){if(!pathBlocked(o,to.d))setMat(o,'pos',to);return;}   // 움직이는 쪽에 벽이 있으면 그대로
          return moveAnim(o,to,ms,false,easeOf(c,env));
        }
        case 'getVar':{
          const o=objOf(idArg(c,0,env),c),nm=ev(c.args[1],env),pv=parseObjVar(nm);
          if(!pv)throw rt(`getVar 이름은 coord(position) · scale · color · text 중 하나입니다 — 받은 값: "${nm}"`,c);
          let val,ty;
          if(o.kind==='text')fitText(o);
          if(pv.idx){
            if(STR_KEYS.has(pv.key))throw rt(`${pv.key} 에는 [행, 열] 성분이 없습니다`,c);
            const m=o[pv.key];val=m.d[ix(pv.idx[0],m.r,'행',c)*m.c+ix(pv.idx[1],m.c,'열',c)];ty='float';
          }else if(pv.key==='color'){val=o.color;ty='string';}
          else if(pv.key==='istrig'){val=trigOf(o,c).isTrig;ty='bit';}
          else if(pv.key==='trigid'){val=trigOf(o,c).trigId;ty='string';}
          else if(pv.key==='text'){val=textOf(o,c);ty='string';}
          else{val=o[pv.key];ty='matrix';}
          const sl=slotOf(c.asInfo,c.asName,env,c);
          if(ty==='matrix'?(sl.ty!=='matrix'||sl.v.r!==1||sl.v.c!==2):!assignable(sl.ty,ty))
            throw rt(`${ty==='matrix'?'matrix[1, 2]':ty} 값을 변수 '${c.asName}' 에 넣을 수 없습니다`,c);
          sl.v=co(val,sl.ty);return;
        }
      }
    }
    const f=fns.get(t.mod+'.'+t.name);
    const dc=dcOf(env);
    if(dc.n>=200)throw rt('함수 호출이 너무 깊습니다 (무한 재귀?)',c);
    const fenv=new Env(f.env);fenv.dc=dc;
    f.def.params.forEach((p,i)=>fenv.def(p.name,p.ty,co(ev(c.args[i],env),p.ty)));
    dc.n++;
    let r;
    try{r=seq(f.def.body,0,fenv);}catch(e){dc.n--;if(e instanceof JBRet)return;if(e instanceof JBGoto)throw new JBError(e.message,e.line,e.file);throw e;}
    if(r)return r.then(undefined,e=>{if(e instanceof JBGoto)throw new JBError(e.message,e.line,e.file);if(!(e instanceof JBRet))throw e;}).finally(()=>{dc.n--;});
    dc.n--;
  }
  // 식 안에서 부르는 함수 — 기다리지 않고 끝까지 실행해 값을 돌려줌
  function callValue(c,env){
    const f=fns.get(c.target.mod+'.'+c.name);
    const dc=dcOf(env);
    if(dc.n>=200)throw rt('함수 호출이 너무 깊습니다 (무한 재귀?)',c);
    const fenv=new Env(f.env);fenv.dc=dc;
    f.def.params.forEach((p,i)=>fenv.def(p.name,p.ty,co(ev(c.args[i],env),p.ty)));
    const prevSelf=selfNow;
    dc.n++;
    if(syncDepth++===0){syncNode=c;syncStart=performance.now();}
    try{seq(f.def.body,0,fenv);}
    catch(e){if(e instanceof JBRet)return e.v;if(e instanceof JBGoto)throw new JBError(e.message,e.line,e.file);throw e;}
    finally{dc.n--;syncDepth--;selfNow=prevSelf;}
    return dflt(f.def.retTy,f.def.retDims);   // return(값) 없이 끝나면 기본값 (0 · "" · 빈 리스트 · 0 행렬)
  }
  function waitFrames(n,tk,env){
    n=n|0;if(n<=0)return;
    return new Promise((res,rej)=>{
      const step=()=>{
        if(halted)return rej(halted);
        if(ctl.stop)return rej(STOP);
        if(tk&&tk.dead)return rej(tk);
        if(frozenEnv(tk,env)){raf(step);return;}   // 팝업 장면이 열려 멈춘 동안은 프레임을 세지 않음
        if(--n<=0){ctl.last=performance.now();return res();}
        raf(step);
      };
      raf(step);
    });
  }
  for(const m of prog.libs){
    const env=envs.get(m.name);
    for(const s of m.ast)if(s.k==='var')exec(s,env);
  }
  if(io.dis&&io.dis.keysOn)io.dis.keysOn(true);   // 실행하는 동안 키 입력을 받음
  try{await runTask(prog.mainPath);}
  finally{while(bg.size)await Promise.allSettled([...bg]);await null;if(drawPend){drawPend=false;if(io.dis&&io.dis.draw)io.dis.draw(drawList());}physStop();if(io.dis&&io.dis.keysOn)io.dis.keysOn(false);
    sndStopAll();if(snd.timer){clearInterval(snd.timer);snd.timer=null;}   // 정상 종료여도 소리 · 공간 음향 타이머 정리
    if(snd.ctx){try{snd.ctx.close().catch(()=>{});}catch(e){}snd.ctx=null;}}   // setup 으로 띄운 작업이 끝날 때까지 · 끝나면 움직임도 멈춤
  if(halted)throw halted;
}

/* ---------- C generator ---------- */
const objTxt=t=>t.id===null?`obj.${t.prop}`:`obj.${t.id}.${t.k==='objvar'?t.name:t.prop}`;
// C 변환에서 DisPlayer · colliders · Canvas 를 쓰면 붙는 화면 런타임 (SDL2 · 글자는 SDL2_ttf)
const JB_DIS_C="/* ===== Jawbreaker DisPlayer runtime (SDL2) — DisPlayer · colliders · Canvas ===== */\n#define SDL_MAIN_HANDLED\n#if defined(__GNUC__)\n#pragma GCC diagnostic ignored \"-Wunused-function\"\n#pragma GCC diagnostic ignored \"-Wunused-variable\"\n#endif\n#include <SDL.h>\n#include <time.h>\n#ifdef JB_TTF\n#include <SDL_ttf.h>\n#endif\n#ifdef JB_IMG\n#include <SDL_image.h>\n#endif\n#ifndef JB_ID_MAX\n#define JB_ID_MAX 64\n#endif\n#define JB_MAXI 16\n#define JB_GRAVITY 980.0\ntypedef struct jb_tk { volatile int dead; int task; void *ctx; char self[JB_ID_MAX]; int isScene; } jb_tk;\ntypedef struct jb_obj {\n    char id[JB_ID_MAX]; int kind;               /* 0 사각형 · 1 글자 · 2 원 · 3 없음(콜라이더/트리거만) */\n    double pos[2], scale[2], vel[2];\n    char color[8]; int alpha, layer, anchored, off;\n    char ovCol[8]; int ovA; void *ovTex; char ovKey[JB_STR_MAX + 64];   /* dis.setObjOverlay: 덧씌우는 색 · 투명도 (0 = 없음) · 글자용 캐시 */\n    int hasCol; double coff[2], csize[2], ce; int cgrav;\n    int hasTrig; double toff[2], tsize[2]; int thold, isTrig; char trigId[JB_ID_MAX];\n    char parent[JB_ID_MAX];\n    char text[JB_STR_MAX]; double fsize, fitS; int outline; char fitT[JB_STR_MAX];\n    char tags[8][32]; int ntags;\n    unsigned long long scenes; int hasScenes;\n    int anim; double afrom[2], ato[2], astart, ams; int aease;   /* aease: 0 linear · 1 sin · 2 sinright · 3 sinleft */\n    int tw[5]; double twFrom[5][4], twTo[5][4], twStart[5], twMs[5];   /* 시간을 들여 바뀌는 중: 0 크기 · 1 투명도 · 2 색 · 3 각도 · 4 오버레이 (r g b a) */\n    int an, anA, anK, anNA; double anStart, anDur, anNSp;   /* Magellan 애니메이션: 재생 중 · 번호 · 지금 프레임 · 다음(번호 + 1) · 시작 · 프레임 길이 · 다음 배속 */\n    int npts; double pts[4][2], pbase[2];   /* dis.setObjPlg: 꼭짓점 (가운데 기준 · 만들 때 크기 pbase) */\n    int ui;                   /* can.setUi: 카메라에 고정 (위치 = 화면 좌표) */\n    double ang;               /* dis.rotateObj: 각도 (도, 시계 반대 방향 +) */\n    int nud[2];               /* dis.setTextNudge: 글자 가운데 = 위치 + [nud0 × 폭/2, nud1 × 높이/2] */\n    unsigned long colN; char colWith[JB_ID_MAX];   /* 마지막으로 부딪힌 물리 틱 · 부딪힌 콜라이더 id (col.obj.id.isCollided · collidedObj) */\n    jb_tk *inst[JB_MAXI]; int ninst;\n    void *tex; char texKey[JB_STR_MAX + 64];\n    int texN; double tx[4];   /* Magellan 텍스쳐: texN = 저장된 이미지 번호 + 1 · tx = x1 y1 x2 y2 */\n    int btn; double btnSeen, relSeen;  /* can.setasButton · 마지막으로 알린 클릭 시각 */\n    int held, relPend; double relAt;   /* 버튼: held 누른 채 버튼 위 (어디서 눌렀든 · 다시 들어와도) · 아직 알리지 않은 뗌 (밖으로 나간 순간 포함) · 마지막 뗌 시각 */\n    unsigned smark;           /* 한 번의 이동에서 이미 옮긴 오브젝트 (부모 · 자식 · 묶음이 겹쳐도 한 번만) */\n    int cam; double zoom; char follow[JB_ID_MAX];   /* SeongBin 카메라 (id \"cam.이름\") · 배율 · 따라가는 오브젝트 */\n} jb_obj;\ntypedef struct { char id[512]; SDL_Surface *surf; SDL_Texture *tex; int w, h; SDL_Texture *mask; } jb_texr;   /* 읽어 둔 이미지 (id = 경로) */\nstatic jb_texr jb_texs[256]; static int jb_ntex = 0;\nstatic __thread const char *jb_tself = NULL;   /* 지금 스레드가 실행 중인 귀속 오브젝트 id */\nstatic __thread jb_tk *jb_ttk = NULL;\nstatic pthread_mutex_t jb_mx;\nstatic pthread_cond_t jb_cv = PTHREAD_COND_INITIALIZER;\nstatic jb_obj **jb_o = NULL; static int jb_n = 0, jb_cap = 0;\nstatic unsigned long jb_physN = 1;   /* 물리 틱 번호 (isCollided) */\nstatic double jb_rlim = 0;          /* dis.setRenderLimit: 메인 카메라 가운데에서 이 반지름(화면 픽셀) 안만 그림 · 0 = 제한 없음 */\nstatic int jb_objOn = 0, jb_colOn = 0, jb_trigOn = 0, jb_showCol = 0, jb_offOn = 0, jb_layerOn = 0;\nstatic double jb_grav = 1.0;\nstatic unsigned long jb_frame = 0;\nstatic int jb_wantWin = 0, jb_winReady = 0, jb_scaleLabel = 1, jb_logo = 1, jb_W = 0, jb_H = 0;\nstatic char jb_bgCol[8] = \"#000000\";\n/* 화면 단위: 짧은 쪽이 720 (세로 모드 = 가로 720 · 가로 모드 = 세로 720) — 위치 · 크기 · 마우스 · displayX/Y 모두 이 단위 */\nstatic double jb_u(void) { int m = jb_W < jb_H ? jb_W : jb_H; return m > 0 ? m / 720.0 : 1.0; }\nstatic double jb_mx_ = 0, jb_my_ = 0; static int jb_pDown = 0, jb_mIn = 0; static unsigned long jb_tapUntil = 0;   /* 짧게 눌러도 최소 1 프레임 (이 프레임 전까지 ScreenClicked = 1) */\nstatic struct { double dx, dy, ux, uy, t; unsigned long f, df; } jb_clk[32]; static int jb_nclk = 0; static double jb_downX = 0, jb_downY = 0; static unsigned long jb_downF = 0;   /* 클릭 (누른 곳 · 뗀 곳) */\nstatic int jb_sceneOn = 0, jb_scene = 0, jb_nscene = 0; static char jb_sceneName[64][JB_ID_MAX];\nstatic jb_tk *jb_sceneTk[32]; static int jb_nsceneTk = 0;\nstatic volatile int jb_running = 0;   /* 귀속 코드 스레드 수 */\nstatic void *jb_trash[256]; static int jb_ntrash = 0;\nstatic const char *jb_title = \"Jawbreaker\";\nstatic void jb_start_bound(jb_obj *o);           /* 생성된 코드: id 에 귀속된 파일 실행 */\nstatic void jb_start_scene(const char *name);    /* 생성된 코드: 장면에 귀속된 파일 실행 */\nstatic void jb_inst_start(int task, const char *self, jb_tk *tk);\n#define JB_LOCK() pthread_mutex_lock(&jb_mx)\n#define JB_UNLOCK() pthread_mutex_unlock(&jb_mx)\nstatic double jb_now(void) { return (double)SDL_GetPerformanceCounter() * 1000.0 / (double)SDL_GetPerformanceFrequency(); }\nstatic void jb_err(int line, const char *fmt, ...) {\n    va_list ap; va_start(ap, fmt);\n    fprintf(stderr, \"line %d: \", line); vfprintf(stderr, fmt, ap); fprintf(stderr, \"\\n\");\n    va_end(ap); exit(1);\n}\nstatic size_t jb_idlen(const char *s) {   /* id 는 63바이트까지 — UTF-8 글자 중간에서 자르지 않음 */\n    size_t n = strlen(s);\n    if (n <= JB_ID_MAX - 1) return n;\n    n = JB_ID_MAX - 1;\n    while (n > 0 && ((unsigned char)s[n] & 0xC0) == 0x80) n--;\n    return n;\n}\nstatic void jb_idcpy(char *d, const char *s) { size_t n = jb_idlen(s); memmove(d, s, n); d[n] = 0; }\nstatic jb_obj *jb_find(const char *id) {   /* jb_idcpy 와 같은 방식으로 잘라서 비교 */\n    size_t n = jb_idlen(id);\n    for (int i = 0; i < jb_n; i++) if (strncmp(jb_o[i]->id, id, n) == 0 && jb_o[i]->id[n] == 0) return jb_o[i];\n    return NULL;\n}\nstatic const char *jb_rid(const char *id) { return (id[0] == 0 && jb_tself) ? jb_tself : id; }\nstatic jb_obj *jb_get(const char *id, int line) {\n    if (!jb_objOn) jb_err(line, \"objects are off - call dis.setupObject(); first\");\n    id = jb_rid(id);\n    jb_obj *o = jb_find(id);\n    if (!o) jb_err(line, \"object '%s' does not exist\", id);\n    return o;\n}\n/* ---- 활성 · 장면 ---- */\nstatic int jb_live(jb_obj *o) {\n    if (!jb_offOn && !jb_sceneOn) return 1;\n    for (int n = 0; o && n < 1000; n++) {\n        if (o->off) return 0;\n        if (jb_sceneOn && o->hasScenes && !(o->scenes & (1ULL << jb_scene))) return 0;\n        o = o->parent[0] ? jb_find(o->parent) : NULL;\n    }\n    return 1;\n}\n/* ---- SeongBin: 카메라 ---- */\nstatic int jb_camOn = 0, jb_mkCam = 0; static char jb_camMain[64][JB_ID_MAX]; static double jb_rz = 1;\nstatic int jb_camNow(double *x, double *y, double *z) {   /* 지금 장면의 카메라 (메인 → 없으면 처음 카메라) */\n    if (!jb_camOn) return 0;\n    int k = jb_sceneOn ? jb_scene : 0;\n    jb_obj *o = jb_camMain[k][0] ? jb_find(jb_camMain[k]) : NULL;\n    if (!o || !jb_live(o)) o = jb_find(\"cam.default\");   /* 고른 메인 카메라가 없으면 cam.default */\n    if (!o) return 0;\n    *x = o->pos[0]; *y = o->pos[1]; *z = o->zoom > 0 ? o->zoom : 1; return 1;\n}\nstatic void jb_camDefault(void);\nstatic void jb_toW(double sx, double sy, double *wx, double *wy) { double x, y, z; if (jb_camNow(&x, &y, &z)) { *wx = x + sx / z; *wy = y + sy / z; } else { *wx = sx; *wy = sy; } }\n/* ---- 부모 · 자식 ---- */\nstatic unsigned jb_shiftGen = 0;\nstatic struct { char a[JB_ID_MAX], b[JB_ID_MAX]; } *jb_lk = NULL; static int jb_nlk = 0, jb_caplk = 0;   /* dis.setLink 묶음 (양쪽) */\nstatic void jb_shift(const char *id, double dx, double dy, int depth) {   /* 자식 · 대표하는 오브젝트를 같이 옮김 */\n    if ((dx == 0 && dy == 0) || depth > 64) return;\n    jb_obj *c = jb_find(id);\n    if (depth == 0) { jb_shiftGen++; if (c) c->smark = jb_shiftGen; }\n    for (int i = 0; i < jb_n; i++) if (strcmp(jb_o[i]->parent, id) == 0 && jb_o[i]->smark != jb_shiftGen) {\n        jb_o[i]->smark = jb_shiftGen; jb_o[i]->pos[0] += dx; jb_o[i]->pos[1] += dy; jb_shift(jb_o[i]->id, dx, dy, depth + 1);\n    }\n    for (int i = 0; i < jb_nlk; i++) {   /* 묶인 오브젝트도 같이 */\n        const char *o = !strcmp(jb_lk[i].a, id) ? jb_lk[i].b : !strcmp(jb_lk[i].b, id) ? jb_lk[i].a : NULL;\n        jb_obj *g = o ? jb_find(o) : NULL;\n        if (g && g->smark != jb_shiftGen) { g->smark = jb_shiftGen; g->pos[0] += dx; g->pos[1] += dy; jb_shift(g->id, dx, dy, depth + 1); }\n    }\n}\n/* o 를 da 도 더 돌림 — 같이 움직이는 것(자식 · setLink 묶음과 그 자식 …)도 한 덩어리로 같이 돎\n   피벗: setLink 로 묶여 있으면 묶음 오브젝트들 피벗(위치)의 가운데, 아니면 o 의 위치 (자식은 부모 피벗을 축으로) */\nstatic void jb_rotGroup(jb_obj *o, double da) {\n    if (da == 0) return;\n    jb_obj **st = malloc(sizeof *st * (size_t)(jb_n + 1)); if (!st) exit(1);\n    int ns = 0, ng = 0; double px = 0, py = 0;\n    unsigned g = ++jb_shiftGen; o->smark = g; st[ns++] = o;\n    while (ns) {   /* setLink 묶음 */\n        jb_obj *k = st[--ns]; ng++; px += k->pos[0]; py += k->pos[1];\n        for (int i = 0; i < jb_nlk; i++) {\n            const char *x = !strcmp(jb_lk[i].a, k->id) ? jb_lk[i].b : !strcmp(jb_lk[i].b, k->id) ? jb_lk[i].a : NULL;\n            jb_obj *m = x ? jb_find(x) : NULL; if (m && m->smark != g) { m->smark = g; st[ns++] = m; }\n        }\n    }\n    px /= ng; py /= ng;\n    double r = da * 0.017453292519943295, c = cos(r), s = sin(r);\n    g = ++jb_shiftGen; o->smark = g; st[ns++] = o;\n    while (ns) {   /* 같이 움직이는 덩어리 전체 */\n        jb_obj *k = st[--ns];\n        double x = k->pos[0] - px, y = k->pos[1] - py; k->pos[0] = px + x * c - y * s; k->pos[1] = py + x * s + y * c; k->ang += da;\n        for (int i = 0; i < jb_n; i++) if (!strcmp(jb_o[i]->parent, k->id) && jb_o[i]->smark != g) { jb_o[i]->smark = g; st[ns++] = jb_o[i]; }\n        for (int i = 0; i < jb_nlk; i++) {\n            const char *x2 = !strcmp(jb_lk[i].a, k->id) ? jb_lk[i].b : !strcmp(jb_lk[i].b, k->id) ? jb_lk[i].a : NULL;\n            jb_obj *m = x2 ? jb_find(x2) : NULL; if (m && m->smark != g) { m->smark = g; st[ns++] = m; }\n        }\n    }\n    free(st);\n}\nstatic void jb_movePos(jb_obj *o, double x, double y) { double dx = x - o->pos[0], dy = y - o->pos[1]; o->pos[0] = x; o->pos[1] = y; jb_shift(o->id, dx, dy, 0); }\nstatic int jb_isAnc(const char *a, const char *b) {   /* a 가 b 의 조상? */\n    jb_obj *x = jb_find(b);\n    for (int n = 0; x && x->parent[0] && n < 1000; n++) { if (strcmp(x->parent, a) == 0) return 1; x = jb_find(x->parent); }\n    return 0;\n}\n/* ---- 글자 ---- */\n#ifdef JB_TTF\nstatic char jb_fontPath[512] = \"\"; static int jb_fontTried = 0;\nstatic TTF_Font *jb_fonts[64]; static int jb_fontSz[64]; static int jb_nfont = 0;\nstatic TTF_Font *jb_font(int px) {\n    if (px < 1) px = 1;\n    for (int i = 0; i < jb_nfont; i++) if (jb_fontSz[i] == px) return jb_fonts[i];\n    if (!jb_fontTried) {\n        jb_fontTried = 1;\n        const char *env = getenv(\"JB_FONT\");\n        const char *cands[] = { env ? env : \"\", \"C:\\\\Windows\\\\Fonts\\\\malgun.ttf\", \"C:\\\\Windows\\\\Fonts\\\\arial.ttf\",\n            \"/System/Library/Fonts/AppleSDGothicNeo.ttc\", \"/System/Library/Fonts/Supplemental/AppleGothic.ttf\", \"/Library/Fonts/Arial Unicode.ttf\",\n            \"/usr/share/fonts/truetype/nanum/NanumGothic.ttf\", \"/usr/share/fonts/opentype/noto/NotoSansCJK-Regular.ttc\",\n            \"/usr/share/fonts/noto-cjk/NotoSansCJK-Regular.ttc\", \"/usr/share/fonts/google-noto-cjk/NotoSansCJK-Regular.ttc\",\n            \"/usr/share/fonts/truetype/dejavu/DejaVuSans.ttf\", \"/usr/share/fonts/TTF/DejaVuSans.ttf\" };\n        for (size_t i = 0; i < sizeof cands / sizeof cands[0]; i++) {\n            if (!cands[i][0]) continue;\n            FILE *f = fopen(cands[i], \"rb\");\n            if (f) { fclose(f); strncpy(jb_fontPath, cands[i], sizeof jb_fontPath - 1); break; }\n        }\n        if (!jb_fontPath[0]) fprintf(stderr, \"Jawbreaker: no font found - set JB_FONT=/path/to/font.ttf to draw text\\n\");\n    }\n    if (!jb_fontPath[0] || jb_nfont >= 64) return NULL;\n    TTF_Font *f = TTF_OpenFont(jb_fontPath, px);\n    if (!f) return NULL;\n    TTF_SetFontStyle(f, TTF_STYLE_BOLD);\n    jb_fonts[jb_nfont] = f; jb_fontSz[jb_nfont] = px; jb_nfont++;\n    return f;\n}\n#endif\n/* 글자 크기 = 실제 글자 높이: 가장 높은 글자(H · 가) 윗끝 ~ 가장 낮은 글자(g · j · p · y) 아랫끝 — 글꼴마다 '글자 높이 / 글꼴 크기' 비율 jb_fk */\nstatic double jb_fk = 0, jb_fOff = 0;   /* jb_fOff: 글꼴 크기 1 일 때 줄 상자 가운데 → 글자 가운데 (아래 +) */\nstatic double jb_fontK(void) {\n    if (jb_fk > 0) return jb_fk;\n    jb_fk = 0.72; jb_fOff = 0;\n#ifdef JB_TTF\n    TTF_Font *f = jb_font(100);\n    if (f) {\n        int mn, mx, top = 0, bot = 0, a, y0, y1; const Uint16 up[] = { 'H', 0xAC00 }, dn[] = { 'g', 'j', 'p', 'y' };\n        for (int i = 0; i < 2; i++) if (TTF_GlyphIsProvided(f, up[i]) && TTF_GlyphMetrics(f, up[i], &mn, &mx, &y0, &y1, &a) == 0 && y1 > top) top = y1;\n        for (int i = 0; i < 4; i++) if (TTF_GlyphIsProvided(f, dn[i]) && TTF_GlyphMetrics(f, dn[i], &mn, &mx, &y0, &y1, &a) == 0 && y0 < bot) bot = y0;\n        if (top - bot > 0) { jb_fk = (top - bot) / 100.0; jb_fOff = ((TTF_FontAscent(f) - (top + bot) / 2.0) - TTF_FontHeight(f) / 2.0) / 100.0; }\n    }\n#endif\n    return jb_fk;\n}\nstatic double jb_measure1(const char *t, double size);\nstatic double jb_measure(const char *t, double size) {   /* 여러 줄이면 가장 긴 줄 */\n    if (!strchr(t, '\\n')) return jb_measure1(t, size);\n    char ln[JB_STR_MAX]; double w = 0;\n    for (const char *p = t;;) {\n        const char *q = strchr(p, '\\n'); size_t k = q ? (size_t)(q - p) : strlen(p); if (k >= sizeof ln) k = sizeof ln - 1;\n        memcpy(ln, p, k); ln[k] = 0; double v = jb_measure1(ln, size); if (v > w) w = v;\n        if (!q) break;\n        p = q + 1;\n    }\n    return w;\n}\nstatic int jb_nlines(const char *t) { int n = 1; for (; *t; t++) if (*t == '\\n') n++; return n; }\nstatic double jb_textH(jb_obj *o) { return fabs(o->scale[1]) * (1 + 1.2 * (jb_nlines(o->text) - 1)); }\nstatic double jb_nudX(jb_obj *o) { return o->nud[0] * fabs(o->scale[0]) / 2; }\nstatic double jb_nudY(jb_obj *o) { return o->nud[1] * (o->kind == 1 ? jb_textH(o) : fabs(o->scale[1])) / 2; }\nstatic double jb_measure1(const char *t, double size) {\n#ifdef JB_TTF\n    TTF_Font *f = jb_font((int)(size / jb_fontK() + 0.5));   /* 크기 = 글자 높이 → 글꼴 크기 = 크기 / 비율 */\n    int iw = 0, ih = 0;\n    if (f && TTF_SizeUTF8(f, t, &iw, &ih) == 0) return iw;\n#endif\n    double w = 0;   /* 글꼴이 없으면 어림값: 한글 등 전각 1칸, 나머지 0.55칸 */\n    for (const unsigned char *p = (const unsigned char *)t; *p; ) {\n        unsigned cp = *p; int n = 1;\n        if (cp >= 0xF0) { cp &= 7; n = 4; } else if (cp >= 0xE0) { cp &= 15; n = 3; } else if (cp >= 0xC0) { cp &= 31; n = 2; }\n        for (int k = 1; k < n && p[k]; k++) cp = (cp << 6) | (p[k] & 63);\n        w += cp >= 0x2e80 ? 1.0 : 0.55; p += n;\n    }\n    return w * size;\n}\n/* dis.setFont(\"경로.ttf\") — 이후 모든 글자 오브젝트가 이 글꼴 (다시 잼 · 다시 그림) */\nstatic const char *jb_aliasPath(const char *id);\nstatic const char *jb_fontArg(const char *v) { const char *p = jb_aliasPath(v); return p ? p : v; }\nstatic void jb_setFont(const char *path, int line) {\n    size_t n = strlen(path);\n    if (n < 4 || strcmp(path + n - 4, \".ttf\")) jb_err(line, \"setFont only takes .ttf font files: %s\", path);\n    FILE *f = fopen(path, \"rb\"); if (!f) jb_err(line, \"can't open the font '%s'\", path); fclose(f);\n    JB_LOCK();\n#ifdef JB_TTF\n    for (int i = 0; i < jb_nfont; i++) TTF_CloseFont(jb_fonts[i]);\n    jb_nfont = 0; jb_fontTried = 1; snprintf(jb_fontPath, sizeof jb_fontPath, \"%s\", path);\n#endif\n    jb_fk = 0;   /* 새 글꼴의 비율을 다시 잼 */\n    for (int i = 0; i < jb_n; i++) if (jb_o[i]->kind == 1) { jb_o[i]->fitS = -1; jb_o[i]->texKey[0] = 0; }\n    JB_UNLOCK();\n}\nstatic void jb_fit(jb_obj *o) {\n    if (o->kind != 1) return;\n    double size = o->scale[1];\n    if (size == o->fitS && strcmp(o->text, o->fitT) == 0) return;\n    o->fsize = size; o->fitS = size; strcpy(o->fitT, o->text);\n    o->scale[0] = jb_measure(o->text, size);\n}\n/* ---- 오브젝트 만들기 ---- */\nstatic jb_obj *jb_make(const char *id, int line, int *isNew) {\n    if (!jb_objOn) jb_err(line, \"objects are off - call dis.setupObject(); first\");\n    if (!id[0]) jb_err(line, \"the object id is empty\");\n    jb_obj *o = jb_find(id);\n    *isNew = !o;\n    if (o) return o;\n    if (!jb_mkCam && !strncmp(id, \"cam.\", 4)) jb_err(line, \"names starting with 'cam.' are for cameras ('%s') - make cameras with seo.setCam(\\\"name\\\");\", id);\n    if (!jb_mkCam && !strncmp(id, \"spk.\", 4)) jb_err(line, \"names starting with 'spk.' are for speakers ('%s') - make speakers with sou.setSpeaker(\\\"name\\\");\", id);\n    o = calloc(1, sizeof *o);\n    if (!o) { fprintf(stderr, \"out of memory\\n\"); exit(1); }\n    jb_idcpy(o->id, id); o->alpha = 255; strcpy(o->color, \"#000000\");\n    if (jb_n >= jb_cap) { jb_cap = jb_cap ? jb_cap * 2 : 32; jb_o = realloc(jb_o, sizeof(jb_obj *) * (size_t)jb_cap); if (!jb_o) exit(1); }\n    jb_o[jb_n++] = o;\n    return o;\n}\nstatic void jb_born(jb_obj *o) {   /* 새 오브젝트: 장면 · 부모(귀속 코드에서 만들면 자식) · 귀속된 파일 실행 */\n    if (jb_sceneOn && !o->hasScenes) { o->hasScenes = 1; o->scenes = 1ULL << jb_scene; }\n    if (jb_tself && strcmp(jb_tself, o->id) != 0 && !o->parent[0] && jb_find(jb_tself)) jb_idcpy(o->parent, jb_tself);\n    jb_start_bound(o);\n}\nstatic void jb_setPosShift(jb_obj *o, const double *p) { jb_movePos(o, p[0], p[1]); }\nstatic const char *jb_colstr(const char *s, int line) {\n    static __thread char b[8];\n    const char *h = s[0] == '#' ? s + 1 : s; size_t n = strlen(h);\n    if (n != 3 && n != 6) jb_err(line, \"colors are hex codes like \\\"#ff8800\\\" (got \\\"%s\\\")\", s);\n    for (size_t i = 0; i < n; i++) if (!isxdigit((unsigned char)h[i])) jb_err(line, \"colors are hex codes like \\\"#ff8800\\\" (got \\\"%s\\\")\", s);\n    if (n == 3) snprintf(b, sizeof b, \"#%c%c%c%c%c%c\", h[0], h[0], h[1], h[1], h[2], h[2]); else snprintf(b, sizeof b, \"#%s\", h);\n    return b;\n}\nstatic const char *jb_coli(int v, int line) { char t[16]; snprintf(t, sizeof t, \"%d\", v); if (strlen(t) != 3 && strlen(t) != 6) jb_err(line, \"a numeric color needs 3 or 6 digits (got %d)\", v); return jb_colstr(t, line); }\nstatic void jb_setObject(const char *id, const double *pos, const double *sc, const char *color, int line) {\n    JB_LOCK(); int nw; id = jb_rid(id);\n    jb_obj *o = jb_make(id, line, &nw);\n    double dx = pos[0] - o->pos[0], dy = pos[1] - o->pos[1];\n    o->kind = 0; o->pos[0] = pos[0]; o->pos[1] = pos[1]; o->scale[0] = sc[0]; o->scale[1] = sc[1]; strcpy(o->color, color);\n    if (!nw) jb_shift(o->id, dx, dy, 0); else jb_born(o);\n    JB_UNLOCK();\n}\nstatic void jb_setObjPlg(const char *id, int n, const double *a, const double *b, const double *q, const double *d, const char *color, int line) {   /* 다각형 (꼭짓점 3 · 4개) */\n    const double *v[4] = { a, b, q, d };\n    double x0 = 1e300, x1 = -1e300, y0 = 1e300, y1 = -1e300;\n    for (int k = 0; k < n; k++) { if (v[k][0] < x0) x0 = v[k][0]; if (v[k][0] > x1) x1 = v[k][0]; if (v[k][1] < y0) y0 = v[k][1]; if (v[k][1] > y1) y1 = v[k][1]; }\n    double cx = (x0 + x1) / 2, cy = (y0 + y1) / 2;\n    JB_LOCK(); int nw; id = jb_rid(id);\n    jb_obj *o = jb_make(id, line, &nw);\n    double dx = cx - o->pos[0], dy = cy - o->pos[1];\n    o->kind = 4; o->pos[0] = cx; o->pos[1] = cy; o->scale[0] = x1 - x0; o->scale[1] = y1 - y0; strcpy(o->color, color);\n    o->npts = n; for (int k = 0; k < n; k++) { o->pts[k][0] = v[k][0] - cx; o->pts[k][1] = v[k][1] - cy; }\n    o->pbase[0] = o->scale[0] ? o->scale[0] : 1; o->pbase[1] = o->scale[1] ? o->scale[1] : 1;\n    if (!nw) jb_shift(o->id, dx, dy, 0); else jb_born(o);\n    JB_UNLOCK();\n}\nstatic void jb_setObjCyl(const char *id, const double *pos, double r, const char *color, int line) {\n    if (!(r >= 0)) jb_err(line, \"the radius must be 0 or more (got %g)\", r);\n    JB_LOCK(); int nw; id = jb_rid(id);\n    jb_obj *o = jb_make(id, line, &nw);\n    double dx = pos[0] - o->pos[0], dy = pos[1] - o->pos[1];\n    o->kind = 2; o->pos[0] = pos[0]; o->pos[1] = pos[1]; o->scale[0] = o->scale[1] = r * 2; strcpy(o->color, color);\n    if (!nw) jb_shift(o->id, dx, dy, 0); else jb_born(o);\n    JB_UNLOCK();\n}\nstatic void jb_setText(const char *id, const double *pos, const char *text, double size, int outline, const char *color, int line) {\n    if (!(size > 0)) jb_err(line, \"the font size must be more than 0 (got %g)\", size);\n    JB_LOCK(); int nw; id = jb_rid(id);\n    jb_obj *o = jb_make(id, line, &nw);\n    double dx = pos[0] - o->pos[0], dy = pos[1] - o->pos[1];\n    o->kind = 1; o->pos[0] = pos[0]; o->pos[1] = pos[1]; strncpy(o->text, text, JB_STR_MAX - 1);\n    o->scale[1] = size; o->outline = outline; strcpy(o->color, color); o->fitS = -1; jb_fit(o);\n    if (!nw) jb_shift(o->id, dx, dy, 0); else jb_born(o);\n    JB_UNLOCK();\n}\n/* ---- 속성 읽기 · 쓰기 (key: p 위치 · s 크기 · v 속도) ---- */\nstatic double *jb_vec(jb_obj *o, int key) { return key == 'p' ? o->pos : key == 's' ? o->scale : o->vel; }\nstatic void jb_checkTriggers(void);\nstatic const double *jb_getm(const char *id, int key, int line) {\n    static __thread double b[4][2]; static __thread int k = 0;\n    JB_LOCK(); jb_obj *o = jb_get(id, line); jb_fit(o);\n    double *r = b[k++ & 3]; r[0] = jb_vec(o, key)[0]; r[1] = jb_vec(o, key)[1];\n    JB_UNLOCK(); return r;\n}\nstatic double jb_getf(const char *id, int key, int comp, int line) { return jb_getm(id, key, line)[comp]; }\nstatic double jb_keep(const char *id, int key, int comp) {   /* 행렬 안의 obj.Xpos 등: 바꾸는 오브젝트의 지금 값 */\n    JB_LOCK(); id = jb_rid(id); jb_obj *o = jb_find(id); double v = 0;\n    if (o) { jb_fit(o); v = jb_vec(o, key)[comp]; }\n    JB_UNLOCK(); return v;\n}\nstatic const char *jb_gets(const char *id, int key, int line) {\n    static __thread char b[4][JB_STR_MAX]; static __thread int k = 0;\n    char *r = b[k++ & 3];\n    JB_LOCK(); jb_obj *o = jb_get(id, line);\n    if (key == 'c') strcpy(r, o->color);\n    else if (key == 'x') { if (o->kind != 1) jb_err(line, \"'%s' is not a text object\", o->id); strcpy(r, o->text); }\n    else { if (!o->hasTrig) jb_err(line, \"'%s' is not a trigger\", o->id); jb_checkTriggers(); strcpy(r, o->trigId); }\n    JB_UNLOCK(); return r;\n}\nstatic int jb_geti(const char *id, int line) {\n    JB_LOCK(); jb_obj *o = jb_get(id, line);\n    if (!o->hasTrig) jb_err(line, \"'%s' is not a trigger\", o->id);\n    jb_checkTriggers(); int v = o->isTrig; JB_UNLOCK(); return v;\n}\nstatic void jb_setm(const char *id, int key, const double *m, int line) {\n    JB_LOCK(); jb_obj *o = jb_get(id, line);\n    if (key == 'p') jb_movePos(o, m[0], m[1]); else { double *v = jb_vec(o, key); v[0] = m[0]; v[1] = m[1]; }\n    JB_UNLOCK();\n}\nstatic void jb_setf(const char *id, int key, int comp, double val, int line) {\n    JB_LOCK(); jb_obj *o = jb_get(id, line);\n    if (key == 'p') { double p[2] = { o->pos[0], o->pos[1] }; p[comp] = val; jb_movePos(o, p[0], p[1]); }\n    else jb_vec(o, key)[comp] = val;\n    JB_UNLOCK();\n}\nstatic void jb_setcolor(const char *id, const char *c, int line) { JB_LOCK(); jb_obj *o = jb_get(id, line); strcpy(o->color, c); JB_UNLOCK(); }\nstatic void jb_settext(const char *id, const char *t, int line) {\n    JB_LOCK(); jb_obj *o = jb_get(id, line);\n    if (o->kind != 1) jb_err(line, \"'%s' is not a text object\", o->id);\n    strncpy(o->text, t, JB_STR_MAX - 1); jb_fit(o); JB_UNLOCK();\n}\nstatic int jb_iscol(const char *id, int line) {   /* col.obj.id.isCollided — 지난 물리 틱에 다른 콜라이더와 부딪혔으면 1 */\n    JB_LOCK(); jb_obj *o = jb_get(id, line);\n    int v = o->hasCol && o->colN == jb_physN;   /* 콜라이더가 없으면 0 */ JB_UNLOCK(); return v;\n}\nstatic const char *jb_colid(const char *id, int line) {   /* col.obj.id.collidedObj — 마지막으로 부딪힌 콜라이더 id (\"\" = 아직 없음) */\n    static __thread char b[4][JB_ID_MAX]; static __thread int k = 0;\n    char *r = b[k++ & 3];\n    JB_LOCK(); jb_obj *o = jb_get(id, line);\n    strcpy(r, o->hasCol ? o->colWith : \"\"); JB_UNLOCK(); return r;\n}\nstatic void jb_setRenderLimit(int r, int line) {\n    if (r < 0) jb_err(line, \"the render limit must be 0 or more (got %d)\", r);\n    JB_LOCK(); jb_rlim = r; JB_UNLOCK();\n}\nstatic void jb_uiTree(jb_obj *o) { o->ui = 1; for (int i = 0; i < jb_n; i++) if (!jb_o[i]->ui && !strcmp(jb_o[i]->parent, o->id)) jb_uiTree(jb_o[i]); }   /* 자식도 같이 UI */\nstatic void jb_setUi(const char *id, int line) { JB_LOCK(); jb_uiTree(jb_get(id, line)); JB_UNLOCK(); }   /* can.setUi */\nstatic void jb_setistrig(const char *id, int v, int line) {\n    JB_LOCK(); jb_obj *o = jb_get(id, line);\n    if (!o->hasTrig) jb_err(line, \"'%s' is not a trigger\", o->id);\n    o->isTrig = v != 0; if (!o->isTrig) o->trigId[0] = 0; JB_UNLOCK();\n}\nstatic void jb_setPos(const char *id, const double *p, int line) { jb_setm(id, 'p', p, line); }\nstatic void jb_setScale(const char *id, const double *s, int line) { jb_setm(id, 's', s, line); }\n/* getVar(\"id\", \"이름\") — 이름: coord(position) · scale · velocity · color · text · istrigged · triggedid · \"scale[1, 2]\" */\nstatic int jb_getvar(const char *id, const char *name, int line, double *f, const char **s, double *m) {\n    char key[32] = \"\"; int r = 0, c = 0; size_t n = 0;\n    while (*name == ' ') name++;\n    while (isalpha((unsigned char)*name) && n < sizeof key - 1) key[n++] = (char)tolower((unsigned char)*name++);\n    key[n] = 0;\n    if (sscanf(name, \" [ %d , %d ]\", &r, &c) != 2) r = c = 0;\n    int k = (!strcmp(key, \"coord\") || !strcmp(key, \"pos\") || !strcmp(key, \"position\")) ? 'p' : !strcmp(key, \"scale\") ? 's'\n        : (!strcmp(key, \"velocity\") || !strcmp(key, \"vel\")) ? 'v' : !strcmp(key, \"color\") ? 'c' : !strcmp(key, \"text\") ? 'x'\n        : (!strcmp(key, \"istrigged\") || !strcmp(key, \"istriggered\")) ? 't' : (!strcmp(key, \"triggedid\") || !strcmp(key, \"triggeredid\")) ? 'i' : 0;\n    if (!k) jb_err(line, \"getVar name must be coord, scale, velocity, color, text, istrigged or triggedid (got \\\"%s\\\")\", name);\n    if (k == 'c' || k == 'x' || k == 'i') { *s = jb_gets(id, k, line); return 's'; }\n    if (k == 't') { *f = jb_geti(id, line); return 'f'; }\n    const double *v = jb_getm(id, k, line);\n    if (r) { if (r != 1 || c < 1 || c > 2) jb_err(line, \"%s is a (1, 2) matrix: use [1, 1] or [1, 2]\", key); *f = v[c - 1]; return 'f'; }\n    m[0] = v[0]; m[1] = v[1]; return 'm';\n}\n/* ---- 움직임 ---- */\nstatic int jb_linked(const char *a, const char *b);\nstatic int jb_pathBlocked(jb_obj *o, const double *to) {   /* 이동 경로에 다른 콜라이더(벽 등)가 있으면 1 — 닿기만 하는 것 · 처음부터 겹친 것은 괜찮음 */\n    if (!o->hasCol || !jb_live(o) || o->ui) return 0;\n    double hw = fabs(o->csize[0]) / 2, hh = fabs(o->csize[1]) / 2, E = 1e-6;\n    double sx = o->pos[0] + o->coff[0], sy = o->pos[1] + o->coff[1], ex = to[0] + o->coff[0], ey = to[1] + o->coff[1];\n    double x0 = (sx < ex ? sx : ex) - hw, x1 = (sx > ex ? sx : ex) + hw, y0 = (sy < ey ? sy : ey) - hh, y1 = (sy > ey ? sy : ey) + hh;\n    for (int i = 0; i < jb_n; i++) {\n        jb_obj *b = jb_o[i];\n        if (b == o || !b->hasCol || !jb_live(b) || b->ui) continue;\n        if ((o->parent[0] || b->parent[0]) && (jb_isAnc(o->id, b->id) || jb_isAnc(b->id, o->id))) continue;\n        if (jb_nlk && jb_linked(o->id, b->id)) continue;\n        double bx = b->pos[0] + b->coff[0], by = b->pos[1] + b->coff[1], bw = fabs(b->csize[0]) / 2, bh = fabs(b->csize[1]) / 2;\n        if (fabs(bx - sx) < bw + hw - E && fabs(by - sy) < bh + hh - E) continue;\n        if (bx - bw < x1 - E && bx + bw > x0 + E && by - bh < y1 - E && by + bh > y0 + E) return 1;\n    }\n    return 0;\n}\nstatic int jb_easeNext = 0;   /* 다음 jb_moveStart 가 쓸 ease (쓰고 나면 0) */\nstatic int jb_easeId(const char *s, int line) {\n    if (!strcmp(s, \"linear\")) return 0; if (!strcmp(s, \"sin\")) return 1; if (!strcmp(s, \"sinright\")) return 2; if (!strcmp(s, \"sinleft\")) return 3;\n    jb_err(line, \"the ease name must be linear, sin, sinleft or sinright (got \\\"%s\\\")\", s); return 0;\n}\nstatic double jb_ease(int e, double k) {\n    if (k >= 1) return 1;\n    if (e == 1) return sin(k * 1.5707963267948966);\n    if (e == 2) return sin(k * 0.7853981633974483) / 0.7071067811865476;\n    if (e == 3) return (sin(0.7853981633974483 + k * 0.7853981633974483) - 0.7071067811865476) / (1 - 0.7071067811865476);\n    return k;\n}\nstatic void jb_moveStart(const char *id, const double *to, int ms, int line) {\n    if (ms < 0) jb_err(line, \"the move time must be 0 or more (got %d)\", ms);\n    JB_LOCK(); { jb_obj *o0 = jb_get(id, line); if (jb_pathBlocked(o0, to)) { o0->anim = 0; pthread_cond_broadcast(&jb_cv); JB_UNLOCK(); return; } } JB_UNLOCK();   /* 움직이는 쪽에 벽이 있으면 아예 움직이지 않음 */\n    if (ms == 0) { jb_setPos(id, to, line); return; }\n    JB_LOCK(); jb_obj *o = jb_get(id, line);\n    o->anim = 1; o->afrom[0] = o->pos[0]; o->afrom[1] = o->pos[1]; o->ato[0] = to[0]; o->ato[1] = to[1];\n    o->astart = jb_now(); o->ams = ms; o->aease = jb_easeNext; jb_easeNext = 0; pthread_cond_broadcast(&jb_cv);\n    JB_UNLOCK();\n}\nstatic void jb_moveWait(const char *id) {   /* 이동이 끝날 때까지 (지워져도 끝) */\n    JB_LOCK();\n    for (;;) { jb_obj *o = jb_find(jb_rid(id)); if (!o || !o->anim) break; pthread_cond_wait(&jb_cv, &jb_mx); }\n    JB_UNLOCK();\n}\n/* for ms: 크기('s') · 투명도('a') · 색('c') 를 시간을 들여 바꾸기 · 위치('p') 는 moveObj 와 같음 */\nstatic const double *jb_colrgb(const char *c) {\n    static __thread double b[4][3]; static __thread int k = 0;\n    double *r = b[k++ & 3]; unsigned v = 0; sscanf(c + 1, \"%6x\", &v);\n    r[0] = (v >> 16) & 255; r[1] = (v >> 8) & 255; r[2] = v & 255; return r;\n}\nstatic const double *jb_ovrgba(const char *c, double a) {   /* 오버레이의 목표: r g b a */\n    static __thread double b[4][4]; static __thread int k = 0;\n    double *r = b[k++ & 3]; const double *q = jb_colrgb(c);\n    r[0] = q[0]; r[1] = q[1]; r[2] = q[2]; r[3] = a < 0 ? 0 : a > 255 ? 255 : a; return r;\n}\nstatic int jb_twIdx(int kind) { return kind == 's' ? 0 : kind == 'a' ? 1 : kind == 'r' ? 3 : kind == 'o' ? 4 : 2; }\nstatic void jb_twApply(jb_obj *o, int i, const double *v) {\n    if (i == 0) { o->scale[0] = v[0]; o->scale[1] = v[1]; }\n    else if (i == 1) { int a = (int)lround(v[0]); o->alpha = a < 0 ? 0 : a > 255 ? 255 : a; }\n    else if (i == 3) { jb_rotGroup(o, v[0] - o->ang); o->ang = v[0]; }\n    else if (i == 4) { int c[3]; for (int k = 0; k < 3; k++) { c[k] = (int)lround(v[k]); if (c[k] < 0) c[k] = 0; if (c[k] > 255) c[k] = 255; } snprintf(o->ovCol, sizeof o->ovCol, \"#%02x%02x%02x\", c[0], c[1], c[2]); int a = (int)lround(v[3]); o->ovA = a < 0 ? 0 : a > 255 ? 255 : a; }\n    else { int c[3]; for (int k = 0; k < 3; k++) { c[k] = (int)lround(v[k]); if (c[k] < 0) c[k] = 0; if (c[k] > 255) c[k] = 255; } snprintf(o->color, sizeof o->color, \"#%02x%02x%02x\", c[0], c[1], c[2]); }\n}\nstatic void jb_tweenStart(const char *id, int kind, const double *to, int ms, int line) {\n    if (ms < 0) jb_err(line, \"the change time must be 0 or more (got %d)\", ms);\n    if (kind == 'p') { jb_moveStart(id, to, ms, line); return; }\n    JB_LOCK(); jb_obj *o = jb_get(id, line); int i = jb_twIdx(kind);\n    double t[4] = { to[0], (kind == 'a' || kind == 'r') ? 0 : to[1], (kind == 'c' || kind == 'o') ? to[2] : 0, kind == 'o' ? to[3] : 0 };\n    if (kind == 'a') t[0] = t[0] < 0 ? 0 : t[0] > 255 ? 255 : t[0];\n    if (ms == 0) { o->tw[i] = 0; jb_twApply(o, i, t); }\n    else {\n        if (i == 0) { o->twFrom[0][0] = o->scale[0]; o->twFrom[0][1] = o->scale[1]; }\n        else if (i == 1) o->twFrom[1][0] = o->alpha;\n        else if (i == 3) o->twFrom[3][0] = o->ang;\n        else if (i == 4) { const double *c = jb_colrgb(o->ovA > 0 ? o->ovCol : \"#000000\"); if (o->ovA > 0) memcpy(o->twFrom[4], c, sizeof(double) * 3); else memcpy(o->twFrom[4], t, sizeof(double) * 3); o->twFrom[4][3] = o->ovA; }\n        else { const double *c = jb_colrgb(o->color); memcpy(o->twFrom[2], c, sizeof(double) * 3); }\n        memcpy(o->twTo[i], t, sizeof t); o->twStart[i] = jb_now(); o->twMs[i] = ms; o->tw[i] = 1;\n    }\n    pthread_cond_broadcast(&jb_cv); JB_UNLOCK();\n}\nstatic void jb_tweenWait(const char *id, int kind) {\n    if (kind == 'p') { jb_moveWait(id); return; }\n    int i = jb_twIdx(kind);\n    JB_LOCK();\n    for (;;) { jb_obj *o = jb_find(jb_rid(id)); if (!o || !o->tw[i]) break; pthread_cond_wait(&jb_cv, &jb_mx); }\n    JB_UNLOCK();\n}\nstatic void jb_rotate(const char *id, double a, int ms, int line) {   /* dis.rotateObj: 지금 각도에서 a 도 더 (ms 동안 · 돌고 있으면 그 목표에서 더) */\n    if (ms < 0) jb_err(line, \"the rotation time must be 0 or more (got %d)\", ms);\n    JB_LOCK(); jb_obj *o = jb_get(id, line); double base = o->tw[3] ? o->twTo[3][0] : o->ang; JB_UNLOCK();\n    double t[4] = { base + a, 0, 0, 0 };\n    jb_tweenStart(id, 'r', t, ms, line);\n}\nstatic int jb_n1 = 0, jb_arrive = 0;   /* waitF(1) 로 기다리는 수 · 이번 프레임 할 일을 마치고 다시 기다리러 온 수 */\nstatic void jb_waitF(int n) {\n    if (n <= 0) return;\n    JB_LOCK(); unsigned long t = jb_frame + (unsigned long)n;\n    jb_arrive++; pthread_cond_broadcast(&jb_cv);   /* 화면 쪽에 '이번 프레임 끝' 알림 → 바로 그림 */\n    if (n == 1) jb_n1++;\n    while (jb_frame < t) pthread_cond_wait(&jb_cv, &jb_mx);\n    if (n == 1) jb_n1--;\n    JB_UNLOCK();\n}\n/* ---- 부모 · 지우기 · 레이어 · 태그 · 투명도 · 활성 ---- */\nstatic void jb_setParent(const char *ch, const char *pa, int line) {\n    JB_LOCK(); jb_obj *c = jb_get(ch, line), *p = jb_get(pa, line);\n    if (c == p) jb_err(line, \"object '%s' can't be its own parent\", c->id);\n    if (jb_isAnc(c->id, p->id)) jb_err(line, \"'%s' is already a child of '%s' (cycle)\", p->id, c->id);\n    jb_idcpy(c->parent, p->id);\n    if (p->ui && !c->ui) jb_uiTree(c);   /* UI 의 자식이 되면 자식도 UI */\n    JB_UNLOCK();\n}\nstatic void jb_escParent(const char *id, int line) { JB_LOCK(); jb_get(id, line)->parent[0] = 0; JB_UNLOCK(); }\nstatic void jb_splitParent(const char *id, int line) {\n    JB_LOCK(); jb_obj *o = jb_get(id, line);\n    for (int i = 0; i < jb_n; i++) if (strcmp(jb_o[i]->parent, o->id) == 0) jb_o[i]->parent[0] = 0;\n    JB_UNLOCK();\n}\nstatic void jb_removeObj(const char *id, int line) {\n    JB_LOCK(); jb_obj *o = jb_get(id, line);\n    for (int i = 0; i < jb_n; i++) {\n        if (strcmp(jb_o[i]->parent, o->id) == 0) jb_o[i]->parent[0] = 0;\n        if (jb_o[i]->hasTrig && strcmp(jb_o[i]->trigId, o->id) == 0 && !jb_o[i]->thold) { jb_o[i]->isTrig = 0; jb_o[i]->trigId[0] = 0; }\n    }\n    for (int i = 0; i < jb_nlk; i++) if (!strcmp(jb_lk[i].a, o->id) || !strcmp(jb_lk[i].b, o->id)) { jb_lk[i] = jb_lk[--jb_nlk]; i--; }   /* 묶음에서 빠짐 */\n    for (int i = 0; i < o->ninst; i++) o->inst[i]->dead = 1;   /* 귀속된 코드도 멈춤 */\n    for (int i = 0; i < jb_n; i++) if (jb_o[i] == o) { memmove(jb_o + i, jb_o + i + 1, sizeof(jb_obj *) * (size_t)(jb_n - i - 1)); jb_n--; break; }\n    if (o->tex && jb_ntrash < 256) jb_trash[jb_ntrash++] = o->tex;\n    free(o); pthread_cond_broadcast(&jb_cv); JB_UNLOCK();\n}\nstatic void jb_setLayer(const char *id, int n, int line) { JB_LOCK(); jb_get(id, line)->layer = n; jb_layerOn = 1; JB_UNLOCK(); }\nstatic void jb_ascTree(jb_obj *o, int n, unsigned g) { o->smark = g; o->layer += n; for (int i = 0; i < jb_n; i++) if (jb_o[i]->smark != g && !strcmp(jb_o[i]->parent, o->id)) jb_ascTree(jb_o[i], n, g); }\nstatic void jb_ascendLayer(const char *id, int n, int line) { JB_LOCK(); jb_ascTree(jb_get(id, line), n, ++jb_shiftGen); jb_layerOn = 1; JB_UNLOCK(); }   /* 자식까지 레이어 + n */\nstatic void jb_tagObj(const char *id, const char *tag, int line) {\n    if (!tag[0] || strchr(tag, '<') || strchr(tag, '>')) jb_err(line, \"a tag name can't be empty or contain < > (got \\\"%s\\\")\", tag);\n    JB_LOCK(); jb_obj *o = jb_get(id, line);\n    int has = 0; for (int i = 0; i < o->ntags; i++) if (!strcmp(o->tags[i], tag)) has = 1;\n    if (!has && o->ntags < 8) { strncpy(o->tags[o->ntags], tag, 31); o->ntags++; }\n    JB_UNLOCK();\n}\nstatic void jb_setOverlay(const char *id, const char *c, int a, int line) { if (a < 0) a = 0; if (a > 255) a = 255; JB_LOCK(); jb_obj *o = jb_get(id, line); o->tw[4] = 0; strcpy(o->ovCol, c); o->ovA = a; JB_UNLOCK(); }\nstatic void jb_setAlpha(const char *id, int a, int line) { if (a < 0) a = 0; if (a > 255) a = 255; JB_LOCK(); jb_get(id, line)->alpha = a; JB_UNLOCK(); }\nstatic void jb_enableObj(const char *id, int on, int line) { JB_LOCK(); jb_obj *o = jb_get(id, line); if (o->cam && !on) jb_err(line, \"camera '%s' can't be disabled\", o->id); o->off = !on; if (!on) jb_offOn = 1; JB_UNLOCK(); }\n/* \"<태그>\" · \"\" (자기 자신) · 보통 id → 명령을 실행할 id 목록 */\ntypedef struct { int n; char (*v)[JB_ID_MAX]; } jb_ids;\nstatic jb_ids jb_resolve(const char *id, int line) {\n    jb_ids L = { 0, NULL };\n    size_t len = strlen(id);\n    if (len > 2 && id[0] == '<' && id[len - 1] == '>') {\n        if (!jb_objOn) jb_err(line, \"objects are off - call dis.setupObject(); first\");\n        JB_LOCK();\n        L.v = malloc(sizeof *L.v * (size_t)(jb_n + 1));\n        for (int i = 0; i < jb_n; i++) for (int t = 0; t < jb_o[i]->ntags; t++)\n            if (strlen(jb_o[i]->tags[t]) == len - 2 && !strncmp(jb_o[i]->tags[t], id + 1, len - 2)) { jb_idcpy(L.v[L.n++], jb_o[i]->id); break; }\n        JB_UNLOCK();\n        return L;\n    }\n    L.v = malloc(sizeof *L.v); L.n = 1; jb_idcpy(L.v[0], jb_rid(id));\n    return L;\n}\n/* ---- Magellan: 이미지 · 텍스쳐 ---- */\n/* importFile 은 경로에 이름만 붙임 (복사 · 저장 없음) · 이미지는 setObjTexture 에서 처음 쓸 때 그 경로에서 읽음 */\ntypedef struct { char id[JB_ID_MAX]; char path[512]; } jb_alias;\nstatic jb_alias jb_aliases[256]; static int jb_nalias = 0;\nstatic void jb_importFile(const char *path, const char *id, int line) {\n    if (!id[0]) jb_err(line, \"the name (id) is empty\");\n    JB_LOCK();\n    int k = -1;\n    for (int i = 0; i < jb_nalias; i++) if (!strcmp(jb_aliases[i].id, id)) k = i;\n    if (k < 0) { if (jb_nalias >= 256) jb_err(line, \"too many file names (up to 256)\"); k = jb_nalias++; jb_idcpy(jb_aliases[k].id, id); }\n    strncpy(jb_aliases[k].path, path, sizeof jb_aliases[k].path - 1);\n    JB_UNLOCK();\n}\nstatic const char *jb_aliasPath(const char *id) { for (int i = 0; i < jb_nalias; i++) if (!strcmp(jb_aliases[i].id, id)) return jb_aliases[i].path; return NULL; }\nstatic int jb_texOf(const char *path, int line) {   /* 경로 → 읽어 둔 이미지 번호 (처음이면 읽음) */\n    for (int i = 0; i < jb_ntex; i++) if (!strcmp(jb_texs[i].id, path)) return i;\n#ifdef JB_IMG\n    SDL_Surface *sf = IMG_Load(path);\n    if (!sf) jb_err(line, \"can't load image '%s' (%s) - run the program from the project folder\", path, IMG_GetError());\n    if (jb_ntex >= 256) jb_err(line, \"too many images (up to 256)\");\n    int k = jb_ntex++;\n    strncpy(jb_texs[k].id, path, sizeof jb_texs[k].id - 1); jb_texs[k].surf = sf; jb_texs[k].tex = NULL; jb_texs[k].w = sf->w; jb_texs[k].h = sf->h;\n    return k;\n#else\n    jb_err(line, \"images need SDL2_image\"); return -1;\n#endif\n}\n/* 이미지(이름)의 [a]~[b] 를 오브젝트에 입힘 (잠근 채로) · white = 색을 #ffffff 로 */\nstatic void jb_texApply(jb_obj *o, const char *tid, const double *a, const double *b, int white, int line) {\n    const char *path = NULL;\n    for (int i = 0; i < jb_nalias; i++) if (!strcmp(jb_aliases[i].id, tid)) path = jb_aliases[i].path;\n    if (!path) jb_err(line, \"'%s' is not an image name (name a path first with mag.importFile(\\\"path\\\") save as (\\\"%s\\\");)\", tid, tid);\n    int k = jb_texOf(path, line);\n    double x1 = a[0], y1 = a[1], x2 = b[0], y2 = b[1];\n    if (fmin(x1, x2) < 0 || fmin(y1, y2) < 0 || fmax(x1, x2) > jb_texs[k].w || fmax(y1, y2) > jb_texs[k].h)\n        jb_err(line, \"the texture area [%g, %g] ~ [%g, %g] is outside the image size %d x %d\", x1, y1, x2, y2, jb_texs[k].w, jb_texs[k].h);\n    if (x1 == x2 || y1 == y2) jb_err(line, \"the texture area has zero width or height\");\n    if (white) strcpy(o->color, \"#ffffff\");\n    o->texN = k + 1; o->tx[0] = x1; o->tx[1] = y1; o->tx[2] = x2; o->tx[3] = y2;\n}\nstatic void jb_setTexture(const char *id, const char *tid, const double *a, const double *b, int line) {\n    JB_LOCK(); jb_obj *o = jb_get(id, line);\n    if (o->kind == 1 || o->kind == 3 || o->kind == 4) jb_err(line, \"'%s' can't take a texture (rectangles · circles only)\", o->id);\n    if (!tid[0]) { o->texN = 0; JB_UNLOCK(); return; }   /* \"\" = 텍스쳐 벗기기 */\n    jb_texApply(o, tid, a, b, 1, line);\n    JB_UNLOCK();\n}\n/* ---- Magellan 텍스쳐 · 애니메이션 ---- */\ntypedef struct { char id[JB_ID_MAX], img[JB_ID_MAX]; double a[2], b[2]; } jb_tdef;\nstatic jb_tdef *jb_tds = NULL; static int jb_ntd = 0, jb_captd = 0;\ntypedef struct { char id[JB_ID_MAX]; int n, ms; int *fr; } jb_adef;   /* fr = 텍스쳐 번호 */\nstatic jb_adef *jb_ads = NULL; static int jb_nad = 0, jb_capad = 0;\nstatic int jb_tdFind(const char *id) { for (int i = 0; i < jb_ntd; i++) if (!strcmp(jb_tds[i].id, id)) return i; return -1; }\nstatic int jb_adFind(const char *id) { for (int i = 0; i < jb_nad; i++) if (!strcmp(jb_ads[i].id, id)) return i; return -1; }\nstatic void jb_setasTexture(const char *img, const double *a, const double *b, const char *id, int line) {   /* mag.setasTexture(...) save as (\"id\") */\n    if (!id[0]) jb_err(line, \"the name (id) is empty\");\n    JB_LOCK();\n    jb_obj tmp; memset(&tmp, 0, sizeof tmp); jb_texApply(&tmp, img, a, b, 0, line);   /* 이름 · 범위 확인 */\n    int i = jb_tdFind(id);\n    if (i < 0) { if (jb_ntd == jb_captd) { jb_captd = jb_captd ? jb_captd * 2 : 16; jb_tds = realloc(jb_tds, sizeof *jb_tds * (size_t)jb_captd); if (!jb_tds) exit(1); } i = jb_ntd++; }\n    jb_tdef *t = &jb_tds[i]; jb_idcpy(t->id, id); jb_idcpy(t->img, img);\n    t->a[0] = a[0]; t->a[1] = a[1]; t->b[0] = b[0]; t->b[1] = b[1];\n    JB_UNLOCK();\n}\nstatic void jb_setasAnime(const char **fr, int n, int ms, const char *id, int line) {   /* mag.setasAnime([텍스쳐 …], ms, \"id\") */\n    if (!id[0]) jb_err(line, \"the name (id) is empty\");\n    if (n < 1) jb_err(line, \"the animation has no textures (the list is empty)\");\n    if (ms < 1) jb_err(line, \"the wait per frame must be 1ms or more (got %d)\", ms);\n    JB_LOCK();\n    int *f = malloc(sizeof(int) * (size_t)n); if (!f) exit(1);\n    for (int k = 0; k < n; k++) { f[k] = jb_tdFind(fr[k]); if (f[k] < 0) jb_err(line, \"there is no texture '%s' (make it first with mag.setasTexture(\\\"image\\\", [x1, y1], [x2, y2]) save as (\\\"%s\\\");)\", fr[k], fr[k]); }\n    int i = jb_adFind(id);\n    if (i < 0) { if (jb_nad == jb_capad) { jb_capad = jb_capad ? jb_capad * 2 : 16; jb_ads = realloc(jb_ads, sizeof *jb_ads * (size_t)jb_capad); if (!jb_ads) exit(1); } i = jb_nad++; jb_ads[i].fr = NULL; }\n    free(jb_ads[i].fr); jb_idcpy(jb_ads[i].id, id); jb_ads[i].n = n; jb_ads[i].ms = ms; jb_ads[i].fr = f;\n    JB_UNLOCK();\n}\nstatic void jb_showTd(jb_obj *o, int td) { jb_tdef *t = &jb_tds[td]; jb_texApply(o, t->img, t->a, t->b, !o->texN, 0); }\nstatic void jb_animeStart(jb_obj *o, int ai, double sp, double t0) {\n    o->an = 1; o->anA = ai; o->anK = 0; o->anStart = t0; o->anDur = jb_ads[ai].ms / sp; o->anNA = 0;\n    jb_showTd(o, jb_ads[ai].fr[0]);\n}\nstatic void jb_animeStep(double now) {   /* 프레임마다: 지금 프레임의 텍스쳐 · 끝나면 다음 애니메이션 (없으면 마지막 프레임에서 멈춤) */\n    for (int i = 0; i < jb_n; i++) {\n        jb_obj *o = jb_o[i]; if (!o->an) continue;\n        jb_adef *A = &jb_ads[o->anA];\n        int k = (int)floor((now - o->anStart) / o->anDur);\n        if (k >= A->n) {\n            if (o->anNA) { int ai = o->anNA - 1; jb_animeStart(o, ai, o->anNSp, o->anStart + o->anDur * A->n); }\n            else o->an = 0;\n            continue;\n        }\n        if (k != o->anK && k >= 0) { o->anK = k; jb_showTd(o, A->fr[k]); }\n    }\n}\nstatic jb_obj *jb_texObj(const char *id, int line) {\n    jb_obj *o = jb_get(id, line);\n    if (o->kind == 1 || o->kind == 3 || o->kind == 4) jb_err(line, \"'%s' can't take a texture (rectangles · circles only)\", o->id);\n    return o;\n}\nstatic void jb_wearTexture(const char *id, const char *tid, int line) {   /* mag.wearTexture: 텍스쳐 입히기 (애니메이션은 멈춤) · \"\" = 벗기기 */\n    JB_LOCK(); jb_obj *o = jb_texObj(id, line); o->an = 0; o->anNA = 0;\n    if (!tid[0]) o->texN = 0;\n    else { int t = jb_tdFind(tid); if (t < 0) jb_err(line, \"there is no texture '%s' (make it first with mag.setasTexture(\\\"image\\\", [x1, y1], [x2, y2]) save as (\\\"%s\\\");)\", tid, tid); jb_showTd(o, t); }\n    JB_UNLOCK();\n}\nstatic void jb_runAnime(const char *id, const char *aid, double sp, int line) {   /* applyAnime = 1 배속 · 재생 중이면 끝난 뒤 바뀜 */\n    JB_LOCK(); jb_obj *o = jb_texObj(id, line);\n    int ai = jb_adFind(aid); if (ai < 0) jb_err(line, \"there is no animation '%s' (make it first with mag.setasAnime([...], ms, \\\"%s\\\");)\", aid, aid);\n    if (!(sp > 0)) jb_err(line, \"the speed must be more than 0 (got %g)\", sp);\n    if (o->an) { o->anNA = ai + 1; o->anNSp = sp; } else jb_animeStart(o, ai, sp, jb_now());\n    JB_UNLOCK();\n}\nstatic void jb_breakAnime(const char *id, int line) { JB_LOCK(); jb_obj *o = jb_texObj(id, line); o->an = 0; o->anNA = 0; JB_UNLOCK(); }   /* 지금 프레임에서 멈춤 */\nstatic int jb_anifr(const char *id, int line) { JB_LOCK(); jb_obj *o = jb_get(id, line); int v = o->an ? o->anK + 1 : -1; JB_UNLOCK(); return v; }\n/* ---- colliders ---- */\nstatic void jb_setVelocity(const char *id, const double *v, int line) { jb_setm(id, 'v', v, line); }\nstatic void jb_setLink(const char *id, const char *other, int line) {   /* dis.setLink(\"id1\", \"id2\") */\n    JB_LOCK(); jb_obj *o = jb_get(id, line);\n    if (!other[0]) { for (int i = 0; i < jb_nlk; i++) if (!strcmp(jb_lk[i].a, o->id) || !strcmp(jb_lk[i].b, o->id)) { jb_lk[i] = jb_lk[--jb_nlk]; i--; } JB_UNLOCK(); return; }\n    jb_obj *g = jb_get(other, line);\n    if (g == o) jb_err(line, \"an object can't be tied to itself ('%s')\", o->id);\n    for (int i = 0; i < jb_nlk; i++) if ((!strcmp(jb_lk[i].a, o->id) && !strcmp(jb_lk[i].b, g->id)) || (!strcmp(jb_lk[i].a, g->id) && !strcmp(jb_lk[i].b, o->id))) { JB_UNLOCK(); return; }\n    if (jb_nlk >= jb_caplk) { jb_caplk = jb_caplk ? jb_caplk * 2 : 16; jb_lk = realloc(jb_lk, sizeof *jb_lk * (size_t)jb_caplk); if (!jb_lk) exit(1); }\n    jb_idcpy(jb_lk[jb_nlk].a, o->id); jb_idcpy(jb_lk[jb_nlk].b, g->id); jb_nlk++;\n    JB_UNLOCK();\n}\nstatic void jb_setAnchor(const char *id, int on, int line) { JB_LOCK(); jb_obj *o = jb_get(id, line); o->anchored = on; if (on) o->vel[0] = o->vel[1] = 0; JB_UNLOCK(); }\nstatic void jb_setCollider(const double *pos, const double *size, const char *id, double e, int grav, int line) {\n    if (!(e >= 0 && e <= 1)) jb_err(line, \"elasticity must be 0 ~ 1 (got %g)\", e);\n    JB_LOCK(); id = jb_rid(id); int nw; jb_obj *o = jb_make(id, line, &nw);\n    if (nw) { o->kind = 3; o->pos[0] = pos[0]; o->pos[1] = pos[1]; o->scale[0] = size[0]; o->scale[1] = size[1]; o->coff[0] = o->coff[1] = 0; }\n    else { o->coff[0] = pos[0] - o->pos[0]; o->coff[1] = pos[1] - o->pos[1]; }   /* [x, y] = 화면 좌표 → 간격 */\n    o->hasCol = 1; o->csize[0] = size[0]; o->csize[1] = size[1]; o->ce = e; o->cgrav = grav; jb_colOn = 1;\n    if (nw) jb_born(o);\n    JB_UNLOCK();\n}\nstatic void jb_setTrigger(const double *pos, const double *size, const char *id, int hold, int line) {\n    JB_LOCK(); id = jb_rid(id); int nw; jb_obj *o = jb_make(id, line, &nw);\n    if (nw) { o->kind = 3; o->pos[0] = pos[0]; o->pos[1] = pos[1]; o->scale[0] = size[0]; o->scale[1] = size[1]; o->toff[0] = o->toff[1] = 0; }\n    else { o->toff[0] = pos[0] - o->pos[0]; o->toff[1] = pos[1] - o->pos[1]; }   /* [x, y] = 화면 좌표 → 간격 */\n    o->hasTrig = 1; o->tsize[0] = size[0]; o->tsize[1] = size[1]; o->thold = hold; o->isTrig = 0; o->trigId[0] = 0; jb_trigOn = 1;\n    if (nw) jb_born(o);\n    jb_checkTriggers(); JB_UNLOCK();\n}\nstatic void jb_setGravity(double f) { JB_LOCK(); jb_grav = f; JB_UNLOCK(); }\nstatic void jb_colVisible(int on) { JB_LOCK(); jb_showCol = on; JB_UNLOCK(); }\n/* 충돌하면 밀려나나: 묶어둔 것 · moveObj 중 · 멈춰 있는 보이지 않는 콜라이더(벽 · 바닥)는 안 밀림 */\nstatic int jb_pushable(jb_obj *o) { return !o->anchored && !o->anim && !(o->kind == 3 && o->vel[0] == 0 && o->vel[1] == 0 && !o->cgrav); }\nstatic int jb_linked(const char *a, const char *b) {\n    for (int i = 0; i < jb_nlk; i++) if ((!strcmp(jb_lk[i].a, a) && !strcmp(jb_lk[i].b, b)) || (!strcmp(jb_lk[i].a, b) && !strcmp(jb_lk[i].b, a))) return 1;\n    return 0;\n}\ntypedef struct { jb_obj *o; double x0, x1; int d; } jb_cb;\n/* 돌아간 상자 (콜라이더 · 트리거는 오브젝트와 같이 돎 · 간격도 돎) */\ntypedef struct { double x, y, hx, hy, c, s; } jb_obb;\nstatic jb_obb jb_mkobb(const jb_obj *o, const double *off, const double *size) {\n    jb_obb b; double r = o->ang * 0.017453292519943295; b.c = cos(r); b.s = sin(r);\n    b.x = o->pos[0] + off[0] * b.c - off[1] * b.s; b.y = o->pos[1] + off[0] * b.s + off[1] * b.c;\n    b.hx = fabs(size[0]) / 2; b.hy = fabs(size[1]) / 2; return b;\n}\n/* 분리축 검사: 겹치면 1 · n = [nx, ny, 깊이] (B → A 방향) · touch 면 경계에 닿아도 겹침 */\nstatic int jb_sat(const jb_obb *A, const jb_obb *B, int touch, double *n) {\n    double dx = A->x - B->x, dy = A->y - B->y, best = 1e300;\n    double ax[4][2] = { { A->c, A->s }, { -A->s, A->c }, { B->c, B->s }, { -B->s, B->c } };\n    for (int k = 0; k < 4; k++) {\n        double lx = ax[k][0], ly = ax[k][1];\n        double ra = A->hx * fabs(A->c * lx + A->s * ly) + A->hy * fabs(-A->s * lx + A->c * ly);\n        double rb = B->hx * fabs(B->c * lx + B->s * ly) + B->hy * fabs(-B->s * lx + B->c * ly);\n        double d = dx * lx + dy * ly, ov = ra + rb - fabs(d);\n        if (touch ? ov < 0 : ov <= 0) return 0;\n        if (ov < best) { best = ov; double sg = d < 0 ? -1 : 1; n[0] = lx * sg; n[1] = ly * sg; }\n    }\n    n[2] = best; return 1;\n}\nstatic int jb_cbcmp(const void *p, const void *q) { double a = ((const jb_cb *)p)->x0, b = ((const jb_cb *)q)->x0; return a < b ? -1 : a > b; }\nstatic jb_cb *jb_cbuf = NULL; static int jb_ccap = 0;\n/* 콜라이더(AABB) 충돌 — x 로 정렬해 겹칠 수 있는 짝만 검사 */\nstatic void jb_collide(jb_obj **cs, int n) {\n    if (n < 2) return;\n    if (n > jb_ccap) { jb_ccap = n * 2; jb_cbuf = realloc(jb_cbuf, sizeof *jb_cbuf * (size_t)jb_ccap); if (!jb_cbuf) exit(1); }\n    jb_cb *L = jb_cbuf;\n    for (int i = 0; i < n; i++) { jb_obj *o = cs[i]; double cx = o->pos[0] + o->coff[0], hw = fabs(o->csize[0]) / 2; if (o->ang != 0) { jb_obb B = jb_mkobb(o, o->coff, o->csize); cx = B.x; hw = B.hx * fabs(B.c) + B.hy * fabs(B.s); } L[i].o = o; L[i].x0 = cx - hw; L[i].x1 = cx + hw; L[i].d = jb_pushable(o) || (!o->anchored && o->anim); }   /* moveObj 로 움직이는 중이어도 막힘 */\n    qsort(L, (size_t)n, sizeof *L, jb_cbcmp);\n    for (int i = 0; i < n; i++) for (int k = i + 1; k < n; k++) {\n        if (L[k].x0 > L[i].x1) break;\n        int da = L[i].d, db = L[k].d;\n        if (!da && !db) continue;\n        jb_obj *a = L[i].o, *b = L[k].o;\n        if ((a->parent[0] || b->parent[0]) && (jb_isAnc(a->id, b->id) || jb_isAnc(b->id, a->id))) continue;\n        if (jb_nlk && jb_linked(a->id, b->id)) continue;   /* setLink 로 묶인 것끼리는 부딪히지 않음 */\n        double nx, ny, pen;\n        if (a->ang != 0 || b->ang != 0) {   /* 돌아간 콜라이더: 분리축 */\n            jb_obb A = jb_mkobb(a, a->coff, a->csize), B = jb_mkobb(b, b->coff, b->csize); double h[3];\n            if (!jb_sat(&A, &B, 0, h)) continue;\n            nx = h[0]; ny = h[1]; pen = h[2];\n        } else {\n            double ax = a->pos[0] + a->coff[0], ay = a->pos[1] + a->coff[1], bx = b->pos[0] + b->coff[0], by = b->pos[1] + b->coff[1];\n            double dx = ax - bx, dy = ay - by;\n            double px = (fabs(a->csize[0]) + fabs(b->csize[0])) / 2 - fabs(dx); if (px <= 0) continue;\n            double py = (fabs(a->csize[1]) + fabs(b->csize[1])) / 2 - fabs(dy); if (py <= 0) continue;\n            nx = px < py ? (dx < 0 ? -1 : 1) : 0; ny = px < py ? 0 : (dy < 0 ? -1 : 1); pen = px < py ? px : py;   /* b → a 방향 */\n        }\n        a->colN = b->colN = jb_physN; strcpy(a->colWith, b->id); strcpy(b->colWith, a->id);   /* isCollided · collidedObj */\n        double e = a->ce > b->ce ? a->ce : b->ce;\n        double wa = da && db ? 0.5 : da ? 1 : 0, wb = da && db ? 0.5 : db ? 1 : 0;\n        if (wa) jb_movePos(a, a->pos[0] + nx * pen * wa, a->pos[1] + ny * pen * wa);\n        if (wb) jb_movePos(b, b->pos[0] - nx * pen * wb, b->pos[1] - ny * pen * wb);\n        if (wa && a->anim) a->anim = 0;\n        if (wb && b->anim) b->anim = 0;   /* 움직이던 중 부딪히면 그 자리에서 이동 끝 (통과하지 않음) */\n        double *va = a->vel, *vb = b->vel;\n        double rv = (va[0] - (db ? vb[0] : 0)) * nx + (va[1] - (db ? vb[1] : 0)) * ny;\n        if (da && !db) {\n            double vn = va[0] * nx + va[1] * ny;\n            if (vn < 0) { double nv = -vn * e; if (nv < 40) nv = 0; va[0] += (nv - vn) * nx; va[1] += (nv - vn) * ny; }\n        } else if (!da && db) {\n            double vn = -(vb[0] * nx + vb[1] * ny);\n            if (vn < 0) { double nv = -vn * e; if (nv < 40) nv = 0; vb[0] -= (nv - vn) * nx; vb[1] -= (nv - vn) * ny; }\n        } else if (rv < 0) {\n            double jj = -(1 + e) * rv / 2;\n            va[0] += jj * nx; va[1] += jj * ny; vb[0] -= jj * nx; vb[1] -= jj * ny;\n        }\n    }\n}\nstatic int jb_box(jb_obj *o, double *b) {\n    if (o->hasCol) { b[0] = o->pos[0] + o->coff[0]; b[1] = o->pos[1] + o->coff[1]; b[2] = fabs(o->csize[0]) / 2; b[3] = fabs(o->csize[1]) / 2; return 1; }\n    if (o->kind == 3) return 0;\n    jb_fit(o); b[0] = o->pos[0] + jb_nudX(o); b[1] = o->pos[1] + jb_nudY(o); b[2] = fabs(o->scale[0]) / 2; b[3] = (o->kind == 1 ? jb_textH(o) : fabs(o->scale[1])) / 2; return 1;\n}\nstatic int jb_trigTouch(jb_obj *t, jb_obj *o, double tx, double ty, double tw, double th) {   /* 트리거에 닿음 (경계 포함) */\n    double b[4]; if (!jb_box(o, b)) return 0;\n    if (t->ang == 0 && o->ang == 0) return fabs(b[0] - tx) <= b[2] + tw && fabs(b[1] - ty) <= b[3] + th;\n    jb_obb T = jb_mkobb(t, t->toff, t->tsize), B;\n    if (o->hasCol) B = jb_mkobb(o, o->coff, o->csize);\n    else { double r = o->ang * 0.017453292519943295; B.x = b[0]; B.y = b[1]; B.hx = b[2]; B.hy = b[3]; B.c = cos(r); B.s = sin(r); }\n    double h[3]; return jb_sat(&T, &B, 1, h);\n}\nstatic void jb_checkTriggers(void) {\n    if (!jb_trigOn) return;\n    for (int i = 0; i < jb_n; i++) {\n        jb_obj *t = jb_o[i];\n        if (!t->hasTrig || !jb_live(t) || t->ui) continue;\n        double tx = t->pos[0] + t->toff[0], ty = t->pos[1] + t->toff[1], tw = fabs(t->tsize[0]) / 2, th = fabs(t->tsize[1]) / 2;\n        jb_obj *hit = NULL;\n        if (t->trigId[0]) { jb_obj *o = jb_find(t->trigId); if (o && jb_live(o) && jb_trigTouch(t, o, tx, ty, tw, th)) hit = o; }\n        for (int j = 0; !hit && j < jb_n; j++) {\n            jb_obj *o = jb_o[j];\n            if (o == t || o->ui || (o->hasTrig && !o->hasCol && o->kind == 3) || !jb_live(o) || jb_isAnc(o->id, t->id) || jb_isAnc(t->id, o->id)) continue;\n            if (jb_trigTouch(t, o, tx, ty, tw, th)) hit = o;\n        }\n        if (hit) { t->isTrig = 1; jb_idcpy(t->trigId, hit->id); }\n        else if (!t->thold) { t->isTrig = 0; t->trigId[0] = 0; }\n    }\n}\nstatic void jb_physTick(double dt) {\n    double now = jb_now(); int any = 0; jb_physN++;\n    for (int i = 0; i < jb_n; i++) {\n        jb_obj *o = jb_o[i];\n        if (!o->anim) continue;\n        double k = (now - o->astart) / o->ams; if (k > 1) k = 1;\n        { double q = jb_ease(o->aease, k); jb_movePos(o, o->afrom[0] + (o->ato[0] - o->afrom[0]) * q, o->afrom[1] + (o->ato[1] - o->afrom[1]) * q); } any = 1;\n        if (k >= 1) o->anim = 0;\n    }\n    jb_animeStep(now);\n    for (int i = 0; i < jb_n; i++) for (int w = 0; w < 5; w++) {   /* 시간을 들여 바뀌는 중인 크기 · 투명도 · 색 · 각도 · 오버레이 */\n        jb_obj *o = jb_o[i];\n        if (!o->tw[w]) continue;\n        double k = (now - o->twStart[w]) / o->twMs[w], v[4]; if (k > 1) k = 1;\n        for (int c = 0; c < 4; c++) v[c] = o->twFrom[w][c] + (o->twTo[w][c] - o->twFrom[w][c]) * k;\n        jb_twApply(o, w, v);\n        if (k >= 1) o->tw[w] = 0;\n    }\n    /* 이번 프레임의 콜라이더 · 나눌 횟수: 가장 빠른 물체가 한 번에 가장 작은 콜라이더 반 크기 이상 가지 않게 */\n    static jb_obj **cs = NULL; static int ccap = 0; int nc = 0; double minH = 1e300, maxV = 0;\n    if (jb_n > ccap) { ccap = jb_n * 2; cs = realloc(cs, sizeof *cs * (size_t)ccap); if (!cs) exit(1); }\n    for (int i = 0; i < jb_n; i++) {\n        jb_obj *o = jb_o[i];\n        if (jb_colOn && o->hasCol && jb_live(o) && !o->ui) {\n            cs[nc++] = o;\n            double hx = fabs(o->csize[0]) / 2, hy = fabs(o->csize[1]) / 2;\n            if (hx > 0 && hx < minH) minH = hx;\n            if (hy > 0 && hy < minH) minH = hy;\n        }\n        if (!o->anchored && (o->vel[0] != 0 || o->vel[1] != 0 || (o->hasCol && o->cgrav))) {\n            double v = fabs(o->vel[0]) + fabs(o->vel[1]) + (o->hasCol && o->cgrav ? fabs(JB_GRAVITY * jb_grav) * dt : 0);\n            if (v > maxV) maxV = v;\n        }\n    }\n    int steps = 1;\n    if (nc && minH < 1e300) { steps = (int)ceil(maxV * dt / (minH > 1 ? minH : 1)); if (steps < 1) steps = 1; if (steps > 16) steps = 16; }\n    double h = dt / steps;\n    for (int st = 0; st < steps; st++) {\n        int moved = 0;\n        for (int i = 0; i < jb_n; i++) {\n            jb_obj *o = jb_o[i];\n            if (o->anim || o->anchored || !jb_live(o)) continue;\n            if (o->hasCol && o->cgrav) o->vel[1] -= JB_GRAVITY * jb_grav * h;\n            if (o->vel[0] == 0 && o->vel[1] == 0) continue;\n            jb_movePos(o, o->pos[0] + o->vel[0] * h, o->pos[1] + o->vel[1] * h); moved = 1;\n        }\n        if (nc > 1 && (moved || st == 0)) jb_collide(cs, nc);\n        any = any || moved;\n    }\n    if (jb_camOn) for (int i = 0; i < jb_n; i++) {   /* 오브젝트를 따라가는 카메라 */\n        jb_obj *c = jb_o[i]; if (!c->cam || !c->follow[0]) continue;\n        jb_obj *t = jb_find(c->follow);\n        if (t && (c->pos[0] != t->pos[0] || c->pos[1] != t->pos[1])) { jb_movePos(c, t->pos[0], t->pos[1]); any = 1; }\n    }\n    if (any) jb_checkTriggers();\n}\n/* ---- 화면 크기 · 가장자리 ---- */\nstatic int jb_disw(void) { JB_LOCK(); int w = jb_winReady ? (int)lround(jb_W / jb_u()) : 0; JB_UNLOCK(); return w; }   /* 화면 단위 */\nstatic int jb_dish(void) { JB_LOCK(); int h = jb_winReady ? (int)lround(jb_H / jb_u()) : 0; JB_UNLOCK(); return h; }\nstatic int jb_widthmode(void) { JB_LOCK(); int v = jb_winReady && jb_W >= jb_H; JB_UNLOCK(); return v; }   /* dis.idWidthmode: 가로 모드면 1 */\nstatic void jb_nudge(const char *id, const double *side, double gx, double gy, int line) {\n    JB_LOCK(); jb_obj *o = jb_get(id, line);\n    if (!jb_winReady) jb_err(line, \"there is no display - call dis.setDisplay(); first\");\n    jb_fit(o);\n    double w = fabs(o->scale[0]), h = fabs(o->scale[1]);\n    jb_movePos(o, (side[0] != 0 ? -jb_W / 2.0 + gx + w / 2 : jb_W / 2.0 - gx - w / 2) - jb_nudX(o), (side[1] != 0 ? jb_H / 2.0 - gy - h / 2 : -jb_H / 2.0 + gy + h / 2) - jb_nudY(o));\n    JB_UNLOCK();\n}\nstatic void jb_nudgeK(const char *id, const char *v, int line, int textOnly) {   /* 기준점: center · left · right · top · bottom · top left … */\n    char t[32]; int n = 0;\n    for (const char *p = v; *p && n < 31; p++) { char ch = *p; if (ch == ' ' || ch == '-' || ch == '_' || ch == ',' || ch == '\\t') continue; t[n++] = (ch >= 'A' && ch <= 'Z') ? ch + 32 : ch; }\n    t[n] = 0;\n    int nx = 0, ny = 0, ok = 1; const char *q = t;\n    if (!strcmp(t, \"center\") || !strcmp(t, \"middle\") || !strcmp(t, \"centre\")) q = t + n;\n    else if (!n) ok = 0;\n    for (int k = 0; ok && *q && k < 2; k++) {\n        if (!strncmp(q, \"left\", 4) && !nx) { nx = 1; q += 4; } else if (!strncmp(q, \"right\", 5) && !nx) { nx = -1; q += 5; }\n        else if (!strncmp(q, \"top\", 3) && !ny) { ny = -1; q += 3; } else if (!strncmp(q, \"bottom\", 6) && !ny) { ny = 1; q += 6; } else ok = 0;\n    }\n    if (!ok || *q) jb_err(line, \"the anchor is \\\"center\\\" · \\\"left\\\" · \\\"right\\\" · \\\"top\\\" · \\\"bottom\\\" or two of them like \\\"top left\\\" (got \\\"%s\\\")\", v);\n    JB_LOCK(); jb_obj *o = jb_get(id, line);\n    if (textOnly && o->kind != 1) jb_err(line, \"'%s' is not a text object, so its anchor can't be changed (dis.setText objects only)\", o->id);\n    o->nud[0] = nx; o->nud[1] = ny;\n    JB_UNLOCK();\n}\nstatic void jb_setTextNudge(const char *id, const char *v, int line) { jb_nudgeK(id, v, line, 1); }   /* 글자 오브젝트만 */\nstatic void jb_setObjNudge(const char *id, const char *v, int line) { jb_nudgeK(id, v, line, 0); }   /* 모든 오브젝트 (피벗) */\n/* ---- Canvas: 입력 ---- */\nstatic unsigned char jb_kdn[512]; static unsigned long jb_ktap[512];   /* 키: 누르고 있음 · 짧게 눌러도 최소 1 프레임 (누른 프레임 + 2 전까지) */\nstatic int jb_kon(int sc) { return sc > 0 && sc < 512 && (jb_kdn[sc] || jb_frame < jb_ktap[sc]); }\nstatic int jb_sdlKey(const char *n) {   /* SDL 키보드에서 그 키가 눌려 있나 (jaw.isKeyInput) */\n    char b[24]; int k = 0;\n    while (n[k] && k < 23) { char ch = n[k]; b[k++] = (ch >= 'A' && ch <= 'Z') ? (char)(ch + 32) : ch; }\n    b[k] = 0;\n    if (n[k]) return 0;\n    static const struct { const char *n; int a, b; } T[] = {\n        {\" \", SDL_SCANCODE_SPACE, 0}, {\"space\", SDL_SCANCODE_SPACE, 0}, {\"spacebar\", SDL_SCANCODE_SPACE, 0},\n        {\"enter\", SDL_SCANCODE_RETURN, SDL_SCANCODE_KP_ENTER}, {\"return\", SDL_SCANCODE_RETURN, SDL_SCANCODE_KP_ENTER},\n        {\"esc\", SDL_SCANCODE_ESCAPE, 0}, {\"escape\", SDL_SCANCODE_ESCAPE, 0}, {\"tab\", SDL_SCANCODE_TAB, 0},\n        {\"backspace\", SDL_SCANCODE_BACKSPACE, 0}, {\"delete\", SDL_SCANCODE_DELETE, 0},\n        {\"up\", SDL_SCANCODE_UP, 0}, {\"arrowup\", SDL_SCANCODE_UP, 0}, {\"down\", SDL_SCANCODE_DOWN, 0}, {\"arrowdown\", SDL_SCANCODE_DOWN, 0},\n        {\"left\", SDL_SCANCODE_LEFT, 0}, {\"arrowleft\", SDL_SCANCODE_LEFT, 0}, {\"right\", SDL_SCANCODE_RIGHT, 0}, {\"arrowright\", SDL_SCANCODE_RIGHT, 0},\n        {\"shift\", SDL_SCANCODE_LSHIFT, SDL_SCANCODE_RSHIFT}, {\"ctrl\", SDL_SCANCODE_LCTRL, SDL_SCANCODE_RCTRL}, {\"control\", SDL_SCANCODE_LCTRL, SDL_SCANCODE_RCTRL},\n        {\"alt\", SDL_SCANCODE_LALT, SDL_SCANCODE_RALT}\n    };\n    int sa = 0, sb = 0;\n    if (k == 1 && b[0] >= 'a' && b[0] <= 'z') sa = SDL_SCANCODE_A + (b[0] - 'a');\n    else if (k == 1 && b[0] >= '1' && b[0] <= '9') sa = SDL_SCANCODE_1 + (b[0] - '1');\n    else if (k == 1 && b[0] == '0') sa = SDL_SCANCODE_0;\n    else {\n        for (size_t i = 0; i < sizeof T / sizeof T[0]; i++) if (strcmp(b, T[i].n) == 0) { sa = T[i].a; sb = T[i].b; break; }\n        if (!sa) sa = (int)SDL_GetScancodeFromName(n);   /* \"F1\" 등 SDL 이름 */\n    }\n    JB_LOCK(); int v = jb_winReady && (jb_kon(sa) || jb_kon(sb)); JB_UNLOCK(); return v;\n}\nstatic int jb_clicked(void) { JB_LOCK(); int v = jb_winReady && (jb_pDown > 0 || jb_frame < jb_tapUntil); JB_UNLOCK(); return v; }\nstatic double jb_mousex(void) { JB_LOCK(); double x, y; jb_toW(jb_mx_, jb_my_, &x, &y); JB_UNLOCK(); return x; }   /* 카메라가 있으면 세계 좌표 */\nstatic double jb_mousey(void) { JB_LOCK(); double x, y; jb_toW(jb_mx_, jb_my_, &x, &y); JB_UNLOCK(); return y; }\nstatic int jb_inObj(jb_obj *o, double x, double y) {   /* 화면 좌표가 오브젝트 안 (원은 타원) */\n    double dx = x - o->pos[0] - jb_nudX(o), dy = y - o->pos[1] - jb_nudY(o), hw = fabs(o->scale[0]) / 2, hh = (o->kind == 1 ? jb_textH(o) : fabs(o->scale[1])) / 2;\n    if (o->ang != 0) { double r = o->ang * 0.017453292519943295, c = cos(r), s = sin(r), rx = dx * c + dy * s; dy = -dx * s + dy * c; dx = rx; }\n    if (o->kind == 2) return hw > 0 && hh > 0 && (dx * dx) / (hw * hw) + (dy * dy) / (hh * hh) <= 1;\n    if (o->kind == 4) {   /* 다각형 안 (짝홀 규칙) */\n        double fx = o->scale[0] / o->pbase[0], fy = o->scale[1] / o->pbase[1]; int in = 0;\n        for (int i = 0, j = o->npts - 1; i < o->npts; j = i++) {\n            double ax = o->pts[i][0] * fx, ay = o->pts[i][1] * fy, bx = o->pts[j][0] * fx, by = o->pts[j][1] * fy;\n            if ((ay > dy) != (by > dy) && dx < (bx - ax) * (dy - ay) / (by - ay) + ax) in = !in;\n        }\n        return in;\n    }\n    return fabs(dx) <= hw && fabs(dy) <= hh;\n}\nstatic int jb_inObjS(jb_obj *o, double sx, double sy) { double x = sx, y = sy; if (!o->ui) jb_toW(sx, sy, &x, &y); return jb_inObj(o, x, y); }   /* UI 는 화면 좌표 그대로 */   /* 화면 좌표로 */\nstatic int jb_mtouch(const char *id, int line) {\n    JB_LOCK(); jb_obj *o = jb_get(id, line); int r = 0;\n    if (jb_winReady && jb_mIn && jb_live(o)) { jb_fit(o); r = jb_inObjS(o, jb_mx_, jb_my_); }\n    JB_UNLOCK(); return r;\n}\n/* ---- Canvas: 버튼 ---- */\n#ifdef JB_KEYS\nstatic struct { char key[24]; char id[JB_ID_MAX]; } jb_kb[64]; static int jb_nkb = 0;   /* can.bindInput: 버튼 → 키 */\nstatic void jb_setButton(const char *id, int line);\nstatic void jb_bindInput(const char *id, const char *key, int line) {\n    char b[24]; const char *k = jb_kcanon(key, b);\n    jb_setButton(id, line);\n    JB_LOCK(); jb_obj *o = jb_get(id, line);\n    for (int i = 0; i < jb_nkb; i++) if (!strcmp(jb_kb[i].id, o->id)) { jb_kb[i] = jb_kb[--jb_nkb]; i--; }   /* 버튼 하나에 키 하나 */\n    if (k[0] && jb_nkb < 64) { strcpy(jb_kb[jb_nkb].key, k); jb_idcpy(jb_kb[jb_nkb].id, o->id); jb_nkb++; }\n    JB_UNLOCK();\n}\nstatic int jb_inObj(jb_obj *o, double x, double y);\nstatic int jb_inObjS(jb_obj *o, double sx, double sy);\nstatic int jb_btnKey(const char *k) {   /* 그 키에 묶인 버튼을 누르고 있나 */\n    JB_LOCK(); int r = 0;\n    for (int i = 0; i < jb_nkb && !r; i++) {\n        if (strcmp(jb_kb[i].key, k)) continue;\n        jb_obj *o = jb_find(jb_kb[i].id);\n        if (!o || !jb_winReady || !jb_live(o)) continue;\n        jb_fit(o);\n        if (jb_pDown > 0 && jb_inObjS(o, jb_mx_, jb_my_)) r = 1;\n        int n = jb_nclk < 32 ? jb_nclk : 32;\n        for (int q = 0; q < n && !r; q++) { int j = (jb_nclk - n + q) % 32; if (jb_frame <= jb_clk[j].f + 1 && jb_inObjS(o, jb_clk[j].dx, jb_clk[j].dy)) r = 1; }\n    }\n    JB_UNLOCK(); return r;\n}\n#endif\nstatic void jb_setButton(const char *id, int line) { JB_LOCK(); jb_obj *o = jb_get(id, line); if (!o->btn) { o->btn = 1; o->btnSeen = o->relSeen = jb_now(); o->held = o->relPend = 0; } JB_UNLOCK(); }\nstatic int jb_btnPush(const char *id, int line) {   /* 버튼 위에서 누른 것이 버튼 위에 있는 동안 1 (한 번 나가면 뗄 때까지 0 · 짧게 눌러도 최소 1 프레임) */\n    JB_LOCK(); jb_obj *o = jb_get(id, line); int r = 0;\n    if (!o->btn) jb_err(line, \"'%s' is not a button - call can.setasButton(\\\"%s\\\"); first\", o->id, o->id);\n    if (jb_winReady && jb_live(o)) {\n        jb_fit(o);\n        if (o->held == 1) r = 1;\n        int n = jb_nclk < 32 ? jb_nclk : 32;\n        for (int k = 0; k < n && !r; k++) { int i = (jb_nclk - n + k) % 32; if (jb_frame <= jb_clk[i].f + 1 && jb_clk[i].f - jb_clk[i].df <= 1 && jb_inObjS(o, jb_clk[i].dx, jb_clk[i].dy)) r = 1; }   /* 짧게 누른 것만 */\n    }\n    JB_UNLOCK(); return r;\n}\nstatic int jb_btnRel(const char *id, int line) {   /* 버튼을 누르던 것을 뗐거나 버튼 밖으로 나간 순간 1 (한 번만 · 0.5초 지나면 버림) */\n    JB_LOCK(); jb_obj *o = jb_get(id, line); int r = 0;\n    if (!o->btn) jb_err(line, \"'%s' is not a button - call can.setasButton(\\\"%s\\\"); first\", o->id, o->id);\n    if (o->relPend > 0) {\n        if (jb_now() - o->relAt > 500) o->relPend = 0;\n        else { o->relPend--; r = 1; }\n    }\n    JB_UNLOCK(); return r;\n}\nstatic void jb_btnTrack(double x, double y, int ph) {   /* 버튼 누름 상태 (JB_LOCK 안) — ph 0 누름 · 1 누른 채 움직임 · 2 뗌 · 누른 채 버튼 위면 누름 (어디서 눌렀든 · 다시 들어와도) · 누른 채 나가면 그 순간 뗀 것 */\n    double now = jb_now();\n    for (int i = 0; i < jb_n; i++) {\n        jb_obj *o = jb_o[i]; if (!o->btn) continue;\n        int in = 0;\n        if (jb_winReady && jb_live(o)) { jb_fit(o); in = jb_inObjS(o, x, y); }\n        if (ph == 0) o->held = in;\n        else if (ph == 1) { if (o->held && !in) { o->relPend++; o->relAt = now; } o->held = in; }\n        else { if (o->held) { o->relPend++; o->relAt = now; } o->held = 0; }\n    }\n}\nstatic int jb_btnClick(const char *id, int line) {   /* 그 버튼 위에서 눌렀다 뗐으면 1 (한 번 알리면 0 · 0.5초 지나면 버림) */\n    JB_LOCK(); jb_obj *o = jb_get(id, line); int r = 0;\n    if (!o->btn) jb_err(line, \"'%s' is not a button - call can.setasButton(\\\"%s\\\"); first\", o->id, o->id);\n    if (jb_winReady && jb_live(o)) {\n        jb_fit(o);\n        double now = jb_now(); int n = jb_nclk < 32 ? jb_nclk : 32;\n        for (int k = 0; k < n; k++) {\n            int i = (jb_nclk - n + k) % 32;\n            if (jb_clk[i].t <= o->btnSeen || now - jb_clk[i].t > 500) continue;\n            if (jb_inObjS(o, jb_clk[i].dx, jb_clk[i].dy) && jb_inObjS(o, jb_clk[i].ux, jb_clk[i].uy)) { o->btnSeen = jb_clk[i].t; r = 1; break; }\n        }\n    }\n    JB_UNLOCK(); return r;\n}\n/* ---- Canvas: 장면 ---- */\nstatic int jb_sceneIdx(const char *n) { for (int i = 0; i < jb_nscene; i++) if (!strcmp(jb_sceneName[i], n)) return i; return -1; }\nstatic void jb_sceneName_ok(const char *n, int line) { if (!n[0] || !strcmp(n, \"*\")) jb_err(line, \"invalid scene name (empty or '*'): \\\"%s\\\"\", n); }\nstatic void jb_needScene(int line) { if (!jb_sceneOn) jb_err(line, \"scenes are off - call can.setUpScene(); first\"); }\nstatic void jb_leaveScene(void) { for (int i = 0; i < jb_nsceneTk; i++) jb_sceneTk[i]->dead = 1; jb_nsceneTk = 0; }\nstatic void jb_setUpScene(void) {\n    JB_LOCK();\n    if (!jb_sceneOn) {\n        jb_sceneOn = 1; jb_scene = 0; jb_nscene = 1; jb_sceneName[0][0] = 0;\n        for (int i = 0; i < jb_n; i++) if (!jb_o[i]->hasScenes) { jb_o[i]->hasScenes = 1; jb_o[i]->scenes = 1; }\n    }\n    JB_UNLOCK();\n}\nstatic void jb_nameScene(const char *n, int line) {\n    jb_needScene(line); jb_sceneName_ok(n, line);\n    JB_LOCK();\n    if (!strcmp(jb_sceneName[jb_scene], n)) { JB_UNLOCK(); return; }\n    if (jb_sceneIdx(n) >= 0) jb_err(line, \"scene name '%s' is already used by another scene\", n);\n    jb_leaveScene(); jb_idcpy(jb_sceneName[jb_scene], n);\n    jb_start_scene(n); JB_UNLOCK();\n}\nstatic void jb_setScene(const char *n, int line) {\n    jb_needScene(line); jb_sceneName_ok(n, line);\n    JB_LOCK();\n    if (jb_sceneIdx(n) >= 0) jb_err(line, \"scene '%s' already exists\", n);\n    if (jb_nscene >= 64) jb_err(line, \"too many scenes (up to 64)\");\n    jb_idcpy(jb_sceneName[jb_nscene++], n); JB_UNLOCK();\n}\nstatic void jb_sendtoScene(const char *n, int line) {\n    jb_needScene(line); jb_sceneName_ok(n, line);\n    JB_LOCK(); int k = jb_sceneIdx(n);\n    if (k < 0) jb_err(line, \"there is no scene '%s' (create it with can.setScene or name one with can.nameScene)\", n);\n    if (k != jb_scene) { jb_leaveScene(); jb_scene = k; jb_camDefault(); jb_start_scene(n); }\n    JB_UNLOCK();\n}\nstatic void jb_existScene(const char *sn, const char *id, int line) {\n    jb_needScene(line);\n    if (!sn[0]) jb_err(line, \"the scene name is empty\");\n    JB_LOCK(); jb_obj *o = jb_get(id, line);\n    if (!o->hasScenes) { o->hasScenes = 1; o->scenes = 1ULL << jb_scene; }\n    if (!strcmp(sn, \"*\")) o->scenes = ~0ULL;\n    else { int k = jb_sceneIdx(sn); if (k < 0) jb_err(line, \"there is no scene '%s' (create it with can.setScene or name one with can.nameScene)\", sn); o->scenes |= 1ULL << k; }\n    JB_UNLOCK();\n}\nstatic const char *jb_scenename(void) {\n    static __thread char b[JB_ID_MAX];\n    JB_LOCK(); strcpy(b, jb_sceneOn ? jb_sceneName[jb_scene] : \"\"); JB_UNLOCK(); return b;\n}\n/* ---- SeongBin 명령 ---- */\nstatic void jb_camDefault(void) {   /* 장면에 들어갈 때마다 새 cam.default (가운데 · 배율 1 · 모든 장면) */\n    if (!jb_camOn) return;\n    jb_obj *o = jb_find(\"cam.default\");\n    if (!o) {\n        o = calloc(1, sizeof *o); if (!o) exit(1);\n        jb_idcpy(o->id, \"cam.default\"); o->alpha = 255; strcpy(o->color, \"#000000\");\n        if (jb_n >= jb_cap) { jb_cap = jb_cap ? jb_cap * 2 : 32; jb_o = realloc(jb_o, sizeof(jb_obj *) * (size_t)jb_cap); if (!jb_o) exit(1); }\n        jb_o[jb_n++] = o;\n    }\n    o->kind = 3; o->cam = 1; o->zoom = 1; o->follow[0] = 0; o->anim = 0; o->hasScenes = 1; o->scenes = ~0ULL;\n    jb_movePos(o, 0, 0);\n}\nstatic void jb_setUpCam(void) { JB_LOCK(); if (!jb_camOn) { jb_camOn = 1; jb_camDefault(); } JB_UNLOCK(); }\nstatic void jb_camName(const char *nm, char *out, int line) {   /* \"이름\" → \"cam.이름\" */\n    if (!jb_camOn) jb_err(line, \"cameras are off - call seo.setUpCam(); first\");\n    if (!nm[0] || strpbrk(nm, \"<>.\")) jb_err(line, \"invalid camera name (empty or has < > .): \\\"%s\\\"\", nm);\n    snprintf(out, JB_ID_MAX, \"cam.%s\", nm);\n}\nstatic void jb_setCam(const char *nm, int line) {\n    char id[JB_ID_MAX]; jb_camName(nm, id, line);\n    JB_LOCK(); if (jb_find(id)) jb_err(line, \"camera '%s' already exists\", nm);\n    int nw; jb_mkCam = 1; jb_obj *o = jb_make(id, line, &nw); jb_mkCam = 0;\n    o->kind = 3; o->cam = 1; o->zoom = 1;\n    jb_born(o); JB_UNLOCK();\n}\nstatic jb_obj *jb_camGet(const char *nm, int line) {\n    char id[JB_ID_MAX]; jb_camName(nm, id, line);\n    jb_obj *o = jb_find(id); if (!o || !o->cam) jb_err(line, \"there is no camera '%s' (make it with seo.setCam(\\\"%s\\\");)\", nm, nm);\n    return o;\n}\nstatic void jb_setMainCam(const char *nm, int line) { JB_LOCK(); jb_obj *o = jb_camGet(nm, line); jb_idcpy(jb_camMain[jb_sceneOn ? jb_scene : 0], o->id); JB_UNLOCK(); }\nstatic void jb_setZoom(const char *nm, double z, int line) { if (!(z > 0)) jb_err(line, \"the zoom must be more than 0 (got %g)\", z); JB_LOCK(); jb_camGet(nm, line)->zoom = z; JB_UNLOCK(); }\nstatic const char *jb_camid(const char *nm, int line) {   /* moveCamto: 따라가기는 풀고 id 를 돌려줌 */\n    static __thread char b[JB_ID_MAX]; JB_LOCK(); jb_obj *o = jb_camGet(nm, line); o->follow[0] = 0; strcpy(b, o->id); JB_UNLOCK(); return b;\n}\nstatic void jb_camFollow(const char *nm, const char *target, int line) {\n    JB_LOCK(); jb_obj *o = jb_camGet(nm, line);\n    if (target[0]) { jb_obj *t = jb_get(target, line); if (t->cam) jb_err(line, \"a camera can't follow another camera ('%s')\", t->id); jb_idcpy(o->follow, t->id); }\n    else o->follow[0] = 0;\n    JB_UNLOCK();\n}\n/* ---- soundMaster (SDL2_mixer) ---- */\n#ifdef JB_SND\n#include <SDL_mixer.h>\ntypedef struct { char id[JB_ID_MAX]; int vol, fin, fout; char obj[JB_ID_MAX]; } jb_spk;\nstatic jb_spk jb_spks[64]; static int jb_nspk = 0, jb_mixOk = 0;\nstatic struct { char path[512]; Mix_Chunk *c; } jb_chunks[128]; static int jb_nchunk = 0;\nstatic struct { int spk; double endAt, fadeAt; } jb_vc[64];   /* 채널마다: 스피커 번호 + 1 · 끝 시각 · 페이드 아웃 시작 시각 */\nstatic void jb_mixInit(void) {\n    if (jb_mixOk) return;\n    if (SDL_InitSubSystem(SDL_INIT_AUDIO) != 0 || Mix_OpenAudio(44100, MIX_DEFAULT_FORMAT, 2, 1024) != 0) { fprintf(stderr, \"Jawbreaker: can't open audio: %s\\n\", Mix_GetError()); jb_mixOk = -1; return; }\n    Mix_AllocateChannels(64); jb_mixOk = 1;\n}\nstatic int jb_spkIdx(const char *id, int line) { for (int i = 0; i < jb_nspk; i++) if (!strcmp(jb_spks[i].id, id)) return i; jb_err(line, \"there is no speaker '%s' (make it with sou.setSpeaker(\\\"%s\\\");)\", id, id); return -1; }\nstatic void jb_setSpeaker(const char *id, int line) {   /* 스피커 = 보이지 않는 오브젝트 \"spk.이름\" */\n    if (!id[0]) jb_err(line, \"the speaker id is empty\");\n    if (strpbrk(id, \"<>.\")) jb_err(line, \"a speaker name can't contain < > .: \\\"%s\\\"\", id);\n    char oid[JB_ID_MAX + 8]; snprintf(oid, sizeof oid, \"spk.%s\", id);\n    JB_LOCK();\n    if (!jb_find(oid)) { int nw; int on = jb_objOn; jb_objOn = 1; jb_mkCam = 1; jb_obj *o = jb_make(oid, line, &nw); jb_mkCam = 0; jb_objOn = on; o->kind = 3; jb_born(o); o->hasScenes = 1; o->scenes = ~0ULL; }   /* 기본: 모든 장면 */\n    for (int i = 0; i < jb_nspk; i++) if (!strcmp(jb_spks[i].id, id)) { JB_UNLOCK(); return; }\n    if (jb_nspk < 64) { jb_spk *k = &jb_spks[jb_nspk++]; memset(k, 0, sizeof *k); jb_idcpy(k->id, id); k->vol = 255; }\n    JB_UNLOCK();\n}\nstatic Mix_Chunk *jb_chunk(const char *name, int line) {   /* mag.importFile 로 붙인 이름 → 소리 (처음 쓸 때 읽음) */\n    const char *path = jb_aliasPath(name);\n    if (!path) jb_err(line, \"'%s' is not a sound name (name it first with mag.importFile(\\\"sound.wav\\\") save as (\\\"%s\\\");)\", name, name);\n    for (int i = 0; i < jb_nchunk; i++) if (!strcmp(jb_chunks[i].path, path)) return jb_chunks[i].c;\n    Mix_Chunk *c = Mix_LoadWAV(path);\n    if (!c) jb_err(line, \"can't read the sound '%s': %s\", path, Mix_GetError());\n    if (jb_nchunk < 128) { snprintf(jb_chunks[jb_nchunk].path, sizeof jb_chunks[0].path, \"%s\", path); jb_chunks[jb_nchunk].c = c; jb_nchunk++; }\n    return c;\n}\nstatic double jb_chunkMs(Mix_Chunk *c) { int f = 44100, ch = 2; Uint16 fmt = 0; Mix_QuerySpec(&f, &fmt, &ch); return c->alen / ((double)f * ch * ((fmt & 0xFF) / 8) / 1000.0); }\nstatic void jb_spkApply(int ch) {   /* 볼륨 · 공간 음향 (오브젝트가 없거나 꺼지면 무음, 페이드 없음) */\n    jb_spk *k = &jb_spks[jb_vc[ch].spk - 1]; double g = 1, pan = 0;\n    char oid[JB_ID_MAX + 8]; snprintf(oid, sizeof oid, \"spk.%s\", k->id);\n    jb_obj *o = jb_find(oid);\n    if (!o || !jb_live(o) || (k->obj[0] && !jb_find(k->obj))) g = 0;   /* 스피커가 없거나 · 꺼졌거나 · 다른 장면 · 귀속된 오브젝트가 없으면 무음 */\n    else if (k->obj[0]) {\n        {\n            double x = 0, y = 0, z = 1; jb_camNow(&x, &y, &z);\n            double hw = (jb_W > 0 ? jb_W : 800) / 2.0 / z, dx = o->pos[0] - x, dy = o->pos[1] - y, d = sqrt(dx * dx + dy * dy) / hw;\n            g = 1 / (1 + d * d); pan = dx / hw; if (pan > 1) pan = 1; if (pan < -1) pan = -1;\n        }\n    }\n    Mix_Volume(ch, (int)(k->vol * 128 / 255 * g));\n    Mix_SetPanning(ch, (Uint8)(pan > 0 ? 255 * (1 - pan) : 255), (Uint8)(pan < 0 ? 255 * (1 + pan) : 255));\n}\nstatic void jb_sndPlay(const char *spk, const char *name, int ms, int count, int line) {   /* count -1 = 한 번 (playSfx) · 0 = 무한 */\n    JB_LOCK(); jb_mixInit(); int si = jb_spkIdx(spk, line);\n    if (jb_mixOk < 0) { JB_UNLOCK(); return; }\n    Mix_Chunk *c = jb_chunk(name, line); jb_spk *k = &jb_spks[si];\n    int loops = count == -1 ? 0 : count == 0 ? -1 : count - 1, ticks = count == -1 && ms > 0 ? ms : -1;\n    int ch = k->fin > 0 ? Mix_FadeInChannelTimed(-1, c, loops, k->fin, ticks) : Mix_PlayChannelTimed(-1, c, loops, ticks);\n    if (ch >= 0 && ch < 64) {\n        double len = jb_chunkMs(c), total = count == -1 ? (ms > 0 && ms < len ? ms : len) : count > 0 ? len * count : 0, now = jb_now();\n        jb_vc[ch].spk = si + 1; jb_vc[ch].endAt = total > 0 ? now + total : 0;\n        jb_vc[ch].fadeAt = total > 0 && k->fout > 0 && total > k->fout ? now + total - k->fout : 0;\n        jb_spkApply(ch);\n    }\n    JB_UNLOCK();\n}\nstatic struct { Mix_Chunk *src, *part; int a, b; } jb_parts[64]; static int jb_nparts = 0;   /* repeatPart 구간 (원래 소리의 일부를 가리킴) */\nstatic void jb_sndPart(const char *spk, const char *name, int a, int b, int line) {   /* sou.repeatPart: a ~ b ms 무한 반복 (b < 0 = 끝까지) */\n    if (a < 0) jb_err(line, \"the start point must be 0 or more (got %d)\", a);\n    if (b >= 0 && b <= a) jb_err(line, \"the end point must come after the start point (got %d ~ %d) - a negative end plays to the end\", a, b);\n    JB_LOCK(); jb_mixInit(); int si = jb_spkIdx(spk, line);\n    if (jb_mixOk < 0) { JB_UNLOCK(); return; }\n    Mix_Chunk *c = jb_chunk(name, line), *p = NULL;\n    for (int i = 0; i < jb_nparts; i++) if (jb_parts[i].src == c && jb_parts[i].a == a && jb_parts[i].b == b) p = jb_parts[i].part;\n    if (!p) {\n        int f = 44100, chn = 2; Uint16 fmt = 0; Mix_QuerySpec(&f, &fmt, &chn);\n        Uint32 fr = (Uint32)(chn * ((fmt & 0xFF) / 8)); double per = f / 1000.0 * fr;\n        Uint32 o = (Uint32)(a * per) / fr * fr, e = b < 0 ? c->alen : (Uint32)(b * per) / fr * fr;\n        if (e > c->alen) e = c->alen;\n        if (o >= e) { JB_UNLOCK(); return; }   /* 시작이 소리 끝 뒤 → 소리 없음 */\n        p = Mix_QuickLoad_RAW(c->abuf + o, e - o);\n        if (!p) { JB_UNLOCK(); return; }\n        if (jb_nparts < 64) { jb_parts[jb_nparts].src = c; jb_parts[jb_nparts].part = p; jb_parts[jb_nparts].a = a; jb_parts[jb_nparts].b = b; jb_nparts++; }\n    }\n    jb_spk *k = &jb_spks[si];\n    int ch = k->fin > 0 ? Mix_FadeInChannelTimed(-1, p, -1, k->fin, -1) : Mix_PlayChannelTimed(-1, p, -1, -1);\n    if (ch >= 0 && ch < 64) { jb_vc[ch].spk = si + 1; jb_vc[ch].endAt = 0; jb_vc[ch].fadeAt = 0; jb_spkApply(ch); }\n    JB_UNLOCK();\n}\nstatic void jb_sndBreak(const char *spk, int noFade, int line) {   /* 스피커의 소리를 모두 끔 — 페이드 아웃을 따름 (noFade = 바로) */\n    JB_LOCK(); int si = jb_spkIdx(spk, line);\n    if (jb_mixOk > 0) for (int ch = 0; ch < 64; ch++) if (jb_vc[ch].spk == si + 1) {\n        if (!noFade && jb_spks[si].fout > 0) Mix_FadeOutChannel(ch, jb_spks[si].fout); else Mix_HaltChannel(ch);\n        jb_vc[ch].spk = 0;\n    }\n    JB_UNLOCK();\n}\nstatic void jb_setVol(const char *spk, int v, int line) {\n    v = v < 0 ? 0 : v > 255 ? 255 : v;\n    JB_LOCK(); int si = jb_spkIdx(spk, line); jb_spks[si].vol = v;\n    if (jb_mixOk > 0) for (int ch = 0; ch < 64; ch++) if (jb_vc[ch].spk == si + 1) jb_spkApply(ch);\n    JB_UNLOCK();\n}\nstatic void jb_setFade(const char *spk, int in, int ms, int line) {\n    if (ms < 0) jb_err(line, \"the fade time must be 0 or more (got %d)\", ms);\n    JB_LOCK(); int si = jb_spkIdx(spk, line); if (in) jb_spks[si].fin = ms; else jb_spks[si].fout = ms; JB_UNLOCK();\n}\nstatic void jb_spkScene(const char *spk, const char *sn, int line) {   /* 그 장면에서만 들림 (\"*\" = 모든 장면) */\n    jb_needScene(line);\n    if (!sn[0]) jb_err(line, \"the scene name is empty\");\n    JB_LOCK(); jb_spkIdx(spk, line);\n    char oid[JB_ID_MAX + 8]; snprintf(oid, sizeof oid, \"spk.%s\", spk); jb_obj *so = jb_find(oid);\n    unsigned long long m = ~0ULL;\n    if (strcmp(sn, \"*\")) { int k = jb_sceneIdx(sn); if (k < 0) jb_err(line, \"there is no scene '%s' (create it with can.setScene or name one with can.nameScene)\", sn); m = 1ULL << k; }\n    if (so) { so->hasScenes = 1; so->scenes = m; }\n    JB_UNLOCK();\n}\nstatic void jb_spkBelong(const char *spk, const char *obj, int line) {   /* 스피커가 그 오브젝트로 가서 자식이 됨 */\n    JB_LOCK(); int si = jb_spkIdx(spk, line);\n    char oid[JB_ID_MAX + 8]; snprintf(oid, sizeof oid, \"spk.%s\", spk); jb_obj *so = jb_find(oid);\n    if (so) so->parent[0] = 0;\n    if (obj[0]) {\n        jb_obj *g = jb_get(obj, line);\n        if (g->cam || !strncmp(g->id, \"spk.\", 4)) jb_err(line, \"a speaker can only be tied to an object ('%s')\", g->id);\n        if (so) { jb_movePos(so, g->pos[0], g->pos[1]); jb_idcpy(so->parent, g->id); }\n    }\n    jb_idcpy(jb_spks[si].obj, obj); JB_UNLOCK();\n}\nstatic void jb_sndTick(void) {   /* 화면 프레임마다 (JB_LOCK 잡은 상태): 공간 음향 · 끝날 때 페이드 아웃 */\n    if (jb_mixOk <= 0) return;\n    double now = jb_now();\n    for (int ch = 0; ch < 64; ch++) {\n        if (!jb_vc[ch].spk) continue;\n        if (!Mix_Playing(ch)) { jb_vc[ch].spk = 0; continue; }\n        if (jb_vc[ch].fadeAt > 0 && now >= jb_vc[ch].fadeAt) { int left = (int)(jb_vc[ch].endAt - now); Mix_FadeOutChannel(ch, left > 1 ? left : 1); jb_vc[ch].fadeAt = 0; }\n        jb_spkApply(ch);\n    }\n}\n#endif\n/* ---- 귀속된 코드 (dis.BelongObj · can.BelongScene) ---- */\ntypedef struct { void *(*fn)(void *); void *ctx; jb_tk *tk; } jb_runarg;\nstatic void *jb_ithunk(void *a) {\n    jb_runarg r = *(jb_runarg *)a; free(a);\n    jb_tself = r.tk->self[0] ? r.tk->self : NULL; jb_ttk = r.tk;\n    r.fn(r.ctx);\n    __sync_sub_and_fetch(&jb_running, 1);\n    return NULL;\n}\nstatic void jb_spawn_run(void *(*fn)(void *), void *ctx, jb_tk *tk) {\n    jb_runarg *a = malloc(sizeof *a); a->fn = fn; a->ctx = ctx; a->tk = tk;\n    __sync_add_and_fetch(&jb_running, 1);\n    pthread_t th;\n    if (pthread_create(&th, NULL, jb_ithunk, a) != 0) { fprintf(stderr, \"thread error\\n\"); exit(1); }\n    pthread_detach(th);\n}\nstatic jb_tk *jb_newtk(const char *self, int task) { jb_tk *t = calloc(1, sizeof *t); t->task = task; if (self) jb_idcpy(t->self, self); return t; }\nstatic void jb_bind(jb_obj *o, int task) {   /* o 에 task 파일 귀속 (같은 파일은 한 번만) */\n    for (int i = 0; i < o->ninst; i++) if (o->inst[i]->task == task) return;\n    if (o->ninst >= JB_MAXI) return;\n    jb_tk *tk = jb_newtk(o->id, task);\n    o->inst[o->ninst++] = tk;\n    jb_inst_start(task, o->id, tk);\n}\nstatic void jb_bind_self(int task) {   /* to (); — 지금 실행 중인 파일이 붙은 오브젝트에 같이 */\n    if (!jb_tself) return;\n    jb_obj *o = jb_find(jb_tself); if (o) jb_bind(o, task);\n}\nstatic void jb_bind_scene(int task) {\n    jb_tk *tk = jb_newtk(NULL, task); tk->isScene = 1;\n    if (jb_nsceneTk < 32) jb_sceneTk[jb_nsceneTk++] = tk;\n    jb_inst_start(task, NULL, tk);\n}\n/* 실행 중 dis.BelongObj(\"id\"): 아직 귀속되지 않은 실행이면 지금부터 이 파일(ctx)을 그 오브젝트에 귀속 */\nstatic void jb_bindNow(const char *id, int task, void *ctx, char *slot, int line) {\n    if (jb_tself) return;   /* 이미 귀속된 실행 */\n    JB_LOCK(); jb_obj *o = jb_get(id, line);\n    jb_idcpy(slot, o->id); jb_tself = slot;\n    int has = 0; for (int i = 0; i < o->ninst; i++) if (o->inst[i]->task == task) has = 1;\n    if (!has && o->ninst < JB_MAXI) { jb_tk *tk = jb_newtk(o->id, task); tk->ctx = ctx; o->inst[o->ninst++] = tk; }   /* obj.id.변수 · 부모 변수 */\n    JB_UNLOCK();\n}\n#define JB_SELF(cx) do { if (!jb_tself && (cx)->jb_self_[0]) jb_tself = (cx)->jb_self_; } while (0)   /* 같은 파일의 다른 run 스레드도 */\nstatic void *jb_inst_ctx(const char *id, int task, int line) {   /* obj.id.변수 */\n    JB_LOCK(); jb_obj *o = jb_get(id, line); void *c = NULL;\n    for (int i = 0; i < o->ninst; i++) if (o->inst[i]->task == task) c = o->inst[i]->ctx;\n    JB_UNLOCK();\n    if (!c) jb_err(line, \"object '%s' has no such variable (its bound file did not run)\", id);\n    return c;\n}\n/* 귀속 코드: 오브젝트가 지워졌으면 멈춤 · 꺼져 있거나 다른 장면이면 쉼 */\nstatic int jb_ck(void) {\n    jb_tk *tk = jb_ttk;\n    if (!tk) return 0;\n    for (;;) {\n        if (tk->dead) return 1;\n        if (!tk->self[0]) return 0;\n        JB_LOCK(); jb_obj *o = jb_find(tk->self); int lv = o ? jb_live(o) : 0; if (!o) tk->dead = 1; JB_UNLOCK();\n        if (!o) return 1;\n        if (lv) return 0;\n        SDL_Delay(16);\n    }\n}\n#define JB_CK() do { if (jb_ttk && jb_ck()) return NULL; } while (0)\n/* ---- 그리기 (화면 스레드 = main) ---- */\nstatic SDL_Window *jb_win = NULL; static SDL_Renderer *jb_ren = NULL;\nstatic void jb_rgb(const char *c, Uint8 *r, Uint8 *g, Uint8 *b) { unsigned v = 0; sscanf(c + 1, \"%6x\", &v); *r = (Uint8)(v >> 16); *g = (Uint8)(v >> 8); *b = (Uint8)v; }\nstatic int jb_lum(const char *c) { Uint8 r, g, b; jb_rgb(c, &r, &g, &b); return 0.299 * r + 0.587 * g + 0.114 * b > 0.55 * 255; }\nstatic void jb_ellipse(double cx, double cy, double rx, double ry) {\n    if (rx <= 0 || ry <= 0) return;\n    for (int y = (int)floor(cy - ry); y <= (int)ceil(cy + ry); y++) {\n        double t = (y + 0.5 - cy) / ry; if (t < -1 || t > 1) continue;\n        double w = rx * sqrt(1 - t * t);\n        SDL_RenderDrawLine(jb_ren, (int)lround(cx - w), y, (int)lround(cx + w) - 1, y);\n    }\n}\n#ifdef JB_TTF\nstatic SDL_Texture *jb_textTex1(const char *t, int px, const char *col, int *w, int *h);\nstatic SDL_Texture *jb_textTex(const char *t, int px, const char *col, int *w, int *h) {   /* 여러 줄: 줄마다 그려 한 장으로 (가운데 맞춤 · 줄 간격 1.2) */\n    if (!strchr(t, '\\n')) return jb_textTex1(t, px, col, w, h);\n    int nl = jb_nlines(t), lh = (int)lround(px * jb_fontK() * 1.2), mw = 0, k = 0, lw[64], lhh[64]; SDL_Texture *lt[64]; char ln[JB_STR_MAX];\n    if (nl > 64) nl = 64;\n    for (const char *p = t; k < nl; k++) {\n        const char *q = strchr(p, '\\n'); size_t m = q ? (size_t)(q - p) : strlen(p); if (m >= sizeof ln) m = sizeof ln - 1;\n        memcpy(ln, p, m); ln[m] = 0; lw[k] = lhh[k] = 0;\n        lt[k] = ln[0] ? jb_textTex1(ln, px, col, &lw[k], &lhh[k]) : NULL; if (lw[k] > mw) mw = lw[k];\n        if (!q) { k++; break; }\n        p = q + 1;\n    }\n    nl = k; if (mw < 1) mw = 1;\n    SDL_Texture *all = SDL_CreateTexture(jb_ren, SDL_PIXELFORMAT_RGBA8888, SDL_TEXTUREACCESS_TARGET, mw, nl * lh);\n    if (all) {\n        SDL_SetTextureBlendMode(all, SDL_BLENDMODE_BLEND);\n        SDL_SetRenderTarget(jb_ren, all); SDL_SetRenderDrawColor(jb_ren, 0, 0, 0, 0); SDL_RenderClear(jb_ren);\n        for (int i = 0; i < nl; i++) if (lt[i]) { SDL_Rect r = { (mw - lw[i]) / 2, i * lh + (lh - lhh[i]) / 2, lw[i], lhh[i] }; SDL_RenderCopy(jb_ren, lt[i], NULL, &r); }\n        SDL_SetRenderTarget(jb_ren, NULL);\n    }\n    for (int i = 0; i < nl; i++) if (lt[i]) SDL_DestroyTexture(lt[i]);\n    *w = mw; *h = nl * lh; return all;\n}\nstatic SDL_Texture *jb_textTex1(const char *t, int px, const char *col, int *w, int *h) {\n    TTF_Font *f = jb_font(px); if (!f || !t[0]) return NULL;\n    Uint8 r, g, b; jb_rgb(col, &r, &g, &b); SDL_Color c = { r, g, b, 255 };\n    SDL_Surface *s = TTF_RenderUTF8_Blended(f, t, c); if (!s) return NULL;\n    SDL_Texture *x = SDL_CreateTextureFromSurface(jb_ren, s); *w = s->w; *h = s->h; SDL_FreeSurface(s);\n    return x;\n}\n#endif\nstatic void jb_drawText(jb_obj *o, double cx, double cy) {\n#ifdef JB_TTF\n    double fk = jb_fontK(); int px = (int)(o->fsize / fk * jb_rz + 0.5); if (px < 1) px = 1; char key[sizeof o->texKey];\n    snprintf(key, sizeof key, \"%d|%s|%d|%s\", px, o->color, o->outline, o->text);\n    if (!o->tex || strcmp(key, o->texKey) != 0) {\n        if (o->tex) SDL_DestroyTexture((SDL_Texture *)o->tex);\n        o->tex = NULL; strcpy(o->texKey, key);\n        int w, h, ow = 0, oh = 0;\n        SDL_Texture *mt = jb_textTex(o->text, px, o->color, &w, &h);\n        if (mt && o->outline) {   /* 테두리: 글자색과 대비되는 색으로 둘레에 한 번 더 */\n            int d = px / 16 > 1 ? px / 16 : 1;\n            SDL_Texture *ol = jb_textTex(o->text, px, jb_lum(o->color) ? \"#000000\" : \"#ffffff\", &ow, &oh);\n            SDL_Texture *all = SDL_CreateTexture(jb_ren, SDL_PIXELFORMAT_RGBA8888, SDL_TEXTUREACCESS_TARGET, w + 2 * d, h + 2 * d);\n            if (ol && all) {\n                SDL_SetTextureBlendMode(all, SDL_BLENDMODE_BLEND);\n                SDL_SetRenderTarget(jb_ren, all); SDL_SetRenderDrawColor(jb_ren, 0, 0, 0, 0); SDL_RenderClear(jb_ren);\n                for (int k = 0; k < 8; k++) { int ox = (k % 3 - 1) * d, oy = (k / 3 - 1) * d; if (k == 4) { ox = d; oy = d; } SDL_Rect r = { d + ox, d + oy, w, h }; SDL_RenderCopy(jb_ren, ol, NULL, &r); }\n                SDL_Rect r = { d, d, w, h }; SDL_RenderCopy(jb_ren, mt, NULL, &r);\n                SDL_SetRenderTarget(jb_ren, NULL); SDL_DestroyTexture(mt); mt = all;\n            }\n            if (ol) SDL_DestroyTexture(ol);\n        }\n        o->tex = mt;\n    }\n    if (o->tex) {\n        int w, h; SDL_QueryTexture((SDL_Texture *)o->tex, NULL, NULL, &w, &h);\n        SDL_SetTextureAlphaMod((SDL_Texture *)o->tex, (Uint8)o->alpha);\n        double off = jb_fOff * px, ra = o->ang * 0.017453292519943295;   /* 글자 가운데가 위치에 오게 (돌아가 있으면 그 방향으로) */\n        cx -= off * sin(ra); cy -= off * cos(ra);\n        SDL_Rect r = { (int)lround(cx - w / 2.0), (int)lround(cy - h / 2.0), w, h };\n        if (o->ang != 0) SDL_RenderCopyEx(jb_ren, (SDL_Texture *)o->tex, NULL, &r, -o->ang, NULL, SDL_FLIP_NONE);   /* SDL 은 시계 방향 + */\n        else SDL_RenderCopy(jb_ren, (SDL_Texture *)o->tex, NULL, &r);\n        if (o->ovA > 0) {   /* dis.setObjOverlay: 오버레이 색으로 그린 같은 글자를 위에 */\n            char ok[sizeof o->ovKey]; snprintf(ok, sizeof ok, \"%d|%s|%s\", px, o->ovCol, o->text);\n            if (!o->ovTex || strcmp(ok, o->ovKey) != 0) { if (o->ovTex) SDL_DestroyTexture((SDL_Texture *)o->ovTex); int ow2, oh2; o->ovTex = jb_textTex(o->text, px, o->ovCol, &ow2, &oh2); strcpy(o->ovKey, ok); }\n            if (o->ovTex) {\n                int w2, h2; SDL_QueryTexture((SDL_Texture *)o->ovTex, NULL, NULL, &w2, &h2);\n                SDL_SetTextureAlphaMod((SDL_Texture *)o->ovTex, (Uint8)(o->alpha * o->ovA / 255));\n                SDL_Rect r2 = { (int)lround(cx - w2 / 2.0), (int)lround(cy - h2 / 2.0), w2, h2 };\n                if (o->ang != 0) SDL_RenderCopyEx(jb_ren, (SDL_Texture *)o->ovTex, NULL, &r2, -o->ang, NULL, SDL_FLIP_NONE);\n                else SDL_RenderCopy(jb_ren, (SDL_Texture *)o->ovTex, NULL, &r2);\n            }\n        }\n    }\n#else\n    (void)o; (void)cx; (void)cy;\n#endif\n}\n/* 텍스쳐 그리기: 사각형은 네 꼭짓점, 원은 둘레 48 점 (이미지의 네 모서리가 잘려나감) · 색 = 곱하기 */\nstatic void jb_drawTex(jb_obj *o, double cx, double cy, double sw, double sh) {\n    jb_texr *t = &jb_texs[o->texN - 1];\n    if (!t->tex && t->surf) t->tex = SDL_CreateTextureFromSurface(jb_ren, t->surf);\n    if (!t->tex) return;\n    Uint8 r, g, b; jb_rgb(o->color, &r, &g, &b);\n    SDL_Color col = { r, g, b, (Uint8)o->alpha };\n    SDL_Vertex v[50]; int idx[48 * 3], nv = 0, ni = 0;\n    double ra = o->ang * 0.017453292519943295, ca = cos(ra), sa = sin(ra);\n    #define JB_V(dx, dy) do { v[nv].position.x = (float)(cx + (dx) * ca - (dy) * sa); v[nv].position.y = (float)(cy - ((dx) * sa + (dy) * ca)); v[nv].color = col; \\\n        v[nv].tex_coord.x = (float)((o->tx[0] + ((dx) / sw + 0.5) * (o->tx[2] - o->tx[0])) / t->w); \\\n        v[nv].tex_coord.y = (float)((o->tx[1] + (0.5 - (dy) / sh) * (o->tx[3] - o->tx[1])) / t->h); nv++; } while (0)\n    if (sw <= 0 || sh <= 0) return;\n    if (o->kind == 2) {\n        JB_V(0, 0);\n        for (int k = 0; k < 48; k++) { double an = k * 6.283185307179586 / 48; JB_V(cos(an) * sw / 2, sin(an) * sh / 2); }\n        for (int k = 0; k < 48; k++) { idx[ni++] = 0; idx[ni++] = 1 + k; idx[ni++] = 1 + (k + 1) % 48; }\n    } else {\n        JB_V(-sw / 2, sh / 2); JB_V(sw / 2, sh / 2); JB_V(sw / 2, -sh / 2); JB_V(-sw / 2, -sh / 2);\n        idx[0] = 0; idx[1] = 1; idx[2] = 2; idx[3] = 0; idx[4] = 2; idx[5] = 3; ni = 6;\n    }\n    #undef JB_V\n    SDL_SetTextureBlendMode(t->tex, SDL_BLENDMODE_BLEND);\n    SDL_RenderGeometry(jb_ren, t->tex, v, nv, idx, ni);\n    if (o->ovA > 0) {   /* dis.setObjOverlay: 이미지의 모양 (투명도) 만 남긴 흰 그림에 오버레이 색을 곱해 위에 */\n        if (!t->mask && t->surf) {\n            SDL_Surface *m = SDL_ConvertSurfaceFormat(t->surf, SDL_PIXELFORMAT_RGBA32, 0);\n            if (m) {\n                SDL_LockSurface(m);\n                for (int y = 0; y < m->h; y++) { Uint8 *q = (Uint8 *)m->pixels + y * m->pitch; for (int x = 0; x < m->w; x++) { q[x * 4] = 255; q[x * 4 + 1] = 255; q[x * 4 + 2] = 255; } }\n                SDL_UnlockSurface(m); t->mask = SDL_CreateTextureFromSurface(jb_ren, m); SDL_FreeSurface(m);\n            }\n        }\n        if (t->mask) {\n            Uint8 orr, og, ob; jb_rgb(o->ovCol, &orr, &og, &ob);\n            SDL_Color oc = { orr, og, ob, (Uint8)(o->alpha * o->ovA / 255) };\n            for (int q = 0; q < nv; q++) v[q].color = oc;\n            SDL_SetTextureBlendMode(t->mask, SDL_BLENDMODE_BLEND);\n            SDL_RenderGeometry(jb_ren, t->mask, v, nv, idx, ni);\n        }\n    }\n}\n/* 돌아간 콜라이더 · 트리거 테두리 */\nstatic void jb_drawBox(const jb_obj *o, const double *off, const double *size, double kx, double ky, double kz, double W2, double H2) {\n    jb_obb b = jb_mkobb(o, off, size); int X[4], Y[4];\n    for (int k = 0; k < 4; k++) {\n        double ux = (k == 0 || k == 3) ? -b.hx : b.hx, uy = k < 2 ? b.hy : -b.hy;\n        double x = b.x + ux * b.c - uy * b.s, y = b.y + ux * b.s + uy * b.c;\n        X[k] = (int)lround(W2 + (x - kx) * kz); Y[k] = (int)lround(H2 - (y - ky) * kz);\n    }\n    for (int k = 0; k < 4; k++) SDL_RenderDrawLine(jb_ren, X[k], Y[k], X[(k + 1) % 4], Y[(k + 1) % 4]);\n}\n/* 다각형 (색만): 삼각형으로 · 사각형은 안쪽 대각선으로 나눔 (오목해도) */\nstatic void jb_drawPoly(jb_obj *o, double cx, double cy, double kz, Uint8 r, Uint8 g, Uint8 b) {\n    SDL_Vertex v[4]; int idx[6], ni = 3; SDL_Color col = { r, g, b, (Uint8)o->alpha };\n    double ra = o->ang * 0.017453292519943295, ca = cos(ra), sa = sin(ra), fx = o->scale[0] / o->pbase[0] * kz, fy = o->scale[1] / o->pbase[1] * kz, P[4][2];\n    for (int k = 0; k < o->npts; k++) {\n        double x = o->pts[k][0] * fx, y = o->pts[k][1] * fy; P[k][0] = x; P[k][1] = y;\n        v[k].position.x = (float)(cx + x * ca - y * sa); v[k].position.y = (float)(cy - (x * sa + y * ca)); v[k].color = col; v[k].tex_coord.x = v[k].tex_coord.y = 0;\n    }\n    idx[0] = 0; idx[1] = 1; idx[2] = 2;\n    if (o->npts == 4) {   /* 0-2 대각선이 안쪽이면 (1 · 3 이 양쪽) 0-2 로, 아니면 1-3 으로 */\n        double s1 = (P[2][0] - P[0][0]) * (P[1][1] - P[0][1]) - (P[2][1] - P[0][1]) * (P[1][0] - P[0][0]);\n        double s3 = (P[2][0] - P[0][0]) * (P[3][1] - P[0][1]) - (P[2][1] - P[0][1]) * (P[3][0] - P[0][0]);\n        if (s1 * s3 < 0) { idx[3] = 0; idx[4] = 2; idx[5] = 3; }\n        else { idx[0] = 1; idx[1] = 2; idx[2] = 3; idx[3] = 1; idx[4] = 3; idx[5] = 0; }\n        ni = 6;\n    }\n    SDL_RenderGeometry(jb_ren, NULL, v, o->npts, idx, ni);\n}\n/* 회전한 사각형 · 원 (색만): 삼각형으로 */\nstatic void jb_drawRot(jb_obj *o, double cx, double cy, double sw, double sh, Uint8 r, Uint8 g, Uint8 b) {\n    SDL_Vertex v[50]; int idx[48 * 3], nv = 0, ni = 0;\n    SDL_Color col = { r, g, b, (Uint8)o->alpha };\n    double ra = o->ang * 0.017453292519943295, ca = cos(ra), sa = sin(ra);\n    #define JB_RV(dx, dy) do { v[nv].position.x = (float)(cx + (dx) * ca - (dy) * sa); v[nv].position.y = (float)(cy - ((dx) * sa + (dy) * ca)); v[nv].color = col; v[nv].tex_coord.x = v[nv].tex_coord.y = 0; nv++; } while (0)\n    if (o->kind == 2) {\n        JB_RV(0, 0);\n        for (int k = 0; k < 48; k++) { double an = k * 6.283185307179586 / 48; JB_RV(cos(an) * sw / 2, sin(an) * sh / 2); }\n        for (int k = 0; k < 48; k++) { idx[ni++] = 0; idx[ni++] = 1 + k; idx[ni++] = 1 + (k + 1) % 48; }\n    } else {\n        JB_RV(-sw / 2, sh / 2); JB_RV(sw / 2, sh / 2); JB_RV(sw / 2, -sh / 2); JB_RV(-sw / 2, -sh / 2);\n        idx[0] = 0; idx[1] = 1; idx[2] = 2; idx[3] = 0; idx[4] = 2; idx[5] = 3; ni = 6;\n    }\n    #undef JB_RV\n    SDL_RenderGeometry(jb_ren, NULL, v, nv, idx, ni);\n}\nstatic void jb_render(void) {\n    Uint8 r, g, b; jb_rgb(jb_bgCol, &r, &g, &b);\n    SDL_SetRenderDrawBlendMode(jb_ren, SDL_BLENDMODE_BLEND);\n    SDL_SetRenderDrawColor(jb_ren, r, g, b, 255); SDL_RenderClear(jb_ren);\n    for (int i = 0; i < jb_ntrash; i++) SDL_DestroyTexture((SDL_Texture *)jb_trash[i]);\n    jb_ntrash = 0;\n    double W2 = jb_W / 2.0, H2 = jb_H / 2.0, kx = 0, ky = 0, kz = 1;\n    jb_camNow(&kx, &ky, &kz); double U = jb_u(); kz *= U; jb_rz = kz;   /* 화면 단위 → 픽셀 */   /* 카메라: 그 위치가 화면 가운데 · 배율 */\n#define JB_SX(x) (W2 + ((x) - kx) * kz)\n#define JB_SY(y) (H2 - ((y) - ky) * kz)\n    jb_obj **L = malloc(sizeof(jb_obj *) * (size_t)(jb_n + 1)); int n = 0;\n    double lr = jb_rlim / (kz / U);   /* 그리기 제한: 세계 좌표 반지름 */\n    for (int i = 0; i < jb_n; i++) {\n        jb_obj *o = jb_o[i];\n        if (o->kind == 3 || !jb_live(o)) continue;\n        if (jb_rlim > 0 && !o->ui) { double dx = o->pos[0] - kx, dy = o->pos[1] - ky, rr = lr + hypot(o->scale[0], o->scale[1]) / 2; if (dx * dx + dy * dy > rr * rr) continue; }\n        L[n++] = o;\n    }\n    if (jb_layerOn) for (int i = 1; i < n; i++) { jb_obj *x = L[i]; int j = i - 1; while (j >= 0 && L[j]->layer > x->layer) { L[j + 1] = L[j]; j--; } L[j + 1] = x; }   /* 같은 레이어는 만든 순서 */\n    if (n) jb_logo = 0;\n    if (jb_logo) {   /* 아직 아무것도 없으면 가운데 회색 로고 */\n        SDL_SetRenderDrawColor(jb_ren, 74, 74, 74, 255);\n        int s = jb_W < jb_H ? jb_W / 7 : jb_H / 7; if (s > 75) s = 75;\n        SDL_Rect rc = { (int)(W2 - s), (int)(H2 - s * 0.75), 2 * s, (int)(s * 1.3) };\n        for (int k = 0; k < 3; k++) { SDL_Rect q = { rc.x + k, rc.y + k, rc.w - 2 * k, rc.h - 2 * k }; SDL_RenderDrawRect(jb_ren, &q); }\n        for (int y = 0; y < s / 2; y++) { int hw = (y < s / 4 ? y : s / 2 - y); SDL_RenderDrawLine(jb_ren, (int)(W2 - s / 6.0), (int)(H2 - s * 0.35 + y), (int)(W2 - s / 6.0 + hw * 1.6), (int)(H2 - s * 0.35 + y)); }\n    }\n    double ckx = kx, cky = ky, ckz = kz;\n    for (int pass = 0; pass < 2; pass++) for (int i = 0; i < n; i++) {   /* 0 = 세계 · 1 = UI (카메라에 고정 · 맨 위) */\n        jb_obj *o = L[i];\n        if (o->ui != pass) continue;\n        if (pass) { kx = 0; ky = 0; kz = U; jb_rz = U; }\n        if (o->alpha == 0) continue;\n        jb_fit(o);\n        double cx = JB_SX(o->pos[0] + jb_nudX(o)), cy = JB_SY(o->pos[1] + jb_nudY(o));   /* 기준점(setTextNudge · setObjNudge) → 가운데 */\n        if (o->kind == 1) { jb_drawText(o, cx, cy); continue; }\n        double sw = fabs(o->scale[0]) * kz, sh = fabs(o->scale[1]) * kz;\n        if (o->texN) { jb_drawTex(o, cx, cy, sw, sh); continue; }\n        int al0 = o->alpha;\n        for (int pv = 0; pv < (o->ovA > 0 ? 2 : 1); pv++) {   /* 두 번째 = dis.setObjOverlay: 같은 모양을 오버레이 색으로 한 번 더 */\n            if (pv) { jb_rgb(o->ovCol, &r, &g, &b); o->alpha = al0 * o->ovA / 255; } else jb_rgb(o->color, &r, &g, &b);\n            SDL_SetRenderDrawColor(jb_ren, r, g, b, (Uint8)o->alpha);\n            if (o->kind == 4) jb_drawPoly(o, cx, cy, kz, r, g, b);\n            else if (o->ang != 0 && (o->kind != 2 || sw != sh)) jb_drawRot(o, cx, cy, sw, sh, r, g, b);\n            else if (o->kind == 2) jb_ellipse(cx, cy, sw / 2, sh / 2);\n            else { SDL_FRect q = { (float)(cx - sw / 2), (float)(cy - sh / 2), (float)sw, (float)sh }; SDL_RenderFillRectF(jb_ren, &q); }\n        }\n        o->alpha = al0;\n    }\n    free(L); kx = ckx; ky = cky; kz = ckz; jb_rz = kz;\n    if (jb_showCol) {   /* 콜라이더 테두리 (초록) · 트리거 (노랑) */\n        for (int i = 0; i < jb_n; i++) {\n            jb_obj *o = jb_o[i]; if (!jb_live(o) || o->ui) continue;\n            if (o->hasCol && o->ang != 0) { SDL_SetRenderDrawColor(jb_ren, 77, 226, 180, 255); jb_drawBox(o, o->coff, o->csize, kx, ky, kz, W2, H2); }\n            else if (o->hasCol) { SDL_SetRenderDrawColor(jb_ren, 77, 226, 180, 255); SDL_FRect q = { (float)(JB_SX(o->pos[0] + o->coff[0]) - fabs(o->csize[0]) * kz / 2), (float)(JB_SY(o->pos[1] + o->coff[1]) - fabs(o->csize[1]) * kz / 2), (float)(fabs(o->csize[0]) * kz), (float)(fabs(o->csize[1]) * kz) }; SDL_RenderDrawRectF(jb_ren, &q); }\n            if (o->hasTrig && o->ang != 0) { SDL_SetRenderDrawColor(jb_ren, 255, 209, 102, o->isTrig ? 255 : 150); jb_drawBox(o, o->toff, o->tsize, kx, ky, kz, W2, H2); }\n            else if (o->hasTrig) { SDL_SetRenderDrawColor(jb_ren, 255, 209, 102, o->isTrig ? 255 : 150); SDL_FRect q = { (float)(JB_SX(o->pos[0] + o->toff[0]) - fabs(o->tsize[0]) * kz / 2), (float)(JB_SY(o->pos[1] + o->toff[1]) - fabs(o->tsize[1]) * kz / 2), (float)(fabs(o->tsize[0]) * kz), (float)(fabs(o->tsize[1]) * kz) }; SDL_RenderDrawRectF(jb_ren, &q); }\n        }\n    }\n#ifdef JB_TTF\n    if (jb_scaleLabel) {   /* 왼쪽 아래 [screenX, screenY] */\n        static SDL_Texture *lt = NULL; static int lw = -1, lh = -1, tw, th;\n        if (lw != jb_W || lh != jb_H) {\n            if (lt) SDL_DestroyTexture(lt);\n            char s[48]; snprintf(s, sizeof s, \"[%d, %d]\", (int)lround(jb_W / U), (int)lround(jb_H / U));\n            lt = jb_textTex(s, 11, \"#aaaaaa\", &tw, &th); lw = jb_W; lh = jb_H;\n        }\n        if (lt) { SDL_SetTextureAlphaMod(lt, 140); SDL_Rect q = { 8, jb_H - th - 6, tw, th }; SDL_RenderCopy(jb_ren, lt, NULL, &q); }\n    }\n#endif\n    SDL_RenderPresent(jb_ren);\n}\nstatic void jb_openWin(void) {\n    if (SDL_InitSubSystem(SDL_INIT_VIDEO) != 0) { fprintf(stderr, \"Jawbreaker: can't open a display: %s\\n\", SDL_GetError()); exit(1); }\n    jb_win = SDL_CreateWindow(jb_title, SDL_WINDOWPOS_CENTERED, SDL_WINDOWPOS_CENTERED, 800, 600, SDL_WINDOW_RESIZABLE);\n    if (!jb_win) { fprintf(stderr, \"Jawbreaker: can't open a window: %s\\n\", SDL_GetError()); exit(1); }\n    jb_ren = SDL_CreateRenderer(jb_win, -1, SDL_RENDERER_ACCELERATED | SDL_RENDERER_PRESENTVSYNC);\n    if (!jb_ren) jb_ren = SDL_CreateRenderer(jb_win, -1, SDL_RENDERER_SOFTWARE);\n    if (!jb_ren) { fprintf(stderr, \"Jawbreaker: can't draw: %s\\n\", SDL_GetError()); exit(1); }\n    SDL_GetWindowSize(jb_win, &jb_W, &jb_H);\n}\n/* ---- 화면 명령 ---- */\nstatic void jb_setupObject(void) { JB_LOCK(); jb_objOn = 1; JB_UNLOCK(); }\nstatic void jb_setDisplay(void) {   /* 창이 열릴 때까지 기다림 (그다음 dis.displayX 가 바로 맞음) */\n    JB_LOCK(); jb_wantWin = 1;\n    while (!jb_winReady) pthread_cond_wait(&jb_cv, &jb_mx);\n    JB_UNLOCK();\n}\nstatic void jb_setDisplayColor(const char *c, int line) { const char *h = jb_colstr(c, line); JB_LOCK(); strcpy(jb_bgCol, h); jb_logo = 0; JB_UNLOCK(); }\nstatic void jb_screenScale(int on) { JB_LOCK(); jb_scaleLabel = on; JB_UNLOCK(); }\n/* ---- main: 프로그램은 다른 스레드, 화면 · 움직임은 main 스레드 (약 60fps) ---- */\nstatic volatile int jb_progDone = 0;\nstatic void (*jb_progFn)(void);\nstatic void *jb_progThread(void *a) { (void)a; jb_progFn(); jb_progDone = 1; return NULL; }\nstatic void jb_dis_init(void) {\n    pthread_mutexattr_t at; pthread_mutexattr_init(&at); pthread_mutexattr_settype(&at, PTHREAD_MUTEX_RECURSIVE); pthread_mutex_init(&jb_mx, &at);\n    SDL_SetMainReady();\n    if (SDL_Init(SDL_INIT_TIMER | SDL_INIT_EVENTS) != 0) { fprintf(stderr, \"Jawbreaker: SDL error: %s\\n\", SDL_GetError()); exit(1); }\n#ifdef JB_TTF\n    if (TTF_Init() != 0) fprintf(stderr, \"Jawbreaker: font error: %s\\n\", TTF_GetError());\n#endif\n#ifdef JB_IMG\n    IMG_Init(IMG_INIT_PNG | IMG_INIT_JPG);\n#endif\n}\nstatic void jb_dis_run(void (*prog)(void)) {\n    jb_progFn = prog;\n    pthread_t th; pthread_create(&th, NULL, jb_progThread, NULL);\n    double last = jb_now();\n    for (;;) {\n        double t0 = jb_now();\n        if (jb_win) {\n            SDL_Event e;\n            while (SDL_PollEvent(&e)) {\n                JB_LOCK();\n                if (e.type == SDL_QUIT) { JB_UNLOCK(); exit(0); }   /* 창을 닫으면 실행도 멈춤 */\n                else if (e.type == SDL_WINDOWEVENT) {\n                    if (e.window.event == SDL_WINDOWEVENT_SIZE_CHANGED) SDL_GetWindowSize(jb_win, &jb_W, &jb_H);\n                    else if (e.window.event == SDL_WINDOWEVENT_ENTER) jb_mIn = 1;\n                    else if (e.window.event == SDL_WINDOWEVENT_LEAVE) jb_mIn = 0;\n                    else if (e.window.event == SDL_WINDOWEVENT_FOCUS_LOST) memset(jb_kdn, 0, sizeof jb_kdn);\n                } else if (e.type == SDL_MOUSEMOTION) { jb_mIn = 1; jb_mx_ = (e.motion.x - jb_W / 2.0) / jb_u(); jb_my_ = (jb_H / 2.0 - e.motion.y) / jb_u(); }   /* 버튼은 프레임마다 한 번만 확인 (움직임 이벤트마다 모든 오브젝트를 훑지 않음) */\n                else if (e.type == SDL_MOUSEBUTTONDOWN) { jb_mIn = 1; jb_mx_ = (e.button.x - jb_W / 2.0) / jb_u(); jb_my_ = (jb_H / 2.0 - e.button.y) / jb_u(); jb_pDown++; jb_tapUntil = jb_frame + 2; jb_downX = jb_mx_; jb_downY = jb_my_; jb_downF = jb_frame; jb_btnTrack(jb_mx_, jb_my_, 0); }\n                else if (e.type == SDL_MOUSEBUTTONUP) {\n                    if (jb_pDown > 0) jb_pDown--;\n                    int i = jb_nclk++ % 32; jb_clk[i].dx = jb_downX; jb_clk[i].dy = jb_downY;\n                    jb_clk[i].ux = (e.button.x - jb_W / 2.0) / jb_u(); jb_clk[i].uy = (jb_H / 2.0 - e.button.y) / jb_u(); jb_clk[i].t = jb_now(); jb_clk[i].f = jb_frame; jb_clk[i].df = jb_downF;\n                    jb_btnTrack(jb_clk[i].ux, jb_clk[i].uy, 2);\n                }\n                else if (e.type == SDL_KEYDOWN) { int sc = (int)e.key.keysym.scancode; if (sc > 0 && sc < 512) { if (!e.key.repeat) jb_ktap[sc] = jb_frame + 2; jb_kdn[sc] = 1; } }\n                else if (e.type == SDL_KEYUP) { int sc = (int)e.key.keysym.scancode; if (sc > 0 && sc < 512) jb_kdn[sc] = 0; }\n                JB_UNLOCK();\n            }\n            JB_LOCK(); if (jb_pDown > 0) jb_btnTrack(jb_mx_, jb_my_, 1); JB_UNLOCK();   /* 손가락은 그대로인데 버튼이 움직여 밖이 된 경우 */\n        }\n        JB_LOCK();\n        if (jb_wantWin && !jb_win) { jb_openWin(); jb_winReady = 1; }\n        /* 새 프레임: 입력을 읽은 뒤 바로 프로그램을 깨우고, waitF(1) 로 돌아올 때까지 (최대 4ms) 기다렸다 그림 → 키 입력이 같은 프레임에 보임 */\n        jb_frame++;\n        {\n            int expect = jb_n1; jb_arrive = 0; pthread_cond_broadcast(&jb_cv);\n            if (expect > 0) {\n                struct timespec ts; clock_gettime(CLOCK_REALTIME, &ts); ts.tv_nsec += 4000000; if (ts.tv_nsec >= 1000000000L) { ts.tv_sec++; ts.tv_nsec -= 1000000000L; }\n                while (jb_arrive < expect) if (pthread_cond_timedwait(&jb_cv, &jb_mx, &ts) != 0) break;\n            }\n        }\n        double dt = (t0 - last) / 1000.0; if (dt > 0.1) dt = 0.1; last = t0;   /* 느려도 실제 시간만큼 (0.1초까지) */\n        jb_physTick(dt);\n#ifdef JB_SND\n        jb_sndTick();\n#endif\n        if (jb_win) jb_render();\n        pthread_cond_broadcast(&jb_cv);\n        int done = jb_progDone && jb_running == 0, win = jb_win != NULL;\n        JB_UNLOCK();\n        if (done && !win) break;   /* 화면이 없으면 프로그램이 끝날 때 끝 · 있으면 창을 닫을 때까지 */\n        double spent = jb_now() - t0;\n        if (spent < 16) SDL_Delay((Uint32)(16 - spent));\n    }\n    pthread_join(th, NULL);\n}\n";
// C 키 입력: 키 이름 · 가상 키 (jaw.keyClick · keyPush · keyRlse)
const JB_KEY_C1=[
'/* ---- 키 입력 (jaw.isKeyInput · keyClick · keyPush · keyRlse) ---- */',
'static inline const char *jb_kcanon(const char *n, char *b) {   /* 소문자 · 별칭 → 기본 이름 (b 는 24칸) */',
'    int k = 0;',
'    while (n[k] && k < 23) { char ch = n[k]; b[k] = (ch >= \'A\' && ch <= \'Z\') ? (char)(ch + 32) : ch; k++; }',
'    b[k] = 0;',
'    static const char *A[][2] = { {" ", "space"}, {"spacebar", "space"}, {"return", "enter"}, {"escape", "esc"}, {"control", "ctrl"},',
'        {"arrowup", "up"}, {"arrowdown", "down"}, {"arrowleft", "left"}, {"arrowright", "right"} };',
'    for (size_t i = 0; i < sizeof A / sizeof A[0]; i++) if (!strcmp(b, A[i][0])) return A[i][1];',
'    return b;',
'}',
'static inline double jb_kms(void) { struct timespec t; clock_gettime(CLOCK_MONOTONIC, &t); return t.tv_sec * 1000.0 + t.tv_nsec / 1e6; }',
'static pthread_mutex_t jb_kmx = PTHREAD_MUTEX_INITIALIZER;',
'static struct { char n[24]; int held; double tap; } jb_vk[64]; static int jb_nvk = 0;   /* 가상 키 · 터미널 키 */',
'static inline int jb_vkIdx(const char *n) {   /* jb_kmx 잡은 상태에서 */',
'    for (int i = 0; i < jb_nvk; i++) if (!strcmp(jb_vk[i].n, n)) return i;',
'    if (jb_nvk >= 64) return -1;',
'    strcpy(jb_vk[jb_nvk].n, n); jb_vk[jb_nvk].held = 0; jb_vk[jb_nvk].tap = 0;',
'    return jb_nvk++;',
'}',
'static inline void jb_keyVirt(const char *name, int mode, int line) {   /* 0 톡 · 1 누름 · 2 뗌 */',
'    char b[24]; const char *n = jb_kcanon(name, b);',
'    if (!n[0]) { fprintf(stderr, "line %d: the key name is empty\\n", line); exit(1); }',
'    pthread_mutex_lock(&jb_kmx);',
'    int i = jb_vkIdx(n);',
'    if (i >= 0) { if (mode == 0) jb_vk[i].tap = jb_kms() + 17; else if (mode == 1) jb_vk[i].held = 1; else { jb_vk[i].held = 0; jb_vk[i].tap = 0; } }',
'    pthread_mutex_unlock(&jb_kmx);',
'}',
'static inline int jb_vkOn(const char *n) {',
'    pthread_mutex_lock(&jb_kmx);',
'    int r = 0; double now = jb_kms();',
'    for (int i = 0; i < jb_nvk; i++) if (!strcmp(jb_vk[i].n, n)) { r = jb_vk[i].held || now < jb_vk[i].tap; break; }',
'    pthread_mutex_unlock(&jb_kmx);',
'    return r;',
'}'];
// 화면(SDL)이 있으면 SDL 키보드 · 키에 묶인 버튼
const JB_KEY_DIS=[
'static int jb_key(const char *name) { char b[24]; const char *n = jb_kcanon(name, b); return jb_vkOn(n) || jb_sdlKey(n) || jb_btnKey(n); }'];
// 화면이 없으면 터미널에서 (글자가 들어올 때마다 잠깐 눌림 · 누르고 있으면 반복 입력으로 이어짐)
const JB_KEY_TERM=[
'#ifndef _WIN32',
'#include <termios.h>',
'#include <unistd.h>',
'#include <signal.h>',
'#include <poll.h>',
'static struct termios jb_tio0; static int jb_tioOn = 0, jb_termTried = 0;',
'static void jb_tioRestore(void) { if (jb_tioOn) { tcsetattr(0, TCSANOW, &jb_tio0); jb_tioOn = 0; } }',
'static void jb_tioSig(int s) { jb_tioRestore(); signal(s, SIG_DFL); raise(s); }',
'static void jb_termTap(const char *n) {',
'    pthread_mutex_lock(&jb_kmx);',
'    int i = jb_vkIdx(n); if (i >= 0) jb_vk[i].tap = jb_kms() + 120;',
'    pthread_mutex_unlock(&jb_kmx);',
'}',
'static void *jb_termRd(void *a) {',
'    (void)a; unsigned char c;',
'    for (;;) {',
'        if (read(0, &c, 1) != 1) return NULL;',
'        char one[2] = {0, 0}; const char *n = one;',
'        if (c == 27) {   /* ESC 또는 화살표 (ESC [ A~D) */',
'            struct pollfd pf = {0, POLLIN, 0}; unsigned char s2[2];',
'            if (poll(&pf, 1, 30) > 0 && read(0, s2, 1) == 1 && (s2[0] == 91 || s2[0] == 79) && read(0, s2 + 1, 1) == 1)',
'                n = s2[1] == 65 ? "up" : s2[1] == 66 ? "down" : s2[1] == 67 ? "right" : s2[1] == 68 ? "left" : "";',
'            else n = "esc";',
'        }',
'        else if (c == 13 || c == 10) n = "enter";',
'        else if (c == 9) n = "tab";',
'        else if (c == 127 || c == 8) n = "backspace";',
'        else if (c == 32) n = "space";',
'        else if (c >= 65 && c <= 90) one[0] = (char)(c + 32);',
'        else one[0] = (char)c;',
'        if (n[0]) jb_termTap(n);',
'    }',
'}',
'static void jb_termStart(void) {',
'    if (jb_termTried) return;',
'    jb_termTried = 1;',
'    if (!isatty(0) || tcgetattr(0, &jb_tio0) != 0) return;',
'    struct termios t = jb_tio0; t.c_lflag &= ~(tcflag_t)(ICANON | ECHO); t.c_cc[VMIN] = 1; t.c_cc[VTIME] = 0;',
'    if (tcsetattr(0, TCSANOW, &t) != 0) return;',
'    jb_tioOn = 1; atexit(jb_tioRestore); signal(SIGINT, jb_tioSig); signal(SIGTERM, jb_tioSig);',
'    pthread_t th; if (pthread_create(&th, NULL, jb_termRd, NULL) == 0) pthread_detach(th);',
'}',
'#else',
'static void jb_termStart(void) {}',
'#endif',
'static int jb_key(const char *name) {',
'    pthread_mutex_lock(&jb_kmx); jb_termStart(); pthread_mutex_unlock(&jb_kmx);',
'    char b[24]; return jb_vkOn(jb_kcanon(name, b));',
'}'];
function genC(prog){
  const used={wait:false,cat:false,set:false,ls:false,li:false,lf:false,exit:false,send:false,thread:false,dis:false,ttf:false,img:false};
  const D=()=>{used.dis=true;used.thread=true;used.math=true;};   // 화면 런타임 사용
  const anySetup=[...prog.tasks.values()].some(m=>{let f=false;walkCalls(m.ast,c=>{if(c.target&&c.target.mod==='jawbreaker'&&c.target.name==='setup')f=true;});return f;});
  used.setup=anySetup;
  used.thread=anySetup||[...prog.tasks.values()].some(m=>m.ast.filter(s=>s.k==='run').length>1);
  let lblN=0;
  // goTo(줄) → C 의 goto: 대상 줄 (파일:줄) 을 미리 모아 그 문장 앞에 이름표 jb_go_파일_줄: 을 붙임 · 줄은 상수여야 함
  const gotoAt=new Set();
  {const walk=l=>{for(const x of l){if(x.k==='call'&&x.target&&x.target.mod==='jawbreaker'&&x.target.name==='goTo'){if(x.args[0].k!=='num')throw new JBError('C 변환은 goTo 의 줄 번호가 숫자 상수일 때만 됩니다 (예: goTo(12);)',x.line,x.file);gotoAt.add(x.file+':'+x.args[0].v);}if(x.body)walk(x.body);if(x.then)walk(x.then);if(x.else)walk(x.else);}};
   for(const m of prog.tasks.values())walk(m.ast);for(const m of prog.libs.values())walk(m.ast);}
  const cid=n=>n.replace(/[^A-Za-z0-9_]/gu,ch=>'_u'+ch.codePointAt(0).toString(16)+'_');
  const pvT=i=>i.ty==='string'?`((char *)jb_pv_${cid(i.name)}())`:i.ty==='matrix'?`(*(double (*)[${i.dims[0]}][${i.dims[1]}])jb_pv_${cid(i.name)}())`:`(*(${CT[i.ty]} *)jb_pv_${cid(i.name)}())`;
  const pvUsed=new Map();
  const vname=i=>i.kind==='pvar'?(D(),pvUsed.set(i.name,i),pvT(i)):i.kind==='public'?`p_${cid(i.name)}`:i.kind==='global'?`g_${cid(i.mod)}_${cid(i.name)}`:i.kind==='tvar'?`c->v_${cid(i.name)}`:i.kind==='rvar'?`c->r${i.runK}_v_${cid(i.name)}`:`v_${cid(i.name)}`;
  const fname=(m,n)=>`f_${cid(m)}_${cid(n)}`;
  const tidx=new Map([...prog.tasks.keys()].map((k,i)=>[k,i]));
  const dynB=m=>(m.belongDecl||[]).some(d=>!d.scene);   // run 안에 dis.BelongObj 가 있는 파일
  const tname=p=>`task_${tidx.get(p)}`;
  const CT={int:'int',float:'double',bit:'unsigned char',string:'char',matrix:'double',list:'jb_list',compound:'jb_list'};
  const RT={int:'int',float:'double',bit:'unsigned char',string:'const char *',list:'jb_list *',compound:'jb_list *',matrix:'const double *'};
  // 함수에 넘기는 값: 리스트 · compound → const jb_list * · 행렬 → const double * (함수 안에서 복사)
  const lptr=(a,ty)=>{
    used.list=true;
    if(a.k==='mat'){used.ltmp=true;return `jb_ltmp(${a.rows[0].length}${a.rows[0].map(x=>', '+toIt(x)).join('')})`;}
    if(a.ty==='any')return `jb_ilist(${anyx(a)}, ${ty==='compound'?4:3}, ${a.line})`;
    return `&${lv(a)}`;
  };
  const argC=(a,pp)=>pp.ty==='matrix'?msrc(a):isL(pp.ty)?lptr(a,pp.ty):conv(a,pp.ty);
  // 문자열 · 리스트 · 행렬을 돌려주는 함수: 호출하는 쪽이 결과 자리(jb_o_)를 넘김 — 호출마다 따로 (f("a") == f("b") · 스레드 · 재귀)
  const retOut=d=>d.retTy==='string'?['(char[JB_STR_MAX]){0}']:isL(d.retTy)?(used.list=used.lring=true,['jb_lring()']):d.retTy==='matrix'?(used.mat=true,[`(double[${msz(d.retDims)}]){0}`]):[];
  let curFnC=null,sendHere=false;
  // 리스트: jb_list 변수 · 항목(any) 은 jb_it 값
  const lv=e=>(used.list=true,e.k==='call'?`(*${cx(e)})`:e.k==='objvar'?ovx(e):e.k==='member'?marr(e):vname(e.info));   // 함수가 돌려준 리스트 = (*f(…))
  // obj.id.변수 → 그 오브젝트에 귀속된 파일 실행의 변수
  const ovx=e=>(D(),`((struct ${tname(e.info.file)}_ctx *)jb_inst_ctx(${cstr(e.id)}, ${tidx.get(e.info.file)}, ${e.line}))->${e.info.runK!=null?`r${e.info.runK}_`:''}v_${cid(e.name)}`);
  const OKEY={pos:"'p'",scale:"'s'",vel:"'v'",color:"'c'",text:"'x'",trigid:"'i'"};
  const oid=e=>e.id===null?'""':cstr(e.id);   // id 없음 = 자기 자신 (귀속된 파일)
  let curIdC=null;   // setObjPos 등의 행렬 안 obj.Xpos → 지금 바꾸는 오브젝트
  function anyx(e){   // any 식 → jb_it
    used.list=true;
    if(e.k==='idx')return `jb_lget(${e.base.ty==='any'?`jb_ilist(${anyx(e.base)}, 0, ${e.line})`:'&'+lv(e.base)}, ${cx(e.i)}, ${e.line})`;
    return `jb_iadd(${toIt(e.l)}, ${toIt(e.r)}, ${e.line})`;
  }
  function toIt(e){   // 값 → 리스트 항목 jb_it (넣을 때 jb_own 으로 복사)
    used.list=true;
    if(e.k==='mat'&&e.asList){used.lnest=true;return `jb_ltmpit(${e.comp?4:3}, ${e.rows[0].length}${e.rows[0].map(x=>', '+toIt(x)).join('')})`;}
    if(e.ty==='any'){const r=anyx(e);return e.chk==='scalar'?`jb_iscal(${r}, ${e.line})`:r;}
    if(e.ty==='string')return `jb_sit(${cx(e)})`;
    if(e.ty==='matrix')return `jb_mit(${msrc(e)}, ${e.dims[0]}, ${e.dims[1]})`;
    if(isL(e.ty))return `jb_lit(&${lv(e)}, ${e.ty==='list'?3:4})`;
    return `jb_dit(${cx(e)})`;
  }
  function lassign(nm,e,push){
    used.list=true;
    if(e.k==='mat'){   // 새 리스트를 다 만든 뒤 바꿈 (a = [a[2], 1]; 도 됨)
      push('{ jb_list _t = {0};');for(const x of e.rows[0])push(`    jb_ladd(&_t, ${toIt(x)});`);push(`    jb_lmove(&${nm}, &_t); }`);
    }
    else if(e.k==='call'&&e.strf==='splitStr'){used.str=used.split=true;push(`{ jb_list _t = {0}; jb_lsplit(&_t, ${cx(e.args[0])}, ${cx(e.args[1])}); jb_lmove(&${nm}, &_t); }`);}
    else if(e.ty==='any')push(`jb_lcopy(&${nm}, jb_ilist(${anyx(e)}, ${e.chk==='compound'?4:3}, ${e.line}));`);
    else push(`jb_lcopy(&${nm}, &${lv(e)});`);
  }
  const sfx=(ty,d)=>ty==='string'?'[JB_STR_MAX]':ty==='matrix'?`[${d[0]}][${d[1]}]`:'';
  // 행렬 변수의 C 배열 이름
  const marr=e=>e.k==='objvar'?ovx(e):e.k==='id'?vname(e.info):(e.info&&e.info.kind==='public')?vname(e.info):`g_${cid(e.mod)}_${cid(e.name)}`;
  // 행렬 식 → const double * (성분은 행 순서)
  function msrc(e){
    used.mat=true;
    if(e.ty==='any')return `jb_imat(${anyx(e)}, ${e.dims[0]}, ${e.dims[1]}, ${e.line})`;   // compound 항목
    if(e.k==='mat')return `(const double[]){${e.rows.flat().map(x=>cx(x)).join(', ')}}`;
    if(e.k==='id'||e.k==='objvar'||(e.k==='member'&&e.info))return `&${marr(e)}[0][0]`;
    if(e.k==='objprop'){D();return `jb_getm(${oid(e)}, ${OKEY[e.key]}, ${e.line})`;}
    if(e.k==='call')return cx(e);   // 행렬을 돌려주는 함수
    return `(const double[]){${new Array(e.dims[0]*e.dims[1]).fill('0').join(', ')}}`;
  }
  const mstr=e=>(used.mstr=true,`jb_mstr(${msrc(e)}, ${e.dims[0]}, ${e.dims[1]})`);
  const msz=d=>d[0]*d[1];
  const cstr=s=>'"'+s.replace(/[\\"]/g,'\\$&').replace(/[\x00-\x1f]/g,c=>c==='\n'?'\\n':c==='\t'?'\\t':c==='\r'?'\\r':'\\'+c.charCodeAt(0).toString(8).padStart(3,'0'))+'"';
  const FM={int:'%d',bit:'%d',float:'%g',string:'%s'};
  function flat(e,acc){
    if(e.k==='bin'&&e.op==='+'&&e.ty==='string'){flat(e.l,acc);flat(e.r,acc);}else acc.push(e);
    return acc;
  }
  function cat(e){
    used.cat=true;
    let fmt='';const a=[];
    for(const p of flat(e,[])){
      if(p.k==='str')fmt+=p.v.replace(/%/g,'%%');
      else if(p.ty==='matrix'){fmt+='%s';a.push(mstr(p));}
      else if(p.ty==='any'){fmt+='%s';a.push(`jb_ifmt(${anyx(p)})`);}
      else if(isL(p.ty)){fmt+='%s';a.push(`jb_lfmt(&${lv(p)})`);}
      else{fmt+=FM[p.ty];a.push(cx(p));}
    }
    return `jb_cat(${cstr(fmt)}${a.map(x=>', '+x).join('')})`;
  }
  function cx(e){
    if(e.ty==='any'){const r=anyx(e);return e.chk==='string'?`jb_istr(${r}, ${e.line})`:e.chk?`jb_inum(${r}, ${e.line})`:r;}
    switch(e.k){
      case 'num':return e.isFloat?e.raw:String(e.v);
      case 'str':return cstr(e.v);
      case 'bool':return e.v?'1':'0';
      case 'id':return vname(e.info);
      case 'member':
        if(e.lnode)return `${lv(e.lnode)}.n`;
        if(e.mod===DIS_ID){D();return e.name==='idWidthmode'?'jb_widthmode()':e.name==='displayX'?'jb_disw()':'jb_dish()';}
        if(e.mod===CAN_ID){D();return {ScreenClicked:'jb_clicked()',MouseX:'jb_mousex()',MouseY:'jb_mousey()',SceneName:'jb_scenename()'}[e.name];}
        if(e.info&&e.info.kind==='public')return vname(e.info);
        return `g_${cid(e.mod)}_${cid(e.name)}`;
      case 'un':return `(${e.op}${cx(e.e)})`;
      case 'idx':
        if(e.anyBase){used.list=true;return `(*jb_imel(${anyx(e.base)}, ${cx(e.i)}, ${cx(e.j)}, ${e.line}))`;}
        if(e.base.k==='objprop'){
          D();
          const comp=e.i.k==='num'&&e.j.k==='num'?String(e.j.v-1):(used.ix=true,`jb_ix(${cx(e.i)}, 1) * 0 + jb_ix(${cx(e.j)}, 2)`);
          return `jb_getf(${oid(e.base)}, ${OKEY[e.base.key]}, ${comp}, ${e.line})`;
        }
        used.ix=true;
        return `${marr(e.base)}[jb_ix(${cx(e.i)}, ${e.base.dims[0]})][jb_ix(${cx(e.j)}, ${e.base.dims[1]})]`;
      case 'objprop':
        D();
        if(e.key==='istrig')return `jb_geti(${oid(e)}, ${e.line})`;
        if(e.key==='iscol')return `jb_iscol(${oid(e)}, ${e.line})`;
        if(e.key==='anifr')return `jb_anifr(${oid(e)}, ${e.line})`;
        if(e.key==='colid')return `jb_colid(${oid(e)}, ${e.line})`;
        if(STR_KEYS.has(e.key))return `jb_gets(${oid(e)}, ${OKEY[e.key]}, ${e.line})`;
        return msrc(e);
      case 'objkeep':D();return `jb_keep(${curIdC||'""'}, '${e.key[0]==='pos'?'p':e.key[0]==='scale'?'s':'v'}', ${e.key[1]})`;
      case 'canobj':D();return `${e.btn==='push'?'jb_btnPush':e.btn==='rel'?'jb_btnRel':e.btn?'jb_btnClick':'jb_mtouch'}(${oid(e)}, ${e.line})`;
      case 'objvar':return ovx(e);
      case 'mat':return msrc(e);
      case 'call':{
        if(e.lfind)return `jb_lfind(&${lv(e.lnode)}, ${toIt(e.args[0])})`;
        if(e.canKey){used.key=true;used.thread=true;return `jb_key(${cx(e.args[0])})`;}
        if(e.fileEx){used.fexist=true;const a=e.args[0];   // 따옴표 안의 경로는 미리 프로젝트 기준으로 (./ ../ 처리)
          if(a.k==='str'){const r=resolveTaskPath(a.v,e.file);return `jb_fileExists(${cstr(r==null?a.v:r)})`;}
          return `jb_fileExists(${cx(a)})`;}
        if(e.strf){used.str=true;const a=e.args.map(x=>cx(x));return STRF[e.strf].c.replace(/%(\d)/g,(_,k)=>a[+k]);}
        if(!e.math)return `${fname(e.target.mod,e.name)}(${[...retOut(e.target.def),...e.args.map((a,i)=>argC(a,e.target.def.params[i]))].join(', ')})`;
        used.math=true;
        const a=e.args.map(x=>cx(x)),fm=MATH[e.math];
        if(e.math==='random')used.rand=true;
        if(e.math==='abs')return e.ty==='int'?`abs(${a[0]})`:`fabs(${a[0]})`;
        if(e.math==='min'||e.math==='max')return e.ty==='int'?`jb_${e.math}i(${a[0]}, ${a[1]})`:(used[e.math+'f']=true,`jb_${e.math}f(${a[0]}, ${a[1]})`);
        return fm.c.replace(/%(\d)/g,(_,k)=>a[+k]);
      }
      case 'bin':
        if(e.ty==='string')return cat(e);
        if((e.op==='=='||e.op==='!=')&&(e.l.ty==='any'||e.r.ty==='any'))return `(${e.op==='!='?'!':''}jb_ieq(${toIt(e.l)}, ${toIt(e.r)}))`;
        if((e.op==='=='||e.op==='!=')&&e.l.ty==='string')return `(strcmp(${cx(e.l)}, ${cx(e.r)}) ${e.op} 0)`;
        if(e.ty==='int'&&(e.op==='/'||e.op==='%')){used.idiv=true;return `${e.op==='/'?'jb_idiv':'jb_imod'}(${cx(e.l)}, ${cx(e.r)}, ${e.line})`;}   // 0 으로 나누면 오류 · 32비트로 감쌈
        return `(${cx(e.l)} ${e.op} ${cx(e.r)})`;
    }
  }
  const conv=(e,to)=>(to==='bit'&&e.ty!=='bit')?`((${cx(e)}) != 0)`:cx(e);
  const I=n=>'    '.repeat(n);
  let ckOn=false;   // 귀속된 파일의 run: 문장마다 '지워졌나 · 꺼졌나' 확인
  let selfOn=false;   // BelongObj 가 있는 파일의 run: 문장마다 '실행 중 귀속됐나' 를 이 스레드에 반영
  function stmts(list,ind,out){for(const s of list){if(gotoAt.has(s.file+':'+s.line))out.push(`${I(ind)}jb_go_${cid(s.file)}_${s.line}: ;   /* goTo(${s.line}) */`);if(ckOn)out.push(I(ind)+'JB_CK();');if(s.k==='loop')used.spin=true;if(selfOn)out.push(I(ind)+'JB_SELF(c);');stmt(s,ind,out);}}
  // id 란: "<태그>" · "" (자기 자신) 이면 실행할 때 id 목록으로, 보통 글자면 그대로
  function withIds(a,L,body){
    if(a.k==='str'&&a.v&&!(a.v.length>2&&a.v[0]==='<'&&a.v.endsWith('>'))){const p=curIdC;curIdC=cstr(a.v);try{L(body(curIdC));}finally{curIdC=p;}return;}
    const p=curIdC;curIdC='_id';
    try{L(`{ jb_ids _L = jb_resolve(${cx(a)}, ${a.line}); for (int _k = 0; _k < _L.n; _k++) { const char *_id = _L.v[_k]; ${body('_id')} } free(_L.v); }`);}
    finally{curIdC=p;}
  }
  const colorC=a=>a.ty==='string'?`jb_colstr(${cx(a)}, ${a.line})`:`jb_coli(${cx(a)}, ${a.line})`;
  // 화면 명령 → 런타임 함수
  function disCall(s,t,L){
    D();
    const A=s.args,ln=s.line;
    if(t.mod===SND_ID){   // soundMaster → SDL2_mixer
      used.snd=true;
      switch(t.name){
        case 'setSpeaker':return L(`jb_setSpeaker(${cx(A[0])}, ${ln});`);
        case 'playSfx':return L(`jb_sndPlay(${cx(A[0])}, ${cx(A[1])}, ${cx(A[2])}, -1, ${ln});`);
        case 'repeatPart':case 'repatPart':case 'introPart':return L(`jb_sndPart(${cx(A[0])}, ${cx(A[1])}, ${cx(A[2])}, ${cx(A[3])}, ${ln});`);
        case 'repeatingPlay':return L(`jb_sndPlay(${cx(A[0])}, ${cx(A[1])}, 0, ${cx(A[2])} < 0 ? (jb_err(${ln}, "the repeat count must be 0 (forever) or more"), 0) : ${cx(A[2])}, ${ln});`);
        case 'setVol':return L(`jb_setVol(${cx(A[0])}, ${cx(A[1])}, ${ln});`);
        case 'break':return L(`jb_sndBreak(${cx(A[0])}, ${A.length>1?`(${cx(A[1])}) != 0`:'0'}, ${ln});`);
        case 'setFadein':case 'setFadeout':return L(`jb_setFade(${cx(A[0])}, ${t.name==='setFadein'?1:0}, ${cx(A[1])}, ${ln});`);
        case 'belongto':return L(`jb_spkBelong(${cx(A[0])}, ${cx(A[1])}, ${ln});`);
        case 'belongtoScene':return L(`jb_spkScene(${cx(A[0])}, ${cx(A[1])}, ${ln});`);
      }
    }
    if(t.mod===CAM_ID){   // SeongBin
      switch(t.name){
        case 'setUpCam':return L('jb_setUpCam();');
        case 'setCam':return L(`jb_setCam(${cx(A[0])}, ${ln});`);
        case 'setMainCamas':return L(`jb_setMainCam(${cx(A[0])}, ${ln});`);
        case 'setZoom':return L(`jb_setZoom(${cx(A[0])}, ${cx(A[1])}, ${ln});`);
        case 'follow':return L(`jb_camFollow(${cx(A[0])}, ${cx(A[1])}, ${ln});`);
        case 'followOut':return L(`jb_camFollow(${cx(A[0])}, "", ${ln});`);
        case 'moveCamto':{
          const ms=s.forExpr?cx(s.forExpr):'0';
          return L(`{ const char *_c = jb_camid(${cx(A[0])}, ${ln}); int _ms = ${ms}; if (_ms < 0) jb_err(${ln}, "the move time must be 0 or more"); if (_ms > 0) { jb_moveStart(_c, ${msrc(A[1])}, _ms, ${ln}); jb_moveWait(_c); } else jb_setPos(_c, ${msrc(A[1])}, ${ln}); }`);
        }
      }
    }
    if(t.mod===MAG_ID){   // 이미지 파일은 실행하는 폴더 기준 같은 경로에서 읽음
      if(t.name==='setasTexture')return L(`jb_setasTexture(${cx(A[0])}, ${msrc(A[1])}, ${msrc(A[2])}, ${cx(s.saveAs)}, ${ln});`);
      if(t.name==='setasAnime'){
        const a=A[0];
        if(a.k==='mat')return L(`jb_setasAnime((const char *[]){ ${a.rows[0].map(x=>cx(x)).join(', ')} }, ${a.rows[0].length}, ${cx(A[1])}, ${cx(A[2])}, ${ln});`);
        used.list=true;
        return L(`{ const jb_list *_l = ${a.ty==='any'?`jb_ilist(${anyx(a)}, 3, ${a.line})`:'&'+lv(a)}; const char **_f = malloc(sizeof(char *) * (size_t)(_l->n + 1)); for (int _k = 0; _k < _l->n; _k++) _f[_k] = jb_istr(_l->a[_k], ${ln}); jb_setasAnime(_f, _l->n, ${cx(A[1])}, ${cx(A[2])}, ${ln}); free(_f); }`);
      }
      if(t.name==='wearTexture')return withIds(A[0],L,id=>`jb_wearTexture(${id}, ${cx(A[1])}, ${ln});`);
      if(t.name==='applyAnime')return withIds(A[0],L,id=>`jb_runAnime(${id}, ${cx(A[1])}, 1.0, ${ln});`);
      if(t.name==='runAnime')return withIds(A[0],L,id=>`jb_runAnime(${id}, ${cx(A[1])}, ${cx(A[2])}, ${ln});`);
      if(t.name==='breakAnime')return withIds(A[0],L,id=>`jb_breakAnime(${id}, ${ln});`);
      if(t.name==='importFile'){if(IMG_RE.test(s.imgPath))used.img=true;return L(`jb_importFile(${cstr(s.imgPath)}, ${cx(s.saveAs)}, ${ln});   /* 이름 → 경로 */`);}
      if(t.name==='importFolder'){for(const [nm,path] of s.folderFiles){if(IMG_RE.test(path))used.img=true;L(`jb_importFile(${cstr(path)}, ${cstr(nm)}, ${ln});`);}return;}   /* 폴더 안 파일마다 */
      return withIds(A[0],L,id=>`jb_setTexture(${id}, ${cx(A[1])}, ${msrc(A[2])}, ${msrc(A[3])}, ${ln});`);
    }
    if(t.mod===CAN_ID){
      if(t.name==='popupScene'||t.name==='closeScene')throw new JBError(`C 변환은 아직 can.${t.name} 을 지원하지 않습니다 (편집기 · HTML 내보내기에서만 실행됨)`,s.line,s.file);
      if(t.name==='setUpScene')return L('jb_setUpScene();');
      if(t.name==='setasButton')return withIds(A[0],L,id=>`jb_setButton(${id}, ${ln});`);
      if(t.name==='bindInput'){used.key=true;return withIds(A[0],L,id=>`jb_bindInput(${id}, ${cx(s.toExpr)}, ${ln});`);}
      if(t.name==='setExistableScene')return withIds(A[1],L,id=>`jb_existScene(${cx(A[0])}, ${id}, ${ln});`);
      return L(`jb_${t.name}(${cx(A[0])}, ${ln});`);
    }
    if(t.mod===COL_ID)switch(t.name){
      case 'setLink':return withIds(A[0],L,id=>`jb_setLink(${id}, ${cx(A[1])}, ${ln});`);
      case 'setVelocity':return withIds(A[0],L,id=>`jb_setVelocity(${id}, ${msrc(A[1])}, ${ln});`);
      case 'setVelocityX':case 'setVelocityY':{   // 다른 방향은 지금 속도 그대로
        const X=t.name==='setVelocityX';
        return withIds(A[0],L,id=>`{ double _v = ${cx(A[1])}, _w = jb_getf(${id}, 'v', ${X?1:0}, ${ln}); jb_setVelocity(${id}, (const double[]){ ${X?'_v, _w':'_w, _v'} }, ${ln}); }`);
      }
      case 'setAnchor':return withIds(A[0],L,id=>`jb_setAnchor(${id}, ${cx(A[1])}, ${ln});`);
      case 'setCollider':case 'setColider':return withIds(A[2],L,id=>`jb_setCollider(${msrc(A[0])}, ${msrc(A[1])}, ${id}, ${cx(A[3])}, ${cx(A[4])}, ${ln});`);
      case 'setTrigger':return withIds(A[2],L,id=>`jb_setTrigger(${msrc(A[0])}, ${msrc(A[1])}, ${id}, ${cx(A[3])}, ${ln});`);
      case 'setColliderVisible':return L(`jb_colVisible(${cx(A[0])});`);
      case 'setGravity':return L(`jb_setGravity(${cx(A[0])});`);
    }
    switch(t.name){
      case 'waitF':return L(`jb_waitF(${cx(A[0])});`);
      case 'setDisplay':return L('jb_setDisplay();');
      case 'setDisplayColor':return L(`jb_setDisplayColor(${cx(A[0])}, ${ln});`);
      case 'setFont':used.ttf=true;return L(s.fontPath?`jb_setFont(${cstr(s.fontPath)}, ${ln});`:`jb_setFont(jb_fontArg(${cx(A[0])}), ${ln});`);
      case 'setupObject':return L('jb_setupObject();');
      case 'enableScreenScale':case 'disableScreenScale':return L(`jb_screenScale(${t.name==='enableScreenScale'?1:0});`);
      case 'setObject':return withIds(A[1],L,id=>`jb_setObject(${id}, ${msrc(A[0])}, ${msrc(A[2])}, ${colorC(A[3])}, ${ln});`);
      case 'setObjPlg':{
        const nv=A.length-2,pv=k=>k<nv?msrc(A[k]):'NULL';
        return withIds(A[nv],L,id=>`jb_setObjPlg(${id}, ${nv}, ${pv(0)}, ${pv(1)}, ${pv(2)}, ${pv(3)}, ${colorC(A[nv+1])}, ${ln});`);
      }
      case 'setObjCyl':return withIds(A[1],L,id=>`jb_setObjCyl(${id}, ${msrc(A[0])}, ${cx(A[2])}, ${colorC(A[3])}, ${ln});`);
      case 'setText':used.ttf=true;return withIds(A[2],L,id=>`jb_setText(${id}, ${msrc(A[0])}, ${cx(A[1])}, ${cx(A[3])}, ${cx(A[4])}, ${colorC(A[5])}, ${ln});`);
      case 'setObjPos':case 'setObjScale':case 'setObjAlpha':case 'setObjColor':case 'setObjOverlay':{
        const to=t.name==='setObjAlpha'?`(const double[]){ (double)(${cx(A[1])}) }`:t.name==='setObjColor'?`jb_colrgb(${colorC(A[1])})`:t.name==='setObjOverlay'?`jb_ovrgba(${colorC(A[1])}, ${cx(A[2])})`:msrc(A[1]);
        if(!s.forExpr){
          if(t.name==='setObjPos')return withIds(A[0],L,id=>`jb_setPos(${id}, ${msrc(A[1])}, ${ln});`);
          if(t.name==='setObjScale')return withIds(A[0],L,id=>`jb_setScale(${id}, ${msrc(A[1])}, ${ln});`);
          if(t.name==='setObjAlpha')return withIds(A[0],L,id=>`jb_setAlpha(${id}, ${cx(A[1])}, ${ln});`);
          if(t.name==='setObjOverlay')return withIds(A[0],L,id=>`jb_setOverlay(${id}, ${colorC(A[1])}, ${cx(A[2])}, ${ln});`);
          return withIds(A[0],L,id=>`jb_setcolor(${id}, ${colorC(A[1])}, ${ln});`);
        }
        // for ms: 모두 함께 바뀌기 시작하면 (한 프레임) 다음 줄 — 끝은 기다리지 않음
        const kind={setObjPos:"'p'",setObjScale:"'s'",setObjAlpha:"'a'",setObjColor:"'c'",setObjOverlay:"'o'"}[t.name];
        const p=curIdC;curIdC='_id';
        try{L(`{ jb_ids _L = jb_resolve(${cx(A[0])}, ${ln}); int _ms = ${cx(s.forExpr)}; for (int _k = 0; _k < _L.n; _k++) { const char *_id = _L.v[_k]; jb_easeNext = ${s.easeExpr?`jb_easeId(${cx(s.easeExpr)}, ${ln})`:'0'}; jb_tweenStart(_id, ${kind}, ${to}, _ms, ${ln}); } if (_ms > 0 && _L.n > 0) jb_waitF(1); free(_L.v); }`);}
        finally{curIdC=p;}
        return;
      }
      case 'rotateObj':{   // 모두 함께 돌기 시작하면 (한 프레임) 다음 줄
        const p=curIdC;curIdC='_id';
        try{L(`{ jb_ids _L = jb_resolve(${cx(A[0])}, ${ln}); double _a = ${cx(A[1])}; int _ms = ${cx(A[2])}; for (int _k = 0; _k < _L.n; _k++) jb_rotate(_L.v[_k], _a, _ms, ${ln}); if (_ms > 0 && _L.n > 0) jb_waitF(1); free(_L.v); }`);}
        finally{curIdC=p;}
        return;
      }
      case 'setGlow':return L(`/* dis.setGlow: C 변환에서는 빛 번짐을 그리지 않음 */`);
      case 'setRenderLimit':return L(`jb_setRenderLimit(${cx(A[0])}, ${ln});`);
      case 'setTilemap':throw new JBError('C 변환은 아직 dis.setTilemap 을 지원하지 않습니다 (편집기 · HTML 내보내기에서만 실행됨)',s.line,s.file);
      case 'nudgeObj':return withIds(A[0],L,id=>`jb_nudge(${id}, ${msrc(A[1])}, ${cx(A[2])}, ${cx(A[3])}, ${ln});`);
      case 'setTextNudge':return withIds(A[0],L,id=>`jb_setTextNudge(${id}, ${cx(A[1])}, ${ln});`);
      case 'setObjNudge':return withIds(A[0],L,id=>`jb_setObjNudge(${id}, ${cx(A[1])}, ${ln});`);
      case 'moveObj':{   // 모두 함께 움직이고, 다 끝나면 다음 줄
        const ms=s.forExpr?cx(s.forExpr):'0';
        const p=curIdC;curIdC='_id';
        try{L(`{ jb_ids _L = jb_resolve(${cx(A[0])}, ${ln}); int _ms = ${ms}; for (int _k = 0; _k < _L.n; _k++) { const char *_id = _L.v[_k]; jb_easeNext = ${s.easeExpr?`jb_easeId(${cx(s.easeExpr)}, ${ln})`:'0'}; jb_moveStart(_id, ${msrc(s.toExpr)}, _ms, ${ln}); } if (_ms > 0) for (int _k = 0; _k < _L.n; _k++) jb_moveWait(_L.v[_k]); free(_L.v); }`);}
        finally{curIdC=p;}
        return;
      }
      case 'setLink':return withIds(A[0],L,id=>`jb_setLink(${id}, ${cx(A[1])}, ${ln});`);
      case 'removeObj':case 'escParent':case 'splitParent':return withIds(A[0],L,id=>`jb_${t.name}(${id}, ${ln});`);
      case 'setParent':return L(`jb_setParent(${cx(s.relChild)}, ${cx(s.relParent)}, ${ln});`);
      case 'setObjLayer':return withIds(A[0],L,id=>`jb_setLayer(${id}, ${cx(A[1])}, ${ln});`);
      case 'ascendObjLayer':return withIds(A[0],L,id=>`jb_ascendLayer(${id}, ${cx(A[1])}, ${ln});`);
      case 'setTxtContent':return withIds(A[0],L,id=>`jb_settext(${id}, ${cx(A[1])}, ${ln});`);
      case 'tagObj':return withIds(A[0],L,id=>`jb_tagObj(${id}, ${cx(A[1])}, ${ln});`);
      case 'setObjAlpha':return withIds(A[0],L,id=>`jb_setAlpha(${id}, ${cx(A[1])}, ${ln});`);
      case 'disableObj':case 'enableObj':return withIds(A[0],L,id=>`jb_enableObj(${id}, ${t.name==='enableObj'?1:0}, ${ln});`);
      case 'getVar':{
        const ty=s.asInfo.ty,nm=vname(s.asInfo);
        const take=ty==='string'?(used.set=true,`if (_t != 's') jb_err(${ln}, "getVar: the variable must be a string"); jb_set(${nm}, _s);`)
          :ty==='matrix'?(used.mat=true,`if (_t != 'm') jb_err(${ln}, "getVar: the variable must be a matrix[1, 2]"); jb_mcpy(&${nm}[0][0], _m, 2);`)
          :`if (_t != 'f') jb_err(${ln}, "getVar: the variable must be a number"); ${nm} = (${CT[ty]})${ty==='bit'?'(_f != 0)':'_f'};`;
        return L(`{ double _f = 0, _m[2] = {0, 0}; const char *_s = ""; int _t = jb_getvar(${cx(A[0])}, ${cx(A[1])}, ${ln}, &_f, &_s, _m); ${take} }`);
      }
    }
    L(`/* ${s.lib}.${t.name}() */`);
  }
  function ifs(s,ind,head,out){
    out.push(`${I(ind)}${head} (${cx(s.cond)}) {`);
    stmts(s.then,ind+1,out);
    if(s.else){
      if(s.elseIf){ifs(s.else[0],ind,'} else if',out);return;}
      out.push(`${I(ind)}} else {`);stmts(s.else,ind+1,out);
    }
    out.push(`${I(ind)}}`);
  }
  function stmt(s,ind,out){
    const L=t=>out.push(I(ind)+t);
    switch(s.k){
      case 'use':case 'lib':case 'func':return;
      case 'belong':return;   // 귀속은 실행 시작 표 (jb_start_bound · jb_start_scene) 로
      case 'var':{
        if(s.pub)return;
        const nm=vname(s.info);
        if(isL(s.ty)){
          used.list=true;
          if(s.info.kind!=='tvar'&&s.info.kind!=='rvar')L(`jb_list ${nm} = {0};`);
          if(s.init)lassign(nm,s.init,L);
          return;
        }
        if(s.ty==='matrix'){
          if(s.info.kind!=='tvar'&&s.info.kind!=='rvar')L(`double ${nm}${sfx('matrix',s.dims)} = {{0}};`);
          if(s.init)L(`jb_mcpy(&${nm}[0][0], ${msrc(s.init)}, ${msz(s.dims)});`);
          return;
        }
        if(s.info.kind==='tvar'||s.info.kind==='rvar'){   // 구조체 필드 (0 으로 초기화되어 있음)
          if(s.init){if(s.ty==='string'){used.set=true;L(`jb_set(${nm}, ${cx(s.init)});`);}else L(`${nm} = ${conv(s.init,s.ty)};`);}
          return;
        }
        if(s.ty==='string'){
          if(s.init){L(`char ${nm}[JB_STR_MAX];`);L(`jb_set(${nm}, ${cx(s.init)});`);used.set=true;}
          else L(`char ${nm}[JB_STR_MAX] = "";`);
        }else L(`${CT[s.ty]} ${nm} = ${s.init?conv(s.init,s.ty):'0'};`);
        return;
      }
      case 'assign':{
        const nm=vname(s.info);
        if(isL(s.ty)){lassign(nm,s.expr,L);return;}
        if(s.ty==='matrix'){L(`jb_mcpy(&${nm}[0][0], ${msrc(s.expr)}, ${msz(s.dims)});`);return;}
        if(s.ty==='string'){used.set=true;L(`jb_set(${nm}, ${cx(s.expr)});`);}
        else L(`${nm} = ${conv(s.expr,s.ty)};`);
        return;
      }
      case 'eassign':
        if(s.isList){
          if(s.anyBase)L(`jb_lsetd(${anyx(s.target)}, ${cx(s.i)}, ${toIt(s.expr)}, ${s.line});`);
          else L(`jb_lset(&${lv(s.target)}, ${cx(s.i)}, ${toIt(s.expr)}, ${s.line});`);
          return;
        }
        if(s.anyMat){L(`*jb_imel(${anyx(s.target)}, ${cx(s.i)}, ${cx(s.j)}, ${s.line}) = ${cx(s.expr)};`);return;}
        if(s.target.k==='objprop'){
          D();used.ix=true;
          L(`jb_setf(${oid(s.target)}, ${OKEY[s.target.key]}, jb_ix(${cx(s.i)}, 1) * 0 + jb_ix(${cx(s.j)}, 2), ${cx(s.expr)}, ${s.line});`);return;
        }
        used.ix=true;
        L(`${marr(s.target)}[jb_ix(${cx(s.i)}, ${s.target.dims[0]})][jb_ix(${cx(s.j)}, ${s.target.dims[1]})] = ${cx(s.expr)};`);
        return;
      case 'oassign':{
        const tg=s.target;D();
        if(tg.k==='objvar'){
          const nm=ovx(tg);
          if(isL(tg.ty))lassign(nm,s.expr,L);
          else if(tg.ty==='matrix'){used.mat=true;L(`jb_mcpy(&${nm}[0][0], ${msrc(s.expr)}, ${msz(tg.dims)});`);}
          else if(tg.ty==='string'){used.set=true;L(`jb_set(${nm}, ${cx(s.expr)});`);}
          else L(`${nm} = ${conv(s.expr,tg.ty)};`);
          return;
        }
        if(tg.key==='color')L(`jb_setcolor(${oid(tg)}, ${colorC(s.expr)}, ${s.line});`);
        else if(tg.key==='text')L(`jb_settext(${oid(tg)}, ${cx(s.expr)}, ${s.line});`);
        else if(tg.key==='istrig')L(`jb_setistrig(${oid(tg)}, ${cx(s.expr)}, ${s.line});`);
        else L(`jb_setm(${oid(tg)}, ${OKEY[tg.key]}, ${msrc(s.expr)}, ${s.line});`);
        return;
      }
      case 'if':
        if(s.jumpTarget)s.lbl=++lblN;
        if(s.jReturn)L(`jb_if_${s.lbl}:;`);
        ifs(s,ind,'if',out);
        if(s.jBreak)L(`jb_ifend_${s.lbl}:;`);
        return;
      case 'loop':
        if(s.ms){   // loop for ms
          used.clock=true;const k=++lblN;
          L(`for (double jb_e${k} = jb_msnow() + (double)(${cx(s.ms)}); jb_msnow() < jb_e${k}${s.cond?` && (${cx(s.cond)})`:''}; ) {`);L('    JB_SPIN();');
          stmts(s.body,ind+1,out);L('}');return;
        }
        L(`while (${s.cond?cx(s.cond):'1'}) {`);L('    JB_SPIN();');stmts(s.body,ind+1,out);L('}');return;
      case 'run':L('{');stmts(s.body,ind+1,out);L('}');return;
      case 'call':{
        const t=s.target;
        if(t.mod==='jawbreaker'){
          if(t.name==='log'||t.name==='print'){
            const a=s.args[0];
            if(a.ty==='matrix'){used.ls=true;L(`jb_log_s(${mstr(a)});`);return;}
            if(a.ty==='any'){used.ls=true;L(`jb_log_s(jb_ifmt(${anyx(a)}));`);return;}
            if(isL(a.ty)){used.ls=true;L(`jb_log_s(jb_lfmt(&${lv(a)}));`);return;}
            const f=a.ty==='string'?(used.ls=true,'jb_log_s'):a.ty==='float'?(used.lf=true,'jb_log_f'):(used.li=true,'jb_log_i');
            L(`${f}(${cx(a)});`);
          }else if(t.name==='wait'){used.wait=true;L(`jb_wait(${cx(s.args[0])});`);}
          else if(t.name==='keyClick'||t.name==='keyPush'||t.name==='keyRlse'){used.key=true;used.thread=true;L(`jb_keyVirt(${cx(s.args[0])}, ${t.name==='keyClick'?0:t.name==='keyPush'?1:2}, ${s.line});`);}
          else if(t.name==='setJson'){
            used.json=true;used.list=true;const a=s.args[1];
            if(a.k==='mat'&&a.asList){L('{ jb_list _t = {0};');for(const x of a.rows[0])L(`    jb_ladd(&_t, ${toIt(x)});`);L(`    jb_setJson(${cx(s.args[0])}, jb_lit(&_t, 4), ${s.line}); jb_lfree(&_t); }`);}
            else L(`jb_setJson(${cx(s.args[0])}, ${toIt(a)}, ${s.line});`);
          }
          else if(t.name==='loadJson'){used.json=true;used.list=true;L(`{ jb_list _t = {0}; jb_loadJson(&_t, ${cx(s.args[0])}, ${s.line}); jb_lmove(&${vname(s.jinfo)}, &_t); }`);}
          else if(t.name==='genJson'){used.json=true;used.list=true;L(`jb_genJson(${cx(s.args[0])}, ${cx(s.args[1])}, ${s.line});`);}
          else if(t.name==='exportFile'||t.name==='openFile')throw new JBError(`C 변환은 아직 jaw.${t.name} 을 지원하지 않습니다 (편집기 · HTML 내보내기에서만 실행됨)`,s.line,s.file);
          else if(t.name==='terminate'){used.exit=true;L('exit(0);');}
          else if(t.name==='sendto'){used.sendto=true;sendHere=true;L(`{ jb_next_ = ${tname(s.taskPath)}; goto jb_send_end_; }   /* sendto: 이 run 은 끝 → 그 파일로 */`);}
          else if(t.name==='setup')L(`jb_setup(${tidx.get(s.taskPath)});`);
          else if(t.name==='goTo')L(`goto jb_go_${cid(s.file)}_${s.args[0].v};`);
          else if(t.name==='break')L(s.jump.k==='loop'?'break;':`goto jb_ifend_${s.jump.lbl};`);
          else if(t.name==='return'&&s.ret){
            if(s.retTy==='string'){used.set=true;L(`{ jb_set(jb_o_, ${cx(s.args[0])}); return jb_o_; }`);}
            else if(isL(s.retTy)){L('{');lassign('(*jb_o_)',s.args[0],x=>L('    '+x));L('    return jb_o_;');L('}');}
            else if(s.retTy==='matrix'){used.mat=true;L(`{ jb_mcpy(jb_o_, ${msrc(s.args[0])}, ${msz(s.retDims)}); return jb_o_; }`);}
            else L(`return ${conv(s.args[0],s.retTy)};`);
          }
          else if(t.name==='return')L(s.jump.k==='loop'?'continue;':`goto jb_if_${s.jump.lbl};`);
        }else if(t.mod==='@belong'){   /* 오브젝트가 생길 때는 시작 표 (jb_start_bound · jb_start_scene) 로 · 아직 귀속되지 않은 실행이면 지금 귀속 */
          if(t.name==='BelongObj'){D();L(`jb_bindNow(${cstr(s.args[0].v)}, ${tidx.get(s.file)}, c, c->jb_self_, ${s.line});`);}
        }else if(t.mod==='@list'){
          const nm=lv(s.lnode);
          if(t.name==='add')L(`jb_ladd(&${nm}, ${toIt(s.args[0])});`);
          else if(t.name==='insert')L(`jb_lins(&${nm}, ${cx(s.args[0])}, ${toIt(s.args[1])}, ${s.line});`);
          else if(t.name==='remove')L(`jb_ldel(&${nm}, ${cx(s.args[0])}, ${s.line});`);
          else L(`jb_lclr(&${nm});`);
        }else if(t.mod===DIS_ID||t.mod===COL_ID||t.mod===CAN_ID||t.mod===MAG_ID||t.mod===SND_ID||t.mod===CAM_ID){
          disCall(s,t,L);
        }
        else L(`${fname(t.mod,t.name)}(${[...retOut(t.def),...s.args.map((a,i)=>argC(a,t.def.params[i]))].join(', ')});`);
      }
    }
  }

  const globalsL=[],protoL=[],funcL=[],initCalls=[],taskProto=[],taskL=[];
  for(const [n,i] of prog.publics)globalsL.push(`static ${CT[i.ty]} p_${cid(n)}${sfx(i.ty,i.dims)};   /* public */`);
  const structL=[];
  for(const [path,m] of prog.tasks){
    const vars=m.ast.filter(s=>s.k==='var'&&!s.pub);
    structL.push(`/* ${path} */`,`struct ${tname(path)}_ctx {`);
    if(dynB(m))structL.push('    char jb_self_[JB_ID_MAX];   /* 실행 중 dis.BelongObj 로 귀속된 오브젝트 */');
    else if(!vars.length)structL.push('    int unused_;');
    for(const v of vars)structL.push(`    ${CT[v.ty]} v_${cid(v.name)}${sfx(v.ty,v.dims)};`);
    let rk=0;
    for(const r of m.ast)if(r.k==='run'){for(const v of r.body)if(v.k==='var'&&!v.pub)structL.push(`    ${CT[v.ty]} r${rk}_v_${cid(v.name)}${sfx(v.ty,v.dims)};   /* run ${rk + 1} */`);rk++;}
    structL.push('};');
  }
  structL.push('');
  for(const m of prog.libs){
    const initL=[];
    for(const s of m.ast){
      if(s.k==='var'&&!s.pub){
        const nm=vname(s.info);
        globalsL.push(`static ${CT[s.ty]} ${nm}${sfx(s.ty,s.dims)};`);
        if(s.init){
          if(isL(s.ty))lassign(nm,s.init,x=>initL.push('    '+x));
          else if(s.ty==='matrix')initL.push(`    jb_mcpy(&${nm}[0][0], ${msrc(s.init)}, ${msz(s.dims)});`);
          else if(s.ty==='string'){used.set=true;initL.push(`    jb_set(${nm}, ${cx(s.init)});`);}
          else initL.push(`    ${nm} = ${conv(s.init,s.ty)};`);
        }
      }
    }
    if(initL.length){
      funcL.push(`static void jb_init_${cid(m.name)}(void) {`,...initL,'}','');
      initCalls.push(`    jb_init_${cid(m.name)}();`);
    }
  }
  for(const m of prog.libs){
    for(const s of m.ast){
      if(s.k!=='func')continue;
      const outP=s.retTy==='string'?['char *jb_o_']:isL(s.retTy)?['jb_list *jb_o_']:s.retTy==='matrix'?['double *jb_o_']:[];   // 결과 자리 (호출하는 쪽이 줌)
      const ps0=s.params.map(p=>p.ty==='string'?'const char *'+vname(p.info):isL(p.ty)?`const jb_list *${vname(p.info)}_p`:p.ty==='matrix'?`const double *${vname(p.info)}_p`:CT[p.ty]+' '+vname(p.info));
      const ps=outP.length||ps0.length?[...outP,...ps0].join(', '):'void';
      const fn=fname(m.name,s.name);
      if(isL(s.retTy)||s.params.some(p=>isL(p.ty)))used.list=true;
      if(s.retTy==='matrix'||s.params.some(p=>p.ty==='matrix'))used.mat=true;
      const sig=`static ${s.retTy?RT[s.retTy]:'void'} ${fn}(${ps})`;
      protoL.push(sig+';');
      curFnC=fn;
      funcL.push(`/* lib ${m.name}${m.parentId?' (parent '+m.parentId+')':''} */`,sig+' {');
      for(const p of s.params){   // 리스트 · compound · 행렬 매개변수는 복사본 (바꿔도 넘긴 쪽은 그대로)
        const v=vname(p.info);
        if(isL(p.ty))funcL.push(`    jb_list ${v} = {0}; jb_lcopy(&${v}, ${v}_p);`);
        else if(p.ty==='matrix')funcL.push(`    double ${v}[${p.dims[0]}][${p.dims[1]}]; jb_mcpy(&${v}[0][0], ${v}_p, ${msz(p.dims)});`);
      }
      stmts(s.body,1,funcL);
      if(s.retTy==='string')funcL.push('    jb_o_[0] = 0;','    return jb_o_;   /* return(값) 없이 끝나면 "" */');
      else if(isL(s.retTy))funcL.push('    jb_lfree(jb_o_);','    return jb_o_;   /* return(값) 없이 끝나면 빈 리스트 */');
      else if(s.retTy==='matrix')funcL.push(`    memset(jb_o_, 0, sizeof(double) * ${msz(s.retDims)});`,'    return jb_o_;   /* return(값) 없이 끝나면 0 행렬 */');
      else if(s.retTy)funcL.push('    return 0;   /* return(값) 없이 끝나면 0 */');
      funcL.push('}','');curFnC=null;
    }
  }
  for(const [path,m] of prog.tasks){
    const tn=tname(path),ctx=`struct ${tn}_ctx`;
    const sig=`static void ${tn}(void)`;
    taskProto.push(sig+';');
    const vars=m.ast.filter(s=>s.k==='var'&&!s.pub),runs=m.ast.filter(s=>s.k==='run');
    const bound=m.bound||m.sceneBound;
    taskL.push(`/* ${path} */`);
    runs.forEach((r,k)=>{
      taskL.push(`static void *${tn}_run${k}(void *arg) {`,`    ${ctx} *c = (${ctx} *)arg;`,'    (void)c;');
      sendHere=false;
      ckOn=bound;selfOn=dynB(m);try{stmts(r.body,1,taskL);}finally{ckOn=false;selfOn=false;}
      if(sendHere)taskL.push('jb_send_end_:','    jb_trampoline();');
      taskL.push('    return NULL;','}','');
    });
    if(bound){   // 오브젝트 · 장면에 귀속되어 실행: 변수는 실행마다 따로, run 은 따로 도는 스레드
      D();
      taskL.push(`static void ${tn}_inst(const char *self, jb_tk *tk) {`,`    ${ctx} *c = calloc(1, sizeof *c);`,'    if (!c) exit(1);','    tk->ctx = c;',
        '    const char *ps_ = jb_tself; jb_tk *pt_ = jb_ttk;','    jb_tself = self; jb_ttk = tk;');
      stmts(vars,1,taskL);
      taskL.push('    jb_tself = ps_; jb_ttk = pt_;');
      runs.forEach((r,k)=>taskL.push(`    jb_spawn_run(${tn}_run${k}, c, tk);`));
      taskL.push('}','');
    }
    const heap=runs.length>1&&!dynB(m);   // run 이 여럿: 각각 스레드 (기다리지 않음 — sendto 로 넘어가도 쌓이지 않게) · 변수는 힙 (마지막 run 이 정리)
    if(heap)taskL.push(sig+' {',`    ${ctx} *c = calloc(1, sizeof *c);`,'    if (!c) exit(1);');
    else taskL.push(sig+' {',`    ${dynB(m)?'static ':''}${ctx} cv;${dynB(m)?'   /* 실행 중 귀속되면 오브젝트가 이 변수들을 계속 씀 */':''}`,`    ${ctx} *c = &cv;`,'    memset(&cv, 0, sizeof cv);');
    stmts(vars,1,taskL);
    if(runs.length===1)taskL.push(`    ${tn}_run0(c);`);
    else if(runs.length>1){
      used.runbg=true;used.thread=true;
      taskL.push(`    jb_rbox *bx = ${heap?`jb_rbox_new(c, ${runs.length})`:'NULL'};`,'    (void)bx;');
      runs.forEach((r,k)=>taskL.push(`    jb_runbg(${tn}_run${k}, c, bx);`));
    }
    taskL.push('}','');
  }
  if(used.dis){   // 귀속 표 · 부모 변수 찾기
    const boundTasks=[...prog.tasks].filter(([p,m])=>m.bound||m.sceneBound);
    taskL.push('static void jb_inst_start(int task, const char *self, jb_tk *tk) {','    switch (task) {',
      ...boundTasks.map(([p])=>`    case ${tidx.get(p)}: ${tname(p)}_inst(self, tk); break;`),'    default: (void)self; (void)tk; break;','    }','}');
    taskL.push('static void jb_start_bound(jb_obj *o) {');
    for(const [id,paths] of prog.belongs)taskL.push(`    if (!strcmp(o->id, ${cstr(id)})) { ${paths.map(pp=>`jb_bind(o, ${tidx.get(pp)});`).join(' ')} }`);
    taskL.push('    (void)o;','}','static void jb_start_scene(const char *name) {');
    for(const [nm,paths] of prog.sceneBelongs)taskL.push(`    if (!strcmp(name, ${cstr(nm)})) { ${paths.map(pp=>`jb_bind_scene(${tidx.get(pp)});`).join(' ')} }`);
    taskL.push('    (void)name;','}','');
  }
  const pvL=[];
  for(const [n,i] of pvUsed){   // 부모 → 그 부모 … 에 귀속된 파일에서 같은 이름 · 같은 형식의 변수
    const same=v=>v.k==='var'&&!v.pub&&v.name===n&&v.ty===i.ty&&(v.ty!=='matrix'||(v.dims[0]===i.dims[0]&&v.dims[1]===i.dims[1]));
    const fieldOf=m=>{if(m.ast.some(same))return `v_${cid(n)}`;let rk=0;for(const r of m.ast)if(r.k==='run'){if(r.body.some(same))return `r${rk}_v_${cid(n)}`;rk++;}return null;};
    const cases=[...prog.tasks].filter(([p,m])=>m.bound&&fieldOf(m)).map(([p,m])=>[p,fieldOf(m)]);
    pvL.push(`static void *jb_pv_${cid(n)}(void) {`,'    void *r = NULL;','    JB_LOCK();','    jb_obj *o = jb_tself ? jb_find(jb_tself) : NULL;',
      '    for (int d = 0; o && o->parent[0] && !r && d < 256; d++) {','        o = jb_find(o->parent);','        if (!o) break;',
      '        for (int k = 0; k < o->ninst && !r; k++) switch (o->inst[k]->task) {',
      ...cases.map(([p,f])=>`        case ${tidx.get(p)}: r = &((struct ${tname(p)}_ctx *)o->inst[k]->ctx)->${f}; break;`),
      '        default: break;','        }','    }','    JB_UNLOCK();',
      `    if (!r) { fprintf(stderr, "can't find parent variable '%s' (no parent object has it)\\n", ${cstr(n)}); exit(1); }`,'    return r;','}','');
  }
  const bodyText=[...globalsL,...funcL,...taskL].join('\n');
  const mainBase=baseOf(prog.mainPath).replace(/\.jb$/,'');
  const o=[];
  o.push(`/* Generated by Jawbreaker 1.0 — project "${prog.proj.name||'(이름 없음)'}", entry ${prog.mainPath} */`,
         `/* build:  gcc ${mainBase}.c -o ${mainBase}${used.thread?' -pthread':''}${used.math?' -lm':''}${used.dis?' $(sdl2-config --cflags --libs)'+(used.ttf?' -lSDL2_ttf':'')+(used.img?' -lSDL2_image':'')+(used.snd?' -lSDL2_mixer':''):''} */`,
         ...(used.dis?[`/* 화면(DisPlayer · colliders · Canvas · Magellan)은 SDL2${used.ttf?' + SDL2_ttf':''}${used.img?' + SDL2_image':''} 로 창을 띄웁니다 — 설치: apt install libsdl2-dev${used.ttf?' libsdl2-ttf-dev':''}${used.img?' libsdl2-image-dev':''} · brew install sdl2${used.ttf?' sdl2_ttf':''}${used.img?' sdl2_image':''} · Windows(MSYS2) pacman -S mingw-w64-x86_64-SDL2${used.ttf?' mingw-w64-x86_64-SDL2_ttf':''}${used.img?' mingw-w64-x86_64-SDL2_image':''} */`,
           ...(used.img?['/* 이미지는 프로젝트 안의 경로 그대로 읽으니, zip 으로 내보낸 프로젝트 폴더에서 실행하세요 */']:[]),
           `/* 글자는 한글 글꼴을 자동으로 찾고, 못 찾으면 JB_FONT=글꼴.ttf 로 지정 · 창을 닫으면 프로그램도 끝 */`]:[]),'',
         '#define _POSIX_C_SOURCE 200809L','#include <stdio.h>','#include <string.h>');
  if(used.cat||used.dis||used.ltmp||used.lnest)o.push('#include <stdarg.h>');
  if(used.dis)o.push('#include <ctype.h>');
  if(used.exit||used.idiv||used.send||used.setup||used.ix||used.math||used.list||used.dis||used.key||used.str||used.json||used.runbg)o.push('#include <stdlib.h>');
  if(used.thread)o.push('#include <pthread.h>');
  if(used.math||used.str||used.json)o.push('#include <math.h>');
  if((used.rand||used.key||used.clock)&&!used.wait)o.push('#include <time.h>');
  if(used.setup)o.push('#include <stdint.h>');
  if(used.wait)o.push('#include <time.h>','#ifdef _WIN32','#include <windows.h>','#endif');
  o.push('');
  if(used.cat||used.set||used.list||used.dis||used.str||used.json||/JB_STR_MAX/.test(bodyText))o.push('#define JB_STR_MAX 256','');
  if(used.spin)o.push(...(used.dis?['#include <sched.h>','/* 기다림 없는 반복이 화면 스레드를 막지 않게 가끔 양보 */',`static ${used.thread?'__thread ':''}unsigned jb_spin_;`,'#define JB_SPIN() do { if ((++jb_spin_ & 255u) == 0) sched_yield(); } while (0)']:['#define JB_SPIN() ((void)0)']),'');
  if(used.clock)o.push('static double jb_msnow(void) { struct timespec t; clock_gettime(CLOCK_MONOTONIC, &t); return t.tv_sec * 1000.0 + t.tv_nsec / 1e6; }   /* loop for ms */');
  if(used.wait)o.push('static void jb_wait(int ms) {','    if (ms < 0) ms = 0;','#ifdef _WIN32','    Sleep((DWORD)ms);','#else','    struct timespec ts;','    ts.tv_sec = ms / 1000;','    ts.tv_nsec = (long)(ms % 1000) * 1000000L;','    nanosleep(&ts, NULL);','#endif','}');
  if(used.send)o.push('static int jb_depth = 0;','static void jb_enter(void) {',used.thread?'    if (__sync_add_and_fetch(&jb_depth, 1) > 32) { fprintf(stderr, "sendto: too deep\\n"); exit(1); }':'    if (++jb_depth > 32) { fprintf(stderr, "sendto: too deep\\n"); exit(1); }','}',used.thread?'static void jb_leave(void) { __sync_sub_and_fetch(&jb_depth, 1); }':'static void jb_leave(void) { jb_depth--; }');
  if(used.ls)o.push('static void jb_log_s(const char *s) { printf("%s\\n", s); fflush(stdout); }');
  if(used.li)o.push('static void jb_log_i(int v) { printf("%d\\n", v); fflush(stdout); }');
  if(used.lf)o.push('static void jb_log_f(double v) { printf("%g\\n", v); fflush(stdout); }');
  if(used.set)o.push('static void jb_set(char *dst, const char *src) {','    if (dst == src) return;','    strncpy(dst, src, JB_STR_MAX - 1);','    dst[JB_STR_MAX - 1] = \'\\0\';','}');
  if(used.math)o.push('#define JB_PI 3.14159265358979323846','#define JB_D2R (JB_PI / 180.0)','#define JB_R2D (180.0 / JB_PI)',
    'static inline int jb_mini(int a, int b) { return a < b ? a : b; }','static inline int jb_maxi(int a, int b) { return a > b ? a : b; }',
    'static inline double jb_minf(double a, double b) { return a < b ? a : b; }','static inline double jb_maxf(double a, double b) { return a > b ? a : b; }');
  if(used.rand)o.push('static double jb_rand(double a, double b) { return a + (b - a) * (rand() / ((double)RAND_MAX + 1.0)); }');
  if(used.fexist)o.push('static int jb_fileExists(const char *p) {   /* jaw.fileExists: 실행한 폴더 기준 · 파일이나 폴더가 있으면 1 */',
    "    while (*p == '/') p++;","    while (p[0] == '.' && p[1] == '/') p += 2;",'    if (!*p) return 0;',
    '    FILE *f = fopen(p, "rb");','    if (!f) return 0;','    fclose(f); return 1;','}');
  if(used.idiv)o.push('static int jb_idiv(int a, int b, int line) {   /* 정수 나눗셈 — 인터프리터처럼 0 이면 오류 · 64비트로 계산해 32비트로 감쌈 */',
    '    if (b == 0) { fprintf(stderr, "line %d: division by zero\\n", line); exit(1); }',
    '    return (int)(unsigned)(long long)((long long)a / b);','}',
    'static int jb_imod(int a, int b, int line) {',
    '    if (b == 0) { fprintf(stderr, "line %d: remainder of division by zero\\n", line); exit(1); }',
    '    return (int)(unsigned)(long long)((long long)a % b);','}');
  if(used.ix)o.push('static int jb_ix(int i, int n) {',
    '    if (i < 1 || i > n) { fprintf(stderr, "matrix index %d out of range 1..%d\\n", i, n); exit(1); }',
    '    return i - 1;','}');
  if(used.mat)o.push('static inline void jb_mcpy(double *d, const double *s, int n) { memmove(d, s, sizeof(double) * (size_t)n); }');
  if(used.mstr)o.push('static const char *jb_mstr(const double *m, int r, int c) {',
    `    static ${used.thread?'__thread ':''}char buf[4][1024];`,`    static ${used.thread?'__thread ':''}int k = 0;`,
    '    char *b = buf[k++ & 3];','    size_t o = 0, cap = sizeof buf[0] - 2;','    b[o++] = \'[\';',
    '    for (int i = 0; i < r; i++) {','        for (int j = 0; j < c; j++) {',
    '            int w = snprintf(b + o, cap - o, "%s%g", j ? ", " : (i ? " | " : ""), m[i * c + j]);',
    '            if (w < 0 || o + (size_t)w >= cap) { o = cap; goto done; }','            o += (size_t)w;','        }','    }',
    'done:','    b[o++] = \']\';','    b[o] = \'\\0\';','    return b;','}');
  if(used.list)o.push(
    'typedef struct jb_list jb_list;',
    'typedef struct { int s, r, c; double d; const char *p; double *m; jb_list *l; } jb_it;   /* 리스트 항목: s = 0 숫자 · 1 문자열 · 2 행렬 · 3 리스트 · 4 compound */',
    'struct jb_list { int n, cap; jb_it *a; };',...(used.nolist?['static jb_list jb_nolist;   /* 오브젝트 변수 (C 에는 오브젝트가 없음) */']:[]),
    'static inline jb_it jb_dit(double d) { jb_it r = {0}; r.d = d; return r; }',
    'static inline jb_it jb_sit(const char *p) { jb_it r = {0}; r.s = 1; r.p = p; return r; }',
    'static inline jb_it jb_mit(const double *m, int rr, int cc) { jb_it r = {0}; r.s = 2; r.r = rr; r.c = cc; r.m = (double *)m; return r; }',
    'static inline jb_it jb_lit(const jb_list *l, int s) { jb_it r = {0}; r.s = s; r.l = (jb_list *)l; return r; }',
    'static inline void jb_lerr(int i, int n, int line) {',
    '    if (n < 1) fprintf(stderr, "line %d: list is empty\\n", line);',
    '    else fprintf(stderr, "line %d: list index %d out of range 1..%d\\n", line, i, n);',
    '    exit(1);','}',
    'static inline void jb_ladd(jb_list *l, jb_it v);',
    'static inline void jb_lfree(jb_list *l);',
    'static inline jb_it jb_own(jb_it v) {   /* 넣을 때 복사 (compound 는 안쪽까지) */',
    '    if (v.s == 1) { size_t k = strlen(v.p) + 1; char *c = malloc(k); if (!c) exit(1); memcpy(c, v.p, k); v.p = c; }',
    '    else if (v.s == 2) { size_t k = sizeof(double) * (size_t)(v.r * v.c); double *c = malloc(k); if (!c) exit(1); memcpy(c, v.m, k); v.m = c; }',
    '    else if (v.s >= 3 && v.r == -1) v.r = 0;   /* 잠깐 만든 리스트 ([ … ] 안의 [ … ]): 복사 없이 옮김 */',
    '    else if (v.s >= 3) { jb_list *c = calloc(1, sizeof *c); if (!c) exit(1); for (int i = 0; i < v.l->n; i++) jb_ladd(c, v.l->a[i]); v.l = c; }',
    '    return v;','}',
    'static inline void jb_ifree(jb_it v) {','    if (v.s == 1) free((char *)v.p);','    else if (v.s == 2) free(v.m);','    else if (v.s >= 3) { jb_lfree(v.l); free(v.l); }','}',
    'static inline void jb_lfree(jb_list *l) { for (int i = 0; i < l->n; i++) jb_ifree(l->a[i]); free(l->a); l->n = l->cap = 0; l->a = NULL; }',
    'static inline void jb_lgrow(jb_list *l) {','    if (l->n < l->cap) return;','    l->cap = l->cap ? l->cap * 2 : 8;',
    '    l->a = realloc(l->a, sizeof(jb_it) * (size_t)l->cap);','    if (!l->a) { fprintf(stderr, "out of memory\\n"); exit(1); }','}',
    'static inline void jb_ladd(jb_list *l, jb_it v) { v = jb_own(v); jb_lgrow(l); l->a[l->n++] = v; }',
    'static inline void jb_lins(jb_list *l, int i, jb_it v, int line) {','    if (i < 1 || i > l->n + 1) jb_lerr(i, l->n + 1, line);','    v = jb_own(v);','    jb_lgrow(l);',
    '    memmove(l->a + i, l->a + i - 1, sizeof(jb_it) * (size_t)(l->n - i + 1));','    l->a[i - 1] = v;','    l->n++;','}',
    'static inline void jb_ldel(jb_list *l, int i, int line) {','    if (i < 1 || i > l->n) jb_lerr(i, l->n, line);','    jb_ifree(l->a[i - 1]);',
    '    memmove(l->a + i - 1, l->a + i, sizeof(jb_it) * (size_t)(l->n - i));','    l->n--;','}',
    'static inline void jb_lclr(jb_list *l) { for (int i = 0; i < l->n; i++) jb_ifree(l->a[i]); l->n = 0; }',
    'static inline jb_it jb_lget(const jb_list *l, int i, int line) { if (i < 1 || i > l->n) jb_lerr(i, l->n, line); return l->a[i - 1]; }',
    'static inline void jb_lset(jb_list *l, int i, jb_it v, int line) {   /* 범위 밖에 넣으면 거기까지 늘림 · 사이의 빈 항목은 0 */\n    if (i < 1) { fprintf(stderr, \"line %d: a list index must be 1 or more (got %d)\\n\", line, i); exit(1); }\n    v = jb_own(v);\n    while (l->n < i) { jb_lgrow(l); l->a[l->n++] = jb_dit(0); }\n    jb_ifree(l->a[i - 1]); l->a[i - 1] = v;\n}',
    'static inline void jb_lmove(jb_list *d, jb_list *s) { jb_lfree(d); *d = *s; }',
    'static inline void jb_lcopy(jb_list *d, const jb_list *s) {','    if (d == s) return;','    jb_list t = {0, 0, NULL};',
    '    for (int i = 0; i < s->n; i++) jb_ladd(&t, s->a[i]);','    jb_lmove(d, &t);','}',
    'static inline int jb_ieq(jb_it a, jb_it b) {','    if (a.s != b.s) return 0;','    if (a.s == 0) return a.d == b.d;','    if (a.s == 1) return strcmp(a.p, b.p) == 0;',
    '    if (a.s == 2) { if (a.r != b.r || a.c != b.c) return 0; for (int i = 0; i < a.r * a.c; i++) if (a.m[i] != b.m[i]) return 0; return 1; }',
    '    if (a.l->n != b.l->n) return 0;','    for (int i = 0; i < a.l->n; i++) if (!jb_ieq(a.l->a[i], b.l->a[i])) return 0;','    return 1;','}',
    'static inline int jb_lfind(const jb_list *l, jb_it v) { for (int i = 0; i < l->n; i++) if (jb_ieq(l->a[i], v)) return i + 1; return 0; }',
    'static inline const char *jb_ikind(jb_it v) { static const char *K[] = {"a number", "a string", "a matrix", "a list", "a compound"}; return K[v.s]; }',
    'static inline void jb_ibad(int line, const char *want, jb_it v) { fprintf(stderr, "line %d: item is not %s (it is %s)\\n", line, want, jb_ikind(v)); exit(1); }',
    'static inline double jb_inum(jb_it v, int line) {','    if (v.s == 1) { fprintf(stderr, "line %d: list item is not a number: \\"%s\\"\\n", line, v.p); exit(1); }','    if (v.s) jb_ibad(line, "a number", v);','    return v.d;','}',
    'static inline const char *jb_istr(jb_it v, int line) {','    if (!v.s) { fprintf(stderr, "line %d: list item is not a string: %g\\n", line, v.d); exit(1); }','    if (v.s != 1) jb_ibad(line, "a string", v);','    return v.p;','}',
    'static inline jb_it jb_iscal(jb_it v, int line) { if (v.s >= 2) { fprintf(stderr, "line %d: a list holds only numbers and strings (got %s) - use a compound\\n", line, jb_ikind(v)); exit(1); } return v; }',
    'static inline const double *jb_imat(jb_it v, int r, int c, int line) {','    if (v.s != 2) jb_ibad(line, "a matrix", v);',
    '    if (v.r != r || v.c != c) { fprintf(stderr, "line %d: matrix[%d, %d] is needed (the item is matrix[%d, %d])\\n", line, r, c, v.r, v.c); exit(1); }','    return v.m;','}',
    'static inline jb_list *jb_ilist(jb_it v, int s, int line) {','    if (s ? v.s != s : v.s < 3) jb_ibad(line, s == 4 ? "a compound" : s == 3 ? "a list" : "a list or compound", v);','    return v.l;','}',
    'static inline void jb_lsetd(jb_it b, int i, jb_it v, int line) { jb_list *l = jb_ilist(b, 0, line); if (b.s == 3) jb_iscal(v, line); jb_lset(l, i, v, line); }',
    'static inline double *jb_imel(jb_it v, int i, int j, int line) {','    if (v.s != 2) jb_ibad(line, "a matrix", v);',
    '    if (i < 1 || i > v.r || j < 1 || j > v.c) { fprintf(stderr, "line %d: [%d, %d] is outside the matrix[%d, %d]\\n", line, i, j, v.r, v.c); exit(1); }',
    '    return &v.m[(i - 1) * v.c + (j - 1)];','}',
    'static inline void jb_sapp(char *b, size_t cap, size_t *o, const char *s) { size_t k = strlen(s); if (k > cap - 1 - *o) k = cap - 1 - *o; memcpy(b + *o, s, k); *o += k; b[*o] = 0; }',
    'static inline void jb_iapp(char *b, size_t cap, size_t *o, jb_it v, int q) {','    char t[64];',
    '    if (v.s == 0) {',
    '        if (v.d == (double)(long long)v.d && v.d < 1e15 && v.d > -1e15) snprintf(t, sizeof t, "%lld", (long long)v.d);','        else snprintf(t, sizeof t, "%g", v.d);',
    '        jb_sapp(b, cap, o, t);','    }',
    '    else if (v.s == 1) { if (q) jb_sapp(b, cap, o, "\\""); jb_sapp(b, cap, o, v.p); if (q) jb_sapp(b, cap, o, "\\""); }',
    '    else if (v.s == 2) {','        jb_sapp(b, cap, o, "[");',
    '        for (int i = 0; i < v.r; i++) for (int j = 0; j < v.c; j++) { snprintf(t, sizeof t, "%s%g", j ? ", " : (i ? " | " : ""), v.m[i * v.c + j]); jb_sapp(b, cap, o, t); }',
    '        jb_sapp(b, cap, o, "]");','    }',
    '    else {','        jb_sapp(b, cap, o, "[");','        for (int i = 0; i < v.l->n; i++) { if (i) jb_sapp(b, cap, o, ", "); jb_iapp(b, cap, o, v.l->a[i], 1); }','        jb_sapp(b, cap, o, "]");','    }','}',
    'static inline const char *jb_ifmt(jb_it v) {',`    static ${used.thread?'__thread ':''} char buf[8][1024];`,`    static ${used.thread?'__thread ':''} int k = 0;`,
    '    if (v.s == 1) return v.p;','    char *b = buf[k++ & 7];','    size_t o = 0;','    b[0] = 0;','    jb_iapp(b, sizeof buf[0], &o, v, 0);','    return b;','}',
    'static inline jb_it jb_iadd(jb_it a, jb_it b, int line) {','    if (!a.s && !b.s) return jb_dit(a.d + b.d);',
    '    if (a.s != 1 && b.s != 1) { fprintf(stderr, "line %d: + does not work on matrix or list items (only joining with a string)\\n", line); exit(1); }',
    `    static ${used.thread?'__thread ':''} char buf[8][JB_STR_MAX];`,`    static ${used.thread?'__thread ':''} int k = 0;`,
    '    char *o = buf[k++ & 7];','    snprintf(o, JB_STR_MAX, "%s%s", jb_ifmt(a), jb_ifmt(b));','    return jb_sit(o);','}',
    'static inline const char *jb_lfmt(const jb_list *l) { return jb_ifmt(jb_lit(l, 3)); }');
  if(used.cat)o.push('static const char *jb_cat(const char *fmt, ...) {',`    static ${used.thread?'__thread ':''}char buf[8][JB_STR_MAX * 2];`,`    static ${used.thread?'__thread ':''}int n = 0;`,'    char *b = buf[n++ & 7];','    va_list ap;','    va_start(ap, fmt);','    vsnprintf(b, sizeof buf[0], fmt, ap);','    va_end(ap);','    return b;','}');
  if(used.lnest)o.push('static jb_it jb_ltmpit(int s, int n, ...) {   /* [ … ] 안의 [ … ]: 새 리스트 (넣는 쪽이 가져감) */',
    '    jb_list *l = calloc(1, sizeof *l); if (!l) exit(1);','    va_list ap; va_start(ap, n);','    for (int i = 0; i < n; i++) jb_ladd(l, va_arg(ap, jb_it));','    va_end(ap);',
    '    jb_it r = {0}; r.s = s; r.l = l; r.r = -1; return r;','}');
  if(used.ltmp)o.push('static jb_list *jb_ltmp(int n, ...) {   /* [ … ] 를 함수에 바로 넘길 때 잠깐 쓰는 리스트 */',
    `    static ${used.thread?'__thread ':''}jb_list t[8]; static ${used.thread?'__thread ':''}int k = 0;`,
    '    jb_list *l = &t[k++ & 7]; jb_lfree(l);','    va_list ap; va_start(ap, n);','    for (int i = 0; i < n; i++) jb_ladd(l, va_arg(ap, jb_it));','    va_end(ap); return l;','}');
  if(used.lring)o.push('static jb_list *jb_lring(void) {   /* 리스트를 돌려주는 함수의 결과 자리 — 호출마다 다른 칸 (오래된 칸은 비우고 다시 씀) */',
    `    static ${used.thread?'__thread ':''}jb_list t[256]; static ${used.thread?'__thread ':''}int k = 0;`,
    '    jb_list *l = &t[k++ & 255]; jb_lfree(l); return l;','}');
  if(used.str)o.push(..."/* \ubb38\uc790\uc5f4 \ud568\uc218 (\uae00\uc790 = UTF-8 \ud55c \uae00\uc790 \u00b7 \ubc88\ud638\ub294 1 \ubd80\ud130) */\nstatic char *jb_sbuf(void) { static JB_TL char b[16][JB_STR_MAX * 2]; static JB_TL int n = 0; return b[n++ & 15]; }\nstatic const char *jb_u8at(const char *s, int i) { while (*s && i > 0) { s++; while ((*s & 0xC0) == 0x80) s++; i--; } return s; }\nstatic int jb_strLen(const char *s) { int n = 0; for (; *s; s++) if ((*s & 0xC0) != 0x80) n++; return n; }\nstatic const char *jb_subStr(const char *s, int from, int cnt) {\n    char *b = jb_sbuf();\n    if (from < 1) { cnt += from - 1; from = 1; }\n    if (cnt <= 0) { b[0] = 0; return b; }\n    const char *p = jb_u8at(s, from - 1), *q = jb_u8at(p, cnt);\n    size_t k = (size_t)(q - p); if (k > JB_STR_MAX * 2 - 1) k = JB_STR_MAX * 2 - 1;\n    memcpy(b, p, k); b[k] = 0; return b;\n}\nstatic int jb_findStr(const char *s, const char *t) {\n    const char *p = strstr(s, t); if (!p) return 0;\n    int n = 1; for (const char *q = s; q < p; q++) if ((*q & 0xC0) != 0x80) n++;\n    return n;\n}\nstatic const char *jb_replaceStr(const char *s, const char *a, const char *r) {\n    char *b = jb_sbuf(); size_t o = 0, cap = JB_STR_MAX * 2 - 1, la = strlen(a), lr = strlen(r);\n    if (!la) { strncpy(b, s, cap); b[cap] = 0; return b; }\n    for (;;) {\n        const char *p = strstr(s, a); size_t k = p ? (size_t)(p - s) : strlen(s);\n        if (k > cap - o) k = cap - o;\n        memcpy(b + o, s, k); o += k;\n        if (!p) break;\n        k = lr > cap - o ? cap - o : lr; memcpy(b + o, r, k); o += k; s = p + la;\n    }\n    b[o] = 0; return b;\n}\nstatic const char *jb_caseStr(const char *s, int up) {\n    char *b = jb_sbuf(); size_t i = 0;\n    for (; s[i] && i < JB_STR_MAX * 2 - 1; i++) { char c = s[i]; b[i] = (char)(up ? (c >= 'a' && c <= 'z' ? c - 32 : c) : (c >= 'A' && c <= 'Z' ? c + 32 : c)); }\n    b[i] = 0; return b;\n}\nstatic int jb_isws(char c) { return c == ' ' || c == '\\t' || c == '\\n' || c == '\\r'; }\nstatic const char *jb_trimStr(const char *s) {\n    char *b = jb_sbuf(); while (jb_isws(*s)) s++;\n    size_t k = strlen(s); while (k && jb_isws(s[k - 1])) k--;\n    if (k > JB_STR_MAX * 2 - 1) k = JB_STR_MAX * 2 - 1;\n    memcpy(b, s, k); b[k] = 0; return b;\n}\nstatic double jb_strNum(const char *s) {\n    while (jb_isws(*s)) s++;\n    if (!*s) return 0;\n    char *e; double v = strtod(s, &e); while (jb_isws(*e)) e++;\n    return (*e || !isfinite(v)) ? 0 : v;\n}\nstatic int jb_toInt(const char *s) { double v = jb_strNum(s); return (v >= 2147483648.0 || v <= -2147483649.0) ? (int)(unsigned)(long long)v : (int)v; }\nstatic int jb_startsWith(const char *s, const char *t) { return strncmp(s, t, strlen(t)) == 0; }\nstatic int jb_endsWith(const char *s, const char *t) { size_t a = strlen(s), b = strlen(t); return b <= a && strcmp(s + a - b, t) == 0; }".replace(/JB_TL /g,used.thread?'__thread ':'').split('\n'));
  if(used.split&&used.list)o.push(..."static void jb_lsplit(jb_list *l, const char *s, const char *sep) {   /* splitStr */\n    char t[JB_STR_MAX * 2];\n    if (!*sep) { while (*s) { const char *q = s + 1; while ((*q & 0xC0) == 0x80) q++; size_t k = (size_t)(q - s); memcpy(t, s, k); t[k] = 0; jb_ladd(l, jb_sit(t)); s = q; } return; }\n    size_t m = strlen(sep);\n    for (;;) {\n        const char *p = strstr(s, sep); size_t k = p ? (size_t)(p - s) : strlen(s);\n        if (k > sizeof t - 1) k = sizeof t - 1;\n        memcpy(t, s, k); t[k] = 0; jb_ladd(l, jb_sit(t));\n        if (!p) break;\n        s = p + m;\n    }\n}".split('\n'));
  if(used.json)o.push(...(used.thread?['static pthread_mutex_t jb_jm = PTHREAD_MUTEX_INITIALIZER;','#define JB_JL() pthread_mutex_lock(&jb_jm)','#define JB_JU() pthread_mutex_unlock(&jb_jm)']:['#define JB_JL() ((void)0)','#define JB_JU() ((void)0)']),..."/* JSON (jaw.setJson \u00b7 genJson) */\n#include <sys/stat.h>\n#ifdef _WIN32\n#include <direct.h>\n#define jb_mkdir(p) _mkdir(p)\n#else\n#define jb_mkdir(p) mkdir(p, 0755)\n#endif\ntypedef struct { char *b; size_t n, cap; } jb_sb;\nstatic inline void jb_sbput(jb_sb *s, const char *t, size_t k) {\n    if (s->n + k + 1 > s->cap) { s->cap = (s->n + k + 1) * 2; s->b = realloc(s->b, s->cap); if (!s->b) exit(1); }\n    memcpy(s->b + s->n, t, k); s->n += k; s->b[s->n] = 0;\n}\nstatic inline void jb_jnum(jb_sb *s, double v) {\n    char t[48];\n    if (!isfinite(v)) strcpy(t, \"null\");\n    else if (fabs(v) < 1e15 && v == (double)(long long)v) snprintf(t, sizeof t, \"%lld\", (long long)v);\n    else {\n        for (int p = 1; p <= 17; p++) { snprintf(t, sizeof t, \"%.*g\", p, v); if (strtod(t, NULL) == v) break; }\n        char *e = strchr(t, 'e');\n        if (e && (e[1] == '+' || e[1] == '-')) { char *q = e + 2; while (*q == '0' && q[1]) memmove(q, q + 1, strlen(q)); }\n    }\n    jb_sbput(s, t, strlen(t));\n}\nstatic inline void jb_jstr(jb_sb *s, const char *p) {\n    jb_sbput(s, \"\\\"\", 1);\n    for (; *p; p++) {\n        unsigned char c = (unsigned char)*p; char t[8];\n        if (c == '\"' || c == '\\\\') { t[0] = '\\\\'; t[1] = (char)c; jb_sbput(s, t, 2); }\n        else if (c == '\\n') jb_sbput(s, \"\\\\n\", 2);\n        else if (c == '\\r') jb_sbput(s, \"\\\\r\", 2);\n        else if (c == '\\t') jb_sbput(s, \"\\\\t\", 2);\n        else if (c == '\\b') jb_sbput(s, \"\\\\b\", 2);\n        else if (c == '\\f') jb_sbput(s, \"\\\\f\", 2);\n        else if (c < 0x20) { snprintf(t, sizeof t, \"\\\\u%04x\", c); jb_sbput(s, t, 6); }\n        else jb_sbput(s, p, 1);\n    }\n    jb_sbput(s, \"\\\"\", 1);\n}\nstatic inline void jb_jit(jb_sb *s, jb_it v) {\n    if (v.s == 0) jb_jnum(s, v.d);\n    else if (v.s == 1) jb_jstr(s, v.p);\n    else if (v.s == 2) {   /* \ud589\ub82c: \ud55c \uc904\uc774\uba74 [x, y] \u00b7 \uc5ec\ub7ec \uc904\uc774\uba74 [[\u2026], [\u2026]] */\n        if (v.r > 1) jb_sbput(s, \"[\", 1);\n        for (int i = 0; i < v.r; i++) {\n            if (i) jb_sbput(s, \",\", 1);\n            jb_sbput(s, \"[\", 1);\n            for (int j = 0; j < v.c; j++) { if (j) jb_sbput(s, \",\", 1); jb_jnum(s, v.m[i * v.c + j]); }\n            jb_sbput(s, \"]\", 1);\n        }\n        if (v.r > 1) jb_sbput(s, \"]\", 1);\n    }\n    else { jb_sbput(s, \"[\", 1); for (int i = 0; i < v.l->n; i++) { if (i) jb_sbput(s, \",\", 1); jb_jit(s, v.l->a[i]); } jb_sbput(s, \"]\", 1); }\n}\ntypedef struct { char id[128]; jb_it v; } jb_jsn;\nstatic jb_jsn *jb_js = NULL; static int jb_njs = 0, jb_jcap = 0;\nstatic inline jb_jsn *jb_jfind(const char *id) { for (int i = 0; i < jb_njs; i++) if (!strcmp(jb_js[i].id, id)) return &jb_js[i]; return NULL; }\nstatic inline void jb_setJson(const char *id, jb_it v, int line) {\n    if (!*id) { fprintf(stderr, \"line %d: the JSON id is empty\\n\", line); exit(1); }\n    v = jb_own(v);\n    JB_JL();\n    jb_jsn *j = jb_jfind(id);\n    if (j) jb_ifree(j->v);\n    else {\n        if (jb_njs == jb_jcap) { jb_jcap = jb_jcap ? jb_jcap * 2 : 8; jb_js = realloc(jb_js, sizeof *jb_js * (size_t)jb_jcap); if (!jb_js) exit(1); }\n        j = &jb_js[jb_njs++]; snprintf(j->id, sizeof j->id, \"%s\", id);\n    }\n    j->v = v;\n    JB_JU();\n}\nstatic inline void jb_genJson(const char *path, const char *id, int line) {\n    while (*path == '/') path++;\n    while (path[0] == '.' && path[1] == '/') path += 2;\n    size_t n = strlen(path);\n    if (n < 6 || strcmp(path + n - 5, \".json\") != 0) { fprintf(stderr, \"line %d: the genJson path must end with .json (got \\\"%s\\\")\\n\", line, path); exit(1); }\n    jb_sb s = {0};\n    JB_JL();\n    jb_jsn *j = jb_jfind(id);\n    if (!j) { fprintf(stderr, \"line %d: there is no JSON \\\"%s\\\" (use jaw.setJson first)\\n\", line, id); exit(1); }\n    jb_jit(&s, j->v);\n    JB_JU();\n    char d[1024]; snprintf(d, sizeof d, \"%s\", path);\n    for (char *q = d; *q; q++) if (*q == '/') { *q = 0; jb_mkdir(d); *q = '/'; }   /* \ud3f4\ub354\uac00 \uc5c6\uc73c\uba74 \ub9cc\ub4e6 */\n    FILE *f = fopen(path, \"w\");\n    if (!f) { fprintf(stderr, \"line %d: can't write \\\"%s\\\"\\n\", line, path); exit(1); }\n    fputs(s.b, f); fclose(f); free(s.b);\n}\nstatic inline void jb_jbad(const char *path, int line) { fprintf(stderr, \"line %d: \\\"%s\\\" is not valid JSON (only [ ] numbers strings true false null)\\n\", line, path); exit(1); }\nstatic inline const char *jb_jws(const char *p) { while (*p == ' ' || *p == '\\t' || *p == '\\n' || *p == '\\r') p++; return p; }\nstatic inline void jb_u8put(char **o, unsigned u) {\n    if (u < 0x80) *(*o)++ = (char)u;\n    else if (u < 0x800) { *(*o)++ = (char)(0xC0 | u >> 6); *(*o)++ = (char)(0x80 | (u & 63)); }\n    else if (u < 0x10000) { *(*o)++ = (char)(0xE0 | u >> 12); *(*o)++ = (char)(0x80 | (u >> 6 & 63)); *(*o)++ = (char)(0x80 | (u & 63)); }\n    else { *(*o)++ = (char)(0xF0 | u >> 18); *(*o)++ = (char)(0x80 | (u >> 12 & 63)); *(*o)++ = (char)(0x80 | (u >> 6 & 63)); *(*o)++ = (char)(0x80 | (u & 63)); }\n}\nstatic int jb_hex4(const char *s, unsigned *u) {   /* 16진수 4자리를 다 읽었을 때만 1 */\n    unsigned r = 0;\n    for (int i = 0; i < 4; i++) {\n        char c = s[i]; unsigned d;\n        if (c >= '0' && c <= '9') d = (unsigned)(c - '0');\n        else if (c >= 'a' && c <= 'f') d = (unsigned)(c - 'a' + 10);\n        else if (c >= 'A' && c <= 'F') d = (unsigned)(c - 'A' + 10);\n        else return 0;\n        r = r * 16 + d;\n    }\n    *u = r; return 1;\n}\nstatic inline const char *jb_jval(const char *p, jb_it *v, const char *path, int line) {   /* 값 하나 → v (배열은 compound) */\n    p = jb_jws(p); jb_it z = {0}; *v = z;\n    if (*p == '[') {\n        jb_list *l = calloc(1, sizeof *l); if (!l) exit(1);\n        v->s = 4; v->l = l; p = jb_jws(p + 1);\n        if (*p == ']') return p + 1;\n        for (;;) {\n            jb_it x; p = jb_jval(p, &x, path, line);\n            jb_lgrow(l); l->a[l->n++] = x;\n            p = jb_jws(p);\n            if (*p == ',') { p++; continue; }\n            if (*p == ']') return p + 1;\n            jb_jbad(path, line);\n        }\n    }\n    if (*p == '\"') {\n        const char *q = ++p; size_t n = 0;\n        while (*q && *q != '\"') { if (*q == '\\\\' && q[1]) q++; q++; n++; }\n        if (*q != '\"') jb_jbad(path, line);\n        char *b = malloc(n * 4 + 1), *o = b; if (!b) exit(1);\n        while (*p != '\"') {\n            if (*p != '\\\\') { *o++ = *p++; continue; }\n            p++;\n            switch (*p) {\n                case 'n': *o++ = '\\n'; break; case 't': *o++ = '\\t'; break; case 'r': *o++ = '\\r'; break;\n                case 'b': *o++ = '\\b'; break; case 'f': *o++ = '\\f'; break;\n                case 'u': {\n                    unsigned u = 0; if (!jb_hex4(p + 1, &u)) jb_jbad(path, line); p += 4;\n                    if (u >= 0xD800 && u < 0xDC00 && p[1] == '\\\\' && p[2] == 'u') { unsigned w = 0; if (jb_hex4(p + 3, &w) && w >= 0xDC00 && w < 0xE000) { u = 0x10000 + ((u - 0xD800) << 10) + (w - 0xDC00); p += 6; } }\n                    jb_u8put(&o, u); break;\n                }\n                default: *o++ = *p;\n            }\n            p++;\n        }\n        *o = 0; v->s = 1; v->p = b; return p + 1;\n    }\n    if (!strncmp(p, \"true\", 4)) { v->d = 1; return p + 4; }\n    if (!strncmp(p, \"false\", 5)) return p + 5;\n    if (!strncmp(p, \"null\", 4)) return p + 4;\n    char *e; v->d = strtod(p, &e); if (e == p) jb_jbad(path, line);\n    return e;\n}\nstatic inline void jb_loadJson(jb_list *l, const char *path, int line) {   /* jaw.loadJson: 파일 → compound (맨 바깥이 배열이 아니면 [값]) */\n    while (*path == '/') path++;\n    while (path[0] == '.' && path[1] == '/') path += 2;\n    FILE *f = fopen(path, \"rb\");\n    if (!f) { fprintf(stderr, \"line %d: can't read \\\"%s\\\"\\n\", line, path); exit(1); }\n    jb_sb s = {0}; char buf[4096]; size_t k;\n    while ((k = fread(buf, 1, sizeof buf, f)) > 0) jb_sbput(&s, buf, k);\n    fclose(f); if (!s.b) jb_sbput(&s, \"\", 0);\n    jb_it v; const char *p = jb_jval(s.b, &v, path, line);\n    if (*jb_jws(p)) jb_jbad(path, line);\n    if (v.s == 4) { *l = *v.l; free(v.l); }\n    else { jb_lgrow(l); l->a[l->n++] = v; }\n    free(s.b);\n}".split('\n'));
  o.push('');
  if(used.key)o.push(...JB_KEY_C1,'');
  if(used.dis)o.push(...(used.ttf?['#define JB_TTF']:[]),...(used.img?['#define JB_IMG']:[]),...(used.snd?['#define JB_SND']:[]),...(used.key?['#define JB_KEYS']:[]),JB_DIS_C,'');
  if(used.key)o.push(...(used.dis?JB_KEY_DIS:JB_KEY_TERM),'');
  if(used.sendto)o.push(`static ${used.thread?'__thread ':''}void (*jb_next_)(void) = NULL;   /* sendto 로 넘어갈 파일 */`,`static ${used.thread?'__thread ':''}int jb_tramp_ = 0;`,
    'static void jb_trampoline(void) {   /* sendto 를 이어서 실행 — 바깥 하나만 돌아서 스택이 쌓이지 않음 */','    if (jb_tramp_) return;','    jb_tramp_ = 1;',
    '    while (jb_next_) { void (*f)(void) = jb_next_; jb_next_ = NULL; f(); }','    jb_tramp_ = 0;','}','');
  if(used.runbg)o.push('/* run 이 여럿인 파일: run 마다 스레드 — 프로그램은 모든 run 이 끝나야 종료 */',
    'typedef struct { int n; void *p; } jb_rbox;','static pthread_mutex_t jb_rm = PTHREAD_MUTEX_INITIALIZER;','static pthread_cond_t jb_rc = PTHREAD_COND_INITIALIZER;','static int jb_nruns = 0;',
    'static jb_rbox *jb_rbox_new(void *p, int n) { jb_rbox *b = malloc(sizeof *b); if (!b) exit(1); b->n = n; b->p = p; return b; }',
    'typedef struct { void *(*fn)(void *); void *arg; jb_rbox *bx; } jb_runw;',
    'static void *jb_runthunk(void *q) {','    jb_runw w = *(jb_runw *)q; free(q);',`    w.fn(w.arg);${used.sendto?' jb_trampoline();':''}`,
    '    pthread_mutex_lock(&jb_rm);','    if (w.bx && --w.bx->n == 0) { free(w.bx->p); free(w.bx); }','    jb_nruns--; pthread_cond_broadcast(&jb_rc);','    pthread_mutex_unlock(&jb_rm);','    return NULL;','}',
    'static void jb_runbg(void *(*fn)(void *), void *arg, jb_rbox *bx) {','    jb_runw *w = malloc(sizeof *w); if (!w) exit(1); w->fn = fn; w->arg = arg; w->bx = bx;',
    '    pthread_mutex_lock(&jb_rm); jb_nruns++; pthread_mutex_unlock(&jb_rm);','    pthread_t t; pthread_create(&t, NULL, jb_runthunk, w); pthread_detach(t);','}',
    'static void jb_waitruns(void) { pthread_mutex_lock(&jb_rm); while (jb_nruns > 0) pthread_cond_wait(&jb_rc, &jb_rm); pthread_mutex_unlock(&jb_rm); }','');
  if(globalsL.length)o.push(...globalsL,'');
  o.push(...structL);
  if(pvL.length)o.push(...pvL);
  if(protoL.length)o.push(...protoL,'');
  if(taskProto.length)o.push(...taskProto,'');
  if(used.setup)o.push(
    `static void (*const jb_tasks[])(void) = { ${[...prog.tasks.keys()].map(tname).join(', ')} };`,
    '#define JB_MAX_SETUP 64','typedef struct { pthread_t t; int task, done; } jb_bgt;','static jb_bgt *jb_bg[JB_MAX_SETUP];','static int jb_bg_n = 0;   /* 아직 끝나지 않은 setup 만 셈 */',
    'static pthread_mutex_t jb_bg_m = PTHREAD_MUTEX_INITIALIZER;',
    'static void *jb_thunk(void *a) {','    jb_bgt *b = a; jb_tasks[b->task]();',
    '    pthread_mutex_lock(&jb_bg_m); b->done = 1; pthread_mutex_unlock(&jb_bg_m);   /* 끝남 — 다음 setup 때 jb_bg 에서 뺌 */','    return NULL;','}',
    'static void jb_setup(int i) {','    pthread_mutex_lock(&jb_bg_m);',
    '    for (int k = 0; k < jb_bg_n; k++) if (jb_bg[k]->done) { pthread_join(jb_bg[k]->t, NULL); free(jb_bg[k]); jb_bg[k--] = jb_bg[--jb_bg_n]; }   /* 끝난 setup 빼기 */',
    '    if (jb_bg_n >= JB_MAX_SETUP) { fprintf(stderr, "setup: too many\\n"); exit(1); }',
    '    jb_bgt *b = calloc(1, sizeof *b); if (!b) exit(1);','    b->task = i;',
    '    if (pthread_create(&b->t, NULL, jb_thunk, b) != 0) { fprintf(stderr, "setup: cannot start\\n"); exit(1); }',
    '    jb_bg[jb_bg_n++] = b;','    pthread_mutex_unlock(&jb_bg_m);','}',
    'static void jb_join_all(void) {   /* 남은 setup 을 모두 기다리고 jb_bg 에서 뺌 */','    for (;;) {','        pthread_mutex_lock(&jb_bg_m);',
    '        if (jb_bg_n == 0) { pthread_mutex_unlock(&jb_bg_m); break; }','        jb_bgt *b = jb_bg[--jb_bg_n];','        pthread_mutex_unlock(&jb_bg_m);',
    '        pthread_join(b->t, NULL); free(b);','    }','}','');
  // 끝날 때: run 을 먼저 기다린 뒤 setup 을 기다림 (서로 새로 띄울 수 있으니 둘 다 0 이 될 때까지)
  const finishL=used.setup&&used.runbg?['    for (;;) {','        jb_waitruns(); jb_join_all();','        pthread_mutex_lock(&jb_rm); int r = jb_nruns; pthread_mutex_unlock(&jb_rm);','        pthread_mutex_lock(&jb_bg_m); int b = jb_bg_n; pthread_mutex_unlock(&jb_bg_m);','        if (!r && !b) break;','    }']
    :used.runbg?['    jb_waitruns();']:used.setup?['    jb_join_all();']:[];
  if(funcL.length)o.push(...funcL);
  o.push(...taskL);
  const boundOnly=[...prog.tasks].filter(([p,m])=>(m.bound||m.sceneBound)&&p!==prog.mainPath).map(([p])=>`    (void)${tname(p)};   /* 귀속된 파일 — 오브젝트 · 장면이 생길 때 따로 실행 */`);
  if(used.dis){   // 프로그램은 다른 스레드, 화면은 main 스레드
    o.push('static void jb_prog(void) {',`    ${tname(prog.mainPath)}();`,...finishL,'}','');
    o.push('int main(void) {',...(used.rand?['    srand((unsigned)time(NULL));']:[]),...boundOnly,`    jb_title = ${cstr(prog.proj.name||'Jawbreaker')};`,'    jb_dis_init();',...initCalls,'    jb_dis_run(jb_prog);','    return 0;','}','');
  }
  else o.push('int main(void) {',...(used.rand?['    srand((unsigned)time(NULL));']:[]),...boundOnly,...initCalls,`    ${tname(prog.mainPath)}();`,...finishL,'    return 0;','}','');
  return o.join('\n');
}




module.exports={buildProgram,execProgram,STOP,genC};
