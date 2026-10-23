import test from 'node:test';
import assert from 'node:assert/strict';
import {showdownLeagueMatch} from '../src/league/season.js';

test('league adapter converts a real five-trainer relay into a score',{timeout:30000},async()=>{
  const gp={hp:94,atk:0,def:31,spa:94,spd:0,spe:94};
  const trainer=(species,moves)=>({tactics:10,switching:10,team:Array.from({length:6},(_,i)=>({
    name:species+i,species,level:50,nature:'Hardy',moves,ca:200,pa:200,gp:{...gp},
  }))});
  const home={id:'home',trainers:Array.from({length:5},()=>trainer('Mewtwo',['psychic','thunderbolt']))};
  const away={id:'away',trainers:Array.from({length:5},()=>trainer('Magikarp',['splash','tackle']))};
  const result=await showdownLeagueMatch(home,away,{seed:[1,2,3,4]});
  assert.equal(result.homeScore,5);
  assert.equal(result.awayScore,0);
  assert.equal(result.details.winner,'A');
});
