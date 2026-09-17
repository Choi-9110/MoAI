import type {
  AgencyType, ApplicantType, GrantCategory, Industry,
} from '@moai/shared';
import type { ParsedGrant } from './kstartup.parser';

/**
 * 기업마당(Bizinfo) 응답을 우리 스키마로 옮기는 룰 파서.
 *
 * **K-Startup 과 무엇이 다른가.** K-Startup 은 자격 조건을 코드로 내려준다
 * (`biz_enyy = "예비창업자,1년미만,3년미만"`). 기업마당은 그런 코드가 없다.
 * 대신 분야 대·중분류가 잘 정리돼 있고, **지자체 공고가 들어온다** —
 * 기초자치단체(구청) 단위까지. K-Startup 에는 없는 것들이다.
 *
 * 대신 접수기간이 사람이 쓴 문장이다. 1,524건을 세어 보면:
 *
 *     625건  2026-08-28 ~ 2026-09-30   ← 날짜로 읽을 수 있음
 *     618건  예산 소진 시까지
 *     130건  상시 접수
 *     150건  선착순 / 모집 완료시 / 세부사업별 상이 / 추후 공지 …
 *
 * **날짜가 있는 건 41% 뿐이다.** 나머지는 마감일이 존재하지 않는다.
 * 없는 날짜를 지어내지 않는다 — 원문을 그대로 보관하고 날짜는 null 로 둔다
 * (`ParsedGrant` 의 원칙: 확신이 없으면 null).
 */

/** 기업마당 공고 응답 1건 */
export interface BizinfoAnnouncement {
  pblancId: string | null;          // 공고 고유번호 (중복 방지 키)
  pblancNm: string | null;          // 공고명
  pblancUrl: string | null;         // 원문 링크
  bsnsSumryCn: string | null;       // 사업 요약 (HTML)
  reqstBeginEndDe: string | null;   // 접수기간 (자유 문장)
  reqstMthPapersCn: string | null;  // 신청 방법
  trgetNm: string | null;           // 지원 대상 (중소기업·소상공인 …)
  jrsdInsttNm: string | null;       // 소관 기관 (경기도·중소벤처기업부 …)
  excInsttNm: string | null;        // 수행 기관 (또는 "기초자치단체"·"직접수행")
  refrncNm: string | null;          // 문의처
  hashtags: string | null;          // "경영,부산,2026,기초자치단체,청년기업 …"
  pldirSportRealmLclasCodeNm: string | null; // 분야 대분류
  pldirSportRealmMlsfcCodeNm: string | null; // 분야 중분류
  printFileNm: string | null;       // 첨부 공고문 파일명
  printFlpthNm: string | null;      // 첨부 공고문 주소
  creatPnttm: string | null;        // 등록 일시
  updtPnttm: string | null;         // 수정 일시
  inqireCo: number | string | null; // 조회수
  totCnt: number | string | null;   // 전체 건수
  [key: string]: unknown;
}

/* ────────────── 분야 → 우리 카테고리 ────────────── */

/**
 * 대분류만으로는 부족해서 **중분류까지 본다.**
 * "경영" 하나에 시설·입지지원(=입주공간), 컨설팅(=멘토링), 교육이 다 들어 있다.
 *
 * 위에서부터 먼저 맞는 것을 쓴다.
 */
const REALM_MAP: { lclas: string; mlsfc?: string[]; category: GrantCategory }[] = [
  { lclas: '금융', category: 'loan' },                                  // 융자·보증·보험
  { lclas: '수출', category: 'export' },
  { lclas: '인력', category: 'employment' },
  { lclas: '창업', category: 'startup' },
  { lclas: '기술', category: 'rnd' },
  { lclas: '경영', mlsfc: ['시설', '입지'], category: 'space' },
  { lclas: '경영', mlsfc: ['교육'], category: 'education' },
  { lclas: '경영', mlsfc: ['컨설팅', '멘토'], category: 'mentoring' },
  { lclas: '경영', mlsfc: ['사업화', '상품화', '디자인'], category: 'funding' },
];

/**
 * "내수" 는 우리 카테고리에 대응하는 것이 없다(국내 판로·홍보).
 * `export` 는 화면에 "수출"로 보이므로 국내 홍보 공고에 붙이면 거짓이 된다.
 * 그래서 `etc` 로 두고 원래 분야를 rawMetadata 에 남긴다.
 */
