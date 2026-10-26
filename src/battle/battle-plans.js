import {Dex} from '@pkmn/sim';
export const PLAN_LABELS = Object.freeze({balanced:'균형',offense:'공세',control:'견제',endurance:'유지력'});
export function battlePlan(trainer={}) {
  if (Object.hasOwn(PLAN_LABELS,trainer.battlePlan)) return trainer.battlePlan;
  if ((trainer.switching??10) >= (trainer.tactics??10)+3) return 'control';
  if ((trainer.tactics??10) >= (trainer.switching??10)+3) return 'offense';
  return (trainer.switching??10)>=15?'endurance':'balanced';
}
const moveCache = new Map();
export function learnedMoves(species) {
  if (!moveCache.has(species.id)) moveCache.set(species.id,[...new Set(Dex.species.getFullLearnset(species.id).flatMap(data=>Object.keys(data.learnset||{})))]);
  return moveCache.get(species.id);
}
/** Species-learnable league sets, not claims about a canonical trainer's official team. */
export function planMoves(species, plan='balanced') {
  const pool=learnedMoves(species).map(id=>Dex.moves.get(id)).filter(m=>m.exists);
  const physical=species.baseStats.atk>=species.baseStats.spa;
  const attacks=pool.filter(m=>m.category!=='Status'&&m.basePower>0&&m.basePower<=130&&!m.selfdestruct&&!m.flags.charge&&!m.flags.recharge);
  const score=m=>m.basePower*(m.accuracy===true?1:m.accuracy/100)*(species.types.includes(m.type)?1.4:1)*((m.category==='Physical')===physical?1.2:.8)+(m.priority>0?8:0);
  attacks.sort((a,b)=>score(b)-score(a)||a.id.localeCompare(b.id));
  const selected=[];const take=m=>{if(m&&!selected.includes(m.id)&&selected.length<4)selected.push(m.id);};
  take(attacks.find(m=>species.types.includes(m.type)));take(attacks.find(m=>!species.types.includes(m.type))||attacks[0]);
  const has=id=>pool.find(m=>m.id===id);
  const recovery=['recover','roost','slackoff','softboiled','synthesis','moonlight','morningsun','strengthsap'].map(has).find(Boolean);
  const status=['thunderwave','willowisp','toxic','leechseed','yawn','encore','taunt','stealthrock','spikes'].map(has).filter(Boolean);
  const boost=pool.filter(m=>m.category==='Status'&&m.boosts&&((physical&&(m.boosts.atk||0)>0)||(!physical&&(m.boosts.spa||0)>0))).sort((a,b)=>a.id.localeCompare(b.id))[0];
  if(plan==='endurance'){take(recovery);take(status[0]||boost);}
  else if(plan==='control'){take(status[0]);take(status.find(m=>m.id!==status[0]?.id));}
  else if(plan==='offense'){take(boost);take(attacks.find(m=>m.priority>0));}
  else {take(recovery||status[0]);}
  for(const m of attacks)take(m);
  for(const m of pool)take(m);
  if(!selected.length)throw new RangeError('사용 가능한 기술이 없습니다: '+species.name);
  return selected;
}
/** Small tie-break preferences; Showdown still determines every effect and damage roll. */
export function planPreference(move,battle,side,plan='balanced') {
  if(plan==='balanced'||!battle?.[side]?.active?.[0])return 0;
  const own=battle[side].active[0],foe=battle[side==='p1'?'p2':'p1']?.active?.[0];
  if(!foe)return 0;
  if(move.heal||['synthesis','moonlight','morningsun','strengthsap'].includes(move.id))return own.hp/own.maxhp>=.8?-50:plan==='endurance'?12:0;
  if(move.status){
    if(foe.status||!Dex.getImmunity(move.status,foe.types)||!Dex.getImmunity(move.type,foe.types)||((move.status==='tox'||move.status==='psn')&&foe.types.some(t=>['Steel','Poison'].includes(t))))return -30;
    return plan==='control'?14:0;
  }
  if(move.boosts){
    const useful=Object.entries(move.boosts).some(([stat,n])=>n>0&&(own.boosts[stat]||0)<3);
    return useful&&own.hp/own.maxhp>.55&&plan==='offense'?14:-15;
  }
  if(move.sideCondition)return battle[side==='p1'?'p2':'p1'].sideConditions?.[move.sideCondition]?-30:plan==='control'?10:0;
  return plan==='offense'&&move.category!=='Status'?2:0;
}
