import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';

const html=readFileSync(new URL('../index.html',import.meta.url),'utf8');

test('the opening title uses sharp Korean text and a vector capture-ball emblem',()=>{
  assert.match(html,/logo\.className='title-logo-only title-creature-logo'/);
  assert.match(html,/aria-label','트레이너 리그 매니저'/);
  assert.ok(html.includes('<span class="title-logo-primary">트레이너</span>'));
  assert.ok(html.includes('<span class="title-logo-secondary">리그 매니저</span>'));
  assert.ok(html.includes('viewBox="0 0 120 120"'));
  assert.match(html,/\.title-creature-logo\{/);
  assert.doesNotMatch(html,/const KOREAN_TITLE_LOGO=/,'the low-resolution bitmap must not return as the menu logo');
});
