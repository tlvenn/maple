import { createHmac } from "node:crypto"
import type { TinybirdPipe } from "@maple/domain/tinybird-pipes"
import * as Effect from "effect/Effect"
import { AgentEnv } from "./AgentEnv"

const encodeBase64Url = (value: unknown): string =>
  Buffer.from(JSON.stringify(value)).toString("base64url")

const signHs256Jwt = (
  payload: { sub: string; org_id: string; roles: string[]; authMode: string; iat: number },
  secret: string,
): string => {
  const header = { alg: "HS256", typ: "JWT" }
  const encodedHeader = encodeBase64Url(header)
  const encodedPayload = encodeBase64Url(payload)
  const data = `${encodedHeader}.${encodedPayload}`
  const signature = createHmac("sha256", secret).update(data).digest("base64url")
  return `${data}.${signature}`
}

export class MapleApiClient extends Effect.Service<MapleApiClient>()("MapleApiClient", {
  accessors: true,
  dependencies: [AgentEnv.Default],
  effect: Effect.gen(function* () {
    const env = yield* AgentEnv

    const makeToken = (orgId: string): string => {
      const now = Math.floor(Date.now() / 1000)
      return signHs256Jwt(
        {
          sub: "agent",
          org_id: orgId,
          roles: ["root"],
          authMode: "self_hosted",
          iat: now,
        },
        env.MAPLE_ROOT_PASSWORD,
      )
    }

    const queryTinybird = (orgId: string, pipe: TinybirdPipe, params: Record<string, unknown>) =>
      Effect.tryPromise({
        try: async () => {
          const token = makeToken(orgId)
          const res = await fetch(`${env.MAPLE_API_URL}/api/tinybird/query`, {
            method: "POST",
            headers: {
              "Content-Type": "application/json",
              Authorization: `Bearer ${token}`,
            },
            body: JSON.stringify({ pipe, params }),
          })
          if (!res.ok) {
            const body = await res.text()
            throw new Error(`API ${res.status}: ${body}`)
          }
          return (await res.json()) as { data: unknown[] }
        },
        catch: (cause) =>
          new Error(`Failed to query ${pipe}: ${cause instanceof Error ? cause.message : String(cause)}`),
      })

    return { queryTinybird }
  }),
}) {}
