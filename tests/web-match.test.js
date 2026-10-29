import {matchLoad} from '../src/core/squad-condition.js';
import {readFileSync} from 'node:fs';
import {runInNewContext} from 'node:vm';
import test from 'node:test';
import assert from 'node:assert/strict';
import {battlePokemon, prepareClub, runMatch} from '../src/web/match-service.js';
import {normalizeStatPairs} from '../src/core/stat-potential.js';
import handler from '../api/match.js';
import {ensureRosterIds,freezeMatch,lineupState,validateResult} from '../src/core/match-registration.js';
const pokemon=(name='피카츄',power=80)=>({name,level:50,power});
const club=id=>({id,trainers:Array.from({length:5},(_,i)=>({name:'트레이너 '+i,tactics:10,switching:10,pokemon:Array.from({length:6},()=>pokemon())}))});
test('legacy Korean roster maps to actual species and valid GP; explicit sets retained',()=>{
 const mon=battlePokemon(pokemon());assert.equal(mon.species,'Pikachu');
 assert.deepEqual(mon.statCA,normalizeStatPairs(pokemon()).statCA);
 assert.equal(Object.hasOwn(mon,'level'),false);
 assert.equal(Object.hasOwn(mon,'ca'),false);
 const explicit=battlePokemon({...pokemon(),moves:['thunderbolt'],item:'Light Ball',ability:'Lightning Rod'});
 assert.deepEqual(explicit.moves,['thunderbolt']);assert.equal(explicit.item,'Light Ball');
 assert.throws(()=>battlePokemon(pokemon('존재하지 않는 포켓몬')),/전투 데이터/);
 assert.deepEqual(battlePokemon({...pokemon(),level:101}).statCA,mon.statCA,
   'old level is ignored after migration');
});
test('lineup is an explicit permutation of five original trainers',()=>{
 const c=club(0),order=[4,2,3,0,1];const prepared=prepareClub(c,order);
 assert.deepEqual(prepared.map(t=>t.name),order.map(i=>c.trainers[i].name));
 assert.throws(()=>prepareClub(c,[0,0,1,2,3]),/순서/);
 c.trainers[0]=null;assert.throws(()=>prepareClub(c,order),/트레이너/);
});
test('web service returns actual relay battle logs and score', {timeout:120000},async()=>{
 const a=club(0),b=club(1);
 for(const t of a.trainers)for(const p of t.pokemon)Object.assign(p,{name:'뮤츠',level:70,power:160,moves:['psychic']});
 for(const t of b.trainers)for(const p of t.pokemon)Object.assign(p,{name:'잉어킹',level:10,power:10,moves:['splash']});
 const fixture={season:1,round:1,week:5,home:0,away:1,order:[4,3,2,1,0]};const save={clubs:[a,b]};ensureRosterIds(save);
 const frozen=await freezeMatch({home:a,away:b,homeOrder:fixture.order,awayOrder:[0,1,2,3,4],seed:[1,2,3,4]},fixture,lineupState(save,fixture));
 const result=await runMatch({...frozen.request,registration:frozen.registration});await validateResult(frozen,result);
 assert.equal(result.engine,'showdown');assert.equal(result.aScore,5);assert.equal(result.bScore,0);assert.equal(result.rounds.length,5);
 assert.equal(result.rounds[0].initial.p1.length,6);
 // The web match API must preserve the engine's switch and ace evidence
 // so the post-match report can use real observations, not inferred events.
 assert.ok(result.rounds.every(round=>round.switchOutcomes?.bySide?.p1&&
   round.switchOutcomes?.bySide?.p2));
 assert.equal(result.rounds.reduce((sum,round)=>
   sum+round.switchOutcomes.bySide.p1.choices,0),
   result.rounds.reduce((sum,round)=>
   sum+(round.aiDecisions.p1.voluntarySwitches||0),0));
 assert.equal(result.aceHandoffs.A.handoffs,result.rounds.length-1);
 assert.ok(result.aceHandoffs.A.records.every(record=>
   typeof record.ready==='boolean'&&typeof record.species==='string'));
 assert.equal(new Set(result.rounds[0].initial.p1.map(m=>m.name)).size,6);
 assert.ok(result.rounds[0].initial.p1.every(m=>m.hp>0&&m.hp<=m.maxhp));
 assert.equal(result.report.home.reduce((n,m)=>n+m.knockouts,0),30);
 assert.equal(result.teams.home[0].name,'트레이너 4');assert.match(result.rounds[0].log,/\|move\|/);
 assert.equal(result.visuals.Mewtwo.id,'mewtwo');assert.equal(result.visuals.Mewtwo.num,150);
 assert.equal(result.moveVisuals.Psychic.type,'Psychic');assert.equal(result.moveVisuals.Psychic.label,'사이코키네시스');
 assert.equal(result.typeChart.Electric.Ground,0);assert.equal(result.typeChart.Electric.Water,2);
 assert.ok(result.rounds[0].initial.p1[0].pp.length>0);assert.match(result.rounds[0].log,/\|league-state\|/);
 // The real web API output is consumed directly by the trainer evaluation UI.
 const browser={};browser.globalThis=browser;
 runInNewContext(readFileSync(new URL('../assets/trainer-match-evaluation.js',import.meta.url),'utf8'),browser);
 const reviews=browser.TrainerMatchEvaluation.summarize(result,'home');
 assert.equal(reviews.length,5);
 assert.equal(reviews[0].name,'트레이너 4');
 assert.equal(reviews[0].duels,5);
 assert.ok(reviews.slice(1).every(x=>x.duels===0));
 assert.equal(reviews[0].matched,result.rounds.reduce((n,r)=>
   n+(r.switchOutcomes?.bySide?.p1?.matched||0),0));
 assert.equal(reviews[0].aceHandoffs,
   result.aceHandoffs.A.records.filter(x=>x.trainerIndex===0).length);
 assert.ok(browser.TrainerMatchEvaluation.renderOne(reviews[0],true).includes('이번 경기 전술 관찰'));
 matchLoad({season:1,week:5,clubs:[a,b]},{home:0,away:1},{id:'1:1:0:1',result});
 assert.equal(a.trainers[4].fatigue,16);assert.equal(a.trainers[0].fatigue,0);assert.ok(a.trainers[4].pokemon.some(p=>p.fatigue>0));
});
test('API rejects invalid methods and invalid rosters with no result',async()=>{
 const response=()=>({statusCode:0,headers:{},setHeader(k,v){this.headers[k]=v;},end(body){this.body=JSON.parse(body);}});
 let res=response();await handler({method:'GET'},res);assert.equal(res.statusCode,405);
 res=response();await handler({method:'POST',body:{}},res);assert.equal(res.statusCode,400);assert.ok(res.body.error);assert.equal(res.body.engine,undefined);
});
