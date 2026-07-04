# pretzel-desktop Roadmap Planning — Full Transcript
**Date:** July 14, 2026
**Chair:** Ethan Cole (CEO)
**Attendees:** Marcus Webb (CTO), Ben Cho (PM), Alexei Petrov (Head of Security Research), Noa Katz (CISO)

---

## Opening — Ethan

**ETHAN:** Before we start — name change. We're calling it pretzel-desktop, not ciyo-guard. Pretzel is the brand. We have Pretzel the extension, we'll have pretzel-desktop the daemon, eventually pretzel-guard or pretzel-git or whatever comes next. Everything in the pretzel family. Ben, make sure the roadmap doc reflects this after this meeting.

Now. The extension is getting upgraded — fetch/XHR override, request interception in the browser. That meeting happened a week ago. This meeting is about the thing the extension can never be: a daemon that catches AI API calls that don't go through the browser at all. Cursor. Python scripts. Jupyter notebooks. Claude Code. Everything our developers are using that we have zero visibility into today.

Marcus, same two-minute state of play, then we go through scope.

---

## Part 1 — Marcus: What pretzel-desktop Is

**MARCUS:** pretzel-desktop is a compiled binary that runs as a local proxy on the user's machine. It sits between the user's applications and the internet. Every outbound HTTPS request from every application on that machine can pass through it.

When a request goes to a host in the policy — say, `api.anthropic.com` — the proxy intercepts it, decrypts the HTTPS, reads the request body, runs the detection engine against it, and either passes it through or blocks it. Then re-encrypts and forwards to the real server. From the application's perspective, the request went through normally. The detection happened in the middle.

This is called a TLS-intercepting proxy. It's the same architecture as enterprise network security tools — Zscaler, Netskope, Palo Alto Prisma. We're doing it locally on the device instead of in the cloud.

**ETHAN:** Noa, you know this architecture well. Any flags before we go further?

**NOA:** It's legitimate and widely deployed in enterprise. The key requirement is the certificate authority trust. For HTTPS interception to work, the proxy needs to decrypt TLS. It does that by acting as a man-in-the-middle — it presents its own certificate to the application, signed by a local CA that the OS trusts. If the OS doesn't trust our CA, every HTTPS connection through the proxy fails with a certificate error.

So the install flow is: pretzel-desktop generates a local root CA cert on first run, asks the user to trust it at the OS level, and then it works. On macOS, that's adding to the System Keychain. On Windows, that's adding to the Windows Certificate Store.

For consumer or SMB install: user clicks "Trust this certificate" during setup, done. For enterprise MDM deployment: the IT admin pre-distributes the cert via MDM policy before pretzel-desktop is even installed. By the time the app runs, the cert is already trusted. Seamless from the user's perspective.

**ETHAN:** What's the security risk of that cert existing on the machine?

**NOA:** If an attacker steals the private key for that CA cert, they can MITM any HTTPS connection the user makes, not just AI traffic. That's a serious risk. Mitigations: the CA private key never leaves the local machine, it's stored in the OS secure keychain (macOS Keychain, Windows DPAPI), and it's unique per installation — not a shared key we generate on our backend. Even if one machine is compromised, no other machine is affected.

I'll do a proper threat model with Tal. We need that before architecture finalization.

**MARCUS:** Agreed. Threat model is a prerequisite before we write the crypto code. That's an action item for this week.

---

## Part 2 — MVP Scope

**ETHAN:** Ben, you've had a week to think about scope. What's in and what's out for MVP?

**BEN:** I started from first principles. What does the enterprise buyer care about? They care about: "does it catch AI traffic my employees are sending from their dev tools, not just their browser?" The answer to that has to be yes from day one. Everything else is secondary.

So MVP in:

One — the proxy daemon itself, local loopback, sets the OS proxy automatically on install. The user doesn't configure anything. Install it, trust the cert, it works.

Two — HTTPS interception for all hosts in the compiled policy. When the policy says "monitor api.openai.com," the proxy monitors it. When the AI assistant adds a new host to a rule, the proxy picks it up on the next policy sync. No reinstall, no config change.

Three — detection engine running on request bodies. Same rules, same actions: log, warn, block.

Four — failMode parity. Same field as the extension. If policy is unavailable and failMode is "closed," block all outbound requests to monitored hosts until policy syncs.

Five — audit reporting. Same event schema as the extension. Console shows pretzel-desktop scans alongside extension scans. Coverage map shows which members have it installed.

Six — macOS and Windows x64. Not Linux for MVP.

MVP out:

Claude Code hook mode. We talked about this in June — hooks mode only covers Claude Code. The proxy covers everything. Hooks is a better install story for that specific use case but narrower coverage. We ship proxy first, add hooks in v2 when the proxy is stable.

