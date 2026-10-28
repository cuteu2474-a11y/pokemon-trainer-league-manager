import test from 'node:test';
import assert from 'node:assert/strict';
import {searchBudget,knownModifier,evaluateMove,selectTacticalMove} from '../src/battle/tactical-search.js';
import {simulateSixVsSix} from '../src/battle/showdown.js';

test('tactics increase bounded rollout budget',()=>{
  assert.deepEqual(searchBudget(2),{depth:1,samples:1});
  assert.deepEqual(searchBudget(20),{depth:3,samples:12});
});
test('item and ability change candidate value',()=>{
  const punch={type:'Fighting',basePower:60,category:'Physical',flags:{punch:1}};
  assert.ok(knownModifier({ability:'Iron Fist',item:'Life Orb'},punch)>1.5);
  const thunder={move:{id:'thunderbolt'},choice:'move 1'};
  assert.ok(evaluateMove(thunder,{foeTypes:['Water'],ownItem:'Choice Specs'}) >
    evaluateMove(thunder,{foeTypes:['Water']}));
});
test('immunity and uncertainty respect legal choices',()=>{
  const options=[{move:{id:'earthquake'},choice:'move 1'},{move:{id:'thunderbolt'},choice:'move 2'}];
  assert.equal(evaluateMove(options[0],{foeTypes:['Flying']}),0);
  assert.equal(selectTacticalMove(options,{foeTypes:['Flying']},20,()=>0.5),'move 2');
});
test('battle uses item-aware bounded AI without accessing opponent hidden sets',{timeout:30000},async()=>{
  const gp={hp:94,atk:0,def:31,spa:94,spd:0,spe:94};
  const team=(species,item)=>Array.from({length:6},(_,i)=>({
    name:species+i,species,level:50,nature:'Hardy',item,ability:species==='Mewtwo'?'Pressure':'Swift Swim',
    moves:species==='Mewtwo'?['thunderbolt','psychic','icebeam','shadowball']:['tackle','flail','splash'],
    ca:200,pa:200,gp:{...gp},
  }));
  const result=await simulateSixVsSix(team('Mewtwo','Life Orb'),team('Magikarp','Oran Berry'),{
    trainerA:{tactics:20},trainerB:{tactics:2},seed:[1,2,3,4],
  });
  assert.equal(result.winner,'Club A');
  assert.ok(result.aiDecisions.p1.moves>0);
});

test('healing value depends on user HP, not opponent HP',()=>{
 const recover={choice:'move 1',move:{id:'recover'}};
 assert.ok(evaluateMove(recover,{ownHpFraction:.25,foeHpFraction:1})>evaluateMove(recover,{ownHpFraction:.90,foeHpFraction:.1}));
 assert.ok(evaluateMove(recover,{ownHpFraction:1})<0);
});
test('status heuristics reject type immunity, already-statused foes and fully raised stats',()=>{
 const wave={choice:'move 1',move:{id:'thunderwave'}};
 assert.ok(evaluateMove(wave,{foeTypes:['Ground']})<0);
 assert.ok(evaluateMove(wave,{foeTypes:['Water'],foeStatus:'par'})<0);
 const boost={choice:'move 1',move:{id:'swordsdance'}};
 assert.ok(evaluateMove(boost,{ownBoosts:{atk:0}})>0);
 assert.ok(evaluateMove(boost,{ownBoosts:{atk:6}})<0);
});
