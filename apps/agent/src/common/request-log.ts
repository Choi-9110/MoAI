import type { LoggerService } from '@nestjs/common';
import type { NextFunction, Request, Response } from 'express';

/**
 * 들어온 요청을 한 줄씩 남긴다 — **무엇을 했고, 됐는가.**
 *
 * **왜 필요한가.** 이 서비스는 창 없이 백그라운드로 돈다. 그래서 누가
 * 무엇을 눌렀는지, 그게 됐는지 안 됐는지 알 길이 없었다. 로그에는 수집
 * 기록과 사업계획서 작업만 남았고, 정작 **사용자가 버튼을 눌러 실패한
 * 순간**은 아무 데도 안 남았다. "안 돼요" 라는 말을 들어도 확인할 것이
 * 없는 상태였다.
 *
 * NestJS 는 요청을 기본으로 남기지 않는다. 이 파일이 그 자리를 채운다.
 *
 *     [요청] POST /api/plan/section        200   1243ms
 *     [요청] GET  /api/grants?page=2       200     87ms
 *     [요청] POST /api/auth/login          401     12ms  ← 실패
 *
 * ─────────────────────────────────────────────────────────────
 * **`finish` 를 기다린다.** 요청이 들어온 시점에 찍으면 결과를 모른다.
 * 응답을 다 보낸 뒤에 찍어야 상태 코드와 걸린 시간이 함께 남는다.
 *
 * **실패는 눈에 띄게 남긴다.** 400 이상은 `← 실패` 를 붙이고 WARN 으로
 * 올린다. 로그가 길어졌을 때 `실패` 로 한 번 걸러 볼 수 있어야 한다.
 *
 * **비밀번호·토큰은 지운다.** 주소에 붙어 오는 값 중 이름이 수상한 것은
 * 값을 가린다. 이 로그는 파일로 남고, 남은 것은 지우기 전까지 남는다.
 */

/** 값이 남으면 안 되는 것들 — 주소에 붙어 오더라도 가린다 */
const SECRET = /token|key|secret|password|passwd|pwd|code|auth|session/i;

/**
 * 남기지 않는 요청.
 *
 * 브라우저가 알아서 보내는 것(preflight, favicon)은 사람이 한 일이 아니다.
 */
const SKIP = /^\/(api\/)?(health|favicon\.ico)$/;

/**
 * 감시용 요청도 남기지 않는다.
 *
 * watchdog 은 **2분 반마다** `/api/grants/stats` 를 부른다. 이건 사용자가
 * 누른 것이 아닌데, 안 빼면 하루 576줄이 쌓여서 **정작 봐야 할 줄이 그
 * 사이에 파묻힌다.** 남기는 이유가 "무슨 일이 있었나 보려고" 인데 그걸
 * 스스로 방해하는 셈이다.
 *
 * 주소로 거르지 않는 것은 `/api/grants/stats` 가 사용자도 쓰는 주소이기
 * 때문이다. 부르는 쪽이 스스로 밝히게 하는 편이 정확하다 —
 * `scripts/watchdog.mjs`, `status.mjs`, `deploy.mjs` 가 이 이름을 달고 온다.
 */
const HEALTHCHECK = 'moai-healthcheck';

/** `?page=2&token=abc` → `?page=2&token=***` */
function safeQuery(url: string): string {
  const q = url.indexOf('?');
  if (q === -1) return url;

  const params = new URLSearchParams(url.slice(q + 1));
  for (const name of [...params.keys()]) {
    if (SECRET.test(name)) params.set(name, '***');
  }
  return `${url.slice(0, q)}?${params.toString()}`;
}

export function requestLog(logger: LoggerService) {
  return (req: Request, res: Response, next: NextFunction): void => {
    const ua = req.headers['user-agent'];
    if (req.method === 'OPTIONS' || SKIP.test(req.path) || ua === HEALTHCHECK) {
      return next();
    }

    const started = Date.now();

    /*
     * `finish` 는 응답을 끝까지 보냈을 때 온다. 사용자가 중간에 창을
     * 닫으면 오지 않으므로 `close` 도 같이 듣는다 — 그 경우도 알아야
     * 한다. 다만 둘 다 올 수 있어서 한 번만 찍도록 막아 둔다.
     */
    let done = false;
    const write = (aborted: boolean) => {
      if (done) return;
      done = true;

      const ms = Date.now() - started;
      const line =
        `${req.method.padEnd(6)} ${safeQuery(req.originalUrl).padEnd(38)} ` +
        `${res.statusCode}  ${String(ms).padStart(6)}ms`;

      if (aborted) logger.warn?.(`${line}  ← 끊김 (사용자가 기다리지 않음)`, '요청');
      else if (res.statusCode >= 400) logger.warn?.(`${line}  ← 실패`, '요청');
      else logger.log?.(line, '요청');
    };

    res.on('finish', () => write(false));
    res.on('close', () => write(!res.writableEnded));

    next();
  };
}
