/* Matchday gate: all calendar progression uses preparation before real Showdown. */
(() => {
  const priorNextWeek = nextWeek, priorPlayNext = playNext, priorMatchSim = matchSim;
  let active = null, timer = null, cursor = 0, events = [], speed = 4, paused = false;
  const planLabels={balanced:'균형',offense:'공세',control:'견제',endurance:'유지력',tempo:'속공'};
  const behaviorLabels={
    kill:'처치 기회를 확실히 노려라',switch:'불리할 때 적극적으로 교체',
    matchup:'유리한 교체 대상을 선택해라',preserve:'연승전을 위해 에이스를 보존해라',
    pp:'강력한 기술의 PP를 아껴라',status:'효과적인 상태이상으로 견제해라',
    analysis:'상대를 분석해 유리한 수를 선택해라'
  };
  let watchMode='highlights', highlightFlags=[], contributions=null, currentBattle=null, skippedEvents=0;
  const esc = value => escapeHTML(value ?? '');
  const copy = value => JSON.parse(JSON.stringify(value));
  const screen = () => {
    let root = document.getElementById('matchday');
    if (!root) {root = document.createElement('section');root.id='matchday';root.setAttribute('aria-label','경기 준비 및 관전');document.body.append(root);}
    return root;
  };
  const pending = () => game?.pendingMatch;
  function fixture() {
    initCalendar();
    const current = calendarRoundForWeek(game.week);
    const round = current === game.round + 1 ? current : calendarRoundForWeek(game.week + 1);
    if (!round || round !== game.round + 1) return null;
    const f = calendarFixtureForRound(round);
    if (!f) return null;
    return {round, week:calendarWeekForRound(round), current:current === round, home:f.f[0], away:f.f[1]};
  }
  function openPreparation() {
    if (!game || pending()) {if (pending()) render();return;}
    const f = fixture(); if (!f) return;
    game.pendingMatch = {...f, season:game.season, phase:'prepare', order:[...game.order], plans:myClub().trainers.map(()=>null), behaviors:myClub().trainers.map(()=>null)};
    persist(); render();
  }
  nextWeek = function() {
    if (!game) return;
    if (pending()) {render();return;}
    if (fixture()) {openPreparation();return;}
    return priorNextWeek();
  };
  playNext = function() {
    if (active) return priorPlayNext();
    openPreparation();
  };
  matchSim = function(a,b) {
    if (active && a.id === active.home && b.id === active.away) return {...active,rounds:undefined,teams:undefined};
    return priorMatchSim(a,b);
  };
  const styles = document.createElement('style');styles.textContent=`
    #matchday .md-meeting-controls{display:flex;gap:7px;flex-wrap:wrap}#matchday .md-meeting-controls select{max-width:240px;padding:8px} 
    #matchday{position:fixed;inset:0;z-index:1000;background:#101a29;color:#e8edf4;overflow:auto;font:14px 'Malgun Gothic',sans-serif;padding:28px max(20px,calc((100vw - 1180px)/2))}
    #matchday h1{font-size:25px;margin:10px 0 20px}#matchday h2{font-size:18px}#matchday button,#matchday select{font:inherit;padding:10px 16px;border:1px solid #537087;background:#20384a;color:white;border-radius:4px;cursor:pointer}#matchday select{width:auto}#matchday button:disabled{opacity:.45;cursor:default}#matchday .primary{background:#197b76}#matchday .md-top,#matchday .md-actions{display:flex;justify-content:space-between;align-items:center;gap:12px;flex-wrap:wrap;margin:15px 0}#matchday .md-muted{color:#a5b5c6;line-height:1.7}#matchday .md-row{display:flex;align-items:center;justify-content:space-between;gap:12px;padding:14px;background:#182b3d;border-bottom:1px solid #304558}#matchday .md-row small{display:block;color:#b1c3d3;line-height:1.6;margin-top:6px}#matchday .md-row button{padding:7px 12px}#matchday .md-arena{display:grid;grid-template-columns:1fr 1fr;gap:20px;margin:20px 0}#matchday .md-side{padding:24px;background:#1b3046;border:1px solid #42566e;border-radius:6px}#matchday .md-side h2{font-size:24px}#matchday progress{width:100%;accent-color:#54c2a0}#matchday #md-log{height:34vh;overflow:auto;background:#091321;padding:16px;line-height:1.9;white-space:pre-wrap}#matchday .md-error{color:#ffb4ac;margin:16px 0}#matchday .md-score{font-size:32px;font-weight:bold} @media(max-width:650px){#matchday{padding:16px}#matchday .md-row{flex-wrap:wrap}#matchday .md-arena{gap:8px}#matchday .md-side{padding:12px}}
  `;document.head.append(styles);
  function render() {
    const p = pending();if (!p) return;
    if (p.phase === 'watch') {startReplay();return;}
    p.plans ||= myClub().trainers.map(()=>null);
    p.behaviors ||= myClub().trainers.map(()=>null);
    const c=myClub(), opponent=game.clubs[p.home === c.id ? p.away : p.home];
    const root=screen(), busy=p.phase==='running';
    root.innerHTML=`<div class="md-muted">${p.week}주차 · 리그 ${p.round}라운드</div><h1>${esc(c.name)} vs ${esc(opponent.name)}</h1><div class="md-top"><strong>경기 전 미팅 · 출전 순서와 플레이 방식 권고</strong><span>구단 피로 ${c.fatigue??0}/100 · 사기 ${c.morale??50}/100</span></div><p class="md-muted">감독의 제안은 명령이 아닙니다. 트레이너가 수용·절충·거부하며, 실제 경기에서 좋은 결과를 경험한 행동은 다음 경기의 자율 선택에도 영향을 줍니다.</p>`+
      p.order.map((index,slot)=>{const t=c.trainers[index];return `<div class="md-row"><div><strong>${slot+1}. ${esc(t?.name||'출전 불가')}</strong><small>개별 컨디션 미측정 · 전술 분석 ${t?.tactics??'—'} · 교체 판단 ${t?.switching??'—'}<br>${(t?.pokemon||[]).map(mon=>esc(mon.name)+' Lv.'+mon.level).join(' · ')}</small></div><div><div class="md-meeting-controls"><select data-plan="${index}" aria-label="${esc(t?.name)} 전술 방향" ${busy?'disabled':''}><option value="" ${!p.plans[index]?'selected':''}>전술 방향: AI 자율</option>${Object.entries(planLabels).map(([key,label])=>`<option value="${key}" ${p.plans[index]===key?'selected':''}>${label}</option>`).join('')}</select><select data-behavior="${index}" aria-label="${esc(t?.name)} 플레이 방식 권고" ${busy?'disabled':''}><option value="" ${!p.behaviors[index]?'selected':''}>플레이 방식: 권고 없음</option>${Object.entries(behaviorLabels).map(([key,label])=>`<option value="${key}" ${p.behaviors[index]===key?'selected':''}>${label}</option>`).join('')}</select></div> <button data-up="${slot}" aria-label="${slot+1}번 트레이너 위로" ${busy||slot===0?'disabled':''}>↑</button> <button data-down="${slot}" aria-label="${slot+1}번 트레이너 아래로" ${busy||slot===4?'disabled':''}>↓</button></div></div>`}).join('')+
      '<p class="md-muted">이미 등록된 기술과 능력치는 변경하지 않습니다. 권고가 효과적이었다고 확인된 경기만 트레이너의 플레이 성향 학습에 반영됩니다.</p>'+
      `<div class="md-error" role="alert">${esc(p.error)}</div><div class="md-actions"><button id="md-cancel" ${busy?'disabled':''}>구단 화면으로</button><button id="md-confirm" class="primary" ${busy?'disabled':''}>${busy?'Showdown 경기 계산 중…':'출전 순서 확정 · 경기 시작'}</button></div>`;
    for (const button of root.querySelectorAll('[data-up],[data-down]')) button.onclick=()=>{
      const slot=Number(button.dataset.up??button.dataset.down), target=slot+(button.dataset.up!==undefined?-1:1);
      [p.order[slot],p.order[target]]=[p.order[target],p.order[slot]];persist();render();
    };
    for(const select of root.querySelectorAll('[data-plan]'))select.onchange=()=>{p.plans[Number(select.dataset.plan)]=select.value||null;persist();};
    for(const select of root.querySelectorAll('[data-behavior]'))select.onchange=()=>{p.behaviors[Number(select.dataset.behavior)]=select.value||null;persist();};
    root.querySelector('#md-cancel').onclick=()=>{delete game.pendingMatch;persist();root.remove();};
    root.querySelector('#md-confirm').onclick=run;
  }
  async function run() {
    const p=pending();if (!p || p.phase==='running') return;
    p.phase='running';delete p.error;persist();render();
    const order=[...p.order], mine=myClub().id;
    const identity=[0,1,2,3,4];
    const request={home:copy(game.clubs[p.home]),away:copy(game.clubs[p.away]),homeOrder:p.home===mine?order:identity,awayOrder:p.away===mine?order:identity,seed:[game.seed>>>0,p.season,p.round,7919]};
    request[p.home===mine?'home':'away'].trainers.forEach((trainer,i)=>{
      trainer.directorAdvice=p.plans?.[i]||null;
      trainer.directorBehaviorAdvice=p.behaviors?.[i]||null;
      const tid=window.TrainerCareer?.trainerId?.(trainer,mine,i)??String(trainer.uid??(String(mine)+':'+i+':'+trainer.name));
      trainer.directorTrust=game.trainerAI?.trust?.[tid]??50;
    });
    try {
      if (!/^https?:$/.test(location.protocol)) throw new Error('경기는 웹 주소에서 실행해 주세요. HTML 파일만 열면 전투 서버에 연결할 수 없습니다.');
      const response=await fetch('/api/match',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify(request)});
      let result;try {result=await response.json();} catch {throw new Error('전투 서버에 연결하지 못했습니다. 실행 주소를 확인해 주세요.');}
      if (!response.ok) throw new Error(result.error||'경기 계산 실패');
      if (result.engine!=='showdown'||result.home!==p.home||result.away!==p.away||!result.rounds?.length) throw new Error('전투 결과 형식 오류');
      p.result=result;p.phase='watch';persist();startReplay();
    } catch(error) {p.phase='prepare';p.error=error.message;persist();render();}
  }
  const moveNames={BodySlam:'누르기',Flamethrower:'화염방사',Surf:'파도타기',Thunderbolt:'10만볼트',IceBeam:'냉동빔',EnergyBall:'에너지볼',CloseCombat:'인파이트',SludgeBomb:'오물폭탄',Earthquake:'지진',AirSlash:'에어슬래시',Psychic:'사이코키네시스',XScissor:'시저크로스',RockSlide:'스톤샤워',ShadowBall:'섀도볼',DragonPulse:'용의파동',Crunch:'깨물어부수기',IronHead:'아이언헤드',PlayRough:'치근거리기',Swift:'스피드스타'};
  let moveDictionary={}, replayRequest=0;
  const moveDictionaryReady=fetch('/src/web/moves-ko.json').then(response=>{
    if(!response.ok)throw new Error('기술명 사전 로드 실패');
    return response.json();
  }).then(data=>{moveDictionary=data;}).catch(()=>{});
  const koreanMove = name => moveDictionary[String(name).toLowerCase().replace(/[^a-z0-9]/g,'')]||pending()?.result?.moveVisuals?.[name]?.label||moveNames[String(name).replace(/[^A-Za-z]/g,'')]||name;
  // Presentation follows authoritative Showdown events; it never resolves a hit or changes HP.
  let visualState = {}, skipping = false;
  function resetVisuals(){visualState={p1:{trainer:-1,remaining:6,hp:null,maxhp:100},p2:{trainer:-1,remaining:6,hp:null,maxhp:100}};skipping=false;}
  function arenaHTML(){return `<div class="md-field" aria-label="포켓몬 전투 전장"><div class="md-stands"></div><div class="md-pitch"></div><div class="md-center-mark"></div><div class="md-platform md-platform-home"></div><div class="md-platform md-platform-away"></div><div class="md-weather" id="md-weather"></div>${['p1','p2'].map(side=>`<div class="md-hud ${side}"><div class="md-hud-head"><span id="${side}-name">출전 준비</span><span class="md-status" id="${side}-status"></span><span class="md-level" id="${side}-level"></span></div><div class="md-hp-row"><b>HP</b><progress id="${side}-hp" value="0" max="100"></progress></div><div class="md-hud-foot"><span class="md-balls" id="${side}-balls" aria-label="남은 포켓몬"></span><span id="${side}-state"></span></div></div><div class="md-combatant ${side}" id="${side}-combatant"><div class="md-shadow"></div><div class="md-sprite-wrap"><img class="md-sprite" id="${side}-sprite" alt="출전 대기" hidden><div class="md-sprite-fallback" id="${side}-fallback" hidden>?</div></div><div class="md-popups" id="${side}-popups"></div></div>`).join('')}<div class="md-relay"><span id="p1-relay"></span><span id="p2-relay"></span></div><div class="md-keymoment" id="md-keymoment" hidden></div><div class="md-announcement" id="md-announcement" aria-live="polite">포켓몬 출전 준비</div></div>`;}
  const typeColors={Normal:'#d8d5c8',Fire:'#ff784a',Water:'#54bcff',Electric:'#ffe769',Grass:'#82e18b',Ice:'#a8f7ff',Fighting:'#fba677',Poison:'#d68ae8',Ground:'#dfbb7c',Flying:'#c4dcff',Psychic:'#ff91c2',Bug:'#c7df65',Rock:'#c5ba96',Ghost:'#ad9fff',Dragon:'#b69aff',Dark:'#a6a2b9',Steel:'#c6e4ea',Fairy:'#ffc6ed'};
  const statusNames={par:'마비',brn:'화상',slp:'잠듦',tox:'맹독',psn:'독',frz:'얼음'};
  const visualStyles=document.createElement('style');visualStyles.textContent=`
    #matchday .md-top{margin:8px 0}#matchday .md-top h1{font-size:22px;margin:3px 0}#matchday .md-muted{font-size:12px}#matchday #md-trainers{font-size:13px;color:#c3d5e0;margin-bottom:10px}#matchday .md-score{font-size:26px}
    #matchday .md-field{position:relative;height:clamp(280px,42vh,460px);min-height:280px;overflow:hidden;border:1px solid #466879;border-radius:9px;background:linear-gradient(180deg,#183147 0%,#477383 38%,#264f55 39%,#173d39 64%,#102d2b 100%);isolation:isolate}
    #matchday .md-stands{position:absolute;inset:0 0 57%;background:radial-gradient(ellipse at 50% 0%,#ffffff27,transparent 65%),repeating-linear-gradient(0deg,transparent 0 14px,#091d2d66 15px 19px),repeating-linear-gradient(90deg,#d5e1d129 0 3px,transparent 4px 13px);border-bottom:6px solid #b8cec54d;transform:perspective(900px) rotateX(-8deg)}
    #matchday .md-pitch{position:absolute;inset:39% -20% -30%;background:repeating-linear-gradient(90deg,#3e685621 0 90px,#133c2f21 91px 180px);transform:perspective(450px) rotateX(25deg);border:2px solid #a8ccc126}
    #matchday .md-center-mark{position:absolute;left:38%;top:48%;width:24%;height:23%;border:3px solid #c4ddc229;border-radius:50%;transform:rotate(-10deg)}
    #matchday .md-platform{position:absolute;width:31%;height:14%;border-radius:50%;background:radial-gradient(ellipse,#72947480,#365c46b3 66%,#a7c69b75 68%,#152d2544 76%);box-shadow:0 9px 22px #03150b66}
    #matchday .md-platform-home{left:9%;bottom:16%}#matchday .md-platform-away{right:8%;top:39%;width:28%;height:11%}
    #matchday .md-hud{position:absolute;width:37%;max-width:390px;z-index:5;background:linear-gradient(115deg,#102630f5,#152e3dea);border:1px solid #80a0a582;border-left:4px solid #77c7b4;border-radius:5px;padding:10px 14px;box-shadow:0 5px 20px #00121b55}
    #matchday .md-hud.p2{left:3%;top:7%}#matchday .md-hud.p1{right:3%;bottom:20%}#matchday .md-hud-head{display:flex;align-items:center;gap:8px;min-height:24px}#matchday [id$="-name"]{font-size:17px;font-weight:800}#matchday .md-level{font-size:11px;color:#bfd4de;margin-left:auto}#matchday .md-status{font-size:10px;padding:2px 5px;border-radius:3px;background:#b28a25;color:white}#matchday .md-status:empty{display:none}
    #matchday .md-hp-row{display:flex;align-items:center;gap:8px;margin:6px 0}#matchday .md-hp-row b{color:#e8d679;font-size:10px;letter-spacing:1px}#matchday progress{appearance:none;-webkit-appearance:none;display:block;height:10px;border:1px solid #c4dfb842;border-radius:8px;overflow:hidden;background:#071813;accent-color:#77d6a8;flex:1;transition:filter .2s}
    #matchday progress::-webkit-progress-bar{background:#071813}#matchday progress::-webkit-progress-value{background:var(--hp-color,#77d6a8);transition:width .25s}#matchday progress::-moz-progress-bar{background:var(--hp-color,#77d6a8)}
    #matchday .md-hud-foot{display:flex;align-items:center;justify-content:space-between;font-size:11px;color:#b8d0d5}#matchday .md-balls{display:flex;gap:5px}#matchday .md-ball{width:9px;height:9px;border:1px solid #adc1bf;border-radius:50%;background:linear-gradient(#e5807d 0 43%,#385554 44% 56%,#dfe9dc 57%)}#matchday .md-ball.out{opacity:.23;background:#5c7475}
    #matchday .md-combatant{position:absolute;z-index:3;width:23%;height:49%;display:flex;align-items:flex-end;justify-content:center;pointer-events:none}#matchday .md-combatant.p1{left:13%;bottom:20%;--direction:1}#matchday .md-combatant.p2{right:12%;top:0%;--direction:-1;width:22%;height:45%}#matchday .md-sprite-wrap{width:100%;height:100%;display:flex;align-items:flex-end;justify-content:center;transform-origin:50% 90%;transition:opacity .35s,filter .2s}#matchday .md-sprite{display:block;object-fit:contain;width:100%;height:100%;image-rendering:pixelated;filter:drop-shadow(0 9px 4px #05131c6b)}#matchday .md-sprite[hidden]{display:none}
    #matchday .md-shadow{position:absolute;bottom:-3%;width:65%;height:8%;border-radius:50%;background:#071c1b88;filter:blur(3px);z-index:-1}#matchday .md-sprite-fallback{color:#d4e7e8;font-size:50px;align-self:center;border:3px solid #bdced755;background:#183e4b;width:80px;height:80px;border-radius:50%;text-align:center}#matchday .md-sprite-fallback[hidden]{display:none}#matchday .md-combatant.fainted .md-sprite-wrap{opacity:0;transform:translateY(50px) scale(.6)}
    #matchday .md-relay{position:absolute;top:10px;left:44%;right:3%;display:flex;justify-content:space-between;gap:10px;font-size:10px;color:#d2dfdf}#matchday .md-relay span{display:flex;gap:4px}#matchday .md-trainer-dot{display:inline-block;width:9px;height:14px;border:1px solid #769395;border-radius:2px;background:#2d484e}#matchday .md-trainer-dot.current{background:#ddc76a;box-shadow:0 0 7px #ddc76a55}#matchday .md-trainer-dot.defeated{opacity:.25}
    #matchday .md-announcement{position:absolute;z-index:7;left:0;right:0;bottom:0;min-height:48px;display:flex;align-items:center;padding:13px 22px;background:#071c2be8;border-top:1px solid #74938a4d;font-size:16px;font-weight:700;color:#f4f6e9}
    #matchday .md-projectile{position:absolute;z-index:4;width:24px;height:24px;border-radius:50%;background:var(--effect);box-shadow:0 0 12px 6px var(--effect),0 0 30px 8px #ffffff60;pointer-events:none}#matchday .md-impact{position:absolute;z-index:6;width:80px;height:80px;border:5px solid var(--effect);border-radius:50%;pointer-events:none;box-shadow:0 0 20px var(--effect)}
    #matchday .md-popups{position:absolute;inset:0;display:flex;justify-content:center;align-items:center;z-index:8}#matchday .md-float{position:absolute;top:15%;font-size:23px;font-weight:900;text-shadow:0 2px 4px #000;color:#ffccbc;white-space:nowrap}#matchday .md-float.heal{color:#a3ffbe}
    #matchday .md-weather{position:absolute;inset:0;pointer-events:none;z-index:4}#matchday .md-weather.rain{background:repeating-linear-gradient(110deg,transparent 0 23px,#b5deff20 24px 25px,transparent 26px 47px)}#matchday .md-weather.sun{background:radial-gradient(ellipse at 80% 0%,#ffe57c4f,transparent 70%)}#matchday .md-weather.sand{background:#dfbc5d26}#matchday .md-weather.snow{background:radial-gradient(circle,#ffffffaa 1px,transparent 2px) 0 0/30px 25px}
    #matchday .md-commentary{margin-top:8px;color:#aebfcf;border-top:1px solid #345061;padding-top:8px;font-size:12px}#matchday .md-commentary summary{cursor:pointer}#matchday #md-log{height:130px;font-size:12px;margin-top:6px;padding:10px}#matchday .md-actions{margin:10px 0}#matchday #md-stage{color:#d7e4e8;font-size:12px}
    @media(max-width:700px){#matchday .md-field{height:350px}#matchday .md-hud{width:45%;padding:7px 9px}#matchday .md-hud.p2{left:2%;top:6%}#matchday .md-hud.p1{right:2%;bottom:17%}#matchday [id$="-name"]{font-size:14px}#matchday .md-level{font-size:9px}#matchday .md-combatant.p1{left:6%;width:32%;bottom:20%}#matchday .md-combatant.p2{right:7%;width:28%;top:3%}#matchday .md-announcement{font-size:13px;padding:12px}#matchday .md-relay{left:52%;font-size:9px}#matchday .md-top h1{font-size:18px}}
    @media(prefers-reduced-motion:reduce){#matchday *,#matchday progress::-webkit-progress-value{transition:none!important}}
  `;document.head.append(visualStyles);
  function announce(text){const node=document.getElementById('md-announcement');if(node)node.textContent=text;}
  function animate(node,frames,ms=400){if(skipping||!node||!node.animate||matchMedia('(prefers-reduced-motion: reduce)').matches)return null;return node.animate(frames,{duration:Math.max(100,ms/Math.sqrt(speed)),easing:'ease-out',fill:'none'});}
  function updateBalls(side){const state=visualState[side];const node=document.getElementById(side+'-balls');node.innerHTML=Array.from({length:6},(_,i)=>'<i class="md-ball '+(i>=state.remaining?'out':'')+'"></i>').join('');node.setAttribute('aria-label','남은 포켓몬 '+state.remaining+'마리');}
  function visualIntro(battle){
    for(const [side,index] of [['p1',battle.trainerA],['p2',battle.trainerB]]){
      const state=visualState[side];
      if(state.trainer!==index){state.trainer=index;state.remaining=6;}
      state.hp=null;state.maxhp=100;
      document.getElementById(side+'-sprite').hidden=true;document.getElementById(side+'-fallback').hidden=true;document.getElementById(side+'-popups').replaceChildren();document.getElementById(side+'-level').textContent='';document.getElementById(side+'-combatant').classList.remove('fainted');
      document.getElementById(side+'-status').textContent='';document.getElementById(side+'-name').textContent='출전 준비';document.getElementById(side+'-state').textContent='';document.getElementById(side+'-hp').value=0;updateBalls(side);
      document.getElementById(side+'-relay').innerHTML=Array.from({length:5},(_,i)=>'<i class="md-trainer-dot '+(i<index?'defeated':i===index?'current':'')+'" title="'+(i+1)+'번 트레이너"></i>').join('');
    }
    document.getElementById('md-weather').className='md-weather';announce('다음 트레이너 대결을 시작합니다.');
  }
  function showSprite(side,details,name){
    const species=details.split(',')[0],state=visualState[side],result=pending().result;
    const team=result.teams[side==='p1'?'home':'away'][state.trainer]?.team||[];
    const mon=team.find(p=>p.name===rawName(state.actor))||team.find(p=>p.species===species)||team.find(p=>p.name===name);
    const info=result.visuals?.[species]||{id:species.toLowerCase().replace(/[^a-z0-9-]/g,''),num:null};
    // Only validated identifiers are interpolated into third-party sprite URLs.
    const id=/^[a-z0-9-]+$/.test(info.id)?info.id:'substitute';
    const img=document.getElementById(side+'-sprite'),holder=document.getElementById(side+'-combatant'),fallback=document.getElementById(side+'-fallback');
    holder.classList.remove('fainted');fallback.hidden=true;img.hidden=false;img.alt=name||mon?.name||species;
    document.getElementById(side+'-level').textContent='Lv.'+(details.match(/, L(\d+)/)?.[1]||mon?.level||100);
    state.species=species;state.types=info.types||[];
    const front='https://play.pokemonshowdown.com/sprites/ani/'+id+'.gif';
    const urls=[side==='p1'?'https://play.pokemonshowdown.com/sprites/ani-back/'+id+'.gif':front,front];
    if(Number.isInteger(info.num)&&info.num>0){
      const mirror='https://raw.githubusercontent.com/PokeAPI/sprites/master/sprites/pokemon/';
      urls.splice(1,0,mirror+'other/showdown/'+(side==='p1'?'back/':'')+info.num+'.gif');
      urls.push(mirror+'other/showdown/'+info.num+'.gif',mirror+info.num+'.png');
    }
    const generation=(state.spriteGeneration||0)+1;state.spriteGeneration=generation;let index=0;
    img.onload=()=>{if(state.spriteGeneration===generation)fallback.hidden=true;};
    img.onerror=()=>{if(state.spriteGeneration!==generation)return;if(++index<urls.length){img.src=urls[index];}else{img.hidden=true;fallback.hidden=false;fallback.textContent='?';}};
    img.src=urls[0];animate(holder.querySelector('.md-sprite-wrap'),[{opacity:0,transform:'scale(.2)'},{opacity:1,transform:'scale(1)'}],450);
  }
  function floating(side,text,healing=false){if(skipping)return;const host=document.getElementById(side+'-popups'),node=document.createElement('span');node.className='md-float'+(healing?' heal':'');node.textContent=text;host.append(node);const effect=animate(node,[{transform:'translateY(10px)',opacity:1},{transform:'translateY(-45px)',opacity:0}],900);if(effect)effect.finished.catch(()=>{}).finally(()=>node.remove());else setTimeout(()=>node.remove(),500);}
  function attack(side,move,targetActor){
    const meta=pending().result.moveVisuals?.[move]||{},target=targetActor?.startsWith('p1')?'p1':targetActor?.startsWith('p2')?'p2':side==='p1'?'p2':'p1';
    const holder=document.getElementById(side+'-combatant'),self=meta.category==='Status'&&target===side;
    if(self){animate(holder,[{filter:'brightness(1)'},{filter:'brightness(1.8)'},{filter:'brightness(1)'}],500);return;}
    const direction=side==='p1'?1:-1;
    animate(holder,[{transform:'translate(0,0)'},{transform:`translate(${direction*30}px,${-direction*10}px)`},{transform:'translate(0,0)'}],420);
    if(skipping)return;
    const effect=document.createElement('i');effect.className='md-projectile';effect.style.setProperty('--effect',typeColors[meta.type]||typeColors.Normal);document.querySelector('.md-field').append(effect);
    const start=side==='p1'?{left:'25%',top:'62%'}:{left:'74%',top:'33%'};const end=target==='p1'?{left:'25%',top:'62%'}:{left:'74%',top:'33%'};
    const animation=animate(effect,[{...start,opacity:0,transform:'scale(.3)'},{...start,opacity:1,offset:.12},{...end,opacity:1,transform:'scale(1.2)'},{...end,opacity:0,offset:1}],500);
    if(animation)animation.finished.catch(()=>{}).finally(()=>effect.remove());else effect.remove();
  }
  function visualEvent(part){
    const type=part[1],actor=part[2]||'',side=actor.startsWith('p1')?'p1':'p2',name=actorName(actor),state=visualState[side];
    const holder=document.getElementById(side+'-combatant');
    if(type==='switch'||type==='drag'){showSprite(side,part[3]||'',name);state.hp=null;announce(name+' 출전!');}
    if(type==='-formechange'||type==='detailschange'){showSprite(side,part[3]||'',name);announce(name+'의 모습이 변했습니다.');}
    if(type==='-transform'){const target=part[3]?.startsWith('p1')?'p1':'p2';showSprite(side,visualState[target].species||'',name);announce(name+' 변신!');}
    if(type==='move'){attack(side,part[3],part[4]);announce(name+'의 '+koreanMove(part[3])+'!');}
    if(['switch','drag'].includes(type)||(['-damage','-heal'].includes(type)&&actor===visualState[side].actor)){
      const raw=(type==='switch'||type==='drag'?part[4]:part[3])||'',match=raw.match(/^(\d+)(?:\/(\d+))?/);
      if(match){const hp=Number(match[1]),maxhp=Number(match[2]||state.maxhp);const difference=state.hp===null?0:hp-state.hp;
        state.hp=hp;state.maxhp=maxhp;document.getElementById(side+'-hp').style.setProperty('--hp-color',hp/maxhp>.5?'#77d6a8':hp/maxhp>.2?'#e7c76a':'#e78678');
        document.getElementById(side+'-status').textContent=statusNames[raw.split(' ')[1]]||'';
        if(type==='-damage'){
          animate(holder,[{transform:'translateX(0)',filter:'brightness(1)'},{transform:'translateX(-9px)',filter:'brightness(2)'},{transform:'translateX(8px)'},{transform:'translateX(0)',filter:'brightness(1)'}],380);
          if(difference<0)floating(side,String(difference));
        }
        if(type==='-heal'){if(difference>0)floating(side,'+'+difference,true);animate(holder,[{filter:'drop-shadow(0 0 0 #6f8)'},{filter:'drop-shadow(0 0 18px #9fc)'},{filter:'none'}],500);}
      }
    }
    if(type==='faint'&&actor===state.actor){holder.classList.add('fainted');if(!state.party)state.remaining=Math.max(0,state.remaining-1);updateBalls(side);announce(name+' 쓰러졌습니다!');}
    if(type==='-status'){document.getElementById(side+'-status').textContent=statusNames[part[3]]||part[3];announce(name+' · '+(statusNames[part[3]]||part[3]));}
    if(type==='-curestatus')document.getElementById(side+'-status').textContent='';
    if(type==='-supereffective')floating(side,'효과 굉장!');
    if(type==='-resisted')floating(side,'효과 약함');
    if(type==='-crit')floating(side,'급소!');
    if(type==='-weather'){document.getElementById('md-weather').className='md-weather '+({RainDance:'rain',SunnyDay:'sun',Sandstorm:'sand',Hail:'snow',Snowscape:'snow'}[actor]||'');}
  }

  function buildHighlights(list){
    const flags=Array(list.length).fill(false);let start=0,important=false;const hp={};
    const flush=end=>{if(important)for(let j=start;j<end;j++)flags[j]=true;};
    list.forEach((event,i)=>{
      if(event.intro!==undefined){flush(i);start=i;important=true;return;}
      if(event.end){flush(i);flags[i]=true;start=i+1;important=false;return;}
      const p=(event.line||'').split('|'),type=p[1],actor=p[2];
      if(type==='turn'){flush(i);start=i;important=false;}
      if(['faint','-crit','-status','-formechange','-transform','switch','drag'].includes(type))important=true;
      if(['switch','drag','-damage','-heal'].includes(type)){
        const raw=['switch','drag'].includes(type)?p[4]:p[3],match=raw?.match(/^(\d+)(?:\/(\d+))?/);
        if(match){const fraction=Number(match[1])/Number(match[2]||hp[actor]?.max||100);
          if(type==='-damage'&&(fraction<=.25||(hp[actor]?.fraction??fraction)-fraction>=.4))important=true;
          hp[actor]={fraction,max:Number(match[2]||hp[actor]?.max||100)};
        }
      }
    });flush(list.length);return flags;
  }
  function storyIntro(battle,previous){
    const r=pending().result,a=r.teams.home[battle.trainerA],b=r.teams.away[battle.trainerB];
    const label=(team,index)=>`${index===4?'마지막 주자':index===0?'선봉':(index+1)+'번 주자'} ${team.name} · ${planLabels[team.battlePlan]||'균형'}`;
    const survivor=previous?.winner==='A'&&previous.trainerA===battle.trainerA?a:previous?.winner==='B'&&previous.trainerB===battle.trainerB?b:null;
    document.getElementById('md-storyline').textContent=label(a,battle.trainerA)+'  vs  '+label(b,battle.trainerB)+(survivor?' · '+survivor.name+' 이어 출전 / 생존 포켓몬 최대 HP 10% 회복':'');
  }
  function renderContributions(){
    if(!contributions)return;const result=pending().result;
    document.getElementById('md-contributions').innerHTML=['home','away'].map((key,k)=>{
      const index=currentBattle?.[k===0?'trainerA':'trainerB']??-1;
      return `<div class="md-contribution-team"><b>${esc(game.clubs[k===0?result.home:result.away].name)}</b><div class="md-contribution-grid">${result.teams[key].map((trainer,i)=>`<div class="md-contribution ${index===i?'current':''} ${index>i?'finished':''}" title="${esc(trainer.name)} · ${planLabels[trainer.battlePlan]||'균형'}"><strong>${i+1}. ${esc(trainer.name)}</strong><small>${contributions[key][i].knockouts}격파 · ${contributions[key][i].wins}승</small></div>`).join('')}</div></div>`;
    }).join('');
  }
  function recordKnockout(side){
    if(!currentBattle||!contributions)return;
    const key=side==='p1'?'away':'home',index=currentBattle[side==='p1'?'trainerB':'trainerA'];
    contributions[key][index].knockouts++;renderContributions();
  }
  function recordBattleWin(battle){
    if(battle.winner==='tie'){document.getElementById('md-storyline').textContent='양쪽 트레이너가 함께 탈락합니다.';return;}
    const key=battle.winner==='A'?'home':'away',index=battle[battle.winner==='A'?'trainerA':'trainerB'];
    contributions[key][index].wins++;
    const t=pending().result.teams[key][index],stats=contributions[key][index];
    const text=t.name+' · '+(stats.wins>1?stats.wins+'연승!':'트레이너 대결 승리')+' · 상대 포켓몬 '+stats.knockouts+'마리 격파';
    document.getElementById('md-storyline').textContent=text;announce(text);const own=battle.winner==='A'?0:1,before=score[own]-score[1-own];if(before<0)leadHistory[key]=true;
    if(before+1===0)spotlight('동점!',t.name+'의 승리로 승부가 원점입니다.');
    else if(before+1>0&&leadHistory[key]){spotlight('역전!',t.name+'이 구단에 리드를 가져옵니다.');leadHistory[key]=false;}
    else if(stats.wins>1)spotlight(stats.wins+'연승!',t.name+'이 계속 출전합니다.');renderContributions();
  }
  function contributionSummary(){
    const r=pending().result;
    const ranked=['home','away'].flatMap(key=>contributions[key].map((s,i)=>({...s,name:r.teams[key][i].name}))).sort((a,b)=>b.knockouts-a.knockouts||b.wins-a.wins);
    const best=ranked[0];return best?.knockouts?'최다 격파: '+best.name+' · '+best.knockouts+'마리 · 트레이너 '+best.wins+'명 제압':'경기 결과를 확인하세요.';
  }
  const watchStyles=document.createElement('style');watchStyles.textContent=`
    #matchday .md-storyline{padding:10px 13px;border-left:3px solid #d6c77e;background:#18303d;color:#eee3b4;font-size:12px;line-height:1.6;margin-top:8px}
    #matchday .md-contributions{display:grid;grid-template-columns:1fr 1fr;gap:12px;margin-top:10px}#matchday .md-contribution-team>b{font-size:11px;color:#b1c9d4;display:block;margin-bottom:5px}#matchday .md-contribution-grid{display:grid;grid-template-columns:repeat(5,minmax(0,1fr));gap:5px}#matchday .md-contribution{padding:7px 5px;border:1px solid #354d5f;border-radius:4px;background:#132633;min-width:0}#matchday .md-contribution strong{display:block;font-size:11px;white-space:nowrap;overflow:hidden;text-overflow:ellipsis}#matchday .md-contribution small{font-size:10px;display:block;color:#b7ccd2;margin-top:5px}#matchday .md-contribution.current{border-color:#c6b66e;background:#39413a}#matchday .md-contribution.finished{opacity:.6}
    @media(max-width:650px){#matchday .md-contributions{grid-template-columns:1fr}#matchday [data-plan]{padding:7px;font-size:12px}}
  `;document.head.append(watchStyles);

  let lastAction=null, spotlightSerial=0, leadHistory={home:false,away:false};
  const rawName=actor=>String(actor||'').split(': ').slice(1).join(': ');
  function actorName(actor){
    const side=String(actor).startsWith('p1')?'home':'away',index=currentBattle?.[side==='home'?'trainerA':'trainerB'];
    return pending()?.result?.teams?.[side]?.[index]?.team.find(mon=>mon.name===rawName(actor))?.displayName||rawName(actor);
  }
  function partyHTML(){return `<div class="md-parties">${['p1','p2'].map(side=>`<div><div class="md-party-heading" id="${side}-pressure"></div><div class="md-party-grid" id="${side}-party"></div></div>`).join('')}</div>`;}
  function initialiseParty(battle){
    const result=pending().result;lastAction=null;
    for(const side of ['p1','p2']){
      const index=battle[side==='p1'?'trainerA':'trainerB'],team=result.teams[side==='p1'?'home':'away'][index].team;
      const snapshot=new Map((battle.initial?.[side]||[]).map(s=>[s.name,s]));
      visualState[side].party=team.map(mon=>({name:mon.name,displayName:mon.displayName||mon.name,species:mon.species,...(snapshot.get(mon.name)||{hp:null,maxhp:null,status:''})}));
      visualState[side].actor=null;
      document.getElementById(side+'-party').innerHTML=team.map((mon,i)=>{
        const visual=result.visuals?.[mon.species],n=visual?.num;
        const backup=Number.isInteger(n)&&n>0?'https://raw.githubusercontent.com/PokeAPI/sprites/master/sprites/pokemon/'+n+'.png':'';
        const url=/^[a-z0-9-]+$/.test(visual?.id||'')?'https://play.pokemonshowdown.com/sprites/gen5/'+visual.id+'.png':backup;
        return `<div class="md-party-mon" id="${side}-party-${i}" title="${esc(mon.displayName||mon.name)} Lv.${mon.level}">${url?`<img src="${url}" data-backup="${backup}" alt="" loading="lazy" onerror="if(!this.dataset.failed&&this.dataset.backup){this.dataset.failed='1';this.src=this.dataset.backup}else this.hidden=true">`:''}<strong>${esc(mon.displayName||mon.name)}</strong><span class="md-party-health"><i></i></span><small></small></div>`;
      }).join('');refreshParty(side);
    }
  }
  function refreshParty(side){
    const state=visualState[side],party=state.party;if(!party)return;
    for(let i=0;i<party.length;i++){
      const mon=party[i],node=document.getElementById(side+'-party-'+i);if(!node)continue;
      node.classList.toggle('fainted',mon.hp===0);node.classList.toggle('active',rawName(state.actor)===mon.name);
      const known=mon.hp!==null&&mon.maxhp>0;
      node.querySelector('i').style.width=known?Math.max(0,Math.min(100,mon.hp/mon.maxhp*100))+'%':'0%';
      node.querySelector('small').textContent=mon.hp===0?'기절':statusNames[mon.status]||(known?Math.ceil(mon.hp/mon.maxhp*100)+'%':'미확인');
    }
    state.remaining=party.filter(mon=>mon.hp!==0).length;updateBalls(side);
    const index=currentBattle[side==='p1'?'trainerA':'trainerB'];
    document.getElementById(side+'-pressure').textContent='트레이너 '+(5-index)+'명 남음 · 현재 주자 '+state.remaining+'마리';
  }
  function syncParty(part){
    const type=part[1],actor=part[2]||'',side=actor.startsWith('p1')?'p1':'p2',state=visualState[side];
    if(type==='move')lastAction={actor,move:part[3]};
    if(!state.party)return;
    const mon=state.party.find(p=>p.name===rawName(actor));
    if(type==='switch'||type==='drag')state.actor=actor;
    if(mon&&type==='league-state'){try{const data=JSON.parse(part[3]);mon.liveMoves=data.moves;mon.pp=data.basePP||data.moves.map(m=>m.pp);mon.currentTypes=data.types;if(rawName(state.actor)===mon.name)state.types=data.types;}catch{}return;}
    if(mon){
      if(['switch','drag','-damage','-heal'].includes(type)){
        const raw=['switch','drag'].includes(type)?part[4]:part[3],match=raw?.match(/^(\d+)(?:\/(\d+))?/);
        if(match){mon.hp=Number(match[1]);if(match[2])mon.maxhp=Number(match[2]);mon.status=raw.split(' ')[1]||'';}
      }
      if(type==='faint')mon.hp=0;
      if(type==='-status')mon.status=part[3];if(type==='-curestatus')mon.status='';
      refreshParty(side);
    }
  }
  function spotlight(title,subtitle=''){
    if(skipping)return;const node=document.getElementById('md-keymoment');if(!node)return;
    const serial=++spotlightSerial;node.innerHTML='<strong>'+esc(title)+'</strong><small>'+esc(subtitle)+'</small>';node.hidden=false;
    const effect=animate(node,[{opacity:0,transform:'scale(.92)'},{opacity:1,transform:'scale(1)',offset:.15},{opacity:1,offset:.8},{opacity:0}],2100);
    const hide=()=>{if(serial===spotlightSerial)node.hidden=true;};if(effect)effect.finished.catch(()=>{}).finally(hide);else setTimeout(hide,700);
  }
  function contextualCommentary(part){
    const type=part[1],actor=part[2]||'',side=actor.startsWith('p1')?'p1':'p2';
    const target=visualState[side],nickname=actorName(actor),mon=target.party?.find(p=>p.name===rawName(actor));
    const hp=mon?.hp??target.hp,maxhp=mon?.maxhp??target.maxhp;
    if(type==='-damage'){
      const from=part.slice(4).find(p=>p.startsWith('[from]'));
      if(from?.includes('psn'))announce(nickname+' · 독 피해가 누적됩니다.');
      if(from?.includes('brn'))announce(nickname+' · 화상 피해가 누적됩니다.');
      if(!from&&hp>0&&hp/maxhp<=.25)announce(nickname+'의 HP가 얼마 남지 않았습니다!');
      if(target.remaining===1&&hp>0&&hp/maxhp<=.25)spotlight('마지막 포켓몬의 위기',nickname+' · HP '+Math.ceil(hp/maxhp*100)+'%');
    }
    if(type==='-supereffective'&&lastAction)announce(actorName(lastAction.actor)+'의 '+koreanMove(lastAction.move)+'! 타입 상성을 찌릅니다.');
    if(type==='-resisted'&&lastAction)announce(koreanMove(lastAction.move)+' · 상대가 이 공격을 잘 버팁니다.');
    if(type==='-crit')spotlight('급소!',nickname+'에게 급소 공격이 들어갔습니다.');
    if(type==='-heal')announce(nickname+' · HP를 회복하며 버팁니다.');
    if(type==='faint'&&target.remaining===0)spotlight('포켓몬 전멸',nickname+'의 트레이너가 다음 주자에게 자리를 넘깁니다.');
  }
  function reportHTML(result){
    const report=result.report;if(!report)return '';
    const actualLearning=game?.lastMatch?.replay===result?game.lastMatch.learning:null;
    const leaders='<div class="md-report-grid">'+['home','away'].map((key,k)=>
      '<section><h2>'+esc(game.clubs[k===0?result.home:result.away].name)+' 활약</h2>'+
      report[key].slice(0,3).map((mon,i)=>'<div class="md-report-row"><b>'+(i+1)+'</b><div><strong>'+
        esc(mon.displayName)+'</strong><small>'+esc(mon.trainer)+' · '+mon.entries+
        '회 투입</small></div><span>직접 격파 '+mon.knockouts+
        '<small>직접 피해 '+mon.damage+' HP</small></span></div>').join('')+
      '</section>').join('')+'</div>';
    const strategy=result.coaching?'<div class="md-coach-grid">'+['home','away'].map(key=>{
      const team=result.coaching[key]||[];
      return '<section><h2>'+esc(game.clubs[key==='home'?result.home:result.away].name)+' · AI 전술 평가</h2>'+
        team.map((profile,slot)=>{
          const replay=(result.rounds||[]).flatMap(round=>{
            const matchIndex=key==='home'?round.trainerA:round.trainerB;
            return matchIndex===slot?[round.aiDecisions?.[key==='home'?'p1':'p2']]:[];
          }).filter(Boolean);
          const switches=replay.reduce((n,r)=>n+(r.voluntarySwitches||0),0);
          const analyses=replay.reduce((n,r)=>n+(r.rollouts||0),0);
          const reasons={};
          for(const r of replay)for(const [reason,count] of Object.entries(r.reasons||{})){
            reasons[reason]=(reasons[reason]||0)+count;
          }
          const learning=actualLearning?.participants?.find(entry=>
            entry.side===key&&entry.slot===slot);
          const recommended=profile.behaviorAdvice, learned=learning?.progress?.[recommended];
          const highlights=Object.entries(reasons).sort((a,b)=>b[1]-a[1]).slice(0,2)
            .map(([why,count])=>esc(why)+' '+count+'회').join(' · ');
          return '<div class="md-coach-entry"><strong>'+(slot+1)+'. '+esc(profile.name)+'</strong>'+
            '<small>선플 '+esc(planLabels[profile.preferred]||'균형')+
            ' · 실제 전술 '+esc(planLabels[profile.plan]||'균형')+
            ' · 감독 권고 '+(profile.requested?esc(planLabels[profile.requested]||profile.requested):'없음')+
            ' → <b>'+esc(profile.response||'자율')+'</b></small>'+
            '<small>'+esc(profile.reason||'자율 결정')+'</small>'+
            '<small>경기 전 플레이 권고: '+
              (recommended?esc(behaviorLabels[recommended]||recommended)+' → <b>'+
                esc(profile.behaviorResponse||'자율')+'</b>':'없음')+'</small>'+
            (recommended&&learning?'<small>검증된 성공 경험 '+
              Number(learning.qualified?.[recommended]||0)+'회 · '+ 
              '자율 성향 '+Number(learned?.before||0)+'→'+Number(learned?.after||0)+
              (learning.learned?.length?' · 새 선플 '+learning.learned.map(esc).join(', '):'')+
              '</small>':'')+
            '<small>자율 교체 '+switches+'회 · 전황 시뮬레이션 '+analyses+'회'+
              (highlights?' · '+highlights:'')+'</small></div>';
        }).join('')+'</section>';
      }).join('')+'</div>':'';
    return leaders+'<p class="md-muted">직접 공격 피해와 격파만 집계합니다. 독·날씨 등의 간접 피해는 제외합니다.</p>'+
      '<h2>감독 권고 및 트레이너 AI 판단</h2>'+strategy;
  }
  const coachStyles=document.createElement('style');
  coachStyles.textContent='#matchday .md-coach-grid{display:grid;grid-template-columns:1fr 1fr;gap:14px;margin:12px 0}'+
    '#matchday .md-coach-grid h2{font-size:15px;margin:6px 0 12px}'+
    '#matchday .md-coach-entry{background:#172b3e;padding:9px 11px;border:1px solid #36526a;border-radius:6px;margin-bottom:7px}'+
    '#matchday .md-coach-entry strong{font-size:12px}#matchday .md-coach-entry small{display:block;color:#acc5d4;font-size:11px;line-height:1.6;margin-top:4px}'+
    '@media(max-width:650px){#matchday .md-coach-grid{grid-template-columns:1fr}}';
  document.head.appendChild(coachStyles);
  function nextMoment(){
    clearTimeout(timer);let target=cursor;
    while(target<events.length){const e=events[target];if(highlightFlags[target]&&(e.intro!==undefined||e.end||e.line?.startsWith('|turn|')))break;target++;}
    if(target===cursor)target++;
    skipping=true;while(cursor<Math.min(target,events.length))step();skipping=false;
    if(cursor>=events.length){complete();return;}
    if(paused)step();else tick();
  }
  const dramaStyles=document.createElement('style');dramaStyles.textContent=`
    #matchday .md-field{height:clamp(250px,38vh,420px);min-height:250px}#matchday .md-parties{display:grid;grid-template-columns:1fr 1fr;gap:12px;margin:8px 0}#matchday .md-party-heading{font-size:10px;color:#a5c9d5;margin:4px 0}#matchday .md-party-grid{display:grid;grid-template-columns:repeat(6,minmax(0,1fr));gap:4px}#matchday .md-party-mon{display:flex;flex-direction:column;align-items:center;position:relative;padding:3px;border:1px solid #2f4c5d;background:#102532;border-radius:4px;min-width:0}#matchday .md-party-mon.active{border-color:#e0cc77;background:#334337}#matchday .md-party-mon.fainted{opacity:.28;filter:grayscale(1)}#matchday .md-party-mon img{width:27px;height:27px;image-rendering:pixelated;object-fit:contain}#matchday .md-party-mon strong{max-width:100%;font-size:9px;white-space:nowrap;overflow:hidden;text-overflow:ellipsis}#matchday .md-party-mon small{font-size:9px;color:#b9d1da}#matchday .md-party-health{height:3px;width:85%;background:#07151f;margin:3px 0;overflow:hidden;border-radius:3px}#matchday .md-party-health i{display:block;height:100%;background:#7bccac;transition:width .2s}
    #matchday .md-keymoment{position:absolute;z-index:9;top:29%;left:22%;right:22%;padding:18px;background:#081d2de8;border-top:2px solid #e1cd8e;border-bottom:2px solid #e1cd8e;text-align:center;pointer-events:none;box-shadow:0 10px 40px #0007}#matchday .md-keymoment[hidden]{display:none}#matchday .md-keymoment strong{display:block;font-size:25px;color:#f5e7b8}#matchday .md-keymoment small{display:block;font-size:12px;margin-top:6px;color:#e4eaf0}
    #matchday .md-report-grid{display:grid;grid-template-columns:1fr 1fr;gap:18px}#matchday .md-report-grid h2{font-size:15px}#matchday .md-report-row{display:flex;align-items:center;gap:10px;padding:10px 0;border-bottom:1px solid #31495b;font-size:12px}#matchday .md-report-row>b{color:#e6d58c;font-size:20px}#matchday .md-report-row small{display:block;font-size:10px;color:#9eb6c6;margin-top:4px}#matchday .md-report-row>span{margin-left:auto;text-align:right}#matchday .md-report{border:1px solid #3b5a6b;padding:12px;margin-top:10px;border-radius:5px}#matchday .md-report>summary{cursor:pointer;color:#d6c994;font-size:13px}
    @media(max-width:650px){#matchday .md-report-grid{grid-template-columns:1fr}#matchday .md-keymoment{left:10%;right:10%}#matchday .md-keymoment strong{font-size:21px}#matchday .md-party-mon strong{font-size:8px}#matchday .md-party-mon img{width:22px;height:22px}}
  `;document.head.append(dramaStyles);

  const koTypes={Normal:'노말',Fire:'불꽃',Water:'물',Electric:'전기',Grass:'풀',Ice:'얼음',Fighting:'격투',Poison:'독',Ground:'땅',Flying:'비행',Psychic:'에스퍼',Bug:'벌레',Rock:'바위',Ghost:'고스트',Dragon:'드래곤',Dark:'악',Steel:'강철',Fairy:'페어리',Stellar:'스텔라'};
  function movesArenaHTML(){return `<div class="md-battle-layout"><aside class="md-moves-panel" id="p1-moves" aria-label="홈 포켓몬 기술과 상성"></aside>${arenaHTML()}<aside class="md-moves-panel" id="p2-moves" aria-label="원정 포켓몬 기술과 상성"></aside></div>`;}
  function renderMovePanels(){
    const result=pending()?.result;if(!result)return;
    for(const side of ['p1','p2']){
      const state=visualState[side],foe=visualState[side==='p1'?'p2':'p1'],panel=document.getElementById(side+'-moves');if(!panel)continue;
      const mon=state.party?.find(p=>p.name===rawName(state.actor));
      const target=foe.party?.find(p=>p.name===rawName(foe.actor));
      const base=result.teams[side==='p1'?'home':'away'][currentBattle?.[side==='p1'?'trainerA':'trainerB']]?.team.find(p=>p.name===mon?.name);
      const types=target?(foe.types?.length?foe.types:result.visuals?.[target.species]?.types||[]):[];
      const slots=mon?.liveMoves||base?.moves.map((id,i)=>({id,pp:mon?.pp?.[i],maxpp:mon?.maxpp?.[i]}))||[];
      const used=lastAction?.actor?.startsWith(side)&&rawName(lastAction.actor)===mon?.name?result.moveVisuals?.[lastAction.move]?.id:null;
      const signature=JSON.stringify({mon:mon?.name,target:target?.name,types,slots,used});if(panel.dataset.signature===signature)return;panel.dataset.signature=signature;
      panel.innerHTML=`<div class="md-moves-title">${side==='p1'?'홈':'원정'} · ${esc(mon?.displayName||'출전 대기')}</div><div class="md-moves-target">상대 ${esc(target?.displayName||'대기')} ${types.map(t=>koTypes[t]||t).join(' / ')}</div>`+Array.from({length:4},(_,i)=>{
        const slot=slots[i];if(!slot)return '<div class="md-move-card empty">—</div>';
        const info=result.moveVisuals?.[slot.id]||{},status=info.category==='Status';
        const coefficient=types.length&&result.typeChart?.[info.type]?types.reduce((n,type)=>n*(result.typeChart[info.type][type]??1),1):null;
        const label=status?'변화':coefficient===null?'—':'×'+coefficient;
        const kind=status?'neutral':coefficient===0?'immune':coefficient>1?'effective':coefficient<1?'resisted':'neutral';
        const pp=Number.isInteger(slot.pp)?slot.pp+'/'+(slot.maxpp??'?'):'미확인';
        return `<div class="md-move-card ${slot.id===used?'used':''} ${slot.pp===0?'exhausted':''}" data-move="${esc(slot.id)}"><div><strong>${esc(koreanMove(slot.id||slot.name))}</strong><b class="md-effectiveness ${kind}">${label}</b></div><small>${koTypes[info.type]||'타입 미확인'} · ${{Physical:'물리',Special:'특수',Status:'변화'}[info.category]||'—'} <span>PP ${pp}</span></small><small>위력 ${info.power||'—'} · 명중 ${info.accuracy===true?'필중':info.accuracy??'—'}</small></div>`;
      }).join('')+'<div class="md-matchup-note">기본 타입 상성 · 특성·도구 효과 별도</div>';
    }
  }
  function showRelayCarry(battle,previous,oldParties){
    const box=document.getElementById('md-relay-check');box.hidden=true;if(!previous||!battle.initial)return;
    const side=previous.winner==='A'&&previous.trainerA===battle.trainerA?'p1':previous.winner==='B'&&previous.trainerB===battle.trainerB?'p2':null;
    if(!side)return;
    const index=battle[side==='p1'?'trainerA':'trainerB'],trainer=pending().result.teams[side==='p1'?'home':'away'][index];
    const prior=new Map(oldParties[side].map(mon=>[mon.name,mon]));
    const rows=battle.initial[side].map(state=>{const old=prior.get(state.name),mon=trainer.team.find(m=>m.name===state.name);return {state,old,name:mon?.displayName||state.name};});
    const dead=rows.filter(r=>r.state.hp===0).length,alive=rows.length-dead;
    box.hidden=false;box.open=false;
    document.getElementById('md-relay-summary').textContent=trainer.name+' 이어 출전 · 기절 '+dead+'마리 그대로 · 생존 '+alive+'마리만 회복 · PP·상태 유지';
    document.getElementById('md-relay-rows').innerHTML='<p>생존 포켓몬만 최대 HP의 10% 회복하며, 기절한 포켓몬은 부활하지 않습니다.</p>'+rows.map(({state,old,name})=>{
      const before=old?.hp,delta=Number.isFinite(before)?state.hp-before:null;
      const hp=state.hp===0?'기절 유지':(Number.isFinite(before)?before+' → ':'')+state.hp+'/'+state.maxhp+(delta!==null?' ('+(delta>=0?'+':'')+delta+')':'');
      const pp=state.pp?.reduce((n,v)=>n+v,0),oldPP=old?.pp?.reduce((n,v)=>n+v,0);
      return `<div class="md-carry-row ${state.hp===0?'out':''}"><strong>${esc(name)}</strong><span>${hp}</span><small>PP 합계 ${oldPP??'—'} → ${pp??'—'} · ${statusNames[state.status]||'상태이상 없음'}</small></div>`;
    }).join('');
  }
  const skillStyles=document.createElement('style');skillStyles.textContent=`
    #matchday .md-battle-layout{display:grid;grid-template-columns:170px minmax(0,1fr) 170px;gap:8px;align-items:stretch}#matchday .md-battle-layout .md-field{height:clamp(300px,42vh,440px)}#matchday .md-moves-panel{background:#0b1e2c;border:1px solid #385367;border-radius:6px;padding:8px;min-width:0}#matchday .md-moves-title{font-size:12px;font-weight:800;color:#e7e4ce}#matchday .md-moves-target{font-size:9px;color:#b2c6d4;margin:5px 0 7px;min-height:24px}#matchday .md-move-card{border:1px solid #304c5f;background:#152d3e;padding:7px 6px;border-radius:4px;margin:5px 0;min-height:52px}#matchday .md-move-card>div{display:flex;align-items:center;justify-content:space-between;gap:4px}#matchday .md-move-card strong{font-size:11px;line-height:1.4}#matchday .md-move-card small{display:block;color:#a7becb;font-size:9px;margin-top:4px}#matchday .md-move-card small span{float:right;color:#d9e6e3}#matchday .md-move-card.used{border-color:#dcc777;box-shadow:inset 3px 0 #dcc777}#matchday .md-move-card.exhausted{opacity:.42}#matchday .md-move-card.empty{color:#4d687c}#matchday .md-effectiveness{font-size:11px;white-space:nowrap}#matchday .md-effectiveness.effective{color:#a6f3b8}#matchday .md-effectiveness.resisted{color:#e6c97d}#matchday .md-effectiveness.immune{color:#f49d9d}#matchday .md-effectiveness.neutral{color:#bfcede}#matchday .md-matchup-note{font-size:9px;line-height:1.6;color:#7996aa;margin-top:5px}
    #matchday .md-relay-check{background:#28382f;border:1px solid #a79458;border-radius:5px;padding:9px 12px;margin:8px 0;color:#ece1b6}#matchday .md-relay-check[hidden]{display:none}#matchday .md-relay-check summary{cursor:pointer;font-size:12px;font-weight:700;line-height:1.7}#matchday .md-relay-check p{font-size:11px;color:#c4d4c4}#matchday .md-carry-row{display:grid;grid-template-columns:100px 1fr 1.3fr;gap:10px;padding:6px 0;border-top:1px solid #63715966;font-size:11px}#matchday .md-carry-row small{color:#bccfc2}#matchday .md-carry-row.out{color:#e69c9c}
    @media(max-width:850px){#matchday .md-battle-layout{grid-template-columns:1fr 1fr}#matchday .md-battle-layout .md-field{grid-column:1/-1;grid-row:1;height:300px}#matchday .md-moves-panel{grid-row:2}#matchday .md-move-card{min-height:0}#matchday .md-move-card small{font-size:10px}#matchday .md-moves-target{min-height:0}#matchday .md-carry-row{grid-template-columns:85px 1fr}#matchday .md-carry-row small{grid-column:2}}
  `;document.head.append(skillStyles);

  async function startReplay() {
    const request=++replayRequest, replay=pending();
    await moveDictionaryReady;
    if(request!==replayRequest||pending()!==replay||replay?.phase!=='watch')return;
    clearTimeout(timer);cursor=0;events=[];paused=false;leadHistory={home:false,away:false};resetVisuals();
    const p=pending(), r=p.result, root=screen();
    root.innerHTML=`<div class="md-muted">${p.week}주차 · 리그 ${p.round}라운드 · Showdown 자동 관전</div><div class="md-top"><h1>${esc(game.clubs[p.home].name)} vs ${esc(game.clubs[p.away].name)}</h1><span class="md-score" id="md-score">0 : 0</span></div><div id="md-trainers"></div>${movesArenaHTML()}<details class="md-relay-check" id="md-relay-check" hidden><summary id="md-relay-summary"></summary><div id="md-relay-rows"></div></details>${partyHTML()}<div id="md-storyline" class="md-storyline">첫 선봉이 경기를 시작합니다.</div><div id="md-contributions" class="md-contributions"></div><div class="md-actions"><span id="md-stage" aria-live="polite">실제 전투 기록을 자동 재생합니다.</span><div><select id="md-mode" aria-label="관전 방식"><option value="highlights">주요 장면</option><option value="full">전체 관전</option></select> <button id="md-pause">일시정지</button> <select id="md-speed" aria-label="관전 속도"><option value="1">1배속</option><option value="4" selected>4배속</option><option value="16">16배속</option></select> <button id="md-next-moment">다음 주요 장면</button> <button id="md-skip">결과까지 보기</button></div></div><details class="md-report" id="md-report" hidden><summary>경기 활약 보고서</summary><div id="md-report-content"></div></details><details class="md-commentary"><summary>경기 중계 기록</summary><div id="md-log" role="log"></div></details><div class="md-actions"><span id="md-summary"></span><button id="md-finish" class="primary" disabled>경기 결과 확인 · 일정으로</button></div>`;
    r.rounds.forEach((battle,i)=>{
      events.push({intro:i,battle});
      for(const line of battle.log.split('\n')) if (/^\|(turn|move|switch|drag|faint|win|tie|-damage|-heal|-status|-curestatus|-supereffective|-resisted|-crit|-ability|-formechange|detailschange|-transform|-weather|league-state|cant)\|/.test(line)) events.push({line});
      events.push({end:battle});
    });
    highlightFlags=buildHighlights(events);contributions={home:r.teams.home.map(()=>({knockouts:0,wins:0})),away:r.teams.away.map(()=>({knockouts:0,wins:0}))};currentBattle=null;skippedEvents=0;
    root.querySelector('#md-mode').value=watchMode;root.querySelector('#md-mode').onchange=e=>{watchMode=e.target.value;};
    root.querySelector('#md-speed').value=String(speed);
    root.querySelector('#md-speed').onchange=e=>{speed=Number(e.target.value);};
    root.querySelector('#md-pause').onclick=e=>{paused=!paused;e.target.textContent=paused?'재생':'일시정지';if(!paused)tick();else clearTimeout(timer);};
    root.querySelector('#md-skip').onclick=()=>{clearTimeout(timer);skipping=true;while(cursor<events.length)step();skipping=false;complete();};
    root.querySelector('#md-next-moment').onclick=nextMoment;
    root.querySelector('#md-finish').onclick=finish;
    tick();
  }
  let score=[0,0];
  function append(text){const log=document.getElementById('md-log');const div=document.createElement('div');div.textContent=text;log.append(div);while(log.children.length>150)log.firstChild.remove();log.scrollTop=log.scrollHeight;}
  function step(){
    const event=events[cursor++], r=pending().result;
    if(event.intro!==undefined){
      if(event.intro===0)score=[0,0];
      const b=event.battle;document.getElementById('md-trainers').textContent=`${event.intro+1}번째 대결 · ${r.teams.home[b.trainerA].name} vs ${r.teams.away[b.trainerB].name}`;
      const previous=currentBattle,previousParties={p1:copy(visualState.p1.party||[]),p2:copy(visualState.p2.party||[])};currentBattle=b;renderContributions();visualIntro(b);initialiseParty(b);storyIntro(b,previous);showRelayCarry(b,previous,previousParties);renderMovePanels();append('── 트레이너 대결 '+(event.intro+1)+' ──');return;
    }
    if(event.end){recordBattleWin(event.end);if(event.end.winner==='A')score[0]++;else if(event.end.winner==='B')score[1]++;else {score[0]++;score[1]++;}document.getElementById('md-score').textContent=score.join(' : ');return;}
    const parts=event.line.split('|'), type=parts[1],actor=parts[2]||'',side=actor.startsWith('p1')?'p1':'p2',name=actorName(actor);
    syncParty(parts);visualEvent(parts);contextualCommentary(parts);renderMovePanels();
    if(type==='turn'){document.getElementById('md-stage').textContent=parts[2]+'턴';return;}
    if(type==='switch'||type==='drag'){document.getElementById(side+'-name').textContent=name;append(name+' 출전');}
    if(['switch','drag'].includes(type)||(['-damage','-heal'].includes(type)&&actor===visualState[side].actor)){
      const hp=(type==='switch'||type==='drag'?parts[4]:parts[3])||'',match=hp.match(/^(\d+)(?:\/(\d+))?/);
      if(match){const bar=document.getElementById(side+'-hp');bar.max=Number(match[2]||100);bar.value=Number(match[1]);document.getElementById(side+'-state').textContent=hp.replace('fnt','기절').replace('par','마비').replace('brn','화상').replace('slp','잠듦').replace('tox','맹독').replace('psn','독').replace('frz','얼음');}
    }
    if(type==='move')append(name+' → '+koreanMove(parts[3]));
    if(type==='faint'){recordKnockout(side);append(name+' 기절');}
    if(type==='-status')append(name+' · '+parts[3]);
    if(type==='-supereffective')append('효과가 굉장했습니다!');
    if(type==='-resisted')append('효과가 별로였습니다.');
    if(type==='-crit')append('급소에 맞았습니다!');
    if(type==='-ability')append(name+' · '+parts[3]);
  }
  function tick(){
    clearTimeout(timer);if(paused)return;
    if(watchMode==='highlights'){
      let processed=0;skipping=true;
      while(cursor<events.length&&!highlightFlags[cursor]&&processed++<100){step();skippedEvents++;}
      skipping=false;
      if(processed>=100){timer=setTimeout(tick,0);return;}
    }
    if(cursor>=events.length){complete();return;}
    step();const event=events[cursor-1],line=event?.line||'';
    let base=event?.intro!==undefined||event?.end?2200:/^\|(faint|-crit)\|/.test(line)?1600:/^\|(move|switch|drag)\|/.test(line)?1050:420;
    if(watchMode==='highlights'&&(/^\|faint\|/.test(line)||event?.end))base=Math.max(base,3000);
    timer=setTimeout(tick,Math.max(65,base/speed));
  }
  function complete(){const r=pending().result;announce('경기 종료 · '+r.aScore+' : '+r.bScore);document.getElementById('md-score').textContent=r.aScore+' : '+r.bScore;document.getElementById('md-stage').textContent='경기 종료';document.getElementById('md-summary').textContent=contributionSummary();renderContributions();document.getElementById('md-finish').disabled=false;document.getElementById('md-next-moment').disabled=true;if(r.report){document.getElementById('md-report-content').innerHTML=reportHTML(r);document.getElementById('md-report').hidden=false;}spotlight('경기 종료',r.aScore+' : '+r.bScore);document.getElementById('md-pause').disabled=true;document.getElementById('md-skip').disabled=true;}
  function finish(){
    const p=pending();if(!p||!p.result||cursor<events.length)return;
    if(game.season!==p.season||game.round!==p.round-1){alert('일정이 변경되어 결과를 적용할 수 없습니다.');return;}
    const before=copy(game);
    try {
      active=p.result;game.order=[...p.order];
      if(p.current)priorPlayNext();else priorNextWeek();
      if(game.round!==p.round)throw new Error('경기 결과 반영 실패');
      // Apply the coach relationship only after the match outcome is confirmed.
      const homeSide=myClub().id===p.home, side=homeSide?'home':'away';
      const team=p.result.coaching?.[side]||[];
      const won=homeSide?p.result.aScore>p.result.bScore:p.result.bScore>p.result.aScore;
      const relationships=game.trainerAI?.trust;
      if(relationships){
        const entries=[];
        for(let slot=0;slot<p.order.length;slot++){
          const index=p.order[slot],trainer=myClub().trainers[index],summary=team[slot];
          if(!trainer||!summary||summary.response==='자율'||!p.plans?.[index])continue;
          const tid=window.TrainerCareer?.trainerId?.(trainer,myClub().id,index)??String(trainer.uid??(String(myClub().id)+':'+index+':'+trainer.name));
          const prior=relationships[tid]??50;
          const delta=summary.response==='수용'?(won?2:-1):summary.response==='절충'?(won?1:0):won?2:-2;
          const next=Math.min(85,Math.max(15,prior+delta));
          relationships[tid]=next;
          entries.push({trainer:trainer.name,response:summary.response,preferred:summary.preferred,
            requested:summary.requested,played:summary.plan,reason:summary.reason,
            before:prior,after:next,won});
        }
        game.trainerAI.coachMatchReports ||= [];
        game.trainerAI.coachMatchReports.unshift({season:p.season,round:p.round,won,entries});
        game.trainerAI.coachMatchReports.length=Math.min(10,game.trainerAI.coachMatchReports.length);
      }
      const careerReport=window.TrainerCareer?.applyMatch?
        window.TrainerCareer.applyMatch(game,p,myClub().id):null;
      game.lastMatch.engine='showdown';game.lastMatch.replay=p.result;
      if(careerReport)game.lastMatch.learning=careerReport;
      delete game.pendingMatch;persist();clearTimeout(timer);document.getElementById('matchday')?.remove();for(const id of ['mainmenu','clubselect','clubtrainers']){const node=document.getElementById(id);if(node)node.hidden=true;}document.getElementById('dashboard').hidden=false;tab='fixtures';renderOffice();
    } catch(error){game=before;persist();alert(error.message);}finally{active=null;}
  }
  const priorReportRender=renderOffice;
  renderOffice=function(){priorReportRender();const panel=document.getElementById('dashpanel');if(panel&&game?.lastMatch?.replay?.report&&['home','fixtures'].includes(tab)){const button=document.createElement('button');button.className='g-btn alt';button.textContent='지난 경기 활약 보고서';button.onclick=()=>{const root=screen();root.innerHTML='<h1>지난 경기 활약 보고서</h1>'+reportHTML(game.lastMatch.replay)+'<button id="md-report-back">구단 화면으로</button>';root.querySelector('#md-report-back').onclick=()=>root.remove();};panel.append(button);}};
  if(game?.pendingMatch){if(game.pendingMatch.phase==='running')game.pendingMatch.phase='prepare';render();}
})();


