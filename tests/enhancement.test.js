import test from 'node:test';
import assert from 'node:assert/strict';
import {Battle} from '@pkmn/sim';
import {GPBattleStream,packGPTeam,installFormHooks} from '../src/battle/gp-battle-stream.js';
import {enhancementPlan,installEnhancementRules} from '../src/battle/enhancement.js';
import {installLeagueRules} from '../src/core/league-rules.js';
import {captureRelayState,recoverRelay,endTemporaryEnhancement} from '../src/battle/relay-state.js';
import {rolloutActions} from '../src/battle/showdown-rollout.js';
import {simulateClubMatch} from '../src/battle/club-match.js';
import {simulateSixVsSix} from '../src/battle/showdown.js';
const stats=['hp','atk','def','spa','spd','spe'];
const team=(species='Mew',moves=['splash'],item='')=>Array.from({length:6},(_,i)=>({pokemonId:species+':'+i,name:species+i,species,moves,item,statCA:Object.fromEntries(stats.map(k=>[k,100])),statPA:Object.fromEntries(stats.map(k=>[k,150]))}));
async function prepared(a=team(),b=team('Magikarp'),selection={kind:'none'},carry={}){
 const stream=new GPBattleStream(a,b,carry,{enhancements:{p1:selection}});
 await stream.write('>start '+JSON.stringify({formatid:'gen9customgame',seed:[1,2,3,4]}));
 await stream.write('>player p1 '+JSON.stringify({name:'A',team:packGPTeam(a)}));await stream.write('>player p2 '+JSON.stringify({name:'B',team:packGPTeam(b)}));
 const battle=stream.battle;battle.makeChoices('default','default');return {battle,stream};
}
test('registration rejects incompatible equipment, missing targets and fixed Tera types',()=>{
 assert.throws(()=>enhancementPlan(team(),{kind:'mega',pokemonId:'Mew:0'}),/メガ|메가/);
 assert.throws(()=>enhancementPlan(team(),{kind:'zmove',pokemonId:'Mew:0'}),/Z/);
 assert.throws(()=>enhancementPlan(team(),{kind:'terastallize',pokemonId:'other'}),/대상/);
 assert.throws(()=>enhancementPlan(team('Zacian'),{kind:'dynamax',pokemonId:'Zacian:0'}),/다이맥스/);
 assert.throws(()=>enhancementPlan(team('Ogerpon-Hearthflame'),{kind:'terastallize',pokemonId:'Ogerpon-Hearthflame:0',teraType:'Water'}),/고정/);
});
test('all four engine actions spend one shared charge, block other targets and survive serialization',async()=>{
 for(const [kind,a] of [['mega',team('Charizard',['splash'],'Charizardite X')],['zmove',team('Mew',['tackle'],'Normalium Z')],['dynamax',team()],['terastallize',team()]]){
  const selection={kind,pokemonId:a[0].pokemonId},ctx=await prepared(a,team('Magikarp',['splash']),selection);
  const {battle,stream}=ctx;
  try{
   assert.equal(battle.leagueEnhancements.p1.used,false);
   const other=battle.p1.pokemon[1].getMoveRequestData();assert.ok(!other.canMegaEvo&&!other.canZMove&&!other.canDynamax&&!other.canTerastallize);
   const before=JSON.stringify(battle.toJSON());
   const search=rolloutActions(battle,{choices:['move 1 '+kind],opponentChoices:['move 1'],depth:1});assert.equal(search[0].runs,1,kind+' search');assert.equal(JSON.stringify(battle.toJSON()),before);
   battle.makeChoices('move 1 '+kind,'move 1');
   assert.equal(battle.leagueEnhancements.p1.used,true,kind);assert.match(battle.log.join('\n'),/league-enhancement/);
   const used=battle.leagueEnhancements.p1;
   const clone=Battle.fromJSON(structuredClone(battle.toJSON()));installFormHooks(clone);installLeagueRules(clone);installEnhancementRules(clone);
   assert.deepEqual(clone.leagueEnhancements.p1,used);const req=clone.p1.pokemon[1].getMoveRequestData();assert.ok(!req.canMegaEvo&&!req.canZMove&&!req.canDynamax&&!req.canTerastallize);
   endTemporaryEnhancement(battle);
   const saved=stream.originalPokemon.p1.map(mon=>captureRelayState(mon,mon.leagueMeta));
   const next=await prepared(a,team('Magikarp'),selection,{p1:recoverRelay(saved),enhancements:{p1:used}});
   try{
    assert.equal(next.battle.leagueEnhancements.p1.used,true);
    const mon=next.stream.originalPokemon.p1[0],request=mon.getMoveRequestData();assert.ok(!request.canMegaEvo&&!request.canZMove&&!request.canDynamax&&!request.canTerastallize);
    if(kind==='mega')assert.equal(mon.species.name,'Charizard-Mega-X');
    if(kind==='terastallize')assert.equal(mon.terastallized,'Psychic');
    if(kind==='dynamax')assert.ok(!mon.volatiles.dynamax);
   }finally{await next.stream.writeEnd();}
  }finally{await stream.writeEnd();}
 }
});
test('blocked Z attempt consumes charge but being KOed before its action does not',async()=>{
 const a=team('Shuckle',['tackle'],'Normalium Z');
 const first=await prepared(a,team('Mew',['protect']),{kind:'zmove',pokemonId:a[0].pokemonId});
 try{first.battle.makeChoices('move 1 zmove','move 1');assert.equal(first.battle.leagueEnhancements.p1.used,true);}finally{await first.stream.writeEnd();}
 const second=await prepared(a,team('Mew',['tackle']),{kind:'zmove',pokemonId:a[0].pokemonId});
 try{second.battle.p1.active[0].hp=1;second.battle.makeChoices('move 1 zmove','move 1');assert.equal(second.battle.p1.pokemon.find(m=>m.name===a[0].name).hp,0);assert.equal(second.battle.leagueEnhancements.p1.used,false);}finally{await second.stream.writeEnd();}
});
test('Dynamax lasts at most three turns and normalizes HP at duel end',async()=>{
 const a=team(),{battle,stream}=await prepared(a,team('Magikarp'),{kind:'dynamax',pokemonId:a[0].pokemonId});
 try{const mon=battle.p1.active[0],base=mon.maxhp;battle.makeChoices('move 1 dynamax','move 1');assert.equal(mon.maxhp,base*2);battle.makeChoices('move 1','move 1');battle.makeChoices('move 1','move 1');assert.ok(!mon.volatiles.dynamax);assert.equal(mon.maxhp,base);assert.equal(battle.leagueEnhancements.p1.used,true);}finally{await stream.writeEnd();}
});
test('trainer AI submits real registered enhancements in a complete stream',async()=>{
 for(const [kind,a] of [['mega',team('Charizard',['tackle'],'Charizardite X')],['zmove',team('Mew',['tackle'],'Normalium Z')],['dynamax',team('Mew',['tackle'])],['terastallize',team('Mew',['tackle'])]]){
  const r=await simulateSixVsSix(a,team('Magikarp'),{seed:[1,2,3,4],maxTurns:2,enhancements:{p1:{kind,pokemonId:a[0].pokemonId}},trainerA:{tactics:20,switching:1}});
  assert.equal(r.enhancements.p1.used,true,kind);assert.match(r.log,/league-enhancement/);
 }
});

