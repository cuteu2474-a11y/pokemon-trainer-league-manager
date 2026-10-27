import {convertPokemon} from './gp-adapter.js';
import {LEAGUE_RULES} from '../core/league-rules.js';
const statusKeys=['time','startTime','duration'];
const idOf=meta=>String(meta.pokemonId??meta.uid??meta.id??meta.name);
const bounded=(n,max)=>Math.max(0,Math.min(max,Number.isFinite(n)?Math.trunc(n):0));
/** Portable values only: never retain an old battle's Pokemon/Side/effect objects. */
export function captureRelayState(mon,meta){
 const form=mon.baseSpecies;
 const converted=convertPokemon({...meta,natureModifiers:meta.natureModifiers||{}},form);
 const maxhp=converted.stats.hp;
 const hp=mon.hp<=0?0:Math.max(1,Math.min(maxhp,maxhp-(mon.maxhp-mon.hp)));
 return {schema:2,pokemonId:idOf(meta),name:meta.name,form:form.name,ability:mon.baseAbility,
  hp,maxhp,status:hp>0?mon.status:'',
  statusData:mon.status==='slp'?Object.fromEntries(statusKeys.filter(k=>Number.isFinite(mon.statusState[k])).map(k=>[k,mon.statusState[k]])):{},
  item:mon.item,lastItem:mon.lastItem||'',ateBerry:!!mon.ateBerry,bondTriggered:!!mon.bondTriggered,
  protectionBusted:!!mon.abilityState?.busted||['mimikyubusted','mimikyubustedtotem','eiscuenoice'].includes(mon.baseSpecies.id),terastallized:mon.terastallized||'',
  pp:mon.baseMoveSlots.map(m=>m.pp),moves:mon.baseMoveSlots.map(m=>({id:m.id,pp:m.pp,maxpp:m.maxpp}))};
}
export function restoreRelayState(battle,mon,meta,saved){
 if(saved.pokemonId!==undefined&&String(saved.pokemonId)!==idOf(meta))throw Error('이어싸움 포켓몬 ID가 일치하지 않습니다.');
 if(saved.form){
  const next=battle.dex.species.get(saved.form),registered=battle.dex.species.get(meta.species);
  if(!next.exists||next.baseSpecies!==registered.baseSpecies)throw Error('이어싸움 폼이 등록한 종과 다릅니다.');
  mon.setSpecies(next);mon.baseSpecies=next;mon.details=mon.getUpdatedDetails();
 }
 if(saved.ability&&saved.form){
  if(!battle.dex.abilities.get(saved.ability).exists)throw Error('이어싸움 특성 오류');
  mon.baseAbility=saved.ability;mon.ability=saved.ability;
 }
 mon.abilityState=battle.initEffectState({id:mon.ability,target:mon});
 if(['disguise','iceface'].includes(mon.baseAbility))mon.abilityState.busted=!!saved.protectionBusted;
 mon.bondTriggered=!!saved.bondTriggered;
 mon.hp=bounded(saved.hp,mon.maxhp);mon.fainted=mon.hp===0;
 mon.status=mon.hp>0?(saved.status||''):'';
 if(mon.status&&!['slp','brn','par','frz','psn','tox'].includes(mon.status))throw Error('이어싸움 상태이상 오류');
 mon.statusState=mon.status?battle.initEffectState({id:mon.status,target:mon}):{};
 if(mon.status==='slp'){
  for(const k of statusKeys)if(Number.isFinite(saved.statusData?.[k]))mon.statusState[k]=bounded(saved.statusData[k],7);
  // Legacy carries had only a status string; use a fixed fallback, never reroll.
  mon.statusState.time ??= 2;mon.statusState.startTime ??= mon.statusState.time;
 }
 if(mon.status==='tox')mon.statusState.stage=0;
 if(Object.hasOwn(saved,'item')){
  if(saved.item&&!battle.dex.items.get(saved.item).exists)throw Error('이어싸움 도구 오류');
  mon.item=saved.item;mon.itemState=battle.initEffectState({id:mon.item,target:mon});
 }
 mon.lastItem=saved.lastItem||'';mon.ateBerry=!!saved.ateBerry;
 if(saved.terastallized){mon.terastallized=saved.terastallized;mon.canTerastallize=null;mon.teraType=saved.terastallized;}
 for(let i=0;i<mon.baseMoveSlots.length;i++){
  const slot=mon.baseMoveSlots[i];
  const index=saved.moves?(saved.moves[i]?.id===slot.id?i:saved.moves.findIndex(m=>m.id===slot.id)):i;
  const pp=saved.pp?.[index]??saved.moves?.[index]?.pp;
  if(pp!==undefined)slot.pp=bounded(pp,slot.maxpp);
 }
 mon.moveSlots=mon.baseMoveSlots.slice();
}
export function recoverRelay(state){return state.map(mon=>({...mon,statusData:{...mon.statusData},moves:mon.moves?.map(m=>({...m})),pp:[...mon.pp],
 hp:mon.hp>0?Math.min(mon.maxhp,mon.hp+Math.floor(mon.maxhp*LEAGUE_RULES.relayRecovery)):0}));}
export function endTemporaryEnhancement(battle){
 for(const side of battle.sides)for(const mon of side.pokemon)if(mon.volatiles.dynamax)mon.removeVolatile('dynamax');
}
