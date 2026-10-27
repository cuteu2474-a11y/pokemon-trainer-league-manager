import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {runInNewContext} from 'node:vm';
import {createLottery,rankStandings,fastClubScore,STANDINGS_RULES} from '../src/core/standings.js';
import {ensureRanking,webStandings,archiveStandings} from '../src/league/web-standings.js';
import {createLeague,startSeason,standings,advanceSeason} from '../src/league/season.js';
const row=id=>({id,name:id,played:18,points:18,won:4,drawn:6,lost:8,for:30,against:30});
const fixture=(home,away,homeScore,awayScore,round=1)=>({home,away,homeScore,awayScore,round});
const rank=(rows,results=[],lottery=rows.map(r=>r.id))=>rankStandings(rows,{results,lottery});
function game(){return {seed:9191,season:1,round:0,week:1,clubs:Array.from({length:40},(_,id)=>({id:String(id),name:'구단'+id,division:Math.floor(id/10),points:0,w:0,d:0,l:0,gf:0,ga:0})),results:[]};}
test('points, overall difference, scored defeats and wins precede head-to-head',()=>{
 const rows=[row('A'),row('B')],loss=[fixture('B','A',5,0)];
 for(const changes of [{points:19},{for:31},{for:31,against:31},{won:5}]){
  const a={...rows[0],...changes};assert.equal(rank([rows[1],a],loss,['B','A'])[0].id,'A');
 }
});
test('head-to-head uses only the primary tied group, includes both venues, and ignores duplicate fixtures',()=>{
 const rows=[row('A'),row('B'),{...row('C'),points:40}];
 const matches=[fixture('A','B',5,1),fixture('B','A',5,0,10),fixture('A','C',5,0,2),fixture('C','B',5,0,2)];
 const before=JSON.stringify({rows,matches});
 const ranked=rank(rows,[...matches,matches[0]],['A','B','C']);
 assert.deepEqual(ranked.map(r=>r.id),['C','B','A']);
 assert.equal(ranked[1].ranking.headToHead.points,3);assert.equal(ranked[1].ranking.headToHead.played,2);assert.equal(ranked[1].ranking.headToHead.for-ranked[1].ranking.headToHead.against,1);
 assert.equal(JSON.stringify({rows,matches}),before);
});
test('multi-club ties do not recursively re-evaluate the remaining two clubs',()=>{
 const matches=[fixture('A','B',5,3),fixture('A','C',5,4,2),fixture('C','A',5,0,11),fixture('B','C',5,2,3)];
 const ranked=rank(['A','B','C'].map(row),matches,['C','B','A']);
 assert.deepEqual(ranked.map(r=>r.id),['A','C','B']); // B beat C directly; original three-team mini-table still governs.
 assert.deepEqual(ranked.map(r=>r.ranking.headToHead.points),[6,3,3]);
 assert.equal(ranked[1].ranking.headToHead.for-ranked[1].ranking.headToHead.against,1);
});
test('lottery is deterministic, independent of list order, and is the final nonalphabetical tie breaker',()=>{
 const ids=['A','B','C','D','E'];assert.deepEqual(createLottery(ids,{seed:3,season:1}),createLottery([...ids].reverse(),{seed:3,season:1}));
 assert.deepEqual(rank(ids.map(row),[],['E','D','C','B','A']).map(r=>r.id),['E','D','C','B','A']);
 assert.throws(()=>rank([row('A'),row('B')],[],['A','A']),/추첨/);
 assert.throws(()=>rank([row('A'),row('A')],[],['A']),/추첨/);
});
test('web migration saves its lottery without changing scores, game RNG or round; reloads never redraw',()=>{
 const g=game();g.round=7;g.clubs[0].points=12;const before=JSON.stringify({seed:g.seed,round:g.round,clubs:g.clubs});
 const state=ensureRanking(g);assert.equal(state.migrated,true);assert.equal(state.createdAtRound,7);
 assert.equal(JSON.stringify({seed:g.seed,round:g.round,clubs:g.clubs}),before);
 const saved=JSON.stringify(state);g.seed=555;const reloaded=JSON.parse(JSON.stringify(g));ensureRanking(reloaded);assert.equal(JSON.stringify(reloaded.leagueRanking),saved);
});
test('web and separate league rank the same tied records and retain final lottery across promotion',()=>{
 const g=game();ensureRanking(g);g.round=18;
 const divisions=[0,1,2,3].map(d=>g.clubs.filter(c=>c.division===d).map(c=>({id:c.id,name:c.name})));
 const league=createLeague(divisions);startSeason(league);league.current.round=18;league.current.ranking.lotteries=structuredClone(g.leagueRanking.lotteries);
 for(let d=0;d<4;d++)for(const c of g.clubs.filter(c=>c.division===d)){
  const r=row(c.id);Object.assign(league.current.tables[d][c.id],r);Object.assign(c,{points:r.points,w:r.won,d:r.drawn,l:r.lost,gf:r.for,ga:r.against});
 }
 const results=[fixture('0','1',5,1),fixture('1','0',5,0,10)];league.current.results=results.map(m=>({...m,division:1}));g.results=Array.from({length:10},()=>[]);for(const m of results)g.results[m.round-1].push({home:m.home,away:m.away,aScore:m.homeScore,bScore:m.awayScore});
 for(let d=0;d<4;d++)assert.deepEqual(webStandings(g,d).map(r=>r.id),standings(league.current,d+1).map(r=>r.id));
 const archive=archiveStandings(g);assert.equal(archiveStandings(g),archive);const movement=advanceSeason(league);
 assert.deepEqual(league.history[0].ranking.lotteries,g.leagueRanking.lotteries);
 assert.deepEqual(movement.map(m=>[m.id,m.from-1,m.to-1]).sort(),archive.movement.map(m=>[m.id,m.from,m.to]).sort());
});
test('actual web season transition uses displayed rankings for all twelve promotion/relegation places',()=>{
 const g=game();ensureRanking(g);g.round=18;g.week=30;g.seasonSettled=true;g.calendarHistory=[];g.log=[];g.coins=0;
 const original=g.clubs.map(c=>({id:c.id,division:c.division})),expected=[0,1,2,3].map(d=>webStandings(g,d));
 const text=readFileSync(new URL('../index.html',import.meta.url),'utf8');
 const start=text.indexOf('function startNewSeason(){\n initCalendar();'),end=text.indexOf('const scheduledPlayNext',start);
 const ctx={window:{ClubFinance:{beforeAdvance(){},closeSeason(){}}},game:g,initCalendar(){},myClub:()=>g.clubs[0],ALL_CLUBS:[0,1,2,3],mkSchedule:ids=>ids,rankedDivision:(_,d)=>webStandings(g,d).map(r=>g.clubs.find(c=>c.id===r.id)),persist(){ensureRanking(g);},renderOffice(){}};
 ctx.window.LeagueStandings={closeSeason:()=>archiveStandings(g)};ctx.LeagueStandings=ctx.window.LeagueStandings;ctx.ClubFinance=ctx.window.ClubFinance;
 runInNewContext(text.slice(start,end)+'startNewSeason();',ctx);
 assert.equal(g.season,2);assert.equal(g.round,0);assert.equal(g.leagueRanking.season,2);assert.equal(g.leagueSeasons[1].movement.length,12);
 for(let d=0;d<4;d++)for(const r of expected[d]){const target=r.rank<=2&&d>0?d-1:r.rank>=9&&d<3?d+1:d;assert.equal(g.clubs.find(c=>c.id===r.id).division,target);}
 assert.equal(original.filter(c=>g.clubs.find(x=>x.id===c.id).division!==c.division).length,12);
 assert.ok(g.clubs.every(c=>c.points===0&&c.w===0&&c.gf===0));
});
test('fast score semantics match KOF win and draw bounds and reject invalid random values',()=>{
 assert.deepEqual(fastClubScore(100,100,()=>.01),{homeScore:5,awayScore:5});
 const values=[.3,.8];assert.deepEqual(fastClubScore(100,100,()=>values.shift()),{homeScore:5,awayScore:4});
 const away=[.9,.4];assert.deepEqual(fastClubScore(100,100,()=>away.shift()),{homeScore:2,awayScore:5});
 assert.throws(()=>fastClubScore(100,100,()=>1),/난수/);
});

