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
