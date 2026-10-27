import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {runInNewContext} from 'node:vm';

const source=readFileSync(new URL('../assets/ai-coach-career.js',import.meta.url),'utf8');
const mon=(tid,i,year=12)=>({uid:tid+':'+i,ownerTrainerId:String(tid),power:75,retirementSeason:year});
const trainer=(id,year=12)=>({uid:id,name:'트레이너 '+id,tactics:12,switching:10,
  profile:{ca:80,pa:160},pokemon:Array.from({length:6},(_,i)=>mon(id,i,year))});
function setup(){
  const user={id:0,name:'우리 구단',division:0,trainers:Array.from({length:5},(_,i)=>trainer(i+1))};
  const ai={id:1,name:'AI 구단',division:1,trainers:Array.from({length:5},(_,i)=>trainer(i+11)),
    reserveTrainers:[],trainerAcademy:[trainer(100)],identity:{budget:250000000},
    aiManager:{name:'기존 감독',personality:'장기 육성형',risk:53,youth:71,tactics:14,
      negotiation:12,preferredStyle:'균형 운영',style:'균형 운영',confidence:72,
      weeklyDecisions:0,transfers:0,academyPromotions:0,trainingWeeks:0,development:0,
      history:[],plan:'전력 유지'}};
  const game={seed:1234567,club:user.name,season:1,week:1,round:18,
    seasonSettled:false,coins:55000000,clubs:[user,ai],transferHistory:[],log:[]};
  let rank=5,grade=1,confidence=72,candidates=[],baselineWeekly=0,news=[];
  const scope={window:{},game,aiClubFocus:1,aiDivisionFilter:'all',
    aiManager:c=>c.aiManager,aiRecord:(_c,action,detail,publicNews)=>{
      if(publicNews)news.push({action,detail});},
    aiUnitScore:t=>t.tactics*5+t.switching*3+t.pokemon.reduce((n,p)=>n+p.power,0)/6,
    aiMaintainSquad:()=>true,
    aiWeeklyPlan:()=>{baselineWeekly++;},
    aiTransferCandidates:()=>candidates,
    seasonSettlement:()=>{
      if(game.seasonSettled)return false;
      game.seasonSettled=true;
      ai.aiManager.lastSeasonReview={season:game.season,rank,grade,points:30};
      ai.aiManager.confidence=confidence;
      return true;
    },
    startNewSeason:()=>{
      if(!game.seasonSettled)return;
      game.season++;game.week=1;game.round=0;game.seasonSettled=false;
    },
    aiManagersHTML:()=>'<section><h3>감독 의사결정 내역</h3></section>',
    escapeHTML:s=>String(s)};
  runInNewContext(source,scope);
  return {api:scope.window.AICoachCareer,game,ai,user,scope,
    setReview:(r,g,c)=>{rank=r;grade=g;confidence=c;},
    setCandidates:items=>{candidates=items;},
    get weeklyCalls(){return baselineWeekly;},get news(){return news;}};
}

test('existing AI coach is migrated to a stable contract and player manager stays untouched',()=>{
  const f=setup(),{api,game,ai,user}=f;
  const before=JSON.stringify(user),manager=ai.aiManager,seed=game.seed;
  const contract=api.career(game,ai);
  assert.equal(contract.id,'coach:1:1');
  assert.equal(contract.contractUntil,3);
  assert.equal(api.career(game,ai),contract);
  assert.equal(api.career(game,user),null);
  assert.equal(ai.aiManager,manager);
  assert.equal(JSON.stringify(user),before);
  assert.equal(game.seed,seed);
});

test('two consecutive poor reviews can dismiss a coach while preserving club Pokémon, finance and archived history',()=>{
  const f=setup(),{api,game,ai,scope}=f;
  const retained=ai.trainers[0],pokemon=retained.pokemon[0],budget=ai.identity.budget;
  f.setReview(9,-12,30);scope.seasonSettlement();
  assert.equal(ai.aiManager.name,'기존 감독');
  assert.equal(api.career(game,ai).badSeasons,1);
  scope.startNewSeason();game.round=18;
  f.setReview(10,-15,24);scope.seasonSettlement();
  assert.notEqual(ai.aiManager.name,'기존 감독');
  assert.equal(ai.aiManager.coachCareer.generation,2);
  assert.equal(ai.aiManager.coachCareer.appointedSeason,3);
  assert.equal(ai.aiCoachHistory[0].name,'기존 감독');
  assert.equal(ai.aiCoachDecisions[0].status,'감독 경질');
  assert.equal(ai.trainers[0],retained);
  assert.equal(ai.trainers[0].pokemon[0],pokemon);
  assert.equal(ai.identity.budget,budget);
  assert.equal(game.coins,55000000);
  assert.ok(f.news.some(x=>x.action==='감독 경질'));
  scope.seasonSettlement();
  assert.equal(ai.aiCoachHistory.length,1,'same season cannot dismiss twice');
});

