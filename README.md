# moai

아이디어를 입력하면 사업계획서 초안을 만들어 주는 AI SaaS.

---

## 구성

```
moai/
├─ apps/
│   ├─ web     (Next.js 16)  프론트           → Vercel
│   ├─ api     (NestJS 11)   백엔드           → AWS Lightsail
│   └─ agent   (NestJS 11)   로컬 Claude 서버 → 내 PC + Cloudflare Tunnel
└─ packages/
    └─ shared               타입·Zod 계약·프롬프트 (3앱 공용)
```

세 앱이 주고받는 계약은 전부 `packages/shared` 한 곳에 있다.
계약을 바꾸면 세 앱이 동시에 컴파일 에러로 알려주므로 동기화 누락이 생기지 않는다.

---

## 동작 흐름

```
사용자 → web → api ─┬─ ① local  : agent(내 PC) → Claude → 섹션 생성
                    └─ ② api    : Anthropic API 직결  (폴백)
                                 ↓
                    Postgres 저장 → SSE 로 web 에 실시간 중계
```

`api` 는 `PlanExecutor` 인터페이스만 알기 때문에 실행 위치를 바꿔도 나머지 코드는 그대로다.
평소에는 로컬 실행기만 동작하므로 **폴백 유지 비용은 0원**이며,
로컬이 죽었을 때만 API 로 넘어간다.

매출이 발생해 API 직결로 전환할 때는 환경변수 한 줄만 바꾼다.

```bash
EXECUTOR_PRIORITY=api,local   # 기본값은 local,api
```

---

## 시작하기

### 1. 설치

```bash
pnpm install
pnpm --filter @moai/shared build
```

### 2. 환경변수

```bash
cp apps/api/.env.example   apps/api/.env
cp apps/agent/.env.example apps/agent/.env
cp apps/web/.env.example   apps/web/.env.local
```

`apps/api/.env` 의 `DATABASE_URL` 에 Supabase 연결 문자열을 넣는다.
(Supabase 대시보드 → Project Settings → Database → Connection string)

`AGENT_TOKEN` 은 api·agent 양쪽에 **같은 값**을 넣는다.

```bash
# 토큰 생성
node -e "console.log(require('crypto').randomBytes(32).toString('hex'))"
```

### 3. 시드

K-Startup PSST 양식과 질의 12개를 넣는다.

```bash
pnpm --filter @moai/api seed
```

출력된 `NEXT_PUBLIC_SEED_TENANT_ID` / `NEXT_PUBLIC_SEED_USER_ID` 를
`apps/web/.env.local` 에 복사한다. (인증 붙기 전까지 임시로 사용)

### 4. 실행

터미널 3개에서 각각:

```bash
pnpm dev:agent   # http://localhost:4100
pnpm dev:api     # http://localhost:4000/api
pnpm dev:web     # http://localhost:3000
```

동작 확인:

```bash
curl http://localhost:4100/health
curl http://localhost:4000/api/generation/status
```

---

## API

### CRUD (11개 리소스)

전부 동일한 형태다.

| 메서드 | 경로 | 설명 |
|---|---|---|
| POST | `/api/{resource}` | 생성 |
| GET | `/api/{resource}?page=1&limit=20` | 목록 (페이징) |
| GET | `/api/{resource}/:id` | 단건 |
| PATCH | `/api/{resource}/:id` | 수정 |
| DELETE | `/api/{resource}/:id` | 삭제 |

리소스: `tenants` `users` `templates` `questions` `projects`
`answers` `sections` `jobs` `artifacts` `knowledge` `usage`

### 생성

| 메서드 | 경로 | 설명 |
|---|---|---|
| GET | `/api/generation/status` | 실행기 상태 (로컬/API 생존 여부) |
| GET | `/api/generation/projects/:id/stream` | 생성 시작 (SSE 스트리밍) |
| POST | `/api/generation/projects/:id` | 생성 시작 (동기, 섹션 지정 가능) |

