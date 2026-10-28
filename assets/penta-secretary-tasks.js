/* FM-style secretary: live pending decisions, actionable suggestions and league agenda.
   Read-only selectors; tasks disappear only when their real source state changes. */
(function(root){
'use strict';
if(root.PentaSecretaryTasks)return;
const list=v=>Array.isArray(v)?v:[];
const n=v=>Number(v)||0;
function build(game,club){
 if(!game||!club)return [];
 const tasks=[];
 const add=(id,title,detail,route,extra={})=>
  tasks.push({id,title,detail,route,urgent:true,type:'required',...extra});
 const season=n(game.season)||1,week=n(game.week)||1;
 const match=game.pendingMatch;
 if(match){
  const live=['watch','running','research','retry'].includes(match.phase);
  add('match',live?'진행 중인 경기 확인':'경기 준비 및 출전 순서 확정',
   live?'경기 관전 또는 남은 절차를 확인하세요.':'출전 순서와 포켓몬 상태를 확정하세요.','match',
   {priority:100,deadline:'지금',action:'경기 화면'});
 }
 const offers=list(game.aiOffers).filter(o=>o?.status==='pending'&&n(o.season)===season&&n(o.expires)>=week);
 if(offers.length){
  const last=Math.min(...offers.map(o=>n(o.expires)));
  add('offers','이적 제안 응답 '+offers.length+'건',
   '처리하지 않은 이적 제안의 수락·거절을 결정하세요.','ai',
   {priority:97,deadline:last===week?'이번 주 마감':last+'주차 마감',action:'제안 확인'});
 }
 const roster=[...list(club.trainers),...list(club.reserveTrainers)];
 const candidates=roster.filter(t=>t?.pokemonScouting?.candidate);
 if(candidates.length)add('scouting','포켓몬 등록 결정 '+candidates.length+'건',
  '탐색으로 얻은 포켓몬의 등록 여부를 결정하세요.','scout',
  {priority:95,action:'등록 결정'});
 const allTrainers=[...roster,...list(club.trainerAcademy)];
 const contracts=allTrainers.filter(t=>t?.contractDecision?.status==='pending');
 if(contracts.length)add('contracts','계약 관련 결정 '+contracts.length+'건',
  '재계약 또는 계약 만료 결정을 확인하세요.','transfer',
  {priority:93,action:'계약 확인'});
 const ready=list(club.trainers).filter(t=>t&&list(t.pokemon).length===6).length;
 if(ready!==5)add('lineup','출전 선수단 편성',
  '포켓몬 6마리를 보유한 주전 트레이너 '+ready+'/5명','team',
  {priority:90,action:'선수단 보기'});
 if([4,15].includes(week)&&!match)
  add('market','이적시장 마감 확인',week+'주차 · 마감 전 계약과 영입을 확인하세요.','transfer',
   {priority:88,deadline:'이번 주 마감',action:'시장 확인'});
 const research=String(game.management?.notice||'');
 if(/이번 주 기술 연구를 완료하지 못했습니다|기술 연구를 재시도/.test(research)&&
    game.trainerAI?.movesProcessedWeek!==season+':'+week)
  add('research','기술 연구 재시도','진행이 중단된 기술 연구를 다시 요청하세요.','research',
   {priority:85,action:'재시도'});
 const arrears=Number(game.finance?.books?.[club.id]?.arrears)||0;
 if(arrears>0)add('finance','구단 미지급금 확인',
  '미지급금 '+Math.round(arrears).toLocaleString('ko-KR')+'원 · 유료 활동 제한을 확인하세요.','finance',
  {priority:83,action:'재정 확인'});
 return tasks;
}
function agenda(game){
 if(!game)return null;
 const season=n(game.season)||1,week=n(game.week)||1;
 if(game.pendingMatch)return {label:'경기 준비 중',detail:'경기 화면에서 출전 선수단을 확인하세요.',action:'match'};
 const round=(n(game.round)||0)+1;
 if(round<1||round>18)return null;
 // League calendar: rounds 1–9 on weeks 5–13; rounds 10–18 on weeks 16–24.
 const matchWeek=round<=9?round+4:round+6;
 const weeksUntil=matchWeek-week;
 if(weeksUntil<0)return null;
 return {round,week:matchWeek,weeksUntil,
  label:round+'라운드 · '+matchWeek+'주차',
  detail:weeksUntil===0?'이번 주 리그 경기':weeksUntil+'주 후 예정',
  action:'fixtures'};
}
function suggest(game,club){
 if(!game||!club)return [];
 const advice=[],week=n(game.week)||1;
 const add=(id,title,detail,route,priority)=>advice.push({
  id,title,detail,route,priority,urgent:false,type:'advice',action:'확인하기'
 });
 const fatigue=Number(club.fatigue);
 if(Number.isFinite(fatigue)&&fatigue>=45)
  add('fatigue','선수단 피로 회복 검토',
   '피로 '+Math.round(fatigue)+'/100 · 회복 프로그램을 확인하세요.','weekly',65);
 const morale=Number(club.morale);
 if(Number.isFinite(morale)&&morale<35)
  add('morale','선수단 사기 점검',
   '현재 사기 '+Math.round(morale)+'/100 · 선수단 상태를 살펴보세요.','team',55);
 const next=agenda(game);
 if(next?.round&&next.weeksUntil<=1&&next.weeksUntil>=0){
  if(!build(game,club).some(task=>task.id==='lineup'||task.id==='match'))
   add('pre-match','다음 경기 대비',
    next.label+' · 출전 전략과 트레이너 상태를 점검하세요.','tactics',48);
 }
 return advice.sort((a,b)=>b.priority-a.priority);
}

function briefing(game,club){
 if(!game||!club)return null;
 const season=n(game.season)||1,week=n(game.week)||1;
 const done=list(game.weeklyPrograms).find(p=>Number(p?.season)===season&&Number(p?.week)===week);
 const fatigue=Number(club.fatigue),morale=Number(club.morale);
 return {ready:list(club.trainers).filter(t=>t&&list(t.pokemon).length===6).length,
  fatigue:Number.isFinite(fatigue)?Math.round(fatigue):null,
  morale:Number.isFinite(morale)?Math.round(morale):null,
  activity:done?String(done.title||'완료'):'미실행'};
}
function trainingTargets(club){
 if(!club)return [];
 const members=[...list(club.trainers).map((t,i)=>({t,i,group:'주전'})),
  ...list(club.reserveTrainers).map((t,i)=>({t,i,group:'후보'}))];
 return members.filter(x=>x.t).map(({t,i,group})=>({
  id:String(t.uid??('legacy:'+t.id+':'+t.name)),
  label:group+' '+(i+1)+' · '+String(t.name||'트레이너')
 }));
}
root.PentaSecretaryTasks={build,suggest,agenda,briefing,trainingTargets};
})(typeof window==='undefined'?globalThis:window);
