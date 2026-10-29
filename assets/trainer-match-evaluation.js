/* Read-only, evidence-based trainer match review. No tactical ranking, save
 * mutations or causal "this choice won" inference. Used only by feedback UI. */
(function(root){
 'use strict';
 const rows=v=>Array.isArray(v)?v:[];
 const count=v=>Number.isFinite(v)&&v>=0?v:0;
 const esc=value=>String(value??'').replace(/[&<>"']/g,ch=>({
   '&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'
 }[ch]));
 const ratio=x=>Math.round(x*100)+'%';
 function summarize(result,side='home'){
   const sideName=side==='away'?'away':'home',
     sideId=sideName==='away'?'p2':'p1',
     teamLabel=sideName==='away'?'B':'A',
     participantField=sideName==='away'?'trainerB':'trainerA';
   const team=rows(result?.teams?.[sideName]);
   const ace=result?.aceHandoffs?.[teamLabel];
   return team.map((trainer,slot)=>{
     const appearances=rows(result?.rounds).flatMap((round,duel)=>
       round?.[participantField]===slot?[{round,duel}]:[]);
     const recorded=appearances.filter(({round})=>
       round?.switchOutcomes?.bySide?.[sideId]);
     const decisions=appearances.map(({round})=>round?.aiDecisions?.[sideId])
       .filter(x=>x&&typeof x==='object');
     const quantified=decisions.filter(x=>x.switchAnalysis&&typeof x.switchAnalysis==='object');
     const ppEntries=decisions.filter(x=>Number.isFinite(x.ppConservations));
     const traitLabels={kill:'킬각 포착',switch:'적극적인 교체',
       matchup:'상성 교체 전문가',preserve:'에이스 보존',pp:'PP 관리자',
       status:'상태이상 전문가',analysis:'전황 분석가'};
     const traitUses=Object.entries(traitLabels).flatMap(([kind,name])=>{
       const count=decisions.reduce((sum,entry)=>
         sum+Math.max(0,Number(entry.traitUses?.[kind])||0),0);
       return count>0?[{kind,name,count}]:[];
     });
     const acc=(list,get)=>list.reduce((sum,x)=>sum+count(get(x)),0);
     const matched=acc(recorded,({round})=>round.switchOutcomes.bySide[sideId].matched);
     const choices=acc(recorded,({round})=>round.switchOutcomes.bySide[sideId].choices);
     const unlinked=acc(recorded,({round})=>round.switchOutcomes.bySide[sideId].unmatched);
     const damageSum=acc(recorded,({round})=>round.switchOutcomes.bySide[sideId].totalHpLossFraction);
     const dangerous=[];
     for(const {round,duel} of recorded){
       const info=rows(round.switchOutcomes.switches);
       for(const event of info.filter(x=>x.side===sideId)){
         const own=rows(trainer?.team).find(mon=>mon.name===event.target);
         const fraction=count(event.hpLostFraction);
         if(fraction<=0&&event.survivedWindow!==false)continue;
         dangerous.push({duel,turn:Number.isInteger(event.turn)?event.turn:1,
           pokemon:own?.displayName||event.species||event.target||'포켓몬',
           lossFraction:fraction,fainted:event.survivedWindow===false});
       }
     }
     dangerous.sort((a,b)=>b.lossFraction-a.lossFraction||b.fainted-a.fainted);
     const bigLoss=dangerous.filter(x=>x.lossFraction>=.3).length;
     const fainted=acc(recorded,({round})=>round.switchOutcomes.bySide[sideId].windowDeaths);
     const aceRecords=ace&&Array.isArray(ace.records)?
       ace.records.filter(x=>x.trainerIndex===slot):null;
     const aceReady=aceRecords?aceRecords.filter(x=>x.ready).length:null;
     const aceNotReady=aceRecords?aceRecords.filter(x=>!x.ready).length:null;
     const observed={
       slot,name:trainer?.name||'트레이너 '+(slot+1),
       duels:appearances.length,
       wins:appearances.filter(({round})=>round.winner===teamLabel).length,
       measuredDuels:recorded.length,
       choices:recorded.length?choices:null,
       matched:recorded.length?matched:null,
       unlinked:recorded.length?unlinked:null,
       meanEntryLoss:recorded.length&&matched>0?damageSum/matched:null,
       bigLoss:recorded.length?bigLoss:null,
       fainted:recorded.length?fainted:null,
       observations:quantified.length?
         {avoided:acc(quantified,x=>x.switchAnalysis.avoided),
           urgent:acc(quantified,x=>x.switchAnalysis.urgentSwitches),
           aceProtected:acc(quantified,x=>x.switchAnalysis.aceProtected),
           saferReserve:acc(quantified,x=>x.switchAnalysis.saferReserveChosen)}:null,
       ppSaves:ppEntries.length?acc(ppEntries,x=>x.ppConservations):null,
       traitUses,
       aceHandoffs:aceRecords?.length??null,aceReady,
       aceNotReady,
       aceLeadKnown:aceRecords?aceRecords.filter(x=>x.readyVsLead!=null).length:null,
       aceAgainstLead:aceRecords?aceRecords.filter(x=>x.readyVsLead===true).length:null,
       dangerous:dangerous.slice(0,3)
     };
     const strengths=[],reviews=[];
     if(observed.observations?.avoided>0)strengths.push('중립 교체 유보 판단 '+observed.observations.avoided+'회');
     if(observed.observations?.urgent>0)strengths.push('체력·상성 위험에서 교체 '+observed.observations.urgent+'회');
     if(observed.observations?.aceProtected>0)strengths.push( '에이스 투입 유보 신호 '+observed.observations.aceProtected+'회');
     if(observed.observations?.saferReserve>0)strengths.push('공개 기술에 안전한 예비 포켓몬 선택 '+observed.observations.saferReserve+'회');
     if(observed.ppSaves>0)strengths.push('PP 보존 선택 '+observed.ppSaves+'회');
     if(observed.aceReady>0)
       strengths.push('다음 주자에 공격 가능한 에이스 인계 '+observed.aceReady+'/'+observed.aceHandoffs+'회');
     if(observed.bigLoss>0)
       reviews.push('교체한 턴 HP 30% 이상 손실 '+observed.bigLoss+'회');
     if(observed.fainted>0)
       reviews.push('교체한 턴 기절 '+observed.fainted+'회');
     if(observed.aceNotReady>0)
       reviews.push('다음 주자 시점 에이스 전투 불가 '+observed.aceNotReady+'회');
     if(observed.unlinked>0)
       reviews.push('교체 선택 로그 미연결 '+observed.unlinked+'회');
     if(observed.duels===0)reviews.push('미출전 · 전술 평가 대상 아님');
     else if(observed.measuredDuels===0)
       reviews.push('상세 교체 기록 없음 · 지난 버전 경기일 수 있습니다');
     if(observed.duels>0&&observed.matched!==null&&observed.matched<3)
       reviews.push('교체 관련 관측 '+observed.matched+'회 · 표본이 적습니다');
     observed.strengths=strengths;
     observed.reviews=reviews;
     return observed;
   });
 }
 function renderOne(record,confirmed=false){
   if(!record||record.duels===0)return '';
   const metrics=[
     ['관측 교체',record.matched===null?'기록 없음':record.matched+'회'],
     ['교체 직후 손실',record.meanEntryLoss===null?'측정 없음':ratio(record.meanEntryLoss)],
     ['PP 보존 선택',record.ppSaves===null?'기록 없음':record.ppSaves+'회'],
     ['에이스 인계',record.aceHandoffs===null?'기록 없음':record.aceReady+'/'+record.aceHandoffs+'회']
   ];
   const metricsHTML='<div class="mte-grid">'+metrics.map(([label,value])=>
     '<div class="mte-stat"><span>'+esc(label)+'</span><strong>'+esc(value)+'</strong></div>').join('')+'</div>';
   const points=(label,list,empty,klass)=>
     '<div class="'+klass+'"><b>'+esc(label)+'</b><p>'+
     (list.length?list.map(esc).join(' · '):esc(empty))+'</p></div>';
   const uses=record.traitUses?.length?
     '<p class="mte-note">습득 선플 관련 실제 선택: '+
       record.traitUses.map(x=>esc(x.name)+' '+esc(x.count)+'회').join(' · ')+'</p>':'';
   const positives=points('관찰된 전술 행동',record.strengths,
     (record.observations||record.ppSaves!==null?'관련 특성 행동이 관찰되지 않았습니다.':'관련 세부 기록이 없습니다.'),'mte-observed');
   const cautions=points('추가로 살펴볼 장면',record.reviews,
     '이번 경기에서는 별도 검토 신호가 기록되지 않았습니다.','mte-review');
   const scenes=record.dangerous.slice(0,2).map((event,index)=>
     '<button type="button" class="g-btn alt mte-replay" data-feedback-trainer-scene="'+
     record.slot+':'+index+'"'+(!confirmed?' disabled':'')+'>'+
     esc((event.duel+1)+'번째 대결 '+event.turn+'턴 · '+event.pokemon+
     ' 손실 '+ratio(event.lossFraction))+' 보기</button>').join('');
   const summary='이번 경기 전술 관찰 · 교체 '+(
     record.matched===null?'미측정':record.matched+'회')+
     ' · PP 보존 '+(record.ppSaves===null?'미측정':record.ppSaves+'회');
   return '<details class="mte-panel" aria-label="'+esc(record.name)+' 전술 평가">'+
     '<summary>'+esc(summary)+'</summary>'+
     '<p class="mte-note">실제 출전 '+record.duels+'대결 · 승리 '+record.wins+
     '대결 · 선택과 승패 사이의 인과관계는 확인할 수 없습니다.</p>'+
     metricsHTML+uses+positives+cautions+(scenes?'<div class="mte-actions">'+scenes+'</div>':'')+
     '<p class="mte-note">행동을 기록한 것이며 AI의 절대 등급 또는 최선의 선택 판정은 아닙니다.</p>'+
     '</details>';
 }
 root.TrainerMatchEvaluation=Object.freeze({summarize,renderOne});
})(globalThis);
