---
status: current
owner: architecture
verified_at: 2026-06-13
sources:
  - pretzel/src/content/content-script.ts
  - pretzel/src/events/dispatch.ts
  - pretzel/src/audit
  - backend/src/events
  - backend/src/scans
---

# Data Flows

## Prompt Enforcement

1. A content script observes a send-button click or Enter without Shift.
2. The adapter reads the current prompt.
3. The service worker loads policy and runs local detection.
4. Clean prompts proceed; warn/block findings open the extension overlay.
5. Audit, scan-count, and configured event reports are dispatched separately.

Unauthenticated users and detection failures currently fail open.

## Policy Updates

- Console: backend publishes a policy event to an in-process event bus; SSE clients invalidate and refetch data.
- Extension: sync occurs on installation, then an alarm checks the remote update timestamp every two minutes and fetches changed versions.

## Stored And Transmitted Data

- Local audit records store prompt hash, length, decision, findings, and matched text; they do not store the complete prompt.
- Scan reporting sends aggregate scan counts.
- Event reporting can send matched excerpts when a rule uses rich reporting.
- Backend stores tenant configuration, policy snapshots, membership, analytics, scans/events, audit records, billing state, and assistant sessions.
