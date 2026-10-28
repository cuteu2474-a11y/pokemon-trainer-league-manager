import {installEnhancementRules} from './enhancement.js';
import {installLeagueRules} from '../core/league-rules.js';
import {installFormHooks} from './gp-battle-stream.js';
import {Battle} from '@pkmn/sim';
import {installLevelFreeDamage} from './level-free-damage.js';
import {calculateLevelFreeStats} from '../core/stat-potential.js';

/** Blind forecast: neutral species-derived CA and no unrevealed item/ability.
 * Live battle data is never mutated. This is a deliberately approximate
 * possible opponent, not the actual private set passed to the trainer. */
export function maskPrivateOpponent(clone,foeId){
  const neutralCA={hp:100,atk:100,def:100,spa:100,spd:100,spe:100};
  for(const mon of clone[foeId]?.pokemon||[]){
    const base=mon.species?.baseStats;
    if(!base)continue;
    const stats=calculateLevelFreeStats(base,neutralCA);
    const hpFraction=mon.maxhp>0?mon.hp/mon.maxhp:0;
    for(const key of ['atk','def','spa','spd','spe']){
      mon.storedStats[key]=stats[key];
      mon.baseStoredStats[key]=stats[key];
    }
    mon.baseStoredStats.hp=stats.hp;
    mon.maxhp=stats.hp;mon.baseMaxhp=stats.hp;
    mon.hp=hpFraction>0?Math.max(1,Math.round(stats.hp*hpFraction)):0;
    mon.speed=stats.spe;
    mon.item='';mon.baseAbility='';mon.ability='';mon.lastItem='';
    if(mon.itemState)mon.itemState.id='';
    if(mon.abilityState)mon.abilityState.id='';
    // Form changes in a forecast must not restore the real hidden GP values.
    mon.leagueMeta={species:mon.species.name,nature:'Hardy',statCA:neutralCA,
      statPA:{...neutralCA}};
    if(mon.set){
      mon.set.item='';mon.set.ability='';
      const stats=['hp','atk','def','spa','spd','spe'];
      mon.set.evs=Object.fromEntries(stats.map(stat=>[stat,0]));
      mon.set.ivs=Object.fromEntries(stats.map(stat=>[stat,31]));
    }
  }
}

/** Evaluates legal actions using actual cloned Showdown turns. No mutation of live battle. */
export function evaluateBattle(battle, sideId = 'p1') {
  const mine = battle[sideId], theirs = battle[sideId === 'p1' ? 'p2' : 'p1'];
  const conditionPenalty={brn:18,par:18,psn:16,tox:27,slp:29,frz:29};
  const value = side => side.pokemon.reduce((sum, mon) =>
    sum + (mon.hp > 0 ? 120 + 100 * mon.hp / Math.max(1,mon.maxhp) -
      (conditionPenalty[mon.status]||0) : 0), 0);
  return value(mine) - value(theirs);
}
export function legalRolloutMoves(battle, sideId) {
  const side = battle[sideId], active = side.active[0];
  if (!active || !active.hp) return [];
  return active.moveSlots.map((slot,i) => ({choice:`move ${i+1}`,id:slot.id}))
    .filter((entry,i)=>active.moveSlots[i].pp > 0 && !active.moveSlots[i].disabled);
}
/**
 * Opponent-response search inspired by poke-engine expectiminimax.
 * Compute the expected score against EACH sampled counter-action; worstScore
 * uses the worst counter-action MEAN, not the least lucky critical-hit roll.
 */
