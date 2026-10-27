/** Qualification uses the six registered species, never current battle types. */
export const SPECIALTY_STATS=Object.freeze(['atk','def','spa','spd']);
export function specialtyFromTypes(typeSets){
 if(!Array.isArray(typeSets)||typeSets.length!==6||typeSets.some(types=>!Array.isArray(types)||!types.length))return {types:[],active:false};
 const types=[...new Set(typeSets[0])].filter(type=>typeSets.every(set=>set.includes(type)));
 return {types,active:types.length>0};
}
/** Apply once to freshly calculated nature-adjusted stats; no damage multiplier. */
export function specialtyStats(stats,specialty){
 const result={...stats};
 if(specialty?.active&&specialty.types?.length)for(const key of SPECIALTY_STATS)result[key]=Math.floor(result[key]*105/100);
 return result;
}
