import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {runInNewContext} from 'node:vm';

const evaluator=readFileSync(new URL('../assets/trainer-match-evaluation.js',import.meta.url),'utf8');
const overall=readFileSync(new URL('../assets/match-feedback-insights.js',import.meta.url),'utf8');
const feedback=readFileSync(new URL('../assets/match-feedback.js',import.meta.url),'utf8');

function load(){
 const ctx={};ctx.window=ctx;ctx.globalThis=ctx;
 ctx.escapeHTML=v=>String(v).replace(/</g,'&lt;').replace(/>/g,'&gt;');
 ctx.myClub=()=>({id:'ours'});
 ctx.game={lastMatch:{},trainerAI:{},pendingMatch:null};
 ctx.tab='home';ctx.renderOffice=()=>{};
 ctx.document={head:{append(){}},createElement:()=>({textContent:''}),
   getElementById:()=>null,body:{append(){}}};
 for(const source of [evaluator,overall,feedback])runInNewContext(source,ctx);
 return ctx;
}
function mock(){
 const trainer=(name)=>({name,team:[{name:'unit-'+name,displayName:'한글 '+name}]});
 const metric=(choices,matched,loss,deaths=0,unmatched=0)=>({
   choices,matched,unmatched,totalHpLossFraction:loss,windowDeaths:deaths});
 const events=(side,...parts)=>parts.map(([turn,loss,fainted])=>({
   side,turn, target:'unit-트레이너 1', species:'Pikachu',hpLostFraction:loss,
   survivedWindow:!fainted, exitHpFraction:fainted?0:1-loss
 }));
 return {season:1,round:1,home:'ours',away:'other',result:{
  aScore:4,bScore:5,
  teams:{home:[trainer('트레이너 1'),trainer('트레이너 2'),trainer('트레이너 3')],
    away:[trainer('상대')]},
  coaching:{home:[{requested:'PP 관리',response:'수용',behaviorAdvice:'pp',
    behaviorResponse:'수용'}]},
  rounds:[
   {trainerA:0,trainerB:0,winner:'A',log:'|turn|2',aiDecisions:{
     p1:{ppConservations:2,switchAnalysis:{avoided:3,urgentSwitches:1,aceProtected:0}},
     p2:{}},
     switchOutcomes:{bySide:{p1:metric(2,2,.6,0),p2:metric(0,0,0)},
       switches:events('p1',[2,.2,false],[4,.4,false])}},
   {trainerA:0,trainerB:0,winner:'B',log:'|turn|8',aiDecisions:{
     p1:{ppConservations:1,switchAnalysis:{avoided:0,urgentSwitches:1,aceProtected:1}},
     p2:{}},
     switchOutcomes:{bySide:{p1:metric(1,1,.6,1),p2:metric(0,0,0)},
       switches:events('p1',[8,.6,true])}},
   {trainerA:1,trainerB:0,winner:'B',log:'|turn|9',aiDecisions:{
     p1:{ppConservations:0,switchAnalysis:{avoided:0,urgentSwitches:0,aceProtected:0}},
     p2:{}},
     switchOutcomes:{bySide:{p1:metric(0,0,0),p2:metric(0,0,0)},switches:[]}}
  ],
  aceHandoffs:{A:{records:[{duelIndex:0,trainerIndex:0,species:'Mewtwo',
      ready:true,readyVsLead:true},{duelIndex:1,trainerIndex:1,species:'Gyarados',
      ready:false,readyVsLead:false}]}}
 }};
}
test('per-trainer records aggregate two duels without mixing another trainer',()=>{
 const {TrainerMatchEvaluation:e}=load();
 const rows=e.summarize(mock().result,'home');
 assert.equal(rows.length,3);
 assert.equal(rows[0].duels,2);assert.equal(rows[0].wins,1);
 assert.equal(rows[0].choices,3);assert.equal(rows[0].matched,3);
 assert.equal(rows[0].bigLoss,2);
 assert.equal(rows[0].fainted,1);
 assert.ok(Math.abs(rows[0].meanEntryLoss-.4)<1e-10);
 assert.equal(rows[0].ppSaves,3);
 assert.equal(rows[0].observations.avoided,3);
 assert.equal(rows[0].observations.urgent,2);
 assert.equal(rows[0].observations.aceProtected,1);
 assert.equal(rows[0].aceReady,1);
 assert.equal(rows[0].dangerous[0].duel,1);
 assert.equal(rows[0].dangerous[0].turn,8);
 assert.equal(rows[1].duels,1);assert.equal(rows[1].choices,0);
 assert.equal(rows[1].aceNotReady,1);
 assert.equal(rows[2].duels,0);
 assert.equal(rows[2].choices,null);
 assert.equal(e.renderOne(rows[2],true),'');
});
test('away and home use their own battle side without coach records spilling',()=>{
 const {TrainerMatchEvaluation:e}=load(),p=mock();
 const away=e.summarize(p.result,'away');
 assert.equal(away.length,1);
 assert.equal(away[0].duels,3);
 assert.equal(away[0].choices,0);
 assert.equal(away[0].ppSaves,null);
 assert.equal(away[0].aceHandoffs,null);
 assert.equal(away[0].strengths.length,0);
});
test('legacy absent measurement renders missing rather than a fabricated zero',()=>{
 const {TrainerMatchEvaluation:e}=load(),p=mock();
 p.result.rounds.forEach(round=>{delete round.switchOutcomes;delete round.aiDecisions;});
 delete p.result.aceHandoffs;
 const x=e.summarize(p.result,'home')[0];
 assert.equal(x.measuredDuels,0);
 assert.equal(x.choices,null);
 assert.equal(x.ppSaves,null);
 assert.equal(x.observations,null);
 const html=e.renderOne(x,true);
 assert.match(html,/기록 없음/);
 assert.match(html,/상세 교체 기록 없음/);
 assert.doesNotMatch(html,/자발적 교체 0회/);
});
test('evidence is described as observation, not ranked or causally scored',()=>{
 const {TrainerMatchEvaluation:e}=load(),p=mock();
 const summary=e.summarize(p.result,'home')[0];
 const html=e.renderOne(summary,true);
 assert.match(html,/중립 교체 유보 판단 3회/);
 assert.match(html,/체력·상성 위험에서 교체 2회/);
 assert.match(html,/PP 보존 선택 3회/);
 assert.match(html,/HP 30% 이상 손실 2회/);
 assert.match(html,/교체한 턴 기절 1회/);
 assert.match(html,/인과관계는 확인할 수 없습니다/);
 assert.doesNotMatch(html,/AI 등급 [ABC]/);
 assert.match(html,/data-feedback-trainer-scene="0:0"/);
 assert.doesNotMatch(html,/data-feedback-trainer-scene="0:0" disabled/);
 const preview=e.renderOne(summary,false);
 assert.match(preview,/data-feedback-trainer-scene="0:0" disabled/);
});
test('dynamic trainer names and Pokémon names are escaped as text',()=>{
 const {TrainerMatchEvaluation:e}=load(),p=mock();
 p.result.teams.home[0].name='<svg onload=evil>';
 p.result.rounds[0].switchOutcomes.switches[1].species='<img>';
 p.result.rounds[0].switchOutcomes.switches[1].target='unknown';
 const summary=e.summarize(p.result,'home')[0],html=e.renderOne(summary,true);
 assert.doesNotMatch(html,/<svg onload=/);
 assert.match(html,/&lt;svg/);
 assert.doesNotMatch(html,/<img>/);
 assert.match(html,/&lt;img&gt;/);
});
test('existing feedback card now shows trainer tactical evidence and preserves progression',()=>{
 const c=load(),p=mock();
 const html=c.MatchFeedback.html(p,true);
 assert.match(html,/이번 경기 전술 관찰/);
 assert.match(html,/교체·에이스 실전 기록/);
 assert.match(html,/전술 권고:/);
 assert.match(html,/트레이너 1/);
 assert.match(html,/중립 교체 유보 판단/);
 assert.match(html,/에이스 인계/);
});
test('trainer-specific replay button opens the correct recorded duel and turn',()=>{
 const c=load(),p=mock();
 let reviewed=null,closed=false,alerts=0;
 c.MatchdayPreparation={review:(frame,duel,turn)=>{reviewed={frame,duel,turn}}};
 c.document.getElementById=()=>({remove(){closed=true;}});
 c.alert=()=>{alerts++;};
 const buttons=[{dataset:{feedbackTrainerScene:'0:0'}},{dataset:{feedbackTrainerScene:'0:1'}}];
 const root={querySelectorAll:key=>key==='[data-feedback-trainer-scene]'?buttons:[]};
 c.MatchFeedback.bind(root,p);
 buttons[0].onclick();
 assert.equal(reviewed.frame,p);
 assert.equal(reviewed.duel,1);
 assert.equal(reviewed.turn,8);
 assert.equal(closed,true);
 c.game.pendingMatch={phase:'watch'};reviewed=null;
 buttons[1].onclick();
 assert.equal(alerts,1);
 assert.equal(reviewed,null);
});
