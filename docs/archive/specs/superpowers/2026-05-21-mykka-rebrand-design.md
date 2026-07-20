# mykka Rebrand — Design Spec

**Date:** 2026-05-21
**Status:** Approved
**Scope:** Full rebrand from SafeInput → mykka across browser extension, admin console, and all string references.

---

## 1. Product Context

mykka is a browser-based DLP tool for LLM chat interfaces with two user-facing surfaces:

- **Browser Extension** — intercepts prompts before they leave the browser, detects secrets and PII
- **Admin Console** (`admin/`) — IT/security team manages policies, teams, members, audit logs
- **Backend** (`backend/`) — API server, no visual surface

---

## 2. Brand Decisions

| Dimension | Decision |
|---|---|
| Name | **mykka** (all lowercase) |
| Domain | mykka.ai |
| Personality | Enterprise security — dark, sharp, Wiz / Linear energy |
| Default mode | Dark |
| Light mode | Available via toggle |
| Tagline | *AI Prompt Protection* |

---

## 3. Logo

### Icon — Bracket Mark

A left bracket + cyan dot (doubles as the dot of the "i") + top-right L-corner accent on a dark rounded-rect background.

```
┌──────────────────┐
│  [  •            │   [ = left bracket (stroke)
│       ↖ L-corner │   • = filled cyan circle
└──────────────────┘
```

SVG geometry (56×56 viewBox):
- Background: `<rect width="56" height="56" rx="14" fill="#0d1525"/>`
- Bracket: `<path d="M20 14 L14 14 L14 42 L20 42" stroke="#00d4ff" stroke-width="3"/>`
- Dot: `<circle cx="34" cy="28" r="5" fill="#00d4ff"/>`
- Corner: `<path d="M30 18 L38 18 L38 24" stroke="#00d4ff" stroke-width="2.5" opacity="0.5"/>`

Two states:
- **Default:** all elements in `--brand-primary`
- **Alert:** all elements in `--status-danger`

### Wordmark

`c` + `i`(cyan) + `yo` — all lowercase, weight 700, letter-spacing -0.5px, `font-family: 'Segoe UI', system-ui, sans-serif`

```
c  i  y  o
↑  ↑
white cyan
```

### Files

| File | Usage |
|---|---|
| `public/logo-icon.svg` | Standalone icon (all sizes from one viewBox) |
| `public/logo-dark.svg` | Full lockup (icon + wordmark) for dark bg |
| `public/logo-light.svg` | Full lockup for light bg |

---

## 4. Color Tokens

Identical to current SafeInput tokens — no color changes.

### Dark mode (default)

```css
:root {
  --brand-primary:     #00d4ff;
  --bg-base:           #0a0e1a;
  --bg-surface:        #0d1525;
  --bg-surface-raised: #1a2a3a;
  --border:            #1a2a3a;
  --text-primary:      #ffffff;
  --text-secondary:    #8899aa;
  --text-muted:        #3a5060;
  --status-danger:     #ff4d6a;
  --status-warn:       #ffaa00;
  --status-safe:       #00cc88;
}
```

### Light mode

```css
[data-theme="light"] {
  --brand-primary:     #0077aa;
  --bg-base:           #f0f4f8;
  --bg-surface:        #ffffff;
  --bg-surface-raised: #f8fafc;
  --border:            #dde3ea;
  --text-primary:      #0a0e1a;
  --text-secondary:    #4a6070;
  --text-muted:        #9aacba;
  --status-danger:     #e03050;
  --status-warn:       #cc8800;
  --status-safe:       #00aa66;
}
```

---

## 5. String / Copy Changes

All occurrences of "SafeInput" / "safeinput" / "safe-input" must be replaced with "mykka".

