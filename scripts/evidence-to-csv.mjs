/**
 * 증빙용 데이터셋을 CSV(엑셀용)로 바꾼다.
 *
 * `docs/evidence/dataset/*.json` 이 원본이다. JSON 은 프로그램이 읽기는
 * 좋지만 **심사자가 열어 볼 수 없다.** 3만 건이 든 파일 서른 개를 받아서
 * 무엇을 확인하겠는가. 그래서 엑셀에서 바로 열리는 표로 다시 낸다.
 *
 * 원본은 건드리지 않는다. 이 스크립트는 읽기만 하고 `docs/evidence/csv/` 에
 * 새로 쓴다. 공고 데이터가 갱신되면 다시 돌리면 된다.
 *
 *   node scripts/evidence-to-csv.mjs
 *
 * 표로 낼 때 원본 그대로 두면 안 되는 것이 셋 있어 손을 댔다.
 *
 * 1. **시각이 UTC 다.** `2026-11-30T14:59:59Z` 를 그대로 적으면 마감이
 *    11월 30일인지 12월 1일인지 사람이 알 수 없다. 한국 시각으로 바꿔 적는다.
 * 2. **코드값이 영어다.** `space`, `preliminary` 를 보고 입주공간·예비창업자를
 *    떠올릴 사람은 만든 사람뿐이다. 한글을 붙인다.
 * 3. **엑셀이 UTF-8 을 못 알아본다.** BOM 을 붙여야 한글이 깨지지 않는다.
 */

import fs from 'node:fs';
import path from 'node:path';

const ROOT = path.resolve(import.meta.dirname, '..');
const SRC = path.join(ROOT, 'docs/evidence/dataset');
const OUT = path.join(ROOT, 'docs/evidence/csv');

/* ── 코드값 → 한글 ────────────────────────────────────────────────── */

const CATEGORY = {
  funding: '사업화자금',
  space: '입주공간',
  education: '교육·멘토링',
  contest: '경진대회·행사',
  rnd: '기술개발(R&D)',
  loan: '융자',
  export: '수출·해외진출',
  employment: '인력·고용',
};

const AGENCY_TYPE = { central: '중앙부처', local: '지자체', public: '공공기관', private: '민간' };

const APPLICANT = { preliminary: '예비창업자', individual: '개인사업자', corporate: '법인' };

const RECURRENCE = { once: '단발', yearly: '연례' };

/** 코드값을 "한글(code)" 로. 모르는 코드는 그대로 둔다 — 숨기면 못 고친다. */
const label = (map, code) => (code == null ? '' : map[code] ? `${map[code]}(${code})` : code);

/* ── 값 다듬기 ────────────────────────────────────────────────────── */

/** UTC ISO → 한국 시각 `YYYY-MM-DD HH:mm`. 엑셀이 날짜로 인식하는 모양. */
function kst(iso) {
  if (!iso) return '';
  const t = new Date(iso);
  if (Number.isNaN(t.getTime())) return String(iso);
  const k = new Date(t.getTime() + 9 * 60 * 60 * 1000);
  const p = (n) => String(n).padStart(2, '0');
  return `${k.getUTCFullYear()}-${p(k.getUTCMonth() + 1)}-${p(k.getUTCDate())} ${p(k.getUTCHours())}:${p(k.getUTCMinutes())}`;
}

/**
 * 배열은 ` | ` 로 잇는다.
 *
 * 쉼표로 이으면 CSV 구분자와 헷갈리고, 세미콜론은 엑셀 로케일에 따라
 * 그 자체가 구분자다. 둘 다 아닌 것을 쓴다.
 */
const list = (arr, map) =>
  !Array.isArray(arr) || arr.length === 0
    ? ''
    : arr.map((v) => (map ? label(map, v) : v)).join(' | ');

const yn = (v) => (v === true ? 'Y' : v === false ? 'N' : '');

/** 셀 안에서 줄바꿈이 갈라지지 않게 CRLF 를 LF 로 통일한다. */
const text = (v) => (v == null ? '' : String(v).replace(/\r\n?/g, '\n'));

