import { createFileRoute } from "@tanstack/react-router"
import { effectRoute } from "@effect-router/core"
import { Schema } from "effect"

import {
	DEFAULT_BENCH_PARAMS,
	ServiceMapBench,
	type BenchParams,
	type BenchRps,
} from "@/components/service-map/service-map-bench"

// TanStack Router pre-parses numeric search params into numbers before
// validateSearch runs, so accept Number (not NumberFromString) here.
const benchSearchSchema = Schema.Struct({
	services: Schema.optional(Schema.Number),
	edges: Schema.optional(Schema.Number),
	rps: Schema.optional(Schema.Literals(["low", "med", "high"])),
	seed: Schema.optional(Schema.Number),
})

export const Route = effectRoute(createFileRoute("/service-map-bench"))({
	component: ServiceMapBenchPage,
	validateSearch: Schema.toStandardSchemaV1(benchSearchSchema),
})

function ServiceMapBenchPage() {
	const search = Route.useSearch()

	// Dev/CI-only synthetic perf harness — inert in production builds.
	if (!import.meta.env.DEV) return null

	const params: BenchParams = {
		services: search.services ?? DEFAULT_BENCH_PARAMS.services,
		edges: search.edges ?? DEFAULT_BENCH_PARAMS.edges,
		rps: (search.rps as BenchRps | undefined) ?? DEFAULT_BENCH_PARAMS.rps,
		seed: search.seed ?? DEFAULT_BENCH_PARAMS.seed,
	}

	return <ServiceMapBench params={params} />
}
