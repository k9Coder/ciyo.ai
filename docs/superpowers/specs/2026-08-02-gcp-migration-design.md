---
status: draft
owner: repository
verified_at: 2026-08-02
sources:
  - docs/CURRENT_STATE.md
  - docs/ENVIRONMENT_AND_SECRETS.md
  - mykka-web/next.config.ts
  - backend/README.md
  - docs/archive/meetings/2026-06/production-readiness-review_2026-06-11_full_transcript.md
  - deploy/gcp/README.md (pre-existing draft scaffold, committed 2026-07-28, never executed)
  - docs/qa-findings-2026-08-01-action-items.md
---

# GCP Migration Design

## Goal

Move all hosted compute off Vercel + Render onto GCP, without exceeding **$10/month total hosting spend**, for both `staging` and `production` environments.

## Current state

| Piece | Today | Notes |
|---|---|---|
| `backend` (Fastify, Docker) | Render, prod+staging | Postgres via Drizzle, `DATABASE_URL`. Staging has no custom domain (`backend-staging-hejs.onrender.com`); prod is `api.mykka.ai` |
| `pretzel-console` (Vite SPA, served via nginx in Docker — `pretzel-console/Dockerfile` already exists) | Render, prod+staging | Prod: `pretzel-console.mykka.ai`. Staging: `pretzel-console-staging.onrender.com`, being migrated to a custom `staging-console.mykka.ai` per `docs/qa-findings-2026-08-01-action-items.md` |
| `mykka-web` (Next.js, `output: 'standalone'`) | Vercel, prod+staging | Not statically exportable — needs a Node server. Prod: `mykka.ai`. Staging: `staging.mykka.ai` |
| Postgres | **Neon free tier** (confirmed via archived production-readiness notes and `backend/.env.prod`) | Already external to Render/Vercel — no DB migration needed |
| Extension / desktop | GitHub Release + Vercel Blob | **Out of scope** — not part of this migration |

**Pre-existing scaffold:** `deploy/gcp/` (committed 2026-07-28, never executed — no GCP project exists yet) already contains Cloud Run service YAMLs for all three apps plus a budget-guard Cloud Function that strips public ingress once spend crosses a threshold. It targets a single environment and a $50 ceiling. This design extends it to two environments and lowers the ceiling to $10 — it does not replace it. All three apps stay on Cloud Run (including console, via the existing nginx Dockerfile) rather than introducing Firebase Hosting as a fourth deploy mechanism — reusing what's already built and tested beats adding a new tool for marginal free-tier gain on the console alone.

## Target architecture

