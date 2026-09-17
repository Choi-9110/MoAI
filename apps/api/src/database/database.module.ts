import { Module } from '@nestjs/common';
import { ConfigModule, ConfigService } from '@nestjs/config';
import { TypeOrmModule } from '@nestjs/typeorm';

/**
 * Postgres(Supabase) 연결.
 *
 * DB_SYNCHRONIZE 는 개발 중에만 true 로 둔다.
 * 운영 전환 시 반드시 false 로 바꾸고 마이그레이션을 사용할 것.
 */
@Module({
  imports: [
    TypeOrmModule.forRootAsync({
      imports: [ConfigModule],
      inject: [ConfigService],
      useFactory: (config: ConfigService) => {
        const url = config.get<string>('DATABASE_URL');
        const useSsl = config.get<string>('DB_SSL', 'true') === 'true';

        return {
          type: 'postgres' as const,
          ...(url
            ? { url }
            : {
                host: config.get<string>('DB_HOST', 'localhost'),
                port: parseInt(config.get<string>('DB_PORT', '5432'), 10),
                username: config.get<string>('DB_USER', 'postgres'),
                password: config.get<string>('DB_PASSWORD', 'postgres'),
                database: config.get<string>('DB_NAME', 'moai'),
              }),
          autoLoadEntities: true,
          synchronize: config.get<string>('DB_SYNCHRONIZE', 'true') === 'true',
          logging: config.get<string>('DB_LOGGING', 'false') === 'true',
          ssl: useSsl ? { rejectUnauthorized: false } : false,

          /*
           * **끊긴 연결을 다시 잡는다.**
           *
           * 서버가 잠깐 안 보일 때 통째로 죽지 않게 몇 번 다시 시도한다.
           * 이건 뜰 때 이야기고, 도중에 끊기는 것은 아래 `extra` 가 맡는다.
           */
          retryAttempts: 10,
          retryDelay: 3_000,

          /*
           * 연결 풀.
           *
           * **`terminating connection due to administrator command`(57P01) 를
           * 없애려고 둔다.** 이 오류는 우리가 잘못해서 나는 것이 아니라,
           * 한동안 안 쓴 연결을 저쪽(Supabase 풀러)이 정리하면서 난다.
           * 그때 우리가 그 연결을 붙들고 있으면 다음 요청이 끊긴 줄에 걸려
           * 한 번 실패한다.
           *
           * 그래서 **저쪽이 끊기 전에 우리가 먼저 놓는다.** 30초 안 쓰면
           * 닫아 두었다가 필요할 때 새로 연다 — 여는 데 드는 시간보다
           * 끊긴 줄을 잡는 쪽이 훨씬 비싸다.
           */
          extra: {
            /* 풀러가 이미 한 번 묶어 주므로 우리 쪽은 크게 잡을 이유가 없다 */
            max: 10,
            idleTimeoutMillis: 30_000,
            connectionTimeoutMillis: 15_000,
            /* 방화벽·NAT 가 조용한 연결을 끊는 것도 막는다 */
            keepAlive: true,
            keepAliveInitialDelayMillis: 10_000,
          },
        };
      },
    }),
  ],
})
export class DatabaseModule {}
