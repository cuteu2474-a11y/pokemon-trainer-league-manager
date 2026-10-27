import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';

const html=readFileSync(new URL('../index.html',import.meta.url),'utf8');
const art=readFileSync(new URL('../assets/ui/penta-rivals-title.webp',import.meta.url));

test('the opening title uses the approved Pokémon: Penta Rivals logo',()=>{
  assert.match(html,/<title>포켓몬: 펜타 라이벌즈 \| Pokémon: Penta Rivals<\/title>/);
  assert.match(html,/const PENTA_RIVALS_TITLE_LOGO='assets\/ui\/penta-rivals-title\.webp'/);
  assert.match(html,/logo\.className='title-logo-only'/);
  assert.match(html,/logo\.src=PENTA_RIVALS_TITLE_LOGO/);
  assert.match(html,/logo\.alt='포켓몬: 펜타 라이벌즈 — Pokémon: Penta Rivals'/);
  assert.doesNotMatch(html,/const KOREAN_TITLE_LOGO=/);
  assert.doesNotMatch(html,/title-creature-logo/);
});

test('the approved artwork is a browser-ready high-resolution WebP',()=>{
  assert.equal(art.subarray(0,4).toString(),'RIFF');
  assert.equal(art.subarray(8,12).toString(),'WEBP');
  assert.ok(art.byteLength>100_000,'title logo must contain the full artwork');
  assert.match(html,/logo\.width=1697;logo\.height=927/);
});
