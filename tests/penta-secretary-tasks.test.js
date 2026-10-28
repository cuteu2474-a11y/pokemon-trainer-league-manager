import test from 'node:test';
import assert from 'node:assert/strict';
import '../assets/penta-secretary-tasks.js';
const build=globalThis.PentaSecretaryTasks.build;
const trainer=(name,pokemonCount=6)=>({name,pokemon:Array.from({length:pokemonCount},(_,i)=>({name:'P'+i}))});
const base=()=>({game:{season:1,week:2,aiOffers:[]},club:{trainers:[0,1,2,3,4].map(i=>trainer('T'+i)),reserveTrainers:[],trainerAcademy:[]}});
test('no assistant tasks are invented for an unblocked week',()=>{
 const {game,club}=base();assert.deepEqual(build(game,club),[]);
});
test('match preparation, pending offers and registration are actionable',()=>{
 const {game,club}=base();game.pendingMatch={phase:'prepare'};
 game.aiOffers=[{status:'pending',season:1,expires:2},{status:'accepted',season:1,expires:2}];
 club.trainers[0].pokemonScouting={candidate:{name:'피카츄'}};
 const tasks=build(game,club);
 assert.deepEqual(tasks.map(x=>x.id),['match','offers','scouting']);
 assert.ok(tasks.every(x=>x.urgent));
});
test('contracts, vacancies and market deadline appear without changing state',()=>{
 const {game,club}=base();game.week=4;
 club.trainers[0].contractDecision={status:'pending'};
 club.trainers[1].pokemon.pop();
 const before=JSON.stringify({game,club});
 const tasks=build(game,club);
 assert.deepEqual(tasks.map(x=>x.id),['contracts','lineup','market']);
 assert.equal(JSON.stringify({game,club}),before);
});
test('research reminder disappears once its weekly key is complete',()=>{
 const {game,club}=base();
 game.management={notice:'이번 주 기술 연구를 완료하지 못했습니다. 기술 연구를 재시도한 뒤 진행해 주세요.'};
 assert.deepEqual(build(game,club).map(x=>x.id),['research']);
 game.trainerAI={movesProcessedWeek:'1:2'};
 assert.deepEqual(build(game,club),[]);
});
test('expired or past-season offers do not appear',()=>{
 const {game,club}=base();
 game.aiOffers=[{status:'pending',season:1,expires:1},{status:'pending',season:0,expires:4}];
 assert.deepEqual(build(game,club),[]);
});

test('secretary advice reflects only real fatigue, morale and upcoming match state',()=>{
 const {game,club}=base();game.week=4;game.round=0;
 club.fatigue=62;club.morale=23;
 const a=globalThis.PentaSecretaryTasks.suggest(game,club);
 assert.deepEqual(a.map(t=>t.id),['fatigue','morale','pre-match']);
 assert.ok(a.every(t=>t.urgent===false));
 assert.deepEqual(globalThis.PentaSecretaryTasks.agenda(game),
  {round:1,week:5,weeksUntil:1,label:'1라운드 · 5주차',detail:'1주 후 예정',action:'fixtures'});
});
test('finance arrears are surfaced as a required actionable task only when positive',()=>{
 const {game,club}=base();club.id='team-a';
 game.finance={books:{'team-a':{arrears:350000}}};
 assert.deepEqual(build(game,club).map(t=>t.id),['finance']);
 assert.match(build(game,club)[0].detail,/350,000원/);
});
test('agenda respects the winter break and does not invent an opponent',()=>{
 const {game}=base();game.round=9;game.week=14;
 const next=globalThis.PentaSecretaryTasks.agenda(game);
 assert.equal(next.week,16);
 assert.equal(next.weeksUntil,2);
 assert.ok(!JSON.stringify(next).includes('상대'));
 game.round=18;assert.equal(globalThis.PentaSecretaryTasks.agenda(game),null);
});
test('pending match is a current fixture rather than a second recommendation',()=>{
 const {game,club}=base();game.pendingMatch={phase:'prepare'};
 assert.equal(globalThis.PentaSecretaryTasks.agenda(game).action,'match');
 assert.equal(globalThis.PentaSecretaryTasks.suggest(game,club).length,0);
});
