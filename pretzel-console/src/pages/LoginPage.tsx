import { useEffect } from 'react'
import { useNavigate } from 'react-router-dom'
import { useAuth, useClerk } from '@clerk/react'
import { Spinner } from '../components/ui/Spinner'

export function LoginPage() {
  const { isLoaded, isSignedIn } = useAuth()
  const { openSignIn } = useClerk()
  const navigate = useNavigate()

  const redirectTo = new URLSearchParams(window.location.search).get('redirect') ?? '/dashboard'

  useEffect(() => {
    if (!isLoaded || !isSignedIn) return
    navigate(redirectTo, { replace: true })
  }, [isLoaded, isSignedIn, navigate, redirectTo])

  return (
    <div className="min-h-screen bg-gray-50 flex items-center justify-center px-4">
      <div className="w-full max-w-md">
        <div className="flex items-center gap-3 mb-8">
          <div className="w-10 h-10 bg-[var(--brand-primary)] rounded-xl flex items-center justify-center text-white font-bold">🥨</div>
          <div>
            <h1 className="text-xl font-semibold text-gray-900">Pretzel Console</h1>
            <p className="text-sm text-gray-500">Sign in with your organization account</p>
          </div>
        </div>
        <div className="bg-white rounded-xl border border-gray-200 p-6 space-y-4">
          {!isLoaded ? (
            <div style={{ display: 'flex', justifyContent: 'center', padding: '8px 0' }}>
              <Spinner size="md" />
            </div>
          ) : (
            <button
              onClick={() => openSignIn()}
              className="w-full py-2 px-4 bg-blue-600 text-white text-sm font-medium rounded-lg hover:bg-blue-700"
            >
              Sign in with Clerk
            </button>
          )}
        </div>
      </div>
    </div>
  )
}
