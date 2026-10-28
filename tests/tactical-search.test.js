import {Dex} from '@pkmn/sim';
import {planPreference} from '../src/battle/battle-plans.js';
import test from 'node:test';
import assert from 'node:assert/strict';
import {searchBudget,knownModifier,evaluateMove,selectTacticalMove,wastedStatusMove,wastedSelfMove} from '../src/battle/tactical-search.js';
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

test('direct burn and paralysis are not considered useful on an already statused target',()=>{
 const burn={exists:true,id:'willowisp',type:'Fire',category:'Status',status:'brn'};
 const paralysis={exists:true,id:'thunderwave',type:'Electric',category:'Status',status:'par'};
 assert.equal(wastedStatusMove(burn,{types:['Normal'],status:'par'}),true);
 assert.equal(wastedStatusMove(paralysis,{types:['Water'],status:'brn'}),true);
 assert.equal(wastedStatusMove(burn,{types:['Normal'],status:''}),false);
});
test('a damaging move with possible secondary status is never discarded',()=>{
 const scald={exists:true,id:'scald',type:'Water',category:'Special',basePower:80,
  secondaries:[{chance:30,status:'brn'}]};
 assert.equal(wastedStatusMove(scald,{types:['Normal'],status:'par'}),false);
});
 
test('expert can exclude pointless full-HP healing, capped boosts and repeated screens',()=>{
 const recover={exists:true,id:'recover',category:'Status',heal:[1,2]};
 const boost={exists:true,id:'swordsdance',category:'Status',target:'self',boosts:{atk:2}};
 const reflect={exists:true,id:'reflect',category:'Status',sideCondition:'reflect',target:'allySide'};
 assert.equal(wastedSelfMove(recover,{ownHpFraction:1}),true);
 assert.equal(wastedSelfMove(recover,{ownHpFraction:.4}),false);
 assert.equal(wastedSelfMove(boost,{ownBoosts:{atk:6}}),true);
 assert.equal(wastedSelfMove(boost,{ownBoosts:{atk:5}}),false);
 assert.equal(wastedSelfMove(reflect,{ownSideConditions:{reflect:{duration:3}}}),true);
 assert.equal(wastedSelfMove(reflect,{foeSideConditions:{reflect:{duration:3}}}),false);
});
test('publicly known absorption immunity prevents ineffective primary status',()=>{
 const burn={exists:true,id:'willowisp',type:'Fire',category:'Status',status:'brn'};
 const scald={exists:true,id:'scald',type:'Water',category:'Special',secondaries:[{status:'brn'}]};
 assert.equal(wastedStatusMove(burn,{types:['Normal'],ability:'Flash Fire'}),true);
 assert.equal(wastedStatusMove(burn,{types:['Normal'],ability:''}),false);
 assert.equal(wastedStatusMove(scald,{types:['Normal'],ability:'Water Absorb'}),false);
});
test('existing own screen and nearly fainted foe alter legal status move score',()=>{
 const reflect={choice:'move 1',move:{id:'reflect'}};
 assert.ok(evaluateMove(reflect,{ownSideConditions:{reflect:{duration:2}}})<0);
 assert.ok(evaluateMove(reflect,{foeSideConditions:{reflect:{duration:2}}})>0);
 const toxic={choice:'move 2',move:{id:'toxic'}};
 assert.ok(evaluateMove(toxic,{foeTypes:['Normal'],foeHpFraction:.1})<
   evaluateMove(toxic,{foeTypes:['Normal'],foeHpFraction:1}));
});

test('coaching preference honors hazard layers, screen owner, and +6 boost cap',()=>{
 const own={hp:100,maxhp:100,boosts:{atk:4}};
 const enemy={hp:100,maxhp:100,types:['Normal']};
 const battle={p1:{active:[own],sideConditions:{}},
   p2:{active:[enemy],sideConditions:{spikes:{layers:1}}}};
 const spikes=Dex.moves.get('spikes');
 const reflect=Dex.moves.get('reflect');
 const dance=Dex.moves.get('swordsdance');
 assert.equal(planPreference(spikes,battle,'p1','control'),13);
 battle.p2.sideConditions.spikes.layers=3;
 assert.equal(planPreference(spikes,battle,'p1','control'),-45);
 battle.p1.sideConditions.reflect={duration:2};
 delete battle.p2.sideConditions.spikes;
 assert.equal(planPreference(reflect,battle,'p1','control'),-45);
 delete battle.p1.sideConditions.reflect;
 battle.p2.sideConditions.reflect={duration:2};
 assert.equal(planPreference(reflect,battle,'p1','control'),13);
 assert.ok(planPreference(dance,battle,'p1','offense')>0,
  'a +4 boost can still increase to +6');
 own.boosts.atk=6;
 assert.ok(planPreference(dance,battle,'p1','offense')<0);
});
