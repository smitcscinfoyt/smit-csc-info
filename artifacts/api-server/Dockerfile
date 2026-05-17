# Multi-stage build for lightweight Express 5 API backend

# --- Build Stage ---
FROM node:24-slim AS builder

WORKDIR /app

# Enable corepack for pnpm
RUN corepack enable && corepack prepare pnpm@latest --activate
ENV PNPM_HOME="/pnpm"
ENV PATH="$PNPM_HOME:$PATH"

# Copy package configurations and lockfile
COPY pnpm-lock.yaml pnpm-workspace.yaml package.json tsconfig.json tsconfig.base.json .npmrc ./
COPY lib/db/package.json ./lib/db/
COPY lib/api-spec/package.json ./lib/api-spec/
COPY lib/api-zod/package.json ./lib/api-zod/
COPY lib/api-client-react/package.json ./lib/api-client-react/
COPY lib/object-storage-web/package.json ./lib/object-storage-web/
COPY artifacts/api-server/package.json ./artifacts/api-server/

# Install dependencies with self-healing retry chain for flaky networks
RUN pnpm install --frozen-lockfile --ignore-scripts || \
    pnpm install --frozen-lockfile --ignore-scripts || \
    pnpm install --frozen-lockfile --ignore-scripts

# Copy library source code and api-server source code
COPY lib/ ./lib/
COPY artifacts/api-server/ ./artifacts/api-server/

# Build backend and database schemas
RUN pnpm --filter @workspace/db run build || true
RUN pnpm --filter @workspace/api-server run build

# --- Production Runner Stage ---
FROM node:24-slim AS runner

WORKDIR /app
ENV NODE_ENV=production

# Enable corepack for pnpm in production runner
RUN corepack enable && corepack prepare pnpm@latest --activate
ENV PNPM_HOME="/pnpm"
ENV PATH="$PNPM_HOME:$PATH"

# Copy only the files needed for pnpm to resolve and install production dependencies
COPY pnpm-lock.yaml pnpm-workspace.yaml package.json tsconfig.json tsconfig.base.json .npmrc ./
COPY lib/db/package.json ./lib/db/
COPY lib/api-spec/package.json ./lib/api-spec/
COPY lib/api-zod/package.json ./lib/api-zod/
COPY lib/api-client-react/package.json ./lib/api-client-react/
COPY lib/object-storage-web/package.json ./lib/object-storage-web/
COPY artifacts/api-server/package.json ./artifacts/api-server/

# Install production-only dependencies with retry chain
RUN pnpm install --prod --frozen-lockfile --ignore-scripts || \
    pnpm install --prod --frozen-lockfile --ignore-scripts

# Copy the built dist from the builder stage
COPY --from=builder /app/artifacts/api-server/dist ./artifacts/api-server/dist

# Expose API server port
EXPOSE 5000

ENV PORT=5000

# Start Express server
CMD ["node", "--enable-source-maps", "./artifacts/api-server/dist/index.mjs"]
