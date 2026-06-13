# AWS Deployment Readiness

**Status:** Analysis only — no action required until we leave Railway  
**Decision:** Containerized monolith on ECS/Fargate is ~1-2 days of work. Microservices are not the right move pre-launch.

---

## What We Have Today

Single-process Fastify monolith on Railway via nixpacks. Stateless (all state in Postgres), config via env vars, `/health` endpoint exists — already container-friendly.

---

## Gaps Before AWS Move (containerized monolith path)

These are the only things blocking a Railway → ECS/Fargate migration. None touch application logic.

| # | Gap | Effort | Notes |
|---|-----|--------|-------|
| 1 | **No Dockerfile** | ~20 lines | Multi-stage: build → dist/ → slim runtime image |
| 2 | **Migrations run at build time** | Half day | Move `db:migrate` to a pre-deploy GitHub Actions step so rolling deploys don't each run migrations |
| 3 | **No request traceId** | Half day | Covered by the Logger System plan — add correlation ID per request |
| 4 | **Secrets via raw env vars** | Half day | Swap to SSM Parameter Store + IAM role at startup |
| 5 | **Email via Nodemailer SMTP** | Half day | Swap `billing/email.ts` transport to SES (IAM-native, better deliverability) |

### Recommended Architecture Path

```
Now                     6–12 months             12+ months (if needed)
──────────────────────────────────────────────────────────────────────
Railway monolith   →   AWS ECS Fargate      →   Extract hot paths only
                        (same codebase)          (e.g., events/scans
                        + Dockerfile             ingestion as a separate
                        + SSM secrets            service if bottleneck)
                        + SES email
                        + RDS Postgres
```

---

## Why NOT Microservices (yet)

- Shared DB — every service imports the same `db` client, cross-domain joins are everywhere
- Direct JS imports across domain boundaries (`assistant` → `divisions`, `subjects`, `rules`)
- No message queue / event bus — webhooks handled synchronously in-process
- Independent deployability requires per-service Docker images, ECR repos, ECS services, CI pipelines

**Rule of thumb:** Extract only when a specific service (likely `events`/`scans` — high write volume) becomes a measurable bottleneck. Don't pre-split speculatively.

---

## When to Action This

Trigger when one of these becomes true:
- Railway costs exceed ~$100/month
- Enterprise customer requires AWS data residency
- `events`/`scans` write volume causes query contention

Start with Task 1 (Dockerfile) — it unblocks everything else and has zero risk.
