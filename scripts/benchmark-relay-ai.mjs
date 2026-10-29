/** Paired-seed, side-swapped complete five-trainer relay performance baseline.
 * Usage: node scripts/benchmark-relay-ai.mjs [pairs=2] [balanced|offense|all]
 * Measures actual 5-on-5 succession, HP/PP carry, and autonomous actions.
 */
import {performance} from 'node:perf_hooks';
import {simulateClubMatch} from '../src/battle/club-match.js';

const pairs=Number(process.argv[2]||2),selection=process.argv[3]||'all';
if(!Number.isInteger(pairs)||pairs<1||pairs>12)throw new RangeError('pairs 1..12');
const rosters={
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
 ]
};
if(selection!=='all'&&!Object.hasOwn(rosters,selection))throw new RangeError('roster');
const statKeys=['hp','atk','def','spa','spd','spe'];
const stats=Object.fromEntries(statKeys.map(s=>[s,130]));
const pa=Object.fromEntries(statKeys.map(s=>[s,170]));
const createClub=(roster,expert,side)=>Array.from({length:5},(_,t)=>({
 name:side+'-trainer-'+t,
 team:roster.map(([species,moves],i)=>({name:side+'-'+t+'-'+i,species,moves,nature:'Hardy',
  statCA:{...stats},statPA:{...pa}})),
 tactics:expert?20:1,switching:expert?20:1,
 moveJudgment:expert?20:1,switchJudgment:expert?20:1,
 battleAnalysis:expert?20:1,resourceManagement:expert?20:1,
 aiProfile:expert?{preservation:20,analysis:20,moveSkill:20,switchSkill:20,
  habitScores:{pp:80,preserve:65},traits:['PP 관리자','에이스 보존']}:{}
}));
const empty=()=>({games:0,expertWins:0,noviceWins:0,ties:0,duels:0,
 ppSaves:0,voluntarySwitches:0,expertMoves:0,rollouts:0,fallBacks:0,
 turns:0,durationMs:0,expertFinalLiving:0,bySide:{A:0,B:0}});
function count(out,record,expertSide){
 record.games++;
 const victor=out.winner==='tie'?'tie':out.winner===expertSide?'expert':'novice';
 record[victor==='tie'?'ties':victor==='expert'?'expertWins':'noviceWins']++;
 if(victor==='expert')record.bySide[expertSide]++;
 record.duels+=out.rounds.length;
 for(const r of out.rounds){
  const d=r.result.aiDecisions[expertSide==='A'?'p1':'p2'];
  record.ppSaves+=d.ppConservations||0;
  record.voluntarySwitches+=d.voluntarySwitches||0;
  record.expertMoves+=d.moves||0;
  record.rollouts+=d.rollouts||0;
  record.fallBacks+=d.rolloutFallbacks||0;
  record.turns+=r.result.turns;
 }
 const last=out.rounds.at(-1),side=expertSide==='A'?'p1':'p2';
 record.expertFinalLiving+=last.result.finalState[side].filter(p=>p.hp>0).length;
}
const overall=empty(),byRoster={},games=[];
for(const [label,roster] of Object.entries(rosters)){
 if(selection!=='all'&&label!==selection)continue;
 const group=empty();byRoster[label]=group;
 for(let i=0;i<pairs;i++){
  for(const side of ['A','B']){
   const a=createClub(roster,side==='A','A'),b=createClub(roster,side==='B','B');
   const start=performance.now();
   const result=await simulateClubMatch(a,b,{seed:[11+i*97,23+i*97,31+i*97,43+i*97],maxTurns:160});
   const ms=Math.round(performance.now()-start);
   for(const dest of [group,overall]){count(result,dest,side);dest.durationMs+=ms;}
   games.push({roster:label,seed:i,expertSide:side,
    winner:result.winner,duels:result.rounds.length,ms,
    defeated:result.trainersDefeated});
  }
 }
}
console.log(JSON.stringify({pairs,overall,byRoster,games},null,2));
