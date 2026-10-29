import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {runInNewContext} from 'node:vm';

const matchday=readFileSync(new URL('../assets/matchday.js',import.meta.url),'utf8');
const start=matchday.indexOf('(function autonomousTrainerDevelopment(){');
const end=matchday.indexOf('/* Trainer career and relationship',start);
const careerStart=end;
assert.ok(start>=0&&end>start);

function setup(week=4){
 const first={id:'mentor-a',uid:'a',name:'지도자 가',tactics:10,switching:10,
   pokemon:[{name:'피카츄',species:'Pikachu',moves:['tackle'],statCA:{atk:100}}]};
 const other={id:'mentor-b',uid:'b',name:'지도자 나',tactics:10,
   pokemon:[{name:'이브이',species:'Eevee',moves:['tackle']}]};
 const game={season:1,week,round:0,clubs:[
   {id:0,trainers:[first,other],reserveTrainers:[]},
   {id:1,trainers:[],reserveTrainers:[]} ]};
 let saves=0;
 const ctx={game,document:undefined,console,
   myClub:()=>game.clubs[0],renderOffice(){},persist(){saves++;}};
 ctx.window=ctx;
 runInNewContext(matchday.slice(start,end)+matchday.slice(careerStart),ctx);
 return {ctx,game,first,other,saves:()=>saves,
   career:ctx.TrainerCareer,moves:ctx.TrainerMoveAI};
}
const row=(trainer,slot=0,mine=true)=>({
 input:{key:'0:mentor:'+trainer.id},
 context:{trainer,club:'0',index:0,id:'mentor:'+trainer.id,mine,
   offer:null,trust:50,choice:{result:'자율',focus:'balanced',reason:'자체 연구'},
   snapshots:trainer.pokemon.map(mon=>({
     obj:mon,name:mon.name||mon.species,moves:JSON.stringify(mon.moves??null)}))}
});
const response=(period,rows,kind='upgrade')=>({
 period,results:rows.map(({input})=>({key:input.key,
   updates:[{slot:0,moves:['tackle','waterpulse'],kind}],
   changes:[{slot:0,learned:'waterpulse',forgotten:'tackle',
     name:'피카츄',reason:'주간 기술 연구'}]}))
});

test('real weekly move research adds technical teaching XP and improves the next research input',()=>{
 const {first,career,moves}=setup();
 assert.equal(moves.tech(first),10);
 const changes=[{slot:0,learned:'waterpulse'},{slot:1,learned:'thunderbolt'}];
 const originalCA=structuredClone(first.pokemon[0].statCA);
 let prior=career.applyResearch(first,'1:4',changes);
 assert.equal(prior.earned,14);
 assert.equal(prior.from,10);assert.equal(prior.to,10);
 assert.equal(first.aiCareer.research.weeks,1);
 assert.equal(first.aiCareer.research.learned,2);
 assert.equal(career.applyResearch(first,'1:4',changes),null,'same week must be idempotent');
 for(let week=5;week<=9;week++)career.applyResearch(first,'1:'+week,changes);
 assert.ok(first.moveTraining>10);
 assert.equal(moves.tech(first),career.skill(first,'moveTraining'));
 assert.equal(first.aiCareer.research.weeks,6);
 assert.equal(first.aiCareer.research.history.length,6);
 assert.deepEqual(first.pokemon[0].statCA,originalCA,
   'teaching experience must not change Pokémon CA or Showdown stats');
 assert.deepEqual(Array.from(first.autonomyAI?.playTraits||[]),[],
   'research does not grant battle play traits for unobserved combat behavior');
});

test('move research integration rewards only actual accepted upgrades, not initial slots or replay',()=>{
 const env=setup(),{ctx,game,first,moves,career}=env;
 const rows=[row(first)];const packet=response('1:4',rows);
 assert.equal(moves.integrate(packet,rows,'1:4'),true);
 assert.equal(first.pokemon[0].moves[1],'waterpulse');
 assert.equal(first.aiCareer.research.learned,1);
 assert.equal(first.aiCareer.experience.moveTraining,7);
 assert.equal(moves.state().moveReports[0].trainers[0].development.earned,7);
 assert.equal(env.saves(),1);
 const snapshot=JSON.stringify(game);
 assert.equal(moves.integrate(packet,rows,'1:4'),false);
 assert.equal(JSON.stringify(game),snapshot,'repeated response cannot grant experience');
 assert.equal(env.saves(),1);
 assert.equal(career.applyResearch(first,'1:4',[{slot:0,learned:'waterpulse'}]),null);
});

