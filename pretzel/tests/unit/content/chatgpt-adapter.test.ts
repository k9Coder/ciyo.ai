import { describe, it, expect, afterEach, vi } from "vitest";
import { chatGPTAdapter } from "@/content/adapters/chatgpt";

/** Minimal `document` stub: selector → element (or null). */
function stubDom(map: Record<string, unknown>) {
  vi.stubGlobal("document", { querySelector: (sel: string) => map[sel] ?? null });
}

describe("chatGPTAdapter.findComposer", () => {
  afterEach(() => vi.unstubAllGlobals());

  it("finds the signed-out textarea composer", () => {
    const textarea = { id: "mobile-composer-prompt" };
    stubDom({ "#mobile-composer-prompt": textarea });
    expect(chatGPTAdapter.findComposer()).toBe(textarea);
  });

  it("finds the pre-hydration textarea on the signed-in page", () => {
    const textarea = { id: "pending-home-input" };
    stubDom({ "#pending-home-input": textarea });
    expect(chatGPTAdapter.findComposer()).toBe(textarea);
  });

  it("prefers the ProseMirror editor once it exists", () => {
    const editor = { id: "editor" };
    stubDom({ 'div[contenteditable="true"]': editor, "#pending-home-input": { id: "old" } });
    expect(chatGPTAdapter.findComposer()).toBe(editor);
  });
});

describe("chatGPTAdapter.findSendButton", () => {
  afterEach(() => vi.unstubAllGlobals());

  it("finds the Oct 2026 send button (type=submit, aria-label=Send, no data-testid)", () => {
    const sendBtn = { id: "send" };
    stubDom({ 'button[aria-label="Send"]': sendBtn });
    expect(chatGPTAdapter.findSendButton()).toBe(sendBtn);
  });

  it("falls back to the composer form's submit button when labels change", () => {
    const submit = { id: "submit" };
    const form = { querySelector: (sel: string) => (sel === 'button[type="submit"]' ? submit : null) };
    const composer = { closest: (sel: string) => (sel === "form" ? form : null) };
    stubDom({ 'div[contenteditable="true"]': composer });
    expect(chatGPTAdapter.findSendButton()).toBe(submit);
  });

  it("still prefers the legacy data-testid button", () => {
    const legacy = { id: "legacy" };
    stubDom({ '[data-testid="send-button"]': legacy, 'button[aria-label="Send"]': { id: "new" } });
    expect(chatGPTAdapter.findSendButton()).toBe(legacy);
  });

  it("returns null when there is no composer and no known button", () => {
    stubDom({});
    expect(chatGPTAdapter.findSendButton()).toBeNull();
  });
});
