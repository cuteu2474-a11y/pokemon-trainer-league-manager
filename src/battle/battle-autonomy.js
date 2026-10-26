/** Trainer identity and manager guidance. Decisions are stable for one match. */
export const BATTLE_STYLES=Object.freeze({
  balanced:'균형',offense:'공세',control:'견제',endurance:'유지력',tempo:'속공',
});
const valid=plan=>Object.hasOwn(BATTLE_STYLES,plan);
const clamp=(value,min,max)=>Math.max(min,Math.min(max,value));
const skill=(value,defaultValue=10)=>{
  const parsed=Number(value);
  return Number.isFinite(parsed)?clamp(Math.round(parsed),1,20):defaultValue;
};
const preferredWords={offense:/공격|화력|강화기/,control:/상태이상|견제|교체/,endurance:/장기전|회복|에이스 보존|지구력/,tempo:/속공|선공|우선도/,balanced:/균형/};
export function trainerPersonality(trainer={}){
  const ai=trainer.autonomyAI||{};
  let preferred=ai.preferredPlay||trainer.preferredPlay;
  const words=Array.isArray(trainer.preferredPlays)?trainer.preferredPlays.join(' '):String(trainer.preferredPlays||'');
  if(!valid(preferred))preferred=Object.keys(preferredWords).find(x=>preferredWords[x].test(words));
  if(!valid(preferred))preferred=valid(trainer.battlePlan)?trainer.battlePlan:null;
  if(!valid(preferred))preferred=(trainer.switching??10)>(trainer.tactics??10)+3?'control':
    (trainer.tactics??10)>(trainer.switching??10)+3?'offense':'balanced';
  const traits=Array.isArray(ai.playTraits)?ai.playTraits.filter(x=>['적극적인 교체','에이스 보존','전황 분석가'].includes(x)):[];
  const habitScores=Object.fromEntries(['switch','preserve','analysis'].map(key=>[
    key,clamp(Number(ai.habitScores?.[key])||0,0,100)
  ]));
  const advised=String(trainer.directorBehaviorAdvice||'');
  const behaviorAdvice=['switch','preserve','analysis'].includes(advised)?advised:null;
  return {preferred,traits,habitScores,behaviorAdvice,openness:skill(ai.openness),conviction:skill(ai.conviction),
    moveSkill:skill(trainer.moveJudgment??trainer.movesSkill??trainer.tactics),
    switchSkill:skill(trainer.switchJudgment??trainer.switching),
    analysis:skill(trainer.battleAnalysis??trainer.analysis??trainer.tactics),
    preservation:skill(trainer.resourceManagement??trainer.management??trainer.switching)};
}

/** A pre-match suggestion affects one match's choices; it does not award traits. */
export function resolveBehaviorAdvice(personality,trust=50){
  const target=personality.behaviorAdvice;
  if(!target)return {behaviorAdvice:null,behaviorResponse:'자율',behaviorWeight:0,
    behaviorReason:'감독의 특정 행동 권고 없음'};
  const affinity=target==='switch'?['control','tempo'].includes(personality.preferred):
    target==='preserve'?['endurance','balanced'].includes(personality.preferred):
    ['control','balanced'].includes(personality.preferred);
  const confidence=personality.openness*1.5+trust*.2-
    personality.conviction*.95+personality.analysis*.3+(affinity?9:-5);
  if(confidence>=27)return {behaviorAdvice:target,behaviorResponse:'수용',behaviorWeight:1,
    behaviorReason:'감독과 상의한 플레이 방식을 실제 상황에서 검토하기로 함'};
  if(confidence>=14)return {behaviorAdvice:target,behaviorResponse:'절충',behaviorWeight:.45,
    behaviorReason:'자신의 전술을 유지하며 적절한 상황에서만 감독 제안을 검토'};
  return {behaviorAdvice:target,behaviorResponse:'거부',behaviorWeight:0,
    behaviorReason:'개인적인 판단을 우선해 감독의 행동 권고를 따르지 않음'};
}

/** Allows acceptance, compromise or refusal; no roll is required or manager command applied unconditionally. */
export function resolveBattleAutonomy(trainer={},relationship=50){
  const personality=trainerPersonality(trainer);
  const requested=valid(trainer.directorAdvice)?trainer.directorAdvice:null;
  const trust=clamp(Number.isFinite(Number(relationship))?Number(relationship):50,15,85);
  const {preferred,openness,conviction}=personality;
  const behavior=resolveBehaviorAdvice(personality,trust);
  const base={...personality,...behavior,requested,preferred,trust,plan:preferred,
    secondaryPlan:null,adviceWeight:0,response:'자율',reason:'트레이너의 선호 전술에 따라 자율적으로 경기 운영'};
  if(!requested)return base;
  const aligned=requested===preferred;
  const related=requested==='balanced'||preferred==='balanced';
  const confidence=openness*1.6+trust*.20+personality.analysis*.25-conviction+
    (aligned?20:related?6:-8);
  if(confidence>=34)return {...base,plan:requested,response:'수용',adviceWeight:1,
    reason:aligned?'감독의 권고와 본인 선플이 일치':'감독 신뢰 및 상황 분석에 따라 권고 수용'};
  if(confidence>=22)return {...base,secondaryPlan:requested,adviceWeight:.38,response:'절충',
    reason:'본인 선플을 유지하면서 감독의 전술적 요구를 일부 반영'};
  return {...base,response:'거부',reason:'전황에 대한 독자적 판단과 선플을 우선'};
}
/** Apply this once, when the confirmed KOF match is persisted, not during simulation. */
export function relationshipAfterMatch({trust=50,response='자율',won=false}={}){
  const start=clamp(Number(trust)||50,15,85);
  if(response==='자율')return start;
  const change=response==='수용'?(won?2:-1):
    response==='절충'?(won?1:0):
    won?2:-2;
  return clamp(start+change,15,85);
}
