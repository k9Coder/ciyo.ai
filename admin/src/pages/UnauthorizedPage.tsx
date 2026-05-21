import { useClerk } from '@clerk/react'

export function UnauthorizedPage() {
  const { signOut } = useClerk()

  return (
    <div className="min-h-screen bg-gray-50 flex items-center justify-center px-4">
      <div className="text-center max-w-md">
        <div className="w-16 h-16 bg-red-100 rounded-full flex items-center justify-center mx-auto mb-4">
          <span className="text-red-600 text-2xl">⊘</span>
        </div>
        <h1 className="text-xl font-semibold text-gray-900 mb-2">Access denied</h1>
        <p className="text-sm text-gray-500 mb-6">
          Your account doesn't have admin permissions for this organization.
          Contact your organization owner to get access.
        </p>
        <button
          onClick={() => signOut()}
          className="text-sm text-blue-600 hover:text-blue-800"
        >
          Sign out
        </button>
      </div>
    </div>
  )
}
