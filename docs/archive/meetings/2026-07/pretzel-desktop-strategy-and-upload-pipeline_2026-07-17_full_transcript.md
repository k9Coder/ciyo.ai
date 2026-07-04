# pretzel-desktop Strategy Revision + File Upload Pipeline Simplification — Full Transcript
**Date:** July 17, 2026
**Chair:** Ethan Cole (CEO)
**Attendees:** Marcus Webb (CTO), Yuki Tanaka (Extension Engineer), Omar Hassan (Detection Engineer), Ben Cho (PM)

---

## Opening — Ethan

**ETHAN:** Two things that came out of the last two meetings that need correcting. First: the relationship between the extension and pretzel-desktop was left vague in the July 14 meeting. I've decided what it is. Second: the file upload scanning approach from yesterday is more complicated than it needs to be. I want to simplify it. Marcus, no new technical work to scope here — I'm telling you what the decisions are and you tell me if anything breaks.

---

## Part 1 — pretzel-desktop is a Replacement, Not a Companion

**ETHAN:** Here's the product decision. Users do not install both. They choose. If you're a developer who uses Claude Code and Cursor and Python scripts to call AI APIs — you install pretzel-desktop. It covers everything the extension covers plus the developer workflows. If you're a regular employee who uses ChatGPT in a browser — you install the extension. One or the other.

If someone installs both, that's their choice. Both will fire. They'll get two notifications for the same prompt. That's on them. We don't build deduplication logic, we don't try to detect the other client is present. Not our problem to solve.

**MARCUS:** That changes the pretzel-desktop scope. Currently it's designed as proxy-only — covering non-browser traffic. Under this decision, it also needs to intercept browser traffic. How does it do that?

**ETHAN:** Same way it intercepts everything else. It's a system proxy. Browser traffic goes through the system proxy. Pretzel-desktop already intercepts it.

**MARCUS:** Right. The OS proxy setting captures browser traffic too. So pretzel-desktop at the OS level already covers ChatGPT in Chrome, Claude in Firefox, everything. The extension adds nothing on top of that if pretzel-desktop is installed. The only reason to install the extension without pretzel-desktop is if you don't want to trust a local CA cert and set up a system proxy.

**ETHAN:** Exactly. That's the trade-off. Extension: easier install, no cert trust, browser-only. pretzel-desktop: harder install, system-level, covers everything. Users pick based on their situation. Most individual employees — extension. Developers and power users — pretzel-desktop.

**BEN:** What does the Console onboarding say? When an admin is setting up the org, do they push one or the other?

**ETHAN:** The Console shows both options. IT admins deploying via MDM will push pretzel-desktop — it covers more. Organizations that can't do MDM deploy the extension — it's a Chrome Web Store link, zero IT involvement. Ben, that's a product spec question for the onboarding flow. Figure it out. What I don't want is ambiguity in the product about what pretzel-desktop is. It's not an add-on. It's a full replacement.

**BEN:** Got it. I'll update the roadmap today and flag it in the Coverage Map spec — the Console distinguishes `pretzel-extension` clients from `pretzel-desktop` clients so admins can see which members are on which client.

**ETHAN:** Good. And pretzel-desktop's v1 scope now explicitly includes: everything the extension does, Claude Code hooks, IDE and API traffic via proxy, and file upload scanning. Not a narrower product than the extension — a broader one.

**MARCUS:** Understood. I'll update the architecture doc.

---

## Part 2 — File Upload Pipeline Simplification

**ETHAN:** Yesterday Yuki proposed magic bytes detection to identify file types regardless of extension. I understand why — a user could rename a file to evade detection. But let's be honest about our threat model. We're protecting against employees accidentally or carelessly sending sensitive data to AI tools. We are not protecting against employees who are actively trying to circumvent security and have the technical knowledge to rename a binary file convincingly. That's a different threat category. We can address it later.

So: drop magic bytes. Use the file extension. It's simpler, it covers the real threat, and it's faster to build and test.

**YUKI:** That simplifies the implementation significantly. I check the file extension, map it to a handler — text handler, PDF handler, DOCX handler, or skip — and go. No reading the first 512 bytes, no UTF-8 validity checking on arbitrary binary content. Clean.

**ETHAN:** Good. And PDF and DOCX are not v2. They're v1. They ship with the text file scanning. Same sprint.

**YUKI:** That's a meaningful scope change from yesterday. Adding pdfjs-dist and JSZip is extra work in this sprint. I can do it, but it adds roughly three to four days of implementation and testing.

**ETHAN:** I understand. Is three to four days within the sprint timeline?

**YUKI:** The sprint ends July 28. We started the fetch/XHR override work on July 7. That's three weeks. Text file scanning plus PDF plus DOCX in the same sprint is tight but doable if nothing else changes.

