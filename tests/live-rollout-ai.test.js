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

test('conservative response scoring reduces vulnerability to opposing best reply',async()=>{
 const {robustResponseScore}=await import('../src/battle/showdown-rollout.js');
 const risky={choice:'move 1',score:20,worstScore:-25,runs:4};
 const stable={choice:'move 2',score:12,worstScore:10,runs:4};
 assert.ok(risky.score>stable.score,'naive average favors risky move');
 assert.ok(robustResponseScore(stable,.38)>robustResponseScore(risky,.38),
   'expert hedges against counterplay');
 assert.equal(robustResponseScore(risky,0),20);
 assert.equal(robustResponseScore({score:5,worstScore:-Infinity},.38),5);
});
