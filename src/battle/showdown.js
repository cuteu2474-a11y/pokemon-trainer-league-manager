import {BattleStreams, RandomPlayerAI} from '@pkmn/sim';
import {GPBattleStream, packGPTeam} from './gp-battle-stream.js';

/** Full 6v6 Showdown simulation using authoritative GP-derived battle stats. */
export async function simulateSixVsSix(teamA, teamB, {formatid = 'gen9customgame', maxTurns = 300, seed} = {}) {
  if (formatid !== 'gen9customgame') throw new RangeError('GP integration currently supports gen9customgame only');
  if (!Number.isInteger(maxTurns) || maxTurns < 1) throw new RangeError('Invalid maxTurns');
  const packedA = packGPTeam(teamA);
  const packedB = packGPTeam(teamB);
  const stream = new GPBattleStream(teamA, teamB);
  const streams = BattleStreams.getPlayerStreams(stream);
  const p1 = new RandomPlayerAI(streams.p1);
  const p2 = new RandomPlayerAI(streams.p2);
  const tasks = [p1.start(), p2.start()];
  const collector = (async () => {
    const chunks = [];
    let turnCount = 0;
    for await (const chunk of streams.omniscient) {
      chunks.push(chunk);
      turnCount += (chunk.match(/\|turn\|/g) || []).length;
      if (/\|(win|tie)\|/.test(chunk)) break;
      if (turnCount > maxTurns) throw new Error(`Battle exceeded ${maxTurns} turns`);
    }
    return chunks.join('\n');
  })();
  try {
    await stream.write('>start ' + JSON.stringify({formatid, ...(seed ? {seed} : {})}));
    await stream.write('>player p1 ' + JSON.stringify({name:'Club A',team:packedA}));
    await stream.write('>player p2 ' + JSON.stringify({name:'Club B',team:packedB}));
    const log = await collector;
    const winner = log.match(/\|win\|([^\n]+)/)?.[1] ?? (log.includes('|tie|') ? 'tie' : null);
    if (!winner) throw new Error('Battle finished without a winner or tie');
    return {winner, log, initialStats: stream.initialStats, formEvents: [...stream.formEvents]};
  } finally {
    await stream.writeEnd();
    await Promise.allSettled(tasks);
  }
}
