/** KRW contracts and idempotent club accounting. One season is 30 payable weeks. */
const amount=n=>{if(!Number.isSafeInteger(n)||n<0)throw new RangeError('금액은 0 이상의 원 단위 정수여야 합니다.');return n;};
export const clock=g=>(g.season-1)*30+g.week-1;
export const members=c=>[...(c.trainers||[]).map((trainer,slot)=>({trainer,slot,kind:'active'})),...(c.reserveTrainers||[]).map((trainer,slot)=>({trainer,slot,kind:'reserve'})),...(c.trainerAcademy||[]).map((trainer,slot)=>({trainer,slot,kind:'academy'}))].filter(x=>x.trainer);
export function initialize(g){
  g.finance ||= {version:1,serial:0,contracts:{},books:{},events:{},openingClock:clock(g)};
  return g.finance;
}
export const clubOf=(g,id)=>g.clubs.find(c=>String(c.id)===String(id));
const player=(g,c)=>c.name===g.club;
export function cash(g,id){const c=clubOf(g,id);if(!c)throw Error('구단을 찾을 수 없습니다.');return Math.max(0,Math.round(Number(player(g,c)?g.coins:c.identity?.budget)||0));}
export function setCash(g,id,n){const c=clubOf(g,id);amount(n);if(player(g,c))g.coins=n;else{c.identity ||= {};c.identity.budget=n;}}
export function book(g,id){
 const f=initialize(g);return f.books[id] ||= {arrears:0,lastPaid:clock(g)-1,ledger:[],seasons:{}};
}
export function seasonBook(g,id,season=g.season){
 const b=book(g,id);return b.seasons[season] ||= {opening:cash(g,id),income:0,expenses:0,cashExpenses:0,repayments:0,hadArrears:b.arrears>0};
}
function record(g,id,event){
 const b=book(g,id);b.ledger.unshift({...event,season:g.season,week:g.week});b.ledger.length=Math.min(b.ledger.length,player(g,clubOf(g,id))?120:8);
 initialize(g).events[event.id]=true;
}
export function canSpend(g,id,n){amount(n);return book(g,id).arrears?{ok:false,reason:'미지급금을 정리한 뒤 유료 지출을 할 수 있습니다.'}:cash(g,id)<n?{ok:false,reason:'운영 자금이 '+(n-cash(g,id)).toLocaleString('ko-KR')+'원 부족합니다.'}:{ok:true};}
export function income(g,id,n,eventId,label='수입'){
 amount(n);const f=initialize(g);if(f.events[eventId])return false;
 const b=book(g,id),s=seasonBook(g,id),repaid=Math.min(b.arrears,Math.floor(n/2));
 b.arrears-=repaid;setCash(g,id,cash(g,id)+n-repaid);s.income+=n;s.repayments+=repaid;
 record(g,id,{id:eventId,label,income:n,expense:0,paid:0,repaid,cash:cash(g,id),arrears:b.arrears});return true;
}
export function expense(g,id,n,eventId,label='지출',mandatory=false,details=[]){
 amount(n);const f=initialize(g);if(f.events[eventId])return false;
 if(!mandatory){const guard=canSpend(g,id,n);if(!guard.ok)throw Error(guard.reason);}
 const b=book(g,id),s=seasonBook(g,id),paid=Math.min(cash(g,id),n);
 setCash(g,id,cash(g,id)-paid);b.arrears+=n-paid;s.expenses+=n;s.cashExpenses+=paid;s.hadArrears ||= b.arrears>0;
 record(g,id,{id:eventId,label,income:0,expense:n,paid,repaid:0,cash:cash(g,id),arrears:b.arrears,details});return true;
}
export function weeklySalary(annual,week){amount(annual);return Math.floor(annual*week/30)-Math.floor(annual*(week-1)/30);}
const trainerKey=t=>String(t.uid??('legacy:'+t.id+':'+t.name));
export function contract(g,t){return initialize(g).contracts[t.financeContractId]||null;}
export function closeContract(g,t,reason='계약 종료'){
 const c=contract(g,t);if(c?.status==='active'){c.status='closed';c.end=Math.min(c.end,Math.max(clock(g),book(g,c.clubId).lastPaid+1));c.reason=reason;}
 delete t.financeContractId;delete t.contractDecision;
}
export function createContract(g,t,clubId,{salary,endSeason,kind='active',reason='입단'}={}){
 const f=initialize(g);salary=amount(salary??Math.round(Number(t.profile?.salary)||3000000));
 endSeason=Math.max(g.season,Math.trunc(endSeason??g.season+1));
 const id='contract:'+ ++f.serial,c={id,trainerId:trainerKey(t),name:t.name,clubId,annualSalary:salary,start:Math.max(clock(g),book(g,clubId).lastPaid+1),end:endSeason*30,endSeason,kind,status:'active',reason};
 f.contracts[id]=c;t.financeContractId=id;t.profile ||= {};t.profile.salary=salary;t.profile.salaryUnit='season';t.profile.salaryVersion=1;t.profile.contract=endSeason;return c;
}
/** Called on migration, ownership changes and week entry. Never reprice an existing contract. */
export function synchronize(g){
 const f=initialize(g),owners=new Map();
 for(const club of g.clubs){book(g,club.id);seasonBook(g,club.id);
  for(const entry of members(club)){
   const t=entry.trainer;owners.set(trainerKey(t),club.id);
   let c=contract(g,t);
   if(c?.status==='active'&&String(c.clubId)!==String(club.id)){closeContract(g,t,'이적');c=null;}
   if(!c||c.status!=='active'){
    const legacy=Math.max(0,Math.round(Number(t.profile?.salary)||3000000));
    c=createContract(g,t,club.id,{salary:entry.kind==='academy'?Math.round(legacy/4):legacy,
      endSeason:Math.max(g.season,Number(t.profile?.contract)||g.season+1),kind:entry.kind,reason:'현행 계약 등록'});
   }
   if(c.end<=clock(g)){
    closeContract(g,t,'계약 만료');
    const list=entry.kind==='active'?club.trainers:entry.kind==='reserve'?club.reserveTrainers:club.trainerAcademy;
    const slot=list.indexOf(t);if(slot>=0){if(entry.kind==='active')list[slot]=null;else list.splice(slot,1);}
    g.freeAgents ||= [];if(!g.freeAgents.some(x=>x.trainer===t))g.freeAgents.push({trainer:t,formerClub:club.name,reason:'계약 만료'});
    g.log ||= [];g.log.unshift(club.name+' · '+t.name+' 계약 만료 · 포켓몬과 함께 자유계약 시장으로 이동');
   }else if(c.end-clock(g)<=4&&!t.contractDecision){t.contractDecision={status:'pending',contractId:c.id,expires:c.endSeason};}
  }
 }
 for(const c of Object.values(f.contracts))if(c.status==='active'&&String(owners.get(c.trainerId))!==String(c.clubId)){c.status='closed';c.end=Math.min(c.end,clock(g));c.reason='소속 종료';}
}
export function settleWeek(g){
 synchronize(g);const now=clock(g),result=[];
 for(const club of g.clubs){const b=book(g,club.id);if(b.lastPaid>=now)continue;
  const items=members(club).map(({trainer:t})=>contract(g,t)).filter(c=>c?.status==='active'&&c.start<=now&&c.end>now).map(c=>({id:['salary',now,c.clubId,c.trainerId,c.id].join(':'),contractId:c.id,trainer:c.name,amount:weeklySalary(c.annualSalary,g.week)}));
  const due=items.reduce((n,x)=>n+x.amount,0);
  expense(g,club.id,due,'payroll:'+club.id+':'+now,'주간 급여',true,items);b.lastPaid=now;
  result.push({clubId:club.id,due,arrears:b.arrears});
 }
 return result;
}
export function forecast(g,id,{extraAnnual=0,immediate=0}={}){
 const now=clock(g),club=clubOf(g,id),contracts=members(club).map(x=>contract(g,x.trainer)).filter(c=>c?.status==='active');
 const annual=contracts.reduce((sum,c)=>sum+c.annualSalary,0);
 const remaining=contracts.reduce((sum,c)=>{
  for(let w=g.week;w<=30&&((g.season-1)*30+w-1)<c.end;w++)sum+=weeklySalary(c.annualSalary,w);
  return sum;
 },0);
 const next=contracts.filter(c=>c.start<=now&&c.end>now).reduce((n,c)=>n+weeklySalary(c.annualSalary,g.week),0);
 const additional=Math.round(extraAnnual*(31-g.week)/30);
 return {cash:cash(g,id),annual,next,remaining,arrears:book(g,id).arrears,projected:cash(g,id)-immediate-remaining-additional-book(g,id).arrears};
}
export function locked(g,clubId){const p=g.pendingMatch;return !!(p&&(p.frozen||['running','watch'].includes(p.phase))&&[p.home,p.away].some(id=>String(id)===String(clubId)));}
export function moveTrainer(g,{buyerId,sellerId=null,trainer:t,sourceKind,slot,fee=0,salary,years=2,bonus=0,freeIndex=null}){
 const buyer=clubOf(g,buyerId),seller=sellerId===null?null:clubOf(g,sellerId);
 if(!buyer||!t||seller===buyer)throw Error('영입 대상을 확인해 주세요.');
 if(locked(g,buyerId)||(seller&&locked(g,sellerId)))throw Error('경기 결과 확인 후 변경할 수 있습니다.');
 const source=seller?(sourceKind==='active'?seller.trainers:sourceKind==='reserve'?seller.reserveTrainers:null):null;
 if(seller&&source?.[slot]!==t)throw Error('소속이 변경되어 협상을 다시 확인해야 합니다.');
 if(!seller&&g.freeAgents?.[freeIndex]?.trainer!==t)throw Error('자유계약 대상이 변경됐습니다.');
 buyer.reserveTrainers ||= [];const vacancy=buyer.trainers.findIndex(x=>!x);
 if(vacancy<0&&buyer.reserveTrainers.length>=5)throw Error('선수단 명단이 가득 찼습니다.');
 if(sourceKind==='active'&&!members(seller).some(x=>x.kind!=='active'))throw Error('원 소속 구단에 대체 선수가 없습니다.');
 if(!Number.isInteger(years)||years<1||years>3)throw Error('계약 기간은 1~3시즌입니다.');
 amount(salary);amount(fee);amount(bonus);const guard=canSpend(g,buyerId,fee+bonus);if(!guard.ok)throw Error(guard.reason);
 const event='sign:'+ ++initialize(g).serial;
 expense(g,buyerId,fee+bonus,event,'영입 이적료·계약금');if(seller)income(g,sellerId,fee,event+':seller','이적료 수입');
 closeContract(g,t,'이적');if(seller){if(sourceKind==='active')source[slot]=null;else source.splice(slot,1);}else g.freeAgents.splice(freeIndex,1);
 if(vacancy>=0)buyer.trainers[vacancy]=t;else buyer.reserveTrainers.push(t);
 return createContract(g,t,buyerId,{salary,endSeason:g.season+years-1,reason:seller?'이적 계약':'자유계약'});
}
export function renew(g,t,clubId,{salary,years=2,bonus=0,expectedId}){
 const old=contract(g,t);if(!old||old.status!=='active'||old.id!==expectedId||String(old.clubId)!==String(clubId))throw Error('계약이 변경되어 다시 확인해야 합니다.');
 if(locked(g,clubId))throw Error('경기 결과 확인 후 변경할 수 있습니다.');
 if(!Number.isInteger(years)||years<1||years>3)throw Error('연장 기간은 1~3시즌입니다.');
 amount(salary);amount(bonus);const token='renew:'+trainerKey(t)+':'+g.season+':'+g.week;
 if(initialize(g).events[token])throw Error('이번 주 재계약을 이미 마쳤습니다.');
 const guard=canSpend(g,clubId,bonus);if(!guard.ok)throw Error(guard.reason);
 expense(g,clubId,bonus,token,'재계약 계약금');const endSeason=Math.max(old.endSeason,g.season)+years;
 closeContract(g,t,'재계약');return createContract(g,t,clubId,{salary,endSeason,kind:old.kind,reason:'재계약'});
}
export function financialReport(g,id,season=g.season){
 const s=seasonBook(g,id,season),b=book(g,id);
 if(s.closed)return {...s,season,cash:s.closing,arrears:s.arrears,score:s.score};
 return {...s,season,cash:cash(g,id),arrears:b.arrears,score:b.arrears>0?0:s.hadArrears?50:100};
}
