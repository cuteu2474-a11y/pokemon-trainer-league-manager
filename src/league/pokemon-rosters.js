import {Dex} from '@pkmn/sim';
import {ABILITY_STATS} from '../core/stat-potential.js';

/** Curated signature partners. Other roster members are game-generated, not claims about canon. */
export const SIGNATURES=Object.freeze({
  Clemont:'Heliolisk',Burgh:'Leavanny',Nemona:'Pawmot',Leon:'Charizard',
  Whitney:'Miltank',Sabrina:'Alakazam',Lisia:'Altaria',Looker:'Croagunk',
  Ilima:'Gumshoos',Elesa:'Zebstrika',Raihan:'Duraludon',Iono:'Bellibolt',
  Kabu:'Centiskorch',Maylene:'Lucario',Erika:'Vileplume',
  'Captain Stern':'Pelipper',Drayden:'Haxorus',Wattson:'Manectric',
  'Lt. Surge':'Raichu',Byron:'Bastiodon',Fantina:'Mismagius',
  'Samson Oak':'Exeggutor',Wulfric:'Avalugg',Grant:'Tyrunt',
  Ramos:'Gogoat',Opal:'Alcremie',Morty:'Gengar',Bugsy:'Scyther',
  Flannery:'Torkoal',Milo:'Eldegoss',Hop:'Dubwool',
  Katy:'Lokix',Brassius:'Sudowoodo',Kiawe:'Marowak',
  Hala:'Crabominable',Blue:'Pidgeot',Ethan:'Typhlosion',
  Brendan:'Sceptile',Barry:'Empoleon',
});
const REGIONAL_POOLS={
  Kanto:['Pidgeot','Arcanine','Gengar','Nidoking','Starmie','Snorlax','Machamp','Jolteon','Lapras','Venusaur','Blastoise','Charizard'],
  Johto:['Ampharos','Heracross','Crobat','Espeon','Umbreon','Donphan','Quagsire','Skarmory','Typhlosion','Feraligatr','Meganium','Miltank'],
  Hoenn:['Swellow','Breloom','Manectric','Flygon','Aggron','Gardevoir','Absol','Walrein','Crawdaunt','Sceptile','Swampert','Blaziken'],
  Sinnoh:['Staraptor','Luxray','Roserade','Floatzel','Gastrodon','Lucario','Bronzong','Weavile','Mismagius','Torterra','Infernape','Empoleon'],
  Unova:['Stoutland','Excadrill','Krookodile','Galvantula','Chandelure','Leavanny','Scolipede','Braviary','Jellicent','Serperior','Emboar','Samurott'],
  Kalos:['Talonflame','Aegislash','Heliolisk','Hawlucha','Gogoat','Clawitzer','Aurorus','Trevenant','Goodra','Chesnaught','Delphox','Greninja'],
  Alola:['Toucannon','Lycanroc','Mudsdale','Salazzle','Araquanid','Kommo-o','Tsareena','Vikavolt','Bewear','Decidueye','Incineroar','Primarina'],
  Galar:['Corviknight','Dubwool','Drednaw','Coalossal','Centiskorch','Toxtricity','Grimmsnarl','Hatterene','Obstagoon','Rillaboom','Cinderace','Inteleon'],
  Paldea:['Pawmot','Lokix','Tinkaton','Kilowattrel','Clodsire','Garganacl','Arboliva','Ceruledge','Baxcalibur','Meowscarada','Skeledirge','Quaquaval'],
};
const hash=s=>{let h=2166136261;for(const c of s)h=Math.imul(h^c.charCodeAt(0),16777619);return h>>>0;};
const clamp=(n,min,max)=>Math.min(max,Math.max(min,Math.round(n)));
function allocateAbilityPairs(current,potential,seed){
  const statCA={},statPA={};
  for(const stat of ABILITY_STATS){
    const offset=(hash(seed+':'+stat)%19)-9;
    const now=clamp(current+offset,1,200);
    const cap=clamp(potential+(hash(seed+':potential:'+stat)%17)-8,now,200);
    statCA[stat]=now;statPA[stat]=cap;
  }
  return {statCA,statPA};
}
function movesFor(species){
  const data=Dex.species.get(species);
  if(!data.exists)throw new Error('Unknown Pokémon: '+species);
  // Custom-game battle format permits these broadly available moves.
  // Every team gets damaging coverage so that AI cannot stall indefinitely on status-only sets.
  const attacks=['tackle','swift','bodyslam','earthquake','thunderbolt','icebeam','flamethrower','surf','psychic','energyball','shadowball','rockslide','closecombat','ironhead','crunch','dragonpulse','airslash','sludgebomb','playrough'];
  const physical=attacks.filter(id=>Dex.moves.get(id).category==='Physical');
  const special=attacks.filter(id=>Dex.moves.get(id).category==='Special');
  const offset=hash(data.id)%physical.length;
  const alt=hash(data.id+'special')%special.length;
  return [physical[offset],special[alt],physical[(offset+3)%physical.length],special[(alt+4)%special.length]];
}
export function generatePokemonTeams(club) {
  if(!club?.trainers||club.trainers.length!==5)throw new TypeError('Five trainers required');
  const pool=REGIONAL_POOLS[club.region];
  if(!pool)throw new RangeError('Unknown region: '+club.region);
  for(let t=0;t<5;t++){
    const used=new Set();
    const trainer=club.trainers[t];
    const signature=t===0&&trainer.isCanonical?SIGNATURES[trainer.name]:null;
    const speciesList=[];
    if(signature){speciesList.push(signature);used.add(Dex.species.get(signature).id);}
    let cursor=hash(trainer.id)%pool.length;
    while(speciesList.length<6){
      const species=pool[cursor%pool.length];cursor++;
      const id=Dex.species.get(species).id;
      if(!used.has(id)){used.add(id);speciesList.push(species);}
      if(cursor>1000)throw new Error('Regional roster exhausted');
    }
    trainer.team=speciesList.map((species,index)=>{
      const seed=trainer.id+':'+species;
      const bonus=trainer.isCanonical&&index===0?15:0;
      const ca=clamp(30+club.populationIndex*.55+(hash(seed)%19)-9+bonus,15,115);
      const pa=clamp(ca+15+(hash(seed+'potential')%41),ca,200);
      return {species,nature:'Hardy',ability:Dex.species.get(species).abilities['0']||'',
        moves:movesFor(species),...allocateAbilityPairs(ca,pa,seed)};
    });
  }
  return club;
}
export function assignLeaguePokemon(league){
  for(const division of league.divisions)for(const club of division)generatePokemonTeams(club);
  return league;
}
