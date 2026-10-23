import {actualStats, validateGP, STATS} from '../core/stats.js';

/** Compute authoritative stats without relying on Showdown's IV/EV calculation. */
export function convertPokemon(pokemon, speciesData) {
  if (!pokemon || !speciesData?.baseStats) throw new TypeError('Pokemon and species baseStats required');
  const {ca,pa,gp,level,natureModifiers={}}=pokemon;
  if (!Number.isInteger(pa) || pa<ca || pa>200) throw new RangeError('Invalid PA');
  validateGP(gp,ca);
  const stats=actualStats(speciesData.baseStats,gp,level,natureModifiers);
  if (speciesData.id === 'shedinja' || speciesData.name === 'Shedinja') stats.hp=1;
  return {id:pokemon.id, species:pokemon.species, level, ca, pa, gp:{...gp}, stats};
}

/**
 * Apply authoritative stats to an already-instantiated Showdown Pokemon.
 * Must be called AFTER the battle has created its Pokemon objects, BEFORE turn one.
 * This function deliberately does not patch engine internals or claim version stability.
 */
export function injectBattleStats(battlePokemon, converted) {
  if (!battlePokemon || !converted?.stats) throw new TypeError('Missing battle Pokemon or converted stats');
  if (!battlePokemon.storedStats || !battlePokemon.baseStoredStats) {
    throw new Error('Unsupported Showdown Pokemon object; verify simulator version');
  }
  const stats=converted.stats;
  for (const stat of STATS) {
    if (!Number.isInteger(stats[stat]) || stats[stat]<1) throw new RangeError('Invalid converted stat');
    if (stat !== 'hp') {
      battlePokemon.storedStats[stat]=stats[stat];
      battlePokemon.baseStoredStats[stat]=stats[stat];
    }
  }
  battlePokemon.maxhp=stats.hp;
  battlePokemon.hp=stats.hp;
  // Reapply only at battle initialization. Mid-battle application would erase damage.
  return battlePokemon;
}

/**
 * Inject stats for both sides after teams have been instantiated and before turn 1.
 * The caller must own a direct Battle instance (BattleStream hides this lifecycle).
 * Rejects mismatches rather than silently applying stats to the wrong Pokémon.
 */
export function injectBattleTeams(battle, convertedA, convertedB) {
  if (!battle?.p1?.pokemon || !battle?.p2?.pokemon) throw new TypeError('Direct Battle instance required');
  const pairs = [[battle.p1.pokemon, convertedA], [battle.p2.pokemon, convertedB]];
  for (const [team, converted] of pairs) {
    if (!Array.isArray(converted) || team.length !== converted.length) throw new RangeError('Team size mismatch');
    for (let i=0;i<team.length;i++) {
      const actual = String(team[i].species?.name ?? team[i].species?.id ?? '').toLowerCase().replace(/[^a-z0-9]/g,'');
      const expected = String(converted[i].species ?? '').toLowerCase().replace(/[^a-z0-9]/g,'');
      if (!actual || actual !== expected) throw new Error('Species mismatch at slot ' + i);
    }
  }
  for (const [team, converted] of pairs) for(let i=0;i<team.length;i++) injectBattleStats(team[i],converted[i]);
  return battle;
}

/**
 * Recalculate a new form using the SAME GP/level/nature, never IV/EV.
 * Retains current damage; does not heal on a form change.
 */
export function applyFormChange(battlePokemon, pokemon, newSpeciesData) {
  if (!battlePokemon || !pokemon) throw new TypeError('Missing Pokemon');
  const beforeMax=battlePokemon.maxhp;
  const beforeHP=battlePokemon.hp;
  const converted=convertPokemon(pokemon,newSpeciesData);
  const next=converted.stats;
  for(const stat of STATS) {
    if(stat==='hp') continue;
    battlePokemon.storedStats[stat]=next[stat];
    battlePokemon.baseStoredStats[stat]=next[stat];
  }
  battlePokemon.maxhp=next.hp;
  // Preserve HP lost, including a fainted state.
  battlePokemon.hp=beforeHP<=0 ? 0 : Math.max(1,Math.min(next.hp,next.hp-(beforeMax-beforeHP)));
  return converted;
}

/**
 * Transform copies the target's current raw battle stats except HP.
 * HP, max HP and the original GP remain unchanged.
 * Battle engine still owns move/ability/typing/boost mechanics.
 */
export function applyTransformStats(battlePokemon, targetPokemon) {
  if (!battlePokemon?.storedStats || !targetPokemon?.storedStats) throw new TypeError('Missing battle stats');
  for(const stat of STATS) {
    if(stat==='hp') continue;
    const value=targetPokemon.storedStats[stat];
    if(!Number.isInteger(value) || value<1) throw new RangeError('Invalid target stat');
    battlePokemon.storedStats[stat]=value;
  }
  return battlePokemon;
}
