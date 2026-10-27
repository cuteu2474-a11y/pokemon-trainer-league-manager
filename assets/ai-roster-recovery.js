/* AI squad recovery uses owned reserves, academy staff, and paid transfers. */
(() => {
  const valid=t=>!!t&&Array.isArray(t.pokemon)&&t.pokemon.length===6;
  const ready=c=>Array.isArray(c?.trainers)&&c.trainers.length===5&&c.trainers.every(valid);
  const score=t=>{
    const pokemon=t.pokemon||[];
    return Number(t.tactics||0)+Number(t.switching||0)+
      pokemon.reduce((sum,p)=>sum+Number(p.power||0),0)/6;
  };
  function recoverOwned(t){
    if(!t)return 0;
    t.pokemon ||= [];t.pokemonReserve ||= [];
    let moved=0;
    while(t.pokemon.length<6){
      const index=t.pokemonReserve.findIndex(p=>p&&
        (p.ownerTrainerId==null||String(p.ownerTrainerId)===String(t.uid)));
      if(index<0)break;
      const [mon]=t.pokemonReserve.splice(index,1);
      mon.ownerTrainerId ??= String(t.uid);
      t.pokemon.push(mon);moved++;
    }
    return moved;
  }
  function benchEntry(c){
    return (c.reserveTrainers||[]).map((t,i)=>({t,i,source:'reserve'}))
      .concat((c.trainerAcademy||[]).map((t,i)=>({t,i,source:'academy'})))
      .filter(x=>valid(x.t)).sort((a,b)=>score(b.t)-score(a.t))[0]||null;
  }
  function repair(c){
    if(!c||!Array.isArray(c.trainers))return {promoted:0,restored:0,ready:false};
    c.reserveTrainers ||= [];c.trainerAcademy ||= [];
    if(c.trainers.length<5)c.trainers.length=5;
    let restored=0,promoted=0;
    for(const t of [...c.trainers,...c.reserveTrainers,...c.trainerAcademy].filter(Boolean))
      restored+=recoverOwned(t);
    for(let slot=0;slot<5;slot++){
      const incumbent=c.trainers[slot];
      if(valid(incumbent))continue;
      const entry=benchEntry(c);if(!entry)continue;
      if(entry.source==='reserve'){
        // A partial starter keeps the same trainer and Pokémon ownership on the bench.
        c.trainers[slot]=entry.t;
        if(incumbent)c.reserveTrainers[entry.i]=incumbent;
        else c.reserveTrainers.splice(entry.i,1);
      }else{
        if(incumbent&&c.reserveTrainers.length>=5)continue;
        c.trainers[slot]=c.trainerAcademy.splice(entry.i,1)[0];
        if(incumbent)c.reserveTrainers.push(incumbent);
      }
      promoted++;
    }
    return {promoted,restored,ready:ready(c)};
  }
  function report(g,c,action,detail){
    g.aiRosterRecoveryHistory ||= [];
    const entry={season:g.season,week:g.week,clubId:c.id,club:c.name,action,detail};
    g.aiRosterRecoveryHistory.unshift(entry);
    g.aiRosterRecoveryHistory.length=Math.min(g.aiRosterRecoveryHistory.length,240);
    if(typeof aiRecord==='function')aiRecord(c,action,detail,false);
    return entry;
  }
  const outcome=(a,b)=>{
    const homeReady=ready(a),awayReady=ready(b);
    if(homeReady&&awayReady)return null;
    return {home:a.id,away:b.id,aScore:homeReady?5:0,bScore:awayReady?5:0,
      walkover:homeReady?'away':awayReady?'home':'double',engine:'roster-forfeit'};
  };
  function maintain(g,c,{allowMarket=true}={}){
    if(!g||!c||c.name===g.club)return {ready:ready(c),promoted:0,restored:0,signed:false};
    let result=repair(c),signed=false;
    const needsHelp=!result.ready;
    const clock=g.season+':'+g.week;
    g.aiRosterRecoveryAttempts ||= {};
    if(needsHelp&&allowMarket&&g.aiRosterRecoveryAttempts[c.id]!==clock&&
      typeof transferOpen==='function'&&transferOpen()&&typeof aiSignFreeAgent==='function'){
      g.aiRosterRecoveryAttempts[c.id]=clock;
      signed=!!aiSignFreeAgent(c);
      if(signed){const again=repair(c);result={
        promoted:result.promoted+again.promoted,restored:result.restored+again.restored,ready:again.ready};}
    }
    if(result.promoted||result.restored||signed)
      report(g,c,'선수단 공석 정비','예비 포켓몬 출전 '+result.restored+'마리 · 트레이너 승격 '+
        result.promoted+'명'+(signed?' · 자유계약 영입':'')+' · '+(result.ready?'출전 가능':'추가 보강 필요'));
    c.aiRosterReady=result.ready;
    return {...result,signed};
  }
  const api={valid,ready,recoverOwned,repair,maintain,outcome};
  window.AIRosterRecovery=api;
  if(typeof aiMaintainSquad==='function'){
    const previous=aiMaintainSquad;
    aiMaintainSquad=function(c){
      if(!game||c?.name===game.club)return previous(c);
      const first=api.maintain(game,c,{allowMarket:false});
      const ordinary=previous(c);
      const second=api.maintain(game,c);
      return !!ordinary||first.promoted>0||first.restored>0||second.promoted>0||
        second.restored>0||second.signed;
    };
  }
  if(typeof matchSim==='function'){
    const previous=matchSim;
    matchSim=function(a,b,...args){
      const forfeited=api.outcome(a,b);
      if(forfeited)return forfeited;
      return previous(a,b,...args);
    };
  }
  if(typeof applyMatch==='function'){
    const previous=applyMatch;
    applyMatch=function(result,...args){
      if(result.walkover!=='double')return previous(result,...args);
      const home=game.clubs[result.home],away=game.clubs[result.away];
      home.l++;away.l++;home.ga+=5;away.ga+=5;
      game.log?.unshift(home.name+' / '+away.name+' 양 구단 선수 부족 · 승점 없는 동반 몰수패');
    };
  }
})();
