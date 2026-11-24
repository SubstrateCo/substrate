# The API runs its TypeScript sources on Bun; there is no build step. The pre-deploy
# command (bun packages/database/src/migrate.ts) runs in this same image.
FROM oven/bun:1.4.4-slim
WORKDIR /app
ENV NODE_ENV=production \
    ELECTRON_SKIP_BINARY_DOWNLOAD=1
COPY . .
RUN bun install --frozen-lockfile --production
USER bun
CMD ["bun", "apps/server/src/main.ts"]
