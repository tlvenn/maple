import { HttpApiEndpoint, HttpApiGroup } from "effect/unstable/httpapi"
import { Schema } from "effect"
import { IsoDateTimeString, ScrapeAuthType, ScrapeIntervalSeconds, ScrapeTargetId } from "../primitives"
import { Authorization } from "./current-tenant"
import { warehouseHttpErrors } from "./warehouse-errors"

export class ScrapeTargetResponse extends Schema.Class<ScrapeTargetResponse>("ScrapeTargetResponse")({
	id: ScrapeTargetId,
	name: Schema.String,
	serviceName: Schema.NullOr(Schema.String),
	url: Schema.String,
	scrapeIntervalSeconds: ScrapeIntervalSeconds,
	labelsJson: Schema.NullOr(Schema.String),
	authType: ScrapeAuthType,
	hasCredentials: Schema.Boolean,
	enabled: Schema.Boolean,
	lastScrapeAt: Schema.NullOr(IsoDateTimeString),
	lastScrapeError: Schema.NullOr(Schema.String),
	createdAt: IsoDateTimeString,
	updatedAt: IsoDateTimeString,
}) {}

export class ScrapeTargetsListResponse extends Schema.Class<ScrapeTargetsListResponse>(
	"ScrapeTargetsListResponse",
)({
	targets: Schema.Array(ScrapeTargetResponse),
}) {}

export class CreateScrapeTargetRequest extends Schema.Class<CreateScrapeTargetRequest>(
	"CreateScrapeTargetRequest",
)({
	name: Schema.String,
	url: Schema.String,
	scrapeIntervalSeconds: Schema.optionalKey(ScrapeIntervalSeconds),
	labelsJson: Schema.optionalKey(Schema.NullOr(Schema.String)),
	authType: Schema.optionalKey(ScrapeAuthType),
	serviceName: Schema.optionalKey(Schema.NullOr(Schema.String)),
	authCredentials: Schema.optionalKey(Schema.NullOr(Schema.String)),
	enabled: Schema.optionalKey(Schema.Boolean),
}) {}

export class UpdateScrapeTargetRequest extends Schema.Class<UpdateScrapeTargetRequest>(
	"UpdateScrapeTargetRequest",
)({
	name: Schema.optionalKey(Schema.String),
	url: Schema.optionalKey(Schema.String),
	scrapeIntervalSeconds: Schema.optionalKey(ScrapeIntervalSeconds),
	labelsJson: Schema.optionalKey(Schema.NullOr(Schema.String)),
	authType: Schema.optionalKey(ScrapeAuthType),
	serviceName: Schema.optionalKey(Schema.NullOr(Schema.String)),
	authCredentials: Schema.optionalKey(Schema.NullOr(Schema.String)),
	enabled: Schema.optionalKey(Schema.Boolean),
}) {}

export class ScrapeTargetDeleteResponse extends Schema.Class<ScrapeTargetDeleteResponse>(
	"ScrapeTargetDeleteResponse",
)({
	id: ScrapeTargetId,
}) {}

export class ScrapeTargetProbeResponse extends Schema.Class<ScrapeTargetProbeResponse>(
	"ScrapeTargetProbeResponse",
)({
	success: Schema.Boolean,
	lastScrapeAt: Schema.NullOr(IsoDateTimeString),
	lastScrapeError: Schema.NullOr(Schema.String),
}) {}

export class ScrapeTargetCheckResponse extends Schema.Class<ScrapeTargetCheckResponse>(
	"ScrapeTargetCheckResponse",
)({
	timestamp: IsoDateTimeString,
	success: Schema.Boolean,
	up: Schema.Number,
	durationSeconds: Schema.NullOr(Schema.Number),
	samplesScraped: Schema.NullOr(Schema.Number),
	samplesPostMetricRelabeling: Schema.NullOr(Schema.Number),
	seriesAdded: Schema.NullOr(Schema.Number),
	serviceName: Schema.String,
	job: Schema.String,
	instance: Schema.String,
	message: Schema.NullOr(Schema.String),
}) {}

