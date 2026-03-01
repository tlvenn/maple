import { Schema } from "effect"

export class DetectedAnomaly extends Schema.Class<DetectedAnomaly>("DetectedAnomaly")({
  kind: Schema.Literal("error_rate_spike", "new_error_type", "latency_degradation", "apdex_drop"),
  severity: Schema.Literal("critical", "warning", "info"),
  fingerprint: Schema.String,
  title: Schema.String,
  description: Schema.String,
  serviceName: Schema.optional(Schema.String),
  affectedServices: Schema.Array(Schema.String),
  detectedAt: Schema.String,
  currentValue: Schema.Number,
  baselineValue: Schema.optional(Schema.Number),
  thresholdValue: Schema.Number,
  sampleTraceIds: Schema.optional(Schema.Array(Schema.String)),
}) {}
