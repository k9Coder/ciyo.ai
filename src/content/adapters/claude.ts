import type { SiteAdapter } from "./types";
import { SEND_SENTINEL_ATTR } from "@/shared/constants";
import { logger } from "@/shared/logger";

/**
 * Adapter stub for claude.ai.
 * Selectors need verification against the live site — disabled by default
 * via the perSite policy until confirmed working.
 *
 * TODO: verify composer and send-button selectors against claude.ai DOM.
 */
export const claudeAdapter: SiteAdapter = {
  hostname: "claude.ai",
  name: "Claude",

  findComposer(): HTMLElement | null {
    return (
      (document.querySelector('div[contenteditable="true"]') as HTMLElement | null) ??
      (document.querySelector(".ProseMirror") as HTMLElement | null)
    );
  },

  findSendButton(): HTMLElement | null {
    return (
      (document.querySelector('button[aria-label="Send Message"]') as HTMLElement | null) ??
      (document.querySelector('button[type="submit"]') as HTMLElement | null)
    );
  },

  readPromptText(composer: HTMLElement): string {
    return composer.innerText ?? "";
  },

  writePromptText(composer: HTMLElement, text: string): void {
    composer.innerText = text;
    composer.dispatchEvent(new Event("input", { bubbles: true }));
  },

  onSendIntent(handler: (e: Event) => Promise<{ proceed: boolean }>): () => void {
    let processing = false;

    const onClick = async (e: MouseEvent) => {
      const sendBtn = this.findSendButton();
      if (!sendBtn) return;
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
        logger.error("Claude onSendIntent error:", err);
      } finally {
        processing = false;
      }
    };

    document.addEventListener("click", onClick, { capture: true });
    return () => document.removeEventListener("click", onClick, { capture: true });
  },
};