export function parseRealm(
  lclas: string | null,
  mlsfc: string | null,
): GrantCategory {
  if (!lclas) return 'etc';

  for (const rule of REALM_MAP) {
    if (!lclas.includes(rule.lclas)) continue;
    if (!rule.mlsfc) return rule.category;
    if (rule.mlsfc.some((m) => (mlsfc ?? '').includes(m))) return rule.category;
  }
  return 'etc';
}

/* ────────────── 기관 ────────────── */

/**
 * `excInsttNm` 은 이름이 "수행기관"이지만 값이 두 종류로 섞여 온다 —
 * 실제 기관명(경상북도경제진흥원)일 때도 있고, 수행 방식(기초자치단체·직접수행)
 * 일 때도 있다. 후자는 기관 이름이 아니므로 화면에 내보내면 안 된다.
 */
const NOT_AN_AGENCY = ['기초자치단체', '광역자치단체', '직접수행', '위탁수행'];

export function parseAgency(row: BizinfoAnnouncement): string {
  const exec = (row.excInsttNm ?? '').trim();
  if (exec && !NOT_AN_AGENCY.includes(exec)) return exec;
  return (row.jrsdInsttNm ?? '').trim() || '기타';
}

/** 소관 기관 이름으로 기관 유형을 정한다 */
export function parseAgencyType(jrsdInsttNm: string | null): AgencyType {
  const name = (jrsdInsttNm ?? '').trim();
  if (!name) return 'public';
  if (/(부|처|청)$/.test(name)) return 'central';
  if (/(도|시|군|구)$/.test(name)) return 'local';
  if (/(진흥원|테크노파크|공단|재단|センター|센터|협회|진흥회)/.test(name)) return 'public';
  return 'public';
}

/* ────────────── 접수기간 ────────────── */

/** 코드표에 정의된 지역 해시태그 */
const REGION_TAGS = [
  '서울', '부산', '대구', '인천', '전남광주', '대전', '울산', '세종',
  '경기', '강원', '충북', '충남', '전북', '경북', '경남', '제주',
];

export interface ParsedPeriod {
  start: Date | null;
  end: Date | null;
  /** 날짜로 읽지 못한 경우의 원문 — 화면에 그대로 보여 준다 */
  note: string | null;
}

/**
 * 접수기간을 읽는다.
 *
 * 날짜로 읽히면 날짜를, 아니면 **원문을 그대로** 남긴다.
 * "상시 접수"를 마감일 없음으로 바꾸는 것은 정보를 지우는 게 아니라
 * 사실 그대로다 — 그 공고에는 실제로 마감일이 없다.
 */
export function parsePeriod(raw: string | null): ParsedPeriod {
  const text = (raw ?? '').trim();
  if (!text) return { start: null, end: null, note: null };

  const range = /(\d{4})[-.]?(\d{2})[-.]?(\d{2})\s*~\s*(\d{4})[-.]?(\d{2})[-.]?(\d{2})/.exec(text);
  if (range) {
    const [, y1, m1, d1, y2, m2, d2] = range;
    return {
      start: toDate(y1, m1, d1),
      // 마감일은 그날 끝까지다. 자정으로 두면 당일 공고가 이미 지난 것으로 보인다.
      end: toDate(y2, m2, d2, true),
      note: null,
    };
  }

  return { start: null, end: null, note: text };
}

function toDate(y: string, m: string, d: string, endOfDay = false): Date | null {
  const date = new Date(
    `${y}-${m}-${d}T${endOfDay ? '23:59:59' : '00:00:00'}+09:00`,
  );
  return Number.isNaN(date.getTime()) ? null : date;
}

/* ────────────── 지원 대상 ────────────── */

/**
 * `trgetNm` 은 "중소기업"·"소상공인"처럼 한 덩어리로 온다.
 *
 * **예비창업자를 포함하는 값이 없다.** 기업마당은 이미 사업자인 곳을 대상으로
 * 하는 공고가 대부분이다. 그래서 사업자 형태만 남기고, 애매하면 빈 배열
 * (= 제한 없음)로 둔다. 잘못 좁히면 지원 가능한 공고를 놓친다.
 */
export function parseApplicantTypes(trgetNm: string | null): ApplicantType[] {
  const t = (trgetNm ?? '').trim();
  if (!t) return [];

  // 법인 형태를 전제하는 대상
  if (/(사회적기업|협동조합|마을기업|법인)/.test(t)) return ['corporate'];

  // 사업자라면 개인·법인 모두 해당한다
  if (/(중소기업|소상공인|창업벤처|여성기업|장애인기업|제조업|기업)/.test(t)) {
    return ['individual', 'corporate'];
  }

  return [];
}

