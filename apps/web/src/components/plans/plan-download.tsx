'use client';

import { useState } from 'react';
import { Icon } from '@/components/brand/icon';
import { Button } from '@/components/ui/button';
import { Modal } from '@/components/ui/modal';
import { API_BASE } from '@/lib/api';

/**
 * 다 쓴 문서를 밖으로 꺼내는 곳.
 *
 * 버튼을 늘어놓지 않고 **하나로 모아 팝업에서 고르게 한다.** 형식마다
 * 쓰임이 달라서 — 제출용인지, 고쳐 쓸 것인지, 한글 양식에 붙일 것인지 —
 * 이름만 늘어놓으면 무엇을 눌러야 할지 알 수 없다. 팝업에서는 각각 왜
 * 그것을 고르는지 한 줄씩 붙일 자리가 있다.
 *
 * **되는 것만 둔다.** HWP 는 만들 수 없어서(한글 문서를 만들어 내는 공개된
 * 방법이 없다) 아예 넣지 않았다. 대신 DOCX 설명에 한글에서 열린다는 것을
 * 적어 둔다 — 한글 양식에 붙일 사람에게 필요한 것은 그 사실 하나다.
 */

type Kind = 'pdf' | 'docx';

export function PlanDownload({ projectId }: { projectId: string }) {
  const [open, setOpen] = useState(false);
  const [busy, setBusy] = useState<Kind | null>(null);
  const [error, setError] = useState<string | null>(null);

  /**
   * 파일을 받아 저장한다.
   *
   * `<a download>` 로 바로 걸지 않는 이유는 이 주소가 로그인을 요구하기
   * 때문이다. 링크는 헤더를 못 붙이므로 401 이 떨어진다.
   */
  async function download(kind: Kind) {
    setBusy(kind);
    setError(null);
    try {
      const { authHeader } = await import('@/lib/api');
      const res = await fetch(
        `${API_BASE}/projects/${projectId}/plan/download.${kind}`,
        { headers: await authHeader() },
      );

      if (!res.ok) {
        let message = `내려받지 못했습니다 (${res.status})`;
        if (res.status === 404) message = '아직 만들어진 사업계획서가 없습니다.';
        else if (res.status === 503) {
          // PDF 를 그릴 브라우저가 없을 때 — 서버가 이유를 담아 준다
          message =
            (await res.json().catch(() => null))?.message ??
            'PDF 를 만들 수 없는 환경입니다.';
        }
        throw new Error(message);
      }

      // 파일 이름은 서버가 헤더에 담아 준다 (한글이라 인코딩돼 있다)
      const disp = res.headers.get('content-disposition') ?? '';
      const encoded = /filename\*=UTF-8''([^;]+)/.exec(disp)?.[1];
      const name = encoded ? decodeURIComponent(encoded) : `사업계획서.${kind}`;

      const blob = await res.blob();
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = name;
      document.body.appendChild(a);
      a.click();
      a.remove();
      URL.revokeObjectURL(url);
    } catch (err) {
      setError((err as Error).message);
    } finally {
      setBusy(null);
    }
  }

  return (
    <>
      <div className="no-print mt-8 flex flex-wrap items-center justify-between gap-3 border border-[var(--moai-border)] bg-white px-5 py-4">
        <div>
          <p className="text-sm font-bold text-[var(--moai-ink)]">다 썼습니다</p>
          <p className="mt-1 text-xs text-[var(--moai-muted)]">
            [확인필요]로 남은 항목과 마지막 점검 결과도 함께 담깁니다.
          </p>
        </div>
        <Button variant="brand" onClick={() => setOpen(true)}>
          <Icon name="doc" size={15} />
          다운로드
        </Button>
      </div>

      <Modal
        open={open}
        onClose={() => {
          setOpen(false);
          setError(null);
        }}
        title="어떤 형식으로 받을까요?"
      >
        <div className="space-y-2">
          {/* 제출용 */}
          <Row
            name="PDF"
            desc="그대로 내거나 보낼 때. 쪽 번호가 붙고 절이 페이지 중간에서 잘리지 않습니다."
            action={
              <Button
                variant="brand"
                size="sm"
                disabled={busy !== null}
                onClick={() => void download('pdf')}
              >
                {busy === 'pdf' ? '만드는 중…' : '받기'}
              </Button>
            }
          />

          {/* 고쳐 쓸 때 */}
          <Row
            name="DOCX (워드)"
            desc="내용을 더 손볼 때. 한글(HWP)에서 파일 → 불러오기로 그대로 열립니다."
            action={
              <Button
                variant="secondary"
                size="sm"
                disabled={busy !== null}
                onClick={() => void download('docx')}
              >
                {busy === 'docx' ? '만드는 중…' : '받기'}
              </Button>
            }
          />
        </div>

        {error && (
          <p className="mt-3 border border-danger-soft bg-[var(--moai-risk-bg)] px-3 py-2 text-xs text-[var(--moai-risk-fg)]">
            {error}
          </p>
        )}

        <div className="mt-5 flex items-center justify-between gap-2">
          <button
            onClick={() => window.print()}
            className="text-xs font-semibold text-[var(--moai-muted)] hover:text-[var(--moai-accent)]"
          >
            지금 화면 그대로 인쇄하기
          </button>
          <Button variant="secondary" onClick={() => setOpen(false)}>
            닫기
          </Button>
        </div>
      </Modal>
    </>
  );
}

/** 형식 한 줄 — 이름·쓰임·버튼 */
function Row({
  name, desc, action,
}: {
  name: string;
  desc: string;
  action: React.ReactNode;
}) {
  return (
    <div className="flex items-center gap-3 border border-[var(--moai-border)] bg-white px-4 py-3">
      <div className="min-w-0 flex-1">
        <p className="text-sm font-bold text-[var(--moai-ink)]">{name}</p>
        <p className="mt-0.5 text-xs leading-relaxed text-[var(--moai-muted)]">
          {desc}
        </p>
      </div>
      <div className="shrink-0">{action}</div>
    </div>
  );
}
