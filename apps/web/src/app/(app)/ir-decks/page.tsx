'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import { Button } from '@/components/ui/button';
import { Card } from '@/components/ui/card';
import { Modal } from '@/components/ui/modal';
import { downloadIrDeck, irDeckApi, type IrDeck } from '@/lib/api';
import { useAuth } from '@/lib/auth';

/**
 * IR 덱 보관함.
 *
 * **만들어 주는 곳이 아니라 맡아 두는 곳이다.** 이미 있는 발표 자료를 올려
 * 두고, 노트북 없이 나간 날 다른 자리에서 내려받아 발표할 수 있게 한다.
 * 그래서 이 화면에서 제일 중요한 버튼은 업로드가 아니라 **내려받기**다.
 */
export default function IrDecksPage() {
  const { session } = useAuth();
  const tenantId = session?.tenantId ?? '';

  const [decks, setDecks] = useState<IrDeck[]>([]);
  const [loading, setLoading] = useState(true);
  const [uploadOpen, setUploadOpen] = useState(false);
  const [editing, setEditing] = useState<IrDeck | null>(null);

  const load = useCallback(async () => {
    if (!tenantId) {
      setLoading(false);
      return;
    }
    setLoading(true);
    try {
      setDecks(await irDeckApi.list(tenantId));
    } finally {
      setLoading(false);
    }
  }, [tenantId]);

  useEffect(() => {
    void load();
  }, [load]);

  return (
    <div className="mx-auto w-full max-w-3xl px-4 py-6">
      <header className="mb-5 flex items-start justify-between gap-4">
        <div>
          <h1 className="text-xl font-bold text-grey-900">IR 덱 보관함</h1>
          <p className="mt-1 text-sm leading-6 text-grey-600">
            발표 자료를 올려 두면 어디서든 내려받아 쓸 수 있습니다.
          </p>
        </div>
        <Button onClick={() => setUploadOpen(true)}>올리기</Button>
      </header>

      {loading ? (
        <Card className="p-8 text-center text-sm text-grey-500">
          불러오는 중입니다…
        </Card>
      ) : decks.length === 0 ? (
        <Card className="p-8 text-center">
          <p className="text-sm font-semibold text-grey-800">
            아직 올린 덱이 없습니다.
          </p>
          <p className="mt-1.5 text-sm leading-6 text-grey-600">
            PDF·PPT·키노트를 올려 두면, 노트북이 없는 자리에서도 바로 내려받아
            발표할 수 있어요.
          </p>
          <Button className="mt-4" onClick={() => setUploadOpen(true)}>
            첫 덱 올리기
          </Button>
        </Card>
      ) : (
        <div className="space-y-2">
          {decks.map((deck) => (
            <DeckRow
              key={deck.id}
              deck={deck}
              tenantId={tenantId}
              onEdit={() => setEditing(deck)}
              onRemoved={() => void load()}
            />
          ))}
        </div>
      )}

      <Modal
        open={uploadOpen}
        onClose={() => setUploadOpen(false)}
        title="덱 올리기"
      >
        <UploadForm
          tenantId={tenantId}
          onDone={() => {
            setUploadOpen(false);
            void load();
          }}
        />
      </Modal>

      <Modal
        open={editing !== null}
        onClose={() => setEditing(null)}
        title="이름·메모 고치기"
      >
        {editing && (
          <EditForm
            tenantId={tenantId}
            deck={editing}
            onDone={() => {
              setEditing(null);
              void load();
            }}
          />
        )}
      </Modal>
    </div>
  );
}

