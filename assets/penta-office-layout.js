/* Approved Penta Rivals office redesign: presentation layer only. */
(function(){
'use strict';
if(window.PentaOfficeLayout)return;
const safe=value=>escapeHTML(String(value??''));
const icons={
home:'⌂',squad:'♙',league:'♜',market:'⇄',club:'⬡',list:'☷',profile:'▣',pokemon:'◉',tactics:'▤',weekly:'▦',scout:'⌕',academy:'◇'
};
const links=[
['home','감독실','home',true],['team','선수단','squad',true],
['fixtures','리그','league',true],['transfer','영입','market',true],['finance','구단','club',true],
['team','트레이너 목록','list'],['profile','트레이너 프로필','profile'],['pokemon','포켓몬','pokemon'],
['tactics','게임 플랜','tactics'],['weekly','주간 프로그램','weekly'],
['scout','포켓몬 탐색','scout'],['academy','아카데미','academy']
];
const groupOf=k=>['team','profile','pokemon','tactics','weekly','scout','academy','pokemonDetail','career'].includes(k)?'squad':
 ['fixtures','league','calendar','retirement'].includes(k)?'league':
 ['transfer','ai'].includes(k)?'market':k==='home'?'home':'club';
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
function navView(selected){
 const nav=document.createElement('nav');nav.className='pr-top-navigation';nav.setAttribute('aria-label','구단 관리 메뉴');
 links.forEach(([id,label,icon,main])=>{
   const current=main?groupOf(selected)===(icon==='squad'?'squad':icon==='market'?'market':icon==='league'?'league':icon==='club'?'club':'home'):id===selected;
   const btn=document.createElement('button');btn.type='button';
   btn.className='pr-top-link'+(main?' pr-main-link':'')+(current?' active':'');
   if(current)btn.setAttribute('aria-current','page');
   btn.innerHTML='<span class="pr-nav-icon" aria-hidden="true">'+icons[icon]+'</span><span>'+safe(label)+'</span>';
   btn.onclick=()=>setTab(id);nav.append(btn);
 });
 return nav;
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
 const right=document.createElement('div');right.className='pr-director';
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
 root.querySelectorAll(':scope > .pr-top-navigation,:scope > .pr-club-banner').forEach(x=>x.remove());
 const selected=typeof tab==='string'?tab:'home';
 root.prepend(navView(selected));root.insertBefore(bannerView(root,club),panel);
 if(selected==='team')patchTrainers(root,club);
 removeOldPreview();
}
const css=document.createElement('link');css.rel='stylesheet';css.href='assets/penta-office-layout.css';document.head.append(css);
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
Promise.all([
 fetch('src/web/species-ko.json').then(r=>r.ok?r.json():{}),
 fetch('src/web/species-sprites.json').then(r=>r.ok?r.json():{})
]).then(([ko,species])=>{
 koreanDex=ko;spriteIds=species;
 for(const [key,id] of Object.entries(species))if(!reverseDex.has(Number(id)))reverseDex.set(Number(id),key);
 if(typeof tab==='string'&&tab==='team'&&typeof window.renderOffice==='function'&&!document.getElementById('dashboard')?.hidden)window.renderOffice();
}).catch(()=>{});
})();