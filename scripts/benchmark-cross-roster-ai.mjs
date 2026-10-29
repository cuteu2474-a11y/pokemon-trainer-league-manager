/** Cross-roster, paired-seed five-trainer relay benchmark.
 * Compares expert and novice on the SAME roster matchup, swapping AI quality
 * between sides to balance side/roster advantage. The two sides use distinct
 * Pokémon squads, unlike mirror-vs-mirror trainer AI benchmarks.
 * Usage: node scripts/benchmark-cross-roster-ai.mjs [seedPairs=2]
 */
import {performance} from 'node:perf_hooks';
import {simulateClubMatch} from '../src/battle/club-match.js';
import {ownReserveStrength} from '../src/battle/relay-resource-policy.js';

const pairs=Number(process.argv[2]||2);
if(!Number.isInteger(pairs)||pairs<1||pairs>8)throw new RangeError('pairs must be 1..8');
const sets={
 balanced:[
  ['Garchomp',['earthquake','dragonclaw','rockslide','swordsdance']],
  ['Gyarados',['waterfall','icefang','earthquake','dragondance']],
  ['Venusaur',['energyball','sludgebomb','synthesis','toxic']],
  ['Arcanine',['flamethrower','extremespeed','willowisp','morningsun']],
  ['Togekiss',['dazzlinggleam','airslash','roost','thunderwave']],
  ['Mewtwo',['psychic','thunderbolt','icebeam','recover']]
 ],
 offense:[
  ['Dragonite',['dragonclaw','extremespeed','earthquake','dragondance']],
  ['Greninja',['surf','icebeam','darkpulse','uturn']],
  ['Excadrill',['earthquake','ironhead','rockslide','swordsdance']],
  ['Alakazam',['psychic','shadowball','focusblast','recover']],
  ['Rotom-Wash',['hydropump','voltswitch','willowisp','thunderbolt']],
  ['Scizor',['bulletpunch','uturn','swordsdance','roost']]
 ],
 endurance:[
  ['Blissey',['seismictoss','softboiled','thunderwave','flamethrower']],
  ['Toxapex',['surf','recover','toxic','haze']],
  ['Corviknight',['bravebird','roost','defog','uturn']],
  ['Clodsire',['earthquake','recover','toxicspikes','stealthrock']],
  ['Skeledirge',['torch song','shadowball','willowisp','slackoff']],
  ['Garganacl',['saltcure','recover','protect','earthquake']]
 ]
};
const matchups=[['balanced','offense'],['offense','endurance'],['endurance','balanced']];
const keys=['hp','atk','def','spa','spd','spe'];
const statCA=Object.fromEntries(keys.map(s=>[s,130]));
const statPA=Object.fromEntries(keys.map(s=>[s,170]));
const trainer=(roster,expert,side,trainerIndex)=>({
 name:side+' trainer '+trainerIndex,
 team:roster.map(([species,moves],i)=>({
  pokemonId:side+'-'+trainerIndex+'-'+i,name:side+'-'+trainerIndex+'-'+i,
  species,moves,nature:'Hardy',statCA:{...statCA},statPA:{...statPA}
 })),
 tactics:expert?20:1,switching:expert?20:1,
 moveJudgment:expert?20:1,switchJudgment:expert?20:1,
 battleAnalysis:expert?20:1,resourceManagement:expert?20:1,
 aiProfile:expert?{preservation:20,analysis:20,moveSkill:20,switchSkill:20,
  habitScores:{pp:80,preserve:65},traits:['PP 관리자','에이스 보존']}:{}
});
const fresh=()=>({games:0,expertWins:0,noviceWins:0,ties:0,duels:0,
 expertSwitches:0,expertMoves:0,expertPPSaves:0,expertRollouts:0,
 expertFallbacks:0,expertAliveOnLastDuel:0,
 expertAceEntrants:0,expertAceSurvivors:0,
 expertSwitchEvaluations:0,expertNeutralSwitchesAvoided:0,
 expertUrgentSwitches:0,expertAceReservesProtected:0,
 turns:0,durationMs:0});
const total=fresh(),perMatchup={},games=[];
const scenes={urgentSwitch:[],neutralSwitchAvoided:[],aceReserve:[]};
function tally(bucket,r,expertSide,elapsed){
 bucket.games++;bucket.durationMs+=elapsed;bucket.duels+=r.rounds.length;
 bucket[r.winner==='tie'?'ties':r.winner===expertSide?'expertWins':'noviceWins']++;
 const key=expertSide==='A'?'p1':'p2';
 const entryIndices=[...new Set(r.rounds.map(d=>
  expertSide==='A'?d.trainerA:d.trainerB))];
 const source=expertSide==='A'?r.teamA:r.teamB;
 for(const index of entryIndices){
  const best=source[index].team.reduce((a,b)=>
    ownReserveStrength(a)>=ownReserveStrength(b)?a:b);
  const prior=[...r.rounds].reverse().find(d=>
    (expertSide==='A'?d.trainerA:d.trainerB)===index);
  const state=prior.result.finalState[key].find(mon=>mon.pokemonId===best.pokemonId);
  bucket.expertAceEntrants++;
  if(state?.hp>0)bucket.expertAceSurvivors++;
 }
 for(const duel of r.rounds){
  const data=duel.result.aiDecisions[key];
  bucket.expertSwitches+=data.voluntarySwitches||0;
  bucket.expertMoves+=data.moves||0;
  bucket.expertPPSaves+=data.ppConservations||0;
  bucket.expertRollouts+=data.rollouts||0;
  bucket.expertFallbacks+=data.rolloutFallbacks||0;
  bucket.expertSwitchEvaluations+=data.switchAnalysis?.evaluations||0;
  bucket.expertNeutralSwitchesAvoided+=data.switchAnalysis?.avoided||0;
  bucket.expertUrgentSwitches+=data.switchAnalysis?.urgentSwitches||0;
  bucket.expertAceReservesProtected+=data.switchAnalysis?.aceProtected||0;
  if(bucket===total)for(const scene of data.switchAnalysis?.scenes||[]){
   const key=scene.decision==='urgent-switch'?'urgentSwitch':
     scene.decision==='ace-reserve'?'aceReserve':'neutralSwitchAvoided';
   if(scenes[key].length<12)scenes[key].push({
    ...scene,expertSide,matchup:r.matchup,
    duel:duel.trainerA+'-'+duel.trainerB});
  }
  bucket.turns+=duel.result.turns;
 }
 bucket.expertAliveOnLastDuel+=r.rounds.at(-1).result.finalState[key]
  .filter(mon=>mon.hp>0).length;
}
for(const [aName,bName] of matchups){
 const label=aName+' vs '+bName,group=fresh();perMatchup[label]=group;
 for(let i=0;i<pairs;i++)for(const expertSide of ['A','B']){
  const a=Array.from({length:5},(_,t)=>trainer(sets[aName],expertSide==='A','A',t));
  const b=Array.from({length:5},(_,t)=>trainer(sets[bName],expertSide==='B','B',t));
  const seed=[11+97*i,23+97*i,31+97*i,43+97*i];
  const began=performance.now();
  const result=await simulateClubMatch(a,b,{seed,maxTurns:160});
  result.matchup=label;
  result.teamA=a;result.teamB=b;
  const ms=Math.round(performance.now()-began);
  tally(total,result,expertSide,ms);tally(group,result,expertSide,ms);
  games.push({matchup:label,seedIndex:i+1,expertSide,winner:result.winner,
   duels:result.rounds.length,ms,defeated:result.trainersDefeated});
 }
}
console.log(JSON.stringify({pairs,total,perMatchup,games,scenes},null,2));
