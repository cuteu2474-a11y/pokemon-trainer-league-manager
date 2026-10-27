/** Career fatigue is independent of the temporary HP/PP restored between official matches. */
export const CONDITION_RULES=Object.freeze({version:1,weeklyRecovery:5,restRecovery:25,trainingRestAt:80});
const clamp=n=>Math.max(0,Math.min(100,Math.round(Number(n)||0)));
export const fatigue=person=>clamp(person?.fatigue);
export const condition=person=>({fatigue:fatigue(person),fitness:100-fatigue(person),judgmentPenalty:Math.floor(Math.max(0,fatigue(person)-40)/20)});
export const period=(season,week)=>(Number(season)-1)*30+Number(week);
export function awayAt(trainer,at){
 const mission=trainer?.pokemonScouting?.mission;if(!mission)return false;
 if(!at)return mission.status==='travel';
 if(typeof at==='string'){const [season,week]=at.split(':').map(Number);at={season,week};}
 const now=period(at.season,at.week),start=period(mission.season,mission.week);
 if(!Number.isFinite(now)||!Number.isFinite(start))return mission.status==='travel';
 return now>=start&&now<start+1;
}
export function conditionedTrainer(trainer){
 const penalty=condition(trainer).judgmentPenalty,skill=(key,fallback)=>Math.max(1,Math.min(20,(Number(trainer[key]??trainer[fallback]??trainer.tactics)||10)-penalty));
 return {...trainer,tactics:skill('tactics','tactics'),switching:skill('switching','tactics'),moveJudgment:skill('moveJudgment','tactics'),switchJudgment:skill('switchJudgment','switching'),battleAnalysis:skill('battleAnalysis','analysis')};
}
const members=c=>[...(c.trainers||[]),...(c.reserveTrainers||[]),...(c.trainerAcademy||[])].filter(Boolean);
const roster=t=>t.pokemon||[];
const change=(person,delta)=>{const before=fatigue(person);person.fatigue=clamp(before+delta);return person.fatigue-before;};
export function initializeCondition(g){
 g.squadCondition ||= {version:1,lastRecovery:period(g.season,g.week??1),matches:{},programs:{}};
 for(const c of g.clubs)for(const t of members(c)){t.fatigue=fatigue(t);for(const p of roster(t))p.fatigue=fatigue(p);}
 return g.squadCondition;
}
export function recoverWeek(g){
 const state=initializeCondition(g),now=period(g.season,g.week??1);if(now<=state.lastRecovery)return false;
 for(let from=state.lastRecovery;from<now;from++){
  const at={season:Math.floor((from-1)/30)+1,week:(from-1)%30+1};
  for(const c of g.clubs)for(const t of members(c))if(!awayAt(t,at)){change(t,-CONDITION_RULES.weeklyRecovery);for(const p of roster(t))change(p,-CONDITION_RULES.weeklyRecovery);}
 }
 state.lastRecovery=now;return true;
}
export function trainingLoad(trainer,mons,key){
 if(trainer.conditionTrainingPeriod===key||!mons.length)return false;
 trainer.conditionTrainingPeriod=key;change(trainer,2);for(const p of mons)change(p,2);return true;
}
export function programLoad(g,club,trainer,id){
 const state=initializeCondition(g),key=g.season+':'+g.week;if(state.programs[key])return false;
 state.programs[key]=id;
 const at={season:g.season,week:g.week};
 if(id==='recovery'){for(const t of members(club))if(!awayAt(t,at)){change(t,-25);for(const p of roster(t))change(p,-25);}}
 else if(trainer){change(trainer,id==='tactics'?2:4);if(id==='power'||id==='scrimmage')for(const p of roster(trainer))change(p,id==='power'?8:6);}
 return true;
}
/** Unique match ID and registered identities keep replays/retries from adding fatigue. */
export function matchLoad(g,m,{id,result=null}={}){
 const state=initializeCondition(g);if(!id||state.matches[id])return false;
 const loads=[];
 for(const [side,clubId] of [['p1',m.home],['p2',m.away]]){
  const club=g.clubs.find(c=>String(c.id)===String(clubId));if(!club)continue;
  if(!result?.rounds){for(const t of club.trainers.filter(Boolean)){loads.push([t,8]);for(const p of roster(t))loads.push([p,6]);}continue;}
  const team=result.teams[side==='p1'?'home':'away'],trainers=new Map(),pokemon=new Map();
  for(let duel=0;duel<result.rounds.length;duel++){
   const round=result.rounds[duel],index=round[side==='p1'?'trainerA':'trainerB'],registered=team[index];
   const live=club.trainers.find(t=>t&&((registered.uid!==undefined&&t.uid!==undefined&&String(t.uid)===String(registered.uid))||roster(t).some(p=>p.uid!==undefined&&registered.team.some(x=>x.pokemonId!==undefined&&String(x.pokemonId)===String(p.uid)))));
   if(!live)throw Error('컨디션 정산 대상 트레이너가 등록 명단과 다릅니다.');
   trainers.set(live,(trainers.get(live)||0)+1);let active=null,turn=0;
   const mark=()=>{if(!active)return;const keys=pokemon.get(active)||new Set();if(turn)keys.add(duel+':'+turn);pokemon.set(active,keys);};
   for(const line of round.log.split('\n')){
    const parts=line.split('|');if(parts[1]==='turn'){turn=Number(parts[2]);mark();}
    if(['switch','drag'].includes(parts[1])&&parts[2]?.startsWith(side)){
     const name=parts[2].split(': ').slice(1).join(': '),entry=registered.team.find(p=>p.name===name);
     active=entry?roster(live).find(p=>String(p.uid)===String(entry.pokemonId)):null;mark();
    }
   }
  }
  for(const [t,duels] of trainers)loads.push([t,8+Math.min(8,(duels-1)*2)]);
  for(const [p,turns] of pokemon)loads.push([p,6+Math.min(12,Math.ceil(turns.size/10))]);
 }
 for(const [person,amount] of loads)change(person,amount);state.matches[id]=true;
 return true;
}

export function projectedFatigue(person,trainer,from,to){
 let value=fatigue(person);const first=period(from.season,from.week),last=period(to.season,to.week);
 for(let clock=first;clock<last;clock++){const at={season:Math.floor((clock-1)/30)+1,week:(clock-1)%30+1};if(!awayAt(trainer,at))value=Math.max(0,value-5);}
 return value;
}
export function projectClubCondition(club,from,to){
 for(const trainer of members(club)){const source={...trainer};trainer.fatigue=projectedFatigue(source,source,from,to);for(const mon of roster(trainer))mon.fatigue=projectedFatigue(mon,source,from,to);}
 return club;
}
