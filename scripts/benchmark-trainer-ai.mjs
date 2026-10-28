/** Reproducible, equal-roster trainer AI smoke benchmark.
 * Run: node scripts/benchmark-trainer-ai.mjs 4
 * The two sides swap ratings for every seed. This small sample is diagnostic,
 * not a statistically significant claim about general competitive strength.
 */
import {performance} from 'node:perf_hooks';
import {simulateSixVsSix} from '../src/battle/showdown.js';

const pairs=Number(process.argv[2]||4);
if(!Number.isInteger(pairs)||pairs<1||pairs>20)
  throw new RangeError('Seed-pair count must be 1..20');

const ids=['hp','atk','def','spa','spd','spe'];
const ca=Object.fromEntries(ids.map(s=>[s,115]));
const pa=Object.fromEntries(ids.map(s=>[s,170]));
const team=[
  ['Garchomp',['earthquake','dragonclaw','rockslide','swordsdance']],
  ['Gyarados',['waterfall','icefang','earthquake','dragondance']],
  ['Venusaur',['energyball','sludgebomb','synthesis','toxic']],
  ['Arcanine',['flamethrower','extremespeed','willowisp','morningsun']],
  ['Togekiss',['dazzlinggleam','airslash','roost','thunderwave']],
  ['Mewtwo',['psychic','thunderbolt','icebeam','recover']],
].map(([species,moves],i)=>({name:`${species}-${i+1}`,species,moves,
  nature:'Hardy',statCA:{...ca},statPA:{...pa}}));

const rated=value=>({tactics:value,switching:value,moveJudgment:value,
  switchJudgment:value,battleAnalysis:value,resourceManagement:value});
const metrics={expertWins:0,noviceWins:0,ties:0,turns:0,expertSwitches:0,
  noviceSwitches:0,expertRollouts:0,noviceRollouts:0,expertFallbacks:0,
  noviceFallbacks:0,durationMs:0};
const games=[];

for(let i=0;i<pairs;i++){
  const seed=[1+i*101,2+i*101,3+i*101,4+i*101];
  for(const expertSide of ['p1','p2']){
    const expertP1=expertSide==='p1';
    const start=performance.now();
    const result=await simulateSixVsSix(team,team,{
      seed,maxTurns:90,trainerA:rated(expertP1?20:1),trainerB:rated(expertP1?1:20)});
    const elapsed=Math.round(performance.now()-start);
    const winner=result.winner==='tie'?'tie':
      result.winner===(expertP1?'Club A':'Club B')?'expert':'novice';
    metrics[winner==='tie'?'ties':winner==='expert'?'expertWins':'noviceWins']++;
    metrics.turns+=result.turns;metrics.durationMs+=elapsed;
    for(const [key,level] of [[expertSide,'expert'],[expertP1?'p2':'p1','novice']]){
      const data=result.aiDecisions[key];
      metrics[`${level}Switches`]+=data.voluntarySwitches;
      metrics[`${level}Rollouts`]+=data.rollouts;
      metrics[`${level}Fallbacks`]+=data.rolloutFallbacks;
    }
    games.push({seedIndex:i+1,expertSide,winner,turns:result.turns,durationMs:elapsed});
  }
}
const total=games.length;
const expertWinsBySide=Object.fromEntries(['p1','p2'].map(side=>[side,
  games.filter(game=>game.expertSide===side&&game.winner==='expert').length]));
console.log(JSON.stringify({pairCount:pairs,totalGames:total,roster:team.map(x=>x.species),
  ratings:{expert:20,novice:1},maxTurns:90,
  ...metrics,expertWinsBySide,averageTurns:Math.round(metrics.turns/total*10)/10,
  averageDurationMs:Math.round(metrics.durationMs/total),games},null,2));
