/**
 * 남아 버린 개발용 프로세스를 치운다.
 *
 * **왜 생기는가.** 예전에는 서버를 cmd 창으로 띄웠다.
 *
 *     cmd.exe → pnpm.cmd → nest start --watch → node
 *
 * 창을 닫으면 맨 앞 `cmd.exe` 만 죽는다. 그 아래 손자·증손자는 부모 없이
 * 살아남는다. 창이 사라졌으니 사용자는 정리됐다고 믿지만 실제로는 그대로
 * 돌고 있다. 이게 2주치 쌓여 59개가 됐고, 그 결과가 이랬다 —
 *
 *   · 살아남은 `nest --watch` 가 4000 번을 물어 `EADDRINUSE`
 *   · 그 watch 가 방금 고친 파일을 옛 코드로 다시 컴파일하며 TS 에러를 뿜음
 *   · 프로세스가 60개를 넘자 윈도우가 `0x800700e8` 로 실행을 거부
 *
 * 마지막 것이 특히 고약했다. 고친 코드가 아니라 **유령이 뱉는 옛 에러**를
 * 붙들고 원인을 찾게 되기 때문이다.
 *
 * ─────────────────────────────────────────────────────────────
 * **무엇을 죽이고 무엇을 남기는가.**
 *
 * 지금 서비스는 PM2 가 `dist/main.js` 를 직접 띄운다. 아래에서 찾는 것은
 * 전부 **개발용 실행 방식**이라 지금은 하나도 떠 있으면 안 되는 것들이다.
 * 서명이 겹치지 않으므로 도는 서비스를 잘못 죽일 일이 없다.
 *
 *     죽인다   nest start --watch  ·  pnpm dev:*  ·  next dev
 *     남긴다   dist/main.js  ·  next start  ·  watchdog.mjs  ·  PM2 데몬
 *
 * 그래도 안전망을 하나 더 둔다 — PM2 가 관리 중인 PID 와 그 자손은
 * 서명과 무관하게 건드리지 않는다.
 *
 *   node scripts/cleanup-ghosts.mjs          무엇을 지울지 보여주기만
 *   node scripts/cleanup-ghosts.mjs --kill   실제로 지우기
 */
import { execFileSync } from 'node:child_process';

const KILL = process.argv.includes('--kill');

/** 개발용 실행 방식의 서명. 지금은 하나도 떠 있으면 안 된다. */
const GHOST = [
  /nest\.js"?\s+start\s+--watch/i,
  /pnpm\.cjs.*\b(dev|dev:api|dev:agent|dev:web|start:dev)\b/i,
  /next\b.*\bdev\b/i,
  /turbopack-node/i,
];

/** 이 프로젝트의 것만 건드린다 — 다른 작업까지 끌어들이지 않는다 */
const OURS = /DD-velop[\\/]moai|@moai[\\/]/i;

const ps = (script) =>
  execFileSync('powershell', ['-NoProfile', '-Command', script], {
    encoding: 'utf8',
    maxBuffer: 32 * 1024 * 1024,
  });

/**
 * 뜬 시각을 `09-07 11:21` 로.
 *
 * PowerShell 이 JSON 으로 내는 날짜 모양이 버전마다 다르다 —
 * `/Date(1757...)/` 일 때도 있고 ISO 문자열일 때도 있다. 어느 쪽도 아니면
 * 시각 없이 넘어간다. 정리하는 데 꼭 필요한 값이 아니라, 이것 때문에
 * 스크립트가 멈추면 안 된다.
 */
