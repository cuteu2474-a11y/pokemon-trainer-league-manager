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
    tab:'home',renderOffice(){renders++},nextWeek(){g.week++},
    myClub(){return g.clubs[0]},worldClubRegion(){return '관동'},
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
  const waiting=Boolean(game.clubs[0].trainers[0].pokemonScouting.candidate);
  const second=api.dispatch('1','관동','growth');
  assert.equal(second.ok,!waiting);
  assert.equal(game.clubs[0].trainers[0].pokemonScouting.mission.season,1);
  assert.equal(game.clubs[0].trainers[0].pokemonScouting.mission.week,waiting?1:2);
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


test('all 9 regions have 5 habitat encounter pools of real native Pokémon',()=>{
  const {api}=setup();
  assert.deepEqual(Object.keys(api.HABITATS).sort(),['cave','forest','grass','mountain','sea']);
  assert.deepEqual(Object.keys(api.TIMES).sort(),['day','evening','morning','night']);
  for(const [region,habitats]of Object.entries(api.BIOMES)){
    assert.equal(Object.keys(habitats).length,5);
    for(const [habitat,mons]of Object.entries(habitats)){
      assert.ok(mons.length>=3,region+':'+habitat);
      assert.equal(new Set(mons).size,mons.length,'duplicate spawns');
      for(const name of mons){
        assert.ok(api.REGIONS[region].includes(name),'foreign species in '+region+'/'+habitat+': '+name);
        assert.ok(ko[name],'unknown species in '+region+'/'+habitat+': '+name);
      }
    }
  }
});
test('displayed probabilities equal the actual discovery and capture math in every region, habitat and time',()=>{
  const {api}=setup();
  for(const region of Object.keys(api.REGIONS)){
    for(const habitat of Object.keys(api.HABITATS)){
      for(const time of Object.keys(api.TIMES)){
        const table=api.encounterTable(region,habitat,time,'rare',13);
        const sum=(key)=>table.pokemon.reduce((total,x)=>total+x[key],0);
        assert.ok(Math.abs(sum('encounterRate')-1)<1e-10);
        assert.ok(Math.abs(sum('findRate')-table.findChance)<1e-10);
        assert.ok(Math.abs(sum('captureRate')-table.totalCaptureChance)<1e-10);
        assert.ok(Math.abs(table.findChance+table.noEncounterChance-1)<1e-10);
        assert.ok(table.totalCaptureChance<=table.findChance);
        for(const p of table.pokemon){
          assert.ok(p.encounterRate>0&&p.findRate>0);
          assert.ok(Math.abs(p.captureRate-p.findRate*p.captureIfFound)<1e-12);
        }
      }
    }
  }
});
test('ecology and time of day produce visibly different species and appearance probabilities',()=>{
  const {api}=setup();
  const sea=api.encounterTable('관동','sea','day','balanced',12);
  const cave=api.encounterTable('관동','cave','day','balanced',12);
  assert.ok(sea.pokemon.some(x=>x.name==='쏘드라'));
  assert.equal(cave.pokemon.some(x=>x.name==='쏘드라'),false);
  const caveDay=cave.pokemon.find(x=>x.name==='고오스');
  const caveNight=api.encounterTable('관동','cave','night','balanced',12)
    .pokemon.find(x=>x.name==='고오스');
  assert.ok(caveNight.encounterRate>caveDay.encounterRate);
  assert.ok(caveNight.findRate>0);
});
test('the pre-dispatch preview exposes species probabilities, habitat and time selection',()=>{
  const {api,game}=setup();
  const html=api.render();
  assert.match(html,/id="ps-region"/);
  assert.match(html,/id="ps-habitat"/);
  assert.match(html,/id="ps-time"/);
  assert.match(html,/id="ps-focus"/);
  assert.match(html,/ps-chances/);
  assert.match(html,/<th>발견<\/th>/);
  assert.match(html,/<th>포획<\/th>/);
  assert.match(html,/탐색력 <b>\d+\/20<\/b>/);
  assert.match(html,/포획력 <b>\d+\/20<\/b>/);
  assert.equal((html.match(/id="ps-send"/g)||[]).length,1);
  assert.equal((html.match(/<button /g)||[]).length,1,'no secondary actions before scouting');
  assert.doesNotMatch(html,/ps-team|ps-timeline/);
  assert.match(html,/고오스|쏘드라|피카츄|구구/);
  const cfg=api.data();
  cfg.region='관동';cfg.habitat='cave';cfg.time='night';
  const night=api.render();
  assert.match(night,/고오스/);
  assert.doesNotMatch(night,/>쏘드라</);
  const result=api.dispatch('1','관동','balanced','cave','night');
  assert.equal(result.ok,true);
  assert.equal(result.mission.habitat,'cave');
  assert.equal(result.mission.time,'night');
  assert.match(game.log[0],/동굴/);
  assert.match(game.log[0],/밤/);
});
test('invalid habitat or time is rejected before charging or mutating the trainer',()=>{
  const {api,game}=setup();
  const money=game.coins;
  assert.equal(api.dispatch('1','관동','rare','sky','night').ok,false);
  assert.equal(api.dispatch('1','관동','rare','sea','noon').ok,false);
  assert.equal(game.coins,money);
  assert.equal(game.clubs[0].trainers[0].pokemonScouting,undefined);
});
test('observed deterministic 30k expeditions follow the published probabilities',()=>{
  const {api}=setup();
  const table=api.encounterTable('관동','cave','night','rare',14);
  const observed=new Map();
  let found=0,captured=0;
  const count=30000;
  for(let i=0;i<count;i++){
    const result=api.outcome({seed:(i*2654435761)>>>0,
      region:'관동',habitat:'cave',time:'night',focus:'rare'},14,1);
    if(result.status!=='not-found')found++;
    if(result.status==='captured')captured++;
    if(result.name)observed.set(result.name,(observed.get(result.name)||0)+1);
  }
  assert.ok(Math.abs(found/count-table.findChance)<.025);
  assert.ok(Math.abs(captured/count-table.totalCaptureChance)<.025);
  for(const p of table.pokemon)
    assert.ok(Math.abs((observed.get(p.name)||0)/count-p.findRate)<.03,p.name);
});


