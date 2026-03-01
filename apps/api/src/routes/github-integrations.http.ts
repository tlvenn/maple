import { HttpApiBuilder } from "@effect/platform"
import { CurrentTenant, MapleApi } from "@maple/domain/http"
import { Effect } from "effect"
import { GitHubIntegrationService } from "../services/GitHubIntegrationService"

export const HttpGitHubIntegrationsLive = HttpApiBuilder.group(
  MapleApi,
  "githubIntegrations",
  (handlers) =>
    Effect.gen(function* () {
      const service = yield* GitHubIntegrationService

      return handlers
        .handle("list", () =>
          Effect.gen(function* () {
            const tenant = yield* CurrentTenant.Context
            const integrations = yield* service.list(tenant.orgId)
            return { integrations }
          }),
        )
        .handle("connect", ({ payload }) =>
          Effect.gen(function* () {
            const tenant = yield* CurrentTenant.Context
            return yield* service.handleCallback(tenant.orgId, payload)
          }),
        )
        .handle("listRepos", () =>
          Effect.gen(function* () {
            const tenant = yield* CurrentTenant.Context
            const repos = yield* service.listAccessibleRepos(tenant.orgId)
            return { repos }
          }),
        )
        .handle("update", ({ path, payload }) =>
          Effect.gen(function* () {
            const tenant = yield* CurrentTenant.Context
            return yield* service.update(
              tenant.orgId,
              path.integrationId,
              payload,
            )
          }),
        )
        .handle("delete", ({ path }) =>
          Effect.gen(function* () {
            const tenant = yield* CurrentTenant.Context
            return yield* service.delete(tenant.orgId, path.integrationId)
          }),
        )
    }),
)
