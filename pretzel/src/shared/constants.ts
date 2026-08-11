import packageJson from "../../package.json";
import { env } from "../env";

export const EXTENSION_NAME = "mykka";
/** Single source of truth: version is read from package.json (also used by manifest.config.ts). */
export const EXTENSION_VERSION = packageJson.version;

/** Backend API */
export const API_BASE = env.VITE_API_BASE;
export const CLERK_PUBLISHABLE_KEY = env.VITE_CLERK_PUBLISHABLE_KEY;

/**
 * Clerk Sync Host — the web origin the extension syncs its Clerk session from.
 *
 * A Clerk PRODUCTION instance rejects sign-in from any origin that isn't the
 * instance domain (a `chrome-extension://` origin never qualifies), so the
 * popup can't auth itself directly. Instead the user signs in on the console
 * (a mykka.ai subdomain Clerk trusts) and the extension syncs that session via
 * `syncHost`. Only production needs this; a dev instance (pk_test) allows the
 * extension origin directly, so we leave syncHost undefined there.
 */
export const CLERK_SYNC_HOST = CLERK_PUBLISHABLE_KEY.startsWith("pk_live")
  ? "https://pretzel-console.mykka.ai"
  : undefined;

/**
 * Chrome storage keys — intentionally kept with promptshield_ prefix
 * to preserve existing users' stored policies and audit history on upgrade.
 */
export const STORAGE_POLICY_KEY = "promptshield_policy";
export const STORAGE_SITE_OVERRIDES_KEY = "promptshield_site_overrides";

/** IndexedDB — kept as-is to preserve existing audit history on upgrades */
export const AUDIT_DB_NAME = "promptshield_audit";
export const AUDIT_DB_VERSION = 1;
export const AUDIT_STORE_NAME = "events";

/** Sentinel attribute set on programmatically re-fired events to avoid recursion */
export const SEND_SENTINEL_ATTR = "data-mykka-approved";

/** Snippet context window (chars either side of a match) */
export const SNIPPET_CONTEXT_CHARS = 20;
