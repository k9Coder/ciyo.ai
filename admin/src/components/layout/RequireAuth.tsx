import { createContext, useContext, useEffect } from 'react'
import { Navigate } from 'react-router-dom'
import { useAuth } from '@clerk/react'
import { setTokenGetter } from '../../api'
import { PageLoader } from '../ui/Spinner'

const AuthReadyContext = createContext(false)
export const useAuthReady = () => useContext(AuthReadyContext)

export function RequireAuth({ children }: { children: React.ReactNode }) {
  const { isLoaded, isSignedIn, orgId, orgRole, getToken } = useAuth()

  const ready = isLoaded && !!isSignedIn && !!orgId

  // Set synchronously during render so the token is available before child
  // effects fire. Only clear on explicit sign-out (isLoaded && !isSignedIn) —
  // NOT during Clerk re-sync where isLoaded is transiently false.
  if (ready) {
    setTokenGetter(() => getToken())
  } else if (isLoaded && !isSignedIn) {
    setTokenGetter(null)
  }

  useEffect(() => () => setTokenGetter(null), [])

  if (!isLoaded) return (
    <div style={{ minHeight: '100vh', display: 'flex', alignItems: 'center', justifyContent: 'center', background: 'var(--bg-base)' }}>
      <PageLoader label="Authenticating" />
    </div>
  )
  if (!isSignedIn) return <Navigate to="/login" replace />
  if (!orgId) return <Navigate to="/onboarding" replace />
  if (orgRole !== 'org:admin') return <Navigate to="/unauthorized" replace />
  return <AuthReadyContext.Provider value={ready}>{children}</AuthReadyContext.Provider>
}
