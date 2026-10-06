---
product: <package-name>
surface: <web | electron | chrome-extension>
type: <browser | app>
base_url: <local + staging + prod origins, or how to launch>
auth: <none | clerk-admin | clerk-member | device-token>
timebox_minutes: <total budget>
tags: [smoke, auth, ...]
verified_at: <YYYY-MM-DD>
---

# <Product> — QA Test Plan

One-paragraph description of the surface and what "working" means for it.

## Preconditions (whole suite)

- Environment, accounts, seed data, build artifacts required before any case.

## Cases

### <ID>-01 — <Title>
**Priority:** critical   **Timebox:** 3m   **Auth:** none
**Description:** what real user goal this proves.
**Preconditions:** case-specific state.
**Steps:**
1. Action.
2. Action.
**Expected:** observable pass condition.

<!-- repeat per case; keep IDs stable so reports and regressions can reference them -->
