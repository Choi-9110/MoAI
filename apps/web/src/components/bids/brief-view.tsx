'use client';

import { useEffect, useMemo, useState } from 'react';
import {
  BID_DECISION_LABELS, BID_KIND_LABELS, briefProgress, formatMoney,
} from '@moai/shared';
import type { BidAnswer, BidBrief, BidDecision, BidNotice } from '@moai/shared';
import { Icon } from '@/components/brand/icon';
import { Button } from '@/components/ui/button';
import { Card } from '@/components/ui/card';
import { WorkingMessage } from '@/components/working-message';
import { procurementApi } from '@/lib/api';

/** 읽는 동안 보여 줄 말 — 실제로 거치는 단계에서 뽑았다 */
const READING_MESSAGES = [
  '공고문과 과업내용서를 내려받는 중입니다',
  '한글 문서를 펼쳐 글자를 뽑고 있습니다',
  '참가 자격 조항을 찾는 중입니다',
  '평가 방식과 배점을 확인하고 있습니다',
  '준비해야 할 것을 항목으로 정리하는 중입니다',
];

/**
 * 공고 읽어주기.
 *
 * **대신 써 주지 않는다.** 제안요청서에서 요건을 짚어 주고, 있으면 받아
 * 적고, 없으면 어떻게 풀지 제안한다. 마지막에 사람이 확인하고 고친다.
 *
 * 실제 제안요청서는 3만 자가 넘는다. 그걸 다 읽고 "우리한테 뭐가 없지"를
 * 골라내는 일이 입찰 준비의 대부분이라, 이 화면이 대신하는 것이 그 일이다.
 */
