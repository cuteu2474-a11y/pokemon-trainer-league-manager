/** Curated hometown or nearby-area figures. Regional links are marked separately from local leaders. */
export const LOCAL_ICONS = Object.freeze({
  'Lumiose City':['Clemont','Gym Leader'],'Castelia City':['Burgh','Gym Leader'],
  Mesagoza:['Nemona','Academy'],'Wyndon':['Leon','Champion'],
  'Goldenrod City':['Whitney','Gym Leader'],'Saffron City':['Sabrina','Gym Leader'],
  'Lilycove City':['Lisia','Contest Star'],'Jubilife City':['Looker','Regional Figure'],
  "Hau'oli City":['Ilima','Trial Captain'],'Nimbasa City':['Elesa','Gym Leader'],
  Hammerlocke:['Raihan','Gym Leader'],Levincia:['Iono','Gym Leader'],
  Motostoke:['Kabu','Gym Leader'],'Veilstone City':['Maylene','Gym Leader'],
  'Celadon City':['Erika','Gym Leader'],'Slateport City':['Captain Stern','Local Figure'],
  'Opelucid City':['Drayden','Gym Leader'],'Mauville City':['Wattson','Gym Leader'],
  'Vermilion City':['Lt. Surge','Gym Leader'],'Canalave City':['Byron','Gym Leader'],
  'Hearthome City':['Fantina','Gym Leader'],'Malie City':['Samson Oak','Local Figure'],
  'Snowbelle City':['Wulfric','Gym Leader'],'Cyllage City':['Grant','Gym Leader'],
  'Coumarine City':['Ramos','Gym Leader'],Ballonlea:['Opal','Gym Leader'],
  'Ecruteak City':['Morty','Gym Leader'],'Azalea Town':['Bugsy','Gym Leader'],
  'Lavaridge Town':['Flannery','Gym Leader'],
  Turffield:['Milo','Gym Leader'],Postwick:['Hop','Local Trainer'],
  Cortondo:['Katy','Gym Leader'],Artazon:['Brassius','Gym Leader'],
  'Paniola Town':['Kiawe','Regional Figure'],'Iki Town':['Hala','Kahuna'],
  'Pallet Town':['Blue','Hometown Trainer'],'New Bark Town':['Ethan','Hometown Trainer'],
  'Littleroot Town':['Brendan','Hometown Trainer'],'Twinleaf Town':['Barry','Hometown Trainer'],
});

/** The five slots are distinct individuals, not five clones of a famous character.
 * Named icons are hand-picked; other trainers are generated original characters.
 * Pokémon teams are intentionally left unassigned for the later roster system.
 */
const ROLES=['captain','ace','strategist','specialist','prospect'];
const clamp=x=>Math.max(1,Math.min(20,Math.round(x)));
const hash=s=>{let h=2166136261;for(const c of s){h=Math.imul(h^c.charCodeAt(0),16777619);}return h>>>0;};
export function generateClubTrainers(club) {
  if(!club?.id||!club.city||!Number.isFinite(club.populationIndex))
    throw new TypeError('Club requires ID, city and population index');
  const icon=LOCAL_ICONS[club.city];
  const base=3+club.populationIndex*.11;
  const roles=ROLES.map((role,index)=>{
    const offset=(hash(club.id+':'+index)%5)-2;
    const elite=index===0&&icon ? 3 : 0;
    const tactics=clamp(base+offset+elite+(index===2?2:0));
    const switching=clamp(base+((hash(club.city+':'+index)%7)-3)+elite+(index===3?2:0));
    return {
      id:`${club.id}-trainer-${index+1}`,
      name:index===0&&icon?icon[0]:`${club.city} Trainer ${index+1}`,
      role,
      origin:club.city,
      isCanonical:index===0&&!!icon,
      affiliation:index===0&&icon?icon[1]:'Original Club Trainer',
      tactics,switching,
      scouting:clamp(base+(index===2?3:0)),
      training:clamp(base+(index===4?3:0)),
      capture:clamp(base+(index===3?3:0)),
      appraisal:clamp(base+(index===1?3:0)),
      team:[],
    };
  });
  return roles;
}
export function assignLeagueTrainers(league) {
  if(!Array.isArray(league?.divisions)||league.divisions.length!==4)
    throw new TypeError('Four-division league required');
  for(const division of league.divisions)for(const club of division) {
    club.trainers=generateClubTrainers(club);
  }
  return league;
}
