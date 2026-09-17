import { detectTargetRequirements } from '@moai/shared';
import type { CompanyProfile } from '../company-profiles/entities/company-profile.entity';
import { EligibilityService } from './eligibility.service';
import type { Grant } from './entities/grant.entity';

/*
 * 대상 특성 판정 — 여성·재창업·소상공인·사회적경제·수출 전용 공고와
 * 선정 이력으로 답하는 조건.
 *
 * 공고 예시는 운영 DB 의 접수 중 공고 제목을 그대로 가져왔다.
 */

const grant = (over: Partial<Grant> = {}): Grant =>
  ({
    title: '지원사업',
    applicantTypes: [],
    targetRegions: [],
    targetIndustries: [],
    minBusinessYears: null,
    maxBusinessYears: null,
    maxEmployees: null,
    maxRevenue: null,
    requiredCertifications: [],
    applyTargetDetail: null,
    excludeTarget: null,
    minAge: null,
    maxAge: null,
    corporationOnly: null,
    summary: null,
    ...over,
  }) as Grant;

const profile = (over: Partial<CompanyProfile> = {}): CompanyProfile =>
  ({
    stage: 'individual',
    industry: 'it',
    region: '서울',
    regionDetail: null,
    foundedAt: null,
    employees: null,
    annualRevenue: null,
    founderBirthYear: null,
    isCorporation: false,
    conditionAnswers: {},
    certifications: [],
    founderTraits: [],
    isSmallBusiness: null,
    exportStatus: null,
    hasIp: null,
    pastPrograms: [],
    ...over,
  }) as CompanyProfile;

const svc = new EligibilityService();
const reason = (g: Grant, p: CompanyProfile, field: string) =>
  svc.evaluate(g, p).reasons.find((r) => r.field.startsWith(field));

describe('detectTargetRequirements', () => {
  it.each([
    ['2026년 여성창업 사업화지원사업(2차) 참여자 모집', 'female'],
    ['[대전] 2026년 소상공인 인건비 지원사업 공고', 'smallBusiness'],
    ['[강원] 정선군 2026년 수출기업 해외 물류비 지원 참여기업 모집 공고', 'exporting'],
    ['2026년 사회적기업 시설·운영비 지원사업', 'socialEconomy'],
  ])('제목의 전용 대상을 확신으로 찾는다 — %s', (title, kind) => {
    const found = detectTargetRequirements({ title });
    expect(found).toHaveLength(1);
    const r = found[0].requirement;
    expect(r.kind === 'trait' ? r.trait : r.kind).toBe(kind);
    expect(found[0].certain).toBe(true);
  });

  it.each([
    // 되려는 사람 대상 — 이미 사회적기업일 필요가 없다
    '[경북] 2026년 하반기 예비사회적기업 지정계획 공고',
    // 기업 대상 컨설팅 — 경력단절자 전용이 아니다
    '[경남] 2026년 경력단절예방지원사업 직장문화개선 기업컨설팅 참여기업 모집 공고',
    // 수출을 시작하려는 기업 대상
    '2026년 수출초보기업 지원사업',
    // 우대는 조건이 아니다
    '2026년 창업지원사업 (여성기업 우대)',
  ])('전용이 아닌 것은 찾지 않는다 — %s', (title) => {
    expect(detectTargetRequirements({ title })).toHaveLength(0);
  });

  it('제목에 여러 대상이 나열되면 확신하지 않는다', () => {
    const found = detectTargetRequirements({
      title: '[부산] 다시미마켓(마을기업 및 여성기업 프리마켓) 참여기업 모집 공고',
    });
    expect(found.length).toBeGreaterThan(0);
    expect(found.every((f) => !f.certain)).toBe(true);
  });

  it('신청대상이 갈래를 나열하면 한 갈래를 전용으로 읽지 않는다', () => {
    const found = detectTargetRequirements({
      title: '2026년 IP디딤돌 프로그램 지원대상 모집 공고',
      applyTargetDetail: '① 예비창업자 ② 충남지역 소재 학교 재학생',
    });
    expect(found).toHaveLength(0);
  });
});

