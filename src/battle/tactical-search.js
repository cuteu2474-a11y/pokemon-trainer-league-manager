import {Dex} from '@pkmn/sim';

/**
 * Bounded, information-safe tactical rollout. This is an approximate evaluation,
 * NOT a cloned Showdown battle or a guaranteed win-probability estimate.
 * Never reads unrevealed opponent ability, item, moves or IVs.
 */
export function searchBudget(tactics = 10) {
  const t = Math.max(1, Math.min(20, tactics));
  return {depth:t <= 5 ? 1 : t <= 10 ? 1 : t <= 15 ? 2 : 3,
    samples:t <= 5 ? 1 : t <= 10 ? 3 : t <= 15 ? 6 : 12};
}
export function knownModifier({ability, item} = {}, move = {}) {
  const a = String(ability || '').toLowerCase().replace(/[^a-z0-9]/g,'');
  const it = String(item || '').toLowerCase().replace(/[^a-z0-9]/g,'');
  const type = move.type;
  let factor = 1;
  if (a === 'technician' && move.basePower <= 60) factor *= 1.5;
  if (a === 'ironfist' && move.flags?.punch) factor *= 1.2;
  if (a === 'strongjaw' && move.flags?.bite) factor *= 1.5;
  if (a === 'sheerforce' && move.secondaries?.length) factor *= 1.3;
  if (a === 'adaptability') factor *= 1.1; // conservative when STAB is unknown
  if (it === 'lifeorb') factor *= 1.3;
  if (it === 'choiceband' && move.category === 'Physical') factor *= 1.5;
  if (it === 'choicespecs' && move.category === 'Special') factor *= 1.5;
  const boosted = {charcoal:'Fire',mysticwater:'Water',magnet:'Electric',miracleseed:'Grass',
    nevermeltice:'Ice',blackglasses:'Dark',spelltag:'Ghost',hardstone:'Rock',
    softsand:'Ground',sharpbeak:'Flying',silkscarf:'Normal'};
  if (boosted[it] === type) factor *= 1.2;
  return factor;
}
export function evaluateMove(entry, {foeTypes = [], ownAbility, ownItem, ownTypes = [], foeHpFraction = 1} = {}) {
  const data = Dex.moves.get(entry.move?.id || entry.move?.move || entry.move || '');
  if (!data.exists) return 0;
  const accuracy = typeof data.accuracy === 'number' ? data.accuracy / 100 : 1;
  if (data.category === 'Status') {
    if (data.heal) return 32 * (1 - foeHpFraction * 0.2);
    if (data.boosts || data.self?.boosts) return 33;
    if (data.status || data.volatileStatus || data.sideCondition || data.weather || data.pseudoWeather) return 29;
    return 12;
  }
  const effectiveness = foeTypes.reduce((v,t)=>v * (Dex.getImmunity(data.type,[t]) ? 2 ** Dex.getEffectiveness(data.type,[t]) : 0),1);
  const stab = ownTypes.includes(data.type) ? 1.5 : 1;
  const power = data.basePower || 40;
  const multiplier = knownModifier({ability:ownAbility,item:ownItem},data);
  const priority = data.priority > 0 ? 1.12 : 1;
  return power * accuracy * effectiveness * stab * multiplier * priority;
}
/** Bounded rollouts over uncertain enemy responses, not perfect-information search. */
export function selectTacticalMove(moves, context = {}, tactics = 10, random = Math.random) {
  if (!moves.length) throw new RangeError('No legal moves');
  const {depth,samples} = searchBudget(tactics);
  const ranked = moves.map((entry,i)=>({entry,i,base:evaluateMove(entry,context)}))
    .sort((a,b)=>b.base-a.base || a.i-b.i).slice(0,Math.min(4,moves.length));
  const total = ranked.map(candidate=>{
    let aggregate = 0;
    for (let sample=0;sample<samples;sample++) {
      // Unknown enemy actions are approximated as threats, not read from hidden state.
      const threat = 0.7 + random() * 0.6;
      let value = candidate.base;
      for (let ply=1;ply<depth;ply++) value += candidate.base * Math.pow(0.55,ply) / threat;
      aggregate += value;
    }
    return {...candidate,value:aggregate/samples};
  }).sort((a,b)=>b.value-a.value || a.i-b.i);
  return total[0].entry.choice;
}
