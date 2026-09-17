/**
 * 초기 데이터 시드.
 *
 *   pnpm --filter @moai/api seed
 *
 * K-Startup 표준(PSST) 양식과 질의 12개를 넣는다.
 * 생성에는 최소 10개 응답이 필요하므로 여유를 두어 12개로 구성했다.
 */
import 'reflect-metadata';
import { config } from 'dotenv';
import { DataSource } from 'typeorm';
import type { QuestionType, SectionKey } from '@moai/shared';
import { Question } from '../questions/entities/question.entity';
import { Template } from '../templates/entities/template.entity';
import { Tenant } from '../tenants/entities/tenant.entity';
import { User } from '../users/entities/user.entity';
import { Project } from '../projects/entities/project.entity';
import { Answer } from '../answers/entities/answer.entity';
import { Section } from '../sections/entities/section.entity';
import { Job } from '../jobs/entities/job.entity';
import { Artifact } from '../artifacts/entities/artifact.entity';
import { Knowledge } from '../knowledge/entities/knowledge.entity';
import { Usage } from '../usage/entities/usage.entity';
import { Grant } from '../grants/entities/grant.entity';
import { CompanyProfile } from '../company-profiles/entities/company-profile.entity';

config({ path: ['.env.local', '.env'] });

interface QuestionSeed {
  order: number;
  key: string;
  label: string;
  hint: string;
  type: QuestionType;
  required: boolean;
  targetSection: SectionKey;
  options?: string[];
}

/** K-Startup PSST 표준 질의 12종 */
const PSST_QUESTIONS: QuestionSeed[] = [
  {
    order: 1,
    key: 'problem_statement',
    label: '어떤 문제를 해결하려고 하나요?',
    hint: '고객이 겪는 불편을 구체적인 상황으로 적어주세요.',
    type: 'long_text',
    required: true,
    targetSection: 'problem',
  },
  {
    order: 2,
    key: 'target_customer',
    label: '주요 고객은 누구인가요?',
    hint: '연령·직업·상황 등 최대한 좁혀서 적어주세요.',
    type: 'long_text',
    required: true,
    targetSection: 'problem',
  },
  {
    order: 3,
    key: 'existing_alternatives',
    label: '고객은 지금 이 문제를 어떻게 해결하고 있나요?',
    hint: '기존 서비스나 수동 방식의 한계를 함께 적어주세요.',
    type: 'long_text',
    required: true,
    targetSection: 'problem',
  },
  {
    order: 4,
    key: 'solution_summary',
    label: '제품/서비스가 문제를 어떻게 해결하나요?',
    hint: '핵심 기능 3가지 이내로 정리해주세요.',
    type: 'long_text',
    required: true,
    targetSection: 'solution',
  },
  {
    order: 5,
    key: 'differentiation',
    label: '경쟁 서비스와 무엇이 다른가요?',
    hint: '기술·가격·경험 중 어디서 차별화되는지 적어주세요.',
    type: 'long_text',
    required: true,
    targetSection: 'solution',
  },
  {
    order: 6,
    key: 'development_stage',
    label: '현재 개발 단계는 어디인가요?',
    hint: '',
    type: 'single_select',
    required: true,
    targetSection: 'solution',
    options: ['아이디어', '기획 완료', '프로토타입', 'MVP 출시', '정식 출시', '매출 발생'],
  },
  {
    order: 7,
    key: 'market_size',
    label: '목표 시장의 규모를 알고 있나요?',
    hint: '아는 범위에서만 적어주세요. 모르면 "모름"이라고 적어도 됩니다.',
    type: 'long_text',
    required: false,
    targetSection: 'market',
  },
  {
    order: 8,
    key: 'competitors',
    label: '경쟁사는 어디인가요?',
    hint: '직접 경쟁 2~3곳을 적어주세요.',
    type: 'long_text',
    required: true,
    targetSection: 'market',
  },
  {
    order: 9,
    key: 'revenue_model',
    label: '어떻게 수익을 내나요?',
    hint: '구독·수수료·광고 등 과금 방식과 가격을 적어주세요.',
    type: 'long_text',
    required: true,
    targetSection: 'business',
  },
  {
    order: 10,
    key: 'go_to_market',
    label: '고객을 어떻게 확보할 계획인가요?',
    hint: '초기 100명을 어떻게 모을지 구체적으로 적어주세요.',
    type: 'long_text',
    required: true,
    targetSection: 'business',
  },
  {
    order: 11,
    key: 'budget_plan',
    label: '지원금을 어디에 쓸 계획인가요?',
    hint: '인건비·개발비·마케팅비 등 항목과 대략적인 비중을 적어주세요.',
    type: 'long_text',
    required: true,
    targetSection: 'budget',
  },
  {
    order: 12,
    key: 'team_composition',
    label: '팀 구성과 각자의 역량은 어떻게 되나요?',
    hint: '실제 이력만 적어주세요. 없는 경력은 쓰지 마세요.',
    type: 'long_text',
    required: true,
    targetSection: 'team',
  },
];