function DeckRow({
  deck, tenantId, onEdit, onRemoved,
}: {
  deck: IrDeck;
  tenantId: string;
  onEdit: () => void;
  onRemoved: () => void;
}) {
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function download() {
    setBusy(true);
    setError(null);
    try {
      await downloadIrDeck(tenantId, deck.id, deck.fileName);
    } catch (err) {
      setError((err as Error).message);
    } finally {
      setBusy(false);
    }
  }

  async function remove() {
    if (!confirm(`"${deck.name}" 을 지웁니다. 파일도 함께 지워집니다.`)) return;
    setBusy(true);
    try {
      await irDeckApi.remove(tenantId, deck.id);
      onRemoved();
    } finally {
      setBusy(false);
    }
  }

  return (
    <Card className="p-3.5">
      <div className="flex items-start gap-3">
        {/* 표지가 있으면 보여 준다 — 이름만으로는 어느 버전인지 잘 안 떠오른다 */}
        {deck.hasThumb ? (
          <Thumb tenantId={tenantId} id={deck.id} />
        ) : (
          <span className="flex size-14 shrink-0 items-center justify-center rounded-lg bg-grey-100 text-lg text-grey-400">
            ▤
          </span>
        )}

        <div className="min-w-0 flex-1">
          <p className="text-sm font-bold leading-snug text-grey-900">
            {deck.name}
          </p>
          <p className="mt-0.5 truncate text-xs text-grey-500">
            {deck.fileName}
            <span className="mx-1.5 text-grey-300">·</span>
            {formatBytes(deck.fileSize)}
            <span className="mx-1.5 text-grey-300">·</span>
            {deck.updatedAt.slice(0, 10)}
          </p>
          {deck.memo && (
            <p className="mt-1 text-xs leading-5 text-grey-600">{deck.memo}</p>
          )}

          <div className="mt-2 flex flex-wrap items-center gap-2">
            {/*
              내려받기가 이 화면의 목적이라 제일 눈에 띄게 둔다.
              링크가 아니라 버튼인 이유는 인증 때문이다 — `<a download>` 는
              브라우저가 직접 요청을 보내서 우리 토큰이 실리지 않는다.
            */}
            <button
              type="button"
              onClick={() => void download()}
              disabled={busy}
              className="inline-flex min-h-[36px] items-center rounded-full bg-brand px-3.5 text-xs font-semibold text-white disabled:opacity-60"
            >
              {busy ? '받는 중…' : '내려받기'}
            </button>
            <button
              type="button"
              onClick={onEdit}
              className="min-h-[36px] px-2 text-xs font-semibold text-grey-600 hover:text-grey-800"
            >
              고치기
            </button>
            <button
              type="button"
              onClick={() => void remove()}
              disabled={busy}
              className="min-h-[36px] px-2 text-xs font-semibold text-grey-400 hover:text-danger disabled:opacity-50"
            >
              지우기
            </button>
          </div>

          {error && <p className="mt-1.5 text-xs text-danger">{error}</p>}
        </div>
      </div>
    </Card>
  );
}

/**
 * 표지 이미지.
 *
 * 주소를 그대로 `<img>` 에 넣으면 인증이 안 붙어 401 이 온다. 받아서
 * 임시 주소로 만들어 보여 주고, 사라질 때 반납한다.
 */
function Thumb({ tenantId, id }: { tenantId: string; id: string }) {
  const [url, setUrl] = useState<string | null>(null);

  useEffect(() => {
    let revoked = false;
    let made: string | null = null;

    void irDeckApi
      .blob(tenantId, id, 'thumb')
      .then((blob) => {
        if (revoked) return;
        made = URL.createObjectURL(blob);
        setUrl(made);
      })
      .catch(() => setUrl(null));

    return () => {
      revoked = true;
      if (made) URL.revokeObjectURL(made);
    };
  }, [tenantId, id]);

  if (!url) {
    return (
      <span className="size-14 shrink-0 rounded-lg bg-grey-100" aria-hidden />
    );
  }
  return (
    <img
      src={url}
      alt=""
      className="size-14 shrink-0 rounded-lg border border-grey-200 object-cover"
    />
  );
}