/* Pokemon artwork UI: trainer rosters, profiles and transfer scouting. */
(function pokemonArtworkUI() {
  if (window.PokemonArtworkUI) return;
  const artworkRoot = 'https://raw.githubusercontent.com/PokeAPI/sprites/master/sprites/pokemon/';
  const ball = 'data:image/svg+xml;charset=utf-8,' + encodeURIComponent(
    '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 100 100"><circle cx="50" cy="50" r="42" fill="#eef3f7" stroke="#293e52" stroke-width="7"/><path d="M9 50a41 41 0 0 1 82 0H9" fill="#dc5660"/><path d="M9 50h82" stroke="#293e52" stroke-width="8"/><circle cx="50" cy="50" r="12" fill="#f8f8f8" stroke="#293e52" stroke-width="7"/></svg>');
  let koreanIds = Object.create(null), spriteIds = Object.create(null), baseKeys = Object.create(null), dataReady = false;
  let artworkSerial=0;
  const artworkRecord=new Map();
  const safe = value => escapeHTML(String(value ?? ''));
  const key = value => String(value ?? '').toLowerCase().replace(/[^a-z0-9]/g, '');
  const koreanForms = [['메가X','megax'],['메가Y','megay'],['메가','mega'],['알로라','alola'],['가라르','galar'],['히스이','hisui'],['팔데아','paldea'],['원시','primal'],['영물','therian'],['오리진','origin'],['스카이','sky'],['거다이맥스','gmax']];
  function resolve(pokemon) {
    const pokemonName = String(pokemon?.name || pokemon?.species || pokemon || '');
    const explicit = String(pokemon?.species || pokemon?.formId || '');
    let english = key(explicit);
    let id = spriteIds[english] || koreanIds[pokemonName] || 0;
    let baseId = koreanIds[pokemonName] || id;
    const withForm = pokemonName.match(/^(.+?)\s*[(［\[](.+?)[)］\]]$/);
    if (withForm) {
      baseId = koreanIds[withForm[1].trim()] || baseId;
      const form = koreanForms.find(([label]) => withForm[2].includes(label));
      if (form && baseKeys[baseId]) id = spriteIds[baseKeys[baseId] + form[1]] || id || baseId;
    }
    if (pokemon?.form || pokemon?.forme) {
      const form = key(pokemon.form || pokemon.forme);
      if (baseKeys[baseId]) id = spriteIds[baseKeys[baseId] + form] || id;
    }
    if (!id && !english) english = key(pokemonName);
    if (!id) id = spriteIds[english] || koreanIds[pokemonName] || 0;
    if (id > 9999 && (!baseId || baseId > 9999)) {
      const possible = Object.keys(baseKeys).map(Number).filter(n => english.startsWith(baseKeys[n])).sort((a,b) => baseKeys[b].length-baseKeys[a].length);
      if (possible.length) baseId = possible[0];
    }
    return {id: Number(id)||0, baseId: Number(baseId)||0, name: pokemonName};
  }
  function image(pokemon, size='large') {
    const info=resolve(pokemon), number=info.id;
    const src=number ? artworkRoot+'other/official-artwork/'+number+'.png' : ball;
    const ref=String(++artworkSerial);
    artworkRecord.set(ref,pokemon);
    if(artworkRecord.size>3000)artworkRecord.delete(artworkRecord.keys().next().value);
    return '<img class="pkm-art pkm-art-'+size+'" src="'+src+'" alt="'+safe(info.name)+' 정보 보기" role="button" tabindex="0" aria-haspopup="dialog" loading="lazy" decoding="async" width="96" height="96" data-pkm-record="'+ref+'" data-pkm-step="0" data-pkm-id="'+number+'" data-pkm-base="'+info.baseId+'">';
  }
  function miniRoster(pokemon) {
    return '<div class="pkm-roster-mini" aria-label="보유 포켓몬 이미지">'+(pokemon||[]).map(p=>image(p,'mini')).join('')+'</div>';
  }
  function profileCard(p,i) {
    return '<div class="profile-mon pkm-profile-card">'+image(p)+
      '<div class="pkm-card-text"><b>'+(i+1)+'. '+safe(p.name||p.species)+'</b><small>Lv.'+safe(p.level??'—')+' · 전투력 '+safe(p.power??'—')+
      (p.careerSeasons?'<br>활동 '+safe(p.careerSeasons)+' / 8시즌':'')+'</small><div class="g-bar"><i style="width:'+Math.max(0,Math.min(100,Number(p.power)||0))+'%"></i></div></div></div>';
  }
  const originalCell=trainerCell;
  trainerCell=function(entry,column) {
    const html=originalCell(entry,column);
    return column==='name' && entry?.trainer?.pokemon?.length
      ? html.replace('</td>',miniRoster(entry.trainer.pokemon)+'</td>') : html;
  };
  const originalProfile=trainerProfileHTML;
  trainerProfileHTML=function(club) {
    const html=originalProfile(club);
    const entries=allTrainers(club), entry=entries.find(e=>e.id===selectedTrainerId)||entries[0];
    if(!entry?.trainer?.pokemon)return html;
    const cards='<div class="profile-pokemon pkm-profile-grid">'+entry.trainer.pokemon.map(profileCard).join('')+'</div>';
    return html.replace(/<div class="profile-pokemon">[\s\S]*?(?=<div class="profile-actions">)/,cards);
  };
  const originalClubTrainerDetail=clubTrainerDetailHTML;
  clubTrainerDetailHTML=function(trainer) {
    const html=originalClubTrainerDetail(trainer);
    if(!trainer?.pokemon)return html;
    return html.replace(/<div class="ct-pokemon-grid">[\s\S]*$/, '<div class="ct-pokemon-grid pkm-choose-grid">'+trainer.pokemon.map((p,i)=>
      '<div class="ct-pokemon pkm-choose-card">'+image(p)+
      '<span><strong>'+String(i+1).padStart(2,'0')+' '+safe(p.name||p.species)+'</strong>'+
      '<small>레벨 '+safe(p.level??'—')+' · 전투력 '+safe(p.power??'—')+'</small>'+
      '<em>활동 '+safe(p.careerSeasons||1)+' / 8시즌</em></span></div>').join('')+'</div>');
  };
  const originalClubTrainers=renderClubTrainers;
  renderClubTrainers=function() {
    originalClubTrainers();
    const club=clubSelectDraft?.clubs?.[clubSelectId];
    if (!club) return;
    document.querySelectorAll('#clubtrainers [data-preview-index]').forEach(button=>{
      const trainer=club.trainers[Number(button.dataset.previewIndex)];
      const lead=trainer?.pokemon?.slice(0,3);
      if(lead?.length)button.querySelector('.ct-sub')?.insertAdjacentHTML('afterend',miniRoster(lead));
    });
  };
  const originalOffice=renderOffice;
  renderOffice=function() {
    originalOffice();
    if(tab==='pokemon') {
      const roster=(myClub()?.trainers||[]).concat(myClub()?.reserveTrainers||[]).filter(Boolean).flatMap(t=>t.pokemon||[]);
      const nodes=document.querySelectorAll('#dashpanel .g-pokemon > div');
      nodes.forEach((node,i)=>{if(roster[i]&&!node.classList.contains('pkm-owned-card')){node.classList.add('pkm-owned-card');node.insertAdjacentHTML('afterbegin',image(roster[i]));}});
    }
    if(tab==='transfer') {
      let item=typeof marketTarget==='function' ? marketTarget()?.t : null;
      if(!item && typeof marketFreeSelected==='number' && marketFreeSelected>=0)item=game?.freeAgents?.[marketFreeSelected]?.trainer;
      const nodes=document.querySelectorAll('#marketDetail .fm-detail-mon');
      nodes.forEach((node,i)=>{if(item?.pokemon?.[i]&&!node.querySelector('.pkm-art'))node.insertAdjacentHTML('afterbegin',image(item.pokemon[i]));});
    }
  };
  // Images are decorative UI only; no battle, save, roster or stat mutation.
  document.addEventListener('error',event=>{
    const img=event.target;
    if(!(img instanceof HTMLImageElement)||!img.classList.contains('pkm-art'))return;
    const id=Number(img.dataset.pkmId), base=Number(img.dataset.pkmBase), step=Number(img.dataset.pkmStep);
    if(step===0&&id){img.dataset.pkmStep='1';img.src=artworkRoot+id+'.png';}
    else if(step<=1&&base&&base!==id){img.dataset.pkmStep='2';img.src=artworkRoot+'other/official-artwork/'+base+'.png';}
    else {img.dataset.pkmStep='3';img.src=ball;}
  },true);
  const css=document.createElement('style');
  css.textContent='.pkm-art{display:block;object-fit:contain;flex:none;filter:drop-shadow(0 3px 6px #0005)}'+
    '.pkm-art-mini{width:29px;height:29px}.pkm-roster-mini{display:flex;align-items:center;gap:1px;max-width:220px;flex-wrap:wrap;margin-top:5px}'+
    '.pkm-trainer-line{display:flex;flex-wrap:wrap;gap:6px}.pkm-profile-grid{display:grid;grid-template-columns:repeat(3,minmax(0,1fr));gap:10px}'+
    '.pkm-profile-card{display:flex;align-items:center;gap:9px;min-width:0;min-height:112px;background:linear-gradient(145deg,#162c43,#101d31);border:1px solid #47627b;border-radius:8px;padding:9px}'+
    '.pkm-profile-card .pkm-art{width:84px;height:90px}.pkm-card-text{flex:1;min-width:0}.pkm-card-text b{overflow-wrap:anywhere}'+
    '.pkm-choose-card{display:flex;align-items:center;gap:8px;min-width:0}.pkm-choose-card .pkm-art{width:66px;height:75px}.pkm-choose-card span{min-width:0}'+
    '.pkm-owned-card{display:flex;flex-wrap:wrap;align-items:center;gap:8px}.pkm-owned-card .pkm-art{width:68px;height:70px}'+
    '#marketDetail .fm-detail-mon{display:flex;align-items:center;gap:8px}#marketDetail .fm-detail-mon .pkm-art{width:56px;height:60px}'+
    '.ct-trainer-card .pkm-roster-mini{margin-top:4px}.ct-trainer-card .pkm-art-mini{width:25px;height:25px}'+
    '@media(max-width:780px){.pkm-profile-grid{grid-template-columns:repeat(2,minmax(0,1fr))}.pkm-profile-card .pkm-art{width:68px;height:72px}}'+
    '@media(max-width:460px){.pkm-profile-grid{grid-template-columns:1fr}}';
  document.head.appendChild(css);
  window.PokemonArtworkUI={resolve,image,getRecord:ref=>artworkRecord.get(String(ref))};
  Promise.all([
    fetch('/src/web/species-ko.json').then(r=>{if(!r.ok)throw Error('Korean species data');return r.json();}),
    fetch('/src/web/species-sprites.json').then(r=>{if(!r.ok)throw Error('Form and sprite data');return r.json();})
  ]).then(([ko,sprites])=>{
    koreanIds=ko;spriteIds=sprites;
    for(const [name,id] of Object.entries(sprites))if(id<=1025&&!baseKeys[id])baseKeys[id]=name;
    dataReady=true;
    if(game&&['team','profile','pokemon','transfer'].includes(tab))renderOffice();
    if(document.querySelector('#clubtrainers [data-preview-index]'))renderClubTrainers();
  }).catch(error=>{console.warn('포켓몬 이미지 식별 데이터 로딩 실패:',error.message);});
})();

