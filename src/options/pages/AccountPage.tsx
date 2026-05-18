import { useAuth, useUser, SignIn, SignOutButton } from "@clerk/chrome-extension";

export function AccountPage() {
  const { isLoaded, isSignedIn } = useAuth();
  const { user } = useUser();

  if (!isLoaded) return <div className="p-6 text-sm text-gray-500">Loading…</div>;

  if (!isSignedIn || !user) {
    return (
      <div className="flex justify-center py-8">
        <SignIn routing="hash" />
      </div>
    );
  }

  return (
    <div className="bg-white rounded-lg border border-gray-200 p-6 space-y-4">
      <div className="flex items-center gap-4">
        {user.imageUrl && (
          <img src={user.imageUrl} alt="Avatar" className="w-12 h-12 rounded-full" />
        )}
        <div>
          <p className="font-medium text-gray-900">{user.fullName ?? user.username ?? "—"}</p>
          <p className="text-sm text-gray-500">{user.primaryEmailAddress?.emailAddress}</p>
        </div>
      </div>
      <SignOutButton>
        <button className="px-4 py-2 text-sm font-medium text-red-600 border border-red-200 rounded-md hover:bg-red-50 transition-colors">
          Sign out
        </button>
      </SignOutButton>
    </div>
  );
}
