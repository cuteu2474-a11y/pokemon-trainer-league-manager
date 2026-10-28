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

test('opponent matrix uses worst reply average, not one unlucky damage roll',async()=>{
 const {summarizeResponses,robustResponseScore}=await import('../src/battle/showdown-rollout.js');
 const response=summarizeResponses([
  {response:'move 1',score:20},{response:'move 1',score:22},
  {response:'move 2',score:-30},{response:'move 2',score:18}
 ]);
 assert.equal(response.responses,2);
 assert.equal(response.worst,-6);
 assert.equal(response.average,7.5);
 assert.ok(robustResponseScore({score:7.5,worstScore:response.worst},.38)<7.5);
});
test('battle evaluator values lasting status without changing Showdown damage',async()=>{
 const {evaluateBattle}=await import('../src/battle/showdown-rollout.js');
 const mon=(status='')=>({hp:100,maxhp:100,status});
 const make=(selfStatus,foeStatus)=>({p1:{pokemon:[mon(selfStatus)]},p2:{pokemon:[mon(foeStatus)]}});
 assert.equal(evaluateBattle(make('','')),0);
 assert.ok(evaluateBattle(make('','tox'))>0);
 assert.ok(evaluateBattle(make('par',''))<0);
});
