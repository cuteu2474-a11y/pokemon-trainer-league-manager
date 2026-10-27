import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {runInNewContext} from 'node:vm';
import {TrainerAI} from '../src/battle/trainer-ai.js';
import * as model from '../src/core/squad-condition.js';
import {prepareClub} from '../src/web/match-service.js';
import {ensureRosterIds,freezeMatch,lineupState} from '../src/core/match-registration.js';
const clone=x=>JSON.parse(JSON.stringify(x));
function fixture(){
 const g={season:1,week:4,round:0,seed:7,coins:1e8,log:[],clubs:[0,1].map(id=>({id,name:'구단'+id,trainers:Array.from({length:5},(_,i)=>({uid:id*10+i+1,name:'선수'+id+i,tactics:15,switching:13,battleAnalysis:16,pokemon:Array.from({length:6},(_,j)=>({name:'피카츄',species:'Pikachu',power:80,uid:'p:'+id+':'+i+':'+j,ownerTrainerId:String(id*10+i+1)}))})),reserveTrainers:[]}))};
 return g;
}
test('old saves gain zero personal fatigue without changing club fatigue, HP or CA',()=>{
 const g=fixture(),t=g.clubs[0].trainers[0],p=t.pokemon[0];g.clubs[0].fatigue=42;p.hp=7;p.power=80;
 model.initializeCondition(g);assert.equal(t.fatigue,0);assert.equal(p.fatigue,0);assert.equal(p.hp,7);assert.equal(p.power,80);assert.equal(g.clubs[0].fatigue,42);
});
test('weekly recovery and season rollover apply once, while a dispatched week grants no recovery',()=>{
 const g=fixture(),t=g.clubs[0].trainers[0],away=g.clubs[0].trainers[1];model.initializeCondition(g);
 for(const x of [t,away,...t.pokemon,...away.pokemon])x.fatigue=60;
 away.pokemonScouting={mission:{season:1,week:4,status:'captured'}}; // Result may already be resolved; departure week is still unavailable.
 g.week=5;assert.equal(model.recoverWeek(g),true);assert.equal(t.fatigue,55);assert.equal(away.fatigue,60);assert.equal(away.pokemon[0].fatigue,60);
 const saved=clone(g);assert.equal(model.recoverWeek(saved),false);assert.equal(saved.clubs[0].trainers[0].fatigue,55);
 g.squadCondition.lastRecovery=30;g.season=2;g.week=1;model.recoverWeek(g);assert.equal(t.fatigue,50);
});
test('dispatch is unavailable in its departure week and eligible the following week including year rollover',()=>{
 const t={pokemonScouting:{mission:{season:1,week:30,status:'travel'}}};
 assert.equal(model.awayAt(t,{season:1,week:30}),true);assert.equal(model.awayAt(t,'2:1'),false);assert.equal(model.awayAt(t),true);
});
test('pre-match fatigue projection matches actual next-week recovery and preserves the live save',()=>{
 const g=fixture(),t=g.clubs[0].trainers[0];model.initializeCondition(g);t.fatigue=70;t.pokemon[0].fatigue=60;
 const original=clone(g),request=clone(g.clubs[0]);model.projectClubCondition(request,{season:1,week:4},{season:1,week:5});
 assert.equal(request.trainers[0].fatigue,65);assert.equal(request.trainers[0].pokemon[0].fatigue,55);assert.deepEqual(g,original);
 g.week=5;model.recoverWeek(g);assert.equal(t.fatigue,request.trainers[0].fatigue);
});
test('rest and physical programs affect only eligible people and cannot repeat within the week',()=>{
 const g=fixture(),c=g.clubs[0],t=c.trainers[0],away=c.trainers[1];model.initializeCondition(g);for(const person of [t,...t.pokemon,away,...away.pokemon])person.fatigue=50;
 away.pokemonScouting={mission:{season:1,week:4,status:'travel'}};
 assert.equal(model.programLoad(g,c,null,'recovery'),true);assert.equal(t.fatigue,25);assert.equal(away.fatigue,50);assert.equal(model.programLoad(g,c,null,'recovery'),false);
 g.week=5;model.programLoad(g,c,t,'power');assert.equal(t.fatigue,29);assert.equal(t.pokemon[0].fatigue,33);
 assert.equal(model.trainingLoad(t,[t.pokemon[0]],'1:5'),true);assert.equal(model.trainingLoad(t,[t.pokemon[0]],'1:5'),false);assert.equal(t.pokemon[0].fatigue,35);assert.equal(t.pokemon[1].fatigue,33);
});
test('real result fatigue counts used trainers and switched-in Pokémon, not registered substitutes',()=>{
 const g=fixture();model.initializeCondition(g);const home=g.clubs[0].trainers,away=g.clubs[1].trainers;
 const team=list=>list.map(t=>({uid:t.uid,team:t.pokemon.map((p,i)=>({pokemonId:p.uid,name:'mon'+i}))}));
 const log='|switch|p1a: mon0|Pikachu|100/100\n|switch|p2a: mon0|Pikachu|100/100\n|turn|1\n|switch|p1a: mon1|Pikachu|100/100\n|turn|2';
 const result={teams:{home:team(home),away:team(away)},rounds:[{trainerA:0,trainerB:0,log},{trainerA:0,trainerB:1,log}]};
 const m={home:0,away:1};assert.equal(model.matchLoad(g,m,{id:'1:1:0:1',result}),true);assert.equal(home[0].fatigue,10);assert.equal(home[1].fatigue,0);assert.equal(home[0].pokemon[0].fatigue,7);assert.equal(home[0].pokemon[1].fatigue,7);assert.equal(home[0].pokemon[2].fatigue,0);
 assert.equal(away[0].fatigue,8);assert.equal(away[1].fatigue,8);assert.equal(away[2].fatigue,0);
 const saved=clone(g);assert.equal(model.matchLoad(saved,m,{id:'1:1:0:1',result}),false);assert.equal(saved.clubs[0].trainers[0].fatigue,10);
});
test('fast-fixture load is explicitly estimated and bad real identities never partially change fatigue',()=>{
 const g=fixture();model.initializeCondition(g);model.matchLoad(g,{home:0,away:1},{id:'fast:1'});assert.equal(g.clubs[0].trainers[4].fatigue,8);assert.equal(g.clubs[0].trainers[4].pokemon[5].fatigue,6);
 const bad={teams:{home:[{uid:999,team:[]}],away:[]},rounds:[{trainerA:0,trainerB:0,log:''}]},before=clone(g);
 assert.throws(()=>model.matchLoad(g,{home:0,away:1},{id:'bad',result:bad}),/정산 대상/);assert.deepEqual(g,before);
});
test('API preparation reduces only judgment skills, retains CA and rejects a currently absent trainer',()=>{
 const g=fixture(),c=g.clubs[0],t=c.trainers[0];t.fatigue=100;
 const healthy=prepareClub({...c,trainers:c.trainers.map(x=>({...x,fatigue:0}))},[0,1,2,3,4]);
 const tired=prepareClub(c,[0,1,2,3,4]);assert.equal(tired[0].tactics,12);assert.equal(tired[0].battleAnalysis,13);assert.deepEqual(tired[0].team[0].statCA,healthy[0].team[0].statCA);assert.equal(t.tactics,15);
 const rawAI=new TrainerAI({},t,{seed:[1,2,3,4]});const preparedAI=new TrainerAI({},tired[0],{seed:[1,2,3,4]});assert.equal(rawAI.skill.tactics,12);assert.equal(preparedAI.skill.tactics,12);assert.equal(rawAI.profile.analysis,13);
 t.pokemonScouting={mission:{season:1,week:5,status:'travel'}};
 assert.throws(()=>prepareClub(c,[0,1,2,3,4],{season:1,week:5}),/파견/);assert.equal(prepareClub(c,[0,1,2,3,4],{season:1,week:6}).length,5);
});
test('frozen registration checks dispatch against the actual fixture week',async()=>{
 const g=fixture();ensureRosterIds(g);const p={season:1,week:5,round:1,home:0,away:1,order:[0,1,2,3,4],plans:[],behaviors:[]};
 const body={home:g.clubs[0],away:g.clubs[1],homeOrder:p.order,awayOrder:p.order,seed:[1,2,3,4]};
 g.clubs[0].trainers[0].pokemonScouting={mission:{season:1,week:5,status:'travel'}};
 await assert.rejects(freezeMatch(body,p,lineupState(g,p)),/파견/);
 g.clubs[0].trainers[0].pokemonScouting.mission.week=4;assert.ok((await freezeMatch(body,p,lineupState(g,p))).registration.id);
});
test('browser dispatch allows a reserve on match day, rejects a starter and preserves the save guard',()=>{
 const g=fixture();g.week=5;let saves=0;
 const ctx={model,game:g,freshGame:()=>fixture(),persist(){saves++;},renderOffice(){},myClub:()=>g.clubs[0],calendarRoundForWeek:w=>w===5?1:null};ctx.window=ctx;
 const source=readFileSync(new URL('../assets/condition-ui.js',import.meta.url),'utf8').replace(/^import .*;\n/,'');runInNewContext(source,ctx);
 assert.equal(ctx.SquadCondition.canDispatch(g.clubs[0].trainers[0],'active').ok,false);assert.equal(ctx.SquadCondition.canDispatch(g.clubs[0].trainers[0],'reserve').ok,true);g.round=1;assert.equal(ctx.SquadCondition.canDispatch(g.clubs[0].trainers[0],'active').ok,true);assert.ok(saves>0);
});

