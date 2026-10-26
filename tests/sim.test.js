import test from 'node:test';
import assert from 'node:assert/strict';
import {simulateSixVsSix} from '../src/battle/showdown.js';
import {LEVEL_FREE_DAMAGE_FACTOR,LEVEL_FREE_FIXED_DAMAGE} from '../src/battle/level-free-damage.js';
const stats=['hp','atk','def','spa','spd','spe'];
function team(current,legacyLevel){
  const statCA=Object.fromEntries(stats.map(x=>[x,current]));
  const statPA=Object.fromEntries(stats.map(x=>[x,200]));
  return Array.from({length:6},(_,i)=>({
    name:'Mew'+(i+1),species:'Mew',nature:'Hardy',ability:'Synchronize',
    moves:['psychic'],statCA:{...statCA},statPA:{...statPA},
    ...(legacyLevel?{level:legacyLevel}:{})
  }));
}
test('6v6 Showdown uses individual CA, never an old level or aggregate budget',
  {timeout:30000},async()=>{
    const r=await simulateSixVsSix(team(20,1),team(160,100),{seed:[1,2,3,4]});
    assert.match(r.log,/\|turn\|/);
    assert.equal(r.initialStats.p1[0].hp,144);
    assert.equal(r.initialStats.p1[0].spa,104);
    assert.equal(r.initialStats.p2[0].spa,202);
    assert.ok(r.initialStats.p2[0].spe>r.initialStats.p1[0].spe);
    assert.equal(LEVEL_FREE_DAMAGE_FACTOR,28);
    assert.equal(LEVEL_FREE_FIXED_DAMAGE,50);
  });
test('identical CA produces identical initial battle stats despite legacy level metadata',
  {timeout:30000},async()=>{
    const r=await simulateSixVsSix(team(90,1),team(90,100),{seed:[13,14,15,16]});
    for(const stat of ['hp','atk','def','spa','spd','spe'])
      assert.equal(r.initialStats.p1[0][stat]??r.initialStats.p1[0].maxhp,
        r.initialStats.p2[0][stat]??r.initialStats.p2[0].maxhp);
  });
