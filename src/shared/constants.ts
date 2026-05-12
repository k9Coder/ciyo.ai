export const EXTENSION_NAME = "PromptShield";
export const EXTENSION_VERSION = "0.1.0";

/** Chrome storage keys */
export const STORAGE_POLICY_KEY = "promptshield_policy";
export const STORAGE_SITE_OVERRIDES_KEY = "promptshield_site_overrides";

/** IndexedDB */
export const AUDIT_DB_NAME = "promptshield_audit";
export const AUDIT_DB_VERSION = 1;
export const AUDIT_STORE_NAME = "events";

/** Sentinel attribute set on programmatically re-fired events to avoid recursion */
export const SEND_SENTINEL_ATTR = "data-promptshield-approved";

/** Snippet context window (chars either side of a match) */
export const SNIPPET_CONTEXT_CHARS = 20;
