# moai — 의사결정 로그 및 구축 현황

> 최종 갱신: 2026-08-20 (v3 — 초기 구축 완료)
> 제품: 아이디어 입력 → 사업계획서 자동 작성 AI SaaS
> 상세 사용법은 [README.md](./README.md) 참조

---

## 확정된 의사결정

| 항목 | 결정 | 근거 |
|---|---|---|
| 프로젝트 성격 | **신규 별개** | `.claude/` 문서는 양대산 대표(픽앤몰) govgrant-app 자료 — 벤치마킹 참고용 |
| 저장소 구조 | **모노레포 1개, 앱 3개** | 세 앱이 동일 계약 타입 공유. 레포 분리 시 동기화 버그 집중 |
| 프론트 | Next.js 16 → **Vercel** | 제작사 플랫폼, 무료 티어 |
| 백엔드 | NestJS 11 → **AWS Lightsail** | 월 $7 고정, 안정성, 자료 풍부 |
| DB | **Supabase Postgres** | Auth + Storage + pgvector + RLS 일괄 |
| AI 실행 | **로컬 Claude 서버 (기본) + API 폴백** | 매출 0 단계의 비용 방어 |
| 터널 | **Cloudflare Tunnel** | 무료·고정 도메인·집 IP 비노출 |
| 이전성 확보 | **Dockerfile** | Lightsail ↔ Render ↔ Cloudtype 1시간 내 이전 가능 |

### 로컬 실행 구조에 대한 판단

매출이 없는 현 단계에서 비용을 아끼려는 판단은 합리적이라고 보고 그대로 채택했다.
다만 **가용성 리스크는 API 폴백으로 차단**했다.

- 로컬 `/health` 실패 또는 60초 타임아웃 → 자동으로 Anthropic API 전환
- 평소에는 폴백 경로가 호출되지 않으므로 **유지 비용 0원**
- 매출 발생 후 전환 시 `EXECUTOR_PRIORITY=api,local` 한 줄만 변경

---

## 구축 결과

**103개 파일 / 약 4,300줄. 3개 앱 전부 타입체크·빌드 통과.**

```
moai/
├─ apps/
│   ├─ web     Next.js 16 + React 19 + Tailwind 4
│   ├─ api     NestJS 11 + TypeORM + Postgres
│   └─ agent   NestJS 11 + Anthropic SDK + docx
└─ packages/
    └─ shared  Zod 계약 + 프롬프트 빌더 (3앱 공용)
```

### 완료 항목

| # | 작업 | 상태 |
|---|---|---|
| 1 | pnpm 모노레포 + Turborepo, `shared` 계약 정의 | ✅ |
| 2 | 엔티티 11종 + CRUD 11종 (`nest g resource` 스캐폴딩) | ✅ |
| 3 | `agent` 로컬 서버 — 헬스체크·SSE·토큰 인증·docx 생성 | ✅ |
| 4 | `PlanExecutor` 추상화 + 자동 폴백 레지스트리 | ✅ |
| 5 | 생성 오케스트레이션 — 응답 10개 검증, 쿼터, 섹션 저장 | ✅ |
| 6 | `web` 프론트 — 프로젝트 CRUD, 질의 폼, SSE 진행률, 결과 뷰 | ✅ |
| 7 | 시드 — PSST 양식 + 질의 12개 | ✅ |
| 8 | Dockerfile (Lightsail 배포용) | ✅ |
| 9 | 전체 빌드 검증 + agent 기동 스모크 테스트 | ✅ |

### 검증 결과

```
$ pnpm -r exec tsc --noEmit        → 에러 0
$ pnpm --filter @moai/{shared,api,agent,web} build  → 전부 성공
$ curl http://127.0.0.1:4100/health
{"ok":true,"executor":"local","version":"0.1.0","busySlots":0,"maxSlots":2,"uptimeSec":0}
```

---

## 데이터 모델 (11 테이블)

`tenants` `users` `templates` `questions` `projects` `answers`
`sections` `jobs` `artifacts` `knowledge` `usage_events`

### 질의 구조 — 요청하신 "10개 이상"

`questions` 테이블에 양식별 질의를 저장하고, 시드로 **PSST 12문항**을 넣었다.
생성 시 백엔드가 유효 응답 10개 이상을 강제한다 (`MIN_ANSWERS = 10`).

