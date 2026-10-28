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
 assert.ok(news.some(n=>n.kind==='match'&&n.title.includes('구름시티')));
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
test('unconfirmed scores are excluded but league-wide completed scores remain visible',()=>{
 const g=sample();g.results=[[{home:1,away:2},{home:1,away:2,aScore:null,bScore:null},{home:2,away:3,aScore:5,bScore:0}]];
 assert.equal(build(g,a).filter(n=>n.kind==='match').length,1);
});

test('player and AI manager appointments are sourced from actual named contracts',()=>{
 const g=sample();g.manager='주감독';g.managerProfile={appointedSeason:1};
 g.clubs[1].aiManager={name:'김감독',coachCareer:{id:'coach:2:1',appointedSeason:2}};
 const n=build(g,a);
 assert.ok(n.some(x=>x.kind==='coach'&&x.subtype==='appointment'&&x.title.includes('주감독')));
 assert.ok(n.some(x=>x.kind==='coach'&&x.title.includes('김감독')));
});
test('AI manager dismissal is separate from successor appointment',()=>{
 const g=sample();
 g.clubs[1].aiCoachHistory=[{id:'coach:2:1',name:'최감독',leftSeason:2}];
 g.clubs[1].aiCoachDecisions=[{season:2,status:'감독 경질',detail:'최감독 감독 경질'}];
 g.clubs[1].aiManager={name:'윤감독',coachCareer:{id:'coach:2:2',appointedSeason:3}};
 const n=build(g,a);
 assert.equal(n.filter(x=>x.subtype==='dismissal').length,1);
 assert.ok(n.some(x=>x.title.includes('최감독')));
 assert.ok(!n.some(x=>x.title.includes('윤감독')));
});
test('trainer and pokemon retirements show without duplicates',()=>{
 const g=sample();
 g.retiredTrainers=[{season:2,club:'구름시티',trainer:{name:'민준'},pokemonCount:6}];
 g.trainerRetirementHistory=[{season:2,club:'구름시티',name:'민준'}];
 g.retiredPokemon=[{season:2,club:'구름시티',trainer:'수연',name:'이브이',uid:'eve1',reason:'활동 기간 만료'},
  {season:2,club:'구름시티',trainer:'민준',name:'피카츄',uid:'pika1',reason:'담당 트레이너 은퇴'}];
 const n=build(g,a).filter(x=>x.kind==='retirement');
 assert.equal(n.length,2);
 assert.ok(n.some(x=>x.title.includes('민준')));
 assert.ok(n.some(x=>x.title.includes('이브이')));
});
test('SNS posts are derived from real news and never invent reaction totals',()=>{
 const g=sample();g.manager='주감독';
 const news=build(g,a),posts=globalThis.PentaNewsFeed.buildSocial(news);
 assert.ok(posts.length>0);
 assert.ok(posts.some(x=>x.kind==='coach'));
 assert.ok(posts.every(x=>news.some(e=>e.id===x.sourceId)));
 assert.ok(posts.every(x=>!('likeCount' in x)));
});

test('retirement archival and coach dismissal never become duplicate SNS announcements',()=>{
 const g=sample();g.clubs[1].aiCoachHistory=[{name:'구감독',id:'past',leftSeason:2}];
 g.clubs[1].aiCoachDecisions=[{season:2,status:'감독 경질',detail:'구감독 후임 결정'}];
 g.retiredTrainers=[{season:2,club:'금빛시티',trainer:{name:'도감독'}}];
 g.trainerRetirementHistory=[{season:2,club:'금빛시티',name:'도감독'}];
 const news=build(g,a),social=globalThis.PentaNewsFeed.buildSocial(news);
 assert.equal(news.filter(x=>x.subtype==='dismissal').length,1);
 assert.equal(news.filter(x=>x.subtype==='trainer').length,1);
 assert.equal(social.filter(x=>x.sourceId===news.find(y=>y.subtype==='dismissal').id).length,1);
});
