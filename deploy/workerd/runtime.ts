/**
 * Self-host Miniflare runtime for the Maple worker triad.
 *
 * Hosts api, alerting, and chat-agent in one process with a shared D1
 * (MAPLE_DB), shared KV (MCP_SESSIONS), and a SQLite-backed Durable Object
 * (ChatAgent). Persists everything under MAPLE_DATA_DIR (default `/data`).
 *
 * Exposed:
 *   - API_PORT (3472) — api worker (Miniflare's primary entrypoint)
 *   - CHAT_AGENT_PORT (3473) — chat-agent worker, proxied via Node http
 *
 * Crons on alerting (`* * * * *` and `*/15 * * * *`) fire from the host
 * via the `__scheduled` endpoint, which workerd interprets as a scheduled
 * trigger.
 */

import { CronJob } from "cron"
import { drizzle } from "drizzle-orm/d1"
import { migrate } from "drizzle-orm/d1/migrator"
import { readdirSync } from "node:fs"
import { createServer, type IncomingMessage, type ServerResponse } from "node:http"
import { join } from "node:path"
import { Log, LogLevel, Miniflare } from "miniflare"

const DATA_DIR = process.env.MAPLE_DATA_DIR ?? "/data"
const API_PORT = Number(process.env.API_PORT ?? 3472)
const CHAT_AGENT_PORT = Number(process.env.CHAT_AGENT_PORT ?? 3473)
const BUNDLES_DIR = process.env.MAPLE_BUNDLES_DIR ?? "/app/bundles"
const MIGRATIONS_DIR = process.env.MAPLE_MIGRATIONS_DIR ?? "/app/migrations"

const findBundle = (dir: string): string => {
	const entries = readdirSync(dir).filter((f) => f.endsWith(".js") || f.endsWith(".mjs"))
	if (entries.length === 0) throw new Error(`No bundled .js/.mjs in ${dir}`)
	return join(dir, entries[0])
}

const apiBundle = findBundle(join(BUNDLES_DIR, "api"))
const alertingBundle = findBundle(join(BUNDLES_DIR, "alerting"))
const chatAgentBundle = findBundle(join(BUNDLES_DIR, "chat-agent"))

// Forward Maple-relevant env vars to all workers as bindings.
const envPrefixRe = /^(MAPLE_|CLICKHOUSE_|TINYBIRD_|CLERK_|RESEND_|HAZEL_|AUTUMN_|SD_|INTERNAL_)/
const sharedBindings: Record<string, string> = {}
for (const [k, v] of Object.entries(process.env)) {
	if (v !== undefined && envPrefixRe.test(k)) sharedBindings[k] = v
}

const mf = new Miniflare({
	log: new Log(LogLevel.INFO),
	host: "0.0.0.0",
	port: API_PORT,

	d1Persist: join(DATA_DIR, "d1"),
	kvPersist: join(DATA_DIR, "kv"),
	durableObjectsPersist: join(DATA_DIR, "do"),

	workers: [
		{
			name: "api",
			modules: true,
			scriptPath: apiBundle,
			compatibilityDate: "2026-04-08",
			compatibilityFlags: ["nodejs_compat"],
			d1Databases: { MAPLE_DB: "maple-api-local" },
			kvNamespaces: { MCP_SESSIONS: "MCP_SESSIONS" },
			bindings: sharedBindings,
		},
		{
			name: "alerting",
			modules: true,
			scriptPath: alertingBundle,
			compatibilityDate: "2026-04-08",
			compatibilityFlags: ["nodejs_compat"],
			d1Databases: { MAPLE_DB: "maple-api-local" },
			bindings: sharedBindings,
		},
		{
			name: "chat-agent",
			modules: true,
			scriptPath: chatAgentBundle,
			compatibilityDate: "2025-02-04",
			compatibilityFlags: ["nodejs_compat"],
			d1Databases: { MAPLE_DB: "maple-api-local" },
			durableObjects: {
				ChatAgent: { className: "ChatAgent", scriptName: "chat-agent" },
			},
			bindings: sharedBindings,
		},
	],
})

await mf.ready
console.log(`[runtime] api listening on :${API_PORT}`)

// Drizzle migrations on the shared D1. Idempotent — uses drizzle_migrations table.
{
	const bindings = await mf.getBindings<{ MAPLE_DB: D1Database }>()
	const db = drizzle(bindings.MAPLE_DB as unknown as D1Database)
	console.log("[migrate] applying drizzle migrations…")
	await migrate(db as never, { migrationsFolder: MIGRATIONS_DIR })
	console.log("[migrate] complete")
}

// chat-agent proxy on its own port — Miniflare only exposes the first worker.
const chatAgent = await mf.getWorker("chat-agent")

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
	proxyToWorker(chatAgent as never, req, res).catch((err) => {
		console.error("[proxy] unhandled:", err)
		if (!res.headersSent) res.statusCode = 500
		res.end()
	})
}).listen(CHAT_AGENT_PORT, "0.0.0.0", () => {
	console.log(`[runtime] chat-agent listening on :${CHAT_AGENT_PORT}`)
})

// Cron triggers for alerting. workerd's `__scheduled` endpoint executes the
// worker's `scheduled` handler.
const alerting = await mf.getWorker("alerting")
const triggerCron = async (cron: string): Promise<void> => {
	const url = `http://internal/__scheduled?cron=${encodeURIComponent(cron)}`
	try {
		const upstream = await alerting.fetch(url, { method: "GET" })
		if (!upstream.ok) console.error(`[cron] ${cron} → HTTP ${upstream.status}`)
	} catch (err) {
		console.error(`[cron] ${cron} failed:`, err)
	}
}
new CronJob("* * * * *", () => triggerCron("* * * * *"), null, true)
new CronJob("*/15 * * * *", () => triggerCron("*/15 * * * *"), null, true)
console.log("[runtime] alerting crons registered")

// Cleanup
const shutdown = async (signal: string): Promise<void> => {
	console.log(`[runtime] received ${signal}, shutting down`)
	await mf.dispose()
	process.exit(0)
}
process.on("SIGTERM", () => void shutdown("SIGTERM"))
process.on("SIGINT", () => void shutdown("SIGINT"))
