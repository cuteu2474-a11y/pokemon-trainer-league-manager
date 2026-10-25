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
  function startReplay() {
    clearTimeout(timer);cursor=0;events=[];paused=false;
    const p=pending(), r=p.result, root=screen();
    root.innerHTML=`<div class="md-muted">${p.week}주차 · 리그 ${p.round}라운드 · Showdown 자동 관전</div><div class="md-top"><h1>${esc(game.clubs[p.home].name)} vs ${esc(game.clubs[p.away].name)}</h1><span class="md-score" id="md-score">0 : 0</span></div><div id="md-trainers"></div><div class="md-arena">${['p1','p2'].map(side=>`<div class="md-side"><small>${side==='p1'?'홈':'원정'}</small><h2 id="${side}-name">출전 준비</h2><progress id="${side}-hp" value="0" max="100"></progress><div id="${side}-state"></div></div>`).join('')}</div><div class="md-actions"><span id="md-stage" aria-live="polite">실제 전투 기록을 자동 재생합니다.</span><div><button id="md-pause">일시정지</button> <select id="md-speed" aria-label="관전 속도"><option value="1">1배속</option><option value="4" selected>4배속</option><option value="16">16배속</option></select> <button id="md-skip">결과까지 보기</button></div></div><div id="md-log" role="log"></div><div class="md-actions"><span id="md-summary"></span><button id="md-finish" class="primary" disabled>경기 결과 확인 · 일정으로</button></div>`;
    r.rounds.forEach((battle,i)=>{
      events.push({intro:i,battle});
      for(const line of battle.log.split('\n')) if (/^\|(turn|move|switch|drag|faint|win|tie|-damage|-heal|-status|-curestatus|-supereffective|-resisted|-crit|-ability|cant)\|/.test(line)) events.push({line});
      events.push({end:battle});
    });
    root.querySelector('#md-speed').onchange=e=>{speed=Number(e.target.value);};
    root.querySelector('#md-pause').onclick=e=>{paused=!paused;e.target.textContent=paused?'재생':'일시정지';if(!paused)tick();else clearTimeout(timer);};
    root.querySelector('#md-skip').onclick=()=>{clearTimeout(timer);while(cursor<events.length)step();complete();};
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
      append('── 트레이너 대결 '+(event.intro+1)+' ──');return;
    }
    if(event.end){if(event.end.winner==='A')score[0]++;else if(event.end.winner==='B')score[1]++;else {score[0]++;score[1]++;}document.getElementById('md-score').textContent=score.join(' : ');return;}
    const parts=event.line.split('|'), type=parts[1],actor=parts[2]||'',side=actor.startsWith('p1')?'p1':'p2',name=actor.split(': ').slice(1).join(': ');
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
  function tick(){clearTimeout(timer);if(paused)return;if(cursor>=events.length){complete();return;}step();timer=setTimeout(tick,600/speed);}
  function complete(){const r=pending().result;document.getElementById('md-score').textContent=r.aScore+' : '+r.bScore;document.getElementById('md-stage').textContent='경기 종료';document.getElementById('md-summary').textContent='결과 확인 후 순위표와 일정에 반영됩니다.';document.getElementById('md-finish').disabled=false;document.getElementById('md-pause').disabled=true;document.getElementById('md-skip').disabled=true;}
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
