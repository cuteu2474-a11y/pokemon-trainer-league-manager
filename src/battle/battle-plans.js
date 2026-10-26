import {Dex} from '@pkmn/sim';
export const PLAN_LABELS = Object.freeze({balanced:'균형',offense:'공세',control:'견제',endurance:'유지력',tempo:'속공'});
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
/** Small situational preferences; they never override Showdown legality or damage. */
export function planPreference(move,battle,side,plan='balanced'){
  if(!move?.exists||!battle?.[side]?.active?.[0])return 0;
  const own=battle[side].active[0],foe=battle[side==='p1'?'p2':'p1']?.active?.[0];
  if(!foe||!own.maxhp)return 0;
  const health=own.hp/own.maxhp;
  const healing=Boolean(move.heal||move.id==='rest'||move.id==='recover'||
    ['synthesis','moonlight','morningsun','strengthsap','slackoff','roost','softboiled'].includes(move.id));
  if(healing){
    if(health>=.80)return -65;
    return plan==='endurance'?24:plan==='balanced'?9:4;
  }
  if(move.category==='Status'){
    if(move.status){
      // Immunity must be checked against the move's *type*, never a status ID.
      if(foe.status||!Dex.getImmunity(move.type,foe.types)||
        ((move.status==='tox'||move.status==='psn')&&foe.types.some(t=>['Steel','Poison'].includes(t)))||
        (move.status==='brn'&&foe.types.includes('Fire')))return -70;
      return plan==='control'?18:plan==='endurance'?7:0;
    }
    const boosts=move.boosts||move.self?.boosts;
    if(boosts){
      const useful=Object.entries(boosts).some(([stat,n])=>n>0&&(own.boosts?.[stat]||0)<3);
      if(!useful||health<=.30)return -45;
      return plan==='offense'?15:plan==='tempo'?8:4;
    }
    if(move.sideCondition){
      const target=battle[side==='p1'?'p2':'p1'];
      if(target.sideConditions?.[move.sideCondition])return -45;
      return plan==='control'?13:5;
    }
  }
  if(plan==='tempo'&&move.priority>0)return 15;
  if(plan==='offense'&&move.category!=='Status')return 5;
  if(plan==='endurance'&&move.drain)return 13;
  return 0;
}
