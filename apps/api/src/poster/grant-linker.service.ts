import { Injectable, Logger } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Brackets, Repository } from 'typeorm';
import { matchGrant, normalizeTitle } from '@moai/shared';
import type { GrantMatch } from '@moai/shared';
import { Grant } from '../grants/entities/grant.entity';

/**
 * 올린 공고문이 우리 DB 의 어느 공고인지 찾는다.
 *
 * 찾아지면 사업에 묶어 둔다 — "공고 원문 보러가기"가 살아나고,
 * 마감일·지원금 같은 구조화된 정보를 그대로 쓸 수 있다.
 *
 * 못 찾아도 괜찮다. 사용자가 직접 골라 넣을 수 있게 해 두었다.
 * 자동으로 엉뚱한 공고를 묶는 것보다 못 찾았다고 하는 편이 낫다.
 */
/**
 * 마감이 지난 공고를 얼마나 봐줄지 (일).
 *
 * 이미 끝난 공고에 사업계획서를 쓸 일은 없다. 그런 것까지 후보에 넣으면
 * 목록만 지저분해진다. 다만 마감 당일·직후에 서류를 마무리하는 경우가 있어
 * 며칠은 남겨 둔다.
 */
const CLOSED_GRACE_DAYS = 3;

@Injectable()
export class GrantLinkerService {
  private readonly logger = new Logger(GrantLinkerService.name);

  constructor(
    @InjectRepository(Grant) private readonly grants: Repository<Grant>,
  ) {}

  /** 아직 쓸모 있는 공고인지 — 마감이 3일 넘게 지났으면 뺀다 */
  private notTooOld(): { sql: string; params: Record<string, unknown> } {
    const cutoff = new Date();
    cutoff.setDate(cutoff.getDate() - CLOSED_GRACE_DAYS);
    return {
      // 마감일이 없는 공고(상시 모집)는 지난 것이 아니므로 남긴다.
      sql: '(g.apply_end_at IS NULL OR g.apply_end_at >= :cutoff)',
      params: { cutoff },
    };
  }

  /**
   * 제목 후보들로 공고를 찾는다.
   *
   * 2만 건이 넘으므로 전부 비교할 수 없다. 제목에서 뽑은 낱말로
   * DB 에서 먼저 좁힌 뒤, 좁혀진 것만 정밀 비교한다.
   */
  async find(queries: (string | null | undefined)[]): Promise<GrantMatch | null> {
    const words = this.keywords(queries);
    if (words.length === 0) return null;

    const candidates = await this.candidates(words);
    if (candidates.length === 0) return null;

    const match = matchGrant(
      candidates.map((g) => ({ id: g.id, title: g.title })),
      queries,
    );

    if (match) {
      this.logger.log(
        `공고 연결 — "${match.matchedBy.slice(0, 30)}" → "${match.title.slice(0, 30)}" (${match.score.toFixed(2)})`,
      );
    } else {
      this.logger.log(
        `공고를 찾지 못함 — 후보 ${candidates.length}건, 낱말 [${words.join(', ')}]`,
      );
    }
    return match;
  }

  /**
   * 정밀 비교할 후보를 추린다.
   *
   * 공고가 2만 건이 넘어 전부 비교할 수 없다. 그렇다고 흔한 낱말로 한 번에
   * 넓게 훑으면("창업기업" 이 들어간 공고는 수천 건이다) 정작 찾는 공고가
   * 개수 제한에 잘려 나간다. 그래서 **낱말마다 따로 조금씩** 가져온다.
   */
  private async candidates(words: string[]): Promise<Grant[]> {
    const fresh = this.notTooOld();

    // 마감이 지난 공고는 아예 후보에 넣지 않는다.
    const base = () =>
      this.grants
        .createQueryBuilder('g')
        .select(['g.id', 'g.title'])
        .where(fresh.sql, fresh.params);

    // 1) 낱말을 모두 품은 공고 — 가장 정확하다
    const strict = base();
    words.slice(0, 4).forEach((w, i) => {
      strict.andWhere(`g.title ILIKE :s${i}`, { [`s${i}`]: `%${w}%` });
    });
    const exact = await strict.limit(50).getMany();

    // 2) 낱말별로 따로 — 흔한 낱말에 밀려 잘리지 않게
    const perWord = await Promise.all(
      words.map((w) =>
        base()
          .andWhere('g.title ILIKE :w', { w: `%${w}%` })
          .limit(80)
          .getMany(),
      ),
    );

    const seen = new Map<string, Grant>();
    for (const g of [...exact, ...perWord.flat()]) seen.set(g.id, g);
    return [...seen.values()];
  }

  /** 사용자가 직접 고를 수 있도록 검색해 준다 */
  async search(term: string, limit = 20): Promise<Grant[]> {
    const q = term.trim();
    if (q.length < 2) return [];

    const fresh = this.notTooOld();

    /*
     * 마감이 지난 공고는 빼고 보여준다.
     * 지원할 수 없는 공고를 목록에 섞으면 고를 때 방해만 된다.
     */
    return this.grants
      .createQueryBuilder('g')
      .where('g.title ILIKE :q', { q: `%${q}%` })
      .andWhere(fresh.sql, fresh.params)
      // 마감이 임박한 것부터. 지금 준비해야 하는 게 위로 온다.
      .orderBy('g.apply_end_at', 'ASC', 'NULLS LAST')
      .limit(limit)
      .getMany();
  }

  /**
   * DB 를 좁힐 낱말을 고른다.
   *
   * 너무 흔한 말("공고", "모집", "지원사업")로 좁히면 좁혀지지 않는다.
   * 길고 드문 낱말일수록 좋다.
   */
  private keywords(queries: (string | null | undefined)[]): string[] {
    const COMMON =
      /^(공고|모집|지원|사업|안내|신청|참여|기업|창업|선정|교육|과제|사업화|프로그램|바우처|년도?|차년도)$/;

    const words = new Set<string>();
    for (const q of queries) {
      if (!q) continue;
      const cleaned = q
        .replace(/\.(pdf|hwpx?|docx?|txt|md|zip)$/i, '')
        .replace(/[^0-9A-Za-z가-힣\s]/g, ' ');

      for (const w of cleaned.split(/\s+/)) {
        if (w.length < 2 || COMMON.test(w)) continue;
        words.add(w);
      }
    }

    // 긴 낱말이 더 잘 좁힌다.
    return [...words].sort((a, b) => b.length - a.length).slice(0, 6);
  }

  /** 정규화 결과를 보고 싶을 때 (디버깅·표시용) */
  normalize(title: string): string {
    return normalizeTitle(title);
  }
}