Full file content scanning. Filename and MIME type on uploads, same as the extension upgrade. Not inside PDFs or archives yet.

MDM enterprise packaging. Silent install, pre-trusted cert, MSI/PKG. That's a Q4 stretch goal. MVP is manual install. Enterprise customers can pilot with manual install; MDM packaging is what makes it scalable for large rollouts.

**ETHAN:** Marcus, does that scope match your technical estimate?

**MARCUS:** Yes. One prerequisite the scope assumes: `@ciyo/detect` needs to be extracted from the extension into a shared package before pretzel-desktop can use the same detection engine. That extraction is the first engineering task. Yuki and Omar own it, I'm assigning them after this meeting.

**ETHAN:** How long is that extraction?

**MARCUS:** One sprint. Two weeks. Then pretzel-desktop can import the package and we don't have duplicate detection code to maintain.

---

## Part 3 — AI Assistant → New Server Flow

**ETHAN:** Walk me through the flow I care about most. Admin opens Console, asks the AI assistant "add monitoring for Mistral AI." What happens from that point to enforcement in pretzel-desktop?

**BEN:** Today's flow with the extension:

The AI assistant adds Mistral's API endpoints to the destination group in the policy. Admin reviews and publishes. The policy snapshot is compiled by the backend and includes the new host. The extension polls every two minutes, detects a version change, fetches the new snapshot, caches it locally. From that point, the extension needs a content script on that host — which requires either a manifest update or the optional_host_permissions flow we're prototyping.

With pretzel-desktop, the last step is different and better:

The policy snapshot now includes `api.mistral.ai` in the intercept list. pretzel-desktop polls, fetches, updates its in-memory intercept list. No reinstall. No permission dialog. No manifest change. The proxy just starts intercepting that host. Because it's OS-level, not per-tab, it works immediately for all applications.

That's the core advantage of the proxy over the extension for dynamic host coverage.

**ETHAN:** Alexei, from a threat intelligence standpoint — what do we need to cover at launch? What AI hosts matter most?

**ALEXEI:** The obvious ones are already covered by the extension: OpenAI, Anthropic, Google Gemini. For pretzel-desktop, the additional hosts that matter for developer AI workflows:

`api.anthropic.com` — Claude API, used by Cursor and any code that calls Claude directly.
`api.openai.com` — GPT-4 API, used by Copilot integrations, custom tooling.
`generativelanguage.googleapis.com` — Gemini API for non-browser use.
`api.mistral.ai` — growing adoption in European enterprises.
`api.cohere.com` — used in RAG pipelines.
`api.perplexity.ai` — less common but growing.
`huggingface.co/api` — self-hosted model endpoints proxied through HF.

I'd also flag: OpenAI-compatible endpoints. A lot of companies self-host models behind an OpenAI-compatible API. We should allow the policy to specify arbitrary hosts, not just a curated list. The AI assistant adding new servers is the right mechanism for those.

**ETHAN:** Ben, that's a spec requirement. The intercept list in the policy is not hardcoded — it's whatever the policy says. Arbitrary hosts.

**BEN:** Already in the spec. The compiled policy has a host list. pretzel-desktop intercepts anything on that list. The Console UI and AI assistant are how the admin manages the list. No hardcoded hosts in the daemon itself.

---

## Part 4 — failMode in pretzel-desktop

**ETHAN:** We added failMode to the extension upgrade scope. Same concept applies here, but the stakes are higher. If pretzel-desktop is in failMode "closed" and loses its policy cache — maybe the machine was offline for a week, cache expired — it blocks all AI traffic to monitored hosts. That could interrupt someone's entire development workflow, not just their ChatGPT tab.

Noa, what's your recommendation on default and on cache TTL?

**NOA:** Default fail-open, same as the extension. The CISO can flip to fail-closed for their organization. That's the right default — you don't want pretzel-desktop to become a denial-of-service tool by accident.

On cache TTL: I'd set a long TTL for the local cache — 7 days. If the machine has been offline for a week and the policy is 7 days old, that policy is probably still accurate. AI policy doesn't change by the hour. A week-stale policy is better than no policy. The cache only expires if the machine has had no network connectivity and the TTL passes. On reconnect, it syncs immediately.

For fail-closed customers specifically: if the cache expires and failMode is "closed," I'd recommend a grace period — say, 30 minutes of OS notifications before hard-blocking. Gives the user a chance to connect to the network and sync before their work is interrupted.

**MARCUS:** Grace period is a v2 feature. MVP is the binary: cache valid → enforce, cache expired → failMode determines outcome. We document the limitation. v2 adds grace period.

**NOA:** Agreed, that's reasonable.

**ETHAN:** Good. Cache TTL 7 days, default fail-open, grace period in v2. Ben, add to spec.

---

