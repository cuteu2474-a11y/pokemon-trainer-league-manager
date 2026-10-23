import test from 'node:test';
import assert from 'node:assert/strict';
import {createLeague,generateSchedule,startSeason,playRound,playSeason,standings,advanceSeason,createFastMatchEngine} from '../src/league/season.js';

const league=()=>createLeague(Array.from({length:4},(_,d)=>
  Array.from({length:10},(_,i)=>({id:`d${d+1}c${i+1}`,name:`Club ${d+1}-${i+1}`,rating:100+i}))));
const deterministic=async(home,away)=>({homeScore:home.id.endsWith('1')?5:3,awayScore:home.id.endsWith('1')?0:2});
test('18 rounds provide exactly one home and one away fixture per opponent',()=>{
  const ids=Array.from({length:10},(_,i)=>String(i));
  const schedule=generateSchedule(ids);
  assert.equal(schedule.length,18);
  const seen=new Set();
  for(const round of schedule) {
    assert.equal(round.length,5);
    assert.equal(new Set(round.flatMap(f=>[f.home,f.away])).size,10);
    for(const {home,away} of round) {
      assert.notEqual(home,away);seen.add(`${home}:${away}`);
    }
  }
  assert.equal(seen.size,90);
});
test('four divisions play 18 rounds with standings and complete results',async()=>{
  const l=league();startSeason(l);
  await playSeason(l,deterministic);
  assert.equal(l.current.round,18);
  assert.equal(l.current.results.length,360);
  for(let d=1;d<=4;d++) {
    const rows=standings(l.current,d);
    assert.equal(rows.length,10);
    assert.ok(rows.every(r=>r.played===18));
    assert.equal(rows.reduce((s,r)=>s+r.won,0),rows.reduce((s,r)=>s+r.lost,0));
    assert.equal(rows.reduce((s,r)=>s+r.for,0),rows.reduce((s,r)=>s+r.against,0));
    assert.ok(rows.every((r,i)=>r.rank===i+1));
  }
});
test('promote and relegate two clubs at each boundary then reset new season',async()=>{
  const l=league();startSeason(l);await playSeason(l,deterministic);
  const old=l.divisions.map(clubs=>clubs.map(c=>c.id));
  const ranks=Array.from({length:4},(_,i)=>standings(l.current,i+1));
  const movement=advanceSeason(l);
  assert.equal(movement.length,12);
  assert.equal(l.season,2);assert.equal(l.current.round,0);
  assert.equal(l.history.length,1);assert.equal(l.history[0].results.length,360);
  for(let i=0;i<4;i++) {
    assert.equal(l.divisions[i].length,10);
    if(i<3)for(const row of ranks[i+1].slice(0,2)) assert.ok(l.divisions[i].some(c=>c.id===row.id));
    if(i>0)for(const row of ranks[i-1].slice(8)) assert.ok(l.divisions[i].some(c=>c.id===row.id));
  }
  assert.deepEqual(new Set(l.divisions.flat().map(c=>c.id)),new Set(old.flat()));
  await playRound(l,deterministic);
  assert.equal(l.current.round,1);
  assert.equal(l.current.results.length,20);
});
test('match failures cannot partially commit a round',async()=>{
  const l=league();startSeason(l);
  let n=0;
  await assert.rejects(playRound(l,async()=>{if(++n===7)throw new Error('network');return {homeScore:5,awayScore:0};}));
  assert.equal(l.current.round,0);assert.equal(l.current.results.length,0);
  assert.ok(standings(l.current,1).every(r=>r.played===0));
});
test('fast AI match adapter returns valid results',async()=>{
  const match=createFastMatchEngine(()=>0.5);
  const r=await match({rating:100},{rating:100});
  assert.equal(r.homeScore,5);assert.ok(r.awayScore>=0&&r.awayScore<=4);
});
