import { createContext, useContext } from 'react'
import { Navigate } from 'react-router-dom'
import { useWireAuthToken } from '../../hooks/useWireAuthToken'
import { PageLoader } from '../ui/Spinner'

const AuthReadyContext = createContext(false)
export const useAuthReady = () => useContext(AuthReadyContext)

export function RequireAuth({ children }: { children: React.ReactNode }) {
  const { isLoaded, isSignedIn } = useWireAuthToken()

  if (!isLoaded) return (
    <div style={{ minHeight: '100vh', display: 'flex', alignItems: 'center', justifyContent: 'center', background: 'var(--bg-base)' }}>
      <PageLoader label="Authenticating" />
    </div>
  )
  if (!isSignedIn) return <Navigate to="/login" replace />
  return <AuthReadyContext.Provider value={true}>{children}</AuthReadyContext.Provider>
}
