---
status: current
owner: extension
verified_at: 2026-06-17
sources:
  - pretzel/src/background/service-worker.ts
  - pretzel/src/background/update-check.ts
  - pretzel/src/realtime/backend-rest.adapter.ts
  - pretzel/src/policy/auth.ts
  - pretzel/src/policy/sync.ts
  - pretzel/src/policy/loader.ts
  - pretzel/src/policy/bridge.ts
  - pretzel/src/policy/schema.ts
  - pretzel/src/policy/defaults.ts
  - pretzel/tests/unit/policy/bridge.test.ts
  - pretzel/tests/unit/policy/sync.test.ts
---

# Policy sync and bridge

## Synchronization

On extension installation, the service worker calls `syncPolicy()` and creates a two-minute `policy-sync` alarm. Each alarm requests `GET /v1/policy/last-updates`. A newer remote timestamp triggers:

1. `GET /v1/policy/version`
2. no-op when the returned version equals `cachedPolicyVersion`
3. otherwise `GET /v1/policy`
4. Zod validation of `response.policy`
5. storage of `policyDoc`, `cachedPolicyVersion`, `subscriptionExpired: false`, and `syncedAt`

The manual `SYNC_NOW` message calls `syncPolicy()` directly.

## Offline and error behavior

- No auth token: synchronization does nothing.
- Network error or non-OK response: the cached policy remains unchanged.
- Invalid response policy: the response is discarded and the cached policy remains unchanged.
- No valid cached `policyDoc`: authenticated detection uses `DEFAULT_POLICY`.
- Valid cached `policyDoc`: detection bridges and uses it, including while offline.

A `402` from `/v1/policy/version` or `/v1/policy` sets `subscriptionExpired: true` but does not delete or disable the cached policy. A later successful full policy fetch clears the flag. Current enforcement does not consult `subscriptionExpired`.

`checkForUpdates()` writes the remote timestamp to `syncedAt` after `syncPolicy()` returns, even when the inner sync did not fetch or store a policy.

## Backend policy shape

The accepted backend document is version `1`:

```text
PolicyDoc
  tenantId
  subjects[]
    id
    name
    rules[]
      id, kind, keywords, pattern, destinations, action, isOverridable, message, reportLevel
  siteConfigs[hostname]
    inputSelector
    sendButtonSelector
```

Backend rule actions are limited to `warn` and `block`. Backend rule kinds are `keyword`, `pattern`, `entropy`, and `score`.

## Bridge behavior

Bridging is intentionally lossy:

| Backend input | Engine result |
|---|---|
| `keyword` | Case-insensitive dictionary rule using `keywords` |
| `pattern` | Pattern rule with flags `gi`, validator `none`, scope `all` |
| `entropy` | Fixed minimum length `24` and entropy `4.0` |
| `score` | Fixed seven-signal configuration, warn threshold `40`, confirmation threshold `70` |
| `message` | Rule description |
| `action` | Preserved as `warn` or `block`; severity becomes `medium` or `high` |
| `isOverridable` | Copied onto findings for modal bypass decisions |
| disabled-site list | Engine `perSite[hostname].enabled = false` |

A valid backend document produces an engine policy with `DEFAULT_POLICY.baseline` preserved and backend rules in `custom`. Therefore, once a backend policy is cached, tenant rules supplement the built-in default baseline instead of replacing it.

The bridge fixes `allowSendAnywayWithReason` to `false` and `auditRetentionDays` to `90`. Neither value currently controls the modal or schedules pruning.

## Fields not used for enforcement

- `reportLevel` does not affect local detection; event dispatch uses it separately.
- Subject IDs are not used by the engine.
- Rule names from the backend are unavailable; the engine name is composed from subject name and rule kind.
- `siteConfigs` is used only by the generic adapter and does not add manifest host permission.
- Managed schema key `promptshield_policy` is declared but is not read by the current policy loader; managed authentication reads only token keys.

`destinations` is enforced by the detection engine after bridging. Empty destinations apply to all supported AI sites. Configured hostnames match themselves and subdomains, but do not grant new host permissions.

## Site pause

The popup stores paused hostnames under `promptshield_site_overrides`. The loader bridges them into disabled engine sites. A disabled site returns an empty result before rule execution.
