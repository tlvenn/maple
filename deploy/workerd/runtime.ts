/**
 * Self-host Miniflare runtime for the Maple worker pair.
 *
 * Hosts api + alerting in one process. Maple's app database is an external
 * Postgres reached via a Miniflare Hyperdrive binding (`MAPLE_DB`); the
 * workers see `env.MAPLE_DB.connectionString`. KV (MCP_SESSIONS) and Durable
 * Object state persist under MAPLE_DATA_DIR (default `/data`).
 *
 * Exposed:
 *   - API_PORT (3472) — api worker (Miniflare's primary entrypoint)
 *
 * Crons:
 *   - api      `0 *\/12 * * *`                                   (VCS sync backstop)
 *   - alerting `* * * * *`, `*\/5 * * * *`, `*\/15 * * * *`,
 *              `0 * * * *`, `0 9 * * *`
 * Triggered from the host via the `__scheduled` endpoint, which workerd
 * interprets as a scheduled trigger.
 *
 * Drizzle migrations run against the Postgres on boot via the
 * `drizzle-orm/postgres-js/migrator`. Tracked in `__drizzle_migrations`
 * inside the database; idempotent across redeploys.
 *
 * Not adopted on this fork: `apps/chat-flue` (the Flue-framework rewrite
 * of the old `apps/chat-agent`). See deploy/workerd/Dockerfile header.
 */

import { CronJob } from "cron"
import { drizzle } from "drizzle-orm/postgres-js"
import { migrate } from "drizzle-orm/postgres-js/migrator"
import { readdirSync } from "node:fs"
import { join } from "node:path"
import { Log, LogLevel, Miniflare } from "miniflare"
import postgres from "postgres"

const DATA_DIR = process.env.MAPLE_DATA_DIR ?? "/data"
const API_PORT = Number(process.env.API_PORT ?? 3472)
const BUNDLES_DIR = process.env.MAPLE_BUNDLES_DIR ?? "/app/bundles"
const MIGRATIONS_DIR = process.env.MAPLE_MIGRATIONS_DIR ?? "/app/migrations"
const PG_URL = process.env.MAPLE_DB_URL
if (!PG_URL || PG_URL.trim().length === 0) {
	throw new Error("MAPLE_DB_URL is required — Postgres connection string for the app database")
}

const findBundle = (dir: string): string => {
	const entries = readdirSync(dir).filter((f) => f.endsWith(".js") || f.endsWith(".mjs"))
	if (entries.length === 0) throw new Error(`No bundled .js/.mjs in ${dir}`)
	return join(dir, entries[0])
}

const apiBundle = findBundle(join(BUNDLES_DIR, "api"))
const alertingBundle = findBundle(join(BUNDLES_DIR, "alerting"))

// Forward Maple-relevant env vars to all workers as bindings.
const envPrefixRe = /^(MAPLE_|CLICKHOUSE_|TINYBIRD_|CLERK_|RESEND_|HAZEL_|AUTUMN_|SD_|INTERNAL_)/
const sharedBindings: Record<string, string> = {}
for (const [k, v] of Object.entries(process.env)) {
	if (v !== undefined && envPrefixRe.test(k)) sharedBindings[k] = v
}

// Apply drizzle migrations BEFORE starting Miniflare. The workers expect the
// schema to exist when they start serving traffic, and running migrations
// before any traffic flows avoids race conditions on first boot.
{
	console.log("[migrate] applying drizzle migrations to Postgres…")
	const migrator = postgres(PG_URL, { max: 1, fetch_types: false })
	try {
		await migrate(drizzle(migrator), { migrationsFolder: MIGRATIONS_DIR })
		console.log("[migrate] complete")
	} finally {
		await migrator.end()
	}
}

const mf = new Miniflare({
	log: new Log(LogLevel.INFO),
	host: "0.0.0.0",
	port: API_PORT,

	kvPersist: join(DATA_DIR, "kv"),
	durableObjectsPersist: join(DATA_DIR, "do"),

	workers: [
		{
			name: "api",
			modules: true,
			scriptPath: apiBundle,
			compatibilityDate: "2026-04-08",
			compatibilityFlags: ["nodejs_compat"],
			hyperdrives: { MAPLE_DB: PG_URL },
			kvNamespaces: { MCP_SESSIONS: "MCP_SESSIONS" },
			bindings: sharedBindings,
		},
		{
			name: "alerting",
			modules: true,
			scriptPath: alertingBundle,
			compatibilityDate: "2026-04-08",
			compatibilityFlags: ["nodejs_compat"],
			hyperdrives: { MAPLE_DB: PG_URL },
			bindings: sharedBindings,
		},
	],
})

await mf.ready
console.log(`[runtime] api listening on :${API_PORT}`)

// Cron triggers. workerd's `__scheduled` endpoint executes the worker's
// `scheduled` handler. Each worker is responsible for its own crons.
const triggerCron = async (
	worker: { fetch: (input: string, init: RequestInit) => Promise<Response> },
	workerName: string,
	cron: string,
): Promise<void> => {
	const url = `http://internal/__scheduled?cron=${encodeURIComponent(cron)}`
	try {
		const upstream = await worker.fetch(url, { method: "GET" })
		if (!upstream.ok) console.error(`[cron] ${workerName}:${cron} → HTTP ${upstream.status}`)
	} catch (err) {
		console.error(`[cron] ${workerName}:${cron} failed:`, err)
	}
}

const api = await mf.getWorker("api")
// Keep in sync with apps/api/wrangler.jsonc `triggers.crons`.
const apiCrons = ["0 */12 * * *"] as const
for (const cron of apiCrons) {
	new CronJob(cron, () => triggerCron(api as never, "api", cron), null, true)
}
console.log(`[runtime] api crons registered: ${apiCrons.join(", ")}`)

const alerting = await mf.getWorker("alerting")
// Keep in sync with apps/alerting/wrangler.jsonc `triggers.crons`.
const alertingCrons = ["* * * * *", "*/5 * * * *", "*/15 * * * *", "0 * * * *", "0 9 * * *"] as const
for (const cron of alertingCrons) {
	new CronJob(cron, () => triggerCron(alerting as never, "alerting", cron), null, true)
}
console.log(`[runtime] alerting crons registered: ${alertingCrons.join(", ")}`)

// Cleanup
const shutdown = async (signal: string): Promise<void> => {
	console.log(`[runtime] received ${signal}, shutting down`)
	await mf.dispose()
	process.exit(0)
}
process.on("SIGTERM", () => void shutdown("SIGTERM"))
process.on("SIGINT", () => void shutdown("SIGINT"))
