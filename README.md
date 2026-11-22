# Claude Code 작업용 도구 (Pokémon - AJ)

폴더 배치 (이 폴더 = 작업 폴더):
- `JawBreaker.html` — 에디터 겸 실행기 (같이 받은 파일을 여기에)
- `aj6/Pokémon - KeiKan/` — 게임 프로젝트 (`Pokémon - AJ.zip` 을 `aj6/` 안에 풀기)
- `pkb.js` + `core.js` — 빌드 검사: `node pkb.js "aj6/Pokémon - KeiKan"` → `build ok` 또는 오류 위치
  - core.js 는 JawBreaker.html 의 /*CORE-START*/ ~ /*CORE-END*/ 를 뽑은 것 (에디터를 고치면 다시 뽑아야 함)
- `fixgoto.py` — battleManager.jb 를 고쳤을 때 goTo 줄 번호 맞추기: `python3 fixgoto.py "aj6/Pokémon - KeiKan/assets/codes/battle/battleManager.jb"`
- `mkzip.py` — 게임 zip 만들기: `python3 mkzip.py aj6 out.zip`
- `ev/lt3.py` + `ns2save.json` — 브라우저 실행 테스트 (Python playwright 필요 · `pip install playwright` · `playwright install chromium`)
  - 시험용 사본 `tt/we/` 에 리포트를 만들어 넣고 zip → JawBreaker.html 로 실행 → 키 입력 → 로그 · 스크린샷 (`ev/s_이름.png`)
  - 배속 (게임 속도): `SPEED=8` = 처음부터 8 배속 · `SEQ` 안의 `xN` = 그때부터 N 배속 (`x1` 로 되돌림 · `x0.5` 느린 화면)
    - 페이지의 시계 (performance.now · Date.now · setTimeout · setInterval · requestAnimationFrame) 를 가상 시계로 바꿔 끼움 — 게임 · 에디터 파일은 그대로
    - 스크립트의 기다림 (`wN` · 타이틀 대기 · 키 누르는 시간) 도 같은 배속으로 줄어듦 · 그리기가 못 따라가면 그 이상은 빨라지지 않음
    - 예: `SPEED=8 … SEQ="L:500,R:500,w9000,Z,w900,Z,w900,x1,Q이펙트: 52 (,w60,sq1,w170,sq2"` → 조우까지 8 배속 · 기술을 고르기 직전부터 1 배속 (한 판 약 15 초 · 예전 약 60 초)
  - 동시에 여러 개: `TT=tt/we2` (시험용 사본 폴더) · `SHOTS=tt/s2` (스크린샷 폴더 · 기본 `ev`) 를 줄마다 다르게
  - 브라우저: `CHROME` = Chromium 경로 (없으면 `/opt/pw-browsers/chromium` 이 있으면 그것 · 아니면 playwright 기본)
  - `Q글자`: 그 글자가 로그에 나올 때까지 Z (게임 시간 약 0.7 초마다) — 나오면 바로 다음 (기술 이펙트를 찍을 때 `Q이펙트: 번호 (`)
  - 환경 변수: `PL` 장소 · `WX` `WY` 위치 · `PARTY` 지닌 포켓몬 (JSON) · `BAG` 가방 · `PATCH` prtgRoom.jb 바꿔치기 · `SEQ` 키 (L/R/U/D/Z/X[:ms] · wN 기다림 · s이름 스크린샷 · W글자 로그에 나올 때까지 · Q글자 Z 를 누르며 기다림) · `GREP` 로그 거르기 · `VW` `VH` 화면 크기 · `JB` 에디터 경로
  - 예: 1번도로 서쪽 덤불에서 잉어킹 Lv.30 을 강제로 만나 첫 기술 쓰기
    ```
    PT='[[104,60,31,31,31,31,31,31,0,0,0,0,0,0,0,66,"",0,"재희",0,0,[63,76,451,62],[15,15,15,15],[0,0,0,0],150,300000,0,0,0,0,70]]'
    PL=6 WX=10808 WY=3000 PARTY="$PT" PATCH='[["eRate5 = 25;","eRate5 = 250;"],["                            wildLv = 7 + floor(jaw.random(0, 3));","                            wildLv = 30; wildId = 117; sp5 = 117;"]]' \
    SEQ="L:500,R:500,w9000,Z,w900,Z,w900,Z,w200,w80,sq1,w80,sq2,w80,sq3" GREP="✖|이펙트" python3 ev/lt3.py
    ```
    (포켓몬 데이터: [id, 레벨, 개체값 6, 노력치 6, 성별, 특성, 별명, 성격, 어버이, …, 지닌 도구, 기술 4, PP 4, PP 업 4, HP, 경험치, …])
