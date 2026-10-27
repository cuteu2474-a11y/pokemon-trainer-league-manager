import {LEAGUE_RULES} from './league-rules.js';
/** Shared browser/API contract for immutable official-match inputs. */
export const RULES_VERSION=LEAGUE_RULES.version;
export const rules=LEAGUE_RULES;
export const ENGINE_VERSION='pkmn-sim-0.10.11-level-free-v1';
const copy=x=>JSON.parse(JSON.stringify(x));
function canonical(value){
 if(Array.isArray(value))return '['+value.map(canonical).join(',')+']';
 if(value&&typeof value==='object')return '{'+Object.keys(value).filter(k=>value[k]!==undefined).sort().map(k=>JSON.stringify(k)+':'+canonical(value[k])).join(',')+'}';
 return JSON.stringify(value);
}
export async function digest(value){
 const bytes=new TextEncoder().encode(canonical(value));
 const hash=await globalThis.crypto.subtle.digest('SHA-256',bytes);
 return [...new Uint8Array(hash)].map(n=>n.toString(16).padStart(2,'0')).join('');
}
export const matchId=p=>[p.season,p.round,p.home,p.away].join(':');
export function ensureRosterIds(g){
 g.nextPokemonUID=Number.isSafeInteger(g.nextPokemonUID)?g.nextPokemonUID:0;
 const seen=new Set(),mons=new Set();
 const trainers=g.clubs.flatMap(c=>[...(c.trainers||[]),...(c.reserveTrainers||[]),...(c.trainerAcademy||[])]).concat((g.freeAgents||[]).map(x=>x.trainer)).filter(Boolean);
 let next=Math.max(0,...trainers.map(t=>Number(t.uid)||0));
 const oldIds=trainers.flatMap(t=>[...(t.pokemon||[]),...(t.pokemonScouting?.candidate?[t.pokemonScouting.candidate]:[])].map(p=>Number(String(p.uid||'').match(/^pokemon:(\d+)$/)?.[1])||0));
 g.nextPokemonUID=Math.max(g.nextPokemonUID,...oldIds,0);
 for(const t of trainers){
  if(!Number.isInteger(t.uid))t.uid=++next;
  if(seen.has(t.uid))throw Error('중복된 트레이너 ID가 있습니다.');seen.add(t.uid);
  for(const mon of [...(t.pokemon||[]),...(t.pokemonScouting?.candidate?[t.pokemonScouting.candidate]:[])]){
   if(mon.uid===undefined||mon.uid===null)mon.uid='pokemon:'+ ++g.nextPokemonUID;
   if(mons.has(String(mon.uid)))throw Error('중복된 포켓몬 ID가 있습니다.');mons.add(String(mon.uid));
   mon.ownerTrainerId ??= String(t.uid);
  }
 }
 g.nextTrainerUID=Math.max(g.nextTrainerUID||1,next+1);
}
const keys=(obj,names)=>Object.fromEntries(names.filter(k=>obj[k]!==undefined).map(k=>[k,copy(obj[k])]));
export function lineupState(g,p){
 return {order:p.order,plans:p.plans,behaviors:p.behaviors,enhancements:p.enhancements,clubs:[p.home,p.away].map(id=>{
  const c=g.clubs.find(c=>String(c.id)===String(id));if(!c)throw Error('경기 구단이 없습니다.');
  return {...keys(c,['id','fatigue','morale']),trainers:c.trainers.map(t=>t&&({...keys(t,['uid','id','name','tactics','switching','battleAnalysis','analysis','resourceManagement','management','moveJudgment','switchJudgment','autonomyAI','skills','preferredPlay','playStyle','preferredPlays','enhancement']),
   pokemon:(t.pokemon||[]).map(mon=>keys(mon,['uid','ownerTrainerId','name','species','formId','statCA','statPA','power','ca','pa','potential','gp','nature','ability','item','moves','teraType']))}))};
 })};
}
export function validateRoster(request){
 const ids=new Set(),pokemonIds=new Set();
 for(const c of [request.home,request.away]){
  if(c?.trainers?.length!==5)throw Error('트레이너 5명의 출전 명단이 필요합니다.');
  for(const t of c.trainers){
   if(!t||!Number.isInteger(t.uid)||ids.has(String(t.uid)))throw Error('트레이너 출전 ID가 올바르지 않습니다.');ids.add(String(t.uid));
   if(t.pokemon?.length!==6)throw Error('출전 포켓몬은 트레이너당 6마리입니다.');
   for(const mon of t.pokemon){
    if(mon.uid===undefined||mon.uid===null||pokemonIds.has(String(mon.uid)))throw Error('포켓몬 출전 ID가 올바르지 않습니다.');pokemonIds.add(String(mon.uid));
    if(String(mon.ownerTrainerId)!==String(t.uid))throw Error('포획한 트레이너만 해당 포켓몬을 출전시킬 수 있습니다.');
   }
  }
 }
 for(const order of [request.homeOrder,request.awayOrder])if(!Array.isArray(order)||order.length!==5||new Set(order).size!==5||order.some(n=>!Number.isInteger(n)||n<0||n>4))throw Error('출전 순서가 올바르지 않습니다.');
 if(!Array.isArray(request.seed)||request.seed.length!==4||request.seed.some(n=>!Number.isInteger(n)||n<0||n>0xffffffff))throw Error('경기 시드가 올바르지 않습니다.');
}
export async function freezeMatch(request,p,live){
 const snapshot=copy(request);validateRoster(snapshot);
 const registration={id:globalThis.crypto.randomUUID(),matchId:matchId(p),season:p.season,round:p.round,week:p.week,home:p.home,away:p.away,
  rulesVersion:RULES_VERSION,engineVersion:ENGINE_VERSION,liveHash:await digest(live)};
 registration.inputHash=await digest({request:snapshot,registration});
 return {request:snapshot,registration};
}
export async function validateRequest(body){
 const {registration,...request}=body||{};
 if(!registration||registration.rulesVersion!==RULES_VERSION||registration.engineVersion!==ENGINE_VERSION)throw Error('경기 규정·엔진 버전이 변경됐습니다. 출전 확정을 다시 확인해 주세요.');
 const {inputHash,...identity}=registration;
 if(typeof identity.id!=='string'||identity.id.length>80||!Number.isInteger(identity.season)||identity.season<1||!Number.isInteger(identity.round)||identity.round<1||identity.round>18||!Number.isInteger(identity.week)||identity.week<1||identity.week>30||identity.home!==request.home?.id||identity.away!==request.away?.id||identity.home===identity.away||identity.matchId!==matchId(identity))throw Error('경기 식별 정보가 일치하지 않습니다.');
 validateRoster(request);
 if(await digest({request,registration:identity})!==inputHash)throw Error('출전 확정 이후 경기 입력이 변경됐습니다.');
 return registration;
}
export async function validateResult(frozen,result){
 await validateRequest({...frozen.request,registration:frozen.registration});
 const expected=frozen.registration,actual=result?.registration;
 if(!actual||['id','inputHash','matchId','rulesVersion','engineVersion'].some(k=>actual[k]!==expected[k])||result.home!==expected.home||result.away!==expected.away||result.engine!=='showdown'||!result.rounds?.length)throw Error('다른 경기 또는 이전 요청의 결과는 반영할 수 없습니다.');
 if(!Number.isInteger(result.aScore)||!Number.isInteger(result.bScore)||result.aScore<0||result.bScore<0||result.aScore>5||result.bScore>5||Math.max(result.aScore,result.bScore)!==5)throw Error('경기 점수가 올바르지 않습니다.');
}
