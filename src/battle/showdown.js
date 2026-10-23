import {BattleStreams} from '@pkmn/sim';
import {TrainerAI} from './trainer-ai.js';
import {GPBattleStream, packGPTeam} from './gp-battle-stream.js';

/** Full 6v6 Showdown simulation using authoritative GP-derived battle stats. */
export async function simulateSixVsSix(teamA, teamB, {formatid = 'gen9customgame', maxTurns = 300, seed, carry = {}, trainerA = {}, trainerB = {}} = {}) {
  if (formatid !== 'gen9customgame') throw new RangeError('GP integration currently supports gen9customgame only');
  if (!Number.isInteger(maxTurns) || maxTurns < 1) throw new RangeError('Invalid maxTurns');
  const packedA = packGPTeam(teamA);
  const packedB = packGPTeam(teamB);
  const stream = new GPBattleStream(teamA, teamB, carry);
  const streams = BattleStreams.getPlayerStreams(stream);
  const p1 = new TrainerAI(streams.p1, trainerA, {seed});
  const p2 = new TrainerAI(streams.p2, trainerB, {seed:seed?.map(x => (x + 17) >>> 0)});
  p1.side = 'p1'; p2.side = 'p2';
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
    const finalState = Object.fromEntries(['p1','p2'].map(key => [key,
      stream.battle[key].pokemon.map(mon => ({
        hp: mon.hp, maxhp: mon.maxhp, status: mon.status,
        pp: mon.baseMoveSlots.map(slot => slot.pp),
      }))
    ]));
    return {winner, log, initialStats: stream.initialStats, finalState, aiDecisions:{p1:p1.decisions,p2:p2.decisions}, formEvents: [...stream.formEvents]};
  } finally {
    await stream.writeEnd();
    await Promise.allSettled(tasks);
  }
}
