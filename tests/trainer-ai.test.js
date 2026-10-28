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

test('paralyzed opponent is not targeted with Will-O-Wisp even by control-style trainer',()=>{
 const trainer={tactics:20,switching:12,battlePlan:'control'};
 const opponent={status:'par',hp:70,maxhp:100,types:['Normal'],getTypes(){return this.types;}};
 const own={hp:100,maxhp:100,boosts:{},moveSlots:[{id:'willowisp'},{id:'tackle'}]};
 const battle={requestState:'idle',p1:{active:[own],sideConditions:{}},
  p2:{active:[opponent],sideConditions:{}}};
 const ai=new TrainerAI({},trainer,{seed:[1,2,3,4],battleProvider:()=>battle,team:[{species:'Arcanine'}]});
 ai.ownActive={species:'Arcanine'};ai.foeSpecies='Snorlax';ai.prng.random=()=>0;
 assert.equal(ai.chooseMove({},[{choice:'move 1',move:{id:'willowisp'}},
  {choice:'move 2',move:{id:'tackle'}}]),'move 2');
});
test('novice refuses redundant burn and keeps damaging secondary burn legal',()=>{
 const opponent={status:'par',hp:80,maxhp:100,types:['Water'],getTypes(){return this.types;}};
 const battle={requestState:'idle',p1:{active:[{hp:100,maxhp:100,moveSlots:[{id:'willowisp'},{id:'scald'}]}],sideConditions:{}},
  p2:{active:[opponent],sideConditions:{}}};
 const ai=new TrainerAI({}, {tactics:1,switching:1,battlePlan:'control'},
  {seed:[1,2,3,4],battleProvider:()=>battle,team:[{species:'Arcanine'}]});
 ai.ownActive={species:'Arcanine'};ai.foeSpecies='Blastoise';ai.prng.random=()=>.95;
 assert.equal(ai.chooseMove({},[{choice:'move 1',move:{id:'willowisp'}},
  {choice:'move 2',move:{id:'scald'}}]),'move 2');
});
test('team preview picks a suitable living lead from own team and visible opposing species',()=>{
 const team=[{name:'첫째',species:'Jolteon',moves:['thunderbolt']},
  {name:'둘째',species:'Togekiss',moves:['dazzlinggleam']},
  {name:'셋째',species:'Magikarp',moves:['splash']}];
 const ai=new TrainerAI({}, {tactics:20,switching:20},{seed:[1,2,3,4],team});
 ai.opponentPreview=['Garchomp'];
 const lead=ai.chooseTeamPreview(team.map(mon=>({details:mon.species,ident:'p1: '+mon.name,condition:'100/100'})));
 assert.equal(lead,'team 2');
});

test('highest tactical skill always uses deliberate reasoning regardless of RNG roll',()=>{
 const ai=new TrainerAI({}, {tactics:20,switching:20,moveJudgment:20,
  battleAnalysis:20},{seed:[1,2,3,4]});
 ai.foeSpecies='Gyarados';ai.ownActive={species:'Pikachu'};
 ai.prng.random=()=>.999999;
 const choice=ai.chooseMove({},[
  {choice:'move 1',move:{id:'earthquake'}},
  {choice:'move 2',move:{id:'thunderbolt'}}
 ]);
 assert.equal(choice,'move 2');
 assert.equal(ai.decisions.reasons['판단 실패 · 비슷한 선택지 중 선택']||0,0);
});

test('observed opponent response search never includes unrevealed move slots',()=>{
 const ai=new TrainerAI({}, {tactics:20,switching:20},{seed:[1,2,3,4]});
 ai.side='p1';ai.receiveLine('|switch|p2a: 수룡|Blastoise, L50|100/100');
 ai.receiveLine('|move|p2a: 수룡|Surf|p1a: Pikachu');
 const battle={p2:{active:[{moveSlots:[
  {id:'surf',pp:10},{id:'icebeam',pp:10},{id:'toxic',pp:10}
 ]}]}};
 assert.deepEqual(ai.observedOpponentChoices(battle),['move 1']);
 ai.receiveLine('|move|p2a: 수룡|Ice Beam|p1a: Pikachu');
 assert.deepEqual(ai.observedOpponentChoices(battle),['move 1','move 2']);
});
test('expert switch cooldown prevents repeated immediate counter switches',()=>{
 const battle={turn:5};
 const ai=new TrainerAI({}, {tactics:20,switching:20,moveJudgment:20,switchJudgment:20},{
  seed:[1,2,3,4],battleProvider:()=>battle,team:[
   {species:'Pikachu',name:'빠른돌',moves:['thunderbolt']},
   {species:'Togekiss',name:'비행군',moves:['dazzlinggleam']}
  ]});
 ai.ownActive=ai.team[0];ai.foeSpecies='Garchomp';
 ai.lastVoluntarySwitchTurn=5;
 assert.equal(ai.moveProbability({side:{pokemon:[
  {active:true,details:'Pikachu',ident:'p1: 빠른돌',condition:'80/100'},
  {active:false,details:'Togekiss',ident:'p1: 비행군',condition:'100/100'}
 ]}}),1);
});
