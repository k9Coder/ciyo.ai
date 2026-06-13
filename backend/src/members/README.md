---
status: current
owner: backend
verified_at: 2026-06-13
sources:
  - router.ts
  - service.ts
  - ../teams
  - ../divisions
---

# Organization Membership

Members connect users to tenants and roles. Teams group members and belong to divisions. Policy resolution uses team and division membership to choose applicable subjects.

All assignment, removal, import, and role operations must verify tenant ownership.
