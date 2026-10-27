import {Dex} from '@pkmn/sim';
export const ENHANCEMENT_LABELS=Object.freeze({none:'사용 안 함',mega:'메가진화',zmove:'Z기술',dynamax:'다이맥스',terastallize:'테라스탈'});
const id=mon=>String(mon.pokemonId??mon.uid??mon.name);
/** Registered before kickoff; no replacement target after a knockout. */
export function enhancementPlan(team,selection={kind:'none'}){
 const kind=selection?.kind??'none';
 if(!Object.hasOwn(ENHANCEMENT_LABELS,kind))throw Error('강화 방식이 올바르지 않습니다.');
 if(kind==='none')return {kind};
 const mon=team.find(p=>id(p)===String(selection.pokemonId));
 if(!mon)throw Error('강화 대상은 해당 트레이너의 출전 포켓몬이어야 합니다.');
 const species=Dex.species.get(mon.species),item=Dex.items.get(mon.item||'');
 if(kind==='mega'){
  const stone=item.megaStone?.[species.baseSpecies]||item.megaStone?.[species.name];
  const ray=species.id==='rayquaza'&&!item.zMove&&mon.moves.some(m=>Dex.moves.get(m).id==='dragonascent');
  if((!stone||stone===species.name)&&!ray)throw Error(mon.name+'의 메가진화에는 맞는 메가스톤 또는 화룡점정이 필요합니다.');
 }
 if(kind==='zmove'){
  const valid=item.zMove&&(!item.itemUser||item.itemUser.includes(species.name))&&mon.moves.some(m=>{
   const move=Dex.moves.get(m);return item.zMoveFrom?move.name===item.zMoveFrom:move.type===item.zMoveType&&!!move.zMove;
  });
  if(!valid)throw Error(mon.name+'의 Z기술에는 맞는 Z크리스탈과 기술이 필요합니다.');
 }
 if(kind==='dynamax'&&(species.cannotDynamax||species.isMega||species.isPrimal||species.forme==='Ultra'||item.zMove||item.megaStone))throw Error(mon.name+'은 현재 종·도구로 다이맥스할 수 없습니다.');
 if(kind==='terastallize'){
  if(item.zMove||item.megaStone||species.isMega||species.isPrimal)throw Error('메가·Z 장비 또는 강화 폼에서는 테라스탈을 등록할 수 없습니다.');
  const fixed=species.baseSpecies==='Ogerpon'?({'ogerpon':'Grass','ogerponhearthflame':'Fire','ogerponwellspring':'Water','ogerponcornerstone':'Rock'}[species.id]):species.baseSpecies==='Terapagos'?'Stellar':null;
  const type=selection.teraType||mon.teraType||fixed||species.types[0];
  if(!Dex.types.get(type).exists)throw Error('테라 타입이 올바르지 않습니다.');
  if(fixed&&type!==fixed)throw Error('해당 포켓몬의 고정 테라 타입과 다릅니다.');
  return {kind,pokemonId:id(mon),teraType:type};
 }
 return {kind,pokemonId:id(mon)};
}
export function automaticEnhancement(team){
 for(const kind of ['mega','zmove','terastallize'])for(const mon of team){
  try{return enhancementPlan(team,{kind,pokemonId:id(mon)});}catch{}
 }
 return {kind:'none'};
}
const allowed=(battle,mon,kind)=>{
 const state=battle.leagueEnhancements?.[mon.side.id];
 return !!state&&!state.used&&state.plan.kind===kind&&state.plan.pokemonId===id(mon.leagueMeta||mon.set);
};
/** Reinstalled on each serialized AI branch; all state is plain battle-owned data. */
export function installEnhancementRules(battle,states){
 if(states)battle.leagueEnhancements=structuredClone(states);
 if(!battle.leagueEnhancements||battle.__leagueEnhancementHook)return;
 Object.defineProperty(battle,'__leagueEnhancementHook',{value:true});
 const add=battle.add;
 battle.add=function(...args){
  const result=add.apply(this,args),[event,mon]=args;
  const kind=event==='-mega'?'mega':event==='-zpower'?'zmove':event==='-terastallize'?'terastallize':event==='-start'&&args[2]==='Dynamax'?'dynamax':null;
  if(kind&&mon?.side&&allowed(this,mon,kind)){
   const state=this.leagueEnhancements[mon.side.id];state.used=true;state.usedTurn=this.turn;state.usedPokemonId=id(mon.leagueMeta||mon.set);
   add.call(this,'league-enhancement',mon.side.id,JSON.stringify(state));
  }
  return result;
 };
 const canMega=battle.actions.canMegaEvo;
 battle.actions.canMegaEvo=function(mon){
  // gen9customgame has no National Dex +past rule; league explicitly permits move-based Mega Rayquaza.
  const original=canMega.call(this,mon);
  return original||(allowed(this.battle,mon,'mega')&&mon.baseSpecies.id==='rayquaza'&&!mon.getItem().zMove&&mon.baseMoves.includes('dragonascent')?'Rayquaza-Mega':null);
 };
 const canZ=battle.actions.canZMove;
 battle.actions.canZMove=function(mon){return allowed(this.battle,mon,'zmove')?canZ.call(this,mon):undefined;};
 for(const side of battle.sides){
  // Side constructors disable Dynamax outside generation 8; league permits all four.
  side.dynamaxUsed=battle.leagueEnhancements[side.id].plan.kind!=='dynamax'||battle.leagueEnhancements[side.id].used;
  side.canDynamaxNow=function(){return !this.dynamaxUsed&&this.pokemon.some(mon=>allowed(this.battle,mon,'dynamax'));};
  const chooseMove=side.chooseMove;
  side.chooseMove=function(move,target,event,...rest){
   if(event&&!allowed(this.battle,this.active[0],event))return this.emitChoiceError('등록하지 않았거나 이미 사용한 강화입니다.');
   return chooseMove.call(this,move,target,event,...rest);
  };
  for(const mon of side.pokemon){
   const getDynamax=mon.getDynamaxRequest;
   mon.getDynamaxRequest=function(skipChecks){return skipChecks||allowed(battle,this,'dynamax')?getDynamax.call(this,skipChecks):undefined;};
   const getRequest=mon.getMoveRequestData;
   mon.getMoveRequestData=function(...args){
    this.canMegaEvo=allowed(battle,this,'mega')?battle.actions.canMegaEvo(this):null;
    this.canMegaEvoX=this.canMegaEvoY=null;this.canUltraBurst=null;
    this.canTerastallize=allowed(battle,this,'terastallize')?battle.actions.canTerastallize(this):null;
    return getRequest.apply(this,args);
   };
   if(allowed(battle,mon,'terastallize'))mon.teraType=battle.leagueEnhancements[side.id].plan.teraType;
   mon.getMoveRequestData();
  }
  // fromJSON regenerates requests before per-instance league hooks are restored.
  if(side.activeRequest?.active)side.activeRequest.active=side.active.map(mon=>mon.getMoveRequestData());
 }
}
export function initialEnhancement(team,selection,previous){
 const plan=enhancementPlan(team,selection);
 if(previous){
  if(JSON.stringify(previous.plan)!==JSON.stringify(plan))throw Error('이어싸움 중 강화 등록은 변경할 수 없습니다.');
  return structuredClone(previous);
 }
 return {plan,used:false};
}
