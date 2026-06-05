import { HttpApiBuilder } from "effect/unstable/httpapi"
import {
	CurrentTenant,
	IsoDateTimeString,
	MapleApi,
	ScrapeTargetCheckResponse,
	ScrapeTargetChecksListResponse,
} from "@maple/domain/http"
import { CH } from "@maple/query-engine"
import { Clock, Effect, Schema } from "effect"
import { ScrapeTargetsService } from "../services/ScrapeTargetsService"
import { WarehouseQueryService } from "../lib/WarehouseQueryService"

const decodeIsoDateTimeStringSync = Schema.decodeUnknownSync(IsoDateTimeString)

const normalizeWarehouseTimestamp = (value: string): IsoDateTimeString => {
	const text = String(value)
	const isoish = text.includes("T") ? text : `${text.replace(" ", "T")}Z`
	const millisecondPrecision = isoish.replace(/\.(\d{3})\d+/, ".$1")
	return decodeIsoDateTimeStringSync(new Date(millisecondPrecision).toISOString())
}

const nullableMetric = (value: number, count: number): number | null => (count > 0 ? Number(value) : null)

export const HttpScrapeTargetsLive = HttpApiBuilder.group(MapleApi, "scrapeTargets", (handlers) =>
	Effect.gen(function* () {
		const service = yield* ScrapeTargetsService
		const warehouse = yield* WarehouseQueryService

		return handlers
			.handle("list", () =>
				Effect.gen(function* () {
					const tenant = yield* CurrentTenant.Context
					return yield* service.list(tenant.orgId)
				}),
			)
			.handle("create", ({ payload }) =>
				Effect.gen(function* () {
					const tenant = yield* CurrentTenant.Context
					return yield* service.create(tenant.orgId, payload)
				}),
			)
			.handle("update", ({ params, payload }) =>
				Effect.gen(function* () {
					const tenant = yield* CurrentTenant.Context
					return yield* service.update(tenant.orgId, params.targetId, payload)
				}),
			)
			.handle("delete", ({ params }) =>
				Effect.gen(function* () {
					const tenant = yield* CurrentTenant.Context
					return yield* service.delete(tenant.orgId, params.targetId)
				}),
			)
			.handle("probe", ({ params }) =>
				Effect.gen(function* () {
					const tenant = yield* CurrentTenant.Context
					return yield* service.probe(tenant.orgId, params.targetId)
				}),
			)
			.handle("listChecks", ({ params, query }) =>
				Effect.gen(function* () {
					const tenant = yield* CurrentTenant.Context
					yield* service.get(tenant.orgId, params.targetId)

					const now = yield* Clock.currentTimeMillis
					const until =
						query.until ?? decodeIsoDateTimeStringSync(new Date(now).toISOString())
					const since =
						query.since ??
						decodeIsoDateTimeStringSync(new Date(now - 6 * 60 * 60 * 1000).toISOString())
					const limit = query.limit ?? 50

					const compiled = CH.compile(CH.scrapeTargetChecksQuery({ limit }), {
						orgId: tenant.orgId,
						targetId: params.targetId,
						startTime: since,
						endTime: until,
					})
					const rows = yield* warehouse.compiledQuery(tenant, compiled, {
						profile: "list",
						context: "scrapeTargetChecks",
					})

					return new ScrapeTargetChecksListResponse({
						checks: rows.map((row) => {
							const up = Number(row.up)
							const hasUp = Number(row.upPointCount) > 0
							const success = hasUp && up === 1
							return new ScrapeTargetCheckResponse({
								timestamp: normalizeWarehouseTimestamp(row.timestamp),
								success,
								up,
								durationSeconds: nullableMetric(
									Number(row.durationSeconds),
									Number(row.durationPointCount),
								),
								samplesScraped: nullableMetric(
									Number(row.samplesScraped),
									Number(row.samplesScrapedPointCount),
								),
								samplesPostMetricRelabeling: nullableMetric(
									Number(row.samplesPostMetricRelabeling),
									Number(row.samplesPostMetricRelabelingPointCount),
								),
								seriesAdded: nullableMetric(
									Number(row.seriesAdded),
									Number(row.seriesAddedPointCount),
								),
								serviceName: row.serviceName,
								job: row.job,
								instance: row.instance,
								message: hasUp
									? success
										? null
										: "Prometheus scrape reported up=0"
									: "No up metric emitted for this scrape",
							})
						}),
					})
				}),
			)
	}),
)
