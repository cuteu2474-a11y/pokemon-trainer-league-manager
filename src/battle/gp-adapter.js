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
