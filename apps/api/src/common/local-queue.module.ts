import { Global, Module } from '@nestjs/common';
import { LocalQueueService } from './local-queue.service';

/**
 * 대기열은 **하나만** 있어야 한다.
 *
 * 모듈마다 따로 만들면 각자 제 몫을 세어, 묶어 두려던 동시 실행 건수가
 * 서비스 수만큼 곱해진다. 전역으로 두어 어디서 주입하든 같은 인스턴스를
 * 받게 한다.
 */
@Global()
@Module({
  providers: [LocalQueueService],
  exports: [LocalQueueService],
})
export class LocalQueueModule {}