test('initial Pokémon move setup is never mistaken for weekly teaching success',()=>{
 const env=setup(),{first,moves}=env;const rows=[row(first)];
 const packet=response('1:4',rows,'initial');
 assert.equal(moves.integrate(packet,rows,'1:4'),true);
 assert.deepEqual(Array.from(first.pokemon[0].moves),['tackle','waterpulse']);
 assert.equal(first.aiCareer,undefined);
 assert.equal(moves.state().moveReports[0].trainers[0].development,null);
});

test('old career saves are migrated without loss, and invalid research evidence earns nothing',()=>{
 const {career,first}=setup();
 first.aiCareer={version:1,matches:3,duels:7,wins:5,losses:2,
   experience:{moveJudgment:45},observed:{},quality:{},events:[]};
 assert.equal(career.applyResearch(first,'bad',[{slot:0,learned:'surf'}]),null);
 assert.equal(first.aiCareer.experience.moveTraining,undefined);
 assert.equal(career.applyResearch(first,'1:8',[]),null);
 const progress=career.applyResearch(first,'1:8',[{slot:0,learned:'surf'}]);
 assert.equal(progress.earned,7);
 assert.equal(first.aiCareer.matches,3);
 assert.equal(first.aiCareer.experience.moveJudgment,45);
 assert.equal(first.aiCareer.experience.moveTraining,7);
 assert.equal(first.aiCareer.research.learned,1);
 assert.equal(career.applyResearch(first,'1:8',[{slot:0,learned:'surf'}]),null);
 assert.equal(career.applyResearch(first,'1:9',[{slot:0,learned:''}]),null);
});

test('mentor technical research and match behavior use separate experience sources',()=>{
 const {career,first}=setup();
 career.applyResearch(first,'1:4',[{slot:0,learned:'surf'}]);
 const ai={playTraits:['킬각 포착'],habitScores:{kill:70}};
 first.autonomyAI=ai;
 const before=JSON.stringify(first.autonomyAI);
 career.advanceSkill(first,career.getCareer(first),'moveJudgment',10);
 assert.equal(first.aiCareer.experience.moveJudgment,10);
 assert.equal(first.aiCareer.experience.moveTraining,7);
 assert.equal(JSON.stringify(first.autonomyAI),before);
});

test('FM-style trainer career panel shows joint training, battle skills, and real trait thresholds',()=>{
 const game={season:1,week:5,clubs:[{id:0,trainers:[{
   uid:'trainer-ui',id:'ui',name:'자율 트레이너',tactics:10,switching:12,
   autonomyAI:{playTraits:['킬각 포착'],habitScores:{kill:70,pp:25},
     habitSuccessfulMatches:{pp:1,kill:3}}}],reserveTrainers:[]}]};
 const trainer=game.clubs[0].trainers[0];
 let overlay=null;
 const close={focus(){},onclick:null};
 const document={
   head:{append(){}},body:{append(box){if(box.id==='trainer-career-dialog')overlay=box;}},
   createElement(tag){
     return tag==='style'?{textContent:''}:{
       id:'',innerHTML:'',querySelector:()=>close,querySelectorAll:()=>[],remove(){}
     };
   },
   getElementById(id){return id==='trainer-career-dialog'?overlay:null}
 };
 const ctx={game,document,console,myClub:()=>game.clubs[0],renderOffice(){},
   escapeHTML:String,persist(){}};
 ctx.window=ctx;
 const endCareer=matchday.indexOf('/* Trainer Market 2.0',careerStart);
 runInNewContext(matchday.slice(careerStart,endCareer),ctx);
 const skill=ctx.TrainerCareer;
 skill.applyResearch(trainer,'1:4',[{slot:0,learned:'waterpulse'}]);
 skill.show();
 assert.ok(overlay?.innerHTML);
 assert.match(overlay.innerHTML,/기술 지도/);
 assert.match(overlay.innerHTML,/실제 기술 교체 1건/);
 assert.match(overlay.innerHTML,/성향 25\/55/);
 assert.match(overlay.innerHTML,/성공한 경기 1\/3회/);
 assert.match(overlay.innerHTML,/선플 습득 완료/);
 assert.match(overlay.innerHTML,/습득 1\/3/);
 assert.match(overlay.innerHTML,/기술 연구가 성공한 트레이너/);
});
