import {Dex} from '@pkmn/sim';
import {ownReserveStrength} from './relay-resource-policy.js';

const suffix=ident=>String(ident||'').split(': ').slice(1).join(': ');
const health=text=>{
  const match=String(text||'').match(/^(\d+)(?:\/(\d+))?/);
  if(!match)return null;
  return {hp:Number(match[1]),maxhp:match[2]?Number(match[2]):null};
};
const rounded=x=>Number(x.toFixed(3));

/** Post-match evaluation of actual publicly logged HP loss after our own
 * VOLUNTARY switch decisions. No new battle decisions or hidden opponent sets.
 * HP lost to hazards, residual damage and enemy attacks is counted together.
 * A switch can be observed for less than a full turn (e.g. after U-turn).
 */
export function analyzeSwitchOutcomes(log,decisions={}){
  const events=['p1','p2'].flatMap(side=>(decisions[side]?.switchEvents||[])
    .map((event,i)=>({...event,side,sourceIndex:i,used:false})));
  const current=new Map(),open=new Map(),observed=[];
  let turn=0;
  const close=(side,atNextTurn)=>{
    const record=open.get(side);
    if(!record)return;
    record.observedUntilNextTurn=atNextTurn;
    record.survivedWindow=record.exitHp>0;
    record.hpLostFraction=record.maxhp>0?rounded(record.hpLost/record.maxhp):0;
    record.exitHpFraction=record.maxhp>0?rounded(record.exitHp/record.maxhp):null;
    observed.push(record);
    open.delete(side);
  };
  for(const line of String(log||'').split(/\r?\n/)){
    const p=line.split('|'),kind=p[1];
    if(kind==='turn'){
      for(const side of [...open.keys()])close(side,true);
      turn=Number(p[2])||turn;
      continue;
    }
    if(kind==='switch'||kind==='drag'){
      const side=(p[2]||'').slice(0,2),name=suffix(p[2]);
      if(!['p1','p2'].includes(side))continue;
      close(side,false);
      const hp=health(p[4]);
      if(!hp)continue;
      current.set(side,{name,hp:hp.hp,maxhp:hp.maxhp});
      // A pivot or forced replacement has no associated voluntary choice.
      const selected=kind==='switch'?events.find(x=>!x.used&&x.side===side&&
        x.turn===turn&&x.target===name):null;
      if(!selected)continue;
      selected.used=true;
      open.set(side,{side,turn,target:name,
        species:(p[3]||'').split(',')[0],
        entryHp:hp.hp,exitHp:hp.hp,
        maxhp:hp.maxhp,hpLost:0,damageEvents:0,decisionKind:'voluntary',
        observedUntilNextTurn:false,survivedWindow:false});
      continue;
    }
    if(kind==='-damage'||kind==='-heal'||kind==='-sethp'){
      const side=(p[2]||'').slice(0,2),name=suffix(p[2]);
      const state=current.get(side),newHp=health(p[3]);
      if(!state||state.name!==name||!newHp)continue;
      const record=open.get(side);
      if(record&&record.target===name&&kind==='-damage'){
        record.hpLost+=Math.max(0,state.hp-newHp.hp);
        record.damageEvents++;
      }
      state.hp=newHp.hp;
      if(newHp.maxhp)state.maxhp=newHp.maxhp;
      if(record&&record.target===name)record.exitHp=state.hp;
      continue;
    }
    if(kind==='faint'){
      const side=(p[2]||'').slice(0,2),name=suffix(p[2]);
      const state=current.get(side);
      if(state?.name===name)state.hp=0;
      const record=open.get(side);
      if(record?.target===name)record.exitHp=0;
    }
  }
  for(const side of [...open.keys()])close(side,false);
  const count=side=>observed.filter(x=>x.side===side);
  const summarize=side=>{
    const rows=count(side);
    return {choices:(decisions[side]?.switchEvents||[]).length,
      matched:rows.length,unmatched:(decisions[side]?.switchEvents||[]).length-rows.length,
      windowDeaths:rows.filter(x=>!x.survivedWindow).length,
      damaged:rows.filter(x=>x.hpLost>0).length,
      totalHpLossFraction:rounded(rows.reduce((sum,x)=>sum+x.hpLostFraction,0)),
      meanHpLossFraction:rows.length?
        rounded(rows.reduce((sum,x)=>sum+x.hpLostFraction,0)/rows.length):0};
  };
  return {bySide:{p1:summarize('p1'),p2:summarize('p2')},switches:observed};
}

