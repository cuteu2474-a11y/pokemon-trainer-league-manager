/* Persistent AI manager contracts, board reviews and academy coaching policies. */
(() => {
  const FIRST=['강','김','나','박','서','윤','이','정','조','최','한','류','문','오','신','배','권','차','백','장'];
  const LAST=['민준','지훈','도윤','하준','예준','승우','현우','시온','서진','주원','태양','유진','도현','지환','재민','준영','민재','성민','지혁','서율'];
  const TYPES=['장기 육성형','전술 연구형','즉시 전력형','재정 관리형'];
  const STYLES=['균형 운영','압박 공격','안정 수비','역습 전술'];
  const clamp=(n,lo,hi)=>Math.max(lo,Math.min(hi,n));
  const hash=value=>{let h=2166136261;for(const ch of String(value))h=Math.imul(h^ch.charCodeAt(0),16777619)>>>0;return h>>>0;};
  const isAI=(g,c)=>!!g&&!!c&&c.name!==g.club;
  const allAI=g=>(g?.clubs||[]).filter(c=>isAI(g,c));
  function career(g,c){
    if(!isAI(g,c)||typeof aiManager!=='function')return null;
    const m=aiManager(c);
    m.coachCareer ||= {id:'coach:'+c.id+':1',generation:1,appointedSeason:g.season,
      contractUntil:g.season+2,seasonsCompleted:0,badSeasons:0,renewals:0,lastReviewedSeason:0};
    return m.coachCareer;
  }
  function makeSuccessor(g,c,old){
    const generation=old.coachCareer.generation+1;
    const n=hash('successor:'+g.seed+':'+c.id+':'+generation),p=hash('policy:'+c.id+':'+generation);
    const given=FIRST[n%FIRST.length];
    let name=given+LAST[(n>>>8)%LAST.length];
    if(name===old.name)name=given+LAST[((n>>>8)+1)%LAST.length];
    const m={name,
      personality:TYPES[p%TYPES.length],risk:30+(n>>>10)%61,youth:30+(p>>>8)%67,
      tactics:10+(n>>>17)%10,negotiation:8+(p>>>16)%12,
      preferredStyle:STYLES[(p>>>5)%STYLES.length],style:'균형 운영',
      confidence:62+(p>>>23)%17,weeklyDecisions:0,transfers:0,
      academyPromotions:0,trainingWeeks:0,development:0,
      lastAction:'신임 감독 취임',lastReason:'구단의 다음 시즌 목표 재설정',history:[],plan:'새 시즌 준비',
      coachCareer:{id:'coach:'+c.id+':'+generation,generation,appointedSeason:g.season+1,
        contractUntil:g.season+3,seasonsCompleted:0,badSeasons:0,renewals:0,lastReviewedSeason:g.season}};
    return m;
  }
  function record(g,c,status,detail){
    c.aiCoachDecisions ||= [];
    c.aiCoachDecisions.unshift({season:g.season,status,detail});
    c.aiCoachDecisions.length=Math.min(c.aiCoachDecisions.length,24);
    if(typeof aiRecord==='function'&&status!=='유임')aiRecord(c,status,detail,true);
  }
  function review(g,c){
    const existing=career(g,c),m=aiManager(c),r=m.lastSeasonReview;
    if(!existing||!r||r.season!==g.season||existing.lastReviewedSeason===g.season)
      return {status:'skip'};
    existing.lastReviewedSeason=g.season;
    existing.seasonsCompleted++;
    const poor=r.rank>=9||(r.rank>=7&&r.grade<=-8);
    existing.badSeasons=poor?existing.badSeasons+1:0;
    const expired=g.season>=existing.contractUntil;
    const dismissed=(existing.seasonsCompleted>=2&&existing.badSeasons>=2&&m.confidence<=42)||
      (expired&&existing.badSeasons>=1&&m.confidence<40);
    if(dismissed){
      c.aiCoachHistory ||= [];
      c.aiCoachHistory.unshift({id:existing.id,name:m.name,personality:m.personality,
        appointedSeason:existing.appointedSeason,leftSeason:g.season,
        seasonsCompleted:existing.seasonsCompleted,rank:r.rank,confidence:m.confidence,
        lastReviews:(m.history||[]).slice(0,8)});
      c.aiCoachHistory.length=Math.min(c.aiCoachHistory.length,20);
      const incoming=makeSuccessor(g,c,m);
      c.aiManager=incoming;
      delete c.aiYouthPolicy;
      record(g,c,'감독 경질',m.name+' 감독 '+r.rank+'위 · 부진 '+existing.badSeasons+
        '시즌 · 후임 '+incoming.name+' 감독 선임(다음 시즌 취임)');
      return {status:'dismissed',outgoing:m,incoming};
    }
    if(expired){
      existing.contractUntil=g.season+2;
      existing.renewals++;
      record(g,c,'감독 재계약',m.name+' 감독 · '+existing.contractUntil+
        '시즌까지 연장 · 직전 '+r.rank+'위');
      return {status:'renewed'};
    }
    record(g,c,'유임',m.name+' 감독 · '+r.rank+'위 · 이사회 신뢰 '+m.confidence);
    return {status:'retained'};
  }
  function policy(g,c){
    if(!isAI(g,c))return null;
    const contract=career(g,c),m=aiManager(c);
    if(c.aiYouthPolicy?.coachId===contract.id&&g.season<=c.aiYouthPolicy.reviewSeason)
      return c.aiYouthPolicy;
    const risk=(c.trainers||[]).reduce((n,t)=>n+(t?.pokemon||[]).filter(p=>
      Number.isInteger(p.retirementSeason)&&p.retirementSeason<=g.season+2).length,0);
    const focus=risk>=5||m.personality==='장기 육성형'?'신예 육성':
      m.personality==='즉시 전력형'?'즉시 전력':
      m.personality==='재정 관리형'?'저비용 육성':'전술 육성';
    const start=Math.max(g.season,contract.appointedSeason);
    c.aiYouthPolicy={coachId:contract.id,focus,startedSeason:start,reviewSeason:start+2,
      retiringAtStart:risk,mentoredWeeks:0,targetTrainerUid:null,lastMentoredWeek:null};
    return c.aiYouthPolicy;
  }
  function applyPolicy(g,c){
    const p=policy(g,c);if(!p)return null;
    const m=aiManager(c);
    if(p.focus==='신예 육성')m.youth=Math.max(m.youth,78);
    else if(p.focus==='즉시 전력')m.youth=Math.min(m.youth,50);
    else if(p.focus==='전술 육성')m.youth=Math.max(m.youth,57);
    return p;
  }
  const prospectScore=t=>{
    const headroom=Math.max(0,Number(t.profile?.pa||0)-Number(t.profile?.ca||0));
    return headroom/3+(typeof aiUnitScore==='function'?aiUnitScore(t):0)/10;
  };
  function mentor(g,c,week){
    const p=applyPolicy(g,c);if(!p)return false;
    const m=aiManager(c),contract=career(g,c);
    if(g.season<contract.appointedSeason)return false;
    const key=g.season+':'+week;
    if(p.lastMentoredWeek===key)return false;
    p.lastMentoredWeek=key;
    const cadence=p.focus==='신예 육성'?2:p.focus==='즉시 전력'?4:3;
    if((week+Number(c.id||0))%cadence!==0)return false;
    const pool=(c.trainerAcademy||[]).filter(t=>t&&t.tactics<20&&
      Array.isArray(t.pokemon)&&t.pokemon.length===6);
    if(!pool.length)return false;
    pool.sort((a,b)=>prospectScore(b)-prospectScore(a));
    const target=pool.find(t=>String(t.uid)===String(p.targetTrainerUid))||pool[0];
    p.targetTrainerUid=target.uid;
    p.mentoredWeeks++;
    target.aiTraining=(target.aiTraining||0)+1;
    // Reuse the existing five-training-session progression and 20-point cap.
    if(target.aiTraining>=5&&target.tactics<20){
      target.tactics++;target.aiTraining=0;
      if(typeof aiRecord==='function')aiRecord(c,'아카데미 전술 육성',
        target.name+' · 전술 '+target.tactics+'/20 · 감독 정책 '+p.focus,false);
    }
    return true;
  }
  function ensure(g){for(const c of allAI(g))applyPolicy(g,c);}
  const api={career,makeSuccessor,review,policy,applyPolicy,mentor,ensure};
  window.AICoachCareer=api;

  if(typeof aiMaintainSquad==='function'){
    const previous=aiMaintainSquad;
    aiMaintainSquad=function(c){if(isAI(game,c))applyPolicy(game,c);return previous(c);};
  }
  if(typeof aiWeeklyPlan==='function'){
    const previous=aiWeeklyPlan;
    aiWeeklyPlan=function(week,...args){
      ensure(game);
      const result=previous(week,...args);
      for(const c of allAI(game))mentor(game,c,week);
      return result;
    };
  }
  if(typeof aiTransferCandidates==='function'){
    const previous=aiTransferCandidates;
    aiTransferCandidates=function(buyer){
      if(!isAI(game,buyer))return previous(buyer);
      const p=applyPolicy(game,buyer);
      return previous(buyer).map(entry=>{
        const t=entry.e?.t,years=window.AISeasonMarket?.candidateYears?.(game,t)??
          ((t?.pokemon||[]).reduce((sum,p)=>sum+clamp(
            Number.isInteger(p.retirementSeason)?p.retirementSeason-game.season:10-(p.careerSeasons||1),
            0,8),0)/Math.max(1,t?.pokemon?.length||0));
        const score=Number(entry.score)||0;
        const bonus=p.focus==='신예 육성'?years*2.2:
          p.focus==='즉시 전력'?(typeof aiUnitScore==='function'?aiUnitScore(t)*.08:0):
          p.focus==='저비용 육성'?-(Number(entry.fee)||0)/18000000:years*.8;
        return {...entry,score:score+bonus};
      }).sort((a,b)=>b.score-a.score||a.fee-b.fee);
    };
  }
  if(typeof seasonSettlement==='function'){
    const previous=seasonSettlement;
    seasonSettlement=function(...args){
      if(!game||game.seasonSettled||game.round!==18)return previous(...args);
      ensure(game);
      const result=previous(...args);
      if(result)for(const c of allAI(game))review(game,c);
      return result;
    };
  }
  if(typeof startNewSeason==='function'){
    const previous=startNewSeason;
    startNewSeason=function(...args){
      const before=game?.season,result=previous(...args);
      if(game?.season!==before)ensure(game);
      return result;
    };
  }
  if(typeof aiManagersHTML==='function'){
    const previous=aiManagersHTML;
    aiManagersHTML=function(...args){
      ensure(game);
      const html=previous(...args);
      const clubs=allAI(game).filter(c=>aiDivisionFilter==='all'||String(c.division)===aiDivisionFilter);
      const c=clubs.find(c=>c.id===aiClubFocus)||clubs[0];
      if(!c)return html;
      const m=aiManager(c),contract=career(game,c),p=policy(game,c);
      const history=(c.aiCoachHistory||[]).slice(0,5).map(h=>'<tr><td>'+escapeHTML(h.name)+
        '</td><td>'+h.appointedSeason+'~'+h.leftSeason+'시즌</td><td>'+h.rank+
        '위 · '+h.confidence+'/100</td></tr>').join('');
      const block='<h3>감독 계약과 구단 육성 정책</h3><p class="g-muted">'+
        escapeHTML(m.name)+' 감독 · '+contract.appointedSeason+'시즌 취임 · '+
        contract.contractUntil+'시즌까지 계약 · 재계약 '+contract.renewals+'회 · 연속 부진 '+
        contract.badSeasons+'시즌</p><p class="g-muted">3시즌 육성 방향: '+
        escapeHTML(p.focus)+' · '+p.startedSeason+'~'+p.reviewSeason+'시즌 · 아카데미 지도 '+
        p.mentoredWeeks+'주'+(p.targetTrainerUid!=null?' · 육성 대상 지정':'')+
        '</p><p class="g-muted">재계약·경질은 시즌 종료 시점에만 심사합니다. 감독 교체로 트레이너나 포켓몬 소유권은 바뀌지 않습니다.</p>'+
        '<div class="trainer-explorer-scroll"><table class="g-table"><thead><tr><th>역대 감독</th><th>재임</th><th>마지막 평가</th></tr></thead><tbody>'+
        (history||'<tr><td colspan="3">감독 교체 기록이 없습니다.</td></tr>')+'</tbody></table></div>';
      return html.replace('<h3>감독 의사결정 내역</h3>',block+'<h3>감독 의사결정 내역</h3>');
    };
  }
})();
