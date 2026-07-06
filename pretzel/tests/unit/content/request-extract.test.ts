import { describe, it, expect } from "vitest";
import { extractPromptFromRequest } from "@/content/request-extract";

describe("extractPromptFromRequest — ChatGPT", () => {
  const url = "https://chatgpt.com/backend-api/conversation";
  const body = (parts: string[]) =>
    JSON.stringify({
      action: "next",
      messages: [{ author: { role: "user" }, content: { content_type: "text", parts } }],
    });

  it("pulls the user prompt from a conversation POST", () => {
    expect(extractPromptFromRequest("chatgpt.com", url, body(["my secret is sk-abc"]))).toBe(
      "my secret is sk-abc",
    );
  });

  it("ignores non-conversation endpoints", () => {
    expect(
      extractPromptFromRequest("chatgpt.com", "https://chatgpt.com/backend-api/models", body(["hi"])),
    ).toBeNull();
  });

  it("returns null for an empty prompt", () => {
    expect(extractPromptFromRequest("chatgpt.com", url, body([""]))).toBeNull();
  });
});

describe("extractPromptFromRequest — Claude", () => {
  it("pulls the prompt from a completion POST", () => {
    const url = "https://claude.ai/api/organizations/x/chat_conversations/y/completion";
    const body = JSON.stringify({ prompt: "leak this password hunter2", parent_message_uuid: "z" });
    expect(extractPromptFromRequest("claude.ai", url, body)).toBe("leak this password hunter2");
  });
});

describe("extractPromptFromRequest — guards", () => {
  it("returns null for unmonitored hosts", () => {
    expect(
      extractPromptFromRequest("bank.example.com", "https://bank.example.com/completion", '{"prompt":"x"}'),
    ).toBeNull();
  });

  it("returns null for Gemini (DOM path covers it)", () => {
    expect(
      extractPromptFromRequest("gemini.google.com", "https://gemini.google.com/_/BardChatUi/batchexecute", "f.req=..."),
    ).toBeNull();
  });

  it("returns null for non-JSON bodies without throwing", () => {
    expect(extractPromptFromRequest("chatgpt.com", "https://chatgpt.com/backend-api/conversation", "not json")).toBeNull();
  });
});
