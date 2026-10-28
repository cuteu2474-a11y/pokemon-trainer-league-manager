import test from 'node:test';
import assert from 'node:assert/strict';
import {TrainerAI, trainerSkill, scoreMove, typeMultiplier} from '../src/battle/trainer-ai.js';
import {simulateSixVsSix} from '../src/battle/showdown.js';

const gp={hp:94,atk:0,def:31,spa:94,spd:0,spe:94};
const team=species=>Array.from({length:6},(_,i)=>({
  name:species+i,species,level:50,nature:'Hardy',moves:['thunderbolt','icebeam','psychic','shadowball'],
  ca:200,pa:200,gp:{...gp},
}));
test('trainer skills clamp to 1..20',()=>{
  assert.deepEqual(trainerSkill({tactics:99,switching:-4}),{tactics:20,switching:1});
});
test('AI scores type effectiveness rather than only raw power',()=>{
  assert.equal(typeMultiplier('Electric',['Water','Flying']),4);
  assert.ok(scoreMove({id:'thunderbolt'},['Water']) > scoreMove({id:'thunderbolt'},['Ground']));
});
test('skilled trainer prefers effective move',()=>{
  const ai=new TrainerAI({},{tactics:20,switching:20},{seed:[1,2,3,4]});
  ai.foeSpecies='Gyarados';
  const choice=ai.chooseMove({},[
    {choice:'move 1',move:{id:'earthquake'}},
    {choice:'move 2',move:{id:'thunderbolt'}},
  ]);
  assert.equal(choice,'move 2');
});
test('Showdown integrates AI decisions in a full 6v6 battle',{timeout:30000},async()=>{
  const result=await simulateSixVsSix(team('Mewtwo'),team('Magikarp'),{
    trainerA:{tactics:20,switching:20},trainerB:{tactics:1,switching:1},seed:[1,2,3,4],
  });
  assert.equal(result.winner,'Club A');
  assert.ok(result.aiDecisions.p1.moves>0);
});

test('prepared AI preserves profile skills when optional explicit overrides are absent',()=>{
 const ai=new TrainerAI({}, {tactics:12,switching:12,aiProfile:{moveSkill:19,switchSkill:18,analysis:17,preservation:16}}, {seed:[1,2,3,4]});
 assert.equal(ai.profile.moveSkill,19);
 assert.equal(ai.profile.switchSkill,18);
 assert.equal(ai.profile.analysis,17);
 assert.equal(ai.profile.preservation,16);
});
test('novice picks a viable attack over a move with known type immunity',()=>{
 const ai=new TrainerAI({}, {tactics:1,switching:1}, {seed:[1,2,3,4]});
 ai.ownActive={species:'Pikachu'};ai.foeSpecies='Gyarados';ai.prng.random=()=>.9;
 assert.equal(ai.chooseMove({},[{choice:'move 1',move:{id:'earthquake'}},{choice:'move 2',move:{id:'thunderbolt'}}]),'move 2');
});
test('switching considers availability of a safe reserve rather than random turns',()=>{
 const ai=new TrainerAI({}, {tactics:15,switching:18}, {seed:[1,2,3,4]});
 ai.ownActive={species:'Pikachu'};ai.foeSpecies='Garchomp';
 const active={active:true,condition:'75/100'};
 const noCounter=ai.moveProbability({side:{pokemon:[active,{condition:'100/100',details:'Jolteon'}]}});
 const counter=ai.moveProbability({side:{pokemon:[active,{condition:'100/100',details:'Togekiss'}]}});
 assert.ok(counter<noCounter);
 assert.equal(ai.moveProbability({side:{pokemon:[active]}}),1);
});
