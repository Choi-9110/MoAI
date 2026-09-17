import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import type { BidKind } from '@moai/shared';

/**
 * 나라장터(조달청) 입찰공고 조회 클라이언트.
 *
 * **적재하지 않고 그때그때 부른다.** 입찰은 연 45만 건이 올라오는데 마감이
 * 1~2주라 지난 공고는 값이 거의 없다. 대신 API 가 지역·업종 필터를 서버쪽에서
 * 해 주므로, 사용자 조건을 그대로 넘겨 필요한 것만 받는다
 * (용역 7일치 3,093건 → 경기 한정 207건).
 *
 * **이 API 는 실패를 조용히 알린다.** 아래 셋은 전부 직접 부딪혀 확인한 것이다.
 */
@Injectable()
export class G2bClient {
  private readonly logger = new Logger(G2bClient.name);

  constructor(private readonly config: ConfigService) {}

  private get baseUrl(): string {
    return this.config.get<string>(
      'G2B_BASE_URL',
      'https://apis.data.go.kr/1230000/ad/BidPublicInfoService',
    );
  }

  private get serviceKey(): string {
    return this.config.get<string>('G2B_SERVICE_KEY', '');
  }

  get isConfigured(): boolean {
    return this.serviceKey.length > 0;
  }

  /**
   * 업무 구분별 오퍼레이션.
   * 구분에 맞지 않는 것을 부르면 빈 결과가 오므로 골라서 불러야 한다.
   */
  private static readonly OPERATION: Record<BidKind, string> = {
    cnstwk: 'getBidPblancListInfoCnstwkPPSSrch',
    servc: 'getBidPblancListInfoServcPPSSrch',
    thng: 'getBidPblancListInfoThngPPSSrch',
  };

  /**
   * 조회 기간 상한 — **31일**.
   *
   * 32일부터는 HTTP 200 에 `resultCode 07 입력범위값 초과 에러` 가 온다.
   * 우리가 넘기는 기간이 이보다 길면 잘라서 보낸다.
   */
  static readonly MAX_DAYS = 31;

  /**
   * 한 번에 받을 수 있는 최대 건수 — **999**.
   *
   * 1000 을 넣으면 **에러도 없이 조용히 10건**만 온다. 그래서 "왜 10건만
   * 오지" 로 한참 헤매게 된다. 여기서 잘라 그 함정을 막는다.
   */
  static readonly MAX_ROWS = 999;

  /**
   * 최근 공고에 걸린 면허 제한 목록.
   *
   * 공고 하나씩 묻지 않고 **기간으로 한 번에 받아 와 표에 담아 둔다.**
   * 목록에 스무 건이 있다고 스무 번 부르면 하루 호출 한도가 금방 닳는다.
   */
  async limits(
    kind: 'license' | 'region',
    days = 14,
    page = 1,
  ): Promise<{ total: number; rows: BidLimitRow[] }> {
    if (!this.isConfigured) return { total: 0, rows: [] };

    const span = Math.min(Math.max(days, 1), G2bClient.MAX_DAYS);
    const now = new Date();
    const from = new Date(now.getTime() - span * 86_400_000);

    const qs = new URLSearchParams({
      serviceKey: this.serviceKey,
      pageNo: String(Math.max(page, 1)),
      numOfRows: String(G2bClient.MAX_ROWS),
      type: 'json',
      inqryDiv: '1',
      inqryBgnDt: stamp(from, '0000'),
      inqryEndDt: stamp(now, '2359'),
    });

    const op =
      kind === 'license'
        ? 'getBidPblancListInfoLicenseLimit'
        : 'getBidPblancListInfoPrtcptPsblRgn';

    const res = await fetch(`${this.baseUrl}/${op}?${qs.toString()}`, {
      signal: AbortSignal.timeout(30_000),
    });
    if (!res.ok) throw new Error(`나라장터 응답 오류: ${res.status}`);

    const body = (await res.json()) as G2bResponse;
    const failure = body['nkoneps.com.response.ResponseError'];
    if (failure) {
      throw new Error(
        `나라장터 조회 실패 (${failure.header.resultCode}): ${failure.header.resultMsg}`,
      );
    }

    const items = body.response?.body?.items;
    const list = Array.isArray(items) ? items : items ? [items] : [];

    return {
      total: Number(body.response?.body?.totalCount ?? 0),
      rows: list.map((row) => ({
        bidNo: String(row.bidNtceNo ?? '').trim(),
        ord: String(row.bidNtceOrd ?? '').trim(),
        licenseName: str(row.lcnsLmtNm),
        allowedIndustries: str(row.permsnIndstrytyList),
        region: str(row.prtcptPsblRgnNm),
      })),
    };
  }

