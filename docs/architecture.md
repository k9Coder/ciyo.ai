# PromptShield Architecture

## Overview

```
┌─────────────────────────────────────────────────────┐
│                    Chrome Extension                  │
│                                                      │
│  ┌──────────────┐    ┌──────────────────────────┐   │
│  │   Popup UI   │    │       Options Page        │   │
│  │  (React/Zustand)  │  (Policy | Audit | About) │   │
│  └──────┬───────┘    └──────────────┬────────────┘   │
│         │ sendMessage               │                 │
│  ┌──────▼───────────────────────────▼────────────┐   │
│  │            Background Service Worker           │   │
│  │   • Handles DETECT / GET_POLICY / TOGGLE_SITE  │   │
│  │   • Calls detection engine                     │   │
│  │   • Loads/saves policy from chrome.storage     │   │
│  └─────────────────────────────────────────────────┘  │
│                        ▲                              │
│               sendMessage (DETECT)                    │
│                        │                              │
│  ┌─────────────────────┴───────────────────────────┐  │
│  │              Content Script (ISOLATED world)     │  │
│  │   • Finds adapter for current hostname           │  │
│  │   • Hooks send-intent (click + Enter)            │  │
│  │   • Reads prompt, calls background for detection │  │
│  │   • Shows Shadow-DOM warning modal               │  │
│  │   • Writes audit event to IndexedDB              │  │
│  └──────────────────────────────────────────────────┘  │
└─────────────────────────────────────────────────────┘
```

## Detection Pipeline

```
promptText
    │
    ├─ normalizeText()         whitespace normalisation, lookalike reversal
    ├─ findCodeSpans()         tag markdown fenced/inline code
    │
    ├─ Layer 1: PatternRules   regex + optional Luhn/SSN validator
    ├─ Layer 1: EntropyRule    Shannon entropy on tokenised text
    ├─ Layer 3: DictionaryRule exact word-boundary + optional Levenshtein fuzzy
    │
    │  (Layer 2: ML NER — reserved for future)
    │  (Layer 4: Cloud classifier — reserved for future)
    │
    └─ aggregate → highest-severity action → DetectionResult
```

## Key Files

| File | Purpose |
|------|---------|
| `src/detection/engine.ts` | Main pipeline; calls all layers; computes `highestAction` |
| `src/detection/normalize.ts` | Lookalike maps, CRLF normalisation |
| `src/detection/code-block.ts` | Marks code-fence spans for scope filtering |
| `src/policy/schema.ts` | Zod schemas for `Rule`, `Policy` |
| `src/policy/defaults.ts` | Baseline rules shipped with the extension |
| `src/content/adapters/chatgpt.ts` | ChatGPT DOM adapter |
| `src/content/overlay/overlay-root.tsx` | Shadow DOM injection + React root |
| `src/content/overlay/WarningModal.tsx` | Warning / block modal UI |
| `src/audit/log.ts` | IndexedDB read/write/export |
| `src/background/service-worker.ts` | MV3 service worker message dispatcher |

## Storage

- `chrome.storage.local` — active policy JSON
- `chrome.storage.sync` — optional cross-device policy sync
- `IndexedDB` (`promptshield_audit`) — append-only audit log

## Security Properties

- The full prompt text is **never** stored. Only the SHA-256 hash and character count.
- All processing is local. No network requests are made.
- The Shadow DOM modal is isolated from host-page styles and scripts.
- Content script errors are caught and never propagate to the host page.
