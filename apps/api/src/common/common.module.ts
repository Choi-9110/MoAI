import { Global, Module } from '@nestjs/common';
import { AttachmentStoreService } from './attachment-store.service';

/**
 * 어디서나 쓰는 것들.
 *
 * 지금은 작업에 딸린 파일을 맡아 두는 곳 하나뿐이다. 사업계획서 쪽과
 * 요약 한 장 쪽이 같은 저장소를 봐야 하므로 전역으로 둔다.
 */
@Global()
@Module({
  providers: [AttachmentStoreService],
  exports: [AttachmentStoreService],
})
export class CommonModule {}
