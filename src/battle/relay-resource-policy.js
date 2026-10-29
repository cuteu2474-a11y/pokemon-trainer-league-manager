import {Dex} from '@pkmn/sim';
import {calculateLevelFreeStats} from '../core/stat-potential.js';

const clamp=(x,a,b)=>Math.max(a,Math.min(b,x));
const stageValue=(move,ownTypes,foeTypes)=>{
  if(!move?.exists||move.category==='Status'||!(move.basePower>0))return 0;
  const type=foeTypes.reduce((n,t)=>
    n*(Dex.getImmunity(move.type,[t])?2**Dex.getEffectiveness(move.type,[t]):0),1);
  const accuracy=typeof move.accuracy==='number'?move.accuracy/100:1;
  return move.basePower*accuracy*(ownTypes.includes(move.type)?1.5:1)*type;
};

/**
 * Scores PP conservation across the remaining KOF challengers. No opponent
 * private move, item, stats or ability is accessed. The caller supplies only
 * legal own moves, own PP and observed opposing types/HP.
 * This changes action preferences, not actual Showdown PP or battle damage.
 */
export function ppConservation({move,options=[],own,ownTypes=[],foeTypes=[],
  foeHpFraction=1,remaining=1,preservation=10,ppHabit=0,koRate=0}={}){
  const none={bonus:0,saved:false};
  if(remaining<=1||move?.category==='Status'||!Array.isArray(own?.moveSlots))return none;
  if(!move?.exists||!(move.basePower>0)||koRate>=.50)return none;
  const slot=own.moveSlots.find(s=>s.id===move.id);
  if(!slot||slot.pp<=0||slot.maxpp<5)return none;
  // Finish the current opponent rather than hoarding a potentially decisive hit.
  if(foeHpFraction<=.22)return none;
  const strength=stageValue(move,ownTypes,foeTypes);
  if(!(strength>0))return none;
  const available=options.filter(m=>m?.exists&&m.category!=='Status'&&m.id!==move.id)
    .filter(m=>{
      const s=own.moveSlots.find(x=>x.id===m.id);
      return s&&s.pp>0&&!s.disabled;
    });
  const backup=available.filter(m=>stageValue(m,ownTypes,foeTypes)>=strength*.82);
  const scarce=slot.pp<=Math.max(2,Math.floor(slot.maxpp*.20));
  const futureWeight=clamp((remaining-1)/3,0,1);
  const motivation=clamp(Number(ppHabit)||0,0,1.2)+
    clamp((Number(preservation)-12)/8,0,1)*.22;
  if(motivation<=0||futureWeight<=0)return none;
  if(scarce&&backup.length){
    // A scarce high-impact attack has a comparable legal fallback.
    return {bonus:-Math.min(42,32*futureWeight*motivation),saved:false};
  }
  // Reward a comparable less-scarce alternative when the other move would
  // consume its last valuable PP. No reward for unusable/immune alternatives.
  const otherScarce=available.some(other=>{
    const otherSlot=own.moveSlots.find(s=>s.id===other.id);
    const otherStrength=stageValue(other,ownTypes,foeTypes);
    return otherSlot&&otherSlot.maxpp>=5&&
      otherSlot.pp<=Math.max(2,Math.floor(otherSlot.maxpp*.20))&&
      otherStrength>0&&
      strength>=otherStrength*.82&&otherStrength>=strength*.82;
  });
  if(!scarce&&otherScarce){
    return {bonus:Math.min(15,11*futureWeight*motivation),saved:true};
  }
  return none;
}

/** Intrinsic strength of *our* Pokémon from six current CA values and base
 * stats. PA is deliberately excluded because potential is not battle power. */
export function ownReserveStrength(pokemon={}){
  const species=Dex.species.get(pokemon.species||'');
  if(!species.exists)return 0;
  const ca=pokemon.statCA;
  const valid=ca&&['hp','atk','def','spa','spd','spe']
    .every(k=>Number.isInteger(ca[k])&&ca[k]>=1&&ca[k]<=200);
  const stats=valid?calculateLevelFreeStats(species.baseStats,ca):null;
  if(stats){
    return (stats.hp*.35+Math.max(stats.atk,stats.spa)*.85+
      stats.def*.42+stats.spd*.42+stats.spe*.5);
  }
  const b=species.baseStats;
  return b.hp*.35+Math.max(b.atk,b.spa)*.85+b.def*.42+b.spd*.42+b.spe*.5;
}

/** Small strategic nudge: avoid spending an especially strong healthy reserve
 * on a trivial switch; rescue an endangered active ace when there is a safe
 * switch. Foe strength and hidden moves never enter this calculation. */
export function aceSwitchAdjustment({active,candidate,team=[],remaining=1,
  preservation=10,currentHealth=1,currentDanger=1,matchupGain=0,
  candidateHealthAfterEntry=1}={}){
  if(remaining<=1||preservation<14||!candidate||!active)return 0;
  const strength=ownReserveStrength(candidate),current=ownReserveStrength(active);
  if(!strength||!current)return 0;
  const highest=Math.max(current,...team.map(ownReserveStrength));
  const weight=clamp((preservation-12)/8,0,1)*clamp((remaining-1)/3,0,1);
  if(strength>=highest-3&&strength>current+18&&currentHealth>=.65&&
     currentDanger<=1.3&&matchupGain<=.5&&candidateHealthAfterEntry>=.65)
    return -Math.min(15,6+(strength-current-18)*.13)*weight;
  if(current>=highest-3&&currentHealth<=.45&&currentDanger>=1.5&&
     candidateHealthAfterEntry>=.35)
    return Math.min(12,4+(current-strength)*.10)*weight;
  return 0;
}

/** Switching spends a full turn: prefer a good legal attack when staying is
 * safe, rather than repeatedly exposing reserves for a minor score advantage.
 * The penalty disappears for dangerous positions or meaningful counters.
 * All inputs are own legal attacks and visible foe HP/type data only. */
export function switchOpportunityPenalty({currentHealth=1,currentDanger=1,
  matchupGain=0,bestMoveScore=0,foeHpFraction=1,remaining=1,
  preservation=10}={}){
  if(currentHealth<=.60||currentDanger>=1.6||matchupGain>=.75||
     bestMoveScore<45)return 0;
  const attackValue=clamp((bestMoveScore-45)*.15,0,12);
  const likelyFinish=foeHpFraction<=.30?7:0;
  const relayWeight=remaining>1&&preservation>=14?4:0;
  return Math.min(23,(6+attackValue+likelyFinish+relayWeight)*
    (currentHealth>=.80?1:.75));
}
