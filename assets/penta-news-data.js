/* Read-only in-game news: actual results, transfers, and meaningful club activity. */
(function(root){
'use strict';
if(root.PentaNewsFeed)return;
const kinds={match:'경기',transfer:'이적',club:'구단'};
const safeNumber=v=>v===null||v===undefined||(typeof v==='string'&&!v.trim())?null:Number.isFinite(Number(v))?Number(v):null;
const maxRows=(n,cap)=>Math.max(0,Math.min(cap,Number(n)||0));
function build(game,club){
 if(!game||!Array.isArray(game.clubs))return [];
 const clubs=new Map(game.clubs.map(c=>[String(c.id),c]));
 const ownDivision=Number.isInteger(Number(club?.division))?Number(club.division):null;
 const stories=[];
 const results=Array.isArray(game.results)?game.results:[];
 // The most recent three completed rounds; report only matches with confirmed scores.
 for(let round=results.length-1;round>=Math.max(0,results.length-3);round--){
  const games=Array.isArray(results[round])?results[round]:[];
  for(let i=0;i<games.length;i++){
   const m=games[i],home=clubs.get(String(m?.home??m?.homeId)),away=clubs.get(String(m?.away??m?.awayId));
   const a=safeNumber(m?.aScore),b=safeNumber(m?.bScore);
   if(!home||!away||a===null||b===null||a<0||b<0)continue;
   if(ownDivision!==null&&(Number(home.division)!==ownDivision||Number(away.division)!==ownDivision))continue;
   const winner=a===b?null:a>b?home:away,loser=a===b?null:a>b?away:home;
   const title=winner
    ?winner.name+', '+loser.name+'에 '+Math.max(a,b)+':'+Math.min(a,b)+' 승리'
    :home.name+'와 '+away.name+', '+a+':'+b+' 무승부';
   const own=club&&(String(home.id)===String(club.id)||String(away.id)===String(club.id));
   stories.push({
    id:'match:'+round+':'+i,kind:'match',label:kinds.match,
    title,description:home.name+' '+a+':'+b+' '+away.name,
    meta:'시즌 '+(Number(game.season)||1)+' · '+(round+1)+'라운드'+
      (Number.isInteger(Number(home.division))?' · '+(Number(home.division)+1)+'부':'')+
      (own?' · 우리 구단 경기':''),
    rank:stories.length
   });
  }
 }
 const history=Array.isArray(game.transferHistory)?game.transferHistory:[];
 for(let i=0;i<maxRows(history.length,35);i++){
  const t=history[i];if(!t||typeof t!=='object'||!String(t.name||'').trim())continue;
  const type=String(t.type||'이적');
  const title=String(t.name)+' · '+type;
  const summary=t.from&&t.to?String(t.from)+' → '+String(t.to):
    t.to?String(t.to)+' 입단':t.from?String(t.from)+'에서 이적':'영입·이적 확정';
  const labels=[];
  if(safeNumber(t.season)!==null)labels.push(String(t.season)+'시즌');
  if(safeNumber(t.week)!==null)labels.push(String(t.week)+'주차');
  stories.push({
   id:'transfer:'+i,kind:'transfer',label:kinds.transfer,
   title,description:summary,meta:labels.join(' · ')||'이적 기록',rank:i
  });
 }
 const logs=Array.isArray(game.log)?game.log:[];
 const seen=new Set();
 for(let i=0;i<maxRows(logs.length,120);i++){
  const event=logs[i];if(typeof event!=='string')continue;
  const title=event.replace(/\s+/g,' ').trim();
  if(!title||title.length>210||!/(?:영입|재계약|계약 만료|이적|방출|은퇴|승격|강등|우승|경질|신인|포획|대회|감독 취임)/u.test(title))continue;
  if(seen.has(title))continue;seen.add(title);
  // A corresponding structured transfer report already shows this event.
  const duplicate=history.some(t=>t&&t.name&&title.includes(String(t.name))&&
    (title.includes('영입')||title.includes('이적'))&&
    /영입|이적/u.test(String(t.type||'')));
  if(duplicate)continue;
  stories.push({
   id:'club:'+i,kind:'club',label:kinds.club,
   title,description:'',meta:'구단 활동 기록',rank:i
  });
 }
 // Records are ordered newest-first inside each category. Different categories
 // have different clocks, so "all" never implies a fabricated global timestamp.
 const kindOrder={match:0,transfer:1,club:2};
 return stories.sort((a,b)=>kindOrder[a.kind]-kindOrder[b.kind]||a.rank-b.rank).slice(0,80);
}
root.PentaNewsFeed={build,kinds};
})(typeof window==='undefined'?globalThis:window);
