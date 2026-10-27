import {LEAGUE_RULES} from '../core/league-rules.js';
import {recoverRelay} from './relay-state.js';
import {simulateSixVsSix} from './showdown.js';

/** Relay format: the victorious trainer keeps surviving Pokemon against the next trainer. */
export async function simulateClubMatch(clubA, clubB, {seed, maxBattles = LEAGUE_RULES.maxDuels,maxTurns=LEAGUE_RULES.maxTurns} = {}) {
  for (const [name, club] of [['A', clubA], ['B', clubB]]) {
    if (!Array.isArray(club) || club.length !== 5 || club.some(t => !Array.isArray(t?.team) || t.team.length !== 6)) {
      throw new RangeError(`Club ${name} must contain five trainers with six Pokemon each`);
    }
  }
  if(!Number.isInteger(maxBattles)||maxBattles<1||maxBattles>LEAGUE_RULES.maxDuels)throw new RangeError('주자 대결은 최대 9회입니다.');
  let a = 0, b = 0, carryA = null, carryB = null;
  let teamA = clubA[0].team, teamB = clubB[0].team;
  const rounds = [];
  while (a < 5 && b < 5) {
    if (rounds.length >= maxBattles) throw new Error('Club match exceeded maximum battles');
    const result = await simulateSixVsSix(teamA, teamB, {
      ...(seed ? {seed: seed.map((v,i) => (v + rounds.length * 65537 + i) >>> 0)} : {}),
      carry: {p1: carryA, p2: carryB},maxTurns,
      trainerA: {...clubA[a],relayOpponentsRemaining:5-b},
      trainerB: {...clubB[b],relayOpponentsRemaining:5-a},
    });
    const victor = result.winner === 'Club A' ? 'A' : result.winner === 'Club B' ? 'B' : 'tie';
    rounds.push({trainerA: a, trainerB: b, winner: victor, pokemonOrder:{p1:teamA.map(mon=>mon.name),p2:teamB.map(mon=>mon.name)}, result});
    if (victor === 'A') {
      b++;
      if(b<5&&!result.finalState.p1.some(mon=>mon.hp>0)){
        rounds.at(-1).exhausted='A';a++;carryA=carryB=null;teamA=a<5?clubA[a].team:null;teamB=clubB[b].team;continue;
      }
      const paired = teamA.map((entry, i) => ({entry, state: recoverRelay(result.finalState.p1)[i]}))
        .sort((x, y) => Number(y.state.hp > 0) - Number(x.state.hp > 0));
      teamA = paired.map(x => x.entry);
      carryA = paired.map(x => x.state);
      teamB = b < 5 ? clubB[b].team : null;
      carryB = null;
    } else if (victor === 'B') {
      a++;
      if(a<5&&!result.finalState.p2.some(mon=>mon.hp>0)){
        rounds.at(-1).exhausted='B';b++;carryA=carryB=null;teamA=clubA[a].team;teamB=b<5?clubB[b].team:null;continue;
      }
      const paired = teamB.map((entry, i) => ({entry, state: recoverRelay(result.finalState.p2)[i]}))
        .sort((x, y) => Number(y.state.hp > 0) - Number(x.state.hp > 0));
      teamB = paired.map(x => x.entry);
      carryB = paired.map(x => x.state);
      teamA = a < 5 ? clubA[a].team : null;
      carryA = null;
    } else {
      a++;
      b++;
      carryA = carryB = null;
      teamA = a < 5 ? clubA[a].team : null;
      teamB = b < 5 ? clubB[b].team : null;
    }
  }
  return {rulesVersion:LEAGUE_RULES.version,winner: a === 5 && b === 5 ? 'tie' : a === 5 ? 'B' : 'A',
    trainersDefeated: {A:a, B:b}, rounds};
}