export function BriefView({
  notice, tenantId, onClose,
}: {
  notice: BidNotice;
  tenantId: string | null;
  onClose: () => void;
}) {
  const [brief, setBrief] = useState<BidBrief | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [answers, setAnswers] = useState<Record<string, BidAnswer>>({});
  /** 저장된 것을 꺼내 왔는지 — 다시 읽지 않았다는 표시 */
  const [fromCache, setFromCache] = useState(false);
  const [saveState, setSaveState] = useState<'idle' | 'saving' | 'saved' | 'failed'>('idle');
  /** 읽는 중인지 — 버튼을 눌러야 켜진다 */
  const [reading, setReading] = useState(false);
  const [starred, setStarred] = useState(false);

  /**
   * 읽은 결과를 먼저 서버에서 찾는다.
   *
   * 제안요청서를 읽는 데 1~2분과 모델 비용이 든다. 화면을 다시 열 때마다
   * 되풀이할 이유가 없어서, 한 번 읽은 것은 저장해 두고 그대로 꺼내 쓴다.
   */
  /** 읽을 첨부가 아예 없는 공고 — 8%쯤 된다 */
  const hasAttachment = notice.attachments.length > 0;

  useEffect(() => {
    if (!tenantId || !hasAttachment) return;
    let alive = true;
    setBrief(null);
    setError(null);

    void (async () => {
      const saved = await procurementApi
        .draft(tenantId, notice.bidNo)
        .catch(() => null);
      if (!alive) return;

      if (saved?.answers?.length) {
        setAnswers(
          Object.fromEntries(saved.answers.map((a) => [a.requirementId, a])),
        );
      }
      setStarred(saved?.starred ?? false);

      // 전에 읽어 둔 것이 있으면 그대로 쓴다 (1~3분과 모델 비용을 아낀다)
      if (saved?.brief && saved.briefStatus === 'done') {
        setBrief(saved.brief);
        setFromCache(true);
        return;
      }
      if (saved?.briefStatus === 'running') {
        setReading(true);
        return;
      }
      if (saved?.briefStatus === 'failed') {
        setError(saved.briefError ?? '공고를 읽지 못했습니다.');
      }
    })();

    return () => {
      alive = false;
    };
  }, [notice, tenantId, hasAttachment]);

  /**
   * 읽기는 **누를 때만** 시작한다.
   *
   * 카드를 여는 것만으로 돌리면, 목록을 훑다 잘못 누른 사람도 1~3분짜리
   * 작업과 모델 비용을 쓰게 된다. 스무 건을 열어 보는 일이 드물지 않다.
   */
  useEffect(() => {
    if (!tenantId || !reading) return;
    let alive = true;
    let timer: ReturnType<typeof setTimeout> | undefined;

    const poll = async (): Promise<void> => {
      const saved = await procurementApi
        .draft(tenantId, notice.bidNo)
        .catch(() => null);
      if (!alive) return;

      if (saved?.brief && saved.briefStatus === 'done') {
        setBrief(saved.brief);
        setReading(false);
        return;
      }
      if (saved?.briefStatus === 'failed') {
        setError(saved.briefError ?? '공고를 읽지 못했습니다.');
        setReading(false);
        return;
      }
      timer = setTimeout(() => void poll(), 4000);
    };

    void (async () => {
      try {
        await procurementApi.startBrief(tenantId, notice);
        if (!alive) return;
        timer = setTimeout(() => void poll(), 4000);
      } catch (err) {
        if (alive) {
          setError((err as Error).message);
          setReading(false);
        }
      }
    })();

    return () => {
      alive = false;
      if (timer) clearTimeout(timer);
    };
  }, [reading, tenantId, notice]);

  /**
   * 답을 적으면 잠시 뒤 저장한다.
   *
   * 글자마다 보내면 요청이 쏟아지고, 저장 버튼을 두면 누르지 않고 나간다.
   * 입찰 준비는 서류를 찾아보다 돌아오는 일이라 적어 둔 것이 남아야 한다.
   */
  useEffect(() => {
    if (!tenantId || !brief) return;
    const list = Object.values(answers);
    if (list.length === 0) return;

    setSaveState('saving');
    const timer = setTimeout(() => {
      void procurementApi
        .saveDraft(tenantId, notice.bidNo, { notice, answers: list })
        .then(() => setSaveState('saved'))
        .catch(() => setSaveState('failed'));
    }, 1200);

    return () => clearTimeout(timer);
  }, [answers, tenantId, brief, notice]);

  const progress = useMemo(
    () =>
      brief
        ? briefProgress(brief.requirements, Object.values(answers))
        : { answered: 0, total: 0, missing: 0 },
    [brief, answers],
  );

  const setAnswer = (id: string, patch: Partial<BidAnswer>) => {
    setAnswers((prev) => ({
      ...prev,
      [id]: {
        requirementId: id,
        have: patch.have ?? prev[id]?.have ?? null,
        note: patch.note ?? prev[id]?.note ?? '',
      },
    }));
  };

  return (
    /*
     * 팝업 안에서 그려진다. 바깥 여백과 "뒤로" 는 팝업이 이미 갖고 있어
     * 여기서 또 두지 않는다.
     */
    <div>
      <header className="mb-5 flex items-start justify-between gap-3">
        <div className="min-w-0">
        <h1 className="text-[22px] font-bold leading-snug tracking-tight text-grey-900">
          {notice.title}
        </h1>
        <p className="mt-1.5 text-sm text-grey-600">
          {notice.agency}
          {notice.estimate != null && (
            <> · 추정가 <b className="text-grey-800">{formatMoney(notice.estimate)}</b></>
          )}
          {notice.bidCloseAt && <> · 마감 {notice.bidCloseAt.slice(5, 16).replace('T', ' ')}</>}
        </p>
        </div>

        {/* 관심 표시 — 준비 메모에 함께 담긴다 */}
        <button
          type="button"
          onClick={() => {
            const next = !starred;
            setStarred(next);
            if (tenantId) {
              void procurementApi
                .saveDraft(tenantId, notice.bidNo, { notice, starred: next })
                .catch(() => setStarred(!next));
            }
          }}
          aria-pressed={starred}
          title={starred ? '관심 해제' : '관심 공고로 담기'}
          className={`shrink-0 text-2xl leading-none transition-colors ${
            starred ? 'text-star' : 'text-grey-300 hover:text-grey-400'
          }`}
        >
          {starred ? '★' : '☆'}
        </button>
      </header>

      {/*
        목록에서 아는 것은 먼저 보여 준다.

        첨부를 읽는 데 1~3분이 걸리고, 아예 첨부가 없는 공고도 있다. 그동안
        빈 화면을 두면 "나라장터에 가서 보라"는 말밖에 못 하는 셈이다.
      */}
      <Card className="mb-5">
        <h2 className="text-sm font-bold text-grey-700">공고 정보</h2>
        <dl className="mt-2 grid grid-cols-1 gap-x-6 gap-y-2 text-sm sm:grid-cols-2">
          {[
            ['발주기관', notice.agency],
            ['수요기관', notice.demandAgency],
            ['구분', BID_KIND_LABELS[notice.kind]],
            ['계약방법', notice.contractMethod],
            ['추정가격', notice.estimate != null ? formatMoney(notice.estimate) : null],
            ['예산', notice.budget != null ? formatMoney(notice.budget) : null],
            ['입찰 시작', notice.bidBeginAt?.slice(5, 16).replace('T', ' ')],
            ['입찰 마감', notice.bidCloseAt?.slice(5, 16).replace('T', ' ')],
            ['개찰', notice.openAt?.slice(5, 16).replace('T', ' ')],
            ['현장 지역', notice.siteRegion],
            ['낙찰 방법', notice.successMethod],
            ['입찰 방식', notice.bidMethod],
            ['공동수급', notice.jointAllowed ? '가능' : '불허'],
            ['공고 종류', notice.noticeKind],
            ['공고번호', notice.bidNo],
          ]
            .filter(([, v]) => v)
            .map(([k, v]) => (
              <div key={k as string} className="flex gap-3">
                <dt className="w-20 shrink-0 text-grey-500">{k}</dt>
                <dd className="min-w-0 flex-1 font-medium text-grey-800">{v}</dd>
              </div>
            ))}
        </dl>

        {/*
          **참가 자격.**

          예전에는 표에 "업종 제한: 있음" 한 줄이었다. 그런데 그것만 보면
          결국 공고문을 열어 무슨 제한인지 확인해야 해서, 알려 준 것이 없는
          것과 같았다. 나라장터는 이걸 별도 조회로 준다:

          - **물품·용역** — 면허제한 조회에 `식품판매업(집단급식소식품판매업)`
            처럼 이름과, 그것을 대신할 수 있는 업종까지 들어 있다.
          - **공사** — 면허제한 조회에 아예 없다. 업종 자체가 자격이라,
            우리가 이 공고를 찾아낸 업종(`matchedIndustry`)이 곧 답이다.
          - **지역** — 세 구분 모두 있고, 시·군 단위까지 내려온다
            (`전북특별자치도 군산시`). 목록의 시·도보다 훨씬 좁다.
        */}
        {(notice.licenses?.length ||
          notice.allowedRegions?.length ||
          notice.industryLimited) && (
          <div className="mt-3 rounded-xl border border-grey-200 bg-grey-50 p-3.5">
            <p className="mb-2 text-xs font-bold text-grey-700">참가 자격</p>
            <div className="space-y-2">
              {notice.licenses?.map((lic) => (
                <div key={lic.name}>
                  <p className="text-sm font-semibold text-grey-900">
                    {lic.name}
                  </p>
                  {lic.alternatives.length > 0 && (
                    <p className="mt-0.5 text-xs leading-5 text-grey-600">
                      이것으로도 가능: {lic.alternatives.join(', ')}
                    </p>
                  )}
                </div>
              ))}

              {/* 공사는 면허 대신 업종이 자격이다 */}
              {!notice.licenses?.length &&
                notice.industryLimited &&
                notice.matchedIndustry && (
                  <p className="text-sm font-semibold text-grey-900">
                    {notice.matchedIndustry}
                    <span className="ml-1.5 text-xs font-normal text-grey-500">
                      등록 업체만 참가
                    </span>
                  </p>
                )}

              {/* 무엇인지 못 알아낸 경우까지 숨기지는 않는다 */}
              {!notice.licenses?.length &&
                notice.industryLimited &&
                !notice.matchedIndustry && (
                  <p className="text-sm text-grey-600">
                    업종 제한이 걸려 있습니다. 공고 원문에서 확인해 주세요.
                  </p>
                )}

              {notice.allowedRegions?.length ? (
                <p className="text-sm text-grey-900">
                  <span className="font-semibold">
                    {notice.allowedRegions.join(', ')}
                  </span>
                  <span className="ml-1.5 text-xs text-grey-500">
                    소재 업체만 참가
                  </span>
                </p>
              ) : null}
            </div>
          </div>
        )}

        {/*
          참가 수수료는 표 안에 묻으면 안 된다.
          전체의 5~7% 에만 붙는데(공사는 0%) 금액이 최소 145만원, 큰 것은
          억 단위다. **드물기 때문에 더 위험하다** — 대부분 없으니 방심하고
          들어갔다가, 작은 공고에서 수수료가 낙찰금보다 커지는 일이 생긴다.
        */}
        {notice.participationFee != null && notice.participationFee > 0 && (
          <div className="mt-3 flex items-start gap-2.5 rounded-xl border border-warning-soft bg-warning-soft p-3.5">
            <span className="text-lg leading-none">⚠</span>
            <div className="min-w-0">
              <p className="text-sm font-bold text-warning-strong">
                입찰참가 수수료 {formatMoney(notice.participationFee)}
              </p>
              <p className="mt-1 text-xs leading-6 text-grey-700">
                낙찰 여부와 관계없이 <b>입찰에 참가할 때 내는 돈</b>입니다.
                추정가격
                {notice.estimate != null && (
                  <> ({formatMoney(notice.estimate)})</>
                )}
                과 견줘 넣을 값어치가 있는지 먼저 따져 보세요.
              </p>
            </div>
          </div>
        )}
      </Card>

      {/* ── 첨부가 없는 공고 ── */}
      {!hasAttachment && (
        <Card className="py-8 text-center">
          <p className="text-sm font-semibold text-grey-900">
            이 공고에는 첨부 문서가 없어요
          </p>
          <p className="mx-auto mt-2 max-w-md text-sm leading-relaxed text-grey-600">
            나라장터가 이 공고에 규격서·과업내용서를 함께 올리지 않았습니다.
            준비할 것을 짚어 드리려면 문서가 있어야 해서, 이번 건은 원문에서
            확인해 주세요.
          </p>
          {notice.url && (
            <a
              href={notice.url}
              target="_blank"
              rel="noreferrer"
              className="mt-4 inline-block text-sm font-semibold text-brand underline"
            >
              나라장터에서 공고 보기
            </a>
          )}
        </Card>
      )}

      {/* ── 아직 안 읽음 — 누를 때만 시작한다 ── */}
      {hasAttachment && !brief && !error && !reading && (
        <Card className="py-8 text-center">
          <p className="text-sm font-semibold text-grey-900">
            공고문을 읽어 준비할 것을 뽑아 드릴까요?
          </p>
          <p className="mx-auto mt-2 max-w-md text-sm leading-relaxed text-grey-600">
            첨부된 {notice.attachments.length}개 문서를 읽어 참가 자격·평가 방식·
            제출 서류를 항목으로 정리합니다. <b>2~3분</b> 걸리고, 한 번 읽으면
            다음부터는 바로 열립니다.
          </p>
          <div className="mt-4">
            <Button variant="brand" onClick={() => setReading(true)}>
              공고문 읽기
            </Button>
          </div>
          <p className="mt-3 text-xs text-grey-400">
            {notice.attachments.map((a) => a.name).join(', ')}
          </p>
        </Card>
      )}

      {/* ── 읽는 중 ── */}
      {reading && !brief && !error && (
        <Card className="py-12 text-center">
          <Icon
            name="spinner"
            size={28}
            className="mx-auto animate-spin text-brand"
          />
          <p className="mt-4 text-sm text-grey-600">
            <WorkingMessage messages={READING_MESSAGES} />
          </p>
          <p className="mt-2 text-xs text-grey-400">
            공고문이 길면 2~3분 걸립니다. 창을 닫아도 계속 읽습니다.
          </p>
        </Card>
      )}

      {error && (
        <Card className="py-10 text-center">
          <p className="text-sm font-semibold text-grey-900">공고를 읽지 못했어요</p>
          <p className="mx-auto mt-2 max-w-md text-sm leading-relaxed text-grey-600">
            {error}
          </p>
          {notice.url && (
            <a
              href={notice.url}
              target="_blank"
              rel="noreferrer"
              className="mt-4 inline-block text-sm font-semibold text-brand underline"
            >
              나라장터에서 직접 보기
            </a>
          )}
        </Card>
      )}

      {brief && (
        <div className="space-y-5">
          {/* ── 무슨 일인지 ── */}
          <Card>
            <h2 className="text-sm font-bold text-grey-700">어떤 일인가요</h2>
            <p className="mt-2 text-[15px] leading-7 text-grey-800">
              {brief.summary}
            </p>

            {brief.problem && (
              <div className="mt-4 rounded-xl bg-grey-50 p-3.5">
                <p className="text-xs font-semibold text-grey-500">
                  발주처가 풀려는 문제
                </p>
                <p className="mt-1 text-sm leading-6 text-grey-700">
                  {brief.problem}
                </p>
              </div>
            )}

            {/*
              평가 방식이 제일 먼저 읽혀야 한다. 가격으로만 정하는 입찰이면
              제안서를 쓸 일이 없는데, 그걸 모르고 문서부터 만들면 헛일이다.
            */}
            {brief.evaluation && (
              <div className="mt-3 rounded-xl border border-brand/30 bg-brand/[0.04] p-3.5">
                <p className="text-xs font-semibold text-brand">평가 방식</p>
                <p className="mt-1 text-sm leading-6 text-grey-800">
                  {brief.evaluation}
                </p>
              </div>
            )}

            <p className="mt-3 text-xs text-grey-400">
              {brief.sourceFiles.join(', ')} 에서 {brief.sourceChars.toLocaleString()}자를
              읽었습니다
              {fromCache && ' · 전에 읽어 둔 결과입니다'}
            </p>
          </Card>

          {/* ── 준비할 것 ── */}
          <div>
            <div className="mb-2.5 flex items-end justify-between">
              <h2 className="text-sm font-bold text-grey-700">
                {brief.decision === 'price' ? '갖춰야 할 자격' : '준비해야 할 것'}{' '}
                <span className="tabular font-normal text-grey-400">
                  {brief.requirements.length}
                </span>
              </h2>
              <p className="tabular text-xs text-grey-500">
                {saveState === 'saving' && (
                  <span className="mr-2 text-grey-400">저장 중…</span>
                )}
                {saveState === 'saved' && (
                  <span className="mr-2 text-grey-400">저장됨</span>
                )}
                {saveState === 'failed' && (
                  <span className="mr-2 font-semibold text-danger-strong">저장 실패</span>
                )}
                {progress.answered}/{progress.total} 판단함
                {progress.missing > 0 && (
                  <span className="ml-2 font-semibold text-warning-strong">
                    보완 {progress.missing}
                  </span>
                )}
              </p>
            </div>

            <div className="space-y-2">
              {brief.requirements.map((req) => (
                <RequirementRow
                  key={req.id}
                  req={req}
                  answer={answers[req.id]}
                  decision={brief.decision}
                  onChange={(patch) => setAnswer(req.id, patch)}
                />
              ))}
            </div>
          </div>

          {/* ── 과업 범위 · 제출 서류 ── */}
          {brief.scope.length > 0 && (
            <Card>
              <h2 className="text-sm font-bold text-grey-700">과업 범위</h2>
              <ul className="mt-2 space-y-1.5 text-sm leading-6 text-grey-700">
                {brief.scope.map((s, i) => (
                  <li key={i} className="flex gap-2">
                    <span className="text-grey-300">·</span>
                    <span>{s}</span>
                  </li>
                ))}
              </ul>
            </Card>
          )}

          {brief.documents.length > 0 && (
            <Card>
              <h2 className="text-sm font-bold text-grey-700">제출 서류</h2>
              <ul className="mt-2 space-y-1.5 text-sm leading-6 text-grey-700">
                {brief.documents.map((d, i) => (
                  <li key={i} className="flex gap-2">
                    <span className="text-grey-300">·</span>
                    <span>{d}</span>
                  </li>
                ))}
              </ul>
            </Card>
          )}

          {/*
            마지막 단계는 낙찰 방식에 따라 갈린다.

            가격만으로 정하는 공고에 제안서를 쓰면 며칠을 버린다. 반대로
            기술평가가 있는데 가격만 넣으면 떨어진다. 그래서 여기서
            **다음에 할 일 자체를 다르게** 보여 준다.
          */}
          <NextStep decision={brief.decision} notice={notice} progress={progress} />

          {notice.url && (
            <div>
              <div className="flex flex-wrap gap-2">
                <a href={notice.url} target="_blank" rel="noreferrer">
                  <Button variant="secondary">공고 원문 보기</Button>
                </a>
                <a href={notice.url} target="_blank" rel="noreferrer">
                  <Button variant="brand">나라장터에서 입찰하기 →</Button>
                </a>
              </div>
              {/*
                두 버튼이 같은 주소로 간다. 나라장터가 **투찰 전용 주소를 주지
                않기 때문이다** — 공고 상세 페이지에 로그인해 들어가면 그 안에
                입찰 참가 버튼이 있다. 목적이 다른 두 가지를 한 버튼에 담으면
                "읽기만 하려는 사람"이 누르기를 망설이므로 갈라 두되, 무엇이
                필요한지는 아래에 그대로 적는다.
              */}
              <p className="mt-2 text-xs leading-relaxed text-grey-500">
                투찰은 나라장터에서 직접 하셔야 합니다 — <b>로그인과 공인인증서
                (지문인식 보안토큰)</b>가 필요하고, 그 전에 조달청
                입찰참가자격 등록이 되어 있어야 합니다.
              </p>
            </div>
          )}

          <p className="text-xs leading-relaxed text-grey-400">
            공고문에서 뽑아낸 내용이며 요약 과정에서 빠진 조건이 있을 수 있습니다.
            제출 전에 원문과 반드시 대조해 주세요.
          </p>
        </div>
      )}
    </div>
  );
}

