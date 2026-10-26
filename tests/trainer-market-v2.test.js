import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {runInNewContext} from 'node:vm';

const script=readFileSync(new URL('../assets/matchday.js',import.meta.url),'utf8');
const marker='/* Trainer Market 2.0 — trait-aware scouting, bids and AI club recruitment. */';

const makeTrainer=(id,options={})=>({
  uid:id,id,name:'트레이너 '+id,tactics:12,switching:13,
  pokemon:Array.from({length:6},(_,slot)=>({
    name:'몬스터 '+id+'/'+slot,ca:90,pa:150,power:80,level:50,
    moves:['thunderbolt','quickattack'],gp:{hp:20,atk:20,def:20,spa:20,spd:20,spe:20}
  })),autonomyAI:{version:1,preferredPlay:'balanced',openness:12,conviction:10,
    habitScores:{kill:0,switch:0,matchup:0,preserve:0,pp:0,status:0,analysis:0},
    playTraits:[]},aiCareer:{version:1,matches:3,wins:2},
  ...options
});
const makeGame=()=>{
  const ours={id:0,name:'우리 구단',division:0,trainers:Array.from({length:5},(_,i)=>makeTrainer(i+1)),
    reserveTrainers:[]};
  const theirs={id:1,name:'상대 구단',division:0,trainers:Array.from({length:5},(_,i)=>makeTrainer(i+11)),
    reserveTrainers:[makeTrainer(100,{autonomyAI:{version:1,preferredPlay:'offense',openness:16,
      conviction:8,habitScores:{kill:85,analysis:60},playTraits:['킬각 포착']}})]};
  return {season:1,week:2,club:ours.name,coins:2000000,
    clubs:[ours,theirs],transferHistory:[],log:[],trainerAI:{
      trust:{'1':64,'2':51},advice:{},issued:{},moveAdvice:{},moveIssued:{}
    }};
};
function setup(config={}){
  const g=config.game||makeGame(),head={append(){}},doc={head,createElement(){return {textContent:''}}};
  const messages=[],persisted={count:0};
  let target={c:g.clubs[1],t:g.clubs[1].reserveTrainers[0],kind:'reserve',slot:0,cid:1};
  const sandbox={
    window:{},document:doc,game:g,transferSelected:{},
    marketOffer(){},marketTarget:()=>target,
    transferMarketHTML:()=>'<h2>우리 구단 계약 관리</h2>',
    transferValuation:()=>500000,aiUnitScore:()=>100,
    aiTransferCandidates:()=>[],aiInit(){},
    transferAcceptance:()=>({clubChance:.6,trainerChance:.7}),
    aiMaintainSquad(){},clubIdentity:()=>({budget:1000000}),
    transferOpen:()=>true,wonReadable:n=>'₩'+n.toLocaleString(),
    rng:config.rng||(()=>0),alert:m=>messages.push(m),
    confirm:config.confirm||(()=>true),
    myClub:()=>g.clubs[0],
    escapeHTML:v=>String(v),persist:()=>{persisted.count++;},
    renderOffice:()=>{},console
  };
  assert.ok(script.includes(marker));
  runInNewContext(script.slice(script.indexOf(marker)),sandbox);
  return {game:g,api:sandbox.window.TrainerMarketV2,sandbox,persisted,messages,
    setTarget:v=>{target=v;}};
}
test('scouting values observed ability, seven traits, potential and coaching fit',()=>{
  const {api,game}=setup();
  const noTraits=makeTrainer(200),expert=makeTrainer(200,{
    autonomyAI:{preferredPlay:'offense',openness:16,conviction:8,
      playTraits:['킬각 포착','전황 분석가'],
      habitScores:{kill:90,analysis:75,status:55}}});
  const old=api.score(noTraits),advanced=api.score(expert);
  assert.ok(advanced.strength>old.strength);
  assert.ok(api.compatible(expert,'attacking')>api.compatible(expert,'defensive'));
  assert.ok(api.suggestion(expert,game.clubs[1],2000000,'attacking').overall>
    api.suggestion(noTraits,game.clubs[1],2000000,'attacking').overall);
  assert.ok(api.candidates(game,'attacking').length>=6);
  const html=api.renderMarket('<h2>우리 구단 계약 관리</h2>');
  assert.match(html,/트레이너 스카우팅/);
  assert.match(html,/감독 전술 방향/);
  assert.match(html,/정밀 조사/);
});
test('scouting is season-scoped, paid only once and keeps squad unchanged',()=>{
  const {api,game}=setup(),original=game.clubs[1].reserveTrainers[0];
  const before=JSON.stringify(original);
  assert.equal(api.scout().ok,true);
  assert.equal(game.coins,1800000);
  assert.equal(api.scout().ok,false);
  assert.equal(game.coins,1800000);
  assert.equal(JSON.stringify(original),before);
});
test('transfer transaction preserves Pokémon, career, learned habits and unique identity',()=>{
  const {api,game}=setup(),original=game.clubs[1].reserveTrainers[0];
  const before=JSON.stringify(original);
  const result=api.executeTransfer({buyer:game.clubs[0],seller:game.clubs[1],trainer:original,
    sourceKind:'reserve',slot:0,fee:600000,budget:game.coins});
  assert.equal(result.ok,true);
  assert.equal(game.clubs[0].reserveTrainers[0],original);
  assert.equal(game.clubs[1].reserveTrainers.length,0);
  assert.equal(JSON.stringify(original),before);
  assert.equal(original.uid,100);
  assert.equal(original.autonomyAI.habitScores.kill,85);
  assert.equal(original.aiCareer.matches,3);
});
test('prevent orphaned starting lineups, stale offers and unaffordable transfers atomically',()=>{
  const {api,game}=setup(),ours=game.clubs[0],seller=game.clubs[1];
  const active=seller.trainers[0],replacement=seller.reserveTrainers.splice(0);
  const initial=JSON.stringify(game.clubs);
  assert.equal(api.checkTransfer({buyer:ours,seller,trainer:active,
    sourceKind:'active',slot:0,fee:100000,budget:game.coins}).ok,false);
  assert.equal(api.executeTransfer({buyer:ours,seller,trainer:active,
    sourceKind:'active',slot:0,fee:100000,budget:game.coins}).ok,false);
  assert.equal(JSON.stringify(game.clubs),initial);
  seller.reserveTrainers.push(...replacement);
  assert.equal(api.checkTransfer({buyer:ours,seller,trainer:replacement[0],
    sourceKind:'reserve',slot:0,fee:3000000,budget:game.coins}).ok,false);
  assert.equal(api.checkTransfer({buyer:ours,seller,trainer:makeTrainer(999),
    sourceKind:'reserve',slot:0,fee:10000,budget:game.coins}).ok,false);
});
test('successful user bid is transactional and cannot duplicate the same week',()=>{
  const {api,game}=setup(),original=game.clubs[1].reserveTrainers[0],before=game.coins;
  api.setPremium('1.15');
  api.bid();
  assert.equal(game.clubs[0].reserveTrainers[0],original);
  assert.equal(game.clubs[1].reserveTrainers.length,0);
  assert.equal(game.coins,before-575000);
  assert.equal(game.transferHistory[0].type,'영입');
  assert.equal(game.transferHistory[0].fee,575000);
  assert.equal(original.aiCareer.matches,3);
  api.bid();
  assert.equal(game.transferHistory.length,1);
  assert.equal(game.clubs[0].reserveTrainers.length,1);
});
test('rejected bid consumes no coins and cannot be spammed until another week',()=>{
  const {api,game,messages}=setup({rng:()=>.99});
  const original=game.clubs[1].reserveTrainers[0];
  api.bid();
  assert.equal(game.coins,2000000);
  assert.equal(game.transferHistory.length,1);
  assert.equal(game.transferHistory[0].type,'협상 결렬');
  assert.equal(game.clubs[1].reserveTrainers[0],original);
  assert.equal(game.clubs[0].reserveTrainers.length,0);
  api.bid();
  assert.equal(game.transferHistory.length,1);
  assert.ok(messages.some(x=>x.includes('이미 협상')));
});
test('stable trainer keys and player trust survive unique-uid migration',()=>{
  const {api,game}=setup();
  assert.equal(api.migrate(game),true);
  assert.equal(game.trainerAI.trust['trainer:1'],64);
  assert.equal(game.trainerAI.trust['trainer:2'],51);
  assert.equal(api.migrate(game),false);
});
test('AI club shortlist prioritizes stronger skill, learned traits and plan compatibility',()=>{
  const {api,game,sandbox}=setup();
  const a=game.clubs[1].reserveTrainers[0],b=makeTrainer(155);
  const result=api.candidates(game,'attacking');
  assert.ok(result.length>0);
  assert.ok(result.some(x=>x.trainer===a));
  assert.ok(api.compatible(a,'attacking')>api.compatible(b,'attacking'));
  assert.equal(typeof sandbox.aiTransferCandidates,'function');
  assert.equal(sandbox.transferMarketHTML().includes('이적시장'),true);
});
