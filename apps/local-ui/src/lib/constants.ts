// Local mode pins a single synthetic tenant. The Rust ingest binary writes
// every decoded span/log/metric under this `OrgId`, and every `CH.compile(...)`
// call must pass the same constant so the WHERE `OrgId = 'local'` filter matches.
export const LOCAL_ORG_ID = "local"

// OTLP/HTTP ingest endpoint exposed by the local Maple binary. Mirrors the
// `MAPLE_LOCAL_URL` default the dev proxy points at (see vite.config.ts). Point
// any OpenTelemetry SDK (or @maple-dev/browser) here to stream into local mode.
export const LOCAL_OTLP_ENDPOINT = "http://127.0.0.1:4318"

// Default OTLP/HTTP + query port for `maple start`.
const DEFAULT_LOCAL_PORT = "4318"

/**
 * Resolve the origin of the local `maple` binary's `/local/query` endpoint for
 * the current page.
 *
 * The same SPA build is served two ways:
 *   - **Same-origin** — by the binary on `127.0.0.1` (`maple start --offline`)
 *     or behind the dev vite proxy (`localhost` / `*.localhost`). Return `""`
 *     so fetches stay relative; no CORS, no Private Network Access.
 *   - **Remote** — deployed to `local.maple.dev` (the binary's default). The
 *     page is a public origin, so it must reach the binary on loopback. Use the
 *     `?port=` the startup banner encodes into the URL, defaulting to 4318.
 */
export function localApiBase(): string {
	if (typeof window === "undefined") return ""
	const { hostname, search } = window.location
	const isLoopback =
		hostname === "127.0.0.1" ||
		hostname === "localhost" ||
		hostname === "[::1]" ||
		hostname.endsWith(".localhost")
	if (isLoopback) return ""
	const port = new URLSearchParams(search).get("port") ?? DEFAULT_LOCAL_PORT
	return `http://127.0.0.1:${port}`
}
