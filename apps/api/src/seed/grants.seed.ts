import type { AgencyType, GrantCategory, Industry } from '@moai/shared';

export interface GrantSeed {
  title: string;
  agency: string;
  agencyType: AgencyType;
  category: GrantCategory;
  summary: string;
  /** 오늘로부터 며칠 뒤 마감인지 — 시드 시점 기준으로 날짜를 계산한다 */
  endInDays: number;
  startInDays: number;
  amountMax?: number;
  targetRegions?: string[];
  targetIndustries?: Industry[];
  minBusinessYears?: number;
  maxBusinessYears?: number;
  maxEmployees?: number;
  maxRevenue?: number;
  requiredCertifications?: string[];
  corporationOnly?: boolean;
  applicantTypes?: ("preliminary" | "individual" | "corporate")[];
  recurrence?: "once" | "monthly" | "always";
  sourceUrl?: string;
}

/**
 * 샘플 공고.
 *
 * 판정 로직 검증을 위해 네 가지 결과가 모두 나오도록 구성했다.
 * (지원 가능 / 조건부 / 지원 불가 / 정보 부족)
 */
export const GRANT_SEEDS: GrantSeed[] = [
  {
    title: '2026년 초기창업패키지 창업기업 모집',
    agency: '창업진흥원',
    agencyType: 'public',
    category: 'startup',
    summary:
      '창업 3년 이내 기업의 시제품 제작·마케팅 등 사업화 자금을 지원함. 최대 1억원.',
    startInDays: -10,
    endInDays: 12,
    amountMax: 100_000_000,
    maxBusinessYears: 3,
    applicantTypes: ['preliminary','individual','corporate'],
    sourceUrl: 'https://www.k-startup.go.kr',
  },
  {
    title: '창업도약패키지 사업화 지원',
    agency: '창업진흥원',
    agencyType: 'public',
    category: 'funding',
    summary: '창업 3~7년 도약기 기업의 스케일업을 지원함.',
    startInDays: -5,
    endInDays: 20,
    amountMax: 300_000_000,
    minBusinessYears: 3,
    maxBusinessYears: 7,
    applicantTypes: ['individual','corporate'],
    sourceUrl: 'https://www.k-startup.go.kr',
  },
  {
    title: '서울시 청년창업 성장지원 사업',
    agency: '서울특별시',
    agencyType: 'local',
    category: 'startup',
    summary: '서울 소재 창업기업 대상 사무공간 및 성장자금 지원.',
    startInDays: -3,
    endInDays: 5,
    amountMax: 50_000_000,
    targetRegions: ['서울'],
    maxBusinessYears: 5,
    applicantTypes: ['preliminary','individual','corporate'],
    sourceUrl: 'https://www.seoul.go.kr',
  },
  {
    title: '경기도 스타트업 R&D 과제',
    agency: '경기도경제과학진흥원',
    agencyType: 'local',
    category: 'rnd',
    summary: '경기도 소재 기업의 기술개발 과제를 지원함.',
    startInDays: 2,
    endInDays: 25,
    amountMax: 200_000_000,
    targetRegions: ['경기'],
    targetIndustries: ['it', 'manufacturing'],
    applicantTypes: ['individual','corporate'],
    sourceUrl: 'https://www.gbsa.or.kr',
  },
  {
    title: '벤처기업 해외진출 바우처',
    agency: '중소벤처기업부',
    agencyType: 'central',
    category: 'export',
    summary: '벤처기업 확인을 받은 기업의 해외 마케팅 비용을 지원함.',
    startInDays: -7,
    endInDays: 18,
    amountMax: 30_000_000,
    requiredCertifications: ['벤처기업확인'],
    applicantTypes: ['corporate'],
    sourceUrl: 'https://www.mss.go.kr',
  },
  {
    title: 'AI 바우처 지원사업',
    agency: '정보통신산업진흥원',
    agencyType: 'public',
    category: 'voucher',
    summary: 'AI 솔루션 도입 비용을 지원함. 법인 사업자만 신청 가능.',
    startInDays: -1,
    endInDays: 9,
    amountMax: 300_000_000,
    targetIndustries: ['it'],
    corporationOnly: true,
    applicantTypes: ['corporate'],
    sourceUrl: 'https://www.nipa.kr',
  },
  {
    title: '소상공인 스마트기술 도입 지원',
    agency: '소상공인시장진흥공단',
    agencyType: 'public',
    category: 'funding',
    summary: '연매출 10억원 이하 소상공인의 스마트기술 도입을 지원함.',
    startInDays: -14,
    endInDays: 3,
    amountMax: 20_000_000,
    maxRevenue: 1_000_000_000,
    maxEmployees: 10,
    applicantTypes: ['individual','corporate'],
    sourceUrl: 'https://www.semas.or.kr',
  },
  {
    title: '창업경진대회 슈퍼스타트업',
    agency: '한국콘텐츠진흥원',
    agencyType: 'public',
    category: 'contest',
    summary: '콘텐츠 분야 창업 아이디어 경진대회. 수상 시 상금 및 후속 지원.',
    startInDays: -20,
    endInDays: 28,
    amountMax: 50_000_000,
    targetIndustries: ['content'],
    applicantTypes: ['preliminary','individual'],
    sourceUrl: 'https://www.kocca.kr',
  },
  {
    title: '기술보증기금 청년창업 특별보증',
    agency: '기술보증기금',
    agencyType: 'public',
    category: 'funding',
    summary: '창업 7년 이내 기술기업 대상 보증 지원.',
    startInDays: -30,
    endInDays: 40,
    amountMax: 500_000_000,
    maxBusinessYears: 7,
    applicantTypes: ['individual','corporate'],
    sourceUrl: 'https://www.kibo.or.kr',
  },
  {
    title: '판교 스타트업 캠퍼스 입주기업 모집',
    agency: '경기창조경제혁신센터',
    agencyType: 'public',
    category: 'space',
    summary: '판교 소재 창업 공간 입주 기업 모집. 최대 2년 무상 임대.',
    startInDays: -2,
    endInDays: 15,
    targetRegions: ['경기', '성남'],
    maxBusinessYears: 5,
    maxEmployees: 20,
    applicantTypes: ['preliminary','individual','corporate'],
    sourceUrl: 'https://ccei.creativekorea.or.kr',
  },
];
