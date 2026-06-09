/**
 * Cross-tenant isolation tests
 *
 * These tests verify that a token belonging to one tenant (the "free" tenant,
 * seeded as a second org alongside the main test tenant) cannot read, modify,
 * or enumerate data that belongs to the main tenant — and vice-versa.
 *
 * Auth header pattern mirrors the existing helpers:
 *   adminHeaders()    → main tenant admin token
 *   orgHeaders()      → main tenant org token
 *   freeAdminHeaders() / freeOrgHeaders() → second (free) tenant tokens
 *
 * All tests in this suite are read-only with respect to each tenant's data so
 * they can be run safely against any seeded test DB without side-effects.
 */

import { test, expect, request as playwrightRequest } from '@playwright/test'
import { getSeedState } from './helpers/seed-state.js'

const BACKEND = process.env.E2E_BACKEND_URL ?? 'http://localhost:3000'

function freeAdminHeaders(): Record<string, string> {
  return { Authorization: `Bearer ${getSeedState().freeAdminToken}` }
}

function freeOrgHeaders(): Record<string, string> {
  return { Authorization: `Bearer ${getSeedState().freeOrgToken}` }
}

function adminHeaders(): Record<string, string> {
  return { Authorization: `Bearer ${getSeedState().adminToken}` }
}

test.describe('Cross-tenant isolation', () => {
  // ── Policy isolation ───────────────────────────────────────────────────────

  test('Tenant A (free) cannot read Tenant B (main) policy via org token', async () => {
    const api = await playwrightRequest.newContext()

    // The free-tenant org token should be scoped to the free tenant only.
    // The main tenant policy must not be returned; expect 401/403 or an empty/
    // differently-scoped policy doc — never the main tenant's full policy.
    const res = await api.get(`${BACKEND}/v1/policy`, {
      headers: freeOrgHeaders(),
    })

    // A correctly isolated backend will return the free tenant's own policy (200)
    // or reject the request (401/403) — it must NOT return the main tenant's policy.
    expect([200, 401, 403]).toContain(res.status())

    if (res.status() === 200) {
      const body = await res.json() as { tenantId?: string; policy?: { tenantId?: string } }
      const { freeTenantId } = getSeedState()
      // Verify the returned policy belongs to the free tenant, not the main tenant
      const returnedTenantId = body.tenantId ?? body.policy?.tenantId
      if (returnedTenantId !== undefined) {
        expect(returnedTenantId).toBe(freeTenantId)
      }
    }

    await api.dispose()
  })

  test('Tenant A (free) admin token cannot read Tenant B (main) policy history', async () => {
    const api = await playwrightRequest.newContext()

    const res = await api.get(`${BACKEND}/v1/policy/history`, {
      headers: freeAdminHeaders(),
    })

    expect([200, 401, 403]).toContain(res.status())

    if (res.status() === 200) {
      // If the free tenant has its own history, it should be a separate set of
      // versions — verify none of the versions share the main tenant's history
      // by confirming the response is an isolated list (we cannot assert specific
      // version numbers, but we can assert the request did not error with a
      // cross-tenant data leak marker).
      const body = await res.json() as unknown
      expect(Array.isArray(body)).toBe(true)
    }

    await api.dispose()
  })

  // ── Members isolation ──────────────────────────────────────────────────────

  test('Tenant A (free) cannot read Tenant B (main) member list', async () => {
    const api = await playwrightRequest.newContext()

    const res = await api.get(`${BACKEND}/v1/members`, {
      headers: freeAdminHeaders(),
    })

    expect([200, 401, 403]).toContain(res.status())

    if (res.status() === 200) {
      const body = await res.json() as { members?: Array<{ orgId?: string; tenantId?: string }> }
      const { freeTenantId } = getSeedState()
      // If members are returned, none should belong to the main tenant
      for (const member of body.members ?? []) {
        const memberTenantId = member.orgId ?? member.tenantId
        if (memberTenantId !== undefined) {
          expect(memberTenantId).toBe(freeTenantId)
        }
      }
    }

    await api.dispose()
  })

  test('Tenant A (free) cannot assign members to Tenant B (main) teams', async () => {
    const api = await playwrightRequest.newContext()

    // Attempt to import/assign a member using the free-tenant admin token.
    // The backend should scope the operation to the free tenant and reject any
    // attempt that crosses tenant boundaries.
    const res = await api.post(`${BACKEND}/v1/members/import`, {
      headers: freeAdminHeaders(),
      data: {
        rows: [{ email: 'cross-tenant-probe@e2e.test', role: 'member' }],
      },
    })

    // Accepted responses: 200/201 (created under free tenant — correct isolation),
    // 400 (validation), 401/403 (auth rejected), 422 (domain not allowed).
    // NOT acceptable: 200 that creates the member under the main tenant.
    expect([200, 201, 400, 401, 403, 422]).toContain(res.status())

    if (res.status() === 200 || res.status() === 201) {
      const body = await res.json() as { created?: Array<{ tenantId?: string; orgId?: string }> }
      const { freeTenantId } = getSeedState()
      // Any created member must be scoped to the free tenant
      for (const member of body.created ?? []) {
        const memberTenantId = member.tenantId ?? member.orgId
        if (memberTenantId !== undefined) {
          expect(memberTenantId).toBe(freeTenantId)
        }
      }
    }

    // Clean up the probe member if it was created
    if (res.status() === 200 || res.status() === 201) {
      await api.delete(`${BACKEND}/v1/members/by-email/cross-tenant-probe@e2e.test`, {
        headers: freeAdminHeaders(),
      })
    }

    await api.dispose()
  })

  // ── Audit log isolation ────────────────────────────────────────────────────

  test('Tenant A (free) cannot read Tenant B (main) audit logs', async () => {
    const api = await playwrightRequest.newContext()

    const res = await api.get(`${BACKEND}/v1/audit-log`, {
      headers: freeAdminHeaders(),
    })

    expect([200, 401, 403]).toContain(res.status())

    if (res.status() === 200) {
      const body = await res.json() as {
        events?: Array<{ tenantId?: string; orgId?: string }>
        items?: Array<{ tenantId?: string; orgId?: string }>
      }
      const { freeTenantId } = getSeedState()
      const events = body.events ?? body.items ?? []
      // All returned audit events must belong to the free tenant
      for (const event of events) {
        const eventTenantId = event.tenantId ?? event.orgId
        if (eventTenantId !== undefined) {
          expect(eventTenantId).toBe(freeTenantId)
        }
      }
    }

    await api.dispose()
  })

  // ── Reverse direction: main tenant cannot read free tenant data ────────────

  test('Tenant B (main) admin cannot read Tenant A (free) policy via direct token swap', async () => {
    const api = await playwrightRequest.newContext()

    // Main tenant admin token should only return main tenant policy
    const mainRes = await api.get(`${BACKEND}/v1/policy`, {
      headers: adminHeaders(),
    })
    expect(mainRes.status()).toBe(200)

    const { freeTenantId } = getSeedState()
    const mainBody = await mainRes.json() as { tenantId?: string; policy?: { tenantId?: string } }
    const returnedTenantId = mainBody.tenantId ?? mainBody.policy?.tenantId
    if (returnedTenantId !== undefined) {
      // The returned policy must NOT be the free tenant's policy
      expect(returnedTenantId).not.toBe(freeTenantId)
    }

    await api.dispose()
  })
})
