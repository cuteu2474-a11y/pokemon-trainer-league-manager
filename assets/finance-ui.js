import * as accounting from '../src/finance/club-finance.js';

const esc=v=>escapeHTML(String(v??''));
const own=()=>myClub();
let depth=0,ready=false;
const originalPersist=persist;
window.persist=function(){if(!depth)return originalPersist();};
function initialize(){
 if(!game||depth)return;
 if(typeof initCalendar==='function')initCalendar();migrateEconomy();aiInit();
 for(const c of game.clubs){clubIdentity(c);for(const {trainer:t} of accounting.members(c))transferProfile(t,c);}
 for(const fa of game.freeAgents||[])if(fa.trainer)transferProfile(fa.trainer,own());
 accounting.synchronize(game);ready=true;
}
function transaction(label,action){
 if(depth)return action();initialize();
 const before=JSON.parse(JSON.stringify(game));depth++;
 try{
  const result=action();if(result?.then)throw Error('재정 거래는 동기 처리해야 합니다.');
  for(const c of game.clubs)for(const {trainer:t} of accounting.members(c))transferProfile(t,c);
  accounting.synchronize(game);return result;
 }catch(error){game=before;throw error;}
 finally{depth--;originalPersist();renderOffice();}
}
function journal(label,action){
 return transaction(label,()=>{
  const balances=new Map(game.clubs.map(c=>[c.id,accounting.cash(game,c.id)]));
  const result=action();
  const event='operation:'+ ++game.finance.serial;
  for(const [id,before] of balances){
   const delta=accounting.cash(game,id)-before;if(!delta)continue;
   accounting.setCash(game,id,before);
   if(delta>0)accounting.income(game,id,delta,event+':'+id,label);
   else accounting.expense(game,id,-delta,event+':'+id,label);
  }
  return result;
 });
}
function notify(action){try{return action();}catch(e){alert(e.message);return false;}}
function income(amount,id,label,clubId=own().id){return accounting.income(game,clubId,Math.round(amount),id,label);}
function spend(amount,id,label,clubId=own().id){return accounting.expense(game,clubId,Math.round(amount),id,label);}
function beforeAdvance(){
 initialize();if(!game)return;
 transaction('주간 급여',()=>accounting.settleWeek(game));
}
function proposal(trainer,base){
 const s=game.marketV2 ||= {},salary=Math.round((trainer.profile?.salary||3000000)*(Number(s.salaryMultiplier)||1)),years=Number(s.contractYears)||2;
 const bonus=Math.round(salary*.1),fee=window.TrainerMarketV2.quote(base).offered;
 return {fee,salary,years,bonus,total:fee+bonus,totalCommitment:fee+bonus+salary*years};
}
function offerHTML(t,base){
 const q=proposal(t,base),p=accounting.forecast(game,own().id,{extraAnnual:q.salary,immediate:q.total});
 return '<div class="finance-offer"><h4>입단 계약</h4><label>시즌 연봉 <select onchange="ClubFinance.offerSalary(this.value)">'+[1,1.1,1.25].map(n=>'<option value="'+n+'" '+((Number(game.marketV2.salaryMultiplier)||1)===n?'selected':'')+'>'+wonReadable(Math.round((t.profile?.salary||3000000)*n))+'</option>').join('')+'</select></label> '+
  '<label>계약 기간 <select onchange="ClubFinance.offerYears(this.value)">'+[1,2,3].map(n=>'<option '+(n===q.years?'selected':'')+' value="'+n+'">'+n+'시즌 (이번 시즌 포함)</option>').join('')+'</select></label>'+
  '<p>이적료 '+wonReadable(q.fee)+' + 계약금 '+wonReadable(q.bonus)+' = 즉시 지출 '+wonReadable(q.total)+'<br>계약 전체 연봉 상한 '+wonReadable(q.salary*q.years)+' · 이적료·계약금 포함 상한 '+wonReadable(q.totalCommitment)+'<br>시즌 중 입단은 소속 주차만 지급합니다. 향후 미확정 수입을 제외한 이번 시즌말 자금 전망 '+wonReadable(p.projected)+'</p></div>';
}
function transfer(x,base){
 const q=proposal(x.t,base);
 return transaction('트레이너 영입',()=>{
  const c=accounting.moveTrainer(game,{buyerId:own().id,sellerId:x.c.id,trainer:x.t,sourceKind:x.kind,slot:x.slot,fee:q.fee,salary:q.salary,years:q.years,bonus:q.bonus});
  aiMaintainSquad(x.c);return c;
 });
}
function renewal(kind,slot,expectedId){
 initialize();const t=(kind==='active'?own().trainers:kind==='academy'?own().trainerAcademy:own().reserveTrainers)?.[slot];if(!t)return;
 const old=accounting.contract(game,t);if(!old||old.id!==expectedId){alert('계약이 변경됐습니다. 화면을 다시 확인해 주세요.');return;}
 game.finance.renewalDraft ||= {years:2,multiplier:1};const draft=game.finance.renewalDraft;
 const salary=Math.round(old.annualSalary*draft.multiplier),bonus=Math.round(salary*.1);
 if(!confirm(t.name+' 재계약\n시즌 연봉 '+wonReadable(salary)+' · 이번 주부터 적용\n기존 만료 후 '+draft.years+'시즌 연장\n계약금 '+wonReadable(bonus)+'\n진행하시겠습니까?'))return;
 notify(()=>transaction('재계약',()=>{
  accounting.renew(game,t,own().id,{salary,years:draft.years,bonus,expectedId});
  game.log.unshift(t.name+' 재계약 · 시즌 연봉 '+wonReadable(salary)+' · 계약금 '+wonReadable(bonus));
 }));
}
function freeAgent(index){
 initialize();if(!transferOpen()){alert('자유계약 영입은 이적시장 개장 기간에 가능합니다.');return;}
 const fa=game.freeAgents?.[index];if(!fa)return;
 const t=fa.trainer,salary=Math.round(Number(t.profile?.salary)||3000000),years=2,bonus=Math.round(salary*.1);
 if(!confirm(t.name+' 자유계약 영입\n시즌 연봉 '+wonReadable(salary)+' · 2시즌(이번 시즌 포함)\n즉시 계약금 '+wonReadable(bonus)+'\n포켓몬과 함께 영입하시겠습니까?'))return;
 notify(()=>transaction('자유계약 영입',()=>{
  accounting.moveTrainer(game,{buyerId:own().id,trainer:t,freeIndex:index,fee:0,salary,years,bonus});
  game.transferHistory ||= [];game.transferHistory.unshift({season:game.season,week:game.week,type:'자유계약 영입',name:t.name,from:fa.formerClub,to:own().name,fee:bonus});
  game.log.unshift(t.name+' 자유계약 영입 · 시즌 연봉 '+wonReadable(salary)+' · 계약금 '+wonReadable(bonus));
 }));
}
function contractHTML(){
 const c=own(),draft=game.finance.renewalDraft ||= {years:2,multiplier:1};
 return '<section class="finance-contracts"><h2>우리 구단 계약 관리</h2><p>연봉은 시즌 총액이며 30주에 나눠 지급합니다. 아카데미는 등록 당시 연봉의 25%를 육성 수당으로 계약하고, 승격만으로 연봉을 올리지 않습니다.</p>'+
  '<div class="finance-controls"><label>재계약 연봉 <select onchange="ClubFinance.renewalSalary(this.value)">'+[1,1.1,1.25].map(n=>'<option value="'+n+'" '+(draft.multiplier===n?'selected':'')+'>'+Math.round(n*100)+'%</option>').join('')+'</select></label>'+
  '<label>기존 계약 만료 후 연장 <select onchange="ClubFinance.renewalYears(this.value)">'+[1,2,3].map(n=>'<option value="'+n+'" '+(draft.years===n?'selected':'')+'>'+n+'시즌</option>').join('')+'</select></label></div>'+
  accounting.members(c).map(({trainer:t,kind,slot})=>{
   const ct=accounting.contract(game,t);if(!ct)return '';
   return '<article><b>'+esc(t.name)+'</b> · '+({active:'주전',reserve:'후보',academy:'아카데미'}[kind])+'<p>시즌 연봉 '+wonReadable(ct.annualSalary)+' · 이번 주 '+wonReadable(accounting.weeklySalary(ct.annualSalary,game.week))+' · '+ct.endSeason+'시즌 30주차까지<br>재계약 연봉 '+wonReadable(Math.round(ct.annualSalary*draft.multiplier))+' · 계약금 '+wonReadable(Math.round(ct.annualSalary*draft.multiplier*.1))+'</p>'+
    '<button class="g-btn alt" onclick="ClubFinance.renew(\''+kind+'\','+slot+',\''+ct.id+'\')">재계약</button> '+
    (kind!=='academy'?'<button class="g-btn alt" onclick="marketRelease(\''+kind+'\','+slot+')">방출</button> ':'')+
    (t.contractDecision?.status==='pending'?'<strong>만료 임박</strong> <button class="g-btn alt" onclick="ClubFinance.letExpire(\''+ct.id+'\')">만료 후 퇴단 확정</button>':'')+'</article>';
  }).join('')+'</section>';
}
function financeHTML(){
 const id=own().id,p=accounting.forecast(game,id),report=accounting.financialReport(game,id),b=accounting.book(game,id);
 return '<section class="finance-page"><h2>구단 재정</h2><div class="finance-grid">'+[
 ['현재 잔액',p.cash],['미지급금',p.arrears],['이번 주 예정 급여',p.next],['이번 시즌 남은 확정 급여',p.remaining],['이번 시즌 수입',report.income],['이번 시즌 비용 발생',report.expenses],['실제 지출',report.cashExpenses],['미지급금 상환',report.repayments],['미확정 수입 제외 시즌말 전망',p.projected]
 ].map(([label,n])=>'<div><small>'+label+'</small><b>'+wonReadable(n)+'</b></div>').join('')+'</div>'+
 '<p>이번 주 급여는 다음 주로 넘어갈 때 지급합니다. 현재 계약과 이번 시즌 잔여 주차만 전망에 포함하며, 경기 보상·향후 매각·다음 시즌 지원금은 미확정 수입으로 제외합니다.</p>'+
 (p.arrears?'<p class="finance-alert">미지급금이 있는 동안 유료 영입·시설·탐색·유료 훈련은 제한됩니다. 무료 회복·후보 배치·현재 수당을 유지한 아카데미 승격·선수 매각·일정 진행은 가능합니다. 이후 수입의 50%로 미지급금을 상환합니다.</p>':'')+
 '<h3>정산 내역</h3>'+b.ledger.slice(0,40).map(e=>'<details><summary>'+e.season+'시즌 '+e.week+'주 · '+esc(e.label)+' · '+(e.income?'수입 '+wonReadable(e.income):'비용 '+wonReadable(e.expense))+'</summary><p>지급 '+wonReadable(e.paid)+' · 상환 '+wonReadable(e.repaid)+' · 잔액 '+wonReadable(e.cash)+' · 미지급 '+wonReadable(e.arrears)+'</p>'+(e.details||[]).map(d=>'<p>'+esc(d.trainer)+' · '+wonReadable(d.amount)+' · '+esc(d.contractId)+'</p>').join('')+'</details>').join('')+
 '<h3>시즌 재정 기록</h3>'+Object.entries(b.seasons).reverse().map(([season,s])=>'<p>'+season+'시즌 · 수입 '+wonReadable(s.income)+' · 발생 비용 '+wonReadable(s.expenses)+' · 상환 '+wonReadable(s.repayments)+(s.closed?' · 확정 재정 점수 '+s.score+'/100':' · 진행 중')+'</p>').join('')+
 contractHTML()+'</section>';
}
const priorRender=renderOffice;
window.renderOffice=function(){
 if(game&&!depth)initialize();priorRender();if(!game||depth)return;
 const panel=document.getElementById('dashpanel');if(!panel)return;
 if(tab==='finance')panel.innerHTML=financeHTML();
 else if(tab==='transfer'){
  // Replace the legacy management block, retaining its free agents and history.
  const h=[...panel.querySelectorAll('h2')].find(x=>x.textContent==='우리 구단 계약 관리');
  if(h){const table=h.nextElementSibling;h.insertAdjacentHTML('beforebegin',contractHTML());h.remove();table?.remove();}
 }
 const nav=document.querySelector('#dashboard .management-subnav');
 if(nav&&window.ManagementUI?.tabGroup(tab)==='club'&&!nav.querySelector('[data-finance-nav]')){
  const b=document.createElement('button');b.dataset.financeNav='true';b.textContent='재정·계약';b.onclick=()=>setTab('finance');nav.prepend(b);
 }
};
const paidActions={trainTrainer:50000,scoutPokemon:100000,upgradeAcademy:()=>15000*game.academy,recruitReserve:120000,applyWeeklyProgram:()=>TLM_WEEKLY_PROGRAMS.find(p=>p.id===weeklyDraft)?.cost||0};
for(const [name,cost] of Object.entries(paidActions)){
 const previous=window[name];if(typeof previous!=='function')continue;
 window[name]=function(...args){return notify(()=>{
  initialize();const due=typeof cost==='function'?cost():cost;
  if(due>0){const checked=accounting.canSpend(game,own().id,due);if(!checked.ok)throw Error(checked.reason);}
  return journal('구단 운영 비용',()=>previous(...args));
 });};
}
const previousRelease=marketRelease;
window.marketRelease=function(kind,slot){return notify(()=>{
 if(accounting.locked(game,own().id))throw Error('경기 결과 확인 후 변경할 수 있습니다.');
 return journal('계약 해지',()=>previousRelease(kind,slot));
});};
window.marketRenew=(kind,slot)=>{initialize();const t=(kind==='active'?own().trainers:kind==='academy'?own().trainerAcademy:own().reserveTrainers)?.[slot];if(t)renewal(kind,slot,accounting.contract(game,t)?.id);};
window.marketFreeAgent=freeAgent;
for(const name of ['aiExecuteBid','aiSignFreeAgent','aiRespondToOffer','academyPromote']){
 const previous=window[name];if(typeof previous!=='function')continue;
 window[name]=function(...args){return notify(()=>journal(name==='academyPromote'?'아카데미 승격':'구단 이적 거래',()=>{
  if(game.pendingMatch&&['running','watch'].includes(game.pendingMatch.phase)){
   if(name==='aiRespondToOffer'||name==='academyPromote')throw Error('경기 결과 확인 후 변경할 수 있습니다.');
   const involved=[args[0]?.id,args[1]?.seller?.id];if(involved.some(id=>accounting.locked(game,id)))return false;
  }
  if(name==='aiExecuteBid'||name==='aiSignFreeAgent'){
   const buyer=args[0];if(accounting.book(game,buyer.id).arrears)return false;
  }
  return previous(...args);
 }));};
}
const previousFinishSeason=seasonSettlement;
window.seasonSettlement=function(){
 const season=game?.season;if(!game||game.seasonSettled||game.round!==18)return previousFinishSeason();
 return transaction('시즌 결산',()=>{const result=previousFinishSeason();if(result){
  // Operating weeks 25–30 still have payroll; the cash report closes at rollover.
  game.log.unshift('시즌 재정은 30주차 급여까지 정산한 뒤 확정합니다.');
 }return result;});
};
window.ClubFinance={...accounting,initialize,transaction,journal,income,spend,beforeAdvance,proposal,offerHTML,transfer,
 canSpend:n=>accounting.canSpend(game,own().id,n),
 offerSalary:v=>{if([1,1.1,1.25].includes(Number(v))){game.marketV2.salaryMultiplier=Number(v);persist();renderOffice();}},
 offerYears:v=>{if([1,2,3].includes(Number(v))){game.marketV2.contractYears=Number(v);persist();renderOffice();}},
 renewalSalary:v=>{if([1,1.1,1.25].includes(Number(v))){game.finance.renewalDraft.multiplier=Number(v);persist();renderOffice();}},
 renewalYears:v=>{if([1,2,3].includes(Number(v))){game.finance.renewalDraft.years=Number(v);persist();renderOffice();}},
 renew:(kind,slot,id)=>notify(()=>renewal(kind,slot,id)),
 letExpire:id=>{const t=accounting.members(own()).find(x=>x.trainer.financeContractId===id)?.trainer;if(t){t.contractDecision={status:'accepted',contractId:id};persist();renderOffice();}},
 closeSeason:()=>{for(const c of game.clubs){const s=accounting.seasonBook(game,c.id);if(s.closed)continue;const report=accounting.financialReport(game,c.id);s.closed=true;s.closing=report.cash;s.arrears=report.arrears;s.score=report.score;}},
 chanceAdjustment:(t,base)=>{const q=proposal(t,base);return (q.salary/Math.max(1,t.profile?.salary||3000000)-1)*.5;},
 ready:()=>ready
};
if(game){initialize();originalPersist();renderOffice();}
const style=document.createElement('style');style.textContent='.finance-grid{display:grid;grid-template-columns:repeat(auto-fit,minmax(160px,1fr));gap:9px}.finance-grid>div,.finance-contracts article{background:#19354b;border:1px solid #426079;padding:12px;margin:8px 0;border-radius:7px}.finance-grid small,.finance-grid b{display:block}.finance-grid small{font-size:11px}.finance-grid b{font-size:17px}.finance-page p,.finance-contracts p,.finance-offer p{font-size:12px;line-height:1.7}.finance-controls{display:flex;flex-wrap:wrap;gap:12px}.finance-controls select,.finance-offer select{padding:7px;background:#203d52;color:white;border:1px solid #7394a6}.finance-alert{color:#ffcf92}.finance-page details{border-bottom:1px solid #496476;padding:8px}.finance-offer{border-top:1px solid #537183;margin-top:12px;padding-top:10px}';document.head.append(style);
