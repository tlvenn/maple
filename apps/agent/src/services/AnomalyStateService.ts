import { randomUUID } from "node:crypto"
import { SqliteDrizzle } from "@effect/sql-drizzle/Sqlite"
import * as Sqlite from "@effect/sql-drizzle/Sqlite"
import { LibsqlClient } from "@effect/sql-libsql"
import { detectedAnomalies } from "@maple/db"
import { ensureMapleDbDirectory, resolveMapleDbConfig } from "@maple/db/config"
import { runMigrations } from "@maple/db"
import { and, eq, gt } from "drizzle-orm"
import { Effect, Layer, Redacted } from "effect"
import type { DetectedAnomaly } from "../lib/anomaly-types"
import { AgentEnv } from "./AgentEnv"

export const AgentDatabaseLive: Layer.Layer<SqliteDrizzle, never, AgentEnv> = Layer.unwrapEffect(
  Effect.gen(function* () {
    const env = yield* AgentEnv

    const dbConfig = ensureMapleDbDirectory(
      resolveMapleDbConfig({
        MAPLE_DB_URL: env.MAPLE_DB_URL,
        MAPLE_DB_AUTH_TOKEN: env.MAPLE_DB_AUTH_TOKEN,
      }),
    )

    yield* Effect.tryPromise(() => runMigrations(dbConfig)).pipe(
      Effect.tap(() => Effect.logInfo("[AgentDatabase] Migrations complete")),
      Effect.orDie,
    )

    return Sqlite.layer.pipe(
      Layer.provide(
        LibsqlClient.layer({
          url: dbConfig.url,
          authToken: dbConfig.authToken ? Redacted.make(dbConfig.authToken) : undefined,
        }),
      ),
      Layer.orDie,
    )
  }),
)

export class AnomalyStateService extends Effect.Service<AnomalyStateService>()(
  "AnomalyStateService",
  {
    accessors: true,
    dependencies: [AgentEnv.Default],
    effect: Effect.gen(function* () {
      const db = yield* SqliteDrizzle
      const env = yield* AgentEnv

      const filterNew = Effect.fn("AnomalyStateService.filterNew")(
        function* (orgId: string, anomalies: DetectedAnomaly[]) {
          if (anomalies.length === 0) return []

          const now = Date.now()
          const newAnomalies: DetectedAnomaly[] = []

          for (const anomaly of anomalies) {
            const existing = yield* db
              .select()
              .from(detectedAnomalies)
              .where(
                and(
                  eq(detectedAnomalies.orgId, orgId),
                  eq(detectedAnomalies.fingerprint, anomaly.fingerprint),
                  gt(detectedAnomalies.cooldownUntil, now),
                ),
              )
              .limit(1)
              .pipe(
                Effect.mapError(
                  (error) =>
                    new Error(
                      `Failed to check anomaly dedup: ${error instanceof Error ? error.message : "unknown"}`,
                    ),
                ),
              )

            if (existing.length === 0) {
              newAnomalies.push(anomaly)
            }
          }

          return newAnomalies
        },
      )

      const recordAnomaly = Effect.fn("AnomalyStateService.recordAnomaly")(
        function* (
          orgId: string,
          anomaly: DetectedAnomaly,
          issueNumber: number | null,
          issueUrl: string | null,
          repo: string | null,
        ) {
          const now = Date.now()
          const cooldownMs = env.AGENT_COOLDOWN_HOURS * 60 * 60 * 1000

          yield* db
            .insert(detectedAnomalies)
            .values({
              id: randomUUID(),
              orgId,
              fingerprint: anomaly.fingerprint,
              kind: anomaly.kind,
              severity: anomaly.severity,
              title: anomaly.title,
              detailsJson: JSON.stringify({
                description: anomaly.description,
                serviceName: anomaly.serviceName,
                affectedServices: anomaly.affectedServices,
                currentValue: anomaly.currentValue,
                baselineValue: anomaly.baselineValue,
                thresholdValue: anomaly.thresholdValue,
                sampleTraceIds: anomaly.sampleTraceIds,
              }),
              githubIssueNumber: issueNumber,
              githubIssueUrl: issueUrl,
              githubRepo: repo,
              status: "open",
              detectedAt: new Date(anomaly.detectedAt).getTime(),
              cooldownUntil: now + cooldownMs,
              createdAt: now,
            })
            .pipe(
              Effect.mapError(
                (error) =>
                  new Error(
                    `Failed to record anomaly: ${error instanceof Error ? error.message : "unknown"}`,
                  ),
              ),
            )
        },
      )

      const markResolved = Effect.fn("AnomalyStateService.markResolved")(
        function* (orgId: string, fingerprint: string) {
          yield* db
            .update(detectedAnomalies)
            .set({ status: "resolved" })
            .where(
              and(
                eq(detectedAnomalies.orgId, orgId),
                eq(detectedAnomalies.fingerprint, fingerprint),
                eq(detectedAnomalies.status, "open"),
              ),
            )
            .pipe(
              Effect.mapError(
                (error) =>
                  new Error(
                    `Failed to mark anomaly resolved: ${error instanceof Error ? error.message : "unknown"}`,
                  ),
              ),
            )
        },
      )

      return {
        filterNew,
        recordAnomaly,
        markResolved,
      }
    }),
  },
) {
  static readonly Live = this.Default.pipe(Layer.provide(AgentDatabaseLive))
}
