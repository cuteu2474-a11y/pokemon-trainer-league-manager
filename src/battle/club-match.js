import {LEAGUE_RULES} from '../core/league-rules.js';
import {recoverRelay} from './relay-state.js';
import {simulateSixVsSix} from './showdown.js';

/** Validate each carry before recording the next duel: no silent HP, PP,
 * status, item, form or Pokémon identity loss after reordering survivors. */
export function verifyRelayHandoff(expected,initial,side='p1'){
  if(!Array.isArray(expected)||!Array.isArray(initial)||
     expected.length!==6||initial.length!==6)
    throw new Error('Relay handoff team size mismatch ('+side+')');
  const seen=new Set();
  for(let i=0;i<expected.length;i++){
    const before=expected[i],after=initial[i];
    if(!before||!after||String(before.pokemonId)!==String(after.pokemonId)||
      seen.has(String(after.pokemonId)))
      throw new Error('Relay handoff Pokemon identity mismatch ('+side+' slot '+i+')');
    seen.add(String(after.pokemonId));
    for(const field of ['hp','maxhp','status','item','form','lastItem',
      'ateBerry','bondTriggered','protectionBusted','terastallized']){
      if(before[field]!==after[field])
        throw new Error('Relay handoff '+field+' mismatch ('+side+' slot '+i+')');
    }
    for(const field of ['statusData','stellarBoostedTypes']){
      if(JSON.stringify(before[field]??null)!==JSON.stringify(after[field]??null))
        throw new Error('Relay handoff '+field+' mismatch ('+side+' slot '+i+')');
    }
    if(!Array.isArray(before.pp)||!Array.isArray(after.pp)||
      before.pp.length!==after.pp.length||
      before.pp.some((pp,j)=>pp!==after.pp[j]))
      throw new Error('Relay handoff PP mismatch ('+side+' slot '+i+')');
    if(!Array.isArray(before.moves)||!Array.isArray(after.moves)||
      before.moves.length!==after.moves.length||
      before.moves.some((move,j)=>move.id!==after.moves[j].id))
      throw new Error('Relay handoff move mismatch ('+side+' slot '+i+')');
  }
}

/** Assign unique, stable IDs to anonymous or same-named Pokémon in a relay.
 * Real Pokémon IDs remain untouched and source club rosters are not mutated. */
export function prepareRelayTeam(team,side,trainerIndex){
  if(!Array.isArray(team)||team.length!==6)
    throw new RangeError('Six Pokemon required for relay identity assignment');
  const seen=new Set();
  return team.map((mon,i)=>{
    const explicit=mon.pokemonId??mon.uid??mon.id;
    const validName=typeof mon.name==='string'&&mon.name.trim()&&
      team.filter(candidate=>candidate.name===mon.name).length===1;
    const id=explicit!==undefined&&explicit!==null&&String(explicit).trim()?
      String(explicit):validName?mon.name:'relay:'+side+':'+trainerIndex+':'+i;
    if(seen.has(id))throw new RangeError('Duplicate relay Pokemon ID in one trainer squad');
    seen.add(id);
    return {...mon,pokemonId:id,name:mon.name||mon.species};
  });
}

