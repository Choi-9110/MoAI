import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import {
  BID_BRIEF_SYSTEM_PROMPT, BID_DECISIONS, buildBidBriefPrompt,
} from '@moai/shared';
import type {
  BidBrief, BidDecision, BidNotice, BidRequirement,
} from '@moai/shared';
import { ClaudeCliService } from '../claude/claude-cli.service';
import { extractHangulText } from '../common/hangul';
import { BidDocumentService } from './bid-document.service';

/**
 * 입찰 공고 읽어주기.
 *
 * 제안요청서를 받아 "무엇을 준비해야 하는지"를 뽑는다. 실제 문서가 3만 자를
 * 넘기 때문에, 사람이 읽고 골라내던 일을 대신하는 것이 이 기능의 전부다.
 *
 * **대신 써 주지 않는다.** 요건을 짚어 주고 원문을 인용해 두면, 사람이
 * "이건 있고 이건 없다"를 채운다. 그다음이 제안서다.
 */
@Injectable()
export class BriefService {
  private readonly logger = new Logger(BriefService.name);

  constructor(
    private readonly config: ConfigService,
    private readonly cli: ClaudeCliService,
    private readonly documents: BidDocumentService,
  ) {}

  private get model(): string {
    // 3만 자를 읽고 요건을 골라내는 일이라 판정용 모델로는 모자란다.
    return this.config.get<string>('BRIEF_MODEL', 'claude-opus-5');
  }

  private get timeoutMs(): number {
    return parseInt(this.config.get<string>('BRIEF_TIMEOUT_MS', '600000'), 10);
  }

  /**
   * 한 번에 모델에 넣을 글자 수 상한.
   *
   * 첨부 세 개가 각각 3만 자면 9만 자가 되는데, 그중 상당 부분이 전자입찰
   * 유의서·일반조건처럼 **공고마다 똑같은 정형 문구**다. 앞쪽에 과업 내용이
   * 오므로 넘치면 뒤를 자르고, 자른 사실을 로그로 남긴다.
   */
  private get maxChars(): number {
    return parseInt(this.config.get<string>('BRIEF_MAX_CHARS', '60000'), 10);
  }

  async read(notice: BidNotice): Promise<BidBrief> {
    const files = await this.documents.fetchAll(notice);
    if (files.length === 0) {
      throw new Error(
        '읽을 수 있는 첨부가 없습니다. 나라장터에서 공고문을 직접 확인해 주세요.',
      );
    }

    /*
     * 한글 문서만 우리가 글자를 뽑는다. PDF·DOCX 는 CLI 가 직접 읽으므로
     * 여기서 손대지 않는다 — 지원사업 공고문을 다룰 때와 같은 기준이다.
     */
    const parts: string[] = [];
    const used: string[] = [];

    for (const file of files) {
      const hangul = await extractHangulText(file.name, file.bytes);
      if (hangul) {
        parts.push(`### ${file.name}\n${hangul.text}`);
        used.push(file.name);
        this.logger.log(`${file.name} — ${hangul.text.length}자 추출`);
      } else if (/\.(pdf|docx?|txt)$/i.test(file.name)) {
        /*
         * 한글이 아닌 문서는 지금 단계에서 글자를 못 뽑는다. 파일을 작업
         * 폴더에 두고 CLI 에게 읽히는 방법이 있지만, 그건 공고 하나마다
         * 폴더를 만들고 지우는 일이라 다음 단계로 미뤘다.
         */
        this.logger.warn(`${file.name} — 한글 문서가 아니라 이번 분석에서 제외`);
      }
    }

    if (parts.length === 0) {
      throw new Error(
        '첨부에서 글자를 뽑지 못했습니다. 한글(.hwp/.hwpx) 문서만 읽을 수 있습니다.',
      );
    }

    let text = parts.join('\n\n');
    const fullLength = text.length;
    if (text.length > this.maxChars) {
      text = text.slice(0, this.maxChars);
      this.logger.warn(
        `첨부 원문 ${fullLength}자 중 앞 ${this.maxChars}자만 사용합니다.`,
      );
    }

    const envelope = await this.cli.run({
      systemPrompt: BID_BRIEF_SYSTEM_PROMPT,
      prompt: buildBidBriefPrompt({
        title: notice.title,
        agency: notice.agency,
        kind: notice.kind,
        estimate: notice.estimate,
        text,
      }),
      model: this.model,
      timeoutMs: this.timeoutMs,
      maxTurns: 1,
    });

    if (envelope.is_error) {
      throw new Error(`Claude CLI 오류: ${envelope.subtype ?? '알 수 없음'}`);
    }

    const brief = this.parse(envelope.result ?? '');
    this.logger.log(
      `공고 읽기 완료 — ${brief.decision} / 요건 ${brief.requirements.length}개 ` +
        `(원문 ${fullLength}자, 파일 ${used.length}개)` +
        (envelope.total_cost_usd ? ` $${envelope.total_cost_usd.toFixed(4)}` : ''),
    );

    return { ...brief, sourceChars: fullLength, sourceFiles: used };
  }

  /* ────────────── 내부 ────────────── */

  private parse(raw: string): Omit<BidBrief, 'sourceChars' | 'sourceFiles'> {
    const start = raw.indexOf('{');
    const end = raw.lastIndexOf('}');
    if (start === -1 || end === -1) {
      throw new Error(`모델이 JSON 을 돌려주지 않았습니다: ${raw.slice(0, 160)}`);
    }

    let parsed: unknown;
    try {
      parsed = JSON.parse(raw.slice(start, end + 1));
    } catch {
      throw new Error(
        `모델 응답을 JSON 으로 읽지 못했습니다 (${raw.length}자). 끝부분: …${raw.slice(-120)}`,
      );
    }

    const doc = parsed as Partial<BidBrief>;

    /*
     * 요건에 id 가 없으면 화면에서 답을 붙일 곳이 사라진다. 모델이 빠뜨릴
     * 수 있으므로 여기서 채운다.
     */
    const requirements: BidRequirement[] = (doc.requirements ?? []).map(
      (r, i) => ({
        id: r.id?.trim() || `r${i + 1}`,
        label: String(r.label ?? '').trim() || '(이름 없음)',
        required: Boolean(r.required),
        quote: String(r.quote ?? '').trim(),
        points: typeof r.points === 'number' ? r.points : null,
        fallbackHint: r.fallbackHint ? String(r.fallbackHint).trim() : null,
      }),
    );

    /*
     * 모델이 엉뚱한 값을 주면 `unknown` 으로 떨어뜨린다. 여기서 잘못 정하면
     * 가격만 내면 되는 공고에 제안서를 쓰게 만든다.
     */
    const decision: BidDecision = BID_DECISIONS.includes(doc.decision as BidDecision)
      ? (doc.decision as BidDecision)
      : 'unknown';

    return {
      decision,
      summary: String(doc.summary ?? '').trim(),
      problem: doc.problem ? String(doc.problem).trim() : null,
      scope: Array.isArray(doc.scope) ? doc.scope.map(String) : [],
      requirements,
      documents: Array.isArray(doc.documents) ? doc.documents.map(String) : [],
      evaluation: doc.evaluation ? String(doc.evaluation).trim() : null,
    };
  }
}
