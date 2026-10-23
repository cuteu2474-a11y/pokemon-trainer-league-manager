import test from 'node:test';
import assert from 'node:assert/strict';
import {simulateSixVsSix} from '../src/battle/showdown.js';

const lowGP = {hp:1,atk:0,def:0,spa:0,spd:0,spe:0};
const highGP = {hp:94,atk:0,def:31,spa:94,spd:0,spe:94};
function team(ca, gp) {
  return Array.from({length:6},(_,i)=>({
    name:`Mew${i+1}`,species:'Mew',level:50,nature:'Hardy',ability:'Synchronize',
    moves:['psychic'],ca,pa:200,gp:{...gp},
  }));
}

test('6v6 Showdown uses custom GP stats, not the standard IV/EV budget', {timeout:30000}, async()=>{
  const result=await simulateSixVsSix(team(1,lowGP),team(200,highGP),{seed:[1,2,3,4]});
  assert.match(result.log,/\|turn\|/);
  assert.ok(['Club A','Club B','tie'].includes(result.winner));
  assert.equal(result.initialStats.p1[0].hp,160);
  assert.equal(result.initialStats.p1[0].spa,105);
  assert.equal(result.initialStats.p2[0].spa,152);
  assert.ok(result.initialStats.p2[0].spe > result.initialStats.p1[0].spe);
});
