import test from 'node:test';
import assert from 'node:assert/strict';
import {analyzeSwitchOutcomes,analyzeAceHandoffs} from '../src/battle/switch-outcome.js';
import {simulateSixVsSix} from '../src/battle/showdown.js';
import {simulateClubMatch} from '../src/battle/club-match.js';

test('post-switch HP loss counts damage and hazards, not healing or forced entries',()=>{
 const log=[
 '|switch|p1a: Open|Pikachu|100/100',
 '|turn|1',
 '|switch|p1a: Reserve|Blastoise|80/100',
 '|-damage|p1a: Reserve|60/100|[from] Stealth Rock',
 '|-heal|p1a: Reserve|70/100|[from] Leftovers',
 '|-damage|p1a: Reserve|50/100',
 '|switch|p2a: Enemy|Eevee|40/100',
 '|turn|2',
 '|switch|p1a: Pivot|Rotom-Wash|35/100|[from] Volt Switch',
 '|turn|3',
 '|switch|p2a: Second|Garchomp|60/100',
 '|-damage|p2a: Second|0 fnt',
 '|faint|p2a: Second',
 '|turn|4'
 ].join('\n');
 const decisions={
  p1:{switchEvents:[{turn:1,target:'Reserve'}]},
  p2:{switchEvents:[{turn:3,target:'Second'}]}
 };
 const out=analyzeSwitchOutcomes(log,decisions);
 assert.equal(out.bySide.p1.matched,1);
 assert.equal(out.bySide.p1.choices,1);
 assert.equal(out.bySide.p1.damaged,1);
 assert.equal(out.bySide.p1.windowDeaths,0);
 assert.equal(out.bySide.p1.meanHpLossFraction,.4);
 assert.equal(out.bySide.p2.windowDeaths,1);
 assert.equal(out.bySide.p2.totalHpLossFraction,.6);
 const first=out.switches.find(x=>x.side==='p1');
 assert.equal(first.species,'Blastoise');
 assert.equal(first.hpLost,40,'20 lost, 10 healed, then 20 lost');
 assert.equal(first.exitHp,50);
 assert.equal(first.survivedWindow,true);
 assert.equal(first.observedUntilNextTurn,true);
 assert.ok(out.switches.every(x=>!['Open','Pivot','Enemy'].includes(x.target)),
   'first leads, forced pivots and unchosen opponent switches are not voluntary');
});

test('unmatched decisions are visible rather than guessed from unrelated switches',()=>{
 const log='|turn|1\n|switch|p1a: Other|Eevee|100/100\n|turn|2';
 const out=analyzeSwitchOutcomes(log,{p1:{switchEvents:[
  {turn:1,target:'Expected'}, {turn:2,target:'Other'}]}});
 assert.equal(out.bySide.p1.choices,2);
 assert.equal(out.bySide.p1.matched,0);
 assert.equal(out.bySide.p1.unmatched,2);
 assert.equal(out.switches.length,0);
});

const keys=['hp','atk','def','spa','spd','spe'];
const ca=n=>Object.fromEntries(keys.map(s=>[s,n]));
const mon=(species,id,skills,caValue)=>({
 pokemonId:id,name:id,species,moves:skills,nature:'Hardy',
 statCA:ca(caValue),statPA:ca(180)
});
const state=(id,hp,maxhp,pp)=>({
 pokemonId:id,hp,maxhp,pp:[pp],moves:[{id:'psychic',pp,maxpp:16}]
});

test('ace readiness measures actual next-opponent PP, HP and survival, not a win probability',()=>{
 const a=[mon('Mewtwo','ace',['psychic'],170),
   ...Array.from({length:5},(_,i)=>mon('Magikarp','fish'+i,['splash'],65))];
 const club=[{team:a}];
 const round0={winner:'A',trainerA:0,trainerB:0,result:{
  finalState:{p1:[state('ace',95,200,0)]}}};
 const round1={winner:'B',trainerA:0,trainerB:1,result:{
  initialStats:{p1:[state('ace',115,200,0)]},
  finalState:{p1:[state('ace',0,200,0)]}}};
 const out=analyzeAceHandoffs([round0,round1],club,'A');
 assert.equal(out.handoffs,1);
 assert.equal(out.alive,1);
 assert.equal(out.ready,0,'no usable attacking PP for the next trainer');
 assert.equal(out.stoodNextDuel,0);
 assert.equal(out.records[0].hpBeforeRecoveryFraction,.475);
 assert.equal(out.records[0].hpAfterRecoveryFraction,.575);
 assert.equal(out.records[0].remainingAttackingPP,0);
 const usable=structuredClone(round1);
 usable.result.initialStats.p1[0].pp=[8];
 usable.result.finalState.p1[0].hp=30;
 const next=analyzeAceHandoffs([round0,usable],club,'A');
 assert.equal(next.ready,1);
 assert.equal(next.stoodNextDuel,1);
 assert.equal(next.leadKnown,0,'no lead information is not guessed');
 const immune=structuredClone(usable);
 immune.result.log='|switch|p2a: foe|Umbreon|100/100';
 const resultImmune=analyzeAceHandoffs([round0,immune],club,'A');
 assert.equal(resultImmune.ready,1,'Psychic PP remains available');
 assert.equal(resultImmune.leadKnown,1);
 assert.equal(resultImmune.readyVsLead,0,'Psychic cannot hit the observed Dark lead');
 assert.equal(resultImmune.records[0].bestCoverage,0);
 const neutral=structuredClone(usable);
 neutral.result.log='|switch|p2a: foe|Machamp|100/100';
 const resultNeutral=analyzeAceHandoffs([round0,neutral],club,'A');
 assert.equal(resultNeutral.readyVsLead,1);
 assert.ok(resultNeutral.records[0].bestCoverage>=1);
});

