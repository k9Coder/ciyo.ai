import { Navigate } from 'react-router-dom'
import { getToken } from '../../api'

export function RequireAuth({ children }: { children: React.ReactNode }) {
  if (!getToken()) return <Navigate to="/login" replace />
  return <>{children}</>
}
