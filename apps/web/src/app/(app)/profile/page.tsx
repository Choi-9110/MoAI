'use client';

import { useCallback, useEffect, useMemo, useState } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import {
  EXPORT_STATUSES, EXPORT_STATUS_LABELS, FOUNDER_TRAITS, FOUNDER_TRAIT_LABELS,
  INDUSTRIES, NO_CERTIFICATION, NO_FOUNDER_TRAIT, NO_PAST_PROGRAM, PAST_PROGRAMS,
  districtsOf, isBusinessNumber, suggestSmallBusiness,
} from '@moai/shared';
import type { ExportStatus, Interest } from '@moai/shared';
import {
  APPLICANT_TYPE_LABELS as STAGE_LABELS, INDUSTRY_LABELS,
} from '@moai/shared';
import type { ApplicantType, CompanyProfile, Industry } from '@moai/shared';
import { BusinessNumberInput } from '@/components/business-number-input';
import { InterestPicker } from '@/components/interest-picker';
import { Button } from '@/components/ui/button';
import { Card } from '@/components/ui/card';
import { ChipGroup, FieldError, Input, Label, Select } from '@/components/ui/field';
import { calendarApi } from '@/lib/api';
import { useAuth } from '@/lib/auth';

const REGIONS = [
  '서울', '경기', '인천', '부산', '대구', '광주', '대전', '울산', '세종',
  '강원', '충북', '충남', '전북', '전남', '경북', '경남', '제주',
];

const CERTIFICATIONS = [
  '벤처기업확인', '이노비즈', '메인비즈', '여성기업', '장애인기업',
  '사회적기업', '예비사회적기업', '협동조합', '마을기업', '소셜벤처',
  '연구개발전담부서', 'ISO', '기업부설연구소',
];

/** 예/아니오 칩 — 한 번 눌러 답하게 한다. 입력칸보다 훨씬 덜 지친다. */
const YES_NO = [
  { value: 'yes', label: '예' },
  { value: 'no', label: '아니오' },
] as const;
const toYesNo = (v: boolean | null) => (v == null ? null : v ? 'yes' : 'no');

interface FormState {
  name: string;
  stage: ApplicantType | null;
  businessNumber: string;
  industry: Industry | null;
  region: string;
  regionDetail: string;
  foundedAt: string;
  founderBirthYear: string;
  employees: string;
  annualRevenue: string;
  certifications: string[];
  founderTraits: string[];
  isSmallBusiness: boolean | null;
  exportStatus: ExportStatus | null;
  hasIp: boolean | null;
  pastPrograms: string[];
  interests: Interest[];
  procurementIndustries: string[];
  procurementRegistered: boolean | null;
  procurementPerformance: string;
}

const EMPTY: FormState = {
  name: '',
  stage: null,
  businessNumber: '',
  industry: null,
  region: '',
  regionDetail: '',
  foundedAt: '',
  founderBirthYear: '',
  employees: '',
  annualRevenue: '',
  certifications: [],
  founderTraits: [],
  isSmallBusiness: null,
  exportStatus: null,
  hasIp: null,
  pastPrograms: [],
  interests: [],
  procurementIndustries: [],
  procurementRegistered: null,
  procurementPerformance: '',
};

