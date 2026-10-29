import {Dex} from '@pkmn/sim';
import {ppConservation,publicFinishOpportunity} from './relay-resource-policy.js';

/** The seven league traits affect AI selection only. They never modify Showdown rules. */
export const TRAITS=Object.freeze({
  kill:{name:'킬각 포착',advice:'확실한 처치 기회를 노려라',threshold:55,matches:3},
  switch:{name:'적극적인 교체',advice:'불리한 대면을 피하라',threshold:55,matches:3},
  matchup:{name:'상성 교체 전문가',advice:'유리한 교체 대상을 찾아라',threshold:55,matches:3},
  preserve:{name:'에이스 보존',advice:'연승전에 대비해 전력을 보존하라',threshold:50,matches:3},
  pp:{name:'PP 관리자',advice:'고위력 기술의 PP를 관리하라',threshold:55,matches:3},
  status:{name:'상태이상 전문가',advice:'효과적인 상태이상으로 견제하라',threshold:55,matches:3},
  analysis:{name:'전황 분석가',advice:'상대 행동을 분석하고 선택하라',threshold:60,matches:4},
});
const clamp=(v,lo,hi)=>Math.min(hi,Math.max(lo,v));
export function traitValue(profile={},kind) {
  if(!Object.hasOwn(TRAITS,kind))return 0;
  const learned=(profile.traits||[]).includes(TRAITS[kind].name);
  const history=clamp(Number(profile.habitScores?.[kind])||0,0,100)/100;
  const recommended=profile.behaviorAdvice===kind?Math.max(0,Number(profile.behaviorWeight)||0):0;
  // Habit matters even with no new meeting; accepted meeting nudges one match.
  return clamp(history*.80+(learned?.32:0)+recommended*.36,0,1.2);
}
export function opponentTypes(battle,side) {
  const target=battle?.[side==='p1'?'p2':'p1']?.active?.[0];
  return target?.getTypes?.()||target?.types||[];
}
export function statusIsUseful(move,foe) {
  if(!move?.exists||move.category!=='Status'||!foe||!foe.hp)return false;
  const status=move.status;
  if(!status)return false;
  const types=foe.getTypes?.()||foe.types||[];
  if(foe.status)return false;
  if(!Dex.getImmunity(move.type,types))return false;
  if((status==='psn'||status==='tox')&&types.some(t=>t==='Steel'||t==='Poison'))return false;
  if(status==='brn'&&types.includes('Fire'))return false;
  if(status==='par'&&types.includes('Electric'))return false;
  if(status==='frz'&&types.includes('Ice'))return false;
  return true;
}
export function assessMoveTraits({move,battle,side='p1',profile={},remaining=1,options=[],forecast=null}={}) {
  if(!move?.exists)return {bonus:0,quality:{}};
  const own=battle?.[side]?.active?.[0],foe=battle?.[side==='p1'?'p2':'p1']?.active?.[0];
  const quality={kill:false,pp:false,status:false,preserve:false,killOpportunity:false};
  if(!own||!foe||!own.hp||!foe.hp)return {bonus:0,quality};
  const attacking=move.category!=='Status';
  const ownTypes=own.getTypes?.()||own.types||[];
  const foeTypes=foe.getTypes?.()||foe.types||[];
  const ownFraction=own.maxhp>0?own.hp/own.maxhp:1;
  const foeFraction=foe.maxhp>0?foe.hp/foe.maxhp:1;
  let bonus=0;
  const kill=traitValue(profile,'kill');
  const chance=Number(forecast?.koRate)||0;
  if(attacking&&kill>0&&chance>=.30) {
    const confidence=typeof move.accuracy==='number'?move.accuracy/100:1;
    bonus+=kill*35*chance*confidence;
    quality.kill=chance>=.50&&confidence>=.60;
  }else if(attacking&&forecast==null){
    // A plausible finishing window is public information, not a guaranteed KO.
    const opportunity=publicFinishOpportunity({
      moves:[{id:move.id,pp:own.moveSlots?.find(x=>x.id===move.id)?.pp}],
      ownTypes,foeTypes,foeHpFraction:foeFraction,
      ownHealth:ownFraction,currentDanger:1.4});
    if(opportunity>0){
      quality.killOpportunity=true;
      bonus+=kill*opportunity*.75;
    }
  }
  // A healing choice can teach conservation even before the trait is learned.
  // Only score genuinely useful self-healing while another relay opponent remains.
  const selfHeal=Boolean(move.heal)&&['self','allySide','allyTeam'].includes(move.target);
  const draining=attacking&&Boolean(move.drain)&&move.basePower>0&&
    Dex.getImmunity(move.type,foeTypes);
  if(remaining>1&&ownFraction>=.23&&ownFraction<.49&&foeFraction>.42&&
      (selfHeal||draining)){
    quality.preserve=true;
    const accuracy=typeof move.accuracy==='number'?move.accuracy/100:1;
    const need=Math.min(1,(1-ownFraction)/.55);
    bonus+=traitValue(profile,'preserve')*need*(selfHeal?9:4)*accuracy;
  }
  const status=traitValue(profile,'status');
  if(status>0&&statusIsUseful(move,foe)){
    const accuracy=typeof move.accuracy==='number'?move.accuracy/100:1;
    bonus+=status*28*accuracy;
    quality.status=true;
  } else if(move.category==='Status'&&move.status&&!statusIsUseful(move,foe)) {
    bonus-=75; // A trait never rewards immune or already-statused targets.
  }
  if(attacking){
    const scored=ppConservation({move,options,own,
      ownTypes:own.getTypes?.()||own.types||[],
      foeTypes:foe.getTypes?.()||foe.types||[],
      foeHpFraction:foe.maxhp>0?foe.hp/foe.maxhp:1,
      remaining,preservation:profile.preservation||10,
      ppHabit:traitValue(profile,'pp'),koRate:Number(forecast?.koRate)||0});
    bonus+=scored.bonus;
    quality.pp=scored.saved;
  }
  return {bonus,quality};
}
/** Ranking a switch is separate from deciding whether to switch at all. */
export function switchTraitBonus(profile, {currentThreat=1,nextThreat=1,health=1,offense=1,hazards=0}={}) {
  const match=traitValue(profile,'matchup');
  const improved=Number.isFinite(nextThreat)&&currentThreat>=1.5&&nextThreat<currentThreat&&health>.25;
  if(!improved)return {bonus:0,quality:{matchup:false}};
  // A better counter that immediately loses to hazards is not "expert".
  const safe=hazards<health*.8;
  return {bonus:safe?match*(15+Math.min(18,offense*4)):0,
    quality:{matchup:safe,improvement:currentThreat-nextThreat}};
}
