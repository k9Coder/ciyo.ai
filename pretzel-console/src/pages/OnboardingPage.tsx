import { useEffect, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { useAuth, useOrganizationList } from '@clerk/react'
import { PageLoader } from '../components/ui/Spinner'
import { toSlug } from '../api'

export function OnboardingPage() {
  const { isLoaded, isSignedIn, orgId } = useAuth()
  const { isLoaded: listLoaded, createOrganization } = useOrganizationList()
  const navigate = useNavigate()

  const [name, setName] = useState('')
  const [slug, setSlug] = useState('')
  const [slugTouched, setSlugTouched] = useState(false)
  const [submitting, setSubmitting] = useState(false)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    if (!isLoaded) return
    if (!isSignedIn) navigate('/login', { replace: true })
    else if (orgId) navigate('/dashboard', { replace: true })
  }, [isLoaded, isSignedIn, orgId, navigate])

  function handleNameChange(value: string) {
    setName(value)
    if (!slugTouched) setSlug(toSlug(value))
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    if (!name.trim() || !slug.trim()) return
    setSubmitting(true)
    setError(null)
    try {
      if (!createOrganization) return
      await createOrganization({ name: name.trim(), slug: slug.trim() })
      navigate('/dashboard', { replace: true })
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to create organization')
    } finally {
      setSubmitting(false)
    }
  }

  if (!isLoaded || !listLoaded) {
    return (
      <div style={{ minHeight: '100vh', display: 'flex', alignItems: 'center', justifyContent: 'center', background: 'var(--bg-base)' }}>
        <PageLoader label="Authenticating" />
      </div>
    )
  }

  return (
    <div className="min-h-screen bg-gray-50 flex items-center justify-center px-4">
      <div className="w-full max-w-md">
        <div className="flex items-center gap-3 mb-8">
          <div className="w-10 h-10 bg-[#7c6aff] rounded-xl flex items-center justify-center text-white font-bold">🥨</div>
          <div>
            <h1 className="text-xl font-semibold text-gray-900">Pretzel Console</h1>
            <p className="text-sm text-gray-500">Set up your organization</p>
          </div>
        </div>
        <div className="bg-white rounded-xl border border-gray-200 p-6">
          <h2 className="text-base font-semibold text-gray-900 mb-1">Create your organization</h2>
          <p className="text-sm text-gray-500 mb-6">You can invite your team after setup.</p>
          <form onSubmit={handleSubmit} className="space-y-4">
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">Company name</label>
              <input
                type="text"
                placeholder="Company name  e.g. Acme Law LLP"
                value={name}
                onChange={e => handleNameChange(e.target.value)}
                required
                className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
              />
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">Slug</label>
              <input
                type="text"
                placeholder="acme-law-llp"
                value={slug}
                onChange={e => { setSlug(e.target.value); setSlugTouched(true) }}
                required
                className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-blue-500 text-gray-500"
              />
            </div>
            {error && <p className="text-sm text-red-600">{error}</p>}
            <button
              type="submit"
              disabled={submitting || !name.trim() || !slug.trim()}
              className="w-full py-2 px-4 bg-blue-600 text-white text-sm font-medium rounded-lg hover:bg-blue-700 disabled:opacity-50 disabled:cursor-not-allowed"
            >
              {submitting ? 'Creating…' : 'Create organization'}
            </button>
          </form>
        </div>
      </div>
    </div>
  )
}