describe('EligibilityService — 대상 특성', () => {
  const women = grant({ title: '2026년 여성기업 육성사업 공고' });

  it('여성 대표면 통과', () => {
    expect(reason(women, profile({ founderTraits: ['female'] }), '대상')?.verdict).toBe('pass');
  });

  it('안 골랐으면 확인 필요 — 무엇을 넣으면 되는지 알려 준다', () => {
    const r = reason(women, profile(), '대상');
    expect(r?.verdict).toBe('unknown');
    expect(r?.message).toContain('대표자 특성');
  });

  it('"해당 없음"으로 답했고 제목에 박혀 있으면 탈락', () => {
    expect(reason(women, profile({ founderTraits: ['none'] }), '대상')?.verdict).toBe('fail');
    expect(svc.evaluate(women, profile({ founderTraits: ['none'] })).level).toBe('ineligible');
  });

  it('신청대상 문장에서만 찾았으면 안 맞아도 탈락시키지 않는다', () => {
    const g = grant({
      title: '2026년 직장문화개선 컨설팅 참여 기업 모집 공고',
      applyTargetDetail: '여성기업',
    });
    expect(reason(g, profile({ founderTraits: ['none'] }), '대상')?.verdict).toBe('unknown');
  });

  it('예비창업자는 소상공인 전용 공고에 답을 기다리지 않고 탈락', () => {
    const g = grant({ title: '[대전] 2026년 소상공인 인건비 지원사업 공고' });
    expect(reason(g, profile({ stage: 'preliminary' }), '대상')?.verdict).toBe('fail');
  });

  it('사회적경제 인증이 있으면 통과, "해당 없음"이면 탈락', () => {
    const g = grant({ title: '[충남] 논산시 2026년 사회적경제기업 시설장비 지원사업 공고' });
    expect(reason(g, profile({ certifications: ['마을기업'] }), '대상')?.verdict).toBe('pass');
    expect(reason(g, profile({ certifications: ['해당 없음'] }), '대상')?.verdict).toBe('fail');
  });

  it('수출 준비 중이면 수출기업 전용 공고에서 탈락', () => {
    const g = grant({ title: '[대구] 2026년 수출기업 외국어 통ㆍ번역 사업 참가기업 모집 공고' });
    expect(reason(g, profile({ exportStatus: 'preparing' }), '대상')?.verdict).toBe('fail');
    expect(reason(g, profile({ exportStatus: 'exporting' }), '대상')?.verdict).toBe('pass');
  });
});

describe('EligibilityService — 선정 이력으로 조건에 답한다', () => {
  const graduates = grant({
    applyTargetDetail: "'23년~'26년 초기창업패키지 선정기업",
  });

  it('이력에 있으면 신청 대상 조건 통과', () => {
    const r = reason(graduates, profile({ pastPrograms: ['초기창업패키지'] }), '신청 대상 조건');
    expect(r?.verdict).toBe('pass');
  });

  it('이력을 골랐는데 없으면 탈락', () => {
    const r = reason(graduates, profile({ pastPrograms: ['예비창업패키지'] }), '신청 대상 조건');
    expect(r?.verdict).toBe('fail');
  });

  it('"없음"으로 답했어도 탈락', () => {
    const r = reason(graduates, profile({ pastPrograms: ['none'] }), '신청 대상 조건');
    expect(r?.verdict).toBe('fail');
  });

  it('이력을 안 골랐으면 예전처럼 사용자에게 묻는다', () => {
    const v = svc.evaluate(graduates, profile());
    expect(v.openConditions.map((c) => c.kind)).toContain('target');
  });

  it('기수혜 제외 조건 — 받은 적 있으면 탈락, 없으면 통과', () => {
    const g = grant({ excludeTarget: '예비창업패키지 기수혜 기업' });
    expect(reason(g, profile({ pastPrograms: ['예비창업패키지'] }), '제외 대상')?.verdict).toBe('fail');
    expect(reason(g, profile({ pastPrograms: ['none'] }), '제외 대상')?.verdict).toBe('pass');
  });
});

