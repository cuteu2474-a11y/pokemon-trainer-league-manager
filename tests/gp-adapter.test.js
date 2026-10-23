import test from 'node:test';
import assert from 'node:assert/strict';
import {
  convertPokemon, injectBattleStats, injectBattleTeams, applyFormChange, applyTransformStats
} from '../src/battle/gp-adapter.js';

const gp = {hp:1,atk:0,def:0,spa:0,spd:0,spe:0};
const pokemon = {id:'g1',species:'Garchomp',ca:1,pa:180,gp,level:50};
const species = {id:'garchomp',name:'Garchomp',baseStats:{hp:108,atk:130,def:95,spa:80,spd:85,spe:102}};
function makeBattlePokemon() {
  return {species:{name:'Garchomp'},storedStats:{},baseStoredStats:{},hp:1,maxhp:1,speed:1};
}

test('GP conversion uses flooring at level 50 (HP 168, attack 135)',()=>{
  const converted = convertPokemon(pokemon,species);
  assert.equal(converted.stats.hp,168);
  assert.equal(converted.stats.atk,135);
});

test('battle stat injection updates max HP, base HP, cached speed and base stats',()=>{
  const converted = convertPokemon(pokemon,species);
  const mon = injectBattleStats(makeBattlePokemon(),converted);
  assert.equal(mon.maxhp,168);
  assert.equal(mon.baseMaxhp,168);
  assert.equal(mon.baseStoredStats.hp,168);
  assert.equal(mon.storedStats.atk,135);
  assert.equal(mon.speed,107);
});

test('team injection verifies both teams before changing stats',()=>{
  const converted = convertPokemon(pokemon,species);
  const battle = {p1:{pokemon:[makeBattlePokemon()]},p2:{pokemon:[makeBattlePokemon()]}};
  injectBattleTeams(battle,[converted],[converted]);
  assert.equal(battle.p1.pokemon[0].maxhp,168);
  assert.equal(battle.p2.pokemon[0].storedStats.atk,135);
  assert.throws(()=>injectBattleTeams(battle,[{...converted,species:'Pikachu'}],[converted]),/Species mismatch/);
});

test('forme changes recalculate stats from GP while preserving existing damage',()=>{
  const mon = injectBattleStats(makeBattlePokemon(),convertPokemon(pokemon,species));
  mon.hp -= 40;
  const newSpecies = {id:'megagarchomp',name:'Garchomp-Mega',baseStats:{hp:120,atk:170,def:115,spa:120,spd:95,spe:92}};
  const updated = applyFormChange(mon,pokemon,newSpecies);
  assert.equal(mon.storedStats.atk,175);
  assert.equal(mon.maxhp,180);
  assert.equal(mon.hp,140);
  assert.deepEqual(updated.gp,gp);
});

test('Transform copies non-HP stats only',()=>{
  const self = {storedStats:{atk:90,def:80,spa:70,spd:60,spe:50},hp:42,maxhp:100};
  const target = {storedStats:{atk:180,def:150,spa:120,spd:100,spe:99},hp:200,maxhp:250};
  applyTransformStats(self,target);
  assert.equal(self.storedStats.atk,180);
  assert.equal(self.storedStats.spe,99);
  assert.equal(self.hp,42);
  assert.equal(self.maxhp,100);
});

test('invalid CA/PA combination is rejected',()=> {
  assert.throws(()=>convertPokemon({...pokemon,ca:100,pa:99},species));
});
