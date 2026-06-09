import type { SiteAdapter } from "./types";
import { SEND_SENTINEL_ATTR } from "@/shared/constants";
import { logger } from "@/shared/logger";

export const claudeAdapter: SiteAdapter = {
  hostname: "claude.ai",
  name: "Claude",

  findComposer(): HTMLElement | null {
    return (
      (document.querySelector(".ProseMirror") as HTMLElement | null) ??
      (document.querySelector('div[contenteditable="true"]') as HTMLElement | null)
    );
  },

  findSendButton(): HTMLElement | null {
    return (
      (document.querySelector('button[aria-label="Send Message"]') as HTMLElement | null) ??
      (document.querySelector('button[aria-label="Send message"]') as HTMLElement | null) ??
      (document.querySelector('button[type="submit"]') as HTMLElement | null)
    );
  },

  readPromptText(composer: HTMLElement): string {
    return composer.innerText ?? "";
  },

  writePromptText(composer: HTMLElement, text: string): void {
    // Claude.ai uses ProseMirror. Setting innerText directly does NOT update
    // ProseMirror's internal EditorState — the editor will revert or corrupt
    // the injected text on the next keypress. execCommand("insertText") drives
    // the editor's native input handler and keeps ProseMirror state in sync.
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
        logger.error("Claude onSendIntent click error:", err);
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
        logger.error("Claude onSendIntent keydown error:", err);
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
