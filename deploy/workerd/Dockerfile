# Build context: monorepo root (.)
#
# Combined workerd container hosting the two server-side Maple workers
# (api, alerting) in a single Miniflare process for self-hosted deploys
# outside Cloudflare. Persists KV and Durable Object state to /data;
# Maple's app database (formerly D1) now lives in an external Postgres
# container reached via a Hyperdrive binding.
#
# Not adopted on this fork:
#   - `apps/chat-flue` (Flue framework + Workers AI binding; replaces the
#     old `apps/chat-agent`). Cost/benefit doesn't yet justify carrying
#     the Flue toolchain + AI shim. Web's chat UI 404s at runtime; rest
#     of the dashboard works.

FROM oven/bun:1.3.11 AS base
WORKDIR /app

# ---- pruner: extract the relevant workspaces from the monorepo ----
FROM base AS pruner
COPY . .
RUN bunx turbo prune \
      @maple/api \
      @maple/alerting \
      @maple-dev/effect-sdk \
      @maple/clickhouse-cli \
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
# during the worker bundle step.
RUN bunx turbo build --filter=@maple-dev/effect-sdk

# Bundle each worker via wrangler dry-run. Each emits a self-contained
# module bundle at <outdir>/<entry>.js.
RUN cd apps/api && bunx wrangler deploy --dry-run --outdir=/build/api
RUN cd apps/alerting && bunx wrangler deploy --dry-run --outdir=/build/alerting

# Bundle the ClickHouse schema CLI from this same source tree. Baking it in
# pins the CLI to whatever Maple commit our fork was synced to, so schema
# applied at boot stays in lockstep with what the API expects (no surprise
# `@latest` pulls at deploy time).
RUN bun build packages/clickhouse-cli/src/cli.ts \
      --target=bun \
      --outfile=/build/clickhouse-cli.js

# ---- runner: minimal image that runs the Miniflare orchestrator ----
FROM base AS runner
WORKDIR /app

# Worker bundles
COPY --from=builder /build/api/         /app/bundles/api/
COPY --from=builder /build/alerting/    /app/bundles/alerting/

# Drizzle migrations applied to Postgres on boot
COPY --from=builder /app/packages/db/drizzle /app/migrations

# Baked ClickHouse schema CLI — invoked by the `maple-ch-migrate` init
# container (override the default CMD via docker-compose).
COPY --from=builder /build/clickhouse-cli.js /app/clickhouse-cli.js

# Runtime entry + its deps
COPY deploy/workerd/package.json deploy/workerd/runtime.ts ./
RUN bun install --production

ENV NODE_ENV=production
ENV MAPLE_DATA_DIR=/data
ENV API_PORT=3472

EXPOSE 3472

CMD ["bun", "runtime.ts"]