/* Trainer Pokémon detail: recorded game state is never synthesized from Pokédex data. */
(function pokemonDetailView(){
  if(window.PokemonDetailView)return;
  const ui=window.PokemonArtworkUI;
  if(!ui)return;
  const esc=value=>escapeHTML(String(value??''));
  const exists=value=>value!==null&&value!==undefined&&value!=='';
  const show=value=>exists(value)?esc(value):'미기록';
  const num=value=>exists(value)&&Number.isFinite(Number(value))?Number(value):null;
  const labels={hp:'HP',atk:'공격',def:'방어',spa:'특수공격',spd:'특수방어',spe:'스피드'};
  const conditions={par:'마비',brn:'화상',slp:'잠듦',tox:'맹독',psn:'독',frz:'얼음',fnt:'기절'};
  const types={normal:'노말',fire:'불꽃',water:'물',electric:'전기',grass:'풀',ice:'얼음',fighting:'격투',poison:'독',ground:'땅',flying:'비행',psychic:'에스퍼',bug:'벌레',rock:'바위',ghost:'고스트',dragon:'드래곤',dark:'악',steel:'강철',fairy:'페어리'};
  const color={normal:'#929bab',fire:'#d47b5b',water:'#448cb7',electric:'#c8a43f',grass:'#529c71',ice:'#5fbbc4',fighting:'#ad6e57',poison:'#9870b1',ground:'#ae8755',flying:'#719eb4',psychic:'#ba72a0',bug:'#829d58',rock:'#9b9170',ghost:'#766db5',dragon:'#5f75ca',dark:'#6e7185',steel:'#7c979f',fairy:'#d18bba'};
  let active=null,focusBefore=null,serial=0,moveNames={},dexCache=new Map();
  const css=document.createElement('style');
  css.textContent=[
    '.pkm-art[role=button]{cursor:pointer}.pkm-art[role=button]:focus-visible{outline:3px solid #75cddd;outline-offset:3px;border-radius:6px}',
    '.pki-shade{position:fixed;inset:0;z-index:2500;background:#07111cde;display:grid;place-items:center;padding:18px;color:#e7f0f8;font:14px "Malgun Gothic",sans-serif}',
    '.pki-panel{position:relative;width:min(850px,100%);max-height:92vh;overflow:auto;background:linear-gradient(145deg,#19334a,#101d2f);border:1px solid #56758a;border-radius:12px;box-shadow:0 22px 80px #000b}',
    '.pki-top{display:flex;align-items:center;gap:22px;padding:23px 55px 23px 20px;border-bottom:1px solid #39556e}',
    '.pki-image{width:158px;height:158px;flex:none;display:grid;place-items:center;background:#0a1d31;border:1px solid #41637b;border-radius:10px}',
    '.pki-image img{width:144px;height:144px;object-fit:contain}.pki-top h2{font-size:25px;margin:3px 0 10px}.pki-top small{color:#acc7d7}',
    '.pki-types{display:flex;gap:6px;flex-wrap:wrap;margin-top:10px}.pki-type{padding:4px 11px;border-radius:16px;font-size:12px}',
    '.pki-close{position:absolute;top:12px;right:13px;background:#243f56;border:1px solid #648297;color:white;border-radius:6px;width:38px;height:38px;font-size:23px;cursor:pointer}',
    '.pki-body{padding:19px 22px 23px;display:grid;gap:18px}.pki-kpis{display:grid;grid-template-columns:repeat(4,minmax(0,1fr));gap:10px}',
    '.pki-kpi,.pki-fact,.pki-move{background:#162e43;border:1px solid #38556e;border-radius:7px;padding:12px;min-width:0}',
    '.pki-kpi small,.pki-fact small{display:block;color:#aac4d6;margin-bottom:6px;font-size:12px}.pki-kpi strong{display:block;font-size:18px;overflow-wrap:anywhere}',
    '.pki-block{border-top:1px solid #395166;padding-top:13px}.pki-block h3{font-size:15px;margin:0 0 11px}',
    '.pki-grid{display:grid;grid-template-columns:repeat(3,minmax(0,1fr));gap:9px}.pki-fact strong{overflow-wrap:anywhere;font-size:13px}',
    '.pki-stats{display:grid;grid-template-columns:repeat(2,minmax(0,1fr));gap:10px 20px}.pki-stat{display:flex;align-items:center;gap:8px}',
    '.pki-stat span{width:68px;flex:none;font-size:12px}.pki-stat b{width:35px;text-align:right}.pki-meter{flex:1;height:7px;background:#395166;border-radius:5px;overflow:hidden}.pki-meter i{display:block;height:100%;background:#62b9a2}',
    '.pki-moves{display:grid;grid-template-columns:repeat(2,minmax(0,1fr));gap:9px}.pki-move{display:flex;justify-content:space-between;align-items:center;gap:8px}.pki-move small{color:#aac4d6}',
    '.pki-note{color:#adc3d2;font-size:12px;line-height:1.6;margin:6px 0 0}',
    '@media(max-width:630px){.pki-shade{padding:7px}.pki-body{padding:13px}.pki-top{padding:16px 48px 16px 13px;gap:11px}.pki-top h2{font-size:20px}.pki-image{width:106px;height:112px}.pki-image img{width:100px;height:106px}.pki-kpis{grid-template-columns:repeat(2,minmax(0,1fr))}.pki-grid,.pki-stats,.pki-moves{grid-template-columns:repeat(2,minmax(0,1fr))}}',
    '@media(max-width:380px){.pki-grid,.pki-stats,.pki-moves{grid-template-columns:1fr}}'
  ].join('');
  document.head.appendChild(css);
  fetch('/src/web/moves-ko.json').then(r=>r.ok?r.json():{}).then(data=>{moveNames=data;if(active)render(active.id);}).catch(()=>{});
  const field=(name,value)=>'<div class="pki-fact"><small>'+esc(name)+'</small><strong>'+show(value)+'</strong></div>';
  const section=(name,inner)=>'<section class="pki-block"><h3>'+esc(name)+'</h3>'+inner+'</section>';
  function stats(data,max){
    return '<div class="pki-stats">'+Object.entries(labels).map(([key,label])=>{
      const value=num(data?.[key]);
      return '<div class="pki-stat"><span>'+label+'</span><div class="pki-meter"><i style="width:'+(value===null?0:Math.min(100,Math.max(0,value/max*100)))+'%"></i></div><b>'+(value===null?'—':value)+'</b></div>';
    }).join('')+'</div>';
  }
  function moves(mon){
    const slots=Array.isArray(mon?.moves)?mon.moves:Array.isArray(mon?.moveSlots)?mon.moveSlots:[];
    if(!slots.length)return '<p class="pki-note">저장된 기술이 없습니다. 경기 준비 때 자동 편성될 수 있습니다.</p>';
    return '<div class="pki-moves">'+slots.map((slot,index)=>{
      const id=typeof slot==='string'?slot:(slot?.id||slot?.move||slot?.name||'');
      const key=String(id).toLowerCase().replace(/[^a-z0-9]/g,'');
      const pp=num(slot?.pp??mon?.pp?.[index]),max=num(slot?.maxpp??mon?.maxpp?.[index]);
      return '<div class="pki-move"><strong>'+esc(moveNames[key]||id||'미확인')+'</strong><small>PP '+(pp===null?'미기록':pp)+(max===null?'':' / '+max)+'</small></div>';
    }).join('')+'</div>';
  }
  function dex(id){
    if(!id)return Promise.resolve(null);
    if(dexCache.has(id))return dexCache.get(id);
    const promise=fetch('https://pokeapi.co/api/v2/pokemon/'+id+'/').then(r=>{if(!r.ok)throw Error('not found');return r.json();}).then(raw=>({
      types:(raw.types||[]).sort((a,b)=>a.slot-b.slot).map(x=>x.type.name),
      base:Object.fromEntries((raw.stats||[]).map(x=>[({'hp':'hp','attack':'atk','defense':'def','special-attack':'spa','special-defense':'spd','speed':'spe'})[x.stat.name],x.base_stat])),
      height:raw.height/10,weight:raw.weight/10
    })).catch(()=>null);
    dexCache.set(id,promise);return promise;
  }
  function render(id){
    if(!active||active.id!==id)return;
    const root=document.getElementById('pki-overlay');if(!root)return;
    const mon=active.mon,meta=active.dex,info=ui.resolve(mon);
    const savedTypes=Array.isArray(mon?.types)?mon.types:(exists(mon?.type)?String(mon.type).split('/'):[]);
    const monTypes=savedTypes.length?savedTypes:meta?.types||[];
    const hp=num(mon?.hp??mon?.currentHp),maximum=num(mon?.maxhp??mon?.maxHp);
    const condition=exists(mon?.status)?conditions[mon.status]||mon.status:(hp===0?'기절':hp===null?'미기록':'정상');
    const ca=mon?.ca??mon?.power,pa=mon?.pa;
    const kpis=[['현재 HP',hp===null?'미기록':String(hp)+(maximum!==null?' / '+maximum:'')],['상태',condition],['현재 능력 (CA)',ca],['잠재 능력 (PA)',pa]];
    const kpiHTML='<div class="pki-kpis">'+kpis.map(([k,v])=>'<div class="pki-kpi"><small>'+esc(k)+'</small><strong>'+show(v)+'</strong></div>').join('')+'</div>';
    const facts='<div class="pki-grid">'+field('레벨',mon?.level)+field('특성',mon?.ability)+field('지닌 도구',mon?.item||'없음')+
      field('성격',mon?.nature)+field('활동 시즌',mon?.careerSeasons)+field('폼',mon?.form||mon?.forme||'기본')+
      (meta?field('종족 신장',meta.height+'m')+field('종족 체중',meta.weight+'kg'):'')+'</div>';
    const gp=mon?.gp,savedStats=mon?.stats??mon?.battleStats;
    const hasStats=savedStats&&Object.keys(labels).some(k=>num(savedStats[k])!==null);
    const hasGP=gp&&Object.keys(labels).some(k=>num(gp[k])!==null);
    const hasBase=meta?.base&&Object.keys(labels).some(k=>num(meta.base[k])!==null);
    const statsHTML=(hasStats?section('저장된 전투 능력치',stats(savedStats,600)):'')+
      (hasGP?section('성장 포인트 (GP)',stats(gp,100)+'<p class="pki-note">GP는 성장 데이터이며 전투 능력치와 다릅니다.</p>'):'')+
      (hasBase?section('종족값 · 도감 참고 정보',stats(meta.base,255)+'<p class="pki-note">외부 도감의 종족값이며 개체의 전투 능력치가 아닙니다.</p>'):'')+
      (!hasStats&&!hasGP&&!hasBase?'<p class="pki-note">능력치 데이터는 아직 기록되지 않았습니다.</p>':'');
    const image=ui.image(mon).replace('tabindex="0"','tabindex="-1"');
    root.innerHTML='<div class="pki-panel" role="dialog" aria-modal="true" aria-labelledby="pki-heading" tabindex="-1">'+
      '<button class="pki-close" type="button" aria-label="상세 정보 닫기">×</button>'+
      '<header class="pki-top"><div class="pki-image">'+image+'</div><div><small>'+(info.baseId?'도감 No. '+String(info.baseId).padStart(4,'0'):'도감 번호 미확인')+'</small>'+
      '<h2 id="pki-heading">'+show(mon?.name||mon?.species)+'</h2><div>Lv. '+show(mon?.level)+'</div><div class="pki-types">'+monTypes.map(t=>'<span class="pki-type" style="background:'+(color[String(t).toLowerCase()]||'#51677b')+'">'+esc(types[String(t).toLowerCase()]||t)+'</span>').join('')+'</div></div></header>'+
      '<div class="pki-body">'+kpiHTML+section('기본 정보',facts)+section('기술과 PP',moves(mon))+statsHTML+
      '<p class="pki-note">현재 HP·상태·CA·PA·GP·기술은 저장된 값만 표시합니다. 종족값은 참고용 외부 도감 자료입니다.</p></div></div>';
    root.querySelector('.pki-close').onclick=close;
    root.querySelector('.pki-panel').focus({preventScroll:true});
  }
  function close(){
    document.getElementById('pki-overlay')?.remove();active=null;serial++;
    if(focusBefore?.isConnected)focusBefore.focus({preventScroll:true});
    focusBefore=null;
  }
  function open(mon){
    if(!mon)return;
    focusBefore=document.activeElement;
    const id=++serial;active={id,mon,dex:null};
    document.getElementById('pki-overlay')?.remove();
    const root=document.createElement('div');root.id='pki-overlay';root.className='pki-shade';
    root.onclick=e=>{if(e.target===root)close();};
    document.body.appendChild(root);render(id);
    const info=ui.resolve(mon);
    dex(info.id||info.baseId).then(data=>{if(active?.id!==id)return;active.dex=data;render(id);});
  }
  function pick(target){
    if(!(target instanceof Element)||target.closest('#pki-overlay'))return null;
    if(target.matches('.pkm-art[data-pkm-record]'))return target;
    return target.closest('.pkm-profile-card,.pkm-choose-card,.pkm-owned-card,#marketDetail .fm-detail-mon')?.querySelector('.pkm-art[data-pkm-record]')||null;
  }
  document.addEventListener('click',event=>{const img=pick(event.target);if(!img)return;const mon=ui.getRecord(img.dataset.pkmRecord);if(mon){event.preventDefault();event.stopPropagation();open(mon);}},true);
  document.addEventListener('keydown',event=>{
    if(event.key==='Escape'&&active){event.preventDefault();close();return;}
    if(active&&event.key==='Tab'){
      const panel=document.querySelector('#pki-overlay .pki-panel');
      if(panel&&!panel.contains(document.activeElement)){event.preventDefault();panel.querySelector('.pki-close')?.focus();}
      return;
    }
    if((event.key==='Enter'||event.key===' ')&&event.target?.matches?.('.pkm-art[data-pkm-record]')){
      const mon=ui.getRecord(event.target.dataset.pkmRecord);
      if(mon){event.preventDefault();open(mon);}
    }
  });
  window.PokemonDetailView={open,close};
})();


