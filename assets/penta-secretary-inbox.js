/* Penta Rivals secretary's persistent local inbox.
   Does not approve offers, complete matches, or change economic outcomes. */
(function(root){
'use strict';
if(root.PentaSecretaryInbox)return;
const arr=v=>Array.isArray(v)?v:[];
const obj=v=>v&&typeof v==='object'&&!Array.isArray(v)?v:{};
function clock(game){
 return (Math.max(1,Math.floor(Number(game?.season)||1))-1)*30+
        Math.max(1,Math.min(30,Math.floor(Number(game?.week)||1)));
}
function read(game){
 const s=obj(game?.secretaryInbox);
 return {snoozed:obj(s.snoozed),seen:arr(s.seen),pinned:arr(s.pinned)};
}
function store(game){
 if(!game||typeof game!=='object')return null;
 const current=read(game);
 game.secretaryInbox={version:2,snoozed:{...current.snoozed},seen:[...current.seen],pinned:[...current.pinned]};
 return game.secretaryInbox;
}
// Advisory tasks can be deferred. Required tasks are never snoozable.
function defer(game,task,weeks=2){
 if(!game||!task||task.urgent!==false||!task.id)return false;
 const span=Math.max(1,Math.min(8,Math.floor(Number(weeks)||2)));
 const s=store(game);
 s.snoozed[task.id]=clock(game)+span;
 const cutoff=clock(game)-60;
 for(const [id,until] of Object.entries(s.snoozed))
  if(!Number.isFinite(Number(until))||Number(until)<cutoff)delete s.snoozed[id];
 return true;
}
function visibleAdvice(game,advice){
 const saved=read(game),now=clock(game);
 return arr(advice).filter(task=>task&&(!Number.isFinite(Number(saved.snoozed[task.id]))||
   Number(saved.snoozed[task.id])<=now));
}
// Events derive stable signatures from content/season, not index IDs that shift with unshift().
function key(event){
 const input=[event?.kind,event?.title,event?.meta,event?.description].map(x=>String(x??'')).join('|');
 let h=2166136261;
 for(const ch of input)h=Math.imul(h^ch.charCodeAt(0),16777619)>>>0;
 return 'news:'+h.toString(36);
}
function recent(game,news,max=10){
 const seen=new Set(read(game).seen);
 const unique=new Set(),output=[];
 for(const item of arr(news)){
  if(!item?.title)continue;
  const id=key(item);if(unique.has(id))continue;unique.add(id);
  if(output.length>=Math.max(0,Math.min(30,max)))break;
  output.push({...item,inboxKey:id,unread:!seen.has(id)});
 }
 return output;
}
function unreadCount(game,news){
 return recent(game,news,25).filter(x=>x.unread).length;
}
function markSeen(game,items){
 const s=store(game);if(!s)return 0;
 const before=new Set(s.seen);
 for(const entry of arr(items)){
  if(entry&&entry.title)before.add(key(entry));
 }
 s.seen=[...before].slice(-220);
 return s.seen.length;
}

function pinned(game,id){return read(game).pinned.includes(id);}
function togglePinned(game,task){
 if(!game||!task?.id)return false;
 const s=store(game),set=new Set(s.pinned);
 if(set.has(task.id))set.delete(task.id);else set.add(task.id);
 s.pinned=[...set].slice(-40);
 return set.has(task.id);
}
function order(game,tasks){
 const p=new Set(read(game).pinned);
 return arr(tasks).slice().sort((a,b)=>Number(p.has(b.id))-Number(p.has(a.id))||
  (Number(b.priority)||0)-(Number(a.priority)||0));
}
root.PentaSecretaryInbox={clock,read,defer,visibleAdvice,key,recent,unreadCount,markSeen,pinned,togglePinned,order};
})(typeof window==='undefined'?globalThis:window);
