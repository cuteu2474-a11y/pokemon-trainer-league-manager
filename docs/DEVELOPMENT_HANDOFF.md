# 포켓몬: 펜타 라이벌즈 — 개발 인수인계

**기준:** 2026-10-28 (KST)  
**확인한 원본 코드:** main / 1c19913914efff1a09f9433503b16744ef5fed79  
**GitHub:** https://github.com/cuteu2474-a11y/pokemon-trainer-league-manager  
**게임 배포:** https://pokemon-trainer-league-manager.vercel.app

이 문서는 **새 담당자가 먼저 읽을 현재 상황과 다음 조치**를 기록한다. 상세 확정 규칙과 이전 작업 체크리스트는 [DEVELOPMENT_TODO.md](DEVELOPMENT_TODO.md), 전투 기술 설명은 [SHOWDOWN_INTEGRATION.md](SHOWDOWN_INTEGRATION.md), 외부 AI 조사 결과는 [TRAINER_AI_EXTERNAL_REFERENCES.md](TRAINER_AI_EXTERNAL_REFERENCES.md)를 참조한다. 오래된 문서의 통과 테스트 개수나 오래된 커밋은 현재 상태를 증명하지 않는다.

## 1. 프로젝트 목적과 사용자 확정 의도

- **공식 게임명:** 포켓몬: 펜타 라이벌즈 (Pokémon: Penta Rivals). 기존 확정 게임 타이틀 로고, 각 구단 엠블럼을 동의 없이 재설계하지 말 것.
- **장르:** FM 스타일 트레이너 구단 감독 싱글플레이. 4개 디비전 × 10구단, 18라운드, 승강. 사용자는 구단 운영, 스카우트/영입/육성, 경기 전 미팅과 **트레이너 5명 출전 순서**를 직접 결정.
- **반드시 구별:** **AI 감독**은 상대 구단을 운영하는 컴퓨터 감독이고, **트레이너 AI**는 사용자·상대 구단에 소속된 주자 각각이 자기 포켓몬 6마리를 싸우게 하는 판단 시스템. **사용자가 개선하라고 한 대상은 트레이너 AI**. 전투 중 포켓몬을 사용자가 직접 조종하는 게임이 아님.
- **현재 최우선 목표:** 트레이너 AI의 **6마리 선출, 기술 선택, 불필요한 상태이상 회피, 자율 교체, 상대 행동 예측, 에이스와 PP 보존**. 최고 수준(기술/교체/분석 능력 20)은 불필요한 랜덤 실수를 피하고 공개된 정보에서 가장 타당한 행동을 선택해야 하나, 숨겨진 상대 기술·확률 난수까지 아는 완전한 전지적 AI로 만들거나 완전한 최적 행동을 보장한다고 주장하지 말 것.
- **트레이너 자율성:** 감독 전술·행동 권고는 수용/절충/거부 가능. 경기 중 권고를 명령으로 바꾸지 말 것. 사용자는 출전 순서 **추천 기능을 제외**해 달라고 했음. 감독이 직접 확정하는 규칙 유지.
- **전투 규칙 유지:** 트레이너 5v5의 킹오파식 연승전, 주자당 포켓몬 6마리, 승자 팀 HP 10% 회복 및 남은 HP/PP/상태/소모 자원 인계. 레벨 대신 6종 능력별 CA/PA와 GP 어댑터 사용. Showdown 실제 피해 계산·강화·폼/변신·합법 기술 규칙을 AI 개선을 위해 임의 변경하지 말 것.
- **UI:** FM형 인간 친화 메뉴. 뉴스와 SNS 탭은 실제 게임 이벤트(취임/경질/이적/은퇴/경기) 기반. 오른쪽 비서 업무함(필수/권장/소식·미루기·고정·훈련 편성)을 유지하며 미확인 사건을 사실로 창작하지 말 것. 사용자에게 내부 코드 이름을 그대로 표시하지 말 것.
- **개발 방식:** GitHub **main만** 사용, 새 브랜치나 불필요한 워크플로/Actions 반복 실행 금지. 변경 사항을 기능별로 묶어 구현하고 한 번에 검사. 불필요한 임시 파일과 문서 중복을 늘리지 말 것.

## 2. 실제 저장소에 있는 기능 (구현 코드와 플레이 검증은 다름)

| 영역 | 구현/연결 현황 | 핵심 파일 |
| --- | --- | --- |
| 게임 진행 | 새 게임·구단 취임·감독실, 선수단/영입/육성·탐색·계약/재정·리그 화면 | README.md, assets/matchday.js, assets/penta-office-layout.js |
| 전투 | 사용자 구단 경기 Showdown 6v6 전투를 5인 연승으로 연결, 관전/결과 정산 경로 존재 | src/battle/showdown.js, club-match.js, relay-state.js, api/match.js |
| 능력치 | 레벨 없는 수치·GP 유닛·실제 Showdown 피해 공식, 폼/강화 인계 코드 | src/battle/gp-battle-stream.js, level-free-damage.js, enhancement.js |
| 트레이너 판단 | AI 트레이너 기술/회복/상태/상성·교체, 공개 종에 따른 선발, 교체 입장 시 함정 피해 고려 | src/battle/trainer-ai.js, tactical-search.js, trait-decision.js |
| 탐색 | 복제 Showdown 턴 탐색, 공개된 상대 기술만 탐색 응답으로 쓰는 제한, 대응별 평균/최악 값 혼합 | src/battle/showdown-rollout.js |
| 상대 AI 감독 | 경기 전 상대 5명 출전 순서의 조합 비교와 전술 권고 | src/scouting/opponent-report.js, api/opponent-scout.js |
| 비서/뉴스 | 뉴스·SNS, 필수/권장/소식, 읽음, 미루기, 고정, 주간 브리핑·훈련 설정 | assets/penta-news-data.js, penta-secretary-inbox.js, penta-secretary-tasks.js |

