import { PageHeader } from '../components/ui/PageHeader'
import { useTenant } from '../hooks/useTenant'

export function SettingsPage() {
  const { data: tenant, isLoading, isError } = useTenant()

  return (
    <>
      <PageHeader title="Settings" />

      <div className="bg-white border border-gray-200 rounded-xl p-6 space-y-4 max-w-lg">
        <h2 className="font-semibold text-gray-900">Organisation</h2>

        {isLoading && <p className="text-sm text-gray-400">Loading…</p>}
        {isError && <p className="text-sm text-red-500">Could not load tenant info.</p>}

        {tenant && (
          <dl className="space-y-3 text-sm">
            <div className="flex justify-between">
              <dt className="text-gray-500">Name</dt>
              <dd className="text-gray-900 font-medium">{tenant.name}</dd>
            </div>
            <div className="flex justify-between">
              <dt className="text-gray-500">Slug</dt>
              <dd className="text-gray-900 font-mono">{tenant.slug}</dd>
            </div>
            <div className="flex justify-between">
              <dt className="text-gray-500">Plan</dt>
              <dd className="text-gray-900 capitalize">{tenant.plan}</dd>
            </div>
            <div className="flex justify-between">
              <dt className="text-gray-500">Subscription status</dt>
              <dd className={`font-medium capitalize ${
                tenant.subscriptionStatus === 'active' ? 'text-green-600' :
                tenant.subscriptionStatus === 'past_due' ? 'text-yellow-600' : 'text-red-600'
              }`}>
                {tenant.subscriptionStatus.replace('_', ' ')}
              </dd>
            </div>
          </dl>
        )}
      </div>
    </>
  )
}
