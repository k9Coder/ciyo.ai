import type { SiteAdapter } from "./types";
import { SEND_SENTINEL_ATTR } from "@/shared/constants";
import { logger } from "@/shared/logger";

/**
 * Adapter for ChatGPT (chatgpt.com and chat.openai.com).
 * Selectors are empirically derived and may need updating when OpenAI changes the DOM.
 */
export const chatGPTAdapter: SiteAdapter = {
  hostname: /^(chatgpt\.com|chat\.openai\.com)$/,
  name: "ChatGPT",

  findComposer(): HTMLElement | null {
    return (
      (document.querySelector("#prompt-textarea") as HTMLElement | null) ??
      (document.querySelector('[contenteditable="true"][data-id]') as HTMLElement | null) ??
      (document.querySelector('div[contenteditable="true"]') as HTMLElement | null)
    );
  },

  findSendButton(): HTMLElement | null {
    return (
      (document.querySelector('[data-testid="send-button"]') as HTMLElement | null) ??
      (document.querySelector('button[aria-label="Send message"]') as HTMLElement | null) ??
      (document.querySelector('button[aria-label="Send prompt"]') as HTMLElement | null)
    );
  },

  readPromptText(composer: HTMLElement): string {
    if (composer instanceof HTMLTextAreaElement) {
      return composer.value;
    }
    // contenteditable — innerText preserves line breaks better than textContent
    return composer.innerText ?? "";
  },

  writePromptText(composer: HTMLElement, text: string): void {
    if (composer instanceof HTMLTextAreaElement) {
      const nativeInputValueSetter = Object.getOwnPropertyDescriptor(
        HTMLTextAreaElement.prototype,
        "value"
      )?.set;
      nativeInputValueSetter?.call(composer, text);
    } else {
      composer.innerText = text;
    }
    // Dispatch both input and change so React synthetic events fire
    composer.dispatchEvent(new Event("input", { bubbles: true }));
    composer.dispatchEvent(new Event("change", { bubbles: true }));
  },

  onSendIntent(
    handler: (e: Event) => Promise<{ proceed: boolean }>
  ): () => void {
    let processing = false;

    const onClick = async (e: MouseEvent) => {
      const sendBtn = this.findSendButton();
      if (!sendBtn) return;

      // If the click carries our sentinel, let it through — this is our re-fire.
      if ((e.target as HTMLElement | null)?.hasAttribute?.(SEND_SENTINEL_ATTR)) return;
      if (sendBtn.hasAttribute(SEND_SENTINEL_ATTR)) return;

      // Only intercept clicks on or inside the send button
      if (!sendBtn.contains(e.target as Node) && e.target !== sendBtn) return;
      if (processing) { e.preventDefault(); e.stopPropagation(); return; }

      e.preventDefault();
      e.stopPropagation();
      processing = true;

      try {
        const { proceed } = await handler(e);
        if (proceed) {
          sendBtn.setAttribute(SEND_SENTINEL_ATTR, "1");
          sendBtn.click();
          // Remove sentinel after a tick so it doesn't linger
          requestAnimationFrame(() => sendBtn.removeAttribute(SEND_SENTINEL_ATTR));
        }
      } catch (err) {
        logger.error("onSendIntent click handler error:", err);
      } finally {
        processing = false;
      }
    };

    const onKeyDown = async (e: KeyboardEvent) => {
      if (e.key !== "Enter" || e.shiftKey) return;
      const composer = this.findComposer();
      if (!composer) return;
      if (!composer.contains(e.target as Node) && e.target !== composer) return;
      if (processing) { e.preventDefault(); e.stopPropagation(); return; }

      e.preventDefault();
      e.stopPropagation();
      processing = true;

      try {
        const { proceed } = await handler(e);
        if (proceed) {
          const sendBtn = this.findSendButton();
          if (sendBtn) {
            sendBtn.setAttribute(SEND_SENTINEL_ATTR, "1");
            sendBtn.click();
            requestAnimationFrame(() => sendBtn.removeAttribute(SEND_SENTINEL_ATTR));
          }
        }
      } catch (err) {
        logger.error("onSendIntent keydown handler error:", err);
      } finally {
        processing = false;
      }
    };

    document.addEventListener("click", onClick, { capture: true });
    document.addEventListener("keydown", onKeyDown, { capture: true });

    return () => {
      document.removeEventListener("click", onClick, { capture: true });
      document.removeEventListener("keydown", onKeyDown, { capture: true });
    };
  },
};
