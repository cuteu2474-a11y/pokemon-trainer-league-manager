import { STATS, actualStats, MAX_GP } from "./stats.js";
const clamp = (x,a,b) => Math.max(a,Math.min(b,x));
function effectiveness(move, opponent) {
  return move.effectiveness?.[opponent.id] ?? move.typeMultiplier ?? 1;
}
function offensiveScore(stats, moves, opponents, typeList) {
  let total = 0;
  for (const opponent of opponents) {
    let best = 0;
    for (const move of moves) {
      if (!move.power || !["physical","special"].includes(move.category)) continue;
      const attack = move.category === "physical" ? stats.atk : stats.spa;
      const defense = move.category === "physical" ? opponent.stats.def : opponent.stats.spd;
      const stab = typeList.includes(move.type) ? 1.5 : 1;
      const hit = clamp((move.accuracy ?? 100)/100,0,1);
      const damageProxy = move.power * attack / Math.max(1,defense) * stab * effectiveness(move,opponent) * hit;
      best = Math.max(best,damageProxy);
    }
    total += (opponent.weight ?? 1) * best;
  }
  return total;
}
/**
 * Fast GP allocation heuristic, NOT the full Pokemon damage engine.
 * inputs: {base, level, nature, moves, types, opponents, roleWeights}
 * opponents: [{id, stats:{hp,atk,def,spa,spd,spe}, weight?, ...}]
 */
export function scoreGP(gp, context) {
  const {base,level,nature={},moves=[],types=[],opponents=[],roleWeights={}} = context;
  const stats = actualStats(base,gp,level,nature);
  if (!opponents.length) {
    // Fallback is intentionally species/role aware, not a fabricated battle win-rate.
    return STATS.reduce((sum,s)=>sum+(roleWeights[s] ?? 1)*Math.log1p(stats[s]),0);
  }
  let weightSum=0, attack=0, bulk=0, speed=0;
  for (const foe of opponents) {
    const w=foe.weight ?? 1;
    weightSum+=w;
    const physicalThreat=(foe.physicalShare ?? 0.5);
    const physicalSurvival=stats.hp*stats.def/Math.max(1,foe.stats.atk);
    const specialSurvival=stats.hp*stats.spd/Math.max(1,foe.stats.spa);
    bulk+=w*(physicalThreat*Math.log1p(physicalSurvival)+(1-physicalThreat)*Math.log1p(specialSurvival));
    const d=stats.spe-foe.stats.spe;
    speed+=w/(1+Math.exp(-clamp(d/12,-30,30)));
  }
  attack=offensiveScore(stats,moves,opponents,types);
  const denom=Math.max(1,weightSum);
  return (roleWeights.offense ?? 1)*Math.log1p(attack/denom)
    +(roleWeights.bulk ?? 1)*bulk/denom
    +(roleWeights.speed ?? 1)*speed/denom;
}
export function gpMarginalValues(gp, context) {
  const before=scoreGP(gp,context), result={};
  for(const s of STATS) {
    if(gp[s] >= MAX_GP) continue;
    result[s]=scoreGP({...gp,[s]:gp[s]+1},context)-before;
  }
  return result;
}
