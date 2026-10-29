import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {Script} from 'node:vm';
const css=readFileSync(new URL('../assets/penta-one-screen.css',import.meta.url),'utf8');
const code=readFileSync(new URL('../assets/penta-one-screen.js',import.meta.url),'utf8');
const host=readFileSync(new URL('../assets/penta-office-layout.js',import.meta.url),'utf8');

test('office and all game setup screens use exactly the display viewport, not growing pages',()=>{
 assert.match(css,/height:100dvh!important;min-height:0!important;max-height:100dvh!important/);
 assert.match(css,/html:has\(#game\),body:has\(#game\)\{[^}]*overflow:hidden!important/);
 assert.match(css,/#dashboard\.pr-office\.pr-one-screen\{[^}]*overflow:hidden!important/s);
 assert.match(css,/#dashboard\.pr-office\.pr-one-screen > #dashpanel\{[^}]*overflow-x:auto!important;overflow-y:hidden!important/s);
 assert.match(css,/#clubselect\.pr-one-screen-select,#clubtrainers\.pr-one-screen-select/);
 assert.match(css,/#player-manager-setup\.pr-one-screen-select/);
});

test('portrait tablets switch between main and secretary rather than piling two screens',()=>{
 assert.match(css,/@media\(max-width:980px\)/);
 assert.match(css,/\[data-pr-pane="main"\] > \.pr-secretary-rail/);
 assert.match(css,/\[data-pr-pane="secretary"\] > #dashpanel/);
 assert.match(css,/\.pr-subpage-select/);
 assert.match(code,/root\.dataset\.prPane=key/);
});
test('short landscape phone has vertical navigation with remaining height for content',()=>{
 assert.match(css,/@media\(min-width:640px\) and \(max-height:510px\)/);
 assert.match(css,/grid-template-columns:clamp\(114px,17vw,142px\) minmax\(0,1fr\)/);
 assert.match(css,/grid-row:1 \/ 5/);
});
test('club selection, trainer lists and manager setup use page controls, not clipped inaccessible content',()=>{
 for(const x of ['pr-club-pager','pr-club-detail-pager','pr-roster-pager','pr-trainer-detail-pager','pr-manager-pager'])
  assert.ok(code.includes(x),'missing '+x);
 assert.match(code,/cards\.forEach\(\(card,i\)=>\{card\.hidden=/);
 assert.match(code,/root\.addEventListener\('click'/);
 assert.match(code,/MutationObserver\(update\)/);
 assert.doesNotMatch(code,/\.remove\(\).*cs-card/);
});
test('controller loads after approved responsive styling and on every office screen render',()=>{
 new Script(code);
 assert.ok(host.indexOf('penta-one-screen.css')>host.indexOf('penta-viewport.css'));
 assert.match(host,/window\.PentaOneScreen\?\.enhanceOffice\?\.\(root,panel\)/);
 assert.match(host,/fitScript\.src='assets\/penta-one-screen\.js/);
});
test('real one-screen pager moves content by a fixed viewport page when next is clicked',()=>{
 class El{
  constructor(tag='div'){
   this.tagName=tag.toUpperCase();this.children=[];this.textContent='';
   this.dataset={};this.attributes={};this.className='';this.hidden=false;
   this.offsetHeight=400;this.clientHeight=400;this.scrollHeight=400;
   this.scrollTop=0;this.isConnected=true;
   const classes=new Set();
   this.classList={add:x=>classes.add(x),toggle:(x,on)=>on?classes.add(x):classes.delete(x),contains:x=>classes.has(x)};
  }
  append(...items){this.children.push(...items);}
  insertBefore(item){this.children.push(item);}
  setAttribute(k,v){this.attributes[k]=String(v);}
  querySelector(){return null;}
  querySelectorAll(){return [];}
 }
 const root=new El(),panel=new El(),aside=new El(),secondary=new El();
 panel.scrollHeight=1270;aside.scrollHeight=830;
 root.querySelector=x=>x===':scope > .pr-secretary-rail'?aside:
  x==='.pr-secondary-navigation'?secondary:
  x==='.pr-primary-navigation .active'?{textContent:'선수단'}:
  x==='.pr-secondary-navigation .active'?{textContent:'트레이너'}:null;
 const win={addEventListener(){},innerWidth:1194};
 const doc={readyState:'loading',createElement:t=>new El(t),addEventListener(){}};
 new Script(code).runInNewContext({window:win,document:doc,requestAnimationFrame:f=>f()});
 win.PentaOneScreen.enhanceOffice(root,panel);
 const nav=root.children.find(x=>x.className.includes('pr-main-pager'));
 assert.ok(nav);
 assert.equal(nav.children[1].textContent,'본문 1 / 4');
 nav.children[2].onclick();
 assert.equal(panel.scrollTop,400);
 assert.equal(nav.children[1].textContent,'본문 2 / 4');
 const switcher=root.children.find(x=>x.className==='pr-screen-switch');
 switcher.children[1].onclick();
 assert.equal(root.dataset.prPane,'secretary');
 assert.equal(switcher.children[1].attributes['aria-pressed'],'true');
});
