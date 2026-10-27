import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {runInNewContext} from 'node:vm';

const source=readFileSync(new URL('../assets/ai-roster-recovery.js',import.meta.url),'utf8');
const mon=(uid,ownerTrainerId)=>({uid,name:'피카츄',ownerTrainerId:String(ownerTrainerId),power:65});
const trainer=(uid,count=6,reserves=0)=>({uid,name:'트레이너 '+uid,tactics:12,switching:13,
  pokemon:Array.from({length:count},(_,i)=>mon(uid+':'+i,uid)),
  pokemonReserve:Array.from({length:reserves},(_,i)=>mon(uid+':reserve:'+i,uid))});
function setup(){
  const user={id:0,name:'우리 구단',points:0,l:0,ga:0,trainers:Array.from({length:5},(_,i)=>trainer(10+i))};
  const ai={id:1,name:'AI 구단',points:0,l:0,ga:0,identity:{budget:150000000},
    trainers:Array.from({length:5},(_,i)=>trainer(20+i)),reserveTrainers:[],trainerAcademy:[]};
  const game={season:1,week:1,club:'우리 구단',clubs:[user,ai],coins:50000000,
    freeAgents:[],log:[]};
  let marketOpen=true,signings=0;
  const scope={window:{},game,aiMaintainSquad:()=>false,
    matchSim:(a,b)=>({home:a.id,away:b.id,aScore:2,bScore:1}),
    applyMatch:result=>{const a=game.clubs[result.home],b=game.clubs[result.away];
      a.points=(a.points||0)+(result.aScore>result.bScore?3:result.aScore===result.bScore?1:0);
      b.points=(b.points||0)+(result.bScore>result.aScore?3:result.aScore===result.bScore?1:0);},
    transferOpen:()=>marketOpen,
    aiSignFreeAgent:c=>{signings++;
      const t=game.freeAgents.shift()?.trainer;
      if(!t||c.identity.budget<20000000)return false;
      c.identity.budget-=20000000;
      const empty=c.trainers.findIndex(x=>!x);
      if(empty>=0)c.trainers[empty]=t;
      else c.trainers[c.trainers.findIndex(x=>x.pokemon.length<6)]=t;
      return true;
    },aiRecord:()=>{}};
  runInNewContext(source,scope);
  return {api:scope.window.AIRosterRecovery,game,user,ai,scope,
    get signings(){return signings;},closeMarket(){marketOpen=false;}};
}

test('AI fills its own six-starter slot from reserve Pokémon without moving ownership or creating a new Pokémon',()=>{
  const {api,ai}=setup(),t=ai.trainers[0];
  t.pokemon.splice(4,2);
  t.pokemonReserve.push(mon('old-reserve',t.uid),mon('foreign-reserve',999));
  const allBefore=t.pokemon.length+t.pokemonReserve.length;
  const result=api.repair(ai);
  assert.equal(result.restored,1);
  assert.equal(t.pokemon.length,5);
  assert.equal(t.pokemonReserve.length,1);
  assert.equal(t.pokemon.some(p=>p.uid==='old-reserve'),true);
  assert.equal(t.pokemonReserve[0].uid,'foreign-reserve');
  assert.equal(t.pokemon.length+t.pokemonReserve.length,allBefore);
  assert.equal(api.ready(ai),false);
});

test('AI replaces an incomplete starter using a genuine reserve or academy trainer and preserves the incumbent',()=>{
  const {api,ai}=setup();
  const incomplete=ai.trainers[0];incomplete.pokemon.pop();
  const replacement=trainer(90);ai.reserveTrainers.push(replacement);
  const first=api.repair(ai);
  assert.equal(first.ready,true);
  assert.equal(ai.trainers[0],replacement);
  assert.equal(ai.reserveTrainers[0],incomplete);
  assert.equal(incomplete.pokemon.length,5);
  ai.trainers[1]=null;
  const academy=trainer(91);ai.trainerAcademy.push(academy);
  const second=api.repair(ai);
  assert.equal(second.ready,true);
  assert.equal(ai.trainers[1],academy);
  assert.equal(ai.trainerAcademy.length,0);
  assert.equal(ai.trainers.every(t=>t.pokemon.length===6),true);
});

test('when academy depth is insufficient, AI makes a paid free-agent attempt at most once per week',()=>{
  const f=setup(),{api,game,ai,scope}=f;
  ai.trainers[0].pokemon.pop();
  const candidate=trainer(77);game.freeAgents.push({trainer:candidate,formerClub:'이전 구단'});
  const userBudget=game.coins,budget=ai.identity.budget;
  assert.equal(scope.aiMaintainSquad(ai),true);
  assert.equal(api.ready(ai),true);
  assert.equal(f.signings,1);
  assert.equal(ai.identity.budget,budget-20000000);
  assert.equal(game.coins,userBudget);
  ai.trainers[1].pokemon.pop();
  scope.aiMaintainSquad(ai);
  assert.equal(f.signings,1,'same week cannot spend again');
  game.week++;scope.aiMaintainSquad(ai);
  assert.equal(f.signings,2,'a later week can reconsider recruitment');
  assert.equal(ai.identity.budget,budget-20000000,'a failed signing never charges');
});

test('incomplete teams forfeit 0:5 while two incomplete clubs lose without draw points',()=>{
  const {ai,user,scope}=setup();
  ai.trainers[0].pokemon.pop();
  let result=scope.matchSim(ai,user);
  assert.equal(result.walkover,'home');
  assert.equal(result.aScore,0);assert.equal(result.bScore,5);
  scope.applyMatch(result);
  assert.equal(user.points,3);
  user.trainers[0].pokemon.pop();
  result=scope.matchSim(ai,user);
  assert.equal(result.walkover,'double');
  assert.equal(result.aScore,0);assert.equal(result.bScore,0);
  scope.applyMatch(result);
  assert.equal(user.points,3,'double forfeits do not award draw points');
  assert.equal(ai.l,1);assert.equal(user.l,1);
  assert.equal(ai.ga,5);assert.equal(user.ga,5);
});

test('ten-year roster turnover never mints free replacements, and every surviving starter is still owned',()=>{
  const {api,ai,game}=setup();
  const opening=ai.trainers.map(t=>t.pokemon).flat();
  const inventory=new Set(opening.map(p=>p.uid));
  let promoted=0;
  for(let season=1;season<=10;season++){
    game.season=season;game.week=26;
    if(season===7||season===9){
      const youth=trainer(100+season);
      youth.pokemon.forEach(p=>inventory.add(p.uid));
      ai.trainerAcademy.push(youth);
    }
    for(const t of ai.trainers.filter(Boolean)){
      if(season===8){t.pokemon.splice(0,t.pokemon.length>=6?2:0);}
    }
    const result=api.repair(ai);promoted+=result.promoted;
    for(const t of [...ai.trainers,...ai.reserveTrainers,...ai.trainerAcademy].filter(Boolean))
      for(const p of [...t.pokemon,...t.pokemonReserve]){
        assert.equal(inventory.has(p.uid),true,'no auto-created replacement');
        assert.equal(p.ownerTrainerId,String(t.uid),'no cross-trainer Pokémon transfer');
      }
  }
  assert.ok(promoted>=2,'existing academy and reserve trainers fill real vacancies');
  assert.equal(game.coins,50000000);
});