test('solid results renew an expiring AI manager contract once and preserve experience',()=>{
  const f=setup(),{game,ai,scope}=f,coach=ai.aiManager;
  for(let season=1;season<=3;season++){
    game.round=18;f.setReview(3,8,75);scope.seasonSettlement();
    if(season<3)scope.startNewSeason();
  }
  assert.equal(ai.aiManager,coach);
  assert.equal(coach.coachCareer.renewals,1);
  assert.equal(coach.coachCareer.contractUntil,5);
  assert.equal(coach.coachCareer.seasonsCompleted,3);
  scope.seasonSettlement();
  assert.equal(coach.coachCareer.renewals,1);
  assert.equal(ai.aiCoachHistory?.length||0,0);
});

test('academy mentoring uses the existing five-session tactic growth, never mints a Pokémon or charges the player',()=>{
  const f=setup(),{api,game,ai,scope}=f,target=ai.trainerAcademy[0];
  const original=target.pokemon.map(p=>p.uid),cash=game.coins;
  const p=api.policy(game,ai);
  assert.equal(p.focus,'신예 육성');
  for(let week=2;week<=13;week++){
    scope.aiWeeklyPlan(week);
    scope.aiWeeklyPlan(week); // A duplicate mentor invocation must be ignored.
  }
  assert.equal(p.mentoredWeeks,6);
  assert.equal(target.tactics,13);
  assert.equal(target.aiTraining,1);
  assert.deepEqual(target.pokemon.map(x=>x.uid),original);
  assert.equal(game.coins,cash);
  assert.equal(ai.reserveTrainers.length,0);
  assert.equal(f.weeklyCalls,24,'pre-existing weekly planner remains in place');
  target.tactics=20;
  assert.equal(api.mentor(game,ai,14),false);
  assert.equal(target.tactics,20);
});

test('club youth policy persists and reorders affordable transfer targets without changing their price',()=>{
  const f=setup(),{api,game,ai,scope}=f;
  const young=trainer(201,11),old=trainer(202,2);
  f.setCandidates([
    {e:{t:old},fee:80000000,score:100},
    {e:{t:young},fee:80000000,score:100}
  ]);
  const plan=api.policy(game,ai),initial=JSON.stringify(ai.trainers);
  const ranked=scope.aiTransferCandidates(ai);
  assert.equal(ranked[0].e.t,young);
  assert.equal(ranked[0].fee,80000000);
  assert.equal(api.policy(game,ai),plan);
  assert.equal(JSON.stringify(ai.trainers),initial);
  assert.equal(game.coins,55000000);
});

test('AI manager page includes contract, development horizon and archived managers',()=>{
  const f=setup(),{game,ai,scope}=f;
  let view=scope.aiManagersHTML();
  assert.match(view,/감독 계약과 구단 육성 정책/);
  assert.match(view,/3시즌 육성 방향/);
  f.setReview(9,-12,30);scope.seasonSettlement();scope.startNewSeason();game.round=18;
  f.setReview(10,-15,24);scope.seasonSettlement();
  view=scope.aiManagersHTML();
  assert.match(view,/기존 감독/);
  assert.match(view,/역대 감독/);
  assert.equal(ai.aiCoachHistory.length,1);
});

test('ten season coaching turnover is idempotent and never transfers trainer Pokémon or player money',()=>{
  const f=setup(),{game,ai,user,scope}=f;
  const player=JSON.stringify(user),roster=ai.trainers.map(t=>t.uid),cash=game.coins;
  for(let season=1;season<=10;season++){
    game.round=18;
    f.setReview(season<=2?10:4,season<=2?-12:6,season<=2?26:70);
    scope.seasonSettlement();
    const count=ai.aiCoachDecisions.length;
    scope.seasonSettlement();
    assert.equal(ai.aiCoachDecisions.length,count);
    if(season<10)scope.startNewSeason();
  }
  assert.equal(game.season,10);
  assert.deepEqual(ai.trainers.map(t=>t.uid),roster);
  for(const t of ai.trainers)for(const p of t.pokemon)
    assert.equal(p.ownerTrainerId,String(t.uid));
  assert.equal(JSON.stringify(user),player);
  assert.equal(game.coins,cash);
  assert.ok(ai.aiCoachHistory.length>=1);
  assert.equal(ai.aiCoachDecisions.length,10);
});

test('academy intake pauses at ten seats without deleting or replacing existing prospects',()=>{
  const html=readFileSync(new URL('../index.html',import.meta.url),'utf8');
  const declaration=html.split('\n').find(line=>line.startsWith('function generateAcademyTrainers(){'));
  assert.ok(declaration);
  const existing=Array.from({length:10},(_,i)=>trainer(1000+i));
  const full={id:1,name:'AI',trainerAcademy:existing};
  const open={id:0,name:'우리 구단',trainerAcademy:Array.from({length:9},(_,i)=>trainer(2000+i))};
  let created=0;
  const game={season:3,club:open.name,clubs:[full,open],log:[]};
  const scope={game,ensureTrainerAcademies:()=>{},rnd:()=>1,
    mkTrainer:()=>{created++;return trainer(3000+created);}};
  runInNewContext(declaration,scope);
  scope.generateAcademyTrainers();
  assert.equal(full.trainerAcademy.length,10);
  assert.equal(full.trainerAcademy.every((x,i)=>x===existing[i]),true);
  assert.equal(open.trainerAcademy.length,10);
  assert.equal(created,1);
});
