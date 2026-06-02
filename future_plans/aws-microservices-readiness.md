# AWS / Microservices Deployment Readiness Assessment
**Date:** 2026-06-02  
**Status:** Analysis only — no action required yet

---

## What We Have Today

Single-process **Fastify monolith** deployed on Railway via nixpacks.

| Aspect | Current State |
|--------|--------------|
| Runtime | Node.js ESM, single process |
| DB | Postgres + Drizzle ORM, one shared `db` singleton |
| Auth | Clerk JWTs + static `ps_*` org tokens |
| Storage | No filesystem state — all in DB |
| Config | 100% environment variables |
| Health check | `/health` endpoint exists |
| Logging | Fastify's built-in pino logger (basic) |
| Deployment | Railway (nixpacks, no Dockerfile) |
| AI | Anthropic / OpenAI / Groq — all via HTTP |
| Email | Nodemailer → SMTP |
| Payments | Stripe + PayPal webhooks (in-process) |

---

## Part 1: Ready for AWS? (Containerized Monolith)

Moving the **existing monolith** to AWS ECS/Fargate is a different, simpler question than microservices.

### What's Already Good

- Stateless process — no local disk writes, all state in Postgres
- Listens on `0.0.0.0:PORT` — container-friendly
- Config entirely via env vars — plugs straight into ECS task definitions or SSM Parameter Store
- `/health` endpoint — ALB health check ready
- Single DB connection string — straightforward to swap target

### Gaps Before AWS Containerization

**1. No Dockerfile**  
Only Railway nixpacks config exists (`railway.toml`). Need a multi-stage Dockerfile:
```
stage 1: node:20-alpine → npm ci → tsc build
stage 2: node:20-alpine → copy dist/ + node_modules → CMD node dist/index.js
```
This is ~20 lines of work.

**2. DB migrations run at build time (risk)**  
`railway.toml` runs `npm run db:migrate` as part of `buildCommand`. On AWS, that means every new deploy instance runs migrations — dangerous for rolling deployments. Migrations need to move to a pre-deploy job (ECS run-task or a GitHub Actions step that fires before the new task definition is activated).

**3. Structured logging for CloudWatch**  
Pino already outputs JSON by default — this is fine. But we don't have:
- Request-level `traceId` traveling through the full request lifecycle (noted in `docs/future_tasks.md` too)
- Error context enrichment (route, tenant, user)
- Log drain to CloudWatch or a managed logging service (Datadog, Logtail, etc.)

**4. Secrets management**  
All secrets live as raw env vars. On AWS, the pattern is SSM Parameter Store or Secrets Manager, with IAM roles pulling secrets at startup. Not a blocker but should be addressed before production.

**5. SMTP → SES**  
Nodemailer with external SMTP works, but on AWS the natural choice is SES (cost, deliverability, IAM-native). The email module (`billing/email.ts`) is already isolated — swapping the transport is a small change.

**Verdict: ~1–2 days of work to run on AWS ECS/Fargate.** This is low-risk and achievable now if needed.

---

## Part 2: Ready for Microservices?

**Short answer: No. And we probably shouldn't pursue it right now.**

Here's the honest breakdown of what microservices would require and what we're missing.

### The Core Problem: Shared Database

Every service (`analytics`, `assistant`, `events`, `scans`, `members`, `billing`, `policy`, etc.) imports the same `db` client and queries any table it wants. There is no ownership boundary — `analytics/service.ts` joins `events → rules → subjects` freely; `assistant/service.ts` reads divisions, subjects, rules, and teams in a single function.

For true microservices, each service must own its data. That means:
- Splitting the schema across per-service databases
- Replacing cross-service joins with inter-service API calls or event-driven reads
- Managing distributed transactions (or accepting eventual consistency)

This is a multi-week rewrite minimum, and the data ownership lines aren't obvious yet because we're pre-launch and the domain model is still evolving.

### Direct JS Imports Across Domain Boundaries