| File | Change |
|---|---|
| `manifest.config.ts` | `name: "mykka"`, update description |
| `package.json` (root) | `"name": "mykka"` |
| `backend/package.json` | `"name": "mykka-backend"` |
| `admin/package.json` | `"name": "mykka-admin"` |
| `admin/index.html` | `<title>mykka Admin</title>` |
| `src/popup/Popup.tsx` | Wordmark component: `safe`/`input` → `ci`/`yo` split |
| `admin/src/components/layout/AppLayout.tsx` | Same wordmark update |
| `src/shared/constants.ts` | `EXTENSION_NAME`, `API_BASE` domain, `SEND_SENTINEL_ATTR` attr name |
| `admin/src/utils/theme.ts` | Storage key `safeinput-theme` → `mykka-theme` |
| `README.md` | Product name + description |
| `src/options/pages/AboutPage.tsx` | Any brand strings |
| `backend/src/billing/email.ts` | Any brand strings in email copy |

> **Storage keys** (`promptshield_policy`, `promptshield_site_overrides`, `promptshield_audit`) are intentionally left unchanged to preserve existing user data.

---

## 6. Logo Component Changes

### Extension popup (`src/popup/Popup.tsx`)

Replace `LogoIcon` SVG path data with bracket mark geometry.

Replace `Wordmark` component text split from `safe` / `input` to `ci` / `yo`:

```tsx
function Wordmark({ danger = false }: { danger?: boolean }) {
  const accent = danger ? 'var(--status-danger)' : 'var(--brand-primary)'
  return (
    <span style={{ fontSize: 15, fontWeight: 700, letterSpacing: '-0.5px' }}>
      <span style={{ color: 'var(--text-primary)' }}>c</span>
      <span style={{ color: accent }}>i</span>
      <span style={{ color: 'var(--text-primary)' }}>yo</span>
    </span>
  )
}
```

### Admin sidebar (`admin/src/components/layout/AppLayout.tsx`)

Same icon + wordmark update as popup.

---

## 7. SVG Logo Files

### `public/logo-icon.svg`

Icon only, uses CSS variables for theming:

```svg
<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 56 56" fill="none">
  <rect width="56" height="56" rx="14" fill="var(--bg-surface, #0d1525)"/>
  <path d="M20 14 L14 14 L14 42 L20 42"
        stroke="var(--brand-primary, #00d4ff)" stroke-width="3"
        stroke-linecap="round" stroke-linejoin="round"/>
  <circle cx="34" cy="28" r="5" fill="var(--brand-primary, #00d4ff)"/>
  <path d="M30 18 L38 18 L38 24"
        stroke="var(--brand-primary, #00d4ff)" stroke-width="2.5"
        stroke-linecap="round" stroke-linejoin="round" opacity="0.5"/>
</svg>
```

### `public/logo-dark.svg`

Full lockup, hardcoded dark colors:

```svg
<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 200 48" fill="none">
  <rect x="4" y="4" width="40" height="40" rx="10" fill="#0d1525"/>
  <path d="M18 10 L12 10 L12 38 L18 38"
        stroke="#00d4ff" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"/>
  <circle cx="30" cy="24" r="4" fill="#00d4ff"/>
  <path d="M26 14 L34 14 L34 20"
        stroke="#00d4ff" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" opacity="0.5"/>
  <text x="56" y="30" font-family="'Segoe UI',system-ui,sans-serif"
        font-size="20" font-weight="700" letter-spacing="-0.5" fill="#ffffff">c</text>
  <text x="68" y="30" font-family="'Segoe UI',system-ui,sans-serif"
        font-size="20" font-weight="700" letter-spacing="-0.5" fill="#00d4ff">i</text>
  <text x="76" y="30" font-family="'Segoe UI',system-ui,sans-serif"
        font-size="20" font-weight="700" letter-spacing="-0.5" fill="#ffffff">yo</text>
</svg>
```

### `public/logo-light.svg`

Same structure, swap `#0d1525` → `#f0f4f8`, `#00d4ff` → `#0077aa`, `#ffffff` → `#0a0e1a`.

---

## 8. Out of Scope

- Color token changes
- Detection logic changes
- Policy format changes
- New features
- Marketing site

---

## 9. Implementation Order

1. Replace SVG logo files in `public/`
2. Update `LogoIcon` + `Wordmark` components in extension popup
3. Update `LogoIcon` + `Wordmark` in admin sidebar
4. Global string replace SafeInput → mykka (manifest, package.json files, constants, theme key, HTML titles)
5. Update `README.md`
6. Grep pass to catch stragglers
7. Build + smoke test both surfaces
