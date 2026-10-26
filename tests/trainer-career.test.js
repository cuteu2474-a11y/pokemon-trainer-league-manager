import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {runInNewContext} from 'node:vm';
import {trainerPersonality,resolveBattleAutonomy} from '../src/battle/battle-autonomy.js';
import {TrainerAI,trainerSkill} from '../src/battle/trainer-ai.js';

const content=readFileSync(new URL('../assets/matchday.js',import.meta.url),'utf8');
const marker='/* Trainer career and relationship — persistent experience from played matches. */';
const extracted=content.slice(content.indexOf(marker));
function careerApi(){
  assert.ok(content.includes(marker));
  const window={};
  runInNewContext(extracted,{window,document:undefined,game:null,
    myClub:()=>null,persist:()=>{},renderOffice:()=>{},escapeHTML:String,console});
  return window.TrainerCareer;
}
const coach=(id)=>({id,name:'트레이너 '+id,tactics:10,switching:10,
  autonomyAI:{version:1,style:'balanced',preferredPlay:'control',openness:17,conviction:7}});
function fixture(round=1){
  return {season:1,round,home:0,away:1,order:[2,0,1,3,4],result:{
    rounds:[
      {trainerA:0,trainerB:0,winner:'A',log:'|-heal|p1a: Mewtwo|200/250\n|-heal|p1a: Mewtwo|230/250',final:{p1:[{hp:220}],p2:[]},
        aiDecisions:{p1:{moves:36,switches:8,voluntarySwitches:5,rollouts:17,
          trace:[
            ...Array.from({length:5},()=>({kind:'switch',reason:'불리한 상성·HP 위험에 따른 자율 교체',
              quality:{switch:true,preserve:true}})),
            ...Array.from({length:7},()=>({kind:'move',reason:'전황 분석·연승 전력 관리',
              quality:{analysis:true,preserve:true}})),
          ]}},
        p2:{moves:7,switches:2,voluntarySwitches:0,rollouts:1,trace:[]}}},
      {trainerA:0,trainerB:1,winner:'A',log:'|-heal|p1a: Mewtwo|205/250',final:{p1:[{hp:215}],p2:[]},
        aiDecisions:{p1:{moves:28,switches:5,voluntarySwitches:4,rollouts:14,
          trace:[
            ...Array.from({length:4},()=>({kind:'switch',reason:'불리한 상성·HP 위험에 따른 자율 교체',
              quality:{switch:true,preserve:true}})),
            ...Array.from({length:6},()=>({kind:'move',reason:'전황 분석·연승 전력 관리',
              quality:{analysis:true,preserve:true}})),
          ]}},
        p2:{moves:9,switches:1,voluntarySwitches:0,rollouts:3,trace:[]}}},
    ]}};
}
const game=()=>({season:1,round:1,clubs:[
  {id:0,trainers:Array.from({length:5},(_,i)=>coach('home'+i))},
  {id:1,trainers:Array.from({length:5},(_,i)=>coach('away'+i))}
]});
test('only trainers who actually played grow; reordered starters remain correctly identified',()=>{
  const api=careerApi(),save=game(),p=fixture();
  const report=api.applyMatch(save,p,0);
  assert.equal(report.participants.length,3);
  assert.deepEqual(Array.from(report.participants,x=>x.index),[2,0,1]);
  assert.equal(save.clubs[0].trainers[2].aiCareer.duels,2);
  assert.equal(save.clubs[0].trainers[0].aiCareer,undefined);
  assert.equal(save.clubs[0].trainers[2].aiCareer.wins,2);
  assert.equal(save.clubs[1].trainers[0].aiCareer.losses,1);
  assert.equal(api.applyMatch(save,p,0),null,'a confirmed match must not grant repeat XP');
  assert.equal(save.clubs[0].trainers[2].aiCareer.matches,1);
});
test('long-term experience raises specialist skills, learns traits and affects live AI',()=>{
  const api=careerApi(),save=game();
  for(let round=1;round<=9;round++){
    save.round=round;
    assert.ok(api.applyMatch(save,fixture(round),0));
  }
  const trainer=save.clubs[0].trainers[2];
  assert.ok(trainer.moveJudgment>10);
  assert.ok(trainer.switchJudgment>10);
  assert.ok(trainer.battleAnalysis>10);
  assert.ok(trainer.resourceManagement>10);
  assert.ok(trainer.autonomyAI.playTraits.includes('적극적인 교체'));
  assert.ok(trainer.autonomyAI.playTraits.includes('에이스 보존'));
  assert.ok(trainer.autonomyAI.playTraits.includes('전황 분석가'));
  assert.ok(Object.values({moveJudgment:trainer.moveJudgment,
    switchJudgment:trainer.switchJudgment,battleAnalysis:trainer.battleAnalysis,
    resourceManagement:trainer.resourceManagement}).every(x=>x<=20));
  assert.equal(trainerSkill(trainer).tactics,trainer.moveJudgment);
  assert.equal(trainerSkill(trainer).switching,trainer.switchJudgment);
  const profile=trainerPersonality(trainer);
  assert.ok(profile.traits.includes('에이스 보존'));
  const enriched=resolveBattleAutonomy(trainer,60);
  assert.ok(enriched.traits.includes('전황 분석가'));
  const basic=coach('basic');
  basic.autonomyAI.playTraits=[];
  const aiA=new TrainerAI({}, {...trainer,aiProfile:enriched},{seed:[1,2,3,4]});
  const aiB=new TrainerAI({}, {...basic,aiProfile:resolveBattleAutonomy(basic,60)},{seed:[1,2,3,4]});
  for(const ai of [aiA,aiB]){ai.ownActive={species:'Pikachu'};ai.foeSpecies='Golem';ai.remaining=4;}
  const request={side:{pokemon:[{active:true,condition:'90/100'}]}};
  assert.ok(aiA.moveProbability(request)<aiB.moveProbability(request),
    'learned switching and preservation traits should increase the willingness to switch');
});

