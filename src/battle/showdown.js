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
  const p1 = new TrainerAI(streams.p1, trainerA, {seed, team:teamA, battleProvider:()=>stream.battle});
  const p2 = new TrainerAI(streams.p2, trainerB, {seed:seed?.map(x => (x + 17) >>> 0), team:teamB, battleProvider:()=>stream.battle});
  p1.side = 'p1'; p2.side = 'p2';
  const tasks = [p1.start(), p2.start()];
  const collector = (async () => {
    const chunks = [];
    for await (const chunk of streams.omniscient) {
      chunks.push(chunk);
      if (/\|(win|tie)\|/.test(chunk)) break;
      // Carried fainted Pokemon can desynchronize Showdown's pokemonLeft counter.
      // The actual HP state is authoritative for deciding a fully defeated side.
      const battle=stream.battle;
      if(battle?.started && !battle.ended && battle.p1?.pokemon?.length===6 && battle.p2?.pokemon?.length===6) {
        const alive=id=>battle[id].pokemon.some(mon=>mon.hp>0);
        if(!alive('p1') || !alive('p2')) {
          battle.win(!alive('p1') ? (!alive('p2') ? null : 'p2') : 'p1');
        }
      }
      if (stream.battle?.turn > maxTurns) throw new Error(`Battle exceeded ${maxTurns} turns; sides: ${JSON.stringify(['p1','p2'].map(id=>({id,left:stream.battle[id].pokemonLeft,active:stream.battle[id].active.map(p=>({hp:p?.hp,fainted:p?.fainted,species:p?.species?.name})),all:stream.battle[id].pokemon.map(p=>p.hp)})))}; tail: ${chunks.slice(-4).join(' ').slice(-500)}`);
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
