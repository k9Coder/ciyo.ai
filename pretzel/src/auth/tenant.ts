import { API_BASE } from "@/shared/constants";

/**
 * Multi-tenant support for Clerk-authenticated users.
 *
 * Every invited member has (at least) two tenants: an auto-provisioned
 * personal tenant plus the org they joined. The backend requires an
 * explicit `X-Tenant-Id` header to disambiguate for these users — see
 * `buildAuthHeaders` in `@/auth/headers`.
 *
 * IMPORTANT: this module is only relevant on the Clerk-JWT auth path.
 * MDM/org-token (`ps_`) requests are tenant-implicit and must never carry
 * X-Tenant-Id — see `getAuthToken` in `@/policy/auth`.
 */

export interface TenantMembership {
  tenantId: string;
  tenantName: string;
  role: string;
}

interface MembershipsResponse {
  memberships: TenantMembership[];
}

const STORAGE_SELECTED_TENANT_KEY = "selectedTenantId";
const STORAGE_MEMBERSHIPS_KEY = "memberships";

// Debounce: avoid re-fetching memberships on every call site within this window.
const REFRESH_DEBOUNCE_MS = 60_000;
let lastEnsureAtMs = 0;
let inFlight: Promise<void> | null = null;

export async function getSelectedTenantId(): Promise<string | null> {
  const result = await chrome.storage.local.get(STORAGE_SELECTED_TENANT_KEY) as Record<string, unknown>;
  const v = result[STORAGE_SELECTED_TENANT_KEY];
  return typeof v === "string" ? v : null;
}

export async function setSelectedTenantId(id: string): Promise<void> {
  await chrome.storage.local.set({ [STORAGE_SELECTED_TENANT_KEY]: id });
}

async function clearSelectedTenant(): Promise<void> {
  await chrome.storage.local.remove([STORAGE_SELECTED_TENANT_KEY, STORAGE_MEMBERSHIPS_KEY]);
}

/**
 * Ensures a tenant is selected for the given Clerk JWT.
 *
 * - 0 memberships: clears any stored selection.
 * - 1 membership: auto-selects it.
 * - >1 memberships: selects the first and stores the full list so the UI
 *   can offer a switcher later.
 *
 * Debounced/cached so it doesn't hit the network on every request — callers
 * should invoke this on sign-in and on policy sync, not per-request.
 */
export async function ensureTenantSelected(token: string, options?: { force?: boolean }): Promise<void> {
  const existing = await getSelectedTenantId();
  const now = Date.now();
  if (!options?.force && existing && now - lastEnsureAtMs < REFRESH_DEBOUNCE_MS) return;
  if (inFlight) return inFlight;

  inFlight = (async () => {
    try {
      const res = await fetch(`${API_BASE}/v1/me/memberships`, {
        headers: { Authorization: `Bearer ${token}` },
      });
      if (!res.ok) return;
      const { memberships } = await res.json() as MembershipsResponse;

      if (!memberships || memberships.length === 0) {
        await clearSelectedTenant();
        return;
      }

      if (memberships.length === 1) {
        await chrome.storage.local.set({
          [STORAGE_SELECTED_TENANT_KEY]: memberships[0].tenantId,
          [STORAGE_MEMBERSHIPS_KEY]: memberships,
        });
        return;
      }

      // >1 memberships: select the first, store the full list for a future switcher UI.
      await chrome.storage.local.set({
        [STORAGE_SELECTED_TENANT_KEY]: memberships[0].tenantId,
        [STORAGE_MEMBERSHIPS_KEY]: memberships,
      });
    } catch {
      // Network error — leave any existing selection in place.
    } finally {
      lastEnsureAtMs = now;
    }
  })();

  try {
    await inFlight;
  } finally {
    inFlight = null;
  }
}
