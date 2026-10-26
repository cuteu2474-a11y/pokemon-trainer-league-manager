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
    const trainer={tactics:20,switching:18,
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
  assert.match(before,/trainer\.directorBehaviorAdvice=p\.behaviors/);
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
