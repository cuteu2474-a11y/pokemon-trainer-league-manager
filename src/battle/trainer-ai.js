import {battlePlan,planPreference} from './battle-plans.js';
import {trainerPersonality} from './battle-autonomy.js';
import {RandomPlayerAI,Dex} from '@pkmn/sim';
import {selectTacticalMove,searchBudget,evaluateMove} from './tactical-search.js';
import {rolloutActions} from './showdown-rollout.js';

const clamp=x=>Math.max(1,Math.min(20,Number.isFinite(x)?x:10));
const limit=(x,a,b)=>Math.max(a,Math.min(b,x));
export function trainerSkill(trainer={}){
  return {tactics:clamp(trainer.tactics??10),switching:clamp(trainer.switching??10)};
}
export function typeMultiplier(moveType,defenderTypes=[]){
  if(!moveType)return 1;
  return defenderTypes.reduce((m,type)=>{
    if(!Dex.getImmunity(moveType,[type]))return 0;
    return m*Math.pow(2,Dex.getEffectiveness(moveType,[type]));
  },1);
}
export function scoreMove(move,opponentTypes=[]){
  const data=Dex.moves.get(move.id||move.move?.id||move.move||move.choice?.replace(/^move /,''));
  if(!data.exists)return 0;
  const power=data.basePower||(data.category==='Status'?25:1);
  const accuracy=typeof data.accuracy==='number'?data.accuracy/100:1;
  const effect=data.category==='Status'?1:typeMultiplier(data.type,opponentTypes);
  return power*accuracy*effect*(data.priority>0?1.15:1);
}
const sidename=(move)=>move?.id||move?.name||'unknown';
/** Engine policy changes the preference among legal actions, never resolves damage. */
export class TrainerAI extends RandomPlayerAI{
  constructor(stream,trainer={},options={}){
    const skill=trainerSkill(trainer);
    super(stream,{move:Math.min(1,.70+skill.tactics*.015),seed:options.seed});
    this.skill=skill;
    this.profile=trainer.aiProfile||trainerPersonality(trainer);
    this.plan=trainer.battlePlan?battlePlan(trainer):(this.profile.plan||'balanced');
    this.secondaryPlan=this.profile.secondaryPlan||null;
    this.adviceWeight=Number(this.profile.adviceWeight)||0;
    this.foeSpecies=null;
    this.team=options.team||[];
    this.ownActive=null;
    this.request=null;
    this.battleProvider=options.battleProvider;
    this.side='p1';
    this.remaining=trainer.relayOpponentsRemaining??1;
    this.decisions={moves:0,switches:0,voluntarySwitches:0,rollouts:0,rolloutFallbacks:0,
      plan:this.plan,response:this.profile.response||'자율',preferred:this.profile.preferred,
      reasons:{},trace:[]};
  }
  record(kind,choice,reason,details={}){
    this.decisions.reasons[reason]=(this.decisions.reasons[reason]||0)+1;
    if(this.decisions.trace.length<60){
      this.decisions.trace.push({kind,choice,reason,...details});
    }
  }
  receiveLine(line){
    if(line.startsWith('|switch|')||line.startsWith('|drag|')){
      const parts=line.split('|'),actor=parts[2]||'';
      if(actor.startsWith(this.side==='p1'?'p2':'p1'))this.foeSpecies=(parts[3]||'').split(',')[0];
    }
    return super.receiveLine(line);
  }
  receiveRequest(request){
    const slot=request.side?.pokemon?.findIndex(mon=>mon.active);
    if(slot>=0)this.ownActive=this.team[slot]||null;
    this.request=request;
    if(request.active?.length){
      // RandomPlayerAI controls voluntary switch selection using this.move.
      // Make it context-sensitive and based on public matchup/HP, not coin-flip switching.
      this.move=this.moveProbability(request);
    }
    return super.receiveRequest(request);
  }
  matchup(){
    const own=Dex.species.get(this.ownActive?.species||'');
    const foe=Dex.species.get(this.foeSpecies||'');
    return {ownTypes:own.exists?own.types:[],foeTypes:foe.exists?foe.types:[]};
  }
  moveProbability(request){
    const {ownTypes,foeTypes}=this.matchup();
    if(!ownTypes.length||!foeTypes.length)return .98;
    const active=request.side.pokemon.find(mon=>mon.active);
    const hp=Number.parseInt(active?.condition||'',10);
    const max=Number.parseInt(active?.condition?.split('/')[1]||'',10);
    const health=Number.isFinite(hp)&&Number.isFinite(max)&&max>0?hp/max:1;
    const danger=Math.max(...foeTypes.map(type=>typeMultiplier(type,ownTypes)));
    const immediate=Math.max(...ownTypes.map(type=>typeMultiplier(type,foeTypes)));
    const mismatch=danger>=2&&immediate<=1;
    const careful=['control','endurance'].includes(this.plan);
    let chance=.025+(mismatch?.22:0)+(health<.37?.13:0)+(careful?.07:0);
    if(this.plan==='offense'||this.plan==='tempo')chance-=.03;
    chance*=.35+this.profile.switchSkill/20;
    if(this.profile.preservation>=16&&this.remaining>1&&health<.55)chance+=.10;
    return 1-limit(chance,0,.48);
  }
  preference(move,battle){
    const primary=planPreference(move,battle,this.side,this.plan);
    if(!this.secondaryPlan)return primary;
    const alternate=planPreference(move,battle,this.side,this.secondaryPlan);
    return primary*(1-this.adviceWeight)+alternate*this.adviceWeight;
  }
  contextualBonus(move,battle){
    if(!move?.exists)return 0;
    const own=battle?.[this.side]?.active?.[0];
    if(!own)return 0;
    const hp=own.hp/Math.max(1,own.maxhp);
    if(hp>=.85||this.remaining<=1)return 0;
    const conservation=(this.profile.preservation-10)*.8+(this.remaining-1)*2;
    if(move.heal&&hp<.65)return Math.max(0,conservation)+6;
    if(move.drain&&hp<.6)return Math.max(0,conservation);
    if(move.selfdestruct||move.id==='explosion'||move.id==='selfdestruct')return -Math.max(0,conservation*3);
    return 0;
  }
  chooseMove(active,moves){
    this.decisions.moves++;
    if(!moves.length)return super.chooseMove(active,moves);
    const battle=this.battleProvider?.();
    const {ownTypes,foeTypes}=this.matchup();
    const context={foeTypes,ownTypes,ownAbility:this.ownActive?.ability,ownItem:this.ownActive?.item};
    const clarity=this.profile.analysis/20,understands=this.prng.random()<this.skill.tactics/20;
    if(!understands){
      const choice=super.chooseMove(active,moves);
      this.record('move',choice,'판단 실패 · 안전한 합법적 선택');
      return choice;
    }
    // The high-analysis trainer evaluates legal Showdown turn rollouts first.
    if(battle?.requestState==='move'&&battle[this.side]?.active?.[0]?.hp&&clarity>=.40){
      try{
        const choices=moves.map(x=>x.choice).filter(x=>/^move [1-4](?:$|\s)/.test(x));
        const {depth,samples}=searchBudget(this.profile.analysis);
        const ranked=rolloutActions(battle,{
          sideId:this.side,choices,depth,samples:Math.min(samples,4),
        });
        for(const candidate of ranked){
          const index=Number(candidate.choice.split(' ')[1])-1;
          const move=Dex.moves.get(battle[this.side].active[0].moveSlots[index]?.id);
          candidate.score+=this.preference(move,battle)+this.contextualBonus(move,battle);
        }
        ranked.sort((a,b)=>b.score-a.score||a.choice.localeCompare(b.choice));
        if(ranked[0]?.runs>0&&Number.isFinite(ranked[0].score)){
          this.decisions.rollouts++;
          this.record('move',ranked[0].choice,'전황 분석·실전 시뮬레이션',{plan:this.plan,
            advantage:Number(ranked[0].score.toFixed(1))});
          return ranked[0].choice;
        }
        this.decisions.rolloutFallbacks++;
      }catch{this.decisions.rolloutFallbacks++;}
    }
    // Fallback honors personality without overriding catastrophic matchups.
    const rankings=moves.map((entry,i)=>{
      const move=Dex.moves.get(entry.move?.id||entry.move?.move||entry.move||'');
      const value=evaluateMove(entry,context);
      const preference=this.preference(move,battle);
      const bonus=this.contextualBonus(move,battle);
      const lean=move.exists?(this.plan==='tempo'&&move.priority>0?13:
        this.plan==='control'&&move.category==='Status'?26:
        this.plan==='offense'&&move.category!=='Status'?5:
        this.plan==='endurance'&&move.heal?12:0):0;
      return {entry,i,value:value+preference+bonus+lean};
    }).sort((a,b)=>b.value-a.value||a.i-b.i);
    if(rankings[0]?.value>0){
      const choice=rankings[0].entry.choice;
      this.record('move',choice,'선플·상성·전술 우선순위',{plan:this.plan});
      return choice;
    }
    const choice=selectTacticalMove(moves,context,this.skill.tactics,()=>this.prng.random());
    this.record('move',choice,'기본 전술 탐색');
    return choice;
  }
  chooseSwitch(active,switches){
    this.decisions.switches++;
    if(active!==undefined)this.decisions.voluntarySwitches++;
    if(!switches.length)return super.chooseSwitch(active,switches);
    const foe=Dex.species.get(this.foeSpecies||'');
    const foeTypes=foe.exists?foe.types:[];
    const scored=switches.map((entry,i)=>{
      const species=Dex.species.get(entry.pokemon.details?.split(',')[0]||entry.pokemon.ident?.split(': ')[1]||'');
      if(!species.exists)return {entry,i,score:-999};
      const full=entry.pokemon.condition||'';
      const n=Number.parseInt(full,10),d=Number.parseInt(full.split('/')[1],10);
      const health=Number.isFinite(n)&&Number.isFinite(d)&&d>0?n/d:1;
      const threat=foeTypes.length?Math.max(...foeTypes.map(t=>typeMultiplier(t,species.types))):1;
      const attack=foeTypes.length?Math.max(...species.types.map(t=>typeMultiplier(t,foeTypes))):1;
      const preserve=this.remaining>1&&this.profile.preservation>=14;
      const score=(threat===0?32:30/(Math.max(.25,threat)))+
        (attack===0?0:Math.min(4,attack)*15)+health*(preserve?34:20);
      return {entry,i,score};
    }).sort((a,b)=>b.score-a.score||a.i-b.i);
    // Weaker evaluators are allowed to be less precise, but never pick an invalid slot.
    const uncertainty=(20-this.profile.switchSkill)/20;
    const index=scored.length>1&&this.prng.random()<uncertainty*.35?1:0;
    const best=scored[index]?.entry||switches[0];
    this.record('switch',String(best.slot),active===undefined?'기절 교체 · 잔존 전력 평가':
      '불리한 상성·HP 위험에 따른 자율 교체',{plan:this.plan});
    return best.slot;
  }
}
