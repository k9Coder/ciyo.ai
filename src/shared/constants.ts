export const EXTENSION_NAME = "SafeInput";
export const EXTENSION_VERSION = "2.0.0";

/** Backend API */
export const API_BASE = import.meta.env.VITE_API_BASE as string | undefined ?? "https://api.safeinput.ai";
export const CLERK_PUBLISHABLE_KEY = import.meta.env.VITE_CLERK_PUBLISHABLE_KEY as string;

/** Chrome storage keys
 * NOTE: promptshield_* keys kept for backwards-compatibility with existing installs.
 */
export const STORAGE_POLICY_KEY = "promptshield_policy";
export const STORAGE_SITE_OVERRIDES_KEY = "promptshield_site_overrides";

/** IndexedDB — kept as-is to preserve existing audit history on upgrades */
export const AUDIT_DB_NAME = "promptshield_audit";
export const AUDIT_DB_VERSION = 1;
export const AUDIT_STORE_NAME = "events";

/** Sentinel attribute set on programmatically re-fired events to avoid recursion */
export const SEND_SENTINEL_ATTR = "data-safeinput-approved";

/** Snippet context window (chars either side of a match) */
export const SNIPPET_CONTEXT_CHARS = 20;
