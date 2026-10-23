import test from "node:test";
import assert from "node:assert/strict";
import {gpBudget,actualStats,validateGP,STATS} from "../src/core/stats.js";
import {scoreGP,gpMarginalValues} from "../src/core/score.js";
import {allocateGrowth,seededRandom,mistakeProbability} from "../src/core/growth.js";
const base={hp:108,atk:130,def:95,spa:80,spd:85,spe:102};
const empty=Object.fromEntries(STATS.map(s=>[s,0]));
const ctx={base,level:50,types:["dragon","ground"],moves:[{power:100,category:"physical",type:"ground",accuracy:100}],opponents:[{id:"foe",stats:{hp:160,atk:110,def:100,spa:90,spd:100,spe:100}}]};
test("budget endpoints",()=>{assert.equal(gpBudget(200),313);assert.equal(gpBudget(100),156);});
test("stat calculation",()=>{assert.deepEqual(actualStats(base,empty,50),{hp:223,atk:135,def:100,spa:85,spd:90,spe:107});});
test("score finite and marginal values",()=>{assert.ok(Number.isFinite(scoreGP(empty,ctx)));assert.equal(Object.keys(gpMarginalValues(empty,ctx)).length,6);});
test("growth deterministic, bounded and conservative",()=>{
 const initial={...empty,hp:1};validateGP(initial,1);
 const a=allocateGrowth(initial,1,200,15,ctx,seededRandom(42));
 const b=allocateGrowth(initial,1,200,15,ctx,seededRandom(42));
 assert.deepEqual(a,b);assert.equal(Object.values(a).reduce((x,y)=>x+y),313);
 for(const s of STATS) assert.ok(a[s]>=0&&a[s]<=94);
});
test("skill error monotonic",()=>{assert.ok(mistakeProbability(1)>mistakeProbability(10));assert.ok(mistakeProbability(10)>mistakeProbability(20));});
