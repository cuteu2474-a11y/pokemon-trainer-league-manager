import test from 'node:test';
import assert from 'node:assert/strict';
import {TrainerAI} from '../src/battle/trainer-ai.js';

const roster=[
 {pokemonId:'active',name:'active',species:'Gyarados',moves:['waterfall']},
 {pokemonId:'reserve',name:'reserve',species:'Blastoise',moves:['surf','icebeam']}
];
function scenario(pp){
 const ownActive={name:'active',leagueMeta:{pokemonId:'active'},
   baseMoveSlots:[{id:'waterfall',pp:15,disabled:false}]};
 const reserve={name:'reserve',leagueMeta:{pokemonId:'reserve'},
   baseMoveSlots:[{id:'surf',pp,disabled:false},{id:'icebeam',pp,disabled:false}]};
 const battle={turn:5,p1:{pokemon:[ownActive,reserve],active:[ownActive],
   sideConditions:{}},p2:{active:[{hp:100,maxhp:100}],sideConditions:{}}};
 const ai=new TrainerAI({}, {tactics:20,switching:20,resourceManagement:20,
  relayOpponentsRemaining:4,aiProfile:{preservation:20,switchSkill:20}},
  {seed:[1,2,3,4],team:roster,battleProvider:()=>battle});
 ai.ownActive=roster[0];ai.foeSpecies='Garchomp';
 const mon={active:false,ident:'p1: reserve',details:'Blastoise',condition:'100/100'};
 const rating=ai.candidateScore(mon,2,['Dragon','Ground']);
 return {ai,rating,mon,battle};
}
test('the live bench scorer excludes own depleted attacks after PP carries forward',()=>{
 const full=scenario(10),dry=scenario(0);
 assert.ok(full.rating>dry.rating+15,'PP-depleted coverage cannot rate as available offense');
 const drySlots=dry.ai.ownedAttackSlots(dry.mon,2);
 assert.deepEqual(drySlots.map(m=>m.pp),[0,0]);
 assert.ok(dry.rating>0,'a depleted reserve is not an illegal switch');
});
test('switch diagnostics are bounded, public-only and count realistic urgent choices',()=>{
 const own={hp:25,maxhp:100,moveSlots:[{id:'tackle',pp:30}]};
 const foe={hp:100,maxhp:100};
 const battle={turn:7,p1:{active:[own],sideConditions:{}},
   p2:{active:[foe],sideConditions:{}}};
 const team=[
   {name:'active',species:'Pikachu',moves:['tackle']},
   {name:'bench',species:'Garchomp',moves:['earthquake']}
 ];
 const ai=new TrainerAI({}, {tactics:20,switching:20,relayOpponentsRemaining:4},
   {seed:[1,2,3,4],team,battleProvider:()=>battle});
 ai.ownActive=team[0];ai.foeSpecies='Eevee';
 const request={active:[{moves:[{move:'Tackle',disabled:false}]}],
   side:{pokemon:[
     {active:true,ident:'p1: active',details:'Pikachu',condition:'25/100'},
     {active:false,ident:'p1: bench',details:'Garchomp',condition:'100/100'}
   ]}};
 assert.equal(ai.moveProbability(request),-1);
 assert.equal(ai.decisions.switchAnalysis.urgentSwitches,1);
 assert.equal(ai.decisions.switchAnalysis.scenes.length,1);
 const scene=ai.decisions.switchAnalysis.scenes[0];
 assert.equal(scene.decision,'urgent-switch');
 assert.equal(scene.foeSpecies,'Eevee');
 assert.ok(!JSON.stringify(scene).includes('moveSlots'),
   'no hidden opponent moves or private sets may enter diagnostics');
 for(let i=0;i<25;i++)ai.moveProbability(request);
 assert.ok(ai.decisions.switchAnalysis.scenes.length<=8);
});
