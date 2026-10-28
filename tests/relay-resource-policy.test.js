import test from 'node:test';
import assert from 'node:assert/strict';
import {Dex} from '@pkmn/sim';
import {ppConservation,ownReserveStrength,aceSwitchAdjustment} from '../src/battle/relay-resource-policy.js';
import {TrainerAI} from '../src/battle/trainer-ai.js';

const thunder=Dex.moves.get('thunderbolt');
const discharge=Dex.moves.get('discharge');
const pps=(pp=1)=>({moveSlots:[{id:'thunderbolt',pp,maxpp:15},{id:'discharge',pp:12,maxpp:15}]});
const params=(move,extra={})=>({move,options:[thunder,discharge],own:pps(),
  ownTypes:['Electric'],foeTypes:['Water'],remaining:4,preservation:18,ppHabit:1,
  foeHpFraction:.8,...extra});

test('valuable low PP is saved only when a comparable legal attack exists',()=>{
 const scarce=ppConservation(params(thunder));
 const alternative=ppConservation(params(discharge));
 assert.ok(scarce.bonus<0);
 assert.ok(alternative.bonus>0);
 assert.equal(alternative.saved,true);
 const disabled=pps();
 disabled.moveSlots[1].disabled=true;
 assert.equal(ppConservation(params(thunder,{own:disabled})).bonus,0);
 const immune=ppConservation(params(thunder,{foeTypes:['Ground']}));
 assert.equal(immune.bonus,0);
});

test('conservation never outranks a probable KO, final opponent or imminent finish',()=>{
 assert.equal(ppConservation(params(thunder,{koRate:.8})).bonus,0);
 assert.equal(ppConservation(params(thunder,{remaining:1})).bonus,0);
 assert.equal(ppConservation(params(thunder,{foeHpFraction:.1})).bonus,0);
 assert.equal(ppConservation(params(thunder,{own:pps(8)})).bonus,0);
});

test('conservation is not activated by a non-viable weaker replacement or untrained profile',()=>{
 assert.equal(ppConservation(params(thunder,{options:[thunder,Dex.moves.get('tackle')]})).bonus,0);
 assert.equal(ppConservation(params(thunder,{preservation:3,ppHabit:0})).bonus,0);
});

test('ace strength uses current CA, not growth potential or historical level',()=>{
 const low={species:'Mewtwo',statCA:{hp:70,atk:70,def:70,spa:70,spd:70,spe:70},
  statPA:{hp:200,atk:200,def:200,spa:200,spd:200,spe:200},level:100};
 const high={...low,statCA:{hp:170,atk:170,def:170,spa:170,spd:170,spe:170},level:1};
 assert.ok(ownReserveStrength(high)>ownReserveStrength(low));
 assert.equal(ownReserveStrength({...high,level:99}),ownReserveStrength(high));
 assert.equal(ownReserveStrength({...high,statPA:low.statPA}),ownReserveStrength(high));
});

test('reserve ace stays out of trivial exchanges but endangered ace can retreat',()=>{
 const pikachu={species:'Pikachu'},mewtwo={species:'Mewtwo'};
 const team=[pikachu,mewtwo];
 const easy={active:pikachu,candidate:mewtwo,team,remaining:4,preservation:20,
  currentHealth:.9,currentDanger:1.1,matchupGain:0,candidateHealthAfterEntry:.9};
 assert.ok(aceSwitchAdjustment(easy)<0);
 assert.equal(aceSwitchAdjustment({...easy,currentDanger:3}),0,
  'a meaningful counter-switch must not be suppressed');
 assert.equal(aceSwitchAdjustment({...easy,remaining:1}),0);
 const danger={...easy,active:mewtwo,candidate:pikachu,currentHealth:.25,
  currentDanger:3,candidateHealthAfterEntry:.9};
 assert.ok(aceSwitchAdjustment(danger)>0);
 assert.equal(aceSwitchAdjustment({...danger,candidateHealthAfterEntry:.1}),0);
});

test('live trainer preference conserves PP when habit is trained across relay opponents',()=>{
 const own={hp:160,maxhp:200,types:['Electric'],getTypes(){return this.types;},
  moveSlots:[{id:'thunderbolt',pp:1,maxpp:15},{id:'discharge',pp:12,maxpp:15}]};
 const foe={hp:140,maxhp:200,status:'',types:['Water'],getTypes(){return this.types;}};
 const battle={requestState:'idle',p1:{active:[own],sideConditions:{}},
  p2:{active:[foe],sideConditions:{}}};
 const trainer={tactics:20,switching:20,resourceManagement:20,
  relayOpponentsRemaining:4,aiProfile:{moveSkill:20,switchSkill:20,analysis:20,
    preservation:20,traits:['PP 관리자'],habitScores:{pp:100}}};
 const ai=new TrainerAI({},trainer,{seed:[1,2,3,4],
  team:[{species:'Pikachu'}],battleProvider:()=>battle});
 ai.ownActive={species:'Pikachu'};ai.foeSpecies='Blastoise';
 const choice=ai.chooseMove({},[{choice:'move 1',move:{id:'thunderbolt'}},
  {choice:'move 2',move:{id:'discharge'}}]);
 assert.equal(choice,'move 2');
 assert.ok(ai.decisions.ppConservations>0);
});

test('actual voluntary-switch comparison discounts exposing a healthy ace in relay',()=>{
 const team=[{species:'Pikachu',name:'small',moves:['thunderbolt']},
   {species:'Mewtwo',name:'ace',moves:['psychic']}];
 const request={active:[{moves:[{move:'Thunderbolt',disabled:false}]}],
   side:{pokemon:[
     {active:true,ident:'p1: small',details:'Pikachu',condition:'90/100'},
     {active:false,ident:'p1: ace',details:'Mewtwo',condition:'100/100'}]}};
 const compare=remaining=>{
   const ai=new TrainerAI({},{
     tactics:20,switching:20,resourceManagement:20,relayOpponentsRemaining:remaining,
     aiProfile:{preservation:20,switchSkill:20,analysis:20}
   },{seed:[1,2,3,4],team});
   ai.foeSpecies='Eevee';ai.ownActive=team[0];
   ai.moveProbability(request);
   return ai.lastActionComparison;
 };
 const now=compare(1),relay=compare(4);
 assert.equal(relay.moveScore,now.moveScore,'same legal attack at the same battle state');
 assert.ok(relay.switchScore<now.switchScore-5,
   'keeping a healthy ace for later challengers changes the real decision score');
});
