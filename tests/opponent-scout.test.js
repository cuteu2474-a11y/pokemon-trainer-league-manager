import test from 'node:test';
import assert from 'node:assert/strict';
import {analyzeOpponent,pairingScore,typeEffectiveness,recommendOrder} from '../src/scouting/opponent-report.js';
import handler from '../api/opponent-scout.js';

const mon=(name,ca=110)=>({name,level:50,ca,pa:ca+20,moves:[]});
const trainer=(name,species,tactics=12,switching=10,options={})=>({
  name,tactics,switching,pokemon:Array.from({length:6},()=>mon(species)),
  autonomyAI:{preferredPlay:options.play||'balanced',
    playTraits:options.traits||[]}
});
const club=(id,team)=>({id,name:'구단 '+id,trainers:team});
const fixture=()=>({
  home:club(0,[
    trainer('전기 전문가','피카츄',16),
    trainer('물 전문가','거북왕',12),
    trainer('풀 전문가','이상해꽃',14),
    trainer('격투 전문가','루카리오',11),
    trainer('불 전문가','리자몽',13)
  ]),
  away:club(1,[
    trainer('물 상대','거북왕',17,8,{play:'offense',traits:['킬각 포착']}),
    trainer('바위 상대','마기라스'),
    trainer('불 상대','리자몽',11,14,{play:'control',traits:['적극적인 교체']}),
    trainer('풀 상대','이상해꽃',10,16,{play:'endurance'}),
    trainer('땅 상대','한카리아스')
  ])
});
test('Showdown type table detects immunity, weakness and fourfold damage',()=>{
  assert.equal(typeEffectiveness('Electric',['Water']),2);
  assert.equal(typeEffectiveness('Electric',['Ground']),0);
  assert.equal(typeEffectiveness('Rock',['Fire','Flying']),4);
  assert.equal(typeEffectiveness('Ground',['Flying']),0);
});
test('opponent scouting uses all five rosters and 6 visible Pokémon per trainer',()=>{
  const {home,away}=fixture(),before=JSON.stringify([home,away]);
  const report=analyzeOpponent({home,away,playerClubId:0,season:2,round:3});
  assert.equal(report.opponents.length,5);
  assert.equal(report.ownTrainers.length,5);
  assert.equal(report.matches.length,5);
  assert.equal(report.opponents[0].pokemon.length,6);
  assert.equal(report.opponents[0].pokemon[0].types[0],'Water');
  assert.equal(report.opponents[0].pokemon[0].movesKnown,false);
  assert.equal(report.opponents[0].traits.includes('킬각 포착'),true);
  assert.equal(report.opponents[2].patterns.switch,true);
  assert.equal(new Set(report.recommendedOrder).size,5);
  assert.deepEqual([...report.recommendedOrder].sort(),[0,1,2,3,4]);
  assert.equal(JSON.stringify([home,away]),before,'scout must never alter battle rosters');
  assert.equal(report.engine,'showdown-scout');
});
test('recommendation respects the 5x5 opponent comparison and suggests real valid directives',()=>{
  const {home,away}=fixture(),report=analyzeOpponent({home,away,playerClubId:0});
  for(let i=0;i<5;i++){
    const suggestion=report.matches[i];
    assert.equal(suggestion.trainerIndex,report.recommendedOrder[i]);
    assert.equal(suggestion.opponentIndex,i);
    assert.ok(['balanced','offense','control','endurance','tempo'].includes(suggestion.plan));
    assert.ok(['kill','switch','matchup','preserve','pp','status','analysis'].includes(suggestion.behavior));
    assert.ok(suggestion.reason.length>=8);
  }
  const e=report.matrix[0][0];
  assert.ok(e.offense>1.3,'Pikachu attacks should pressure Blastoise water-type team');
  assert.ok(Number.isFinite(e.score));
  assert.ok(Array.isArray(report.typeDistribution));
});
test('maximum assignment is deterministic and improves over deliberately reversed ordering',()=>{
  const matrix=Array.from({length:5},(_,i)=>Array.from({length:5},(_,j)=>({score:i===j?60:-60})));
  assert.deepEqual(recommendOrder(matrix),[0,1,2,3,4]);
  matrix[0][0].score=-60;matrix[1][0].score=100;
  matrix[1][1].score=-60;matrix[0][1].score=100;
  assert.deepEqual(recommendOrder(matrix),[1,0,2,3,4]);
});
test('analyzing away team retains player-perspective order, without mutating home team',()=>{
  const {home,away}=fixture();
  const report=analyzeOpponent({home,away,playerClubId:1});
  assert.equal(report.opponentId,0);
  assert.equal(report.opponents[0].name,'전기 전문가');
  assert.equal(report.ownTrainers[0].name,'물 상대');
  assert.equal(report.matches.length,5);
});
test('rejects missing starters, unknown species and wrong club ownership',()=>{
  let {home,away}=fixture();
  assert.throws(()=>analyzeOpponent({home,away,playerClubId:99}),/감독의 소속/);
  home.trainers[2]=null;
  assert.throws(()=>analyzeOpponent({home,away,playerClubId:0}),/트레이너 5명/);
  ({home,away}=fixture());
  home.trainers[0].pokemon[0].name='가짜 포켓몬';
  assert.throws(()=>analyzeOpponent({home,away,playerClubId:0}),/알 수 없는 포켓몬/);
});
test('scouting API returns report, respects HTTP methods and rejects invalid rosters',async()=>{
  const makeRes=()=>({statusCode:0,headers:{},setHeader(key,val){this.headers[key]=val;},
    end(body){this.body=JSON.parse(body);}});
  let res=makeRes();
  await handler({method:'GET'},res);
  assert.equal(res.statusCode,405);
  res=makeRes();
  await handler({method:'POST',body:{...fixture(),playerClubId:0}},res);
  assert.equal(res.statusCode,200);
  assert.equal(res.body.matches.length,5);
  assert.equal(res.headers['Cache-Control'],'no-store');
  res=makeRes();
  await handler({method:'POST',body:{}},res);
  assert.equal(res.statusCode,400);
  assert.ok(res.body.error);
});
