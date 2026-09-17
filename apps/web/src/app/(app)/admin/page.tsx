'use client';

import { useCallback, useEffect, useState } from 'react';
import { Button } from '@/components/ui/button';
import { Modal } from '@/components/ui/modal';
import {
  APPLICANT_TYPE_LABELS, INDUSTRY_LABELS, MEMBER_GRADES,
  MEMBER_GRADE_LABELS, MEMBER_GRADE_NOTES,
} from '@moai/shared';
import { adminApi } from '@/lib/api';
import type { MemberDetail, MemberRow } from '@/lib/api';
import { useAuth } from '@/lib/auth';

/**
 * 회원 관리.
 *
 * 목록에서는 **이름을 가려 둔다**(최현근 → 최*근). 관리자라도 평소에는 볼
 * 이유가 없고, 화면을 띄워 둔 채 자리를 비우거나 남에게 보여줄 일이 있기
 * 때문이다. 실제 이름은 한 사람을 눌러 상세를 열었을 때만 보인다.
 *
 * 사업계획서 본문이나 아이디어 원문은 **여기 없다.** 회원 관리에 필요한 것은
 * 누가 언제 들어와 얼마나 쓰고 있는가이지, 그 사람이 쓴 글이 아니다.
 */

function fmtDate(iso: string | null): string {
  if (!iso) return '—';
  const d = new Date(iso);
  return `${d.getFullYear()}.${String(d.getMonth() + 1).padStart(2, '0')}.${String(
    d.getDate(),
  ).padStart(2, '0')}`;
}

