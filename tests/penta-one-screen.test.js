import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {Script} from 'node:vm';

const css=readFileSync(new URL('../assets/penta-one-screen.css',import.meta.url),'utf8');
const code=readFileSync(new URL('../assets/penta-one-screen.js',import.meta.url),'utf8');
const office=readFileSync(new URL('../assets/penta-office-layout.js',import.meta.url),'utf8');
const manager=readFileSync(new URL('../assets/manager-creation.js',import.meta.url),'utf8');

test('game frame and setup stay within one viewport without document scrolling',()=>{
 assert.match(css,/html:has\(#game\),body:has\(#game\)\{[^}]*overflow:hidden!important/);
 assert.match(css,/#dashboard\.pr-office\.pr-one-screen\{[^}]*height:100dvh!important/s);
 assert.match(css,/#clubselect\.pr-one-screen-select,#clubtrainers\.pr-one-screen-select/);
 assert.match(css,/#player-manager-setup\.pr-one-screen-select/);
 assert.match(css,/grid-template-rows:min-content min-content min-content minmax\(0,1fr\)!important/);
});

test('office and secondary panels drag to scroll instead of using next/previous buttons',()=>{
 assert.match(css,/#dashboard\.pr-office\.pr-one-screen > #dashpanel,[\s\S]*?overflow-y:auto!important/);
 assert.match(css,/#dashboard\.pr-office\.pr-one-screen > \.pr-secretary-rail,[\s\S]*?overflow-y:auto!important/);
 assert.match(css,/touch-action:pan-y/);
 assert.match(css,/-webkit-overflow-scrolling:touch/);
 assert.doesNotMatch(code,/function pager\(|pr-page-next|pr-main-pager'\)/);
 assert.match(code,/removeOldPagers\(root\)/);
});

test('all club and trainer cards remain accessible by drag instead of being paginated',()=>{
 assert.match(css,/#clubselect\.pr-one-screen-select \.cs-grid\{[\s\S]*?overflow-y:auto!important/);
 assert.match(css,/#clubtrainers\.pr-one-screen-select \.ct-list\{[\s\S]*?overflow-y:auto!important/);
 assert.doesNotMatch(code,/card\.hidden=i<|cards\.forEach\(\(card,i\)=>\{card\.hidden=/);
 assert.match(code,/\.cs-card\[hidden\]/);
 assert.match(code,/\.ct-trainer-card\[hidden\]/);
});

test('manager abilities and submit control remain reachable by drag without overlay bar',()=>{
 assert.match(css,/#player-manager-setup\.pr-one-screen-select \.pm-panel\{[\s\S]*?overflow-y:auto!important/);
 assert.match(css,/#player-manager-setup\.pr-one-screen-select \.pm-actions\{[\s\S]*?position:static!important/);
 assert.match(css,/\.pr-manager-pager\{[\s\S]*?display:none!important/);
 assert.match(manager,/const previousScroll=Array\.from\(screen\.querySelectorAll\('\.pm-panel'\)\)/);
 assert.match(manager,/panel\.scrollTop=previousScroll\[i\]\|\|0/);
});

test('portrait uses fixed panel tabs and landscape preserves wider two-panel view',()=>{
 assert.match(css,/@media\(max-width:980px\)/);
 assert.match(css,/data-pr-pane="secretary"\] > #dashpanel/);
 assert.match(css,/@media\(min-width:640px\) and \(max-height:510px\)/);
 assert.match(css,/@media\(max-width:900px\)/);
 assert.match(code,/selectionTabs\(root,\[\['list','감독 경력'\]/);
 assert.match(code,/root\.dataset\.prPane=key/);
});

test('one-screen controller is loaded and no longer installs pagination controls',()=>{
 new Script(code);
 assert.ok(office.indexOf('penta-one-screen.css')>office.indexOf('penta-viewport.css'));
 assert.match(office,/window\.PentaOneScreen\?\.enhanceOffice\?\.\(root,panel\)/);
 assert.match(code,/MutationObserver\(refresh\)/);
 assert.match(code,/visualViewport\?\.addEventListener\('resize'/);
 assert.doesNotMatch(code,/make\('button','pr-page-back'/);
});
