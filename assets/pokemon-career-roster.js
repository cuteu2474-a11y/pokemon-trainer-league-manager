/* Season careers and transfer roster integration. Keep battle lineups at six. */
(() => {
  const MIN_SEASONS=8,MAX_SEASONS=12;
  const hash=value=>{
    let n=2166136261;
    for(const ch of String(value))n=Math.imul(n^ch.charCodeAt(0),16777619)>>>0;
    return n>>>0;
  };
  const copy=value=>JSON.parse(JSON.stringify(value));
  const held=t=>[...(t.pokemon||[]),...(t.pokemonReserve||[])];
  const marketRoster=t=>held(t);
  function owners(g){
    const entries=[],seen=new Set();
    for(const club of g.clubs||[]){
      for(const t of [...(club.trainers||[]),...(club.reserveTrainers||[]),...(club.trainerAcademy||[])]){
        if(!t||seen.has(t))continue;
        seen.add(t);entries.push({club,t});
      }
    }
    for(const fa of g.freeAgents||[]){
      if(!fa.trainer||seen.has(fa.trainer))continue;
      seen.add(fa.trainer);entries.push({club:{id:'free',name:'자유계약',formerClub:fa.formerClub},t:fa.trainer});
    }
    return entries;
  }
  function prepare(g){
    if(!g)return;
    g.hallOfFame ||= [];
    g.retiredPokemon ||= [];
    for(const {club,t} of owners(g)){
      if(!Array.isArray(t.pokemon))t.pokemon=[];
      if(!Array.isArray(t.pokemonReserve))t.pokemonReserve=[];
      if(t.pokemon.length>6)t.pokemonReserve.unshift(...t.pokemon.splice(6));
      const mons=[...held(t),...(t.pokemonScouting?.candidate?[t.pokemonScouting.candidate]:[])];
      for(let index=0;index<mons.length;index++){
        const p=mons[index];if(!p)continue;
        if(!Number.isInteger(p.careerSeasons)||p.careerSeasons<1)p.careerSeasons=1;
        if(!Number.isInteger(p.debutSeason))p.debutSeason=g.season-p.careerSeasons+1;
        if(!Number.isInteger(p.retirementSpan)||p.retirementSpan<MIN_SEASONS||p.retirementSpan>MAX_SEASONS){
          const identity=p.uid??[club.id,t.uid??t.id??t.name,index,p.name,p.debutSeason].join(':');
          p.retirementSpan=MIN_SEASONS+hash(identity)%5;
        }
        // A migrated veteran must get at least two seasons of notice.
        if(!Number.isInteger(p.retirementSeason))
          p.retirementSeason=Math.max(p.debutSeason+p.retirementSpan-1,g.season+2);
        p.retirementNoticeSeason ??= p.retirementSeason-2;
      }
    }
  }
  function archive(g,club,t,p,reason){
    if(p.retiredSeason!=null)return false;
    const snapshot=copy(p);
    p.retiredSeason=g.season;
    const record={uid:p.uid??null,ownerTrainerId:p.ownerTrainerId??String(t.uid??t.id??''),
      name:p.name,trainer:t.name,trainerId:t.uid??t.id??null,club:club.name,
      season:g.season,careerSeasons:p.careerSeasons,retirementSeason:p.retirementSeason,
      reason,pokemon:snapshot};
    g.retiredPokemon.unshift(record);
    if(club.name===g.club)g.hallOfFame.unshift({...record});
    return true;
  }
  function settle(g){
    if(!g)return {retired:0,advanced:0};
    if(g.pokemonRetirementSettledSeason===g.season)return {retired:0,advanced:0,alreadySettled:true};
    prepare(g);
    let retired=0,advanced=0;
    for(const {club,t} of owners(g)){
      const groups=[t.pokemon,t.pokemonReserve];
      if(t.pokemonScouting?.candidate)groups.push([t.pokemonScouting.candidate]);
      for(const group of groups){
        for(let i=group.length-1;i>=0;i--){
          const p=group[i];if(!p)continue;
          if(p.retirementSeason<=g.season){
            if(archive(g,club,t,p,'활동 기간 만료'))retired++;
            if(group.length===1&&t.pokemonScouting?.candidate===p)delete t.pokemonScouting.candidate;
            else group.splice(i,1);
            if(club.name===g.club)g.log?.unshift(t.name+' · '+p.name+' 은퇴 · 자동 대체 없음');
          }else{
            p.careerSeasons++;
            advanced++;
            if(p.retirementSeason===g.season+2&&p.retirementNoticeLogged!==g.season){
              p.retirementNoticeLogged=g.season;
              if(club.name===g.club)g.log?.unshift(t.name+' · '+p.name+' 은퇴 예고: '+p.retirementSeason+'시즌 종료 예정');
            }
          }
        }
      }
    }
    g.pokemonRetirementSettledSeason=g.season;
    g.log?.unshift('시즌 '+g.season+' 포켓몬 경력 정산 · 은퇴 '+retired+'마리 · 무료 충원 없음');
    return {retired,advanced};
  }
  function archiveTrainer(g,club,t){
    prepare(g);
    const roster=[...held(t),...(t.pokemonScouting?.candidate?[t.pokemonScouting.candidate]:[])];
    if(club.name===g.club){
      // Remove the old active-six-only summaries; replace with full snapshots.
      g.hallOfFame=g.hallOfFame.filter(x=>!(x.reason==='담당 트레이너 은퇴'&&
        x.trainer===t.name&&x.club===club.name&&x.season===g.season&&!x.pokemon));
    }
    for(const p of roster)archive(g,club,t,p,'담당 트레이너 은퇴');
    g.retiredTrainers ||= [];
    g.retiredTrainers.unshift({season:g.season,club:club.name,trainer:copy(t),pokemonCount:roster.length});
    const history=(g.trainerRetirementHistory||[]).find(x=>x.season===g.season&&
      x.name===t.name&&x.club===club.name&&!x.trainerData);
    if(history){history.trainerData=copy(t);history.pokemonCount=roster.length;}
    return roster.length;
  }
  const career={MIN_SEASONS,MAX_SEASONS,held,marketRoster,prepare,settle,archiveTrainer};
  window.PokemonCareerRoster=career;

  if(typeof freshGame==='function'){
    const previous=freshGame;
    freshGame=function(...args){const g=previous(...args);career.prepare(g);return g;};
  }
  if(typeof game!=='undefined'&&game){career.prepare(game);if(typeof persist==='function')persist();}

  if(typeof preparePokemonCareers==='function')preparePokemonCareers=function(){career.prepare(game);};
  if(typeof pokemonRetirements==='function')pokemonRetirements=function(){return career.settle(game).retired;};
  if(typeof processTrainerRetirements==='function'){
    const previous=processTrainerRetirements;
    processTrainerRetirements=function(...args){
      if(!game)return previous(...args);
      const before=owners(game).filter(({club})=>club.id!=='free');
      const result=previous(...args);
      for(const {club,t} of before){
        if([...(club.trainers||[]),...(club.reserveTrainers||[]),...(club.trainerAcademy||[])].includes(t))continue;
        const count=career.archiveTrainer(game,club,t);
        if(club.name===game.club){
          const index=game.log.findIndex(s=>s.startsWith(t.name+' 자발적 은퇴'));
          if(index>=0)game.log[index]=t.name+' 자발적 은퇴 · 보유 포켓몬 '+count+'마리 경력 보존 · 출전 자리 공석';
        }
      }
      return result;
    };
  }

  if(typeof transferValuation==='function'){
    const previous=transferValuation;
    transferValuation=function(t,c){
      career.prepare(game);
      const base=previous(t,c),reserve=t.pokemonReserve||[];
      if(!reserve.length)return base;
      const best=reserve.map(p=>Math.max(0,Number(p.power)||0)).sort((a,b)=>b-a).slice(0,3);
      const factor=1+best.reduce((sum,v)=>sum+v,0)/900;
      return Math.max(50000000,Math.min(600000000,Math.round(base*factor/10000000)*10000000));
    };
  }
  if(typeof marketDisplayRow==='function'){
    const previous=marketDisplayRow;
    marketDisplayRow=function(item){
      const t=item.t,bench=t.pokemonReserve||[];
      if(!bench.length)return previous(item);
      const original='<td>'+t.pokemon.map(p=>escapeHTML(p.name)).join(' · ')+'</td>';
      return previous(item).replace(original,'<td>출전 '+t.pokemon.length+'마리 · 예비 '+bench.length+'마리'+
        '<div class="g-muted">'+bench.map(p=>escapeHTML(p.name)).join(' · ')+'</div></td>');
    };
  }
  if(typeof marketSelectedInfo==='function'){
    const previous=marketSelectedInfo;
    marketSelectedInfo=function(){
      const target=marketTarget(),free=typeof marketFreeSelected!=='undefined'&&marketFreeSelected>=0?
        game.freeAgents?.[marketFreeSelected]?.trainer:null;
      const t=target?.t||free;
      if(!t)return previous();
      career.prepare(game);
      const active=t.pokemon||[],bench=t.pokemonReserve||[],count=active.length+bench.length;
      let html=previous();
      html=html.replace('동반 이적하는 포켓몬 6마리',
        '동반 이적하는 보유 포켓몬 '+count+'마리 (출전 '+active.length+' · 예비 '+bench.length+')');
      html=html.replace('포켓몬 구성</small><strong>'+active.length+'마리',
        '포켓몬 구성</small><strong>'+count+'마리');
      let index=0;
      html=html.replace(/활동 (\d+)\/8시즌/g,(_match,age)=>{
        const p=active[index++];return '활동 '+age+'시즌 · '+(p?.retirementSeason||'?')+'시즌 종료 예정';
      });
      const reserveCards=bench.map((p,i)=>'<div class="fm-detail-mon"><strong>예비 '+(i+1)+'. '+
        escapeHTML(p.name)+'</strong><span>전투력 '+escapeHTML(p.power??'?')+' · 활동 '+
        (p.careerSeasons||1)+'시즌 · '+p.retirementSeason+'시즌 종료 예정</span></div>').join('');
      const content='<div class="profile-section-title">예비 포켓몬 '+bench.length+'마리 · 영입 시 전원 동행</div>'+
        '<div class="fm-detail-list">'+(reserveCards||'<div class="g-muted">예비 포켓몬이 없습니다.</div>')+'</div>';
      return html.replace('<div class="fm-detail-btns">',content+'<div class="fm-detail-btns">');
    };
  }
  if(typeof transferMarketHTML==='function'){
    const previous=transferMarketHTML;
    transferMarketHTML=function(...args){return previous(...args).replace(
      '트레이너와 포켓몬 6마리가 함께 이동합니다.',
      '트레이너와 보유 포켓몬 전원(출전 최대 6마리·예비 최대 6마리)이 함께 이동합니다.');};
  }
})();
