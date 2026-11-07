import { describe, it, expect, afterEach, vi } from "vitest";
import { geminiAdapter } from "@/content/adapters/gemini";

/** Minimal `document` stub: selector → element (or null). */
function stubDom(map: Record<string, unknown>) {
  vi.stubGlobal("document", { querySelector: (sel: string) => map[sel] ?? null });
}

describe("geminiAdapter.findSendButton", () => {
  afterEach(() => vi.unstubAllGlobals());

  it("finds the send button by its English aria-label", () => {
    const btn = { id: "en" };
    stubDom({ 'button[aria-label="Send message"]': btn });
    expect(geminiAdapter.findSendButton()).toBe(btn);
  });

  it("finds the send button when the UI is not English (aria-label localized)", () => {
    const btn = { id: "he" };
    stubDom({ ".send-button button": btn });
    expect(geminiAdapter.findSendButton()).toBe(btn);
  });

  it("falls back to the arrow_upward icon's button", () => {
    const btn = { id: "icon" };
    const icon = { closest: (sel: string) => (sel === "button" ? btn : null) };
    stubDom({ 'mat-icon[fonticon="arrow_upward"]': icon });
    expect(geminiAdapter.findSendButton()).toBe(btn);
  });

  it("returns null, not undefined, when nothing matches", () => {
    stubDom({});
    expect(geminiAdapter.findSendButton()).toBeNull();
  });
});
