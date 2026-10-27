# Showdown 연동

갱신일: 2026년 10월 27일

현재 전투 코드의 구조와 검증 범위를 설명합니다. 앞으로 적용할 대회 규칙은 [개발 작업 목록](DEVELOPMENT_TODO.md#4-확정-규칙과-구현-기준)에 있습니다.

## 구성

시뮬레이터는 `@pkmn/sim@0.10.11`입니다. [상위 프로젝트](https://github.com/pkmn/ps)의 기술·타입·특성·도구·상태 처리를 사용하고, 리그 전용 능력치와 피해 계산을 전투 인스턴스에 연결합니다.

| 코드 | 담당 |
| --- | --- |
| [match-service.js](../src/web/match-service.js) | 웹 선수단 변환, 경기 실행, 관전·상성·활약 데이터 반환 |
| [gp-battle-stream.js](../src/battle/gp-battle-stream.js) | 팀 포장, 시작 전 능력치 주입, 폼 변경, HP·PP·상태 인계 |
| [level-free-damage.js](../src/battle/level-free-damage.js) | 레벨 없는 피해·혼란·일부 고정 피해 |
| [trainer-ai.js](../src/battle/trainer-ai.js) | 기술·교체 선택 |
| [showdown-rollout.js](../src/battle/showdown-rollout.js) | 실제 전투와 분리한 가상 전투 탐색 |
| [showdown.js](../src/battle/showdown.js) | 자동 6대6 실행과 로그·최종 상태 |
| [club-match.js](../src/battle/club-match.js) | 5인 연승 순서와 생존 개체 회복 |
| [replay-report.js](../src/battle/replay-report.js) | 실제 기록의 직접 피해·격파 집계 |

형식은 현재 `gen9customgame` 6대6 싱글입니다. 다른 세대·포맷을 지원한다고 간주하지 않습니다.

## 웹 API

| 경로 | 역할 |
| --- | --- |
| [POST /api/match](../api/match.js) | 실제 우리 구단 경기 |
| [POST /api/opponent-scout](../api/opponent-scout.js) | 상대 분석과 출전 순서 근사 추천 |
| [POST /api/trainer-moves](../api/trainer-moves.js) | 주간 기술 편성과 연구 |

[로컬 서버](../scripts/serve.mjs)는 위 세 API를 같은 핸들러로 연결합니다. 배포 성공·실제 응답 확인은 별도 검증합니다.

공식 경기 API는 준비 화면에서 생성한 출전 확정 정보가 필요합니다. 선수단 사본과 경기 ID·입력 식별값·규정·엔진 버전을 검사하고 결과에 같은 식별값을 반환합니다. 현재 구현 규정의 버전은 `relay-implemented-20261027`이며, 개발 목록의 `league-v1` 전체 구현 완료를 뜻하지 않습니다. 직접 엔진을 호출하는 검사·리그 모듈과 공식 경기 API의 등록 절차는 구분합니다.

## 현재 경계

- 우리 구단 경기만 웹에서 실제 전투를 사용합니다. 다른 구단의 19경기는 간이 계산입니다.
- [별도 리그 엔진](../src/league/season.js)에 실제 전투 어댑터가 있어도 웹 전체 시즌이 그 경로를 사용한다는 뜻은 아닙니다.
- 일부 특수 기술에 남은 내부 레벨 참조와 폼·소모 도구·상태 내부값의 장기 인계는 추가 작업입니다.
- 기존 상대 비교는 같은 순번 대면 중심의 근사 점수입니다. 사용자 요청으로 출전 순서 추천의 추가 개발은 제외했습니다.
- 가상 전투는 로그 배열을 포함한 상태를 독립 복제하고 레벨 없는 피해 처리를 설치합니다. 상대 미공개 정보·난수 접근 범위와 폼 변경 후킹의 일치 여부는 별도 검증 대상입니다.

## 검증

```bash
npm ci
npm run check:web
npm test
```

| 범위 | 확인할 검사 |
| --- | --- |
| 능력치·레벨 제거 | [level-free-stats.test.js](../tests/level-free-stats.test.js), [gp-adapter.test.js](../tests/gp-adapter.test.js) |
| 실제 6대6·연승전 | [sim.test.js](../tests/sim.test.js), [club-match.test.js](../tests/club-match.test.js), [live-move-state.test.js](../tests/live-move-state.test.js) |
| 가상 전투·AI | [showdown-rollout.test.js](../tests/showdown-rollout.test.js), [seven-traits.test.js](../tests/seven-traits.test.js) |
| 웹 경기 API | [web-match.test.js](../tests/web-match.test.js) |
| 리그 일정·승강 | [league-season.test.js](../tests/league-season.test.js) |
| 생성 구단의 실제 경기 연결 | [real-league-integration.test.js](../tests/real-league-integration.test.js) |

리그 일정 검사의 360경기와 실제 전투 360경기 검증을 구분합니다. 브라우저 통합 평가는 새 게임부터 두 번째 경기까지, 장기 검증은 실제 시즌·다년 운영으로 나눠 기록합니다.

이번 변경에서는 웹 스크립트 검사와 시장·주간 진행·경기 성장·선플 관련 검사만 실행했습니다. 전체 검사와 시즌 완주 결과로 확대해 해석하지 않습니다.
