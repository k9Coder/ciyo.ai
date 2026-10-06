import { useEffect, useState } from "react";
import { useAuth } from "@clerk/chrome-extension";

/**
 * Combined signed-in state across both auth paths the extension supports:
 *
 *  - a live Clerk session (email/password sign-in, inline in this page) --
 *    @clerk/chrome-extension's own useAuth() reports this directly.
 *  - a stored device token (Google sign-in via the PKCE flow in
 *    @/auth/deviceAuth) -- this never establishes a Clerk session in this
 *    page's own JS context at all (the Clerk sign-in happens in a separate
 *    tab, the console's /extension-login relay), so useAuth() alone always
 *    reports signed-out for it. Reads chrome.storage.local directly instead,
 *    and reacts live via onChanged so the UI flips the instant
 *    signInWithDeviceAuth() finishes writing the token, no reload needed.
 *
 * `isLoaded` is true once both sources have reported in at least once.
 */
export function useExtensionAuth(): { isLoaded: boolean; isSignedIn: boolean } {
  const { isLoaded: clerkLoaded, isSignedIn: clerkSignedIn } = useAuth();
  const [deviceTokenLoaded, setDeviceTokenLoaded] = useState(false);
  const [hasDeviceToken, setHasDeviceToken] = useState(false);

  useEffect(() => {
    let cancelled = false;

    void chrome.storage.local.get("orgToken").then((result) => {
      if (cancelled) return;
      setHasDeviceToken(typeof result["orgToken"] === "string" && result["orgToken"].startsWith("pd_"));
      setDeviceTokenLoaded(true);
    });

    function onChanged(changes: Record<string, chrome.storage.StorageChange>, areaName: string) {
      if (areaName !== "local" || !("orgToken" in changes)) return;
      const next = changes["orgToken"]?.newValue;
      setHasDeviceToken(typeof next === "string" && next.startsWith("pd_"));
    }
    chrome.storage.onChanged.addListener(onChanged);
    return () => {
      cancelled = true;
      chrome.storage.onChanged.removeListener(onChanged);
    };
  }, []);

  return {
    isLoaded: clerkLoaded && deviceTokenLoaded,
    isSignedIn: Boolean(clerkSignedIn) || hasDeviceToken,
  };
}
