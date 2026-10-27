import {Dex} from '@pkmn/sim';
import {specialtyFromTypes} from '../core/team-specialty.js';
/** Ignore claimed bonuses on caller input and derive from registered species data. */
export function teamSpecialty(team,dex=Dex){
 return specialtyFromTypes(Array.isArray(team)?team.map(mon=>{
  const species=dex.species.get(mon.species);return species.exists?species.types:[];
 }):[]);
}
