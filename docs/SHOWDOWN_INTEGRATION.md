# Showdown 전투 엔진 연동 상태

## 채택한 구조

- 시뮬레이터: `@pkmn/sim@0.10.11`, MIT 라이선스, https://github.com/pkmn/ps
- 우리 게임의 CA/PA/GP가 **유일한 능력치 결정 체계**입니다. 원작 IV/EV를 억지로 변환하지 않습니다.
- Showdown은 기술·상성·특성·상태이상·판정·피해량을 처리합니다.
- `src/battle/gp-battle-stream.js`: 첫 턴 전 GP 능력치 주입 + 폼체인지 시 GP로 재계산.
- `src/battle/gp-adapter.js`: 종족값, 레벨, 성격, GP에서 능력치 계산.
- `src/battle/showdown.js`: GP 데이터가 있는 양측 6마리의 자동 배틀과 결과/로그/초기 스탯 반환.
- `tests/sim.test.js`: GP가 다른 동일종 포켓몬을 사용한 실제 엔진 통합 테스트.

## 제한

- 배틀 엔진을 설치하지 못한 환경에서는 6대6 실제 실행 성공을 주장하지 않습니다.
- 현재는 `gen9customgame` 싱글만 지원합니다. `TrainerAI`가 기술·교체를 판단하고 Showdown 상태를 복제한 탐색을 사용합니다.
- `src/battle/club-match.js`에 5인 연승전, 경기 사이 HP/PP/상태 계승 및 생존 포켓몬 최대 HP 10% 회복이 구현되어 있습니다. 운영 화면은 `assets/matchday.js`와 `/api/match`를 통해 우리 구단의 실제 경기에 연결되어 있습니다. 영구적 폼변경의 장기 상태 저장은 남아 있습니다.
- 특수 전투 기술 및 폼변경 이벤트에서 숫자가 다시 덮어써지는 사례가 없는지 엔드투엔드 회귀 검증이 필요합니다.

## 테스트

```bash
npm ci
npm test
```

새 브랜치나 GitHub Actions 워크플로를 생성하지 않습니다.
