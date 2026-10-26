import test from 'node:test';
import assert from 'node:assert/strict';
import {
  convertPokemon,injectBattleStats,injectBattleTeams,applyFormChange,applyTransformStats
} from '../src/battle/gp-adapter.js';

const statCA={hp:80,atk:60,def:70,spa:90,spd:65,spe:90};
const statPA={hp:130,atk:120,def:130,spa:160,spd:125,spe:150};
const pokemon={id:'g1',species:'Garchomp',statCA,statPA};
const species={id:'garchomp',name:'Garchomp',
  baseStats:{hp:108,atk:130,def:95,spa:80,spd:85,spe:102}};
function makeBattlePokemon(){
  return {species:{name:'Garchomp'},storedStats:{},baseStoredStats:{},
    hp:1,maxhp:1,speed:1};
}
test('all six Showdown battle stats are computed from per-stat CA without level',()=>{
  const converted=convertPokemon(pokemon,species);
  assert.equal(converted.stats.hp,207);
  assert.equal(converted.stats.atk,156);
  assert.equal(converted.stats.spe,154);
  assert.deepEqual(converted.statPA,statPA);
  assert.equal(Object.hasOwn(converted,'level'),false);
  const boosted=convertPokemon({...pokemon,statCA:{...statCA,atk:100}},species);
  assert.equal(boosted.stats.hp,207);
  assert.ok(boosted.stats.atk>converted.stats.atk);
  assert.equal(boosted.stats.def,converted.stats.def);
});
test('battle stat injection updates max HP, base stats and cached speed',()=>{
  const mon=injectBattleStats(makeBattlePokemon(),convertPokemon(pokemon,species));
  assert.equal(mon.maxhp,207);
  assert.equal(mon.baseMaxhp,207);
  assert.equal(mon.baseStoredStats.hp,207);
  assert.equal(mon.storedStats.atk,156);
  assert.equal(mon.speed,154);
});
test('team injection verifies both sides before changes',()=>{
  const converted=convertPokemon(pokemon,species);
  const battle={p1:{pokemon:[makeBattlePokemon()]},p2:{pokemon:[makeBattlePokemon()]}};
  injectBattleTeams(battle,[converted],[converted]);
  assert.equal(battle.p1.pokemon[0].maxhp,207);
  assert.equal(battle.p2.pokemon[0].storedStats.atk,156);
  assert.throws(()=>injectBattleTeams(battle,[{...converted,species:'Pikachu'}],[converted]),/Species mismatch/);
});
test('forme changes use species base stats and preserve damage already suffered',()=>{
  const mon=injectBattleStats(makeBattlePokemon(),convertPokemon(pokemon,species));
  mon.hp-=40;
  const mega={id:'megagarchomp',name:'Garchomp-Mega',
    baseStats:{hp:120,atk:170,def:115,spa:120,spd:95,spe:92}};
  const updated=applyFormChange(mon,pokemon,mega);
  assert.equal(mon.storedStats.atk,188);
  assert.equal(mon.maxhp,217);
  assert.equal(mon.hp,177);
  assert.deepEqual(updated.statCA,statCA);
});
test('Transform copies non-HP stats only',()=>{
  const self={storedStats:{atk:90,def:80,spa:70,spd:60,spe:50},hp:42,maxhp:100};
  const foe={storedStats:{atk:180,def:150,spa:120,spd:100,spe:99},hp:200,maxhp:250};
  applyTransformStats(self,foe);
  assert.equal(self.storedStats.atk,180);
  assert.equal(self.storedStats.spe,99);
  assert.equal(self.hp,42);assert.equal(self.maxhp,100);
});
test('invalid CA/PA in any stat is rejected',()=>{
  assert.throws(()=>convertPokemon({...pokemon,
    statPA:{...statPA,hp:79}},species),/hp PA/);
  assert.throws(()=>convertPokemon({...pokemon,
    statCA:{...statCA,spe:220}},species),/spe CA/);
  assert.throws(()=>convertPokemon({...pokemon,
    statCA:{...statCA,atk:undefined}},species),/atk CA/);
});
