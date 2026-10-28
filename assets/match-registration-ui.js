import * as registration from '../src/core/match-registration.js';
import {createCareerBackup,parseCareerBackup} from '../src/core/career-backup.js';

const copy=v=>JSON.parse(JSON.stringify(v));
const owner=crypto.randomUUID(),saveKey=SKEY,leaseKey=SKEY+':result-lock';
let transactionDepth=0,stale=false;
const newSaves=new Set();
const previousFresh=freshGame;
window.freshGame=function(...args){const g=previousFresh(...args);g.saveId=crypto.randomUUID();g.saveRevision=0;newSaves.add(g.saveId);return g;};
function read(){const raw=localStorage.getItem(saveKey);if(!raw)return null;try{return JSON.parse(raw);}catch{if(game&&newSaves.has(game.saveId))return null;throw Error('저장 데이터를 읽지 못했습니다. 기존 저장을 확인해 주세요.');}}
function recoverPending(g){
 const p=g.pendingMatch;
 if(p?.frozen&&p.frozen.registration?.rulesVersion!==registration.RULES_VERSION){
  delete p.frozen;delete p.result;p.phase='prepare';
  p.error='대회 규정이 갱신됐습니다. 출전 선수단을 다시 확정해 주세요.';
 }else if(p&&['research','running'].includes(p.phase)){
  p.phase='prepare';p.error='경기 요청이 중단됐습니다. 출전 명단을 확인하고 경기를 다시 시작해 주세요.';
 }
 registration.ensureRosterIds(g);
}
function identity(){
 if(!game.saveId){const saved=read();if(saved?.saveId)game=saved;else{game.saveId=crypto.randomUUID();game.saveRevision=0;}}
 game.saveRevision ||= 0;
}
function save(){
 if(!game||transactionDepth)return;
 if(stale){showNotice();throw Error('다른 탭의 진행 사항이 있습니다. 최신 저장을 불러와 주세요.');}
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
function reload(){
 try{
  const saved=read();if(!saved)throw Error('저장된 커리어가 없습니다.');
  game=saved;stale=false;newSaves.clear();document.getElementById('match-save-notice')?.remove();
  document.getElementById('matchday')?.remove();renderOffice();window.MatchdayPreparation?.render();
 }catch(error){alert('저장을 불러오지 못했습니다. '+error.message);}
}
function downloadBackup(){
 const saved=read();if(!saved)throw Error('백업할 저장 데이터가 없습니다.');
 const contents=JSON.stringify(createCareerBackup(saved));
 const url=URL.createObjectURL(new Blob([contents],{type:'application/json'}));
 const link=document.createElement('a');link.href=url;
 link.download=`penta-rivals-s${saved.season}-w${saved.week}-backup.json`;
 document.body.append(link);link.click();link.remove();
 setTimeout(()=>URL.revokeObjectURL(url),1000);
}
async function restoreCareer(raw){
 const candidate=parseCareerBackup(raw);
 if(!navigator.locks?.request)throw Error('이 브라우저에서는 안전한 백업 복원을 지원하지 않습니다.');
 const expected=localStorage.getItem(saveKey);
 return navigator.locks.request(saveKey+':commit',async()=>{
  if(localStorage.getItem(saveKey)!==expected)
   throw Error('복원 준비 중 다른 탭에서 저장이 변경됐습니다. 다시 시도해 주세요.');
  const restored={...candidate,saveId:crypto.randomUUID(),saveRevision:1};recoverPending(restored);
  try{localStorage.setItem(saveKey,JSON.stringify(restored));}
  catch{throw Error('백업을 복원하지 못했습니다. 저장 공간을 확인해 주세요.');}
  game=restored;stale=false;newSaves.clear();document.getElementById('match-save-notice')?.remove();
  document.getElementById('matchday')?.remove();renderOffice();window.MatchdayPreparation?.render();
  return true;
 });
}
function chooseBackup(){
 const input=document.createElement('input');input.type='file';input.accept='.json,application/json';input.hidden=true;
 input.onchange=async()=>{
  try{
   const file=input.files?.[0];if(!file)return;
   if(file.size>15*1024*1024)throw Error('백업 파일은 15MB 이하만 복원할 수 있습니다.');
   const raw=await file.text();const candidate=parseCareerBackup(raw);
   if(!confirm(`현재 진행 중인 커리어를 덮어쓰고 ${candidate.manager} 감독의 ${candidate.season}시즌 ${candidate.week}주차 저장을 복원할까요? 먼저 현재 세이브를 백업하는 것을 권장합니다.`))return;
   await restoreCareer(raw);alert('백업 복원을 완료했습니다.');
  }catch(error){alert('백업 복원 실패: '+error.message);}
  finally{input.remove();}
 };
 input.oncancel=()=>input.remove();document.body.append(input);input.click();
}
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
window.MatchRegistration={...registration,locked,commit,save,reload,downloadBackup,restoreCareer,chooseBackup,get stale(){return stale;}};
function checkStale(){
 if(!game)return;
 try{
  const saved=read();
  if(!saved||saved.saveId!==game.saveId||(saved.saveRevision||0)!==(game.saveRevision||0)){
   stale=true;showNotice();
  }
 }catch{stale=true;showNotice();}
}
window.addEventListener('storage',event=>{if(event.key===saveKey)checkStale();});
window.addEventListener('focus',checkStale);
document.addEventListener?.('visibilitychange',()=>{if(!document.hidden)checkStale();});
function showNotice(){
 if(!stale||document.getElementById('match-save-notice'))return;
 const box=document.createElement('aside');box.id='match-save-notice';box.setAttribute('role','alertdialog');box.setAttribute('aria-modal','true');
 box.style.cssText='position:fixed;inset:0;z-index:4000;display:grid;place-items:center;padding:20px;background:#020b19dd';
 const panel=document.createElement('div');panel.style.cssText='width:min(100%,430px);padding:24px;border-radius:12px;background:#173750;color:#f5fbff;border:2px solid #99d8f4;box-shadow:0 18px 60px #000b;line-height:1.7';
 const title=document.createElement('h2');title.textContent='다른 탭에서 저장이 변경됐습니다';title.style.cssText='font-size:20px;margin:0 0 10px';
 const message=document.createElement('p');message.textContent='현재 화면의 진행을 계속하면 변경 사항이 충돌할 수 있습니다. 최신 저장을 불러온 뒤 계속해 주세요.';
 const b=document.createElement('button');b.textContent='최신 저장 불러오기';b.style.cssText='width:100%;min-height:48px;padding:12px;border:1px solid #a3e8f8;border-radius:8px;background:#1c7497;color:white;font-weight:800';
 b.onclick=reload;panel.append(title,message,b);box.append(panel);document.body.append(box);b.focus?.();
}
if(game){
 const before=JSON.stringify(game);identity();const p=game.pendingMatch;
 if(p?.frozen&&p.frozen.registration?.rulesVersion!==registration.RULES_VERSION)window.MatchdayPreparation?.invalidate();
 recoverPending(game);
 if(JSON.stringify(game)!==before)save();
 if(p?.phase==='prepare')window.MatchdayPreparation?.render();
}
