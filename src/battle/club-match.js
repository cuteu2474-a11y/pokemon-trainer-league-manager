import {simulateSixVsSix} from './showdown.js';

/** Relay format: the victorious trainer keeps surviving Pokemon against the next trainer. */
export async function simulateClubMatch(clubA, clubB, {seed, maxBattles = 9} = {}) {
  for (const [name, club] of [['A', clubA], ['B', clubB]]) {
    if (!Array.isArray(club) || club.length !== 5 || club.some(t => !Array.isArray(t?.team) || t.team.length !== 6)) {
      throw new RangeError(`Club ${name} must contain five trainers with six Pokemon each`);
    }
  }
  let a = 0, b = 0, carryA = null, carryB = null;
  const rounds = [];
  while (a < 5 && b < 5) {
    if (rounds.length >= maxBattles) throw new Error('Club match exceeded maximum battles');
    const result = await simulateSixVsSix(clubA[a].team, clubB[b].team, {
      ...(seed ? {seed: seed.map((v,i) => (v + rounds.length * 65537 + i) >>> 0)} : {}),
      carry: {p1: carryA, p2: carryB},
    });
    const victor = result.winner === 'Club A' ? 'A' : result.winner === 'Club B' ? 'B' : 'tie';
    rounds.push({trainerA: a, trainerB: b, winner: victor, result});
    const recover = state => state.map(mon => ({
      ...mon,
      hp: mon.hp > 0 ? Math.min(mon.maxhp, mon.hp + Math.floor(mon.maxhp * 0.1)) : 0,
      pp: [...mon.pp],
    }));
    if (victor === 'A') {
      b++;
      carryA = recover(result.finalState.p1);
      carryB = null;
    } else if (victor === 'B') {
      a++;
      carryB = recover(result.finalState.p2);
      carryA = null;
    } else {
      a++;
      b++;
      carryA = carryB = null;
    }
  }
  return {winner: a === 5 && b === 5 ? 'tie' : a === 5 ? 'B' : 'A',
    trainersDefeated: {A:a, B:b}, rounds};
}
