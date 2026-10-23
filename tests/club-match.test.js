import test from 'node:test';
import assert from 'node:assert/strict';
import {simulateSixVsSix} from '../src/battle/showdown.js';
import {simulateClubMatch} from '../src/battle/club-match.js';

const gp = {hp:94,atk:0,def:31,spa:94,spd:0,spe:94};
const makeTeam = (species, moves) => Array.from({length:6}, (_,i) => ({
  name: species + (i+1), species, level:50, nature:'Hardy',
  moves, ca:200, pa:200, gp:{...gp},
}));
const strong = () => makeTeam('Mewtwo', ['psychic','thunderbolt','icebeam','shadowball']);
const weak = () => makeTeam('Magikarp', ['tackle','flail','splash']);

test('carried HP, PP, status and fainting are applied before next battle', {timeout:30000}, async () => {
  const baseline = await simulateSixVsSix(strong(), weak(), {seed:[1,2,3,4]});
  const carried = baseline.finalState.p1.map((mon,i) => ({
    ...mon, hp:i === 5 ? 0 : Math.max(1,mon.maxhp-15),
    status:i === 0 ? 'brn' : '', pp:mon.pp.map((v,j)=>j===0 ? 1 : v),
  }));
  const result = await simulateSixVsSix(strong(), weak(), {seed:[4,3,2,1], carry:{p1:carried}});
  assert.equal(result.initialStats.p1[0].hp, carried[0].hp);
  assert.equal(result.initialStats.p1[0].status, 'brn');
  assert.equal(result.initialStats.p1[0].pp[0], 1);
  assert.equal(result.initialStats.p1[5].hp, 0);
  assert.equal(result.winner, 'Club A');
});

test('five-trainer relay preserves PP and recovers 10 percent HP only for survivors', {timeout:30000}, async () => {
  const result = await simulateClubMatch(
    Array.from({length:5}, () => ({team:strong()})),
    Array.from({length:5}, () => ({team:weak()})),
    {seed:[1,2,3,4]},
  );
  assert.equal(result.winner, 'A');
  assert.equal(result.rounds.length, 5);
  assert.deepEqual(result.trainersDefeated, {A:0,B:5});
  const first = result.rounds[0].result.finalState.p1;
  const second = result.rounds[1].result.initialStats.p1;
  const alive = first.map((state,i)=>({state,i})).filter(x=>x.state.hp>0);
  for (let i=0;i<alive.length;i++) {
    const previous = alive[i].state;
    assert.equal(second[i].hp, Math.min(previous.maxhp,previous.hp+Math.floor(previous.maxhp*0.1)));
    assert.deepEqual(second[i].pp,previous.pp);
    assert.equal(second[i].status,previous.status);
  }
});
