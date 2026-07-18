---
status: current
owner: repository
verified_at: 2026-06-17
sources:
  - package.json
  - .github/workflows/e2e.yml
  - .github/workflows/backend-deploy.yml
  - docker-compose.yml
  - pretzel/src/policy/bridge.ts
  - pretzel/managed_schema.json
  - pretzel-console/nginx.conf
  - ciyo-web
---

# Known Issues

This register records current implementation and operations defects discovered while verifying documentation. It is not a historical review.

| Severity | Area | Type | Issue | Current impact | Owner |
|---|---|---|---|---|---|
| High | Root tooling | Implementation | Root scripts use recursive/filter pnpm commands but no `pnpm-workspace.yaml` exists. | Root `dev:*` commands are unreliable or invalid. | Marcus Webb |
| Medium | Deployment | Operations | Console and website provider auto-deploy settings must be disabled or protected outside GitHub to prevent bypassing the exact-SHA gate. | GitHub workflows now wait for same-SHA E2E checks, but provider-side settings still need operational confirmation. | Ryan Kowalski / Ethan Cole |
| High | Deployment | Risk | Backend deploy workflow deploys the image before running migrations and requires additive-only migrations. | A non-additive migration can break production during rollout. | Ryan Kowalski |
| Medium | Marketing | Documentation/product claim | Marketing claims are now constrained by an approval register and scanner, but production publication still requires owner/legal/security review. | Unsupported claim drift is reduced, not eliminated. | Priya Nair / David Park |
| Medium | Extension policy | Implementation | `perSite.defaultAction` and `auditRetentionDays` are parsed or documented but not fully enforced. | Admin expectations can differ from extension behavior for retention and default per-site actions. | Yuki Tanaka |
| Medium | Extension management | Implementation | Managed storage schema does not define the tokens read by extension auth. | Enterprise managed deployment may not authenticate as intended. | Yuki Tanaka |
| Medium | Extension privacy | Documentation/product claim | Local audit records include matched text and rich event reporting can transmit matched excerpts. | “No prompt content ever stored/sent” is inaccurate without qualification. | Yuki Tanaka / Noa Katz |
| Medium | Console Docker | Implementation | Compose maps console port `5173:80` while nginx listens on `8080`; CSP also blocks configured local API and some external services. | Docker full-stack console access/networking is broken. | Chloe Dubois / Ryan Kowalski |
| Medium | Console billing | Implementation | Console calls Stripe portal API while Stripe backend routes are disabled. | Stripe portal actions fail. | Chloe Dubois / Arjun Mehta |
| Low | Console navigation | Implementation | Implemented routes for destinations, sites, and publish are not present in sidebar navigation. | Features require direct navigation. | Chloe Dubois |
| Low | Website links/assets | Implementation | `/changelog` and referenced OG image are missing. | Broken links/previews. | Priya Nair |

## Maintenance

Remove an issue only after verifying the implementation/config change. Historical resolved findings may be moved to `docs/archive/completed-todos/`.
