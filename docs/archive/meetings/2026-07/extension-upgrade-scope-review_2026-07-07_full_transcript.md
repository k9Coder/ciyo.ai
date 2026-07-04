# Extension Upgrade: Request Interception Scope Review — Full Transcript
**Date:** July 7, 2026
**Chair:** Ethan Cole (CEO)
**Attendees:** Marcus Webb (CTO), Yuki Tanaka (Extension Engineer), Omar Hassan (Detection Engineer), Ben Cho (PM)

---

## Opening — Ethan

**ETHAN:** Let's keep this tight. We have one decision to make and one estimate to produce. The decision: do we upgrade the extension from button-watching to actual HTTP request interception, and what's in scope for v1. The estimate: how long does the spike take before we commit to the full sprint.

I've already made the business call that we're doing this — this meeting is about scope and timeline, not whether. So let's not relitigate the why. Marcus, give me the current state in two minutes.

---

## Part 1 — Marcus: Current State and Technical Direction

**MARCUS:** Current interception in Pretzel works like this. A content script watches for a send-button click or an Enter keypress without Shift. When it fires, an adapter reads the current prompt text from the DOM — from the textarea or contenteditable element. That text goes to the service worker, the detection engine runs against the policy, and we either let it through or open the overlay.

The problem is obvious: we're watching a UI event and reading a DOM element. If the site changes its button class, we miss it. If something sends a prompt programmatically without pressing Enter — an automation, a browser extension interacting with ChatGPT — we miss it. We have zero coverage of anything that isn't a human pressing a key.

The upgrade is to override `window.fetch` and `XMLHttpRequest` from the content script. We inject before the page runs. From that point, every outbound HTTP request on that tab goes through our override first. We read the request URL and body, run detection, and decide whether to allow or block before the bytes leave the browser.

**ETHAN:** Can we do this in MV3?

**MARCUS:** Yes. Content script injection via `document_start` runs before the page's own scripts. We override `window.fetch` and `XMLHttpRequest.prototype.open` at that point. The page scripts get our patched version. This is standard — it's how most ad blockers that do content-aware blocking work in MV3.

What we lose with MV3 compared to MV2: we can't use `webRequest` to block requests from the service worker. We have to do it from the content script side. That's fine — our detection runs locally anyway.

**ETHAN:** Yuki, any issues with that direction?

**YUKI:** No blockers. I've done XHR/fetch overrides before in MV3 context. The main thing to get right is the timing — `document_start` is critical. If we inject at `document_idle`, the page might have already made its first request. And we need to handle the case where the override itself fails to inject cleanly — that's a fail-open scenario we need to flag to the service worker.

**ETHAN:** Good. What stays from the current approach?

**MARCUS:** Button-click and keypress watching stays as a secondary signal. Think of it as belt-and-suspenders. The fetch override is the primary interceptor. The UI event is a fallback for edge cases — sites that do something unusual before the content script is fully active, or cases where we want to show a pre-submission warning in the UI before the request even fires. We don't remove the existing code; we demote it.

---

## Part 2 — Omar: Detection Pipeline Implications

**ETHAN:** Omar, what changes on your end?

**OMAR:** Two things. First, the input format changes. Today the detection engine receives a plain text string — the prompt text read from the DOM. With fetch interception, we receive a raw HTTP request body. That might be JSON (`{"messages": [{"role": "user", "content": "..."}]}`), multipart form data for file uploads, or occasionally plain text. We need to parse the body format before running detection rules.

For the JSON case — ChatGPT, Claude, Gemini all use JSON API formats — extraction is straightforward. We parse the JSON and pull the `content` field. The detection rules then run on that extracted text, same as today. No rule changes needed for the text case.

**ETHAN:** What about file uploads?

**OMAR:** File uploads are multipart form data. The body contains the file content as a binary blob plus a filename and MIME type. Full binary content scanning — scanning inside PDFs, Word docs, source code files — is not something our current detection engine does. That's a separate project.

What we can do in v1: inspect the filename and MIME type. If someone uploads `codebase.zip` or `credentials.json` to ChatGPT, we catch it by name and type. That's a real detection. It catches the obvious case — "employee uploaded a source code archive to an AI tool." It doesn't catch someone renaming `source_code.zip` to `vacation_photos.zip`, but it gets the unsophisticated case.

**ETHAN:** That's good enough for v1. Marcus, agreed?

**MARCUS:** Agreed. Full file content scanning is a future sprint. Filename + MIME type + size is the v1 file upload detection. We document it honestly in the detection capabilities.

**OMAR:** Second thing: performance. Today we run detection once per send event. With fetch interception we run on every outbound request to a monitored host. ChatGPT, for example, fires multiple API calls per conversation — streaming chunks, plugin calls, metadata calls. We need to filter to only the primary completion request, not every request.

I'll add a request filter — check the URL path against a known-request-type map for each host. We only run detection on paths that correspond to user-initiated completions. Everything else passes through without detection overhead.

**ETHAN:** What's the performance cost on detection itself?

**OMAR:** Negligible. Detection runs in microseconds on a typical prompt. The bottleneck has never been the detection engine — it's been the adapter reading the DOM. With the fetch body, we actually have a cleaner input, so it might be slightly faster. No concern there.

---

## Part 3 — failMode Policy Field

