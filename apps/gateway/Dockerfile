FROM node:22-alpine AS builder
RUN corepack enable && corepack prepare pnpm@latest --activate
WORKDIR /app

# Copy monorepo configuration and package definitions
COPY package.json pnpm-lock.yaml pnpm-workspace.yaml turbo.json ./
COPY apps/gateway/package.json ./apps/gateway/
COPY packages/types/package.json ./packages/types/

# Install dependencies needed for build
RUN pnpm install --frozen-lockfile

# Copy source code and build internal packages + standalone gateway bundle
COPY packages/types ./packages/types
COPY apps/gateway ./apps/gateway
RUN pnpm --filter @mcpromania/types build && pnpm --filter @mcpromania/gateway build

# Minimal runtime image (no node_modules or pnpm needed in production)
FROM node:22-alpine AS runner
WORKDIR /app
ENV NODE_ENV=production
ENV PORT=4000

# Copy standalone bundled gateway dist
COPY --from=builder /app/apps/gateway/dist ./dist

EXPOSE 4000
CMD ["node", "dist/index.js"]
