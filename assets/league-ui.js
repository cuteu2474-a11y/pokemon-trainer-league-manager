import {STANDINGS_RULES,fastClubScore} from '../src/core/standings.js';
import {ensureRanking,webStandings,archiveStandings} from '../src/league/web-standings.js';
const esc=v=>escapeHTML(String(v??''));
let selectedDivision=null;
function clubs(g,division){const byId=new Map(g.clubs.map(c=>[String(c.id),c]));return webStandings(g,division).map(row=>byId.get(String(row.id)));}
const priorFresh=freshGame;
window.freshGame=function(...args){const g=priorFresh(...args);ensureRanking(g);return g;};
const priorPersist=persist;
window.persist=function(){if(game)ensureRanking(game);return priorPersist();};
function render(){
 if(!game||tab!=='league')return;
 const panel=document.getElementById('dashpanel');if(!panel)return;
 const division=selectedDivision??myClub().division,state=ensureRanking(game),rows=webStandings(game,division),byId=new Map(game.clubs.map(c=>[String(c.id),c]));
 const rowHTML=rows.map(row=>{
  const info=row.ranking,mini=info.headToHead,tied=info.group.length>1;
  const names=info.group.map(id=>byId.get(String(id))?.name||id).join(' · ');
  return '<tr class="'+(String(row.id)===String(myClub().id)?'mine':'')+'"><td>'+row.rank+'</td><td>'+esc(row.name)+'</td><td>'+row.played+'</td><td>'+row.won+'</td><td>'+row.drawn+'</td><td>'+row.lost+'</td><td>'+row.for+'</td><td>'+(row.for-row.against)+'</td><td><b>'+row.points+'</b></td><td>'+(tied?'<details><summary>동률 '+info.group.length+'팀</summary><p>'+esc(names)+'</p><p>해당 집단 상대 전적 '+mini.played+'경기 · 승점 '+mini.points+' · 격파 득실 '+(mini.for-mini.against)+'</p></details>':'—')+'</td><td>'+info.lottery+'</td></tr>';
 }).join('');
 const past=Object.values(game.leagueSeasons||{}).sort((a,b)=>b.season-a.season)[0];
 const pastHTML=past?'<details><summary>지난 '+past.season+'시즌 확정 순위·승강</summary><p>'+past.tables[division].map(row=>row.rank+'위 '+esc(row.name)+' ('+row.points+'점)').join(' · ')+'</p><p>'+past.movement.filter(m=>m.from===division||m.to===division).map(m=>esc(byId.get(String(m.id))?.name||m.id)+' '+(m.from+1)+'부 → '+(m.to+1)+'부').join(' · ')+'</p></details>':'';
 panel.innerHTML='<h2>리그 순위표</h2><label>리그 <select id="league-division">'+[0,1,2,3].map(d=>'<option value="'+d+'" '+(d===division?'selected':'')+'>'+(d+1)+'부</option>').join('')+'</select></label><p>'+esc(STANDINGS_RULES.description)+'</p><div class="league-table-scroll"><table class="g-table"><thead><tr><th>#</th><th>구단</th><th>경기</th><th>승</th><th>무</th><th>패</th><th>격파 득점</th><th>득실</th><th>승점</th><th>동률 전적</th><th>추첨 순번</th></tr></thead><tbody>'+rowHTML+'</tbody></table></div><p class="g-muted">상위 2팀 승격 · 하위 2팀 강등 (1부는 승격 없음, 4부는 강등 없음). 다자 동률 집단의 상대 전적은 한 번만 합산합니다.</p><details><summary>이번 시즌 공개 추첨 순서</summary><p>'+state.lotteries[division].map((id,i)=>(i+1)+'. '+esc(byId.get(String(id))?.name||id)).join(' · ')+'</p><p>'+(state.migrated?'기존 저장에 순위 규칙을 연결한 '+state.createdAtRound+'라운드에 추첨 순서를 확정했습니다. 이전 경기 결과는 그대로 사용합니다.':'시즌 시작 때 확정한 순서입니다.')+' 새로고침이나 경기 진행으로 재추첨하지 않습니다.</p></details>'+pastHTML;
 panel.querySelector('#league-division').onchange=e=>{selectedDivision=Number(e.target.value);render();};
}
window.LeagueStandings={rules:STANDINGS_RULES,clubs,table:webStandings,fastScore:fastClubScore,closeSeason:()=>archiveStandings(game),render};
const priorRender=renderOffice;
window.renderOffice=function(...args){if(game)ensureRanking(game);const result=priorRender(...args);render();return result;};
const style=document.createElement('style');style.textContent='.league-table-scroll{overflow-x:auto}.league-table-scroll table{min-width:820px}.league-table-scroll details p{max-width:260px;white-space:normal}.league-table-scroll summary{cursor:pointer}';document.head.append(style);
if(game){ensureRanking(game);persist();renderOffice();}
