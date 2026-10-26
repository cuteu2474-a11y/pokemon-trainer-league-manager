import {readFileSync} from 'node:fs';
import {Dex} from '@pkmn/sim';

const speciesKo=JSON.parse(readFileSync(new URL('../web/species-ko.json',import.meta.url),'utf8'));
const dexByNumber=new Map(Dex.species.all().filter(species=>species.num>0&&!species.forme)
  .map(species=>[species.num,species]));
const TRAITS=['킬각 포착','적극적인 교체','상성 교체 전문가','에이스 보존',
  'PP 관리자','상태이상 전문가','전황 분석가'];
const PLANS=['balanced','offense','control','endurance','tempo'];
const ADVICE=['kill','switch','matchup','preserve','pp','status','analysis'];
const clamp=(n,min,max)=>Math.min(max,Math.max(min,n));
function speciesFor(mon){
  const id=mon?.species||mon?.name;
  if(typeof id!=='string')return null;
  const candidate=Dex.species.get(id);
  if(candidate.exists)return candidate;
  return dexByNumber.get(speciesKo[id])||null;
}
function pokemonPower(mon){
  const ca=Number(mon?.ca??mon?.power);
  return Number.isFinite(ca)?clamp(ca,1,200):65;
}
function rawMoves(mon){
  if(!Array.isArray(mon?.moves))return [];
  return mon.moves.slice(0,4).map(move=>Dex.moves.get(move)).filter(move=>move.exists);
}
function profile(trainer,index){
  if(!trainer||!Array.isArray(trainer.pokemon)||trainer.pokemon.length!==6)
    throw new RangeError('스카우팅에는 트레이너 5명과 각 포켓몬 6마리가 필요합니다.');
  const team=trainer.pokemon.map(mon=>{
    const species=speciesFor(mon);
    if(!species)throw new RangeError('알 수 없는 포켓몬: '+String(mon.name||mon.species));
    const moves=rawMoves(mon);
    return {name:mon.name||species.name,species:species.name,types:species.types,
      strength:pokemonPower(mon),level:clamp(Number(mon.level)||50,1,100),
      knownMoves:moves.filter(move=>move.category!=='Status').map(move=>({
        type:move.type,power:move.basePower,accuracy:move.accuracy})),
      statusMoves:moves.filter(move=>move.category==='Status').map(move=>move.id),
      movesKnown:moves.length>0};
  });
  const skills={tactics:clamp(Number(trainer.tactics)||10,1,20),
    switching:clamp(Number(trainer.switching)||10,1,20)};
  const traits=(trainer.autonomyAI?.playTraits||[]).filter(trait=>TRAITS.includes(trait));
  const preferred=trainer.autonomyAI?.preferredPlay;
  const play=PLANS.includes(preferred)?preferred:
    skills.tactics-skills.switching>=3?'offense':
    skills.switching-skills.tactics>=3?'control':'balanced';
  const byType={};
  for(const mon of team)for(const type of mon.types)byType[type]=(byType[type]||0)+1;
  const patterns={
    status:traits.includes('상태이상 전문가')||
      team.some(mon=>mon.statusMoves.some(id=>['toxic','willowisp','thunderwave','spore','yawn'].includes(id))),
    offensive:play==='offense'||play==='tempo'||traits.includes('킬각 포착'),
    switch:traits.includes('적극적인 교체')||traits.includes('상성 교체 전문가'),
    preserve:traits.includes('에이스 보존')||traits.includes('PP 관리자')
  };
  return {index,name:String(trainer.name||'트레이너 '+(index+1)),skills,team,
    traits,play,types:byType,patterns,averagePower:Math.round(team.reduce((s,m)=>s+m.strength,0)/6),
    averageLevel:Math.round(team.reduce((s,m)=>s+m.level,0)/6),
    knownMoveCount:team.reduce((n,m)=>n+m.knownMoves.length+m.statusMoves.length,0)};
}
export function typeEffectiveness(attackType,defenderTypes){
  if(!Dex.types.get(attackType).exists||!Array.isArray(defenderTypes)||!defenderTypes.length)return 1;
  return defenderTypes.reduce((total,defenseType)=>total*
    (Dex.getImmunity(attackType,[defenseType])?
      2**Dex.getEffectiveness(attackType,[defenseType]):0),1);
}
function averageMatchup(attacker,defender){
  const against=defender.team;
  // Species types are visible; actual moves only count when the game already knows them.
  const hits=attacker.team.map(mon=>{
    const moves=mon.knownMoves.length?mon.knownMoves.map(m=>m.type):mon.types;
    const avg=against.reduce((sum,target)=>{
      const best=Math.max(...moves.map(type=>typeEffectiveness(type,target.types)));
      return sum+clamp(best,0,4);
    },0)/against.length;
    return avg;
  });
  return hits.reduce((s,v)=>s+v,0)/hits.length;
}
export function pairingScore(own,opponent){
  const offense=averageMatchup(own,opponent);
  const vulnerability=averageMatchup(opponent,own);
  const skill=(own.skills.tactics+own.skills.switching-
    opponent.skills.tactics-opponent.skills.switching)*1.1;
  const power=(own.averagePower-opponent.averagePower)*.37;
  const typeScore=(offense-vulnerability)*21;
  const versatility=own.traits.length-opponent.traits.length;
  const score=clamp(Math.round(skill+power+typeScore+versatility*1.5),-100,100);
  return {score,offense:Number(offense.toFixed(2)),
    vulnerability:Number(vulnerability.toFixed(2)),
    reason:offense-vulnerability>=.35?'공격 상성 우세':
      vulnerability-offense>=.35?'상대 공격에 취약':
      power+skill>8?'기본 전력·판단 능력 우세':
      power+skill< -8?'상대 기본 전력 우세':'상성이 비슷해 운영이 중요'};
}
function instructions(own,opponent,pair){
  if(opponent.patterns.status&&own.traits.includes('상성 교체 전문가'))
    return {plan:'control',behavior:'matchup',
      reason:'상태이상 견제가 예상됩니다. 교체 가능한 상대와 포켓몬을 비교하세요.'};
  if(opponent.patterns.offensive&&pair.vulnerability>=pair.offense+.3)
    return {plan:'endurance',behavior:'preserve',
      reason:'상대의 공격 성향과 불리한 상성을 고려해 주력 포켓몬의 위험을 줄이세요.'};
  if(pair.offense>=pair.vulnerability+.4&&pair.score>=0)
    return {plan:'offense',behavior:'kill',
      reason:'타입 상성이 유리합니다. 실제 처치할 수 있는 기회에 집중하세요.'};
  if(opponent.patterns.switch)
    return {plan:'control',behavior:'analysis',
      reason:'상대가 교체를 선호합니다. 행동 후보를 비교해 불리한 선택을 피하세요.'};
  if(opponent.patterns.preserve)
    return {plan:'tempo',behavior:'kill',
      reason:'상대가 전력 보존을 선호합니다. 무리하지 않는 범위에서 처치 기회를 잡으세요.'};
  if(pair.vulnerability>pair.offense+.22)
    return {plan:'control',behavior:'matchup',
      reason:'상성 열세가 예상됩니다. 피해를 줄일 교체 후보를 우선 검토하세요.'};
  if(pair.score< -15)
    return {plan:'balanced',behavior:'analysis',
      reason:'전력 열세가 예상됩니다. 전황 분석으로 불필요한 소모를 줄이세요.'};
  if(opponent.patterns.status)
    return {plan:'control',behavior:'status',
      reason:'견제 위주 대결이 예상됩니다. 상태이상이 실제로 유효한지 검토하세요.'};
  return {plan:'balanced',behavior:'analysis',
    reason:'크게 유리한 상성이 없어 상대 행동을 관찰하며 판단하는 편이 낫습니다.'};
}
function permutations(items){
  if(items.length<=1)return [items];
  return items.flatMap((item,i)=>permutations(items.filter((_,j)=>j!==i))
    .map(tail=>[item,...tail]));
}
/** Evaluate all 120 5-trainer orders, not an arbitrary heuristic sort. */
export function recommendOrder(matrix){
  if(!Array.isArray(matrix)||matrix.length!==5||matrix.some(row=>row.length!==5))
    throw new RangeError('5×5 트레이너 비교 데이터가 필요합니다.');
  // In KOF relay the current winner may continue; these are approximate pairings,
  // not predictions of which two trainers will actually meet.
  let best=null;
  for(const order of permutations([0,1,2,3,4])){
    let sum=0;
    for(let i=0;i<5;i++)sum+=matrix[order[i]][i].score*(1.16-i*.08);
    // Competitive early trainers are preferred, without making them mandatory.
    sum+=matrix[order[0]][0].score*.12;
    if(!best||sum>best.value+1e-8)best={order,value:sum};
  }
  return best.order;
}
function orderedPlans(home,away,matrix,order){
  return order.map((ownIndex,slot)=>{
    const opponent=away[slot],own=home[ownIndex],
      pair=matrix[ownIndex][slot],instruction=instructions(own,opponent,pair);
    return {slot,trainerIndex:ownIndex,trainerName:own.name,
      opponentIndex:slot,opponentName:opponent.name,
      advantage:pair.score,pairing:pair,plan:instruction.plan,
      behavior:instruction.behavior,reason:instruction.reason};
  });
}
export function analyzeOpponent({home,away,playerClubId,season=1,round=1}={}){
  if(!home||!away||home.id===away.id||!Array.isArray(home.trainers)||
    !Array.isArray(away.trainers)||home.trainers.length!==5||away.trainers.length!==5)
    throw new RangeError('서로 다른 구단의 주전 트레이너 5명이 필요합니다.');
  if(String(playerClubId)!==String(home.id)&&String(playerClubId)!==String(away.id))
    throw new RangeError('분석할 감독의 소속 구단이 경기 상대가 아닙니다.');
  const own=String(home.id)===String(playerClubId)?home:away;
  const rival=own===home?away:home;
  const ours=own.trainers.map(profile),theirs=rival.trainers.map(profile);
  const matrix=ours.map(o=>theirs.map(t=>pairingScore(o,t)));
  const recommendedOrder=recommendOrder(matrix);
  const matches=orderedPlans(ours,theirs,matrix,recommendedOrder);
  const types=Object.entries(theirs.reduce((out,t)=>{
    for(const [type,count] of Object.entries(t.types))out[type]=(out[type]||0)+count;
    return out;
  },{})).sort((a,b)=>b[1]-a[1]).slice(0,5).map(([name,count])=>({name,count}));
  const tendency={
    offense:theirs.filter(x=>x.patterns.offensive).length,
    status:theirs.filter(x=>x.patterns.status).length,
    switch:theirs.filter(x=>x.patterns.switch).length,
    preserve:theirs.filter(x=>x.patterns.preserve).length
  };
  return {engine:'showdown-scout',season,round,playerClubId:own.id,
    opponentId:rival.id,opponentName:rival.name,
    opponents:theirs.map(({index,name,skills,traits,play,types,patterns,
      averagePower,averageLevel,team})=>({index,name,skills,traits,play,types,
      patterns,averagePower,averageLevel,
      // Existing public rosters are visible, but exact unknown moves are not invented.
      pokemon:team.map(({name,types,level,movesKnown})=>({name,types,level,movesKnown}))})),
    ownTrainers:ours.map(t=>({index:t.index,name:t.name,traits:t.traits,play:t.play})),
    typeDistribution:types,tendency,matrix,recommendedOrder,matches,
    note:'실제 대전 결과나 확정 승률이 아니라 현재 공개된 포켓몬과 전술 성향에 따른 비교 분석입니다. KOF 연승전에서는 추천된 순서대로 1:1 대결이 일어나는 것은 아닙니다.'};
}