export class ScrapeTargetChecksListResponse extends Schema.Class<ScrapeTargetChecksListResponse>(
	"ScrapeTargetChecksListResponse",
)({
	checks: Schema.Array(ScrapeTargetCheckResponse),
}) {}

export const ListScrapeTargetChecksQuery = Schema.Struct({
	since: Schema.optionalKey(IsoDateTimeString),
	until: Schema.optionalKey(IsoDateTimeString),
	limit: Schema.optionalKey(
		Schema.NumberFromString.check(Schema.isInt(), Schema.isBetween({ minimum: 1, maximum: 200 })),
	),
})

export class ScrapeTargetPersistenceError extends Schema.TaggedErrorClass<ScrapeTargetPersistenceError>()(
	"@maple/http/errors/ScrapeTargetPersistenceError",
	{
		message: Schema.String,
	},
	{ httpApiStatus: 503 },
) {}

export class ScrapeTargetNotFoundError extends Schema.TaggedErrorClass<ScrapeTargetNotFoundError>()(
	"@maple/http/errors/ScrapeTargetNotFoundError",
	{
		targetId: ScrapeTargetId,
		message: Schema.String,
	},
	{ httpApiStatus: 404 },
) {}

export class ScrapeTargetValidationError extends Schema.TaggedErrorClass<ScrapeTargetValidationError>()(
	"@maple/http/errors/ScrapeTargetValidationError",
	{
		message: Schema.String,
	},
	{ httpApiStatus: 400 },
) {}

export class ScrapeTargetEncryptionError extends Schema.TaggedErrorClass<ScrapeTargetEncryptionError>()(
	"@maple/http/errors/ScrapeTargetEncryptionError",
	{
		message: Schema.String,
	},
	{ httpApiStatus: 500 },
) {}

export class ScrapeTargetsApiGroup extends HttpApiGroup.make("scrapeTargets")
	.add(
		HttpApiEndpoint.get("list", "/", {
			success: ScrapeTargetsListResponse,
			error: ScrapeTargetPersistenceError,
		}),
	)
	.add(
		HttpApiEndpoint.post("create", "/", {
			payload: CreateScrapeTargetRequest,
			success: ScrapeTargetResponse,
			error: [ScrapeTargetValidationError, ScrapeTargetPersistenceError, ScrapeTargetEncryptionError],
		}),
	)
	.add(
		HttpApiEndpoint.patch("update", "/:targetId", {
			params: {
				targetId: ScrapeTargetId,
			},
			payload: UpdateScrapeTargetRequest,
			success: ScrapeTargetResponse,
			error: [
				ScrapeTargetNotFoundError,
				ScrapeTargetValidationError,
				ScrapeTargetPersistenceError,
				ScrapeTargetEncryptionError,
			],
		}),
	)
	.add(
		HttpApiEndpoint.delete("delete", "/:targetId", {
			params: {
				targetId: ScrapeTargetId,
			},
			success: ScrapeTargetDeleteResponse,
			error: [ScrapeTargetNotFoundError, ScrapeTargetPersistenceError],
		}),
	)
	.add(
		HttpApiEndpoint.post("probe", "/:targetId/probe", {
			params: {
				targetId: ScrapeTargetId,
			},
			success: ScrapeTargetProbeResponse,
			error: [ScrapeTargetNotFoundError, ScrapeTargetPersistenceError, ScrapeTargetEncryptionError],
		}),
	)
	.add(
		HttpApiEndpoint.get("listChecks", "/:targetId/checks", {
			params: {
				targetId: ScrapeTargetId,
			},
			query: ListScrapeTargetChecksQuery,
			success: ScrapeTargetChecksListResponse,
			error: [ScrapeTargetNotFoundError, ScrapeTargetPersistenceError, ...warehouseHttpErrors],
		}),
	)
	.prefix("/api/scrape-targets")
	.middleware(Authorization) {}
