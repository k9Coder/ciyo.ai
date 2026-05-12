# Adding a Site Adapter

Each supported LLM site needs an adapter that implements the `SiteAdapter` interface.

## 1. Implement the interface

Create `src/content/adapters/mysite.ts`:

```typescript
import type { SiteAdapter } from "./types";
import { SEND_SENTINEL_ATTR } from "@/shared/constants";

export const mySiteAdapter: SiteAdapter = {
  hostname: "mysite.com",           // or a RegExp
  name: "My Site",

  findComposer() {
    return document.querySelector("#my-textarea") as HTMLElement | null;
  },

  findSendButton() {
    return document.querySelector("button.send") as HTMLElement | null;
  },

  readPromptText(composer) {
    return (composer as HTMLTextAreaElement).value;
  },

  writePromptText(composer, text) {
    (composer as HTMLTextAreaElement).value = text;
    composer.dispatchEvent(new Event("input", { bubbles: true }));
  },

  onSendIntent(handler) {
    let processing = false;
    const onClick = async (e: MouseEvent) => {
      const btn = this.findSendButton();
      if (!btn || btn.hasAttribute(SEND_SENTINEL_ATTR)) return;
      if (!btn.contains(e.target as Node)) return;
      if (processing) { e.preventDefault(); e.stopPropagation(); return; }

      e.preventDefault();
      e.stopPropagation();
      processing = true;

      const { proceed } = await handler(e);
      if (proceed) {
        btn.setAttribute(SEND_SENTINEL_ATTR, "1");
        btn.click();
        requestAnimationFrame(() => btn.removeAttribute(SEND_SENTINEL_ATTR));
      }
      processing = false;
    };

    document.addEventListener("click", onClick, { capture: true });
    return () => document.removeEventListener("click", onClick, { capture: true });
  },
};
```

## 2. Register it

Add to `src/content/adapters/registry.ts`:

```typescript
import { mySiteAdapter } from "./mysite";

const ADAPTERS: SiteAdapter[] = [
  chatGPTAdapter,
  claudeAdapter,
  geminiAdapter,
  mySiteAdapter,  // ← add here
];
```

## 3. Add host permissions

Add the hostname to `manifest.config.ts`:

```typescript
const LLM_HOSTS = [
  // ... existing hosts
  "https://mysite.com/*",
];
```

## 4. Enable in default policy

Add to `src/policy/defaults.ts` in `perSite`:

```typescript
"mysite.com": { enabled: true },
```

## Tips

- Use `capture: true` listeners so you intercept events before the site's own handlers.
- The `SEND_SENTINEL_ATTR` pattern prevents infinite recursion when you re-fire the click.
- `findComposer` and `findSendButton` will be called every time a send event fires —
  keep them fast (no expensive DOM traversal).
- Test with the static mock page in `tests/e2e/fixtures/` before testing on the live site.