/** Physical readiness of the strongest own-CA Pokémon at an actual trainer
 * handoff. This is NOT a win probability or proof that an ace was optimally used.
 */
export function analyzeAceHandoffs(rounds,club,side='A'){
  if(!Array.isArray(rounds)||!Array.isArray(club))return {handoffs:0,alive:0,ready:0,leadKnown:0,readyVsLead:0,
    stoodNextDuel:0,records:[]};
  const key=side==='A'?'p1':'p2',trainerField=side==='A'?'trainerA':'trainerB';
  const records=[];
  for(let i=0;i<rounds.length-1;i++){
    const duel=rounds[i],next=rounds[i+1];
    if(duel.winner!==side||duel[trainerField]!==next[trainerField])continue;
    const index=duel[trainerField],team=club[index]?.team;
    if(!Array.isArray(team)||!team.length)continue;
    const strongest=team.reduce((best,mon)=>
      ownReserveStrength(mon)>ownReserveStrength(best)?mon:best);
    const slot=team.indexOf(strongest);
    const uniqueName=strongest.name&&team.filter(p=>p.name===strongest.name).length===1;
    const monId=String(strongest.pokemonId??strongest.uid??strongest.id??
      (uniqueName?strongest.name:'relay:'+side+':'+index+':'+slot));
    const before=duel.result.finalState[key].find(x=>String(x.pokemonId)===monId);
    const after=next.result.initialStats[key].find(x=>String(x.pokemonId)===monId);
    const future=next.result.finalState[key].find(x=>String(x.pokemonId)===monId);
    if(!before||!after||!future)continue;
    const attackMoves=after.moves.filter((slot,j)=>
      (after.pp?.[j]??slot.pp)>0&&Dex.moves.get(slot.id).exists&&
      Dex.moves.get(slot.id).category!=='Status');
    const ready=after.hp>0&&attackMoves.length>0;
    // The next opponent's actual opening species is in the public battle log;
    // use this ONLY after the duel, never in TrainerAI's action selection.
    const opposingSide=side==='A'?'p2':'p1';
    const leadLine=String(next.result.log||'').split(/\r?\n/)
      .find(line=>line.startsWith('|switch|'+opposingSide+'a:'));
    const leadSpecies=(leadLine?.split('|')[3]||'').split(',')[0];
    const lead=Dex.species.get(leadSpecies);
    const bestCoverage=lead.exists?Math.max(0,...attackMoves.map(slot=>{
      const move=Dex.moves.get(slot.id);
      return lead.types.reduce((mult,type)=>mult*
        (Dex.getImmunity(move.type,[type])?
          2**Dex.getEffectiveness(move.type,[type]):0),1);
    })):null;
    const readyVsLead=lead.exists?ready&&bestCoverage>0:null;
    records.push({duelIndex:i,trainerIndex:index,pokemonId:monId,
      species:strongest.species,alive:after.hp>0,
      ready,readyVsLead,nextOpponentLead:lead.exists?lead.name:null,
      bestCoverage,stoodNextDuel:future.hp>0,
      hpBeforeRecoveryFraction:before.maxhp>0?rounded(before.hp/before.maxhp):0,
      hpAfterRecoveryFraction:after.maxhp>0?rounded(after.hp/after.maxhp):0,
      remainingAttackingPP:after.moves.reduce((sum,slot,j)=>
        sum+(Dex.moves.get(slot.id).category!=='Status'?(after.pp?.[j]??slot.pp??0):0),0)});
  }
  return {handoffs:records.length,alive:records.filter(x=>x.alive).length,
    ready:records.filter(x=>x.ready).length,
    leadKnown:records.filter(x=>x.readyVsLead!==null).length,
    readyVsLead:records.filter(x=>x.readyVsLead===true).length,
    stoodNextDuel:records.filter(x=>x.stoodNextDuel).length,records};
}
