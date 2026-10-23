import { BattleStreams, RandomPlayerAI, Teams } from '@pkmn/sim';

// Integration boundary: Showdown handles original battle mechanics.
// Our GP-to-stat adapter and custom trainer AI will be integrated separately.
export async function simulateSixVsSix(teamA, teamB, { formatid = 'gen9customgame', maxTurns = 300 } = {}) {
  if (teamA.length !== 6 || teamB.length !== 6) throw new RangeError('Both trainers require six Pokémon');
  const streams = BattleStreams.getPlayerStreams(new BattleStreams.BattleStream());
  const p1 = new RandomPlayerAI(streams.p1);
  const p2 = new RandomPlayerAI(streams.p2);
  const tasks = [p1.start(), p2.start()];
  const logs = [];
  const collector = (async () => {
    for await (const chunk of streams.omniscient) {
      logs.push(chunk);
      const result = logs.join('\n');
      if (/\|win\|/.test(result) || /\|tie\|/.test(result)) break;
      if (result.match(/\|turn\|/g)?.length > maxTurns) throw new Error('Battle turn limit exceeded');
    }
    return logs.join('\n');
  })();
  try {
    await streams.omniscient.write(
      '>start ' + JSON.stringify({formatid}) + '\n' +
      '>player p1 ' + JSON.stringify({name:'Club A',team:Teams.pack(teamA)}) + '\n' +
      '>player p2 ' + JSON.stringify({name:'Club B',team:Teams.pack(teamB)})
    );
    const log = await collector;
    const winner = log.match(/\|win\|([^\n]+)/)?.[1] ?? (log.includes('|tie|') ? 'tie' : null);
    if (!winner) throw new Error('Battle ended without a result');
    return {winner,log};
  } finally {
    // Stream teardown also terminates player AIs waiting for requests.
    await streams.omniscient.writeEnd?.();
    await Promise.allSettled(tasks);
  }
}