test('pre-match advice plus successful real play improves future autonomous preference',()=>{
  const api=careerApi(),save=game(),p=fixture();
  const starter=save.clubs[0].trainers[2];
  p.result.coaching={home:[{name:starter.name,behaviorAdvice:'switch',behaviorResponse:'수용'}],
    away:[{}]};
  const report=api.applyMatch(save,p,0),entry=report.participants.find(e=>e.player);
  assert.equal(entry.advice.target,'switch');
  assert.equal(entry.advice.response,'수용');
  assert.ok(entry.progress.switch.gained>0);
  assert.ok(starter.autonomyAI.habitScores.switch>0);
  assert.equal(starter.autonomyAI.habitScores.analysis>0,true,
    'useful autonomous analysis also earns habitual learning even without advice');
  const guided=starter.autonomyAI.habitScores.switch;
  const plain=game(),q=fixture();
  const uncoached=plain.clubs[0].trainers[2];
  api.applyMatch(plain,q,0);
  assert.ok(guided>uncoached.autonomyAI.habitScores.switch,
    'accepted direction helps encode a good outcome, not a free trait');
  // The next game, with NO new instruction, is affected by persisted personal experience.
  const proficient=resolveBattleAutonomy(starter,50);
  const inexperienced=resolveBattleAutonomy(coach('fresh'),50);
  assert.equal(proficient.behaviorAdvice,null);
  const learnedAI=new TrainerAI({}, {...starter,aiProfile:proficient},{seed:[3,4,5,6]});
  const noviceAI=new TrainerAI({}, {...coach('fresh'),aiProfile:inexperienced},{seed:[3,4,5,6]});
  for(const ai of [learnedAI,noviceAI]){
    ai.ownActive={species:'Pikachu'};ai.foeSpecies='Golem';ai.remaining=4;
  }
  const request={side:{pokemon:[{active:true,condition:'90/100'}]}};
  assert.ok(learnedAI.moveProbability(request)<noviceAI.moveProbability(request));
});
test('losses or ineffective actions do not reinforce or grant a trait',()=>{
  const api=careerApi(),save=game();
  for(let r=1;r<=10;r++){
    const p=fixture(r);save.round=r;
    p.result.coaching={home:[{behaviorAdvice:'analysis',behaviorResponse:'수용'}],away:[]};
    for(const round of p.result.rounds){
      round.winner='B';
      round.aiDecisions.p1.trace=Array.from({length:20},()=>
        ({kind:'move',quality:{analysis:true},reason:'전황 분석·실전 시뮬레이션'}));
    }
    api.applyMatch(save,p,0);
  }
  const t=save.clubs[0].trainers[2];
  assert.equal(t.autonomyAI.habitScores.analysis,0);
  assert.ok(!(t.autonomyAI.playTraits||[]).includes('전황 분석가'));
});
test('feedback depends on personality and match performance, not a guaranteed trust bonus',()=>{
  const api=careerApi(),save=game();
  api.applyMatch(save,fixture(),0);
  const round='1:1:0:1';
  const success=api.offerFeedback(save,0,round,2,'analysis');
  assert.equal(success.ok,true);
  assert.equal(success.feedback.response,'수용');
  assert.equal(save.trainerAI.trust.home2,52);
  assert.equal(api.offerFeedback(save,0,round,2,'praise').ok,false,'no repeat meetings');
  assert.equal(api.offerFeedback(save,0,round,4,'praise').ok,false,'bench cannot be praised for match play');
  assert.equal(api.offerFeedback(save,0,'unknown',2,'praise').ok,false);
  assert.equal(api.offerFeedback(save,0,round,2,'bad input').ok,false);
  const other=game(),trainer=other.clubs[0].trainers[2];
  trainer.autonomyAI.conviction=19;trainer.autonomyAI.openness=3;
  other.trainerAI={version:1,trust:{home2:30}};
  api.applyMatch(other,fixture(),0);
  const rejected=api.offerFeedback(other,0,round,2,'challenge');
  assert.equal(rejected.feedback.response,'반발');
  assert.equal(other.trainerAI.trust.home2,27);
});
test('feedback never changes match replay results or Pokémon stats',()=>{
  const api=careerApi(),save=game(),p=fixture(),before=JSON.stringify(p.result);
  api.applyMatch(save,p,0);
  const mons=[{ca:40,pa:80,hp:90,moves:['thunderbolt']}];
  save.clubs[0].trainers[2].pokemon=mons;
  assert.equal(api.offerFeedback(save,0,'1:1:0:1',2,'autonomy').ok,true);
  assert.equal(JSON.stringify(p.result),before);
  assert.deepEqual(mons,[{ca:40,pa:80,hp:90,moves:['thunderbolt']}]);
});
