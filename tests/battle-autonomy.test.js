import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {resolveBattleAutonomy,relationshipAfterMatch,trainerPersonality} from '../src/battle/battle-autonomy.js';
import {prepareClub} from '../src/web/match-service.js';
import {simulateSixVsSix} from '../src/battle/showdown.js';
import {TrainerAI} from '../src/battle/trainer-ai.js';

const species='Mewtwo';
const gp={hp:94,atk:0,def:31,spa:94,spd:0,spe:94};
const team=(pokemonSpecies,abilities={})=>Array.from({length:6},(_,i)=>({
  name:pokemonSpecies+i,species:pokemonSpecies,level:50,nature:'Hardy',
  moves:pokemonSpecies==='Magikarp'?['tackle','flail','splash']:
    ['psychic','thunderbolt','icebeam','shadowball'],
  ca:200,pa:200,gp:{...gp},...abilities,
}));
test('different personalities accept, compromise or reject the same coach advice',()=>{
  const favorable=resolveBattleAutonomy({
    tactics:20,autonomyAI:{preferredPlay:'control',openness:20,conviction:3},
    directorAdvice:'offense',
  },80);
  const independent=resolveBattleAutonomy({
    tactics:2,autonomyAI:{preferredPlay:'control',openness:3,conviction:20},
    directorAdvice:'offense',
  },15);
  const mixed=resolveBattleAutonomy({
    tactics:18,autonomyAI:{preferredPlay:'control',openness:15,conviction:9},
    directorAdvice:'offense',
  },60);
  assert.equal(favorable.response,'수용');assert.equal(favorable.plan,'offense');
  assert.equal(independent.response,'거부');assert.equal(independent.plan,'control');
  assert.equal(mixed.response,'절충');assert.equal(mixed.plan,'control');
  assert.equal(mixed.secondaryPlan,'offense');
  assert.equal(resolveBattleAutonomy({autonomyAI:{preferredPlay:'tempo'}},50).plan,'tempo');
  assert.equal(relationshipAfterMatch({trust:50,response:'거부',won:true}),52);
  assert.equal(relationshipAfterMatch({trust:50,response:'거부',won:false}),48);
  assert.equal(relationshipAfterMatch({trust:50,response:'자율',won:false}),50);
});
test('confirmed trainer order carries autonomy and a legal unchanged Pokémon move set',()=>{
  const club={trainers:Array.from({length:5},(_,i)=>({
    id:'t'+i,name:'트레이너 '+i,tactics:18,switching:17,
    autonomyAI:{preferredPlay:i===2?'endurance':'offense',openness:15,conviction:9},
    directorAdvice:i===2?'control':null,directorTrust:60,
    pokemon:Array.from({length:6},()=>({name:'뮤츠',species:'Mewtwo',level:50,ca:200,pa:200,gp:{...gp},
      moves:['psychic','thunderbolt','icebeam','shadowball']})),
  }))};
  const prepared=prepareClub(club,[2,0,1,3,4]);
  assert.equal(prepared[0].name,'트레이너 2');
  assert.equal(prepared[0].aiProfile.preferred,'endurance');
  assert.equal(prepared[0].aiProfile.requested,'control');
  assert.ok(['수용','절충','거부'].includes(prepared[0].aiProfile.response));
  assert.deepEqual(prepared[0].team[0].moves,['psychic','thunderbolt','icebeam','shadowball']);
  assert.equal(prepared[1].aiProfile.response,'자율');
  assert.equal(prepared[1].battlePlan,'offense');
});
test('trainer styles produce different legal moves in the same public matchup',()=>{
  const make=style=>{
    const trainer={tactics:20,switching:12,battlePlan:style,
      autonomyAI:{preferredPlay:style,openness:10,conviction:12}};
    const ai=new TrainerAI({}, {...trainer,aiProfile:resolveBattleAutonomy(trainer,50)},
      {seed:[1,2,3,4],team:[{species:'Pikachu',ability:'Static'}]});
    ai.foeSpecies='Blastoise';
    ai.ownActive={species:'Pikachu',ability:'Static'};
    return ai;
  };
  const options=[{choice:'move 1',move:{id:'thunderwave'}},
    {choice:'move 2',move:{id:'quickattack'}}];
  assert.equal(make('control').chooseMove({},options),'move 1');
  assert.equal(make('offense').chooseMove({},options),'move 2');
});
test('actual Showdown turn policy records analysis and choice reasons without changing battle laws',
  {timeout:45000},async()=>{
    const trainerA={tactics:20,switching:19,moveJudgment:20,resourceManagement:20,
      battlePlan:'endurance',aiProfile:resolveBattleAutonomy({
        tactics:20,switching:19,autonomyAI:{preferredPlay:'endurance',openness:16,conviction:8},
        directorAdvice:'control'},65)};
    const result=await simulateSixVsSix(team(species),team('Magikarp'),{
      trainerA,trainerB:{tactics:1,switching:1},seed:[5,6,7,8],
    });
    assert.equal(result.winner,'Club A');
    const choices=result.aiDecisions.p1;
    assert.ok(choices.moves>0);
    assert.equal(choices.plan,'endurance');
    assert.ok(choices.trace.length>0);
    assert.ok(Object.keys(choices.reasons).length>0);
  });
test('match UI uses recommendations, not mandatory battlePlan overrides',()=>{
  const html=readFileSync(new URL('../assets/matchday.js',import.meta.url),'utf8');
  assert.match(html,/trainer\.directorAdvice=p\.plans/);
  assert.match(html,/trainer\.directorTrust=game\.trainerAI/);
  assert.match(html,/감독 권고 및 트레이너 AI 판단/);
  assert.doesNotMatch(html,/trainer\.battlePlan=p\.plans/);
});