test('web UI publishes the fixed lottery, switches divisions and keeps the existing save guard',()=>{
 const g=game();let html='',saveCount=0,fail=false;const select={};
 const panel={get innerHTML(){return html;},set innerHTML(v){html=v;},querySelector:()=>select};
 const ctx={game:g,tab:'league',selected:null,STANDINGS_RULES,fastClubScore,ensureRanking,webStandings,archiveStandings,
  escapeHTML:String,myClub:()=>ctx.game.clubs[0],freshGame:()=>game(),persist(){if(fail)throw Error('stale save');saveCount++;},renderOffice(){},
  document:{getElementById:()=>panel,createElement:()=>({}),head:{append(){}}}};ctx.window=ctx;
 const source=readFileSync(new URL('../assets/league-ui.js',import.meta.url),'utf8').replace(/^import .*;\n/gm,'');runInNewContext(source,ctx);
 assert.match(html,/공개 추첨 순서/);assert.match(html,/동률 전적/);assert.ok(saveCount>0);
 select.onchange({target:{value:'3'}});assert.match(html,/구단39/);
 const before=JSON.stringify(g.leagueRanking.lotteries);g.seed=100000;ctx.persist();assert.equal(JSON.stringify(g.leagueRanking.lotteries),before);
 const fresh=ctx.freshGame();assert.equal(fresh.leagueRanking.season,1);
 fail=true;assert.throws(()=>ctx.persist(),/stale save/);
});
