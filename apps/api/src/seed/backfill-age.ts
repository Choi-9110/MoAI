/**
 * 기존 공고에 연령 요건을 채워 넣는다.
 *
 *   pnpm --filter @moai/api backfill:age
 *
 * 연령 컬럼을 뒤늦게 추가했으므로, 이미 수집한 3만 건은 값이 비어 있다.
 * 다행히 수집 시 원문(`rawMetadata.targetAge`)을 보관해 두었으므로
 * 다시 긁어올 필요 없이 DB 안에서 채울 수 있다.
 */
import 'reflect-metadata';
import { config } from 'dotenv';
import { DataSource, Not, IsNull } from 'typeorm';
import { Grant } from '../grants/entities/grant.entity';
import { decodeEntities, parseTargetAge } from '../collectors/kstartup.parser';

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
    entities: [Grant],
    ssl:
      (process.env.DB_SSL ?? 'true') === 'true'
        ? { rejectUnauthorized: false }
        : false,
  });

  await dataSource.initialize();
  const grants = dataSource.getRepository(Grant);

  // 마감된 공고까지 채울 필요는 없다 — 판정 대상이 아니다.
  const now = new Date();
  const rows = await grants
    .createQueryBuilder('g')
    .where('g.apply_end_at >= :now', { now })
    .getMany();

  console.log(`대상 공고 ${rows.length}건`);

  let updated = 0;
  let noAge = 0;
  const buffer: Grant[] = [];

  for (const row of rows) {
    const raw = (row.rawMetadata ?? {}) as Record<string, unknown>;
    const targetAge = typeof raw.targetAge === 'string' ? raw.targetAge : null;

    const { min, max } = parseTargetAge(targetAge);
    const exclude = decodeEntities(
      typeof raw.excludeTarget === "string" ? raw.excludeTarget : null,
    );
    const targetDetail = decodeEntities(
      typeof raw.applyTargetDetail === "string" ? raw.applyTargetDetail : null,
    );

    const needsAge = (min !== null || max !== null) && row.minAge === null && row.maxAge === null;
    const needsExclude = exclude !== null && row.excludeTarget !== exclude;
    const needsDetail = targetDetail !== null && row.applyTargetDetail !== targetDetail;

    if (!needsAge && !needsExclude && !needsDetail) {
      noAge += 1;
      continue;
    }

    if (needsAge) {
      row.minAge = min;
      row.maxAge = max;
    }
    if (needsExclude) row.excludeTarget = exclude;
    if (needsDetail) row.applyTargetDetail = targetDetail;

    buffer.push(row);
    updated += 1;
  }

  if (buffer.length > 0) {
    await grants.save(buffer, { chunk: 200 });
  }

  console.log(
    `\n백필 완료 — 연령 요건 있음 ${updated}건 / 제한 없음 ${noAge}건`,
  );

  await dataSource.destroy();
}

main().catch((err) => {
  console.error('백필 실패:', err);
  process.exit(1);
});
