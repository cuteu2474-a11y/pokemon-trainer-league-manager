import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {runInNewContext} from 'node:vm';
import * as f from '../src/finance/club-finance.js';
const trainer=(uid,salary=3000001)=>({uid,name:'선수 '+uid,id:uid,tactics:10,switching:10,profile:{salary,contract:3,salaryVersion:1},pokemon:Array.from({length:6},()=>({name:'피카츄',statCA:{hp:60},statPA:{hp:100}}))});
function game(week=1){return {season:1,week,coins:50000000,club:'우리',clubs:[{id:0,name:'우리',trainers:[trainer(1)],reserveTrainers:[],trainerAcademy:[]},{id:1,name:'상대',identity:{budget:50000000},trainers:[trainer(2)],reserveTrainers:[trainer(3)],trainerAcademy:[]}],freeAgents:[],log:[]};}
test('30 weekly payments equal season salary, and reload/retry never pays twice',()=>{
 let g=game();f.synchronize(g);const start=g.coins,salary=g.clubs[0].trainers[0].profile.salary;
 for(let week=1;week<=30;week++){g.week=week;f.settleWeek(g);g=JSON.parse(JSON.stringify(g));f.settleWeek(g);}
 assert.equal(start-g.coins,salary);assert.equal(f.seasonBook(g,0).expenses,salary);
 assert.equal(f.book(g,0).ledger.filter(e=>e.label==='주간 급여').length,30);
 assert.ok(f.book(g,0).ledger[0].details[0].id.includes(g.clubs[0].trainers[0].financeContractId));
});
test('old saves begin payroll now, existing contracts never reprice and academy promotion keeps stipend',()=>{
 const g=game(14);g.clubs[0].trainerAcademy.push(trainer(9,4000000));f.synchronize(g);
 const youth=g.clubs[0].trainerAcademy.pop();g.clubs[0].reserveTrainers.push(youth);f.synchronize(g);
 assert.equal(f.contract(g,youth).annualSalary,1000000);
 f.settleWeek(g);assert.equal(f.book(g,0).ledger.length,1);
 assert.equal(f.book(g,0).lastPaid,13);assert.equal(f.contract(g,youth).start,13);
});
test('transfer preserves the original team and assigns the transfer week to the buyer',()=>{
 const g=game();f.synchronize(g);f.settleWeek(g);g.week=2;
 const t=g.clubs[1].reserveTrainers[0],mons=t.pokemon,old=f.contract(g,t),sellerPaid=f.seasonBook(g,1).expenses;
 f.moveTrainer(g,{buyerId:0,sellerId:1,trainer:t,sourceKind:'reserve',slot:0,fee:1000000,salary:6000000,years:2,bonus:600000});
 assert.equal(g.clubs[0].reserveTrainers[0],t);assert.equal(t.pokemon,mons);assert.equal(old.status,'closed');
 f.settleWeek(g);assert.equal(f.seasonBook(g,1).expenses-sellerPaid,f.weeklySalary(3000001,2));
 assert.equal(f.contract(g,t).annualSalary,6000000);
 assert.equal(f.book(g,0).ledger[0].details.filter(d=>d.trainer===t.name).length,1);
});
test('mandatory shortfall becomes arrears and half of subsequent income repays it once',()=>{
 const g=game();f.synchronize(g);g.coins=1;f.settleWeek(g);
 const debt=f.book(g,0).arrears;assert.ok(debt>0);assert.equal(g.coins,0);assert.equal(f.canSpend(g,0,1).ok,false);
 f.income(g,0,1000,'reward','경기 수입');f.income(g,0,1000,'reward','경기 수입');
 assert.equal(g.coins,500);assert.equal(f.book(g,0).arrears,debt-500);assert.equal(f.seasonBook(g,0).income,1000);
 f.income(g,0,debt*3,'sale','선수 매각');assert.equal(f.book(g,0).arrears,0);assert.equal(f.financialReport(g,0).score,50);
});
test('renewal uses the expected contract, expires into free agency and preserves Pokémon',()=>{
 const g=game(),t=g.clubs[0].trainers[0];f.synchronize(g);const old=f.contract(g,t);
 f.renew(g,t,0,{salary:3300000,years:1,bonus:330000,expectedId:old.id});
 assert.equal(f.contract(g,t).endSeason,4);assert.equal(old.status,'closed');
 const before=g.coins;assert.throws(()=>f.renew(g,t,0,{salary:1,years:1,expectedId:old.id}),/계약이 변경/);assert.equal(g.coins,before);
 const current=f.contract(g,t);current.endSeason=1;current.end=30;g.season=2;g.week=1;f.synchronize(g);
 assert.equal(g.clubs[0].trainers[0],null);assert.equal(g.freeAgents[0].trainer,t);
 assert.equal(t.pokemon.length,6);assert.equal(current.status,'closed');
});
test('failed signing leaves money and rosters untouched, and a locked match blocks moves',()=>{
 const g=game();f.synchronize(g);const t=g.clubs[1].reserveTrainers[0],before=JSON.stringify(g);
 assert.throws(()=>f.moveTrainer(g,{buyerId:0,sellerId:1,trainer:t,sourceKind:'reserve',slot:0,fee:999999999,salary:1,years:2}),/부족/);
 assert.equal(JSON.stringify(g),before);
 g.pendingMatch={phase:'watch',home:0,away:1};
 assert.throws(()=>f.moveTrainer(g,{buyerId:0,sellerId:1,trainer:t,sourceKind:'reserve',slot:0,salary:1,years:2}),/경기 결과/);
});
test('browser hooks journal legacy income, preserve free operations in debt and undo failed transactions',()=>{
 const g=game(),messages=[],doc={getElementById(){return null;},querySelector(){return null;},createElement(){return {};},head:{append(){}}};
 const ctx={accounting:f,game:g,document:doc,console,escapeHTML:String,myClub:()=>ctx.game.clubs[0],wonReadable:String,
 persist(){},renderOffice(){},migrateEconomy(){},aiInit(){},clubIdentity:c=>c.identity ||= {budget:50000000},transferProfile:t=>t.profile,
 transferOpen:()=>true,marketRelease(){},marketRenew(){},marketFreeAgent(){},academyPromote(){},seasonSettlement(){},
 aiExecuteBid(){return false;},aiSignFreeAgent(){return false;},aiRespondToOffer(){ctx.game.coins+=1000;},
 alert:m=>messages.push(m),confirm:()=>true,TrainerMarketV2:{quote:base=>({offered:base})},setTab(){},tab:'home'};
 ctx.window=ctx;
 const source=readFileSync(new URL('../assets/finance-ui.js',import.meta.url),'utf8').replace(/^import .*;\n/,'');
 runInNewContext(source,ctx);
 f.expense(g,0,g.coins+100,'mandatory','자동 지급',true);
 ctx.aiRespondToOffer();assert.equal(ctx.game.coins,900);assert.equal(f.book(ctx.game,0).arrears,0);
 const before=JSON.stringify(ctx.game);
 assert.throws(()=>ctx.ClubFinance.transaction('실패',()=>{ctx.game.coins=0;ctx.game.clubs[0].trainers=[];throw Error('중단');}),/중단/);
 assert.equal(JSON.stringify(ctx.game),before);
});
