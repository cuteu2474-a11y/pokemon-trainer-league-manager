import test from 'node:test';
import assert from 'node:assert/strict';
import {SETTLEMENTS,clubScale,createPokemonLeague} from '../src/league/pokemon-clubs.js';
import {startSeason,playSeason,advanceSeason,standings,createFastMatchEngine} from '../src/league/season.js';
test('forty unique settlements seeded in descending size and appropriate financial bands',()=>{
  assert.equal(SETTLEMENTS.length,40);
  assert.equal(new Set(SETTLEMENTS.map(s=>s.name)).size,40);
  const l=createPokemonLeague();
  assert.deepEqual(l.divisions.map(d=>d.length),[10,10,10,10]);
  const clubs=l.divisions.flat();
  assert.ok(clubs.every((c,i)=>c.populationIndex===SETTLEMENTS[i].size));
  assert.ok(clubs.every((c,i)=>i===0||clubs[i-1].populationIndex>=c.populationIndex));
  assert.equal(clubs[0].tier,'mega');
  assert.equal(clubs.at(-1).tier,'tiny');
  assert.ok(clubs[0].budget>clubs.at(-1).budget);
  assert.ok(clubs[0].facilities>clubs.at(-1).facilities);
  assert.deepEqual(clubs.map(c=>c.id),createPokemonLeague().divisions.flat().map(c=>c.id));
});
test('generated league can finish and advance multiple AI seasons',async()=>{
  const l=createPokemonLeague();
  startSeason(l);
  const engine=createFastMatchEngine(()=>0.5);
  await playSeason(l,engine);
  assert.equal(l.current.results.length,360);
  const top=standings(l.current,1);
  assert.equal(top.length,10);
  assert.equal(advanceSeason(l).length,12);
  await playSeason(l,engine);
  assert.equal(l.season,2);
  assert.equal(l.current.results.length,360);
  assert.equal(advanceSeason(l).length,12);
  assert.equal(l.season,3);
  assert.equal(l.history.length,2);
});
test('size tiers cover the planned club bands',()=>{
  assert.deepEqual(['mega','large','medium','small','tiny'],[100,80,50,30,15].map(n=>clubScale(n).tier));
});
