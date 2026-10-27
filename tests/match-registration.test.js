import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {runInNewContext} from 'node:vm';
import {webcrypto} from 'node:crypto';
import * as registration from '../src/core/match-registration.js';
const clone=x=>JSON.parse(JSON.stringify(x));
const p=()=>({season:1,round:1,week:5,home:0,away:1,phase:'watch',order:[0,1,2,3,4],plans:[null,null,null,null,null],behaviors:[null,null,null,null,null]});
const club=id=>({id,name:'구단 '+id,trainers:Array.from({length:5},(_,i)=>({name:'선수 '+id+'-'+i,tactics:10,switching:10,pokemon:Array.from({length:6},()=>({name:'피카츄',power:70,moves:['thunderbolt']}))}))});
async function fixture(){
 const g={season:1,round:0,week:4,seed:7,saveId:'career-1',saveRevision:0,coins:1000,club:'구단 0',clubs:[club(0),club(1)],pendingMatch:p()};registration.ensureRosterIds(g);
 const body={home:g.clubs[0],away:g.clubs[1],homeOrder:[0,1,2,3,4],awayOrder:[0,1,2,3,4],seed:[1,2,3,4]};
 const frozen=await registration.freezeMatch(body,g.pendingMatch,registration.lineupState(g,g.pendingMatch));
 g.pendingMatch.frozen=frozen;g.pendingMatch.result={engine:'showdown',home:0,away:1,rounds:[{}],aScore:5,bScore:0,registration:clone(frozen.registration)};
 return {g,body,frozen};
}
test('snapshot survives JSON reload, fixes seed and rejects altered inputs or another response',async()=>{
 const {g,frozen}=await fixture(),saved=clone(frozen);
 g.clubs[0].trainers[0].pokemon[0].moves=['splash'];assert.deepEqual(saved.request.seed,[1,2,3,4]);assert.deepEqual(saved.request.home.trainers[0].pokemon[0].moves,['thunderbolt']);
 await registration.validateRequest({...saved.request,registration:saved.registration});
 const changed=clone(saved);changed.request.seed[0]++;
 await assert.rejects(registration.validateRequest({...changed.request,registration:changed.registration}),/입력이 변경/);
 await assert.rejects(registration.validateResult(saved,{...g.pendingMatch.result,registration:{...saved.registration,id:'old-request'}}),/이전 요청/);
});
test('stable Pokémon IDs and owner checks survive transfers and reject another trainer’s Pokémon',async()=>{
 const {g,body}=await fixture(),ids=g.clubs[0].trainers[0].pokemon.map(x=>x.uid);
 registration.ensureRosterIds(g);assert.deepEqual(g.clubs[0].trainers[0].pokemon.map(x=>x.uid),ids);
 body.home.trainers[0].pokemon[0].ownerTrainerId=String(body.home.trainers[1].uid);
 assert.throws(()=>registration.validateRoster(body),/포획한 트레이너/);
});
function browser(g,store,locks){
 const ctx={registration,game:clone(g),SKEY:'save',crypto:webcrypto,navigator:{locks},Date,console,
  localStorage:{getItem:k=>store.get(k)||null,setItem:(k,v)=>{if(store.fail&&k==='save')throw Error('quota');store.set(k,v);},removeItem:k=>store.delete(k)},
  freshGame:()=>clone(g),renderOffice(){},myClub:()=>ctx.game.clubs[0],
  document:{getElementById(){return null;},createElement(){return {style:{},append(){}};},body:{append(){}}},addEventListener(){}};
 ctx.window=ctx;
 const source=readFileSync(new URL('../assets/match-registration-ui.js',import.meta.url),'utf8').replace(/^import .*;\n/,'');
 runInNewContext(source,ctx);return ctx;
}
const serialLocks=()=>{let tail=Promise.resolve();return {request:(_name,job)=>{const next=tail.then(job);tail=next.catch(()=>{});return next;}};};
test('two tabs settling one match grant money, standings and growth only once',async()=>{
 const {g}=await fixture(),store=new Map([['save',JSON.stringify(g)]]),locks=serialLocks();
 const a=browser(g,store,locks),b=browser(JSON.parse(store.get('save')),store,locks);a.game=JSON.parse(store.get('save'));
 let applied=0;
 const apply=ctx=>()=>{applied++;ctx.game.coins+=500;ctx.game.round++;ctx.game.trainerGrowth=(ctx.game.trainerGrowth||0)+1;delete ctx.game.pendingMatch;ctx.persist();};
 const result=await Promise.all([a.MatchRegistration.commit(a.game.pendingMatch,apply(a)),b.MatchRegistration.commit(b.game.pendingMatch,apply(b))]);
 assert.deepEqual(result,[true,false]);assert.equal(applied,1);
 const saved=JSON.parse(store.get('save'));assert.equal(saved.coins,1500);assert.equal(saved.round,1);assert.equal(saved.trainerGrowth,1);
});
test('save failure rolls back the whole result and lets the same snapshot retry',async()=>{
 const {g}=await fixture(),store=new Map([['save',JSON.stringify(g)]]),ctx=browser(g,store,serialLocks());
 const before=store.get('save');store.fail=true;
 await assert.rejects(ctx.MatchRegistration.commit(ctx.game.pendingMatch,()=>{ctx.game.coins+=500;ctx.game.round++;delete ctx.game.pendingMatch;ctx.persist();}),/저장하지 못했/);
 assert.equal(store.get('save'),before);assert.equal(ctx.game.coins,1000);assert.equal(ctx.game.round,0);assert.ok(ctx.game.pendingMatch.frozen);
 store.fail=false;await ctx.MatchRegistration.commit(ctx.game.pendingMatch,()=>{ctx.game.round++;delete ctx.game.pendingMatch;});assert.equal(ctx.game.round,1);
});
test('changed registered lineup is rejected before any reward is applied',async()=>{
 const {g}=await fixture(),store=new Map([['save',JSON.stringify(g)]]),ctx=browser(g,store,serialLocks());
 ctx.game.clubs[1].trainers[0].pokemon[0].item='Leftovers';ctx.persist();let applied=false;
 await assert.rejects(ctx.MatchRegistration.commit(ctx.game.pendingMatch,()=>{applied=true;}),/선수단이 변경/);assert.equal(applied,false);
});
