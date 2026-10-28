import test from 'node:test';
import assert from 'node:assert/strict';
import '../assets/penta-secretary-tasks.js';
import '../assets/penta-secretary-inbox.js';
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

test('recommended work can be deferred for two game weeks without hiding required work',()=>{
 const api=globalThis.PentaSecretaryInbox;
 const {game,club}=base();game.week=4;game.round=0;club.fatigue=60;
 const advice=globalThis.PentaSecretaryTasks.suggest(game,club);
 const fatigue=advice.find(t=>t.id==='fatigue');
 assert.ok(fatigue&&!fatigue.urgent);
 assert.equal(api.defer(game,fatigue,2),true);
 assert.ok(!api.visibleAdvice(game,advice).some(t=>t.id==='fatigue'));
 assert.equal(api.defer(game,{id:'match',urgent:true},2),false);
 game.week=6;
 assert.ok(api.visibleAdvice(game,advice).some(t=>t.id==='fatigue'));
});
test('news unread state survives save roundtrip, including reindexed news IDs',()=>{
 const api=globalThis.PentaSecretaryInbox;
 const {game}=base();
 const a={id:'club:1',kind:'coach',title:'김감독 취임',meta:'1시즌',description:'금빛시티'};
 const b={...a,id:'club:0'};
 assert.equal(api.unreadCount(game,[a]),1);
 api.markSeen(game,[a]);
 const loaded=JSON.parse(JSON.stringify(game));
 assert.equal(api.unreadCount(loaded,[b]),0);
 assert.equal(api.recent(loaded,[b])[0].unread,false);
 assert.equal(api.unreadCount(loaded,[{...a,title:'다른 소식'}]),1);
});
test('snoozing a suggestion does not change actual team state or progress',()=>{
 const api=globalThis.PentaSecretaryInbox;
 const {game,club}=base();game.week=3;club.morale=23;
 const before=JSON.stringify(club);
 const task=globalThis.PentaSecretaryTasks.suggest(game,club).find(t=>t.id==='morale');
 api.defer(game,task,1);
 assert.equal(JSON.stringify(club),before);
 assert.equal(game.week,3);
 assert.ok(api.visibleAdvice(game,[task]).length===0);
});

test('briefing reflects real gameplay and target chooser uses ManagementUI identity',()=>{
 const {game,club}=base();club.fatigue=52;club.morale=70;
 game.weeklyPrograms=[{season:1,week:2,title:'전술 분석'}];
 const before=JSON.stringify({game,club});
 const report=globalThis.PentaSecretaryTasks.briefing(game,club);
 assert.equal(report.ready,5);assert.equal(report.fatigue,52);
 assert.equal(report.morale,70);assert.equal(report.activity,'전술 분석');
 const targets=globalThis.PentaSecretaryTasks.trainingTargets(club);
 assert.equal(targets.length,5);assert.equal(targets[0].id,'legacy:undefined:T0');
 assert.equal(JSON.stringify({game,club}),before);
});
test('pins survive save, reorder pending work, and never finish tasks',()=>{
 const api=globalThis.PentaSecretaryInbox;
 const {game,club}=base();game.week=4;
 game.aiOffers=[{status:'pending',season:1,expires:4}];
 const tasks=build(game,club),market=tasks.find(x=>x.id==='market');
 assert.equal(api.togglePinned(game,market),true);
 assert.equal(api.order(game,tasks)[0].id,'market');
 assert.equal(api.pinned(JSON.parse(JSON.stringify(game)),'market'),true);
 assert.equal(build(game,club).length,tasks.length);
 assert.equal(api.togglePinned(game,market),false);
});
