import { BunRuntime } from "@effect/platform-bun"
import { Duration, Effect, Layer, Schedule } from "effect"
import { runAgentLoop } from "./loop"
import { AgentEnv } from "./services/AgentEnv"
import { AnomalyDetectionService } from "./services/AnomalyDetectionService"
import { AnomalyStateService, AgentDatabaseLive } from "./services/AnomalyStateService"
import { GitHubIssueService } from "./services/GitHubIssueService"
import { MapleApiClient } from "./services/MapleApiClient"

// Build layers bottom-up: AgentEnv → Database → Services
const MainLive = Layer.mergeAll(
  AnomalyDetectionService.Default,
  AnomalyStateService.Live,
  GitHubIssueService.Default,
  MapleApiClient.Default,
).pipe(
  Layer.provideMerge(AgentDatabaseLive),
  Layer.provideMerge(AgentEnv.Default),
)

const program = Effect.gen(function* () {
  const env = yield* AgentEnv
  yield* Effect.logInfo(`Maple Agent starting (interval: ${env.AGENT_INTERVAL_SECONDS}s)`)

  // Run once immediately, then repeat on schedule
  yield* runAgentLoop.pipe(
    Effect.tap(() => Effect.logInfo("Agent cycle complete")),
    Effect.catchAll((error) =>
      Effect.logError(`Agent cycle failed: ${String(error)}`),
    ),
    Effect.repeat(Schedule.spaced(Duration.seconds(env.AGENT_INTERVAL_SECONDS))),
  )
})

BunRuntime.runMain(program.pipe(Effect.provide(MainLive)))
