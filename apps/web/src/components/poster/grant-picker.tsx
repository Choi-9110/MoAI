'use client';

import { useEffect, useState } from 'react';
import { Icon } from '@/components/brand/icon';
import { Button } from '@/components/ui/button';
import { Modal } from '@/components/ui/modal';
import { posterApi, type GrantOption } from '@/lib/api';

/**
 * 어떤 공고인지 직접 골라 묶는다.
 *
 * 공고문 파일명으로 자동으로 찾아 보지만 늘 맞지는 않는다.
 * 자동으로 엉뚱한 공고를 묶어 두는 것보다, 못 찾았다고 말하고
 * 사용자가 직접 고르게 하는 편이 낫다.
 */
export function GrantPicker({
  open, onClose, projectId, initialTerm, onLinked,
}: {
  open: boolean;
  onClose: () => void;
  projectId: string;
  /** 처음 열 때 넣어 둘 검색어 — 보통 공고문 파일명 */
  initialTerm?: string | null;
  onLinked: () => void | Promise<void>;
}) {
  const [term, setTerm] = useState('');
  const [results, setResults] = useState<GrantOption[]>([]);
  const [searching, setSearching] = useState(false);
  const [linking, setLinking] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [searched, setSearched] = useState(false);

  // 열릴 때마다 파일명에서 뽑은 말로 시작한다 — 대개 그게 공고명이다.
  useEffect(() => {
    if (!open) return;
    setTerm(cleanTerm(initialTerm ?? ''));
    setResults([]);
    setSearched(false);
    setError(null);
  }, [open, initialTerm]);

  async function search(q: string) {
    if (q.trim().length < 2) return;
    setSearching(true);
    setError(null);
    try {
      setResults(await posterApi.searchGrants(projectId, q.trim()));
      setSearched(true);
    } catch (err) {
      setError((err as Error).message);
    } finally {
      setSearching(false);
    }
  }

  async function link(grantId: string) {
    setLinking(grantId);
    setError(null);
    try {
      await posterApi.linkGrant(projectId, grantId);
      await onLinked();
      onClose();
    } catch (err) {
      setError((err as Error).message);
    } finally {
      setLinking(null);
    }
  }

  return (
    <Modal open={open} onClose={onClose} title="어떤 공고인가요?" wide>
      <p className="text-sm leading-relaxed text-[var(--moai-muted)]">
        공고를 찾아 연결하면 원문을 바로 열어볼 수 있고, 마감일도 같이
        관리됩니다.
      </p>

      <div className="mt-4 flex gap-2">
        <input
          value={term}
          onChange={(e) => setTerm(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === 'Enter') {
              e.preventDefault();
              void search(term);
            }
          }}
          autoFocus
          placeholder="공고명 일부를 입력하세요 (예: 예비창업패키지)"
          className="min-w-0 flex-1 border border-[var(--moai-border)] px-4 py-2.5 text-sm text-[var(--moai-ink)] outline-none focus:border-[var(--moai-accent)]"
        />
        <Button
          variant="brand"
          disabled={searching || term.trim().length < 2}
          onClick={() => void search(term)}
        >
          {searching ? '찾는 중…' : '검색'}
        </Button>
      </div>

      {error && (
        <p className="mt-2 text-xs text-[var(--moai-risk-fg)]">{error}</p>
      )}

      <div className="thin-scroll mt-4 max-h-[320px] overflow-y-auto">
        {results.length === 0 ? (
          <p className="border border-[var(--moai-border)] bg-[var(--moai-surface)] px-4 py-8 text-center text-sm text-[var(--moai-muted)]">
            {searched
              ? '찾는 공고가 없습니다. 다른 낱말로 검색해 보세요.'
              : '검색어를 넣고 찾아 주세요.'}
          </p>
        ) : (
          <ul className="space-y-1.5">
            {results.map((g) => (
              <li key={g.id}>
                <div
                  role="button"
                  tabIndex={0}
                  onClick={() => void link(g.id)}
                  onKeyDown={(e) => {
                    if (e.key === 'Enter' || e.key === ' ') {
                      e.preventDefault();
                      void link(g.id);
                    }
                  }}
                  className="flex cursor-pointer items-center gap-3 border border-[var(--moai-border)] bg-white px-4 py-3 transition-colors hover:border-[var(--moai-accent)]"
                >
                  <div className="min-w-0 flex-1">
                    <p className="truncate text-sm font-semibold text-[var(--moai-ink)]">
                      {g.title}
                    </p>
                    <p className="mt-0.5 truncate text-xs text-[var(--moai-subtle)]">
                      {g.agency}
                      {g.applyEndAt &&
                        ` · 마감 ${g.applyEndAt.slice(0, 10).replace(/-/g, '.')}`}
                    </p>
                  </div>
                  <span className="shrink-0 text-xs font-semibold text-[var(--moai-accent)]">
                    {linking === g.id ? '연결 중…' : '이 공고'}
                  </span>
                </div>
              </li>
            ))}
          </ul>
        )}
      </div>

      <div className="mt-4 flex justify-end">
        <Button variant="secondary" onClick={onClose}>
          닫기
        </Button>
      </div>
    </Modal>
  );
}

/**
 * 파일명을 검색어로 다듬는다.
 *
 * "1. 2026년 광주 IP창업존 62기(26년 4기) 모집공고(K).pdf"
 *   → "2026년 광주 IP창업존 62기"
 * 확장자·순번·괄호를 떼면 대개 공고명만 남는다.
 */
function cleanTerm(fileName: string): string {
  return fileName
    .replace(/\.(pdf|hwpx?|docx?|txt|md|zip)$/i, '')
    .replace(/^[\s\d]+[.)\-]\s*/, '')
    .replace(/\([^)]*\)/g, ' ')
    .replace(/[_]+/g, ' ')
    .replace(/(모집\s*)?공고문?\s*$/, '')
    .replace(/\s+/g, ' ')
    .trim()
    .slice(0, 60);
}
