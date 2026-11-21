FROM node:22-alpine AS base
RUN npm install -g pnpm@latest

FROM base AS builder
WORKDIR /app

# Copy monorepo configuration and package definitions
COPY package.json pnpm-lock.yaml pnpm-workspace.yaml turbo.json ./
COPY apps/gateway/package.json ./apps/gateway/
COPY packages/types/package.json ./packages/types/

# Install dependencies needed for build
RUN pnpm install --frozen-lockfile

# Copy source code and build packages
COPY packages/types ./packages/types
COPY apps/gateway ./apps/gateway
RUN pnpm --filter @mcpromania/types build && pnpm --filter @mcpromania/gateway build

# Deploy self-contained production bundle with isolated node_modules
RUN pnpm --filter @mcpromania/gateway deploy --prod /deploy

# Minimal runtime image
FROM node:22-alpine AS runner
WORKDIR /app
ENV NODE_ENV=production
ENV PORT=4000

# Security hardening: non-root user
COPY --chown=node:node --from=builder /deploy ./
USER node

EXPOSE 4000
CMD ["node", "dist/index.js"]
