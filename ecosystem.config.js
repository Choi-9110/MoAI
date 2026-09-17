/**
 * 프로세스 관리 — 죽으면 알아서 다시 켜진다.
 *
 * **왜 필요한가.** 실행기(agent)가 며칠 켜져 있다가 조용히 맛이 갔다.
 * 포트는 열려 있고 `/health` 도 200 을 돌려주는데, 정작 요약을 만들라고
 * 하면 500 이 났다. 그 사실을 아무도 몰랐고, 사용자가 버튼을 눌러 실패한
 * 뒤에야 드러났다. 창을 네 개 띄워 두는 방식으로는 이걸 못 잡는다.
 *
 * PM2 는 세 가지를 해 준다 —
 *   1. 프로세스가 죽으면 다시 띄운다
 *   2. 컴퓨터를 켜면 알아서 시작한다 (`pm2 save` + 시작 프로그램 등록)
 *   3. 로그를 파일로 남긴다 (창을 닫아도 남는다)
 *
 * 다만 **떠 있는데 안에서 맛이 간 경우**는 PM2 도 모른다. 그건 따로
 * 지켜봐야 해서 `scripts/watchdog.mjs` 를 함께 둔다.
 *
 * ─────────────────────────────────────────────────────────────
 * **node 를 직접 띄운다 — 이유가 있다.**
 *
 * 처음에는 `cmd /c pnpm dev:api` 로 띄웠다. 그랬더니 겹이 다섯이 됐다.
 *
 *     PM2 → cmd.exe → pnpm.cmd → nest → node
 *
 * PM2 는 자기가 낳은 자식(`cmd.exe`)만 죽인다. 그 아래 손자·증손자는
 * 부모 없는 채로 살아남는다. 그래서 재시작할 때마다 **앞의 node 가
 * 4000 번을 붙잡은 채 남고**, 새로 뜬 쪽이 `EADDRINUSE` 로 터졌다.
 * 재시작 → 터짐 → PM2 가 또 재시작 → 또 터짐이 반복됐다.
 *
 * 겹을 하나로 줄이면 이 문제가 통째로 사라진다. PM2 가 죽이는 그 프로세스가
 * 곧 포트를 쥔 프로세스이기 때문이다.
 *
 * **대신 미리 빌드해야 한다.** 코드를 고쳤으면 `pnpm run deploy` 를 쓴다
 * (빌드 → 재시작을 한 번에 한다). `nest start --watch` 를 쓰지 않는 것은
 * 덤이 아니라 이득이다 — 그건 개발용이라 파일이 바뀔 때마다 다시
 * 컴파일하며 잠깐씩 죽는데, 실서비스에서 그럴 이유가 없다.
 *
 * 쓰는 법
 *   pnpm run deploy                   고친 것 반영 (빌드 + 재시작)
 *                                     ("run" 을 빼면 안 된다 - deploy 는
 *                                      pnpm 내장 명령이라 스크립트를 가린다)
 *   pm2 status                        상태 보기
 *   pm2 logs moai-agent               로그 보기
 *   pm2 save                          지금 목록을 기억 (부팅 때 이대로 뜬다)
 */
const path = require('path');

/** nvm4w 안에 있어 새 창에서는 PATH 에 없을 수 있다 */
const NODE_DIR = 'C:\\nvm4w\\nodejs';
const NODE = path.join(NODE_DIR, 'node.exe');

const app = (name, dir, entry, extraEnv) => ({
  name,
  script: entry,
  interpreter: NODE,

  /*
   * **cwd 가 중요하다.** 두 서버 모두 `envFilePath: ['.env.local', '.env']`
   * 로 설정을 읽는데, 이 경로가 상대 경로다. 실행 위치가 앱 폴더가 아니면
   * DB 주소도 API 키도 없는 채로 뜬다.
   */
  cwd: path.join(__dirname, dir),

  env: {
    NODE_ENV: 'production',
    PATH: `${NODE_DIR};${process.env.PATH}`,

    /*
     * **색깔을 끈다.**
     *
     * NestJS 로거는 터미널이라고 판단하면 글자에 색을 입힌다. 그 색이
     * 실제로는 `\x1b[38;5;3m` 같은 제어 문자인데, 파일로 흘러 들어가면
     * 아무도 해석해 주지 않는다. 로그를 열면 이렇게 보인다 —
     *
     *     [55555m[Nest] 60112  - [39m ...
     *
     * 원인을 찾겠다고 로그를 여는 자리에서 이게 제일 먼저 눈에 걸린다.
     * 우리 로그는 전부 파일로 가므로 색이 득이 될 일이 없다.
     */
    NO_COLOR: '1',
    FORCE_COLOR: '0',

    ...extraEnv,
  },

  /* 죽으면 다시 띄운다 */
  autorestart: true,
  /* 너무 빨리 반복해서 죽으면 잠시 쉬었다 — 무한 재시작으로 CPU 를 태우지 않는다 */
  min_uptime: '30s',
  max_restarts: 10,
  restart_delay: 3000,

  /*
   * 끝낼 시간을 넉넉히 준다. 요약 한 장이 1~2분 걸리므로, 재시작할 때
   * 하던 일을 마칠 틈을 주는 편이 낫다.
   */
  kill_timeout: 10_000,

  /* 로그는 파일로 — 창을 닫아도 남아야 나중에 원인을 찾는다 */
  time: true,
  merge_logs: true,
  windowsHide: true,
  out_file: path.join(__dirname, 'logs', `${name.replace('moai-', '')}.log`),
  error_file: path.join(__dirname, 'logs', `${name.replace('moai-', '')}.err.log`),
});

module.exports = {
  apps: [
    app('moai-api', 'apps/api', 'dist/main.js'),
    app('moai-agent', 'apps/agent', 'dist/main.js'),

    /*
     * Next 도 마찬가지로 한 겹이다. `next start` 라는 배치 대신 그 안의
     * 실제 스크립트를 node 로 바로 돌린다.
     */
    {
      ...app('moai-web', 'apps/web', 'node_modules/next/dist/bin/next'),
      args: 'start',
    },

    {
      ...app('moai-tunnel', '.', ''),
      script: path.join(__dirname, '.tools', 'cloudflared.exe'),
      interpreter: 'none',
      args: 'tunnel run moai',
    },

    {
      /*
       * 지켜보는 쪽.
       *
       * 떠 있는데 일을 못 하는 상태를 잡는다 — PM2 는 프로세스가 살아 있으면
       * 멀쩡한 줄 알기 때문에 이건 따로 봐야 한다.
       */
      ...app('moai-watchdog', '.', ''),
      script: path.join(__dirname, 'scripts', 'watchdog.mjs'),
    },
  ],
};
