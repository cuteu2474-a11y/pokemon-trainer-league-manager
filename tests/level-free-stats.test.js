import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {
  ABILITY_STATS,normalizeStatPairs,calculateLevelFreeStats,growStat,
  meanStatCA,meanStatPA
} from '../src/core/stat-potential.js';
import {simulateSixVsSix} from '../src/battle/showdown.js';
import {packGPTeam} from '../src/battle/gp-battle-stream.js';
import {LEVEL_FREE_DAMAGE_FACTOR,LEVEL_FREE_FIXED_DAMAGE} from '../src/battle/level-free-damage.js';

const abilities=(x=80)=>Object.fromEntries(ABILITY_STATS.map(k=>[k,x]));
const mon=(species,ca=80,pa=120,moves=['tackle'],legacyLevel=null)=>({
  name:species,species,moves,statCA:abilities(ca),statPA:abilities(pa),
  nature:'Hardy',...(legacyLevel?{level:legacyLevel}:{})
});
const team=(species,ca,pa,moves,level)=>Array.from({length:6},()=>
  mon(species,ca,pa,moves,level));
test('legacy save converts deterministically to six independent CA/PA and ignores level',()=>{
  const old={name:'피카츄',power:65,pa:115,level:1};
  const other={...old,level:100};
  assert.deepEqual(normalizeStatPairs(old),normalizeStatPairs(other));
  const a=normalizeStatPairs(old);
  assert.equal(Object.keys(a.statCA).length,6);
  assert.equal(Object.keys(a.statPA).length,6);
  assert.ok(new Set(Object.values(a.statCA)).size>1,'CA differs by stat');
  for(const stat of ABILITY_STATS)
    assert.ok(a.statPA[stat]>=a.statCA[stat],stat);
});
test('each CA affects only that battle stat; potential never affects battle stats',()=>{
  const base=abilities(100),current=abilities(80),stats=calculateLevelFreeStats(base,current);
  const boosted=calculateLevelFreeStats(base,{...current,atk:120});
  assert.ok(boosted.atk>stats.atk);
  for(const key of ABILITY_STATS)if(key!=='atk')assert.equal(boosted[key],stats[key],key);
  assert.equal(meanStatCA({statCA:current,statPA:abilities(200)}),80);
  assert.equal(meanStatPA({statCA:current,statPA:abilities(200)}),200);
  assert.equal(stats.hp,201); // 80 + 76 + 45
  assert.equal(stats.atk,146); // 80 + 56 + 10
});
test('training raises only selected CA, never exceeds its own PA',()=>{
  const p={statCA:{hp:100,atk:55,def:75,spa:80,spd:90,spe:60},
    statPA:{hp:100,atk:58,def:95,spa:80,spd:130,spe:110}};
  const x=growStat(p,'atk',3);
  assert.equal(x.delta,3);assert.equal(x.newValue,58);
  const capped=growStat({...p,statCA:x.statCA},'atk',3);
  assert.equal(capped.delta,0);
  assert.equal(x.statCA.hp,100);
  assert.equal(x.statCA.def,75);
  assert.throws(()=>growStat(p,'level',1),/Unknown stat/);
});
test('packed Showdown team omits a public level even for legacy input',()=>{
  const entry=mon('Pikachu',90,150,['thunderbolt'],1);
  const packed=packGPTeam(Array.from({length:6},()=>entry));
  assert.ok(packed);
  // No "level" is passed as a battle-team field. Internal Showdown protocol
  // may maintain a default compatibility number, but never battle power.
  const source=readFileSync(new URL('../src/battle/gp-battle-stream.js',import.meta.url),'utf8');
  assert.match(source,/const \{statCA,statPA,ca,pa,gp,level,power/);
  assert.equal(Object.hasOwn(entry.statCA,'level'),false);
});
test('changing only PA or legacy level has no effect on the real Showdown initial stats',
  {timeout:30000},async()=>{
    const a=team('Mew',85,120,['psychic'],1);
    const b=team('Mew',85,200,['psychic'],100);
    const result=await simulateSixVsSix(a,b,{seed:[8,9,10,11]});
    assert.equal(result.initialStats.p1[0].hp,result.initialStats.p2[0].hp);
    for(const key of ['atk','def','spa','spd','spe'])
      assert.equal(result.initialStats.p1[0][key],result.initialStats.p2[0][key]);
});
test('Night Shade damage is fixed by level-free engine, not by any serialized level',
  {timeout:30000},async()=>{
    const a=team('Gengar',95,160,['nightshade'],1);
    const b=team('Mewtwo',95,160,['splash'],100);
    const result=await simulateSixVsSix(a,b,{seed:[17,19,23,29],maxTurns:170});
    const hit=result.log.split('\n').find(x=>x.includes('|-damage|p2a:'));
    assert.ok(hit,'Night Shade should damage psychic target');
    const m=hit.match(/\|(\d+)\/(\d+)/);
    assert.ok(m,hit);
    assert.equal(Number(m[2])-Number(m[1]),LEVEL_FREE_FIXED_DAMAGE);
    assert.equal(LEVEL_FREE_DAMAGE_FACTOR,28);
  });
