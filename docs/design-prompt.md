# moai 디자인 프롬프트

> v0 / Lovable / Figma Make / Claude 등에 그대로 붙여넣어 쓰는 프롬프트.
> 아래 **§1 메인 프롬프트**만 복사하면 되고, §2~4는 필요할 때 덧붙인다.

---

## 0. 먼저 — 디자인 방향 제안

이 제품의 성격을 세 가지로 정리하면 디자인이 자동으로 정해진다.

| 특성 | 디자인 함의 |
|---|---|
| **긴 폼을 12번 채워야 함** | 지루함이 최대 이탈 요인 → 진행률·자동저장·한 번에 하나씩 |
| **AI가 수 분간 글을 씀** | 빈 화면 = 불안 → 스트리밍 텍스트를 그대로 보여주는 게 최고의 로딩 UI |
| **결과물이 관공서 제출용 문서** | 신뢰감이 전부 → 장식 배제, 문서처럼 읽히는 타이포 |

그래서 톤은 **"차분한 전문성"** 이다.
다루는 주제(정부 서류)는 딱딱하지만, 도구 자체는 가볍고 부담 없어야 한다.

레퍼런스: Linear의 절제 + Notion의 문서 가독성 + 토스의 한글 폼 UX

---

## 1. 메인 프롬프트 (이것만 복사)

```
한국 창업자를 위한 AI 사업계획서 작성 서비스 "moai"의 웹 UI를 디자인해줘.

## 제품
아이디어를 입력하고 12개 질문에 답하면, AI가 정부지원사업 표준 양식(K-Startup
PSST)에 맞춘 사업계획서 초안을 7개 섹션으로 생성해준다. 결과는 DOCX로 받는다.

## 사용자
- 예비창업자 / 3년 이내 초기 창업자
- 사업계획서를 처음 써보는 사람이 대부분
- 마감에 쫓겨 급하게 들어옴 (K-Startup 공고 마감 D-7 같은 상황)
- 데스크톱에서 작업하지만 모바일로도 확인함

## 디자인 원칙
1. 차분한 전문성 — 관공서 제출 문서를 다루므로 신뢰감이 최우선.
   그라데이션·글래스모피즘·과한 애니메이션 금지.
2. 문서처럼 읽히게 — 본문 가독성이 장식보다 중요. 여백을 넉넉히.
3. 한 번에 하나씩 — 12개 질문을 한 화면에 쏟지 말고 흐름을 만들 것.
4. 기다림을 설계 — AI 생성에 3~5분 걸린다. 진행 상황을 항상 보이게.
5. 불확실성을 숨기지 말 것 — AI가 확신 못 하는 부분을 명시적으로 표시.

## 비주얼 스타일
- 라이트 모드 기준, 흰 배경
- 무채색(neutral) 기반 + 포인트 컬러 딱 1개 (딥 블루 #2563EB)
- 라운드: 12px(카드) / 8px(입력·버튼)
- 그림자 최소화, 1px 보더 위주 (#E5E5E5)
- 폰트: Pretendard. 본문 15px / 행간 1.7
- 컨텐츠 최대폭 880px 중앙 정렬 (문서 도구라 넓을 필요 없음)
- 아이콘은 선형(outline), 크기 통일

## 화면 3개

### A. 홈 — 프로젝트 목록 + 새로 만들기
- 상단: 서비스명 + 한 줄 설명
- 새 사업계획서 카드: 제목 / 아이디어(멀티라인) / 양식 선택 / 만들기 버튼
- 아래: 내 사업계획서 리스트. 각 항목에 제목·양식·응답 진행도(예: 8/12)·상태 배지
- 상태: 작성 전 / 질의 응답 중 / 생성 중 / 완료

### B. 프로젝트 상세 — 질의 응답 + 생성
- 상단: 제목, 아이디어 요약
- 질의 12개. 번호·질문·도움말·입력창. 자동저장 표시
- 상단 또는 하단에 진행률 고정 표시: "8 / 최소 10개"
  → 10개 미만이면 생성 버튼 비활성 + "2개 더 답변하면 생성할 수 있어요"
- 생성 버튼은 크고 명확하게 (전체 폭)
- 생성 중: 현재 작성 중인 섹션명 + 실시간으로 타이핑되는 텍스트를 보여줌

### C. 결과 — 섹션별 문서 뷰
- 7개 섹션이 카드로 쌓임 (사업 개요 / 문제 인식 / 실현 가능성 /
  시장 분석 / 성장 전략 / 소요 예산 / 팀 구성)
- 각 섹션 헤더 우측에 확신도 배지
- 본문은 개조식 문장(~함, ~됨). 문서처럼 읽히게 조판
- 섹션마다 재생성 / 편집 액션
- 하단 고정: DOCX 다운로드 버튼

## 시그니처 컴포넌트 — 확신도 배지
이 제품의 핵심 차별점. AI가 근거 없는 내용을 지어내는 대신 표시한다.

- 확정 (confirmed) : 초록 계열. 응답에 근거가 있는 내용
- 확인 필요 (needs_user) : 노랑/앰버 계열. 사용자에게 되물어야 할 항목이 있음
  → 섹션 하단에 노란 박스로 "직접 확인해 주세요" + 질문 목록
- 리스크 (risk) : 빨강 계열. 지원 자격 등에서 문제 소지

이 배지가 눈에 잘 띄되, 문서 본문의 가독성을 해치지 않게 균형 잡을 것.

## 하지 말 것
- 히어로 섹션의 큰 일러스트/3D 오브젝트
- 보라색 그라데이션 (AI 서비스 클리셰)
- 카드마다 다른 색 (컬러는 상태 표현에만 사용)
- 이모지 남발
- 다크모드 (1차 범위 아님)

한국어 UI로, 실제 한글 텍스트를 넣어서 보여줘.
```