function when(raw) {
  if (!raw) return null;
  const ms = /\/Date\((\d+)/.exec(String(raw));
  const d = new Date(ms ? Number(ms[1]) : raw);
  return Number.isNaN(d.getTime()) ? null : d;
}

/** 살아 있는 프로세스 전부 — pid, 부모, 이름, 명령행 */
function snapshot() {
  const raw = ps(
    "Get-CimInstance Win32_Process | Select-Object ProcessId,ParentProcessId,Name,CommandLine,CreationDate | ConvertTo-Json -Compress -Depth 3",
  );
  return JSON.parse(raw).map((p) => ({
    pid: p.ProcessId,
    ppid: p.ParentProcessId,
    name: p.Name,
    cmd: p.CommandLine ?? '',
    at: when(p.CreationDate),
  }));
}

/** PM2 가 지금 관리 중인 PID */
function pm2Pids() {
  try {
    const list = JSON.parse(execFileSync('pm2', ['jlist'], {
      encoding: 'utf8',
      shell: true,
      maxBuffer: 16 * 1024 * 1024,
    }));
    return list.map((p) => p.pid).filter(Boolean);
  } catch {
    /* PM2 가 안 떠 있으면 보호할 것도 없다 */
    return [];
  }
}

const procs = snapshot();
const byPid = new Map(procs.map((p) => [p.pid, p]));
const children = new Map();
for (const p of procs) {
  if (!children.has(p.ppid)) children.set(p.ppid, []);
  children.get(p.ppid).push(p.pid);
}

/**
 * 보호 대상 — PM2 데몬, PM2 가 띄운 것, 그 자손 전부.
 *
 * 자손까지 넣는 이유는 `next start` 가 아래로 워커를 띄우기 때문이다.
 * 부모만 보호하면 워커가 유령으로 오인될 여지가 있다.
 */
const safe = new Set();
const protectTree = (pid) => {
  if (!pid || safe.has(pid)) return;
  safe.add(pid);
  for (const c of children.get(pid) ?? []) protectTree(c);
};

for (const pid of pm2Pids()) protectTree(pid);
for (const p of procs) {
  if (/Daemon\.js/i.test(p.cmd) && /pm2/i.test(p.cmd)) protectTree(p.pid);
}

/* 나를 띄운 줄기도 보호한다 — 정리하다 자기 발등을 찍지 않도록 */
let self = process.pid;
while (self && byPid.has(self)) {
  safe.add(self);
  self = byPid.get(self).ppid;
}

const ghosts = procs.filter(
  (p) =>
    !safe.has(p.pid) &&
    OURS.test(p.cmd) &&
    GHOST.some((re) => re.test(p.cmd)),
);

const found = new Map(ghosts.map((g) => [g.pid, g]));

/*
 * **위로도 올라간다.**
 *
 * 맨 위는 `pnpm.cjs dev:api` 인데, 이 명령행에는 프로젝트 이름이 안 나온다
 * (`pnpm dev:api` 는 어느 폴더에서 쳤는지가 전부라서). 그래서 서명만으로는
 * 우리 것인지 알 수 없어 위에서 걸러졌다.
 *
 * 대신 **자식을 보고 안다.** 아래에 우리 유령을 달고 있으면 그것도 우리
 * 것이다. 알맹이만 죽이고 껍데기를 두면 빈 창이 남아 "아직 뭔가 도나" 하게
 * 되고, `pnpm` 이 살아 있으면 다시 띄우기도 한다.
 */
for (const g of ghosts) {
  let up = byPid.get(g.ppid);
  while (up && !safe.has(up.pid) && !found.has(up.pid)) {
    const shell = /^cmd\.exe$/i.test(up.name);
    const runner = GHOST.some((re) => re.test(up.cmd));
    if (!shell && !runner) break;
    found.set(up.pid, up);
    up = byPid.get(up.ppid);
  }
}

const targets = [...found.values()];

if (targets.length === 0) {
  console.log('유령 없음 — 깨끗합니다.');
  process.exit(0);
}

console.log(`유령 ${targets.length}개:\n`);
for (const t of targets) {
  const at = t.at ? t.at.toISOString().slice(5, 16).replace('T', ' ') : '  ?  ';
  console.log(`  ${String(t.pid).padStart(7)}  ${at}  ${t.cmd.slice(0, 90)}`);
}

if (!KILL) {
  console.log('\n실제로 지우려면 --kill 을 붙이세요.');
  process.exit(0);
}

let killed = 0;
for (const t of targets) {
  try {
    execFileSync('taskkill', ['/PID', String(t.pid), '/T', '/F'], {
      stdio: 'ignore',
    });
    killed += 1;
  } catch {
    /* 이미 죽었거나 부모가 먼저 죽으며 같이 갔다 — 어느 쪽이든 목적은 달성 */
  }
}

console.log(`\n✓ ${killed}개 정리했습니다.`);
