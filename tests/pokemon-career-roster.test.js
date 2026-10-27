import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {runInNewContext} from 'node:vm';

const source=readFileSync(new URL('../assets/pokemon-career-roster.js',import.meta.url),'utf8');
const mon=(uid,name,retirementSeason)=>({uid,name,power:65,careerSeasons:3,debutSeason:1,
  statCA:{hp:45,atk:55},statPA:{hp:70,atk:80},ownerTrainerId:'101',retirementSeason});
function setup(){
  const t={uid:101,name:'우리 트레이너',pokemon:Array.from({length:6},(_,i)=>mon('our:'+i,'피카츄')),
    pokemonReserve:[mon('reserve:0','이브이'),mon('reserve:1','고오스')]};
  const rival={uid:202,name:'라이벌',pokemon:Array.from({length:6},(_,i)=>mon('rival:'+i,'리자몽')),
    pokemonReserve:[mon('rival:reserve','거북왕')]};
  const academy={uid:303,name:'아카데미',pokemon:[mon('academy','가디')]};
  const free={uid:404,name:'자유계약',pokemon:[mon('free','잠만보')],pokemonReserve:[mon('free:reserve','꼬부기')]};
  const game={season:3,club:'우리 구단',log:[],hallOfFame:[],clubs:[
    {id:0,name:'우리 구단',trainers:[t],reserveTrainers:[],trainerAcademy:[academy]},
    {id:1,name:'라이벌 구단',trainers:[rival],reserveTrainers:[],trainerAcademy:[]}],
    freeAgents:[{trainer:free,formerClub:'이전 구단'}],trainerRetirementHistory:[]};
  const scope={window:{},game,
    freshGame:()=>game,preparePokemonCareers:()=>{},pokemonRetirements:()=>{},
    processTrainerRetirements:()=>{},transferValuation:()=>100000000,
    marketDisplayRow:item=>'<tr><td>'+item.t.pokemon.map(p=>p.name).join(' · ')+'</td></tr>',
    marketSelectedInfo:()=>'<div>포켓몬 구성</small><strong>6마리</strong></div>'+
      '<div>동반 이적하는 포켓몬 6마리</div><div>활동 3/8시즌</div><div class="fm-detail-btns">확인</div>',
    marketTarget:()=>({t,kind:'active'}),marketFreeSelected:-1,
    transferMarketHTML:()=>'<p>트레이너와 포켓몬 6마리가 함께 이동합니다.</p>',
    escapeHTML:String};
  runInNewContext(source,scope);
  return {api:scope.window.PokemonCareerRoster,game,t,rival,academy,free,scope};
}

test('individual careers are deterministic for 8–12 seasons and give legacy veterans two seasons of notice',()=>{
  const {api,game,t}=setup();
  assert.equal(t.pokemon.length,6);
  const observed=t.pokemon.map(p=>p.retirementSpan);
  assert.ok(observed.every(x=>x>=8&&x<=12));
  api.prepare(game);
  assert.equal(t.pokemon.every(p=>p.retirementSeason>=game.season+2),true);
  assert.deepEqual(t.pokemon.map(p=>p.retirementSpan),observed);
  const veteran=t.pokemon[0];veteran.careerSeasons=11;delete veteran.retirementSeason;
  api.prepare(game);
  assert.ok(veteran.retirementSeason>=game.season+2);
  veteran.retirementSeason=game.season+4;
  api.prepare(game);
  assert.equal(veteran.retirementSeason,game.season+4,'existing notices remain unchanged');
});

test('season settlement ages active, reserve, academy, free agents, and pending captures without auto replacements',()=>{
  const {api,game,t,academy,free}=setup();
  t.pokemon[1].retirementSeason=3;
  t.pokemonReserve[1].retirementSeason=3;
  academy.pokemon[0].retirementSeason=3;
  free.pokemonReserve[0].retirementSeason=3;
  t.pokemonScouting={candidate:mon('capture','파이리',3)};
  const notice=t.pokemonReserve[0];notice.retirementSeason=5;
  const report=api.settle(game);
  assert.equal(report.retired,5);
  assert.equal(t.pokemon.length,5);
  assert.equal(t.pokemonReserve.length,1);
  assert.equal(t.pokemonScouting.candidate,undefined);
  assert.equal(academy.pokemon.length,0);
  assert.equal(free.pokemonReserve.length,0);
  assert.equal(free.pokemon[0].careerSeasons,4);
  assert.equal(notice.careerSeasons,4);
  assert.equal(notice.retirementNoticeLogged,3);
  assert.equal(game.hallOfFame.length,4);
  assert.equal(game.retiredPokemon.length,5);
  const archived=game.retiredPokemon.find(e=>e.uid==='reserve:1');
  assert.equal(archived.pokemon.statPA.atk,80);
  assert.equal(archived.ownerTrainerId,'101');
  assert.equal(api.settle(game).alreadySettled,true);
  assert.equal(game.retiredPokemon.length,5,'reloading cannot settle twice');
});

test('a retiring trainer archives every owned Pokémon and preserves academy trainees',()=>{
  const {api,game,t,academy,scope}=setup();
  scope.processTrainerRetirements=()=>{
    game.clubs[0].trainers.splice(0,1);
    game.hallOfFame.unshift({name:t.pokemon[0].name,trainer:t.name,club:'우리 구단',
      reason:'담당 트레이너 은퇴',season:3});
    game.trainerRetirementHistory.unshift({season:3,club:'우리 구단',name:t.name});
  };
  // Re-run the integration with the retirement implementation available before loading.
  runInNewContext(source,scope);
  scope.processTrainerRetirements();
  assert.equal(game.retiredTrainers.length,1);
  assert.equal(game.retiredTrainers[0].pokemonCount,8);
  assert.equal(game.retiredPokemon.length,8);
  assert.equal(game.hallOfFame.length,8);
  assert.equal(game.trainerRetirementHistory[0].pokemonCount,8);
  assert.equal(game.clubs[0].trainerAcademy.includes(academy),true);
  assert.equal(api.marketRoster(t).length,8);
});

test('transfer cards and valuation count reserve Pokémon while keeping the same trainer as their owner',()=>{
  const {api,game,t,scope}=setup();
  assert.equal(scope.transferValuation(t,game.clubs[0])>100000000,true);
  assert.match(scope.marketDisplayRow({t}),/예비 2마리/);
  const html=scope.marketSelectedInfo();
  assert.match(html,/보유 포켓몬 8마리/);
  assert.match(html,/예비 포켓몬 2마리 · 영입 시 전원 동행/);
  assert.match(html,/이브이/);
  assert.match(scope.transferMarketHTML(),/보유 포켓몬 전원/);
  game.clubs[0].trainers.splice(0,1);
  game.clubs[1].reserveTrainers.push(t);
  assert.equal(api.marketRoster(t).length,8);
  assert.equal(t.pokemonReserve[0].ownerTrainerId,'101');
});