### 공고 캘린더

| 메서드 | 경로 | 설명 |
|---|---|---|
| GET | `/api/grants/calendar?year=&month=&tenantId=` | 월간 캘린더 (마감일 기준 배치 + 지원 자격 판정) |
| GET | `/api/grants/calendar/upcoming?days=14` | 마감 임박 공고 |
| GET | `/api/grants/:id/eligibility` | 공고 1건의 판정 근거 상세 |
| GET | `/api/company-profiles/default/:tenantId` | 테넌트 기본 기업 프로필 |

---

## 데이터 모델

| 테이블 | 역할 |
|---|---|
| `tenants` | 조직. 사용량 상한·동시 실행 제한의 기준 |
| `users` | 사용자 (인증은 Supabase Auth) |
| `templates` | 양식 (PSST / 기업마당 / R&D / IR) |
| `questions` | 질의 항목 — **양식당 10개 이상** |
| `projects` | 사업계획서 프로젝트 (아이디어 1건) |
| `answers` | 질의 응답 |
| `sections` | 생성된 섹션 본문 (버전 관리) |
| `jobs` | 생성 잡 (실행기·폴백 여부·토큰 기록) |
| `artifacts` | 산출물 파일 메타 |
| `knowledge` | AI 참조 데이터 — **스키마 미확정, metadata JSONB 로 유연 수용** |
| `usage_events` | 사용량 미터링 |
| `grants` | 정부·공공 지원사업 공고 — 캘린더의 원천 데이터 |
| `company_profiles` | 기업 프로필 — 지원 자격 판정의 기준 |

---

## 공고 캘린더

기업 프로필과 공고 자격요건을 대조해, 마감일 캘린더 위에 **지원 가능 여부**를 함께 표시한다.

### 판정 원칙

사업계획서 생성과 같은 사고방식이다 — **모르면 모른다고 한다.**
프로필에 값이 없으면 통과로 처리하지 않고 `unknown` 으로 남겨 사용자가 직접 확인하게 한다.
잘못된 "지원 가능" 판정은 마감을 놓치게 만드는 것보다 나쁘기 때문이다.

| 판정 | 조건 | 화면 |
|---|---|---|
| `eligible` 지원 가능 | 확인된 요건을 모두 충족 | 초록 |
| `conditional` 조건부 | 일부 요건을 확인할 수 없음 | 노랑 |
| `ineligible` 지원 불가 | 명확한 배제 조건에 해당 | 빨강 |
| `unknown` 정보 부족 | 판정할 정보가 전혀 없음 | 회색 |

### 검사 항목 (7종)

업력 · 지역 · 업종 · 종업원 수 · 매출액 · 법인 여부 · 필수 인증

공고가 해당 요건을 명시하지 않았으면 검사를 건너뛴다(제한 없음으로 간주).
판정 결과에는 항목별 근거가 문장으로 함께 담긴다.

```
✕ 지역: 경기·성남 소재 기업 대상 — 서울 은(는) 해당하지 않습니다.
? 종업원 수: 20인 이하 대상 — 종업원 수가 등록되어 있지 않습니다.
✓ 업력: 창업 5년 이내 대상 — 현재 업력 2년으로 충족합니다.
```

화면: `/calendar`

### knowledge 테이블에 대해

실제 학습 데이터를 받기 전이므로 스키마를 느슨하게 열어두었다.

```ts
title, category, content, source, tags[]   // 확정된 것
metadata: jsonb                            // 미확정 속성은 전부 여기로
embedding: jsonb (nullable)                // pgvector 도입 전 임시 보관
```

데이터 형태가 확정되면 자주 쓰이는 키만 정식 컬럼으로 승격하면 된다.

---

## 생성 품질 장치

`.claude/` 벤치마킹 자료에서 가져온 실무 규칙을 프롬프트에 넣었다.
(`packages/shared/src/prompt.ts`)

