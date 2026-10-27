import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {runInNewContext} from 'node:vm';
const source=readFileSync(new URL('../assets/management-ui.js',import.meta.url),'utf8');
function setup(){
 const g={season:1,week:1,round:0,coins:10000,weeklyPrograms:[],clubs:[{id:0,fatigue:0,trainers:Array.from({length:5},(_,i)=>({uid:i,tactics:10,pokemon:Array(6).fill({})}))}]};
 const calls=[];let doneResearch=true;
 const ctx={window:null,game:g,console,tab:'home',setTimeout,
 escapeHTML:String,myClub:()=>g.clubs[0],persist(){},renderOffice(){},setTab(){},
 weeklyDraft:'tactics',weeklyTarget:'active:0',TLM_WEEKLY_PROGRAMS:[{id:'tactics',title:'전술 분석',cost:0,target:true}],
 initWeekly(){},weeklyRecord:()=>g.weeklyPrograms.find(x=>x.week===g.week),
 applyWeeklyProgram(){if(ctx.weeklyRecord())return false;g.weeklyPrograms.push({week:g.week,title:'전술',detail:'경험 +1'});return true;},
 nextWeek(){if(g.week===4){g.pendingMatch={};return;}calls.push(g.week);g.week++;},
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
 await ctx.ManagementUI.important();assert.equal(g.weeklyPrograms.length,4);
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