Services call each other via direct imports:
- `assistant/service.ts` → `divisions/service.ts`, `subjects/service.ts`, `rules/service.ts`
- `billing/stripe.ts` → `billing/service.ts` → `tenants/service.ts`
- `events/service.ts` → `rules` table directly

In microservices, these become HTTP/gRPC calls or event subscriptions. Every one of these is a latency, reliability, and operational cost addition.

### No Message Queue / Event Bus

Stripe webhooks, Clerk webhooks, and event ingestion are all handled synchronously in the same process. Microservices typically use a queue (SQS, RabbitMQ, Kafka) so the webhook receiver can return fast and processing happens async. We have none of this infrastructure.

### No API Gateway / Service Discovery

Microservices need a router in front of them. On AWS this is typically ALB path-based routing + ECS services per domain, or an API Gateway. We have a single flat Fastify prefix tree today.

### No Independent Deployability

If we split now, deploying the `analytics` service independently requires:
- Its own Docker image + ECR repo
- Its own ECS service + task definition
- Its own CI/CD pipeline
- Its own environment variables
- Coordinated schema migrations across services

Multiply by 10+ services.

### Table: Microservices Readiness

| Requirement | Status | Effort to Fix |
|------------|--------|---------------|
| Stateless compute | ✅ Ready | — |
| Config via env vars | ✅ Ready | — |
| Health checks | ✅ Ready | — |
| Independent data ownership | ❌ Shared DB | Weeks |
| Decoupled inter-service comms | ❌ Direct imports | Weeks |
| Async event backbone | ❌ None | Days–weeks |
| API gateway / routing | ❌ None | Days |
| Independent CI/CD per service | ❌ None | Days |
| Distributed tracing | ❌ None | Days |
| Structured logging + correlation IDs | ❌ Basic | Days |

---

## Part 3: Should We Do It?

### Containerized Monolith on AWS — Yes, when ready to leave Railway

If Railway becomes a cost or control problem (or if enterprise customers require data residency on AWS), moving the monolith to ECS/Fargate is straightforward. We can do it without changing a single line of application code. This is the right first step.

### Microservices — Not now, and maybe not ever

Microservices solve specific problems: independent team scaling, independent deploy cadence, extreme scale on specific hot paths, org-level isolation. We have none of these problems yet.

The overhead of microservices at this stage would:
- Slow feature velocity significantly
- Make debugging dramatically harder (distributed tracing, log correlation)
- Add infrastructure cost (multiple ECS services, ALBs, etc.)
- Require solving distributed transactions before we've even validated the product

**The industry consensus** (Martin Fowler's Microservices Premium, Amazon's own "start with a monolith" guidance) is that microservices make sense when you have a well-understood domain with stable boundaries AND a team large enough that service ownership is clearer than shared ownership. We have neither yet.

### The Right Architecture Path

```
Now                     6–12 months             12+ months (if needed)
──────────────────────────────────────────────────────────────────────
Railway monolith   →   AWS ECS Fargate      →   Extract hot paths only
                        (same codebase)          (e.g., events ingestion
                        + Dockerfile             as a separate service if
                        + SSM secrets            it's the bottleneck)
                        + SES email
                        + RDS Postgres
```

The middle step (containerized monolith on AWS) gives us:
- All the operational wins (auto-scaling, managed RDS, VPC isolation, IAM)
- Zero application rewrite
- Fast deploy iteration

If a specific service (most likely `events`/`scans` ingestion — high write volume from the extension) becomes a bottleneck, we extract *just that one* as a separate service at that point. We don't pre-split everything speculatively.

---

## Immediate Actionable Gaps (if AWS move is planned)

Priority order for the containerization path:

1. **Dockerfile** — multi-stage build, ~20 lines
2. **Migrations as pre-deploy step** — decouple from `npm run build`
3. **Request traceId** — add correlation ID to every log line (noted in future_tasks too)
4. **Secrets via SSM** — swap raw env vars at startup from Parameter Store
5. **SES for email** — swap Nodemailer SMTP transport for SES

None of these touch application logic. All of them are infrastructure/config plumbing.