/* Autonomous trainer development: director recommends; AI decides, trains, and reports.
   CA and GP use the identical budget/cap rules as src/core/stats.js. */
(function autonomousTrainerDevelopment(){
  if(window.TrainerAutonomy)return;
  const STATS=['hp','atk','def','spa','spd','spe'];
  const STAT_KO={hp:'HP',atk:'공격',def:'방어',spa:'특수공격',spd:'특수방어',spe:'스피드'};
  const FOCI={
    balanced:{label:'균형 육성',stats:STATS},
    physical:{label:'물리 공격 강화',stats:['atk','spe','hp','def','spd','spa']},
    special:{label:'특수 공격 강화',stats:['spa','spe','hp','spd','def','atk']},
    speed:{label:'스피드 집중',stats:['spe','atk','spa','hp','def','spd']},
    defense:{label:'수비·지구력',stats:['hp','def','spd','spe','atk','spa']}
  };
  const STYLES=['balanced','physical','special','speed','defense'];
  const clamp=(value,min,max)=>Math.max(min,Math.min(max,value));
  const gpBudget=ca=>Math.floor(313*ca/200);
  const number=value=>Number.isFinite(Number(value))&&value!==null&&value!==undefined&&value!==''?Number(value):null;
  const hash=text=>{let h=2166136261;for(const char of String(text)){h=Math.imul(h^char.charCodeAt(0),16777619);}return h>>>0;};
  const roll=key=>hash(key)/4294967296;
  const identifier=(trainer,clubId,index)=>String(trainer.uid!=null?'trainer:'+trainer.uid:'club:'+clubId+':'+String(trainer.id??index));
  const clock=game=>String(game.season??1)+':'+String(game.week??game.round??0);
  const safe=value=>escapeHTML(String(value??''));
  function skillValue(trainer,keys){
    for(const key of keys){
      const value=number(trainer[key]??trainer.skills?.[key]);
      if(value!==null&&value>=0)return clamp(Math.round(value>20?value/5:value),1,20);
    }
    return 10; // neutral where old saves have no matching development attribute
  }
  function teachingSkill(trainer){return skillValue(trainer,['training','trainingSkill','coaching','development','growth','train']);}
  function potentialSkill(trainer){return skillValue(trainer,['potentialDevelopment','potentialTraining','potentialSkill','training','coaching']);}
  function profile(trainer,clubId,index){
    if(trainer.autonomyAI?.version===1&&FOCI[trainer.autonomyAI.style])return trainer.autonomyAI;
    const key=identifier(trainer,clubId,index);
    trainer.autonomyAI={
      version:1,style:STYLES[hash(key+':style')%STYLES.length],
      openness:3+hash(key+':openness')%16,
      conviction:3+hash(key+':conviction')%16
    };
    return trainer.autonomyAI;
  }
  function init(game){
    if(!game.trainerAI||game.trainerAI.version!==1){
      game.trainerAI={version:1,lastClock:clock(game),advice:{},issued:{},trust:{},reports:[]};
    }
    return game.trainerAI;
  }
  function recommend(game,trainer,clubId,index,focus){
    const state=init(game),id=identifier(trainer,clubId,index),period=clock(game);
    if(!FOCI[focus])return {ok:false,message:'알 수 없는 육성 방침입니다.'};
    if(state.lastClock!==period)return {ok:false,message:'현재 주차 훈련을 먼저 정산해야 합니다.'};
    if(state.issued[id]===period)return {ok:false,message:'이번 주에는 이미 이 트레이너에게 권고했습니다.'};
    state.advice[id]={focus,issuedAt:period};state.issued[id]=period;
    return {ok:true,message:'권고를 전달했습니다. 트레이너가 다음 훈련에서 독자적으로 판단합니다.'};
  }
  function decide(trainer,traits,request,trust){
    if(!request)return {decision:'자율',focus:traits.style,reason:'감독 권고 없이 기존 육성 철학에 따라 진행'};
    const aligned=request.focus===traits.style,compatible=traits.style==='balanced'||request.focus==='balanced';
    const score=traits.openness*2+(trust??50)/8+teachingSkill(trainer)/4+
      (aligned?15:compatible?5:-6)-traits.conviction*1.3;
    if(score>=28)return {decision:'수용',focus:request.focus,
      reason:aligned?'감독의 제안과 본인의 육성 철학이 일치함':'훈련 목적에 동의하고 감독의 제안을 채택'};
    if(score>=16)return {decision:'절충',focus:request.focus,secondary:traits.style,
      reason:'제안 취지는 받아들이되 기존 훈련 계획도 병행'};
    return {decision:'거부',focus:traits.style,
      reason:'현재 포켓몬 상태에 대한 본인의 판단을 우선함'};
  }
  function startingGP(ca){
    const budget=gpBudget(ca),gp={};
    STATS.forEach((stat,i)=>{gp[stat]=Math.floor(budget/6)+(i<budget%6?1:0);});
    return gp;
  }
  function validGP(gp,ca){
    return gp&&STATS.every(s=>Number.isInteger(gp[s])&&gp[s]>=0&&gp[s]<=94)&&
      STATS.reduce((sum,s)=>sum+gp[s],0)===gpBudget(ca);
  }
  function allocate(gp,delta,focus,key){
    const next={...gp};
    const ordered=FOCI[focus]?.stats||STATS;
    for(let point=0;point<delta;point++){
      const rotation=hash(key+':point:'+point)%Math.min(3,ordered.length);
      const candidates=ordered.slice(rotation).concat(ordered.slice(0,rotation));
      const stat=candidates.find(s=>next[s]<94);
      if(!stat)return null;
      next[stat]++;
    }
    return next;
  }
  function trainMon(mon,focus,trainer,key){
    const current=number(mon?.ca??mon?.power),max=number(mon?.pa??mon?.potential);
    if(current===null||max===null||!Number.isInteger(current)||!Number.isInteger(max)||
       current<1||max>200||current>=max||current>200)return null;
    const gp=mon.gp??startingGP(current);
    if(!validGP(gp,current))return null; // never corrupt an existing GP budget
    const skill=teachingSkill(trainer),potential=potentialSkill(trainer);
    const chance=clamp(.16+skill*.017+potential*.007+(max-current>25?.07:0),.16,.78);
    if(roll(key+':growth')>=chance)return null;
    const gain=skill>=17&&potential>=15&&roll(key+':bonus')<.12?2:1;
    const newCA=Math.min(max,current+gain);
    const newGP=allocate(gp,gpBudget(newCA)-gpBudget(current),focus,key);
    if(!newGP||!validGP(newGP,newCA))return null;
    const changes=STATS.filter(s=>newGP[s]!==gp[s]).map(s=>STAT_KO[s]+' +'+(newGP[s]-gp[s]));
    mon.ca=newCA;
    if(number(mon.power)!==null)mon.power=newCA;
    mon.gp=newGP;
    if(!Array.isArray(mon.trainingHistory))mon.trainingHistory=[];
    mon.trainingHistory.unshift({week:key,from:current,to:newCA,focus,changes});
    mon.trainingHistory.length=Math.min(mon.trainingHistory.length,12);
    return {name:mon.name||mon.species||'포켓몬',from:current,to:newCA,changes};
  }
  function trainTrainer(trainer,clubId,index,period,request,trust){
    const traits=profile(trainer,clubId,index),decision=decide(trainer,traits,request,trust);
    const roster=Array.isArray(trainer.pokemon)?trainer.pokemon:[];
    const seed=String(period)+':'+identifier(trainer,clubId,index);
    // Trainers allocate a limited three-pokemon session, not direct 6-pokemon manager upgrades.
    const candidates=roster.map((mon,i)=>({mon,i,ca:number(mon?.ca??mon?.power),pa:number(mon?.pa??mon?.potential)}))
      .filter(x=>x.ca!==null&&x.pa!==null&&x.ca<x.pa)
      .sort((a,b)=>{
        if(traits.style==='balanced')return (a.ca/a.pa)-(b.ca/b.pa)||a.i-b.i;
        if(traits.style==='physical'||traits.style==='special')return b.ca-a.ca||a.i-b.i;
        return hash(seed+':slot:'+a.i)-hash(seed+':slot:'+b.i)||a.i-b.i;
      }).slice(0,3);
    const changes=[];
    for(let n=0;n<candidates.length;n++){
      const slot=candidates[n],focus=decision.secondary&&n%2?decision.secondary:decision.focus;
      const outcome=trainMon(slot.mon,focus,trainer,seed+':'+slot.i);
      if(outcome)changes.push(outcome);
    }
    return {id:identifier(trainer,clubId,index),name:trainer.name||'트레이너',skill:teachingSkill(trainer),
      profile:{...traits},decision:decision.decision,focus:decision.focus,reason:decision.reason,
      offered:request?.focus||null,trained:candidates.length,changes};
  }
  function advance(game,playerId){
    const state=init(game),now=clock(game);
    if(state.lastClock===now)return null;
    const previous=state.lastClock;
    const reports=[];
    const clubs=Array.isArray(game.clubs)?game.clubs:Object.values(game.clubs||{});
    for(let clubIndex=0;clubIndex<clubs.length;clubIndex++){
      const club=clubs[clubIndex];
      if(!club)continue;
      const clubId=String(club.id??clubIndex),mine=clubId===String(playerId);
      const group=(club.trainers||[]).concat(club.reserveTrainers||[]);
      for(let i=0;i<group.length;i++){
        const trainer=group[i];if(!trainer)continue;
        const id=identifier(trainer,clubId,i);
        const request=mine&&state.advice[id]?.issuedAt===previous?state.advice[id]:null;
        const trust=state.trust[id]??50;
        const outcome=trainTrainer(trainer,clubId,i,now,request,trust);
        if(mine){
          reports.push(outcome);
          if(request){
            state.trust[id]=clamp(trust+(outcome.decision==='수용'?2:outcome.decision==='절충'?1:-2),15,85);
            delete state.advice[id];
          }
        }
      }
    }
    state.lastClock=now;
    const report={clock:now,previous,trainers:reports,
      growth:reports.reduce((sum,t)=>sum+t.changes.reduce((a,c)=>a+c.to-c.from,0),0),
      accepted:reports.filter(t=>t.decision==='수용').length,
      compromised:reports.filter(t=>t.decision==='절충').length,
      refused:reports.filter(t=>t.decision==='거부').length};
    state.reports.unshift(report);
    state.reports.length=Math.min(state.reports.length,10);
    return report;
  }
  function observe(game,playerId){
    const state=init(game),now=clock(game);
    return state.lastClock===now?null:advance(game,playerId);
  }
  window.TrainerAutonomy={FOCI,STATS,gpBudget,init,profile,teachingSkill,potentialSkill,recommend,decide,advance,observe,trainMon,trainTrainer};
  if(typeof document==='undefined')return;
  const css=document.createElement('style');
  css.textContent=[
    '.at-panel{margin:14px 0;padding:16px;background:#172b3d;border:1px solid #496a80;border-radius:9px;color:#e5eff7}',
    '.at-head{display:flex;align-items:center;justify-content:space-between;gap:10px;flex-wrap:wrap}.at-head strong{font-size:16px}.at-note{font-size:12px;color:#b6c8d5;line-height:1.6;margin:6px 0}',
    '.at-panel button,.at-dialog button{padding:9px 14px;border:1px solid #55788c;border-radius:5px;background:#27516a;color:#eaf4f9;cursor:pointer;font:inherit}',
    '.at-mask{position:fixed;inset:0;z-index:2700;background:#07111bdf;display:grid;place-items:center;padding:15px;font:14px "Malgun Gothic",sans-serif;color:#e7f0f6}',
    '.at-dialog{position:relative;width:min(960px,100%);max-height:93vh;overflow:auto;background:#132438;border:1px solid #4a6b83;border-radius:10px;padding:23px;box-shadow:0 24px 65px #000a}',
    '.at-dialog h2{margin:0 0 7px;font-size:24px}.at-dialog h3{font-size:16px;margin:0 0 10px}.at-close{position:absolute;top:14px;right:14px}',
    '.at-card-grid{display:grid;grid-template-columns:repeat(2,minmax(0,1fr));gap:12px}',
    '.at-card{background:#1c344b;border:1px solid #47637b;border-radius:8px;padding:14px;min-width:0}',
    '.at-card h3{margin:0 0 6px}.at-meta{color:#b5c7d6;font-size:12px;line-height:1.65}',
    '.at-row{display:flex;align-items:center;gap:8px;flex-wrap:wrap;margin-top:10px}.at-row select{flex:1;min-width:150px;max-width:280px;background:#112537;color:#eaf4f9;border:1px solid #658093;border-radius:5px;padding:9px}',
    '.at-report{margin:15px 0;background:#0e2031;border:1px solid #3e5e75;border-radius:8px;padding:14px}.at-report ul{padding-left:20px;margin:7px 0}.at-report li{margin:6px 0;line-height:1.5}',
    '.at-action{margin-top:10px;color:#bcd6e6;font-size:12px}.at-subtle{font-size:12px;color:#a8becd}',
    '@media(max-width:650px){.at-dialog{padding:16px}.at-card-grid{grid-template-columns:1fr}.at-dialog h2{font-size:20px}}'
  ].join('');
  document.head.appendChild(css);
  const oldRenderOffice=renderOffice;
  let showing=false,feedback='';
  function own(){
    try{return typeof myClub==='function'?myClub():null;}catch{return null;}
  }
  function ensureAdvance(){
    if(typeof game==='undefined'||!game)return;
    const club=own();if(!club)return;
    const result=observe(game,club.id);
    if(result&&typeof persist==='function')persist();
  }
  function lastReport(){
    return game?.trainerAI?.reports?.[0]||null;
  }
  function renderPanel(){
    const panel=document.getElementById('dashpanel');
    if(!panel||!own())return;
    const report=lastReport(),element=document.createElement('div');element.className='at-panel';
    element.innerHTML='<div class="at-head"><strong>트레이너 AI 육성 본부</strong><button type="button" class="at-open">훈련 보고서 · 감독 권고</button></div>'+
      '<p class="at-note">훈련 대상·성장 방향은 트레이너가 결정합니다. 단장의 의견은 수용·절충·거절될 수 있습니다.</p>'+
      '<div class="at-subtle">'+(report?'최근 '+safe(report.clock)+' · CA 성장 +'+report.growth+' · 권고 수용 '+report.accepted+' / 절충 '+report.compromised+' / 거부 '+report.refused:'이번 주 첫 훈련을 준비 중입니다.')+'</div>';
    element.querySelector('.at-open').onclick=()=>{showing=true;showDialog();};
    panel.appendChild(element);
  }
  function showDialog(){
    const club=own();if(!club)return;
    let mask=document.getElementById('at-overlay');
    if(!mask){mask=document.createElement('div');mask.id='at-overlay';mask.className='at-mask';document.body.appendChild(mask);}
    const ai=init(game),report=lastReport();
    const rows=(club.trainers||[]).concat(club.reserveTrainers||[]).filter(Boolean).map((trainer,index)=>{
      const id=identifier(trainer,club.id,index),traits=profile(trainer,club.id,index);
      const prev=report?.trainers.find(row=>row.id===id);
      const hasAdvice=ai.issued[id]===clock(game);
      const style=FOCI[traits.style]?.label||'균형 육성';
      const trust=ai.trust[id]??50;
      const latest=prev?(prev.decision==='자율'?'자율 훈련':prev.decision+' · '+(FOCI[prev.focus]?.label||''))+' / '+prev.changes.length+'마리 성장':'주간 보고 대기';
      return '<article class="at-card"><h3>'+safe(trainer.name)+'</h3>'+
        '<div class="at-meta">훈련 지도 '+teachingSkill(trainer)+'/20 · 잠재력 개발 '+potentialSkill(trainer)+'/20'+
        '<br>훈련 철학 '+safe(style)+' · 개방성 '+traits.openness+'/20 · 소신 '+traits.conviction+'/20'+
        '<br>감독 신뢰 '+trust+'/100 · 최근 결과 '+safe(latest)+'</div>'+
        '<div class="at-row"><select aria-label="'+safe(trainer.name)+' 훈련 권고" data-at-focus="'+index+'" '+(hasAdvice?'disabled':'')+'>'+
        Object.entries(FOCI).map(([focus,data])=>'<option value="'+focus+'">'+safe(data.label)+'</option>').join('')+'</select>'+
        '<button data-at-send="'+index+'" '+(hasAdvice?'disabled':'')+'>'+(hasAdvice?'이번 주 전달 완료':'권고 전달')+'</button></div>'+
        (hasAdvice?'<div class="at-action">전달 방침: '+safe(FOCI[ai.advice[id]?.focus]?.label||'확인 완료')+'</div>':'')+
        (prev?'<div class="at-action">'+safe(prev.reason)+'</div>':'')+
        '</article>';
    }).join('');
    const reportHTML=report?'<section class="at-report"><h3>주간 성장 보고 · '+safe(report.clock)+'</h3>'+
      '<p class="at-note">CA 증가 합계 +'+report.growth+' / 권고 수용 '+report.accepted+' · 절충 '+report.compromised+' · 거부 '+report.refused+'</p>'+
      '<ul>'+report.trainers.map(trainer=>'<li><b>'+safe(trainer.name)+'</b> — '+safe(trainer.decision)+' ('+safe(FOCI[trainer.focus]?.label||'자율')+')'+
      (trainer.changes.length?'<br>'+trainer.changes.map(x=>safe(x.name)+' CA '+x.from+'→'+x.to+' ['+safe(x.changes.join(', '))+']').join(' · '):' · 능력치 상승 없음')+'</li>').join('')+'</ul></section>':
      '<section class="at-report"><h3>주간 성장 보고</h3><p class="at-note">첫 주차가 지나면 트레이너의 실제 훈련 성과가 기록됩니다.</p></section>';
    mask.innerHTML='<div class="at-dialog" role="dialog" aria-modal="true" aria-labelledby="at-heading">'+
      '<button class="at-close" type="button" aria-label="닫기">닫기</button><h2 id="at-heading">자율 훈련 · 감독 권고</h2>'+
      '<p class="at-note">감독은 방향을 제시할 뿐, 기술·훈련 대상과 GP 배분은 트레이너 AI가 결정합니다. 권고는 트레이너별 주 1회만 가능하며 다음 훈련에서 판단됩니다.</p>'+
      (feedback?'<p class="at-action" role="status">'+safe(feedback)+'</p>':'')+
      reportHTML+'<div class="at-card-grid">'+rows+'</div></div>';
    mask.querySelector('.at-close').onclick=()=>{showing=false;mask.remove();};
    mask.onclick=event=>{if(event.target===mask){showing=false;mask.remove();}};
    mask.querySelectorAll('[data-at-send]').forEach(button=>button.onclick=()=>{
      const i=Number(button.dataset.atSend),trainer=(club.trainers||[]).concat(club.reserveTrainers||[])[i];
      const focus=mask.querySelector('[data-at-focus="'+i+'"]')?.value;
      const result=recommend(game,trainer,club.id,i,focus);
      feedback=result.message;
      if(result.ok&&typeof persist==='function')persist();
      showDialog();
    });
  }
  renderOffice=function(){
    try{ensureAdvance();}catch(error){console.warn('트레이너 훈련 정산 문제:',error);}
    oldRenderOffice();
    try{renderPanel();if(showing&&document.getElementById('at-overlay'))showDialog();}catch(error){console.warn('트레이너 훈련 화면 문제:',error);}
  };
  window.TrainerAutonomy.showDialog=()=>{showing=true;showDialog();};
})();


