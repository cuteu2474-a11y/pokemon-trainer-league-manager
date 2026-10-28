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
 {tab:'news',label:'뉴스',group:'news',icon:'newspaper',children:[]},
 {tab:'transfer',label:'영입',group:'market',icon:'arrows',children:[]},
 {tab:'finance',label:'구단',group:'club',icon:'shield',children:[]}
];
const svgPaths={
 house:'<path d="m3 10 9-7 9 7"/><path d="M5 9v12h14V9"/><path d="M9 21v-7h6v7"/>',
 users:'<path d="M16 21v-2a4 4 0 0 0-4-4H6a4 4 0 0 0-4 4v2"/><circle cx="9" cy="7" r="4"/><path d="M22 21v-2a4 4 0 0 0-3-3.87M16 3.13a4 4 0 0 1 0 7.75"/>',
 trophy:'<path d="M8 21h8M12 17v4M7 4h10v7a5 5 0 0 1-10 0V4Z"/><path d="M7 6H4v2a4 4 0 0 0 4 4M17 6h3v2a4 4 0 0 1-4 4"/>',
 newspaper:'<rect x="3" y="4" width="18" height="16" rx="2"/><path d="M7 8h5v5H7zM15 8h3M15 11h3M7 16h11"/>',
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
let newsActive=false;
let newsFilter='all';
let newsMode='all';
const groupOf=k=>k==='news'?'news':['team','profile','pokemon','tactics','weekly','scout','academy','pokemonDetail','career'].includes(k)?'squad':
 ['fixtures','league','calendar','retirement'].includes(k)?'league':
 ['transfer','ai'].includes(k)?'market':k==='home'?'home':'club';
function openManagerProfile(){
 newsActive=false;
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
  btn.onclick=()=>{
   if(section.group==='news'){newsActive=true;newsFilter='all';newsMode='all';window.renderOffice?.();return;}
   newsActive=false;
   if(section.group==='home')openManagerProfile();
   else setTab(section.children[0]?.[0]||section.tab);
  };
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
  btn.onclick=()=>{newsActive=false;if(activeGroup==='home')openManagerProfile();else setTab(id);};
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
 const saveTools=document.createElement('details');saveTools.className='pr-save-tools';
 const saveLabel=document.createElement('summary');saveLabel.textContent='저장 관리';
 const saveActions=document.createElement('div');saveActions.className='pr-save-actions';
 const backup=document.createElement('button');backup.type='button';backup.textContent='백업 파일 저장';
 backup.onclick=()=>{try{window.MatchRegistration?.downloadBackup();}catch(error){alert(error.message);}};
 const restore=document.createElement('button');restore.type='button';restore.textContent='백업 파일 복원';
 restore.onclick=()=>window.MatchRegistration?.chooseBackup();
 saveActions.append(backup,restore);saveTools.append(saveLabel,saveActions);
 const header=document.createElement('div');header.className='pr-progress-head';
 header.append(status,actions);
 bar.append(header,saveTools,seasonWeekStrip());return bar;
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


/* League press and simulated social posts stay in separate, readable columns. */
function renderNewsView(){
 const page=document.createElement('section');page.className='pr-news-workspace';
 page.setAttribute('aria-label','리그 뉴스 및 SNS');
 const title=document.createElement('h2');title.textContent='뉴스 · 리그 SNS';page.append(title);
 const news=window.PentaNewsFeed?.build?.(game,myClub())||[];
 const social=window.PentaNewsFeed?.buildSocial?.(news)||[];
 const categories=[['all','전체'],['coach','감독'],['transfer','이적'],['retirement','은퇴'],['match','경기'],['club','구단']];
 const header=document.createElement('div');header.className='pr-news-controls';
 const modeNav=document.createElement('nav');modeNav.className='pr-news-modes';modeNav.setAttribute('aria-label','뉴스 보기 방식');
 const filters=document.createElement('nav');filters.className='pr-news-filters';filters.setAttribute('aria-label','뉴스 주제');
 const columns=document.createElement('div');columns.className='pr-news-columns';
 const newsColumn=document.createElement('section');newsColumn.className='pr-news-column pr-news-press';
 const socialColumn=document.createElement('section');socialColumn.className='pr-news-column pr-news-social';
 const newsTitle=document.createElement('h3');newsTitle.className='pr-news-column-heading';newsTitle.textContent='리그 뉴스';
 const socialTitle=document.createElement('h3');socialTitle.className='pr-news-column-heading';socialTitle.textContent='리그 SNS';
 const newsList=document.createElement('div');newsList.className='pr-news-stories';
 const socialList=document.createElement('div');socialList.className='pr-news-stories';
 newsColumn.append(newsTitle,newsList);socialColumn.append(socialTitle,socialList);
 columns.append(newsColumn,socialColumn);
 const empty=(target,message)=>{
  const p=document.createElement('p');p.className='pr-news-empty';p.textContent=message;target.append(p);
 };
 function appendPress(story){
  const item=document.createElement('article');item.className='pr-news-story';
  const top=document.createElement('div');top.className='pr-news-story-top';
  const tag=document.createElement('span');tag.className='pr-news-tag pr-news-tag-'+story.kind;tag.textContent=story.label;
  const context=document.createElement('span');context.className='pr-news-meta';context.textContent=story.meta||'';
  top.append(tag,context);
  const headline=document.createElement('h3');headline.textContent=story.title;
  item.append(top,headline);
  if(story.description){
   const description=document.createElement('p');description.textContent=story.description;item.append(description);
  }
  newsList.append(item);
 }
 function appendSocial(post){
  const item=document.createElement('article');item.className='pr-social-post';
  const top=document.createElement('div');top.className='pr-social-author';
  const avatar=document.createElement('span');avatar.className='pr-social-avatar';avatar.textContent='P';avatar.setAttribute('aria-hidden','true');
  const author=document.createElement('div');author.className='pr-social-author-name';
  const name=document.createElement('strong');name.textContent=post.author;
  const handle=document.createElement('span');handle.textContent=post.handle;author.append(name,handle);
  top.append(avatar,author);
  const context=document.createElement('span');context.className='pr-news-meta';context.textContent=post.meta||'';
  const subject=document.createElement('h3');subject.textContent=post.title;
  const body=document.createElement('p');body.textContent=post.body;
  const foot=document.createElement('div');foot.className='pr-social-actions';
  const like=document.createElement('button');like.type='button';like.className='pr-social-like';
  function liked(){
   const ids=Array.isArray(game.newsLikedIds)?game.newsLikedIds:[];
   return ids.includes(post.id);
  }
  function updateLike(){
   like.textContent=liked()?'♥ 공감함':'♡ 공감';
   like.setAttribute('aria-pressed',liked()?'true':'false');
  }
  like.onclick=()=>{
   const ids=new Set(Array.isArray(game.newsLikedIds)?game.newsLikedIds:[]);
   if(ids.has(post.id))ids.delete(post.id);else ids.add(post.id);
   game.newsLikedIds=Array.from(ids).slice(-350);
   if(typeof persist==='function')persist();
   updateLike();
  };
  updateLike();foot.append(like);
  item.append(top,context,subject,body,foot);socialList.append(item);
 }
 function draw(){
  modeNav.replaceChildren();filters.replaceChildren();newsList.replaceChildren();socialList.replaceChildren();
  for(const [mode,label] of [['all','전체'],['news','뉴스'],['social','SNS']]){
   const button=document.createElement('button');button.type='button';
   button.className='pr-news-mode'+(newsMode===mode?' active':'');
   button.textContent=label;button.setAttribute('aria-pressed',newsMode===mode?'true':'false');
   button.onclick=()=>{newsMode=mode;draw();};modeNav.append(button);
  }
  for(const [kind,label] of categories){
   const button=document.createElement('button');button.type='button';
   button.className='pr-news-filter'+(newsFilter===kind?' active':'');
   button.textContent=label;
   button.setAttribute('aria-pressed',newsFilter===kind?'true':'false');
   button.onclick=()=>{newsFilter=kind;draw();};filters.append(button);
  }
  const showNews=newsMode!=='social',showSocial=newsMode!=='news';
  newsColumn.hidden=!showNews;socialColumn.hidden=!showSocial;
  columns.classList.toggle('only-one',!showNews||!showSocial);
  const matches=s=>newsFilter==='all'||s.kind===newsFilter;
  const articles=news.filter(matches).slice(0,40),posts=social.filter(matches).slice(0,30);
  for(const article of articles)appendPress(article);
  for(const post of posts)appendSocial(post);
  if(showNews&&!articles.length)empty(newsList,'표시할 리그 소식이 없습니다.');
  if(showSocial&&!posts.length)empty(socialList,'아직 SNS에 올라온 소식이 없습니다.');
 }
 header.append(modeNav,filters);page.append(header,columns);draw();return page;
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
/* FM-style actionable assistant, with persistent inbox and safe advice deferral. */
let secretaryFilter='all';
let secretaryCollapsed=false;
let secretaryTrainingExpanded=false;
function secretaryOpenRoute(route){
 if(route==='match'){
  if(typeof window.MatchdayPreparation?.render==='function')window.MatchdayPreparation.render();
  else window.ManagementUI?.openMatch?.();
 }else if(route==='research')window.ManagementUI?.retryResearch?.();
 else if(route==='news')window.PentaOfficeLayout?.openNews?.();
 else if(typeof window.setTab==='function')window.setTab(route);
}
function secretaryView(){
 const aside=document.createElement('aside');aside.className='pr-secretary-rail';
 aside.setAttribute('aria-label','비서 업무 목록');
 const api=window.PentaSecretaryTasks,mail=window.PentaSecretaryInbox;
 const club=myClub();
 const rawRequired=api?.build?.(game,club)||[];
 const allAdvice=api?.suggest?.(game,club)||[];
 const rawAdvice=mail?.visibleAdvice?.(game,allAdvice)||allAdvice;
 const required=mail?.order?.(game,rawRequired)||rawRequired;
 const advice=mail?.order?.(game,rawAdvice)||rawAdvice;
 const briefing=api?.briefing?.(game,club);
 const upcoming=api?.agenda?.(game);
 const news=window.PentaNewsFeed?.build?.(game,club)||[];
 const recent=mail?.recent?.(game,news,12)||[];
 const unread=recent.filter(x=>x.unread).length;
 const titleBar=document.createElement('div');titleBar.className='pr-secretary-head';
 const caption=document.createElement('div');caption.className='pr-secretary-heading';
 const title=document.createElement('strong');title.className='pr-secretary-title';title.textContent='비서 업무';
 const summary=document.createElement('span');summary.className='pr-secretary-summary';
 summary.textContent='필수 '+required.length+' · 권장 '+advice.length+' · 새 소식 '+unread;
 caption.append(title,summary);
 const collapse=document.createElement('button');collapse.type='button';collapse.className='pr-secretary-collapse';
 collapse.textContent=secretaryCollapsed?'펼치기':'접기';
 collapse.setAttribute('aria-expanded',String(!secretaryCollapsed));
 collapse.onclick=()=>{secretaryCollapsed=!secretaryCollapsed;window.PentaOfficeLayout?.apply?.();};
 titleBar.append(caption,collapse);aside.append(titleBar);
 if(secretaryCollapsed)return aside;
 const filters=document.createElement('div');filters.className='pr-secretary-filters';
 const list=document.createElement('div');list.className='pr-secretary-items';
 const appendTask=(task)=>{
  const row=document.createElement('article');row.className='pr-secretary-card'+(task.urgent?' is-urgent':' is-recommended');
  const main=document.createElement('button');main.type='button';main.className='pr-secretary-task-main';
  const top=document.createElement('div');top.className='pr-secretary-item-top';
  const type=document.createElement('span');type.className='pr-secretary-tier';type.textContent=task.urgent?'필수':'권장';
  top.append(type);
  if(task.deadline){
   const time=document.createElement('span');time.className='pr-secretary-deadline';time.textContent=task.deadline;top.append(time);
  }
  const name=document.createElement('strong');name.textContent=task.title;
  const detail=document.createElement('span');detail.className='pr-secretary-detail';detail.textContent=task.detail;
  main.append(top,name,detail);
  main.onclick=()=>secretaryOpenRoute(task.route);
  row.append(main);
  const footer=document.createElement('div');footer.className='pr-secretary-card-actions';
  const action=document.createElement('button');action.type='button';action.className='pr-secretary-action';
  action.textContent=task.action||'확인하기';action.onclick=()=>secretaryOpenRoute(task.route);
  footer.append(action);
  if(!task.urgent&&mail){
   const defer=document.createElement('button');defer.type='button';defer.className='pr-secretary-defer';
   defer.textContent='2주 미루기';
   defer.onclick=()=>{
    if(!mail.defer(game,task,2))return;
    if(typeof persist==='function')persist();
    window.PentaOfficeLayout?.apply?.();
   };
   footer.append(defer);
  }
  if(mail){
   const pin=document.createElement('button');pin.type='button';pin.className='pr-secretary-pin';
   pin.textContent=mail.pinned(game,task.id)?'★ 고정됨':'☆ 고정';
   pin.setAttribute('aria-pressed',String(mail.pinned(game,task.id)));
   pin.onclick=()=>{mail.togglePinned(game,task);if(typeof persist==='function')persist();window.PentaOfficeLayout?.apply?.();};
   footer.append(pin);
  }
  row.append(footer);return row;
 };
 for(const [key,label,count] of [
  ['all','전체',required.length+advice.length],
  ['required','필수',required.length],
  ['advice','권장',advice.length],
  ['news','소식',unread]]){
  const button=document.createElement('button');button.type='button';
  button.className='pr-secretary-filter'+(secretaryFilter===key?' active':'');
  button.textContent=label+' '+count;
  button.setAttribute('aria-pressed',String(secretaryFilter===key));
  button.onclick=()=>{secretaryFilter=key;window.PentaOfficeLayout?.apply?.();};
  filters.append(button);
 }
 aside.append(filters);
 if(briefing&&secretaryFilter!=='news'){
  const section=document.createElement('section');section.className='pr-secretary-briefing';
  const title=document.createElement('strong');title.textContent='이번 주 브리핑';
  const grid=document.createElement('div');grid.className='pr-secretary-metrics';
  const values=[['출전 준비',briefing.ready+'/5'],['피로',briefing.fatigue===null?'—':briefing.fatigue+'/100'],
    ['사기',briefing.morale===null?'—':briefing.morale+'/100'],['주간 활동',briefing.activity]];
  for(const [key,value] of values){
   const item=document.createElement('div');item.className='pr-secretary-metric';
   const label=document.createElement('span');label.textContent=key;
   const number=document.createElement('strong');number.textContent=value;
   item.append(label,number);grid.append(item);
  }
  section.append(title,grid);aside.append(section);
 }
 if(secretaryFilter==='news'){
  const actions=document.createElement('div');actions.className='pr-secretary-inbox-actions';
  const heading=document.createElement('strong');heading.textContent='리그 소식';
  const markAll=document.createElement('button');markAll.type='button';markAll.textContent='모두 읽음';
  markAll.disabled=unread===0;
  markAll.onclick=()=>{
   mail?.markSeen?.(game,recent);
   if(typeof persist==='function')persist();
   window.PentaOfficeLayout?.apply?.();
  };
  actions.append(heading,markAll);list.append(actions);
  if(!recent.length){
   const empty=document.createElement('p');empty.className='pr-secretary-no-news';empty.textContent='최근 리그 소식이 없습니다.';list.append(empty);
  }else{
   for(const item of recent){
    const button=document.createElement('button');button.type='button';
    button.className='pr-secretary-news'+(item.unread?' is-unread':'');
    const meta=document.createElement('span');meta.textContent=item.label+' · '+item.meta;
    const title=document.createElement('strong');title.textContent=item.title;
    button.append(meta,title);
    button.onclick=()=>{
     mail?.markSeen?.(game,[item]);if(typeof persist==='function')persist();
     secretaryOpenRoute('news');
    };
    list.append(button);
   }
  }
  const seeNews=document.createElement('button');seeNews.type='button';seeNews.className='pr-secretary-see-news';
  seeNews.textContent='뉴스 전체 보기';seeNews.onclick=()=>secretaryOpenRoute('news');
  list.append(seeNews);
 }else{
  if(secretaryFilter!=='advice'&&required.length){
   const heading=document.createElement('strong');heading.className='pr-secretary-group-label';heading.textContent='처리할 업무';
   list.append(heading,...required.map(appendTask));
  }
  if(secretaryFilter!=='required'&&advice.length){
   const heading=document.createElement('strong');heading.className='pr-secretary-group-label';heading.textContent='비서 권장';
   list.append(heading,...advice.map(appendTask));
  }
  if(!list.childElementCount){
   const empty=document.createElement('div');empty.className='pr-secretary-empty';
   const name=document.createElement('strong');name.textContent=secretaryFilter==='advice'?'현재 권장 업무 없음':'처리할 업무 없음';
   const detail=document.createElement('span');detail.textContent='새로운 결정이 필요하면 여기에 표시됩니다.';
   empty.append(name,detail);list.append(empty);
  }
 }
 aside.append(list);
 // Safe weekly settings: configure the existing automatic-week policy, never execute it.
 if(secretaryFilter!=='news'&&typeof window.ManagementUI?.program==='function'){
  const details=document.createElement('details');details.className='pr-secretary-training';
  details.open=secretaryTrainingExpanded;
  details.addEventListener('toggle',()=>{secretaryTrainingExpanded=details.open;});
  const heading=document.createElement('summary');heading.textContent='자동 진행 훈련 설정';details.append(heading);
  const content=document.createElement('div');content.className='pr-secretary-training-content';
  const programs=typeof TLM_WEEKLY_PROGRAMS==='undefined'?[]:TLM_WEEKLY_PROGRAMS;
  const control=document.createElement('label');control.textContent='훈련 프로그램';
  const select=document.createElement('select');select.setAttribute('aria-label','훈련 프로그램');
  for(const p of programs){
   if(!p||!['tactics','power','scrimmage','recovery'].includes(p.id))continue;
   const option=document.createElement('option');option.value=p.id;option.textContent=p.title;
   select.append(option);
  }
  select.value=game.management?.program||'tactics';
  select.onchange=()=>{secretaryTrainingExpanded=true;window.ManagementUI?.program?.(select.value);};
  control.append(select);content.append(control);
  const trainers=window.PentaSecretaryTasks?.trainingTargets?.(club)||[];
  if(trainers.length){
   const targetLabel=document.createElement('label');targetLabel.textContent='훈련 대상';
   const target=document.createElement('select');target.setAttribute('aria-label','자동 훈련 대상');
   const automatic=document.createElement('option');automatic.value='';automatic.textContent='전술 능력이 낮은 트레이너 우선';
   target.append(automatic);
   for(const trainer of trainers){
    const item=document.createElement('option');item.value=trainer.id;item.textContent=trainer.label;target.append(item);
   }
   const selected=game.management?.target||'';
   target.value=trainers.some(x=>x.id===selected)?selected:'';
   target.onchange=()=>{secretaryTrainingExpanded=true;window.ManagementUI?.target?.(target.value);};
   targetLabel.append(target);content.append(targetLabel);
  }
  if(Number(club.fatigue)>=45&&game.management?.program!=='recovery'){
   const quick=document.createElement('button');quick.type='button';quick.className='pr-secretary-quick-recovery';
   quick.textContent='비서 권장: 훈련을 회복으로 설정';
   quick.onclick=()=>{secretaryTrainingExpanded=true;window.ManagementUI?.program?.('recovery');};
   content.append(quick);
  }
  const recovery=document.createElement('label');recovery.className='pr-secretary-recovery';
  const checkbox=document.createElement('input');checkbox.type='checkbox';
  checkbox.checked=game.management?.autoRecovery!==false;
  checkbox.onchange=()=>{secretaryTrainingExpanded=true;window.ManagementUI?.recovery?.(checkbox.checked);};
  recovery.append(checkbox,document.createTextNode('피로 45 이상이면 회복'));
  content.append(recovery);
  const note=document.createElement('p');note.textContent='다음 중요 일정까지 자동 진행할 때 적용됩니다.';
  content.append(note);details.append(content);aside.append(details);
 }
 if(upcoming){
  const footer=document.createElement('div');footer.className='pr-secretary-next';
  const heading=document.createElement('strong');heading.textContent='다음 경기';
  const event=document.createElement('span');event.textContent=upcoming.label;
  const detail=document.createElement('span');detail.textContent=upcoming.detail;
  const button=document.createElement('button');button.type='button';button.textContent='일정 확인';
  button.onclick=()=>secretaryOpenRoute(upcoming.action);
  footer.append(heading,event,detail,button);aside.append(footer);
 }
 return aside;
}
function apply(){
 const root=document.getElementById('dashboard');
 if(!root||root.hidden||typeof game==='undefined'||!game)return;
 const club=typeof myClub==='function'?myClub():null;if(!club)return;
 const panel=root.querySelector(':scope > #dashpanel');if(!panel)return;
 root.classList.add('pr-office');
 root.querySelectorAll(':scope > .pr-navigation-stack,:scope > .pr-top-navigation,:scope > .pr-secondary-navigation,:scope > .pr-club-banner,:scope > .pr-progress-bar,:scope > .pr-season-timeline,:scope > .pr-secretary-rail').forEach(x=>x.remove());
 const selected=newsActive?'news':typeof tab==='string'?tab:'home';
 root.insertBefore(bannerView(root,club),panel);root.insertBefore(progressView(),panel);root.insertBefore(navView(selected),panel);
 const isProfile=selected==='home';
 panel.classList.toggle('pr-manager-profile-view',isProfile);
 panel.classList.toggle('pr-news-view',newsActive);
 if(newsActive)panel.replaceChildren(renderNewsView());
 else if(isProfile)panel.replaceChildren(managerProfileView(root,club));
 if(selected==='team')patchTrainers(root,club);
 panel.after(secretaryView());
 removeOldPreview();
}
const css=document.createElement('link');css.rel='stylesheet';css.href='assets/penta-office-layout.css?v=secretary-briefing-14';document.head.append(css);
const previous=window.renderOffice;
if(typeof previous==='function')window.renderOffice=function(...args){
 const value=previous.apply(this,args);
 try{apply();}catch(err){console.warn('Penta office layout:',err);}
 return value;
};
const oldClub=window.renderClubTrainers;
if(typeof oldClub==='function')window.renderClubTrainers=function(...args){const r=oldClub.apply(this,args);removeOldPreview();return r;};
/* Any existing game navigation dismisses the virtual news page. */
const previousSetTab=window.setTab;
if(typeof previousSetTab==='function'){
 window.setTab=function(...args){newsActive=false;return previousSetTab.apply(this,args);};
}
window.PentaOfficeLayout={apply,removeOldPreview,openNews:()=>{
 newsActive=true;newsFilter='all';newsMode='all';
 apply();
}};
removeOldPreview();apply();
/* Saved secretary inbox, advice reminders and read-state helpers. */
const inboxScript=document.createElement('script');inboxScript.async=false;
inboxScript.src='assets/penta-secretary-inbox.js?v=2';
inboxScript.onload=()=>{if(typeof game!=='undefined'&&game)window.PentaOfficeLayout?.apply?.();};
document.body.append(inboxScript);

/* Load the assistant's read-only task source before first view. */
const secretaryScript=document.createElement('script');secretaryScript.async=false;
secretaryScript.src='assets/penta-secretary-tasks.js?v=4';
secretaryScript.onload=()=>{if(typeof game!=='undefined'&&game)window.PentaOfficeLayout?.apply?.();};
document.body.append(secretaryScript);

/* Load the pure game-history news feed. */
const newsDataScript=document.createElement('script');newsDataScript.async=false;
newsDataScript.src='assets/penta-news-data.js?v=sns-2';
newsDataScript.onload=()=>{if(newsActive)window.renderOffice?.();};
document.body.append(newsDataScript);

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
