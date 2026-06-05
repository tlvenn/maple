import { useAuth } from "@clerk/clerk-react"
import { useEffect } from "react"
import { clearMapleAuthHeaders, setActiveOrgId, setMapleAuthHeadersProvider } from "./auth-headers"

export function ClerkAuthBridge() {
	const { isLoaded, isSignedIn, getToken, orgId } = useAuth()

	// Publish the active org so org-scoped client caches re-key on org switch
	// (which invalidates the router but not module-level state).
	useEffect(() => {
		setActiveOrgId(isLoaded && isSignedIn ? orgId : null)
	}, [isLoaded, isSignedIn, orgId])

	useEffect(() => {
		if (!isLoaded || !isSignedIn) {
			setMapleAuthHeadersProvider(undefined)
			clearMapleAuthHeaders()
			return
		}

		setMapleAuthHeadersProvider(async (): Promise<Record<string, string>> => {
			const token = await getToken()
			if (!token) return {}

			return {
				authorization: `Bearer ${token}`,
			}
		})

		return () => {
			setMapleAuthHeadersProvider(undefined)
		}
	}, [getToken, isLoaded, isSignedIn])

	return null
}