| Piece | Target | Why |
|---|---|---|
| `backend` | Cloud Run, 2 services (`mykka-backend-staging`, `mykka-backend-prod`) | Scale-to-zero, free tier (2M req/mo, 360k vCPU-sec/mo) covers current pilot-level traffic at $0. Staging keeps using its default `*.run.app` URL — no custom domain, matching today's Render staging (no custom domain either) |
| `mykka-web` | Cloud Run, 2 services (`mykka-web-staging`, `mykka-web-prod`) | Same reasoning; `standalone` output already produces a Dockerizable Node server |
| `pretzel-console` | Cloud Run, 2 services (`mykka-console-staging`, `mykka-console-prod`) | Reuses the existing `pretzel-console/Dockerfile` (nginx-unprivileged serving the Vite build) and `deploy/gcp/console-service.yaml` — no new hosting mechanism needed |
| Postgres | **No change** — stays on Neon | Already free, already external. Neon branching can be adopted later for cheaper staging isolation if desired, but not required for this migration |
| Container images | Artifact Registry, single `mykka` repo (already specified in `deploy/gcp/README.md`), `us-central1` | One repo for all three apps' images, tagged per service; add a cleanup policy keeping only the last few images per service to stay near the 0.5GB free tier |
| Secrets | Secret Manager, per-environment secret names (e.g. `backend-database-url-staging` / `-prod`) | Free tier (6 active versions, 10k access ops/mo) covers our secret count comfortably across both envs |
| DNS | Unchanged registrar/DNS provider | Repoint `mykka.ai`, `api.mykka.ai`, `pretzel-console.mykka.ai`, `staging.mykka.ai`, `staging-console.mykka.ai` at Cloud Run domain mappings — no need to move to Cloud DNS |
| CI/CD | GitHub Actions (unchanged trigger model: push to `staging` → staging env, push to `master` → production env), authenticating via Workload Identity Federation (no long-lived service account keys) | Build → push to Artifact Registry → `gcloud run deploy`, replacing the current Render deploy-hook / API calls in `backend-deploy.yml` and `pretzel-console-deploy.yml`, and adding real deploy steps to `mykka-web-deploy.yml` (today it only lints/builds — Vercel's own Git integration does the actual deploy) |
| Budget enforcement | Existing `deploy/gcp/budget-guard` Cloud Function, retargeted at **$10** with threshold rules at 80%/100%, guarding all 6 Cloud Run services | Already built: on threshold breach it strips the public `allUsers` invoker binding (traffic stops, nothing is deleted), reversible via `budget-guard/restore.sh` |

## Cost estimate

At current pilot-level traffic (very low — confirmed with user), all of the above stays within GCP's always-free tiers even across 6 services (2 envs × 3 apps). Realistic total: **$0–3/month**, leaving headroom under the $10 cap for traffic growth or egress spikes, with the budget-guard function as a hard backstop if something runs away. The only line items with any inherent cost are Artifact Registry storage past 0.5GB (mitigated by a cleanup policy) and Secret Manager access past the free op count (won't happen at this scale).

## Rejected alternatives

- **Cloud SQL for Postgres** — cheapest instance alone is ~$8–10/mo; would consume the entire budget by itself. Moot anyway since Postgres already lives on Neon and doesn't need to move.
- **Firebase Hosting for the console** — considered initially, rejected in favor of reusing the console's existing Dockerfile/Cloud Run path already built in `deploy/gcp/`. Avoids introducing a fourth deploy mechanism for one service.
- **Rewriting the backend's data layer onto Firestore/Datastore** to use a GCP-native free tier — backend is built on Drizzle + Postgres with real migrations; this is a data-layer rewrite, not a hosting migration, and isn't justified by a budget constraint.
- **GKE (including Autopilot)** — real per-cluster costs beyond free tier; unnecessary complexity for 3 small services at pilot scale.
- **Single environment (no staging on GCP)** — considered (it's what the existing scaffold already does), rejected because the user wants staging+prod parity preserved from the current Render/Vercel setup.

## Migration order

1. **GCP foundation** — project, billing, budget + budget-guard retargeted to $10, Artifact Registry, Secret Manager, Workload Identity Federation for GitHub Actions. One-time, blocks everything else.
2. **mykka-web** (lowest risk — public marketing site, no auth/billing dependencies, easiest to verify visually), staging then prod.
3. **pretzel-console** (static, but depends on backend API being reachable for real functionality — deploy it, but full verification waits until backend is also live), staging then prod.
4. **backend** (highest risk — auth, billing, DB — migrate last, staging first, verify with e2e/manual QA before touching production).
5. **DNS cutover** per-service, after each piece is verified live on GCP.
6. **Decommission Render/Vercel services** only after DNS has been cut over and the GCP version has run clean for a few days.

## Open items / assumptions to confirm during implementation

- Region: `us-central1`, matching the existing `deploy/gcp/` scaffold.
- Pull current secret values (`DATABASE_URL`, `CLERK_SECRET_KEY`, `CLERK_WEBHOOK_SECRET`, `INTERNAL_SECRET`, etc.) from the Render dashboard / local `.env.prod` files at migration time — never hardcode them into the plan or scaffold files.
- `pretzel-console/.env.prod`'s `VITE_API_BASE` currently points at a stale `api.ciyo.ai` domain (pre-rebrand) — needs to be corrected to `api.mykka.ai` as part of this migration regardless of GCP, since it'd otherwise ship a broken prod console build.
