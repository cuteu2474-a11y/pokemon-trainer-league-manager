import test from 'node:test';
import assert from 'node:assert/strict';
import {createPokemonLeague} from '../src/league/pokemon-clubs.js';
import {generateClubTrainers,LOCAL_ICONS} from '../src/league/trainer-rosters.js';
import {startSeason,playSeason,advanceSeason,createFastMatchEngine} from '../src/league/season.js';
test('all forty clubs receive five distinct city-linked trainers',()=>{
  const league=createPokemonLeague(),clubs=league.divisions.flat();
  assert.equal(clubs.length,40);
  assert.equal(clubs.reduce((sum,c)=>sum+c.trainers.length,0),200);
  assert.equal(new Set(clubs.flatMap(c=>c.trainers.map(t=>t.id))).size,200);
  for(const club of clubs){
    assert.equal(club.trainers.length,5);
    assert.deepEqual(club.trainers.map(t=>t.role),['captain','ace','strategist','specialist','prospect']);
    assert.ok(club.trainers.every(t=>t.origin===club.city&&t.team.length===6));
    assert.ok(club.trainers.every(t=>t.tactics>=1&&t.tactics<=20&&t.switching>=1&&t.switching<=20));
    if(LOCAL_ICONS[club.city])assert.equal(club.trainers[0].name,LOCAL_ICONS[club.city][0]);
    assert.deepEqual(club.trainers.map(t=>({...t,team:[]})),generateClubTrainers(club));
  }
});
test('large-city squads have stronger average tactical skills without prohibiting village icons',()=>{
  const l=createPokemonLeague();
  const average=clubs=>clubs.flatMap(c=>c.trainers).reduce((s,t)=>s+t.tactics,0)/(clubs.length*5);
  assert.ok(average(l.divisions[0])>average(l.divisions[3]));
  const pallet=l.divisions[3].find(c=>c.city==='Pallet Town');
  assert.equal(pallet.trainers[0].name,'Blue');
});
test('promotion and relegation preserve original trainer identities',async()=>{
  const l=createPokemonLeague(),before=new Map(l.divisions.flat().map(c=>[c.id,c.trainers]));
  startSeason(l);await playSeason(l,createFastMatchEngine(()=>0.5));
  advanceSeason(l);
  for(const c of l.divisions.flat())assert.deepEqual(c.trainers,before.get(c.id));
});