export default function AdminPage() {
  const { session } = useAuth();
  const [rows, setRows] = useState<MemberRow[]>([]);
  const [total, setTotal] = useState(0);
  const [keyword, setKeyword] = useState('');
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [picked, setPicked] = useState<MemberDetail | null>(null);
  const [saving, setSaving] = useState(false);

  /*
   * 숨겨 둔 지우기.
   *
   * 회원을 지우는 일은 되돌릴 수 없는데 자주 쓰지도 않는다. 그래서 버튼을
   * 내놓지 않고 **"마지막 활동"을 다섯 번 눌러야** 나오게 했다. 실수로
   * 다섯 번 연달아 누를 일은 없고, 아는 사람만 쓴다.
   *
   * 세는 것은 창을 닫거나 다른 회원을 열면 0 으로 돌아간다.
   */
  const [taps, setTaps] = useState(0);
  const [confirmDelete, setConfirmDelete] = useState(false);
  const [removing, setRemoving] = useState(false);
  const [removed, setRemoved] = useState<string | null>(null);

  /**
   * 등급 바꾸기.
   *
   * 서버가 바뀐 회원 정보를 그대로 돌려주므로 그것으로 갈아 끼운다 —
   * 화면에서 짐작해 고쳐 두면 서버가 거절했을 때 둘이 어긋난다.
   * 목록의 뱃지도 같이 고쳐야 팝업을 닫았을 때 옛 등급이 안 보인다.
   */
  /** 지우기 — 목록에서도 빼고 팝업을 닫는다 */
  async function removeMember(id: string) {
    setRemoving(true);
    setError(null);
    try {
      const res = await adminApi.removeMember(id);
      setRows((prev) => prev.filter((r) => r.id !== id));
      setTotal((n) => Math.max(0, n - 1));
      setRemoved(
        `${res.email} 을(를) 지웠습니다.` +
          (res.alsoRemovedWorkspace ? ' 사업·자료도 함께 지웠습니다.' : '') +
          (res.authRemoved
            ? ' 로그인 계정까지 지워서 같은 이메일로 새로 가입할 수 있습니다.'
            : ' 다만 로그인 계정은 남아 있습니다 — Supabase 에서 따로 지워 주세요.'),
      );
      setConfirmDelete(false);
      setPicked(null);
      setTaps(0);
    } catch (err) {
      setError((err as Error).message);
    } finally {
      setRemoving(false);
    }
  }

  async function changeGrade(id: string, grade: string) {
    setSaving(true);
    setError(null);
    try {
      const updated = await adminApi.setGrade(id, grade);
      setPicked(updated);
      setRows((prev) =>
        prev.map((r) => (r.id === id ? { ...r, grade: updated.grade } : r)),
      );
    } catch (err) {
      setError((err as Error).message);
    } finally {
      setSaving(false);
    }
  }

  const load = useCallback(async (q = '') => {
    setLoading(true);
    setError(null);
    try {
      const res = await adminApi.members(q);
      setRows(res.items);
      setTotal(res.total);
    } catch (err) {
      setError((err as Error).message);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    if (session) void load();
  }, [session, load]);

  /*
   * 권한이 없으면 서버가 403 을 준다. 화면에서 메뉴를 숨기는 것과 별개로,
   * 주소를 직접 치고 들어온 경우를 여기서 받아 준다.
   */
  if (error?.includes('관리자')) {
    return (
      <main className="grid h-full place-items-center px-6">
        <p className="text-sm text-[var(--moai-muted)]">
          관리자만 볼 수 있는 화면입니다.
        </p>
      </main>
    );
  }

  return (
    <main className="mx-auto w-full max-w-5xl px-5 py-8 sm:px-8">
      <header className="mb-6">
        <h1 className="text-2xl font-extrabold tracking-tight text-[var(--moai-ink)]">
          회원 관리
        </h1>
        <p className="mt-1 text-sm text-[var(--moai-muted)]">
          모두 {total.toLocaleString()}명 · 최근 가입 순
        </p>
      </header>

      {/* 찾기 */}
      <form
        className="mb-4 flex gap-2"
        onSubmit={(e) => {
          e.preventDefault();
          void load(keyword);
        }}
      >
        <input
          value={keyword}
          onChange={(e) => setKeyword(e.target.value)}
          placeholder="이메일 · 이름으로 찾기"
          className="h-10 flex-1 border border-[var(--moai-border)] bg-white px-3 text-sm outline-none focus:border-[var(--moai-accent)]"
        />
        <Button type="submit" variant="secondary" size="sm">
          찾기
        </Button>
        {keyword && (
          <Button
            type="button"
            variant="ghost"
            size="sm"
            onClick={() => {
              setKeyword('');
              void load('');
            }}
          >
            비우기
          </Button>
        )}
      </form>

      {error && !error.includes('관리자') && (
        <p className="mb-4 border border-danger-soft bg-[var(--moai-risk-bg)] px-3 py-2 text-sm text-[var(--moai-risk-fg)]">
          {error}
        </p>
      )}

      {/* 목록 */}
      <div className="thin-scroll overflow-x-auto border border-[var(--moai-border)] bg-white">
        <table className="w-full min-w-[760px] text-left text-sm">
          <thead>
            <tr className="border-b border-[var(--moai-border)] bg-[var(--moai-surface)]">
              {/* 목록에서 몇 번째인지. 회원 번호가 아니라 화면 순번이다 */}
              <th className="w-14 px-4 py-2.5 text-xs font-bold text-[var(--moai-muted)]">
                No.
              </th>
              <th className="px-4 py-2.5 text-xs font-bold text-[var(--moai-muted)]">
                이메일
              </th>
              <th className="px-4 py-2.5 text-xs font-bold text-[var(--moai-muted)]">
                이름
              </th>
              <th className="px-4 py-2.5 text-xs font-bold text-[var(--moai-muted)]">
                가입일
              </th>
              <th className="px-4 py-2.5 text-xs font-bold text-[var(--moai-muted)]">
                등급
              </th>
            </tr>
          </thead>
          <tbody>
            {loading ? (
              <tr>
                <td colSpan={5} className="px-4 py-10 text-center text-[var(--moai-subtle)]">
                  불러오는 중…
                </td>
              </tr>
            ) : rows.length === 0 ? (
              <tr>
                <td colSpan={5} className="px-4 py-10 text-center text-[var(--moai-subtle)]">
                  {keyword ? '찾는 회원이 없습니다.' : '아직 회원이 없습니다.'}
                </td>
              </tr>
            ) : (
              rows.map((m, i) => (
                <tr
                  key={m.id}
                  onClick={async () => {
                    try {
                      setTaps(0);
                      setPicked(await adminApi.member(m.id));
                    } catch (err) {
                      setError((err as Error).message);
                    }
                  }}
                  className="cursor-pointer border-b border-[var(--moai-border)] transition-colors last:border-0 hover:bg-[var(--moai-surface)]"
                >
                  <td className="tabular px-4 py-3 text-[var(--moai-subtle)]">
                    {i + 1}
                  </td>
                  {/*
                    이메일은 앞 세 글자만 보이고 나머지는 가린다. 도메인은
                    남겨서 `adm**@drevv.co.kr` 과 `adm*****@co.kr` 이 구별되게
                    한다 — 지우기 같은 일에서 그 차이가 크다.
                    전체 주소는 한 줄을 눌러 상세에서 본다.
                  */}
                  <td className="px-4 py-3">
                    <span className="font-medium text-[var(--moai-ink)]">
                      {m.maskedEmail}
                    </span>
                    {m.isAdmin && (
                      <span className="ml-1.5 bg-[var(--moai-accent-50)] px-1.5 py-0.5 text-[10px] font-bold text-[var(--moai-accent)]">
                        관리자
                      </span>
                    )}
                  </td>
                  <td className="px-4 py-3 text-[var(--moai-muted)]">{m.maskedName}</td>
                  <td className="tabular px-4 py-3 text-[var(--moai-muted)]">
                    {fmtDate(m.joinedAt)}
                  </td>
                  <td className="px-4 py-3">
                    <span
                      className={`px-2 py-0.5 text-xs font-semibold ${
                        m.grade === 'free'
                          ? 'bg-[var(--moai-surface)] text-[var(--moai-muted)]'
                          : 'bg-[var(--moai-accent-50)] text-[var(--moai-accent)]'
                      }`}
                    >
                      {MEMBER_GRADE_LABELS[m.grade as keyof typeof MEMBER_GRADE_LABELS] ?? m.grade}
                    </span>
                  </td>
                </tr>
              ))
            )}
          </tbody>
        </table>
      </div>

      <p className="mt-2.5 text-xs text-[var(--moai-subtle)]">
        이메일과 이름은 가려서 보여줍니다. 한 줄을 누르면 전체를 볼 수 있어요.
      </p>

      {/* 상세 */}
      <Modal
        open={picked !== null}
        onClose={() => {
          setPicked(null);
          setTaps(0);
        }}
        title="회원 정보"
      >
        {picked && (
          <div className="space-y-4">
            <Field label="이메일" value={picked.email} />
            <Field label="이름" value={picked.name ?? '(입력 안 함)'} />
            <Field label="가입일" value={fmtDate(picked.joinedAt)} />
            {/*
              등급은 여기서 바로 바꾼다.
              고르는 즉시 저장한다 — 저장 버튼을 따로 두면 바꿔 놓고 안 누르는
              일이 생기고, 관리자는 자기가 바꿨다고 믿는다.
            */}
            <div className="flex gap-3 text-sm">
              <span className="w-20 shrink-0 pt-1.5 text-[var(--moai-subtle)]">
                등급
              </span>
              <div className="min-w-0 flex-1">
                <div className="flex flex-wrap gap-1.5">
                  {MEMBER_GRADES.map((g) => {
                    const on = picked.grade === g;
                    return (
                      <button
                        key={g}
                        disabled={saving}
                        onClick={() => void changeGrade(picked.id, g)}
                        className={`border px-3 py-1.5 text-xs font-bold transition-colors disabled:opacity-50 ${
                          on
                            ? 'border-[var(--moai-accent)] bg-[var(--moai-accent-50)] text-[var(--moai-accent)]'
                            : 'border-[var(--moai-border)] bg-white text-[var(--moai-muted)] hover:border-[var(--moai-accent-100)]'
                        }`}
                      >
                        {MEMBER_GRADE_LABELS[g]}
                      </button>
                    );
                  })}
                </div>
                <p className="mt-1.5 text-xs text-[var(--moai-subtle)]">
                  {saving
                    ? '바꾸는 중…'
                    : MEMBER_GRADE_NOTES[
                        picked.grade as keyof typeof MEMBER_GRADE_NOTES
                      ] ?? ''}
                </p>
              </div>
            </div>
            <Field
              label="상태"
              value={`${picked.isActive ? '사용 중' : '중지됨'}${
                picked.isAdmin ? ' · 관리자' : ''
              }`}
            />

            <div className="border-t border-[var(--moai-border)] pt-4">
              <p className="mb-2 text-xs font-bold text-[var(--moai-ink)]">기업 정보</p>
              {picked.company ? (
                <div className="space-y-2">
                  <Field label="상호" value={picked.company.name ?? '—'} />
                  {/* 코드가 아니라 사람이 읽는 이름으로 — 라벨은 shared 에 한 벌만 둔다 */}
                  <Field
                    label="형태"
                    value={
                      APPLICANT_TYPE_LABELS[
                        picked.company.stage as keyof typeof APPLICANT_TYPE_LABELS
                      ] ?? picked.company.stage ?? '—'
                    }
                  />
                  <Field
                    label="업종"
                    value={
                      INDUSTRY_LABELS[
                        picked.company.industry as keyof typeof INDUSTRY_LABELS
                      ] ?? picked.company.industry ?? '—'
                    }
                  />
                  <Field label="지역" value={picked.company.region ?? '—'} />
                  <Field label="창업일" value={picked.company.foundedAt ?? '—'} />
                  <Field
                    label="종업원"
                    value={
                      picked.company.employees != null
                        ? `${picked.company.employees}명`
                        : '—'
                    }
                  />
                  <Field
                    label="연 매출"
                    value={
                      picked.company.revenue
                        ? `${Number(picked.company.revenue).toLocaleString()}원`
                        : '—'
                    }
                  />
                </div>
              ) : (
                <p className="text-sm text-[var(--moai-subtle)]">
                  아직 입력하지 않았습니다.
                </p>
              )}
            </div>

            <div className="border-t border-[var(--moai-border)] pt-4">
              <p className="mb-2 text-xs font-bold text-[var(--moai-ink)]">활동</p>
              <div className="grid grid-cols-3 gap-2">
                <Stat label="사업" value={`${picked.stats.projects}건`} />
                <Stat label="완성한 계획서" value={`${picked.stats.plansDone}건`} />
                {/*
                  여기를 다섯 번 누르면 지우기가 나온다.
                  겉보기에는 다른 칸과 똑같다 — 아는 사람만 쓰라고 만든 것이다.
                */}
                <button
                  type="button"
                  onClick={() => setTaps((n) => n + 1)}
                  className="border border-[var(--moai-border)] bg-[var(--moai-surface)] px-3 py-2.5 text-left"
                >
                  <span className="block text-[11px] text-[var(--moai-subtle)]">
                    마지막 활동
                  </span>
                  <span className="tabular mt-0.5 block text-sm font-bold text-[var(--moai-ink)]">
                    {fmtDate(picked.stats.lastActiveAt)}
                  </span>
                </button>
              </div>
            </div>

            {taps >= 5 && (
              <div className="border border-danger-soft bg-[var(--moai-risk-bg)] px-4 py-3">
                <p className="text-xs font-bold text-[var(--moai-risk-fg)]">
                  이 회원을 지웁니다
                </p>
                <p className="mt-1 text-xs leading-relaxed text-[var(--moai-risk-fg)]">
                  되돌릴 수 없습니다. 이 사람이 만든 사업과 자료도 함께 지워집니다.
                </p>
                <div className="mt-2.5 flex gap-2">
                  <Button
                    variant="danger"
                    size="sm"
                    disabled={removing}
                    onClick={() => setConfirmDelete(true)}
                  >
                    지우기
                  </Button>
                  <Button variant="ghost" size="sm" onClick={() => setTaps(0)}>
                    그만두기
                  </Button>
                </div>
              </div>
            )}

            <div className="flex justify-end pt-1">
              <Button
                variant="secondary"
                onClick={() => {
                  setPicked(null);
                  setTaps(0);
                }}
              >
                닫기
              </Button>
            </div>
          </div>
        )}
      </Modal>
      {/*
        마지막 확인.

        무엇이 지워지는지 **이메일까지 보여 준다** — 목록에서 이름이 가려져
        있어서, 확인 없이 지우면 엉뚱한 사람을 지울 수 있다.
      */}
      <Modal
        open={confirmDelete}
        onClose={() => setConfirmDelete(false)}
        title="정말 지울까요?"
      >
        <p className="text-sm leading-relaxed text-[var(--moai-muted)]">
          <b className="text-[var(--moai-ink)]">{picked?.email}</b>
          {' '}회원을 지웁니다.
        </p>
        <ul className="mt-3 space-y-1 text-sm text-[var(--moai-muted)]">
          <li>· 이 사람이 만든 사업 {picked?.stats.projects ?? 0}건과 사업계획서</li>
          <li>· 기업 정보, 관심 공고, 공고 판정 결과</li>
        </ul>
        <p className="mt-3 border-l-2 border-[var(--moai-risk-fg)] bg-[var(--moai-risk-bg)] px-3 py-2 text-xs leading-relaxed text-[var(--moai-risk-fg)]">
          <b>되돌릴 수 없습니다.</b> 로그인 계정까지 함께 지웁니다. 지운 뒤에는
          같은 이메일로 새로 가입할 수 있습니다.
        </p>
        <div className="mt-5 flex justify-end gap-2">
          <Button
            variant="secondary"
            disabled={removing}
            onClick={() => setConfirmDelete(false)}
          >
            그만두기
          </Button>
          <Button
            variant="danger"
            disabled={removing}
            onClick={() => picked && void removeMember(picked.id)}
          >
            {removing ? '지우는 중…' : '지웁니다'}
          </Button>
        </div>
      </Modal>

      {/* 지운 뒤 한 줄 — 무엇을 지웠는지 남긴다 */}
      {removed && (
        <div className="fixed bottom-4 right-4 z-[60] max-w-sm border border-[var(--moai-border)] bg-white px-4 py-3 shadow-lg">
          <p className="text-sm text-[var(--moai-ink)]">{removed}</p>
          <button
            onClick={() => setRemoved(null)}
            className="mt-1.5 text-xs font-semibold text-[var(--moai-muted)] hover:text-[var(--moai-accent)]"
          >
            닫기
          </button>
        </div>
      )}
    </main>
  );
}

function Field({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex gap-3 text-sm">
      <span className="w-20 shrink-0 text-[var(--moai-subtle)]">{label}</span>
      <span className="min-w-0 flex-1 break-words text-[var(--moai-ink)]">{value}</span>
    </div>
  );
}

function Stat({ label, value }: { label: string; value: string }) {
  return (
    <div className="border border-[var(--moai-border)] bg-[var(--moai-surface)] px-3 py-2.5">
      <p className="text-[11px] text-[var(--moai-subtle)]">{label}</p>
      <p className="tabular mt-0.5 text-sm font-bold text-[var(--moai-ink)]">{value}</p>
    </div>
  );
}
