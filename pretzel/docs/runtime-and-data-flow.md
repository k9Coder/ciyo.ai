---
status: current
owner: extension
verified_at: 2026-06-13
sources:
  - pretzel/manifest.config.ts
  - pretzel/src/background/service-worker.ts
  - pretzel/src/content/content-script.ts
  - pretzel/src/content/overlay/WarningModal.tsx
  - pretzel/src/events/dispatch.ts
  - pretzel/src/scans/dispatch.ts
  - pretzel/src/audit/log.ts
  - pretzel/src/audit/types.ts
---

# Runtime and data flow

## Send path

```text
User click or Enter
  -> content adapter suppresses the host event
  -> content script reads the composer
  -> service worker checks authentication
  -> service worker loads and runs the local policy
  -> content script records the user's outcome locally
  -> adapter re-fires an approved send with a sentinel attribute
```

For `log`, including no findings, the send proceeds immediately. `warn` opens a modal with **Edit prompt** and **Looks fine, send it**. `block` opens the modal without a send-anyway action. Escape is equivalent to **Edit prompt**.

The overlay uses a closed Shadow DOM. The host page cannot access its internals through `shadowHost.shadowRoot`.

## Fail-open contract

The main content-script decision path returns `proceed: true` when:

- no composer is found;
- the composer text is empty or whitespace;
- the service-worker message, policy load, detection, or modal path throws.

Bootstrap failure leaves the page without interception. Malformed custom regex rules are skipped rather than failing the scan. These choices prioritize availability over guaranteed enforcement.

An adapter exception after it has already suppressed the host event is different: the adapter logs the error and does not automatically re-fire the send, so that individual send can remain stopped.

## Authentication and token priority

Backend calls and enforcement use the first available token:

1. `chrome.storage.managed.orgToken`
2. `chrome.storage.local.orgToken`
3. `chrome.storage.local.clerkSessionToken`

The managed token wins so a personal Clerk session cannot replace an enterprise token. The popup writes the Clerk token to local storage after a signed-in popup opens. The backend still authorizes every API request.

Without any token, the service worker returns an empty `log` result. The prompt proceeds, no rule events or scan-count request is sent, and a sign-in nudge appears on prompt counts 1, 11, 21, and so on. The content script still writes a local sent audit event for that result.

`adminToken` does not authenticate policy or event calls. It is used only with `orgToken` prefix checks to derive a display role.

## Data destinations

| Data | Destination | Notes |
|---|---|---|
| Full prompt | Detection engine in the service worker | Not posted by scan or event dispatch |
| Prompt hash | Local IndexedDB audit log | SHA-256 of normalized prompt; empty when unauthenticated or site-disabled |
| Findings and matched text | Local IndexedDB audit log | Includes rule metadata and matched snippets, not the full prompt |
| Scan count | `POST /v1/scans` | No request body |
| Warn/block event | `POST /v1/events` | Sends rule ID, action, and hostname when `reportLevel` permits |
| Exact matched term | `POST /v1/events` | Sent only for `reportLevel: rich` |
| Policy | Chrome local storage | Stored as `policyDoc` after schema validation |
| Runtime errors | Sentry, when `VITE_SENTRY_DSN_EXTENSION` is configured | Service-worker message type or content-script context/hostname may be attached |

Rule events are fire-and-forget. Only `warn` and `block` findings are eligible; `log` and `require_confirmation` findings are not posted. `minimal` and `medium` currently send the same fields. The `siteUrl` field contains only `location.hostname`.

The local audit database is named `promptshield_audit` for upgrade compatibility. Audit entries include the user's final decision. There is a pruning function, but no current runtime call schedules retention pruning.

## Scan-limit behavior

After detection, the service worker posts one scan-count request unless `scanLimitReached` is already true. A `402` from `/v1/scans` sets that flag; a later successful scan clears it. Detection and policy enforcement continue, and newly loaded pages show a scan-limit banner.