1. **개조식 문체** — `~함` / `~됨`
2. **없는 사실 금지** — 매출·사용자 수·특허·경력은 응답에 있는 것만 사용
3. **확인 필요 표시** — 근거가 없으면 지어내지 않고 `[확인필요]` 로 사용자에게 되묻는다

3번이 핵심이다. 생성 결과는 확신도가 함께 저장되고, 프론트에서 배지로 표시된다.

| 값 | 의미 | 화면 표시 |
|---|---|---|
| `confirmed` | 근거 있음 | 초록 "확정" |
| `needs_user` | 사용자 확인 필요 | 노랑 "확인 필요" + 질문 목록 |
| `risk` | 요건 미충족 가능성 | 빨강 "리스크" |

---

## 비용 방어

세 겹으로 막는다.

1. **테넌트 월 토큰 상한** — `tenants.monthly_token_limit`. 초과 시 잡 생성 거부
2. **로컬 실행기 슬롯 제한** — `MAX_CONCURRENT_JOBS`. 포화 시 API 폴백
3. **사용량 적재** — 잡마다 `usage_events` 기록. `local` 실행기는 비용 0으로 집계

참고 단가 (API 전환 시, 사업계획서 1건 ≈ 입력 20K / 출력 15K 토큰)

| 모델 | 건당 |
|---|---|
| Claude Sonnet 5 | 약 300원 |
| Claude Opus 5 | 약 700원 |

---

## 보안

- **agent 는 `127.0.0.1` 에만 바인딩**한다. 외부 노출은 Cloudflare Tunnel 을 통해서만.
- `AGENT_TOKEN` 미설정 시 기동 로그에 경고가 뜬다. 터널 열기 전에 반드시 설정할 것.
- 잡이 끝나면 작업 디렉터리를 즉시 삭제한다 (`KEEP_WORKSPACE=false`).
  고객의 사업 아이디어가 로컬 PC 에 남지 않도록 하기 위함이다.

터널 실행:

```bash
cloudflared tunnel --url http://localhost:4100
```

출력된 주소를 `apps/api/.env` 의 `AGENT_BASE_URL` 에 넣는다.

---

## 배포

### 백엔드 → AWS Lightsail

```bash
docker build -f apps/api/Dockerfile -t moai-api .
```

Lightsail 컨테이너 서비스에 이미지를 푸시하고 환경변수를 설정한다.
`Dockerfile` 만 있으면 Render·Cloudtype·Fly.io 어디로든 그대로 옮길 수 있다.

### 프론트 → Vercel

루트 디렉터리를 `apps/web` 으로 지정하고 `NEXT_PUBLIC_API_BASE` 를 설정한다.

---

## 상시 운영 — 죽어도 알아서 돌아오게

이 서비스는 개발자 PC 에서 돈다. 그래서 "창을 닫으면 끝"이 되지 않도록
살리는 층을 네 겹 두었다. 각 층이 잡는 것이 다르다.

| 무엇이 잘못됐나 | 누가 잡나 | 걸리는 시간 |
| --- | --- | --- |
| 프로세스가 죽었다 | PM2 | 10~20초 |
| 떠 있는데 답을 안 한다 | `scripts/watchdog.mjs` | 최대 2분 반 |
| 쓰던 중에 실행기가 끊겼다 | `PlanService` 스스로 재시도 | 최대 11분 반 |
| API 가 다시 떴다 | `onApplicationBootstrap` 이 쓰다 만 것을 이어씀 | 즉시 |
| 컴퓨터를 껐다 켰다 | 시작프로그램 → `scripts/boot.cmd` | 부팅 직후 |

사용자 화면에는 이 중 어느 것도 오류로 보이지 않는다. 사업계획서는 절마다
저장되므로 **쓰던 자리에서 이어지고**, 그동안 화면은 계속 진행 중이다.

### 쓰는 법