/**
 * 전국 사업으로 보는 기준.
 *
 * 기업마당은 **전국 사업에 16개 지역 태그를 전부 붙인다.** 그대로 옮기면
 * 중앙부처 공고가 "서울·부산·대구…" 16개 지역 한정으로 들어가, 지역 필터가
 * 켜진 사용자에게만 보이고 나머지에게는 사라진다.
 *
 * 12개(4분의 3) 이상이면 특정 지역을 노린 공고로 보기 어렵다. 세종이나
 * 제주 하나가 빠진 15개짜리도 실제로는 전국 사업이다.
 */
const NATIONWIDE_THRESHOLD = 12;

/**
 * 해시태그에서 지역만 골라낸다.
 *
 * 빈 배열은 **전국**을 뜻한다(K-Startup 파서와 같은 약속).
 */
export function parseRegions(hashtags: string | null): string[] {
  if (!hashtags) return [];
  const tags = hashtags.split(',').map((t) => t.trim());
  const regions = REGION_TAGS.filter((r) => tags.includes(r));
  return regions.length >= NATIONWIDE_THRESHOLD ? [] : regions;
}

/** HTML 로 오는 요약에서 글자만 남긴다 */
export function stripHtml(html: string | null): string | null {
  if (!html) return null;
  const text = html
    .replace(/<br\s*\/?>/gi, '\n')
    .replace(/<\/(p|div|li|tr)>/gi, '\n')
    .replace(/<[^>]+>/g, '')
    .replace(/&nbsp;/g, ' ')
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'")
    .replace(/&amp;/g, '&')
    .replace(/[ \t]+/g, ' ')
    .replace(/\n{3,}/g, '\n\n')
    .trim();
  return text || null;
}

/* ────────────── 변환 ────────────── */

/**
 * 공고 1건을 우리 스키마로 옮긴다.
 * 고유번호나 공고명이 없으면 저장하지 않는다 — 중복 판정을 할 수 없다.
 */
export function parseBizinfo(row: BizinfoAnnouncement): ParsedGrant | null {
  const externalId = (row.pblancId ?? '').trim();
  const title = (row.pblancNm ?? '').trim();
  if (!externalId || !title) return null;

  const period = parsePeriod(row.reqstBeginEndDe);
  const realm = row.pldirSportRealmLclasCodeNm ?? null;
  const mlsfc = row.pldirSportRealmMlsfcCodeNm ?? null;

  return {
    externalId,
    title,
    agency: parseAgency(row),
    agencyType: parseAgencyType(row.jrsdInsttNm),
    category: parseRealm(realm, mlsfc),
    summary: stripHtml(row.bsnsSumryCn),

    applyStartAt: period.start,
    applyEndAt: period.end,

    targetRegions: parseRegions(row.hashtags),
    targetIndustries: [] as Industry[], // 기업마당도 업종 코드는 주지 않는다
    minBusinessYears: null,
    maxBusinessYears: null,
    applicantTypes: parseApplicantTypes(row.trgetNm),
    minAge: null,
    maxAge: null,
    excludeTarget: null,
    applyTargetDetail: (row.trgetNm ?? '').trim() || null,

    sourceUrl: row.pblancUrl || null,
    sourceApi: 'bizinfo',

    /*
     * 마감일이 없는 공고(상시·예산 소진)를 닫힌 것으로 두면 목록에서 사라진다.
     * 실제로는 지금도 받고 있으므로 열린 것으로 본다.
     */
    isActive: period.end ? period.end.getTime() >= Date.now() : true,

    rawMetadata: {
      // 날짜로 읽지 못한 접수기간 — 화면에서 이 문구를 그대로 보여 준다
      applyPeriodText: period.note,
      applyMethod: stripHtml(row.reqstMthPapersCn),
      contact: (row.refrncNm ?? '').trim() || null,
      // 우리 카테고리에 없는 분야("내수")를 잃지 않도록 원문을 남긴다
      realm: [realm, mlsfc].filter(Boolean).join(' / ') || null,
      jurisdiction: (row.jrsdInsttNm ?? '').trim() || null,
      executor: (row.excInsttNm ?? '').trim() || null,
      hashtags: (row.hashtags ?? '').split(',').map((t) => t.trim()).filter(Boolean),
      // 첨부 공고문 — .hwp/.pdf 원문을 읽어야 할 때 쓴다
      attachment: row.printFileNm
        ? { name: row.printFileNm, url: row.printFlpthNm ?? null }
        : null,
      updatedAtSource: (row.updtPnttm ?? '').trim() || null,
    },
  };
}
