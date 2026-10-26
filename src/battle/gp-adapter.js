import {STATS} from '../core/stats.js';
import {calculateLevelFreeStats, normalizeStatPairs} from '../core/stat-potential.js';

/** Convert individual six-stat CA (never PA or level) into combat stats. */
export function convertPokemon(pokemon, speciesData) {
  if (!pokemon || !speciesData?.baseStats) throw new TypeError('Pokemon and species baseStats required');
  const {statCA,statPA}=normalizeStatPairs(pokemon);
  const stats=calculateLevelFreeStats(speciesData.baseStats,statCA,pokemon.natureModifiers||{});
  if(speciesData.id==='shedinja'||speciesData.name==='Shedinja')stats.hp=1;
  return {id:pokemon.id,species:speciesData.name??pokemon.species,statCA,statPA,stats};
}

function applyCalculatedStats(battlePokemon, stats) {
  if (!battlePokemon?.storedStats || !battlePokemon?.baseStoredStats) {
    throw new TypeError('Unsupported Showdown Pokemon object');
  }
  for (const stat of STATS) {
    if (!Number.isInteger(stats[stat]) || stats[stat] < 1) throw new RangeError(`Invalid ${stat} stat`);
    battlePokemon.baseStoredStats[stat] = stats[stat];
    if (stat !== 'hp') battlePokemon.storedStats[stat] = stats[stat];
  }
  battlePokemon.baseMaxhp = stats.hp;
  battlePokemon.maxhp = stats.hp;
  battlePokemon.speed = stats.spe;
}

/** Initial team injection: do not call once the battle has dealt damage. */
export function injectBattleStats(battlePokemon, converted) {
  if (!converted?.stats) throw new TypeError('Converted stats required');
  applyCalculatedStats(battlePokemon, converted.stats);
  battlePokemon.hp = converted.stats.hp;
  return battlePokemon;
}

/** The Pokemon order must match the Showdown packed-team order exactly. */
export function injectBattleTeams(battle, convertedA, convertedB) {
  if (!battle?.p1?.pokemon || !battle?.p2?.pokemon) throw new TypeError('Direct Battle required');
  const pairs = [[battle.p1.pokemon, convertedA], [battle.p2.pokemon, convertedB]];
  for (const [team, converted] of pairs) {
    if (!Array.isArray(converted) || team.length !== converted.length) throw new RangeError('Team size mismatch');
    for (let i = 0; i < team.length; i++) {
      const actual = String(team[i].species?.name ?? team[i].species?.id ?? '').toLowerCase().replace(/[^a-z0-9]/g,'');
      const expected = String(converted[i].species ?? '').toLowerCase().replace(/[^a-z0-9]/g,'');
      if (!actual || actual !== expected) throw new Error(`Species mismatch at slot ${i}`);
    }
  }
  for (const [team, converted] of pairs) for (let i = 0; i < team.length; i++) injectBattleStats(team[i], converted[i]);
  return battle;
}

/** Recalculate GP using the new form's actual species base stats, retaining damage suffered. */
export function applyFormChange(battlePokemon, pokemon, newSpeciesData, previous = {}) {
  const oldMaxhp = previous.maxhp ?? battlePokemon.maxhp;
  const oldHp = previous.hp ?? battlePokemon.hp;
  const converted = convertPokemon(pokemon, newSpeciesData);
  applyCalculatedStats(battlePokemon, converted.stats);
  battlePokemon.hp = oldHp <= 0 ? 0 : Math.max(1, Math.min(converted.stats.hp, converted.stats.hp - (oldMaxhp - oldHp)));
  return converted;
}

/** Showdown Transform copies the target's storedStats; this helper allows explicit stat-only tests. */
export function applyTransformStats(battlePokemon, targetPokemon) {
  if (!battlePokemon?.storedStats || !targetPokemon?.storedStats) throw new TypeError('Missing battle stats');
  for (const stat of STATS) {
    if (stat === 'hp') continue;
    const value = targetPokemon.storedStats[stat];
    if (!Number.isInteger(value) || value < 1) throw new RangeError('Invalid target stat');
    battlePokemon.storedStats[stat] = value;
  }
  return battlePokemon;
}