```bash
pnpm status              지금 제대로 도는가  ← 이것부터
pnpm run deploy          고친 것 반영 (빌드 → 재시작, 빌드 실패하면 안 올림)
pnpm run fresh           처음부터 다시 (다 지우고 새로 짓고 새로 띄운다)
pnpm run log --fail      안 된 요청만 보기
pm2 logs moai-agent      실행기 로그
pm2 save                 지금 목록을 기억 (부팅 때 이대로 뜬다)
```

#### 고쳤으면 `deploy`, 이상하면 `fresh`

거의 항상 `pnpm run deploy` 다. 도는 것을 건드리지 않고 필요한 것만 갈아
끼우므로 몇 초면 끝난다.

`pnpm run fresh` 는 **이상해진 상태를 물려받고 싶지 않을 때** 쓴다. PM2
목록을 통째로 지웠다가 `ecosystem.config.js` 를 다시 읽어 올리므로 방금
컴퓨터를 켠 것과 같아진다. 이것으로만 지워지는 것이 둘 있다 —

* **쌓인 재시작 횟수.** `재시작 29회` 같은 표시는 지금 멀쩡해도 계속 남아서,
  나중에 진짜 크래시루프가 시작돼도 눈에 안 띈다.
* **PM2 가 들고 있는 낡은 설정.** PM2 는 프로세스를 **처음 띄울 때** 읽은
  설정을 계속 쓴다. 그래서 `ecosystem.config.js` 를 고치고 재시작만 하면
  고친 내용이 반영되지 않는다. 지웠다 올려야 다시 읽는다.

둘 다 **빌드를 먼저 하고 그 다음에 내린다.** 빌드가 깨지면 거기서 멈추므로
돌던 것이 그대로 돈다 — 고장난 코드가 서비스를 내리는 일이 없다. 대신
`fresh` 는 다 내렸다 올리므로 1~2분쯤 끊긴다.

**`deploy` 앞의 `run` 을 빼면 안 된다.** `deploy` 는 pnpm 이 이미 쓰는 내장
명령이라, `pnpm deploy` 는 `scripts/deploy.mjs` 까지 오지도 못하고
`ERR_PNPM_NOTHING_TO_DEPLOY` 로 끝난다. 배포한 줄 알았는데 아무것도 안
바뀐 상태가 되므로, 고쳤는데 왜 그대로냐고 한참 헤매기 딱 좋다.

터미널을 안 여는 쪽이 편하면 저장소 맨 위의 `.cmd` 를 두 번 누르면 된다.
안에서 하는 일은 위 명령과 똑같다.

| 파일 | 하는 일 |
| --- | --- |
| `status.cmd` | `pnpm status` |
| `start-moai.cmd` | 유령 정리 → 다섯 개 전부 다시 띄우기 → 뜰 때까지 기다렸다 상태 확인 |
| `restart-api.cmd` | `pnpm run deploy api` |
| `restart-web.cmd` | `pnpm run deploy web` |
| `fresh.cmd` | `pnpm run fresh` — 처음부터 다시 |
| `log.cmd` | `pnpm run log` — 무엇이 들어왔고 됐는가 |

**이 `.cmd` 들은 창을 띄우지 않는다.** 예전 방식(창 네 개)으로 돌아가면
pm2 가 든 프로세스와 같은 포트를 놓고 싸워 둘 다 죽는다. 그래서 전부
pm2 에 넘기기만 한다.

`start-moai.cmd` 는 **이미 떠 있는 것도 다시 띄운다** — `pm2 start` 는 같은
이름이 있으면 재시작하기 때문이다. 한 곳만 고쳤을 때는 `restart-api.cmd` /
`restart-web.cmd` 쪽이 낫다.

**서버는 창 없이 백그라운드로 돈다.** 그래서 화면만 봐서는 도는지 죽었는지
알 수가 없다. `pnpm status` 가 그걸 대신 봐 준다 — `pm2 status` 는 프로세스가
살아 있는지만 알려 주는데, 정작 문제가 됐던 것은 **살아 있는데 일을 못 하는
상태**였기 때문이다.

