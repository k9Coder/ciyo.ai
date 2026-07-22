---
status: current
owner: extension
verified_at: 2026-06-13
sources:
  - pretzel/manifest.config.ts
  - pretzel/src/content/content-script.ts
  - pretzel/src/content/adapters/types.ts
  - pretzel/src/content/adapters/registry.ts
  - pretzel/src/content/adapters/chatgpt.ts
  - pretzel/src/content/adapters/claude.ts
  - pretzel/src/content/adapters/gemini.ts
  - pretzel/src/content/adapters/generic.ts
  - pretzel/e2e/detection.spec.ts
---

# Host adapters

## Supported hosts

Production builds inject the content script only on:

| Host | Adapter |
|---|---|
| `chatgpt.com` | ChatGPT |
| `chat.openai.com` | ChatGPT |
| `claude.ai` | Claude |
| `gemini.google.com` | Gemini |

Development and test builds also permit `http://localhost:9876/*` for E2E fixtures. The generic adapter handles permitted hosts without a named adapter, but it does not make arbitrary websites supported: Chrome will not inject the content script on hosts absent from manifest permissions.

## Interception model

Adapters listen in capture phase for send-button clicks and unmodified Enter presses inside the composer. Shift+Enter is not intercepted. They immediately suppress the original event, await the content-script decision, then re-click the send button when approved.

Before re-clicking, the adapter adds `data-mykka-approved` to the button. Capture listeners allow the sentinel click through, and remove the attribute on the next animation frame. A per-adapter `processing` flag suppresses duplicate sends during detection.

## Named adapters

Named adapters use ordered selector fallbacks for composers and send buttons. ChatGPT supports a textarea or contenteditable composer. Claude and Gemini use contenteditable editors.

Writing text back is currently a future-redaction capability, not part of the send flow. Named rich-text adapters use `document.execCommand("insertText")` so host editor state receives the change.

Selectors are coupled to host DOMs and can break when a host changes markup. Missing composers and send buttons are handled without throwing, but missing composer detection is fail-open.

## Generic adapter

The generic adapter:

- asynchronously loads optional `siteConfigs[hostname]` selectors;
- falls back to the largest visible textarea/contenteditable/textbox;
- searches for common send-button labels near the composer;
- uses direct DOM writes plus `input` and `change` events.

Because site config loads asynchronously, the first lookup can use heuristic fallbacks before configured selectors arrive. A configured selector that matches nothing falls back for the composer, but a missing configured send-button match returns `null` without heuristic fallback.

## Add or repair an adapter

1. Update or add a named adapter under `src/content/adapters/`.
2. Register it in `registry.ts`.
3. Add the host to `manifest.config.ts` when it is a newly supported production host.
4. Add an E2E fixture and send-flow coverage.
5. Run `pnpm test`, `pnpm build`, and `pnpm test:e2e`.
