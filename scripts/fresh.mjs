/**
 * 처음부터 다시 — 싹 지우고, 새로 짓고, 새로 띄운다.
 *
 * **`pnpm run deploy` 와 무엇이 다른가.** deploy 는 도는 것을 건드리지 않고
 * 필요한 것만 갈아 끼운다. 평소에는 그게 맞다. 하지만 그 방식은 **이미
 * 이상해진 상태는 그대로 물려받는다** — 재시작 횟수가 쌓인 프로세스,
 * PM2 가 예전에 읽어 둔 낡은 설정, 죽다 만 채 포트를 쥔 유령 같은 것들.
 *
 * 그럴 때 쓰는 것이 이쪽이다. PM2 목록을 통째로 지우고 `ecosystem.config.js`
 * 를 다시 읽어 올리므로, **방금 컴퓨터를 켠 것과 같은 상태**가 된다.
 *
 * ─────────────────────────────────────────────────────────────
 * **순서가 곧 안전장치다.**
 *
 *   1. 유령 정리      포트를 쥔 채 죽다 만 개발용 프로세스를 치운다
 *   2. 빌드          ← 여기서 실패하면 **아래로 내려가지 않는다**
 *   3. 지우고 띄우기  PM2 목록을 비우고 설정 파일대로 새로
 *   4. 확인          뜰 때까지 기다렸다가 상태를 본다
 *
 * 빌드를 **지우기 전에** 하는 것이 핵심이다. 순서를 바꾸면 깨진 코드로
 * 빌드가 실패했을 때 이미 서비스를 내린 뒤라 손쓸 수가 없다. 지금 순서면
 * 빌드가 깨져도 돌던 것이 계속 돈다 — 사용자는 아무것도 못 느낀다.
 *
 * ─────────────────────────────────────────────────────────────
 * **언제 쓰나.**
 *
 *   · 뭘 해도 이상할 때 (재시작 횟수가 계속 오르거나, 응답이 오락가락)
 *   · ecosystem.config.js 를 고쳤을 때 — PM2 는 처음 읽은 설정을 계속
 *     쓰기 때문에, 지웠다 올리지 않으면 고친 설정이 반영되지 않는다
 *   · 오래 켜 둔 뒤 한 번 정리하고 싶을 때
 *
 * 평소에 고친 것 반영은 `pnpm run deploy` 가 낫다. 이쪽은 다 내렸다
 * 올리므로 1~2분쯤 끊긴다.
 *
 *   pnpm run fresh
 */
import { execFileSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import path from 'node:path';

const ROOT = path.dirname(path.dirname(fileURLToPath(import.meta.url)));

const sh = (cmd, args, opts = {}) =>
  execFileSync(cmd, args, { cwd: ROOT, stdio: 'inherit', shell: true, ...opts });

/** 실패해도 계속 가는 것들 — 없어서 못 지우는 건 문제가 아니다 */
const trySh = (cmd, args) => {
  try {
    sh(cmd, args);
  } catch {
    /* 지울 게 없었을 뿐이다 */
  }
};

console.log('\n▶ 1/4  유령 정리\n');
trySh('node', [path.join(ROOT, 'scripts', 'cleanup-ghosts.mjs'), '--kill']);

console.log('\n▶ 2/4  빌드 — 여기서 실패하면 지금 도는 것을 건드리지 않고 멈춥니다\n');
/*
 * 공용 코드를 먼저 짓는다. 세 앱이 전부 여기에 기대므로, 이것이 낡아
 * 있으면 나머지가 옛 타입을 보고 그냥 통과해 버린다.
 */
sh('pnpm', ['--filter', '@moai/shared', 'build']);
for (const pkg of ['@moai/api', '@moai/agent', '@moai/web']) {
  sh('pnpm', ['--filter', pkg, 'build']);
}

console.log('\n▶ 3/4  전부 내리고 새로 띄우기\n');
/*
 * `restart` 가 아니라 `delete` 다. PM2 는 프로세스를 처음 띄울 때 읽은
 * 설정을 계속 들고 있어서, 재시작만 해서는 ecosystem.config.js 를 고쳐도
 * 반영되지 않는다. 지웠다 올려야 설정 파일을 다시 읽는다.
 * 재시작 횟수가 0 으로 돌아가는 것도 이때다.
 */
trySh('pm2', ['delete', 'all']);
sh('pm2', ['start', 'ecosystem.config.js']);
sh('pm2', ['save']);

console.log('\n▶ 4/4  확인\n');
/*
 * `--wait` 없이 바로 찍으면 당연히 빨간 줄이 뜬다. 방금 올렸으니까.
 * 그 헛것을 한 번 보고 나면 다음에 진짜 문제가 떴을 때도 넘기게 된다.
 */
try {
  sh('node', [path.join(ROOT, 'scripts', 'status.mjs'), '--wait']);
} catch {
  /* status 가 문제를 찾으면 1 로 끝난다 — 그 내용은 이미 화면에 찍혔다 */
  process.exitCode = 1;
}
