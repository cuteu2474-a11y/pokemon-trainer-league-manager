/* In-game league press & simulated social feed. Read-only: real saved events are the source. */
(function(root){
'use strict';
if(root.PentaNewsFeed)return;
const kinds={coach:'감독',transfer:'이적',retirement:'은퇴',match:'경기',club:'구단'};
const num=v=>v==null||(typeof v==='string'&&!v.trim())||!Number.isFinite(Number(v))?null:Number(v);
const arr=v=>Array.isArray(v)?v:[];
const name=v=>String(v??'').trim();
const LIMIT=90;
function build(g,club){
 if(!g||!Array.isArray(g.clubs))return [];
 const stories=[],ids=new Set();
 const clubs=new Map(g.clubs.map(c=>[String(c.id),c]));
 const season=num(g.season)??1,week=num(g.week)??1;
 const priorities={coach:0,retirement:1,transfer:2,match:3,club:4};
 function add(item){
  if(!item?.id||ids.has(item.id)||!name(item.title))return;
  ids.add(item.id);
  const whenSeason=num(item.season)??season;
  const whenWeek=num(item.week);
  stories.push({...item,label:kinds[item.kind]||'구단',
   meta:item.meta||whenSeason+'시즌'+(whenWeek!=null?' · '+whenWeek+'주차':''),
   season:whenSeason,week:whenWeek,
   clock:whenSeason*1000+(whenWeek??(whenSeason===season?week:30))*10,
   priority:priorities[item.kind]??5});
 }
 // Initial player appointment is an actual known game event, not a random headline.
 if(name(g.manager)&&name(g.club)){
  add({id:'player-coach:'+name(g.club)+':'+name(g.manager),
   kind:'coach',subtype:'appointment',season:num(g.managerProfile?.appointedSeason)??1,week:1,
   title:name(g.manager)+' 감독, '+name(g.club)+' 지휘봉 잡는다',
   description:name(g.club)+' 신임 감독 취임'});
 }
 // The AI career system retains both manager appointments and dismissal reviews.
 for(const c of g.clubs){
  if(!c||c.name===g.club)continue;
  const m=c.aiManager,co=m?.coachCareer,appointed=num(co?.appointedSeason);
  if(name(m?.name)&&appointed!==null&&appointed<=season){
   add({id:'ai-coach:'+c.id+':'+co.id,kind:'coach',subtype:'appointment',
    season:appointed,week:1,title:m.name+' 감독, '+c.name+'에 취임',
    description:c.name+' 감독 계약 · '+appointed+'시즌 취임'});
  }
  const history=arr(c.aiCoachHistory);
  for(let i=0;i<Math.min(20,history.length);i++){
   const h=history[i];if(!h||!name(h.name))continue;
   add({id:'ai-dismissal:'+c.id+':'+(h.id||h.name+':'+h.leftSeason),
    kind:'coach',subtype:'dismissal',season:num(h.leftSeason)??season,week:30,
    title:h.name+' 감독, '+c.name+'에서 경질',
    description:'구단 감독 교체 · '+c.name});
  }
  for(let i=0;i<Math.min(24,arr(c.aiCoachDecisions).length);i++){
   const d=c.aiCoachDecisions[i];if(!d)continue;
   const status=name(d.status),detail=name(d.detail);
   if(status==='감독 경질'){
    // History is a more precise source for the outgoing manager.
    if(history.some(h=>num(h.leftSeason)===num(d.season)))continue;
    add({id:'coach-decision:'+c.id+':'+d.season+':'+i,kind:'coach',subtype:'dismissal',
     season:num(d.season)??season,week:30,title:c.name+' 감독 경질 확정',description:detail});
   }
   if(status==='감독 재계약'){
    add({id:'coach-renewal:'+c.id+':'+d.season+':'+i,kind:'coach',subtype:'renewal',
     season:num(d.season)??season,week:30,title:c.name+' 감독 재계약',description:detail});
   }
  }
 }
 const history=arr(g.transferHistory);
 for(let i=0;i<Math.min(90,history.length);i++){
  const t=history[i];if(!t||!name(t.name))continue;
  const type=name(t.type)||'이적';
  const description=t.from&&t.to?name(t.from)+' → '+name(t.to):
   t.to?name(t.to)+' 입단':t.from?name(t.from)+'에서 이적':'계약 확정';
  add({id:'transfer:'+i+':'+t.season+':'+t.week+':'+t.name,
   kind:'transfer',subtype:type,season:num(t.season)??season,week:num(t.week),
   title:name(t.name)+' · '+type,description});
 }
 const retiredTrainer=arr(g.retiredTrainers);
 const retiredHistory=arr(g.trainerRetirementHistory);
 const trainerSeen=new Set();
 for(const [set,source] of [[retiredTrainer,'archived'],[retiredHistory,'history']]){
  for(let i=0;i<Math.min(85,set.length);i++){
   const entry=set[i];if(!entry)continue;
   const trainerName=name(entry.trainer?.name||entry.name),team=name(entry.club);
   if(!trainerName)continue;
   const key=[entry.season,team,trainerName].join(':');if(trainerSeen.has(key))continue;trainerSeen.add(key);
   add({id:'trainer-retirement:'+key,kind:'retirement',subtype:'trainer',
    season:num(entry.season)??season,week:30,
    title:trainerName+' 트레이너, 현역 은퇴',
    description:team?team+' 소속 · 트레이너 은퇴':'트레이너 은퇴'});
  }
 }
 const retiredMons=arr(g.retiredPokemon);
 for(let i=0;i<Math.min(65,retiredMons.length);i++){
  const p=retiredMons[i];if(!p||!name(p.name)||name(p.reason)==='담당 트레이너 은퇴')continue;
  add({id:'pokemon-retirement:'+(p.uid||p.name+':'+p.trainer)+':'+p.season,
   kind:'retirement',subtype:'pokemon',season:num(p.season)??season,week:30,
   title:p.name+' 은퇴',description:[name(p.club),name(p.trainer)+' 트레이너'].filter(Boolean).join(' · ')});
 }
 const results=arr(g.results);
 for(let round=results.length-1;round>=Math.max(0,results.length-3);round--){
  let games=arr(results[round]);
  if(games.length>15){
   games=games.filter(m=>m&&String(m.home??m.homeId)===String(club?.id)||m&&String(m.away??m.awayId)===String(club?.id))
    .concat(games.slice(0,8));
  }
  const seenMatches=new Set();
  for(let i=0;i<games.length;i++){
   const m=games[i];
   if(!m)continue;
   const a=clubs.get(String(m.home??m.homeId)),b=clubs.get(String(m.away??m.awayId));
   const h=num(m.aScore),v=num(m.bScore);if(!a||!b||h==null||v==null||h<0||v<0)continue;
   const key=a.id+':'+b.id+':'+round;if(seenMatches.has(key))continue;seenMatches.add(key);
   const winner=h===v?null:h>v?a:b,loser=h===v?null:h>v?b:a;
   const headline=winner?winner.name+', '+loser.name+'에 '+Math.max(h,v)+':'+Math.min(h,v)+' 승리':
    a.name+'와 '+b.name+', '+h+':'+v+' 무승부';
   add({id:'match:'+round+':'+a.id+':'+b.id,kind:'match',subtype:'result',
    season:num(m.season)??season,week:null,round:round+1,
    title:headline,description:a.name+' '+h+':'+v+' '+b.name,
    meta:(num(m.season)??season)+'시즌 · '+(round+1)+'라운드'+
      (club&&(String(a.id)===String(club.id)||String(b.id)===String(club.id))?' · 우리 구단':'')});
  }
 }
 const logs=arr(g.log),known=new Set();
 for(let i=0;i<Math.min(160,logs.length);i++){
  const raw=logs[i];if(typeof raw!=='string')continue;
  const title=raw.replace(/\s+/g,' ').trim();
  if(!title||title.length>180||/은퇴 예고|은퇴 0마리|경력 정산|급여 정산/u.test(title))continue;
  if(!/영입|재계약|계약 만료|이적|방출|은퇴|승격|강등|우승|경질|취임|포획|신인/u.test(title))continue;
  if(known.has(title))continue;known.add(title);
  if(history.some(t=>name(t?.name)&&title.includes(t.name)&&/영입|이적/u.test(title)))continue;
  if(retiredTrainer.some(t=>name(t?.trainer?.name)&&title.includes(t.trainer.name)&&/은퇴/u.test(title)))continue;
  if(retiredMons.some(p=>name(p?.name)&&title.includes(p.name)&&/은퇴/u.test(title)))continue;
  const kind=/감독|취임|경질/u.test(title)?'coach':/은퇴/u.test(title)?'retirement':
   /이적|영입|재계약|방출/u.test(title)?'transfer':'club';
  add({id:'activity:'+i+':'+title,kind,subtype:'record',season,week,
   title,description:'게임 내 확정 기록'});
 }
 return stories.sort((a,b)=>b.clock-a.clock||a.priority-b.priority||a.id.localeCompare(b.id)).slice(0,LIMIT);
}
// A simulated league-community reaction accompanies confirmed events only;
// it does not pretend to be a real person or fabricate likes/comments.
function buildSocial(news){
 const templates={
  coach:{appointment:'새 감독이 지휘봉을 잡았습니다. 어떤 시즌을 보여줄지 기대됩니다!',
   dismissal:'감독 교체 소식이 나왔네요. 다음 시즌 구단의 선택이 중요해졌습니다.',
   renewal:'감독과 구단이 동행을 이어갑니다. 다음 시즌 성적이 궁금하네요.'},
  transfer:'이번 이적은 리그 판도를 얼마나 바꿀까요?',
  retirement:'그동안의 활약을 기억하겠습니다. 수고 많았습니다!',
  match:'이번 라운드 결과가 나왔습니다. 다음 경기도 기대됩니다.',
  club:'리그에 새로운 소식이 올라왔습니다.'
 };
 return arr(news).filter(s=>s&&['coach','transfer','retirement','match','club'].includes(s.kind))
  .slice(0,55).map(s=>({
   id:'social:'+s.id,sourceId:s.id,kind:s.kind,label:'SNS',
   author:'리그 팬 커뮤니티',handle:'@penta_league',
   title:s.title,body:typeof templates[s.kind]==='string'?templates[s.kind]:
    templates.coach[s.subtype]||'감독 관련 소식이 전해졌습니다.',
   meta:s.meta,clock:s.clock
  }));
}
root.PentaNewsFeed={build,buildSocial,kinds};
})(typeof window==='undefined'?globalThis:window);
