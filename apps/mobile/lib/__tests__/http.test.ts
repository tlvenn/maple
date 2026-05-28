import { describe, expect, it } from "vitest"

import { getHttpInfo } from "../http"

describe("getHttpInfo (mobile)", () => {
	it("detects HTTP from standard attrs", () => {
		expect(
			getHttpInfo({
				spanName: "ignored",
				spanAttributes: {
					"http.method": "POST",
					"http.route": "/checkout",
					"http.status_code": "201",
				},
			}),
		).toEqual({
			method: "POST",
			route: "/checkout",
			statusCode: 201,
			isError: false,
			kind: "server",
		})
	})

	it("detects HTTP from name-only overview values", () => {
		expect(getHttpInfo({ spanName: "GET /checkout" })).toEqual({
			method: "GET",
			route: "/checkout",
			statusCode: null,
			isError: false,
			kind: "server",
		})
	})

	it("returns null for non-http spans", () => {
		expect(getHttpInfo({ spanName: "CheckoutService.createOrder" })).toBeNull()
	})

	it("extracts host+path from url.full for client spans", () => {
		expect(
			getHttpInfo({
				spanName: "http.client GET",
				spanAttributes: {
					"http.request.method": "GET",
					"url.full": "https://api.tinybird.co/v1/spans?x=1",
					"http.response.status_code": "200",
				},
			}),
		).toEqual({
			method: "GET",
			route: "api.tinybird.co/v1/spans",
			statusCode: 200,
			isError: false,
			kind: "client",
		})
	})

	it("parses http.client span name with full URL tail", () => {
		expect(getHttpInfo({ spanName: "http.client GET https://api.tinybird.co/v1/spans" })).toEqual({
			method: "GET",
			route: "api.tinybird.co/v1/spans",
			statusCode: null,
			isError: false,
			kind: "client",
		})
	})

	// Regression: the span-hierarchy query rewrites a client span named "GET" into
	// "GET /v0/sql", dropping the "http.client " prefix and leaving no url.full. The
	// name heuristic alone would misclassify it as a server span and emit path-only,
	// hiding the destination host. A real SPAN_KIND_CLIENT must override that.
	it("uses SPAN_KIND_CLIENT to reconstruct host+path despite a rewritten name", () => {
		expect(
			getHttpInfo({
				spanName: "GET /v0/sql",
				spanKind: "SPAN_KIND_CLIENT",
				spanAttributes: {
					"http.request.method": "GET",
					"server.address": "api.tinybird.co",
					"url.path": "/v0/sql",
				},
			}),
		).toEqual({
			method: "GET",
			route: "api.tinybird.co/v0/sql",
			statusCode: null,
			isError: false,
			kind: "client",
		})
	})

	it("treats an empty-string method attr as absent (no blank method badge)", () => {
		expect(
			getHttpInfo({
				spanName: "/subscriptions-api/public/v1/redeem",
				spanKind: "SPAN_KIND_SERVER",
				spanAttributes: {
					"http.request.method": "",
					"http.route": "/subscriptions-api/public/v1/redeem",
				},
			}),
		).toBeNull()
	})

	it("uses SPAN_KIND_SERVER to keep path-only even when host attrs are present", () => {
		expect(
			getHttpInfo({
				spanName: "GET /v1/spans",
				spanKind: "SPAN_KIND_SERVER",
				spanAttributes: {
					"http.request.method": "GET",
					"server.address": "api.tinybird.co",
					"url.path": "/v1/spans",
				},
			}),
		).toEqual({
			method: "GET",
			route: "/v1/spans",
			statusCode: null,
			isError: false,
			kind: "server",
		})
	})
})
