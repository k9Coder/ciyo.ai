# SafeInput Rebrand — Design Spec

**Date:** 2026-05-20
**Status:** Approved
**Scope:** Full rebrand from PromptShield → SafeInput across browser extension, admin console, and all string references.

---

## 1. Product Context

SafeInput is a browser-based DLP (Data Loss Prevention) tool for LLM chat interfaces. It has two distinct surfaces:

- **Browser Extension** — installed by every employee. Intercepts prompts before they leave the browser, detects secrets and PII, warns or blocks sends.
- **Admin Console** (`admin/`) — used by IT administrators, CISOs, and security team leads. Manages detection policies, teams, members, and audit logs.
- **Backend** (`backend/`) — API server. Not user-facing; no brand tokens needed beyond name string updates.

---

## 2. Brand Decisions

| Dimension | Decision |
|---|---|
| Name | **SafeInput** (was: PromptShield) |
| Domain | safeinput.ai |
| Personality | Modern & sharp — Wiz / Linear energy, not enterprise-grey |
| Default mode | Dark |
| Light mode | Available via toggle on all surfaces |
| Tagline | *AI Prompt Protection* |

---

## 3. Color Tokens

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

Theme is toggled by setting `data-theme="light"` on `<html>`. Default is dark (no attribute).

---

## 4. Typography

- **Font stack:** `'Segoe UI', system-ui, -apple-system, sans-serif` — no external font dependency
- **Wordmark:** `safe` in `--text-primary`, `input` in `--brand-primary`, weight 600, letter-spacing -0.5px
- **Tagline:** *AI Prompt Protection* — uppercase, letter-spacing 2.5px, `--text-muted`, size 10px

---

## 5. Logo

### Icon

An input field (rounded rect) with a checkmark badge on the right edge. Two variants:

- **Default:** stroke colour `--brand-primary`, fill `--bg-surface`
- **Warning state:** stroke colour `--status-danger`, badge shows `!` instead of `✓`

### Files to create

| File | Usage |
|---|---|
| `public/logo-icon.svg` | Single icon, all sizes from one viewBox |
| `public/logo-dark.svg` | Full lockup (icon + wordmark), dark background |
| `public/logo-light.svg` | Full lockup, light background |
| `public/favicon.ico` | 16×16 and 32×32 derived from icon |

### Minimum sizes

- 16px — icon only, simplified (no text lines, just field outline + check)
- 32px — icon with text lines visible
- 48px+ — full detail

---

## 6. Token File Structure

Both surfaces maintain their own `tokens.css`. They are identical in content — no shared package needed at this scale.

```
src/
  styles/
    tokens.css        ← extension design tokens
    brand.css         ← @font-face, logo references (if any)

admin/src/
  styles/
    tokens.css        ← identical tokens
    brand.css

public/
  logo-icon.svg
  logo-dark.svg
  logo-light.svg
  favicon.ico
```

Both `tailwind.config.ts` files must extend the `colors` key to reference the CSS variables, e.g.:
```ts
colors: {
  brand: 'var(--brand-primary)',
  'bg-base': 'var(--bg-base)',
  'bg-surface': 'var(--bg-surface)',
  danger: 'var(--status-danger)',
  warn: 'var(--status-warn)',
  safe: 'var(--status-safe)',
}
```
This allows `text-brand`, `bg-bg-surface`, etc. to resolve to the correct token in both themes.

---

## 7. Extension Rebrand

### Popup (`src/popup/`)

Two states — both use the same layout:

**Header:** Logo icon (24px) + wordmark + theme toggle (sun icon, top-right)

**Safe state:**
- Green pulse dot + "All clear" banner (`--status-safe`)
- Site name + ACTIVE badge
- 3-stat row: Scanned / Blocked / Sites
- Footer: "Managed by [Org]" + Settings link

**Warning state:**
- Red pulse dot + "Sensitive data detected" banner (`--status-danger`)
- Icon stroke switches to `--status-danger`
- Finding cards with severity badges (HIGH / MED)
- Two action buttons: "Block send" (danger-tinted) / "Send anyway" (muted)
- Footer unchanged

### Options page (`src/options/`)

- Replace PromptShield header/logo with SafeInput lockup
- Apply `tokens.css`, update all hardcoded colours to CSS variables
- Add theme toggle to page header

---

## 8. Admin Console Rebrand (`admin/`)

### Layout

Full-width sidebar layout. Sidebar is fixed 210px. Main content fills remaining width.

**Sidebar contents (top → bottom):**
1. SafeInput logo lockup (22px icon)
2. Organization badge (name + label)
3. Nav items: Dashboard, Policies, Teams, Members, Audit Log, Settings
4. User avatar + name + role (bottom-pinned)

### Dashboard page

**Top bar:** Page title + subtitle + Export button + theme toggle

**Stats row (4 cards):** Prompts Scanned / Threats Blocked / Active Users / Policy Coverage

**Activity chart:** 7-day stacked bar chart (Blocked = `--status-danger`, Warned = `--status-warn`). Full width.

**Lower two-column (ratio 1.6 : 1):**
- Left: Recent Incidents table (User / Type / Status badge / When)
- Right (stacked):
  1. Threat Breakdown — horizontal progress bars (API Keys / PII / Private Keys / Internal IPs)
  2. Top Sites — list with dot colour + prompt count
  3. Policy Health — Teams with policy / Rules enabled / Last sync (2-column sub-grid)

### Status badges

| Value | Light bg | Text colour |
|---|---|---|
| BLOCKED | `#fce8ec` | `--status-danger` |
| WARNED | `#fff4e0` | `--status-warn` |
| ACTIVE | `#e8f4fa` | `--brand-primary` |

---

## 9. String / Copy Changes

All occurrences of "PromptShield" must be replaced with "SafeInput". Key locations:

| File | Change |
|---|---|
| `manifest.config.ts` | `name: "SafeInput"`, update `description` |
| `package.json` (root) | `"name": "safeinput"` |
| `backend/package.json` | `"name": "safeinput-backend"` |
| `admin/package.json` | `"name": "safeinput-admin"` |
| `src/popup/` | All UI strings |
| `src/options/` | All UI strings, page `<title>` |
| `admin/index.html` | `<title>SafeInput Admin</title>` |
| `admin/src/` | All UI strings |
| `README.md` | Product name + description |

Run a grep after implementation to catch any stragglers:
```bash
grep -r "PromptShield\|promptshield\|prompt-shield\|prompt_shield" --include="*.ts" --include="*.tsx" --include="*.html" --include="*.json" .
```

---

## 10. Theme Toggle Implementation

- Store preference in `localStorage` key `safeinput-theme`
- Default: `dark` (no attribute on `<html>`)
- On toggle: flip `data-theme` attribute on `<html>`, persist to `localStorage`
- Extension popup reads from `chrome.storage.sync` key `theme` so preference syncs across devices
- Admin console reads from `localStorage`

---

## 11. Out of Scope

- Backend API changes (no visual surface)
- Detection logic changes
- Policy format changes
- New features
- Marketing site / landing page

---

## 12. Implementation Order

1. Create SVG logo files in `public/`
2. Write `tokens.css` for extension (`src/styles/`)
3. Write `tokens.css` for admin (`admin/src/styles/`)
4. Update both `tailwind.config.ts` files
5. Apply tokens + logo to extension popup
6. Apply tokens + logo to extension options page
7. Apply tokens + logo + full dashboard layout to admin console
8. Global string replace PromptShield → SafeInput
9. Update `manifest.config.ts` and all `package.json` name fields
10. Grep pass to catch stragglers
11. Build + smoke test both surfaces in dark and light mode
