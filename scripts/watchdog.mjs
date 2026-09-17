/**
 * 지켜보는 쪽.
 *
 * **왜 PM2 만으로는 모자란가.** PM2 는 프로세스가 살아 있으면 멀쩡한 줄
 * 안다. 그런데 실행기(agent)가 며칠 켜져 있다가 조용히 맛이 간 적이 있다 —
 * 포트는 열려 있고 `/health` 도 200 을 돌려주는데, 정작 요약을 만들라고
 * 하면 500 이 났다. 프로세스는 살아 있었으니 PM2 는 아무 일도 안 했고,
 * 사용자가 버튼을 눌러 실패한 뒤에야 드러났다.
 *
 * 그래서 **일을 할 수 있는 상태인지**를 따로 물어본다. 두 번 잇달아 답을
 * 못 하면 그때 다시 띄운다 — 한 번은 그냥 느렸을 수 있어서다.
 */
import { execFile } from 'node:child_process';
import { promisify } from 'node:util';

const run = promisify(execFile);

/** 얼마나 자주 물어볼 것인가 */
const EVERY_MS = 60_000;

/**
 * 몇 번 연속으로 실패해야 다시 띄울 것인가.
 *
 * 한 번으로 재시작하면, 잠깐 느렸을 뿐인데 일하던 것을 끊어 버린다.
 * 요약 한 장이 1~2분 걸리므로 그 사이에 끊기면 사용자가 손해다.
 */
const FAILS_BEFORE_RESTART = 2;

const TARGETS = [
  { name: 'moai-api', url: 'http://localhost:4000/api/grants/stats' },
  { name: 'moai-agent', url: 'http://localhost:4100/health' },
  { name: 'moai-web', url: 'http://localhost:3000' },
];

const fails = new Map(TARGETS.map((t) => [t.name, 0]));

const stamp = () => new Date().toISOString().slice(0, 19).replace('T', ' ');
const log = (msg) => console.log(`[${stamp()}] ${msg}`);

async function alive(url) {
  try {
    const res = await fetch(url, {
      signal: AbortSignal.timeout(10_000),
      /* 요청 로그에서 빼기 위한 표시 - 2분 반마다 도는 것이라 안 빼면 그것만 쌓인다 */
      headers: { 'user-agent': 'moai-healthcheck' },
    });
    /*
     * 401 도 살아 있는 것이다 — 로그인을 요구한다는 뜻이니 서버는 답하고
     * 있다. 500 대만 죽은 것으로 본다.
     */
    return res.status < 500;
  } catch {
    return false;
  }
}

async function restart(name) {
  try {
    await run('pm2', ['restart', name], { shell: true, timeout: 60_000 });
    log(`${name} 다시 띄웠습니다.`);
  } catch (err) {
    log(`${name} 재시작 실패: ${String(err).slice(0, 120)}`);
  }
}

async function check() {
  for (const t of TARGETS) {
    const ok = await alive(t.url);

    if (ok) {
      if (fails.get(t.name) > 0) log(`${t.name} 돌아왔습니다.`);
      fails.set(t.name, 0);
      continue;
    }

    const n = fails.get(t.name) + 1;
    fails.set(t.name, n);
    log(`${t.name} 응답 없음 (${n}/${FAILS_BEFORE_RESTART})`);

    if (n >= FAILS_BEFORE_RESTART) {
      fails.set(t.name, 0);
      await restart(t.name);
    }
  }
}

log(`지켜보기 시작 — ${EVERY_MS / 1000}초마다 확인합니다.`);
await check();
setInterval(() => void check(), EVERY_MS);
