/**
 * Self-host Miniflare runtime for the Maple worker triad.
 *
 * Hosts api, alerting, and electric-sync in one Miniflare process. The
 * control-plane database is Postgres (MAPLE_PG_URL), reached from the
 * workers through a Hyperdrive binding (MAPLE_DB) and migrated here on
 * boot with drizzle. KV (MCP_SESSIONS), the SQLite-backed ChatSession
 * Durable Object, and queue/workflow state persist under MAPLE_DATA_DIR
 * (default `/data`).
 *
 * Exposed:
 *   - API_PORT (3472) — api worker (Miniflare's primary entrypoint)
 *   - ELECTRIC_SYNC_PORT (3476) — electric-sync worker, proxied via Node http
 *
 * Crons fire from the host via the worker proxies' Fetcher RPC
 * `scheduled()` method. Both the api and alerting workers have schedules,
 * and each handler dispatches on the exact `event.cron` string — keep the
 * lists below in sync with the `triggers.crons` in each worker's
 * wrangler.jsonc.
 *
 * Deliberately absent bindings (documented upstream fallbacks):
 *   - AI (Workers AI) — the LLM layer falls back to OpenRouter over REST;
 *     set OPENROUTER_API_KEY to enable chat + AI triage.
 *   - EMAIL — sends skip when the binding is missing.
 */

import { CronJob } from "cron"
import { drizzle } from "drizzle-orm/postgres-js"
import { migrate } from "drizzle-orm/postgres-js/migrator"
import { readdirSync } from "node:fs"
import { createServer, type IncomingMessage, type ServerResponse } from "node:http"
import { join } from "node:path"
import { Log, LogLevel, Miniflare } from "miniflare"
import postgres from "postgres"

const DATA_DIR = process.env.MAPLE_DATA_DIR ?? "/data"
const API_PORT = Number(process.env.API_PORT ?? 3472)
const ELECTRIC_SYNC_PORT = Number(process.env.ELECTRIC_SYNC_PORT ?? 3476)
const BUNDLES_DIR = process.env.MAPLE_BUNDLES_DIR ?? "/app/bundles"
const MIGRATIONS_DIR = process.env.MAPLE_MIGRATIONS_DIR ?? "/app/migrations"

const PG_URL = process.env.MAPLE_PG_URL
if (!PG_URL) throw new Error("MAPLE_PG_URL is required (postgres:// control-plane database URL)")

const findBundle = (dir: string): string => {
	const entries = readdirSync(dir).filter((f) => f.endsWith(".js") || f.endsWith(".mjs"))
	if (entries.length === 0) throw new Error(`No bundled .js/.mjs in ${dir}`)
	return join(dir, entries[0])
}

const apiBundle = findBundle(join(BUNDLES_DIR, "api"))
const alertingBundle = findBundle(join(BUNDLES_DIR, "alerting"))
const electricSyncBundle = findBundle(join(BUNDLES_DIR, "electric-sync"))

// Drizzle migrations against Postgres, before any worker starts. Idempotent —
// tracked in __drizzle_migrations. Retry while Postgres finishes booting;
// compose ordering gates on the healthcheck but belt-and-braces here.
{
	const sql = postgres(PG_URL, { max: 1, fetch_types: false })
	const db = drizzle(sql)
	console.log("[migrate] applying drizzle migrations…")
	let lastError: unknown
	for (let attempt = 1; attempt <= 10; attempt++) {
		try {
			await migrate(db, { migrationsFolder: MIGRATIONS_DIR })
			lastError = undefined
			break
		} catch (err) {
			lastError = err
			console.warn(`[migrate] attempt ${attempt}/10 failed: ${(err as Error).message}`)
			await new Promise((r) => setTimeout(r, 3000))
		}
	}
	await sql.end()
	if (lastError) throw lastError
	console.log("[migrate] complete")
}

