import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {runInNewContext} from 'node:vm';
import {webcrypto} from 'node:crypto';
import * as registration from '../src/core/match-registration.js';
import {createCareerBackup,parseCareerBackup} from '../src/core/career-backup.js';
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
test('old oversized collections migrate without discarding Pokémon, while match registration fixes six starters',async()=>{
 const {g}=await fixture(),t=g.clubs[0].trainers[0];
 const extras=Array.from({length:3},(_,i)=>({name:'이브이',uid:'pokemon:legacy-'+i,power:60}));
 t.pokemon.push(...extras);
 registration.ensureRosterIds(g);
 assert.equal(t.pokemon.length,6);
 assert.deepEqual(t.pokemonReserve,extras);
 assert.equal(t.pokemonReserve.every(p=>p.ownerTrainerId===String(t.uid)),true);
 const lineup=registration.lineupState(g,g.pendingMatch);
 assert.equal(lineup.clubs[0].trainers[0].pokemon.length,6);
 assert.equal(lineup.clubs[0].trainers[0].pokemonReserve.length,3);
 const request={home:g.clubs[0],away:g.clubs[1],homeOrder:[0,1,2,3,4],awayOrder:[0,1,2,3,4],seed:[1,2,3,4]};
 const frozen=await registration.freezeMatch(request,g.pendingMatch,lineup);
 assert.equal(frozen.request.home.trainers[0].pokemon.length,6);
 assert.equal(frozen.request.home.trainers[0].pokemonReserve.length,3);
 const before=frozen.registration.liveHash;
 [t.pokemon[0],t.pokemonReserve[0]]=[t.pokemonReserve[0],t.pokemon[0]];
 assert.notEqual(await registration.digest(registration.lineupState(g,g.pendingMatch)),before);
});
function browser(g,store,locks){
 const listeners={};const nodes=new Map();
 const ctx={registration,createCareerBackup,parseCareerBackup,game:clone(g),SKEY:'save',crypto:webcrypto,navigator:{locks},Date,console,
  localStorage:{getItem:k=>store.get(k)||null,setItem:(k,v)=>{if(store.fail&&k==='save')throw Error('quota');store.set(k,v);},removeItem:k=>store.delete(k)},
  freshGame:()=>clone(g),renderOffice(){},myClub:()=>ctx.game.clubs[0],
  document:{getElementById:id=>nodes.get(id)||null,createElement(){return {style:{},append(){},setAttribute(){},focus(){},remove(){nodes.delete(this.id);}};},body:{append(node){if(node.id)nodes.set(node.id,node);}},addEventListener:(event,fn)=>{listeners['document:'+event]=fn;}},
  addEventListener:(event,fn)=>{listeners[event]=fn;},alert(){}};
 ctx.listeners=listeners;
 ctx.MatchdayPreparation={invalidate(){ctx.invalidated=true;},render(){}};ctx.window=ctx;
 const source=readFileSync(new URL('../assets/match-registration-ui.js',import.meta.url),'utf8').replace(/^import .*;\n/gm,'');
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

 test('a pending old-rule match returns to preparation while completed receipts remain intact',async()=>{
 const {g}=await fixture();g.pendingMatch.frozen.registration.rulesVersion='old-rules';g.appliedMatches={'earlier':{id:'completed'}};
 const store=new Map([['save',JSON.stringify(g)]]),ctx=browser(g,store,serialLocks());
 assert.equal(ctx.invalidated,true);assert.equal(ctx.game.pendingMatch.phase,'prepare');assert.equal(ctx.game.pendingMatch.frozen,undefined);assert.equal(ctx.game.pendingMatch.result,undefined);assert.equal(ctx.game.appliedMatches.earlier.id,'completed');
});
test('reload resumes interrupted research or running match requests as retryable preparation',async()=>{
 for(const phase of ['research','running']){
  const {g}=await fixture();g.pendingMatch.phase=phase;
  const store=new Map([['save',JSON.stringify(g)]]),ctx=browser(g,store,serialLocks());
  assert.equal(ctx.game.pendingMatch.phase,'prepare');
  assert.match(ctx.game.pendingMatch.error,/중단/);
  assert.ok(ctx.game.pendingMatch.frozen);
  assert.equal(JSON.parse(store.get('save')).pendingMatch.phase,'prepare');
 }
});
test('opening a second tab without a migration does not silently bump the save revision',async()=>{
 const {g}=await fixture(),store=new Map([['save',JSON.stringify(g)]]),locks=serialLocks();
 const a=browser(g,store,locks),b=browser(g,store,locks);
 assert.equal(JSON.parse(store.get('save')).saveRevision,0);
 assert.equal(a.game.saveRevision,0);assert.equal(b.game.saveRevision,0);
 a.persist();assert.equal(JSON.parse(store.get('save')).saveRevision,1);
 b.listeners.storage({key:'save'});
 assert.equal(b.MatchRegistration.stale,true);
 assert.ok(b.document.getElementById('match-save-notice'));
 assert.throws(()=>b.persist(),/다른 탭/);
 b.MatchRegistration.reload();
 assert.equal(b.MatchRegistration.stale,false);assert.equal(b.game.saveRevision,1);
});
test('a background tab checks the save again on focus before changing game data',async()=>{
 const {g}=await fixture(),store=new Map([['save',JSON.stringify(g)]]),locks=serialLocks();
 const a=browser(g,store,locks),b=browser(g,store,locks);
 a.persist();b.listeners.focus();
 assert.equal(b.MatchRegistration.stale,true);
});
test('restore takes a validated backup atomically, assigns a new career ID and makes old tabs stale',async()=>{
 const {g}=await fixture(),store=new Map([['save',JSON.stringify(g)]]),locks=serialLocks();
 const a=browser(g,store,locks),b=browser(g,store,locks);
 const candidate={...clone(g),manager:'복원할 감독',week:6,round:2,clubs:[...g.clubs,...Array.from({length:38},(_,i)=>club(i+2))],fixtures:[[],[],[],[]],results:[]};
 const data=JSON.stringify(createCareerBackup(candidate));
 assert.equal(await a.MatchRegistration.restoreCareer(data),true);
 const restored=JSON.parse(store.get('save'));
 assert.equal(restored.manager,'복원할 감독');assert.equal(restored.week,6);
 assert.notEqual(restored.saveId,g.saveId);assert.equal(restored.saveRevision,1);
 b.listeners.storage({key:'save'});assert.equal(b.MatchRegistration.stale,true);
 assert.throws(()=>b.persist(),/다른 탭/);
});
test('failed backup restore preserves the previous save and current in-memory career',async()=>{
 const {g}=await fixture(),store=new Map([['save',JSON.stringify(g)]]),ctx=browser(g,store,serialLocks());
 const before=store.get('save');
 await assert.rejects(ctx.MatchRegistration.restoreCareer('{"format":"penta-rivals-career"}'),/백업 파일/);
 assert.equal(store.get('save'),before);
 const candidate={...clone(g),manager:'복원 테스트 감독',clubs:[...g.clubs,...Array.from({length:38},(_,i)=>club(i+2))],fixtures:[[],[],[],[]],results:[]};
 store.fail=true;
 await assert.rejects(ctx.MatchRegistration.restoreCareer(JSON.stringify(createCareerBackup(candidate))),/복원하지 못/);
 assert.equal(store.get('save'),before);assert.equal(ctx.game.saveId,g.saveId);
});
