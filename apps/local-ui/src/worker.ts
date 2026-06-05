// Cloudflare Worker entrypoint for the deployed local-mode dashboard
// (`local.maple.dev`). The same `dist/` is also embedded into the `maple`
// binary for `--offline`; the SPA picks its `/local/query` base URL at runtime
// from `window.location` (see `src/lib/constants.ts`). Static assets are served
// from the ASSETS binding; unknown routes fall back to the SPA shell so the
// client router can take over.
type Env = {
	ASSETS: { fetch: (request: Request) => Promise<Response> }
}

export default {
	async fetch(request: Request, env: Env): Promise<Response> {
		const url = new URL(request.url)

		const assetResponse = await env.ASSETS.fetch(request)
		if (assetResponse.status !== 404) {
			return assetResponse
		}

		return env.ASSETS.fetch(new Request(new URL("/index.html", url), request))
	},
}
