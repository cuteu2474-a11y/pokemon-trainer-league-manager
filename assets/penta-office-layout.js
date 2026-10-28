/* Approved Penta Rivals office redesign: presentation layer only. */
(function(){
'use strict';
if(window.PentaOfficeLayout)return;
const safe=value=>escapeHTML(String(value??''));

/* Two-level navigation: a primary section never mixes with another section's children. */
const sections=[
 {tab:'home',label:'감독실',group:'home',icon:'house',children:[['manager-profile','감독 프로필']]},
 {tab:'team',label:'선수단',group:'squad',icon:'users',children:[['team','트레이너 목록'],['profile','트레이너 프로필'],['pokemon','포켓몬'],['tactics','게임 플랜'],['weekly','주간 프로그램'],['scout','포켓몬 탐색'],['academy','아카데미']]},
 {tab:'fixtures',label:'리그',group:'league',icon:'trophy',children:[]},
 {tab:'transfer',label:'영입',group:'market',icon:'arrows',children:[]},
 {tab:'finance',label:'구단',group:'club',icon:'shield',children:[]}
];
const svgPaths={
 house:'<path d="m3 10 9-7 9 7"/><path d="M5 9v12h14V9"/><path d="M9 21v-7h6v7"/>',
 users:'<path d="M16 21v-2a4 4 0 0 0-4-4H6a4 4 0 0 0-4 4v2"/><circle cx="9" cy="7" r="4"/><path d="M22 21v-2a4 4 0 0 0-3-3.87M16 3.13a4 4 0 0 1 0 7.75"/>',
 trophy:'<path d="M8 21h8M12 17v4M7 4h10v7a5 5 0 0 1-10 0V4Z"/><path d="M7 6H4v2a4 4 0 0 0 4 4M17 6h3v2a4 4 0 0 1-4 4"/>',
 arrows:'<path d="M7 7h14m-4-4 4 4-4 4"/><path d="M17 17H3m4-4-4 4 4 4"/>',
 shield:'<path d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10Z"/><path d="m9 12 2 2 4-4"/>'
};
function iconSVG(icon){return '<svg class="pr-nav-icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">'+svgPaths[icon]+'</svg>';}
let koreanDex={},spriteIds={};
const reverseDex=new Map();
const slug=v=>String(v||'').toLowerCase().replace(/[^a-z0-9]/g,'');
function spriteURL(p){
 const explicit=p?.species||p?.formId||'';
 const id=koreanDex[p?.name]||spriteIds[slug(explicit)]||window.PokemonArtworkUI?.resolve(p)?.id;
 const key=(id&&reverseDex.get(Number(id)))||slug(explicit)||'substitute';
 return 'https://play.pokemonshowdown.com/sprites/gen5/'+encodeURIComponent(key)+'.png';
}
function removeOldPreview(){
 document.querySelectorAll('#clubtrainers .ct-trainer-card .pkm-roster-mini,#clubtrainers [data-preview-index]>.pkm-roster-mini').forEach(e=>e.remove());
}
const groupOf=k=>['team','profile','pokemon','tactics','weekly','scout','academy','pokemonDetail','career'].includes(k)?'squad':
 ['fixtures','league','calendar','retirement'].includes(k)?'league':
 ['transfer','ai'].includes(k)?'market':k==='home'?'home':'club';
function openManagerProfile(){
 if(typeof tab==='string'&&tab==='home')window.renderOffice?.();
 else setTab('home');
}
function navView(selected){
 const activeGroup=groupOf(selected);
 const stack=document.createElement('div');stack.className='pr-navigation-stack';
 const primary=document.createElement('nav');primary.className='pr-top-navigation pr-primary-navigation';primary.setAttribute('aria-label','주요 구단 메뉴');
 const secondary=document.createElement('nav');secondary.className='pr-secondary-navigation';secondary.setAttribute('aria-label','선택한 상위 메뉴의 하위 항목');
 sections.forEach(section=>{
  const current=activeGroup===section.group;
  const btn=document.createElement('button');btn.type='button';
  btn.className='pr-top-link pr-main-link'+(current?' active':'');
  if(current)btn.setAttribute('aria-current','location');
  btn.innerHTML=iconSVG(section.icon)+'<span>'+safe(section.label)+'</span>';
  btn.onclick=()=>section.group==='home'?openManagerProfile():setTab(section.children[0]?.[0]||section.tab);
  primary.append(btn);
 });
 const children=sections.find(x=>x.group===activeGroup)?.children||[];
 if(!children.length){secondary.classList.add('is-empty');secondary.setAttribute('aria-label','하위 메뉴 없음');}
 children.forEach(([id,label])=>{
  const current=activeGroup==='home'?selected==='home':selected===id;
  const btn=document.createElement('button');btn.type='button';
  btn.className='pr-top-link pr-sub-link'+(current?' active':'');
  if(current)btn.setAttribute('aria-current','page');
  btn.textContent=label;
  btn.onclick=()=>activeGroup==='home'?openManagerProfile():setTab(id);
  secondary.append(btn);
 });
 stack.append(primary,secondary);
 return stack;
}
function bannerView(root,club){
 const banner=document.createElement('section');banner.className='pr-club-banner';banner.setAttribute('aria-label','구단 및 감독 정보');
 const left=document.createElement('div');left.className='pr-club-identity';
 const emblem=document.createElement('img');emblem.className='pr-club-logo';emblem.alt=club.name+' 엠블럼';
 if(typeof CLUB_EMBLEM_IMAGES!=='undefined'&&CLUB_EMBLEM_IMAGES[club.id])emblem.src=CLUB_EMBLEM_IMAGES[club.id];else emblem.hidden=true;
 const team=document.createElement('div');team.className='pr-team-title';
 const heading=document.createElement('h1');heading.textContent=club.name;
 const division=document.createElement('span');division.className='pr-league-label';division.textContent=(club.division+1)+'부 리그';
 team.append(heading,division);left.append(emblem,team);
 const right=document.createElement('button');right.type='button';right.className='pr-director';right.setAttribute('aria-label','감독 프로필 보기');right.onclick=()=>openManagerProfile();
 const portrait=root.querySelector(':scope > .fp-manager-badge .face-portrait');
 if(portrait)right.append(portrait);
 else if(typeof facePortrait==='function'){
   right.insertAdjacentHTML('afterbegin',facePortrait('D00',game.manager,'tiny'));
   if(typeof fpHydrate==='function')fpHydrate(right);
 }
 const caption=document.createElement('div');caption.className='pr-director-name';
 const title=document.createElement('span');title.textContent='감독';
 const name=document.createElement('strong');name.textContent=game.manager||'감독';
 caption.append(title,name);right.append(caption);banner.append(left,right);
 return banner;
}
function progressView(){
 const bar=document.createElement('section');bar.className='pr-progress-bar';bar.setAttribute('aria-label','현재 일정 및 진행');
 const status=document.createElement('div');status.className='pr-progress-status';
 const title=document.createElement('strong');title.textContent='현재 일정';
 const values=document.createElement('span');
 const season=Number(game.season)||1,week=Number(game.week)||1,round=Math.max(0,Number(game.round)||0);
 const phase=game.pendingMatch?'경기 준비 필요':round===0?'프리시즌':round>=18?'정규 시즌 일정':'리그 진행';
 values.textContent='시즌 '+season+' · '+week+'/30주 · '+phase+' · '+round+'/18라운드';
 status.append(title,values);
 const actions=document.createElement('div');actions.className='pr-progress-actions';
 const next=document.createElement('button');next.type='button';next.className='pr-progress-button';
 next.textContent='다음 주 진행';next.onclick=()=>window.nextWeek?.();
 const important=document.createElement('button');important.type='button';important.className='pr-progress-button highlight';
 important.textContent=game.pendingMatch?'경기 준비로 이동':'다음 중요 일정';
 important.onclick=()=>game.pendingMatch?window.ManagementUI?.openMatch():window.ManagementUI?.important();
 if(game.management?.running){next.disabled=true;important.disabled=true;}
 actions.append(next,important);
 const header=document.createElement('div');header.className='pr-progress-head';
 header.append(status,actions);
 bar.append(header,seasonWeekStrip());return bar;
}
/* Integrated calendar uses the same fixed 30-week season plan as the league.
   Rendering it directly avoids losing the timeline when dashboard DOM is rebuilt. */
const SEASON_PHASES=[
 {start:1,end:4,kind:'off',label:'프리시즌/비시즌'},
 {start:5,end:13,kind:'league',label:'정규 리그'},
 {start:14,end:15,kind:'market',label:'겨울 이적시장'},
 {start:16,end:24,kind:'league',label:'정규 리그'},
 {start:25,end:25,kind:'settlement',label:'시즌 정산'},
 {start:26,end:30,kind:'off',label:'프리시즌/비시즌'}
];
function phaseForWeek(week){return SEASON_PHASES.find(p=>week>=p.start&&week<=p.end);}
function seasonWeekStrip(){
 const frame=document.createElement('div');frame.className='pr-week-calendar';
 const track=document.createElement('div');track.className='pr-week-track';
 track.setAttribute('role','img');track.setAttribute('aria-label','30주 시즌 진행 현황');
 const current=Math.min(30,Math.max(1,Number(game.week)||1));
 for(let week=1;week<=30;week++){
  const phase=phaseForWeek(week);
  const square=document.createElement('span');
  square.className='pr-week-block pr-week-'+phase.kind+(week===current?' is-current':'');
  square.title=week+'주차 · '+phase.label+(week===current?' (현재)':'');
  square.setAttribute('aria-label',square.title);
  if(week===current)square.setAttribute('aria-current','date');
  track.append(square);
 }
 const legend=document.createElement('div');legend.className='pr-week-legend';
 const kinds=['off','league','market','settlement'];
 for(const kind of kinds){
  const phase=SEASON_PHASES.find(p=>p.kind===kind);
  const item=document.createElement('span');item.className='pr-week-legend-item';
  const marker=document.createElement('span');marker.className='pr-week-key pr-week-'+kind;
  marker.setAttribute('aria-hidden','true');
  const label=document.createElement('span');label.textContent=phase.label;
  item.append(marker,label);legend.append(item);
 }
 frame.append(track,legend);return frame;
}
function managerProfileView(root,club){
 const page=document.createElement('section');page.className='pr-manager-profile';page.setAttribute('aria-label','감독 프로필');
 const heading=document.createElement('h2');heading.textContent='감독 프로필';
 const card=document.createElement('div');card.className='pr-manager-profile-card';
 const identity=document.createElement('section');identity.className='pr-manager-profile-identity';
 const photo=root.querySelector('.pr-club-banner .pr-director .face-portrait')?.cloneNode(true);
 if(photo)identity.append(photo);
 const detail=document.createElement('div');detail.className='pr-manager-profile-detail';
 const name=document.createElement('strong');name.textContent=game.manager||'감독';
 const rows=document.createElement('dl');
 for(const [label,value] of [
  ['직책','감독'],['소속 구단',club.name],['소속 리그',(Number(club.division)+1)+'부 리그'],
  ['현재 시즌',String(game.season||1)+'시즌'],['진행 주차',String(game.week||1)+'주차']
 ]){
  const dt=document.createElement('dt');dt.textContent=label;
  const dd=document.createElement('dd');dd.textContent=value;rows.append(dt,dd);
 }
 detail.append(name,rows);identity.append(detail);card.append(identity);
 const setup=game.managerProfile;
 const summary=document.createElement('section');summary.className='pr-manager-ability-summary';
 const title=document.createElement('h3');title.textContent=setup?.attributes?(setup.careerLabel||'감독')+' · 감독 능력치':'감독 능력치';
 summary.append(title);
 if(setup?.attributes){
  const list=document.createElement('div');list.className='pr-manager-ability-stats';
  const stats=[['tactics','전술 이해'],['communication','소통 능력'],['development','육성 능력'],['negotiation','협상 능력'],['organization','조직 관리']];
  for(const [key,label] of stats){
   const item=document.createElement('div');item.className='pr-manager-stat';
   const labelEl=document.createElement('span');labelEl.textContent=label;
   const value=document.createElement('strong');value.textContent=String(setup.attributes[key]??5)+'/20';
   item.append(labelEl,value);list.append(item);
  }
  const fame=document.createElement('div');fame.className='pr-manager-stat pr-manager-renown-stat';
  const fameLabel=document.createElement('span');fameLabel.textContent='명성';
  const fameScore=document.createElement('strong');fameScore.textContent=String(setup.renown??setup.initialRenown??0)+'/100';
  fame.append(fameLabel,fameScore);list.append(fame);
  summary.append(list);
 }else{
  const legacy=document.createElement('p');legacy.className='pr-manager-legacy-note';
  legacy.textContent='기존 저장 파일에는 감독 능력치가 설정되지 않았습니다.';summary.append(legacy);
 }
 card.append(summary);page.append(heading,card);return page;
}

function patchTable(table,club){
 if(table.querySelector('th.pr-roster-heading'))return;
 const header=Array.from(table.querySelectorAll('thead th')).find(x=>x.textContent.trim().startsWith('트레이너'));
 if(!header)return;
 const cell=document.createElement('th');cell.scope='col';cell.className='pr-roster-heading';cell.textContent='보유 포켓몬 (전투력 높은 순)';header.after(cell);
 const roster=allTrainers(club);
 table.querySelectorAll('tbody tr').forEach(row=>{
  const nameCell=row.querySelector('td.player-name');if(!nameCell)return;
  row.querySelectorAll('.pkm-roster-mini').forEach(x=>x.remove());
  const onclick=nameCell.querySelector('[onclick*="showTrainerProfile"]')?.getAttribute('onclick')||'';
  const idMatch=onclick.match(/showTrainerProfile\((\d+)\)/);
  const trainer=roster.find(e=>e.id===Number(idMatch?.[1]))?.trainer;
  const six=[...(trainer?.pokemon||[])].sort((a,b)=>(Number(b.power)||0)-(Number(a.power)||0)).slice(0,6);
  const td=document.createElement('td');td.className='pr-pokemon-cell';
  const strip=document.createElement('div');strip.className='pr-pokemon-strip';
  strip.setAttribute('aria-label',six.length+'마리, 전투력 높은 순서');
  six.forEach(mon=>{
   const img=document.createElement('img');img.className='pr-showdown-pixel';
   img.src=spriteURL(mon);img.alt=String(mon.name||'포켓몬')+' · 전투력 '+(mon.power??'미확인');
   img.title=img.alt;img.loading='lazy';img.decoding='async';
   img.onerror=function(){
     if(this.dataset.fallback==='1'){this.hidden=true;return;}
     this.dataset.fallback='1';this.src='https://play.pokemonshowdown.com/sprites/gen5/substitute.png';
   };
   strip.append(img);
  });
  td.append(strip);nameCell.after(td);
 });
}
function patchTrainers(root,club){
 const panel=root.querySelector('#dashpanel'),frame=panel?.querySelector('.trainer-explorer');
 if(!frame)return;
 const header=panel.querySelector('.trainer-list-header'),toolbar=frame.querySelector('.trainer-toolbar');
 if(header){
  header.classList.add('pr-trainer-header');
  header.querySelector('.eyebrow')?.remove();
  const note=header.querySelector('.g-muted');if(note)note.textContent='구단에 소속된 모든 트레이너를 확인할 수 있습니다.';
  const last=toolbar?.querySelector('.group:last-child');if(last){last.classList.add('pr-filters');header.append(last);}
 }
 if(toolbar)toolbar.classList.add('pr-old-toolbar');
 const table=frame.querySelector('.trainer-detail-table');if(table)patchTable(table,club);
}
function apply(){
 const root=document.getElementById('dashboard');
 if(!root||root.hidden||typeof game==='undefined'||!game)return;
 const club=typeof myClub==='function'?myClub():null;if(!club)return;
 const panel=root.querySelector(':scope > #dashpanel');if(!panel)return;
 root.classList.add('pr-office');
 root.querySelectorAll(':scope > .pr-navigation-stack,:scope > .pr-top-navigation,:scope > .pr-secondary-navigation,:scope > .pr-club-banner,:scope > .pr-progress-bar,:scope > .pr-season-timeline').forEach(x=>x.remove());
 const selected=typeof tab==='string'?tab:'home';
 root.insertBefore(bannerView(root,club),panel);root.insertBefore(progressView(),panel);root.insertBefore(navView(selected),panel);
 const isProfile=selected==='home';
 panel.classList.toggle('pr-manager-profile-view',isProfile);
 if(isProfile)panel.replaceChildren(managerProfileView(root,club));
 if(selected==='team')patchTrainers(root,club);
 removeOldPreview();
}
const css=document.createElement('link');css.rel='stylesheet';css.href='assets/penta-office-layout.css?v=profile-only-8';document.head.append(css);
const previous=window.renderOffice;
if(typeof previous==='function')window.renderOffice=function(...args){
 const value=previous.apply(this,args);
 try{apply();}catch(err){console.warn('Penta office layout:',err);}
 return value;
};
const oldClub=window.renderClubTrainers;
if(typeof oldClub==='function')window.renderClubTrainers=function(...args){const r=oldClub.apply(this,args);removeOldPreview();return r;};
window.PentaOfficeLayout={apply,removeOldPreview};
removeOldPreview();apply();
/* Shared game microcopy cleanup, also active on club selection and setup. */
const minimalCopyScript=document.createElement('script');
minimalCopyScript.src='assets/ui-copy-cleanup.js?v=microcopy-1';minimalCopyScript.async=false;
document.body.append(minimalCopyScript);

/* Post-club-selection player manager creation (AI personalities stay separate). */
const setupScript=document.createElement('script');
setupScript.src='assets/manager-creation.js?v=manager-v1';setupScript.async=false;
document.body.append(setupScript);

Promise.all([
 fetch('src/web/species-ko.json').then(r=>r.ok?r.json():{}),
 fetch('src/web/species-sprites.json').then(r=>r.ok?r.json():{})
]).then(([ko,species])=>{
 koreanDex=ko;spriteIds=species;
 for(const [key,id] of Object.entries(species))if(!reverseDex.has(Number(id)))reverseDex.set(Number(id),key);
 if(typeof tab==='string'&&tab==='team'&&typeof window.renderOffice==='function'&&!document.getElementById('dashboard')?.hidden)window.renderOffice();
}).catch(()=>{});
})();