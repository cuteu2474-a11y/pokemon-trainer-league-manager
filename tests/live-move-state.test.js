import test from 'node:test';
import assert from 'node:assert/strict';
import {simulateSixVsSix} from '../src/battle/showdown.js';
const gp={hp:94,atk:0,def:31,spa:94,spd:0,spe:94};
const team=prefix=>Array.from({length:6},(_,i)=>({name:prefix+i,species:'Mewtwo',level:50,nature:'Hardy',ability:'Pressure',moves:['psychic'],ca:200,pa:200,gp:{...gp}}));
test('streamed move state reflects actual Pressure PP deduction, not one PP per animation',{timeout:30000},async()=>{
 const r=await simulateSixVsSix(team('A'),team('B'),{seed:[1,2,3,4]});
 const states=r.log.split('\n').filter(line=>line.startsWith('|league-state|p1: A0|')).map(line=>JSON.parse(line.split('|')[3]));
 assert.ok(states.length>1);assert.equal(states[0].moves[0].maxpp,16);
 assert.ok(states.some((state,i)=>i>0&&states[i-1].moves[0].pp-state.moves[0].pp===2));
 const last=states.at(-1);assert.ok(last.moves[0].pp>=0);assert.equal(last.basePP[0],last.moves[0].pp);
});

test('a mixed relay keeps fainted identities and PP attached to the correct Pokemon after switches',{timeout:30000},async()=>{
 const {runMatch}=await import('../src/web/match-service.js');
 const pokemon=(name,level,power,moves)=>({name,level,power,moves});
 const a={id:0,trainers:Array.from({length:5},(_,i)=>({name:'홈'+i,tactics:1,switching:1,pokemon:[pokemon('잉어킹',1,1,['splash']),...Array.from({length:5},()=>pokemon('뮤츠',70,160,['psychic']))]}))};
 const b={id:1,trainers:Array.from({length:5},(_,i)=>({name:'상대'+i,tactics:1,switching:1,pokemon:Array.from({length:6},()=>pokemon('잉어킹',20,30,['tackle']))}))};
 const r=await runMatch({home:a,away:b,homeOrder:[0,1,2,3,4],awayOrder:[0,1,2,3,4],seed:[1,2,3,4]});
 assert.equal(r.rounds[0].winner,'A');
 const next=r.rounds[1].initial.p1;
 const first=r.rounds[0].final.p1;
 const originalNames=r.rounds[0].initial.p1.map(mon=>mon.name);
 const saved=new Map(originalNames.map((name,i)=>[name,first[i]]));
 // No level-based forced knockout assumption: track the actual remaining HP.
 for(const pokemon of next){
   const prior=saved.get(pokemon.name);
   assert.ok(prior,'pokemon identity must survive the relay');
   const expected=prior.hp>0?Math.min(prior.maxhp,prior.hp+Math.floor(prior.maxhp*.1)):0;
   assert.equal(pokemon.hp,expected,'each Pokemon keeps its own HP and relay heal');
 }
 assert.ok(next.filter(m=>m.name.startsWith('뮤츠')).every(m=>m.hp>0));
 const pp=new Map();for(const line of r.rounds[0].log.split('\n'))if(line.startsWith('|league-state|p1: ')){const p=line.split('|');pp.set(p[2].slice(4),JSON.parse(p[3]).basePP);}
 for(const mon of next)assert.deepEqual(mon.pp,pp.get(mon.name),mon.name+' must retain its own PP');
 assert.ok(next.some(m=>m.name.startsWith('뮤츠')&&m.pp[0]<m.maxpp[0]));
});