```
[1/4] 프로세스     PM2 가 다섯 개를 다 들고 있는가
[2/4] 응답         네 주소가 실제로 답하는가
[3/4] 생성 준비    Claude 명령이 실제로 쓸 수 있는가
[4/4] 오늘 수집    새벽 수집이 오늘 돌았는가
```

마지막 줄이 `전부 정상입니다.` 면 된 것이다. 문제가 있으면 무엇을 해 볼지
같이 알려 준다.

### 요청 기록

**무엇이 들어왔고, 됐는가.** API 와 실행기가 받은 요청을 한 줄씩 남긴다.

```
[요청] GET    /api/grants/stats              200      50ms
[요청] GET    /api/grants?page=2&secret=***  401       2ms  ← 실패
[요청] POST   /plan/section                  500     257ms  ← 실패
```

```bash
pnpm run log              최근 50건
pnpm run log --fail       안 된 것만          ← 제일 자주 쓴다
pnpm run log 200          최근 200건
pnpm run log --all        똑같은 것도 접지 않고 전부
```

**똑같은 요청은 한 줄로 접는다.** 로그인한 채 켜 둔 탭 하나가 알림을
30초마다 묻는데, 토큰이 만료돼 있으면 그게 전부 401 이 된다. 하루 1440줄이다.
접지 않으면 `--fail` 화면이 그 한 줄로 가득 차서, **그 사이에 진짜 봐야 할
실패가 끼어 있어도 못 본다.**

```
09-11 21:36  api  GET  /api/nope                          404       3ms  ← 실패
09-11 21:34  실행기 POST /plan/section                     500     257ms  ← 실패
09-11 23:58  api  GET  /api/notifications?tenantId=1521…  401      ×145  ← 실패
```

마지막 줄이 145번 반복된 것이다. 접어도 잃는 것이 없도록 **몇 번인지와
마지막 시각**은 남긴다. 하나하나 다 봐야 할 때는 `--all`.

```
  09-11 21:36  api    GET    /api/grants/stats                  200      32ms
  09-11 21:36  api    GET    /api/nope                          404       3ms  ← 실패
  09-11 21:36  실행기  POST   /plan/section                      500     257ms  ← 실패

  전체 21건 · 안 된 것 12건  (pnpm run log --fail 로 그것만 봅니다)
```

**셸로 거르지 않는 이유.** `logs/api.log` 를 직접 열어 걸러 보려 하면
윈도우에서 마땅한 수가 없다 — `findstr "요청"` 은 콘솔 코드페이지와 파일
인코딩이 어긋나 **아무것도 못 찾고 조용히 끝나고**, `grep` 은 기본으로
깔려 있지 않다. `Select-String` 은 PowerShell 에서만 되고 출력이 깨진다.
그래서 셸에 기대지 않고 `scripts/log.mjs` 가 직접 읽는다.

**왜 넣었나.** 이 서비스는 창 없이 돈다. 수집 기록과 사업계획서 작업은
남는데 **사용자가 버튼을 눌러 실패한 순간**은 아무 데도 안 남았다.
"안 돼요" 라는 말을 들어도 확인할 것이 없었다. NestJS 는 요청을 기본으로
남기지 않으므로 `apps/*/src/common/request-log.ts` 가 그 자리를 채운다.

거르는 것이 둘 있다.

* **감시용 요청.** watchdog 이 2분 반마다 부르는 것까지 남기면 하루 576줄이
  쌓여 정작 봐야 할 줄이 그 사이에 파묻힌다. 주소로 거르면 사용자가 쓰는
  주소까지 같이 빠지므로, 부르는 쪽이 `user-agent: moai-healthcheck` 로
  스스로 밝히고 그것만 뺀다.
* **주소에 붙어 온 비밀값.** 이름이 `token`·`key`·`secret` 같은 것은 값을
  `***` 로 가린다. 이 로그는 파일로 남고, 남은 것은 지우기 전까지 남는다.