  /**
   * 입찰공고 목록.
   *
   * @param kind    업무 구분 (공사·용역·물품)
   * @param days    최근 며칠 — 31일까지
   * @param region  참가제한지역. **나라장터 표기여야 한다**(경북 ✗ / 경상북도 ✓)
   * @param industry 업종명. 실제 공고의 값 그대로여야 한다(구분자가 제각각이다)
   */
  async list({
    kind, days = 14, region, industry, rows = 200, page = 1,
  }: {
    kind: BidKind;
    days?: number;
    region?: string | null;
    industry?: string | null;
    rows?: number;
    page?: number;
  }): Promise<{ total: number; items: Record<string, unknown>[] }> {
    if (!this.isConfigured) {
      this.logger.warn('G2B_SERVICE_KEY 가 없어 입찰 조회를 건너뜁니다.');
      return { total: 0, items: [] };
    }

    const span = Math.min(Math.max(days, 1), G2bClient.MAX_DAYS);
    const now = new Date();
    const from = new Date(now.getTime() - span * 86_400_000);

    /*
     * **용역은 지역과 업종을 함께 걸 수 없다.**
     *
     * 조달청 쪽 문제다. 각각은 2~3초에 오는데 둘을 같이 보내면 45초를 줘도
     * 응답이 오지 않는다. 건수를 10으로 줄여도, 지역이나 업종을 바꿔도
     * 마찬가지였다. 공사는 같은 조합이 2초에 온다.
     *
     * 그래서 용역은 **업종만** 건다. 지역을 버리는 쪽을 고른 이유는 —
     *
     *   1. `prtcptLmtRgnNm` 은 "그 지역 업체만 참가 가능한 공고"를 찾는
     *      조건이라, 지역을 걸면 **전국 대상 공고가 결과에서 빠진다.**
     *      경기 업체는 둘 다 넣을 수 있는데 절반을 잃는 셈이다.
     *   2. 용역(소프트웨어·엔지니어링)은 현장이 없어 지역 제약이 공사보다
     *      약하다. 공사는 현장이 있어 지역이 결정적이라 그대로 둔다.
     */
    const regionUsable = kind !== 'servc';

    const qs = new URLSearchParams({
      serviceKey: this.serviceKey,
      pageNo: String(Math.max(page, 1)),
      numOfRows: String(Math.min(Math.max(rows, 1), G2bClient.MAX_ROWS)),
      type: 'json',
      inqryDiv: '1', // 공고게시일시 기준
      inqryBgnDt: stamp(from, '0000'),
      inqryEndDt: stamp(now, '2359'),
      ...(region && regionUsable ? { prtcptLmtRgnNm: region } : {}),
      ...(industry ? { indstrytyNm: industry } : {}),
    });

    const url = `${this.baseUrl}/${G2bClient.OPERATION[kind]}?${qs.toString()}`;
    const res = await fetch(url, { signal: AbortSignal.timeout(30_000) });
    if (!res.ok) {
      throw new Error(`나라장터 응답 오류: ${res.status} ${res.statusText}`);
    }

    const body = (await res.json()) as G2bResponse;

    /*
     * 실패해도 HTTP 200 으로 오고, 그때는 응답의 **최상위 키 자체가 다르다.**
     * `response.body.items` 만 보고 있으면 에러가 "0건" 으로 둔갑한다 —
     * 사용자는 "내 조건에 맞는 공고가 없구나" 로 읽고, 우리는 원인을 못 찾는다.
     */
    const failure = body['nkoneps.com.response.ResponseError'];
    if (failure) {
      throw new Error(
        `나라장터 조회 실패 (${failure.header.resultCode}): ${failure.header.resultMsg}`,
      );
    }

    const header = body.response?.header;
    if (header && header.resultCode !== '00') {
      throw new Error(`나라장터 조회 실패 (${header.resultCode}): ${header.resultMsg}`);
    }

    const items = body.response?.body?.items;
    return {
      total: Number(body.response?.body?.totalCount ?? 0),
      // 건수가 0이든 1이든 배열로 오는 것을 확인했지만, 형태가 바뀌어도 견디게 둔다.
      items: Array.isArray(items) ? items : items ? [items] : [],
    };
  }
}

/**
 * 공고에 걸린 **면허 제한**과 **참가 가능 지역**.
 *
 * 목록 응답은 `indstrytyLmtYn: 'Y'` 처럼 **있다/없다만** 알려 준다. 정작
 * "어떤 면허가 있어야 하는지"는 별도 오퍼레이션에 들어 있다:
 *
 *     식품판매업(집단급식소식품판매업)/5246
 *     허용업종: [식품제조·가공업/1399], [축산물가공업(식육가공업)/4004] …
 *
 * 공고 하나에 여러 줄이 붙으므로 공고번호로 묶어서 쓴다.
 */
export interface BidLimitRow {
  bidNo: string;
  ord: string;
  /** 필요한 면허 이름 (면허제한 조회) */
  licenseName?: string;
  /** 그 면허를 대신할 수 있는 업종들 */
  allowedIndustries?: string;
  /** 참가 가능 지역 (지역제한 조회) */
  region?: string;
}

/** `YYYYMMDDHHmm` — 이 API 는 분 단위까지 요구한다 */
function stamp(date: Date, hhmm: string): string {
  const p = (n: number) => String(n).padStart(2, '0');
  return `${date.getFullYear()}${p(date.getMonth() + 1)}${p(date.getDate())}${hhmm}`;
}

function str(v: unknown): string | undefined {
  const s = v == null ? '' : String(v).trim();
  return s || undefined;
}

interface G2bHeader {
  resultCode: string;
  resultMsg: string;
}

interface G2bResponse {
  response?: {
    header?: G2bHeader;
    body?: {
      totalCount?: number | string;
      items?: Record<string, unknown>[] | Record<string, unknown>;
    };
  };
  /** 실패 응답은 이 키로 온다 — 이름이 이렇게 생겼다 */
  'nkoneps.com.response.ResponseError'?: { header: G2bHeader };
}