/* ────────────── 다음 단계 ────────────── */

function NextStep({
  decision, notice, progress,
}: {
  decision: BidDecision;
  notice: BidNotice;
  progress: { answered: number; total: number; missing: number };
}) {
  const ready = progress.total > 0 && progress.answered === progress.total;

  if (decision === 'price') {
    /*
     * 가격형 — 문서가 아니라 숫자를 정하는 일이다.
     *
     * 여기서 제안서 버튼을 띄우면 안 쓸 문서를 쓰게 만든다. 대신 투찰가를
     * 정하는 데 필요한 것을 보여 준다.
     */
    return (
      <Card className="border-success-strong/30 bg-success-soft/40">
        <p className="text-sm font-bold text-success-deep">
          {BID_DECISION_LABELS.price}
        </p>
        <p className="mt-1.5 text-sm leading-6 text-grey-700">
          이 공고는 기술평가 없이 가격으로 낙찰자를 정합니다.{' '}
          <b>제안서를 쓰지 않아도 됩니다.</b> 위 요건만 갖춰 참가 자격을 맞추고,
          투찰가를 정해 나라장터에서 직접 넣으시면 됩니다.
        </p>
        {notice.estimate != null && (
          <p className="mt-3 text-sm text-grey-700">
            추정가격{' '}
            <b className="text-grey-900">{formatMoney(notice.estimate)}</b>
            <span className="ml-2 text-xs text-grey-500">
              낙찰하한율은 공고마다 다르니 원문에서 확인해 주세요
            </span>
          </p>
        )}
        <p className="mt-3 text-xs text-grey-500">
          투찰가를 계산해 주는 기능은 낙찰 이력을 붙인 뒤에 열립니다.
        </p>
      </Card>
    );
  }

  if (decision === 'unknown') {
    return (
      <Card>
        <p className="text-sm font-bold text-grey-800">
          {BID_DECISION_LABELS.unknown}
        </p>
        <p className="mt-1.5 text-sm leading-6 text-grey-600">
          첨부 문서만으로는 제안서가 필요한지 확정하지 못했습니다. 잘못 짚으면
          쓰지 않아도 될 문서를 쓰게 되므로 원문을 한 번 확인해 주세요.
        </p>
      </Card>
    );
  }

  // technical · mixed — 제안서를 쓴다
  return (
    <Card className="border-brand/30 bg-brand/[0.04]">
      <p className="text-sm font-bold text-brand">
        {BID_DECISION_LABELS[decision]}
      </p>
      <p className="mt-1.5 text-sm leading-6 text-grey-700">
        위에 적어 주신 내용을 바탕으로 제안서 초안을 만듭니다. 요건마다 적은
        답이 그대로 근거가 되므로, 빈칸이 많을수록 초안이 얇아집니다.
      </p>

      {!ready && (
        <p className="mt-2 text-xs text-warning-strong">
          아직 {progress.total - progress.answered}개 항목에 답하지 않았습니다.
          지금 만들어도 되지만 그 부분은 비워 둔 채로 나옵니다.
        </p>
      )}

      <div className="mt-3">
        <Button variant="brand" disabled title="다음 단계에서 만듭니다">
          제안서 초안 만들기
        </Button>
      </div>
    </Card>
  );
}

