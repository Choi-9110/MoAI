import { Injectable, Logger } from '@nestjs/common';

/**
 * 로컬 실행기를 쓰는 작업의 대기열.
 *
 * 요약 한 장도 사업계획서도 결국 **같은 PC 의 Claude CLI 한 대**를 쓴다.
 * 서비스마다 따로 세면 각자 두 건씩 돌려 실제로는 네 건이 뜨므로,
 * 큐는 하나만 두고 둘이 나눠 쓴다.
 *
 * 제한 없이 받으면 누른 사람 수만큼 CLI 프로세스가 동시에 떠서 PC 메모리와
 * 구독 한도를 같이 태운다. 다섯 명이 동시에 누르면 다섯 명 모두 느려지거나
 * 다 같이 실패한다. 줄을 세우면 뒤로 밀릴 뿐 아무도 실패하지 않는다.
 *
 * 기다리는 쪽에는 순번도 예상 시간도 알리지 않는다. 절마다 걸리는 시간이
 * 재료에 따라 크게 달라서, 내놓은 숫자가 어긋나면 기다리는 사람이 더
 * 불안해진다. 어차피 백그라운드로 도는 일이라 창을 닫았다 와도 된다.
 */
@Injectable()
export class LocalQueueService {
  private readonly logger = new Logger(LocalQueueService.name);
  private readonly waiting: (() => Promise<void>)[] = [];
  private running = 0;

  /**
   * 동시에 돌릴 건수.
   *
   * 기본 2 다. 로컬 CLI 는 한 건마다 별도 프로세스로 뜨므로 이 값이 곧 PC
   * 부담이자 구독 한도 소모 속도다. 올릴 때는 메모리와 한도를 함께 보고 올린다.
   */
  private get maxConcurrent(): number {
    return Math.max(1, parseInt(process.env.LOCAL_MAX_CONCURRENT ?? '2', 10) || 2);
  }

  /** 줄에 세우고, 자리가 있으면 바로 보낸다. */
  enqueue(label: string, task: () => Promise<void>): void {
    this.waiting.push(task);

    if (this.running >= this.maxConcurrent) {
      this.logger.log(
        `대기 ${this.waiting.length}건 — 실행 중 ${this.running}/${this.maxConcurrent} (${label})`,
      );
    }
    this.pump();
  }

  /** 지금 상태 — 헬스체크나 운영 확인용 */
  get status(): { running: number; waiting: number; max: number } {
    return {
      running: this.running,
      waiting: this.waiting.length,
      max: this.maxConcurrent,
    };
  }

  /** 빈 자리만큼 꺼내 보낸다. 하나가 끝나면 다시 자기를 부른다. */
  private pump(): void {
    while (this.running < this.maxConcurrent && this.waiting.length > 0) {
      const task = this.waiting.shift()!;
      this.running += 1;

      void task()
        .catch((err) => {
          /*
           * 작업은 자기 오류를 스스로 기록하고 상태를 failed 로 남긴다.
           * 여기까지 새어 나온 것은 그러지 못한 경우이므로, 큐가 멈추지
           * 않게 삼키고 남긴다. 여기서 throw 하면 뒤에 선 사람이 영영
           * 자기 차례를 받지 못한다.
           */
          this.logger.error(`작업이 예외로 끝났습니다 — ${(err as Error).message}`);
        })
        .finally(() => {
          this.running -= 1;
          this.pump();
        });
    }
  }
}
