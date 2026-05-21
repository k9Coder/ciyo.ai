# Org Onboarding — Self-Serve Organization Creation

**Date:** 2026-05-21
**Status:** Approved

## Summary

When a CISO signs up on the SafeInput admin panel, they need to create a Clerk organization before they can access the dashboard. Currently, users without an org hit the "Access Denied" screen. This spec defines a self-serve `/onboarding` route that lets any signed-in user create their organization — no gates, no manual intervention from SafeInput.

One organization per user account. The limit is enforced in the UI for now; can be moved to the backend later when multi-org support is introduced.

---

## Flow

1. CISO visits `admin.safeinput.com`
2. Not signed in → `RequireAuth` redirects to `/login` (Clerk SignIn — already exists)
3. Signs up or signs in via Clerk
4. `RequireAuth` checks for a Clerk org:
   - **Has org + `orgRole === 'org:admin'`** → proceed to dashboard (existing behavior)
   - **No org** → redirect to `/onboarding`
5. `/onboarding` page — branded, SafeInput-styled:
   - Company name field (required)
   - Slug field (auto-generated from company name, editable)
   - "Create organization" button
   - Calls Clerk's `createOrganization()` client-side
   - On success → redirect to `/`
6. Clerk fires `organization.created` webhook → backend auto-creates tenant + super_admin member row (already implemented)
7. CISO lands on dashboard, fully provisioned

---

## Code Changes

### 1. `admin/src/components/layout/RequireAuth.tsx`

Change the "no org" branch: instead of redirecting to `/unauthorized`, redirect to `/onboarding`.

```tsx
// Before
if (orgRole !== 'org:admin') return <Navigate to="/unauthorized" replace />

// After
if (!orgId) return <Navigate to="/onboarding" replace />
if (orgRole !== 'org:admin') return <Navigate to="/unauthorized" replace />
```

`orgId` comes from Clerk's `useAuth()` — already available. The unauthorized screen is kept for the case where someone is a member of an org but not an admin.

### 2. New `admin/src/pages/OnboardingPage.tsx`

- Requires sign-in (uses `useAuth` to guard) — if not signed in, redirect to `/login`
- If user already has an org, redirect to `/` (1-org limit enforcement)
- Form: company name + auto-generated slug (kebab-case from name, editable)
- Calls `useOrganization` / `createOrganization()` from `@clerk/react`
- Shows inline error if creation fails
- On success → `navigate('/')`

### 3. Router — add `/onboarding` route

Add the route in the app router (not wrapped by `RequireAuth`):

```tsx
<Route path="/onboarding" element={<OnboardingPage />} />
```

### 4. No backend changes needed

The `organization.created` webhook handler already creates the tenant and member rows. The `organizationMembership.created` webhook already sets the creator as `super_admin`.

---

## Edge Cases

| Scenario | Handling |
|----------|----------|
| User already has an org visits `/onboarding` | Redirect to `/` immediately |
| Org creation fails (Clerk error) | Show inline error message, keep form open |
| User not signed in visits `/onboarding` | Redirect to `/login` |
| Webhook fires but DB insert fails | Tenant missing — user will see access errors; retry on next sign-in (webhook retries from Clerk cover this) |

---

## Out of Scope

- Invite-based or waitlisted onboarding (deferred — open signup for now)
- Multi-org support (1 org per user, enforced in UI)
- Team member invite flow during onboarding (CISO can invite members from the Members page after setup)
- Onboarding checklist / guided setup wizard (future enhancement)
