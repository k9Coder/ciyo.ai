# Extension Upgrade: Request Interception Scope Review — Summary
**Date:** July 7, 2026
**Chair:** Ethan Cole (CEO)
**Attendees:** Marcus Webb (CTO), Yuki Tanaka (Extension Engineer), Omar Hassan (Detection Engineer), Ben Cho (PM)
**Purpose:** Scope the extension upgrade from UI-button watching to fetch/XHR request interception. Add failMode policy field. Estimate timeline.
**Full transcript:** [extension-upgrade-scope-review_2026-07-07_full_transcript.md](extension-upgrade-scope-review_2026-07-07_full_transcript.md)

---

## Summary

### Context

Current Pretzel enforcement intercepts at the UI layer — observing send-button clicks and Enter keypresses, then reading the textarea. This is the weakest possible interception point: fragile across UI updates, blind to programmatic sends, and provides no coverage of file uploads. The upgrade moves interception to the network layer within the browser via `window.fetch` and `XMLHttpRequest` overrides in content scripts.

This meeting scoped the work, resolved the key technical questions, and produced a 2-week spike estimate before full commitment.

---

## Key Decisions

**1. Adopt fetch/XHR override as the primary interception method.**
Content script overrides `window.fetch` and `XMLHttpRequest` before the page executes. The extension intercepts the actual request body, not the DOM state. More reliable, harder to bypass, and enables file upload scanning.

**2. Keep UI interception as a secondary signal.**
Button-click/Enter watching stays in place as a fallback trigger for edge cases where the request fires before the content script override is ready. Not removed — demoted.

**3. failMode field added to the compiled policy.**
New org-level field: `failMode: "open" | "closed"`. Controls extension behavior when no valid cached policy exists and the server is unreachable. Default: `"open"`. Enterprise customers can set `"closed"` via Console settings. The policy snapshot carries this field so it is enforced locally without a server round-trip.

**4. Dynamic host permissions: spike only, not in v1 scope.**
Allowing the AI assistant to add new servers dynamically via `optional_host_permissions` is technically feasible but introduces UX friction (per-host browser permission prompts). Yuki will prototype it in the spike. If the UX is acceptable, it ships in v2. Not a blocker for the fetch/XHR upgrade.

**5. File upload coverage: in scope for v1, text bodies only.**
Multipart form data (file upload payloads) will be parsed and the filename + MIME type inspected. Full file content scanning is deferred — requires binary detection capabilities Omar does not have ready. Filename/type is enough to catch "upload source code to ChatGPT."

---

## Spike Estimate

**2 weeks.** Yuki owns fetch/XHR override and host permission prototype. Omar owns detection pipeline adaptation for request-body input vs. DOM-text input. Ben writes the failMode UX spec for Console. Marcus reviews architecture before implementation begins.

Spike deliverable: working prototype + updated estimate for the full implementation sprint.

---

## Action Items

| # | Action | Owner | By |
|---|---|---|---|
| 1 | Begin fetch/XHR override prototype | Yuki | July 14 |
| 2 | Prototype optional_host_permissions flow | Yuki | July 14 |
| 3 | Adapt detection pipeline for request-body input | Omar | July 14 |
| 4 | Design failMode UX spec for Console settings | Ben | July 10 |
| 5 | Add `failMode` field to policy schema (backend) | Arjun (assigned by Marcus) | July 14 |
| 6 | Architecture review before implementation sprint | Marcus | July 14 |
| 7 | Spike review meeting | Marcus + Yuki + Omar | July 14 |
