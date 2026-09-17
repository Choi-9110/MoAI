/**
 * 서버가 남긴 실패 사유를 사람이 읽을 문장으로.
 *
 * **왜 그대로 보여 주면 안 되는가.** 화면에 이런 것이 그대로 떴다 —
 *
 *     로컬 실행기에 연결할 수 없습니다 — fetch failed
 *     /plan/section 실패 (500) — {"statusCode":500,...}
 *     AggregateError: connect ECONNREFUSED 127.0.0.1:4100
 *
 * 읽는 사람이 이 문장으로 할 수 있는 일이 없다. `ECONNREFUSED` 를 보고
 * 고칠 수 있는 것은 아무것도 없기 때문이다. 게다가 이 중 대부분은
 * **사용자가 뭘 잘못한 것이 아니라** 생성 서버가 잠깐 다시 뜨는 중이었을
 * 뿐이고, 그 무렵이면 이미 멀쩡해져 있다.
 *
 * 그래서 아는 모양은 사람 말로 바꾸고, 모르는 것만 원문을 남긴다 —
 * 원문까지 지워 버리면 정말 처음 보는 문제가 생겼을 때 손댈 데가 없다.
 */
export function humanError(raw: string | null | undefined): string {
  if (!raw) return '알 수 없는 이유로 멈췄습니다.';

  if (/연결할 수 없습니다|fetch failed|ECONNREFUSED|ECONNRESET|socket hang up/i.test(raw)) {
    return '생성 서버와 연결이 끊겼습니다. 잠시 뒤 다시 시작하면 이어서 씁니다.';
  }
  if (/시간 초과|timeout|ETIMEDOUT|AbortError/i.test(raw)) {
    return '생성이 예상보다 오래 걸려 멈췄습니다. 다시 시작하면 이어서 씁니다.';
  }
  if (/too large|PayloadTooLarge|entity too large/i.test(raw)) {
    return '문서가 너무 커져 한 번에 보내지 못했습니다. 다시 시작해 주세요.';
  }
  if (/rate.?limit|429|과부하|overloaded/i.test(raw)) {
    return '생성 요청이 몰려 잠시 거절됐습니다. 조금 뒤 다시 시작해 주세요.';
  }
  if (/리소스가 부족|0x800700e8|EAGAIN|ENOMEM/i.test(raw)) {
    return 'PC 자원이 모자라 생성을 시작하지 못했습니다. 잠시 뒤 다시 시도해 주세요.';
  }
  if (/찾지 못했습니다|not found|ENOENT/i.test(raw)) {
    return '생성에 필요한 파일을 찾지 못했습니다. 양식을 다시 올려 주세요.';
  }

  return raw;
}