describe('EligibilityService — 막고 있는 내 정보 칸 표시', () => {
  it('빈 칸 때문에 모르는 것에는 그 칸 이름을 단다', () => {
    const g = grant({ title: '[대전] 2026년 소상공인 인건비 지원사업 공고', minAge: 19, maxAge: 39 });
    const fields = svc
      .evaluate(g, profile())
      .reasons.filter((r) => r.verdict === 'unknown')
      .map((r) => r.profileField);
    expect(fields).toEqual(expect.arrayContaining(['isSmallBusiness', 'founderBirthYear']));
  });

  it('공고 쪽이 모호해 모르는 것에는 달지 않는다 — 채워도 안 풀린다', () => {
    const g = grant({ title: '직장문화개선 컨설팅', applyTargetDetail: '여성기업' });
    const r = reason(g, profile({ founderTraits: ['none'] }), '대상');
    expect(r?.verdict).toBe('unknown');
    expect(r?.profileField).toBeUndefined();
  });

  it('선정 이력으로 답할 수 있는 조건은 이력 칸을 가리킨다', () => {
    const g = grant({ applyTargetDetail: "'23년~'26년 초기창업패키지 선정기업" });
    expect(reason(g, profile(), '신청 대상 조건')?.profileField).toBe('pastPrograms');
  });
});

describe('EligibilityService — 조건 문장 거르기와 자동 답변', () => {
  it('머리말·가리킴·절차 안내는 묻지 않는다', () => {
    const g = grant({
      excludeTarget: [
        '아래 항목 중 1개 이상에 해당되는 경우 신청 불가',
        '【입주제한 대상자】',
        '중복참여 제한',
        '「공정거래법」에 따라 상호출자제한기업집단(대기업)으로 지정된 사업자',
        '▶ 고용노동부가 공개하는 임금 체불사업주 명단에 포함된 자(기업)',
      ].join('\n'),
    });
    expect(svc.evaluate(g, profile()).openConditions).toHaveLength(0);
  });

  it('공고문 참조만 있으면 통과시키되 원문을 보라고 말한다', () => {
    const r = reason(grant({ excludeTarget: '공고문 참조' }), profile(), '제외 대상');
    expect(r?.verdict).toBe('pass');
    expect(r?.message).toContain('공고문');
  });

  it('특정 집단 안의 "누구나"는 조건으로 남긴다', () => {
    const g = grant({
      applyTargetDetail: '한동대학교 출신(학사,석사,박사, 졸업, 재학 누구나) 창업자(예비/초기/폐업 포함)',
    });
    expect(svc.evaluate(g, profile()).openConditions).toHaveLength(1);
  });

  it('예비창업자 제외 — 형태로 답한다', () => {
    const g = grant({ excludeTarget: '예비창업자 및 PoC 단계의 사업자 신청 불가' });
    expect(reason(g, profile({ stage: 'preliminary' }), '제외 대상')?.verdict).toBe('fail');
    expect(reason(g, profile({ stage: 'individual' }), '제외 대상')?.verdict).toBe('pass');
  });

  it('신청 대상 칸의 예비창업자 갈래로는 사업자를 탈락시키지 않는다', () => {
    const g = grant({
      applyTargetDetail: '예비창업자: 공고일 기준 사업자를 등록하지 않은 자로서, 선정 후 3개월 내 사업자 등록이 가능한 자',
    });
    expect(svc.evaluate(g, profile({ stage: 'individual' })).level).not.toBe('ineligible');
  });

  it('업력 제외 — 개업일로 계산한다', () => {
    const g = grant({ excludeTarget: '업력 1년 미만 창업기업' });
    const recent = new Date(Date.now() - 100 * 86_400_000).toISOString().slice(0, 10);
    expect(reason(g, profile({ foundedAt: recent }), '제외 대상')?.verdict).toBe('fail');
    expect(reason(g, profile({ foundedAt: '2020-01-01' }), '제외 대상')?.verdict).toBe('pass');
  });

  it('제외 업종 — 거리가 먼 업종만 해당 없음으로 답한다', () => {
    const g = grant({ excludeTarget: '숙박 및 음식점업, 부동산업 및 임대업, 도매 및 소매업 등 창업보육이 필요하지 않은 업종' });
    expect(reason(g, profile({ industry: 'it' }), '제외 대상')?.verdict).toBe('pass');
    expect(reason(g, profile({ industry: 'food' }), '제외 대상')?.verdict).toBe('unknown');
  });

  it('특허 미보유 기업 제외 — 지식재산 보유로 답한다', () => {
    const g = grant({ excludeTarget: '• 국내 특허 등록 또는 출원 중인 특허를 보유하지 않은 기업' });
    expect(reason(g, profile({ hasIp: false }), '제외 대상')?.verdict).toBe('fail');
    expect(reason(g, profile({ hasIp: true }), '제외 대상')?.verdict).toBe('pass');
  });
});