/* ────────────── 요건 한 줄 ────────────── */

function RequirementRow({
  req, answer, decision, onChange,
}: {
  req: import('@moai/shared').BidRequirement;
  answer: BidAnswer | undefined;
  /**
   * 낙찰 방식.
   *
   * 가격으로만 정하는 공고에서는 이 답이 제안서로 가지 않는다. 그런데도
   * "제안서에 그대로 씁니다"라고 안내하면, 쓰지 않을 글을 쓰게 만든다.
   */
  decision: BidDecision;
  onChange: (patch: Partial<BidAnswer>) => void;
}) {
  const have = answer?.have ?? null;
  const [openQuote, setOpenQuote] = useState(false);

  return (
    <article
      className={`rounded-xl border bg-white p-4 ${
        have === false ? 'border-warning-soft' : 'border-grey-200'
      }`}
    >
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <p className="text-[15px] font-semibold leading-snug text-grey-900">
            {req.label}
          </p>
          <div className="mt-1 flex flex-wrap items-center gap-2 text-xs">
            <span
              className={`rounded px-1.5 py-0.5 font-medium ${
                req.required
                  ? 'bg-danger-soft text-danger-strong'
                  : 'bg-grey-100 text-grey-600'
              }`}
            >
              {req.required ? '필수' : '우대'}
            </span>
            {req.points != null && (
              <span className="tabular text-grey-500">{req.points}점</span>
            )}
          </div>
        </div>

        {/*
          적합 / 부적합.
          "있어요·없어요"는 실적처럼 세는 것에만 맞는 말이라, 면허·인증·
          규모처럼 갖췄는지를 따지는 항목에는 어색했다.
        */}
        <div className="flex shrink-0 gap-1.5">
          {[
            { v: true, t: '적합' },
            { v: false, t: '부적합' },
          ].map((o) => (
            <button
              key={String(o.v)}
              type="button"
              onClick={() => onChange({ have: have === o.v ? null : o.v })}
              className={`h-8 rounded-full px-3 text-xs font-medium transition-colors ${
                have === o.v
                  ? o.v
                    ? 'bg-success-strong text-white'
                    : 'bg-warning-strong text-white'
                  : 'bg-grey-100 text-grey-600 hover:bg-grey-200'
              }`}
            >
              {o.t}
            </button>
          ))}
        </div>
      </div>

      {/*
        원문 인용은 접어 둔다. 열다섯 개가 전부 펼쳐져 있으면 화면이 길어져
        정작 답을 못 한다. 다만 **확인하고 싶을 때 반드시 있어야 한다** —
        우리 요약을 믿고 제출했다가 조건이 달랐다면 그건 우리 탓이 된다.
      */}
      {req.quote && (
        <>
          <button
            type="button"
            onClick={() => setOpenQuote((v) => !v)}
            className="mt-2 text-xs text-grey-500 hover:text-grey-800"
          >
            {openQuote ? '▾' : '▸'} 공고 원문
          </button>
          {openQuote && (
            <blockquote className="mt-1.5 border-l-2 border-grey-200 pl-3 text-xs leading-6 text-grey-600">
              {req.quote}
            </blockquote>
          )}
        </>
      )}

      {/*
        답에 따라 다음에 할 일이 달라진다.

        제안서를 쓰는 공고에서는 여기 적은 것이 그대로 문서의 근거가 되지만,
        가격으로만 정하는 공고에서는 **자격을 갖췄는지 확인하는 것이 전부다.**
        그런 건에 "제안서에 씁니다"라고 하면 쓰지 않을 글을 쓰게 만든다.
      */}
      {have !== null && (
        <div className="mt-3">
          {have === false && (
            <div
              className={`mb-2 rounded-lg p-3 ${
                req.required ? 'bg-danger-soft' : 'bg-warning-soft'
              }`}
            >
              <p
                className={`text-xs font-semibold ${
                  req.required ? 'text-danger-strong' : 'text-warning-strong'
                }`}
              >
                {req.required
                  ? '필수 요건이라 부적합하면 떨어질 수 있어요'
                  : '갖추면 유리한 항목이에요'}
              </p>
              {req.fallbackHint && (
                <p className="mt-1 text-xs leading-6 text-grey-700">
                  {req.fallbackHint}
                </p>
              )}
            </div>
          )}

          {/*
            가격형 공고에서 "있어요"는 확인으로 끝난다. 굳이 적을 것이 없어
            입력칸을 열지 않는다 — 빈칸이 있으면 채워야 할 것처럼 보인다.
          */}
          {!(decision === 'price' && have) && (
            <textarea
              value={answer?.note ?? ''}
              onChange={(e) => onChange({ note: e.target.value })}
              rows={have ? 2 : 3}
              placeholder={
                decision === 'price'
                  ? '메모가 필요하면 적어두세요. 준비할 때 참고됩니다.'
                  : have
                    ? '어떤 실적·자격으로 충족하는지 적어주세요. 제안서에 그대로 씁니다.'
                    : '대신 내세울 경험을 편하게 적어주세요. 문장은 저희가 다듬습니다.'
              }
              className="w-full rounded-xl border border-grey-200 p-3 text-sm leading-6 text-grey-900 placeholder:text-grey-400 focus:border-brand focus:outline-none"
            />
          )}

          {decision === 'price' && have && (
            <p className="text-xs text-grey-500">
              확인됐습니다. 이 공고는 가격으로 정해져서 따로 적을 것은 없어요.
            </p>
          )}
        </div>
      )}
    </article>
  );
}
