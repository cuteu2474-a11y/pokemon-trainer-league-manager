import {Battle} from '@pkmn/sim';

/** Evaluates legal actions using actual cloned Showdown turns. No mutation of live battle. */
export function evaluateBattle(battle, sideId = 'p1') {
  const mine = battle[sideId], theirs = battle[sideId === 'p1' ? 'p2' : 'p1'];
  const value = side => side.pokemon.reduce((sum, mon) =>
    sum + (mon.hp > 0 ? 120 + 100 * mon.hp / Math.max(1,mon.maxhp) : 0), 0);
  return value(mine) - value(theirs);
}
export function legalRolloutMoves(battle, sideId) {
  const side = battle[sideId], active = side.active[0];
  if (!active || !active.hp) return [];
  return active.moveSlots.map((slot,i) => ({choice:`move ${i+1}`,id:slot.id}))
    .filter((entry,i)=>active.moveSlots[i].pp > 0 && !active.moveSlots[i].disabled);
}
export function rolloutActions(battle, {sideId='p1', choices, opponentChoices, depth=1, samples=1} = {}) {
  if (!battle?.toJSON || !Array.isArray(choices) || !choices.length) throw new TypeError('Battle and legal choices required');
  if (!Number.isInteger(depth) || depth < 1 || depth > 3 || !Number.isInteger(samples) || samples < 1 || samples > 12)
    throw new RangeError('Rollout budget exceeded');
  const baseline = battle.toJSON();
  const foeId = sideId === 'p1' ? 'p2' : 'p1';
  const results = [];
  for (const choice of choices) {
    let score = 0, runs = 0, kos = 0, damage = 0;
    for (let i=0;i<samples;i++) {
      // Showdown serialization retains the original log array by reference.
      // Each search branch must own its log, including separate samples.
      const clone = Battle.fromJSON(structuredClone(baseline));
      const enemy = opponentChoices?.[i % opponentChoices.length] ||
        legalRolloutMoves(clone,foeId)[i % Math.max(1,legalRolloutMoves(clone,foeId).length)]?.choice;
      if (!enemy) continue;
      try {
        const foeBefore=clone[foeId].active?.[0];
        const foeHpBefore=foeBefore?.hp||0;
        const foeMaxHp=foeBefore?.maxhp||1;
        if (sideId === 'p1') clone.makeChoices(choice,enemy);
        else clone.makeChoices(enemy,choice);
        const foeAfter=clone[foeId].active?.[0];
        // Record only first-turn effects; later turns must not inflate a KO forecast.
        // If the opponent switched, this is not a direct KO on the original target.
        if(foeBefore===foeAfter&&foeHpBefore>0){
          const dealt=Math.max(0,foeHpBefore-foeAfter.hp);
          damage+=dealt/Math.max(1,foeMaxHp);
          if(foeAfter.hp<=0)kos++;
        }
        for (let turn=1;turn<depth && !clone.ended;turn++) {
          if (clone.requestState !== 'move') break;
          clone.makeChoices();
        }
        score += evaluateBattle(clone,sideId);
        runs++;
      } catch {
        // Invalid branches are excluded rather than contaminating the live battle.
      }
    }
    results.push({choice,score:runs ? score/runs : -Infinity,runs,
      koRate:runs?kos/runs:0,damageFraction:runs?damage/runs:0});
  }
  return results.sort((a,b)=>b.score-a.score);
}