**웹 화면(3000)의 페이지 조회는 안 남는다.** Next 는 별개 프로세스라
여기에 걸리지 않는다 — 남는 것은 API 와 실행기가 받은 요청뿐이다.

**로그는 자동으로 정리되지 않는다.** `logs/` 는 계속 커지기만 하므로,
너무 커지면 `pm2 flush` 로 비우거나 `pm2-logrotate` 를 붙인다.

### 세션이 끝났을 때

토큰이 만료되면 **안내를 띄우고 로그아웃시킨 뒤 메인으로 보낸다.** 그
전까지는 아무 일도 일어나지 않았다 — 화면은 로그인된 것처럼 보이는데
누르는 것마다 조용히 실패했다.

**어떻게 드러났나.** 요청 기록을 켜자마자 이것이 보였다.

```
09-11 21:38  GET /api/notifications?tenantId=1521d07a-…  401   1ms  ← 실패
09-11 21:39  GET /api/notifications?tenantId=1521d07a-…  401   3ms  ← 실패
09-11 21:40  GET /api/notifications?tenantId=1521d07a-…  401   1ms  ← 실패
```

알림 종이 30초마다 묻고, 30초마다 401 을 받고 있었다. 며칠째였다.
`notifications.tsx` 의 `catch` 가 **401 까지 같이 삼켰기** 때문에 화면에는
아무것도 뜨지 않았고, 그래서 아무도 몰랐다. 사용자 쪽에서는 "알림이 안
오네" 정도로만 느껴진다.

**한 곳에서 잡는다.** 만료는 어느 화면에서 무엇을 하든 401 로 나타난다.
부르는 쪽마다 처리하면 반드시 빠뜨리는 데가 생기므로 — 실제로 그랬다 —
`lib/api.ts` 의 `request()` 한 곳에서 잡아 auth 로 올린다.

```
401 (lib/api.ts)
  → setSessionExpiredHandler  (auth.tsx 가 꽂아 둔 함수)
  → 세션이 있었을 때만 expired = true
  → 안내 모달
  → 확인 → signOut() → 메인("/")
```

거는 조건이 둘 있다.

* **세션이 있었을 때만** 만료로 다룬다. 로그인하지 않은 사람이 로그인 걸린
  주소를 눌러도 401 은 떨어지는데, 그때 "세션이 만료되었습니다" 는 틀린
  말이다. `sessionRef` 로 지금 세션을 본다.
* **묻기를 멈춘다.** `expired` 가 참이면 알림 폴링이 아예 안 걸린다.
  안 그러면 사용자가 안내를 읽는 동안에도 30초마다 401 이 계속 쌓인다.

주기적으로 서버를 부르는 화면을 새로 만들 때는 `useAuth()` 의 `expired` 를
보고 멈춰야 한다.

### 컴퓨터를 켤 때

PM2 는 죽은 프로세스를 살리지만 **PM2 자신이 없으면 아무 일도 못 한다.**
컴퓨터를 껐다 켜면 PM2 부터 사라지므로, 시작프로그램에 한 줄 걸어 둔다.

```
%APPDATA%\Microsoft\Windows\Start Menu\Programs\Startup\moai.cmd
  └─ scripts/boot.cmd  →  유령 정리 후 pm2 resurrect
```

**끄고 싶으면 그 `moai.cmd` 를 지우면 된다.** 그 밖에 건드린 곳은 없다.

`boot.cmd` 의 주석이 영어인 것은 취향이 아니다 — 배치 파일은 콘솔
코드페이지로 읽히는데, 한글 주석을 넣으면 그게 **명령으로 해석돼** 부팅할
때마다 오류가 쏟아진다. UTF-8 도 CP949 도 마찬가지였다.

### 유령 프로세스

예전에는 서버를 cmd 창으로 띄웠다(`cmd → pnpm → nest --watch → node`).
창을 닫으면 맨 앞 `cmd` 만 죽고 그 아래는 부모 없이 살아남는다. 이것이
2주치 쌓여 59개가 됐고, 결과가 이랬다 —

