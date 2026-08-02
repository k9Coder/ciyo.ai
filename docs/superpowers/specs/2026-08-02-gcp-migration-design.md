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
---

# GCP Migration Design

## Goal

Move all hosted compute off Vercel + Render onto GCP, without exceeding **$10/month total hosting spend**, for both `staging` and `production` environments.

## Current state

| Piece | Today | Notes |
|---|---|---|
| `backend` (Fastify, Docker) | Render, prod+staging | Postgres via Drizzle, `DATABASE_URL` |
| `pretzel-console` (Vite static SPA) | Render static site, prod+staging | |
| `mykka-web` (Next.js, `output: 'standalone'`) | Vercel, prod+staging | Not statically exportable — needs a Node server |
| Postgres | **Neon free tier** (confirmed via archived production-readiness notes) | Already external to Render/Vercel — no DB migration needed |
| Extension / desktop | GitHub Release + Vercel Blob | **Out of scope** — not part of this migration |

## Target architecture

| Piece | Target | Why |
|---|---|---|
| `backend` | Cloud Run, 2 services (`backend-staging`, `backend-prod`) | Scale-to-zero, free tier (2M req/mo, 360k vCPU-sec/mo) covers current pilot-level traffic at $0 |
| `mykka-web` | Cloud Run, 2 services | Same reasoning; `standalone` output already produces a Dockerizable Node server |
| `pretzel-console` | Firebase Hosting, 2 sites (or 1 site + preview channel for staging) | Free tier (10GB storage, 360MB/day transfer) is plenty for a static SPA; no cold starts, simpler than Cloud Run for pure static assets |
| Postgres | **No change** — stays on Neon | Already free, already external. Neon branching can be adopted later for cheaper staging isolation if desired, but not required for this migration |
| Container images | Artifact Registry (single repo, `us-central1` or similar), with a cleanup policy keeping only the last N images | Avoids the complexity of Cloud Run pulling from a private GHCR; storage stays near/at the 0.5GB free tier with cleanup enabled |
| Secrets | Secret Manager | Free tier (6 active versions, 10k access ops/mo) covers our secret count comfortably |
| DNS | Unchanged registrar/DNS provider | Just repoint records (A/CNAME) to Cloud Run domain mappings and Firebase Hosting — no need to move to Cloud DNS |
| CI/CD | GitHub Actions (unchanged trigger model: push to `staging` → staging env, push to `master` → production env) | Build → push to Artifact Registry → `gcloud run deploy` / `firebase deploy`, replacing the current Render deploy-hook / API calls |

## Cost estimate

At current pilot-level traffic (very low — confirmed with user), all of the above stays within GCP's always-free tiers. Realistic total: **$0–3/month**, leaving headroom under the $10 cap for traffic growth or egress spikes. The only line items with any inherent cost are Artifact Registry storage past 0.5GB (mitigated by a cleanup policy) and Secret Manager access past the free op count (won't happen at this scale).

## Rejected alternatives

- **Cloud SQL for Postgres** — cheapest instance alone is ~$8–10/mo; would consume the entire budget by itself. Moot anyway since Postgres already lives on Neon and doesn't need to move.
- **Rewriting the backend's data layer onto Firestore/Datastore** to use a GCP-native free tier — backend is built on Drizzle + Postgres with real migrations; this is a data-layer rewrite, not a hosting migration, and isn't justified by a budget constraint.
- **GKE (including Autopilot)** — real per-cluster costs beyond free tier; unnecessary complexity for 3 small services at pilot scale.

## Migration order

1. **mykka-web** (lowest risk — public marketing site, no auth/billing dependencies, easiest to verify visually)
2. **pretzel-console** (static, no backend logic of its own, but depends on backend API being reachable — so do this after or alongside backend)
3. **backend** (highest risk — auth, billing, DB — migrate last, staging first, verify with e2e before touching production)
4. **DNS cutover** per-service, after each piece is verified live on GCP
5. **Decommission Render/Vercel services** only after DNS has been cut over and the GCP version has run clean for a few days

## Open items / assumptions to confirm during implementation

- Which GCP region — recommend a single region for all services to avoid cross-region egress; suggest `us-central1` unless the user has a latency reason to pick otherwise.
- Confirm Neon connection string still current (pull from Render dashboard's `DATABASE_URL` env var before decommissioning Render, since that's the current source of truth).
- GitHub Actions needs GCP Workload Identity Federation (or a service account key, less preferred) to auth to GCP — set up once per environment.
