import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {runInNewContext} from 'node:vm';
const source=readFileSync(new URL('../assets/management-ui.js',import.meta.url),'utf8');
function setup({withFinance=false}={}){
 const g={season:1,week:1,round:0,coins:10000,weeklyPrograms:[],log:['새 게임 시작'],clubs:[{id:0,fatigue:0,trainers:Array.from({length:5},(_,i)=>({uid:i,tactics:10,name:'트레이너 '+i,pokemon:Array(6).fill({})}))}]};
 if(withFinance)g.finance={books:{0:{ledger:[{id:'initial',label:'시작 전 계약',week:1,expense:20,paid:20}]}}};
 const calls=[];let doneResearch=true;
 const ctx={window:null,game:g,console,tab:'home',setTimeout,
 escapeHTML:String,myClub:()=>g.clubs[0],persist(){},renderOffice(){},setTab(){},
 weeklyDraft:'tactics',weeklyTarget:'active:0',TLM_WEEKLY_PROGRAMS:[
  {id:'tactics',title:'전술 분석',cost:0,target:true},{id:'power',title:'체력 훈련',cost:0,target:true},
  {id:'scrimmage',title:'연습 경기',cost:0,target:true},{id:'recovery',title:'회복',cost:0,target:false}],
 initWeekly(){},weeklyRecord:()=>g.weeklyPrograms.find(x=>x.week===g.week),
 applyWeeklyProgram(){if(ctx.weeklyRecord())return false;g.weeklyPrograms.push({week:g.week,title:'전술',detail:'경험 +1'});return true;},
 nextWeek(){if(g.week===4){g.pendingMatch={};return;}calls.push(g.week);g.week++;g.log.unshift(g.week+'주차 급여·탐색 정산');
  if(withFinance){g.finance.books[0].ledger.unshift({id:'salary:'+g.week,label:'주간 급여',week:g.week,expense:100,paid:100});g.coins-=100;}},
 TrainerMoveAI:{queue:async()=>{if(doneResearch)g.trainerAI={movesProcessedWeek:'1:'+g.week};return doneResearch;}},
 document:{getElementById(){return null;},querySelector(){return null;},createElement(){return {};},head:{append(){}}},
 MatchdayPreparation:{render(){}},wonReadable:String};ctx.window=ctx;
 runInNewContext(source,ctx);return {g,ctx,calls,failResearch:()=>{doneResearch=false;}};
}
test('recommended progress settles each week once, stops at market deadline then match preparation',async()=>{
 const {g,ctx,calls}=setup();await ctx.ManagementUI.important();
 assert.equal(g.week,4);assert.equal(calls.length,3);assert.equal(g.weeklyPrograms.length,3);
 assert.match(g.management.notice,/이적시장 마지막 주/);
 await ctx.ManagementUI.important();assert.ok(g.pendingMatch);assert.equal(g.week,4);
 assert.equal(g.weeklyPrograms.length,4);
 assert.equal(g.management.history.length,2);
 await ctx.ManagementUI.important();assert.equal(g.weeklyPrograms.length,4);
 assert.equal(g.management.history.length,2,'준비 화면에 재진입해도 빈 기록이 쌓이지 않는다');
});
test('first-session guidance shows manual and fast paths; the last market week requires explicit confirmation',async()=>{
 const {g,ctx}=setup();
 assert.match(ctx.ManagementUI.policyHTML(),/첫 경기까지 빠르게 시작하기/);
 assert.match(ctx.ManagementUI.policyHTML(),/추천 계획으로 개막전 준비/);
 assert.match(ctx.ManagementUI.policyHTML(),/다음 주 · 직접 준비/);
 await ctx.ManagementUI.important();
 const lastMarketHTML=ctx.ManagementUI.policyHTML();
 assert.match(lastMarketHTML,/이적시장 마지막 결정 기회/);
 assert.match(lastMarketHTML,/이적시장 마감 확인 · 개막전 준비/);
 assert.match(lastMarketHTML,/이적시장 확인/);
 assert.equal(g.pendingMatch,undefined,'마지막 이적 주차를 건너뛰면 안 된다');
 await ctx.ManagementUI.important();
 assert.match(ctx.ManagementUI.policyHTML(),/경기 준비로 돌아가기/);
 assert.equal(g.week,4,'경기 준비를 확정하기 전에 실제 일정을 넘기지 않는다');
});
test('progress report includes actual weekly activity and balance without resummarizing a blocked attempt',async()=>{
 const {g,ctx}=setup();await ctx.ManagementUI.important();
 const summary=g.management.summary;
 assert.equal(summary.weeks,3);
 assert.equal(summary.events.length,3);
 assert.match(summary.events[0],/급여·탐색 정산/);
 assert.match(ctx.ManagementUI.policyHTML(),/진행 중 발생한 활동/);
 const historyCount=g.management.history.length;
 g.aiOffers=[{season:1,status:'pending',expires:4}];
 await ctx.ManagementUI.important();
 assert.equal(g.management.history.length,historyCount);
 assert.equal(g.management.summary,summary);
});
test('financial report reads only new, posted ledger entries, not old opening transactions',async()=>{
 const {g,ctx}=setup({withFinance:true});await ctx.ManagementUI.important();
 assert.equal(g.management.summary.balance,-300);
 assert.equal(g.management.summary.finance.expenses,300);
 assert.equal(g.management.summary.finance.paid,300);
 assert.equal(g.management.summary.finance.transactions.length,3);
 assert.match(ctx.ManagementUI.policyHTML(),/구단 재정 정산/);
 assert.equal(g.finance.books[0].ledger.length,4,'기존 정산을 다시 실행하지 않는다');
});
test('research failure and unanswered offer stop before weekly changes',async()=>{
 const x=setup();x.failResearch();await x.ctx.ManagementUI.important();
 assert.equal(x.g.week,1);assert.equal(x.g.weeklyPrograms.length,0);
 const y=setup();y.g.aiOffers=[{season:1,status:'pending',expires:3}];
 await y.ctx.ManagementUI.important();assert.equal(y.g.week,1);assert.equal(y.calls.length,0);
});

test('autonomous six-stat training follows focus, respects each PA and cannot repeat a session',()=>{
 const script=readFileSync(new URL('../assets/matchday.js',import.meta.url),'utf8');
 const start=script.indexOf('(function autonomousTrainerDevelopment(){');
 const end=script.indexOf('/* AI move research and relationship */',start);
 const window={};runInNewContext(script.slice(start,end),{window,document:undefined});
 const stats=['hp','atk','def','spa','spd','spe'];
 const mon={name:'검증',statCA:Object.fromEntries(stats.map(k=>[k,100])),statPA:Object.fromEntries(stats.map(k=>[k,k==='spe'?101:100]))};
 let result,key;
 for(let i=0;i<100&&!result;i++){key='1:2:test:'+i;result=window.TrainerAutonomy.trainMon(mon,'speed',{training:20,potential:20,tactics:20,switching:20},key);}
 assert.ok(result);assert.equal(mon.statCA.spe,101);assert.equal(mon.statCA.hp,100);
 assert.equal(window.TrainerAutonomy.trainMon(mon,'speed',{training:20},key),null);
 assert.equal(mon.ca,undefined);assert.equal(mon.gp,undefined);
});
