/* Penta Rivals single-viewport workspace. No page scroll; long content
 * remains accessible through explicit previous/next page controls. */
(function(){
'use strict';
if(window.PentaOneScreen)return;
const make=(tag,cls,label)=>{
 const el=document.createElement(tag);el.className=cls;
 if(label!==undefined)el.textContent=label;
 if(tag==='button')el.type='button';
 return el;
};
const clamp=(v,a,b)=>Math.min(b,Math.max(a,v));
let pane='main',lastTab='',officePagers=[],resizeMonitor=null;
const panelPagers=new WeakMap();
function pager(host,target,label,css){
 const nav=make('nav','pr-screen-pager '+css);
 nav.setAttribute('aria-label',label+' 페이지 선택');
 const back=make('button','pr-page-back','‹ 이전'),status=make('span','pr-page-status',''),next=make('button','pr-page-next','다음 ›');
 nav.append(back,status,next);host.append(nav);
 let current=0,total=1,height=1;
 function sync(){
  if(!nav.isConnected||!target.isConnected||!target.offsetHeight)return;
  height=Math.max(1,target.clientHeight);
  const max=Math.max(0,target.scrollHeight-height);
  total=Math.max(1,Math.ceil((max-.5)/height)+1);
  current=clamp(current,0,total-1);
  nav.hidden=total===1;
  const text=label+' '+(current+1)+' / '+total;
  if(status.textContent!==text)status.textContent=text;
  back.disabled=current===0;next.disabled=current===total-1;
 }
 const jump=delta=>{
  current=clamp(current+delta,0,total-1);
  target.scrollTop=Math.min(Math.max(0,target.scrollHeight-target.clientHeight),current*height);
  sync();
 };
 back.onclick=()=>jump(-1);next.onclick=()=>jump(1);
 return {nav,sync,jump};
}
function makeTabBar(root,kind,labels){
 const shell=root.querySelector('.cs-shell,.ct-shell,.pm-shell');
 if(!shell)return null;
 let nav=shell.querySelector(':scope > .pr-setup-switch');
 if(!nav){
  nav=make('nav','pr-setup-switch');nav.setAttribute('aria-label','한 화면 보기 전환');
  const before=shell.querySelector('.cs-main,.ct-main,.pm-grid');
  if(before)shell.insertBefore(nav,before);else shell.append(nav);
 }
 if(!root.dataset.prView)root.dataset.prView=labels[0][0];
 if(nav.children.length!==labels.length)nav.replaceChildren();
 labels.forEach(([value,text],i)=>{
  let btn=nav.children[i];if(!btn){btn=make('button','pr-setup-tab');nav.append(btn);}
  if(btn.textContent!==text)btn.textContent=text;
  btn.classList.toggle('active',root.dataset.prView===value);
  btn.setAttribute('aria-pressed',String(root.dataset.prView===value));
  btn.onclick=()=>{root.dataset.prView=value;syncCurrent();};
 });
 function syncCurrent(){
  Array.from(nav.children).forEach((btn,i)=>{
   const on=labels[i][0]===root.dataset.prView;
   btn.classList.toggle('active',on);btn.setAttribute('aria-pressed',String(on));
  });
  requestAnimationFrame(update);
 }
 return {select(value){root.dataset.prView=value;syncCurrent();}};
}
function mountPanelPager(host,target,label,cls){
 const existing=host.querySelector(':scope > .'+cls);
 if(existing&&panelPagers.has(target))return panelPagers.get(target);
 existing?.remove();
 const x=pager(host,target,label,cls);panelPagers.set(target,x);return x;
}
function updateClub(){
 const root=document.getElementById('clubselect');
 if(!root||root.hidden)return;
 const grid=root.querySelector('.cs-grid'),list=root.querySelector('.cs-browser'),
   details=root.querySelector('.cs-detail');
 if(!grid||!list||!details)return;
 root.classList.add('pr-one-screen-select');
 makeTabBar(root,'club',[['list','구단 목록'],['detail','구단 정보']]);
 if(!root.dataset.prClickHook){
  root.dataset.prClickHook='yes';
  root.addEventListener('click',e=>{
   if(e.target.closest('.cs-card')&&window.innerWidth<=900){
    requestAnimationFrame(()=>{root.dataset.prView='detail';updateClub();});
   }
  });
 }
 let nav=list.querySelector(':scope > .pr-club-pager');
 if(!nav){
  nav=make('nav','pr-screen-pager pr-club-pager');
  nav.setAttribute('aria-label','구단 목록 페이지 선택');
  nav.append(make('button','pr-back','‹ 이전'),make('span','pr-page',''),make('button','pr-next','다음 ›'));
  list.append(nav);
 }
 const cards=Array.from(grid.querySelectorAll('.cs-card'));
 const cols=window.innerWidth>1180?5:window.innerWidth>900?3:2;
 const rows=window.innerHeight<630?1:2,per=Math.max(1,cols*rows);
 const count=Math.max(1,Math.ceil(cards.length/per));
 const index=clamp(Number(root.dataset.prClubPage)||0,0,count-1);
 root.dataset.prClubPage=String(index);
 grid.style.setProperty('--pr-grid-cols',String(cols));
 grid.style.setProperty('--pr-grid-rows',String(rows));
 cards.forEach((card,i)=>{card.hidden=i<index*per||i>=(index+1)*per;});
 nav.hidden=count===1;
 const label='구단 '+(index+1)+' / '+count;
 if(nav.children[1].textContent!==label)nav.children[1].textContent=label;
 nav.children[0].disabled=index===0;nav.children[2].disabled=index>=count-1;
 nav.children[0].onclick=()=>{root.dataset.prClubPage=String(index-1);updateClub();};
 nav.children[2].onclick=()=>{root.dataset.prClubPage=String(index+1);updateClub();};
 const scroll=details.querySelector('.cs-detail-scroll');
 if(scroll){
  const detailPager=mountPanelPager(details,scroll,'구단 정보','pr-club-detail-pager');
  requestAnimationFrame(()=>detailPager.sync());
 }
}
function updateTrainers(){
 const root=document.getElementById('clubtrainers');
 if(!root||root.hidden)return;
 const list=root.querySelector('.ct-list'),details=root.querySelector('.ct-detail');
 if(!list||!details)return;
 root.classList.add('pr-one-screen-select');
 makeTabBar(root,'trainers',[['list','트레이너 목록'],['detail','트레이너 정보']]);
 if(!root.dataset.prClickHook){
  root.dataset.prClickHook='yes';
  root.addEventListener('click',e=>{
   if(e.target.closest('.ct-trainer-card')&&window.innerWidth<=900)
    requestAnimationFrame(()=>{root.dataset.prView='detail';updateTrainers();});
  });
 }
 const cards=Array.from(list.querySelectorAll('.ct-trainer-card'));
 const per=window.innerHeight<650?2:window.innerHeight<900?3:5;
 const count=Math.max(1,Math.ceil(cards.length/per));
 const index=clamp(Number(root.dataset.prRosterPage)||0,0,count-1);
 root.dataset.prRosterPage=String(index);
 cards.forEach((card,i)=>{card.hidden=i<index*per||i>=(index+1)*per;});
 let nav=list.querySelector(':scope > .pr-roster-pager');
 if(!nav){
  nav=make('nav','pr-screen-pager pr-roster-pager');
  nav.append(make('button','pr-back','‹ 이전'),make('span','pr-page',''),make('button','pr-next','다음 ›'));
  list.append(nav);
 }
 nav.hidden=count===1;
 const text='선수 '+(index+1)+' / '+count;
 if(nav.children[1].textContent!==text)nav.children[1].textContent=text;
 nav.children[0].disabled=index===0;nav.children[2].disabled=index>=count-1;
 nav.children[0].onclick=()=>{root.dataset.prRosterPage=String(index-1);updateTrainers();};
 nav.children[2].onclick=()=>{root.dataset.prRosterPage=String(index+1);updateTrainers();};
 const p=mountPanelPager(details,details,'선수 정보','pr-trainer-detail-pager');
 requestAnimationFrame(()=>p.sync());
}
function updateManager(){
 const root=document.getElementById('player-manager-setup');
 if(!root||root.hidden)return;
 const grid=root.querySelector('.pm-grid');
 if(!grid)return;
 root.classList.add('pr-one-screen-select');
 makeTabBar(root,'manager',[['list','감독 경력'],['detail','능력치 배분']]);
 if(!root.dataset.prClickHook){
  root.dataset.prClickHook='yes';
  root.addEventListener('click',e=>{
   if(e.target.closest('[data-career]')&&window.innerWidth<=680)
    requestAnimationFrame(()=>{root.dataset.prView='detail';updateManager();});
  });
 }
 grid.querySelectorAll(':scope > .pm-panel').forEach(el=>{
  const p=mountPanelPager(el,el,'설정','pr-manager-pager');
  requestAnimationFrame(()=>p.sync());
 });
}
function enhanceOffice(root,content){
 if(!root||!content||root.hidden)return;
 const active=(root.querySelector('.pr-primary-navigation .active')?.textContent||'')+
  '/' +(root.querySelector('.pr-secondary-navigation .active')?.textContent||'');
 if(lastTab!==active){pane='main';lastTab=active;}
 root.querySelectorAll(':scope > .pr-screen-switch,:scope > .pr-main-pager,:scope > .pr-aside-pager').forEach(x=>x.remove());
 root.classList.add('pr-one-screen');root.dataset.prPane=pane;
 const aside=root.querySelector(':scope > .pr-secretary-rail');
 const secondary=root.querySelector('.pr-secondary-navigation');
 const children=Array.from(secondary?.querySelectorAll('.pr-sub-link')||[]);
 if(children.length){
  secondary.querySelector('.pr-subpage-select')?.remove();
  const select=make('select','pr-subpage-select');
  select.setAttribute('aria-label','세부 메뉴 선택');
  children.forEach((btn,i)=>{
   const o=document.createElement('option');o.value=String(i);o.textContent=btn.textContent;
   select.append(o);if(btn.classList.contains('active'))select.value=String(i);
  });
  select.onchange=()=>children[Number(select.value)]?.click();
  secondary.append(select);
 }
 const nav=make('nav','pr-screen-switch');nav.setAttribute('aria-label','게임 영역 선택');
 for(const [key,text] of [['main','게임 화면'],['secretary','비서 할 일']]){
  const btn=make('button','pr-screen-tab',text);
  btn.classList.toggle('active',pane===key);
  btn.setAttribute('aria-pressed',String(pane===key));
  btn.onclick=()=>{
   pane=key;root.dataset.prPane=key;
   Array.from(nav.children).forEach((x,i)=>{
    const on=(i===0?key==='main':key==='secretary');
    x.classList.toggle('active',on);x.setAttribute('aria-pressed',String(on));
   });
   requestAnimationFrame(()=>officePagers.forEach(p=>p.sync()));
  };
  nav.append(btn);
 }
 root.insertBefore(nav,content);
 officePagers=[pager(root,content,'본문','pr-main-pager')];
 if(aside)officePagers.push(pager(root,aside,'비서','pr-aside-pager'));
 if(resizeMonitor)resizeMonitor.disconnect();
 if(typeof ResizeObserver!=='undefined'){
  resizeMonitor=new ResizeObserver(()=>requestAnimationFrame(()=>officePagers.forEach(p=>p.sync())));
  resizeMonitor.observe(root);resizeMonitor.observe(content);
  if(aside)resizeMonitor.observe(aside);
 }
 requestAnimationFrame(()=>officePagers.forEach(p=>p.sync()));
}
let scheduled=false;
function update(){
 if(scheduled)return;
 scheduled=true;
 requestAnimationFrame(()=>{
  scheduled=false;updateClub();updateTrainers();updateManager();
  officePagers.forEach(p=>p.sync());
 });
}
function init(){
 const office=document.querySelector('#dashboard.pr-office:not([hidden])');
 if(office)enhanceOffice(office,office.querySelector(':scope > #dashpanel'));
 new MutationObserver(update).observe(document.body,{childList:true,subtree:true});
 window.addEventListener('resize',update,{passive:true});
 window.visualViewport?.addEventListener('resize',update,{passive:true});
 update();
}
window.PentaOneScreen={enhanceOffice,updateClub,updateTrainers,updateManager};
if(document.readyState==='loading')document.addEventListener('DOMContentLoaded',init,{once:true});
else init();
})();
