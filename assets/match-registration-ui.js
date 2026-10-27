import * as registration from '../src/core/match-registration.js';

const copy=v=>JSON.parse(JSON.stringify(v));
const owner=crypto.randomUUID(),saveKey=SKEY,leaseKey=SKEY+':result-lock';
let transactionDepth=0,stale=false;
const newSaves=new Set();
const previousFresh=freshGame;
window.freshGame=function(...args){const g=previousFresh(...args);g.saveId=crypto.randomUUID();g.saveRevision=0;newSaves.add(g.saveId);return g;};
function read(){const raw=localStorage.getItem(saveKey);if(!raw)return null;try{return JSON.parse(raw);}catch{if(game&&newSaves.has(game.saveId))return null;throw Error('저장 데이터를 읽지 못했습니다. 기존 저장을 확인해 주세요.');}}
function identity(){
 if(!game.saveId){const saved=read();if(saved?.saveId)game=saved;else{game.saveId=crypto.randomUUID();game.saveRevision=0;}}
 game.saveRevision ||= 0;
}
function save(){
 if(!game||transactionDepth)return;
 identity();const saved=read(),lease=JSON.parse(localStorage.getItem(leaseKey)||'null');
 if(lease&&lease.owner!==owner&&lease.until>Date.now())throw Error('다른 탭에서 경기 결과를 저장하고 있습니다. 잠시 후 저장을 불러와 주세요.');
 if(saved&&!newSaves.has(game.saveId)&&(saved.saveId&&saved.saveId!==game.saveId||(saved.saveRevision||0)!==game.saveRevision)){
  stale=true;showNotice();throw Error('다른 탭의 진행 사항이 있습니다. 저장 불러오기를 눌러 주세요.');
 }
 const revision=game.saveRevision;game.saveRevision++;
 try{localStorage.setItem(saveKey,JSON.stringify(game));newSaves.delete(game.saveId);stale=false;}
 catch(error){game.saveRevision=revision;throw Error('저장하지 못했습니다. 저장 공간을 확인한 뒤 다시 시도해 주세요.');}
}
window.persist=save;
function reload(){const saved=read();if(!saved)return;game=saved;stale=false;document.getElementById('matchday')?.remove();renderOffice();window.MatchdayPreparation?.render();}
function locked(id){const p=game?.pendingMatch;return !!(p?.frozen&&[p.home,p.away].some(x=>String(x)===String(id)));}
async function commit(p,apply){
 if(!navigator.locks?.request)throw Error('이 브라우저에서는 안전한 결과 저장을 지원하지 않습니다. 지원되는 브라우저에서 저장을 불러와 주세요.');
 return navigator.locks.request(saveKey+':commit',async()=>{
  const saved=read(),key=p.frozen?.registration?.matchId;
  if(saved?.saveId!==game.saveId)throw Error('저장 커리어가 변경됐습니다. 저장을 불러와 주세요.');
  if(saved.appliedMatches?.[key]){game=saved;stale=false;document.getElementById('match-save-notice')?.remove();return false;}
  if(stale||(saved.saveRevision||0)!==game.saveRevision||saved.pendingMatch?.frozen?.registration?.id!==p.frozen?.registration?.id)throw Error('다른 탭 또는 이전 경기의 결과입니다. 저장을 다시 불러와 주세요.');
  if(game.pendingMatch!==p||p.phase!=='watch'||game.season!==p.season||game.round!==p.round-1||game.week!==(p.current?p.week:p.week-1))throw Error('진행 중인 경기와 일정이 일치하지 않습니다.');
  localStorage.setItem(leaseKey,JSON.stringify({owner,until:Date.now()+30000}));
  const before=copy(game);
  try{
   await registration.validateResult(p.frozen,p.result);
   if(await registration.digest(registration.lineupState(game,p))!==p.frozen.registration.liveHash)throw Error('확정 후 선수단이 변경됐습니다. 출전 확정을 해제하고 다시 준비해 주세요.');
   transactionDepth++;
   try{apply();game.appliedMatches ||= {};game.appliedMatches[key]={id:p.frozen.registration.id,inputHash:p.frozen.registration.inputHash,season:p.season,round:p.round};}
   finally{transactionDepth--;}
   save();return true;
  }catch(error){game=before;throw error;}
  finally{localStorage.removeItem(leaseKey);}
 });
}
for(const name of ['moveOrder','trainTrainer','scoutPokemon','upgradeAcademy','recruitReserve','promoteReserve','academyPromote','marketOffer','marketRelease','marketRenew','marketFreeAgent','aiRespondToOffer']){
 const previous=window[name];if(typeof previous!=='function')continue;
 window[name]=function(...args){if(locked(myClub().id)){alert('경기 결과 확인 후 변경할 수 있습니다.');return false;}return previous(...args);};
}
window.MatchRegistration={...registration,locked,commit,save,reload,get stale(){return stale;}};
window.addEventListener('storage',event=>{if(event.key===saveKey&&game){const saved=read();if(saved?.saveId!==game.saveId||saved?.saveRevision!==game.saveRevision){stale=true;showNotice();}}});
function showNotice(){
 if(!stale||document.getElementById('match-save-notice'))return;
 const box=document.createElement('aside');box.id='match-save-notice';box.style.cssText='position:fixed;top:12px;left:12px;right:12px;z-index:4000;background:#203e50;color:white;padding:14px;border:1px solid #b4cdbc';
 box.textContent='다른 탭에서 저장이 변경됐습니다. ';const b=document.createElement('button');b.textContent='저장 불러오기';b.onclick=()=>{box.remove();reload();};box.append(b);document.body.append(box);
}
if(game){identity();const p=game.pendingMatch;if(p?.frozen&&p.frozen.registration?.rulesVersion!==registration.RULES_VERSION){window.MatchdayPreparation?.invalidate();delete p.frozen;delete p.result;p.phase='prepare';p.error='대회 규정이 갱신됐습니다. 출전 선수단을 다시 확정해 주세요.';}registration.ensureRosterIds(game);save();if(p?.phase==='prepare')window.MatchdayPreparation?.render();}
