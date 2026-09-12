import { API_BASE } from "@/shared/constants";

const EXTENSION_CLIENT_ID = "pretzel-extension";

function base64UrlEncode(bytes: ArrayBuffer | Uint8Array): string {
  const arr = bytes instanceof Uint8Array ? bytes : new Uint8Array(bytes);
  let binary = "";
  for (const b of arr) binary += String.fromCharCode(b);
  return btoa(binary).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
}

function randomBase64Url(byteLength: number): string {
  const bytes = new Uint8Array(byteLength);
  crypto.getRandomValues(bytes);
  return base64UrlEncode(bytes);
}

async function sha256Base64Url(input: string): Promise<string> {
  const digest = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(input));
  return base64UrlEncode(digest);
}

export interface DeviceAuthResult {
  token: string;
  tenantId: string;
}

/**
 * PKCE authorization-code flow that lets a user sign in to the extension via
 * any method the console supports (Google included) without Google's OAuth
 * server ever having to redirect to a chrome-extension:// URL directly --
 * that's structurally impossible (Google rejects the scheme outright).
 * launchWebAuthFlow's reserved https://<extension-id>.chromiumapp.org
 * redirect stands in for it instead, and the actual sign-in happens on a
 * normal https page (the console's /extension-login relay).
 *
 * Mirrors pretzel-desktop's electron/auth.ts flow (see
 * backend/src/desktop-auth and pretzel-console's DesktopLoginPage) but swaps
 * desktop's loopback HTTP server for chrome.identity.launchWebAuthFlow,
 * since an extension has no way to bind a local server.
 *
 * Safe to call directly from a popup click handler: Chrome keeps the calling
 * context alive for the duration of an in-flight launchWebAuthFlow call,
 * unlike a plain chrome.tabs.create (whose caller can vanish the moment the
 * popup loses focus).
 */
export async function signInWithDeviceAuth(): Promise<DeviceAuthResult> {
  const verifier = randomBase64Url(32);
  const challenge = await sha256Base64Url(verifier);
  const state = randomBase64Url(16);
  const redirectUri = chrome.identity.getRedirectURL("callback");

  const authUrl = new URL(`${API_BASE}/auth/extension/authorize`);
  authUrl.searchParams.set("client_id", EXTENSION_CLIENT_ID);
  authUrl.searchParams.set("response_type", "code");
  authUrl.searchParams.set("code_challenge_method", "S256");
  authUrl.searchParams.set("code_challenge", challenge);
  authUrl.searchParams.set("redirect_uri", redirectUri);
  authUrl.searchParams.set("state", state);

  const resultUrl = await chrome.identity.launchWebAuthFlow({
    url: authUrl.toString(),
    interactive: true,
  });
  if (!resultUrl) throw new Error("Sign-in was cancelled");

  const params = new URL(resultUrl).searchParams;
  const code = params.get("code");
  const returnedState = params.get("state");
  if (!code || !returnedState || returnedState !== state) {
    throw new Error("Sign-in failed — invalid response");
  }

  const res = await fetch(`${API_BASE}/auth/extension/token`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ code, code_verifier: verifier, redirect_uri: redirectUri }),
  });
  if (!res.ok) {
    const body = await res.json().catch(() => ({ error: "Sign-in failed" })) as { error?: string };
    throw new Error(body.error ?? "Sign-in failed");
  }
  return res.json() as Promise<DeviceAuthResult>;
}