---

## 2. 디자인 토큰 (개발 연결용)

프롬프트 결과를 코드로 옮길 때 이 값으로 통일한다.

```css
/* 색 */
--bg:            #FFFFFF;
--surface:       #FAFAFA;
--border:        #E5E5E5;
--text:          #171717;
--text-muted:    #737373;
--text-subtle:   #A3A3A3;
--accent:        #2563EB;   /* 포인트 — 버튼·링크·포커스 */

/* 상태 (확신도) */
--confirmed-bg:  #ECFDF5;  --confirmed-fg:  #047857;
--needs-user-bg: #FFFBEB;  --needs-user-fg: #B45309;
--risk-bg:       #FEF2F2;  --risk-fg:       #B91C1C;

/* 라운드 */
--r-card:  12px;
--r-input:  8px;
--r-pill: 9999px;

/* 타이포 */
--font: "Pretendard Variable", Pretendard, -apple-system, system-ui, sans-serif;
/* 본문 15px/1.7 · 소제목 17px/600 · 제목 24px/700 · 캡션 12px */

/* 여백 스케일 */
4 · 8 · 12 · 16 · 20 · 24 · 32 · 48 · 64
```

Pretendard 적용:

```html
<link rel="stylesheet"
  href="https://cdn.jsdelivr.net/gh/orioncactus/pretendard@v1.3.9/dist/web/variable/pretendardvariable-dynamic-subset.min.css" />
```

---

## 3. 화면별 보조 프롬프트

메인 프롬프트로 큰 그림을 잡은 뒤, 화면 하나씩 다듬을 때 쓴다.

### 질의 응답 화면 집중

```
moai의 질의 응답 화면만 자세히 디자인해줘.

12개 질문에 답해야 하는데 이탈률을 낮추는 게 목표다.
- 질문 하나당 카드 하나. 번호 / 질문 / 도움말 / 입력창
- 입력창을 벗어나면 자동저장되고 "저장됨" 마이크로 인터랙션
- 답변한 질문과 안 한 질문이 한눈에 구분되게
- 상단에 sticky 진행률 바: "8 / 최소 10개"
- 필수 질문은 * 표시
- 객관식(개발 단계)은 셀렉트가 아니라 칩(chip) 선택으로

질문 예시:
1. 어떤 문제를 해결하려고 하나요?
   (고객이 겪는 불편을 구체적인 상황으로 적어주세요)
2. 주요 고객은 누구인가요?
6. 현재 개발 단계는 어디인가요?
   → 아이디어 / 기획 완료 / 프로토타입 / MVP 출시 / 정식 출시 / 매출 발생
```

### 생성 중 화면 집중

```
moai의 "AI가 사업계획서를 작성 중" 화면을 디자인해줘.

3~5분 걸리므로 기다림을 견딜 수 있게 만드는 게 목표다.
- 7개 섹션 중 지금 몇 번째를 쓰고 있는지 스텝 인디케이터
- 완료된 섹션은 체크, 현재 섹션은 강조, 남은 섹션은 흐리게
- 현재 섹션의 텍스트가 실시간으로 타이핑되어 나타남 (스트리밍)
- 스피너를 크게 돌리지 말 것. 실제 글이 써지는 게 최고의 로딩 표시
- 중단 버튼
```

### 결과 문서 뷰 집중

```
moai의 사업계획서 결과 화면을 디자인해줘.

관공서에 제출할 문서라 읽기 편한 조판이 최우선이다.
- 7개 섹션이 순서대로. 각 섹션은 카드
- 섹션 헤더 우측에 확신도 배지 (확정 / 확인 필요 / 리스크)
- 본문은 개조식(~함, ~됨). ▶ 로 시작하는 소제목 있음
- "확인 필요" 섹션은 하단에 노란 박스:
  "아래 항목은 직접 확인해 주세요" + 질문 리스트
- 섹션별 액션: 다시 생성 / 직접 수정
- 우측에 목차 사이드바(데스크톱), 하단 고정 DOCX 다운로드 버튼
```

---

## 4. 영어 축약 버전

v0 등 영어에서 결과가 더 좋은 도구용.

```
Design a web UI for "moai", a Korean AI service that drafts government grant
business plans for startup founders.

Flow: enter an idea → answer 12 questions → AI generates a 7-section plan → export DOCX.

Principles:
- Calm professionalism. These are official documents. No gradients, no glassmorphism.
- Document-first readability over decoration. Generous whitespace.
- Design for waiting: generation takes 3-5 min, stream the text as it's written.
- Surface uncertainty: AI marks what it isn't sure about instead of hallucinating.

Visual: light mode, white bg, neutral grays + a single accent (deep blue #2563EB).
12px card radius, 1px borders (#E5E5E5), minimal shadows.
Pretendard font, 15px body / 1.7 line-height. Max content width 880px, centered.

Screens: (A) project list + create, (B) questionnaire with progress
"8 / min 10", (C) 7 result sections as cards.

Signature component — confidence badge on each section:
confirmed (green) / needs-review (amber, with a follow-up question list) / risk (red).

Avoid: hero illustrations, purple AI-cliché gradients, multi-colored cards,
excessive emoji, dark mode.

Use real Korean text in the UI.
```

---

## 사용 순서

1. §1 메인 프롬프트로 전체 톤 잡기
2. 나온 결과에서 마음에 드는 방향 고르기
3. §3 보조 프롬프트로 화면별 디테일 다듬기
4. §2 토큰으로 코드에 반영

현재 구현된 화면은 기능 검증용 기본 UI다.
디자인이 확정되면 `apps/web/src/app/` 아래 3개 파일만 교체하면 된다.
