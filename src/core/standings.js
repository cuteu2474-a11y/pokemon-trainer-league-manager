/** Shared web/league ranking rules. A tied mini-table is computed once, never recursively. */
export const STANDINGS_RULES=Object.freeze({version:'standings-v1-20261027',description:'승점 → 주자 격파 득실 → 주자 격파 득점 → 승리 수 → 동률 구단 간 승점 → 동률 구단 간 격파 득실 → 시즌 추첨 순번'});
const key=id=>String(id);
const compareId=(a,b)=>a<b?-1:a>b?1:0;
export function createLottery(ids,{seed=1,season=1,division=0}={}){
 const order=ids.map(key).sort(compareId);
 if(!order.length||new Set(order).size!==order.length)throw Error('추첨에는 고유한 구단 ID가 필요합니다.');
 let state=2166136261;
 for(const ch of JSON.stringify([seed,season,division,order])){state^=ch.charCodeAt(0);state=Math.imul(state,16777619)>>>0;}
 const random=()=>{state=(state+0x6D2B79F5)>>>0;let n=state;n=Math.imul(n^(n>>>15),n|1);n^=n+Math.imul(n^(n>>>7),n|61);return ((n^(n>>>14))>>>0)/4294967296;};
 for(let i=order.length-1;i>0;i--){const j=Math.floor(random()*(i+1));[order[i],order[j]]=[order[j],order[i]];}
 return order;
}
export function validateLottery(ids,order){
 const expected=new Set(ids.map(key));
 if(expected.size!==ids.length||!Array.isArray(order)||order.length!==expected.size||new Set(order.map(key)).size!==expected.size||order.some(id=>!expected.has(key(id))))throw Error('저장된 추첨 순서와 시즌 참가 구단이 일치하지 않습니다.');
}
const primary=row=>[row.points,row.for-row.against,row.for,row.won];
const comparePrimary=(a,b)=>{const x=primary(a),y=primary(b);for(let i=0;i<x.length;i++)if(x[i]!==y[i])return y[i]-x[i];return 0;};
export function rankStandings(rows,{results=[],lottery}={}){
 validateLottery(rows.map(row=>row.id),lottery);
 const lots=new Map(lottery.map((id,i)=>[key(id),i+1])),sorted=[...rows].sort(comparePrimary),ranked=[];
 for(let start=0;start<sorted.length;){
  let end=start+1;while(end<sorted.length&&!comparePrimary(sorted[start],sorted[end]))end++;
  const group=sorted.slice(start,end),ids=new Set(group.map(row=>key(row.id))),mini=new Map(group.map(row=>[key(row.id),{played:0,points:0,for:0,against:0}])),seen=new Set();
  if(group.length>1)for(const result of results){
   const home=key(result.home),away=key(result.away);
   if(!ids.has(home)||!ids.has(away)||home===away)continue;
   if(!Number.isInteger(result.homeScore)||result.homeScore<0||!Number.isInteger(result.awayScore)||result.awayScore<0)throw Error('상대 전적 점수가 올바르지 않습니다.');
   const fixture=JSON.stringify([result.season??'',result.round??'',home,away]);if(seen.has(fixture))continue;seen.add(fixture);
   for(const [id,scored,conceded] of [[home,result.homeScore,result.awayScore],[away,result.awayScore,result.homeScore]]){
    const row=mini.get(id);row.played++;row.for+=scored;row.against+=conceded;row.points+=scored>conceded?3:scored===conceded?1:0;
   }
  }
  group.sort((a,b)=>{const x=mini.get(key(a.id)),y=mini.get(key(b.id));return y.points-x.points||((y.for-y.against)-(x.for-x.against))||lots.get(key(a.id))-lots.get(key(b.id));});
  for(const row of group)ranked.push({...row,rank:ranked.length+1,ranking:{group:group.map(r=>r.id),headToHead:{...mini.get(key(row.id))},lottery:lots.get(key(row.id))}});
  start=end;
 }
 return ranked;
}
/** Fast fixtures share score semantics; they remain explicitly separate from Showdown. */
export function fastClubScore(homePower,awayPower,random=Math.random){
 const next=()=>{const n=random();if(!Number.isFinite(n)||n<0||n>=1)throw Error('난수는 0 이상 1 미만이어야 합니다.');return n;};
 const power=n=>Number.isFinite(n)?Math.max(1,n):100;
 const chance=power(homePower)/(power(homePower)+power(awayPower)),roll=next(),draw=.12;
 if(roll<draw)return {homeScore:5,awayScore:5};
 return roll<draw+(1-draw)*chance?{homeScore:5,awayScore:Math.floor(next()*5)}:{homeScore:Math.floor(next()*5),awayScore:5};
}