test('anonymous reserve IDs map to the same strongest Pokémon in subsequent duel',()=>{
 const team=[mon('Mewtwo','placeholder',['psychic'],170),
  ...Array.from({length:5},(_,i)=>mon('Magikarp','fish'+i,['splash'],65))]
 .map(x=>{const {pokemonId,name,...rest}=x;return rest;});
 const before=state('relay:A:0:0',100,200,4);
 const after=state('relay:A:0:0',120,200,4);
 const rounds=[
  {winner:'A',trainerA:0,result:{finalState:{p1:[before]}}},
  {winner:'B',trainerA:0,result:{initialStats:{p1:[after]},
   finalState:{p1:[{...after,hp:60}]}}}
 ];
 assert.equal(analyzeAceHandoffs(rounds,[{team}],'A').ready,1);
});

test('live Showdown confirms observed voluntary switch windows match commands',
 {timeout:30000},async()=>{
 const base=['hp','atk','def','spa','spd','spe'].reduce((o,k)=>(o[k]=125,o),{});
 const make=(species,moves,i)=>({
  pokemonId:'p'+i,name:species+'-'+i,species,moves,
  nature:'Hardy',statCA:base,statPA:base
 });
 const a=[
  make('Gyarados',['waterfall','earthquake','dragondance'],0),
  make('Scizor',['bulletpunch','uturn'],1),
  make('Arcanine',['flamethrower','willowisp'],2),
  make('Mewtwo',['psychic','icebeam'],3),
  make('Togekiss',['airslash','roost'],4),
  make('Venusaur',['energyball','synthesis'],5)];
 const b=[
  make('Garchomp',['earthquake','dragonclaw'],0),
  make('Rotom-Wash',['hydropump','voltswitch'],1),
  make('Dragonite',['dragonclaw','earthquake'],2),
  make('Greninja',['surf','icebeam'],3),
  make('Excadrill',['earthquake','ironhead'],4),
  make('Blissey',['seismictoss','softboiled'],5)];
 const r=await simulateSixVsSix(a,b,{seed:[11,23,31,43],maxTurns:45,
   trainerA:{tactics:20,switching:20},trainerB:{tactics:10,switching:10}});
 assert.ok(r.aiDecisions.p1.voluntarySwitches>0,'scenario has genuine voluntary switches');
 assert.equal(r.switchOutcomes.bySide.p1.choices,r.aiDecisions.p1.voluntarySwitches);
 assert.equal(r.switchOutcomes.bySide.p1.unmatched,0);
 assert.equal(r.switchOutcomes.bySide.p2.unmatched,0);
 assert.ok(r.switchOutcomes.bySide.p1.damaged>=1);
 assert.ok(r.switchOutcomes.switches.every(x=>x.hpLost>=0&&x.maxhp>0));
});

test('real five-trainer relay exposes readiness summaries and no forged switch matches',
 {timeout:45000},async()=>{
 const mkTeam=(species,moves,n,label)=>Array.from({length:6},(_,i)=>
  mon(species,label+'-'+i,moves,n));
 const expert=Array.from({length:5},(_,i)=>({team:mkTeam('Mewtwo',
  ['psychic','thunderbolt','icebeam','recover'],150,'A'+i),tactics:20,switching:20}));
 const novice=Array.from({length:5},(_,i)=>({team:mkTeam('Magikarp',
  ['tackle','flail','splash'],80,'B'+i),tactics:3,switching:3}));
 const r=await simulateClubMatch(expert,novice,{seed:[1,2,3,4],maxTurns:140});
 assert.ok(r.rounds.length>=5);
 assert.equal(r.aceHandoffs.A.handoffs,r.rounds.length-1);
 assert.ok(r.aceHandoffs.A.alive>0);
 for(const duel of r.rounds)for(const side of ['p1','p2']){
  const outcome=duel.result.switchOutcomes.bySide[side];
  assert.equal(outcome.choices,outcome.matched+outcome.unmatched);
 }
});
