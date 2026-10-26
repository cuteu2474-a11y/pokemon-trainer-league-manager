/** Exact direct-action statistics. Residual damage is excluded instead of guessed. */
export function buildBattleReport(rounds,home,away){
 const teams={home,away};
 const stats=Object.fromEntries(Object.entries(teams).map(([side,trainers])=>[side,trainers.map(t=>t.team.map(mon=>({name:mon.name,displayName:mon.displayName||mon.name,species:mon.species,entries:0,damage:0,knockouts:0})))]));
 const keyFor=side=>side==='p1'?'home':'away';
 for(const round of rounds){
  const indices={p1:round.trainerA,p2:round.trainerB},hp=new Map(),hitBy=new Map();let move=null;
  const find=(side,name)=>stats[keyFor(side)][indices[side]].find(mon=>mon.name===name);
  for(const side of ['p1','p2'])round.result.initialStats[side].forEach((s,i)=>hp.set(side+':'+round.pokemonOrder[side][i],s.hp));
  for(const line of round.result.log.split('\n')){
   const part=line.split('|'),type=part[1],actor=part[2]||'',side=actor.startsWith('p1')?'p1':'p2',name=actor.split(': ').slice(1).join(': '),key=side+':'+name;
   if(type==='turn')move=null;
   if(type==='move')move={side,mon:find(side,name)};
   if(type==='switch'||type==='drag'){const m=find(side,name);if(m)m.entries++;const n=Number(part[4]?.match(/^\d+/)?.[0]);if(Number.isFinite(n))hp.set(key,n);}
   if(type==='-damage'||type==='-heal'){
    const now=Number(part[3]?.match(/^\d+/)?.[0]),before=hp.get(key);if(!Number.isFinite(now))continue;
    hitBy.delete(key);
    if(type==='-damage'&&move?.side!==side&&move?.mon&&!part.slice(4).some(p=>p.startsWith('[from]'))&&Number.isFinite(before)){
     move.mon.damage+=Math.max(0,before-now);hitBy.set(key,move.mon);
    }
    hp.set(key,now);
   }
   if(type==='faint'){const mon=hitBy.get(key);if(mon)mon.knockouts++;hitBy.delete(key);}
  }
 }
 return Object.fromEntries(Object.entries(stats).map(([key,trainers])=>[key,trainers.flatMap((mons,index)=>mons.map(mon=>({...mon,trainer:teams[key][index].name}))).filter(mon=>mon.entries>0).sort((a,b)=>b.knockouts-a.knockouts||b.damage-a.damage)]));
}
