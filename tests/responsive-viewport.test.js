import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {Script} from 'node:vm';

const css=readFileSync(new URL('../assets/penta-viewport.css',import.meta.url),'utf8');
const loader=readFileSync(new URL('../assets/penta-office-layout.js',import.meta.url),'utf8');

test('viewport stylesheet is loaded after the approved office styles for all game screens',()=>{
 new Script(loader,{filename:'penta-office-layout.js'});
 assert.match(loader,/penta-office-layout\.css\?v=/);
 assert.match(loader,/penta-viewport\.css\?v=/);
 assert.ok(loader.indexOf('penta-viewport.css')>loader.indexOf('penta-office-layout.css'));
 assert.match(css,/#clubselect,#clubtrainers/);
 assert.match(css,/#player-manager-setup/);
 assert.match(css,/#dashboard\.pr-office/);
 assert.match(css,/#game \.hero/);
});

test('iPad and desktop offices use fluid viewport width rather than the old fixed maximum',()=>{
 assert.match(css,/#dashboard\.pr-office\s*\{[^}]*width:100%;max-width:none/s);
 assert.match(css,/#dashboard\.pr-office\s*\{[^}]*min-height:100dvh/s);
 assert.match(css,/grid-template-columns:minmax\(0,1fr\) clamp\(270px,22vw,375px\)/);
 assert.match(css,/#dashboard\.pr-office > #dashpanel\s*\{[^}]*min-width:0/s);
 assert.match(css,/#dashboard\.pr-office > \.pr-secretary-rail\s*\{[^}]*max-width:none/s);
});

test('portrait tablets and phones retain content by stacking columns, not hiding components',()=>{
 assert.match(css,/@media\(max-width:980px\)/);
 assert.match(css,/@media\(max-width:620px\)/);
 assert.match(css,/@media\(max-width:380px\)/);
 assert.match(css,/#dashboard\.pr-office > \.pr-secretary-rail\s*\{[^}]*grid-column:1/s);
 assert.match(css,/#player-manager-setup \.pm-grid\s*\{[^}]*grid-template-columns:minmax\(0,1fr\)/s);
 assert.match(css,/#clubselect \.cs-grid\s*\{[^}]*repeat\(2,minmax\(0,1fr\)\)/s);
 assert.doesNotMatch(css,/\.pr-secretary-rail\s*\{\s*display:none/);
});

test('safe-area and overflow guards protect touch controls on split screens and iPads',()=>{
 assert.match(css,/env\(safe-area-inset-left,0px\)/);
 assert.match(css,/env\(safe-area-inset-bottom,0px\)/);
 assert.match(css,/overflow-x:clip/);
 assert.match(css,/overflow-x:auto/);
 assert.match(css,/@media\(pointer:coarse\)/);
 assert.match(css,/touch-action:manipulation/);
});
