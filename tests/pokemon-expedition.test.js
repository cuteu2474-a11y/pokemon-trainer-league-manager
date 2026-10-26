import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {runInNewContext} from 'node:vm';
import {prepareClub} from '../src/web/match-service.js';

const module=readFileSync(new URL('../assets/pokemon-expedition.js',import.meta.url),'utf8');
const ko=JSON.parse(readFileSync(new URL('../src/web/species-ko.json',import.meta.url),'utf8'));
const mon=(name,power=63)=>({name,power,level:50,careerSeasons:3});
function fixture(){
  return {version:2,season:1,week:1,round:0,seed:1234567,club:'우리 구단',
    coins:600000000,scout:0,log:[],clubs:[
      {id:0,name:'우리 구단',division:0,trainers:Array.from({length:5},(_,i)=>({
        uid:i+1,id:i,name:'트레이너 '+(i+1),tactics:11+i,switching:9+i,
        pokemon:Array.from({length:6},(_,j)=>mon('피카츄',60+i+j)),
      })),reserveTrainers:[]},
      {id:1,name:'상대 구단',division:0,trainers:Array.from({length:5},(_,i)=>({
        uid:i+20,name:'상대 '+i,tactics:12,switching:11,
        pokemon:Array.from({length:6},()=>mon('거북왕',67)),
      })),reserveTrainers:[]},
    ]};
}
function setup(){
  const g=fixture();
  let writes=0,renders=0;
  const doc={head:{append(){}},createElement(){return {textContent:''}},
    querySelectorAll(){return []},getElementById(){return null}};
  let confirmation=true;
  const globals={window:{},document:doc,game:g,
    tab:'home',renderOffice(){renders++},nextWeek(){this.game.week++},
    myClub(){return this.game.clubs[0]},worldClubRegion(){return '관동'},
    wonReadable(n){return '₩'+n},persist(){writes++},alert(){},
    confirm(){return confirmation},CSS:{escape:value=>value}};
  runInNewContext(module,globals);
  const api=globals.window.PokemonExpedition;
  assert.ok(api);
  return {api,game:g,globals,report:()=>({writes,renders}),
    confirm:value=>{confirmation=value}};
}
test('nine region encounter lists contain real Korean Pokémon species only',()=>{
  const {api}=setup();
  assert.equal(Object.keys(api.REGIONS).length,9);
  for(const [region,species]of Object.entries(api.REGIONS)){
    assert.ok(species.length>=12,region);
    for(const mon of species)assert.ok(ko[mon],region+' '+mon);
  }
});
test('trainers have independent talent, missions and deterministic fixed outcome',()=>{
  const {api,game}=setup();
  const trainer=game.clubs[0].trainers[0];
  const skill=api.talent(trainer);
  assert.ok(skill.skill>=1&&skill.skill<=20);
  const mission=api.dispatch('1','관동','balanced');
  assert.equal(mission.ok,true);
  assert.equal(mission.mission.status,'travel');
  assert.equal(game.coins,600000000-15000);
  assert.equal(api.dispatch('1','관동','balanced').ok,false);
  assert.equal(game.coins,600000000-15000);
  const fixed=api.outcome(mission.mission,skill.skill,game.season);
  assert.deepEqual({...api.outcome(mission.mission,skill.skill,game.season)}, {...fixed});
  assert.equal(game.clubs[0].trainers[0].pokemon.length,6);
});
test('maximum two trainers dispatched per week, and same trainer cannot reroll',()=>{
  const {api,game,globals}=setup();
  assert.equal(api.dispatch('1','관동','growth').ok,true);
  assert.equal(api.dispatch('2','성도','rare').ok,true);
  assert.equal(api.dispatch('3','팔데아','balanced').ok,false);
  assert.equal(api.weekCount(),2);
  assert.equal(game.coins,600000000-15000-40000);
  assert.equal(api.resolvePlayer().length,0);
  globals.nextWeek();
  assert.equal(api.resolvePlayer().length,0,'already settled jobs never grant multiple rewards');
  assert.equal(api.dispatch('1','관동','growth').ok,
    game.clubs[0].trainers[0].pokemonScouting.candidate?false:true);
  assert.equal(game.clubs[0].trainers[0].pokemonScouting.mission.season,1);
  assert.equal(game.clubs[0].trainers[0].pokemonScouting.mission.week,2);
});
test('outcomes: unsuccessful searches leave all Pokémon and budget unchanged after dispatch',()=>{
  const {api,game}=setup();
  const original=JSON.stringify(game.clubs[0].trainers[0].pokemon);
  // Search for seeded cases of not-found and failed captures.
  let notFound,escaped;
  for(let seed=1;seed<100000&&(!notFound||!escaped);seed++){
    const result=api.outcome({region:'가라르',focus:'rare',seed},5,1);
    if(result.status==='not-found')notFound=result;
    if(result.status==='escaped')escaped=result;
  }
  assert.equal(notFound.status,'not-found');
  assert.equal(escaped.status,'escaped');
  assert.equal(JSON.stringify(game.clubs[0].trainers[0].pokemon),original);
  assert.equal(game.scout,0);
});
test('capture is retained with the original trainer until approval and cannot overwrite slot 7',()=>{
  const {api,game,globals,confirm}=setup();
  const t=game.clubs[0].trainers[0],initial=JSON.stringify(t.pokemon);
  const m=api.dispatch('1','호연','growth');
  assert.ok(m.ok);
  let successfulSeed;
  for(let seed=1;seed<1000;seed++){
    if(api.outcome({...m.mission,seed},api.talent(t).skill,1).status==='captured'){
      successfulSeed=seed;break;
    }
  }
  assert.ok(successfulSeed);
  m.mission.seed=successfulSeed;
  globals.nextWeek();
  assert.ok(t.pokemonScouting.candidate);
  assert.equal(JSON.stringify(t.pokemon),initial,'no silent Pokémon replacement');
  assert.equal(t.pokemon.length,6);
  assert.equal(api.recruit('1',6).ok,false);
  confirm(false);
  assert.equal(api.recruit('1',1).ok,false);
  assert.equal(JSON.stringify(t.pokemon),initial);
  confirm(true);
  const newPokemon=t.pokemonScouting.candidate;
  const result=api.recruit('1',1);
  assert.equal(result.ok,true);
  assert.equal(t.pokemon.length,6);
  assert.equal(t.pokemon[1],newPokemon);
  assert.equal(t.pokemon[1].careerSeasons,1);
  assert.ok(t.pokemon[1].pa>=t.pokemon[1].ca);
  assert.equal(game.releasedPokemon[0].name,'피카츄');
  assert.equal(game.scout,1);
  assert.equal(t.pokemonScouting.candidate,undefined);
  assert.equal(api.recruit('1',0).ok,false,'no duplicate registration');
});
test('captured Pokémon is compatible with actual Showdown battle adapter',()=>{
  const {api,game,globals}=setup();
  const t=game.clubs[0].trainers[0],m=api.dispatch('1','팔데아','power');
  for(let seed=1;seed<1000;seed++){
    if(api.outcome({...m.mission,seed},api.talent(t).skill,1).status==='captured'){
      m.mission.seed=seed;break;
    }
  }
  globals.nextWeek();
  const candidate=t.pokemonScouting.candidate;
  assert.ok(candidate);
  assert.ok(ko[candidate.name]);
  api.recruit('1',0);
  const ready=prepareClub(game.clubs[0],[0,1,2,3,4]);
  assert.equal(ready[0].team.length,6);
  assert.equal(ready[0].team[0].ca,candidate.ca);
  assert.equal(ready[0].team[0].pa,candidate.pa);
});
test('trainer-specific captured candidates cannot be claimed by another trainer',()=>{
  const {api,game,globals}=setup();
  const a=game.clubs[0].trainers[0],b=game.clubs[0].trainers[1];
  const ma=api.dispatch('1','관동','balanced');
  assert.ok(ma.ok);
  let seed=1;
  while(api.outcome({...ma.mission,seed},api.talent(a).skill,1).status!=='captured')seed++;
  ma.mission.seed=seed;globals.nextWeek();
  assert.ok(a.pokemonScouting.candidate);
  assert.equal(api.recruit('2',0).ok,false);
  assert.equal(b.pokemonScouting?.candidate,undefined);
  assert.equal(a.pokemonScouting.candidate.name,api.outcome(ma.mission,api.talent(a).skill,1).name);
});
test('scout experience improves independently without changing tactical skill and old team',()=>{
  const {api,game}=setup();
  const t=game.clubs[0].trainers[0],tactics=t.tactics;
  const s=api.talent(t);s.experience=3;s.skill=10;
  s.mission={region:'관동',focus:'balanced',season:1,week:1,status:'travel',seed:1};
  game.week=2;assert.equal(api.resolvePlayer().length,1);
  assert.equal(s.skill,11);assert.equal(s.experience,0);
  assert.equal(t.tactics,tactics);
  assert.equal(t.pokemon.length,6);
});
