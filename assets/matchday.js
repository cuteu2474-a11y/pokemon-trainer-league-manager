/* Matchday gate: all calendar progression uses preparation before real Showdown. */
(() => {
  const priorNextWeek = nextWeek, priorPlayNext = playNext, priorMatchSim = matchSim;
  let active = null, timer = null, cursor = 0, events = [], speed = 4, paused = false;
  const planLabels={balanced:'균형',offense:'공세',control:'견제',endurance:'유지력'};
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
    game.pendingMatch = {...f, season:game.season, phase:'prepare', order:[...game.order], plans:myClub().trainers.map(t=>t?.battlePlan||'balanced')};
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
    #matchday{position:fixed;inset:0;z-index:1000;background:#101a29;color:#e8edf4;overflow:auto;font:14px 'Malgun Gothic',sans-serif;padding:28px max(20px,calc((100vw - 1180px)/2))}
    #matchday h1{font-size:25px;margin:10px 0 20px}#matchday h2{font-size:18px}#matchday button,#matchday select{font:inherit;padding:10px 16px;border:1px solid #537087;background:#20384a;color:white;border-radius:4px;cursor:pointer}#matchday select{width:auto}#matchday button:disabled{opacity:.45;cursor:default}#matchday .primary{background:#197b76}#matchday .md-top,#matchday .md-actions{display:flex;justify-content:space-between;align-items:center;gap:12px;flex-wrap:wrap;margin:15px 0}#matchday .md-muted{color:#a5b5c6;line-height:1.7}#matchday .md-row{display:flex;align-items:center;justify-content:space-between;gap:12px;padding:14px;background:#182b3d;border-bottom:1px solid #304558}#matchday .md-row small{display:block;color:#b1c3d3;line-height:1.6;margin-top:6px}#matchday .md-row button{padding:7px 12px}#matchday .md-arena{display:grid;grid-template-columns:1fr 1fr;gap:20px;margin:20px 0}#matchday .md-side{padding:24px;background:#1b3046;border:1px solid #42566e;border-radius:6px}#matchday .md-side h2{font-size:24px}#matchday progress{width:100%;accent-color:#54c2a0}#matchday #md-log{height:34vh;overflow:auto;background:#091321;padding:16px;line-height:1.9;white-space:pre-wrap}#matchday .md-error{color:#ffb4ac;margin:16px 0}#matchday .md-score{font-size:32px;font-weight:bold} @media(max-width:650px){#matchday{padding:16px}#matchday .md-row{flex-wrap:wrap}#matchday .md-arena{gap:8px}#matchday .md-side{padding:12px}}
  `;document.head.append(styles);
  function render() {
    const p = pending();if (!p) return;
    if (p.phase === 'watch') {startReplay();return;}
    p.plans ||= myClub().trainers.map(t=>t?.battlePlan||'balanced');
    const c=myClub(), opponent=game.clubs[p.home === c.id ? p.away : p.home];
    const root=screen(), busy=p.phase==='running';
    root.innerHTML=`<div class="md-muted">${p.week}주차 · 리그 ${p.round}라운드</div><h1>${esc(c.name)} vs ${esc(opponent.name)}</h1><div class="md-top"><strong>경기 준비 · 출전 순서 확정</strong><span>구단 피로 ${c.fatigue??0}/100 · 사기 ${c.morale??50}/100</span></div><p class="md-muted">트레이너별 컨디션은 아직 수집되지 않았습니다. 능력과 포켓몬 편성을 확인해 출전 순서를 정하세요.</p>`+
      p.order.map((index,slot)=>{const t=c.trainers[index];return `<div class="md-row"><div><strong>${slot+1}. ${esc(t?.name||'출전 불가')}</strong><small>개별 컨디션 미측정 · 전술 ${t?.tactics??'—'} · 교체 판단 ${t?.switching??'—'}<br>${(t?.pokemon||[]).map(mon=>esc(mon.name)+' Lv.'+mon.level).join(' · ')}</small></div><div><select data-plan="${index}" aria-label="${esc(t?.name)} 전술" ${busy?'disabled':''}>${Object.entries(planLabels).map(([key,label])=>`<option value="${key}" ${p.plans[index]===key?'selected':''}>${label}</option>`).join('')}</select> <button data-up="${slot}" aria-label="${slot+1}번 트레이너 위로" ${busy||slot===0?'disabled':''}>↑</button> <button data-down="${slot}" aria-label="${slot+1}번 트레이너 아래로" ${busy||slot===4?'disabled':''}>↓</button></div></div>`}).join('')+
      '<p class="md-muted">등록된 전투 세트를 사용합니다. 기존 저장에 세트가 없으면 현재 레벨·전력에서 CA/GP를 구성하고, 종이 배울 수 있는 기술 중 선택한 전술에 맞춰 자동 편성합니다. 명시적으로 등록된 기술은 유지합니다.</p>'+
      `<div class="md-error" role="alert">${esc(p.error)}</div><div class="md-actions"><button id="md-cancel" ${busy?'disabled':''}>구단 화면으로</button><button id="md-confirm" class="primary" ${busy?'disabled':''}>${busy?'Showdown 경기 계산 중…':'출전 순서 확정 · 경기 시작'}</button></div>`;
    for (const button of root.querySelectorAll('[data-up],[data-down]')) button.onclick=()=>{
      const slot=Number(button.dataset.up??button.dataset.down), target=slot+(button.dataset.up!==undefined?-1:1);
      [p.order[slot],p.order[target]]=[p.order[target],p.order[slot]];persist();render();
    };
    for(const select of root.querySelectorAll('[data-plan]'))select.onchange=()=>{p.plans[Number(select.dataset.plan)]=select.value;persist();};
    root.querySelector('#md-cancel').onclick=()=>{delete game.pendingMatch;persist();root.remove();};
    root.querySelector('#md-confirm').onclick=run;
  }
  async function run() {
    const p=pending();if (!p || p.phase==='running') return;
    p.phase='running';delete p.error;persist();render();
    const order=[...p.order], mine=myClub().id;
    const identity=[0,1,2,3,4];
    const request={home:copy(game.clubs[p.home]),away:copy(game.clubs[p.away]),homeOrder:p.home===mine?order:identity,awayOrder:p.away===mine?order:identity,seed:[game.seed>>>0,p.season,p.round,7919]};
    request[p.home===mine?'home':'away'].trainers.forEach((trainer,i)=>{trainer.battlePlan=p.plans[i];});
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
    return `<div class="md-report-grid">${['home','away'].map((key,k)=>`<section><h2>${esc(game.clubs[k===0?result.home:result.away].name)} 활약</h2>${report[key].slice(0,3).map((mon,i)=>`<div class="md-report-row"><b>${i+1}</b><div><strong>${esc(mon.displayName)}</strong><small>${esc(mon.trainer)} · ${mon.entries}회 투입</small></div><span>직접 격파 ${mon.knockouts}<small>직접 피해 ${mon.damage} HP</small></span></div>`).join('')||'<p>집계된 출전 기록이 없습니다.</p>'}</section>`).join('')}</div><p class="md-muted">실제 공격으로 가한 피해와 격파를 집계합니다. 독·날씨 등 간접 피해는 제외합니다.</p>`;
  }
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
      active=p.result;game.order=[...p.order];myClub().trainers.forEach((trainer,i)=>{if(trainer)trainer.battlePlan=p.plans?.[i]||'balanced';});
      if(p.current)priorPlayNext();else priorNextWeek();
      if(game.round!==p.round)throw new Error('경기 결과 반영 실패');
      game.lastMatch.engine='showdown';game.lastMatch.replay=p.result;
      delete game.pendingMatch;persist();clearTimeout(timer);document.getElementById('matchday')?.remove();for(const id of ['mainmenu','clubselect','clubtrainers']){const node=document.getElementById(id);if(node)node.hidden=true;}document.getElementById('dashboard').hidden=false;tab='fixtures';renderOffice();
    } catch(error){game=before;persist();alert(error.message);}finally{active=null;}
  }
  const priorReportRender=renderOffice;
  renderOffice=function(){priorReportRender();const panel=document.getElementById('dashpanel');if(panel&&game?.lastMatch?.replay?.report&&['home','fixtures'].includes(tab)){const button=document.createElement('button');button.className='g-btn alt';button.textContent='지난 경기 활약 보고서';button.onclick=()=>{const root=screen();root.innerHTML='<h1>지난 경기 활약 보고서</h1>'+reportHTML(game.lastMatch.replay)+'<button id="md-report-back">구단 화면으로</button>';root.querySelector('#md-report-back').onclick=()=>root.remove();};panel.append(button);}};
  if(game?.pendingMatch){if(game.pendingMatch.phase==='running')game.pendingMatch.phase='prepare';render();}
})();
