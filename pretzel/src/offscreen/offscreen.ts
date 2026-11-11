/**
 * Offscreen document. Holds open a chrome.runtime.connect() port back to the
 * service worker — one of Chrome's documented signals that keeps the MV3
 * service worker from being torn down while this document exists.
 *
 * Themis (the old on-device judge) used to live here; it was removed when
 * judge_prompt rules stopped being enforced for the judge v2 shadow period
 * (docs/superpowers/specs/2026-11-11-judge-v2-shadow-mode-design.md). The
 * judge v2 shadow runner is hosted here instead.
 */
chrome.runtime.connect({ name: "local-judge-keepalive" });

export {};
