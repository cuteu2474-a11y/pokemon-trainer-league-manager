import test from 'node:test';
import assert from 'node:assert/strict';
import {createPokemonLeague} from '../src/league/pokemon-clubs.js';
import {startSeason,playRound,standings,showdownLeagueMatch,createFastMatchEngine} from '../src/league/season.js';

test('real generated club relay completes and updates league standings', {timeout:120000},async()=>{
  const league=createPokemonLeague();
  startSeason(league);
  const fixture=league.current.fixtures[0][0][0];
  const fast=createFastMatchEngine(()=>0.5);
  let real=0;
  const results=await playRound(league,async(home,away,context)=>{
    if(context.division===1&&home.id===fixture.home&&away.id===fixture.away){
      real++;
      return showdownLeagueMatch(home,away,{seed:[1,2,3,4]});
    }
    return fast(home,away);
  });
  assert.equal(real,1);
  assert.equal(results.length,20);
  assert.equal(league.current.round,1);
  const actual=results.find(r=>r.home===fixture.home&&r.away===fixture.away);
  assert.ok(actual.details?.rounds.length>=1);
  assert.equal(actual.homeScore+actual.awayScore>=5,true);
  const table=standings(league.current,1);
  assert.equal(table.reduce((sum,row)=>sum+row.played,0),10);
  assert.equal(table.find(r=>r.id===fixture.home).for,actual.homeScore);
  assert.equal(table.find(r=>r.id===fixture.away).for,actual.awayScore);
});
