# Extension: Full File Upload Content Scanning — Feasibility and Scope — Full Transcript
**Date:** July 16, 2026
**Chair:** Ethan Cole (CEO)
**Attendees:** Marcus Webb (CTO), Yuki Tanaka (Extension Engineer), Omar Hassan (Detection Engineer), Ben Cho (PM)

---

## Opening — Ethan

**ETHAN:** Quick meeting. One question: can the extension scan the actual content of uploaded files, not just the filename? We said no in the July 7 scope review because Omar said binary detection isn't ready. I've been thinking about that and I want to pressure-test it. Yuki, when the fetch override intercepts a file upload — what exactly do we have?

---

## Part 1 — Yuki: What the Override Gives Us

**YUKI:** When a user uploads a file to ChatGPT or Claude, the browser sends a `multipart/form-data` POST request. The request body contains one or more `FormData` entries. Each file upload is a `File` object inside that `FormData`.

A `File` object is a `Blob` with a name and MIME type. To get the content, you call `.text()` on it — that gives you a UTF-8 string — or `.arrayBuffer()` for raw bytes. Both are async calls that resolve before we decide whether to let the request through.

So yes. We have the full file content. Not just the filename. The actual bytes, before they leave the browser.

**ETHAN:** So when we said "defer full file scanning" in the July 7 meeting — that was wrong?

**YUKI:** It was conservative rather than wrong. The bytes are available. The question is what we do with them. Omar's point was that the detection engine takes a string, and a lot of file formats aren't strings — they're binary. That part is accurate. But the implication that we can't do anything was too pessimistic.

**ETHAN:** Omar, explain the gap.

---

## Part 2 — Omar: What the Detection Engine Can and Can't Do

**OMAR:** The detection engine takes a UTF-8 string and runs rules against it. Pattern matching, entropy scoring, dictionary lookup — all of it operates on text. It has no concept of binary data.

For files that are already text, there is no gap. Source code files — Python, JavaScript, Go, Java, any programming language — are plain text. Config files — `.env`, YAML, TOML, JSON — are plain text. CSVs, shell scripts, SQL dumps — all plain text. You call `.text()` on the blob, you get a string, you run the detection engine. That's it. Nothing new needed on my side.

**ETHAN:** So an employee uploading their `.env` file to ChatGPT — we catch that in v1?

**OMAR:** Yes. The `.env` file is plain text. The existing entropy rules fire on API keys. The existing pattern rules fire on connection strings and secrets. We catch it.

**ETHAN:** What about source code archives — someone uploads their whole codebase as a zip?

**OMAR:** That's a binary format. A zip file is not text. If you call `.text()` on a zip blob you get garbage. To scan inside it, you need to unzip it first, then scan each text file inside. That requires a JavaScript zip library — JSZip is the standard one — and recursion through the entries.

That's v2. Not because it's impossible, but because it adds complexity and we need to get the simple case right first.

**ETHAN:** Understood. What about PDFs? A CISO is going to ask: what if someone uploads a document with confidential information?

**OMAR:** PDF is binary with text embedded. The text is readable but you need a parser to extract it. `pdfjs-dist` is Mozilla's PDF.js library — it's well-maintained, runs in browser contexts including service workers, and can extract text content from most PDFs. It's roughly 400 kilobytes added to the extension bundle.

It's feasible. It's not in the existing detection engine — Yuki would integrate it in the content layer, extract the text, then pass it to me. I run my existing rules on the extracted text. No engine changes.

**YUKI:** I want to test pdfjs-dist in the service worker context specifically before we commit. Service workers have memory limits and can be terminated. A large PDF could hit those limits. I'd do a research spike — load a 50-page PDF through pdf.js in a service worker, measure memory, confirm it doesn't cause the worker to crash or get killed by Chrome.

**ETHAN:** That's sensible. PDF goes to v2 pending that spike. Marcus, Word docs?

**MARCUS:** Same story. A `.docx` file is a ZIP archive containing XML files — the text content is in `word/document.xml`. You unzip it with JSZip, parse the XML, extract the paragraphs. It's more lines of code than the PDF case but technically simpler because there's no rendering engine involved. JSZip is around 100 kilobytes. v2, same sprint as PDF.

---

## Part 3 — Size Limits and Edge Cases

**ETHAN:** What's the size limit? If someone uploads a 2 GB video file to Claude, we're not scanning that.

**YUKI:** We check the file size before doing anything. I'd set the limit at 5 megabytes. Files over 5 MB: we check the filename and MIME type as we already planned, we don't attempt content scanning, and we log that the file exceeded the scan size limit.

5 MB covers the vast majority of sensitive text files. A source code file that's over 5 MB is an unusual edge case. Most `.env` files, config files, and code files are under 100 KB.

**ETHAN:** What's the rationale for 5 specifically — not 10, not 1?

**YUKI:** Service worker memory. A 5 MB text file in memory as a JavaScript string is around 10 MB of heap (UTF-16 encoding internally). The service worker has a finite heap — Chrome can terminate it if memory pressure is too high. 5 MB is conservative enough to be safe. We can revisit upward if we measure that 5 MB is fine in practice.

**OMAR:** Also: most of the attack surface we care about is small files. An API key is a few hundred bytes. A credentials file is a few kilobytes. A database dump of customer PII could be large, but a 5 MB CSV still contains a lot of rows — enough to trigger our rules if PII is present.

**ETHAN:** Fine. 5 MB. What else?