test('one charge spans a real five-opponent club relay and fresh official matches reset it',async()=>{
 const a=team('Mew',['tackle']);for(const mon of a)for(const k of stats)mon.statCA[k]=mon.statPA[k]=200;
 const b=team('Magikarp');for(const mon of b)for(const k of stats)mon.statCA[k]=1;
 const enhanced={team:a,tactics:20,switching:1,enhancement:{kind:'terastallize',pokemonId:a[0].pokemonId,teraType:'Normal'}};
 const result=await simulateClubMatch(Array.from({length:5},()=>structuredClone(enhanced)),Array.from({length:5},()=>({team:structuredClone(b)})),{seed:[1,2,3,4]});
 assert.equal(result.winner,'A');assert.equal(result.rounds.length,5);
 assert.equal(result.rounds[0].result.initialEnhancements.p1.used,false);
 assert.ok(result.rounds.slice(1).every(r=>r.trainerA===0&&r.result.initialEnhancements.p1.used));
 assert.equal(result.rounds.reduce((n,r)=>n+(r.result.log.match(/\|league-enhancement\|p1\|/g)||[]).length,0),1);
 const next=await simulateSixVsSix(a,b,{seed:[1,2,3,4],maxTurns:1,enhancements:{p1:enhanced.enhancement}});assert.equal(next.initialEnhancements.p1.used,false);assert.equal(next.enhancements.p1.used,true);
});
test('move-based Mega Rayquaza is charged and Stellar boost history carries',async()=>{
 const a=team('Rayquaza',['dragonascent']),selection={kind:'mega',pokemonId:a[0].pokemonId};
 const {battle,stream}=await prepared(a,team('Magikarp'),selection);
 try{battle.makeChoices('move 1 mega','move 1');assert.equal(battle.leagueEnhancements.p1.used,true);assert.equal(battle.p1.active[0].species.name,'Rayquaza-Mega');}finally{await stream.writeEnd();}
 const mew=team('Mew',['tackle']),tera={kind:'terastallize',pokemonId:'Mew:0',teraType:'Stellar'},first=await prepared(mew,team('Magikarp'),tera);
 try{
  first.battle.makeChoices('move 1 terastallize','move 1');const boosted=first.battle.p1.active[0].stellarBoostedTypes;assert.ok(boosted.includes('Normal'));
  const state=first.stream.originalPokemon.p1.map(m=>captureRelayState(m,m.leagueMeta));
  const next=await prepared(mew,team('Magikarp'),tera,{p1:state,enhancements:{p1:first.battle.leagueEnhancements.p1}});
  try{assert.deepEqual(next.battle.p1.active[0].stellarBoostedTypes,boosted);}finally{await next.stream.writeEnd();}
 }finally{await first.stream.writeEnd();}
});
