import test from 'node:test';
import assert from 'node:assert/strict';
import {convertPokemon,injectBattleStats,injectBattleTeams} from '../src/battle/gp-adapter.js';
const gp={hp:1,atk:0,def:0,spa:0,spd:0,spe:0};
const species={id:'garchomp',baseStats:{hp:108,atk:130,def:95,spa:80,spd:85,spe:102}};
test('converts CA and GP to independent battle stats',()=>{
 const result=convertPokemon({id:'g1',species:'Garchomp',ca:1,pa:180,gp,level:50},species);
 assert.equal(result.stats.hp,169);assert.equal(result.stats.atk,135);
});
test('injects stats into an initialized battle Pokemon-like object',()=>{
 const converted=convertPokemon({id:'g1',species:'Garchomp',ca:1,pa:180,gp,level:50},species);
 const obj={storedStats:{},baseStoredStats:{},maxhp:1,hp:1};
 injectBattleStats(obj,converted);
 assert.equal(obj.maxhp,169);assert.equal(obj.storedStats.atk,135);
});
test('rejects invalid CA/PA',()=>assert.throws(()=>convertPokemon({ca:100,pa:99,gp,level:50},species)));

test('injects both teams only when species and slots match',()=>{
 const a=convertPokemon({id:'a',species:'Garchomp',ca:1,pa:180,gp,level:50},species);
 const make=()=>({species:{name:'Garchomp'},storedStats:{},baseStoredStats:{},hp:1,maxhp:1});
 const battle={p1:{pokemon:[make()]},p2:{pokemon:[make()]}};
 injectBattleTeams(battle,[a],[a]);
 assert.equal(battle.p1.pokemon[0].maxhp,169);
 assert.equal(battle.p2.pokemon[0].storedStats.atk,135);
 assert.throws(()=>injectBattleTeams(battle,[{...a,species:'Pikachu'}],[a]),/Species mismatch/);
});