**ETHAN:** Nothing else is changing. Lock it. PDF and DOCX in v1.

**OMAR:** I want to flag one thing on the PDF and DOCX extraction. pdfjs-dist extracts text from PDFs but the quality depends on how the PDF was created. Scanned PDFs — where the content is an image of text — produce empty or garbage text extraction. No OCR means no content for us to scan. We'll silently fall through to filename-only detection for those. I'll document this limitation.

**ETHAN:** Acceptable. Scanned image PDFs are a phase 2 problem, and they'd require OCR which we've already ruled out. Document it.

**MARCUS:** DOCX: the JSZip approach reads `word/document.xml` and extracts paragraph text. Simple enough. But `.doc` files — old binary Word format — are not ZIPs and are not readable without a different library. We skip `.doc` files, filename only.

**ETHAN:** Fine. `.docx` yes, `.doc` no. Document it.

**YUKI:** What's the size limit? Yesterday we said 5 MB because we were excluding PDF and DOCX. With those in, some documents might be larger.

**ETHAN:** 10 MB. A 10 MB PDF is a big document. If it's larger than that, we're not scanning the content — filename and MIME type only. 10 is reasonable.

**YUKI:** Agreed. 10 MB it is.

---

## Part 3 — Images

**ETHAN:** Images: out of scope, phase 1. We've said this. I'm confirming it. `.png`, `.jpg`, `.gif`, `.webp`, everything visual — we check the filename and MIME type, we don't scan content. OCR is too heavy for the extension context and we're not building it for pretzel-desktop v1 either.

**OMAR:** Noted. The detection rule for image uploads would just be: if someone uploads a file with an image extension to an AI tool, log it. That's it. No content.

**ETHAN:** Right. Admins can write a policy rule that flags image uploads specifically if they want — that's just a filename pattern rule. The content inside the image is opaque to us for now.

---

## Part 4 — Confirming the Full Pipeline

**ETHAN:** Let me confirm the full file upload pipeline so everyone is aligned.

User uploads a file to ChatGPT. The fetch/XHR override intercepts the request. We read the filename and file extension. We check the size — over 10 MB, go to filename-only check. Under 10 MB:

If the extension is in the text-readable list — source code, config files, text files — we call `.text()` on the blob and run the detection engine on the result.

If the extension is `.pdf`, we run pdfjs-dist text extraction on the blob and run the detection engine on the result. If extraction produces empty text — scanned image PDF — we log the limitation and fall through to filename-only.

If the extension is `.docx`, we unzip with JSZip, extract `word/document.xml` paragraph text, and run the detection engine on the result.

If the extension is an image extension, we skip content scanning. Filename and MIME type only.

If the extension is anything else — unknown binary, `.doc`, video, audio — we skip content scanning. Filename and MIME type only.

**YUKI:** That's exactly what I'll implement.

**OMAR:** And the detection engine receives: the extracted text string, `inputType: "file"`, the original filename, and the MIME type. Same interface we defined yesterday.

**ETHAN:** Same for pretzel-desktop — it does the same file upload scanning when it intercepts a multipart upload through the proxy. Same pipeline, same libraries, same detection engine via `@ciyo/detect`.

**MARCUS:** Confirmed. Once `@ciyo/detect` is extracted, both the extension and pretzel-desktop import the same package and the file scanning logic lives there too, not duplicated in both clients.

**ETHAN:** Good. We're done.

---

## Action Items

| # | Action | Owner | By |
|---|---|---|---|
| 1 | Update pretzel-desktop architecture doc: standalone replacement, full extension parity + Claude Code + IDE + file upload | Marcus | July 21 |
| 2 | Update Console Coverage Map spec: `pretzel-extension` vs `pretzel-desktop` clientType, onboarding flow distinguishing the two | Ben | July 21 |
| 3 | Update roadmap doc: pretzel-desktop = standalone replacement, file upload in v1 | Ben | July 21 |
| 4 | Replace magic bytes check with file extension lookup | Yuki | July 28 |
| 5 | Implement PDF text extraction via pdfjs-dist (v1, not v2) | Yuki | July 28 |
| 6 | Implement DOCX text extraction via JSZip + XML parse (v1, not v2) | Yuki | July 28 |
| 7 | Raise size limit to 10 MB | Yuki | July 28 |
| 8 | Document: scanned image PDFs produce empty extraction, fall through to filename-only | Omar | July 28 |
| 9 | Document: `.doc` (binary Word) not supported, `.docx` only | Omar | July 28 |
| 10 | Update detection doc and runtime doc to reflect final file upload scope | Ben + Omar | July 28 |
| 11 | Ensure `@ciyo/detect` extraction includes file upload scanning pipeline for pretzel-desktop reuse | Marcus | Q3 sprint |