test('independent trainer exploration and capture abilities alter distinct real probabilities',()=>{
  const {api}=setup();
  const weak={skill:3,captureSkill:3},finder={skill:19,captureSkill:3},
    catcher={skill:3,captureSkill:19};
  const query=stats=>api.encounterTable('관동','cave','night','balanced',stats);
  const base=query(weak),find=query(finder),capture=query(catcher);
  assert.ok(find.findChance>base.findChance,'higher search ability improves finding');
  assert.equal(find.totalCaptureChance>base.totalCaptureChance,true);
  assert.equal(capture.findChance,base.findChance,'capture ability must not change discovery');
  assert.ok(capture.totalCaptureChance>base.totalCaptureChance);
  assert.equal(find.pokemon.find(x=>x.name==='고오스').encounterRate,
    base.pokemon.find(x=>x.name==='고오스').encounterRate,
    'skill must not alter fixed species mix');
  for(const entry of [base,find,capture]){
    assert.ok(entry.totalCaptureChance<=entry.findChance);
  }
});
test('trainer selection displays that trainer exact scouting and capture rates',()=>{
  const {api,game}=setup();
  const a=game.clubs[0].trainers[0],b=game.clubs[0].trainers[1];
  a.pokemonScouting={skill:4,captureSkill:5};
  b.pokemonScouting={skill:18,captureSkill:19};
  const cfg=api.data();
  cfg.region='관동';cfg.habitat='sea';cfg.time='morning';cfg.focus='balanced';
  cfg.selectedTrainer=api.keyOf(a);
  const weak=api.render();
  const expectedWeak=api.encounterTable('관동','sea','morning','balanced',a.pokemonScouting);
  assert.match(weak,/탐색력 <b>4\/20<\/b>/);
  assert.match(weak,/포획력 <b>5\/20<\/b>/);
  assert.ok(weak.includes((expectedWeak.totalCaptureChance*100).toFixed(2)+'%'));
  cfg.selectedTrainer=api.keyOf(b);
  const strong=api.render();
  const expectedStrong=api.encounterTable('관동','sea','morning','balanced',b.pokemonScouting);
  assert.match(strong,/탐색력 <b>18\/20<\/b>/);
  assert.match(strong,/포획력 <b>19\/20<\/b>/);
  assert.ok(strong.includes((expectedStrong.totalCaptureChance*100).toFixed(2)+'%'));
  assert.ok(expectedStrong.totalCaptureChance>expectedWeak.totalCaptureChance);
  assert.ok(expectedStrong.findChance>expectedWeak.findChance);
});
test('starting the expedition snapshots both skill values against later trainer changes',()=>{
  const {api,game}=setup();
  const t=game.clubs[0].trainers[0],scout=api.talent(t);
  scout.skill=6;scout.captureSkill=8;
  const table=api.encounterTable('관동','cave','night','rare',scout);
  const started=api.dispatch('1','관동','rare','cave','night');
  assert.equal(started.ok,true);
  assert.equal(started.mission.scoutSkill,6);
  assert.equal(started.mission.captureSkill,8);
  const original=api.outcome(started.mission,scout,game.season);
  scout.skill=20;scout.captureSkill=20;
  assert.deepEqual({...api.outcome(started.mission,scout,game.season)}, {...original},
    'future improvements must not change in-flight encounter probabilities');
  const shipped=api.encounterTable('관동','cave','night','rare',
    {skill:started.mission.scoutSkill,captureSkill:started.mission.captureSkill});
  assert.equal(shipped.findChance,table.findChance);
  assert.equal(shipped.totalCaptureChance,table.totalCaptureChance);
});
