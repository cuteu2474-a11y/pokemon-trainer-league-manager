# 레벨 없는 CA/PA — 코드와 저장 구조

갱신일: 2026년 10월 27일

전투 공식·초기 개체 분포·성장 상한 등 게임 규칙은 [개발 작업 목록 4-7](DEVELOPMENT_TODO.md#4-7-탐색개체-감별과-초기-capa)에서 관리합니다. 이 문서는 현재 구현과 저장 필드를 설명합니다.

## 데이터 구조

`statCA`와 `statPA`는 각각 `hp/atk/def/spa/spd/spe` 여섯 값을 가집니다. 각 값은 1~200 정수이며 같은 능력치에서 CA≤PA여야 합니다.

PA는 성장 상한입니다. 전투 계산은 현재 CA를 사용합니다. 평균 CA·PA 표시는 비교용 요약이며 별도의 전투력이나 포켓몬 레벨이 아닙니다.

## 코드의 역할

| 코드 | 처리 |
| --- | --- |
| [stat-potential.js](../src/core/stat-potential.js) | 값 검증, 기존 저장 변환, 개별 성장, 전투 스탯 계산 |
| [level-free-damage.js](../src/battle/level-free-damage.js) | 일반 피해·혼란·나이트헤드·지구던지기·사이코웨이브 처리 |
| [gp-battle-stream.js](../src/battle/gp-battle-stream.js) | 포장 시 레벨 제외, 계산 규칙과 실제 스탯 연결 |
| [showdown-rollout.js](../src/battle/showdown-rollout.js) | AI 가상 전투에도 같은 피해 규칙 설치 |
| [ability-ui.js](../assets/ability-ui.js) | 개별 CA/PA 표시와 운영 저장 이전 |
| [pokemon-expedition.js](../assets/pokemon-expedition.js) | 새 포획 개체에 개별 CA/PA 생성 |

## 기존 저장 이전

- 종합 `ca/pa/power/gp`만 있는 개체는 결정적인 해시와 기존 값을 사용해 6쌍의 CA/PA로 이전합니다. 경기용 난수 상태를 소비하지 않습니다.
- 이미 개별 CA/PA가 있으면 다시 추첨하지 않고 값의 유효성을 확인합니다.
- 운영 UI는 기존 `level/ca/pa/gp`를 정리합니다. 레거시 구단 계산이 읽는 `power`는 평균 CA의 호환 캐시로 남습니다.
- 현재 변환 해시는 종 이름 등을 사용합니다. 이름이 같은 개체를 장기적으로 구분할 고유 ID와 저장 버전 처리는 추가 연결이 필요합니다.
- 일부 주간 훈련의 `power` 증가는 개별 CA 성장으로 바꾸는 호환 처리가 있습니다. 자율 훈련·시장 평가까지 통합 완료된 것은 아닙니다.

## 레벨 제거의 범위

리그가 개별 포켓몬 레벨을 입력하지 않고, 실제 전투 스탯과 핵심 피해 공식에서도 사용하지 않습니다. Showdown 내부에는 호환용 기본 레벨 메타데이터가 남아 있습니다.

일격기와 셸암즈 등 특수 콜백의 레벨 참조를 모두 제거한 완전한 패키지 포크는 아닙니다. 해당 수정 기준은 [특수 기술 규칙](DEVELOPMENT_TODO.md#4-5-레벨-없는-기술진화)에 있습니다.

검사 범위는 [Showdown 연동](SHOWDOWN_INTEGRATION.md#검증)을 참고합니다. 초기 분포·대규모 시즌 밸런스는 규칙 결정과 실제 검증을 구분합니다.
