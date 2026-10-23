import {createLeague} from './season.js';

/** Fictional settlement-size indices for game balance, not canonical census data. */
export const SETTLEMENTS = Object.freeze([
  ['Lumiose City','Kalos',100],['Castelia City','Unova',99],['Mesagoza','Paldea',98],
  ['Wyndon','Galar',97],['Goldenrod City','Johto',95],
  ['Saffron City','Kanto',88],['Lilycove City','Hoenn',86],['Jubilife City','Sinnoh',84],
  ['Hau\'oli City','Alola',82],['Nimbasa City','Unova',80],['Hammerlocke','Galar',78],
  ['Levincia','Paldea',77],['Motostoke','Galar',75],['Veilstone City','Sinnoh',73],
  ['Celadon City','Kanto',68],['Slateport City','Hoenn',66],['Opelucid City','Unova',64],
  ['Mauville City','Hoenn',62],['Vermilion City','Kanto',60],['Canalave City','Sinnoh',58],
  ['Hearthome City','Sinnoh',56],['Malie City','Alola',54],['Snowbelle City','Kalos',52],
  ['Cyllage City','Kalos',50],['Coumarine City','Kalos',48],['Ballonlea','Galar',46],
  ['Ecruteak City','Johto',43],['Azalea Town','Johto',40],['Lavaridge Town','Hoenn',38],
  ['Solaceon Town','Sinnoh',36],['Turffield','Galar',34],['Postwick','Galar',32],
  ['Cortondo','Paldea',30],['Artazon','Paldea',28],['Paniola Town','Alola',26],
  ['Iki Town','Alola',24],['Pallet Town','Kanto',18],['New Bark Town','Johto',16],
  ['Littleroot Town','Hoenn',14],['Twinleaf Town','Sinnoh',12],
].map(([name,region,size])=>Object.freeze({name,region,size})));

export function clubScale(size) {
  if(!Number.isInteger(size)||size<1||size>100)throw new RangeError('Size must be 1..100');
  const tier=size>=90?'mega':size>=70?'large':size>=45?'medium':size>=20?'small':'tiny';
  return {
    tier,
    populationIndex:size,
    budget:Math.round(size*120000),
    fans:Math.round(size*750),
    facilities:Math.min(20,Math.max(1,Math.round(size/5))),
    rating:Math.round(50+size*.5),
  };
}
/** Stable size-based seeding, with 10 clubs per division. */
export function createPokemonLeague() {
  if(SETTLEMENTS.length!==40||new Set(SETTLEMENTS.map(s=>s.name)).size!==40)
    throw new Error('Expected 40 unique settlements');
  const clubs=SETTLEMENTS.map((place,index)=>({
    id:`club-${String(index+1).padStart(2,'0')}`,
    name:`${place.name} Club`,
    city:place.name,
    region:place.region,
    ...clubScale(place.size),
  }));
  return createLeague(Array.from({length:4},(_,division)=>clubs.slice(division*10,division*10+10)));
}
