---
status: current
owner: backend
verified_at: 2026-06-17
sources:
  - ../src/policy/compiler.ts
  - ../src/policy/resolver.ts
  - ../src/policy/router.ts
  - ../src/policy/service.ts
  - ../src/rules/validation.ts
  - ../tests/policy-compiler.test.ts
  - ../tests/policy-resolver.test.ts
---

# Policy contract

Policies are immutable, versioned snapshots compiled from active authoring records. Publishing inserts the next tenant policy version and emits an in-process tenant-specific update event for connected SSE clients.

## Compiled snapshot

`POST /v1/policy/publish` stores this `PolicyDoc` shape in `policies.policy_json`:

```typescript
interface PolicyDoc {
  version: 1
  tenantId: string
  subjects: Array<{
    id: string
    name: string
    divisionId: string | null
    teamId: string | null
    rules: Array<{
      id: string
      kind: 'keyword' | 'pattern' | 'entropy' | 'score'
      keywords: string[] | null
      pattern: string | null
      destinations: string[]
      destinationGroupIds: string[]
      action: 'warn' | 'block'
      isOverridable: boolean
      message: string | null
      reportLevel: 'none' | 'minimal' | 'medium' | 'rich'
    }>
  }>
  siteConfigs: Record<string, {
    inputSelector: string
    sendButtonSelector: string
  }>
}
```

The inner `version: 1` is the policy document schema version. The separate database row `version` is the monotonically increasing publication version.

Rule `destinations` are normalized lowercase hostnames. Empty `destinations` means all supported AI sites. A configured hostname matches itself and its subdomains at enforcement time; it does not grant the extension permission to new sites. Publishing rejects warning rules with blank user-facing messages.

## `GET /v1/policy` envelope

```typescript
{
  version: number
  policy: PolicyDoc | ResolvedPolicy
  tenantName: string
  plan: string
  expiresAt: string | null
  warning?: 'subscription_expiring'
}
```

Deployment-token requests receive the complete compiled snapshot. Clerk-member requests receive a resolved member policy containing only applicable subjects and rules.

## Member resolution

Applicable subjects are global subjects plus subjects scoped to any of the member's teams and those teams' divisions.

Rules are deduplicated by detection identity:

- keyword: sorted keyword list
- pattern: pattern string
- entropy and score: rule kind

When duplicates collide, team scope overrides division scope, which overrides global scope. At the same scope, a `block` rule overrides a `warn` rule. Destination-group domains are expanded through tenant-scoped lookup and merged into `destinations`; resolved policies omit `destinationGroupIds`, scope IDs, `reportLevel`, and `siteConfigs`, while preserving `isOverridable`.

## Versioning and updates

- First publish creates version `1`; each later publish increments it.
- Rollback copies an old snapshot into a new highest version; it does not move a pointer backward.
- `GET /v1/policy/version` returns only the latest publication version.
- `GET /v1/policy/last-updates` returns the latest `publishedAt` epoch milliseconds, or `0`.
- Publishing and rollback notify same-process SSE listeners with an empty `data: {}` frame. This bus is process-local, not distributed across replicas.

## Subscription behavior

`GET /v1/policy` and `/policy/last-updates` reject cancelled tenants. Past-due tenants remain readable during their grace period and receive `warning: subscription_expiring`; after grace expiry they receive `402`.

Any change to this contract must be verified against backend policy tests and the extension/cross-service E2E suites.
