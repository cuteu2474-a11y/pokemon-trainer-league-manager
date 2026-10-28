/* Player-manager career setup. AI manager personalities are not modified. */
(function(){
'use strict';
if(window.PlayerManagerSetup)return;
const CAREERS={
 rookie:{name:'초보 감독',points:15,max:12,renown:10},
 middle:{name:'중견 감독',points:30,max:16,renown:40},
 star:{name:'스타 감독',points:45,max:20,renown:75}
};
const STATS=[
 ['tactics','전술 이해','경기 전 전술 분석과 권고'],
 ['communication','소통 능력','트레이너 면담과 신뢰'],
 ['development','육성 능력','선수 및 포켓몬 훈련 지도'],
 ['negotiation','협상 능력','영입·계약 협상'],
 ['organization','조직 관리','선수단 사기와 피로 관리']
];
const BASE=5;
const toHTML=value=>String(value??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
const $=id=>document.getElementById(id);
let career='rookie';
let points=Object.fromEntries(STATS.map(([id])=>[id,BASE]));
const screen=document.createElement('section');
screen.id='player-manager-setup';
screen.hidden=true;
screen.setAttribute('aria-label','감독 경력과 능력치 설정');
document.body.appendChild(screen);
const remaining=()=>CAREERS[career].points-STATS.reduce((sum,[id])=>sum+(points[id]-BASE),0);
function draw(){
 const tier=CAREERS[career];
 const club=typeof clubSelectDraft!=='undefined'?clubSelectDraft?.clubs?.[clubSelectId]:null;
 const manager=String($('csManager')?.value|| (typeof clubSelectManager!=='undefined'?clubSelectManager:'') || '').trim();
 screen.innerHTML='<div class="pm-shell"><div class="pm-top"><div><h1>감독 경력 및 능력치 설정</h1></div><button type="button" class="pm-back" data-action="back">← 구단 선택으로</button></div>'+
 '<div class="pm-grid"><section class="pm-panel"><h2>감독 경력 선택</h2><div class="pm-tier-list">'+
 Object.entries(CAREERS).map(([id,c])=>'<button type="button" class="pm-tier'+(career===id?' selected':'')+'" data-career="'+id+'" aria-pressed="'+(career===id)+'"><strong>'+c.name+'</strong><span>추가 '+c.points+'P · 개별 최대 '+c.max+'</span></button>').join('')+'</div></section>'+
 '<section class="pm-panel"><div class="pm-score"><div><h2>능력치 배분</h2></div><strong>남은 '+remaining()+'P</strong></div>'+
 '<div class="pm-stats">'+STATS.map(([id,label])=>
 '<div class="pm-stat"><div class="pm-stat-meta"><div><strong>'+label+'</strong></div><div class="pm-stepper"><button type="button" data-stat="'+id+'" data-delta="-1" aria-label="'+label+' 감소" '+(points[id]<=BASE?'disabled':'')+'>−</button><b>'+points[id]+'</b><button type="button" data-stat="'+id+'" data-delta="1" aria-label="'+label+' 증가" '+(remaining()<=0||points[id]>=tier.max?'disabled':'')+'>+</button></div></div><div class="pm-bar"><span style="width:'+(points[id]/20*100)+'%"></span></div></div>').join('')+'</div>'+
 '<div class="pm-renown"><span><strong>명성 '+tier.renown+'/100</strong></span><span class="pm-renown-badge">'+tier.name+'</span></div>'+
 '<div class="pm-actions"><button type="button" data-action="reset" class="pm-reset">배분 초기화</button><button type="button" data-action="submit" class="pm-submit" '+(remaining()!==0?'disabled':'')+'>설정 완료 · 감독 취임</button></div></section></div></div>';
}
function back(){
 screen.hidden=true;
 const select=$('clubselect');if(select)select.hidden=false;
 window.scrollTo?.(0,0);
}
const commitBeforeSetup=window.clubSelectCommit;
if(typeof commitBeforeSetup!=='function')return;
function begin(){
 if(typeof clubSelectDraft==='undefined'||!clubSelectDraft)return commitBeforeSetup();
 const field=$('csManager');
 const manager=String(field?.value||'').trim();
 if(!manager){field?.focus();return;}
 if(typeof game!=='undefined'&&game&&!clubSelectOverwrite){$('csOverwrite')?.focus();return;}
 if(typeof clubSelectManager!=='undefined')clubSelectManager=manager;
 career='rookie';points=Object.fromEntries(STATS.map(([id])=>[id,BASE]));
 screen.hidden=false;
 const select=$('clubselect');if(select)select.hidden=true;
 draw();window.scrollTo?.(0,0);
}
function submit(){
 if(remaining()!==0||typeof clubSelectDraft==='undefined'||!clubSelectDraft)return;
 const tier=CAREERS[career];
 const values={};
 for(const [id] of STATS)values[id]=points[id];
 clubSelectDraft.managerProfile={
  version:1,career,careerLabel:tier.name,attributes:values,
  renown:tier.renown,initialRenown:tier.renown,
  initialBudget:tier.points,initialLimit:tier.max
 };
 screen.hidden=true;
 commitBeforeSetup();
}
screen.addEventListener('click',e=>{
 const target=e.target.closest('button');if(!target||target.disabled)return;
 if(target.dataset.career&&CAREERS[target.dataset.career]){
  career=target.dataset.career;
  points=Object.fromEntries(STATS.map(([id])=>[id,BASE]));draw();return;
 }
 if(target.dataset.stat){
  const id=target.dataset.stat;
  if(!STATS.some(([key])=>key===id))return;
  const delta=Number(target.dataset.delta);
  if(delta<0&&points[id]>BASE)points[id]--;
  else if(delta>0&&points[id]<CAREERS[career].max&&remaining()>0)points[id]++;
  draw();return;
 }
 if(target.dataset.action==='back')back();
 else if(target.dataset.action==='reset'){points=Object.fromEntries(STATS.map(([id])=>[id,BASE]));draw();}
 else if(target.dataset.action==='submit')submit();
});
window.clubSelectCommit=begin;
window.PlayerManagerSetup={careers:CAREERS,stats:STATS,open:begin,back,remaining};
const css=document.createElement('link');css.rel='stylesheet';css.href='assets/manager-creation.css?v=trimmed-copy-2';document.head.append(css);
})();