export default function ProfilePage() {
  const { session } = useAuth();
  const router = useRouter();
  const params = useSearchParams();
  const welcome = params.get('welcome') === '1';
  const fromStage = params.get('from') === 'stage';

  const [form, setForm] = useState<FormState>(EMPTY);
  const [existing, setExisting] = useState<CompanyProfile | null>(null);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [saved, setSaved] = useState(false);

  const load = useCallback(async () => {
    if (!session) return;
    try {
      const p = await calendarApi.defaultProfile(session.tenantId).catch(() => null);
      if (p) {
        setExisting(p);
        setForm({
          name: p.name ?? '',
          stage: p.stage ?? null,
          businessNumber: p.businessNumber ?? '',
          industry: p.industry,
          region: p.region ?? '',
          regionDetail: p.regionDetail ?? '',
          foundedAt: p.foundedAt ? p.foundedAt.slice(0, 10) : '',
          founderBirthYear:
            p.founderBirthYear != null ? String(p.founderBirthYear) : '',
          employees: p.employees != null ? String(p.employees) : '',
          annualRevenue: p.annualRevenue != null ? String(p.annualRevenue) : '',
          certifications: p.certifications ?? [],
          founderTraits: p.founderTraits ?? [],
          isSmallBusiness: p.isSmallBusiness ?? null,
          exportStatus: p.exportStatus ?? null,
          hasIp: p.hasIp ?? null,
          pastPrograms: p.pastPrograms ?? [],
          interests: p.interests ?? [],
          procurementIndustries: p.procurementIndustries ?? [],
          procurementRegistered: p.procurementRegistered ?? null,
          procurementPerformance:
            p.procurementPerformance != null ? String(p.procurementPerformance) : '',
        });
      }
      /*
       * 프로필이 없어도 이름을 미리 채우지 않는다.
       * 예전에는 계정 이름으로 "최현근님" 같은 값을 넣었는데, 그건 사람 이름이지
       * 사업의 이름이 아니다. 그대로 저장되면 공고 판정과 사업계획서에
       * 엉뚱한 이름이 실려 나간다.
       */
    } finally {
      setLoading(false);
    }
  }, [session]);

  useEffect(() => {
    void load();
  }, [load]);

  /** 사업자가 없으면 사업자 관련 항목을 묻지 않는다. */
  const isPreliminary = form.stage === 'preliminary';

  /**
   * 고른 시·도의 시·군·구 — 세종처럼 없는 곳도 있다.
   *
   * 예전에 직접 적어 둔 값이 목록에 없을 수 있다(`성남` 처럼 줄여 적었거나,
   * 행정구역이 바뀌었거나). 그때 그 값을 목록에 끼워 넣지 않으면 화면이
   * 빈칸으로 보이고, 저장하는 순간 **적어 둔 것이 조용히 지워진다.**
   */
  const districts = useMemo(() => {
    const list = districtsOf(form.region);
    const mine = form.regionDetail.trim();
    return mine && !list.includes(mine) ? [mine, ...list] : list;
  }, [form.region, form.regionDetail]);

  /** 형태별로 실제 묻는 항목만 완성도에 넣는다. */
  const progress = useMemo(() => {
    const common = [
      form.name.trim() !== '',
      form.stage !== null,
      form.industry !== null,
      form.region !== '',
      form.founderBirthYear !== '',
      form.founderTraits.length > 0,
      form.pastPrograms.length > 0,
    ];
    const business = isPreliminary
      ? []
      : [
          form.foundedAt !== '',
          form.employees !== '',
          form.annualRevenue !== '',
          form.isSmallBusiness !== null,
          form.exportStatus !== null,
          form.hasIp !== null,
          form.certifications.length > 0,
        ];
    /*
     * 입찰을 켰으면 업종도 채워야 할 항목이다.
     *
     * 이걸 안 세면 업종이 비어 있어도 "다 채웠어요" 로 떠서, 정작 입찰
     * 목록은 비어 있는데 무엇이 모자란지 알 수 없는 상태가 된다.
     */
    const bid = form.interests.includes('bid')
      ? [form.procurementIndustries.length > 0]
      : [];
    const checks = [...common, ...business, ...bid];
    return { done: checks.filter(Boolean).length, total: checks.length };
  }, [form, isPreliminary]);

  function set<K extends keyof FormState>(key: K, value: FormState[K]) {
    setForm((f) => ({ ...f, [key]: value }));
    setSaved(false);
  }

  /**
   * 인증 고르기.
   *
   * **"해당 없음"은 다른 것과 함께 설 수 없다.** 인증이 있다면서 없다고
   * 하는 셈이 되기 때문이다. 그래서 그것을 고르면 나머지를 지우고,
   * 다른 것을 고르면 "해당 없음"이 빠진다.
   */
  function toggleExclusive(
    key: 'certifications' | 'founderTraits' | 'pastPrograms',
    value: string,
    none: string,
  ) {
    const list = form[key];
    const has = list.includes(value);

    if (value === none) {
      set(key, has ? [] : [none]);
      return;
    }

    const rest = list.filter((c) => c !== none && c !== value);
    set(key, has ? rest : [...rest, value]);
  }

  /**
   * 종업원 수·업종으로 본 소상공인 추천.
   *
   * **골라 주지 않고 권하기만 한다.** 매출 기준을 안 봤기 때문이다.
   * 이미 답했거나 종업원 수를 모르면 띄우지 않는다.
   */
  const smallBusinessHint = useMemo(() => {
    if (form.isSmallBusiness !== null || form.employees === '') return null;
    return suggestSmallBusiness(Number(form.employees), form.industry);
  }, [form.isSmallBusiness, form.employees, form.industry]);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!session) return;

    /*
     * 자리수가 모자란 채로는 보내지 않는다. 서버도 막지만, 저장 버튼을
     * 누른 뒤에 빨간 글씨를 보는 것보다 여기서 잡는 편이 낫다.
     */
    if (
      !isPreliminary &&
      form.businessNumber &&
      !isBusinessNumber(form.businessNumber)
    ) {
      setError('사업자등록번호를 10자리로 다 채우거나, 세 칸을 모두 비워 주세요.');
      return;
    }

    setSaving(true);
    setError(null);

    const body: Record<string, unknown> = {
      tenantId: session.tenantId,
      name: form.name.trim(),
      certifications: form.certifications,
      founderTraits: form.founderTraits,
      pastPrograms: form.pastPrograms,
      interests: form.interests,
      isDefault: true,
      ...(form.stage && { stage: form.stage }),
      ...(form.industry && { industry: form.industry }),
      ...(form.region && { region: form.region }),
      ...(form.regionDetail && { regionDetail: form.regionDetail.trim() }),
      ...(form.founderBirthYear && {
        founderBirthYear: Number(form.founderBirthYear),
      }),
    };

    // 사업자가 있을 때만 사업자 정보를 보낸다.
    if (!isPreliminary) {
      /*
       * 비운 것과 안 건드린 것을 구분한다. 예전에는 값이 있을 때만 보냈는데,
       * 저장이 PATCH 라 **한 번 넣은 번호를 지울 방법이 없었다** — 화면은
       * 빈칸인데 DB 에는 옛 번호가 남았다.
       */
      body.businessNumber = form.businessNumber || null;
      if (form.foundedAt) body.foundedAt = form.foundedAt;
      if (form.employees) body.employees = Number(form.employees);
      if (form.annualRevenue) body.annualRevenue = Number(form.annualRevenue);
      body.isCorporation = form.stage === 'corporate';
      body.isSmallBusiness = form.isSmallBusiness;
      body.exportStatus = form.exportStatus;
      body.hasIp = form.hasIp;
    }

    /*
     * 입찰 항목은 켠 사람만 보낸다. 껐을 때는 빈 값으로 덮어 **지운다** —
     * 끄고도 옛 업종이 남아 있으면 목록이 그 조건으로 계속 걸린다.
     */
    if (form.interests.includes('bid')) {
      body.procurementIndustries = form.procurementIndustries;
      body.procurementRegistered = form.procurementRegistered;
      body.procurementPerformance = form.procurementPerformance
        ? Number(form.procurementPerformance)
        : null;
    } else {
      body.procurementIndustries = [];
      body.procurementRegistered = null;
      body.procurementPerformance = null;
    }

    try {
      await calendarApi.saveProfile(body, existing?.id);
      setSaved(true);
      if (welcome || fromStage) router.replace('/dashboard');
      else await load();
    } catch (err) {
      setError((err as Error).message);
    } finally {
      setSaving(false);
    }
  }

  if (loading) {
    return (
      <main className="grid h-full place-items-center">
        <p className="text-sm text-grey-400">불러오는 중…</p>
      </main>
    );
  }

  return (
    <main className="mx-auto max-w-2xl px-4 py-6 sm:px-6 sm:py-8 lg:px-8">
      <header className="mb-6">
        <h1 className="text-[26px] font-bold tracking-tight text-grey-900">
          {welcome || fromStage ? '거의 다 됐어요' : '내 정보'}
        </h1>
        <p className="mt-1 text-grey-600">
          한 번만 입력하면 지원 자격 판정과 사업계획서 작성에 계속 쓰입니다.
          다시 묻지 않아요.
        </p>
      </header>

      <Card className="mb-5">
        <div className="flex items-center justify-between gap-4">
          <div>
            <p className="font-bold text-grey-900">
              <span className="tabular">
                {progress.done}/{progress.total}
              </span>{' '}
              입력됨
            </p>
            <p className="mt-1 text-sm text-grey-500">
              {progress.done === progress.total
                ? '모두 채웠어요. 가장 정확하게 판정해 드립니다.'
                : '비워두면 해당 공고는 “조건부”로 표시돼요.'}
            </p>
          </div>
          <div className="h-2 w-28 shrink-0 overflow-hidden rounded-full bg-grey-100">
            <div
              className="h-full rounded-full bg-brand transition-all"
              style={{
                width: `${(progress.done / Math.max(progress.total, 1)) * 100}%`,
              }}
            />
          </div>
        </div>
      </Card>

      <form onSubmit={handleSubmit}>
        <Card className="space-y-6">
          {/*
            맨 위에 둔다 — 여기서 고른 것이 아래에 무엇을 물을지를 정한다.
          */}
          <InterestPicker
            interests={form.interests}
            onInterests={(v) => set('interests', v)}
            industries={form.procurementIndustries}
            onIndustries={(v) => set('procurementIndustries', v)}
            registered={form.procurementRegistered}
            onRegistered={(v) => set('procurementRegistered', v)}
            performance={form.procurementPerformance}
            onPerformance={(v) => set('procurementPerformance', v)}
          />

          <Section title="기본 정보" hint="형태·업종·지역으로 신청할 수 있는 사업이 크게 갈립니다" />

          <div>
            <Label required hint="사업자가 있으면 상호, 없으면 편한 이름으로">
              이름
            </Label>
            <Input
              value={form.name}
              onChange={(e) => set('name', e.target.value)}
              required
              maxLength={160}
            />
          </div>

          <div>
            <Label required hint="형태에 따라 신청할 수 있는 사업이 달라집니다">
              사업자 형태
            </Label>
            <ChipGroup
              options={(['preliminary', 'individual', 'corporate'] as const).map(
                (s) => ({ value: s, label: STAGE_LABELS[s] }),
              )}
              value={form.stage}
              onChange={(v) => set('stage', v)}
            />
          </div>

          {/*
            **사업자등록번호는 형태 바로 밑에 둔다.**

            예전에는 맨 아래에 있었는데, 형태를 고르는 순간이 번호를 떠올리는
            순간이라 거기서 멀어질수록 안 적게 된다. 예비창업자에게는 아직
            번호가 없으므로 아예 묻지 않는다 — 못 채우는 칸이 보이면 덜
            채웠다는 기분만 남는다.
          */}
          {!isPreliminary && (
            <div>
              <Label hint="선택 — 서류 자동 기입에 씁니다">
                사업자등록번호
              </Label>
              <BusinessNumberInput
                value={form.businessNumber}
                onChange={(v) => set('businessNumber', v)}
              />
              {form.businessNumber && !isBusinessNumber(form.businessNumber) && (
                <p className="mt-1.5 text-xs text-grey-500">
                  숫자 10자리를 다 채워 주세요 (지금 {form.businessNumber.length}자리).
                </p>
              )}
            </div>
          )}

          <div>
            <Label hint="공고의 업종 요건과 대조합니다">관심 업종</Label>
            <ChipGroup
              options={INDUSTRIES.map((i) => ({
                value: i,
                label: INDUSTRY_LABELS[i],
              }))}
              value={form.industry}
              onChange={(v) => set('industry', v)}
            />
          </div>

          <div>
            <Label hint={isPreliminary ? '거주지 기준입니다' : '사업장 소재지 기준입니다'}>
              지역
            </Label>
            <div className="flex gap-2">
              <Select
                value={form.region}
                onChange={(e) => {
                  /*
                   * 시·도를 바꾸면 시·군을 지운다. 안 그러면 `부산 · 성남시`
                   * 같은 조합이 남아, 어디에도 맞지 않는 값이 저장된다.
                   */
                  set('region', e.target.value);
                  set('regionDetail', '');
                }}
                className="flex-1"
              >
                <option value="">선택하세요</option>
                {REGIONS.map((r) => (
                  <option key={r} value={r}>
                    {r}
                  </option>
                ))}
              </Select>
              {/*
                시·군은 **입찰 때문에 받는다.**
                지역제한 공고의 59% 가 `경기도 성남시` 처럼 시·군까지 걸려
                있어서, 시·도만 알면 그 절반을 못 거른다. 안 넣어도 되게
                두는 이유는 지원사업 판정에는 시·도면 충분해서다.

                **직접 적게 두지 않는다.** `성남` 과 `성남시` 처럼 조금만
                달라도 공고와 안 맞아 낼 수 있는 것이 조용히 사라진다.
                고르게 하면 그 어긋남이 생기지 않는다.
              */}
              <Select
                value={form.regionDetail}
                onChange={(e) => set('regionDetail', e.target.value)}
                disabled={districts.length === 0}
                className="flex-1"
              >
                <option value="">
                  {form.region === ''
                    ? '지역을 먼저 고르세요'
                    : districts.length === 0
                      ? '해당 없음'
                      : '시·군·구 (선택)'}
                </option>
                {districts.map((d) => (
                  <option key={d} value={d}>
                    {d}
                  </option>
                ))}
              </Select>
            </div>
          </div>

          {/*
            **묻는 순서 = 떠올리는 순서.**

            항목이 늘어난 만큼 지치지 않게 흐름을 나눴다 — 사람(대표자) →
            사업체 → 지나온 이력. 앞에서 답한 것이 뒤에서 물을 것을 줄인다
            (예비창업자면 사업체 칸을 통째로 건너뛰고, 종업원 수를 넣으면
            소상공인 여부를 권해 준다). 입력칸 대신 칩을 쓴 것도 같은 이유다.
          */}
          <Section title="대표자" hint="청년·여성·재창업 전용 공고를 가려냅니다" />

          <div>
            <Label hint="청년 대상 공고(만 39세 이하 등) 판정에 씁니다">
              대표자 출생연도
            </Label>
            <Input
              type="number"
              min={1900}
              max={new Date().getFullYear()}
              value={form.founderBirthYear}
              onChange={(e) => set("founderBirthYear", e.target.value)}
              placeholder="1991"
            />
            {form.founderBirthYear && (
              <p className="mt-1.5 text-xs text-grey-500">
                만{" "}
                {new Date().getFullYear() - Number(form.founderBirthYear) - 1}~
                {new Date().getFullYear() - Number(form.founderBirthYear)}세
                (생일 기준)
              </p>
            )}
          </div>

          <div>
            <Label hint="해당하는 것을 모두 고르세요. 없으면 “해당 없음”">
              대표자 특성
            </Label>
            <MultiChips
              options={[
                ...FOUNDER_TRAITS.map((t) => ({ value: t as string, label: FOUNDER_TRAIT_LABELS[t] })),
                { value: NO_FOUNDER_TRAIT, label: '해당 없음' },
              ]}
              selected={form.founderTraits}
              onToggle={(v) => toggleExclusive('founderTraits', v, NO_FOUNDER_TRAIT)}
            />
          </div>

          {/* 사업자가 없으면 아래 항목은 묻지 않는다 */}
          {isPreliminary ? (
            <div className="rounded-xl bg-brand-light p-4">
              <p className="text-sm font-semibold text-grey-800">
                사업자등록 전이라 사업체 정보는 건너뛸게요
              </p>
              <p className="mt-1 text-sm text-grey-600">
                창업일·매출액·인증은 사업자등록 후에 입력하시면 됩니다.
                지금은 예비창업자가 신청할 수 있는 사업만 골라 보여드릴게요.
              </p>
            </div>
          ) : (
            <>
              <Section title="사업체" hint="규모·소상공인·수출 요건을 판정합니다" />

              <div>
                <Label hint="사업자등록증상 개업일 — 업력 계산에 씁니다">
                  개업일
                </Label>
                <Input
                  type="date"
                  value={form.foundedAt}
                  onChange={(e) => set('foundedAt', e.target.value)}
                />
              </div>

              <div className="grid gap-4 sm:grid-cols-2">
                <div>
                  <Label hint="대표 포함">종업원 수</Label>
                  <Input
                    type="number"
                    min={0}
                    value={form.employees}
                    onChange={(e) => set('employees', e.target.value)}
                    placeholder="5"
                  />
                </div>
                <div>
                  <Label hint="최근 연도 기준, 원 단위">연 매출액</Label>
                  <Input
                    type="number"
                    min={0}
                    step={1000000}
                    value={form.annualRevenue}
                    onChange={(e) => set('annualRevenue', e.target.value)}
                    placeholder="300000000"
                  />
                </div>
              </div>

              {/* 종업원 수 바로 밑 — 방금 넣은 숫자로 답이 거의 정해진다 */}
              <div>
                <Label hint="소상공인 전용 공고가 많아요 (제조·건설 10명 미만, 그 외 5명 미만)">
                  소상공인인가요?
                </Label>
                <ChipGroup
                  options={[...YES_NO]}
                  value={toYesNo(form.isSmallBusiness)}
                  onChange={(v) => set('isSmallBusiness', v === 'yes')}
                />
                {smallBusinessHint !== null && (
                  <button
                    type="button"
                    onClick={() => set('isSmallBusiness', smallBusinessHint)}
                    className="mt-2 text-xs font-medium text-brand hover:underline"
                  >
                    종업원 {form.employees}명 기준으로는 소상공인{smallBusinessHint ? '이에요' : '이 아니에요'} — 그대로 선택
                  </button>
                )}
              </div>

              <div className="grid gap-4 sm:grid-cols-2">
                <div>
                  <Label hint="수출기업 전용 공고 판정">수출</Label>
                  <ChipGroup
                    options={EXPORT_STATUSES.map((e) => ({ value: e, label: EXPORT_STATUS_LABELS[e] }))}
                    value={form.exportStatus}
                    onChange={(v) => set('exportStatus', v)}
                  />
                </div>
                <div>
                  <Label hint="특허·실용신안·디자인권">지식재산 보유</Label>
                  <ChipGroup
                    options={[...YES_NO]}
                    value={toYesNo(form.hasIp)}
                    onChange={(v) => set('hasIp', v === 'yes')}
                  />
                </div>
              </div>

              <div>
                <Label hint="보유한 인증을 모두 선택하세요">보유 인증</Label>
                <MultiChips
                  options={[...CERTIFICATIONS, NO_CERTIFICATION].map((c) => ({ value: c, label: c }))}
                  selected={form.certifications}
                  onToggle={(v) => toggleExclusive('certifications', v, NO_CERTIFICATION)}
                />
              </div>
            </>
          )}

          <Section title="지원 이력" hint="“OO패키지 선정기업 대상”, “기수혜자 제외” 조건을 자동으로 답합니다" />

          <div>
            <Label hint="관심 공고에서 “선정”으로 표시하면 자동으로 추가돼요">
              선정된 적 있는 사업
            </Label>
            <MultiChips
              options={[
                ...PAST_PROGRAMS.map((p) => ({ value: p.value as string, label: p.value })),
                { value: NO_PAST_PROGRAM, label: '없음' },
              ]}
              selected={form.pastPrograms}
              onToggle={(v) => toggleExclusive('pastPrograms', v, NO_PAST_PROGRAM)}
            />
          </div>

          <FieldError>{error}</FieldError>

          {/*
            저장은 오른쪽 끝에 둔다 — 폼을 위에서 아래로 채우고 나면 시선이
            그쪽에서 끝나고, 오른손 엄지에도 가깝다.
          */}
          <div className="flex items-center justify-end gap-3">
            {saved && !welcome && !fromStage && (
              <span className="text-sm font-semibold text-success">
                저장되었습니다
              </span>
            )}
            <Button
              type="submit"
              size="lg"
              disabled={saving}
              className="min-w-[140px] px-8 py-3.5 text-base"
            >
              {saving
                ? '저장 중…'
                : welcome || fromStage
                  ? '저장하고 시작하기'
                  : '저장'}
            </Button>
          </div>
        </Card>
      </form>
    </main>
  );
}

/** 입력 흐름의 마디 — 지금 무엇에 대해 답하는지 알려 준다 */
function Section({ title, hint }: { title: string; hint: string }) {
  return (
    <div className="border-t border-grey-100 pt-6">
      <h2 className="text-base font-bold text-grey-900">{title}</h2>
      <p className="mt-0.5 text-sm text-grey-500">{hint}</p>
    </div>
  );
}

/**
 * 여러 개 고르는 칩.
 * "해당 없음" 같은 배타 값의 처리는 부르는 쪽(`toggleExclusive`)이 한다.
 */
function MultiChips({
  options, selected, onToggle,
}: {
  options: { value: string; label: string }[];
  selected: string[];
  onToggle: (value: string) => void;
}) {
  return (
    <div className="flex flex-wrap gap-2">
      {options.map((o) => {
        const on = selected.includes(o.value);
        return (
          <button
            key={o.value}
            type="button"
            onClick={() => onToggle(o.value)}
            className={`h-10 rounded-full px-4 text-sm font-medium transition-colors ${
              on
                ? 'bg-brand text-white'
                : 'bg-grey-100 text-grey-600 hover:bg-grey-200'
            }`}
          >
            {o.label}
          </button>
        );
      })}
    </div>
  );
}
