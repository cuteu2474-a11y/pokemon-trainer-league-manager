# GP → Showdown 전투 능력치 적용 (B안)

## 구조

1. 엔트리 포켓몬은 CA(1~200), PA(1~200), GP 6종, 종족, 레벨, 성격, 기술, 특성 등을 가집니다.
2. `packGPTeam`은 CA/PA/GP를 Showdown 팀 문자열에서 제거합니다. IV=31/EV=0은 패키징용 기본값이며 **실전 능력치로 사용하지 않습니다**.
3. `GPBattleStream`은 두 팀이 생성된 직후 실행되는 `Battle.start()`를 **해당 전투 인스턴스에서만** 가로챕니다. `super.start()` 호출 전에 `convertPokemon` → `injectBattleTeams`를 완료합니다.
4. 원작 `Pokemon.getStat()`이 참조하는 `storedStats`, `baseStoredStats`, `maxhp`, `baseMaxhp`, `speed`를 함께 적용합니다.
5. `Pokemon.setSpecies`에 인스턴스 단위 후킹을 적용하여, 폼변경/원래 종족 복귀 시 새로운 종족값에 같은 GP·레벨·성격을 적용합니다. **기존 피해량은 유지**합니다.
6. `Transform`은 Showdown 원작이 대상 `storedStats`를 복사하므로 그대로 둡니다. 대상 능력치는 이미 GP 기반입니다. 변신 시 HP는 복사하지 않습니다.

현재 대상 형식: `gen9customgame` 6대6 싱글. Gen1/2 및 원작의 모든 예외 동작을 검증하지 않았으므로 다른 포맷은 명시적으로 거절합니다.

## 실행

```bash
npm install
npm test
```

`tests/gp-adapter.test.js`: 실제 GP 계산·주입·폼체인지·HP·변신 숫자 테스트.

`tests/sim.test.js`: Showdown 패키지가 설치된 환경에서 GP가 매우 다른 두 팀의 6대6 자동 대전을 실행하여 **전투 시작 시 능력치가 올바르게 주입되었는지** 검증합니다.

## 검증 상태

2026-10-23: 로컬에서 GP 계산과 단위 후킹을 대상으로 한 테스트 6개가 통과했습니다(그중 후킹 1개는 **Showdown을 모사한 테스트 객체** 사용). 실제 `@pkmn/sim` 모듈을 npm에서 내려받지 못해 **실전 6대6 테스트는 실행 확인 전**입니다. 패키지를 설치할 수 있는 환경에서 `npm test`를 실행해야 합니다. 변신·폼변경 특수 상황의 원작 엔진 동작도 엔드투엔드 검증이 추가로 필요합니다.
