import { createSign } from "node:crypto"
import { Effect } from "effect"
import type { DetectedAnomaly } from "../lib/anomaly-types"
import { AgentEnv } from "./AgentEnv"

function createAppJwt(appId: string, privateKey: string): string {
  const now = Math.floor(Date.now() / 1000)
  const header = Buffer.from(JSON.stringify({ alg: "RS256", typ: "JWT" })).toString("base64url")
  const payload = Buffer.from(
    JSON.stringify({
      iat: now - 60,
      exp: now + 600,
      iss: appId,
    }),
  ).toString("base64url")

  const sign = createSign("RSA-SHA256")
  sign.update(`${header}.${payload}`)
  const signature = sign.sign(privateKey, "base64url")

  return `${header}.${payload}.${signature}`
}

const SEVERITY_COLORS: Record<string, string> = {
  critical: "d73a49",
  warning: "e36209",
  info: "0366d6",
}

const KIND_LABELS: Record<string, string> = {
  error_rate_spike: "error-rate-spike",
  new_error_type: "new-error-type",
  latency_degradation: "latency-degradation",
  apdex_drop: "apdex-drop",
}

export class GitHubIssueService extends Effect.Service<GitHubIssueService>()(
  "GitHubIssueService",
  {
    accessors: true,
    dependencies: [AgentEnv.Default],
    effect: Effect.gen(function* () {
      const env = yield* AgentEnv

      const getInstallationToken = Effect.fn("GitHubIssueService.getInstallationToken")(
        function* (installationId: number) {
          const jwt = yield* Effect.try({
            try: () => createAppJwt(env.GITHUB_APP_ID, env.GITHUB_APP_PRIVATE_KEY),
            catch: (error) =>
              new Error(`Failed to create GitHub App JWT: ${error instanceof Error ? error.message : "unknown"}`),
          })

          const result = yield* Effect.tryPromise({
            try: async () => {
              const response = await fetch(
                `https://api.github.com/app/installations/${installationId}/access_tokens`,
                {
                  method: "POST",
                  headers: {
                    Authorization: `Bearer ${jwt}`,
                    Accept: "application/vnd.github+json",
                    "X-GitHub-Api-Version": "2022-11-28",
                  },
                },
              )
              if (!response.ok) {
                const body = await response.text()
                throw new Error(`GitHub API ${response.status}: ${body}`)
              }
              return (await response.json()) as { token: string }
            },
            catch: (error) =>
              new Error(`Failed to get installation token: ${error instanceof Error ? error.message : "unknown"}`),
          })

          return result.token
        },
      )

      const ensureLabels = Effect.fn("GitHubIssueService.ensureLabels")(
        function* (token: string, owner: string, repo: string) {
          const labels = [
            { name: "maple-agent", color: "5319e7", description: "Created by Maple anomaly agent" },
            { name: "severity:critical", color: SEVERITY_COLORS.critical, description: "Critical severity" },
            { name: "severity:warning", color: SEVERITY_COLORS.warning, description: "Warning severity" },
            { name: "severity:info", color: SEVERITY_COLORS.info, description: "Info severity" },
            { name: "kind:error-rate-spike", color: "fbca04", description: "Error rate spike anomaly" },
            { name: "kind:new-error-type", color: "fbca04", description: "New error type anomaly" },
            { name: "kind:latency-degradation", color: "fbca04", description: "Latency degradation anomaly" },
            { name: "kind:apdex-drop", color: "fbca04", description: "Apdex drop anomaly" },
          ]

          for (const label of labels) {
            yield* Effect.tryPromise({
              try: async () => {
                const response = await fetch(
                  `https://api.github.com/repos/${owner}/${repo}/labels`,
                  {
                    method: "POST",
                    headers: {
                      Authorization: `Bearer ${token}`,
                      Accept: "application/vnd.github+json",
                      "X-GitHub-Api-Version": "2022-11-28",
                      "Content-Type": "application/json",
                    },
                    body: JSON.stringify(label),
                  },
                )
                // 422 = label already exists, that's fine
                if (!response.ok && response.status !== 422) {
                  const body = await response.text()
                  throw new Error(`Failed to create label ${label.name}: ${response.status} ${body}`)
                }
              },
              catch: (error) =>
                new Error(`Label creation failed: ${error instanceof Error ? error.message : "unknown"}`),
            }).pipe(Effect.catchAll(() => Effect.void))
          }
        },
      )

      const createIssue = Effect.fn("GitHubIssueService.createIssue")(
        function* (token: string, owner: string, repo: string, anomaly: DetectedAnomaly) {
          yield* ensureLabels(token, owner, repo)

          const kindLabel = KIND_LABELS[anomaly.kind] ?? anomaly.kind
          const labels = [
            "maple-agent",
            `severity:${anomaly.severity}`,
            `kind:${kindLabel}`,
          ]

          const body = buildIssueBody(anomaly)

          const result = yield* Effect.tryPromise({
            try: async () => {
              const response = await fetch(
                `https://api.github.com/repos/${owner}/${repo}/issues`,
                {
                  method: "POST",
                  headers: {
                    Authorization: `Bearer ${token}`,
                    Accept: "application/vnd.github+json",
                    "X-GitHub-Api-Version": "2022-11-28",
                    "Content-Type": "application/json",
                  },
                  body: JSON.stringify({
                    title: anomaly.title,
                    body,
                    labels,
                  }),
                },
              )
              if (!response.ok) {
                const responseBody = await response.text()
                throw new Error(`GitHub API ${response.status}: ${responseBody}`)
              }
              return (await response.json()) as {
                number: number
                html_url: string
              }
            },
            catch: (error) =>
              new Error(`Failed to create issue: ${error instanceof Error ? error.message : "unknown"}`),
          })

          return { number: result.number, url: result.html_url }
        },
      )

      return {
        getInstallationToken,
        createIssue,
      }
    }),
  },
) {}

function buildIssueBody(anomaly: DetectedAnomaly): string {
  const sections: string[] = []

  sections.push(`## Anomaly Detected by Maple Agent\n`)
  sections.push(`**Kind:** ${anomaly.kind.replace(/_/g, " ")}`)
  sections.push(`**Severity:** ${anomaly.severity}`)
  sections.push(`**Detected at:** ${anomaly.detectedAt}\n`)
  sections.push(`### Description\n`)
  sections.push(anomaly.description)

  sections.push(`\n### Metrics\n`)
  sections.push(`| Metric | Value |`)
  sections.push(`|--------|-------|`)
  sections.push(`| Current value | ${anomaly.currentValue} |`)
  if (anomaly.baselineValue !== undefined) {
    sections.push(`| Baseline value | ${anomaly.baselineValue} |`)
  }
  sections.push(`| Threshold | ${anomaly.thresholdValue} |`)

  if (anomaly.affectedServices.length > 0) {
    sections.push(`\n### Affected Services\n`)
    for (const service of anomaly.affectedServices) {
      sections.push(`- \`${service}\``)
    }
  }

  if (anomaly.sampleTraceIds && anomaly.sampleTraceIds.length > 0) {
    sections.push(`\n### Sample Trace IDs\n`)
    for (const traceId of anomaly.sampleTraceIds) {
      sections.push(`- \`${traceId}\``)
    }
  }

  sections.push(`\n---\n*This issue was automatically created by the [Maple](https://github.com/mapleai/maple) anomaly detection agent.*`)

  return sections.join("\n")
}
