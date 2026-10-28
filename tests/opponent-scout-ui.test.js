import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {runInNewContext} from 'node:vm';
import {analyzeOpponent} from '../src/scouting/opponent-report.js';

const script=readFileSync(new URL('../assets/opponent-scout-ui.js',import.meta.url),'utf8');
const matchday=readFileSync(new URL('../assets/matchday.js',import.meta.url),'utf8');
const member=(name,species)=>({
  name,tactics:12,switching:11,autonomyAI:{preferredPlay:'balanced',playTraits:[]},
  pokemon:Array.from({length:6},()=>({name:species,level:50,power:100}))
});
function setup({fetchFail=false}={}){
  const home={id:0,name:'아군',trainers:[
    member('A','피카츄'),member('B','거북왕'),member('C','리자몽'),
    member('D','이상해꽃'),member('E','루카리오')]};
  const away={id:1,name:'상대',trainers:[
    member('물 상대','거북왕'),member('풀 상대','이상해꽃'),member('불 상대','리자몽'),
    member('땅 상대','한카리아스'),member('악 상대','마기라스')]};
  const g={season:1,round:0,clubs:[home,away],pendingMatch:{
    season:1,round:1,phase:'prepare',home:0,away:1,
    order:[0,1,2,3,4],plans:[null,null,null,null,null],
    behaviors:[null,null,null,null,null]
  }};
  let persists=0,repaints=0,calls=0,html='';
  const doc={head:{append(){}},createElement(tag){
    if(tag==='style')return {textContent:''};
    return {setAttribute(){},set innerHTML(value){html=value;},
      get innerHTML(){return html;},querySelector(){return null},
      querySelectorAll(){return []}};
  }};
  const ctx={
    document:doc,window:{},game:g,myClub:()=>home,
    persist:()=>{persists++},fetch:async(_url,req)=>{
      calls++;const payload=JSON.parse(req.body);
      if(fetchFail)return {ok:false,status:500,json:async()=>({error:'일시적인 분석 실패'})};
      return {ok:true,status:200,json:async()=>analyzeOpponent(payload)};
    }
  };
  ctx.window.MatchdayPreparation={pending:()=>g.pendingMatch,render:()=>{repaints++}};
  runInNewContext(script,ctx);
  const api=ctx.window.OpponentScoutUI;
  const anchor={insertAdjacentElement(_where,panel){html=panel.innerHTML;}};
  return {g,ctx,api,home,away,render:()=>{
    api.attach({querySelector:selector=>selector==='.md-top'?anchor:null},g.pendingMatch,home,away);
    return html;
  },state:()=>({persists,repaints,calls})};
}
test('preparation includes scout CTA but never automatically selects manager advice',()=>{
  const t=setup(),p=t.g.pendingMatch;
  const before=JSON.stringify(p);
  const ui=t.render();
  assert.match(ui,/상대 팀 분석하기/);
  assert.equal(JSON.stringify(p),before);
  assert.ok(t.api);
});
test('match preparation shows the scheduled home and away clubs, not always the player first',()=>{
  assert.match(matchday,/fixtureHeading=esc\(game\.clubs\[p\.home\]\.name\)/);
  assert.match(matchday,/<h1>\$\{fixtureHeading\}<\/h1>/);
});
test('scouting fetches real five-opponent report and keeps initial orders intact',async()=>{
  const t=setup(),p=t.g.pendingMatch,original=p.order.slice();
  assert.equal(await t.api.request(),true);
  assert.deepEqual(Array.from(p.order),original);
  assert.ok(p.scoutReport);
  assert.equal(p.scoutReport.opponents.length,5);
  assert.deepEqual(Array.from(p.scoutReport.selectedOrder),original);
  assert.equal(p.scoutReport.recommendedOrder,undefined);
  assert.equal(t.state().calls,1);
  const html=t.render();
  assert.match(html,/상대 팀 분석 완료/);
  assert.match(html,/현재 출전 순서별 전술 분석/);
  assert.match(html,/모든 전술 지시 적용/);
  assert.doesNotMatch(html,/추천 순서|md-scout-order/);
  assert.match(html,/상대 트레이너 5명 자세히 보기/);
  assert.match(html,/원치 않는 문자열 없음|포켓몬/);
});
test('manager can apply tactical advice without automatic lineup changes',async()=>{
  const t=setup(),p=t.g.pendingMatch;
  await t.api.request();
  const order=p.order.slice();
  const recommendations=p.scoutReport.matches;
  // An old programmatic attempt to apply recommended order must be ignored.
  p.plans[2]='tempo';p.behaviors[2]='pp';
  assert.equal(t.api.applyAdvice('order'),false);
  assert.deepEqual(Array.from(p.order),order);
  assert.equal(p.plans[2],'tempo');
  assert.equal(p.behaviors[2],'pp');
  assert.equal(t.api.applyAdvice('all'),true);
  for(const rec of recommendations){
    assert.equal(p.plans[rec.trainerIndex],rec.plan);
    assert.equal(p.behaviors[rec.trainerIndex],rec.behavior);
  }
  assert.deepEqual(Array.from(p.order),order);
});
test('changing the manager lineup invalidates old advice until reanalysis',async()=>{
  const t=setup(),p=t.g.pendingMatch;
  await t.api.request();
  p.order=[3,1,4,0,2];
  assert.equal(t.api.valid(p,t.away),false);
  assert.equal(t.api.applyAdvice('all'),false);
  assert.match(t.render(),/상대 팀 분석하기/);
  assert.equal(await t.api.request(),true);
  assert.deepEqual(Array.from(p.scoutReport.matches.map(m=>m.trainerIndex)),p.order);
  assert.equal(t.api.valid(p,t.away),true);
});
test('individual recommendation changes only one trainer and does not reshuffle squad',async()=>{
  const t=setup(),p=t.g.pendingMatch;
  await t.api.request();
  const initial=p.order.slice(),rec=p.scoutReport.matches[2];
  assert.equal(t.api.applyAdvice('one',rec.trainerIndex),true);
  assert.deepEqual(Array.from(p.order),initial);
  assert.equal(p.plans[rec.trainerIndex],rec.plan);
  assert.equal(p.behaviors[rec.trainerIndex],rec.behavior);
  assert.equal(p.plans.filter(Boolean).length,1);
});
test('failed scouting shows error but leaves previous tactics intact',async()=>{
  const t=setup({fetchFail:true}),p=t.g.pendingMatch;
  p.plans[0]='offense';p.behaviors[0]='kill';
  assert.equal(await t.api.request(),false);
  assert.equal(p.scoutReport,undefined);
  assert.equal(p.plans[0],'offense');
  assert.match(p.scoutMessage,/분석에 실패/);
  assert.equal(t.state().calls,1);
});
test('match started before scouting response cannot receive new suggestions',async()=>{
  const t=setup(),p=t.g.pendingMatch;
  const actual=t.ctx.fetch;
  let release;
  t.ctx.fetch=()=>new Promise(resolve=>{release=()=>actual('/api/opponent-scout',{
    body:JSON.stringify({home:t.home,away:t.away,playerClubId:0,season:1,round:1})
  }).then(resolve);});
  const pending=t.api.request();
  p.phase='running';
  release();
  assert.equal(await pending,false);
  assert.equal(p.scoutReport,undefined);
  assert.equal(t.api.applyAdvice('all'),false);
});
