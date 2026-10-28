/** Reproducible paired-seed trainer AI benchmark.
 * Each roster is mirrored and the expert swaps p1/p2 for every seed.
 * Usage: node scripts/benchmark-trainer-ai.mjs [seedPairs=8] [all|balanced|offense|endurance] [turnCap=180]
 * Results are diagnostics, not guarantees of general competitive strength.
 */
import {performance} from 'node:perf_hooks';
import {simulateSixVsSix} from '../src/battle/showdown.js';

const pairs=Number(process.argv[2]||8);
const selection=process.argv[3]||'all';
const maxTurns=Number(process.argv[4]||180);
if(!Number.isInteger(maxTurns)||maxTurns<1||maxTurns>300)
  throw new RangeError('Turn cap must be 1..300');
if(!Number.isInteger(pairs)||pairs<1||pairs>20)
  throw new RangeError('Seed-pair count must be 1..20');

const stats=['hp','atk','def','spa','spd','spe'];
const ca=Object.fromEntries(stats.map(s=>[s,115]));
const pa=Object.fromEntries(stats.map(s=>[s,170]));
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
 ],
};
if(selection!=='all'&&!Object.hasOwn(sets,selection))
  throw new RangeError('Roster must be all, balanced, offense or endurance');
const selected=selection==='all'?Object.entries(sets):[[selection,sets[selection]]];
const rated=value=>({tactics:value,switching:value,moveJudgment:value,
 switchJudgment:value,battleAnalysis:value,resourceManagement:value});
const makeTeam=rows=>rows.map(([species,moves],i)=>({
 name:`${species}-${i+1}`,species,moves,nature:'Hardy',statCA:{...ca},statPA:{...pa}
}));
const fresh=()=>({games:0,expertWins:0,noviceWins:0,ties:0,turns:0,
 expertMoves:0,noviceMoves:0,expertSwitches:0,noviceSwitches:0,
 expertRollouts:0,noviceRollouts:0,expertFallbacks:0,noviceFallbacks:0,
 expertMistakeSelections:0,noviceMistakeSelections:0,durationMs:0,
 expertWinsBySide:{p1:0,p2:0},endReasons:{}});
function accumulate(bucket,row){
 bucket.games++;
 bucket[row.winner==='tie'?'ties':row.winner==='expert'?'expertWins':'noviceWins']++;
 bucket.turns+=row.turns;bucket.durationMs+=row.durationMs;
 if(row.winner==='expert')bucket.expertWinsBySide[row.expertSide]++;
 bucket.endReasons[row.endReason]=(bucket.endReasons[row.endReason]||0)+1;
 for(const [side,label] of [[row.expertSide,'expert'],[row.expertSide==='p1'?'p2':'p1','novice']]){
  const data=row.aiDecisions[side];
  bucket[`${label}Moves`]+=data.moves||0;
  bucket[`${label}Switches`]+=data.voluntarySwitches||0;
  bucket[`${label}Rollouts`]+=data.rollouts||0;
  bucket[`${label}Fallbacks`]+=data.rolloutFallbacks||0;
  bucket[`${label}MistakeSelections`]+=data.reasons?.['판단 실패 · 비슷한 선택지 중 선택']||0;
 }
}
const round=n=>Math.round(n*1000)/1000;
function summarize(x){
 return {...x,expertWinRate:round(x.expertWins/x.games),
  averageTurns:round(x.turns/x.games),
  averageDurationMs:round(x.durationMs/x.games),
  expertSwitchRate:round(x.expertSwitches/Math.max(1,x.expertMoves+x.expertSwitches)),
  noviceSwitchRate:round(x.noviceSwitches/Math.max(1,x.noviceMoves+x.noviceSwitches))};
}
const overall=fresh(),perRoster={};
const games=[];
for(const [rosterName,rows] of selected){
 const team=makeTeam(rows),metrics=fresh();
 for(let i=0;i<pairs;i++){
  const seed=[1+i*101,2+i*101,3+i*101,4+i*101];
  for(const expertSide of ['p1','p2']){
   const expertP1=expertSide==='p1';
   const start=performance.now();
   const result=await simulateSixVsSix(team,team,{
    seed,maxTurns,trainerA:rated(expertP1?20:1),trainerB:rated(expertP1?1:20)
   });
   const row={roster:rosterName,seedIndex:i+1,expertSide,
    winner:result.winner==='tie'?'tie':
      result.winner===(expertP1?'Club A':'Club B')?'expert':'novice',
    turns:result.turns,endReason:result.endReason,
    durationMs:Math.round(performance.now()-start),aiDecisions:result.aiDecisions};
   accumulate(metrics,row);accumulate(overall,row);
   games.push({roster:row.roster,seedIndex:row.seedIndex,expertSide:row.expertSide,
    winner:row.winner,turns:row.turns,endReason:row.endReason,durationMs:row.durationMs});
  }
 }
 perRoster[rosterName]={...summarize(metrics),roster:rows.map(x=>x[0])};
}
console.log(JSON.stringify({pairCount:pairs,totalGames:overall.games,selectedRosters:selected.map(x=>x[0]),
 ratings:{expert:20,novice:1},maxTurns,
 ...summarize(overall),perRoster,games},null,2));
