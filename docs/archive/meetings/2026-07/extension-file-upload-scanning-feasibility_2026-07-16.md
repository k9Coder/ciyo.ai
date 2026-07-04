# Extension: Full File Upload Content Scanning — Feasibility and Scope — Summary
**Date:** July 16, 2026
**Chair:** Ethan Cole (CEO)
**Attendees:** Marcus Webb (CTO), Yuki Tanaka (Extension Engineer), Omar Hassan (Detection Engineer), Ben Cho (PM)
**Purpose:** Determine whether the extension can scan full file content (not just filename/MIME type) on upload, and scope what ships in v1.
**Full transcript:** [extension-file-upload-scanning-feasibility_2026-07-16_full_transcript.md](extension-file-upload-scanning-feasibility_2026-07-16_full_transcript.md)

---

## Summary

### Context

The July 7 scope review capped file upload detection at filename and MIME type, deferring full content scanning on the grounds that "binary detection capabilities" were not ready. This meeting revisited that decision with better information: the fetch/XHR override gives the extension access to the raw file bytes, not just metadata. The question is what we can actually do with those bytes.

---

## Key Findings

**Full file content scanning IS possible in the extension.** When the fetch/XHR override intercepts a file upload request, the intercepted `FormData` body contains `File` objects (which are `Blob`s). Calling `.text()` or `.arrayBuffer()` on those blobs gives the full file content before it leaves the browser. This is available in the content script context.

**The existing detection engine runs on strings.** Any file whose content can be extracted as a UTF-8 string goes straight into the existing pattern, entropy, and dictionary rules — no engine changes required. Source code, config files, CSVs, JSON, YAML, shell scripts all qualify.

**Structured binary formats (PDF, DOCX) require parser libraries.** Feasible but adds bundle size. The service worker context supports these libraries.

**Images require OCR.** Tesseract.js is ~20MB. Not practical for an extension. Out of scope entirely.

---

## Scope Decision

### v1 — Ships with the fetch/XHR upgrade sprint

| File type | Method | Status |
|---|---|---|
| Plain text (`.txt`, `.md`, `.csv`, `.env`, `.sh`) | `.text()` → existing engine | In scope |
| Source code (`.py`, `.js`, `.ts`, `.go`, `.java`, etc.) | `.text()` → existing engine | In scope |
| JSON / YAML / TOML / XML | `.text()` → existing engine | In scope |
| Files > 5 MB | Skip content scan, flag filename only | In scope (size gate) |
| Unknown binary (magic bytes check fails) | Skip, flag filename only | In scope |

### v2 — Follow-up sprint

| File type | Method | Status |
|---|---|---|
| PDF | `pdfjs-dist` text extraction → existing engine | v2 |
| Word (`.docx`) | JSZip + XML parse → existing engine | v2 |
| Excel (`.xlsx`) | SheetJS text extraction → existing engine | v2 |
| ZIP archives | Recursive unzip + scan text entries | v2 |
| Images | Out of scope (OCR too heavy for extension) | Never |

---

## Key Constraints Agreed

- **Size limit: 5 MB.** Files larger than 5 MB are not content-scanned. Filename and MIME type still checked. Rationale: service worker memory limits; most sensitive text files are small.
- **File type detection: magic bytes, not file extension.** Extension is user-controlled and unreliable. Yuki reads the first 512 bytes of every uploaded file to determine actual type before deciding scan path.
- **Fail-open on scan error.** If the content scan throws for any reason, the upload proceeds. This is consistent with existing extension fail-open behavior.
- **No storing of file content.** Only matched excerpts (same 200-char truncation as prompt findings) are included in audit event reports. Full file content never leaves the local machine.

---

## Action Items

| # | Action | Owner | By |
|---|---|---|---|
| 1 | Add file content extraction to fetch/XHR override (magic bytes check + `.text()` path) | Yuki | July 28 |
| 2 | Add 5 MB size gate and unknown-binary fallback | Yuki | July 28 |
| 3 | Wire file content string into existing detection engine pipeline | Omar | July 28 |
| 4 | Update detection doc: document file upload scanning scope and limits | Omar | July 28 |
| 5 | Evaluate pdfjs-dist in service worker context (bundle size, memory, compatibility) | Yuki | August research spike |
| 6 | Spec v2 structured-format scanning sprint | Ben | August |
