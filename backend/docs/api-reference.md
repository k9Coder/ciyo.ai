---
status: current
owner: backend
verified_at: 2026-06-13
sources:
  - ../src/app.ts
  - ../src/policy/router.ts
  - ../src/assistant/router.ts
  - ../src/billing/router.ts
  - ../src/platform/router.ts
  - ../src/webhooks/clerk.ts
  - ../src/divisions/router.ts
  - ../src/teams/router.ts
  - ../src/members/router.ts
  - ../src/subjects/router.ts
  - ../src/rules/router.ts
  - ../src/destination-groups/router.ts
  - ../src/site-configs/router.ts
  - ../src/events/router.ts
  - ../src/scans/router.ts
  - ../src/analytics/router.ts
  - ../src/audit-log/router.ts
  - ../src/tenants/router.ts
  - ../src/invites/router.ts
---

# API surface

The API listens on port `3000` by default. Unless noted, authenticated endpoints expect `Authorization: Bearer <token>`. Error responses use `{ "error": string }`; the global error handler returns an explicit service `statusCode` or `500`.

Auth labels:

- **Org**: `ps_live` or `ps_adm` tenant token, or a Clerk member JWT.
- **Admin**: `ps_adm` tenant token, or a Clerk JWT whose member role is `super_admin`.
- **Clerk**: Clerk JWT for an enrolled member.
- **Platform**: Clerk JWT for a user with `isPlatformAdmin=true`.
- **Public**: no bearer authentication.

## Service and policy

| Method | Path | Auth | Purpose |
|---|---|---|---|
| GET | `/health` | Public | Liveness response `{ ok: true }` |
| GET | `/v1/policy/version` | Org | Latest published version or `404` |
| GET | `/v1/policy` | Org + active subscription | Full or member-resolved policy envelope |
| GET | `/v1/policy/last-updates` | Org + active subscription | Latest publish time as epoch milliseconds |
| GET | `/v1/events?token=<clerk-jwt>` | Clerk query token | SSE policy-update notifications and 25-second heartbeats |
| POST | `/v1/policy/publish` | Admin | Compile and publish a new immutable policy version |
| GET | `/v1/policy/history` | Admin | Published versions, newest first |
| POST | `/v1/policy/rollback/:version` | Admin | Republish an old snapshot as a new version |

## Tenant administration

All endpoints in this section require **Admin** auth.

| Resource | Endpoints |
|---|---|
| Tenant | `GET /v1/tenant`; `PATCH /v1/tenant`; `POST /v1/tenant/rotate-org-token`; `POST /v1/tenant/rotate-admin-token` |
| Divisions | `GET, POST /v1/divisions`; `PATCH, DELETE /v1/divisions/:id` |
| Teams | `GET, POST /v1/divisions/:divisionId/teams`; `PATCH, DELETE /v1/teams/:id`; `GET /v1/teams/:teamId/members` |
| Members | `GET, POST /v1/members`; `POST /v1/members/import`; `PATCH, DELETE /v1/members/:id`; `POST /v1/members/:id/teams`; `POST, DELETE /v1/members/:id/teams/:teamId` |
| Subjects | `GET, POST /v1/subjects`; `PATCH, DELETE /v1/subjects/:id`; `GET /v1/subjects/:subjectId/versions` |
| Rules | `GET, POST /v1/subjects/:subjectId/rules`; `PATCH, DELETE /v1/rules/:id` |
| Destination groups | `GET, POST /v1/destination-groups`; `PATCH, DELETE /v1/destination-groups/:id` |
| Site configs | `GET, POST /v1/site-configs`; `PATCH, DELETE /v1/site-configs/:domain` |

Important constraints:

- A subject is global when `divisionId` and `teamId` are absent, division-scoped with `divisionId`, and team-scoped with `teamId`.
- Rule kinds are `keyword`, `pattern`, `entropy`, or `score`; actions are `warn` or `block`; report levels are `none`, `minimal`, `medium`, or `rich`.
- Rule creation enforces plan rule-kind limits. Rule patch currently does not repeat that plan check.
- Member import inserts role `member` and ignores tenant-email conflicts. Creating one member enforces seat limits; bulk import currently does not.

## Telemetry and analytics

| Method | Path | Auth | Purpose |
|---|---|---|---|
| POST | `/v1/events` | Org | Record a rule match; returns `204` when the rule is not reportable |
| POST | `/v1/scans` | Org | Record a scan; returns `402 scan_limit_reached` at the plan limit |
| GET | `/v1/analytics/summary?days=7|30|90` | Admin | Aggregate summary; invalid `days` becomes `30` |
| GET | `/v1/analytics/daily` | Admin | Daily series |
| GET | `/v1/analytics/incidents` | Admin | Recent incidents |
| GET | `/v1/analytics/top-sites?days=7|30|90` | Admin | Site ranking |
| GET | `/v1/analytics/by-subject?days=7|30|90` | Admin | Subject grouping |
| GET | `/v1/audit-log?limit=&before=&action=` | Admin | Event log; max limit `100`, default `50` |

## Assistant, invites, and billing

| Method | Path | Auth | Purpose |
|---|---|---|---|
| POST | `/v1/assistant/chat` | Admin + assistant-enabled plan | Ask the configured LLM for proposed actions |
| POST | `/v1/assistant/apply` | Admin | Apply one assistant message once |
| POST | `/v1/assistant/messages/:messageId/revert` | Admin | Restore pre-apply subject snapshots |
| GET | `/v1/assistant/sessions` | Admin | Latest 50 tenant sessions |
| GET | `/v1/assistant/sessions/:id/messages` | Admin | Session messages and revert flags |
| POST | `/v1/invites` | Admin | Create an invite link |
| GET | `/v1/invites/:token` | Public | Preview an invite |
| POST | `/v1/invites/:token/accept` | Clerk | Accept an invite |
| POST | `/v1/billing/free-signup` | Public | Create a free tenant and deployment tokens |
| POST | `/v1/billing/paypal/checkout` | Public | Create a PayPal approval URL |
| GET | `/v1/billing/status` | Admin | Usage, limits, provider, and feature flags |
| POST | `/webhooks/paypal` | PayPal signature | Update subscription state |
| POST | `/webhooks/clerk` | Svix signature | Synchronize user lifecycle |

Stripe checkout, portal, and webhook routes are disabled and return `404`.

## Platform administration

Every `/platform/v1/*` route requires **Platform** auth:

- `GET /platform/v1/tenants`
- `GET /platform/v1/tenants/:tenantId`
- `GET, POST /platform/v1/tenants/:tenantId/members`
- `PATCH, DELETE /platform/v1/tenants/:tenantId/members/:memberId`
- `GET /platform/v1/tenants/:tenantId/divisions`
- `GET /platform/v1/tenants/:tenantId/subjects`
