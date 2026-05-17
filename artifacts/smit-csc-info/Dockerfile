# Multi-stage build for lightweight React frontend served by Nginx

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
COPY artifacts/smit-csc-info/package.json ./artifacts/smit-csc-info/
COPY scripts/package.json ./scripts/

# Install dependencies with self-healing retry chain for flaky networks
RUN pnpm install --frozen-lockfile --ignore-scripts || \
    pnpm install --frozen-lockfile --ignore-scripts || \
    pnpm install --frozen-lockfile --ignore-scripts

# Copy library source code, scripts and frontend source code
COPY lib/ ./lib/
COPY scripts/ ./scripts/
COPY artifacts/smit-csc-info/ ./artifacts/smit-csc-info/

# Set env variables required by Vite config during build
ENV PORT=3000
ENV BASE_PATH=/
ENV NODE_ENV=production

# Build libraries and frontend
RUN pnpm --filter @workspace/api-client-react run build || true
RUN pnpm --filter @workspace/smit-csc-info run build

# --- Production Runner Stage ---
FROM nginx:alpine AS runner

# Remove default nginx static files
RUN rm -rf /usr/share/nginx/html/*

# Copy Vite build static files from builder stage
COPY --from=builder /app/artifacts/smit-csc-info/dist/public /usr/share/nginx/html

# Ensure all static files are readable by the nginx user (fixes 403 Forbidden permissions)
RUN chmod -R 755 /usr/share/nginx/html

# Copy custom Nginx configuration
COPY nginx.conf /etc/nginx/conf.d/default.conf

EXPOSE 80

CMD ["nginx", "-g", "daemon off;"]
