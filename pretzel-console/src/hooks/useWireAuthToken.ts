import { useAuth } from '@clerk/react'
import { setTokenGetter } from '../api'

/**
 * Wires the Clerk token getter into api.ts's fetch wrapper for as long as a
 * caller of this hook is mounted. Called from both RequireAuth and
 * OnboardingProfilePage (a standalone route TenantBootstrap can redirect to)
 * so the wrapper always has a live token regardless of which top-level route
 * is currently mounted.
 *
 * Deliberately has NO unmount cleanup. When RequireAuth unmounts because
 * TenantBootstrap redirects to a sibling top-level route in the same commit,
 * React runs all passive-effect *destroys* before any passive-effect
 * *creates* for that commit — an unmount cleanup here would clear the token
 * getter *after* the newly-mounted page's render already set it, silently
 * breaking that page's API calls. Clearing on sign-out is handled below via
 * the reactive isSignedIn branch instead, which is sufficient: sign-out only
 * ever happens while some consumer of this hook is mounted and re-rendering.
 */
export function useWireAuthToken(): { isLoaded: boolean; isSignedIn: boolean | undefined } {
  const { isLoaded, isSignedIn, getToken } = useAuth()

  if (isLoaded && isSignedIn) {
    setTokenGetter(() => getToken())
  } else if (isLoaded && !isSignedIn) {
    setTokenGetter(null)
  }

  return { isLoaded, isSignedIn }
}
