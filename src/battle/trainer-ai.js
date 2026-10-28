import {conditionedTrainer} from '../core/squad-condition.js';
import {battlePlan,planPreference} from './battle-plans.js';
import {trainerPersonality} from './battle-autonomy.js';
import {RandomPlayerAI,Dex} from '@pkmn/sim';
import {selectTacticalMove,searchBudget,evaluateMove,wastedStatusMove} from './tactical-search.js';
import {rolloutActions} from './showdown-rollout.js';
import {traitValue,assessMoveTraits,switchTraitBonus} from './trait-decision.js';

const clamp=x=>Math.max(1,Math.min(20,Number.isFinite(x)?x:10));
const limit=(x,a,b)=>Math.max(a,Math.min(b,x));
export function trainerSkill(trainer={}){
  return {tactics:clamp(trainer.moveJudgment??trainer.tactics??10),
    switching:clamp(trainer.switchJudgment??trainer.switching??10)};
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
    trainer=conditionedTrainer(trainer);
    const skill=trainerSkill(trainer);
    super(stream,{move:Math.min(1,.70+skill.tactics*.015),seed:options.seed});
    this.skill=skill;
    const preset=trainer.aiProfile||{},base=trainerPersonality(trainer);
    const rating=(...args)=>Math.max(1,Math.min(20,Number(args.find(v=>v!==null&&v!==undefined&&v!==''&&Number.isFinite(Number(v)))??10)));
    // Prepared personalities already include ratings: never erase these with undefined.
    this.profile={...base,...preset,
      moveSkill:rating(trainer.moveJudgment,preset.moveSkill,skill.tactics),
      switchSkill:rating(trainer.switchJudgment,preset.switchSkill,skill.switching),
      analysis:rating(trainer.battleAnalysis,preset.analysis,skill.tactics),
      preservation:rating(trainer.resourceManagement??trainer.management,preset.preservation,skill.switching)};
    this.plan=trainer.battlePlan?battlePlan(trainer):(this.profile.plan||'balanced');
    this.secondaryPlan=this.profile.secondaryPlan||null;
    this.adviceWeight=Number(this.profile.adviceWeight)||0;
    this.foeSpecies=null;
    this.foeStatus='';
    this.opponentPreview=[];
    this.team=options.team||[];
    this.ownActive=null;
    this.request=null;
    this.battleProvider=options.battleProvider;
    this.side='p1';
    this.remaining=trainer.relayOpponentsRemaining??1;
    this.decisions={moves:0,switches:0,voluntarySwitches:0,rollouts:0,rolloutFallbacks:0,
      plan:this.plan,response:this.profile.response||'자율',preferred:this.profile.preferred,
      traits:[...(this.profile.traits||[])],
      behaviorAdvice:this.profile.behaviorAdvice||null,
      behaviorResponse:this.profile.behaviorResponse||'자율',
      reasons:{},trace:[]};
  }
  record(kind,choice,reason,details={}){
    this.decisions.reasons[reason]=(this.decisions.reasons[reason]||0)+1;
    if(this.decisions.trace.length<60){
      this.decisions.trace.push({kind,choice,reason,...details});
    }
  }
  receiveLine(line){
    const foeSide=this.side==='p1'?'p2':'p1';
    if(line.startsWith('|poke|')){
      const parts=line.split('|');
      if(parts[2]===foeSide){
        const species=(parts[3]||'').split(',')[0];
        if(Dex.species.get(species).exists&&!this.opponentPreview.includes(species))
          this.opponentPreview.push(species);
      }
    }else if(line.startsWith('|switch|')||line.startsWith('|drag|')){
      const parts=line.split('|'),actor=parts[2]||'';
      if(actor.startsWith(foeSide)){
        this.foeSpecies=(parts[3]||'').split(',')[0];
        this.foeStatus='';
      }
    }else if(line.startsWith('|-status|')){
      const parts=line.split('|');
      if((parts[2]||'').startsWith(foeSide))this.foeStatus=parts[3]||'';
    }else if(line.startsWith('|-curestatus|')){
      const parts=line.split('|');
      if((parts[2]||'').startsWith(foeSide))this.foeStatus='';
    }
    return super.receiveLine(line);
  }
  receiveRequest(request){
    const slot=request.side?.pokemon?.findIndex(mon=>mon.active);
    if(slot>=0)this.ownActive=this.findOwned(request.side.pokemon[slot],slot+1);
    this.request=request;
    if(request.active?.length){
      // RandomPlayerAI controls voluntary switch selection using this.move.
      // Make it context-sensitive and based on public matchup/HP, not coin-flip switching.
      this.move=this.moveProbability(request);
    }
    return super.receiveRequest(request);
  }
  findOwned(pokemon,slot){
    const label=(pokemon?.ident||'').split(': ').slice(1).join(': ');
    return this.team.find(mon=>mon.name===label)||
      this.team[Number(slot)-1]||null;
  }
  /* Evaluate one owned Pokémon using known types, current HP and real own moves.
     This never examines the opponent's hidden moves, items or battle set. */
  candidateScore(pokemon,slot,foeTypes=[],hazards=0){
    const own=this.findOwned(pokemon,slot);
    const species=Dex.species.get(pokemon?.details?.split(',')[0]||own?.species||'');
    if(!species.exists)return -1e6;
    const condition=String(pokemon?.condition||'');
    if(condition.endsWith(' fnt')||Number.parseInt(condition,10)===0)return -1e6;
    const hp=Number.parseInt(condition,10),max=Number.parseInt(condition.split('/')[1]||'',10);
    const health=Number.isFinite(max)&&max>0?limit(hp/max,0,1):1;
    const bestAgainst=types=>{
      let best=0;
      const ownMoves=own?.moves||[];
      for(const id of ownMoves){
        const move=Dex.moves.get(id);
        if(!move.exists||move.category==='Status'||move.basePower<=0)continue;
        const effectiveness=types.length?typeMultiplier(move.type,types):1;
        const accuracy=typeof move.accuracy==='number'?move.accuracy/100:1;
        const stab=species.types.includes(move.type)?1.35:1;
        best=Math.max(best,Math.min(250,move.basePower*accuracy*stab*effectiveness));
      }
      return best;
    };
    // Do not inflate the lead evaluation with imagined opposing moves.
    const defense=foeTypes.length?Math.max(...foeTypes.map(t=>typeMultiplier(t,species.types))):1;
    const offense=bestAgainst(foeTypes);
    const versatility=own?.moves?.filter(id=>Dex.moves.get(id).category!=='Status').length||0;
    const conditionPenalty=String(pokemon?.condition||'').match(/\b(par|brn|slp|frz)\b/)?.[1] ? 15:0;
    return 45*health+Math.min(90,offense)*.50+Math.min(versatility,4)*3+
      (defense===0?42:29/Math.max(.5,defense))-hazards*120-conditionPenalty;
  }
  chooseTeamPreview(team){
    if(!Array.isArray(team)||team.length<2)return super.chooseTeamPreview(team);
    const enemy=this.opponentPreview.map(s=>Dex.species.get(s)).filter(s=>s.exists);
    const ranked=team.map((pokemon,i)=>{
      const foes=enemy.length?enemy:[null];
      const score=foes.reduce((sum,foe)=>sum+
        this.candidateScore(pokemon,i+1,foe?.types||[]),0)/foes.length;
      return {slot:i+1,score};
    }).filter(x=>x.score>-1e5).sort((a,b)=>b.score-a.score||a.slot-b.slot);
    if(!ranked.length)return super.chooseTeamPreview(team);
    const first=ranked[0].slot;
    this.record('lead',String(first),'공개된 상대와 잔존 전력에 따른 선발');
    return 'team '+first;
  }
  matchup(){
    const own=Dex.species.get(this.ownActive?.species||'');
    const foe=Dex.species.get(this.foeSpecies||'');
    return {ownTypes:own.exists?own.types:[],foeTypes:foe.exists?foe.types:[]};
  }
  moveProbability(request){
    const {ownTypes,foeTypes}=this.matchup();
    const bench=(request.side?.pokemon||[]).filter(mon=>!mon.active&&Number.parseInt(mon.condition||'',10)>0);
    if(!bench.length)return 1;
    if(!ownTypes.length||!foeTypes.length)return .985;
    const active=request.side.pokemon.find(mon=>mon.active);
    const hp=Number.parseInt(active?.condition||'',10);
    const max=Number.parseInt(active?.condition?.split('/')[1]||'',10);
    const health=Number.isFinite(hp)&&Number.isFinite(max)&&max>0?hp/max:1;
    const danger=Math.max(...foeTypes.map(type=>typeMultiplier(type,ownTypes)));
    const immediate=Math.max(...ownTypes.map(type=>typeMultiplier(type,foeTypes)));
    const mismatch=danger>=2&&immediate<=1;
    // Switching without a safer living replacement wastes a full turn.
    const counter=bench.some(mon=>{
      const species=Dex.species.get(mon.details?.split(',')[0]||mon.ident?.split(': ').slice(1).join(': ')||'');
      if(!species.exists)return false;
      const threat=Math.max(...foeTypes.map(t=>typeMultiplier(t,species.types)));
      const attack=Math.max(...species.types.map(t=>typeMultiplier(t,foeTypes)));
      const hp=Number.parseInt(mon.condition||'',10),max=Number.parseInt((mon.condition||'').split('/')[1]||'',10);
      return (max>0?hp/max:1)>.30&&threat<danger&&(threat<=1||attack>immediate);
    });
    const careful=['control','endurance'].includes(this.plan);
    let chance=.025+(mismatch?.22:0)+(health<.37?.13:0)+(careful?.07:0);
    if(this.plan==='offense'||this.plan==='tempo')chance-=.03;
    chance*=.35+this.profile.switchSkill/20;
    if(this.profile.preservation>=16&&this.remaining>1&&health<.55)chance+=.10;
    // Earned play traits influence decision tendencies, not legal actions or stats.
    chance+=.075*traitValue(this.profile,'switch');
    if(this.remaining>1&&health<.75)chance+=.06*traitValue(this.profile,'preserve');
    // Successful previous choices strengthen a habit even without fresh manager input.
    if(mismatch)chance+=.03*traitValue(this.profile,'matchup');
    if(this.remaining>1&&health<.45&&danger>=2)chance+=.035*traitValue(this.profile,'preserve');
    if(counter&&mismatch)chance+=.19;
    if(!counter)chance*=health<.24?.55:.16;
    return 1-limit(chance,0,counter?.76:.28);
  }
  preference(move,battle){
    const primary=planPreference(move,battle,this.side,this.plan);
    if(!this.secondaryPlan)return primary;
    const alternate=planPreference(move,battle,this.side,this.secondaryPlan);
    return primary*(1-this.adviceWeight)+alternate*this.adviceWeight;
  }
  contextualBonus(move,battle){
    if(!move?.exists||this.remaining<=1)return 0;
    const own=battle?.[this.side]?.active?.[0];
    if(!own)return 0;
    const hp=own.hp/Math.max(1,own.maxhp);
    const conservation=Math.max(0,(this.profile.preservation-10)*.8+(this.remaining-1)*2+
      5*traitValue(this.profile,'preserve'));
    if(move.heal&&hp<.65)return conservation+6;
    if(move.drain&&hp<.60)return conservation;
    if(move.selfdestruct||move.id==='explosion'||move.id==='selfdestruct')return -conservation*3;
    // Low remaining PP matters across KOF challengers. This is a tie-break,
    // never a substitute for a clear knockout or Showdown's PP accounting.
    const slot=own.moveSlots?.find(entry=>entry.id===move.id);
    if(this.profile.preservation>=14&&slot&&slot.pp<=2&&slot.maxpp>=5&&
      move.category!=='Status'&&move.basePower>=70&&traitValue(this.profile,'pp')>0){
      return -Math.min(8,conservation*.8)*traitValue(this.profile,'pp');
    }
    return 0;
  }
  chooseMove(active,moves){
    // Evaluate the exact enhanced command that will be sent to the live engine.
    const request=this.request?.active?.[0];
    const flag=request?.canMegaEvo?'mega':request?.canDynamax?'dynamax':request?.canTerastallize?'terastallize':null;
    if(flag)moves=moves.map(entry=>({...entry,choice:entry.choice+' '+flag,
      ...(flag==='dynamax'?{move:{...entry.move,move:request.maxMoves?.maxMoves?.[Number(entry.choice.split(' ')[1])-1]?.move||entry.move?.move}}:{})}));
    this.decisions.moves++;
    if(!moves.length)return super.chooseMove(active,moves);
    const battle=this.battleProvider?.();
    const {ownTypes,foeTypes}=this.matchup();
    const own=battle?.[this.side]?.active?.[0],foe=battle?.[this.side==='p1'?'p2':'p1']?.active?.[0];
    const fraction=mon=>mon?.maxhp>0?limit(mon.hp/mon.maxhp,0,1):1;
    const context={foeTypes,ownTypes,ownAbility:this.ownActive?.ability,ownItem:this.ownActive?.item,
      ownHpFraction:fraction(own),foeHpFraction:fraction(foe),
      foeStatus:foe?.status||this.foeStatus||'',foeVolatiles:foe?.volatiles||{},
      ownBoosts:own?.boosts||{},
      foeSideConditions:battle?.[this.side==='p1'?'p2':'p1']?.sideConditions||{}};
    const battleSlots=battle?.[this.side]?.active?.[0]?.moveSlots||[];
    // A wasted burn/poison/sleep/paralysis on an already afflicted target must
    // not re-enter the decision through rollout, personality, or novice randomness.
    const eligible=moves.filter(entry=>{
      const slot=Number(entry.choice?.match(/^move ([1-4])/)?.[1])-1;
      const move=Dex.moves.get(battleSlots[slot]?.id||entry.move?.id||entry.move?.move||entry.move||'');
      return !wastedStatusMove(move,{status:context.foeStatus,types:foeTypes,
        volatiles:context.foeVolatiles});
    });
    if(eligible.length&&eligible.length<moves.length)moves=eligible;
    const legalMoveData=moves.map(entry=>{
      const slotNumber=Number(entry.choice?.match(/^move ([1-4])/)?.[1])-1;
      return Dex.moves.get(battleSlots[slotNumber]?.id||entry.move?.id||entry.move?.move||entry.move||'');
    }).filter(move=>move.exists);
    const analysisHabit=Math.min(100,Math.max(0,Number(this.profile.habitScores?.analysis)||0));
    const meetingBoost=this.profile.behaviorAdvice==='analysis'?
      1.5*(this.profile.behaviorWeight||0):0;
    const insight=(this.profile.traits?.includes('전황 분석가')?2:0)+
      analysisHabit/35+meetingBoost;
    const clarity=limit((this.profile.analysis+insight)/20,0,1);
    // Positive analysis experience raises the chance the trainer will choose
    // deliberate tactical reasoning again without another coach instruction.
    const understands=this.prng.random()<
      limit((this.skill.tactics+analysisHabit/25+meetingBoost)/20,.05,.98);
    if(!understands){
      // Weaker trainers sometimes pick the second-best viable action, not a
      // random immune attack or a completely wasted status move.
      const ranked=moves.map((entry,i)=>{
        const move=Dex.moves.get(entry.move?.id||entry.move?.move||entry.move||'');
        return {entry,i,value:evaluateMove(entry,context)+this.preference(move,battle)};
      }).sort((x,y)=>y.value-x.value||x.i-y.i);
      const best=ranked[0]?.value??0,tolerance=Math.max(8,(21-this.skill.tactics)*4);
      const viable=ranked.filter(x=>x.value>=Math.max(1,best*.43)&&best-x.value<=tolerance);
      const pool=viable.length?viable:ranked.slice(0,1);
      const selected=pool[Math.min(pool.length-1,Math.floor(this.prng.random()*pool.length))];
      const choice=selected?.entry.choice||super.chooseMove(active,moves);
      this.record('move',choice,'판단 실패 · 비슷한 선택지 중 선택');
      return choice;
    }
    // The high-analysis trainer evaluates legal Showdown turn rollouts first.
    if(battle?.requestState==='move'&&battle[this.side]?.active?.[0]?.hp&&clarity>=.40){
      try{
        const choices=moves.map(x=>x.choice).filter(x=>/^move [1-4](?:$|\s)/.test(x));
        const {depth,samples}=searchBudget(this.profile.analysis);
        const ranked=rolloutActions(battle,{
          sideId:this.side,choices,depth,samples:Math.min(samples+(insight?1:0),4),
        });
        for(const candidate of ranked){
          const index=Number(candidate.choice.split(' ')[1])-1;
          const move=Dex.moves.get(battle[this.side].active[0].moveSlots[index]?.id);
          const effects=assessMoveTraits({move,battle,side:this.side,profile:this.profile,
            remaining:this.remaining,options:legalMoveData,forecast:candidate});
          candidate.traitEvidence=effects.quality;
          candidate.score+=this.preference(move,battle)+this.contextualBonus(move,battle)+effects.bonus;
        }
        ranked.sort((a,b)=>b.score-a.score||a.choice.localeCompare(b.choice));
        if(ranked[0]?.runs>0&&Number.isFinite(ranked[0].score)){
          this.decisions.rollouts++;
          const gap=ranked[1]?.runs>0?ranked[0].score-ranked[1].score:0;
          const own=battle[this.side].active[0],slot=Number(ranked[0].choice.split(' ')[1])-1;
          const chosen=Dex.moves.get(own.moveSlots?.[slot]?.id);
          const restore=(chosen.heal||chosen.drain)&&own.maxhp>0&&own.hp/own.maxhp<.66;
          const preserveCandidate=this.remaining>1&&Boolean(restore);
          this.record('move',ranked[0].choice,
            this.profile.preservation>=14&&this.remaining>1?'전황 분석·연승 전력 관리':'전황 분석·실전 시뮬레이션',
            {plan:this.plan,advantage:Number(ranked[0].score.toFixed(1)),
             quality:{...ranked[0].traitEvidence,
               analysis:ranked[0].runs>=2&&ranked[1]?.runs>=2&&gap>=8,
               analysisGap:Number(gap.toFixed(1)),preserve:preserveCandidate,
               preserveMove:preserveCandidate?chosen.id:null,
               koRate:Number((ranked[0].koRate||0).toFixed(2))}});
          
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
      const trait=assessMoveTraits({move,battle,side:this.side,profile:this.profile,
        remaining:this.remaining,options:legalMoveData});
      const lean=move.exists?(this.plan==='tempo'&&move.priority>0?13:
        this.plan==='control'&&move.category==='Status'?26:
        this.plan==='offense'&&move.category!=='Status'?5:
        this.plan==='endurance'&&move.heal?12:0):0;
      return {entry,i,quality:trait.quality,value:value+preference+bonus+lean+trait.bonus};
    }).sort((a,b)=>b.value-a.value||a.i-b.i);
    if(rankings[0]?.value>0){
      const choice=rankings[0].entry.choice;
      const chosen=rankings[0].entry.move;
      const move=Dex.moves.get(chosen?.id||chosen?.move||chosen||'');
      const own=battle?.[this.side]?.active?.[0];
      const preserve=this.remaining>1&&own?.maxhp>0&&own.hp/own.maxhp<.66&&Boolean(move.heal||move.drain);
      this.record('move',choice,'선플·상성·전술 우선순위',
        {plan:this.plan,quality:{...rankings[0].quality,analysis:false,preserve,
          preserveMove:preserve?move.id:null}});
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
      const ownTypes=this.battleProvider?.()?.[this.side]?.active?.[0]?.getTypes?.()||
        this.matchup().ownTypes;
      const currentThreat=foeTypes.length&&ownTypes.length?
        Math.max(...foeTypes.map(type=>typeMultiplier(type,ownTypes))):1;
      const state=this.battleProvider?.()?.[this.side]?.sideConditions||{};
      const rock=state.stealthrock?.layers?
        .125*typeMultiplier('Rock',species.types):0;
      const spikes=state.spikes?.layers&& !species.types.includes('Flying')?
        Math.min(.25,(Number(state.spikes.layers)||1)*.0834):0;
      const traits=switchTraitBonus(this.profile,{currentThreat,nextThreat:threat,
        health,offense:attack,hazards:rock+spikes});
      const candidate=this.team.find(mon=>mon.name===entry.pokemon.ident?.split(': ').slice(1).join(': '));
      const fatiguePenalty=Math.max(0,Math.min(100,Number(candidate?.fatigue)||0))*.08;
      const ownMoves=this.candidateScore(entry.pokemon,entry.slot,foeTypes,rock+spikes);
      const score=-fatiguePenalty+(threat===0?32:30/(Math.max(.25,threat)))+
        (attack===0?0:Math.min(4,attack)*8)+health*(preserve?34:20)+
        ownMoves*.42+traits.bonus;
      return {entry,i,score,quality:traits.quality};
    }).sort((a,b)=>b.score-a.score||a.i-b.i);
    // Weaker evaluators are allowed to be less precise, but never pick an invalid slot.
    const uncertainty=(20-this.profile.switchSkill)/20;
    const index=scored.length>1&&this.prng.random()<uncertainty*.35?1:0;
    const selected=scored[index]||scored[0];
    const best=selected?.entry||switches[0];
    const activePokemon=this.battleProvider?.()?.[this.side]?.active?.[0];
    const ownTypes=activePokemon?.getTypes?.()||this.matchup().ownTypes;
    const currentThreat=foeTypes.length&&ownTypes.length?
      Math.max(...foeTypes.map(t=>typeMultiplier(t,ownTypes))):1;
    const candidateSpecies=Dex.species.get(best.pokemon.details?.split(',')[0]||
      best.pokemon.ident?.split(': ')[1]||'');
    const nextThreat=foeTypes.length&&candidateSpecies.exists?
      Math.max(...foeTypes.map(t=>typeMultiplier(t,candidateSpecies.types))):1;
    const n=Number.parseInt(best.pokemon.condition||'',10);
    const d=Number.parseInt((best.pokemon.condition||'').split('/')[1]||'',10);
    const nextHP=Number.isFinite(n)&&Number.isFinite(d)&&d>0?n/d:1;
    const validQuality=active!==undefined&&foeTypes.length>0&&ownTypes.length>0&&
      currentThreat>=2&&nextThreat<currentThreat&&nextHP>.25;
    const endangered=activePokemon?.maxhp>0&&activePokemon.hp/activePokemon.maxhp<.45;
    this.record('switch',String(best.slot),active===undefined?'기절 교체 · 잔존 전력 평가':
      '불리한 상성·HP 위험에 따른 자율 교체',
      {plan:this.plan,quality:{switch:validQuality,
        matchup:validQuality&&Boolean(selected?.quality?.matchup),
        preserve:validQuality&&this.remaining>1&&endangered,
        currentThreat,nextThreat}});
    
    return best.slot;
  }
}
