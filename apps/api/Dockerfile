# ─────────────────────────────────────────────
# moai api — AWS Lightsail 컨테이너 배포용
# 저장소 루트에서 빌드할 것:
#   docker build -f apps/api/Dockerfile -t moai-api .
# ─────────────────────────────────────────────
FROM node:20-alpine AS base
RUN corepack enable && corepack prepare pnpm@10.34.5 --activate
WORKDIR /app

# ── 의존성 설치 ──
FROM base AS deps
COPY pnpm-workspace.yaml package.json pnpm-lock.yaml .npmrc ./
COPY packages/shared/package.json packages/shared/
COPY apps/api/package.json apps/api/
RUN pnpm install --frozen-lockfile

# ── 빌드 ──
FROM base AS build
COPY --from=deps /app/node_modules ./node_modules
COPY --from=deps /app/packages/shared/node_modules ./packages/shared/node_modules
COPY --from=deps /app/apps/api/node_modules ./apps/api/node_modules
COPY . .
RUN pnpm --filter @moai/shared build && pnpm --filter @moai/api build

# ── 실행 ──
FROM base AS runtime
ENV NODE_ENV=production
COPY --from=deps /app/node_modules ./node_modules
COPY --from=deps /app/packages/shared/node_modules ./packages/shared/node_modules
COPY --from=deps /app/apps/api/node_modules ./apps/api/node_modules
COPY --from=build /app/packages/shared/dist ./packages/shared/dist
COPY --from=build /app/packages/shared/package.json ./packages/shared/
COPY --from=build /app/apps/api/dist ./apps/api/dist
COPY --from=build /app/apps/api/package.json ./apps/api/

EXPOSE 4000
HEALTHCHECK --interval=30s --timeout=5s --start-period=20s \
  CMD wget -qO- http://127.0.0.1:4000/api/health || exit 1

WORKDIR /app/apps/api
CMD ["node", "dist/main.js"]
