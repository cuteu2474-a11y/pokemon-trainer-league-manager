import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {runInNewContext} from 'node:vm';

const full=readFileSync(new URL('../assets/matchday.js',import.meta.url),'utf8');
const start=full.indexOf('/* Trainer Pokémon detail:');
const end=full.indexOf('/* Autonomous trainer development:',start);
assert.ok(start>=0&&end>start,'Pokémon detail module is present');
const source=full.slice(start,end);

function setup(){
  const mon={uid:'own:42',name:'피카츄',level:33,power:72,ability:'static',moves:['thunderbolt']};
  let officeCalls=0,previewCalls=0;
  const listeners={};
  const back={onclick:null};
  const panel={innerHTML:'',querySelector:selector=>selector==='.pki-return'?back:null};
  const club={hidden:true,innerHTML:'',querySelector:panel.querySelector};
  const dashboard={hidden:false};
  const document={
    activeElement:{isConnected:false},head:{appendChild(){}},createElement:()=>({textContent:''}),
    getElementById:id=>({dashpanel:panel,clubtrainers:club,dashboard})[id]||null,
    addEventListener:(name,handler,capture)=>{listeners[name]={handler,capture};}
  };
  const scrolled=[];
  const browser={scrollY:120,scrollTo:(x,y)=>scrolled.push([x,y]),
    PokemonArtworkUI:{image:()=>'<img class="pkm-art" tabindex="0">',resolve:()=>({id:0,baseId:0}),getRecord:()=>mon},
    SeasonRecords:{showCareer(){}},
  };
  const context={document,window:browser,tab:'pokemon',game:{},
    escapeHTML:value=>String(value).replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;').replace(/"/g,'&quot;'),
    renderOffice(){officeCalls++;panel.innerHTML='<p>일반 화면</p>';},
    renderClubTrainers(){previewCalls++;club.innerHTML='<p>트레이너 명단</p>';},
    fetch:async()=>({ok:true,json:async()=>({})}),
    requestAnimationFrame:callback=>callback()
  };
  runInNewContext(source,context);
  return {context,mon,panel,club,back,listeners,scrolled,
    get officeCalls(){return officeCalls;},get previewCalls(){return previewCalls;},
    api:browser.PokemonDetailView};
}

test('Pokémon image opens a dashboard page, not a modal overlay, and returns to its previous tab',()=>{
  const s=setup();s.api.open(s.mon,'dashboard');
  assert.equal(s.context.tab,'pokemonDetail');
  assert.match(s.panel.innerHTML,/POKÉMON \/ PROFILE/);
  assert.match(s.panel.innerHTML,/피카츄/);
  assert.match(s.panel.innerHTML,/통산 실전 기록 보기/);
  assert.doesNotMatch(s.panel.innerHTML,/role="dialog"|aria-modal="true"|pki-shade|pki-overlay/);
  assert.ok(s.officeCalls>0);
  s.back.onclick();
  assert.equal(s.context.tab,'pokemon');
  assert.match(s.panel.innerHTML,/일반 화면/);
  assert.deepEqual(s.scrolled.map(x=>Array.from(x)),[[0,0],[0,120]]);
});

test('pre-game club trainer preview uses an embedded full page, then restores the trainer list',()=>{
  const s=setup();s.club.hidden=false;
  s.api.open(s.mon,'clubSelect');
  assert.match(s.club.innerHTML,/트레이너 정보로 돌아가기/);
  assert.doesNotMatch(s.club.innerHTML,/role="dialog"|pki-overlay/);
  assert.equal(s.officeCalls,0);
  s.back.onclick();
  assert.equal(s.previewCalls,1);
  assert.match(s.club.innerHTML,/트레이너 명단/);
});

test('back from cumulative record keeps the original Pokémon detail page intact',()=>{
  const s=setup();s.context.tab='profile';s.api.open(s.mon,'dashboard');
  s.context.tab='career';s.context.renderOffice();
  assert.match(s.panel.innerHTML,/일반 화면/);
  s.context.tab='pokemonDetail';s.context.renderOffice();
  assert.match(s.panel.innerHTML,/트레이너 프로필로 돌아가기/);
  s.back.onclick();assert.equal(s.context.tab,'profile');
});

test('switching to an unrelated tab cancels a stale detail response',async()=>{
  const s=setup();s.api.open(s.mon,'dashboard');
  s.context.tab='team';s.context.renderOffice();
  await Promise.resolve();await Promise.resolve();await Promise.resolve();
  assert.match(s.panel.innerHTML,/일반 화면/);
  assert.doesNotMatch(s.panel.innerHTML,/POKÉMON \/ PROFILE/);
});

test('Escape closes the pre-game detail before the club-selection shortcut runs',()=>{
  const s=setup();s.club.hidden=false;s.api.open(s.mon,'clubSelect');
  const event={key:'Escape',preventDefault(){this.prevented=true;},
    stopImmediatePropagation(){this.stopped=true;}};
  assert.equal(s.listeners.keydown.capture,true);
  s.listeners.keydown.handler(event);
  assert.equal(event.prevented,true);assert.equal(event.stopped,true);
  assert.equal(s.previewCalls,1);
});
