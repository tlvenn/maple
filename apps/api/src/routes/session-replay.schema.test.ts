import { describe, expect, it } from "vitest"
import { Schema } from "effect"
import { ListReplaysResponse, SessionEventItem, SessionReplayListItem } from "@maple/domain/http"

// Regression for the prod 500 on /api/session-replays/list: self-recorded
// sessions store UserId="" (no Clerk user passed to MapleBrowser.init), and
// UserId enforces isMinLength(1). The list/detail responses must permit a
// missing user id, and the handler maps "" -> null before decoding.
const decodeItem = Schema.decodeUnknownSync(SessionReplayListItem)

const baseRow = {
	sessionId: "999ea7ec-831a-49b2-b9f7-9001d3c586c2",
	startTime: "2026-05-26 08:29:26.243",
	endTime: null,
	durationMs: null,
	status: "ended",
	userId: null,
	urlInitial: "https://app.maple.dev/",
	browserName: "Chrome",
	osName: "macOS",
	deviceType: "desktop",
	country: "",
	serviceName: "maple-web",
	pageViews: 1,
	clickCount: 0,
	errorCount: 0,
	traceCount: 0,
}

describe("SessionReplayListItem.userId", () => {
	it("accepts a null userId (anonymous sessions)", () => {
		expect(decodeItem(baseRow).userId).toBeNull()
	})

	it("accepts a non-empty userId", () => {
		expect(decodeItem({ ...baseRow, userId: "user_123" }).userId).toBe("user_123")
	})

	it("rejects an empty-string userId — why the handler must map '' -> null", () => {
		expect(() => decodeItem({ ...baseRow, userId: "" })).toThrow()
	})

	it("ListReplaysResponse constructs with a null-userId row", () => {
		const res = new ListReplaysResponse({ data: [decodeItem(baseRow)] })
		expect(res.data[0]?.userId).toBeNull()
	})
})

// Distilled session events not tied to a trace (console/click/navigation, and —
// because main.tsx sets instrumentFetch:false — network events too) store
// TraceId="". The transcript response must permit a null trace id; the handler
// maps "" -> null before decoding.
const decodeEvent = Schema.decodeUnknownSync(SessionEventItem)

const baseEvent = {
	timestamp: "2026-05-26 08:29:28.065",
	seq: 0,
	type: "console",
	url: "https://app.maple.dev/",
	traceId: null,
	level: "info",
	message: "hello",
	targetSelector: "",
	targetText: "",
	netMethod: "",
	netUrl: "",
	netStatus: 0,
	netDurationMs: 0,
	errorStack: "",
}

describe("SessionEventItem.traceId", () => {
	it("accepts a null traceId (trace-less events)", () => {
		expect(decodeEvent(baseEvent).traceId).toBeNull()
	})

	it("rejects an empty-string traceId — why the handler must map '' -> null", () => {
		expect(() => decodeEvent({ ...baseEvent, traceId: "" })).toThrow()
	})
})
