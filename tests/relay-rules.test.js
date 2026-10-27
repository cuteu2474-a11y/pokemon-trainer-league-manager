import test from 'node:test';
import assert from 'node:assert/strict';
import {Battle} from '@pkmn/sim';
import {simulateSixVsSix} from '../src/battle/showdown.js';
import {simulateClubMatch} from '../src/battle/club-match.js';
import {GPBattleStream,packGPTeam,installFormHooks} from '../src/battle/gp-battle-stream.js';
import {installLeagueRules,LEAGUE_RULES} from '../src/core/league-rules.js';
import {captureRelayState,recoverRelay} from '../src/battle/relay-state.js';
import {rolloutActions} from '../src/battle/showdown-rollout.js';
const stats=['hp','atk','def','spa','spd','spe'];
const team=(species='Mew',moves=['splash'],item='',ability)=>Array.from({length:6},(_,i)=>({pokemonId:species+':'+i,name:species+i,species,moves,item,ability,statCA:Object.fromEntries(stats.map(k=>[k,80])),statPA:Object.fromEntries(stats.map(k=>[k,150]))}));
async function prepared(a=team(),b=team('Magikarp'),carry={}){
 const stream=new GPBattleStream(a,b,carry);await stream.write('>start '+JSON.stringify({formatid:'gen9customgame',seed:[1,2,3,4]}));
 await stream.write('>player p1 '+JSON.stringify({name:'A',team:packGPTeam(a)}));await stream.write('>player p2 '+JSON.stringify({name:'B',team:packGPTeam(b)}));
 const battle=stream.battle;battle.makeChoices('default','default');return {battle,stream};
}
test('turn limit waits for the last completed turn and never overwrites a normal winner',()=>{
 let ended=0,tied=0;
 const b={turn:299,ended:false,endTurn(){this.turn++;ended++;},add(){},tie(){this.ended=true;tied++;}};
 installLeagueRules(b);b.endTurn();assert.equal(b.turn,300);assert.equal(tied,0);b.endTurn();assert.equal(tied,1);assert.equal(b.leagueEndReason,'turn-limit');assert.equal(ended,1);
 const natural={turn:300,ended:true,endTurn(){},tie(){throw Error('normal win replaced');}};installLeagueRules(natural);natural.endTurn();
});
test('real turn-limit duels produce 5:5 with five double eliminations and no fabricated Pokémon KOs',async()=>{
 const r=await simulateSixVsSix(team(),team('Magikarp'),{seed:[1,2,3,4],maxTurns:2});
 assert.equal(r.winner,'tie');assert.equal(r.endReason,'turn-limit');assert.equal(r.turns,2);assert.ok(!r.log.includes('|turn|3'));assert.ok(!r.log.includes('|faint|'));
 const relay=await simulateClubMatch(Array.from({length:5},()=>({team:team()})),Array.from({length:5},()=>({team:team('Magikarp')})),{seed:[1,2,3,4],maxTurns:2});
 assert.equal(relay.winner,'tie');assert.deepEqual(relay.trainersDefeated,{A:5,B:5});assert.equal(relay.rounds.length,5);
 assert.ok(relay.rounds.every(x=>x.result.endReason==='turn-limit'&&!x.result.log.includes('|faint|')));
});
test('sleep remainder, berry history and consumed items carry without battle references',async()=>{
 const {battle,stream}=await prepared(team('Mew',['splash'],'Sitrus Berry'));
 try{
  const mon=stream.originalPokemon.p1[0];mon.status='slp';mon.statusState={id:'slp',target:mon,time:2,startTime:4,source:battle.p2.active[0]};
  mon.item='';mon.lastItem='sitrusberry';mon.ateBerry=true;mon.hp-=30;
  const saved=stream.originalPokemon.p1.map(m=>captureRelayState(m,m.leagueMeta));assert.equal(saved[0].statusData.time,2);assert.doesNotThrow(()=>JSON.stringify(saved));
  const next=await prepared(team('Mew',['splash'],'Sitrus Berry'),team('Magikarp'),{p1:recoverRelay(saved)});
  try{const state=next.stream.initialStats.p1[0];assert.equal(state.statusData.time,2);assert.equal(state.item,'');assert.equal(state.lastItem,'sitrusberry');assert.equal(next.battle.p1.pokemon.find(m=>m.name==='Mew0').ateBerry,true);}finally{await next.stream.writeEnd();}
 }finally{await stream.writeEnd();}
});
test('busted Disguise and Ice Face persist, while boosts and toxic stage reset',async()=>{
 for(const [species,ability,broken] of [['Mimikyu','Disguise','Mimikyu-Busted'],['Eiscue','Ice Face','Eiscue-Noice']]){
  const {battle,stream}=await prepared(team(species,['splash'],'',ability));
  try{
   const mon=stream.originalPokemon.p1[0];mon.formeChange(broken,{id:ability==='Disguise'?'disguise':'iceface',effectType:'Ability'},true);mon.abilityState.busted=true;
   mon.status='tox';mon.statusState={id:'tox',target:mon,stage:9};mon.boosts.atk=4;
   const saved=stream.originalPokemon.p1.map(m=>captureRelayState(m,m.leagueMeta));
   const next=await prepared(team(species,['splash'],'',ability),team('Magikarp'),{p1:saved});
   try{const got=next.stream.originalPokemon.p1[0];assert.equal(got.baseSpecies.name,broken);assert.equal(captureRelayState(got,got.leagueMeta).protectionBusted,true);assert.equal(got.statusState.stage,0);assert.equal(got.boosts.atk,0);assert.equal(got.maxhp,next.stream.initialStats.p1[0].maxhp);}finally{await next.stream.writeEnd();}
   if(species==='Eiscue'){
    const snow=await prepared(team(species,['splash'],'',ability),team('Abomasnow',['splash'],'','Snow Warning'),{p1:saved});
    try{assert.equal(snow.stream.originalPokemon.p1[0].baseSpecies.name,'Eiscue');assert.equal(snow.stream.originalPokemon.p1[0].abilityState.busted,false);}finally{await snow.stream.writeEnd();}
   }
  }finally{await stream.writeEnd();}
 }
});
test('cloned AI searches use the same deadline and form-stat hooks without changing the live battle',async()=>{
 const {battle,stream}=await prepared();
 try{
  installLeagueRules(battle,{maxTurns:2});const before=JSON.stringify(battle.toJSON());
  const r=rolloutActions(battle,{choices:['move 1'],opponentChoices:['move 1'],depth:2});assert.equal(r[0].runs,1);assert.equal(JSON.stringify(battle.toJSON()),before);
  const clone=Battle.fromJSON(structuredClone(battle.toJSON()));installLeagueRules(clone);installFormHooks(clone);
  const mon=clone.p1.pokemon[0],max=mon.maxhp;mon.hp-=10;mon.updateMaxHp();assert.equal(mon.maxhp,max);assert.equal(mon.hp,max-10);
 }finally{await stream.writeEnd();}
});
test('Shedinja does not gain HP from the relay recovery floor and dead Pokémon remain dead',()=>{
 const r=recoverRelay([{hp:1,maxhp:1,pp:[1]},{hp:0,maxhp:200,pp:[0]}]);assert.equal(r[0].hp,1);assert.equal(r[1].hp,0);assert.equal(LEAGUE_RULES.maxDuels,9);
});

