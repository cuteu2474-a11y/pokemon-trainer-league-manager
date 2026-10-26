import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {Script} from 'node:vm';
const source=readFileSync(new URL('../assets/matchday.js',import.meta.url),'utf8');
const html=readFileSync(new URL('../index.html',import.meta.url),'utf8');
const ko=JSON.parse(readFileSync(new URL('../src/web/species-ko.json',import.meta.url),'utf8'));
const species=JSON.parse(readFileSync(new URL('../src/web/species-sprites.json',import.meta.url),'utf8'));

test('portrait enhancement compiles without modifying the battle engine',()=>{
  new Script(source);
  for(const name of ['trainerCell','trainerProfileHTML','clubTrainerDetailHTML','renderClubTrainers','renderOffice','marketTarget']) {
    assert.ok(source.includes(name),name);
  }
  assert.match(source,/other\/official-artwork/);
  assert.match(source,/data-pkm-step/);
});
test('image identifiers cover roster species and canonical trainer signatures',()=>{
  assert.ok(Object.keys(ko).length>=1025);
  assert.ok(Object.keys(species).length>=1300);
  const roster=html.match(/const SPECIES=\[([^\]]+)\]/);
  assert.ok(roster);
  const starters=[...roster[1].matchAll(/'([^']+)'/g)].map(x=>x[1]);
  const signatures=[...html.matchAll(/"signature":\[(.*?)\]/g)].flatMap(x=>[...x[1].matchAll(/"([^"]+)"/g)].map(y=>y[1]));
  const missing=[...new Set([...starters,...signatures])].filter(name=>!ko[name]);
  assert.deepEqual(missing,[]);
  assert.equal(ko['피카츄'],25);
  assert.equal(ko['뉴라'],215);
  assert.equal(species['charizardmegax'],10034);
  assert.equal(species['raichualola'],10100);
});
