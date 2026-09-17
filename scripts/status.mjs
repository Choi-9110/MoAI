/**
 * 지금 제대로 돌고 있나 — 한 번에 본다.
 *
 * **왜 필요한가.** 서버가 창 없이 백그라운드로 돌기 때문에, 화면만 봐서는
 * 도는지 죽었는지 알 수가 없다. `pm2 status` 는 프로세스가 살아 있는지만
 * 알려 주는데, 정작 문제가 됐던 것은 **살아 있는데 일을 못 하는 상태**였다.
 *
 * 그래서 여기서는 세 가지를 갈라서 본다 —
 *
 *   1. 프로세스가 떠 있는가          (PM2)
 *   2. 실제로 답을 하는가            (주소를 눌러 본다)
 *   3. 일을 할 수 있는 상태인가      (실행기에게 직접 물어본다)
 *
 * 그리고 매일 새벽에 도는 수집이 **오늘 돌았는지**까지 확인한다.
 * 지난번에 사흘치가 조용히 빠져 있었던 것이 이 확인이 없어서였다.
 *
 *   pnpm status
 */
import { execFileSync } from 'node:child_process';
import { readFileSync, existsSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import path from 'node:path';

const ROOT = path.dirname(path.dirname(fileURLToPath(import.meta.url)));

const OK = '✓';
const NO = '✗';

/**
 * 한글은 칸을 두 개 먹는다.
 *
 * `padEnd` 는 글자 수로 세기 때문에 한글이 섞이면 열이 어긋난다.
 * 화면에서 차지하는 폭으로 세야 줄이 맞는다.
 */
const width = (s) =>
  [...s].reduce((n, ch) => n + (/[ᄀ-ᅟ⺀-꓏가-힣豈-﫿︰-﹏＀-｠￠-￦]/.test(ch) ? 2 : 1), 0);

const pad = (s, n) => s + ' '.repeat(Math.max(0, n - width(s)));

/**
 * 옛 로그에 남은 색깔 제어 문자를 걷어낸다.
 *
 * 지금은 색을 끄고 찍지만, **그 전에 쌓인 줄**에는 `\x1b[39m` 같은 것이
 * 그대로 들어 있다. 그걸 그냥 보여 주면 읽는 사람이 그 숫자부터 의심한다 —
 * 애초에 이 도구를 만든 이유가 그런 걸 안 보게 하려는 것이다.
 */
// eslint-disable-next-line no-control-regex
const plain = (s) => s.replace(/\x1b\[[0-9;]*m/g, '');

let problems = 0;
const fail = (msg) => {
  problems += 1;
  return msg;
};

/**
 * `--wait` — 뜰 때까지 기다렸다가 본다.
 *
 * **왜 필요한가.** 방금 재시작한 직후에 검사하면 당연히 실패로 나온다.
 * Nest 는 뜨는 데 몇 초, Next 는 30초쯤 걸린다. 그 사이를 못 기다리고
 * 찍으면 `✗ API 응답 없음` 이 뜨는데, **아무 문제도 없는 상태다.**
 *
 * 이게 나쁜 이유는 틀린 값을 보여줘서가 아니라, 이 도구를 못 믿게
 * 만들기 때문이다. 한 번 헛것을 보고 나면 다음에 진짜 빨간 줄이 떴을 때도
 * "좀 있으면 되겠지" 하고 넘기게 된다.
 *
 * 그래서 켜는 스크립트(start-moai.cmd)는 `--wait` 로 부른다.
 * 사람이 직접 볼 때는 지금 이 순간을 알고 싶은 것이므로 기다리지 않는다.
 */
if (process.argv.includes('--wait')) {
  const UP = [
    'http://localhost:4000/api/grants/stats',
    'http://localhost:4100/health',
    'http://localhost:3000',
    /* 바깥 주소도 넣는다. 터널은 재시작 뒤 다시 붙는 데 몇 초 걸려서,
       빼 두면 여기만 502 로 뜬다 - 역시 없는 문제다. */
    'https://moai.drevv.co.kr',
  ];
  const LIMIT_MS = 150_000;

  const alive = (url) =>
    fetch(url, { signal: AbortSignal.timeout(5_000), headers: { 'user-agent': 'moai-healthcheck' } })
      .then((r) => r.status < 500)
      .catch(() => false);

  const t0 = Date.now();
  console.log('');
  process.stdout.write('  뜨기를 기다립니다');

  for (;;) {
    const up = await Promise.all(UP.map(alive));
    if (up.every(Boolean)) break;

    /* 못 기다렸다고 검사를 건너뛰지는 않는다 - 아래에서 뭐가 안 됐는지 찍어 준다 */
    if (Date.now() - t0 > LIMIT_MS) {
      process.stdout.write(' 시간이 걸리네요, 그냥 봅니다');
      break;
    }

    process.stdout.write('.');
    await new Promise((r) => setTimeout(r, 3_000));
  }

  console.log(` (${Math.round((Date.now() - t0) / 1000)}초)`);
}

/* ────────────── 1. 프로세스 ────────────── */

console.log('\n[1/4] 프로세스\n');

let procs = [];
try {
  procs = JSON.parse(
    execFileSync('pm2', ['jlist'], {
      encoding: 'utf8',
      shell: true,
      maxBuffer: 16 * 1024 * 1024,
    }),
  );
} catch {
  console.log(fail(`  ${NO} PM2 가 응답하지 않습니다 — pm2 resurrect 로 살리세요`));
}

const EXPECTED = ['moai-api', 'moai-agent', 'moai-web', 'moai-tunnel', 'moai-watchdog'];

for (const name of EXPECTED) {
  const p = procs.find((x) => x.name === name);
  if (!p) {
    console.log(fail(`  ${NO} ${pad(name, 15)} 없음`));
    continue;
  }
  const live = p.pm2_env.status === 'online';
  const mins = Math.round((Date.now() - p.pm2_env.pm_uptime) / 60000);
  const age = mins >= 60 ? `${Math.floor(mins / 60)}시간 ${mins % 60}분` : `${mins}분`;
  const restarts = p.pm2_env.restart_time;

  console.log(
    `  ${live ? OK : NO} ${pad(name, 15)} ${pad(p.pm2_env.status, 9)}` +
      `${age.padStart(9)}  재시작 ${restarts}회` +
      /*
       * 재시작이 잦다는 것은 뜨자마자 죽기를 되풀이한다는 뜻이다.
       * 지금 online 이라도 짚어 줘야 한다 — 곧 또 죽는다.
       */
      (restarts >= 5 ? '  ← 자주 죽습니다. pm2 logs 를 보세요' : ''),
  );
  if (!live) problems += 1;
}

/* ────────────── 2. 실제 응답 ────────────── */

console.log('\n[2/4] 응답\n');

const TARGETS = [
  ['API', 'http://localhost:4000/api/grants/stats'],
  ['실행기', 'http://localhost:4100/health'],
  ['웹', 'http://localhost:3000'],
  ['공개 주소', 'https://moai.drevv.co.kr'],
];

for (const [label, url] of TARGETS) {
  const t0 = Date.now();
  let line;
  try {
    const res = await fetch(url, {
      signal: AbortSignal.timeout(20_000),
      headers: { 'user-agent': 'moai-healthcheck' },
    });
    const ms = Date.now() - t0;
    line =
      res.status < 500
        ? `  ${OK} ${pad(label, 10)} ${res.status}  (${ms}ms)`
        : fail(`  ${NO} ${pad(label, 10)} ${res.status}`);
  } catch (err) {
    line = fail(`  ${NO} ${pad(label, 10)} 응답 없음 — ${String(err.message).slice(0, 50)}`);
  }
  console.log(line);
}

/* ────────────── 3. 일할 수 있는 상태인가 ────────────── */

console.log('\n[3/4] 생성 준비\n');

try {
  const h = await (
    await fetch('http://localhost:4100/health', {
      signal: AbortSignal.timeout(20_000),
      headers: { 'user-agent': 'moai-healthcheck' },
    })
  ).json();

  /*
   * `ok` 는 **Claude 명령이 실제로 있는지**까지 본 값이다. 예전에는 무조건
   * true 였고, 그래서 맛이 간 상태에서도 멀쩡하다고 답했다.
   */
  console.log(
    h.ok
      ? `  ${OK} Claude 실행 가능`
      : fail(`  ${NO} Claude 를 쓸 수 없습니다 — ${h.reason ?? '이유 불명'}`),
  );
  console.log(`  ${OK} 지금 도는 작업  ${h.busySlots}/${h.maxSlots}`);
} catch (err) {
  console.log(fail(`  ${NO} 실행기에게 물어보지 못했습니다 — ${String(err.message).slice(0, 60)}`));
}

/* ────────────── 4. 오늘 공고를 받아왔나 ────────────── */

console.log('\n[4/4] 오늘 수집\n');

const logPath = path.join(ROOT, 'logs', 'api.log');
const today = new Date();
const stamp =
  `${today.getFullYear()}. ` +
  `${String(today.getMonth() + 1).padStart(2, '0')}. ` +
  `${String(today.getDate()).padStart(2, '0')}.`;

if (!existsSync(logPath)) {
  console.log(fail(`  ${NO} 로그 파일이 없습니다 (${logPath})`));
} else {
  /*
   * 로그가 커질 수 있으니 뒤에서부터 필요한 만큼만 읽는다.
   * 하루치면 충분해서 2MB 를 본다.
   */
  const buf = readFileSync(logPath);
  const tail = buf.subarray(Math.max(0, buf.length - 2 * 1024 * 1024)).toString('utf8');

  const lines = tail
    .split(/\r?\n/)
    .map(plain)
    .filter((l) => l.includes(stamp) && /수집 완료/.test(l));

  if (lines.length === 0) {
    console.log(
      `  ⚠ 오늘 수집 기록이 없습니다 — 새벽 4시에 돕니다. ` +
        `지금이 4시 전이면 정상입니다.`,
    );
  } else {
    for (const l of lines.slice(-4)) {
      const m = /\[(\w+Collector)\][^가-힣]*(.+)$/.exec(l);
      console.log(`  ${OK} ${pad(m?.[1] ?? '수집', 18)} ${(m?.[2] ?? l).slice(0, 70)}`);
    }
  }
}

/* ────────────── 마무리 ────────────── */

console.log('');
if (problems === 0) {
  console.log('전부 정상입니다.\n');
} else {
  console.log(`문제 ${problems}건. 아래를 순서대로 해 보세요.\n`);
  console.log('  pm2 logs --lines 50        무슨 일이 있었는지');
  console.log('  pm2 restart all            다시 띄우기');
  console.log('  start-moai.cmd             그래도 안 되면 처음부터\n');
  process.exitCode = 1;
}
