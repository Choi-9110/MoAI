'use client';

import { useCallback, useEffect, useMemo, useState } from 'react';
import Link from 'next/link';
import {
  ELIGIBILITY_LABELS, businessYearsOf, roadmapStepsFor,
} from '@moai/shared';
import type {
  ApplicantType, CalendarItem, CalendarMonth, CompanyProfile,
} from '@moai/shared';
import { CalendarBoard, LEVEL_STYLE, formatMoney } from '@/components/calendar/calendar-board';
import { BriefsModal } from '@/components/briefs/briefs-modal';
import { FreshBanner } from '@/components/calendar/fresh-banner';
import { MiniCalendar } from '@/components/calendar/mini-calendar';
import { Button } from '@/components/ui/button';
import { Card, CardTitle } from '@/components/ui/card';
import { Modal } from '@/components/ui/modal';
import { StageModal } from '@/components/stage-modal';
import { StageBadge } from '@/components/stage-badge';
import {
  analyzeApi, api, briefApi, calendarApi,
  type BriefListItem, type Project,
} from '@/lib/api';
import { useAuth } from '@/lib/auth';

/** 기업 정보에서 판정에 쓰이는 항목 — 완성도 계산 기준 */
type Field = { key: keyof CompanyProfile; label: string };

const COMMON_FIELDS: Field[] = [
  { key: 'name', label: '이름' },
  { key: 'industry', label: '업종' },
  { key: 'region', label: '지역' },
];

/** 사업자가 있을 때만 묻는 항목 */
const BUSINESS_FIELDS: Field[] = [
  { key: 'foundedAt', label: '개업일' },
  { key: 'employees', label: '종업원 수' },
  { key: 'annualRevenue', label: '매출액' },
  { key: 'certifications', label: '보유 인증' },
];

