import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {runInNewContext} from 'node:vm';

const insightCode=readFileSync(new URL('../assets/match-feedback-insights.js',import.meta.url),'utf8');
const feedbackCode=readFileSync(new URL('../assets/match-feedback.js',import.meta.url),'utf8');
function load(){
 const ctx={};ctx.globalThis=ctx;ctx.window=ctx;
 ctx.escapeHTML=v=>String(v);
 ctx.myClub=()=>({id:'our'});
 ctx.game={lastMatch:{},trainerAI:{},pendingMatch:null};
 ctx.tab='home';ctx.renderOffice=()=>{};
 ctx.document={head:{append(){}},createElement:()=>({textContent:''}),
   getElementById:()=>null,body:{append(){}}};
 runInNewContext(insightCode,ctx);
 runInNewContext(feedbackCode,ctx);
 return ctx;
}
function fixture(){
 return {
  season:1,round:2,home:'our',away:'them',
  result:{
   aScore:5,bScore:3,
   teams:{home:[{name:'우리 트레이너',team:[{
    name:'mon-0',displayName:'거북왕',species:'Blastoise'}]}],
    away:[{name:'상대 트레이너'}]},
   coaching:{home:[{response:'자율'}],away:[]},
   rounds:[{trainerA:0,trainerB:0,winner:'A',
    log:'|switch|p1a: mon-0|Blastoise|100/100\n|turn|3',
    aiDecisions:{p1:{voluntarySwitches:2}},
    switchOutcomes:{bySide:{
     p1:{choices:2,matched:2,unmatched:0,windowDeaths:1,
       totalHpLossFraction:1.1},
     p2:{choices:0,matched:0,unmatched:0,windowDeaths:0,
       totalHpLossFraction:0}},
     switches:[
      {side:'p1',turn:3,target:'mon-0',species:'Blastoise',
       hpLostFraction:.4,exitHpFraction:.6,survivedWindow:true},
      {side:'p1',turn:5,target:'bad',species:'Eevee',
       hpLostFraction:.7,exitHpFraction:0,survivedWindow:false}
     ]}
   }],
   aceHandoffs:{
    A:{handoffs:1,alive:1,ready:1,leadKnown:1,readyVsLead:0,
      stoodNextDuel:0,records:[{duelIndex:0,trainerIndex:0,species:'Blastoise',
       alive:true,ready:true,readyVsLead:false,nextOpponentLead:'Pikachu',
       hpAfterRecoveryFraction:.65,remainingAttackingPP:5,stoodNextDuel:false}]},
    B:{handoffs:0,alive:0,ready:0,leadKnown:0,readyVsLead:0,
      stoodNextDuel:0,records:[]}
   }
  }
 };
}

test('summary aggregates observed damage correctly and separates both sides',()=>{
 const c=load(),p=fixture();
 const home=c.MatchFeedbackInsights.summarize(p.result,'home');
 assert.equal(home.choices,2);assert.equal(home.matched,2);
 assert.equal(home.deaths,1);assert.equal(home.heavyLoss,2);
 assert.ok(Math.abs(home.meanLoss-.55)<1e-12);
 assert.equal(home.worst[0].damageFraction,.7);
 assert.equal(home.worst[1].pokemon,'거북왕');
 assert.equal(home.aceReady,1);assert.equal(home.aceReadyVsLead,0);
 const away=c.MatchFeedbackInsights.summarize(p.result,'away');
 assert.equal(away.choices,0);assert.equal(away.aceHandoffs,0);
});

test('old match data reports unavailable, not false zero evidence',()=>{
 const c=load(),p=fixture();
 delete p.result.rounds[0].switchOutcomes;
 delete p.result.aceHandoffs;
 assert.equal(c.MatchFeedbackInsights.summarize(p.result).available,false);
 assert.match(c.MatchFeedbackInsights.render(p.result),/상세 기록이 없습니다/);
 assert.doesNotMatch(c.MatchFeedbackInsights.render(p.result),/0회/);
});

test('names are escaped and playback buttons unlock only when confirmed',()=>{
 const c=load(),p=fixture();
 p.result.rounds[0].switchOutcomes.switches[1].species='<b>not-markup</b>';
 const preview=c.MatchFeedbackInsights.render(p.result,'home',false);
 assert.match(preview,/data-feedback-insight-scene="0" disabled/);
 assert.doesNotMatch(preview,/<b>not-markup<\/b>/);
 assert.match(preview,/&lt;b&gt;not-markup&lt;\/b&gt;/);
 const confirmed=c.MatchFeedbackInsights.render(p.result,'home',true);
 assert.match(confirmed,/data-feedback-insight-scene="0"/);
 assert.doesNotMatch(confirmed,/data-feedback-insight-scene="0" disabled/);
});

test('feedback view keeps its existing trainer-growth narrative',()=>{
 const c=load(),p=fixture();
 const output=c.MatchFeedback.html(p,true);
 assert.match(output,/교체·에이스 실전 기록/);
 assert.match(output,/거북왕/);
 assert.match(output,/우리 트레이너/);
 assert.match(output,/실제 기록:/);
 assert.match(output,/55%/);
 assert.match(output,/권고가 승리의 원인이었다고 판정하지 않습니다/);
});

test('scene review opens actual duel and turn without modifying settlement',()=>{
 const c=load(),p=fixture();
 let opened=null,closed=false,alerts=0;
 c.MatchdayPreparation={review:(frame,duel,turn)=>{opened={frame,duel,turn};}};
 c.document.getElementById=()=>({remove:()=>{closed=true;}});
 const buttons=[{dataset:{feedbackInsightScene:'0'}},{dataset:{feedbackInsightScene:'1'}}];
 const root={querySelectorAll:q=>q==='[data-feedback-insight-scene]'?buttons:[]};
 c.MatchFeedback.bind(root,p);
 buttons[0].onclick();
 assert.equal(closed,true);assert.equal(opened.frame,p);
 assert.equal(opened.duel,0);assert.equal(opened.turn,5);
 c.game.pendingMatch={phase:'watch'};
 c.alert=()=>{alerts++;};opened=null;
 buttons[1].onclick();
 assert.equal(opened,null);assert.equal(alerts,1);
});