test('a berry actually consumed by Showdown is not recreated for the next opponent',async()=>{
 const a=team('Mew',['splash'],'Sitrus Berry'),b=team('Magikarp');
 const low=a.map(()=>({hp:1,status:'',item:'sitrusberry',pp:[64]}));
 const first=await simulateSixVsSix(a,b,{carry:{p1:low},maxTurns:2,seed:[4,3,2,1]});
 assert.match(first.log,/\|-enditem\|p1a:/);assert.equal(first.finalState.p1[0].item,'');assert.equal(first.finalState.p1[0].ateBerry,true);
 const second=await simulateSixVsSix(a,b,{carry:{p1:recoverRelay(first.finalState.p1)},maxTurns:2,seed:[1,2,3,4]});
 assert.equal(second.initialStats.p1[0].item,'');assert.equal(second.initialStats.p1[0].lastItem,'sitrusberry');
});
test('a last-Pokémon self-KO keeps the engine ruling and does not hang on fainted reserves',async()=>{
 const a=team('Electrode',['explosion']),b=team('Magikarp',['splash']);
 const carry=Object.fromEntries(['p1','p2'].map(side=>[side,Array.from({length:6},(_,i)=>({hp:i?0:999,status:'',pp:[64]}))]));
 const r=await simulateSixVsSix(a,b,{carry,seed:[1,2,3,4]});
 const actual=r.log.match(/\|win\|([^\n]+)/)?.[1]||'tie';assert.equal(r.winner,actual);assert.notEqual(r.endReason,'turn-limit');
 assert.ok(r.finalState.p1.slice(1).every(p=>p.hp===0));
});

test('a winning trainer with no survivors exits before another duel without replacing the engine winner',async()=>{
 const a=Array.from({length:5},()=>({team:team('Electrode',['explosion'])})),b=Array.from({length:5},()=>({team:team('Magikarp',['splash'])}));
 const r=await simulateClubMatch(a,b,{seed:[1,2,3,4]});
 assert.ok(r.rounds.length<=9);assert.ok(r.rounds.some(round=>round.exhausted));
 for(const round of r.rounds){const actual=round.result.winner==='Club A'?'A':round.result.winner==='Club B'?'B':'tie';assert.equal(round.winner,actual);}
 assert.ok(Math.max(r.trainersDefeated.A,r.trainersDefeated.B)===5);
});
