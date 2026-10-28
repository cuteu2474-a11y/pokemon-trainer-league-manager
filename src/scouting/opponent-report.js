import {teamSpecialty} from '../battle/team-specialty.js';
import {readFileSync} from 'node:fs';
import {Dex} from '@pkmn/sim';
import {meanStatCA} from '../core/stat-potential.js';

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
function pokemonPower(mon){return meanStatCA(mon);}
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
      strength:pokemonPower(mon),
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
  return {specialty:teamSpecialty(team),index,name:String(trainer.name||'트레이너 '+(index+1)),skills,team,
    traits,play,types:byType,patterns,averagePower:Math.round(team.reduce((s,m)=>s+m.strength,0)/6),

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
  if(own.traits.includes('PP 관리자')&&opponent.averagePower<own.averagePower+8)
    return {plan:'endurance',behavior:'pp',
      reason:'PP 관리 경험을 살려, 확실한 마무리가 아니라면 강력한 기술을 아껴 사용하세요.'};
  if(own.team.some(mon=>mon.statusMoves.length>0)&&opponent.patterns.offensive)
    return {plan:'control',behavior:'status',
      reason:'보유한 견제 기술로 상대의 공격적인 플레이를 늦출 수 있는지 검토하세요.'};
  if(own.skills.switching>=own.skills.tactics+2&&pair.vulnerability>=pair.offense-.15)
    return {plan:'control',behavior:'matchup',
      reason:'교체 판단 능력이 강점입니다. 적절한 상성 교체로 위험을 줄이세요.'};
  if(own.skills.tactics>=own.skills.switching+2&&pair.score>=-10)
    return {plan:'offense',behavior:'kill',
      reason:'공격적인 전술 판단이 강점입니다. 상대를 처치할 기회를 우선 살펴보세요.'};
  if(own.averagePower+5<opponent.averagePower)
    return {plan:'endurance',behavior:'preserve',
      reason:'포켓몬 평균 전력이 열세입니다. 현재 교전에서 무리한 소모를 피하세요.'};
  if(own.averagePower>opponent.averagePower+5&&pair.score>=-10)
    return {plan:'offense',behavior:'kill',
      reason:'포켓몬 전력 우세가 있습니다. 확정 처치를 놓치지 않는 운영을 권고합니다.'};
  if(opponent.patterns.status)
    return {plan:'control',behavior:'status',
      reason:'견제 위주 대결이 예상됩니다. 상태이상이 실제로 유효한지 검토하세요.'};
  if(pair.offense>=pair.vulnerability&&pair.score>=-10)
    return {plan:'offense',behavior:'kill',
      reason:'맞붙는 상성이 나쁘지 않습니다. 적절한 처치 기회를 탐색해 보세요.'};
  if(own.skills.switching>=14)
    return {plan:'control',behavior:'matchup',
      reason:'교체 판단력이 높은 트레이너입니다. 불리한 대면을 피하는 운영을 권합니다.'};
  if(own.skills.tactics>=14)
    return {plan:'offense',behavior:'kill',
      reason:'전술 능력이 강점인 트레이너입니다. 무리하지 않는 선에서 공격 기회를 활용하세요.'};
  return {plan:'balanced',behavior:'analysis',
    reason:'뚜렷한 상성 우위가 없어 상대의 행동 후보를 비교하는 운영을 권합니다.'};
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
export function analyzeOpponent({home,away,playerClubId,season=1,round=1,selectedOrder}={}){
  if(!home||!away||home.id===away.id||!Array.isArray(home.trainers)||
    !Array.isArray(away.trainers)||home.trainers.length!==5||away.trainers.length!==5)
    throw new RangeError('서로 다른 구단의 주전 트레이너 5명이 필요합니다.');
  if(String(playerClubId)!==String(home.id)&&String(playerClubId)!==String(away.id))
    throw new RangeError('분석할 감독의 소속 구단이 경기 상대가 아닙니다.');
  const own=String(home.id)===String(playerClubId)?home:away;
  const rival=own===home?away:home;
  const ours=own.trainers.map(profile),theirs=rival.trainers.map(profile);
  const matrix=ours.map(o=>theirs.map(t=>pairingScore(o,t)));
  // A human manager decides the lineup. Analyze that order without suggesting
  // or overwriting it; AI coaches still use independent optimization below.
  if(selectedOrder!==undefined&&(!Array.isArray(selectedOrder)||selectedOrder.length!==5||
    new Set(selectedOrder).size!==5||selectedOrder.some(i=>!Number.isInteger(i)||i<0||i>4)))
    throw new RangeError('감독이 선택한 출전 순서에는 트레이너 5명이 한 번씩 필요합니다.');
  const recommendedOrder=selectedOrder===undefined?recommendOrder(matrix):undefined;
  const matches=orderedPlans(ours,theirs,matrix,selectedOrder||recommendedOrder);
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
  return {engine:'showdown-scout',specialtySchema:1,season,round,playerClubId:own.id,
    opponentId:rival.id,opponentName:rival.name,
    opponents:theirs.map(({index,name,skills,traits,play,types,patterns,
      averagePower,team,specialty})=>({specialty,index,name,skills,traits,play,types,
      patterns,averagePower,
      // Existing public rosters are visible, but exact unknown moves are not invented.
      pokemon:team.map(({name,types,movesKnown})=>({name,types,movesKnown}))})),
    ownTrainers:ours.map(t=>({index:t.index,name:t.name,traits:t.traits,play:t.play,specialty:t.specialty})),
    typeDistribution:types,tendency,matrix,
    ...(selectedOrder===undefined?{recommendedOrder}:{selectedOrder:selectedOrder.slice()}),matches,
    note:'실제 대전 결과나 확정 승률이 아니라 현재 공개된 포켓몬과 전술 성향에 따른 비교 분석입니다. KOF 연승전에서는 현재 출전 순서의 주자끼리 반드시 1:1 대결하는 것은 아닙니다.'};
}

/**
 * AI coaches get the same 120-order optimization as the player, without
 * receiving unrevealed opposing moves, potential, IV/CA, trust or tactics.
 * These are match recommendations, not unconditional trainer commands.
 */
export function prepareAICoach({home,away,aiClubId,season=1,round=1}={}){
 if(!home||!away||String(home.id)===String(away.id)||
    (String(aiClubId)!==String(home.id)&&String(aiClubId)!==String(away.id)))
   throw new RangeError('AI 감독의 소속 구단이 경기 상대가 아닙니다.');
 const own=String(aiClubId)===String(home.id)?home:away;
 const opponent=own===home?away:home;
 if(!Array.isArray(opponent.trainers)||opponent.trainers.length!==5||
    opponent.trainers.some(t=>!t||!Array.isArray(t.pokemon)||t.pokemon.length!==6))
   throw new RangeError('상대의 주전 트레이너 5명과 각 포켓몬 6마리가 필요합니다.');
 const publicRoster={
  id:opponent.id,name:opponent.name,
  trainers:opponent.trainers.map(t=>({
   name:t.name,
   tactics:10,switching:10,
   pokemon:t.pokemon.map(mon=>({name:mon.name,species:mon.species})),
  })),
 };
 const analysis=analyzeOpponent({
  home:own,away:publicRoster,playerClubId:own.id,season,round
 });
 const order=analysis.recommendedOrder;
 return {
  engine:'ai-coach-preparation',version:1,aiClubId:own.id,
  opponentId:opponent.id,season,round,order,
  // Index is the original roster slot, not the new position in the lineup.
  directives:analysis.matches.map(m=>({
   trainerIndex:m.trainerIndex,plan:m.plan,behavior:m.behavior,
   assessment:m.advantage,reason:m.reason,
  })),
  visibleInformation:'공개 포켓몬 종·타입과 AI 자신의 선수단 전력',
 };
}