async function main() {
  const url = process.env.DATABASE_URL;

  const dataSource = new DataSource({
    type: 'postgres',
    ...(url
      ? { url }
      : {
          host: process.env.DB_HOST ?? 'localhost',
          port: parseInt(process.env.DB_PORT ?? '5432', 10),
          username: process.env.DB_USER ?? 'postgres',
          password: process.env.DB_PASSWORD ?? 'postgres',
          database: process.env.DB_NAME ?? 'moai',
        }),
    entities: [
      Tenant, User, Template, Question, Project,
      Answer, Section, Job, Artifact, Knowledge, Usage,
      Grant, CompanyProfile,
    ],
    synchronize: true,
    ssl: (process.env.DB_SSL ?? 'true') === 'true' ? { rejectUnauthorized: false } : false,
  });

  await dataSource.initialize();
  console.log('DB 연결 완료');

  // ── 테넌트 ──
  const tenantRepo = dataSource.getRepository(Tenant);
  let tenant = await tenantRepo.findOne({ where: { name: 'moai 데모' } });
  if (!tenant) {
    tenant = await tenantRepo.save(
      tenantRepo.create({ name: 'moai 데모', plan: 'free' }),
    );
    console.log('테넌트 생성');
  }

  // ── 사용자 ──
  const userRepo = dataSource.getRepository(User);
  let user = await userRepo.findOne({ where: { email: 'demo@moai.local' } });
  if (!user) {
    user = await userRepo.save(
      userRepo.create({
        tenantId: tenant.id,
        email: 'demo@moai.local',
        name: '데모 사용자',
        role: 'owner',
      }),
    );
    console.log('사용자 생성');
  }

  // ── 양식 ──
  const templateRepo = dataSource.getRepository(Template);
  let template = await templateRepo.findOne({ where: { kind: 'kstartup-psst' } });
  if (!template) {
    template = await templateRepo.save(
      templateRepo.create({
        kind: 'kstartup-psst',
        name: 'K-Startup 표준 사업계획서 (PSST)',
        description:
          '창업진흥원 표준 양식. Problem - Solution - Scale-up - Team 구조를 따른다.',
        sectionKeys: ['overview', 'problem', 'solution', 'market', 'business', 'budget', 'team'],
        writingGuide:
          '평가위원이 짧은 시간에 읽는다는 전제로 두괄식으로 작성한다. 주장마다 근거를 붙이고, 근거가 없으면 쓰지 않는다.',
        toneStyle: 'gaejosik',
      }),
    );
    console.log('양식 생성');
  }

  // ── 질의 12개 ──
  const questionRepo = dataSource.getRepository(Question);
  let created = 0;
  for (const q of PSST_QUESTIONS) {
    const exists = await questionRepo.findOne({
      where: { templateId: template.id, key: q.key },
    });
    if (exists) continue;

    await questionRepo.save(
      questionRepo.create({
        templateId: template.id,
        order: q.order,
        key: q.key,
        label: q.label,
        hint: q.hint || null,
        type: q.type,
        required: q.required,
        options: q.options ?? null,
        targetSection: q.targetSection,
      }),
    );
    created += 1;
  }
  console.log(`질의 ${created}개 생성 (총 ${PSST_QUESTIONS.length}개)`);

  // ── 기업 프로필 ──
  // 캘린더의 지원 가능 여부 판정 기준. 일부 항목은 의도적으로 비워
  // "정보 부족(unknown)" 판정이 어떻게 나오는지 확인할 수 있게 했다.
  const profileRepo = dataSource.getRepository(CompanyProfile);
  let profile = await profileRepo.findOne({ where: { tenantId: tenant.id, isDefault: true } });
  if (!profile) {
    const founded = new Date();
    founded.setFullYear(founded.getFullYear() - 2); // 업력 2년

    profile = await profileRepo.save(
      profileRepo.create({
        tenantId: tenant.id,
        name: 'moai 데모 기업',
        industry: 'it',
        region: '서울',
        foundedAt: founded.toISOString().slice(0, 10),
        employees: 5,
        annualRevenue: '300000000', // 3억
        stage: 'corporate',
        isCorporation: true,
        certifications: [],          // 비워둠 → 인증 요구 공고는 '지원 불가'
        isDefault: true,
      }),
    );
    console.log('기업 프로필 생성 (업종 IT · 서울 · 업력 2년 · 5인 · 매출 3억 · 법인)');
  }

  // 공고는 시드하지 않는다.
  // K-Startup 실데이터를 수집해 쓰므로, 예시 공고는 원문 링크가 기관 메인이라
  // "공고 원문 보기"가 엉뚱한 곳으로 간다.
  //   수집:  POST /api/collectors/kstartup
  //   정리:  pnpm --filter @moai/api cleanup:seed-grants

  console.log('\n──────────────────────────────────────────');
  console.log('시드 완료. 아래 값을 apps/web/.env.local 에 넣으세요.\n');
  console.log(`NEXT_PUBLIC_SEED_TENANT_ID=${tenant.id}`);
  console.log(`NEXT_PUBLIC_SEED_USER_ID=${user.id}`);
  console.log('──────────────────────────────────────────\n');

  await dataSource.destroy();
}

main().catch((err) => {
  console.error('시드 실패:', err);
  process.exit(1);
});
