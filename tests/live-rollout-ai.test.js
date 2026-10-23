import test from 'node:test';
import assert from 'node:assert/strict';
import {simulateSixVsSix} from '../src/battle/showdown.js';

test('live trainer AI invokes cloned Showdown rollouts on both sides', {timeout:30000}, async () => {
  const gp={hp:94,atk:0,def:31,spa:94,spd:0,spe:94};
  const team=(species,moves)=>Array.from({length:6},(_,i)=>({
    name:species+i,species,level:50,nature:'Hardy',moves,
    ca:200,pa:200,gp:{...gp},
  }));
  const result=await simulateSixVsSix(
    team('Mewtwo',['thunderbolt','psychic']),
    team('Magikarp',['tackle','splash']),
    {trainerA:{tactics:20},trainerB:{tactics:20},seed:[1,2,3,4]},
  );
  assert.equal(result.winner,'Club A');
  assert.ok(result.aiDecisions.p1.rollouts>0);
  assert.ok(result.aiDecisions.p2.rollouts>0);
  assert.equal(result.aiDecisions.p1.rolloutFallbacks,0);
  assert.equal(result.aiDecisions.p2.rolloutFallbacks,0);
});
