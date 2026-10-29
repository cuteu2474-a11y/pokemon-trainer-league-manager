import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {runInNewContext} from 'node:vm';
import {Dex} from '@pkmn/sim';
import {resolveBattleAutonomy} from '../src/battle/battle-autonomy.js';
import {TRAITS,traitValue,statusIsUseful,assessMoveTraits,switchTraitBonus} from '../src/battle/trait-decision.js';
import {TrainerAI} from '../src/battle/trainer-ai.js';
import {simulateSixVsSix} from '../src/battle/showdown.js';

const makeProfile=(kind,score=100,advice=null)=>{
  const trainer={tactics:20,switching:18,autonomyAI:{
    openness:19,conviction:3,habitScores:{[kind]:score},
    preferredPlay:'balanced',playTraits:score===100?[TRAITS[kind].name]:[],
  },directorBehaviorAdvice:advice,directorTrust:80};
  return resolveBattleAutonomy(trainer,80);
};
const setup=(ownTypes=['Electric'],foeTypes=['Water'],foeStatus='')=>{
  const own={hp:180,maxhp:200,types:ownTypes,getTypes:()=>ownTypes,
    moveSlots:[{id:'thunderbolt',pp:1,maxpp:15},{id:'discharge',pp:10,maxpp:15}]};
  const foe={hp:90,maxhp:150,types:foeTypes,getTypes:()=>foeTypes,status:foeStatus};
  return {p1:{active:[own],sideConditions:{}},p2:{active:[foe],sideConditions:{}}};
};
test('all seven traits and matchday directives have stable distinct ids',()=>{
  assert.deepEqual(Object.keys(TRAITS),['kill','switch','matchup','preserve','pp','status','analysis']);
  for(const kind of Object.keys(TRAITS)){
    assert.ok(TRAITS[kind].name);
    const approved=makeProfile(kind,0,kind);
    assert.equal(approved.behaviorResponse,'수용');
    assert.equal(approved.behaviorAdvice,kind);
    assert.ok(traitValue(approved,kind)>0);
    assert.equal(makeProfile(kind,0).behaviorAdvice,null);
  }
  const rejecting=resolveBattleAutonomy({tactics:2,autonomyAI:{
    preferredPlay:'offense',openness:3,conviction:20
  },directorBehaviorAdvice:'pp'},15);
  assert.equal(rejecting.behaviorResponse,'거부');
  assert.equal(traitValue(rejecting,'pp'),0);
});
test('kill trait rewards simulated Showdown first-turn KO likelihood and respects accuracy',()=>{
  const battle=setup(),move=Dex.moves.get('thunderbolt');
  const profile=makeProfile('kill');
  const guaranteed=assessMoveTraits({move,battle,profile,forecast:{koRate:1}});
  const unlikely=assessMoveTraits({move,battle,profile,forecast:{koRate:.1}});
  const baseline=assessMoveTraits({move,battle,profile:makeProfile('kill',0),forecast:{koRate:1}});
  assert.ok(guaranteed.bonus>unlikely.bonus);
  assert.ok(guaranteed.bonus>baseline.bonus);
  assert.equal(guaranteed.quality.kill,true);
  assert.equal(unlikely.quality.kill,false);
});
test('status experts do not prefer ineffective or already applied conditions',()=>{
  const move=Dex.moves.get('willowisp'),profile=makeProfile('status');
  const water=setup(['Ghost'],['Water']);
  const immune=setup(['Ghost'],['Fire']);
  const taken=setup(['Ghost'],['Water'],'brn');
  assert.equal(statusIsUseful(move,water.p2.active[0]),true);
  assert.equal(statusIsUseful(move,immune.p2.active[0]),false);
  assert.equal(statusIsUseful(move,taken.p2.active[0]),false);
  const useful=assessMoveTraits({move,battle:water,profile});
  const invalid=assessMoveTraits({move,battle:immune,profile});
  assert.ok(useful.bonus>0);
  assert.equal(useful.quality.status,true);
  assert.ok(invalid.bonus<0);
});
test('PP expert saves a scarce move only if a comparable damaging alternative is legal',()=>{
  const battle=setup(),profile=makeProfile('pp');
  const thunder=Dex.moves.get('thunderbolt'),discharge=Dex.moves.get('discharge');
  const scarce=assessMoveTraits({move:thunder,battle,profile,remaining:4,options:[thunder,discharge]});
  const saved=assessMoveTraits({move:discharge,battle,profile,remaining:4,options:[thunder,discharge]});
  assert.ok(scarce.bonus<0);assert.ok(saved.bonus>0);
  assert.equal(saved.quality.pp,true);
  const immediate=assessMoveTraits({move:thunder,battle,profile,remaining:4,
    options:[thunder,discharge],forecast:{koRate:1}});
  assert.equal(immediate.bonus,0,'a knockout must not be overridden just to save PP');
  assert.equal(assessMoveTraits({move:thunder,battle,profile,remaining:1,
    options:[thunder,discharge]}).bonus,0,'last relay challenger needs no conservation');
});
test('matchup expert values real defensive improvement and avoids fatal entry hazards',()=>{
  const profile=makeProfile('matchup');
  const useful=switchTraitBonus(profile,{currentThreat:4,nextThreat:.5,health:.9,offense:2,hazards:.10});
  const hazard=switchTraitBonus(profile,{currentThreat:4,nextThreat:.5,health:.3,offense:2,hazards:.30});
  const notImproved=switchTraitBonus(profile,{currentThreat:2,nextThreat:4,health:.9,offense:2});
  assert.ok(useful.bonus>0);assert.equal(useful.quality.matchup,true);
  assert.equal(hazard.bonus,0);assert.equal(notImproved.bonus,0);
});
test('real replay confirms direct knockouts and status applications but not indirect poison KO',()=>{
  const file=readFileSync(new URL('../assets/matchday.js',import.meta.url),'utf8');
  const start=file.indexOf('/* Trainer career and relationship — persistent experience from played matches. */');
  assert.ok(start>=0);
  const global={};
  runInNewContext(file.slice(start),{window:global,document:undefined,game:null,
    myClub:()=>null,persist:()=>{},renderOffice:()=>{},escapeHTML:String,console});
  const parse=global.TrainerCareer.actualBattleEvents;
  assert.deepEqual({...parse(
    '|move|p1a: Pikachu|Thunderbolt|p2a: Magikarp\n'+
    '|-damage|p2a: Magikarp|0 fnt\n|faint|p2a: Magikarp\n'+
    '|move|p1a: Pikachu|Thunder Wave|p2a: Arcanine\n'+
    '|-status|p2a: Arcanine|par\n|turn|3', 'p1')},{kill:1,status:1});
  assert.deepEqual({...parse(
    '|move|p1a: Pikachu|Thunderbolt|p2a: Magikarp\n'+
    '|-damage|p2a: Magikarp|0 fnt|[from] psn\n|faint|p2a: Magikarp','p1')},{kill:0,status:0});
});
test('trained status and PP habits actually choose different legal moves at equal battle state',()=>{
  const make=(kind,score,moves,{ownTypes=['Electric'],foeTypes=['Water']}={})=>{
    const own={hp:140,maxhp:180,types:ownTypes,getTypes:()=>ownTypes,
      moveSlots:moves.map(([id,pp,maxpp])=>({id,pp,maxpp}))};
    const foe={hp:120,maxhp:150,types:foeTypes,getTypes:()=>foeTypes,status:''};
    const battle={requestState:'idle',p1:{active:[own],sideConditions:{}},
      p2:{active:[foe],sideConditions:{}}};
    const trainer={tactics:20,switching:18,relayOpponentsRemaining:4,
      autonomyAI:{preferredPlay:'balanced',openness:15,conviction:10,
        habitScores:{[kind]:score}}};
    const ai=new TrainerAI({}, {...trainer,aiProfile:resolveBattleAutonomy(trainer,50)},
      {seed:[1,2,3,4],team:[{species:'Pikachu'}],battleProvider:()=>battle});
    ai.ownActive={species:'Pikachu'};ai.foeSpecies='Blastoise';ai.prng.random=()=>0;
    return ai.chooseMove({},moves.map(([id],i)=>({choice:'move '+(i+1),move:{id}})));
  };
  const ppMoves=[['thunderbolt',1,15],['discharge',10,15]];
  assert.equal(make('pp',0,ppMoves),'move 1','untrained AI favors raw attack strength');
  assert.equal(make('pp',100,ppMoves),'move 2','trained AI saves scarce PP');
  const statusMoves=[['willowisp',10,10],['tackle',10,10]];
  assert.equal(make('status',0,statusMoves,{ownTypes:['Ghost']}),'move 2');
  assert.equal(make('status',100,statusMoves,{ownTypes:['Ghost']}),'move 1');
});
test('pre-match meeting UI permits all seven valid advice categories',()=>{
  const source=readFileSync(new URL('../assets/matchday.js',import.meta.url),'utf8');
  const before=source.slice(0,source.indexOf('/* Pokemon artwork UI'));
  for(const k of Object.keys(TRAITS)){
    assert.match(before,new RegExp(k+":"));
  }
  assert.match(before,/t\.directorBehaviorAdvice=p\.behaviors\?\.\[i\]\|\|null/);
});
test('battle simulation still uses legal Showdown damage and reports real decisive actions',
  {timeout:45000},async()=>{
    const gp={hp:94,atk:0,def:31,spa:94,spd:0,spe:94};
    const team=(name,moves)=>Array.from({length:6},(_,i)=>({
      name:name+i,species:name,level:50,ca:200,pa:200,gp:{...gp},moves,
    }));
    const result=await simulateSixVsSix(team('Mewtwo',['psychic','thunderbolt','icebeam','shadowball']),
      team('Magikarp',['tackle','flail','splash']),{
        trainerA:{tactics:20,switching:19,aiProfile:makeProfile('kill')},
        trainerB:{tactics:2,switching:2},seed:[7,8,9,10]});
    assert.equal(result.winner,'Club A');
    assert.ok(result.aiDecisions.p1.moves>0);
    assert.ok(result.aiDecisions.p1.trace.some(x=>x.quality?.koRate>0));
    assert.ok(result.log.includes('|faint|p2'));
  });

