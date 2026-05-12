# Build context: monorepo root (.)
#
# Combined workerd container hosting the three Maple workers (api, alerting,
# chat-agent) in a single Miniflare process for self-hosted deploys outside
# Cloudflare. Persists D1, KV, and Durable Object state to /data.

FROM oven/bun:1.3.8 AS base
WORKDIR /app

# ---- pruner: extract the relevant workspaces from the monorepo ----
FROM base AS pruner
COPY . .
RUN bunx turbo prune \
      @maple/api \
      @maple/alerting \
      @maple/chat-agent \
      @maple-dev/effect-sdk \
      --docker --out-dir /app/out

# ---- builder: install + build SDK + bundle each worker ----
FROM base AS builder
COPY --from=pruner /app/out/json/ ./
COPY --from=pruner /app/out/bun.lock ./bun.lock
RUN apt-get update && \
    apt-get install -y --no-install-recommends python3 make g++ && \
    rm -rf /var/lib/apt/lists/*
RUN bun install
COPY --from=pruner /app/out/full/ ./

# The SDK package only exposes pre-built `dist/` via its subpath exports —
# build it first so wrangler can resolve `@maple-dev/effect-sdk/cloudflare`
# and `@maple-dev/effect-sdk/client` during the worker bundle step.
RUN bunx turbo build --filter=@maple-dev/effect-sdk

# Bundle each worker via wrangler dry-run. Each emits a self-contained
# module bundle at <outdir>/<entry>.js.
RUN cd apps/api && bunx wrangler deploy --dry-run --outdir=/build/api
RUN cd apps/alerting && bunx wrangler deploy --dry-run --outdir=/build/alerting
RUN cd apps/chat-agent && bunx wrangler deploy --dry-run --outdir=/build/chat-agent

# ---- runner: minimal image that runs the Miniflare orchestrator ----
FROM base AS runner
WORKDIR /app

# Worker bundles
COPY --from=builder /build/api/         /app/bundles/api/
COPY --from=builder /build/alerting/    /app/bundles/alerting/
COPY --from=builder /build/chat-agent/  /app/bundles/chat-agent/

# Drizzle migrations applied to D1 on boot
COPY --from=builder /app/packages/db/drizzle /app/migrations

# Runtime entry + its deps
COPY deploy/workerd/package.json deploy/workerd/runtime.ts ./
RUN bun install --production

ENV NODE_ENV=production
ENV MAPLE_DATA_DIR=/data
ENV API_PORT=3472
ENV CHAT_AGENT_PORT=3473

EXPOSE 3472 3473

CMD ["bun", "runtime.ts"]
