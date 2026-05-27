// Pure HTTP span helpers — kept free of React Native / Expo imports so it can be
// unit-tested directly (and, eventually, replaced by the shared `@maple/ui/lib/http`
// implementation once web + mobile share a pure utilities package). The logic here
// mirrors `packages/ui/src/lib/http.ts` exactly; keep the two in sync.

export const HTTP_METHODS = ["GET", "POST", "PUT", "PATCH", "DELETE", "HEAD", "OPTIONS"] as const
type HttpMethod = (typeof HTTP_METHODS)[number]

export interface HttpInfo {
	method: string
	route: string | null
	statusCode: number | null
	isError: boolean
	kind: "client" | "server"
}

export interface HttpSpanInput {
	spanName: string
	spanAttributes?: Record<string, string>
	/** OTel SPAN_KIND_* — authoritative client/server signal when present. */
	spanKind?: string
}

const isHttpMethod = (s: string): s is HttpMethod => HTTP_METHODS.includes(s.toUpperCase() as HttpMethod)

/**
 * Returns the first of `keys` whose value is present and non-blank. Some emitters send
 * `http.request.method: ""` or `http.route: ""`; treating those as absent stops
 * `getHttpInfo` from rendering an empty method badge or a blank route.
 */
const attr = (attrs: Record<string, string>, ...keys: string[]): string | null => {
	for (const key of keys) {
		const value = attrs[key]
		if (value != null && value.trim() !== "") return value
	}
	return null
}

const parseUrlHostPath = (raw: string): string | null => {
	try {
		const u = new URL(raw)
		return `${u.host}${u.pathname}`
	} catch {
		return null
	}
}

interface NameInfo {
	method: string
	routeHint: string | null
}

const parseSpanName = (name: string): NameInfo | null => {
	const parts = name.split(" ")
	if (parts.length >= 2 && (parts[0] === "http.server" || parts[0] === "http.client")) {
		return { method: parts[1]!, routeHint: parts.length > 2 ? parts.slice(2).join(" ") : null }
	}
	if (parts.length >= 2 && isHttpMethod(parts[0]!)) {
		return { method: parts[0]!.toUpperCase(), routeHint: parts.slice(1).join(" ") }
	}
	if (parts.length === 1 && isHttpMethod(parts[0]!)) {
		return { method: parts[0]!.toUpperCase(), routeHint: null }
	}
	return null
}

const clientRouteFromAttrs = (attrs: Record<string, string>): string | null => {
	// Prefer parsing url.full / http.url first — new URL() reliably strips the scheme.
	// Some emitters put a scheme into server.address, which would otherwise leak through.
	const full = attr(attrs, "url.full", "http.url")
	if (full) {
		const parsed = parseUrlHostPath(full)
		if (parsed) return parsed
	}

	const host = attr(attrs, "server.address", "net.peer.name")?.replace(/^https?:\/\//, "") || null
	const path = attr(attrs, "url.path", "http.target")
	if (host && path) return `${host}${path}`
	return path
}

const serverRouteFromAttrs = (attrs: Record<string, string>): string | null =>
	attr(attrs, "http.target", "url.path")

const routeFromAttrs = (attrs: Record<string, string>, isClient: boolean): string | null =>
	attr(attrs, "http.route") ?? (isClient ? clientRouteFromAttrs(attrs) : serverRouteFromAttrs(attrs))

/**
 * Extract HTTP span info from a span's name, attributes, and (when known) OTel kind.
 *
 * Server spans render path-only (e.g. `/v1/spans`). Client spans render host+path
 * (e.g. `api.tinybird.co/v1/spans`) so the destination service is visible.
 *
 * `spanKind` is authoritative: the span-hierarchy query rewrites span names
 * (`http.client GET` → `GET /path`), which would otherwise hide the client kind and
 * collapse the route to path-only. Falls back to the name/url.full heuristic only when
 * the kind is absent or non-HTTP.
 */
export function getHttpInfo({ spanName, spanAttributes, spanKind }: HttpSpanInput): HttpInfo | null {
	const attrs = spanAttributes ?? {}

	const kind: "client" | "server" =
		spanKind === "SPAN_KIND_CLIENT"
			? "client"
			: spanKind === "SPAN_KIND_SERVER"
				? "server"
				: spanName.startsWith("http.client ")
					? "client"
					: "server"
	const useClientRoute = kind === "client" || attr(attrs, "url.full", "http.url") != null

	const nameInfo = parseSpanName(spanName)

	const method =
		attr(attrs, "http.method", "http.request.method") ??
		(nameInfo && nameInfo.method.trim() !== "" ? nameInfo.method : null)
	if (!method) return null

	let route = routeFromAttrs(attrs, useClientRoute)
	if (route == null && nameInfo?.routeHint) {
		route = parseUrlHostPath(nameInfo.routeHint) ?? nameInfo.routeHint
	}

	const rawStatus = attrs["http.status_code"] ?? attrs["http.response.status_code"]
	const statusCode = rawStatus ? parseInt(rawStatus, 10) || null : null

	return {
		method: method.toUpperCase(),
		route,
		statusCode,
		isError: statusCode != null && statusCode >= 500,
		kind,
	}
}
