import test from 'node:test';
import assert from 'node:assert/strict';
import {Dex} from '@pkmn/sim';
import {planMoves, learnedMoves, battlePlan} from '../src/battle/battle-plans.js';
import {prepareClub} from '../src/web/match-service.js';

test('league plans use learned moves, retain attacks and differ by strategy',()=>{
 for(const name of ['Venusaur','Charizard','Blastoise','Pikachu','Snorlax','Gardevoir','Lucario','Magikarp','Aegislash','Meowscarada']){
  const species=Dex.species.get(name),legal=new Set(learnedMoves(species));
  for(const plan of ['balanced','offense','control','endurance']){
   const moves=planMoves(species,plan);assert.ok(moves.length>=1&&moves.length<=4);
   assert.equal(new Set(moves).size,moves.length);assert.ok(moves.every(id=>legal.has(id)),name);
   assert.ok(moves.some(id=>Dex.moves.get(id).category!=='Status'),name);
  }
 }
 const venusaur=Dex.species.get('Venusaur');
 assert.notDeepEqual(planMoves(venusaur,'control'),planMoves(venusaur,'offense'));
 assert.ok(planMoves(venusaur,'endurance').includes('synthesis'));
});
test('the confirmed plan follows reordered trainers and preserves explicit moves',()=>{
 const club={trainers:Array.from({length:5},(_,i)=>({name:'트레이너 '+i,battlePlan:i===2?'control':'offense',pokemon:Array.from({length:6},()=>({name:'이상해꽃',level:50,power:80}))}))};
 club.trainers[2].pokemon[0].moves=['tackle'];
 const prepared=prepareClub(club,[2,0,1,3,4]);
 assert.equal(prepared[0].battlePlan,'control');assert.equal(prepared[0].name,'트레이너 2');
 assert.deepEqual(prepared[0].team[0].moves,['tackle']);
 assert.notDeepEqual(prepared[0].team[1].moves,prepared[1].team[1].moves);
 assert.equal(battlePlan({battlePlan:'invalid',tactics:20,switching:10}),'offense');
});
