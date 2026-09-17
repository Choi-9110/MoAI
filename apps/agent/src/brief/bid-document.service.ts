import { Injectable, Logger } from '@nestjs/common';
import type { BidNotice } from '@moai/shared';

export interface FetchedDocument {
  name: string;
  bytes: Buffer;
}

/**
 * 입찰공고 첨부(규격서·제안요청서) 내려받기.
 *
 * **여기가 제안서 기능의 입구다.** 목록에 오는 정보는 제목·금액·마감뿐이고,
 * "무슨 일을 해야 하는지"는 전부 첨부에 있다. 실제로 받아 보면 제안요청서
 * 하나가 3만 자가 넘는다.
 *
 * 확장자 분포를 세어 보면 한글 문서가 가장 많다:
 *
 *     .hwp 93 · .hwpx 67 · .pdf 104 · .docx 3 · .zip 4 · .xlsx 5
 *
 * `.hwp` 와 `.hwpx` 를 합치면 160개로 PDF 보다 많다. 지원사업 공고문을 읽으려고
 * 만들어 둔 파서가 여기서 그대로 쓰인다.
 */
@Injectable()
export class BidDocumentService {
  private readonly logger = new Logger(BidDocumentService.name);

  /** 한 공고에서 받을 첨부 수 상한 — 앞쪽에 본문이 있고 뒤는 서식·별지다 */
  private static readonly MAX_FILES = 3;

  /** 첨부 하나의 크기 상한 */
  private static readonly MAX_BYTES = 20 * 1024 * 1024;

  /**
   * 읽을 가치가 있는 확장자.
   *
   * `.zip` 은 열어 봐야 무엇이 들었는지 알 수 있어 지금은 건너뛴다. 도면·서식
   * 이미지가 대부분이라 글자를 못 뽑는다.
   */
  private static readonly READABLE = /\.(hwpx?|pdf|docx?|txt)$/i;

  /**
   * 공고의 첨부를 받아 온다.
   *
   * 실패해도 예외를 던지지 않는다 — 첨부 하나를 못 받았다고 공고 전체를
   * 못 읽는 것으로 만들면, 나머지 멀쩡한 문서까지 버리게 된다.
   */
  async fetchAll(notice: BidNotice): Promise<FetchedDocument[]> {
    const targets = notice.attachments
      .filter((a) => BidDocumentService.READABLE.test(a.name))
      .slice(0, BidDocumentService.MAX_FILES);

    if (targets.length === 0) {
      this.logger.warn(`읽을 수 있는 첨부가 없습니다 — ${notice.bidNo}`);
      return [];
    }

    const got: FetchedDocument[] = [];
    for (const target of targets) {
      try {
        const res = await fetch(target.url, {
          signal: AbortSignal.timeout(30_000),
          redirect: 'follow',
        });
        if (!res.ok) {
          this.logger.warn(`첨부 응답 오류 ${res.status} — ${target.name}`);
          continue;
        }

        const bytes = Buffer.from(await res.arrayBuffer());
        if (bytes.length === 0) {
          this.logger.warn(`첨부가 비어 있습니다 — ${target.name}`);
          continue;
        }
        if (bytes.length > BidDocumentService.MAX_BYTES) {
          this.logger.warn(
            `첨부가 너무 큽니다 (${Math.round(bytes.length / 1024 / 1024)}MB) — ${target.name}`,
          );
          continue;
        }

        got.push({ name: target.name, bytes });
      } catch (err) {
        this.logger.warn(`첨부 내려받기 실패 — ${target.name}: ${(err as Error).message}`);
      }
    }

    this.logger.log(
      `첨부 ${got.length}/${targets.length}건 확보 — ${notice.bidNo} (${notice.title.slice(0, 24)})`,
    );
    return got;
  }
}