test('learned kill habit favors legal priority finisher and records use without manager advice',()=>{
 const own={hp:180,maxhp:200,types:['Water','Fairy'],getTypes:()=>['Water','Fairy'],
  moveSlots:[{id:'aquajet',pp:10,maxpp:20},{id:'waterpulse',pp:12,maxpp:20}]};
 const foe={hp:8,maxhp:100,types:['Fire'],getTypes:()=>['Fire'],status:''};
 const battle={requestState:'idle',turn:4,p1:{active:[own],sideConditions:{}},
   p2:{active:[foe],sideConditions:{}}};
 function choose(experienced){
   const trainer={tactics:20,switching:16,relayOpponentsRemaining:3,
     autonomyAI:{preferredPlay:'balanced',habitScores:{kill:experienced?100:0},
       playTraits:experienced?['킬각 포착']:[]}};
   const ai=new TrainerAI({}, {...trainer,aiProfile:resolveBattleAutonomy(trainer,50)},
     {seed:[1,2,3,4],team:[{species:'Azumarill'}],battleProvider:()=>battle});
   ai.ownActive={species:'Azumarill'};ai.foeSpecies='Arcanine';
   const choice=ai.chooseMove({},[
     {choice:'move 1',move:{id:'aquajet'}},{choice:'move 2',move:{id:'waterpulse'}}]);
   return {choice,ai};
 }
 const newTrainer=choose(false),veteran=choose(true);
 assert.equal(newTrainer.choice,'move 2');
 assert.equal(veteran.choice,'move 1');
 assert.equal(veteran.ai.profile.behaviorAdvice,null);
 assert.equal(veteran.ai.decisions.traitUses.kill,1);
 assert.equal(newTrainer.ai.decisions.traitUses.kill,undefined);
});

