import { index, integer, sqliteTable, text } from "drizzle-orm/sqlite-core"

export const detectedAnomalies = sqliteTable(
  "detected_anomalies",
  {
    id: text("id").notNull().primaryKey(),
    orgId: text("org_id").notNull(),
    fingerprint: text("fingerprint").notNull(),
    kind: text("kind").notNull(), // error_rate_spike | new_error_type | latency_degradation | apdex_drop
    severity: text("severity").notNull(), // critical | warning | info
    title: text("title").notNull(),
    detailsJson: text("details_json").notNull(), // full anomaly payload
    githubIssueNumber: integer("github_issue_number", { mode: "number" }),
    githubIssueUrl: text("github_issue_url"),
    githubRepo: text("github_repo"), // owner/repo where issue was filed
    status: text("status").notNull().default("open"), // open | resolved | suppressed
    detectedAt: integer("detected_at", { mode: "number" }).notNull(),
    cooldownUntil: integer("cooldown_until", { mode: "number" }).notNull(),
    createdAt: integer("created_at", { mode: "number" }).notNull(),
  },
  (table) => [
    index("anomalies_org_fp_cooldown_idx").on(
      table.orgId,
      table.fingerprint,
      table.cooldownUntil,
    ),
    index("anomalies_org_status_idx").on(table.orgId, table.status),
  ],
)

export type DetectedAnomalyRow = typeof detectedAnomalies.$inferSelect
export type DetectedAnomalyInsert = typeof detectedAnomalies.$inferInsert
