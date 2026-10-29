import test from 'node:test';
import assert from 'node:assert/strict';
import {simulateClubMatch,prepareRelayTeam,verifyRelayHandoff} from '../src/battle/club-match.js';
import {recoverRelay} from '../src/battle/relay-state.js';

const stats=['hp','atk','def','spa','spd','spe'];
const values=n=>Object.fromEntries(stats.map(s=>[s,n]));
const team=(species,moves,ca,trainer)=>Array.from({length:6},(_,i)=>({
  name:trainer+'-'+species+'-'+i,species,nature:'Hardy',
  moves,statCA:values(ca),statPA:values(Math.max(ca,175))
}));
const trainer=(species,moves,ca,id,expert=false)=>({
  team:team(species,moves,ca,id),tactics:expert?20:10,
  switching:expert?20:10,battleAnalysis:expert?20:10,
  resourceManagement:expert?20:10
});
const moves={
  Mewtwo:['psychic','thunderbolt','icebeam','recover'],
  Garchomp:['earthquake','dragonclaw','rockslide','swordsdance'],
  Magikarp:['tackle','flail','splash']
};

test('anonymous generated rosters get stable, unique IDs without source mutation',()=>{
 const source=Array.from({length:6},(_,i)=>({
   species:i%2?'Eevee':'Pikachu',moves:['tackle'],
   statCA:values(80),statPA:values(150)
 }));
 const prepared=prepareRelayTeam(source,'B',3);
 assert.equal(new Set(prepared.map(m=>m.pokemonId)).size,6);
 assert.ok(prepared.every(m=>m.pokemonId.startsWith('relay:B:3:')));
 assert.ok(prepared.every(m=>m.name===m.species));
 assert.ok(source.every(m=>m.pokemonId===undefined&&m.name===undefined));
 const named=source.map((mon,i)=>({...mon,uid:'owned-'+i}));
 assert.deepEqual(prepareRelayTeam(named,'A',0).map(m=>m.pokemonId),
   named.map(m=>m.uid));
 assert.throws(()=>prepareRelayTeam(source.map(m=>({...m,pokemonId:'duplicate'})),
   'A',0),/Duplicate relay Pokemon ID/);
});

test('handoff integrity detects corrupt identity, PP, HP, status, item and berry history',()=>{
 const make=()=>Array.from({length:6},(_,i)=>({
   pokemonId:'mon-'+i,hp:123,maxhp:180,status:i===0?'brn':'',
   statusData:{},item:i===2?'leftovers':'',lastItem:'',ateBerry:false,
   bondTriggered:false,protectionBusted:false,terastallized:'',
   stellarBoostedTypes:[],form:'Snorlax',
   pp:[4,10],moves:[{id:'earthquake',pp:4},{id:'rest',pp:10}]
 }));
 const original=make();
 assert.doesNotThrow(()=>verifyRelayHandoff(original,make(),'A'));
 const scenarios=[
   x=>x[0].hp--,x=>x[0].pp[0]--,x=>x[2].item='',
   x=>x[0].status='',x=>x[0].statusData.time=2,
   x=>x[2].ateBerry=true,x=>x[1].form='Ditto',
   x=>x[0].pokemonId=x[1].pokemonId,
   x=>x[0].moves[0].id='tackle'
 ];
 for(const change of scenarios){
   const altered=make();change(altered);
   assert.throws(()=>verifyRelayHandoff(original,altered,'A'),/Relay handoff/);
 }
});

