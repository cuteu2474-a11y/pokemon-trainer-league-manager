/* Secretary's actionable to-do list. Never alters game state or invents pending decisions. */
(function(root){
'use strict';
if(root.PentaSecretaryTasks)return;
const list=value=>Array.isArray(value)?value:[];
function build(game,club){
 if(!game||!club)return [];
 const tasks=[];
 const put=(id,title,detail,route,urgent=false)=>tasks.push({id,title,detail,route,urgent});
 const season=Number(game.season)||1,week=Number(game.week)||1;
 const match=game.pendingMatch;
 if(match){
  const live=['watch','running','research','retry'].includes(match.phase);
  put('match',live?'진행 중인 경기 확인':'경기 준비 및 출전 순서 확정',
   live?'경기 화면에서 남은 절차를 확인하세요.':'트레이너 5명의 출전 순서와 포켓몬 상태를 확인하세요.','match',true);
 }
 const offers=list(game.aiOffers).filter(o=>o?.status==='pending'&&Number(o.season)===season&&Number(o.expires)>=week);
 if(offers.length)put('offers','이적 제안 응답 '+offers.length+'건',
  '수락·거절 등 처리가 필요한 제안입니다.','ai',true);
 const roster=[...list(club.trainers),...list(club.reserveTrainers)];
 const candidates=roster.filter(t=>t?.pokemonScouting?.candidate);
 if(candidates.length)put('scouting','포켓몬 등록 결정 '+candidates.length+'건',
  '탐색으로 얻은 포켓몬의 등록 여부를 결정하세요.','scout',true);
 const allTrainers=[...roster,...list(club.trainerAcademy)];
 const contracts=allTrainers.filter(t=>t?.contractDecision?.status==='pending');
 if(contracts.length)put('contracts','계약 관련 결정 '+contracts.length+'건',
  '계약 만료 또는 재계약 요청을 확인하세요.','transfer',true);
 const ready=list(club.trainers).filter(t=>t&&list(t.pokemon).length===6).length;
 if(ready!==5)put('lineup','출전 선수단 편성',
  '6마리씩 보유한 트레이너 '+ready+'/5명 · 편성을 확인하세요.','team',true);
 if([4,15].includes(week)&&!match){
  put('market','이적시장 마감 확인',
   week+'주차 · 마감 전에 영입 및 계약 결정을 확인하세요.','transfer',true);
 }
 const research=String(game.management?.notice||'');
 const key=season+':'+week;
 if(/이번 주 기술 연구를 완료하지 못했습니다|기술 연구를 재시도/.test(research)&&
   game.trainerAI?.movesProcessedWeek!==key){
  put('research','기술 연구 재시도',
   '이번 주 연구가 완료되지 않았습니다.','research',true);
 }
 return tasks;
}
root.PentaSecretaryTasks={build};
})(typeof window==='undefined'?globalThis:window);
