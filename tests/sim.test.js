import test from 'node:test';
import assert from 'node:assert/strict';
import {simulateSixVsSix} from '../src/battle/showdown.js';
function team(species) {
  return Array.from({length:6},(_,i)=>({
    name:species + i, species, ability:'Pressure', moves:['tackle'],
    nature:'Hardy', level:50, evs:{hp:0,atk:0,def:0,spa:0,spd:0,spe:0},
    ivs:{hp:31,atk:31,def:31,spa:31,spd:31,spe:31}
  }));
}
test('Showdown 6v6 smoke test', {timeout:30000}, async () => {
  const result = await simulateSixVsSix(team('Mew'),team('Mew'),{maxTurns:300});
  assert.match(result.log,/\|turn\|/);
  assert.ok(['Club A','Club B','tie'].includes(result.winner));
});