| # | 질의 키 | 기여 섹션 |
|---|---|---|
| 1 | `problem_statement` | 문제 인식 |
| 2 | `target_customer` | 문제 인식 |
| 3 | `existing_alternatives` | 문제 인식 |
| 4 | `solution_summary` | 실현 가능성 |
| 5 | `differentiation` | 실현 가능성 |
| 6 | `development_stage` | 실현 가능성 |
| 7 | `market_size` | 시장 분석 |
| 8 | `competitors` | 시장 분석 |
| 9 | `revenue_model` | 성장 전략 |
| 10 | `go_to_market` | 성장 전략 |
| 11 | `budget_plan` | 소요 예산 |
| 12 | `team_composition` | 팀 구성 |

### AI 학습 데이터 — 요청하신 "러프하게"

`knowledge` 테이블은 실제 데이터를 받기 전까지 스키마를 열어두었다.

```ts
title, category, content, source, tags[]   // 확정
metadata: jsonb                            // 미확정 속성 전부 수용
embedding: jsonb (nullable)                // pgvector 도입 전 임시
```

데이터 형태가 확정되면 자주 쓰는 키만 정식 컬럼으로 승격한다.

---

## 벤치마킹 자산 반영

`.claude/` 문서의 방법론을 프롬프트 규칙으로 옮겼다 (`packages/shared/src/prompt.ts`).

| 원본 규칙 | 구현 |
|---|---|
| 개조식 문체 (`~함`/`~됨`) | 시스템 프롬프트 원칙 1 |
| "미구현 기능 기재 금지 — 허위 기재 = 선정취소" | 시스템 프롬프트 원칙 2 |
| 상태 범례 `✅확정 / 👤확인필요 / 🔴리스크` | `sections.confidence` 컬럼 + 프론트 배지 |
| 역방향 설계 (평가기준 → 본문) | 섹션별 작성 지침(`SECTION_BRIEFS`) |
| "표만 쓰고 증빙 미제출 시 불인정" | 근거 없는 항목은 `[확인필요]`로 분리 |

**상태 범례가 가장 큰 수확이다.** AI가 모르는 값을 지어내는 대신
`needs_user`로 표시해 사용자에게 되묻게 만드는 장치로, 환각을 구조적으로 차단한다.

---

## 비용 방어 (3중)

1. **테넌트 월 토큰 상한** — `tenants.monthly_token_limit`, 초과 시 잡 생성 거부
2. **로컬 슬롯 제한** — `MAX_CONCURRENT_JOBS`, 포화 시 API 폴백
3. **사용량 적재** — 잡마다 `usage_events` 기록, `local`은 비용 0 집계

API 전환 시 단가 (1건 ≈ 입력 20K / 출력 15K 토큰): Sonnet 5 약 300원, Opus 5 약 700원

---

## 보안 조치

- `agent`는 `127.0.0.1` 바인딩. 외부 노출은 Cloudflare Tunnel 경유만
- `AGENT_TOKEN` 미설정 시 기동 로그 경고 출력
- 잡 종료 시 작업 디렉터리 즉시 삭제 — 고객 아이디어가 로컬 PC에 잔존하지 않도록

---

## 다음 단계

실행에 필요한 것 (사용자 작업):

1. Supabase 프로젝트 생성 → `DATABASE_URL` 확보
2. `AGENT_TOKEN` 생성 후 api·agent 양쪽 `.env`에 동일 값 입력
3. `pnpm --filter @moai/api seed` 실행 → 출력된 ID를 web `.env.local`에 반영
4. 터미널 3개로 `pnpm dev:agent` / `dev:api` / `dev:web`

이후 개선 (더블체크하며 진행):

- [ ] 인증 (Supabase Auth) — 현재 시드 계정 사용
- [ ] 산출물 스토리지 업로드 — 현재 agent 로컬에만 생성
- [ ] pgvector 임베딩 — 현재 RAG는 최신순 단순 조회
- [ ] 양식 추가 (기업마당 / R&D / IR)
- [ ] 섹션 직접 편집 UI
- [ ] hwpx 출력
- [ ] DB 마이그레이션 전환 (현재 `synchronize: true`)
