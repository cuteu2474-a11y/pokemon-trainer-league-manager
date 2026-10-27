import test from 'node:test';
import assert from 'node:assert/strict';
import {Battle,Dex} from '@pkmn/sim';
import {specialtyFromTypes} from '../src/core/team-specialty.js';
import {teamSpecialty} from '../src/battle/team-specialty.js';
import {GPBattleStream,packGPTeam,installFormHooks} from '../src/battle/gp-battle-stream.js';
import {installLeagueRules} from '../src/core/league-rules.js';
import {installEnhancementRules} from '../src/battle/enhancement.js';
import {installLevelFreeDamage} from '../src/battle/level-free-damage.js';
import {rolloutActions} from '../src/battle/showdown-rollout.js';
import {simulateClubMatch} from '../src/battle/club-match.js';
const stats=['hp','atk','def','spa','spd','spe'];
const team=(species='Mew',moves=['splash'],extra={})=>Array.from({length:6},(_,i)=>({pokemonId:species+':'+i,name:species+i,species,moves,statCA:Object.fromEntries(stats.map(k=>[k,80])),statPA:Object.fromEntries(stats.map(k=>[k,200])),...extra}));
async function prepared(a=team(),b=team('Magikarp'),enhancements){
 const stream=new GPBattleStream(a,b,{}, {enhancements});
 await stream.write('>start '+JSON.stringify({formatid:'gen9customgame',seed:[1,2,3,4]}));
 await stream.write('>player p1 '+JSON.stringify({name:'A',team:packGPTeam(a)}));await stream.write('>player p2 '+JSON.stringify({name:'B',team:packGPTeam(b)}));
 const battle=stream.battle;battle.makeChoices('default','default');return {battle,stream};
}
test('all six registered species must share a type; two common types still qualify only once',()=>{
 const a=team('Gyarados');assert.deepEqual(teamSpecialty(a),{active:true,types:['Water','Flying']});
 a[5]={...a[5],species:'Blastoise'};assert.deepEqual(teamSpecialty(a),{active:true,types:['Water']});
 a[5]={...a[5],species:'Mew'};assert.equal(teamSpecialty(a).active,false);
 assert.equal(teamSpecialty([...team('Mew'),{species:'Mew'}]).active,false);
 assert.equal(specialtyFromTypes([['Water']]).active,false);
});
test('real engine stats apply one bonus after nature, without changing HP, speed, CA or caller data',async()=>{
 const a=team('Mew',['splash'],{nature:'Adamant'}),before=JSON.stringify(a),{battle,stream}=await prepared(a);
 try{
  const mon=battle.p1.active[0];assert.deepEqual(mon.storedStats,{atk:168,def:153,spa:137,spd:153,spe:146});
  assert.equal(mon.hp,201);assert.equal(mon.maxhp,201);assert.equal(mon.speed,146);assert.equal(JSON.stringify(a),before);
  assert.deepEqual(mon.leagueMeta.statCA,a[0].statCA);assert.deepEqual(mon.leagueMeta.statPA,a[0].statPA);
 }finally{await stream.writeEnd();}
 const mixed=team('Mew',['splash'],{leagueSpecialty:{active:true,types:['Psychic']}});mixed[5].species='Magikarp';
 const second=await prepared(mixed);try{assert.equal(second.battle.p1.active[0].storedStats.atk,146);assert.equal(second.stream.specialties[0].active,false);}finally{await second.stream.writeEnd();}
});
test('dual-type qualification and permanent form recalculation never compound the bonus',async()=>{
 const a=team('Charizard',['splash'],{item:'Charizardite X'}),{battle,stream}=await prepared(a,team('Magikarp'),{p1:{kind:'mega',pokemonId:a[0].pokemonId}});
 try{
  const mon=battle.p1.active[0],max=mon.maxhp;mon.hp-=20;battle.makeChoices('move 1 mega','move 1');
  assert.equal(mon.species.name,'Charizard-Mega-X');assert.deepEqual(mon.leagueMeta.leagueSpecialty.types,['Fire','Flying']);
  assert.equal(mon.storedStats.atk,178);assert.equal(mon.hp,max-20);
  for(let i=0;i<3;i++)mon.updateMaxHp();assert.equal(mon.storedStats.atk,178);assert.equal(mon.hp,max-20);
 }finally{await stream.writeEnd();}
});
test('Transform copies target actual stats, and switching restores own specialization once',async()=>{
 for(const ownMixed of [false,true]){
  const a=team('Mew',['transform']),b=team('Magikarp');(ownMixed?a:b)[5].species='Blissey';
  const {battle,stream}=await prepared(a,b);
  try{
   const own=battle.p1.active[0],foe=battle.p2.active[0],expected={...foe.storedStats},hp=own.hp,max=own.maxhp;
   assert.equal(own.transformInto(foe),true);assert.deepEqual(own.storedStats,expected);assert.equal(own.hp,hp);assert.equal(own.maxhp,max);
   own.updateMaxHp();assert.deepEqual(own.storedStats,expected);assert.equal(own.maxhp,max);
   const clone=Battle.fromJSON(structuredClone(battle.toJSON()));installFormHooks(clone);installLeagueRules(clone);installEnhancementRules(clone);installLevelFreeDamage(clone);
   assert.deepEqual(clone.p1.active[0].storedStats,expected);
   own.clearVolatile();assert.equal(own.species.name,'Mew');assert.equal(own.storedStats.atk,ownMixed?146:153);assert.equal(own.maxhp,max);
  }finally{await stream.writeEnd();}
 }
});
test('Tera and knockouts do not change qualification; cloned AI forms use the same rule',async()=>{
 const a=team('Charizard',['splash']),{battle,stream}=await prepared(a,team('Magikarp'),{p1:{kind:'terastallize',pokemonId:a[0].pokemonId,teraType:'Water'}});
 try{
  const own=battle.p1.active[0],before={...own.storedStats};battle.makeChoices('move 1 terastallize','move 1');assert.deepEqual(own.getTypes(),['Water']);assert.deepEqual(own.storedStats,before);
  battle.p1.pokemon[5].hp=0;battle.p1.pokemon[5].fainted=true;
  const snapshot=JSON.stringify(battle.toJSON());const ranked=rolloutActions(battle,{choices:['move 1'],opponentChoices:['move 1']});assert.equal(ranked[0].runs,1);assert.equal(JSON.stringify(battle.toJSON()),snapshot);
  const clone=Battle.fromJSON(structuredClone(battle.toJSON()));installFormHooks(clone);clone.p1.active[0].updateMaxHp();assert.deepEqual(clone.p1.active[0].storedStats,before);assert.deepEqual(clone.p1.active[0].leagueMeta.leagueSpecialty.types,['Fire','Flying']);
 }finally{await stream.writeEnd();}
});
test('fixed damage stays 50 rather than gaining a second damage bonus',async()=>{
 const {battle,stream}=await prepared(team('Mew',['seismictoss']));
 try{assert.equal(battle.actions.getDamage(battle.p1.active[0],battle.p2.active[0],Dex.moves.get('seismictoss')),50);}finally{await stream.writeEnd();}
});
test('real five-opponent relay retains specialization without stacking across duels',async()=>{
 const a=team('Mewtwo',['tackle']);for(const mon of a)for(const k of stats)mon.statCA[k]=200;
 const b=team('Magikarp');for(const mon of b)for(const k of stats)mon.statCA[k]=1;
 const result=await simulateClubMatch(Array.from({length:5},()=>({team:structuredClone(a)})),Array.from({length:5},()=>({team:structuredClone(b)})),{seed:[1,2,3,4]});
 assert.equal(result.winner,'A');assert.equal(result.rounds.length,5);
 for(const round of result.rounds){assert.equal(round.trainerA,0);assert.equal(round.result.initialStats.p1[0].atk,249);assert.deepEqual(round.result.specialties.p1,{types:['Psychic'],active:true});}
});