/* AI move research and relationship */
(function autonomousMoveResearch(){
  if(window.TrainerMoveAI||!window.TrainerAutonomy)return;
  const training=window.TrainerAutonomy;
  const plays={
    balanced:'균형·타입 대응',offense:'공격 압박',control:'상태이상·견제',
    endurance:'회복·장기전',tempo:'속공·선공'
  };
  const keys=Object.keys(plays);
  const clamp=(v,a,b)=>Math.max(a,Math.min(b,v));
  const hash=text=>{let h=2166136261;for(const ch of String(text))h=Math.imul(h^ch.charCodeAt(0),16777619);return h>>>0;};
  const ident=(t,c,i)=>String(t.uid!=null?'trainer:'+t.uid:'club:'+c+':'+String(t.id??i));
  const week=()=>String(game?.season??1)+':'+String(game?.week??game?.round??0);
  const safe=value=>escapeHTML(String(value??''));
  let pending=null,visible=false,feedback='';
  const club=()=>{try{return myClub();}catch{return null;}};
  function state(){
    const a=training.init(game);
    a.moveAdvice ||= {};
    a.moveIssued ||= {};
    a.moveReports ||= [];
    a.moveAttempts ||= {};
    a.moveTrustLog ||= [];
    return a;
  }
  function tech(t){
    for(const k of ['moveTraining','technical','techniqueTeaching','trainingSkill','tactics','coaching','training']){
      const value=Number(t?.[k]??t?.skills?.[k]);
      if(Number.isFinite(value)&&value>0)return clamp(Math.round(value>20?value/5:value),1,20);
    }
    return 10;
  }
  function play(t,c,i){
    const p=training.profile(t,c,i);
    if(plays[p.preferredPlay])return p.preferredPlay;
    const old=t.preferredPlays||t.playStyle||t.preferredPlay||'';
    const text=Array.isArray(old)?old.join(' '):String(old);
    const tactics=Number(t.tactics),switching=Number(t.switching);
    const learned=/상태이상|견제|적극.*교체/.test(text)?'control':
      /회복|장기전|에이스 보존/.test(text)?'endurance':
      /속공|선공|우선도/.test(text)?'tempo':
      /공격|강화기/.test(text)?'offense':/균형/.test(text)?'balanced':
      Number.isFinite(tactics)&&Number.isFinite(switching)&&switching-tactics>=4?'control':
      Number.isFinite(tactics)&&Number.isFinite(switching)&&tactics-switching>=4?'offense':
      keys[hash(ident(t,c,i)+':play')%keys.length];
    p.preferredPlay=learned;return learned;
  }
  function judgement(t,c,i,offer,trust){
    const p=training.profile(t,c,i),own=play(t,c,i);
    if(!offer)return {result:'자율',focus:own,reason:'감독의 특별한 권고 없이 본인의 선플을 따름'};
    const same=own===offer.focus,related=own==='balanced'||offer.focus==='balanced';
    const score=p.openness*1.6+trust*.20+tech(t)*.25-p.conviction+(same?20:related?6:-8);
    if(score>=34)return {result:'수용',focus:offer.focus,reason:same?'자신의 선플과 감독 방침이 일치':'감독 신뢰와 기술 지도 방향을 긍정적으로 평가'};
    if(score>=22)return {result:'절충',focus:own,reason:'감독 의견을 참고하지만 개인 선플을 우선',alternative:offer.focus};
    return {result:'거부',focus:own,reason:'감독 제안보다 개인 전술 철학을 중시'};
  }
  function recommend(t,c,i,focus){
    if(!plays[focus])return {ok:false,message:'기술 운영 방향을 선택해 주세요.'};
    const s=state(),id=ident(t,c,i),now=week();
    if(s.moveIssued[id]===now)return {ok:false,message:'이번 주 권고는 이미 전달했습니다.'};
    s.moveIssued[id]=now;s.moveAdvice[id]={focus,issuedAt:now};
    return {ok:true,message:'전달 완료. 다음 주 기술 연구에서 AI가 수용·절충·거부를 결정합니다.'};
  }
  function roster(){
    const mine=club();if(!mine)return [];
    const s=state(),clubs=Array.isArray(game.clubs)?game.clubs:Object.values(game.clubs||{});
    return clubs.flatMap((c,ci)=>{
      if(!c)return [];
      const cid=String(c.id??ci),isMine=cid===String(mine.id);
      return (c.trainers||[]).concat(c.reserveTrainers||[]).flatMap((t,i)=>{
        if(!t)return [];
        const id=ident(t,cid,i),offer=isMine&&s.moveAdvice[id]?.issuedAt===s.movePriorWeek?s.moveAdvice[id]:null;
        const trust=s.trust[id]??50,choice=judgement(t,cid,i,offer,trust);
        const pokemon=(t.pokemon||[]).slice(0,6).map(mon=>({name:mon.name||mon.species,species:mon.species,
          moves:Array.isArray(mon.moves)?[...mon.moves]:undefined}));
        return [{input:{key:cid+':'+id,focus:choice.focus,skill:tech(t),pokemon},
          context:{trainer:t,club:cid,index:i,id,mine:isMine,choice,offer,trust,
            snapshots:(t.pokemon||[]).slice(0,6).map(mon=>({obj:mon,name:mon.name||mon.species,moves:JSON.stringify(mon.moves??null)}))}}];
      });
    }).slice(0,240);
  }
  function integrate(payload,rows,current){
    if(payload.period!==current||week()!==current)return false;
    const s=state(),contexts=new Map(rows.map(x=>[x.input.key,x.context]));
    const report={week:current,initialised:0,learned:0,accepted:0,compromised:0,refused:0,trainers:[]};
    for(const entry of payload.results||[]){
      const ctx=contexts.get(entry.key);if(!ctx)continue;
      const validSlots=new Set();
      for(const item of entry.updates||[]){
        const slot=Number(item.slot),snapshot=ctx.snapshots[slot],mon=ctx.trainer.pokemon?.[slot];
        if(!snapshot||!mon||mon!==snapshot.obj||(mon.name||mon.species)!==snapshot.name||
           JSON.stringify(mon.moves??null)!==snapshot.moves)continue;
        if(!Array.isArray(item.moves)||!item.moves.length||item.moves.length>4||
          !item.moves.every(m=>typeof m==='string'&&/^[a-z0-9]+$/.test(m)))continue;
        mon.moves=[...item.moves];validSlots.add(slot);
        if(item.kind==='initial')report.initialised++;
      }
      const changes=(entry.changes||[]).filter(c=>validSlots.has(c.slot));
      report.learned+=changes.length;
      if(!ctx.mine)continue;
      report.trainers.push({id:ctx.id,name:ctx.trainer.name,decision:ctx.choice.result,
        focus:ctx.choice.focus,reason:ctx.choice.reason,offer:ctx.offer?.focus||null,
        preferred:play(ctx.trainer,ctx.club,ctx.index),changes});
      if(ctx.offer){
        const delta=ctx.choice.result==='수용'?3:ctx.choice.result==='절충'?1:-2;
        s.trust[ctx.id]=clamp(ctx.trust+delta,15,85);
        report[ctx.choice.result==='수용'?'accepted':ctx.choice.result==='절충'?'compromised':'refused']++;
        s.moveTrustLog.unshift({week:current,name:ctx.trainer.name,decision:ctx.choice.result,reason:ctx.choice.reason,trust:s.trust[ctx.id]});
        delete s.moveAdvice[ctx.id];
      }
    }
    s.moveTrustLog.length=Math.min(30,s.moveTrustLog.length);
    s.moveReports.unshift(report);s.moveReports.length=Math.min(s.moveReports.length,10);
    s.movesProcessedWeek=current;s.moveError=null;
    if(typeof persist==='function')persist();
    return true;
  }
  function queue(){
    if(!game||!club())return;
    const s=state(),current=week();
    if(s.movesProcessedWeek===current||pending?.week===current||(s.moveAttempts[current]||0)>=2)return;
    const data=roster();
    if(!data.length)return;
    s.moveAttempts[current]=(s.moveAttempts[current]||0)+1;
    const target=game;pending={week:current};
    fetch('/api/trainer-moves',{method:'POST',headers:{'Content-Type':'application/json'},
      body:JSON.stringify({period:current,trainers:data.map(x=>x.input)})})
      .then(async r=>{
        const result=await r.json();
        if(!r.ok)throw Error(result.error||'기술 연구 요청 실패');
        if(game!==target||week()!==current||pending?.week!==current)return;
        if(integrate(result,data,current)){
          if(typeof renderOffice==='function')renderOffice();
          if(visible)openDialog();
        }
      })
      .catch(err=>{if(game!==target)return;s.moveError=String(err.message||err);if(visible)openDialog();})
      .finally(()=>{if(pending?.week===current)pending=null;});
  }
  function reportView(r){
    if(!r)return '<p class="am-small">기술 연구를 정산하면 결과가 표시됩니다.</p>';
    return '<p class="am-small">주차 '+safe(r.week)+' · 기술 편성 '+r.initialised+
      '마리 · 새 기술 '+r.learned+'건 · 권고 수용 '+r.accepted+' / 절충 '+r.compromised+' / 거부 '+r.refused+'</p>'+
      '<div class="am-results">'+r.trainers.map(t=>'<div class="am-result"><b>'+safe(t.name)+'</b> · '+safe(t.decision)+
      ' · '+safe(plays[t.focus]||t.focus)+'<p class="am-small">'+safe(t.reason)+'</p>'+
      (t.changes.length?t.changes.map(x=>'<p class="am-changed">'+safe(x.name)+' : '+
         safe(x.forgotten||'새 슬롯')+' → '+safe(x.learned)+' <small>('+safe(x.reason)+')</small></p>').join(''):
         '<p class="am-small">이번 주 기술 변경 없음</p>')+'</div>').join('')+'</div>';
  }
  function openDialog(){
    const c=club();if(!c)return;
    let root=document.getElementById('am-root');
    if(!root){root=document.createElement('section');root.id='am-root';root.className='am-shade';document.body.append(root);}
    const s=state(),trainers=(c.trainers||[]).concat(c.reserveTrainers||[]);
    const list=trainers.map((t,i)=>{
      if(!t)return '';
      const traits=training.profile(t,c.id,i),p=play(t,c.id,i),id=ident(t,c.id,i);
      const sent=s.moveIssued[id]===week();
      return '<article class="am-card"><h3>'+safe(t.name||'트레이너')+'</h3>'+
        '<p class="am-small">선플: '+safe(plays[p])+' · 기술 지도 '+tech(t)+'/20 · 개방성 '+traits.openness+
          '/20 · 소신 '+traits.conviction+'/20 · 감독 신뢰 '+(s.trust[id]??50)+'/100</p>'+
        '<div class="am-actions"><select data-move-adv="'+i+'" aria-label="'+safe(t.name)+' 기술 권고" '+(sent?'disabled':'')+'>'+
          keys.map(k=>'<option value="'+k+'">'+safe(plays[k])+'</option>').join('')+'</select>'+
          '<button type="button" data-move-send="'+i+'" '+(sent?'disabled':'')+'>'+(sent?'전달 완료':'권고 전달')+'</button></div>'+
        (sent?'<p class="am-small">전달 방침: '+safe(plays[s.moveAdvice[id]?.focus]||'처리 대기')+'</p>':'')+
        '</article>';
    }).join('');
    root.innerHTML='<div class="am-dialog" role="dialog" aria-modal="true" aria-labelledby="am-title">'+
      '<button type="button" class="am-close">닫기</button><h2 id="am-title">트레이너 선플 · 기술 연구</h2>'+
      '<p class="am-small">트레이너가 본인의 전술 철학과 감독 신뢰를 고려해 기술 권고 수용 여부와 실제 학습 기술을 결정합니다.</p>'+
      (feedback?'<p role="status" class="am-msg">'+safe(feedback)+'</p>':'')+
      (s.moveError?'<p class="am-error">정산 지연: '+safe(s.moveError)+'</p>':'')+
      (pending?.week===week()?'<p class="am-small">기술 연구 정산 중…</p>':'')+
      '<div class="am-report"><h3>주간 기술 연구 보고</h3>'+reportView(s.moveReports[0])+'</div>'+
      '<div class="am-cards">'+list+'</div></div>';
    root.querySelector('.am-close').onclick=()=>{visible=false;root.remove();};
    root.onclick=e=>{if(e.target===root){visible=false;root.remove();}};
    root.querySelectorAll('[data-move-send]').forEach(btn=>btn.onclick=()=>{
      const i=Number(btn.dataset.moveSend),t=trainers[i];
      const focus=root.querySelector('[data-move-adv="'+i+'"]')?.value;
      const result=recommend(t,c.id,i,focus);
      feedback=result.message;
      if(result.ok&&typeof persist==='function')persist();
      openDialog();
    });
  }
  window.TrainerMoveAI={plays,tech,play,judgement,recommend,state,integrate,queue};
  if(typeof document==='undefined')return;
  const css=document.createElement('style');
  css.textContent=[
    '.am-open{margin-left:8px;background:#1e6b76!important}',
    '.am-shade{position:fixed;inset:0;z-index:2750;background:#06101bdd;display:grid;place-items:center;padding:12px;color:#eaf3f8;font:14px "Malgun Gothic",sans-serif}',
    '.am-dialog{position:relative;width:min(960px,100%);max-height:94vh;overflow:auto;background:#13283b;border:1px solid #55778d;border-radius:10px;padding:24px}',
    '.am-dialog h2{font-size:21px;margin:0 0 9px}.am-dialog h3{font-size:15px;margin:0 0 8px}.am-small{color:#b4c8d6;font-size:12px;line-height:1.7;margin:5px 0}',
    '.am-close{position:absolute;right:12px;top:12px}.am-dialog button,.am-dialog select{padding:9px 12px;border:1px solid #62879e;border-radius:5px;background:#24485f;color:white;font:inherit}',
    '.am-dialog button{cursor:pointer}.am-cards,.am-results{display:grid;grid-template-columns:repeat(2,minmax(0,1fr));gap:11px}',
    '.am-card,.am-report{border:1px solid #3f6077;border-radius:8px;background:#1a344a;padding:13px}.am-report{margin:15px 0;background:#102335}',
    '.am-actions{display:flex;gap:8px;flex-wrap:wrap;margin-top:9px}.am-actions select{flex:1;min-width:130px}',
    '.am-result{border-top:1px solid #426078;padding:8px 0}.am-changed,.am-msg{color:#a2e4bc;font-size:12px}.am-error{color:#ffb8a0;font-size:12px}',
    '@media(max-width:650px){.am-dialog{padding:16px}.am-cards,.am-results{grid-template-columns:1fr}.am-open{margin-left:0;margin-top:8px}}'
  ].join('');
  document.head.append(css);
  const previousRender=renderOffice;
  renderOffice=function(){
    previousRender();
    if(!game||!club())return;
    try{
      const s=state(),now=week();
      if(s.moveObservedWeek!==now){s.movePriorWeek=s.moveObservedWeek??null;s.moveObservedWeek=now;}
      queue();
      const panel=document.querySelector('#dashpanel .at-panel');
      if(panel&&!panel.querySelector('.am-open')){
        const button=document.createElement('button');button.type='button';button.className='am-open';
        button.textContent='선플 · 기술 연구 · 감독 신뢰';
        button.onclick=()=>{visible=true;openDialog();};
        panel.querySelector('.at-head')?.append(button);
        const last=s.moveReports[0],note=document.createElement('p');note.className='at-note';
        note.textContent=last?'기술 연구 '+last.week+' · 기술 편성 '+last.initialised+'마리 · 변경 '+last.learned+'건':
          '주간 기술 연구는 AI가 직접 처리하며, 감독은 방향만 권고할 수 있습니다.';
        panel.append(note);
      }
      if(visible&&document.getElementById('am-root'))openDialog();
    }catch(err){console.warn('트레이너 자율 기술 연구:',err);}
  };
  window.TrainerMoveAI.openDialog=()=>{visible=true;openDialog();};
})();


