---
status: current
owner: architecture
verified_at: 2026-06-13
sources:
  - backend/src/app.ts
  - pretzel/src
  - pretzel-console/src/App.tsx
  - mykka-web/app
---

# Architecture Overview

mykka.ai is a modular monolith with browser enforcement.

```text
Pretzel Console -- Clerk JWT --> Fastify API --> PostgreSQL
       |                             |
       | SSE policy updates          | compiled policy snapshots
       v                             v
Pretzel Chrome extension <-- policy API / two-minute polling
       |
       +-- local prompt detection on ChatGPT, Claude, Gemini
       +-- scan/event reporting to backend

mykka-web is a separate public Next.js marketing site.
```

The backend is one Fastify process. Domain routers share one PostgreSQL database and direct TypeScript imports. Do not describe it as microservices.

See [Authentication](authentication.md), [Policy and enforcement](policy-and-enforcement.md), and [Data flows](data-flows.md).
