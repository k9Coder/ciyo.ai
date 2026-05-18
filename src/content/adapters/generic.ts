import type { SiteAdapter } from "./types";
import { SEND_SENTINEL_ATTR } from "@/shared/constants";
import { getSiteConfigs } from "@/policy/loader";
import { logger } from "@/shared/logger";

const SEND_BUTTON_LABELS = [
  "send", "submit", "go", "send message", "send prompt",
];
const SEND_BUTTON_ARIA_PATTERNS = SEND_BUTTON_LABELS.map((l) => `[aria-label="${l}"]`).join(", ");

function largestEditableElement(): HTMLElement | null {
  const candidates = Array.from(
    document.querySelectorAll<HTMLElement>(
      'textarea, div[contenteditable="true"], [role="textbox"]'
    )
  ).filter((el) => el.offsetParent !== null); // visible only

  if (candidates.length === 0) return null;

  return candidates.reduce((best, el) =>
    el.offsetHeight * el.offsetWidth > best.offsetHeight * best.offsetWidth ? el : best
  );
}

function nearestButton(composer: HTMLElement): HTMLElement | null {
  // Try aria-labelled send buttons first
  const byLabel = document.querySelector<HTMLElement>(
    `button[aria-label="Send message"], button[aria-label="Send Message"], button[aria-label="Send"], button[type="submit"], ${SEND_BUTTON_ARIA_PATTERNS}`
  );
  if (byLabel) return byLabel;

  // Walk up the DOM looking for a sibling button labelled like a send button
  let node: HTMLElement | null = composer;
  while (node && node !== document.body) {
    const parent: HTMLElement | null = node.parentElement;
    if (!parent) break;
    const buttons = Array.from(parent.querySelectorAll("button")) as HTMLButtonElement[];
    for (const btn of buttons) {
      const label = ((btn as HTMLButtonElement).ariaLabel ?? btn.textContent ?? "").toLowerCase().trim();
      if (SEND_BUTTON_LABELS.some((l) => label.includes(l))) return btn;
    }
    node = parent;
  }
  return null;
}

export function createGenericAdapter(hostname: string): SiteAdapter {
  let _siteConfigComposerSelector: string | null = null;
  let _siteConfigSendSelector: string | null = null;

  // Load siteConfig overrides asynchronously on first use
  void getSiteConfigs().then((configs) => {
    const cfg = configs[hostname];
    if (cfg) {
      _siteConfigComposerSelector = cfg.inputSelector;
      _siteConfigSendSelector = cfg.sendButtonSelector;
    }
  });

  return {
    hostname,
    name: hostname,

    findComposer(): HTMLElement | null {
      if (_siteConfigComposerSelector) {
        return (document.querySelector(_siteConfigComposerSelector) as HTMLElement | null) ?? largestEditableElement();
      }
      return largestEditableElement();
    },

    findSendButton(): HTMLElement | null {
      const composer = this.findComposer();
      if (_siteConfigSendSelector) {
        return (document.querySelector(_siteConfigSendSelector) as HTMLElement | null);
      }
      return composer ? nearestButton(composer) : null;
    },

    readPromptText(composer: HTMLElement): string {
      if (composer instanceof HTMLTextAreaElement) return composer.value;
      return composer.innerText ?? "";
    },

    writePromptText(composer: HTMLElement, text: string): void {
      if (composer instanceof HTMLTextAreaElement) {
        const nativeSetter = Object.getOwnPropertyDescriptor(HTMLTextAreaElement.prototype, "value")?.set;
        nativeSetter?.call(composer, text);
      } else {
        composer.innerText = text;
      }
      composer.dispatchEvent(new Event("input", { bubbles: true }));
      composer.dispatchEvent(new Event("change", { bubbles: true }));
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
          logger.error("Generic onSendIntent click error:", err);
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
          logger.error("Generic onSendIntent keydown error:", err);
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
}