/* Trainer career and relationship — persistent experience from played matches. */
(function trainerCareerAndCoachRelations(){
  if(window.TrainerCareer)return;
  const FIELDS={
    moveJudgment:{label:'기술 판단',fallback:'tactics'},
    switchJudgment:{label:'교체 판단',fallback:'switching'},
    battleAnalysis:{label:'전황 분석',fallback:'tactics'},
    resourceManagement:{label:'전력 관리',fallback:'switching'}
  };
  const FEEDBACK={
    praise:'경기 내용 칭찬',analysis:'전술 분석 제안',
    autonomy:'자율 운영 존중',challenge:'개선 요구'
  };
  const clamp=(value,min,max)=>Math.max(min,Math.min(max,value));
  const val=(value,fallback=10)=>{
    const n=Number(value);return Number.isFinite(n)&&value!==null&&value!==''?
      clamp(Math.round(n),1,20):fallback;
  };
  const esc=value=>String(value??'').replace(/&/g,'&amp;').replace(/</g,'&lt;')
    .replace(/>/g,'&gt;').replace(/"/g,'&quot;').replace(/'/g,'&#39;');
  const trainerId=(trainer,clubId,index)=>
    String(trainer.uid!=null?'trainer:'+trainer.uid:'club:'+clubId+':'+String(trainer.id??index));
  const threshold=skill=>20+skill*5;
  const HABITS=Object.freeze({
    kill:{label:'킬각 포착',description:'직접 공격으로 상대를 마무리한 성공 경험',threshold:55,matches:3},
    switch:{label:'적극적인 교체',description:'불리한 상성을 벗어나는 교체 성공 경험',threshold:55,matches:3},
    matchup:{label:'상성 교체 전문가',description:'방어·공격 상성이 좋은 교체 대상을 선택한 성공 경험',threshold:55,matches:3},
    preserve:{label:'에이스 보존',description:'연승전에서 회복·위험 회피에 성공한 경험',threshold:50,matches:3},
    pp:{label:'PP 관리자',description:'대체 기술로 승리하며 희소 PP를 보존한 경험',threshold:55,matches:3},
    status:{label:'상태이상 전문가',description:'상대에게 실제 상태이상을 적용한 승리 경험',threshold:55,matches:3},
    analysis:{label:'전황 분석가',description:'후보 기술을 분석해 승리한 경험',threshold:60,matches:4}
  });
  function skill(trainer,field){
    return val(trainer?.[field],val(trainer?.[FIELDS[field]?.fallback]));
  }
  function state(game){
    const existing=game.trainerAI||(game.trainerAI={
      version:1,lastClock:String(game.season??1)+':'+String(game.week??0),
      advice:{},issued:{},trust:{},reports:[]
    });
    existing.trust ||= {};
    existing.careerApplied ||= {};
    existing.careerReports ||= [];
    existing.careerFeedback ||= [];
    return existing;
  }
  function getCareer(trainer){
    if(trainer.aiCareer?.version===1)return trainer.aiCareer;
    const career={version:1,matches:0,duels:0,wins:0,losses:0,
      experience:Object.fromEntries(Object.keys(FIELDS).map(field=>[field,0])),
      observed:{switches:0,voluntary:0,analyses:0,preservation:0},
      quality:Object.fromEntries(Object.keys(HABITS).map(k=>[k,{points:0,matches:0}])),
      events:[]};
    trainer.aiCareer=career;
    return career;
  }
  /** Check real Showdown logs, not a move's intended outcome or a name tag. */
  function actualBattleEvents(log,sideId){
    const foe=sideId==='p1'?'p2':'p1';
    let current=null,kill=0,status=0;
    for(const line of String(log||'').split('\n')){
      const parts=line.split('|'),type=parts[1]||'';
      if(type==='move'){
        current={own:(parts[2]||'').startsWith(sideId),indirect:false,damaged:false};
      }else if(type==='-damage'&&current){
        if((parts[2]||'').startsWith(foe)){
          current.damaged=true;
          current.indirect=parts.some(v=>v.startsWith('[from]'));
        }
      }else if(type==='-status'&&current?.own&&(parts[2]||'').startsWith(foe)){
        if(!parts.some(v=>v.startsWith('[from]')))status++;
      }else if(type==='faint'&&current?.own&&(parts[2]||'').startsWith(foe)){
        if(current.damaged&&!current.indirect)kill++;
        current=null;
      }else if((type==='upkeep'||type==='turn')&&current){
        current=null;
      }
    }
    return {kill,status};
  }
  function roundEvidence(round,side){
    const sideId=side==='home'?'p1':'p2';
    const ai=round.aiDecisions?.[sideId]||{};
    const won=(side==='home'&&round.winner==='A')||(side==='away'&&round.winner==='B');
    const lost=(side==='home'&&round.winner==='B')||(side==='away'&&round.winner==='A');
    const trace=Array.isArray(ai.trace)?ai.trace:[];
    // Judge observed action quality, not a raw "switch 10 times" counter.
    const qualifiedSwitch=trace.filter(x=>x.kind==='switch'&&x.quality?.switch===true).length;
    const qualifiedMatchup=trace.filter(x=>x.kind==='switch'&&x.quality?.matchup===true).length;
    const qualifiedPP=trace.filter(x=>x.kind==='move'&&x.quality?.pp===true).length;
    const observed=actualBattleEvents(round.log,sideId);
    // A trainer can make multiple informed choices and win without a large
    // numerical gap between ranked moves. Reward observed useful analysis, not
    // an arbitrary score-gap threshold or simulations on a lost duel.
    const compared=trace.filter(x=>x.kind==='move'&&
      String(x.reason||'').includes('전황 분석')&&
      (x.quality?.analysis===true||Number(x.advantage)>0)).length;
    const qualifiedAnalysis=Math.floor(compared/2);
    const preservedByMove=trace.filter(x=>x.kind==='move'&&x.quality?.preserve===true).length;
    const heals=String(round.log||'').split('\n').filter(line=>line.startsWith('|-heal|'+sideId)).length;
    const final=round.final?.[sideId]||[];
    const survived=Array.isArray(final)&&final.some(mon=>Number(mon.hp)>0);
    const avoidedThreat=survived?trace.filter(x=>x.kind==='switch'&&x.quality?.preserve===true).length:0;
    // A good action is only reinforced when that trainer also won this duel.
    // Executing a recommendation repeatedly without success cannot build a trait.
    const goalQuality={
      kill:won?Math.min(3,observed.kill):0,
      switch:won?Math.min(2,qualifiedSwitch):0,
      matchup:won?Math.min(2,qualifiedMatchup):0,
      preserve:won?Math.min(2,Math.min(preservedByMove,heals)+Math.min(1,avoidedThreat)):0,
      pp:won?Math.min(2,qualifiedPP):0,
      status:won?Math.min(2,observed.status):0,
      analysis:won?Math.min(3,qualifiedAnalysis):0
    };
    return {duels:1,wins:Number(won),losses:Number(lost),
      moves:Math.min(300,Math.max(0,Number(ai.moves)||0)),
      switches:Math.min(100,Math.max(0,Number(ai.switches)||0)),
      voluntary:Math.min(100,Math.max(0,Number(ai.voluntarySwitches)||0)),
      analyses:Math.min(300,Math.max(0,Number(ai.rollouts)||0)),
      preservation:trace.filter(item=>String(item.reason||'').includes('연승 전력 관리')).length,
      goalKill:goalQuality.kill,goalSwitch:goalQuality.switch,goalMatchup:goalQuality.matchup,
      goalPreserve:goalQuality.preserve,goalPp:goalQuality.pp,goalStatus:goalQuality.status,
      goalAnalysis:goalQuality.analysis};
  }
  function applyEvidence(trainer,evidence,key,side,slot,coaching){
    const career=getCareer(trainer);
    // No direct stat gifts: growth comes from repeated, actually recorded decisions.
    const earned={
      moveJudgment:Math.min(9,Math.ceil(evidence.moves/3))+evidence.wins,
      switchJudgment:Math.min(9,Math.ceil(evidence.switches*1.4))+Math.min(4,evidence.voluntary),
      battleAnalysis:Math.min(10,Math.ceil(evidence.analyses/3))+Math.min(3,evidence.duels),
      resourceManagement:Math.min(9,evidence.wins*2+Math.ceil(evidence.preservation/3))
    };
    career.matches++;
    career.duels+=evidence.duels;
    career.wins+=evidence.wins;
    career.losses+=evidence.losses;
    career.observed.switches+=evidence.switches;
    career.observed.voluntary+=evidence.voluntary;
    career.observed.analyses+=evidence.analyses;
    career.observed.preservation+=evidence.preservation;
    const levels=[];
    for(const field of Object.keys(FIELDS)){
      // Initialise previously missing specialist attributes from existing overall ability.
      if(!Number.isFinite(Number(trainer[field])))trainer[field]=skill(trainer,field);
      let score=skill(trainer,field),xp=Math.max(0,Number(career.experience[field])||0)+earned[field];
      while(score<20&&xp>=threshold(score)){
        xp-=threshold(score);
        levels.push({field,label:FIELDS[field].label,from:score,to:score+1});
        score++;
      }
      trainer[field]=score;
      career.experience[field]=score===20?Math.min(xp,threshold(20)):xp;
    }
    const ai=trainer.autonomyAI ||= {};
    const traits=ai.playTraits ||= [];
    const learned=[];
    const behaviorScores=ai.habitScores ||= {};
    const successfulMatches=ai.habitSuccessfulMatches ||= {};
    career.quality ||= {};
    const advice=coaching?.behaviorAdvice||null;
    const response=coaching?.behaviorResponse||'자율';
    const qualified={kill:evidence.goalKill||0,switch:evidence.goalSwitch||0,
      matchup:evidence.goalMatchup||0,preserve:evidence.goalPreserve||0,
      pp:evidence.goalPp||0,status:evidence.goalStatus||0,analysis:evidence.goalAnalysis||0};
    const progress={};
    for(const [kind,config] of Object.entries(HABITS)){
      const quality=career.quality[kind] ||= {points:0,matches:0};
      const points=Math.min(5,Math.max(0,qualified[kind]));
      const coached=advice===kind&&['수용','절충'].includes(response);
      const strength=coached?(response==='수용'?1.65:1.25):1;
      // Real positive results make the trainer more likely to choose the same
      // behavior *without* future instructions. Advice is only a multiplier.
      const reinforced=points>0?Math.min(28,Math.round(points*5*strength)):0;
      const before=clamp(Number(behaviorScores[kind])||0,0,100);
      const after=clamp(before+reinforced,0,100);
      behaviorScores[kind]=after;
      if(points>0){
        quality.points=Number((quality.points+points).toFixed(2));
        quality.matches++;
        successfulMatches[kind]=(Number(successfulMatches[kind])||0)+1;
      }
      progress[kind]={before,after,gained:reinforced,successfulMatches:successfulMatches[kind]||0,
        positiveActions:points,coached};
      if(!traits.includes(config.label)&&traits.length<3&&
         after>=config.threshold&&successfulMatches[kind]>=config.matches){
        traits.push(config.label);
        learned.push(config.label);
      }
    }
    const event={key,side,slot,name:trainer.name||'트레이너',
      duels:evidence.duels,wins:evidence.wins,losses:evidence.losses,
      moves:evidence.moves,voluntary:evidence.voluntary,analyses:evidence.analyses,
      qualified,progress,advice:advice?{target:advice,response}:null,
      levels,learned,trainerId:String(trainer.id??'')};
    career.events.unshift(event);
    career.events.length=Math.min(career.events.length,18);
    return event;
  }
  function matchKey(p){
    return [p.season,p.round,p.home,p.away].map(String).join(':');
  }
  function applyMatch(game,p,playerClubId){
    if(!p?.result?.rounds?.length||!Array.isArray(p.order)||p.order.length!==5)return null;
    if(Number(game?.round)!==Number(p.round))throw new RangeError('경기 확정 이전에는 경험을 적용할 수 없습니다.');
    const s=state(game),key=matchKey(p);
    if(s.careerApplied[key])return null;
    const report={key,season:p.season,round:p.round,home:p.home,away:p.away,
      participants:[],levelUps:0,traits:0,feedbackCount:0};
    const sides=[
      {side:'home',clubId:p.home},
      {side:'away',clubId:p.away}
    ];
    for(const {side,clubId} of sides){
      const club=game.clubs?.[clubId];if(!club?.trainers)continue;
      const order=String(clubId)===String(playerClubId)?p.order:[0,1,2,3,4];
      const collected=new Map();
      for(const round of p.result.rounds){
        const slot=side==='home'?round.trainerA:round.trainerB;
        const index=order[slot],trainer=club.trainers[index];
        if(!Number.isInteger(index)||!trainer)continue;
        const evidence=roundEvidence(round,side);
        let total=collected.get(index);
        if(!total){
          total={slot,index,trainer,duels:0,wins:0,losses:0,moves:0,
            switches:0,voluntary:0,analyses:0,preservation:0,
          goalKill:0,goalSwitch:0,goalMatchup:0,goalPreserve:0,goalPp:0,
          goalStatus:0,goalAnalysis:0};
          collected.set(index,total);
        }
        for(const k of Object.keys(evidence))total[k]+=evidence[k];
      }
      for(const total of collected.values()){
        const snapshot=p.result.coaching?.[side]?.[total.slot];
        const event=applyEvidence(total.trainer,total,key,side,total.slot,snapshot);
        const entry={...event,clubId:String(clubId),index:total.index,
          id:trainerId(total.trainer,clubId,total.index),
          player:String(clubId)===String(playerClubId),feedback:null};
        report.participants.push(entry);
        report.levelUps+=event.levels.length;
        report.traits+=event.learned.length;
      }
    }
    // Keep a bounded idempotency ledger across saves/restarts.
    s.careerApplied[key]=true;
    const ledger=Object.keys(s.careerApplied);
    while(ledger.length>50)delete s.careerApplied[ledger.shift()];
    s.careerReports.unshift(report);
    s.careerReports.length=Math.min(s.careerReports.length,20);
    return report;
  }
  function offerFeedback(game,playerId,key,index,kind){
    if(!FEEDBACK[kind])return {ok:false,message:'면담 유형을 확인해 주세요.'};
    const s=state(game);
    const report=s.careerReports.find(entry=>entry.key===key);
    if(!report)return {ok:false,message:'해당 경기의 보고서를 찾을 수 없습니다.'};
    const entry=report.participants.find(row=>row.player&&String(row.clubId)===String(playerId)&&row.index===index);
    if(!entry)return {ok:false,message:'출전한 소속 트레이너만 면담할 수 있습니다.'};
    if(entry.feedback)return {ok:false,message:'이번 경기의 면담은 이미 마쳤습니다.'};
    const club=game.clubs?.[playerId],trainer=club?.trainers?.[index];
    if(!trainer||trainerId(trainer,playerId,index)!==entry.id)return {ok:false,message:'트레이너 소속이 변경되었습니다.'};
    const ai=trainer.autonomyAI||{};
    const openness=val(ai.openness),conviction=val(ai.conviction);
    const trust=Number(s.trust[entry.id]??50);
    const success=entry.wins>entry.losses;
    let response,delta,xp=0,reason;
    if(kind==='praise'){
      if(success||entry.duels>=2){
        response='긍정적';delta=openness>=15?2:1;
        reason='경기 기여를 인정받아 감독에 대한 신뢰가 높아짐';
      }else if(conviction>=16&&trust<45){
        response='회의적';delta=-1;reason='경기 내용이 좋지 않아 형식적인 칭찬으로 받아들임';
      }else{response='중립';delta=1;reason='결과와 별개로 격려의 취지를 받아들임';}
    }else if(kind==='analysis'){
      if(openness+trust/10-conviction/2>=13){
        response='수용';delta=2;xp=5;
        reason='감독의 분석을 참고해 다음 전술 판단에 활용하기로 결정';
      }else if(trust>=45){response='절충';delta=0;xp=2;reason='자신의 방식은 유지하되 일부 분석은 참고';}
      else{response='거부';delta=-2;reason='전술적 판단에 대한 이견으로 면담을 받아들이지 않음';}
    }else if(kind==='autonomy'){
      response=conviction>=12?'긍정적':'중립';delta=conviction>=12?2:1;
      reason='감독이 자신의 전술적 자율성을 존중한다고 인식';
    }else{
      if(success&&conviction>=12){response='반발';delta=-3;reason='경기에서 성과를 냈는데 부당한 질책이라고 판단';}
      else if(!success&&openness>=12&&trust>=45){
        response='수용';delta=1;xp=4;reason='실패 원인을 인정하고 기술 판단 개선을 약속';
      }else{response='반발';delta=-2;reason='일방적인 개선 요구에 동의하지 않음';}
    }
    const next=clamp(trust+delta,15,85);
    s.trust[entry.id]=next;
    const career=getCareer(trainer);
    if(xp)career.experience.battleAnalysis=Math.min(
      threshold(skill(trainer,'battleAnalysis'))*2,
      (career.experience.battleAnalysis||0)+xp
    );
    const feedback={kind,label:FEEDBACK[kind],response,reason,before:trust,after:next,xp};
    entry.feedback=feedback;
    report.feedbackCount++;
    s.careerFeedback.unshift({key,trainer:trainer.name,trainerId:entry.id,...feedback});
    s.careerFeedback.length=Math.min(s.careerFeedback.length,35);
    return {ok:true,message:trainer.name+' · '+reason,feedback};
  }

  window.TrainerCareer={FIELDS,FEEDBACK,HABITS,skill,threshold,state,getCareer,applyMatch,
    offerFeedback,roundEvidence,actualBattleEvents,trainerId};
  if(typeof document==='undefined')return;
  let visible=false,notice='';
  const getClub=()=>{try{return typeof myClub==='function'?myClub():null;}catch{return null;}};
  function show(){
    if(!game||!getClub())return;
    const club=getClub(),ai=state(game),latest=ai.careerReports[0];
    let overlay=document.getElementById('trainer-career-dialog');
    if(!overlay){
      overlay=document.createElement('div');
      overlay.id='trainer-career-dialog';overlay.className='tc-overlay';
      document.body.append(overlay);
    }
    const rows=(club.trainers||[]).concat(club.reserveTrainers||[]).map((trainer,index)=>{
      if(!trainer)return '';
      const id=trainerId(trainer,club.id,index);
      const career=trainer.aiCareer,traits=trainer.autonomyAI?.playTraits||[];
      const last=latest?.participants.find(e=>e.player&&String(e.clubId)===String(club.id)&&e.id===id);
      const numbers=Object.entries(FIELDS).map(([field,meta])=>{
        const current=skill(trainer,field);
        const progress=Number(career?.experience?.[field])||0;
        return '<div class="tc-stat"><span>'+esc(meta.label)+'</span><b>'+current+'/20</b>'+
          '<div class="tc-meter"><i style="width:'+Math.min(100,Math.round(progress/threshold(current)*100))+'%"></i></div></div>';
      }).join('');
      const feedback=last?.feedback;
      const habits=trainer.autonomyAI?.habitScores||{};
      const victories=trainer.autonomyAI?.habitSuccessfulMatches||{};
      const latestBehavior=last?.advice,learning=last?.progress;
      const habitCards='<div class="tc-development"><strong>경기 결과로 형성되는 플레이 성향</strong>'+
        '<p class="tc-muted">경기 전 감독 권고는 행동 시도에 영향을 주지만, 실제 성공한 플레이만 누적 학습됩니다.</p>'+
        Object.entries(HABITS).map(([kind,config])=>{
          const score=Math.min(100,Math.max(0,Number(habits[kind])||0));
          const acquired=traits.includes(config.label),recent=learning?.[kind];
          const highlight=latestBehavior?.target===kind;
          return '<div class="tc-habit-row"><div><b>'+esc(config.label)+'</b>'+
            '<small>'+(acquired?'선플 습득 완료': '성향 '+score+'/100 · 성공한 경기 '+(victories[kind]||0)+'회')+
            (highlight?' · 직전 미팅 '+esc(latestBehavior.response):'')+'</small></div>'+
            '<div class="tc-meter"><i style="width:'+score+'%"></i></div>'+
            (recent?.gained?'<small class="tc-gain">직전 경기 성공 경험 +'+recent.gained+'</small>':'')+
            '</div>';
        }).join('')+'</div>';
      const actions=last?feedback?
        '<p class="tc-response">면담 '+esc(feedback.label)+' · '+esc(feedback.response)+'<br>'+esc(feedback.reason)+'</p>':
        '<div class="tc-choices">'+Object.entries(FEEDBACK).map(([kind,label])=>
          '<button type="button" data-tc-feedback="'+index+'" data-tc-kind="'+kind+'">'+esc(label)+'</button>').join('')+'</div>':
        '<p class="tc-muted">최근 경기 출전 기록이 없어 면담 대상이 아닙니다.</p>';
      return '<article class="tc-trainer"><div class="tc-heading"><strong>'+esc(trainer.name||'트레이너')+'</strong>'+
        '<span>감독 신뢰 '+(ai.trust[id]??50)+'/100</span></div>'+
        '<p class="tc-muted">커리어 '+(career?.matches||0)+'경기 · '+(career?.duels||0)+'대결 · '+
          (career?.wins||0)+'승 / '+(career?.losses||0)+'패'+
          (traits.length?' · 습득 선플: '+traits.map(esc).join(', '):'')+'</p>'+
        '<div class="tc-stats">'+numbers+'</div>'+
        (last?'<p class="tc-muted">이번 경기 '+last.duels+'대결 · '+last.wins+'승 · 전황 분석 '+last.analyses+
          '회 · 자율 교체 '+last.voluntary+'회</p>'+
          (last.levels.length?'<p class="tc-gain">능력 성장: '+last.levels.map(x=>esc(x.label)+' '+x.from+'→'+x.to).join(', ')+'</p>':'')+
          (last.learned.length?'<p class="tc-gain">새 선플: '+last.learned.map(esc).join(', ')+'</p>':''):'')+
        habitCards+actions+'</article>';
    }).join('');
    overlay.innerHTML='<section class="tc-dialog" role="dialog" aria-modal="true" aria-labelledby="tc-title">'+
      '<button type="button" class="tc-close">닫기</button>'+
      '<h2 id="tc-title">트레이너 플레이 성향 · 감독 면담</h2>'+
      '<p class="tc-muted">경기에 실제로 출전한 트레이너만 경험을 얻습니다. 기술·교체·전황 분석·연승 전력 관리 경험이 다음 경기의 실력에 반영됩니다.</p>'+
      (notice?'<p class="tc-gain" role="status">'+esc(notice)+'</p>':'')+
      '<div class="tc-summary">'+(latest?('최근 '+esc(latest.season)+'시즌 '+esc(latest.round)+
        '라운드 · 능력 상승 '+latest.levelUps+'건 · 선플 습득 '+latest.traits+'건'):'경기 후 커리어 보고서가 생성됩니다.')+'</div>'+
      '<div class="tc-grid">'+rows+'</div></section>';
    overlay.querySelector('.tc-close').onclick=()=>{
      visible=false;overlay.remove();
    };
    overlay.onclick=event=>{
      if(event.target===overlay){visible=false;overlay.remove();}
    };
    overlay.querySelectorAll('[data-tc-feedback]').forEach(button=>button.onclick=()=>{
      const index=Number(button.dataset.tcFeedback);
      const answer=offerFeedback(game,club.id,latest?.key,index,button.dataset.tcKind);
      notice=answer.message;
      if(answer.ok&&typeof persist==='function')persist();
      show();
    });
    overlay.querySelector('.tc-close').focus({preventScroll:true});
  }
  const style=document.createElement('style');
  style.textContent=[
    '.tc-open{margin-left:8px;background:#29516a!important}',
    '.tc-overlay{position:fixed;inset:0;z-index:2900;background:#07111ce8;display:grid;place-items:center;padding:12px;color:#e9f1f8;font:14px "Malgun Gothic",sans-serif}',
    '.tc-dialog{position:relative;width:min(1020px,100%);max-height:94vh;overflow:auto;background:#13273b;border:1px solid #55758a;border-radius:12px;padding:24px}',
    '.tc-dialog h2{font-size:21px;margin:0 0 8px}.tc-close{position:absolute;right:12px;top:12px}',
    '.tc-dialog button{border:1px solid #5b7e94;border-radius:6px;padding:8px 11px;background:#274a63;color:#eef5fa;font:inherit;cursor:pointer}',
    '.tc-dialog button:focus-visible{outline:2px solid #75c8b8;outline-offset:2px}',
    '.tc-muted{font-size:12px;color:#aac0d0;line-height:1.7;margin:7px 0}',
    '.tc-grid{display:grid;grid-template-columns:repeat(2,minmax(0,1fr));gap:11px}',
    '.tc-trainer{background:#193349;border:1px solid #3c5970;border-radius:9px;padding:15px}',
    '.tc-heading{display:flex;justify-content:space-between;flex-wrap:wrap;gap:6px}.tc-heading span{color:#9ccfc1;font-size:12px}',
    '.tc-stats{display:grid;grid-template-columns:repeat(2,minmax(0,1fr));gap:8px;margin:12px 0}',
    '.tc-stat{display:grid;grid-template-columns:1fr auto;gap:4px;font-size:12px}.tc-stat b{font-size:12px}',
    '.tc-meter{grid-column:1/-1;height:5px;background:#334f62;border-radius:5px;overflow:hidden}',
    '.tc-meter i{display:block;background:#71c6ac;height:100%}',
    '.tc-summary{margin:12px 0 16px;background:#102135;border:1px solid #3d6178;padding:12px;border-radius:7px;font-size:13px}',
    '.tc-development{margin:12px 0;background:#102c3b;border:1px solid #3d6c73;padding:12px;border-radius:7px}',
    '.tc-development strong{font-size:13px;display:block;margin-bottom:7px}',
    '.tc-habit-row{margin:8px 0 12px}.tc-habit-row>div:first-child{display:flex;justify-content:space-between;gap:8px}',
    '.tc-habit-row small{font-size:11px;color:#adc8d2}.tc-habit-row .tc-meter{margin-top:6px;height:7px}',
    '.tc-choices{display:grid;grid-template-columns:repeat(2,minmax(0,1fr));gap:7px;margin-top:9px}',
    '.tc-gain{font-size:12px;color:#8fe0b9;line-height:1.6}.tc-response{color:#8fe0b9;font-size:12px;line-height:1.7}',
    '@media(max-width:680px){.tc-grid{grid-template-columns:1fr}.tc-dialog{padding:16px}.tc-dialog h2{font-size:19px}}'
  ].join('');
  document.head.append(style);
  const previousRender=renderOffice;
  renderOffice=function(){
    previousRender();
    const c=getClub(),panel=document.querySelector('#dashpanel .at-panel');
    if(!c||!panel||panel.querySelector('.tc-open'))return;
    const button=document.createElement('button');
    button.type='button';button.className='tc-open';
    button.textContent='트레이너 성장 · 경기 후 면담';
    button.onclick=()=>{visible=true;show();};
    panel.querySelector('.at-head')?.append(button);
    const recent=state(game).careerReports[0],p=document.createElement('p');
    p.className='at-note';
    p.textContent=recent?'최근 '+recent.season+'시즌 '+recent.round+'라운드 · 능력 상승 '+
      recent.levelUps+'건 · 선플 습득 '+recent.traits+'건':
      '경기 후 실전 경험에 따른 트레이너 성장 기록을 확인할 수 있습니다.';
    panel.append(p);
  };
  window.TrainerCareer.show=()=>{visible=true;show();};
})();


/* Trainer Market 2.0 — trait-aware scouting, bids and AI club recruitment. */
(function trainerMarketV2(){
  if(window.TrainerMarketV2)return;
  // Headless career tests load only this file's career IIFE, not the market page.
  if(typeof document==='undefined'||typeof transferMarketHTML!=='function')return;
  const clamp=(n,min,max)=>Math.min(max,Math.max(min,n));
  const value=(n,fallback=0)=>Number.isFinite(Number(n))?Number(n):fallback;
  const STYLE={
    balanced:{label:'균형 운영',keys:['analysis','matchup','kill']},
    attacking:{label:'공격 중심',keys:['kill','status','analysis']},
    defensive:{label:'안정적인 운영',keys:['preserve','matchup','switch']},
    relay:{label:'연승전 전력 관리',keys:['pp','preserve','analysis']},
    adaptive:{label:'상성·교체 중심',keys:['switch','matchup','status']}
  };
  const TRAITS={
    kill:'킬각 포착',switch:'적극적인 교체',matchup:'상성 교체 전문가',
    preserve:'에이스 보존',pp:'PP 관리자',status:'상태이상 전문가',
    analysis:'전황 분석가'
  };
  const score=trainer=>{
    if(!trainer)return {strength:0,potential:0,habits:0,learned:0,ability:0,pokemon:0};
    const mons=Array.isArray(trainer.pokemon)?trainer.pokemon:[];
    const power=mons.length?mons.reduce((sum,mon)=>
      sum+clamp(value(mon.ca, value(mon.power,50)),1,200),0)/mons.length:50;
    const growth=mons.length?mons.reduce((sum,mon)=>
      sum+clamp(value(mon.pa, value(mon.ca,value(mon.power,50)))-
        value(mon.ca,value(mon.power,50)),0,150),0)/mons.length:0;
    const ca=value(trainer.profile?.ca,Math.round((value(trainer.tactics,10)+value(trainer.switching,10))*4.6));
    const pa=value(trainer.profile?.pa,ca);
    const learned=(trainer.autonomyAI?.playTraits||[]).filter(x=>Object.values(TRAITS).includes(x)).length;
    const habits=trainer.autonomyAI?.habitScores||{};
    const habit=Math.max(0,Math.min(100,Math.round(
      Object.keys(TRAITS).reduce((sum,key)=>sum+clamp(value(habits[key]),0,100),0)/7)));
    const tactical=(value(trainer.moveJudgment,value(trainer.tactics,10))+
      value(trainer.switchJudgment,value(trainer.switching,10))+
      value(trainer.battleAnalysis,value(trainer.tactics,10))+
      value(trainer.resourceManagement,value(trainer.switching,10)))/4;
    const potential=clamp(Math.round((growth/100*.65+Math.max(0,pa-ca)/200*.35)*100),0,100);
    const strength=clamp(Math.round(tactical*3.25+power*.23+
      learned*3+Math.min(12,habit*.1)),0,100);
    return {strength,potential,habits:habit,learned,ability:Math.round(tactical),pokemon:Math.round(power)};
  };
  const compatible=(t,style='balanced')=>{
    const preference=STYLE[style]||STYLE.balanced;
    const ai=t?.autonomyAI||{},traits=ai.playTraits||[],habits=ai.habitScores||{};
    const favored=preference.keys.reduce((sum,key)=>sum+
      (traits.includes(TRAITS[key])?24:0)+clamp(value(habits[key]),0,100)*.15,0);
    const receptive=clamp((value(ai.openness,10)-value(ai.conviction,10))*1.2,-15,15);
    // Competent independent trainers remain competitive despite low obedience.
    return clamp(Math.round(40+favored/2+receptive),10,100);
  };
  function aiStyle(club){
    const label=String(club?.aiManager?.style||'');
    if(label.includes('공격')||label.includes('압박'))return 'attacking';
    if(label.includes('수비')||label.includes('안정'))return 'defensive';
    if(label.includes('역습'))return 'adaptive';
    if(label.includes('연승')||label.includes('유지'))return 'relay';
    return 'balanced';
  }
  const suggestion=(trainer,club,budget=Infinity,style='balanced')=>{
    const ability=score(trainer),fit=compatible(trainer,style);
    const fee=typeof transferValuation==='function'?transferValuation(trainer,club):0;
    const affordability=fee<=budget;
    return {...ability,fit,fee,affordability,
      overall:Math.round(ability.strength*.55+ability.potential*.18+
        fit*.22+ability.learned*1.5)};
  };
  const candidateKey=t=>t?.uid!=null?'trainer:'+t.uid:
    'trainer-legacy:'+String(t?.id??'unknown')+':'+String(t?.name||'');
  function migrate(game){
    if(!game||game.marketV2Migrated)return false;
    const c=myClub();
    // A fresh 40-club league starts with exactly five starters each. Supply one
    // deterministic academy prospect per AI club before opening the market,
    // otherwise no club can release a starter without breaking scheduled 5v5s.
    // Use a local RNG state so the user's future fixture seed is not changed.
    if(!game.marketV2AcademySeeded){
      for(const club of game.clubs){
        if(club.id===c.id)continue;
        club.reserveTrainers ||= [];club.trainerAcademy ||= [];
        if(!club.reserveTrainers.length&&!club.trainerAcademy.length&&typeof mkTrainer==='function'){
          const localSeed={seed:(Math.imul(Number(club.id)+1,2654435761)^0x9e3779b9)>>>0};
          const youth=mkTrainer(localSeed,club,5);
          youth.name=club.name+' 아카데미 유망주';
          club.trainerAcademy.push(youth);
        }
      }
      game.marketV2AcademySeeded=true;
    }
    if(typeof aiInit==='function')aiInit();
    const trust=game.trainerAI?.trust;
    if(trust){
      for(let index=0;index<c.trainers.length;index++){
        const trainer=c.trainers[index];if(!trainer)continue;
        const legacy=String(trainer.id??index),stable=candidateKey(trainer);
        for(const field of ['trust','advice','issued','moveAdvice','moveIssued']){
          const map=game.trainerAI[field];
          if(map&&map[stable]===undefined&&map[legacy]!==undefined)
            map[stable]=map[legacy];
        }
      }
    }
    game.marketV2Migrated=true;
    return true;
  }
  function candidates(game,style='balanced',sort='recommended'){
    const me=game.clubs.find(c=>c.name===game.club);
    if(!me)return [];
    const rows=game.clubs.filter(c=>c.id!==me.id).flatMap(c=>
      c.trainers.map((trainer,slot)=>({trainer,slot,kind:'active',club:c}))
      .concat((c.reserveTrainers||[]).map((trainer,slot)=>({trainer,slot,kind:'reserve',club:c})))
      .filter(x=>x.trainer));
    const funds=Number(game.coins)||0;
    const ranked=rows.map(x=>({...x,report:suggestion(x.trainer,x.club,funds,style)}));
    const metric=x=>sort==='potential'?x.report.potential*1.6+x.report.strength*.3:
      sort==='current'?x.report.strength*1.5+x.report.fit*.1:
      sort==='fit'?x.report.fit*1.5+x.report.strength*.3:
      x.report.overall+(x.report.affordability?12:-8);
    ranked.sort((a,b)=>metric(b)-metric(a)||
      a.report.fee-b.report.fee||String(a.trainer.name).localeCompare(String(b.trainer.name)));
    return ranked;
  }
  function checkTransfer({buyer,seller,trainer,sourceKind,slot,fee,budget}){
    if(!buyer||!seller||buyer===seller||!trainer)return {ok:false,reason:'잘못된 이적 대상'};
    if(!Number.isFinite(fee)||fee<0||budget<fee)return {ok:false,reason:'이적 예산 부족'};
    const source=sourceKind==='active'?seller.trainers:
      sourceKind==='reserve'?seller.reserveTrainers:null;
    if(!source||source[slot]!==trainer)return {ok:false,reason:'트레이너 소속이 변경됨'};
    const reserve=buyer.reserveTrainers||[];
    if(buyer.trainers.every(Boolean)&&reserve.length>=5)
      return {ok:false,reason:'출전·후보 명단이 가득 참'};
    if(!Array.isArray(trainer.pokemon)||trainer.pokemon.length!==6)
      return {ok:false,reason:'포켓몬 여섯 마리의 소속 정보가 필요함'};
    if(sourceKind==='active'&&!((seller.reserveTrainers||[]).length||
      (seller.trainerAcademy||[]).length))
      return {ok:false,reason:'원 소속 구단에 대체 선수가 없어 이적을 승인할 수 없음'};
    return {ok:true,placement:buyer.trainers.findIndex(t=>!t)};
  }
  /** All guards must pass before moving the original trainer object. */
  function executeTransfer({buyer,seller,trainer,sourceKind,slot,fee,budget}){
    const checked=checkTransfer({buyer,seller,trainer,sourceKind,slot,fee,budget});
    if(!checked.ok)return checked;
    if(sourceKind==='active')seller.trainers[slot]=null;
    else seller.reserveTrainers.splice(slot,1);
    buyer.reserveTrainers ||= [];
    if(checked.placement>=0)buyer.trainers[checked.placement]=trainer;
    else buyer.reserveTrainers.push(trainer);
    return {ok:true,trainer,placement:checked.placement};
  }
  const state=()=>game.marketV2 ||= {style:'balanced',sort:'recommended',premium:1.15,intel:{},attempts:{}};
  function scoutSelected(){
    if(!game)return {ok:false,message:'게임을 시작해 주세요.'};
    const x=marketTarget?.();if(!x)return {ok:false,message:'트레이너를 선택해 주세요.'};
    const key=candidateKey(x.t),s=state(),existing=s.intel[key];
    if(existing?.season===game.season)return {ok:false,message:'이번 시즌의 스카우트 보고서가 있습니다.'};
    const cost=200000;
    if(game.coins<cost)return {ok:false,message:'스카우트 비용이 부족합니다.'};
    game.coins-=cost;
    s.intel[key]={season:game.season,week:game.week??0,source:x.c.id};
    game.log.unshift(x.t.name+' 스카우트 조사 완료 · 비용 '+wonReadable(cost));
    persist();renderOffice();
    return {ok:true};
  }
  function bidSelected(){
    if(!game)return;
    if(typeof aiInit==='function')aiInit();
    const x=marketTarget?.(),own=myClub();
    if(!x)return;
    const s=state(),key=candidateKey(x.t),token=game.season+':'+game.week;
    if(!transferOpen()){alert('이적시장이 열려 있지 않습니다.');return;}
    if(s.attempts[key]===token){alert('이 트레이너와는 이번 주 이미 협상했습니다. 다음 주 다시 제안할 수 있습니다.');return;}
    const base=transferValuation(x.t,x.c);
    const fee=Math.max(10000,Math.round(base*clamp(value(s.premium,1.15),1,1.4)/10000)*10000);
    const checked=checkTransfer({buyer:own,seller:x.c,trainer:x.t,
      sourceKind:x.kind,slot:x.slot,fee,budget:game.coins});
    if(!checked.ok){alert(checked.reason);return;}
    const assessment=transferAcceptance(x.t,x.c,own,base,fee);
    const fit=compatible(x.t,s.style);
    const clubChance=clamp(value(assessment.clubChance,.2),.05,.95);
    const trainerChance=clamp(value(assessment.trainerChance,.4)+(fit-50)/350,.03,.97);
    const combined=clubChance*trainerChance;
    if(!confirm(x.t.name+' 및 보유 포켓몬 6마리 영입\n'+
      '제안 금액: '+wonReadable(fee)+'\n'+
      '구단 수락 약 '+Math.round(clubChance*100)+'% · 트레이너 동의 약 '+
      Math.round(trainerChance*100)+'% · 종합 약 '+Math.round(combined*100)+
      '%\n협상을 진행하시겠습니까?'))return;
    s.attempts[key]=token;
    const accepted=rng(game)<clubChance&&rng(game)<trainerChance;
    game.transferHistory ||= [];
    if(!accepted){
      game.transferHistory.unshift({season:game.season,week:game.week,type:'협상 결렬',
        name:x.t.name,from:x.c.name,to:own.name,fee});
      game.log.unshift(x.t.name+' 영입 협상 결렬 · 이적료 차감 없음');
      persist();renderOffice();alert('이적 협상이 결렬됐습니다. 비용은 차감되지 않았습니다.');return;
    }
    const transferred=executeTransfer({buyer:own,seller:x.c,trainer:x.t,
      sourceKind:x.kind,slot:x.slot,fee,budget:game.coins});
    if(!transferred.ok){alert(transferred.reason);return;}
    game.coins-=fee;
    // AI seller receives the real fee; a reserve or academy replacement fills the vacancy.
    const sellerBudget=clubIdentity(x.c);
    sellerBudget.budget=Math.min(1000000000,sellerBudget.budget+fee);
    if(typeof aiMaintainSquad==='function')aiMaintainSquad(x.c);
    game.transferHistory.unshift({season:game.season,week:game.week,type:'영입',
      name:x.t.name,from:x.c.name,to:own.name,fee});
    game.log.unshift(x.t.name+' 영입 완료 · 6마리 포켓몬, 습득 선플, 경력 동반 · '+wonReadable(fee));
    transferSelected=null;persist();renderOffice();
  }
  function esc(v){return typeof escapeHTML==='function'?escapeHTML(String(v??'')):
    String(v??'').replaceAll('&','&amp;').replaceAll('<','&lt;').replaceAll('"','&quot;');}
  function renderMarket(previous){
    if(!game)return previous;
    const s=state(),style=s.style||'balanced',sort=s.sort||'recommended',
      list=candidates(game,style,sort);
    const eligible=list.filter(x=>x.report.affordability);
    const shown=(eligible.length?eligible:list).slice(0,5);
    const money=x=>wonReadable(Math.max(0,Math.round(x)||0));
    const options=(choices,active)=>Object.entries(choices).map(([key,label])=>
      '<option value="'+esc(key)+'" '+(key===active?'selected':'')+'>'+esc(label)+'</option>').join('');
    const top='<section class="tm2-market"><div class="tm2-head"><div><h2>트레이너 스카우팅 · 영입 우선순위</h2>'+
      '<p>현재 능력, 미래 잠재력, 선플, 감독 전술과의 궁합을 함께 평가합니다. 트레이너는 포켓몬 6마리를 동반합니다.</p>'+
      '</div><span>확인 가능한 후보 '+list.length+'명</span></div>'+
      '<div class="tm2-filters"><label>감독 전술 방향 <select onchange="TrainerMarketV2.setStyle(this.value)">'+
      options(Object.fromEntries(Object.entries(STYLE).map(([k,v])=>[k,v.label])),style)+'</select></label>'+
      '<label>비교 기준 <select onchange="TrainerMarketV2.setSort(this.value)">'+
      options({recommended:'종합 추천',current:'현재 전력',potential:'성장 가능성',fit:'전술 궁합'},sort)+'</select></label></div>'+
      '<div class="tm2-list">'+shown.map((x,i)=>'<div class="tm2-row"><div><b>'+esc(x.trainer.name)+'</b>'+
      '<small>'+esc(x.club.name)+' · '+(x.kind==='active'?'주전':'후보')+' · 선플 '+
      (x.trainer.autonomyAI?.playTraits||[]).length+'종</small></div>'+
      '<div class="tm2-metrics"><span>전력 '+x.report.strength+'</span><span>궁합 '+x.report.fit+'</span>'+
      '<span>'+money(x.report.fee)+'</span></div>'+
      '<button type="button" class="row-btn" onclick="marketSelect('+x.club.id+',\''+x.kind+'\','+x.slot+')">비교</button></div>').join('')+'</div></section>';
    const x=marketTarget?.();
    let detail='';
    if(x){
      const r=suggestion(x.t,x.c,game.coins,style),
        me=myClub(),team=me.trainers.filter(Boolean);
      const weakest=team.length?team.reduce((best,t)=>
        score(t).strength<score(best).strength?t:best,team[0]):null;
      const info=s.intel[candidateKey(x.t)];
      const researched=info?.season===game.season;
      const personality=x.t.autonomyAI||{};
      const traitNames=(personality.playTraits||[]).filter(Boolean);
      const p=transferProfile(x.t,x.c);
      const full=researched?
        '<div class="tm2-scouted">스카우트 완료 · 트레이너 성장 잠재력 '+esc(p.pa)+
        ' / 200 · 개방성 '+esc(personality.openness??'미측정')+
        ' · 소신 '+esc(personality.conviction??'미측정')+
        ' · 포켓몬 잠재력 '+x.t.pokemon.map(m=>esc(m.name)+' '+esc(m.pa??'미확인')).join(', ')+
        '</div>':
        '<div class="tm2-scouted">잠재력 및 성격은 추정치입니다. 유료 스카우트 후 세부 정보를 확인할 수 있습니다.'+
        '<button type="button" class="row-btn" onclick="TrainerMarketV2.scout()">정밀 조사 '+money(200000)+'</button></div>';
      const multiple=clamp(value(s.premium,1.15),1,1.4);
      const base=r.fee,offered=Math.round(base*multiple/10000)*10000,
        acceptance=transferAcceptance(x.t,x.c,me,base,offered);
      const sellerChance=clamp(value(acceptance.clubChance,.2),.05,.95);
      const coachChance=clamp(value(acceptance.trainerChance,.4)+(r.fit-50)/350,.03,.97);
      detail='<section class="tm2-detail"><h3>'+esc(x.t.name)+' · 영입 분석</h3>'+
        '<div class="tm2-stats"><div>현재 전력 <b>'+r.strength+'</b></div>'+
        '<div>성장 가능성 <b>'+(researched?r.potential+' / 100':'조사 필요')+'</b></div>'+
        '<div>전술 궁합 <b>'+r.fit+' / 100</b></div>'+
        '<div>보유 선플 <b>'+traitNames.length+'종</b></div></div>'+
        '<p>대표 선플: '+(traitNames.length?traitNames.map(esc).join(', '):'아직 없음')+
        ' · 감독 권고에 대한 수용 정도는 트레이너가 결정합니다.</p>'+
        (weakest?'<p>우리 구단 최저 전력 '+esc(weakest.name)+'('+score(weakest).strength+
          ') 대비 후보 전력 '+r.strength+'</p>':'')+full+
        '<div class="tm2-offer"><label>제안 프리미엄 <select onchange="TrainerMarketV2.setPremium(this.value)">'+
        options({'1':'기준가 100%','1.15':'기준가 115%','1.3':'기준가 130%','1.4':'기준가 140%'},String(multiple))+
        '</select></label><div>제안액 <b>'+money(offered)+'</b><small>예상 성사 확률 '+
        Math.round(sellerChance*coachChance*100)+'% · 금액은 성사 시에만 차감</small></div></div>'+
        '</section>';
    }
    return top+previous.replace('<h2>우리 구단 계약 관리</h2>',
      detail+'<h2>우리 구단 계약 관리</h2>');
  }
  const previousMarket=transferMarketHTML;
  transferMarketHTML=function(){return renderMarket(previousMarket());};
  // Respect the old transfer/league systems; improve candidate valuation and AI choices.
  const previousValuation=transferValuation;
  transferValuation=function(trainer,club){
    const base=previousValuation(trainer,club),r=score(trainer);
    const multiplier=1+Math.min(.38,r.learned*.045+r.habits*.0015+r.potential*.001);
    return Math.max(10000,Math.round(base*multiplier/10000)*10000);
  };
  const previousAIScore=aiUnitScore;
  aiUnitScore=function(trainer){
    if(!trainer)return previousAIScore(trainer);
    const r=score(trainer);
    return previousAIScore(trainer)+Math.round(r.strength*.12+r.potential*.045+r.learned*1.5);
  };
  const previousShortlist=aiTransferCandidates;
  aiTransferCandidates=function(buyer){
    const style=aiStyle(buyer);
    // AI managers must not leave the player's only active five incomplete.
    return previousShortlist(buyer).filter(entry=>
      entry.seller.id!==myClub().id||entry.e.kind!=='active'||
      (entry.seller.reserveTrainers||[]).length>0||
      (entry.seller.trainerAcademy||[]).length>0).map(entry=>{
      const fit=compatible(entry.e.t,style),r=score(entry.e.t);
      return {...entry,score:entry.score+(fit-50)*.24+r.potential*.075+
        r.learned*1.2};
    }).sort((a,b)=>b.score-a.score||a.fee-b.fee);
  };
  marketOffer=bidSelected;
  const previousOffice=renderOffice;
  renderOffice=function(){
    if(game&&typeof aiInit==='function'&&migrate(game))persist();
    previousOffice();
  };
  const style=document.createElement('style');
  style.textContent=[
    '.tm2-market,.tm2-detail{background:#172c3f;border:1px solid #35546b;border-radius:9px;padding:16px;margin:12px 0 20px}',
    '.tm2-head{display:flex;justify-content:space-between;gap:12px;align-items:center;flex-wrap:wrap}',
    '.tm2-head h2{font-size:18px;margin:0}.tm2-head p{color:#a8c2cf;font-size:12px;line-height:1.6}',
    '.tm2-head span{font-size:12px;color:#8bceb9}.tm2-filters{display:flex;gap:12px;flex-wrap:wrap;margin:12px 0}',
    '.tm2-filters label,.tm2-offer label{font-size:12px;color:#b5cbd8}',
    '.tm2-filters select,.tm2-offer select{display:block;margin-top:5px;padding:8px;background:#1b4056;color:#f2f8fc;border:1px solid #648398;border-radius:6px;min-width:140px}',
    '.tm2-list{display:grid;gap:7px}.tm2-row{display:flex;align-items:center;justify-content:space-between;gap:12px;background:#203a50;border-radius:6px;padding:10px}',
    '.tm2-row small{display:block;color:#b6cbd9;font-size:11px;margin-top:4px}.tm2-metrics{display:flex;gap:10px;flex-wrap:wrap;font-size:12px}',
    '.tm2-detail h3{font-size:18px;margin:0 0 10px}.tm2-detail p{font-size:12px;line-height:1.65;color:#b8cfdd}',
    '.tm2-stats{display:grid;grid-template-columns:repeat(4,minmax(0,1fr));gap:8px}',
    '.tm2-stats>div{background:#234158;padding:11px;border-radius:6px;font-size:12px}.tm2-stats b{display:block;font-size:17px;margin-top:5px}',
    '.tm2-scouted{padding:12px;background:#1c3947;border:1px solid #376268;border-radius:7px;font-size:12px;line-height:1.6}',
    '.tm2-scouted button{margin-left:12px}.tm2-offer{display:flex;align-items:end;justify-content:space-between;gap:12px;flex-wrap:wrap;margin-top:14px}',
    '.tm2-offer small{display:block;color:#a8c6d5;margin-top:4px;font-size:11px}',
    '@media(max-width:680px){.tm2-stats{grid-template-columns:repeat(2,minmax(0,1fr))}.tm2-row{align-items:flex-start;flex-wrap:wrap}.tm2-offer{align-items:start}}'
  ].join('');
  document.head.append(style);
  window.TrainerMarketV2={
    STYLE,TRAITS,score,compatible,aiStyle,suggestion,candidates,checkTransfer,
    executeTransfer,migrate,renderMarket,
    scout:()=>scoutSelected(),bid:()=>bidSelected(),
    setStyle:style=>{if(!STYLE[style])return;state().style=style;persist();renderOffice();},
    setSort:sort=>{if(!['recommended','current','potential','fit'].includes(sort))return;
      state().sort=sort;persist();renderOffice();},
    setPremium:n=>{if(![1,1.15,1.3,1.4].includes(Number(n)))return;
      state().premium=Number(n);persist();renderOffice();}
  };
})();
