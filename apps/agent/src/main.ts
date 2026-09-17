import { ConsoleLogger } from '@nestjs/common';
import { NestFactory } from '@nestjs/core';
import type { NestExpressApplication } from '@nestjs/platform-express';
import { AppModule } from './app.module';
import { requestLog } from './common/request-log';

/**
 * 받아 줄 요청 크기.
 *
 * 기본값은 100KB 인데, 사업계획서 요청은 공고 요약·근거 자료·앞서 쓴 절을
 * 함께 싣고 다녀 그 선을 쉽게 넘는다. 넘으면 `PayloadTooLargeError` 로
 * 튕기고, 사용자에게는 **문서가 절반쯤 쓰이다 멈춘 것**으로 보인다.
 *
 * 보내는 쪽에서 이미 줄여 두었지만(앞 절은 앞부분만), 한도는 넉넉히
 * 잡아 둔다. 이 프로세스는 `127.0.0.1` 로만 열려 있어 밖에서 큰 요청을
 * 밀어 넣을 수 없고, 그래서 한도를 조일 이유도 없다.
 */
const BODY_LIMIT = '64mb';

/**
 * **로그에 색을 넣지 않는다.**
 *
 * NestJS 로거는 기본으로 글자에 색을 입힌다. 그 색이 실제로는
 * `[38;5;3m` 같은 제어 문자라, 화면이 아닌 **파일**로 흘러가면
 * 아무도 해석해 주지 않는다. 로그를 열면 이렇게 보인다 —
 *
 *     [55555m[Nest] 60112  - [39m ...
 *
 * 원인을 찾겠다고 로그를 여는 자리에서 이게 제일 먼저 눈에 걸린다.
 * 무슨 큰 문제가 난 줄 알고 그 숫자부터 뒤지게 된다.
 *
 * 우리 로그는 PM2 를 거쳐 전부 파일로 간다. 색이 득이 될 자리가 없다.
 */
const logger = new ConsoleLogger({ colors: false });


/**
 * moai 로컬 실행기.
 *
 * 이 프로세스는 내 PC 에서 상시 실행되며,
 * Cloudflare Tunnel 을 통해 백엔드의 요청을 받는다.
 *
 *   cloudflared tunnel --url http://localhost:4100
 */
async function bootstrap() {
  const app = await NestFactory.create<NestExpressApplication>(AppModule, {
    // SSE 응답을 직접 제어하므로 body parser 만 사용한다.
    bodyParser: true,
    logger,
  });

  /* 맨 앞에 건다 - 뒤에 걸면 그 앞에서 튕긴 요청이 로그에 안 남는다 */
  app.use(requestLog(logger));

  app.useBodyParser('json', { limit: BODY_LIMIT });
  app.useBodyParser('urlencoded', { limit: BODY_LIMIT, extended: true });

  const port = parseInt(process.env.PORT ?? '4100', 10);
  await app.listen(port, '127.0.0.1');

  console.log(`[moai/agent] http://127.0.0.1:${port} 에서 대기 중`);
  console.log(
    process.env.AGENT_TOKEN
      ? '[moai/agent] 토큰 인증 활성화됨'
      : '[moai/agent] ⚠️  AGENT_TOKEN 미설정 — 터널 노출 전에 반드시 설정하세요',
  );
}
void bootstrap();
