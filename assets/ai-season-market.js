/* AI transfer priorities and auditable season-to-season squad strength. */
(() => {
  const complete=t=>!!t&&Array.isArray(t.pokemon)&&t.pokemon.length===6;
  const owned=c=>[...(c.trainers||[]),...(c.reserveTrainers||[]),...(c.trainerAcademy||[])].filter(Boolean);
  const clamp=(n,lo,hi)=>Math.max(lo,Math.min(hi,n));
  const activeIndex=c=>Math.round(Array.from({length:5},(_,i)=>{
    const t=c.trainers?.[i];
    if(!t)return 0;
    const fit=clamp((t.pokemon?.length||0)/6,0,1);
    return (typeof aiUnitScore==='function'?Math.max(0,aiUnitScore(t)):0)*fit;
  }).reduce((a,b)=>a+b,0)/5);
  function needs(g,c){
    const vacancies=Array.from({length:5},(_,i)=>c.trainers?.[i]).filter(t=>!complete(t)).length;
    const bench=owned({trainers:[],reserveTrainers:c.reserveTrainers,trainerAcademy:c.trainerAcademy})
      .filter(complete).length;
    let retiring=0;
    for(const t of c.trainers||[])for(const p of t?.pokemon||[])
      if(Number.isInteger(p.retirementSeason)&&p.retirementSeason<=g.season+1)retiring++;
    return {vacancies,bench,retiring};
  }
  function strategy(g,c){
    if(!g||!c||c.name===g.club)return null;
    if(c.aiSeasonStrategy?.season===g.season)return c.aiSeasonStrategy;
    const previous=(c.aiSeasonHistory||[]).find(x=>x.season===g.season-1);
    const pressure=needs(g,c);
    const focus=pressure.vacancies?'출전 공석 충원':
      pressure.retiring>=3?'세대 교체':
      previous?.rank>=8?'잔류 전력 보강':
      previous?.rank<=3?(c.division===0?'우승 경쟁':'승격 경쟁'):
      '전술 적합성 강화';
    c.aiSeasonStrategy={season:g.season,focus,recordedWeek:g.week,
      openingStrength:activeIndex(c),openingDivision:c.division,
      retiringAtStart:pressure.retiring,previousRank:previous?.rank??null};
    return c.aiSeasonStrategy;
  }
  function ensure(g){
    if(!g?.clubs)return;
    for(const c of g.clubs)strategy(g,c);
  }
  function candidateYears(g,t){
    const mons=t?.pokemon||[];
    if(!mons.length)return 0;
    return mons.reduce((sum,p)=>{
      const left=Number.isInteger(p.retirementSeason)?p.retirementSeason-g.season:
        10-(Number(p.careerSeasons)||1);
      return sum+clamp(left,0,8);
    },0)/mons.length;
  }
  function candidateScore(g,buyer,entry){
    const t=entry.e?.t,plan=strategy(g,buyer),value=Number(entry.score)||0;
    if(!plan||!t)return value;
    const years=candidateYears(g,t),power=typeof aiUnitScore==='function'?aiUnitScore(t):0;
    const weak=(buyer.trainers||[]).filter(complete).map(x=>aiUnitScore(x));
    const gap=power-(weak.length?Math.min(...weak):power);
    const pressure=needs(g,buyer);
    const youth=plan.focus==='세대 교체'||plan.focus==='잔류 전력 보강';
    return value+gap*(pressure.vacancies?0.2:0.1)+years*(youth?2.5:0.7)+
      (pressure.vacancies?14:0)-(years<1?16:0);
  }
  const reportSummary=(g,c,before)=>({season:g.season,division:c.division,
    rank:before.rank,points:before.points,opening:strategy(g,c).openingStrength,
    closing:before.strength,afterRetirements:activeIndex(c),focus:strategy(g,c).focus,
    transferCount:(g.transferHistory||[]).filter(x=>x.season===g.season&&
      x.to===c.name&&x.type?.startsWith('AI')).length});
  function settle(g,preRetirement){
    if(!g?.seasonSettled)return;
    for(const c of g.clubs){if(c.name===g.club)continue;
      c.aiSeasonHistory ||= [];
      if(c.aiSeasonHistory.some(x=>x.season===g.season))continue;
      const report=reportSummary(g,c,preRetirement.get(c.id));
      c.aiSeasonHistory.unshift(report);c.aiSeasonHistory.length=Math.min(c.aiSeasonHistory.length,12);
    }
  }
  const api={complete,activeIndex,needs,strategy,ensure,candidateYears,candidateScore,settle};
  window.AISeasonMarket=api;

  // Existing auction, valuation and owner-consent code remains authoritative.
  if(typeof aiPlacement==='function'){
    const previous=aiPlacement;
    aiPlacement=function(c,t){
      if(!complete(t)||owned(c).includes(t))return null;
      const slot=c.trainers?.findIndex(incumbent=>incumbent&&!complete(incumbent))??-1;
      if(slot>=0)return {kind:'repair',slot,delta:999};
      return previous(c,t);
    };
  }
  if(typeof aiBidFits==='function'){
    const previous=aiBidFits;
    aiBidFits=function(c,t,fee){
      const placement=typeof aiPlacement==='function'?aiPlacement(c,t):null;
      if(placement?.kind!=='repair')return previous(c,t,fee);
      const funds=Number(clubIdentity(c).budget)||0;
      const reserve=(typeof startingClubBudget==='function'?startingClubBudget(c.division):0)*.04;
      return Number.isFinite(fee)&&fee>=0&&funds-fee>=reserve?placement:null;
    };
  }
  if(typeof aiAcquire==='function'){
    const previous=aiAcquire;
    aiAcquire=function(c,t,reason){
      const placement=typeof aiPlacement==='function'?aiPlacement(c,t):null;
      if(placement?.kind!=='repair')return previous(c,t,reason);
      const incumbent=c.trainers[placement.slot];
      c.reserveTrainers ||= [];
      c.trainers[placement.slot]=t;
      if(incumbent){
        if(c.reserveTrainers.length<5)c.reserveTrainers.push(incumbent);
        else{
          game.freeAgents ||= [];
          game.freeAgents.push({trainer:incumbent,formerClub:c.name,reason:'선수단 정비'});
        }
      }
      return true;
    };
  }
  if(typeof aiTransferCandidates==='function'){
    const previous=aiTransferCandidates;
    aiTransferCandidates=function(buyer){
      ensure(game);
      return previous(buyer).filter(x=>complete(x.e?.t)&&
        (x.e.kind!=='active'||x.seller.name===game.club||
          (x.seller.reserveTrainers||[]).concat(x.seller.trainerAcademy||[]).some(complete)))
        .map(x=>({...x,score:candidateScore(game,buyer,x)}))
        .sort((a,b)=>b.score-a.score||a.fee-b.fee);
    };
  }
  if(typeof aiTransferWindow==='function'){
    const previous=aiTransferWindow;
    aiTransferWindow=function(...args){ensure(game);return previous(...args);};
  }
  if(typeof seasonSettlement==='function'){
    const previous=seasonSettlement;
    seasonSettlement=function(...args){
      if(!game||game.seasonSettled||game.round!==18)return previous(...args);
      ensure(game);
      const before=new Map(game.clubs.filter(c=>c.name!==game.club).map(c=>[c.id,{
        strength:activeIndex(c),rank:typeof clubSeasonMetrics==='function'?clubSeasonMetrics(c).rank:null,
        points:c.points}]));
      const result=previous(...args);
      if(result)settle(game,before);
      return result;
    };
  }
  if(typeof startNewSeason==='function'){
    const previous=startNewSeason;
    startNewSeason=function(...args){
      const before=game?.season,result=previous(...args);
      if(game&&game.season!==before){
        ensure(game);
        for(const c of game.clubs){if(c.name===game.club)continue;
          const plan=c.aiSeasonStrategy;
          if(typeof aiRecord==='function')aiRecord(c,'새 시즌 전략',plan.focus+
            ' · 전력 지수 '+plan.openingStrength+' · 이전 시즌 '+(plan.previousRank??'기록 없음')+'위',false);
        }
      }
      return result;
    };
  }
  if(typeof aiManagersHTML==='function'){
    const previous=aiManagersHTML;
    aiManagersHTML=function(...args){
      ensure(game);
      const html=previous(...args);
      const shown=game.clubs.filter(c=>c.name!==game.club&&
        (typeof aiDivisionFilter==='undefined'||aiDivisionFilter==='all'||String(c.division)===aiDivisionFilter));
      const c=shown.find(x=>x.id===aiClubFocus)||shown[0];
      if(!c)return html;
      const plan=strategy(game,c),current=activeIndex(c),trend=current-plan.openingStrength;
      const records=(c.aiSeasonHistory||[]).slice(0,6).map(r=>'<tr><td>'+r.season+'시즌</td><td>'+
        (r.division+1)+'부 '+(r.rank??'?')+'위</td><td>'+r.opening+' → '+r.closing+'</td><td>'+
        r.afterRetirements+'</td><td>'+r.transferCount+'건</td></tr>').join('');
      const block='<h3>구단 전력 변화와 이적 목표</h3><p class="g-muted">올 시즌 전략: '+
        escapeHTML(plan.focus)+' · 기록 시작 '+plan.recordedWeek+'주차 · 전력 지수 '+
        plan.openingStrength+' → '+current+' ('+(trend>=0?'+':'')+trend+') · 은퇴 임박 '+
        needs(game,c).retiring+'마리</p><p class="g-muted">전력 지수는 출전 5명의 트레이너·포켓몬 전력을 비교하는 참고값이며 경기 결과 보정치는 아닙니다.</p>'+
        '<div class="trainer-explorer-scroll"><table class="g-table"><thead><tr><th>시즌</th><th>최종 순위</th><th>시작 → 정산 전</th><th>은퇴 반영 후</th><th>영입</th></tr></thead><tbody>'+
        (records||'<tr><td colspan="5">아직 종료된 시즌 기록이 없습니다.</td></tr>')+'</tbody></table></div>';
      return html.replace('<h3>감독 의사결정 내역</h3>',block+'<h3>감독 의사결정 내역</h3>');
    };
  }
})();
