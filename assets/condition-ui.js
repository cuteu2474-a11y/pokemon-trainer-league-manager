import * as model from '../src/core/squad-condition.js';
const at=()=>({season:game.season,week:game.week});
function canDispatch(trainer,kind){
 if(kind==='active'&&typeof calendarRoundForWeek==='function'&&(calendarRoundForWeek(game.week)||0)>game.round)return {ok:false,error:'이번 주 공식 경기에 출전할 주전은 파견할 수 없습니다. 후보 트레이너를 선택해 주세요.'};
 return {ok:true};
}
const priorFresh=freshGame;
window.freshGame=function(...args){const g=priorFresh(...args);model.initializeCondition(g);return g;};
window.SquadCondition={...model,away:(t,clock=at())=>model.awayAt(t,clock),resting:t=>model.fatigue(t)>=model.CONDITION_RULES.trainingRestAt,
 canDispatch,advance:()=>model.recoverWeek(game),program:(id,t)=>model.programLoad(game,myClub(),t,id),
 match:m=>{const p=game.pendingMatch;const result=p?.result?.home===m.home&&p.result.away===m.away?p.result:null;return model.matchLoad(game,m,{id:game.season+':'+(game.round+1)+':'+m.home+':'+m.away,result});},
 project(request,clock){for(const c of [request.home,request.away])model.projectClubCondition(c,at(),clock);},
 fitness:(mon,t,clock)=>100-model.projectedFatigue(mon,t,at(),clock),
 description(t,clock){const value=model.condition({fatigue:model.projectedFatigue(t,t,at(),clock)}),away=model.awayAt(t,clock);return (clock.season!==game.season||clock.week!==game.week?'예상 컨디션 ':'컨디션 ')+value.fitness+'/100 · 피로 '+value.fatigue+'/100'+(value.judgmentPenalty?' · 판단 능력 −'+value.judgmentPenalty:'')+(away?' · 파견 중 · 출전 불가':t?.pokemonScouting?.mission?.status==='travel'?' · 경기 주차 귀환 예정':' · 출전 가능');}
};
const esc=value=>String(value??'').replaceAll('&','&amp;').replaceAll('<','&lt;').replaceAll('>','&gt;').replaceAll('"','&quot;');
const priorRender=renderOffice;
window.renderOffice=function(...args){
 if(game)model.initializeCondition(game);const result=priorRender(...args);
 if(typeof document==='undefined'||!game||!['team','profile','pokemon'].includes(tab))return result;
 const panel=document.getElementById('dashpanel');if(!panel)return result;
 document.getElementById('squad-condition-list')?.remove();
 const box=document.createElement('details');box.id='squad-condition-list';
 box.innerHTML='<summary>선수단 개인 컨디션</summary><p>컨디션은 100−개인 피로입니다. 매주 자연 회복 5, 주간 휴식 25. 경기용 HP·PP 복구로 개인 피로가 없어지지는 않습니다.</p>'+[...(myClub().trainers||[]),...(myClub().reserveTrainers||[])].filter(Boolean).map(t=>'<p><strong>'+esc(t.name)+'</strong> · '+esc(window.SquadCondition.description(t,at()))+'<br>'+t.pokemon.map(p=>esc(p.name)+' '+(100-model.fatigue(p))+'/100').join(' · ')+'</p>').join('');panel.append(box);return result;
};
if(game){model.initializeCondition(game);persist();renderOffice();}
