/**
 * Pokémon Trainer League's level-free Showdown battle rules.
 *
 * The upstream @pkmn/sim battle logic is retained for move effects, accuracy,
 * abilities, weather, types, STAB, statuses and final damage modification.
 * Only the source-level coefficient, level-fixed moves and confusion damage
 * are overridden on EACH battle instance (including AI clone simulations).
 *
 * The package's serialized protocol still requires an internal compatibility
 * level in team data. It has NO influence on the rules below.
 */
import {Dex} from '@pkmn/sim';

export const LEVEL_FREE_DAMAGE_FACTOR = 28;
export const LEVEL_FREE_FIXED_DAMAGE = 50;

function levelFreeGetDamage(source,target,move,suppressMessages=false){
  if(typeof move==='string')move=this.dex.getActiveMove(move);
  if(typeof move==='number'){
    const power=move;
    move=new Dex.Move({basePower:power,type:'???',category:'Physical',willCrit:false});
    move.hit=0;
  }
  if(!target.runImmunity(move,!suppressMessages))return false;
  if(move.ohko)return this.battle.gen===3?target.hp:target.maxhp;

  // Seismic Toss and Night Shade have constant damage, no level reference.
  if(move.damage==='level')return LEVEL_FREE_FIXED_DAMAGE;
  // Psywave is the one standard Gen 9 move whose callback scales with level.
  if(move.id==='psywave')return Math.max(1,Math.floor(
    this.battle.random(50,151)*LEVEL_FREE_FIXED_DAMAGE/100));
  if(move.damageCallback)return move.damageCallback.call(this.battle,source,target);
  if(move.damage)return move.damage;

  const category=this.battle.getCategory(move);
  let basePower=move.basePower;
  if(move.basePowerCallback)basePower=move.basePowerCallback.call(this.battle,source,target,move);
  if(!basePower)return basePower===0?undefined:basePower;
  basePower=this.battle.clampIntRange(basePower,1);

  let critMult;
  let critRatio=this.battle.runEvent('ModifyCritRatio',source,target,move,move.critRatio||0);
  if(this.battle.gen<=5){
    critRatio=this.battle.clampIntRange(critRatio,0,5);
    critMult=[0,16,8,4,3,2];
  }else{
    critRatio=this.battle.clampIntRange(critRatio,0,4);
    critMult=this.battle.gen===6?[0,16,8,2,1]:[0,24,8,2,1];
  }
  const moveHit=target.getMoveHitData(move);
  moveHit.crit=move.willCrit||false;
  if(move.willCrit===undefined&&critRatio)moveHit.crit=this.battle.randomChance(1,critMult[critRatio]);
  if(moveHit.crit)moveHit.crit=this.battle.runEvent('CriticalHit',target,null,move);
  basePower=this.battle.runEvent('BasePower',source,target,move,basePower,true);
  if(!basePower)return 0;
  basePower=this.battle.clampIntRange(basePower,1);
  if((!source.volatiles.dynamax&&move.isMax)||
    (move.isMax&&this.dex.moves.get(move.baseMove).isMax))basePower=0;
  const dexMove=this.dex.moves.get(move.id);
  if(source.terastallized&&
    (source.terastallized==='Stellar'?
      !source.stellarBoostedTypes.includes(move.type):source.hasType(move.type))&&
    basePower<60&&dexMove.priority<=0&&!dexMove.multihit&&
    !((move.basePower===0||move.basePower===150)&&move.basePowerCallback))basePower=60;

  const attacker=move.overrideOffensivePokemon==='target'?target:source;
  const defender=move.overrideDefensivePokemon==='source'?source:target;
  const isPhysical=move.category==='Physical';
  let attackStat=move.overrideOffensiveStat||(isPhysical?'atk':'spa');
  const defenseStat=move.overrideDefensiveStat||(isPhysical?'def':'spd');
  const statTable={atk:'Atk',def:'Def',spa:'SpA',spd:'SpD',spe:'Spe'};
  let atkBoosts=attacker.boosts[attackStat],defBoosts=defender.boosts[defenseStat];
  let ignoreNegativeOffensive=!!move.ignoreNegativeOffensive;
  let ignorePositiveDefensive=!!move.ignorePositiveDefensive;
  if(moveHit.crit){
    ignoreNegativeOffensive=true;ignorePositiveDefensive=true;
  }
  const ignoreOffensive=!!(move.ignoreOffensive||(ignoreNegativeOffensive&&atkBoosts<0));
  const ignoreDefensive=!!(move.ignoreDefensive||(ignorePositiveDefensive&&defBoosts>0));
  if(ignoreOffensive){
    this.battle.debug('Negating (sp)atk boost/penalty.');
    atkBoosts=0;
  }
  if(ignoreDefensive){
    this.battle.debug('Negating (sp)def boost/penalty.');
    defBoosts=0;
  }
  let attack=attacker.calculateStat(attackStat,atkBoosts,1,source);
  let defense=defender.calculateStat(defenseStat,defBoosts,1,target);
  attackStat=category==='Physical'?'atk':'spa';
  attack=this.battle.runEvent('Modify'+statTable[attackStat],source,target,move,attack);
  defense=this.battle.runEvent('Modify'+statTable[defenseStat],target,source,move,defense);
  if(this.battle.gen<=4&&['explosion','selfdestruct'].includes(move.id)&&defenseStat==='def')
    defense=this.battle.clampIntRange(Math.floor(defense/2),1);
  const tr=this.battle.trunc;
  // No source.level anywhere: the damage factor is a game-wide combat constant.
  const baseDamage=tr(tr(tr(LEVEL_FREE_DAMAGE_FACTOR*basePower*attack)/defense)/50);
  return this.modifyDamage(baseDamage,source,target,move,suppressMessages);
}

function levelFreeConfusionDamage(pokemon,basePower){
  const tr=this.battle.trunc;
  const attack=pokemon.calculateStat('atk',pokemon.boosts.atk);
  const defense=pokemon.calculateStat('def',pokemon.boosts.def);
  const baseDamage=tr(tr(tr(LEVEL_FREE_DAMAGE_FACTOR*basePower*attack)/defense)/50)+2;
  let damage=tr(baseDamage,16);
  damage=this.battle.randomizer(damage);
  return Math.max(1,damage);
}

export function installLevelFreeDamage(battle){
  if(!battle?.actions||!battle.dex||battle.actions.__levelFree)return battle;
  battle.actions.getDamage=levelFreeGetDamage;
  battle.actions.getConfusionDamage=levelFreeConfusionDamage;
  battle.actions.__levelFree=true;
  return battle;
}
