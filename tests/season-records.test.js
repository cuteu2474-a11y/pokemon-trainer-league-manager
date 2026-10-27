import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {runInNewContext} from 'node:vm';

const source=readFileSync(new URL('../assets/season-records.js',import.meta.url),'utf8');
function fixture(){
 const clubs=Array.from({length:40},(_,i)=>({id:i,name:'구단'+i,division:Math.floor(i/10)}));
 clubs[0].name='내 구단';
 const game={club:'내 구단',season:1,round:2,clubs,results:[
  [{home:0,away:1,aScore:5,bScore:3,engine:'fast'},{home:2,away:3,aScore:5,bScore:0}],
  [{home:2,away:0,aScore:5,bScore:4,engine:'fast'},{home:5,away:6,aScore:5,bScore:1}]
 ],lastMatch:null};
 return game;
}
function setup(game=fixture(),withUi=false){
 let saves=0,settle=0,html='',next=0;
 const dashboard={
  querySelector:()=>null,
  insertAdjacentHTML:()=>{}
 };
 const select=()=>({onchange:null});
 const panel={get innerHTML(){return html;},set innerHTML(v){html=v;},querySelector:select};
 const document={querySelector:()=>dashboard,getElementById:()=>panel};
 const context={game,window:{},persist(){saves++;},startNewSeason(){
  settle++;context.game.season++;context.game.round=0;context.game.results=[];
 },renderOffice(){next++;},tab:'records',document:withUi?document:undefined};
 context.window.TrainerCareer={applyMatch(g,p){return p.report||null;}};
 context.window.LeagueStandings={table:(g,d)=>g.clubs.filter(c=>c.division===d).map((c,i)=>({id:c.id,name:c.name,rank:i+1,played:18,won:8,drawn:2,lost:8,points:26}))};
 runInNewContext(source,context);
 return {api:context.window.SeasonRecords,context,get saves(){return saves;},get settle(){return settle;},get html(){return html;},get next(){return next;}};
}
function realReport(season=1,round=1){
 const key=[season,round,0,1].join(':');
 return {key,season,round,participants:[
  {id:'trainer:one',clubId:0,name:'동명이인',slot:0,duels:5,wins:5,losses:0},
  {id:'trainer:two',clubId:0,name:'동명이인',slot:1,duels:0,wins:0,losses:0},
  {id:'trainer:foe',clubId:1,name:'상대',slot:0,duels:5,wins:0,losses:5}
 ]};
}

test('season archives only the player matches with stable round/club keys',()=>{
 const g=fixture(),s=setup(g),before=JSON.stringify(g.results);
 assert.equal(s.api.sync(g),true);
 assert.equal(s.api.sync(g),false);
 assert.deepEqual(Array.from(s.api.season(g).matches,m=>m.id),['1:1:0:1','1:2:2:0']);
 assert.equal(JSON.stringify(g.results),before);
 assert.equal(s.api.season(g).matches[0].homeName,'내 구단');
});
test('actual Showdown event records only participants with real duels, never the unused registration',()=>{
 const g=fixture(),s=setup(g),r=realReport();s.api.sync(g);
 assert.equal(s.api.capture(g,{season:1},r),true);
 assert.equal(s.api.capture(g,{season:1},r),false);
 const rows=s.api.trainerStats(g,1);
 assert.equal(rows.length,1);assert.equal(rows[0].id,'trainer:one');
 assert.deepEqual([rows[0].matches,rows[0].duels,rows[0].wins,rows[0].allKills],[1,5,5,1]);
 assert.equal(s.api.season(g).matches[0].engine,'showdown');
});
test('real battle report survives save/restore and a later trainer transfer, without guessing past roster',()=>{
 const g=fixture(),s=setup(g);s.api.capture(g,{season:1},realReport());
 const restored=JSON.parse(JSON.stringify(g));
 restored.clubs[0].name='새 이름';restored.clubs[1].name='이전 소속';
 const api=setup(restored).api;
 assert.equal(api.trainerStats(restored,1)[0].name,'동명이인');
 assert.equal(api.season(restored).matches[0].homeName,'내 구단');
 assert.equal(api.sync(restored),false);
});
test('season transition captures all played matches before results are cleared',()=>{
 const g=fixture(),s=setup(g);s.context.startNewSeason();
 assert.equal(s.settle,1);assert.equal(g.season,2);
 const past=s.api.season(g,1);assert.equal(past.matches.length,2);assert.equal(past.complete,true);
 assert.equal(s.api.season(g,2).matches.length,0);
 assert.ok(s.saves>0);
});
test('saved standings from previous years remain queryable with movement, without re-ranking old clubs',()=>{
 const g=fixture(),s=setup(g);s.api.sync(g);
 g.leagueSeasons={1:{tables:Array.from({length:4},(_,d)=>[
  {id:d*10,name:'기록 '+d,rank:1,played:18,won:13,drawn:1,lost:4,points:40}
 ]),movement:[{id:10,from:1,to:0}]}};
 g.season=2;g.results=[];
 const page=s.api.html(g,1,1);
 assert.match(page,/기록 1/);assert.match(page,/승격/);assert.match(page,/1R/);
 assert.equal(s.api.historicalTables(g,1),g.leagueSeasons[1]);
});
test('the record viewer escapes club names and never invents trainer statistics for fast matches',()=>{
 const g=fixture();g.clubs[1].name='<img onerror="bad()">';
 const s=setup(g),page=s.api.html(g,1,0);
 assert.doesNotMatch(page,/<img/);assert.match(page,/&lt;img/);
 assert.match(page,/실제 출전 기록 없음/);
 assert.match(page,/임의로 선수 기록을 만들지 않았습니다/);
});
test('renderer makes past and current season selectable without blocking other tabs',()=>{
 const g=fixture(),s=setup(g,true);s.api.sync(g);s.context.renderOffice();
 assert.match(s.html,/시즌 기록실/);assert.match(s.html,/시즌/);
 s.context.tab='home';s.context.renderOffice();assert.equal(s.next,2);
});
test('real career match hook carries actual appearances into a single committed save',()=>{
 const g=fixture(),s=setup(g),report=realReport();
 s.context.window.TrainerCareer.applyMatch(g,{season:1,report});
 s.context.persist();
 assert.equal(s.api.trainerStats(g,1).length,1);
 assert.equal(s.api.season(g,1).matches.filter(x=>x.trainers.length>0).length,1);
});
