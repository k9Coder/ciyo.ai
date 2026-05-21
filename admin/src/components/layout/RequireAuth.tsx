import { useEffect } from 'react'
import { Navigate } from 'react-router-dom'
import { useAuth } from '@clerk/react'
import { setTokenGetter } from '../../api'

export function RequireAuth({ children }: { children: React.ReactNode }) {
  const { isLoaded, isSignedIn, orgId, orgRole, getToken } = useAuth()

  useEffect(() => {
    if (isSignedIn) setTokenGetter(getToken)
    else setTokenGetter(null)
    return () => setTokenGetter(null)
  }, [isSignedIn, getToken])

  if (!isLoaded) return <div className="min-h-screen flex items-center justify-center text-sm text-gray-500">Loading…</div>
  if (!isSignedIn) return <Navigate to="/login" replace />
  if (!orgId) return <Navigate to="/onboarding" replace />
  if (orgRole !== 'org:admin') return <Navigate to="/unauthorized" replace />
  return <>{children}</>
}
