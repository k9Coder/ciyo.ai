import { getSelectedTenantId } from "./tenant";

/**
 * Builds the Authorization (+ optional X-Tenant-Id) headers for an
 * authenticated backend call.
 *
 * X-Tenant-Id is attached only when:
 *   (a) the token is a Clerk JWT — NEVER for org tokens (`ps_...`), which
 *       are tenant-implicit on the backend, and
 *   (b) a tenant has actually been selected (see `@/auth/tenant`).
 *
 * Centralising this avoids re-implementing the same ternary at every
 * fetch call site.
 */
export async function buildAuthHeaders(token: string): Promise<Record<string, string>> {
  const headers: Record<string, string> = { Authorization: `Bearer ${token}` };

  if (!token.startsWith("ps_")) {
    const tenantId = await getSelectedTenantId();
    if (tenantId) headers["X-Tenant-Id"] = tenantId;
  }

  return headers;
}