export default function DashboardPage() {
  const { session } = useAuth();
  const today = useMemo(() => new Date(), []);

  const [month, setMonth] = useState<CalendarMonth | null>(null);
  const [upcoming, setUpcoming] = useState<CalendarItem[]>([]);
  const [profile, setProfile] = useState<CompanyProfile | null>(null);
  const [projects, setProjects] = useState<Project[]>([]);
  const [expanded, setExpanded] = useState(false);
  const [stagePicker, setStagePicker] = useState(false);
  const [analyzing, setAnalyzing] = useState(false);
  const [analyzeMsg, setAnalyzeMsg] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);

  const load = useCallback(async () => {
    if (!session) return;
    try {
      const [cal, soon, prof, plans] = await Promise.all([
        calendarApi.month({
          year: today.getFullYear(),
          month: today.getMonth() + 1,
          tenantId: session.tenantId,
        }),
        calendarApi.upcoming(14, session.tenantId),
        calendarApi.defaultProfile(session.tenantId).catch(() => null),
        api.listProjects().catch(() => ({ items: [] as Project[] })),
      ]);
      setMonth(cal);
      setUpcoming(soon);
      setProfile(prof);
      setProjects(
        plans.items.filter((p) => p.tenantId === session.tenantId).slice(0, 3),
      );
    } finally {
      setLoading(false);
    }
  }, [session, today]);

  useEffect(() => {
    void load();
  }, [load]);

  /**
   * 사업자 형태를 아직 고르지 않았으면 먼저 물어본다.
   * 이걸 건너뛰면 사업자가 없는 사람에게 매출액·법인 여부를 묻게 된다.
   */
  const needsStage = !loading && (!profile || !profile.stage);

  async function chooseStage(stage: ApplicantType) {
    if (!session) return;
    const body = profile
      ? { stage }
      : { tenantId: session.tenantId, name: session.name || '내 사업', stage };

    await calendarApi.saveProfile(body, profile?.id);
    await load();
  }

  /**
   * 사업 분석 — 하드 필터를 채우고 로컬 판정 워커를 깨운다.
   * 워커가 꺼져 있어도 하드 필터 결과는 반영되므로 화면은 정상 동작한다.
   */
  async function runAnalyze() {
    if (!session) return;
    setAnalyzing(true);
    setAnalyzeMsg(null);
    try {
      const r = await analyzeApi.run(session.tenantId);
      const { scanned, skippedFresh } = r.sweep;

      const head =
        scanned > 0
          ? `공고 ${scanned}건을 다시 검토했어요.`
          : skippedFresh > 0
            ? '이미 최신 상태예요.'
            : '검토할 공고가 없어요.';

      // 로컬 판정 서버가 없어도 하드 필터 결과는 반영된다.
      // 기술적인 오류 문구 대신 무엇이 빠졌는지만 알려준다.
      setAnalyzeMsg(
        r.worker.ok
          ? `${head} 세부 조건까지 확인했습니다.`
          : `${head} 세부 조건 분석은 로컬 분석 서버가 켜져 있을 때 진행됩니다.`,
      );
      await load();
    } catch (err) {
      setAnalyzeMsg((err as Error).message);
    } finally {
      setAnalyzing(false);
    }
  }

  /** 최신 정책 브리핑 — 내 조건에 걸리는 것이 있을 때만 쓴다 */
  const [brief, setBrief] = useState<BriefListItem | null>(null);
  const [briefsOpen, setBriefsOpen] = useState(false);

  useEffect(() => {
    if (!session) return;
    void briefApi
      .latest(session.tenantId)
      .then(setBrief)
      .catch(() => setBrief(null));
  }, [session]);

  /** 업력과 그에 해당하는 로드맵 단계 — 창업일이 없으면 비어 있다 */
  const businessYears = useMemo(
    () => businessYearsOf(profile?.foundedAt, profile?.stage),
    [profile],
  );
  const roadmapNow = useMemo(
    () => roadmapStepsFor(businessYears),
    [businessYears],
  );

  /** 입력 완성도 — 사업자가 없으면 사업자 항목은 세지 않는다. */
  const filled = useMemo(() => {
    const fields =
      profile?.stage === 'preliminary'
        ? COMMON_FIELDS
        : [...COMMON_FIELDS, ...BUSINESS_FIELDS];

    if (!profile) return { count: 0, total: fields.length, missing: fields.map((f) => f.label) };

    const missing: string[] = [];
    let count = 0;
    for (const f of fields) {
      const v = profile[f.key];
      const ok = Array.isArray(v)
        ? v.length > 0
        : v !== null && v !== undefined && v !== '';
      if (ok) count += 1;
      else missing.push(f.label);
    }
    return { count, total: fields.length, missing };
  }, [profile]);

  const closing = upcoming.filter((u) => (u.dDay ?? 99) <= 7);
  const writing = projects.filter((p) => p.status !== 'completed');

  return (
    <main className="mx-auto max-w-6xl px-4 py-6 sm:px-6 sm:py-8 lg:px-8">
      <header className="mb-6 flex flex-wrap items-start justify-between gap-4">
        <div>
        <div className="flex flex-wrap items-center gap-2.5">
          <h1 className="text-[26px] font-bold tracking-tight text-grey-900">
            {/* 기업 이름이 기준이다. 내 정보에서 정한 그 이름을 그대로 쓴다. */}
            안녕하세요, {profile?.name || session?.name || '사장'}님
          </h1>
          <StageBadge
            stage={profile?.stage ?? null}
            onClick={() => setStagePicker(true)}
          />
        </div>
        <p className="tabular mt-1 text-grey-600">
          오늘은 {today.getMonth() + 1}월 {today.getDate()}일이에요.
          {month && month.summary.total > 0
            ? ` 이번 달 마감되는 공고가 ${month.summary.total}건 있어요.`
            : ' 이번 달 마감되는 공고는 없어요.'}
        </p>
        </div>

        <div className="text-right">
          <Button onClick={runAnalyze} disabled={analyzing || needsStage}>
            {analyzing ? '분석 중…' : '사업 분석하기'}
          </Button>
          {analyzeMsg && (
            <p className="mt-1.5 max-w-[260px] text-xs text-grey-500">
              {analyzeMsg}
            </p>
          )}
        </div>
      </header>

      {/* 요약 숫자 3개 */}
      <div className="mb-5 grid gap-3 sm:grid-cols-3">
        <StatCard
          label="지원 가능"
          value={month?.summary.eligible ?? 0}
          unit="건"
          tone="success"
          hint="자격 요건을 충족해요"
        />
        <StatCard
          label="마감 임박"
          value={closing.length}
          unit="건"
          tone="danger"
          hint="7일 안에 마감돼요"
        />
        <StatCard
          label="작성 중"
          value={writing.length}
          unit="건"
          tone="brand"
          hint="사업계획서"
        />
      </div>

      {/* 내 정보 미완성 안내 */}
      {!needsStage && filled.count < filled.total && (
        <Link href="/profile" className="mb-5 block">
          <Card className="border border-brand-light bg-brand-light transition-opacity hover:opacity-90">
            <div className="flex items-center justify-between gap-4">
              <div>
                <p className="font-bold text-grey-900">
                  내 정보 {filled.count}/{filled.total} 입력됨
                </p>
                <p className="mt-1 text-sm text-grey-700">
                  {filled.missing.slice(0, 3).join(' · ')}
                  {filled.missing.length > 3 && ` 외 ${filled.missing.length - 3}개`}
                  를 채우면 더 정확하게 판정해 드려요.
                </p>
              </div>
              <span className="shrink-0 text-sm font-bold text-brand">
                입력하기 →
              </span>
            </div>
          </Card>
        </Link>
      )}

      {/*
        어제 새로 올라온 공고 — 매일 하루치만.
        맨 위에 두는 이유는 **매일 바뀌는 것이 여기뿐**이라서다.
      */}
      <FreshBanner tenantId={session?.tenantId} />

      {/*
        정책 브리핑 — 내 조건에 걸리는 것이 있을 때만 띄운다.

        걸리는 게 없는데 올려 두면 대시보드가 남의 소식으로 채워진다.
      */}
      {brief && brief.matchedCount > 0 && (
        <button
          type="button"
          onClick={() => setBriefsOpen(true)}
          className="block w-full text-left"
        >
          <Card className="mb-5 transition-colors hover:border-brand">
            <div className="flex items-start justify-between gap-4">
              <div className="min-w-0">
                <p className="font-bold text-grey-900">{brief.title}</p>
                <p className="mt-1.5 text-sm leading-6 text-grey-600">
                  <span className="font-semibold text-brand">
                    내 조건에 걸리는 변화 {brief.matchedCount}개
                  </span>
                  {' · '}
                  {brief.source} {brief.publishedAt}
                </p>
              </div>
              <span className="shrink-0 text-sm font-bold text-brand">
                보기 →
              </span>
            </div>
          </Card>
        </button>
      )}

      {/*
        지금 어느 단계인지.

        **한 줄로 줄였다.** 예전에는 단계 이름을 늘어놓아 카드 하나를 다
        썼는데, 대시보드에서 그만한 자리를 쓸 내용이 아니다. 궁금하면
        로드맵으로 가면 되고, 여기서는 **몇 년차인지와 몇 개인지**만 알면
        된다. 자세한 것은 눌러서 본다.
      */}
      {roadmapNow.length > 0 && (
        <Link
          href="/roadmap"
          className="mb-5 flex items-center gap-2 rounded-xl border border-grey-200 bg-white px-4 py-2.5 transition-colors hover:border-brand"
          /* 단계 이름은 여기 적지 않는다 — 대신 넘겨받을 화면에서 본다 */
          title={roadmapNow.map((s) => s.title).join(' · ')}
        >
          <span className="text-sm font-bold text-grey-900">
            {businessYears! < 0 ? '예비창업자' : `창업 ${businessYears}년차`}
          </span>
          <span className="text-sm text-grey-500">
            지금 볼 만한 자금 {roadmapNow.length}개
          </span>
          <span className="ml-auto text-sm font-bold text-brand">
            로드맵 →
          </span>
        </Link>
      )}

      <div className="grid gap-5 lg:grid-cols-[1fr_360px]">
        {/* 미니 캘린더 */}
        <MiniCalendar data={month} onExpand={() => setExpanded(true)} />

        {/* 마감 임박 */}
        <Card>
          <CardTitle
            action={
              <Link href="/calendar" className="-my-2 inline-flex min-h-[40px] items-center px-1 py-2 text-sm font-semibold text-brand">
                전체
              </Link>
            }
          >
            마감 임박
          </CardTitle>

          {loading ? (
            <p className="py-8 text-center text-sm text-grey-400">불러오는 중…</p>
          ) : upcoming.length === 0 ? (
            <p className="py-8 text-center text-sm text-grey-400">
              2주 안에 마감되는 공고가 없어요.
            </p>
          ) : (
            <ul className="space-y-3">
              {upcoming.slice(0, 5).map((it) => (
                <li key={it.grant.id} className="flex items-start gap-2.5">
                  <span
                    className={`mt-1.5 size-2 shrink-0 rounded-full ${LEVEL_STYLE[it.eligibility.level].dot}`}
                  />
                  <div className="min-w-0 flex-1">
                    <p className="truncate text-sm font-medium text-grey-800">
                      {it.grant.title}
                    </p>
                    <p className="tabular mt-0.5 text-xs text-grey-500">
                      D-{it.dDay} · {it.grant.agency}
                      {it.grant.amountMax != null &&
                        ` · 최대 ${formatMoney(it.grant.amountMax)}`}
                    </p>
                  </div>
                  <span
                    className={`shrink-0 rounded-full px-2 py-0.5 text-[11px] font-semibold ${LEVEL_STYLE[it.eligibility.level].chip}`}
                  >
                    {ELIGIBILITY_LABELS[it.eligibility.level]}
                  </span>
                </li>
              ))}
            </ul>
          )}
        </Card>
      </div>

      {/* 진행 중인 사업계획서 */}
      <Card className="mt-5">
        <CardTitle
          action={
            <Link href="/plans" className="-my-2 inline-flex min-h-[40px] items-center px-1 py-2 text-sm font-semibold text-brand">
              전체
            </Link>
          }
        >
          진행 중인 사업계획서
        </CardTitle>

        {projects.length === 0 ? (
          <div className="py-8 text-center">
            <p className="text-sm text-grey-500">
              아직 작성 중인 사업계획서가 없어요.
            </p>
            <Link href="/plans" className="mt-3 inline-block">
              <Button size="sm">사업계획서 만들기</Button>
            </Link>
          </div>
        ) : (
          <ul className="divide-y divide-grey-100">
            {projects.map((p) => (
              <li key={p.id}>
                <Link
                  href={`/plans/${p.id}`}
                  className="flex items-center justify-between gap-3 py-3"
                >
                  <div className="min-w-0">
                    <p className="truncate font-medium text-grey-800">{p.title}</p>
                    <p className="tabular mt-0.5 text-xs text-grey-500">
                      응답 {p.answeredCount}/12
                    </p>
                  </div>
                  <span className="shrink-0 rounded-full bg-grey-100 px-2.5 py-1 text-xs text-grey-600">
                    {p.status === 'completed' ? '완료' : '작성 중'}
                  </span>
                </Link>
              </li>
            ))}
          </ul>
        )}
      </Card>

      {/* 사업자 형태 선택 — 값이 없으면 진입 즉시 물어본다 */}
      <StageModal
        open={needsStage || stagePicker}
        onSelect={async (stage) => {
          await chooseStage(stage);
          setStagePicker(false);
        }}
        onSkip={stagePicker ? () => setStagePicker(false) : undefined}
      />

      {/* 캘린더 확대 */}
      <Modal
        open={expanded}
        onClose={() => setExpanded(false)}
        title="지원사업 캘린더"
        wide
      >
        {/*
          대시보드는 내가 담아 둔 것을 챙기는 곳이다.
          접수 중인 공고가 수백 건이라 전부 띄우면 관심 공고가 그 안에 묻힌다.
          전체는 체크박스로 열어 본다. 지원사업 페이지와는 목적이 다르다.
        */}
        <CalendarBoard
          tenantId={session?.tenantId}
          compact
          withSidePanel
          savedOnlyDefault
          // 모달에서 별을 누르면 뒤쪽 미니 캘린더도 같이 바뀌어야 한다
          onSavedChange={() => void load()}
        />
      </Modal>

      {/* 브리핑은 화면을 옮기지 않고 여기서 연다 */}
      <BriefsModal open={briefsOpen} onClose={() => setBriefsOpen(false)} />
    </main>
  );
}

function StatCard({
  label, value, unit, tone, hint,
}: {
  label: string;
  value: number;
  unit: string;
  tone: 'success' | 'danger' | 'brand';
  hint: string;
}) {
  const color = {
    success: 'text-success',
    danger: 'text-danger',
    brand: 'text-brand',
  }[tone];

  return (
    <div className="rounded-2xl bg-white p-5">
      <p className="text-sm font-semibold text-grey-600">{label}</p>
      <p className={`tabular mt-1.5 text-[28px] font-extrabold leading-none ${color}`}>
        {value}
        <span className="ml-0.5 text-base font-bold">{unit}</span>
      </p>
      <p className="mt-2 text-xs text-grey-400">{hint}</p>

    </div>
  );
}
