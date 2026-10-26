/* Matchday gate: all calendar progression uses preparation before real Showdown. */
(() => {
  const priorNextWeek = nextWeek, priorPlayNext = playNext, priorMatchSim = matchSim;
  let active = null, timer = null, cursor = 0, events = [], speed = 4, paused = false;
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
    game.pendingMatch = {...f, season:game.season, phase:'prepare', order:[...game.order]};
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
    const c=myClub(), opponent=game.clubs[p.home === c.id ? p.away : p.home];
    const root=screen(), busy=p.phase==='running';
    root.innerHTML=`<div class="md-muted">${p.week}주차 · 리그 ${p.round}라운드</div><h1>${esc(c.name)} vs ${esc(opponent.name)}</h1><div class="md-top"><strong>경기 준비 · 출전 순서 확정</strong><span>구단 피로 ${c.fatigue??0}/100 · 사기 ${c.morale??50}/100</span></div><p class="md-muted">트레이너별 컨디션은 아직 수집되지 않았습니다. 능력과 포켓몬 편성을 확인해 출전 순서를 정하세요.</p>`+
      p.order.map((index,slot)=>{const t=c.trainers[index];return `<div class="md-row"><div><strong>${slot+1}. ${esc(t?.name||'출전 불가')}</strong><small>개별 컨디션 미측정 · 전술 ${t?.tactics??'—'} · 교체 판단 ${t?.switching??'—'}<br>${(t?.pokemon||[]).map(mon=>esc(mon.name)+' Lv.'+mon.level).join(' · ')}</small></div><div><button data-up="${slot}" aria-label="${slot+1}번 트레이너 위로" ${busy||slot===0?'disabled':''}>↑</button> <button data-down="${slot}" aria-label="${slot+1}번 트레이너 아래로" ${busy||slot===4?'disabled':''}>↓</button></div></div>`}).join('')+
      '<p class="md-muted">등록된 전투 세트를 사용합니다. 기존 저장에 세트가 없으면 현재 레벨·전력에서 CA/GP와 기본 기술·특성을 자동 편성하며 도구는 미장착입니다.</p>'+
      `<div class="md-error" role="alert">${esc(p.error)}</div><div class="md-actions"><button id="md-cancel" ${busy?'disabled':''}>구단 화면으로</button><button id="md-confirm" class="primary" ${busy?'disabled':''}>${busy?'Showdown 경기 계산 중…':'출전 순서 확정 · 경기 시작'}</button></div>`;
    for (const button of root.querySelectorAll('[data-up],[data-down]')) button.onclick=()=>{
      const slot=Number(button.dataset.up??button.dataset.down), target=slot+(button.dataset.up!==undefined?-1:1);
      [p.order[slot],p.order[target]]=[p.order[target],p.order[slot]];persist();render();
    };
    root.querySelector('#md-cancel').onclick=()=>{delete game.pendingMatch;persist();root.remove();};
    root.querySelector('#md-confirm').onclick=run;
  }
  async function run() {
    const p=pending();if (!p || p.phase==='running') return;
    p.phase='running';delete p.error;persist();render();
    const order=[...p.order], mine=myClub().id;
    const identity=[0,1,2,3,4];
    const request={home:copy(game.clubs[p.home]),away:copy(game.clubs[p.away]),homeOrder:p.home===mine?order:identity,awayOrder:p.away===mine?order:identity,seed:[game.seed>>>0,p.season,p.round,7919]};
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
  const koreanMove = name => moveNames[name.replace(/[^A-Za-z]/g,'')]||name;
  // Presentation follows authoritative Showdown events; it never resolves a hit or changes HP.
  let visualState = {}, skipping = false;
  function resetVisuals(){visualState={p1:{trainer:-1,remaining:6,hp:null,maxhp:100},p2:{trainer:-1,remaining:6,hp:null,maxhp:100}};skipping=false;}
  function arenaHTML(){return `<div class="md-field" aria-label="포켓몬 전투 전장"><div class="md-stands"></div><div class="md-pitch"></div><div class="md-center-mark"></div><div class="md-platform md-platform-home"></div><div class="md-platform md-platform-away"></div><div class="md-weather" id="md-weather"></div>${['p1','p2'].map(side=>`<div class="md-hud ${side}"><div class="md-hud-head"><span id="${side}-name">출전 준비</span><span class="md-status" id="${side}-status"></span><span class="md-level" id="${side}-level"></span></div><div class="md-hp-row"><b>HP</b><progress id="${side}-hp" value="0" max="100"></progress></div><div class="md-hud-foot"><span class="md-balls" id="${side}-balls" aria-label="남은 포켓몬"></span><span id="${side}-state"></span></div></div><div class="md-combatant ${side}" id="${side}-combatant"><div class="md-shadow"></div><div class="md-sprite-wrap"><img class="md-sprite" id="${side}-sprite" alt="출전 대기" hidden><div class="md-sprite-fallback" id="${side}-fallback" hidden>?</div></div><div class="md-popups" id="${side}-popups"></div></div>`).join('')}<div class="md-relay"><span id="p1-relay"></span><span id="p2-relay"></span></div><div class="md-announcement" id="md-announcement" aria-live="polite">포켓몬 출전 준비</div></div>`;}
  const typeColors={Normal:'#d8d5c8',Fire:'#ff784a',Water:'#54bcff',Electric:'#ffe769',Grass:'#82e18b',Ice:'#a8f7ff',Fighting:'#fba677',Poison:'#d68ae8',Ground:'#dfbb7c',Flying:'#c4dcff',Psychic:'#ff91c2',Bug:'#c7df65',Rock:'#c5ba96',Ghost:'#ad9fff',Dragon:'#b69aff',Dark:'#a6a2b9',Steel:'#c6e4ea',Fairy:'#ffc6ed'};
  const statusNames={par:'마비',brn:'화상',slp:'잠듦',tox:'맹독',psn:'독',frz:'얼음'};
  const visualStyles=document.createElement('style');visualStyles.textContent=`
    #matchday .md-top{margin:8px 0}#matchday .md-top h1{font-size:22px;margin:3px 0}#matchday .md-muted{font-size:12px}#matchday #md-trainers{font-size:13px;color:#c3d5e0;margin-bottom:10px}#matchday .md-score{font-size:26px}
    #matchday .md-field{position:relative;height:clamp(320px,48vh,510px);min-height:320px;overflow:hidden;border:1px solid #466879;border-radius:9px;background:linear-gradient(180deg,#183147 0%,#477383 38%,#264f55 39%,#173d39 64%,#102d2b 100%);isolation:isolate}
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
    const mon=team.find(p=>p.species===species)||team.find(p=>p.name===name);
    const info=result.visuals?.[species]||{id:species.toLowerCase().replace(/[^a-z0-9-]/g,''),num:null};
    // Only validated identifiers are interpolated into third-party sprite URLs.
    const id=/^[a-z0-9-]+$/.test(info.id)?info.id:'substitute';
    const img=document.getElementById(side+'-sprite'),holder=document.getElementById(side+'-combatant'),fallback=document.getElementById(side+'-fallback');
    holder.classList.remove('fainted');fallback.hidden=true;img.hidden=false;img.alt=name||mon?.name||species;
    document.getElementById(side+'-level').textContent='Lv.'+(details.match(/, L(\d+)/)?.[1]||mon?.level||100);
    state.species=species;
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
    const type=part[1],actor=part[2]||'',side=actor.startsWith('p1')?'p1':'p2',name=actor.split(': ').slice(1).join(': '),state=visualState[side];
    const holder=document.getElementById(side+'-combatant');
    if(type==='switch'||type==='drag'){showSprite(side,part[3]||'',name);state.hp=null;announce(name+' 출전!');}
    if(type==='-formechange'||type==='detailschange'){showSprite(side,part[3]||'',name);announce(name+'의 모습이 변했습니다.');}
    if(type==='-transform'){const target=part[3]?.startsWith('p1')?'p1':'p2';showSprite(side,visualState[target].species||'',name);announce(name+' 변신!');}
    if(type==='move'){attack(side,part[3],part[4]);announce(name+'의 '+koreanMove(part[3])+'!');}
    if(['switch','drag','-damage','-heal'].includes(type)){
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
    if(type==='faint'){holder.classList.add('fainted');state.remaining=Math.max(0,state.remaining-1);updateBalls(side);announce(name+' 쓰러졌습니다!');}
    if(type==='-status'){document.getElementById(side+'-status').textContent=statusNames[part[3]]||part[3];announce(name+' · '+(statusNames[part[3]]||part[3]));}
    if(type==='-curestatus')document.getElementById(side+'-status').textContent='';
    if(type==='-supereffective')floating(side,'효과 굉장!');
    if(type==='-resisted')floating(side,'효과 약함');
    if(type==='-crit')floating(side,'급소!');
    if(type==='-weather'){document.getElementById('md-weather').className='md-weather '+({RainDance:'rain',SunnyDay:'sun',Sandstorm:'sand',Hail:'snow',Snowscape:'snow'}[actor]||'');}
  }

  function startReplay() {
    clearTimeout(timer);cursor=0;events=[];paused=false;resetVisuals();
    const p=pending(), r=p.result, root=screen();
    root.innerHTML=`<div class="md-muted">${p.week}주차 · 리그 ${p.round}라운드 · Showdown 자동 관전</div><div class="md-top"><h1>${esc(game.clubs[p.home].name)} vs ${esc(game.clubs[p.away].name)}</h1><span class="md-score" id="md-score">0 : 0</span></div><div id="md-trainers"></div>${arenaHTML()}<div class="md-actions"><span id="md-stage" aria-live="polite">실제 전투 기록을 자동 재생합니다.</span><div><button id="md-pause">일시정지</button> <select id="md-speed" aria-label="관전 속도"><option value="1">1배속</option><option value="4" selected>4배속</option><option value="16">16배속</option></select> <button id="md-skip">결과까지 보기</button></div></div><details class="md-commentary"><summary>경기 중계 기록</summary><div id="md-log" role="log"></div></details><div class="md-actions"><span id="md-summary"></span><button id="md-finish" class="primary" disabled>경기 결과 확인 · 일정으로</button></div>`;
    r.rounds.forEach((battle,i)=>{
      events.push({intro:i,battle});
      for(const line of battle.log.split('\n')) if (/^\|(turn|move|switch|drag|faint|win|tie|-damage|-heal|-status|-curestatus|-supereffective|-resisted|-crit|-ability|-formechange|detailschange|-transform|-weather|cant)\|/.test(line)) events.push({line});
      events.push({end:battle});
    });
    root.querySelector('#md-speed').value=String(speed);
    root.querySelector('#md-speed').onchange=e=>{speed=Number(e.target.value);};
    root.querySelector('#md-pause').onclick=e=>{paused=!paused;e.target.textContent=paused?'재생':'일시정지';if(!paused)tick();else clearTimeout(timer);};
    root.querySelector('#md-skip').onclick=()=>{clearTimeout(timer);skipping=true;while(cursor<events.length)step();skipping=false;complete();};
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
      visualIntro(b);append('── 트레이너 대결 '+(event.intro+1)+' ──');return;
    }
    if(event.end){if(event.end.winner==='A')score[0]++;else if(event.end.winner==='B')score[1]++;else {score[0]++;score[1]++;}document.getElementById('md-score').textContent=score.join(' : ');return;}
    const parts=event.line.split('|'), type=parts[1],actor=parts[2]||'',side=actor.startsWith('p1')?'p1':'p2',name=actor.split(': ').slice(1).join(': ');
    visualEvent(parts);
    if(type==='turn'){document.getElementById('md-stage').textContent=parts[2]+'턴';return;}
    if(type==='switch'||type==='drag'){document.getElementById(side+'-name').textContent=name;append(name+' 출전');}
    if(['switch','drag','-damage','-heal'].includes(type)){
      const hp=(type==='switch'||type==='drag'?parts[4]:parts[3])||'',match=hp.match(/^(\d+)(?:\/(\d+))?/);
      if(match){const bar=document.getElementById(side+'-hp');bar.max=Number(match[2]||100);bar.value=Number(match[1]);document.getElementById(side+'-state').textContent=hp.replace('fnt','기절').replace('par','마비').replace('brn','화상').replace('slp','잠듦').replace('tox','맹독').replace('psn','독').replace('frz','얼음');}
    }
    if(type==='move')append(name+' → '+koreanMove(parts[3]));
    if(type==='faint')append(name+' 기절');
    if(type==='-status')append(name+' · '+parts[3]);
    if(type==='-supereffective')append('효과가 굉장했습니다!');
    if(type==='-resisted')append('효과가 별로였습니다.');
    if(type==='-crit')append('급소에 맞았습니다!');
    if(type==='-ability')append(name+' · '+parts[3]);
  }
  function tick(){clearTimeout(timer);if(paused)return;if(cursor>=events.length){complete();return;}step();const line=events[cursor-1]?.line||'';const base=/^\|(move|switch|drag)\|/.test(line)?1050:420;timer=setTimeout(tick,Math.max(65,base/speed));}
  function complete(){const r=pending().result;announce('경기 종료 · '+r.aScore+' : '+r.bScore);document.getElementById('md-score').textContent=r.aScore+' : '+r.bScore;document.getElementById('md-stage').textContent='경기 종료';document.getElementById('md-summary').textContent='결과 확인 후 순위표와 일정에 반영됩니다.';document.getElementById('md-finish').disabled=false;document.getElementById('md-pause').disabled=true;document.getElementById('md-skip').disabled=true;}
  function finish(){
    const p=pending();if(!p||!p.result||cursor<events.length)return;
    if(game.season!==p.season||game.round!==p.round-1){alert('일정이 변경되어 결과를 적용할 수 없습니다.');return;}
    const before=copy(game);
    try {
      active=p.result;game.order=[...p.order];
      if(p.current)priorPlayNext();else priorNextWeek();
      if(game.round!==p.round)throw new Error('경기 결과 반영 실패');
      game.lastMatch.engine='showdown';game.lastMatch.replay=p.result;
      delete game.pendingMatch;persist();clearTimeout(timer);document.getElementById('matchday')?.remove();tab='fixtures';renderOffice();
    } catch(error){game=before;persist();alert(error.message);}finally{active=null;}
  }
  if(game?.pendingMatch){if(game.pendingMatch.phase==='running')game.pendingMatch.phase='prepare';render();}
})();