test('learned ace preservation favors measured recovery only at meaningful relay HP',()=>{
 const own={hp:90,maxhp:200,types:['Psychic'],getTypes:()=>['Psychic'],
   moveSlots:[{id:'recover',pp:5,maxpp:10},{id:'waterfall',pp:25,maxpp:35}]};
 const foe={hp:95,maxhp:100,types:['Normal'],getTypes:()=>['Normal'],status:''};
 const battle={requestState:'idle',turn:6,p1:{active:[own],sideConditions:{}},
   p2:{active:[foe],sideConditions:{}}};
 function choose(trained){
   const trainer={tactics:20,switching:16,relayOpponentsRemaining:3,
     autonomyAI:{preferredPlay:'balanced',habitScores:{preserve:trained?100:0},
       playTraits:trained?['에이스 보존']:[]}};
   const ai=new TrainerAI({}, {...trainer,aiProfile:resolveBattleAutonomy(trainer,50)},
     {seed:[1,2,3,4],team:[{species:'Mew'}],battleProvider:()=>battle});
   ai.ownActive={species:'Mew'};ai.foeSpecies='Eevee';
   return {choice:ai.chooseMove({},[
    {choice:'move 1',move:{id:'recover'}},{choice:'move 2',move:{id:'waterfall'}}]),ai};
 }
 assert.equal(choose(false).choice,'move 2');
 const experienced=choose(true);
 assert.equal(experienced.choice,'move 1');
 assert.equal(experienced.ai.decisions.traitUses.preserve,1);
 const final=assessMoveTraits({move:Dex.moves.get('recover'),
   battle,profile:makeProfile('preserve'),remaining:1});
 const full={p1:{active:[{...own,hp:200}]},p2:{active:[foe]}};
 assert.equal(final.quality.preserve,false);
 assert.equal(final.bonus,0);
 assert.equal(assessMoveTraits({move:Dex.moves.get('recover'),
   battle:full,profile:makeProfile('preserve'),remaining:4}).bonus,0);
});

test('actual selected trait actions are tracked across all seven kinds without double counting candidates',()=>{
 const trainer={tactics:20,autonomyAI:{
   playTraits:Object.values(TRAITS).map(x=>x.name),
   habitScores:Object.fromEntries(Object.keys(TRAITS).map(k=>[k,100]))}};
 const ai=new TrainerAI({}, {...trainer,aiProfile:resolveBattleAutonomy(trainer,50)},
  {seed:[3,4,5,6]});
 ai.record('move','move 1','ordinary',{quality:{kill:false}});
 assert.deepEqual(ai.decisions.traitUses,{});
 ai.record('move','move 1','chosen finisher',{quality:{killOpportunity:true,pp:true}});
 ai.record('move','move 2','recovery',{quality:{preserve:true,status:true}});
 ai.record('switch','2','favorable counter',{quality:{switch:true,matchup:true}});
 ai.record('move','move 3','tactical forecast',{quality:{analysis:true}});
 assert.deepEqual(ai.decisions.traitUses,{
   kill:1,pp:1,preserve:1,status:1,switch:1,matchup:1,analysis:1
 });
 assert.equal(ai.decisions.trace.length,5);
});