/** 큰따옴표·쉼표·줄바꿈이 있으면 감싸고, 안쪽 큰따옴표는 두 개로 만든다. */
function cell(v) {
  const s = text(v);
  return /[",\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
}

/** BOM 을 붙여 쓴다. 없으면 엑셀에서 한글이 깨진다. */
function writeCsv(file, header, rows) {
  const body = [header, ...rows].map((r) => r.map(cell).join(',')).join('\r\n');
  fs.writeFileSync(file, '﻿' + body + '\r\n', 'utf8');
  const kb = (fs.statSync(file).size / 1024).toFixed(0);
  console.log(`  ${path.basename(file).padEnd(22)} ${String(rows.length).padStart(6)}행  ${kb}KB`);
}

/* ── 표 정의 ──────────────────────────────────────────────────────── */

/**
 * 헤더는 한글과 원본 필드명을 함께 적는다.
 *
 * 한글만 적으면 스키마와 대조할 수 없고, 영문만 적으면 심사자가 읽지
 * 못한다. `fields.csv` 를 따로 열어 보게 만드는 것보다 헤더 한 줄에
 * 둘 다 적는 편이 낫다.
 */
const COLUMNS = [
  ['공고명 (title)', (r) => r.title],
  ['주관기관 (agency)', (r) => r.agency],
  ['기관구분 (agencyType)', (r) => label(AGENCY_TYPE, r.agencyType)],
  ['공고유형 (category)', (r) => label(CATEGORY, r.category)],
  ['접수시작 KST (applyStartAt)', (r) => kst(r.applyStartAt)],
  ['접수마감 KST (applyEndAt)', (r) => kst(r.applyEndAt)],
  ['접수중 (isActive)', (r) => yn(r.isActive)],
  ['지원대상 (applicantTypes)', (r) => list(r.applicantTypes, APPLICANT)],
  ['대상지역 (targetRegions)', (r) => list(r.targetRegions)],
  ['대상업종 (targetIndustries)', (r) => list(r.targetIndustries)],
  ['업력하한 (minBusinessYears)', (r) => r.minBusinessYears],
  ['업력상한 (maxBusinessYears)', (r) => r.maxBusinessYears],
  ['종업원수상한 (maxEmployees)', (r) => r.maxEmployees],
  ['연매출상한 (maxRevenue)', (r) => r.maxRevenue],
  ['지원금하한 (amountMin)', (r) => r.amountMin],
  ['지원금상한 (amountMax)', (r) => r.amountMax],
  ['요구인증 (requiredCertifications)', (r) => list(r.requiredCertifications)],
  ['대표자연령하한 (minAge)', (r) => r.minAge],
  ['대표자연령상한 (maxAge)', (r) => r.maxAge],
  ['법인한정 (corporationOnly)', (r) => yn(r.corporationOnly)],
  ['반복여부 (recurrence)', (r) => label(RECURRENCE, r.recurrence)],
  ['요약 (summary)', (r) => r.summary],
  ['지원자격 원문 (applyTargetDetail)', (r) => r.applyTargetDetail],
  ['제외대상 원문 (excludeTarget)', (r) => r.excludeTarget],
  ['공고원문 URL (sourceUrl)', (r) => r.sourceUrl],
  ['수집출처 (sourceApi)', (r) => r.sourceApi],
  ['원본 공고번호 (externalId)', (r) => r.externalId],
  ['적재일시 KST (createdAt)', (r) => kst(r.createdAt)],
  ['갱신일시 KST (updatedAt)', (r) => kst(r.updatedAt)],
  ['내부 식별자 (id)', (r) => r.id],

  /*
   * 여기부터는 정규화 전 원문이다.
   *
   * 앞의 컬럼은 우리가 해석한 결과고, 뒤의 컬럼은 기관이 실제로 써 놓은
   * 글자다. 해석이 맞는지 심사자가 직접 대조할 수 있어야 하므로 함께 낸다.
   */
  ['원문 지역 (raw.rawRegion)', (r) => r.rawMetadata?.rawRegion],
  ['원문 공고유형 (raw.rawCategory)', (r) => r.rawMetadata?.rawCategory],
  ['원문 지원대상 (raw.rawApplyTarget)', (r) => r.rawMetadata?.rawApplyTarget],
  ['원문 업력 (raw.rawBusinessYears)', (r) => r.rawMetadata?.rawBusinessYears],
  ['원문 대상연령 (raw.targetAge)', (r) => r.rawMetadata?.targetAge],
  ['원문 담당부서 (raw.department)', (r) => r.rawMetadata?.department],
  ['원문 연락처 (raw.contact)', (r) => r.rawMetadata?.contact],
  ['원문 우대사항 (raw.preferential)', (r) => r.rawMetadata?.preferential],
  ['통합공고 여부 (raw.integratedNotice)', (r) => r.rawMetadata?.integratedNotice],
];

/* ── 실행 ─────────────────────────────────────────────────────────── */

const files = fs
  .readdirSync(SRC)
  .filter((f) => f.endsWith('.json'))
  .sort();

if (files.length === 0) {
  console.error(`원본이 없다: ${SRC}`);
  process.exit(1);
}

const records = [];
for (const f of files) {
  const arr = JSON.parse(fs.readFileSync(path.join(SRC, f), 'utf8'));
  if (!Array.isArray(arr)) {
    console.error(`배열이 아니다: ${f}`);
    process.exit(1);
  }
  records.push(...arr);
}

/*
 * 마감이 가까운 것부터 위로 올린다.
 *
 * 파일에 적힌 순서(수집 순서)대로 두면 2012년 공고가 첫 줄에 온다. 여는
 * 사람이 가장 먼저 보고 싶은 것은 지금 낼 수 있는 공고다.
 */
records.sort((a, b) => {
  if (a.isActive !== b.isActive) return a.isActive ? -1 : 1;
  const x = a.applyEndAt ?? '';
  const y = b.applyEndAt ?? '';
  if (x && y) return x < y ? -1 : x > y ? 1 : 0;
  return x ? -1 : y ? 1 : 0;
});

fs.mkdirSync(OUT, { recursive: true });

const header = COLUMNS.map(([h]) => h);
const toRow = (r) => COLUMNS.map(([, get]) => get(r) ?? '');

console.log(`원본 ${files.length}개 파일 · ${records.length.toLocaleString('ko-KR')}건\n`);

writeCsv(path.join(OUT, 'grants.csv'), header, records.map(toRow));

const active = records.filter((r) => r.isActive);
writeCsv(path.join(OUT, 'grants-active.csv'), header, active.map(toRow));

/*
 * 요약표.
 *
 * 3만 행짜리 표를 열어 놓고 "몇 건인가"를 세는 사람은 없다. 세어 둔 수를
 * 따로 낸다. `stats.json` 을 그대로 옮기지 않고 원본에서 다시 세는 것은,
 * 세어 둔 수와 실제 데이터가 어긋나면 그 자체가 증빙 결함이기 때문이다.
 */
const count = (fn) => {
  const m = new Map();
  for (const r of records) {
    const k = fn(r);
    if (k == null) continue;
    m.set(k, (m.get(k) ?? 0) + 1);
  }
  return [...m].sort((a, b) => b[1] - a[1]);
};

const pct = (n) => `${((n / records.length) * 100).toFixed(1)}%`;
const summary = [];

summary.push(['전체', '수집 공고 총계', records.length, '100.0%']);
summary.push(['전체', '접수 진행 중', active.length, pct(active.length)]);
summary.push(['전체', '접수 마감·종료', records.length - active.length, pct(records.length - active.length)]);

for (const [k, n] of count((r) => r.sourceApi)) summary.push(['수집 출처', k, n, pct(n)]);
for (const [k, n] of count((r) => r.category)) summary.push(['공고 유형', label(CATEGORY, k), n, pct(n)]);
for (const [k, n] of count((r) => r.agencyType)) summary.push(['기관 구분', label(AGENCY_TYPE, k), n, pct(n)]);

/*
 * 필드별 채움률.
 *
 * 빈 칸이 얼마나 되는지 우리가 먼저 밝힌다. 심사에서 가장 나쁜 것은
 * 데이터가 비어 있는 것이 아니라, 비어 있는 것을 숨기다 들키는 것이다.
 */
for (const [h, get] of COLUMNS) {
  const n = records.filter((r) => {
    const v = get(r);
    return v !== null && v !== undefined && v !== '';
  }).length;
  summary.push(['필드 채움률', h, n, pct(n)]);
}

writeCsv(
  path.join(OUT, 'summary.csv'),
  ['구분', '항목', '건수', '비율'],
  summary,
);

console.log(`\n→ ${path.relative(ROOT, OUT).replace(/\\/g, '/')}`);
