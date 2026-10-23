import test from 'node:test';
import assert from 'node:assert/strict';
import {createPokemonLeague} from '../src/league/pokemon-clubs.js';
import {SIGNATURES} from '../src/league/pokemon-rosters.js';
import {packGPTeam} from '../src/battle/gp-battle-stream.js';
test('all 1200 Pokemon are populated with valid Showdown and GP data',()=>{
  const league=createPokemonLeague();
  const clubs=league.divisions.flat();
  assert.equal(clubs.length,40);
  let total=0;
  for(const club of clubs)for(const trainer of club.trainers){
    assert.equal(trainer.team.length,6);
    assert.equal(new Set(trainer.team.map(p=>p.species)).size,6);
    assert.ok(packGPTeam(trainer.team).length>0);
    total+=trainer.team.length;
  }
  assert.equal(total,1200);
});
test('icon trainers receive signature partners and big clubs have higher average CA',()=>{
  const clubs=createPokemonLeague().divisions.flat();
  for(const club of clubs){
    const captain=club.trainers[0];
    if(SIGNATURES[captain.name])assert.equal(captain.team[0].species,SIGNATURES[captain.name]);
  }
  const average=clubs=>clubs.flatMap(c=>c.trainers.flatMap(t=>t.team)).reduce((s,p)=>s+p.ca,0)/(clubs.length*30);
  assert.ok(average(clubs.slice(0,10))>average(clubs.slice(30)));
});