// Forward Maple-relevant env vars to all workers as bindings.
const envPrefixRe =
	/^(MAPLE_|CLICKHOUSE_|TINYBIRD_|CLERK_|RESEND_|AUTUMN_|SD_|INTERNAL_|ELECTRIC_|OPENROUTER_)/
const sharedBindings: Record<string, string> = {}
for (const [k, v] of Object.entries(process.env)) {
	if (v !== undefined && envPrefixRe.test(k)) sharedBindings[k] = v
}

// Queue names — mirror apps/api/wrangler.jsonc `vars` + `queues`.
const VCS_SYNC_QUEUE = "maple-vcs-sync-local"
const PLANETSCALE_WEBHOOK_QUEUE = "maple-planetscale-webhooks-local"

const mf = new Miniflare({
	log: new Log(LogLevel.INFO),
	host: "0.0.0.0",
	port: API_PORT,

	// Single root for KV / DO / queue / workflow state (Miniflare 5 replaced
	// the per-plugin *Persist options with this).
	resourcePersistencePath: DATA_DIR,

	workers: [
		{
			name: "api",
			// Explicit module list — the api bundle contains a (dead) dynamic
			// config-loader import that Miniflare's automatic dependency walk
			// rejects with ERR_MODULE_DYNAMIC_SPEC. Each wrangler bundle is a
			// single self-contained ESModule, so listing it directly is safe.
			modules: [{ type: "ESModule", path: apiBundle }],
			compatibilityDate: "2026-04-08",
			compatibilityFlags: ["nodejs_compat"],
			hyperdrives: { MAPLE_DB: PG_URL },
			kvNamespaces: { MCP_SESSIONS: "MCP_SESSIONS" },
			durableObjects: {
				CHAT_SESSION: { className: "ChatSession", useSQLite: true },
			},
			queueProducers: {
				VCS_SYNC_QUEUE: VCS_SYNC_QUEUE,
				PLANETSCALE_WEBHOOK_QUEUE: PLANETSCALE_WEBHOOK_QUEUE,
			},
			queueConsumers: {
				[VCS_SYNC_QUEUE]: { maxBatchSize: 10, maxBatchTimeout: 5, maxRetries: 3 },
				[PLANETSCALE_WEBHOOK_QUEUE]: { maxBatchSize: 10, maxBatchTimeout: 5, maxRetries: 3 },
			},
			workflows: {
				CLICKHOUSE_SCHEMA_APPLY_WORKFLOW: {
					name: "clickhouse-schema-apply-workflow",
					className: "ClickHouseSchemaApplyWorkflow",
				},
				AI_TRIAGE_WORKFLOW: {
					name: "ai-triage-workflow",
					className: "AiTriageWorkflow",
				},
			},
			ratelimits: {
				API_V2_RATE_LIMITER: {
					namespace_id: "2026071801",
					simple: { limit: 600, period: 60 },
				},
			},
			bindings: {
				...sharedBindings,
				API_V2_RATE_LIMIT_PARTITION: "local",
				PLANETSCALE_WEBHOOK_QUEUE_NAME: PLANETSCALE_WEBHOOK_QUEUE,
				VCS_SYNC_QUEUE_NAME: VCS_SYNC_QUEUE,
			},
		},
		{
			name: "alerting",
			modules: [{ type: "ESModule", path: alertingBundle }],
			compatibilityDate: "2026-04-08",
			compatibilityFlags: ["nodejs_compat"],
			hyperdrives: { MAPLE_DB: PG_URL },
			bindings: sharedBindings,
		},
		{
			name: "electric-sync",
			modules: [{ type: "ESModule", path: electricSyncBundle }],
			compatibilityDate: "2026-04-08",
			compatibilityFlags: ["nodejs_compat"],
			bindings: sharedBindings,
		},
	],
})

await mf.ready
console.log(`[runtime] api listening on :${API_PORT}`)

// electric-sync proxy on its own port — Miniflare only exposes the first worker.
const electricSync = await mf.getWorker("electric-sync")

