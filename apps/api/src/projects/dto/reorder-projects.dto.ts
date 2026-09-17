import { ArrayMaxSize, IsArray, IsUUID } from 'class-validator';

/**
 * 목록을 끌어서 옮긴 뒤의 순서.
 *
 * 옮긴 것 하나가 아니라 **화면에 보이는 순서 전체**를 보낸다.
 * 그래야 서버가 화면과 똑같이 매길 수 있다 — "3번을 1번 자리로" 같은
 * 표현은 그 사이에 다른 창에서 사업을 지우면 엉뚱한 곳을 가리킨다.
 */
export class ReorderProjectsDto {
  @IsArray()
  // 목록은 한 번에 100건까지만 내려간다. 그보다 긴 배열은 정상적인
  // 화면에서 나올 수 없으므로 받지 않는다.
  @ArrayMaxSize(100)
  @IsUUID('4', { each: true })
  ids!: string[];
}