/** Relay format: the victorious trainer keeps surviving Pokemon against the next trainer. */
export async function simulateClubMatch(clubA, clubB, {seed, maxBattles = LEAGUE_RULES.maxDuels,maxTurns=LEAGUE_RULES.maxTurns} = {}) {
  for (const [name, club] of [['A', clubA], ['B', clubB]]) {
    if (!Array.isArray(club) || club.length !== 5 || club.some(t => !Array.isArray(t?.team) || t.team.length !== 6)) {
      throw new RangeError(`Club ${name} must contain five trainers with six Pokemon each`);
    }
  }
  if(!Number.isInteger(maxBattles)||maxBattles<1||maxBattles>LEAGUE_RULES.maxDuels)throw new RangeError('주자 대결은 최대 9회입니다.');
  let a = 0, b = 0, carryA = null, carryB = null;
  let teamA = prepareRelayTeam(clubA[0].team,'A',0), teamB = prepareRelayTeam(clubB[0].team,'B',0);
  const rounds = [];
  let enhancementsA=null,enhancementsB=null;
  while (a < 5 && b < 5) {
    if (rounds.length >= maxBattles) throw new Error('Club match exceeded maximum battles');
    const result = await simulateSixVsSix(teamA, teamB, {
      ...(seed ? {seed: seed.map((v,i) => (v + rounds.length * 65537 + i) >>> 0)} : {}),
      carry: {p1: carryA, p2: carryB,enhancements:{p1:enhancementsA,p2:enhancementsB}},maxTurns,
      enhancements:{p1:clubA[a].enhancement||{kind:'none'},p2:clubB[b].enhancement||{kind:'none'}},
      trainerA: {...clubA[a],relayOpponentsRemaining:5-b},
      trainerB: {...clubB[b],relayOpponentsRemaining:5-a},
    });
    if(carryA)verifyRelayHandoff(carryA,result.initialStats.p1,'A');
    if(carryB)verifyRelayHandoff(carryB,result.initialStats.p2,'B');
    enhancementsA=result.enhancements.p1;enhancementsB=result.enhancements.p2;
    const victor = result.winner === 'Club A' ? 'A' : result.winner === 'Club B' ? 'B' : 'tie';
    rounds.push({trainerA: a, trainerB: b, winner: victor, pokemonOrder:{p1:teamA.map(mon=>mon.name),p2:teamB.map(mon=>mon.name)}, result});
    if (victor === 'A') {
      b++;enhancementsB=null;
      if(b<5&&!result.finalState.p1.some(mon=>mon.hp>0)){
        rounds.at(-1).exhausted='A';a++;enhancementsA=enhancementsB=null;carryA=carryB=null;teamA=a<5?prepareRelayTeam(clubA[a].team,'A',a):null;teamB=prepareRelayTeam(clubB[b].team,'B',b);continue;
      }
      const paired = teamA.map((entry, i) => ({entry, state: recoverRelay(result.finalState.p1)[i]}))
        .sort((x, y) => Number(y.state.hp > 0) - Number(x.state.hp > 0));
      teamA = paired.map(x => x.entry);
      carryA = paired.map(x => x.state);
      teamB = b < 5 ? prepareRelayTeam(clubB[b].team,'B',b) : null;
      carryB = null;
    } else if (victor === 'B') {
      a++;enhancementsA=null;
      if(a<5&&!result.finalState.p2.some(mon=>mon.hp>0)){
        rounds.at(-1).exhausted='B';b++;enhancementsA=enhancementsB=null;carryA=carryB=null;teamA=prepareRelayTeam(clubA[a].team,'A',a);teamB=b<5?prepareRelayTeam(clubB[b].team,'B',b):null;continue;
      }
      const paired = teamB.map((entry, i) => ({entry, state: recoverRelay(result.finalState.p2)[i]}))
        .sort((x, y) => Number(y.state.hp > 0) - Number(x.state.hp > 0));
      teamB = paired.map(x => x.entry);
      carryB = paired.map(x => x.state);
      teamA = a < 5 ? prepareRelayTeam(clubA[a].team,'A',a) : null;
      carryA = null;
    } else {
      a++;enhancementsA=null;
      b++;enhancementsB=null;
      carryA = carryB = null;
      teamA = a < 5 ? prepareRelayTeam(clubA[a].team,'A',a) : null;
      teamB = b < 5 ? prepareRelayTeam(clubB[b].team,'B',b) : null;
    }
  }
  return {rulesVersion:LEAGUE_RULES.version,winner: a === 5 && b === 5 ? 'tie' : a === 5 ? 'B' : 'A',
    trainersDefeated: {A:a, B:b}, rounds};
}
