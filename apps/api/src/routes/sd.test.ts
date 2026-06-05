import { describe, expect, it } from "vitest"
import { Effect, Option } from "effect"
import { isValidInternalBearer, toPrometheusSDTarget } from "./sd.http"

describe("service discovery helpers", () => {
	it("validates internal bearer tokens with exact match", () => {
		expect(isValidInternalBearer("Bearer secret-token", "secret-token")).toBe(true)
		expect(isValidInternalBearer("Bearer wrong", "secret-token")).toBe(false)
		expect(isValidInternalBearer(undefined, "secret-token")).toBe(false)
		expect(isValidInternalBearer("Bearer secret-token", undefined)).toBe(false)
	})

	it("emits proxy scrape targets with real target labels", async () => {
		const result = await Effect.runPromise(
			toPrometheusSDTarget(
				{
					id: "11111111-1111-4111-8111-111111111111",
					orgId: "org_1",
					name: "Node Exporter",
					serviceName: "node",
					url: "https://node.example.com:9100/metrics",
					scrapeIntervalSeconds: 15,
					labelsJson: JSON.stringify({ env: "prod" }),
				},
				{
					scheme: "http",
					host: "api:3472",
					metricsPath: "/api/internal/prometheus-scrape",
				},
			),
		)

		expect(Option.isSome(result)).toBe(true)
		if (Option.isNone(result)) return

		expect(result.value.targets).toEqual(["api:3472"])
		expect(result.value.labels).toMatchObject({
			env: "prod",
			__scheme__: "http",
			__metrics_path__: "/api/internal/prometheus-scrape",
			__param_targetId: "11111111-1111-4111-8111-111111111111",
			job: "node",
			instance: "node.example.com:9100",
			maple_org_id: "org_1",
			maple_scrape_target_id: "11111111-1111-4111-8111-111111111111",
			maple_scrape_target_name: "Node Exporter",
			maple_scrape_interval_seconds: "15",
		})
		expect(result.value.labels).not.toHaveProperty("__scrape_interval__")
	})

	it("skips rows with invalid URLs", async () => {
		const result = await Effect.runPromise(
			toPrometheusSDTarget(
				{
					id: "11111111-1111-4111-8111-111111111111",
					orgId: "org_1",
					name: "Bad Target",
					serviceName: null,
					url: "not a url",
					scrapeIntervalSeconds: 15,
					labelsJson: null,
				},
				{
					scheme: "http",
					host: "api:3472",
					metricsPath: "/api/internal/prometheus-scrape",
				},
			),
		)

		expect(Option.isNone(result)).toBe(true)
	})
})