**YUKI:** File type detection. We should not rely on the file extension — a user can rename `credentials.json` to `image.jpg` before uploading. I want to read the first 512 bytes of every file and check magic bytes — the byte signatures that identify file formats regardless of name. If the magic bytes say it's a ZIP or PDF, we treat it as such regardless of the extension. If we can't determine the type from magic bytes, we try `.text()` and check if the result is valid UTF-8. If it is, we scan it as text. If it isn't, it's binary we can't parse — we fall back to filename and MIME type only.

**ETHAN:** Good. That's the right approach. Omar, does the detection engine need to know it's scanning a file rather than a prompt?

**OMAR:** It's useful context. I'd pass a flag — `inputType: "prompt" | "file"` — along with the filename and MIME type as metadata alongside the text. That lets me potentially apply different rules or thresholds for file content versus prompt text. For example, a rule that fires on a single high-entropy token might produce too many false positives on a minified JavaScript file — the whole thing is high-entropy. With the `inputType: "file"` flag I can tune that.

That's a small addition to the detection input interface. A few lines. Not a redesign.

**MARCUS:** That's clean. Make it part of the same PR as the file content scanning.

---

## Part 4 — Privacy and Audit

**ETHAN:** One thing I want locked before we ship this. If the extension is now reading full file content — including content that might be the company's most sensitive data — what do we store? What do we report?

**OMAR:** Same rules as today for prompt findings. A finding includes: rule ID, severity, action, matched text truncated to 200 characters, and offsets into the original text. We do not store the full file content. We do not send the full file content to the backend. If a rule fires on a credit card number in a CSV, the audit event contains the 200-character excerpt around that match — enough to understand what was found, not the whole file.

**ETHAN:** And the file content is never cached or persisted locally?

**YUKI:** No. The content is read into a JavaScript string, run through detection, and released when the detection result is returned. The garbage collector handles it. We do not write it to `chrome.storage` or `IndexedDB`. It lives only in the service worker memory for the duration of the detection call — which completes in milliseconds.

**ETHAN:** Good. Ben, add that to the spec explicitly. "File content is not stored or transmitted. Only matched excerpts up to 200 characters are included in audit events." That's going to be a question from every enterprise customer.

**BEN:** Already noting it. I'll put it in the detection documentation update and the privacy section of the extension's runtime doc.

---

## Part 5 — Decision

**ETHAN:** So where we land. Yuki, what ships in v1 — same sprint as the fetch/XHR upgrade?

**YUKI:** Text files: in. Source code, `.env`, `.csv`, `.json`, `.yaml`, `.xml`, `.sh`, `.sql`, `.md` — anything that reads as valid UTF-8 under 5 MB. Magic bytes check first, fallback to UTF-8 validity, size gate, then detection engine. That's the v1 file content scanning story.

**ETHAN:** And v2?

**YUKI:** PDF via pdfjs-dist, pending the service worker memory spike. DOCX and XLSX via JSZip plus XML extraction. ZIP archives with recursive text file scanning. All v2, next sprint after v1 ships.

**ETHAN:** Images?

**YUKI:** Out of scope entirely. OCR requires Tesseract.js at ~20 MB. That's bigger than the entire extension. Not happening in the extension. pretzel-desktop could do it natively in a future version but that's a separate conversation.

**ETHAN:** Agreed. Omar, you're confident the existing engine runs cleanly on file content text with just the `inputType` flag addition?

**OMAR:** Yes. The string normalization, pattern matching, entropy, and dictionary rules are format-agnostic. They operate on whatever text they receive. The only calibration I might do after seeing real data is tuning thresholds for specific file types — but that's post-ship, not a blocker.

**ETHAN:** We are done. This goes into the same sprint as the fetch/XHR upgrade — not a separate sprint, same deliverable. Yuki owns the content extraction and size gate. Omar owns the `inputType` flag and any threshold calibration. Ben updates the detection doc and adds the privacy language. Yuki does the PDF spike for v2 planning.

Marcus — anything from you before I close?

**MARCUS:** One thing. The detection call for a file is now potentially slower than for a prompt — we're reading blob content async before detection can start. The async read is fast for small files, but I want to make sure we're not inadvertently blocking the send for more than a second or two on larger files within our 5 MB limit. Yuki, add a timing measurement to the prototype so we know what the P95 detection latency looks like for a 4 MB text file.

**YUKI:** Will do. That goes in the spike review demo.

**ETHAN:** Good. Done.

---

## Action Items

| # | Action | Owner | By |
|---|---|---|---|
| 1 | Implement file content extraction in fetch/XHR override: magic bytes check, UTF-8 path, 5 MB size gate, unknown-binary fallback | Yuki | July 28 |
| 2 | Add `inputType: "prompt" \| "file"` plus filename/MIME metadata to detection input interface | Omar | July 28 |
| 3 | Wire file content string into detection engine pipeline | Omar | July 28 |
| 4 | Add P95 timing measurement for 4 MB file detection to spike demo | Yuki | July 28 |
| 5 | Update detection doc: file upload scanning scope, size limit, binary fallback, no-storage guarantee | Omar + Ben | July 28 |
| 6 | Add privacy language to extension runtime doc: file content not stored, 200-char excerpt limit in audit events | Ben | July 28 |
| 7 | pdfjs-dist service worker memory spike: load 50-page PDF, measure heap, confirm no worker termination | Yuki | August research spike |
| 8 | Spec v2 structured-format scanning sprint (PDF, DOCX, XLSX, ZIP) | Ben | August |
