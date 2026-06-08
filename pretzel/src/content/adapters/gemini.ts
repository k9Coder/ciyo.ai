import type { SiteAdapter } from "./types";
import { SEND_SENTINEL_ATTR } from "@/shared/constants";
import { logger } from "@/shared/logger";

export const geminiAdapter: SiteAdapter = {
  hostname: "gemini.google.com",
  name: "Gemini",

  findComposer(): HTMLElement | null {
    // Gemini uses a custom rich-textarea web component, not Quill — the
    // rich-textarea selector is the real working path. The generic fallback
    // is scoped under rich-textarea to avoid matching unrelated editables.
    return (
      (document.querySelector('rich-textarea div[contenteditable="true"]') as HTMLElement | null) ??
      (document.querySelector('div[contenteditable="true"]') as HTMLElement | null)
    );
  },

  findSendButton(): HTMLElement | null {
    return (
      (document.querySelector('button[aria-label="Send message"]') as HTMLElement | null) ??
      (document.querySelector('button[data-mat-icon-name="send"]') as HTMLElement | null) ??
      (document.querySelector('button.send-button') as HTMLElement | null)
    );
  },

  readPromptText(composer: HTMLElement): string {
    return composer.innerText ?? "";
  },

  writePromptText(composer: HTMLElement, text: string): void {
    // Gemini's rich-textarea also does not sync from direct DOM mutation —
    // setting innerText bypasses the internal editor state. execCommand drives
    // the native input handler, which the rich-textarea component listens to.
    composer.focus();
    document.execCommand("selectAll");
    document.execCommand("insertText", false, text);
  },

  onSendIntent(handler: (e: Event) => Promise<{ proceed: boolean }>): () => void {
    let processing = false;

    const onClick = async (e: MouseEvent) => {
      const sendBtn = this.findSendButton();
      if (!sendBtn) return;
      if ((e.target as HTMLElement | null)?.hasAttribute?.(SEND_SENTINEL_ATTR)) return;
      if (sendBtn.hasAttribute(SEND_SENTINEL_ATTR)) return;
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
          requestAnimationFrame(() => sendBtn.removeAttribute(SEND_SENTINEL_ATTR));
        }
      } catch (err) {
        logger.error("Gemini onSendIntent click error:", err);
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
        logger.error("Gemini onSendIntent keydown error:", err);
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