## Part 5 — Enterprise CISO Buyer Requirements

**ETHAN:** Noa, last thing from you. Pretzel-desktop is the product that unlocks the enterprise deal. The CISO buyer. What do they audit when they evaluate a local proxy agent?

**NOA:** Three categories.

First — the cert. They want to know: where is the CA private key stored? Is it per-device or centrally managed? Can the cert be rotated? What happens if the cert is compromised? Our answers: per-device, OS secure storage, rotation via reinstall, compromise of one device doesn't affect others. Those are good answers.

Second — data residency and what leaves the machine. They want to know: does the request body leave the machine? The answer is: the detection engine runs locally. Rule-match excerpts go to the backend only if the rule is configured for rich reporting. The full prompt body never leaves the machine. That's a strong answer — local detection is a selling point, not a limitation.

Third — the policy itself. Is the policy compiled and distributed by a central authority (us)? Yes. Can an employee tamper with the local policy to bypass detection? We need to think about this. If the cached policy file is on disk unprotected, a developer with admin rights can edit it. We need to sign the policy snapshot — the daemon verifies the signature before applying. Marcus, is that in scope for MVP?

**MARCUS:** It's not in the current scope but it should be. Policy signature verification is a security control, not a feature. I'd argue it's part of MVP. It's one field on the policy payload and an Ed25519 verify call on the daemon side. The backend already signs the snapshot — we just need the daemon to verify it.

**ETHAN:** Make it MVP. If a customer asks "can your employees bypass the policy by editing a local file" and the answer is "technically yes," that's a deal-stopper. Noa, add it to the CISO requirements checklist.

**NOA:** Done. The checklist will be ready by July 21 — full list of what enterprise CISO evaluations cover, so we can design pretzel-desktop to pass them on day one rather than retrofitting after the first lost deal.

---

## Part 6 — Timeline

**ETHAN:** Marcus. Timeline.

**MARCUS:** Q3 is the design sprint. Architecture doc, threat model, `@ciyo/detect` extraction, initial proxy scaffolding. By end of Q3 we have a working internal prototype — proxy runs locally, intercepts requests, detection fires.

Q4 is the build sprint. MVP features, platform testing on macOS and Windows, extension integration for coverage deduplication research, Console coverage map. MVP target is end of Q4.

That gives us pretzel-desktop MVP by end of 2026. Enterprise pilot customers in Q1 2027. MDM packaging and broader rollout in Q1-Q2 2027.

**ETHAN:** What's the risk to that timeline?

**MARCUS:** The `@ciyo/detect` extraction. If Yuki and Omar find the detection engine is more tightly coupled to the extension than we think, the extraction takes longer and blocks everything downstream. I'll know within two weeks of starting it.

Second risk: cert trust UX on Windows. macOS cert trust is well-understood. Windows Cert Store manipulation in an installer is finicky — sometimes requires elevation, sometimes triggers Windows Defender alerts depending on how it's packaged. I'd allocate a week of platform testing specifically for Windows cert trust before we call MVP done.

**ETHAN:** Noted. Those are the two risks I'll watch. Marcus, flag immediately if detect extraction slips — I'll reprioritize if needed.

One last thing. Ben, the roadmap document. Update it today: ciyo-guard is now pretzel-desktop everywhere. MVP scope matches what we decided in this room. Timeline is Q3 design, Q4 build. Don't let the old name sit in docs.

**BEN:** Done today.

**ETHAN:** Good. We're done.

---

## Action Items

| # | Action | Owner | By |
|---|---|---|---|
| 1 | Update roadmap doc: ciyo-guard → pretzel-desktop, MVP scope, Q3/Q4 timeline | Ben | July 16 |
| 2 | Extract `@ciyo/detect` shared package (detection engine out of extension) | Marcus assigns Yuki + Omar | Q3 sprint start |
| 3 | Architecture design doc: proxy daemon, CA cert, OS proxy config, policy sync, policy signature verification | Marcus | July 28 |
| 4 | Threat model: local proxy attack surface, CA cert theft, policy tamper vectors | Noa + Tal Ben-David | July 28 |
| 5 | Enterprise CISO evaluation checklist | Noa | July 21 |
| 6 | AI assistant → new server → proxy intercept list flow spec | Ben | July 21 |
| 7 | Console Coverage Map spec: per-member clientType + last sync | Ben | July 21 |
| 8 | failMode spec for pretzel-desktop: 7-day cache TTL, grace period as v2 | Ben | July 21 |
| 9 | Policy signature verification: add to MVP scope, confirm Ed25519 verify on daemon | Marcus | July 28 (architecture doc) |
| 10 | Windows cert trust UX research: elevation requirements, Defender behavior | Marcus | August research spike |
| 11 | MVP build sprint kickoff | Marcus | Q4 2026 |
