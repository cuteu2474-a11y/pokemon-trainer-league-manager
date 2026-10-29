/* Lightweight, read-only post-match insights; runs in browser and Node VM.
 * This is presentation logic only: never recomputes combat or changes a save.
 */
(function(root){
 'use strict';
 const arr=v=>Array.isArray(v)?v:[];
 const safeNum=(n,defaultValue=0)=>Number.isFinite(Number(n))?Number(n):defaultValue;
 const percent=f=>Math.round(safeNum(f)*100)+'%';
 const esc=s=>String(s??'').replace(/[&<>"']/g,ch=>({
   '&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'
 }[ch]));
 const sideKey=side=>side==='away'?'p2':'p1';
 const trainerField=side=>side==='away'?'trainerB':'trainerA';
 function summarize(result,side='home'){
   const key=sideKey(side),team=arr(result?.teams?.[side]);
   let measured=0,matched=0,choices=0,unmatched=0,deaths=0,damageSum=0;
   const evidence=[];
   for(const [duel,round] of arr(result?.rounds).entries()){
     const outcomes=round?.switchOutcomes;
     const metric=outcomes?.bySide?.[key];
     if(!metric)continue;
     measured++;
     choices+=safeNum(metric.choices);
     matched+=safeNum(metric.matched);
     unmatched+=safeNum(metric.unmatched);
     deaths+=safeNum(metric.windowDeaths);
     // Preserve aggregation across duels, regardless of their switch counts.
     damageSum+=safeNum(metric.totalHpLossFraction);
     const trainerIndex=round?.[trainerField(side)];
     for(const row of arr(outcomes?.switches).filter(x=>x.side===key)){
       const trainer=team[trainerIndex];
       const own=arr(trainer?.team).find(mon=>mon.name===row.target);
       const fraction=Math.max(0,safeNum(row.hpLostFraction));
       evidence.push({
         duel,turn:Number(row.turn)||1,trainerIndex,
         trainer:trainer?.name||('출전 '+(Number(trainerIndex)+1)),
         pokemon:own?.displayName||row.species||row.target||'포켓몬',
         damageFraction:fraction,
         fainted:row.survivedWindow===false,
         remainingFraction:row.exitHpFraction==null?null:Math.max(0,safeNum(row.exitHpFraction))
       });
     }
   }
   const ace=result?.aceHandoffs?.[side==='away'?'B':'A'];
   const aceAvailable=ace&&Array.isArray(ace.records);
   const aceRecords=aceAvailable?ace.records.map(rec=>({
     duel:Number(rec.duelIndex)||0,
     trainerIndex:Number(rec.trainerIndex)||0,
     trainer:team[rec.trainerIndex]?.name||('출전 '+(Number(rec.trainerIndex)+1)),
     pokemon:rec.species||'에이스',
     alive:rec.alive===true,ready:rec.ready===true,
     readyVsLead:rec.readyVsLead,
     lead:rec.nextOpponentLead,
     hp:rec.hpAfterRecoveryFraction,
     pp:rec.remainingAttackingPP,
     nextSurvived:rec.stoodNextDuel===true
   })):[];
   const worst=[...evidence].sort((a,b)=>b.damageFraction-a.damageFraction)
     .filter(item=>item.damageFraction>0||item.fainted).slice(0,4);
   return {
     available:measured>0||Boolean(aceAvailable),
     switchAvailable:measured>0,aceAvailable:Boolean(aceAvailable),
     measuredDuels:measured,choices,matched,unmatched,deaths,
     meanLoss:matched>0?damageSum/matched:null,
     heavyLoss:evidence.filter(x=>x.damageFraction>=.3).length,
     switches:evidence,worst,
     aceHandoffs:safeNum(ace?.handoffs),
     aceAlive:safeNum(ace?.alive),
     aceReady:safeNum(ace?.ready),
     aceLeadKnown:safeNum(ace?.leadKnown),
     aceReadyVsLead:safeNum(ace?.readyVsLead),
     aceNextSurvived:safeNum(ace?.stoodNextDuel),
     aceRecords
   };
 }
 function render(result,side='home',confirmed=false){
   const d=summarize(result,side);
   const base='<section class="mfi-report" aria-label="경기 판단 근거">'+
     '<h3>교체·에이스 실전 기록</h3>';
   if(!d.available)return base+
     '<p class="mfi-note">이 경기에는 교체 피해·에이스 인계 상세 기록이 없습니다. 이전 버전 경기이거나 분석 기록이 없는 경우입니다.</p></section>';
   const value=(label,v,sub='')=>'<div class="mfi-metric"><span>'+esc(label)+
     '</span><strong>'+esc(v)+'</strong>'+(sub?'<small>'+esc(sub)+'</small>':'')+'</div>';
   const metrics='<div class="mfi-metrics">'+
     value('자발적 교체',d.switchAvailable?d.matched+' / '+d.choices:'기록 없음',
       d.unmatched?'로그 미연결 '+d.unmatched+'회':'실제 경기 로그 연결')+
     value('교체한 턴 HP 손실',d.switchAvailable?(d.meanLoss==null?'대상 없음':percent(d.meanLoss)):'기록 없음','최대 HP 대비 평균')+
     value('교체한 턴 기절',d.switchAvailable?d.deaths+'회':'기록 없음',
       d.switchAvailable?'HP 30% 이상 손실 '+d.heavyLoss+'회':'')+
     value('다음 주자 대응',d.aceAvailable?d.aceReady+' / '+d.aceHandoffs:'기록 없음',
       '생존·공격 PP 기준')+'</div>';
   const switchRows=d.worst.length?
     '<div class="mfi-scene-list">'+d.worst.map((x,i)=>
       '<article class="mfi-scene"><div><strong>'+esc(x.pokemon)+'</strong>'+
       '<span>'+esc(x.trainer)+' · '+(x.duel+1)+'번째 대결 '+x.turn+'턴</span></div>'+
       '<span class="mfi-loss">HP 손실 '+percent(x.damageFraction)+
       (x.fainted?' · 기절':'')+'</span>'+
       '<button type="button" class="g-btn alt" data-feedback-insight-scene="'+i+'"'+
       (!confirmed?' disabled aria-disabled="true"':'')+'>장면 보기</button></article>'
     ).join('')+'</div>':
     '<p class="mfi-note">해당 경기에서 교체 직후 HP 손실이 기록된 장면이 없습니다.</p>';
   const switchSection=d.switchAvailable?
     '<details class="mfi-details" open><summary>교체 후 피해가 컸던 장면</summary>'+
     '<p class="mfi-note">경기 로그 기준입니다. 공격·진입 함정·상태이상·자기 피해 등을 합산하며, 손실이 크다고 교체가 잘못됐다는 뜻은 아닙니다.</p>'+
     switchRows+(d.unmatched?'<p class="mfi-note">기록된 선택 중 '+d.unmatched+'회는 로그와 연결되지 않아 피해 계산에서 제외했습니다.</p>':'')+
     '</details>':'<p class="mfi-note">이 경기의 상세 교체 기록은 제공되지 않았습니다.</p>';
   const aceRows=d.aceRecords.length?d.aceRecords.map(x=>{
     const lead=x.readyVsLead==null?'상대 선발 기록 없음':
       x.readyVsLead?'상대 선발에 유효한 공격 가능':'상대 선발에 유효한 공격기 없음';
     const next=!x.alive?'기절 상태':
       !x.ready?'공격 PP 부족':
       lead;
     return '<div class="mfi-ace-row"><div><strong>'+esc(x.pokemon)+'</strong>'+
       '<span>'+esc(x.trainer)+' · '+(x.duel+1)+'→'+(x.duel+2)+'번째 대결</span></div>'+
       '<div><b>'+esc(next)+'</b><small>인계 HP '+(x.hp==null?'—':percent(x.hp))+
       ' · 공격 PP '+esc(x.pp??'—')+' · 다음 경기 종료 시 '+(x.nextSurvived?'생존':'기절')+
       (x.lead?' · 상대 선발 '+esc(x.lead):'')+'</small></div></div>';
   }).join(''):'<p class="mfi-note">다음 주자로 이어진 에이스 기록이 없습니다.</p>';
   const aceSection=d.aceAvailable?'<details class="mfi-details"><summary>에이스의 다음 주자 대응</summary>'+
     '<p class="mfi-note">인계 '+d.aceHandoffs+'회 · 인계 생존 '+d.aceAlive+
     '회 · 공격 PP 보유 '+d.aceReady+'회'+
     (d.aceLeadKnown?' · 상대 선발에 유효한 공격 '+d.aceReadyVsLead+'/'+d.aceLeadKnown+'회':'')+
     '</p><div class="mfi-ace-list">'+aceRows+'</div>'+
     '<p class="mfi-note">상대 선발의 타입은 경기 후 공개 로그로 확인한 정보이며, AI가 경기 전에 미래 정보를 안다는 의미는 아닙니다.</p></details>':
     '<p class="mfi-note">에이스 인계 기록이 제공되지 않았습니다.</p>';
   return base+metrics+switchSection+aceSection+
     '<p class="mfi-note">실제 기록과 인과적 평가를 구분합니다. 교체를 하지 않았을 때의 결과는 확인할 수 없으며, 이 기록은 승패·성장 정산에 영향을 주지 않습니다.</p></section>';
 }
 root.MatchFeedbackInsights=Object.freeze({summarize,render});
})(globalThis);