function UploadForm({
  tenantId, onDone,
}: {
  tenantId: string;
  onDone: () => void;
}) {
  const fileRef = useRef<HTMLInputElement>(null);
  const thumbRef = useRef<HTMLInputElement>(null);
  const [file, setFile] = useState<File | null>(null);
  const [thumb, setThumb] = useState<File | null>(null);
  const [name, setName] = useState('');
  const [memo, setMemo] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function submit() {
    if (!file || !tenantId) return;
    setBusy(true);
    setError(null);
    try {
      await irDeckApi.upload(tenantId, {
        file,
        thumb,
        // 이름을 안 적으면 파일명을 쓴다 — 빈 이름으로 남는 것보다 낫다
        name: name.trim() || file.name.replace(/\.[^.]+$/, ''),
        memo: memo.trim() || undefined,
      });
      onDone();
    } catch (err) {
      setError((err as Error).message);
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="space-y-4">
      <div>
        <label className="mb-1.5 block text-sm font-semibold text-grey-800">
          덱 파일 <span className="text-brand">*</span>
        </label>
        <input
          ref={fileRef}
          type="file"
          accept=".pdf,.ppt,.pptx,.key,.pages,.doc,.docx,.hwp,.hwpx"
          onChange={(e) => {
            const f = e.target.files?.[0] ?? null;
            setFile(f);
            // 이름을 안 적었으면 파일명에서 따온다
            if (f && !name.trim()) setName(f.name.replace(/\.[^.]+$/, ''));
          }}
          className="block w-full text-sm text-grey-700 file:mr-3 file:rounded-full file:border-0 file:bg-grey-100 file:px-4 file:py-2 file:text-sm file:font-semibold file:text-grey-700"
        />
        <p className="mt-1 text-xs text-grey-500">
          PDF · PPT · 키노트 · 한글 등, 100MB 까지
        </p>
      </div>

      <div>
        <label className="mb-1.5 block text-sm font-semibold text-grey-800">
          덱 이름
        </label>
        <input
          value={name}
          onChange={(e) => setName(e.target.value)}
          placeholder="투자용 v3"
          maxLength={200}
          className="w-full rounded-xl border border-grey-200 p-3 text-sm text-grey-900 placeholder:text-grey-400 focus:border-brand focus:outline-none"
        />
      </div>

      <div>
        <label className="mb-1.5 block text-sm font-semibold text-grey-800">
          표지 <span className="font-normal text-grey-400">(선택)</span>
        </label>
        <input
          ref={thumbRef}
          type="file"
          accept="image/*"
          onChange={(e) => setThumb(e.target.files?.[0] ?? null)}
          className="block w-full text-sm text-grey-700 file:mr-3 file:rounded-full file:border-0 file:bg-grey-100 file:px-4 file:py-2 file:text-sm file:font-semibold file:text-grey-700"
        />
        <p className="mt-1 text-xs text-grey-500">
          목록에서 어느 덱인지 한눈에 알아보는 데 씁니다.
        </p>
      </div>

      <div>
        <label className="mb-1.5 block text-sm font-semibold text-grey-800">
          메모 <span className="font-normal text-grey-400">(선택)</span>
        </label>
        <textarea
          value={memo}
          onChange={(e) => setMemo(e.target.value)}
          rows={2}
          placeholder="시드 라운드용, 2026년 3월 기준"
          className="w-full rounded-xl border border-grey-200 p-3 text-sm leading-6 text-grey-900 placeholder:text-grey-400 focus:border-brand focus:outline-none"
        />
      </div>

      {error && <p className="text-sm text-danger">{error}</p>}

      <div className="flex justify-end">
        <Button onClick={() => void submit()} disabled={!file || busy} size="lg">
          {busy ? '올리는 중…' : '올리기'}
        </Button>
      </div>
    </div>
  );
}

function EditForm({
  tenantId, deck, onDone,
}: {
  tenantId: string;
  deck: IrDeck;
  onDone: () => void;
}) {
  const [name, setName] = useState(deck.name);
  const [memo, setMemo] = useState(deck.memo ?? '');
  const [busy, setBusy] = useState(false);

  async function save() {
    setBusy(true);
    try {
      await irDeckApi.update(tenantId, deck.id, {
        name: name.trim() || deck.name,
        memo: memo.trim() || null,
      });
      onDone();
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="space-y-4">
      <div>
        <label className="mb-1.5 block text-sm font-semibold text-grey-800">
          덱 이름
        </label>
        <input
          value={name}
          onChange={(e) => setName(e.target.value)}
          maxLength={200}
          className="w-full rounded-xl border border-grey-200 p-3 text-sm text-grey-900 focus:border-brand focus:outline-none"
        />
      </div>
      <div>
        <label className="mb-1.5 block text-sm font-semibold text-grey-800">
          메모
        </label>
        <textarea
          value={memo}
          onChange={(e) => setMemo(e.target.value)}
          rows={3}
          className="w-full rounded-xl border border-grey-200 p-3 text-sm leading-6 text-grey-900 focus:border-brand focus:outline-none"
        />
      </div>
      <p className="text-xs text-grey-500">
        파일 자체를 바꾸려면 새로 올려 주세요.
      </p>
      <div className="flex justify-end">
        <Button onClick={() => void save()} disabled={busy} size="lg">
          {busy ? '저장 중…' : '저장'}
        </Button>
      </div>
    </div>
  );
}

function formatBytes(n: number): string {
  if (n < 1024) return `${n}B`;
  if (n < 1024 * 1024) return `${Math.round(n / 1024)}KB`;
  return `${(n / 1024 / 1024).toFixed(1)}MB`;
}
