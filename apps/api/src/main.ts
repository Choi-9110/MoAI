import { ConsoleLogger, ValidationPipe } from '@nestjs/common';
import { NestFactory } from '@nestjs/core';
import type { NestExpressApplication } from '@nestjs/platform-express';
import { AppModule } from './app.module';
import { requestLog } from './common/request-log';

/**
 * 받아 줄 요청 크기.
 *
 * 기본값 100KB 는 사업계획서를 통째로 저장하는 요청에 모자란다. 여덟 절을
 * 다 쓴 문서는 그 선을 넘고, 그러면 저장이 조용히 실패한다.
 *
 * 다만 이쪽은 실행기와 달리 **터널로 밖에 열려 있다.** 그래서 넉넉하되
 * 무한은 아니게 둔다 — 파일 업로드는 따로 다루므로 본문이 이보다 커질
 * 이유가 없다.
 */
const BODY_LIMIT = '16mb';

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


async function bootstrap() {
  const app = await NestFactory.create<NestExpressApplication>(AppModule, {
    logger,
  });

  /*
   * 요청 기록은 **맨 앞에 건다.** 뒤에 걸면 그 앞에서 튕긴 요청
   * (본문이 너무 큰 경우 등)이 로그에 남지 않는다 - 정작 남아야 할
   * 실패가 빠지는 셈이다.
   */
  app.use(requestLog(logger));

  app.useBodyParser('json', { limit: BODY_LIMIT });
  app.useBodyParser('urlencoded', { limit: BODY_LIMIT, extended: true });

  app.setGlobalPrefix('api');
  app.enableCors({
    origin: (process.env.CORS_ORIGINS ?? 'http://localhost:3000').split(','),
    credentials: true,
  });

  app.useGlobalPipes(
    new ValidationPipe({
      whitelist: true,              // DTO 에 없는 필드는 제거
      forbidNonWhitelisted: true,   // 모르는 필드가 오면 400
      transform: true,              // 타입 자동 변환
      transformOptions: { enableImplicitConversion: true },
    }),
  );

  const port = parseInt(process.env.PORT ?? '4000', 10);
  await app.listen(port, '0.0.0.0');
  console.log(`[moai/api] http://localhost:${port}/api 에서 대기 중`);
}
void bootstrap();