test('five-challenger relay carries burn, consumed berry and exact 10% heal and PP',
 {timeout:45000},async()=>{
 const a=Array.from({length:5},(_,i)=>trainer('Snorlax',
   ['earthquake','bodyslam','rest','crunch'],175,'A'+i,true));
 for(const t of a)for(const p of t.team)p.item='sitrusberry';
 const b=Array.from({length:5},(_,i)=>({
   ...trainer('Arcanine',['willowisp','splash'],80,'B'+i,true),
   battlePlan:'control'
 }));
 const r=await simulateClubMatch(a,b,{seed:[1,2,3,4],maxTurns:160});
 assert.deepEqual(r.trainersDefeated,{A:0,B:5});
 assert.equal(r.winner,'A');
 assert.equal(r.rounds.length,5);
 assert.equal(r.rounds[0].result.initialStats.p1[0].item,'sitrusberry');
 assert.equal(r.rounds[0].result.finalState.p1[0].item,'');
 assert.equal(r.rounds[0].result.finalState.p1[0].ateBerry,true);
 let burnedCarried=0,usedPP=0;
 for(let i=0;i<r.rounds.length;i++){
   const duel=r.rounds[i],result=duel.result;
   assert.equal(duel.trainerA,0);
   assert.equal(duel.trainerB,i);
   assert.equal(result.aiDecisions.p1.remainingOpponentsAtStart,5-i);
   assert.equal(result.aiDecisions.p2.remainingOpponentsAtStart,5);
   if(!i)continue;
   const before=r.rounds[i-1].result.finalState.p1;
   const after=result.initialStats.p1;
   verifyRelayHandoff(recoverRelay(before),after,'A');
   for(let k=0;k<6;k++){
     const old=before[k],current=after[k];
     assert.equal(current.hp,old.hp>0?
       Math.min(old.maxhp,old.hp+Math.floor(old.maxhp*.10)):0);
     assert.deepEqual(current.pp,old.pp);
     assert.equal(current.status,old.status);
     assert.equal(current.item,old.item);
     assert.equal(current.ateBerry,old.ateBerry);
     if(current.hp>0&&current.status==='brn')burnedCarried++;
     usedPP+=old.pp.reduce((sum,pp,j)=>
       sum+Math.max(0,pp-result.finalState.p1[k].pp[j]),0);
   }
   assert.ok(result.initialStats.p2.every(mon=>mon.hp===mon.maxhp&&!mon.status));
 }
 assert.ok(burnedCarried>=4,'a burn survived at least one trainer handoff');
 assert.ok(usedPP>0,'carried Pokémon spend PP across consecutive duels');
});

test('nine-duel relay handles both sides winning and replacement trainers with fresh squads',
 {timeout:60000},async()=>{
 const a=[['Mewtwo',145],['Magikarp',80],['Mewtwo',145],
   ['Garchomp',150],['Mewtwo',150]]
   .map(([s,ca],i)=>trainer(s,moves[s],ca,'A'+i,true));
 const b=[['Magikarp',70],['Mewtwo',160],['Magikarp',80],
   ['Mewtwo',145],['Magikarp',80]]
   .map(([s,ca],i)=>trainer(s,moves[s],ca,'B'+i,false));
 const r=await simulateClubMatch(a,b,{seed:[1,2,3,4],maxTurns:170});
 assert.equal(r.rounds.length,9);
 assert.equal(r.winner,'A');
 assert.deepEqual(r.trainersDefeated,{A:4,B:5});
 assert.ok(r.rounds.some(x=>x.winner==='A'));
 assert.ok(r.rounds.some(x=>x.winner==='B'));
 for(let i=0;i<r.rounds.length;i++){
   const current=r.rounds[i],next=r.rounds[i+1];
   assert.equal(current.result.aiDecisions.p1.remainingOpponentsAtStart,5-current.trainerB);
   assert.equal(current.result.aiDecisions.p2.remainingOpponentsAtStart,5-current.trainerA);
   if(!next)continue;
   assert.equal(next.trainerA,current.trainerA+(current.winner==='B'?1:0));
   assert.equal(next.trainerB,current.trainerB+(current.winner==='A'?1:0));
   for(const [side,key,oldIndex,newIndex] of [
     ['A','p1',current.trainerA,next.trainerA],
     ['B','p2',current.trainerB,next.trainerB]
   ]){
     const incoming=next.result.initialStats[key];
     if(oldIndex===newIndex){
       const expected=recoverRelay(current.result.finalState[key])
         .sort((x,y)=>Number(y.hp>0)-Number(x.hp>0));
       verifyRelayHandoff(expected,incoming,side);
     }else{
       assert.ok(incoming.every(mon=>mon.hp===mon.maxhp&&!mon.status));
       assert.ok(incoming.every(mon=>!current.result.finalState[key].some(
         old=>old.pokemonId===mon.pokemonId)));
     }
   }
 }
});
