import test from 'node:test';
import assert from 'node:assert/strict';
import '../assets/penta-news-data.js';

const build=globalThis.PentaNewsFeed.build;
const a={id:1,name:'구름시티',division:0},b={id:2,name:'금빛시티',division:0},c={id:3,name:'노랑시티',division:1};
const sample=()=>({
 clubs:[a,b,c],club:a.name,season:2,week:6,
 results:[[{home:1,away:2,aScore:5,bScore:3},{home:1,away:3,aScore:2,bScore:5}]],
 transferHistory:[{season:2,week:6,name:'테스트 트레이너',type:'자유계약 영입',from:'금빛시티',to:'구름시티'}],
 log:['테스트 트레이너 자유계약 영입 · 포켓몬 6마리','구름시티 리그 우승','오늘 급여 정산','구름시티 리그 우승']
});
test('news is made from verified results and transfers without invented articles',()=>{
 const news=build(sample(),a);
 assert.equal(news.filter(n=>n.kind==='match').length,1);
 assert.match(news[0].title,/구름시티/);
 assert.equal(news.filter(n=>n.kind==='transfer').length,1);
 assert.equal(news.filter(n=>n.kind==='club').length,1);
 assert.ok(!news.some(n=>n.title.includes('급여 정산')));
 assert.ok(!news.some(n=>n.title.includes('테스트 트레이너 자유계약 영입')));
});
test('no results makes a genuinely empty feed',()=>{
 assert.deepEqual(build({clubs:[a],season:1,week:1,results:[],log:[]},a),[]);
});
test('completed draws, zero scores and transfer records are displayed',()=>{
 const g=sample();g.results=[[{home:1,away:2,aScore:0,bScore:0}]];
 const n=build(g,a);assert.match(n.find(x=>x.kind==='match').title,/무승부/);
 assert.match(n.find(x=>x.kind==='transfer').meta,/6주차/);
});
test('unconfirmed match results and out-of-division matches are excluded',()=>{
 const g=sample();g.results=[[{home:1,away:2},{home:1,away:2,aScore:null,bScore:null},{home:2,away:3,aScore:5,bScore:0}]];
 assert.equal(build(g,a).filter(n=>n.kind==='match').length,0);
});
