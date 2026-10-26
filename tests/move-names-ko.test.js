import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {Dex} from '@pkmn/sim';
const names=JSON.parse(readFileSync(new URL('../src/web/moves-ko.json',import.meta.url),'utf8'));
test('every engine move has a Korean display name, including Showdown aliases',()=>{
  for(const move of Dex.moves.all())assert.match(names[move.id]||'',/[가-힣]/,move.id);
  assert.equal(names.visegrip,'찝기');
  assert.equal(names.breakneckblitz,'울트라대시어택');
  assert.equal(names.gmaxwildfire,'거다이옥염');
  assert.equal(names.nihillight,'니힐레이저');
  for(const move of Dex.moves.all().filter(m=>m.isNonstandard==='CAP'))assert.match(names[move.id],/창작/);
});