const proxyToWorker = async (
	worker: { fetch: (input: string, init: RequestInit) => Promise<Response> },
	req: IncomingMessage,
	res: ServerResponse,
): Promise<void> => {
	try {
		const proto = (req.headers["x-forwarded-proto"] as string) ?? "http"
		const host =
			(req.headers["x-forwarded-host"] as string) ?? (req.headers.host ?? "localhost")
		const url = `${proto}://${host}${req.url ?? "/"}`

		let body: Buffer | undefined
		if (req.method && req.method !== "GET" && req.method !== "HEAD") {
			const chunks: Buffer[] = []
			for await (const chunk of req) chunks.push(chunk as Buffer)
			body = Buffer.concat(chunks)
		}

		const upstream = await worker.fetch(url, {
			method: req.method,
			headers: req.headers as Record<string, string>,
			body,
		})
		res.statusCode = upstream.status
		upstream.headers.forEach((value, key) => res.setHeader(key, value))
		if (upstream.body) {
			const reader = upstream.body.getReader()
			while (true) {
				const { done, value } = await reader.read()
				if (done) break
				res.write(Buffer.from(value))
			}
		}
		res.end()
	} catch (err) {
		console.error("[proxy] error:", err)
		res.statusCode = 502
		res.end(`bad gateway: ${(err as Error).message}`)
	}
}

createServer((req, res) => {
	proxyToWorker(electricSync as never, req, res).catch((err) => {
		console.error("[proxy] unhandled:", err)
		if (!res.headersSent) res.statusCode = 500
		res.end()
	})
}).listen(ELECTRIC_SYNC_PORT, "0.0.0.0", () => {
	console.log(`[runtime] electric-sync listening on :${ELECTRIC_SYNC_PORT}`)
})

// Cron triggers. The worker proxy from `getWorker()` exposes the Fetcher RPC,
// whose `scheduled()` runs the worker's scheduled handler — the same call
// Miniflare's own /cdn-cgi/local/scheduled endpoint makes. Both handlers
// dispatch on the exact cron expression, so it is passed through verbatim.
const api = await mf.getWorker("api")
const alerting = await mf.getWorker("alerting")

type ScheduledWorker = {
	scheduled: (opts: { cron?: string }) => Promise<{ outcome: string }>
}

const triggerCron = async (
	workerName: string,
	worker: ScheduledWorker,
	cron: string,
): Promise<void> => {
	try {
		const result = await worker.scheduled({ cron })
		if (result.outcome !== "ok") console.error(`[cron] ${workerName} ${cron} → ${result.outcome}`)
	} catch (err) {
		console.error(`[cron] ${workerName} ${cron} failed:`, err)
	}
}

// Keep in sync with apps/api/wrangler.jsonc `triggers.crons`.
const apiCrons = ["0 */12 * * *", "0 * * * *", "0 */6 * * *", "5 * * * *"] as const
// Keep in sync with apps/alerting/wrangler.jsonc `triggers.crons`.
const alertingCrons = ["* * * * *", "*/5 * * * *", "*/15 * * * *", "0 * * * *"] as const

for (const cron of apiCrons) {
	new CronJob(cron, () => triggerCron("api", api as unknown as ScheduledWorker, cron), null, true)
}
for (const cron of alertingCrons) {
	new CronJob(cron, () => triggerCron("alerting", alerting as unknown as ScheduledWorker, cron), null, true)
}
console.log(`[runtime] api crons registered: ${apiCrons.join(", ")}`)
console.log(`[runtime] alerting crons registered: ${alertingCrons.join(", ")}`)

// Cleanup
const shutdown = async (signal: string): Promise<void> => {
	console.log(`[runtime] received ${signal}, shutting down`)
	await mf.dispose()
	process.exit(0)
}
process.on("SIGTERM", () => void shutdown("SIGTERM"))
process.on("SIGINT", () => void shutdown("SIGINT"))
