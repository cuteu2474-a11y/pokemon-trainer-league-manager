import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {runInNewContext} from 'node:vm';

const source=readFileSync(new URL('../assets/ai-season-market.js',import.meta.url),'utf8');
const mon=(id,trainer,retirementSeason=12)=>({uid:id,name:'포켓몬 '+id,
  ownerTrainerId:String(trainer),power:85,retirementSeason,careerSeasons:1});
const trainer=(id,retirementSeason=12)=>({uid:id,name:'트레이너 '+id,tactics:15,switching:14,
  pokemon:Array.from({length:6},(_,i)=>mon(id+':'+i,id,retirementSeason))});
function setup(){
  const user={id:0,name:'우리 구단',division:0,trainers:Array.from({length:5},(_,i)=>trainer(i+1))};
  const buyer={id:1,name:'AI 구매자',division:1,points:25,
    trainers:Array.from({length:5},(_,i)=>trainer(i+11)),reserveTrainers:[],trainerAcademy:[],
    identity:{budget:200000000}};
  const seller={id:2,name:'AI 판매자',division:1,points:20,
    trainers:Array.from({length:5},(_,i)=>trainer(i+21)),reserveTrainers:[trainer(80)],trainerAcademy:[],
    identity:{budget:200000000}};
  const game={season:1,week:2,round:18,seasonSettled:false,club:'우리 구단',
    clubs:[user,buyer,seller],freeAgents:[],transferHistory:[],log:[],coins:12345678};
  let candidates=[],settlementCalls=0,seasonCalls=0;
  const sandbox={window:{},game,aiClubFocus:1,aiDivisionFilter:'all',
    aiUnitScore:t=>Math.round(t.tactics*2+t.switching*2+
      t.pokemon.reduce((s,p)=>s+p.power,0)/Math.max(1,t.pokemon.length)),
    clubIdentity:c=>c.identity,startingClubBudget:()=>100000000,
    aiPlacement:()=>null,aiBidFits:()=>null,aiAcquire:()=>false,
    aiTransferCandidates:()=>candidates,aiTransferWindow:()=>0,
    seasonSettlement:()=>{settlementCalls++;
      if(game.seasonSettled)return false;
      game.seasonSettled=true;
      buyer.trainers[0].pokemon.splice(0,2);return true;},
    startNewSeason:()=>{seasonCalls++;
      if(!game.seasonSettled)return;
      game.season++;game.week=1;game.seasonSettled=false;},
    aiManagersHTML:()=>'<article><h3>감독 의사결정 내역</h3></article>',
    clubSeasonMetrics:()=>({rank:9}),aiRecord:()=>{},escapeHTML:s=>String(s)};
  runInNewContext(source,sandbox);
  return {api:sandbox.window.AISeasonMarket,game,buyer,seller,sandbox,
    setCandidates:x=>{candidates=x;},get settlementCalls(){return settlementCalls;},
    get seasonCalls(){return seasonCalls;}};
}

test('season strategy is stable within a season and anticipates retirement without changing match stats',()=>{
  const {api,game,buyer}=setup();
  buyer.trainers[0].pokemon.slice(0,3).forEach(p=>{p.retirementSeason=2;});
  const score=api.activeIndex(buyer),plan=api.strategy(game,buyer);
  assert.equal(plan.focus,'세대 교체');
  assert.equal(plan.recordedWeek,2);
  assert.equal(plan.openingStrength,score);
  buyer.trainers[1].tactics+=4;
  assert.equal(api.strategy(game,buyer),plan,'strategy must not rewrite the opening baseline');
  assert.equal(game.coins,12345678);
  assert.equal(buyer.points,25);
});

test('AI can buy a complete trainer to replace a partial starter while preserving the trainer and all Pokémon',()=>{
  const {api,buyer,seller,sandbox,game}=setup(),old=buyer.trainers[1];
  old.pokemon.pop();
  const incoming=seller.reserveTrainers[0];
  const before=old.pokemon.map(p=>p.uid),budget=buyer.identity.budget;
  const plan=sandbox.aiBidFits(buyer,incoming,50000000);
  assert.equal(plan.kind,'repair');
  assert.equal(plan.slot,1);
  assert.equal(sandbox.aiAcquire(buyer,incoming,'스카우팅'),true);
  assert.equal(buyer.trainers[1],incoming);
  assert.equal(buyer.reserveTrainers[0],old);
  assert.deepEqual(old.pokemon.map(p=>p.uid),before);
  assert.equal(old.pokemon.every(p=>p.ownerTrainerId===String(old.uid)),true);
  assert.equal(buyer.identity.budget,budget,'placement is not a free budget transaction');
  assert.equal(game.coins,12345678);
  assert.equal(api.needs(game,buyer).vacancies,0);
});

test('same-price AI bids prefer durable candidates and never strip a seller lacking a valid substitute',()=>{
  const f=setup(),{api,game,buyer,seller,sandbox}=f;
  const veteran=trainer(90,1),young=trainer(91,10);
  buyer.trainers[0].pokemon.slice(0,3).forEach(p=>{p.retirementSeason=2;});
  const validSeller={...seller,reserveTrainers:[trainer(99)]};
  f.setCandidates([
    {seller:validSeller,e:{t:veteran,kind:'reserve',slot:0},fee:80000000,score:100},
    {seller:validSeller,e:{t:young,kind:'reserve',slot:1},fee:80000000,score:100},
    {seller:{...seller,reserveTrainers:[],trainerAcademy:[]},
      e:{t:trainer(98),kind:'active',slot:0},fee:60000000,score:1000}
  ]);
  const ranked=sandbox.aiTransferCandidates(buyer);
  assert.equal(ranked.length,2);
  assert.equal(ranked[0].e.t,young);
  assert.ok(api.candidateYears(game,young)>api.candidateYears(game,veteran));
});

test('settlement records strength before and after actual retirements, once, then opens the next-season baseline',()=>{
  const {api,game,buyer,sandbox}=setup();
  const initial=api.activeIndex(buyer);
  sandbox.seasonSettlement();
  assert.equal(buyer.aiSeasonHistory.length,1);
  const first=buyer.aiSeasonHistory[0];
  assert.equal(first.opening,initial);
  assert.equal(first.closing,initial);
  assert.ok(first.afterRetirements<first.closing);
  assert.equal(first.rank,9);
  sandbox.seasonSettlement();
  assert.equal(buyer.aiSeasonHistory.length,1,'do not duplicate a season report');
  sandbox.startNewSeason();
  assert.equal(game.season,2);
  assert.equal(buyer.aiSeasonStrategy.openingStrength,first.afterRetirements);
  assert.equal(buyer.aiSeasonStrategy.focus,'출전 공석 충원');
  assert.equal(game.coins,12345678);
});

test('AI manager view shows year-over-year strength changes without altering results',()=>{
  const {sandbox,buyer,game}=setup();
  sandbox.seasonSettlement();sandbox.startNewSeason();
  const html=sandbox.aiManagersHTML();
  assert.match(html,/구단 전력 변화와 이적 목표/);
  assert.match(html,/은퇴 반영 후/);
  assert.match(html,/출전 공석 충원/);
  assert.match(html,/전력 지수는 출전 5명/);
  assert.equal(game.coins,12345678);
  assert.equal(buyer.points,25);
});
