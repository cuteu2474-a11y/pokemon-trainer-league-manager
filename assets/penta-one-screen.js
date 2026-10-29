/* One viewport for the game chrome; native drag scrolling only in overflowing
 * content areas. No previous/next pages or hidden cards. */
(function(){
'use strict';
if(window.PentaOneScreen)return;
const make=(tag,className,text)=>{
 const node=document.createElement(tag);node.className=className;
 if(text!==undefined)node.textContent=text;
 if(tag==='button')node.type='button';
 return node;
};
let officePane='main',previousSection='';
function removeOldPagers(root){
 root.querySelectorAll('.pr-screen-pager').forEach(el=>el.remove());
}
function selectionTabs(root,labels){
 const shell=root.querySelector('.cs-shell,.ct-shell,.pm-shell');
 if(!shell)return;
 let nav=shell.querySelector(':scope > .pr-setup-switch');
 if(!nav){
  nav=make('nav','pr-setup-switch');
  nav.setAttribute('aria-label','화면 영역 전환');
  const content=shell.querySelector(':scope > .cs-main,:scope > .ct-main,:scope > .pm-grid');
  if(content)shell.insertBefore(nav,content);
  else shell.append(nav);
 }
 if(!labels.some(([key])=>root.dataset.prView===key))root.dataset.prView=labels[0][0];
 if(nav.children.length!==labels.length)nav.replaceChildren();
 labels.forEach(([key,label],i)=>{
  let button=nav.children[i];
  if(!button){button=make('button','pr-setup-tab');nav.append(button);}
  if(button.textContent!==label)button.textContent=label;
  const chosen=root.dataset.prView===key;
  button.classList.toggle('active',chosen);
  button.setAttribute('aria-pressed',String(chosen));
  button.onclick=()=>{
   root.dataset.prView=key;
   [...nav.children].forEach((child,index)=>{
    const active=labels[index][0]===key;
    child.classList.toggle('active',active);
    child.setAttribute('aria-pressed',String(active));
   });
  };
 });
}
function updateClub(){
 const root=document.getElementById('clubselect');
 if(!root||root.hidden)return;
 const list=root.querySelector('.cs-browser'),detail=root.querySelector('.cs-detail');
 if(!list||!detail)return;
 root.classList.add('pr-one-screen-select');
 removeOldPagers(root);
 // Restore cards that were previously concealed by the old page controller.
 if(root.dataset.prClubPage!==undefined){
  root.querySelectorAll('.cs-card[hidden]').forEach(el=>{el.hidden=false;});
  delete root.dataset.prClubPage;
 }
 selectionTabs(root,[['list','구단 목록'],['detail','구단 정보']]);
 if(!root.dataset.prDragHook){
  root.dataset.prDragHook='1';
  root.addEventListener('click',event=>{
   if(event.target.closest('.cs-card')&&window.innerWidth<=900){
    root.dataset.prView='detail';
    selectionTabs(root,[['list','구단 목록'],['detail','구단 정보']]);
   }
  });
 }
}
function updateTrainers(){
 const root=document.getElementById('clubtrainers');
 if(!root||root.hidden)return;
 const list=root.querySelector('.ct-list'),detail=root.querySelector('.ct-detail');
 if(!list||!detail)return;
 root.classList.add('pr-one-screen-select');
 removeOldPagers(root);
 if(root.dataset.prRosterPage!==undefined){
  root.querySelectorAll('.ct-trainer-card[hidden]').forEach(el=>{el.hidden=false;});
  delete root.dataset.prRosterPage;
 }
 selectionTabs(root,[['list','트레이너 목록'],['detail','트레이너 정보']]);
 if(!root.dataset.prDragHook){
  root.dataset.prDragHook='1';
  root.addEventListener('click',event=>{
   if(event.target.closest('.ct-trainer-card')&&window.innerWidth<=900){
    root.dataset.prView='detail';
    selectionTabs(root,[['list','트레이너 목록'],['detail','트레이너 정보']]);
   }
  });
 }
}
function updateManager(){
 const root=document.getElementById('player-manager-setup');
 if(!root||root.hidden||!root.querySelector('.pm-grid'))return;
 root.classList.add('pr-one-screen-select');
 removeOldPagers(root);
 selectionTabs(root,[['list','감독 경력'],['detail','능력치 배분']]);
 if(!root.dataset.prDragHook){
  root.dataset.prDragHook='1';
  root.addEventListener('click',event=>{
   if(event.target.closest('[data-career]')&&window.innerWidth<=900){
    root.dataset.prView='detail';
    selectionTabs(root,[['list','감독 경력'],['detail','능력치 배분']]);
   }
  });
 }
}
function enhanceOffice(root,content){
 if(!root||root.hidden||!content)return;
 const selected=(root.querySelector('.pr-primary-navigation .active')?.textContent||'')+
  '/'+(root.querySelector('.pr-secondary-navigation .active')?.textContent||'');
 if(selected!==previousSection){officePane='main';previousSection=selected;}
 root.querySelectorAll(':scope > .pr-screen-switch,:scope > .pr-main-pager,:scope > .pr-aside-pager').forEach(el=>el.remove());
 root.classList.add('pr-one-screen');
 root.dataset.prPane=officePane;
 const secondary=root.querySelector('.pr-secondary-navigation');
 if(secondary){
  secondary.querySelector('.pr-subpage-select')?.remove();
  const links=[...secondary.querySelectorAll('.pr-sub-link')];
  if(links.length){
   const dropdown=make('select','pr-subpage-select');
   dropdown.setAttribute('aria-label','세부 메뉴 선택');
   links.forEach((link,index)=>{
    const option=document.createElement('option');
    option.value=String(index);option.textContent=link.textContent;
    dropdown.append(option);
    if(link.classList.contains('active'))dropdown.value=String(index);
   });
   dropdown.onchange=()=>links[Number(dropdown.value)]?.click();
   secondary.append(dropdown);
  }
 }
 const tabs=make('nav','pr-screen-switch');
 tabs.setAttribute('aria-label','게임 정보 영역');
 for(const [key,label] of [['main','게임 화면'],['secretary','비서 할 일']]){
  const button=make('button','pr-screen-tab',label);
  const active=officePane===key;
  button.classList.toggle('active',active);
  button.setAttribute('aria-pressed',String(active));
  button.onclick=()=>{
   officePane=key;root.dataset.prPane=key;
   [...tabs.children].forEach((child,index)=>{
    const on=index===(key==='main'?0:1);
    child.classList.toggle('active',on);
    child.setAttribute('aria-pressed',String(on));
   });
  };
  tabs.append(button);
 }
 root.insertBefore(tabs,content);
}
let queued=false;
function refresh(){
 if(queued)return;queued=true;
 requestAnimationFrame(()=>{
  queued=false;updateClub();updateTrainers();updateManager();
 });
}
function init(){
 const office=document.querySelector('#dashboard.pr-office:not([hidden])');
 if(office)enhanceOffice(office,office.querySelector(':scope > #dashpanel'));
 new MutationObserver(refresh).observe(document.body,{childList:true,subtree:true});
 window.addEventListener('resize',refresh,{passive:true});
 window.visualViewport?.addEventListener('resize',refresh,{passive:true});
 refresh();
}
window.PentaOneScreen={enhanceOffice,updateClub,updateTrainers,updateManager};
if(document.readyState==='loading')document.addEventListener('DOMContentLoaded',init,{once:true});
else init();
})();
