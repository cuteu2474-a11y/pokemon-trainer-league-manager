import test from 'node:test';
import assert from 'node:assert/strict';
import {Battle} from '@pkmn/sim';
import {rolloutActions,evaluateBattle} from '../src/battle/showdown-rollout.js';
import {packGPTeam} from '../src/battle/gp-battle-stream.js';
import {convertPokemon,injectBattleTeams} from '../src/battle/gp-adapter.js';
const gp={hp:94,atk:0,def:31,spa:94,spd:0,spe:94};
const team=(species,moves)=>Array.from({length:6},(_,i)=>({name:species+i,species,level:50,nature:'Hardy',moves,ca:200,pa:200,gp:{...gp}}));
function battle() {
  const a=team('Mewtwo',['thunderbolt','psychic']), b=team('Gyarados',['splash','tackle']);
  const sim=new Battle({formatid:'gen9customgame',seed:[1,2,3,4]});
  sim.setPlayer('p1',{name:'A',team:packGPTeam(a)});
  sim.setPlayer('p2',{name:'B',team:packGPTeam(b)});
  // This also verifies cloned state preserves GP-injected stats.
  injectBattleTeams(sim,a.map((m,i)=>convertPokemon({...m,natureModifiers:{}},sim.p1.pokemon[i].species)),
    b.map((m,i)=>convertPokemon({...m,natureModifiers:{}},sim.p2.pokemon[i].species)));
  sim.makeChoices('default','default');
  return sim;
}
test('cloned Showdown turn evaluates actions without mutating original',{timeout:30000},()=>{
  const sim=battle();
  const before=JSON.stringify(sim.toJSON());
  const results=rolloutActions(sim,{choices:['move 1','move 2'],opponentChoices:['move 1'],depth:1,samples:2});
  assert.equal(results.length,2);
  assert.ok(results.every(r=>r.runs>0),JSON.stringify(results));
  assert.equal(results[0].choice,'move 1');
  assert.equal(sim.turn,1);
  assert.equal(sim.p1.active[0].hp,sim.p1.active[0].maxhp);
  assert.equal(sim.p2.active[0].hp,sim.p2.active[0].maxhp);
  assert.equal(evaluateBattle(sim),0);
  assert.equal(JSON.stringify(sim.toJSON()),before, 'search must not append hypothetical events to the live log');
});
test('rollout budgets are bounded',()=>{
  assert.throws(()=>rolloutActions(battle(),{choices:['move 1'],depth:4}),RangeError);
});

test('public rollouts never substitute secret moves for missing revealed choices',()=>{
 const sim=battle();
 assert.throws(()=>rolloutActions(sim,{choices:['move 1'],opponentChoices:[],
   requirePublicChoices:true}),TypeError);
 const ranks=rolloutActions(sim,{choices:['move 1'],
   opponentChoices:['move 99'],requirePublicChoices:true,depth:1,samples:2});
 assert.equal(ranks[0].runs,0);
});

test('blind rollout does not change when private opposing item, ability and GP stats differ',()=>{
 const sim=battle();
 const params={choices:['move 1'],opponentChoices:['move 2'],
  requirePublicChoices:true,publicOpponent:true,depth:1,samples:2};
 const original=JSON.stringify(sim.toJSON());
 const first=rolloutActions(sim,params);
 assert.equal(JSON.stringify(sim.toJSON()),original,'blind forecast must not edit the live battle');
 const enemy=sim.p2.active[0];
 enemy.item='assaultvest';enemy.ability='multiscale';
 enemy.storedStats.spd*=3;enemy.baseStoredStats.spd*=3;
 enemy.storedStats.atk*=2;enemy.baseStoredStats.atk*=2;
 const second=rolloutActions(sim,params);
 assert.ok(first[0].runs>0);
 assert.deepEqual(second,first,'unrevealed private values cannot influence action scores');
});

test('blind rollout rejects hidden-choice fallback and multi-turn future knowledge',()=>{
 const sim=battle(),params={choices:['move 1'],opponentChoices:['move 1'],
  requirePublicChoices:true,publicOpponent:true};
 assert.throws(()=>rolloutActions(sim,{...params,depth:2}),RangeError);
 assert.throws(()=>rolloutActions(sim,{...params,requirePublicChoices:false}),RangeError);
});
