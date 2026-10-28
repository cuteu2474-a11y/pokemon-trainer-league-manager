import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';

const matchday=readFileSync(new URL('../assets/matchday.js',import.meta.url),'utf8');
const office=readFileSync(new URL('../assets/penta-office-layout.js',import.meta.url),'utf8');
const styles=readFileSync(new URL('../assets/penta-office-layout.css',import.meta.url),'utf8');

test('mobile match preparation gives lineup reordering full-width, reachable touch controls',()=>{
 assert.match(matchday,/class="md-row-tools"/);
 assert.match(matchday,/class="md-order-actions"/);
 assert.match(matchday,/#matchday \.md-order-actions button\{min-width:48px;min-height:48px/);
 assert.match(matchday,/#matchday \.md-row-tools>\.md-meeting-controls\{display:grid/);
 assert.match(matchday,/#matchday \.md-actions\{position:sticky;bottom:0/);
 assert.match(matchday,/env\(safe-area-inset-bottom/);
});

test('manager office exposes backup and restore on narrow screens without hiding progression',()=>{
 assert.match(office,/textContent='백업 파일 저장'/);
 assert.match(office,/textContent='백업 파일 복원'/);
 assert.match(office,/bar\.append\(header,saveTools,seasonWeekStrip\(\)\)/);
 assert.match(styles,/\.pr-save-tools>summary\{[^}]*min-height:40px/);
 assert.match(styles,/\.pr-save-actions button\{[^}]*min-height:44px/);
 assert.match(styles,/\.pr-progress-actions \.pr-progress-button\{[^}]*min-height:44px/);
});
