/**
 * Pokémon Manager level-free ability model.
 *
 * Six independent CA/PA pairs replace aggregate Power, GP budgets, and levels.
 * CA is the trainable current value (1..200); PA is its individual cap (CA..200).
 * Pokémon species base stats and nature still influence Showdown battle stats.
 */
export const ABILITY_STATS=Object.freeze(['hp','atk','def','spa','spd','spe']);
export const ABILITY_NAMES=Object.freeze({
  hp:'체력',atk:'공격',def:'방어',spa:'특수공격',spd:'특수방어',spe:'스피드'
});
export const MAX_STAT_CA_PA=200;
const clamp=(v,min,max)=>Math.max(min,Math.min(max,Math.round(v)));
const hash=s=>{let h=2166136261;for(const c of String(s))h=Math.imul(h^c.charCodeAt(0),16777619);return h>>>0;};

function validatedPairs(statCA,statPA){
  if(!statCA||!statPA||typeof statCA!=='object'||typeof statPA!=='object')
    throw new RangeError('개별 CA/PA가 필요합니다.');
  for(const s of ABILITY_STATS){
    if(!Number.isInteger(statCA[s])||statCA[s]<1||statCA[s]>200)
      throw new RangeError(s+' CA must be 1..200');
    if(!Number.isInteger(statPA[s])||statPA[s]<statCA[s]||statPA[s]>200)
      throw new RangeError(s+' PA must be CA..200');
  }
  return {statCA:Object.fromEntries(ABILITY_STATS.map(s=>[s,statCA[s]])),
    statPA:Object.fromEntries(ABILITY_STATS.map(s=>[s,statPA[s]]))};
}
/** Stable migration of existing saves; no RNG state is consumed. */
export function normalizeStatPairs(pokemon){
  if(!pokemon||typeof pokemon!=='object')throw new TypeError('포켓몬 정보가 필요합니다.');
  if(pokemon.statCA||pokemon.statPA)
    return validatedPairs(pokemon.statCA,pokemon.statPA);
  const legacyCurrent=clamp(Number(pokemon.ca??pokemon.power??60)||60,1,200);
  const legacyPotential=clamp(Number(pokemon.pa??legacyCurrent+34)||legacyCurrent+34,
    legacyCurrent,200);
  const oldGP=pokemon.gp;
  const hasGP=oldGP&&ABILITY_STATS.every(s=>Number.isInteger(oldGP[s]));
  const gpMean=hasGP?ABILITY_STATS.reduce((n,s)=>n+oldGP[s],0)/6:0;
  const statCA={},statPA={};
  for(const s of ABILITY_STATS){
    const offset=(hash((pokemon.species||pokemon.name||'')+':'+s)%15)-7;
    const gpOffset=hasGP?(oldGP[s]-gpMean)*.55:0;
    const current=clamp(legacyCurrent+offset+gpOffset,1,200);
    const potential=clamp(legacyPotential+
      (hash((pokemon.species||pokemon.name||'')+':potential:'+s)%19)-9,
      current,200);
    statCA[s]=current;statPA[s]=potential;
  }
  return {statCA,statPA};
}
export function meanStatCA(pokemon){
  const {statCA}=normalizeStatPairs(pokemon);
  return Math.round(ABILITY_STATS.reduce((sum,s)=>sum+statCA[s],0)/6);
}
export function meanStatPA(pokemon){
  const {statPA}=normalizeStatPairs(pokemon);
  return Math.round(ABILITY_STATS.reduce((sum,s)=>sum+statPA[s],0)/6);
}
export function growStat(pokemon,stat,points=1){
  if(!ABILITY_STATS.includes(stat))throw new RangeError('Unknown stat');
  if(!Number.isInteger(points)||points<1||points>20)throw new RangeError('Invalid growth points');
  const {statCA,statPA}=normalizeStatPairs(pokemon);
  const before=statCA[stat];
  statCA[stat]=Math.min(statPA[stat],before+points);
  return {statCA,statPA,stat,oldValue:before,newValue:statCA[stat],
    delta:statCA[stat]-before};
}
/**
 * The local fork's stat curve:
 *   HP = floor(0.80*baseHP + 0.95*CA_HP + 45)
 *   Other = floor((0.80*speciesBase + 0.70*CA_stat + 10)*nature)
 * This uses no level term. +1 CA improves the chosen stat; PA is NEVER combat power.
 */
export function calculateLevelFreeStats(speciesBase,statCA,nature={}){
  const actual={};
  if(!speciesBase)throw new TypeError('Species base stats required');
  for(const s of ABILITY_STATS){
    const base=speciesBase[s],current=statCA?.[s];
    if(!Number.isFinite(base)||base<1)throw new RangeError('Invalid species base stat: '+s);
    if(!Number.isInteger(current)||current<1||current>200)
      throw new RangeError('Invalid individual CA: '+s);
    if(s==='hp'){
      actual.hp=Math.max(1,Math.floor(base*.8+current*.95+45));
      continue;
    }
    const mod=nature[s]??1;
    if(![.9,1,1.1].includes(mod))throw new RangeError('Invalid nature modifier');
    actual[s]=Math.max(1,Math.floor((base*.8+current*.7+10)*mod));
  }
  return actual;
}