function autonomyContext(g){
 const text=readFileSync(new URL('../assets/matchday.js',import.meta.url),'utf8'),start=text.indexOf('(function autonomousTrainerDevelopment(){'),end=text.indexOf('/* Trainer career and relationship',start);
 const ctx={game:g,document:undefined,myClub:()=>g.clubs[0],persist(){},console};ctx.window={SquadCondition:{...model,away:(t,at={season:g.season,week:g.week})=>model.awayAt(t,at),resting:t=>model.fatigue(t)>=80}};
 runInNewContext(text.slice(start,end),ctx);return ctx;
}
test('actual autonomous-training hook skips the dispatched week and exhausted people',()=>{
 const g=fixture();model.initializeCondition(g);const [away,tired,ready]=g.clubs[0].trainers;
 for(const t of g.clubs[0].trainers)for(const mon of t.pokemon){mon.statCA={hp:80,atk:80,def:80,spa:80,spd:80,spe:80};mon.statPA={hp:120,atk:120,def:120,spa:120,spd:120,spe:120};}
 away.pokemonScouting={mission:{season:1,week:4,status:'captured'}};tired.fatigue=80;
 const ctx=autonomyContext(g);ctx.window.TrainerAutonomy.init(g);g.week=5;ctx.window.TrainerAutonomy.advance(g,0);
 assert.equal(away.conditionTrainingPeriod,undefined);assert.equal(tired.conditionTrainingPeriod,undefined);assert.equal(ready.conditionTrainingPeriod,'1:5');assert.equal(ready.fatigue,2);
});
test('actual move-research hook excludes absent trainers and discards responses after dispatch',async()=>{
 const g=fixture(),away=g.clubs[0].trainers[0],late=g.clubs[0].trainers[1];away.pokemonScouting={mission:{season:1,week:4,status:'travel'}};
 const ctx=autonomyContext(g);let sent,finish;ctx.fetch=async(_url,request)=>{sent=JSON.parse(request.body);return new Promise(resolve=>{finish=()=>resolve({ok:true,json:async()=>({period:'1:4',results:sent.trainers.map(t=>({key:t.key,updates:[{slot:0,moves:['splash'],kind:'initial'}],changes:[]}))})});});};
 const job=ctx.window.TrainerMoveAI.queue();assert.ok(!sent.trainers.some(t=>t.key==='0:trainer:'+away.uid));
 late.pokemonScouting={mission:{season:1,week:4,status:'travel'}};finish();await job;
 assert.equal(late.pokemon[0].moves,undefined);assert.deepEqual(clone(g.clubs[0].trainers[2].pokemon[0].moves),['splash']);
});

test('squad screens show personal fatigue separately from restored match HP and PP',()=>{
 const g=fixture();g.clubs[0].trainers[0].fatigue=60;let html='';const panel={append:box=>{html=box.innerHTML;}};
 const ctx={model,game:g,tab:'team',freshGame:()=>fixture(),persist(){},renderOffice(){},myClub:()=>g.clubs[0],document:{getElementById:id=>id==='dashpanel'?panel:null,createElement:()=>({})}};ctx.window=ctx;
 const source=readFileSync(new URL('../assets/condition-ui.js',import.meta.url),'utf8').replace(/^import .*;\n/,'');runInNewContext(source,ctx);
 assert.match(html,/컨디션 40\/100/);assert.match(html,/HP·PP 복구로 개인 피로가 없어지지는 않습니다/);
});
