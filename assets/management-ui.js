/* Weekly policy, guarded calendar progress, and five-section office navigation. */
(function(){
  if(window.ManagementUI)return;
  const esc=v=>escapeHTML(String(v??''));
  const roster=()=>[...(myClub().trainers||[]),...(myClub().reserveTrainers||[])].filter(Boolean);
  const identity=t=>String(t.uid??('legacy:'+t.id+':'+t.name));
  const state=()=>game.management ||= {program:'tactics',target:null,autoRecovery:true,views:{},history:[]};
  let busy=false,stopRequested=false;
  const groups={home:['홈','home'],squad:['선수단','team'],league:['리그','fixtures'],recruit:['영입','transfer'],club:['구단','finance']};
  const tabGroup=t=>['team','pokemon','profile','weekly','academy','tactics','scout'].includes(t)?'squad':
    ['league','fixtures','calendar','retirement'].includes(t)?'league':t==='transfer'?'recruit':t==='home'?'home':'club';
  function blocker(){
    if(game.pendingMatch)return {text:'경기 준비를 확인해 주세요.',tab:'fixtures',match:true};
    if((game.aiOffers||[]).some(o=>o.status==='pending'&&o.season===game.season&&o.expires>=game.week))
      return {text:'응답이 필요한 이적 제안이 있습니다.',tab:'ai'};
    if(roster().some(t=>t.pokemonScouting?.candidate))return {text:'포획한 포켓몬의 등록 여부를 결정해 주세요.',tab:'scout'};
    if(myClub().trainers.filter(t=>t&&t.pokemon?.length===6).length!==5)
      return {text:'출전 선수단의 공석을 먼저 채워 주세요.',tab:'team'};
    if([...roster(),...(myClub().trainerAcademy||[])].some(t=>t.contractDecision?.status==='pending'))return {text:'계약 결정을 확인해 주세요.',tab:'transfer'};
    return null;
  }
  function targetSelection(){
    const s=state(),c=myClub();
    let t=s.target?roster().find(t=>identity(t)===s.target):null;
    if(s.target&&!t)return null;
    if(!t)t=roster().slice().sort((a,b)=>(a.tactics||10)-(b.tactics||10))[0];
    if(!t)return null;
    const active=c.trainers.indexOf(t);
    return {trainer:t,token:active>=0?'active:'+active:'reserve:'+c.reserveTrainers.indexOf(t)};
  }
  async function settleResearch(){
    if(!window.TrainerMoveAI)return true;
    await window.TrainerMoveAI.queue();
    return game.trainerAI?.movesProcessedWeek===game.season+':'+game.week;
  }
  function applyPolicy(){
    initWeekly();if(weeklyRecord())return true;
    const s=state(),selection=targetSelection();
    const program=s.autoRecovery&&myClub().fatigue>=45?'recovery':s.program;
    const def=TLM_WEEKLY_PROGRAMS.find(x=>x.id===program);
    if(!def||game.coins<def.cost)return false;
    if(def.target&&(!selection||selection.trainer.pokemonScouting?.mission?.status==='travel'))return false;
    const oldDraft=weeklyDraft,oldTarget=weeklyTarget;
    try{weeklyDraft=program;if(selection)weeklyTarget=selection.token;return applyWeeklyProgram();}
    finally{weeklyDraft=oldDraft;weeklyTarget=oldTarget;}
  }
  function displayStop(reason){
    state().notice=reason.text;
    if(reason.match)window.MatchdayPreparation?.render();
    persist();renderOffice();
  }
  const opening=()=>game.season===1&&game.round===0&&game.week<=4;
  const marketDeadline=()=>[4,15].includes(game.week)&&!game.pendingMatch;
  function nextAction(){
    if(game.pendingMatch)return {label:'경기 준비로 돌아가기',action:'match'};
    if(marketDeadline())return {label:game.week===4?'이적시장 마감 확인 · 개막전 준비':'이적시장 마감 확인 · 다음 일정',action:'progress'};
    return {label:opening()?'추천 계획으로 개막전 준비':'다음 중요 일정까지 진행',action:'progress'};
  }
  const priorNext=nextWeek;
  async function advance(automatic=false){
    if(!game||busy||(state().running&&!automatic))return false;
    const reason=blocker();if(reason){displayStop(reason);return false;}
    busy=true;const targetGame=game,targetClock=game.season+':'+game.week;
    try{
      if(!await settleResearch()){
        state().notice='이번 주 기술 연구를 완료하지 못했습니다. 기술 연구를 재시도한 뒤 진행해 주세요.';
        return false;
      }
      if(game!==targetGame||game.season+':'+game.week!==targetClock)return false;
      if(automatic&&!applyPolicy()){
        state().notice='기본 주간 계획을 실행할 수 없습니다. 대상·파견 여부·운영비를 확인해 주세요.';return false;
      }
      const before={season:game.season,week:game.week};
      await priorNext();
      window.PokemonExpedition?.resolvePlayer();
      return game.season!==before.season||game.week!==before.week;
    }finally{busy=false;persist();renderOffice();}
  }
  // Existing one-week controls also wait for research instead of discarding a late response.
  window.nextWeek=()=>advance(false);
  async function important(){
    if(busy||state().running)return;
    const g=game,s=state(),startWeek=g.week,startSeason=g.season,balance=g.coins,
      recordStart=g.weeklyPrograms?.length||0,logHead=g.log?.[0],logCount=g.log?.length||0,
      initialLedger=g.finance?.books?.[myClub().id]?.ledger||[],ledgerHead=initialLedger[0]?.id;
    s.running=true;stopRequested=false;
    let count=0,reason=null;
    try{
      for(let guard=0;guard<30;guard++){
        reason=blocker();if(reason)break;
        // Season settlement, academy intake and rollover always require a manual step.
        if([24,25,29,30].includes(game.week)){reason={text:'시즌 정산·신인 배출·새 시즌 전환을 직접 확인해 주세요.',tab:'calendar'};break;}
        if(stopRequested){reason={text:'감독이 진행을 중단했습니다.',tab:'home'};break;}
        const previous=game.week;
        if(!await advance(true)){
          reason=blocker()||{text:s.notice||'진행을 확인해 주세요.',tab:'home'};break;
        }
        count++;
        if(game!==g||game.season!==startSeason)break;
        reason=blocker();if(reason)break;
        if([4,15].includes(game.week)&&previous!==game.week){
          reason={text:'이적시장 마지막 주입니다. 마감 전 영입·계약을 확인해 주세요.',tab:'transfer'};break;
        }
        // Yield for the stop button and the new week's research request.
        await new Promise(resolve=>setTimeout(resolve,0));
      }
      if(game===g){
        const log=(game.log||[]),logIndex=logHead===undefined?-1:log.indexOf(logHead);
        const newlyLogged=logHead===undefined?log.slice(0,Math.max(0,log.length-logCount)):
          log.slice(0,logIndex<0?12:logIndex);
        const ledger=game.finance?.books?.[myClub().id]?.ledger||[];
        const ledgerIndex=ledgerHead===undefined?-1:ledger.findIndex(x=>x.id===ledgerHead);
        const transactions=ledgerHead===undefined?ledger.slice():ledger.slice(0,ledgerIndex<0?ledger.length:ledgerIndex);
        const finance={income:transactions.reduce((n,x)=>n+(Number(x.income)||0),0),
          expenses:transactions.reduce((n,x)=>n+(Number(x.expense)||0),0),
          paid:transactions.reduce((n,x)=>n+(Number(x.paid)||0),0),
          transactions:transactions.slice(0,10).map(x=>({label:x.label,week:x.week,income:x.income||0,expense:x.expense||0}))};
        const programs=(game.weeklyPrograms||[]).slice(recordStart)
          .map(x=>({week:x.week,title:x.title,detail:x.detail,cost:x.cost}));
        s.notice=reason?.text||'중요 일정까지 진행했습니다.';
        // A blocked button press must not create another identical progress report.
        if(count||programs.length||newlyLogged.length||transactions.length){
          s.summary={season:startSeason,from:startWeek,to:game.week,weeks:count,balance:game.coins-balance,
            programs,finance,events:newlyLogged.slice(0,12),reason:s.notice};
          s.history.unshift(s.summary);s.history.length=Math.min(s.history.length,10);
        }
      }
    }finally{if(game===g){s.running=false;persist();renderOffice();}}
    if(reason?.match)window.MatchdayPreparation?.render();
  }
  function policyHTML(){
    const s=state(),summary=s.summary,action=nextAction();
    return '<section class="management-policy">'+
      (marketDeadline()?'<div class="management-deadline"><strong>'+game.week+'주차 · 이적시장 마지막 결정 기회</strong><p>영입과 계약을 마쳤다면 아래 버튼을 눌러 마감을 승인하세요. 개막전에서는 선수 5명의 출전 순서와 포켓몬 상태를 직접 확인한 뒤 경기를 시작합니다.</p><button class="g-btn alt" onclick="setTab(&quot;transfer&quot;)">이적시장 확인</button></div>':'')+
      '<h3>주간 운영 방침</h3><p>추천 계획은 전술 분석 회의이며, 구단 피로 45 이상이면 회복으로 전환합니다. 실행한 주간 활동은 다시 적용하지 않습니다.</p>'+
      '<div class="management-controls"><label>기본 활동 <select onchange="ManagementUI.program(this.value)">'+['tactics','power','scrimmage','recovery'].map(id=>{
        const p=TLM_WEEKLY_PROGRAMS.find(x=>x.id===id);return '<option value="'+id+'" '+(s.program===id?'selected':'')+'>'+esc(p.title)+' · '+wonReadable(p.cost)+'</option>';
      }).join('')+'</select></label><label>훈련 대상 <select onchange="ManagementUI.target(this.value)"><option value="">전술 능력이 낮은 선수 우선</option>'+roster().map(t=>'<option value="'+esc(identity(t))+'" '+(s.target===identity(t)?'selected':'')+'>'+esc(t.name)+'</option>').join('')+'</select></label>'+
      '<label><input type="checkbox" '+(s.autoRecovery?'checked':'')+' onchange="ManagementUI.recovery(this.checked)"> 피로가 높으면 회복</label></div>'+
      '<div class="management-controls"><button class="g-btn" onclick="ManagementUI.'+(action.action==='match'?'openMatch':'important')+'()" '+(s.running?'disabled':'')+'>'+esc(action.label)+'</button><button class="g-btn alt" onclick="nextWeek()" '+(s.running?'disabled':'')+'>다음 주 · 직접 준비</button>'+
      (s.running?'<button class="g-btn alt" onclick="ManagementUI.stop()">진행 중단</button>':'')+
      '<button class="g-btn alt" onclick="ManagementUI.retryResearch()">기술 연구 재시도</button></div>'+
      '<p role="status">'+esc(s.notice||'진행 중에는 경기 준비·이적 제안·포획 후보·선수단 공석·시장 마감에서 멈춥니다.')+'</p>'+
      (summary?'<details class="management-progress-report"><summary>'+esc(summary.from+'→'+summary.to)+'주차 · '+esc(summary.weeks)+'주 진행 · 자금 증감 '+wonReadable(summary.balance)+'</summary>'+
        (summary.programs||[]).map(p=>'<p>'+esc(p.week)+'주 · '+esc(p.title)+' · '+esc(p.detail)+'</p>').join('')+
        (summary.finance?.transactions?.length?'<h4>구단 재정 정산</h4><p>수입 '+wonReadable(summary.finance.income)+' · 발생 지출 '+wonReadable(summary.finance.expenses)+' (실제 지급 '+wonReadable(summary.finance.paid)+')</p>'+
          summary.finance.transactions.map(x=>'<p>'+esc(x.week)+'주 · '+esc(x.label)+' · '+(x.income?'수입 '+wonReadable(x.income):'지출 '+wonReadable(x.expense))+'</p>').join(''):'')+
        (summary.events?.length?'<h4>진행 중 발생한 활동</h4><ul>'+summary.events.map(v=>'<li>'+esc(v)+'</li>').join('')+'</ul>':'')+
        '<p>훈련·탐색·AI 구단 처리는 각 주차에 정산합니다. 급여 내역은 재정 화면에서 확인할 수 있습니다.</p></details>':'')+'</section>';
  }
  const previousRender=renderOffice;
  window.renderOffice=function(){
    previousRender();if(!game)return;
    const panel=document.getElementById('dashpanel'),nav=document.querySelector('#dashboard .dashnav');
    if(!panel||!nav)return;
    const group=tabGroup(tab),s=state();s.views ||= {};s.views[group]=tab;
    const buttons=[...nav.children];
    nav.replaceChildren();nav.classList.add('management-nav');
    for(const [key,[name,defaultTab]] of Object.entries(groups)){
      const button=document.createElement('button');button.textContent=name;
      button.className=group===key?'active':'';button.setAttribute('aria-current',group===key?'page':'false');
      button.onclick=()=>setTab(s.views[key]||defaultTab);nav.append(button);
    }
    const sub=document.createElement('div');sub.className='management-subnav';
    const classify=b=>/이적/.test(b.textContent)?'recruit':/트레이너|프로필|포켓몬|게임 플랜|스카우트|주간|아카데미/.test(b.textContent)?'squad':
      /리그|일정|캘린더|은퇴/.test(b.textContent)?'league':/개요|감독실/.test(b.textContent)?'home':'club';
    for(const b of buttons)if(classify(b)===group)sub.append(b);
    nav.after(sub);
    if(group!=='squad')panel.querySelectorAll('.at-panel').forEach(x=>x.remove());
    if(tab==='home'||tab==='weekly'){
      if(tab==='home')panel.querySelectorAll('.tlm-weekly-mini').forEach(x=>x.remove());
      panel.insertAdjacentHTML('afterbegin',policyHTML());
    }
    if(tab==='home'){
      const reason=blocker();
      if(reason){const action=document.createElement('button');action.className='g-btn management-action';action.textContent=reason.text;
        action.onclick=()=>reason.match?window.MatchdayPreparation.render():setTab(reason.tab);panel.prepend(action);}
    }
  };
  window.ManagementUI={advance,important,blocker,policyHTML,tabGroup,
    openMatch:()=>window.MatchdayPreparation?.render(),
    stop:()=>{stopRequested=true;},
    program:v=>{if(['tactics','power','scrimmage','recovery'].includes(v)){state().program=v;persist();renderOffice();}},
    target:v=>{state().target=v||null;persist();renderOffice();},
    recovery:v=>{state().autoRecovery=!!v;persist();renderOffice();},
    retryResearch:async()=>{if(busy||state().running)return;const key=game.season+':'+game.week;if(game.trainerAI?.moveAttempts)delete game.trainerAI.moveAttempts[key];await window.TrainerMoveAI?.queue();renderOffice();}
  };
  // An interrupted progress loop is never automatically restarted after reload.
  if(game){state().running=false;renderOffice();}
  const style=document.createElement('style');style.textContent=`
    #dashboard .management-nav{display:grid!important;grid-template-columns:repeat(5,minmax(0,1fr));position:sticky;top:0;z-index:20;overflow:visible!important;background:#102031;padding:8px 0;gap:5px}
    #dashboard .management-nav button{min-width:0!important;padding:10px 4px;font-size:14px}
    .management-subnav{display:flex;flex-wrap:wrap;gap:7px;margin-bottom:12px}.management-subnav button{background:#21384d;color:white;border:1px solid #587187;padding:7px 10px;border-radius:5px}.management-subnav .active{border-color:#7bd5b5}
    .management-policy{background:#183447;border:1px solid #43667a;border-radius:8px;padding:15px;margin-bottom:16px}.management-policy h3{margin:0}.management-policy p{font-size:12px;line-height:1.6}
    .management-deadline{border:1px solid #477f74;background:#173d41;border-radius:8px;padding:12px;margin-bottom:14px}.management-deadline strong{font-size:17px;color:#d1fff0}.management-deadline{border-color:#a88142;background:#473a2c}.management-deadline strong{color:#ffe5ad}.management-progress-report{margin-top:12px}.management-progress-report summary{cursor:pointer}.management-progress-report ul{padding-left:19px;font-size:12px;line-height:1.7}
    .management-controls{display:flex;gap:10px;flex-wrap:wrap;align-items:center;margin:12px 0}.management-controls label{font-size:12px;display:grid;gap:5px}.management-controls select{padding:8px;max-width:100%;background:#203e52;color:white;border:1px solid #7394a6}.management-action{width:100%;margin-bottom:12px}
    @media(max-width:650px){#dashboard .dashpanel{padding:12px}.management-controls>*{max-width:100%}.management-controls select{min-width:0}.management-policy{padding:11px}}
  `;document.head.append(style);
})();
