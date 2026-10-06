import { useEffect } from "react";
import { useAuth } from "@clerk/chrome-extension";
import { ensureTenantSelected } from "@/auth/tenant";

/**
 * Persists the Clerk session JWT to chrome.storage.local['clerkSessionToken']
 * whenever the user is signed in. The background service worker reads that key
 * (policy/auth.ts → getAuthToken) to authenticate its policy-sync and API
 * calls; if no UI surface writes it, background sync silently has no token and
 * custom policy never reaches the extension.
 *
 * Both sign-in surfaces (popup and options/Account) must call this — sharing
 * one hook keeps them from drifting (previously only the popup wrote the key,
 * so signing in via the options page left background sync unauthenticated).
 */
export function usePersistSessionToken(): void {
  const { getToken, isSignedIn } = useAuth();

  useEffect(() => {
    if (!isSignedIn) return;
    void getToken().then((token) => {
      if (token) {
        void chrome.storage.local.set({ clerkSessionToken: token });
        void ensureTenantSelected(token); // resolve tenant for the X-Tenant-Id header
      }
    });
  }, [getToken, isSignedIn]);
}
