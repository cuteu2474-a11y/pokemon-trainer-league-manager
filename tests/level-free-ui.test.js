import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';

const index=readFileSync(new URL('../index.html',import.meta.url),'utf8');
const matchday=readFileSync(new URL('../assets/matchday.js',import.meta.url),'utf8');
const abilities=readFileSync(new URL('../assets/ability-ui.js',import.meta.url),'utf8');

test('Pokémon battle, roster, profile and career pages do not render a level',()=>{
  assert.doesNotMatch(matchday,/Lv\.|md-level|side\+'-level'|field\('레벨'/);
  assert.doesNotMatch(index,/Lv\.|평균 레벨|최종 레벨|원작 레벨/);
  assert.match(index,/\['potential','평균 PA'\]/);
  assert.match(abilities,/key==='potential'/);
});

test('new league Pokémon and career records never create level attributes',()=>{
  assert.doesNotMatch(index,/\blevel:rnd\(|\bp\.level\s*=|\blevel:p\.level/);
  assert.match(abilities,/delete p\[key\]/);
  assert.match(abilities,/delete retired\.level/);
  assert.match(index,/k==='level'\?'potential':k/, 'saved trainer columns retain their old selection as PA');
});
