import {Dex} from '@pkmn/sim';
import {readFileSync} from 'node:fs';
import {learnedMoves, planMoves} from '../src/battle/battle-plans.js';

const korean=JSON.parse(readFileSync(new URL('../src/web/species-ko.json',import.meta.url),'utf8'));
const englishByNumber=new Map(Dex.species.all().filter(s=>s.num>0&&!s.forme).map(s=>[s.num,s.name]));
const cache=new Map();
const KNOWN_PLANS=new Set(['balanced','offense','control','endurance','tempo']);
const max=(value,lo,hi)=>Math.min(hi,Math.max(lo,value));
const norm=value=>String(value||'').toLowerCase().replace(/[^a-z0-9]/g,'');
function hash(value){let h=2166136261;for(const ch of String(value))h=Math.imul(h^ch.charCodeAt(0),16777619);return h>>>0;}
function speciesOf(p){
  const source=p?.species||englishByNumber.get(korean[p?.name])||p?.name;
  const species=Dex.species.get(source);
  return species.exists?species:null;
}
const goodStatus=new Set(['recover','roost','slackoff','softboiled','synthesis','moonlight','morningsun','strengthsap','rest','protect','wish','milkdrink','thunderwave','willowisp','toxic','leechseed','yawn','encore','taunt','stealthrock','spikes','toxicspikes','stickyweb','substitute','reflect','lightscreen','swordsdance','nastyplot','calmmind','dragondance','bulkup','quiverdance','agility']);
const controlMoves=new Set(['thunderwave','willowisp','toxic','leechseed','yawn','encore','taunt','stealthrock','spikes','toxicspikes','stickyweb','reflect','lightscreen']);
const restoreMoves=new Set(['recover','roost','slackoff','softboiled','synthesis','moonlight','morningsun','strengthsap','rest','wish','milkdrink','protect']);
const setupMoves=new Set(['swordsdance','nastyplot','calmmind','dragondance','bulkup','quiverdance','agility']);
function candidatePool(species){
  if(cache.has(species.id))return cache.get(species.id);
  const moves=[...new Set(learnedMoves(species))].map(x=>Dex.moves.get(x)).filter(m=>
    m.exists&&!m.isNonstandard&&!m.selfdestruct&&!m.flags?.charge&&!m.flags?.recharge&&
    (m.category==='Status'?goodStatus.has(m.id):m.basePower>=35&&m.basePower<=130&&m.accuracy!==0));
  cache.set(species.id,moves);
  return moves;
}
function preference(move,species,plan){
  if(move.category!=='Status'){
    const raw=move.basePower*(move.accuracy===true?1:Math.max(.5,Number(move.accuracy||80)/100));
    const stab=species.types.includes(move.type)?1.27:1;
    const strong=species.baseStats.atk>=species.baseStats.spa?'Physical':'Special';
    const category=move.category===strong?1.15:.88;
    let bonus=move.priority>0?(plan==='tempo'?34:plan==='offense'?17:9):0;
    if(plan==='offense')bonus+=8;
    if(plan==='endurance'&&move.drain)bonus+=20;
    if(move.multihit)bonus-=4;
    return raw*stab*category+bonus;
  }
  if(restoreMoves.has(move.id))return plan==='endurance'?135:plan==='balanced'?85:plan==='control'?60:28;
  if(controlMoves.has(move.id))return plan==='control'?130:plan==='endurance'?75:plan==='balanced'?65:30;
  if(setupMoves.has(move.id))return plan==='offense'?115:plan==='tempo'?89:plan==='balanced'?70:43;
  return 42;
}
function setScore(ids,lookup,species,plan){
  const moves=ids.map(id=>lookup.get(id)).filter(Boolean);
  const attacks=moves.filter(m=>m.category!=='Status');
  if(!attacks.length)return -Infinity;
  const statuses=moves.length-attacks.length;
  const ceiling=plan==='control'||plan==='endurance'?2:1;
  const penalty=statuses>ceiling?(statuses-ceiling)*85:0;
  const distinct=new Set(attacks.map(m=>m.type)).size;
  const stab=attacks.some(m=>species.types.includes(m.type))?15:-50;
  return moves.reduce((sum,m)=>sum+preference(m,species,plan),0)+distinct*14+stab-penalty;
}
function chooseOne(species,current,plan,seed,skill){
  const pool=candidatePool(species),lookup=new Map(pool.map(m=>[m.id,m]));
  const unique=[...new Set(current.map(norm))].filter(id=>lookup.has(id)).slice(0,4);
  const original=unique.length?unique:planMoves(species,plan==='tempo'?'offense':plan);
  if(original.length<1)return null;
  const working=original.filter(id=>lookup.has(id));
  if(!working.length)return null;
  const initial=setScore(working,lookup,species,plan);
  let best=null;
  for(const move of pool){
    if(working.includes(move.id))continue;
    const positions=working.length<4?[-1]:working.map((_,i)=>i);
    for(const position of positions){
      const next=[...working];
      if(position===-1)next.push(move.id);else next[position]=move.id;
      const improvement=setScore(next,lookup,species,plan)-initial;
      if(improvement<=0)continue;
      // Cap changes to one move; favor quality, not a random arbitrary swap.
      if(!best||improvement>best.improvement||
        (improvement===best.improvement&&move.id<best.learned)){
        best={moves:next,learned:move.id,forgotten:position<0?null:working[position],improvement};
      }
    }
  }
  const readiness=hash(seed+':study')/4294967296;
  const threshold=max(21-skill*.55,8,20);
  const chance=max(.31+skill*.025,.31,.84);
  return best&&best.improvement>=threshold&&readiness<chance?best:null;
}
export function planTrainerMoves(item,period){
  const trainer=item?.trainer||{};
  const focus=KNOWN_PLANS.has(item?.focus)?item.focus:'balanced';
  const skill=max(Number(item?.skill)||10,1,20);
  const pokemon=Array.isArray(item?.pokemon)?item.pokemon.slice(0,6):[];
  const seed=period+':'+String(item?.key||'unknown');
  const updates=[], changes=[];
  // Initialize registered battle sets for previously unassigned Pokémon.
  for(let slot=0;slot<pokemon.length;slot++){
    const mon=pokemon[slot],species=speciesOf(mon);
    if(!species)continue;
    const known=Array.isArray(mon.moves)&&mon.moves.length>0;
    if(!known){
      try{
        const base=planMoves(species,focus==='tempo'?'offense':focus);
        updates.push({slot,species:species.id,moves:base,kind:'initial',name:mon.name||species.name});
      }catch{/* no legal pool: leave source untouched */}
    }
  }
  // One active move-learning decision per trainer and week.
  const sorted=pokemon.map((mon,slot)=>({mon,slot,weight:hash(seed+':target:'+slot)}))
    .sort((a,b)=>a.weight-b.weight||a.slot-b.slot);
  for(const {mon,slot} of sorted.slice(0,3)){
    const species=speciesOf(mon);if(!species)continue;
    try{
      const initialized=updates.find(x=>x.slot===slot);
      const current=initialized?.moves||(Array.isArray(mon.moves)?mon.moves:[]);
      const result=chooseOne(species,current,focus,seed+':'+slot,skill);
      if(!result)continue;
      const replaced=updates.find(x=>x.slot===slot);
      if(replaced)replaced.moves=result.moves;
      else updates.push({slot,species:species.id,moves:result.moves,kind:'revision',name:mon.name||species.name});
      changes.push({slot,name:mon.name||species.name,learned:result.learned,forgotten:result.forgotten,
        reason:focus==='control'?'견제·상태이상 활용':focus==='endurance'?'회복·지구력 관리':
          focus==='tempo'?'선공·속도 중시':focus==='offense'?'공격 압박':'균형·타입 대응'});
      break;
    }catch{/* preserve last valid moves on bad legacy species or learnset */}
  }
  return {key:String(item?.key||''),focus,updates,changes};
}
export function developTrainerMoves(input){
  if(!input||typeof input!=='object'||typeof input.period!=='string'||input.period.length>80||
    !Array.isArray(input.trainers)||input.trainers.length>240)throw new RangeError('훈련 요청 형식 또는 크기 오류');
  const results=input.trainers.map(item=>planTrainerMoves(item,input.period));
  return {period:input.period,results};
}
export default async function handler(req,res){
  res.setHeader('Content-Type','application/json; charset=utf-8');
  res.setHeader('Cache-Control','no-store');
  if(req.method!=='POST'){res.setHeader('Allow','POST');res.statusCode=405;return res.end(JSON.stringify({error:'POST 요청이 필요합니다.'}));}
  try{
    if(Number(req.headers?.['content-length']||0)>900000)throw new RangeError('요청 크기 초과');
    const body=typeof req.body==='string'?JSON.parse(req.body):req.body;
    const result=developTrainerMoves(body);
    res.statusCode=200;res.end(JSON.stringify(result));
  }catch(error){res.statusCode=400;res.end(JSON.stringify({error:String(error.message||error)}));}
}