- 살아남은 `nest --watch` 가 4000 번을 물어 **`EADDRINUSE`**
- 그 watch 가 방금 고친 파일을 **옛 코드로 다시 컴파일**하며 TS 에러를 뿜음
- 프로세스가 60개를 넘자 윈도우가 **`0x800700e8`** 로 실행을 거부

특히 두 번째가 고약했다. 고친 코드가 아니라 **유령이 뱉는 옛 에러**를
붙들고 원인을 찾게 되기 때문이다.

```bash
node scripts/cleanup-ghosts.mjs          무엇을 지울지 보여주기만
node scripts/cleanup-ghosts.mjs --kill   실제로 지우기
```

지금은 PM2 가 `node dist/main.js` 를 **한 겹으로** 띄우므로 더 생기지 않는다.
부팅할 때도 한 번 훑는다.

---

## 남은 작업

- [ ] 인증 (Supabase Auth 연동, 현재는 시드 계정 사용)
- [ ] 산출물 스토리지 업로드 (현재 agent 로컬에만 생성)
- [ ] pgvector 임베딩 파이프라인 (현재 RAG 는 최신순 단순 조회)
- [ ] 양식 추가 — 기업마당 / R&D / IR
- [ ] 섹션 직접 편집 UI
- [ ] hwpx 출력
- [ ] DB 마이그레이션 전환 (현재 `synchronize: true`)

---

## 판정 캐시와 로컬 분석 워커

공고가 늘어나면 매번 전부 계산할 수 없으므로, **기업 × 공고 조합을 캐시**한다.

```
eligibility_checks
  company_profile_id + grant_id   (유니크)
  hard_level / hard_reasons        1단계 — 코드로 계산
  soft_status / soft_reasons       2단계 — 로컬 LLM
  grant_version / profile_version  캐시 무효화 기준
```

### 재검사 조건

한 번 판정하면 다시 계산하지 않는다. 아래일 때만 다시 돈다.

- 아직 판정한 적이 없음
- 공고 내용이 바뀜 (`grant_version` 불일치)
- 기업 정보가 바뀜 (`profile_version` 불일치)

접수가 끝난 공고와 **하드 필터에서 이미 탈락한 조합은 LLM 판정을 돌리지 않는다.**

### API

| 메서드 | 경로 | 설명 |
|---|---|---|
| POST | `/api/grants/eligibility/sweep` | 하드 필터 스윕 (배치용) |
| POST | `/api/grants/eligibility/analyze` | 스윕 + 로컬 워커 호출 ("사업 분석하기") |
| GET | `/api/grants/eligibility/pending` | 판정 대기열 (하드 필터 통과분만) |
| POST | `/api/grants/eligibility/:id/result` | 판정 결과 수신 |

### 로컬 분석 워커 (Gemma)

`apps/agent` 가 Ollama 로 Gemma 를 돌려 2단계 판정을 수행한다.

```bash
# 1. https://ollama.com 에서 Ollama 설치
# 2. 모델 받기
ollama pull gemma3:4b
# 3. agent/.env 에서 워커 켜기 (미리 분석)
ELIGIBILITY_WORKER=true
WORKER_INTERVAL_MS=300000
```

- **미리 분석**: `ELIGIBILITY_WORKER=true` 면 주기적으로 대기열을 비운다
- **즉시 분석**: 대시보드의 "사업 분석하기" 버튼 → `POST /eligibility/analyze`

Ollama 가 없어도 하드 필터 결과는 정상 표시된다. 세부 조건 분석만 보류된다.

프롬프트에서 모델에게 강제하는 규칙:

1. 공고에 없는 조건을 만들어내지 말 것
2. 신청자 정보로 확인할 수 없는 조건은 반드시 `unknown` 으로 둘 것
3. 판단 근거가 된 공고 문구를 그대로 인용할 것 (`soft_quotes`)
