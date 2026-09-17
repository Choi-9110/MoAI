/**
 * 시드로 넣었던 예시 공고를 지운다.
 *
 *   pnpm --filter @moai/api cleanup:seed-grants
 *
 * K-Startup 실데이터를 수집한 뒤로는 예시 공고가 오히려 방해가 된다.
 * (원문 링크가 기관 메인페이지라 상세 공고로 가지 않는다)
 *
 * 공고와 그에 딸린 판정 캐시만 지우고,
 * 테넌트·사용자·양식·질의·기업 프로필은 그대로 둔다.
 */
import 'reflect-metadata';
import { config } from 'dotenv';
import { DataSource, In } from 'typeorm';
import { Grant } from '../grants/entities/grant.entity';
import { EligibilityCheck } from '../grants/entities/eligibility-check.entity';

config({ path: ['.env.local', '.env'] });

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
    entities: [Grant, EligibilityCheck],
    ssl:
      (process.env.DB_SSL ?? 'true') === 'true'
        ? { rejectUnauthorized: false }
        : false,
  });

  await dataSource.initialize();

  const grants = dataSource.getRepository(Grant);
  const checks = dataSource.getRepository(EligibilityCheck);

  const targets = await grants.find({ where: { sourceApi: 'seed' } });

  if (targets.length === 0) {
    console.log('지울 시드 공고가 없습니다.');
    await dataSource.destroy();
    return;
  }

  console.log(`시드 공고 ${targets.length}건 발견:`);
  for (const g of targets) console.log(`  · ${g.title}`);

  // 판정 캐시를 먼저 지운다 — 공고가 사라지면 의미 없는 행이 된다
  const removedChecks = await checks.delete({
    grantId: In(targets.map((g) => g.id)),
  });
  await grants.remove(targets);

  const remaining = await grants.count();
  console.log(
    `\n삭제 완료 — 공고 ${targets.length}건, 판정 캐시 ${removedChecks.affected ?? 0}건`,
  );
  console.log(`남은 공고: ${remaining.toLocaleString()}건 (전부 실데이터)`);

  await dataSource.destroy();
}

main().catch((err) => {
  console.error('정리 실패:', err);
  process.exit(1);
});
