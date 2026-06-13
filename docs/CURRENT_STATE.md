---
status: current
owner: repository
verified_at: 2026-06-13
sources:
  - backend/src/app.ts
  - pretzel/manifest.config.ts
  - pretzel-console/src/App.tsx
  - ciyo-web/app
  - e2e/playwright.config.ts
---

# Current State

## Implemented Product

- Pretzel intercepts prompts on ChatGPT, Claude, and Gemini.
- Detection runs locally using pattern, entropy, keyword/dictionary, and score rules.
- Pretzel Console manages organization structure, subjects/rules, destinations, sites, publishing, members, audit data, settings, and an AI-assisted policy editor.
- The Fastify backend provides tenant-scoped APIs, policy compilation/resolution, Clerk auth, internal tokens, PayPal billing, scans/events, analytics, audit logs, invites, and assistant actions.
- ciyo-web is the public marketing site.

## Runtime Model

- Admins edit configuration in the console and publish immutable policy snapshots.
- Console clients receive policy update notifications over SSE.
- The extension syncs policy on install and polls for updates every two minutes.
- Signed-in users receive a member-resolved policy; internal org-token requests receive the compiled tenant policy.
- Extension detection failures and unauthenticated prompts fail open.

## Deployment Model

- Backend: Docker image built in GitHub Actions, pushed to GHCR, deployed to Render.
- Console: Render static-site deploy hook.
- Website: Vercel Git integration, with a GitHub Actions lint/build check.
- Extension: production build attached to a GitHub Release, then manually uploaded to Chrome Web Store.

## Not Implemented

- ciyo-guard, proxy/daemon protection, and `@ciyo/detect` extraction are roadmap work.
- Arbitrary AI-site protection is not available; manifest-authorized hosts are required.
- Stripe code exists but Stripe routes/webhook registration are disabled.
- The marketing site contains claims that are not evidenced by repository implementation; see `ciyo-web/CONTENT_CLAIMS.md`.

## Documentation Rule

This file is a concise snapshot. Package docs and architecture/reference documents contain details. Known defects and mismatches belong in [KNOWN_ISSUES.md](KNOWN_ISSUES.md).