**중요:** README 기준 상대 AI 구단끼리의 나머지 **라운드당 19경기는 간이 계산**이다. 40개 구단의 모든 경기를 실전 Showdown 시뮬레이션으로 처리하는 상태가 아니다.

## 3. 최근 변경의 정확한 기준점

| 커밋 | 반영 내용 |
| --- | --- |
| [1c19913](https://github.com/cuteu2474-a11y/pokemon-trainer-league-manager/commit/1c19913914efff1a09f9433503b16744ef5fed79) | 최신 인수인계 전 코드. 숨겨진 상대 기술 탐색 경로 제한 및 입장 함정으로 즉사하는 교체 후보 회피 |
| [6f87907](https://github.com/cuteu2474-a11y/pokemon-trainer-league-manager/commit/6f87907132463b2a78db9b7047c1be49965ec46c) | 상대가 공개적으로 쓴 기술 기억, 대응별 점수 비교, 최상급 트레이너 교체 조건/반복 교체 억제 |
| [8a4750b](https://github.com/cuteu2474-a11y/pokemon-trainer-league-manager/commit/8a4750b6c3f630d34554954a85c9edbc76145d70) | 외부 AI 탐색 개념을 JS/Showdown 복제로 응용. 능력치 20의 불필요한 초보 판단 경로 생략 |
| [81038ae](https://github.com/cuteu2474-a11y/pokemon-trainer-league-manager/commit/81038aeb54f8299ad933663af0506f726d44aed5) | 선발·교체 및 중복 직접 상태이상 기술 억제 |
| [b1b3de6](https://github.com/cuteu2474-a11y/pokemon-trainer-league-manager/commit/b1b3de6322867e76b8d53beec5acef508f6055d1) | **AI 감독**의 경기 전 출전 준비 (트레이너 AI 능력 향상과 별개) |

외부 AI는 **통째로 설치한 상태가 아니다.** Poke Engine / Battle Engine(MIT)의 아이디어 일부를 기존 JavaScript Showdown 전투에 맞춰 재구현했다. Foul Play(GPL-3.0)는 참조만 했으며 가져오지 않았다. 향후 외부 코드 직접 복사 시 라이선스 의무 확인.

## 4. 다음 수정 우선순위

### P0. 정확한 검증 및 실제 플레이 (수정 전 현황 파악)

- [ ] 최신 main에서 npm ci, npm run check:web, npm test를 실행해 **실제** 통과/실패를 기록. 과거 테스트 58개·133개 등의 숫자를 최신 결과로 인용하지 말 것.
- [ ] PC/모바일 브라우저에서 **새 게임 → 구단 선택/감독 취임 → 감독실 → 주간 진행 → 경기 준비(순서/미팅) → 출전 확정 → 5인 연승 관전 → 정산 → 다음 경기**까지 실제 조작. 현재 이 인수인계 시점에 전체 브라우저 플레이 통과 **미확인**.
- [ ] API /api/match, /api/opponent-scout, /api/trainer-moves, Vercel 실행 로그/실패 요청, 두 탭 저장/중복 경기 정산, 경기 중 새로고침/재시도 확인.
- [ ] 게임 메뉴에서 뉴스/SNS와 비서의 오른쪽 레일, 모바일 터치 및 가로/세로 레이아웃을 실제 스크린샷으로 검증. 화면을 실행하지 않고 UI가 정상이라고 단정하지 말 것.

### P1. **트레이너 AI 지능 강화 — 사용자 최우선**

- [ ] 선출 포켓몬 6마리: 첫 선발이 Showdown teamPreview의 실제 합법 명령으로 반영되는지; 상대 공개 종/타입·자기 기술·HP/상태·앞으로 남은 주자를 반영하는지 확인.
- [ ] **공격 대 교체를 동일한 행동 후보로 비교**: 현재 일반 자발 교체가 RandomPlayerAI의 moveProbability 확률 게이트를 거친다. 공격/회복/상태/교체의 기대 가치 비교, 상대 위험, 기절/진입 함정/교체 후 생존/교체 연타 억제를 함께 설계.
- [ ] **상대 비공개 정보 누출 제거**: 현재 requirePublicChoices는 미공개 *기술 선택*을 제한하지만, 복제 전투 자체가 상대 아이템/능력치 같은 숨겨진 필드를 포함할 여지가 있음. 공개 정보만 제공하는 예측용 상태 또는 알 수 없는 상대 구성 샘플링 필요. 반대로 기술 미공개 시 위험 0으로 가정하지 말 것.
- [ ] **상태이상과 비효율 행동**: 마비가 걸린 상대에게 도깨비불 재사용, 타입 면역 기술, 풀HP 회복, +6 능력 재강화, 이미 걸린 하품/필드기, 상대가 이미 기절 직전인 경우까지 검사. 단, 열탕처럼 *공격 기술에 부가되는 상태이상*은 후보에서 지우지 말 것.
- [ ] 고능력치 트레이너의 판단은 가능한 결과의 기대 가치/상대 최악 대응을 비교. 낮은 능력치 AI는 분석 깊이·정밀도로 차이. 숨겨진 정답으로 이기는 AI나 무작위로 무의미한 기술을 고르는 AI 모두 피함.
- [ ] 에이스 보존·PP·10% 연승 회복과 전술 권고 수용/절충/거부의 실제 경기 장면까지 연결. 장기 속도·탐색 예산 측정.

### P2. 감독 게임 플레이와 운영의 완성도

- [ ] 실제 첫 2경기/1시즌 플레이하며, 뉴스·비서 업무와 구단 변화, 영입·계약·급여, 파견·기술 연구·주간 진행이 정상 연결되는지 확인.
- [ ] 경기 후 AI 행동·권고 실행·성장·신뢰의 실제 기록과 UI 설명을 대조. 결과 없는 긍정 피드백을 임의 생성하지 말 것.
- [ ] DEVELOPMENT_TODO.md의 미완료 체크박스(자동 진행 정확성, 화면 뒤로 가기, 일부 경기 결과 피드백 등)를 재현 후 우선순위 재조정. 검증 없이 완료 표시하지 말 것.

## 5. 반드시 남길 회귀 시나리오

| 상황 | 기대 행동 |
| --- | --- |
| 상대 마비, 내 기술에 도깨비불과 공격기 | 별도 화상 기술을 버리고 합법 공격 |
| 상대 마비, 열탕(공격+추가 화상 확률) | 공격기는 후보에 유지 |
| 땅 타입에 전기 상태기, 마비/화상/맹독 면역 | 헛사용 억제 |
| 내 HP 100%, 회복기와 공격기 | 이유 없는 회복 반복 억제 |
| 내 공격 상승 +6, 상승기와 공격기 | 가치 없는 강화 반복 억제 |
| 후보 교체 후 스텔스록/압정으로 바로 기절 | 생존 가능한 후보를 우선 |
| 공개한 상대 기술이 없거나 한 개만 존재 | 실제 공개하지 않은 기술을 관찰했다고 주장하지 않음 |
| 전술 판단 20과 1, 같은 대진/시드 | 20은 초보 판단 경로를 회피; 성능 차이는 대량 대전 수치로 검증 |
| 5명 연승 및 다음 경기 | 상태·HP·PP·10% 회복·결과 정산 일치 |
| 새로고침·저장·동시 탭·중복 결과 | 같은 경기 두 번 비용/성장 지급 금지 |

기존 AI와 변경 AI를 **동일한 전력·시드의 다수 경기**에서 비교해 승률, 잘못된 상태기 비율, 불필요한 교체율, 탐색 실패·폴백률, 처리 시간을 수치화할 것. 테스트를 실제로 실행하지 않고 승률 개선을 약속하거나 통과 수치를 만들지 말 것.

## 6. 이어서 개발하는 방법

터미널(저장소 전체가 준비된 환경)에서 다음 순서로 실행한다.

    git clone https://github.com/cuteu2474-a11y/pokemon-trainer-league-manager.git
    cd pokemon-trainer-league-manager
    npm ci
    npm run check:web
    npm test
    npm run dev

로컬 주소는 http://127.0.0.1:8000 . HTML 한 파일만 열면 전투 API가 없어 정상적인 게임 검증이 불가능.

트레이너 AI 집중 검사: **node --test tests/trainer-ai.test.js tests/tactical-search.test.js tests/showdown-rollout.test.js tests/live-rollout-ai.test.js tests/seven-traits.test.js tests/club-match.test.js tests/web-match.test.js**. 이는 실행할 **명령**이며, 인수인계 작성 시점에 방금 실행한 테스트가 아니다.

**확인한 상태(2026-10-28):** 커밋 1c19913에 대한 Vercel production 배포는 READY. 해당 커밋 GitHub Actions 실행 기록은 0건. READY는 배포 성공이지 모바일 정상 플레이, 실제 AI 승률 상승, 전체 테스트 통과를 보장하지 않는다.

**새 대화 시작 지침:** 저장소 main → 이 문서 → DEVELOPMENT_TODO.md → trainer-ai.js, showdown-rollout.js → 현재 테스트부터 확인. 다음 작업은 **트레이너 AI 공격/교체 통합 판단 + 비공개 정보 보호 + 실제 경기 회귀**를 묶어 진행. GitHub main에 커밋하고 실제 검증·배포 상태를 분리 보고한다.
