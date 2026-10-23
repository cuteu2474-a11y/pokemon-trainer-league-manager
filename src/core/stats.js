// Gen 3+ style stat calculation, with IV/EV replaced by unified GP.
export const STATS = ["hp","atk","def","spa","spd","spe"];
export const MAX_GP = 94;
export const MAX_CA = 200;
export function gpBudget(ca) {
  if (!Number.isInteger(ca) || ca < 1 || ca > MAX_CA) throw new RangeError("CA must be 1..200");
  return Math.floor(313 * ca / MAX_CA);
}
export function validateGP(gp, ca) {
  if (!gp || STATS.some(s => !Number.isInteger(gp[s]) || gp[s] < 0 || gp[s] > MAX_GP)) throw new RangeError("Invalid GP");
  if (STATS.reduce((n,s)=>n+gp[s],0) !== gpBudget(ca)) throw new RangeError("GP budget mismatch");
}
export function actualStats(base, gp, level, nature = {}) {
  if (!Number.isInteger(level) || level < 1 || level > 100) throw new RangeError("Invalid level");
  const result = {};
  for (const stat of STATS) {
    const b = base[stat], g = gp[stat];
    if (!Number.isFinite(b) || !Number.isInteger(g) || g < 0 || g > MAX_GP) throw new RangeError("Invalid base or GP");
    if (stat === "hp") result.hp = Math.floor((2*b+g)*level/100)+level+10;
    else {
      const n = nature[stat] ?? 1;
      if (![0.9,1,1.1].includes(n)) throw new RangeError("Invalid nature modifier");
      result[stat] = Math.floor((Math.floor((2*b+g)*level/100)+5)*n);
    }
  }
  // Shedinja special HP=1 handled at species layer.
  return result;
}
