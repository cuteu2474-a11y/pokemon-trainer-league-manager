/* Game-wide microcopy cleanup. Essential controls, data, status and errors remain. */
(function(){
'use strict';
if(window.PentaMinimalCopy)return;
const DECORATIVE=':is(.eyebrow,[class*="eyebrow"],[class*="tagline"],[class*="microcopy"],[class*="subtitle"],[class*="subtext"])';
const CANDIDATES='small,p,.eyebrow,.g-muted,[class*="hint"],[class*="helper"],[class*="tagline"],[class*="subtitle"],[class*="subtext"],[class*="microcopy"]';
const PROTECTED='button,a,label,select,option,textarea,input,summary,table,thead,tbody,tfoot,tr,th,td,[role="status"],[role="alert"],[aria-live],[role="button"],[role="link"],.pr-progress-bar,.pr-week-calendar,.pr-week-legend,.pr-manager-ability-stats,.pr-manager-profile-detail dl,.pm-stepper,.pm-tier,.pm-renown,.error,.warning,.danger,.notice,.alert,.required,.validation,.management-progress-report';
const style=document.createElement('style');
style.id='pr-minimal-copy-style';
style.textContent=[
 'body .eyebrow,body [class*="eyebrow"],body [class*="tagline"],body [class*="microcopy"],',
 'body .pm-top small,body .pm-top p,body .pm-panel>p,body .pm-score p,',
 'body .pm-stat-meta small,body .pm-tier small,body .pm-renown small,body .pm-hint,',
 'body .pr-trainer-header .g-muted,body .pr-copy-removed{display:none!important}',
 'body .pr-copy-removed{margin:0!important;padding:0!important}'
].join('\n');
document.head.append(style);
function isLight(color){
 const parts=String(color||'').match(/\d+(?:\.\d+)?/g);
 if(!parts||parts.length<3)return false;
 const [r,g,b]=parts.slice(0,3).map(Number);
 return r>125&&g>135&&b>145;
}
function protect(node){
 return node.closest(PROTECTED)||node.matches('[data-keep-copy]')||
        node.querySelector('button,a,input,select,textarea,[role="button"],[role="link"],[role="status"],[role="alert"]');
}
function trim(node){
 if(!(node instanceof HTMLElement)||node.classList.contains('pr-copy-removed')||protect(node))return;
 if(!node.isConnected)return;
 const text=(node.textContent||'').replace(/\s+/g,' ').trim();
 if(!text)return;
 const decorative=node.matches(DECORATIVE);
 const textBlock=node.matches('p,small,.g-muted,[class*="hint"],[class*="helper"]');
 if(!decorative&&!textBlock)return;
 if(decorative){node.classList.add('pr-copy-removed');return;}
 if(text.length<15)return;
 if(node.querySelector('h1,h2,h3,h4,strong,b,dl,ul,ol,table'))return;
 if(/^(?:필수|오류|실패|경고|확인 필요|저장 실패|진행 불가)/.test(text))return;
 if(/(?:₩|원|%|\/20|\/100)/.test(text)&&/\d/.test(text))return;
 const cs=getComputedStyle(node);
 if(cs.display==='none'||cs.visibility==='hidden')return;
 if((parseFloat(cs.fontSize)||16)>13.5||!isLight(cs.color))return;
 node.classList.add('pr-copy-removed');
}
function sweep(){
 for(const node of document.querySelectorAll(CANDIDATES))trim(node);
}
let scheduled=false;
function queue(){
 if(scheduled)return;
 scheduled=true;
 requestAnimationFrame(()=>{scheduled=false;sweep();});
}
if(document.body){
 sweep();
 const observer=new MutationObserver(queue);
 observer.observe(document.body,{childList:true,subtree:true,characterData:true});
 window.addEventListener('pageshow',queue);
}
window.PentaMinimalCopy={refresh:queue};
})();
