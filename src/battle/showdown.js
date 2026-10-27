import {LEAGUE_RULES} from '../core/league-rules.js';
import {captureRelayState,endTemporaryEnhancement} from './relay-state.js';
import {BattleStreams} from '@pkmn/sim';
import {TrainerAI} from './trainer-ai.js';
import {GPBattleStream, packGPTeam} from './gp-battle-stream.js';

/** Full 6v6 Showdown simulation using authoritative GP-derived battle stats. */
export async function simulateSixVsSix(teamA, teamB, {formatid = 'gen9customgame', maxTurns = LEAGUE_RULES.maxTurns, seed, carry = {}, trainerA = {}, trainerB = {},enhancements} = {}) {
  if (formatid !== 'gen9customgame') throw new RangeError('GP integration currently supports gen9customgame only');
  if (!Number.isInteger(maxTurns) || maxTurns < 1 || maxTurns > LEAGUE_RULES.maxTurns) throw new RangeError('Invalid maxTurns');
  const packedA = packGPTeam(teamA);
  const packedB = packGPTeam(teamB);
  const stream = new GPBattleStream(teamA, teamB, carry, {maxTurns,enhancements});
  const streams = BattleStreams.getPlayerStreams(stream);
  const p1 = new TrainerAI(streams.p1, trainerA, {seed, team:teamA, battleProvider:()=>stream.battle});
  const p2 = new TrainerAI(streams.p2, trainerB, {seed:seed?.map(x => (x + 17) >>> 0), team:teamB, battleProvider:()=>stream.battle});
  p1.side = 'p1'; p2.side = 'p2';
  const tasks = [p1.start(), p2.start()];
  const collector = (async () => {
    const chunks = [];
    for await (const chunk of streams.omniscient) {
      chunks.push(chunk);
      if (/^\|win\|/m.test(chunk)||/^\|tie(?:\||$)/m.test(chunk)) break;
    }
    return chunks.join('\n');
  })();
  try {
    await stream.write('>start ' + JSON.stringify({formatid, ...(seed ? {seed} : {})}));
    await stream.write('>player p1 ' + JSON.stringify({name:'Club A',team:packedA}));
    await stream.write('>player p2 ' + JSON.stringify({name:'Club B',team:packedB}));
    let log = await collector;
    const winner = log.match(/\|win\|([^\n]+)/)?.[1] ?? (/^\|tie(?:\||$)/m.test(log) ? 'tie' : null);
    if (!winner) throw new Error('Battle finished without a winner or tie');
    const cleanupStart=stream.battle.log.length;
    endTemporaryEnhancement(stream.battle);
    log+='\n'+stream.battle.log.slice(cleanupStart).join('\n');
    const finalState=Object.fromEntries(['p1','p2'].map(key=>[key,(stream.originalPokemon?.[key]||stream.battle[key].pokemon).map(mon=>captureRelayState(mon,mon.leagueMeta))]));
    return {winner, log,rulesVersion:LEAGUE_RULES.version,endReason:stream.battle.leagueEndReason||(winner==='tie'?'engine-tie':'engine-win'),turns:stream.battle.turn,turnLimit:maxTurns, initialEnhancements:stream.initialEnhancements,enhancements:structuredClone(stream.battle.leagueEnhancements),initialStats: stream.initialStats, finalState, aiDecisions:{p1:p1.decisions,p2:p2.decisions}, formEvents: [...stream.formEvents]};
  } finally {
    await stream.writeEnd();
    await Promise.allSettled(tasks);
  }
}
