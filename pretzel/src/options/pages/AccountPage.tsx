import { useState } from "react";
import { useAuth, useUser, SignIn, SignOutButton } from "@clerk/chrome-extension";
import { PageLoader } from "../components/loading";
import { usePersistSessionToken } from "@/shared/usePersistSessionToken";
import { useExtensionAuth } from "@/shared/useExtensionAuth";
import { signInWithDeviceAuth } from "@/auth/deviceAuth";
import { CLERK_SYNC_HOST } from "@/shared/constants";

function GoogleIcon() {
  return (
    <svg width="16" height="16" viewBox="0 0 18 18" aria-hidden="true">
      <path fill="#4285F4" d="M17.64 9.2c0-.64-.06-1.25-.16-1.84H9v3.48h4.84c-.21 1.13-.84 2.09-1.8 2.73v2.27h2.92c1.7-1.57 2.68-3.88 2.68-6.64z" />
      <path fill="#34A853" d="M9 18c2.43 0 4.47-.8 5.96-2.18l-2.92-2.27c-.81.54-1.84.86-3.04.86-2.34 0-4.32-1.58-5.03-3.71H.96v2.33A9 9 0 0 0 9 18z" />
      <path fill="#FBBC05" d="M3.97 10.7A5.4 5.4 0 0 1 3.68 9c0-.59.1-1.17.29-1.7V4.97H.96A9 9 0 0 0 0 9c0 1.45.35 2.83.96 4.03l3.01-2.33z" />
      <path fill="#EA4335" d="M9 3.58c1.32 0 2.51.45 3.44 1.35l2.59-2.59C13.46.89 11.43 0 9 0A9 9 0 0 0 .96 4.97l3.01 2.33C4.68 5.16 6.66 3.58 9 3.58z" />
    </svg>
  );
}

export function AccountPage() {
  // Combined state (Clerk session OR a stored device token) decides whether
  // to show the sign-in view at all; Clerk's own useAuth/useUser below is
  // only consulted afterward to decide WHICH signed-in view to render, since
  // a device-token session never has a live Clerk session in this page.
  const { isLoaded, isSignedIn } = useExtensionAuth();
  const { isSignedIn: clerkSignedIn } = useAuth();
  const { user } = useUser();
  const [pending, setPending] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Persist the Clerk JWT so background policy sync is authenticated when the
  // user signs in here rather than through the popup. No-op for a
  // device-token session (isSignedIn is false from Clerk's own perspective).
  usePersistSessionToken();

  async function handleGoogleSignIn() {
    setError(null);
    setPending(true);
    try {
      const { token } = await signInWithDeviceAuth();
      await chrome.storage.local.set({ orgToken: token });
    } catch (err) {
      setError(err instanceof Error ? err.message : "Sign-in failed");
    } finally {
      setPending(false);
    }
  }

  async function handleDeviceSignOut() {
    await chrome.storage.local.remove("orgToken");
  }

  if (!isLoaded) return <PageLoader label="Authenticating" />;

  if (!isSignedIn) {
    return (
      <div className="flex flex-col items-center gap-4 py-8">
        {/* Without an explicit redirect target, Clerk falls back to "/"
            relative to the current origin — under chrome-extension://<id>/,
            that resolves to a path with no resource behind it, so the
            browser briefly shows ERR_FILE_NOT_FOUND right after a successful
            sign-in before the user reloads back to this page. */}
        {CLERK_SYNC_HOST ? (
          <div className="w-full max-w-[400px] overflow-hidden rounded-xl border border-gray-200 bg-white">
            {/* Google OAuth can't complete inside a Chrome extension page --
                Google's OAuth server rejects chrome-extension:// as a
                redirect scheme, full stop. This button runs the PKCE
                device-auth flow instead (@/auth/deviceAuth), via
                chrome.identity.launchWebAuthFlow, which lets the actual
                Google sign-in happen on a normal https page (the console's
                /extension-login relay) without ever leaving this tab. Sits
                inside the same card as <SignIn> below (its own
                border/shadow zeroed out via appearance) so it reads as one
                unified sign-in panel instead of two stacked boxes. */}
            <div className="border-b border-gray-200 p-4">
              <button
                onClick={() => void handleGoogleSignIn()}
                disabled={pending}
                className="flex w-full items-center justify-center gap-2 rounded-md border border-gray-300 px-4 py-2 text-sm font-medium text-gray-700 hover:bg-gray-50 transition-colors disabled:opacity-60 disabled:cursor-default"
              >
                <GoogleIcon />
                {pending ? "Signing in…" : "Continue with Google"}
              </button>
              {error && <p className="mt-2 text-xs text-red-600">{error}</p>}
            </div>
            <SignIn
              routing="hash"
              fallbackRedirectUrl={window.location.href}
              appearance={{
                elements: {
                  rootBox: { width: "100%" },
                  cardBox: { width: "100%", boxShadow: "none", border: "none" },
                  card: { width: "100%", boxShadow: "none", border: "none", borderRadius: 0 },
                  // Native inline social sign-in hits the same
                  // chrome-extension:// redirect rejection noted above.
                  socialButtonsBlockButton: "hidden",
                  dividerRow: "hidden",
                },
              }}
            />
          </div>
        ) : (
          // Dev/test key: no sync host, the extension origin is trusted
          // directly by Clerk and the native inline social button works as-is.
          <SignIn routing="hash" fallbackRedirectUrl={window.location.href} />
        )}
      </div>
    );
  }

  // Signed in via the device-token (Google) path -- no Clerk session exists
  // in this page's own JS context, so there's no `user` object to show.
  if (!clerkSignedIn || !user) {
    return (
      <div className="bg-white rounded-lg border border-gray-200 p-6 space-y-4">
        <p className="text-sm text-gray-500">Signed in with Google.</p>
        <button
          onClick={() => void handleDeviceSignOut()}
          className="px-4 py-2 text-sm font-medium text-red-600 border border-red-200 rounded-md hover:bg-red-50 transition-colors"
        >
          Sign out
        </button>
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
