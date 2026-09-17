import type { BidKind, BidNotice } from '@moai/shared';

/**
 * 나라장터 응답 한 건을 화면용 형태로 옮긴다.
 *
 * 공사 공고는 필드가 100개가 넘지만 대부분 낙찰 계산에 쓰는 값이라
 * 목록·상세에 필요한 것만 추린다. 나머지는 원문 링크로 보낸다.
 */
export function parseBidNotice(
  row: Record<string, unknown>,
  kind: BidKind,
): BidNotice | null {
  const bidNo = str(row.bidNtceNo);
  const title = str(row.bidNtceNm);
  if (!bidNo || !title) return null;

  const ord = str(row.bidNtceOrd);

  return {
    // 같은 공고가 정정되면 차수만 올라간다. 둘을 합쳐야 서로 다른 건이 된다.
    id: ord ? `${bidNo}-${ord}` : bidNo,
    bidNo,
    ord: Number(ord ?? 0) || 0,
    title,
    kind,
    agency: str(row.ntceInsttNm) ?? '기타',
    demandAgency: str(row.dminsttNm),
    contractMethod: str(row.cntrctCnclsMthdNm),

    budget: num(row.bdgtAmt),
    estimate: num(row.presmptPrce),

    noticedAt: time(row.bidNtceDt),
    bidBeginAt: time(row.bidBeginDt),
    bidCloseAt: time(row.bidClseDt),
    openAt: time(row.opengDt),

    industryLimited: str(row.indstrytyLmtYn) === 'Y',
    participationFee: num(row.bidPrtcptFee),
    participationLimited: str(row.bidPrtcptLmtYn) === 'Y',

    successMethod: str(row.sucsfbidMthdNm),
    // "(없음)공동수급불허" 처럼 앞에 접수 방식이 붙어 온다
    jointAllowed: !/공동수급불허/.test(str(row.cmmnSpldmdMethdNm) ?? ''),
    bidMethod: str(row.bidMethdNm),
    noticeKind: str(row.ntceKindNm),
    canceled: /취소/.test(str(row.ntceKindNm) ?? ''),
    reNotice: str(row.reNtceYn) === 'Y' || /재공고/.test(str(row.ntceKindNm) ?? ''),
    siteRegion: str(row.cnstrtsiteRgnNm),

    url: str(row.bidNtceDtlUrl) ?? str(row.bidNtceUrl),
    attachments: attachments(row),
  };
}

/**
 * 첨부는 `ntceSpecFileNm1`~`10` / `ntceSpecDocUrl1`~`10` 으로 **번호가 붙어**
 * 온다. 배열이 아니라 필드가 열 개씩 있는 구조라 이렇게 모아야 한다.
 * 대부분 앞 한두 개만 차 있다.
 */
function attachments(row: Record<string, unknown>): { name: string; url: string }[] {
  const found: { name: string; url: string }[] = [];
  for (let i = 1; i <= 10; i++) {
    const name = str(row[`ntceSpecFileNm${i}`]);
    const url = str(row[`ntceSpecDocUrl${i}`]);
    if (name && url) found.push({ name, url });
  }
  return found;
}

function str(v: unknown): string | null {
  const s = typeof v === 'string' ? v.trim() : v == null ? '' : String(v).trim();
  return s || null;
}

/** 금액은 문자열로 올 때가 있다. 숫자가 아니면 null 이다. */
function num(v: unknown): number | null {
  if (v == null || v === '') return null;
  const n = Number(String(v).replace(/,/g, ''));
  return Number.isFinite(n) ? n : null;
}

/**
 * `2026-08-24 06:37:58` 형태로 온다.
 *
 * 한국시간인데 표시가 없어서, 그대로 `new Date()` 에 넣으면 브라우저가
 * 현지시각으로 읽어 9시간이 어긋난다. 마감이 걸린 화면이라 이 어긋남이
 * "오늘 마감" 을 "어제 마감" 으로 만든다.
 */
function time(v: unknown): string | null {
  const s = str(v);
  if (!s) return null;
  const m = /^(\d{4})-(\d{2})-(\d{2})[ T](\d{2}):(\d{2})(?::(\d{2}))?/.exec(s);
  if (!m) return s;
  const [, y, mo, d, h, mi, sec] = m;
  return `${y}-${mo}-${d}T${h}:${mi}:${sec ?? '00'}+09:00`;
}