**ETHAN:** Next item. We're adding a failMode setting to the policy. This came out of a broader conversation about what happens when our server is down. Let me frame it: today, if the extension has no cached policy and can't reach the server — new install, cache wiped, server down — it fails open. Prompts go through without detection. That's fine as a default. But enterprise customers — specifically CISOs evaluating us for compliance-heavy environments — will ask: "what happens if your server goes down?" The answer "employees bypass detection" is not acceptable to them.

So we add a field: `failMode`. Two values: `"open"` or `"closed"`. Open means no policy available → prompts pass through, flag it in the audit log. Closed means no policy available → block all prompts to monitored hosts until policy is available. Default is open. Enterprise customers can flip it to closed in Console settings.

Important nuance Marcus pointed out before this meeting: the server being down does not normally break detection, because the policy is cached locally. failMode only triggers when there is genuinely no valid cached policy — new install without a successful first sync, or cache was wiped. That's rarer than "server down." But the capability still matters.

**BEN:** For the Console UX — this should be an org-level setting, admin-only, in the Organization Settings section. Not buried. CISOs look for this. I'd put it next to the "enforcement mode" section if we have one, or create that section. Label it clearly: "When policy is unavailable" with two radio options. I'll write the full spec this week.

**MARCUS:** The policy schema change is small. One new field on the compiled policy snapshot. Arjun can add it. The extension reads it from the cached policy and stores the value locally so it doesn't need the server to be up to enforce the setting — which is the whole point.

**ETHAN:** Arjun is not in this meeting — Marcus, you're assigning him?

**MARCUS:** Yes. I'll brief Arjun today. Backend schema change, Console setting field, extension reads from cache. One story, clear owner.

**ETHAN:** Good. failMode is in scope for the same sprint as the fetch/XHR upgrade. Not a separate sprint.

---

## Part 4 — Dynamic Host Permissions

**ETHAN:** Last item before the estimate. One of the open questions from the architecture discussion was: when the AI policy assistant adds a new rule for a new AI service — say someone asks the assistant to add a rule for Mistral's API — how does the extension actually enforce on that new host? Right now we have hardcoded host permissions in the manifest. Manifest changes require a Chrome Store re-review cycle, which takes days.

Yuki, what's the option here?

**YUKI:** `optional_host_permissions` in MV3. We declare a broad optional permission in the manifest — something like `*://*.ai/*` or a list of probable AI domains. The extension can request those permissions at runtime using `chrome.permissions.request`. The browser shows a one-time permission dialog to the user, they approve, and from that point the extension can inject content scripts and intercept requests on that new host.

The problem is UX. Every time the AI assistant adds a new host to the policy, the next time the extension syncs, it needs to prompt the user for permission on that host. If an admin adds three new AI services to the policy at once, the user gets three permission dialogs. That's annoying.

**ETHAN:** Can we batch it?

**YUKI:** Yes, you can request multiple hosts in one `chrome.permissions.request` call. The browser shows one dialog listing all of them. So one prompt per policy sync that adds new hosts. Better but still a UX consideration.

**ETHAN:** What's your recommendation?

**YUKI:** Prototype it in the spike. I want to see what the dialog actually looks like to a user before we commit. If it's clean, we ship it. If it's confusing, we defer and document the limitation — "new hosts require extension update." I don't want to scope it in and then pull it because the UX is bad.

**ETHAN:** Fair. Spike includes the prototype. Decision after spike review. Not in v1 scope until we've seen it.

---

## Part 5 — Spike Estimate

**ETHAN:** Marcus, Yuki, Omar — give me the spike estimate. Two weeks is what I said when I arranged this meeting. Is that right?

**YUKI:** Two weeks for the fetch/XHR override prototype and the optional_host_permissions prototype. That includes unit tests on the override, testing on all three current hosts (ChatGPT, Claude, Gemini), and documenting edge cases — race conditions on inject timing, sites that override fetch themselves.

**OMAR:** Two weeks for the detection pipeline adaptation — request body parser, JSON extraction for each host's API format, filename/MIME extraction for file uploads, and the request filter to avoid running detection on streaming chunks. Tests included.

**MARCUS:** Two weeks aligns. The spike deliverable is: working prototype on staging, updated estimate for the full implementation sprint, and a go/no-go on optional_host_permissions UX. We review on July 14.

**ETHAN:** Two weeks. July 14 spike review. Ben, failMode UX spec by July 10 so Arjun has it before the spike review. Marcus, you're briefing Arjun today on the policy schema change.

Everyone clear on their piece?

*(Room confirms.)*

**ETHAN:** Done. Let's move.

---

## Action Items

| # | Action | Owner | By |
|---|---|---|---|
| 1 | Begin fetch/XHR override prototype + tests | Yuki | July 14 |
| 2 | Prototype optional_host_permissions permission flow | Yuki | July 14 |
| 3 | Adapt detection pipeline: body parser, JSON extraction, file upload filename/MIME, request filter | Omar | July 14 |
| 4 | Write failMode UX spec for Console settings | Ben | July 10 |
| 5 | Brief Arjun on failMode policy schema field + Console setting | Marcus | July 7 (today) |
| 6 | Arjun: add failMode field to policy schema + Console setting | Arjun | July 14 |
| 7 | Architecture review sign-off before implementation sprint | Marcus | July 14 |
| 8 | Spike review meeting — prototype demo + updated estimate + optional_host_permissions go/no-go | Marcus, Yuki, Omar, Ethan | July 14 |