export function summarizeResponses(samples=[]){
 const groups=new Map();
 for(const sample of samples){
  if(!Number.isFinite(sample?.score))continue;
  const id=String(sample.response??'unknown');
  const group=groups.get(id)||{sum:0,count:0};
  group.sum+=sample.score;group.count++;
  groups.set(id,group);
 }
 const averages=[...groups.values()].map(group=>group.sum/group.count);
 return {responses:groups.size,
  average:averages.length?samples.filter(x=>Number.isFinite(x?.score))
   .reduce((sum,x)=>sum+x.score,0)/samples.filter(x=>Number.isFinite(x?.score)).length:-Infinity,
  worst:averages.length?Math.min(...averages):-Infinity};
}
export function rolloutActions(battle, {sideId='p1', choices, opponentChoices,
  requirePublicChoices=false, publicOpponent=false, depth=1, samples=1} = {}) {
  if (!battle?.toJSON || !Array.isArray(choices) || !choices.length) throw new TypeError('Battle and legal choices required');
  if(requirePublicChoices&&(!Array.isArray(opponentChoices)||opponentChoices.length===0))
    throw new TypeError('Revealed opponent responses required');
  if (!Number.isInteger(depth) || depth < 1 || depth > 3 || !Number.isInteger(samples) || samples < 1 || samples > 12)
    throw new RangeError('Rollout budget exceeded');
  // Multi-turn automatic choices can expose an unobserved opposing move or
  // bench member. Blind opponent simulation is restricted to one turn.
  if(publicOpponent&&(!requirePublicChoices||depth!==1))
    throw new RangeError('Public opponent rollouts require revealed moves and depth 1');
  const baseline = battle.toJSON();
  const foeId = sideId === 'p1' ? 'p2' : 'p1';
  const results = [];
  for (const choice of choices) {
    let score = 0, runs = 0, kos = 0, damage = 0;
    const responseSamples=[];
    for (let i=0;i<samples;i++) {
      // Showdown serialization retains the original log array by reference.
      // Each search branch must own its log, including separate samples.
      const clone=installLevelFreeDamage(Battle.fromJSON(structuredClone(baseline)));
      installLeagueRules(clone);installFormHooks(clone);installEnhancementRules(clone);
      if(publicOpponent)maskPrivateOpponent(clone,foeId);
      const available=legalRolloutMoves(clone,foeId);
      const known=Array.isArray(opponentChoices)?opponentChoices.filter(choice=>
        available.some(move=>move.choice===choice)):[];
      if(requirePublicChoices&&!known.length)continue;
      const possible=known.length?known:available.map(x=>x.choice);
      const enemy=possible[i%Math.max(1,possible.length)];
      if (!enemy) continue;
      try {
        const foeBefore=clone[foeId].active?.[0];
        const foeHpBefore=foeBefore?.hp||0;
        const foeMaxHp=foeBefore?.maxhp||1;
        if (sideId === 'p1') clone.makeChoices(choice,enemy);
        else clone.makeChoices(enemy,choice);
        const foeAfter=clone[foeId].active?.[0];
        // Record only first-turn effects; later turns must not inflate a KO forecast.
        // If the opponent switched, this is not a direct KO on the original target.
        if(foeBefore===foeAfter&&foeHpBefore>0){
          const dealt=Math.max(0,foeHpBefore-foeAfter.hp);
          damage+=dealt/Math.max(1,foeMaxHp);
          if(foeAfter.hp<=0)kos++;
        }
        for (let turn=1;turn<depth && !clone.ended;turn++) {
          if (clone.requestState !== 'move') break;
          clone.makeChoices();
        }
        const outcome=evaluateBattle(clone,sideId);
        score += outcome;
        responseSamples.push({response:enemy,score:outcome});
        runs++;
      } catch {
        // Invalid branches are excluded rather than contaminating the live battle.
      }
    }
    const responses=summarizeResponses(responseSamples);
    results.push({choice,score:runs ? score/runs : -Infinity,
      worstScore:responses.worst,opponentResponses:responses.responses,runs,
      koRate:runs?kos/runs:0,damageFraction:runs?damage/runs:0});
  }
  return results.sort((a,b)=>b.score-a.score);
}

/**
 * Poke Engine-style conservative opponent response evaluation, adapted to
 * existing cloned Showdown turns rather than importing a second rules engine.
 * score and worstScore share the same battle-state value units.
 * This score is not an exact game-theoretic equilibrium or guaranteed win rate.
 * References: https://github.com/pmariglia/poke-engine (MIT license).
 */
export function robustResponseScore({score,worstScore},risk=0){
 if(!Number.isFinite(score))return -Infinity;
 if(!Number.isFinite(worstScore))return score;
 const bounded=Math.max(0,Math.min(1,Number(risk)||0));
 return score*(1-bounded)+worstScore*bounded;
}
