# pretzel-desktop Strategy Revision + File Upload Pipeline Simplification — Summary
**Date:** July 17, 2026
**Chair:** Ethan Cole (CEO)
**Attendees:** Marcus Webb (CTO), Yuki Tanaka (Extension Engineer), Omar Hassan (Detection Engineer), Ben Cho (PM)
**Purpose:** Two decisions that amend the July 14 pretzel-desktop roadmap and the July 16 file upload scope. No new engineering unknowns — just locking strategy.
**Full transcript:** [pretzel-desktop-strategy-and-upload-pipeline_2026-07-17_full_transcript.md](pretzel-desktop-strategy-and-upload-pipeline_2026-07-17_full_transcript.md)

---

## Summary

### Decision 1 — pretzel-desktop is a standalone replacement, not a companion

Previous framing (July 14) left the relationship between the extension and pretzel-desktop ambiguous. **New decision: users choose one.** pretzel-desktop replaces the extension entirely — it covers everything the extension covers (browser AI sites via system proxy) plus Claude Code hooks, IDE integrations, and file upload scanning. Installing both is not a supported configuration. If a user installs both, both fire independently and the user sees double notifications. That is their problem, not ours. No deduplication logic needed.

**pretzel-desktop v1 scope expands to include:**
- All extension capabilities (browser AI site interception, same policy, same detection engine)
- Claude Code hook mode
- IDE/API traffic via proxy daemon
- File upload content scanning (same rules as below)

**Console Coverage Map** distinguishes `clientType: "pretzel-extension"` vs `clientType: "pretzel-desktop"`. Admins can see which members are on which client.

### Decision 2 — File upload scanning: file extension determines path, not magic bytes

Previous July 16 decision required magic bytes detection to determine file type. **Simplified: use the file extension.** If the extension maps to a text-readable format, extract text and run detection. If it does not, skip content scanning and check filename + MIME type only. Images explicitly out of scope for phase 1.

**Phase 1 file upload scanning — ships with extension upgrade sprint:**

| File extension group | Handling |
|---|---|
| Plain text (`.txt`, `.md`, `.csv`, `.env`, `.sh`, `.sql`, `.log`, `.yaml`, `.yml`, `.toml`, `.json`, `.xml`, `.html`, `.js`, `.ts`, `.py`, `.go`, `.java`, `.rb`, `.rs`, `.cpp`, `.c`, `.h`, `.cs`, etc.) | Read as UTF-8 text → detection engine |
| PDF (`.pdf`) | Extract text via pdfjs-dist → detection engine |
| Word (`.docx`) | Unzip + parse `word/document.xml` via JSZip → detection engine |
| Images (`.png`, `.jpg`, `.jpeg`, `.gif`, `.webp`, `.svg`, etc.) | Skip content scan — phase 1 out of scope |
| Everything else | Skip content scan, check filename + MIME type only |

Size limit: 10 MB (raised from the 5 MB discussed July 16 — PDF/DOCX in scope now, some documents are larger).

**Rationale for file extension over magic bytes:** simpler code, adequate for the threat model. Employees uploading sensitive files to AI tools are not renaming them to evade detection. The magic bytes approach adds complexity without meaningful security benefit at this stage.

---

## Amendments to Prior Meetings

| Prior decision | Amended to |
|---|---|
| July 14: pretzel-desktop relationship to extension unresolved | Users choose one. No supported dual-install. |
| July 14: pretzel-desktop MVP excludes file upload scanning | File upload scanning included in pretzel-desktop v1. |
| July 16: magic bytes detection required | File extension used instead. Simpler. |
| July 16: PDF and DOCX deferred to v2 | PDF and DOCX promoted to v1. Same sprint as text files. |
| July 16: size limit 5 MB | Size limit raised to 10 MB to accommodate PDF/DOCX. |

---

## Action Items

| # | Action | Owner | By |
|---|---|---|---|
| 1 | Update pretzel-desktop architecture doc: standalone replacement, full extension feature parity + Claude Code + IDE + file upload | Marcus | July 21 |
| 2 | Update Console Coverage Map spec: `pretzel-extension` vs `pretzel-desktop` clientType distinction | Ben | July 21 |
| 3 | Replace magic bytes check with file extension lookup in upload scanning implementation | Yuki | July 28 |
| 4 | Promote PDF (pdfjs-dist) and DOCX (JSZip) to v1 scope — implement alongside text file scanning | Yuki | July 28 |
| 5 | Raise size limit to 10 MB in implementation | Yuki | July 28 |
| 6 | Update detection doc and runtime doc to reflect amended file upload scope | Ben + Omar | July 28 |
| 7 | Update roadmap doc: pretzel-desktop = standalone replacement, file upload in v1 | Ben | July 21 |
