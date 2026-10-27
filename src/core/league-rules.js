/** Implemented rules only. Remaining league-v1 features stay in DEVELOPMENT_TODO. */
export const LEAGUE_RULES=Object.freeze({
 version:'relay-specialty-v4-20261027',maxTurns:300,maxDuels:9,relayRecovery:0.1,
 draw:'both-eliminated',points:Object.freeze({win:3,draw:1,loss:0}),
 descriptions:Object.freeze([
  '주자 대결은 최대 300턴입니다. 마지막 턴을 모두 마치면 양쪽 주자가 탈락합니다.',
  '엔진 무승부도 양쪽 주자 탈락으로 처리하고, 양 구단에 주자 격파 1점씩 기록합니다.',
  '양쪽의 마지막 주자가 동시에 탈락하면 5:5 무승부입니다.',
  '승자는 기절·HP·PP·일반 상태·남은 수면·현재 도구를 이어받습니다. 생존 포켓몬만 최대 HP의 10%를 회복합니다.',
  '맹독 단계·능력치 랭크·날씨·설치기·대타출동·일시 변신은 새 대결에서 초기화합니다. 소모된 탈·아이스페이스는 원본 복원 조건을 따라 유지합니다.',
  '메가진화·Z기술·다이맥스·테라스탈은 등록한 방식·대상으로 주자당 단체전 전체 1회입니다. 다이맥스는 대결이 끝나면 해제하고, 생존 메가·테라는 이어집니다.',
  '원래 등록한 6마리가 같은 타입을 공유하면 공격·방어·특공·특방에 5%를 한 번 적용합니다. HP·스피드는 바뀌지 않고, 변신은 상대의 실제 스탯을 그대로 복사합니다.',
  '통신·계산 실패는 패배가 아닙니다. 같은 확정 선수단과 시드로 재시도합니다.'
 ])
});
export function installLeagueRules(battle,{maxTurns=battle.leagueRules?.maxTurns??LEAGUE_RULES.maxTurns}={}){
 if(!Number.isInteger(maxTurns)||maxTurns<1||maxTurns>LEAGUE_RULES.maxTurns)throw new RangeError('턴 제한은 1~300턴입니다.');
 battle.leagueRules={version:LEAGUE_RULES.version,maxTurns};
 if(battle.__leagueRulesInstalled)return battle;
 Object.defineProperty(battle,'__leagueRulesInstalled',{value:true});
 const endTurn=battle.endTurn;
 battle.endTurn=function(...args){
  // endTurn is called after both actions, residual effects and forced switches.
  // A natural winner has already ended the battle and must never be overwritten.
  if(!this.ended&&this.turn>=this.leagueRules.maxTurns){
   this.leagueEndReason='turn-limit';this.add('message',this.leagueRules.maxTurns+'턴 종료 · 양쪽 주자 탈락');
   this.tie();return;
  }
  return endTurn.apply(this,args);
 };
 return battle;
}
