import { timingSafeEqual } from "node:crypto"
import { HttpApiBuilder } from "effect/unstable/httpapi"
import { HttpServerRequest } from "effect/unstable/http"
import {
	MapleApi,
	PrometheusSDTarget,
	ScrapeIntervalSeconds,
	SDPersistenceError,
	SDUnauthorizedError,
} from "@maple/domain/http"
import { Array as Arr, Effect, Option, Redacted, Schema } from "effect"
import { Env } from "../lib/Env"
import { ScrapeTargetsService } from "../services/ScrapeTargetsService"

export interface ServiceDiscoveryScrapeTargetRow {
	readonly id: string
	readonly orgId: string
	readonly name: string
	readonly serviceName: string | null
	readonly url: string
	readonly scrapeIntervalSeconds: number
	readonly labelsJson: string | null
}

interface PrometheusProxyEndpoint {
	readonly scheme: string
	readonly host: string
	readonly metricsPath: string
}

const decodeScrapeIntervalSecondsSync = Schema.decodeUnknownSync(ScrapeIntervalSeconds)

const firstHeaderValue = (value: string | undefined): string | undefined =>
	value
		?.split(",")
		.at(0)
		?.trim() || undefined

export const isValidInternalBearer = (
	authorizationHeader: string | undefined,
	internalToken: string | undefined,
): boolean => {
	if (!internalToken) return false
	const provided = authorizationHeader?.startsWith("Bearer ")
		? authorizationHeader.slice(7).trim()
		: ""
	return (
		provided.length === internalToken.length &&
		timingSafeEqual(Buffer.from(provided), Buffer.from(internalToken))
	)
}

export const resolvePrometheusProxyEndpoint = (
	req: HttpServerRequest.HttpServerRequest,
): PrometheusProxyEndpoint => {
	const scheme =
		firstHeaderValue(req.headers["x-forwarded-proto"]) ??
		(req.url.startsWith("https://") ? "https" : "http")
	const host =
		firstHeaderValue(req.headers.host) ??
		firstHeaderValue(req.headers["x-forwarded-host"]) ??
		"127.0.0.1:3472"

	return {
		scheme,
		host,
		metricsPath: "/api/internal/prometheus-scrape",
	}
}

export const toPrometheusSDTarget = (
	row: ServiceDiscoveryScrapeTargetRow,
	proxy: PrometheusProxyEndpoint,
): Effect.Effect<Option.Option<PrometheusSDTarget>> =>
	Effect.gen(function* () {
		const url = yield* Effect.try({
			try: () => new URL(row.url),
			catch: () => new Error("Invalid URL"),
		}).pipe(Effect.option)

		if (Option.isNone(url)) {
			yield* Effect.logWarning("Skipping scrape target with invalid URL").pipe(
				Effect.annotateLogs({
					scrapeTargetId: row.id,
					url: row.url,
				}),
			)
			return Option.none<PrometheusSDTarget>()
		}

		const labels: Record<string, string> = {}

		// Apply user-supplied labels first so they cannot override the
		// canonical system labels written below. Reserved keys (`maple_*`,
		// `__*`, `job`, `instance`) are also rejected at write time in
		// ScrapeTargetsService.validateLabelsJson, but applying system labels
		// last is the authoritative defense against tenant-controlled
		// `maple_org_id` poisoning the collector's tenant attribution.
		if (row.labelsJson) {
			const extra = yield* Schema.decodeUnknownEffect(
				Schema.fromJsonString(Schema.Record(Schema.String, Schema.String)),
			)(row.labelsJson).pipe(Effect.option)

			if (Option.isSome(extra)) {
				Object.assign(labels, extra.value)
			}
		}

		labels.__scheme__ = proxy.scheme
		labels.__metrics_path__ = proxy.metricsPath
		labels.__param_targetId = row.id
		labels.job = row.serviceName ?? row.name
		labels.instance = url.value.host
		labels.maple_org_id = row.orgId
		labels.maple_scrape_target_id = row.id
		labels.maple_scrape_target_name = row.name
		labels.maple_scrape_interval_seconds = String(row.scrapeIntervalSeconds)

		return Option.some(new PrometheusSDTarget({ targets: [proxy.host], labels }))
	})

export const HttpServiceDiscoveryLive = HttpApiBuilder.group(MapleApi, "serviceDiscovery", (handlers) =>
	Effect.gen(function* () {
		const env = yield* Env
		const service = yield* ScrapeTargetsService

		return handlers.handle("prometheus", ({ query }) =>
			Effect.gen(function* () {
				const internalToken = Option.match(env.SD_INTERNAL_TOKEN, {
					onNone: () => undefined,
					onSome: Redacted.value,
				})

				if (!internalToken) {
					return yield* Effect.fail(
						new SDUnauthorizedError({ message: "Service discovery endpoint not configured" }),
					)
				}

				const req = yield* HttpServerRequest.HttpServerRequest
				if (!isValidInternalBearer(req.headers.authorization, internalToken)) {
					return yield* Effect.fail(new SDUnauthorizedError({ message: "Unauthorized" }))
				}

				const interval =
					query.interval === undefined ? undefined : decodeScrapeIntervalSecondsSync(query.interval)
				const proxy = resolvePrometheusProxyEndpoint(req)
				const rows = yield* service
					.listAllEnabled(interval)
					.pipe(Effect.mapError((e) => new SDPersistenceError({ message: e.message })))

				const sdTargets = yield* Effect.forEach(rows, (row) =>
					toPrometheusSDTarget(row, proxy),
				).pipe(Effect.map(Arr.getSomes))

				return sdTargets
			}),
		)
	}),
)
