# mykka Brand Guidelines

Design owner: Carlos Mendes (Designer). Approved by: Priya Nair (Head of Marketing), Ethan Cole (CEO). Applies to the extension (`pretzel/`), the admin console (`pretzel-console/`), and the marketing site (`mykka-web/`) — one visual system across all three.

This document replaces the old ciyo identity (cyan `#00d4ff` / navy `#0a0e1a`) with a new mark and palette for mykka. It does not touch the `ciyo` → `mykka` string/product rename, which was completed separately.

**Mark history:** the first mykka mark (closed ring + fused accent node, §1a) shipped, then was superseded five days later by the eye/scan mark (§1b) after Ethan asked for an "eye scanning AI" direction. §1a is kept for the record; §1b is what's actually in `logo-icon.svg` today.

---

## 1a. Concept v1 (superseded) — Carlos Mendes

I didn't want to evolve the old bracket-and-dot mark — the brief was a fresh identity, and half-stepping away from cyan-DLP-tool territory would've just looked like a cyan-DLP-tool with the saturation turned down. So: new mark, new hue family, built from scratch.

**The mark is a closed ring with a fused accent node** — a continuous circular stroke (the protection loop that's always running) with a small solid dot merged onto its upper-right edge (the point where something gets caught and inspected). No pretzel, no bracket. It's deliberately simple: at 16px in a browser toolbar it has to survive as a colored ring with a bump, and it does.

First pass had the dot sitting in a *notch cut into the ring* rather than fused to its edge — Priya flagged that it read as a loading spinner (open arc + dot is exactly the visual grammar of a spin animation), which is the last thing you want for a persistent brand mark sitting next to actual loading spinners in the UI. Closing the ring and keeping the dot as a fixed external node fixes it — see her note in §3.

**Wordmark rule:** the second letter of "mykka" takes the accent color, the rest take the primary text color — `m` / `y`(accent) / `kka`. This mirrors the old system's "second letter accented" convention (`c` / `i`(accent) / `yo`) closely enough to feel like the same *kind* of decision, while the letterforms and color are entirely new. This rule is unchanged by the v2 mark below.

**Color direction:** a confident cobalt/azure blue (`#5b8cff` dark / `#3059d6` light) replacing cyan. Blue reads as enterprise-security-credible without being the specific cyan every DLP dashboard defaults to, and it's clearly distinct from the marketing site's old mismatched purple (`#7c6aff`) — so this palette does double duty as the rebrand *and* the fix for the extension/console/marketing-site mismatch that predated this work. The palette itself carries forward unchanged into v2.

## 1b. Concept v2 — "Glass Orb" eye mark — Carlos Mendes

Ethan's brief: replace the ring with an eye that reads as actively scanning, not just watching. Two rounds:

**Round 1** — five directions at the silhouette level: a scan-beam through a plain eye, a radar-ring pupil, camera-aperture blades as the iris, a minimal eye keeping the v1 mark's "fused dot" posture (renamed the ring's arc into a sweep), and an eye with a crosshair/reticle pupil. Ethan's read: only the reticle one ("Cursor Eye") was worth pursuing — the others didn't clear the bar.

**Round 2** — five refinements of the reticle direction, since round 1 was flat single-weight line art and the ask was for something with actual material depth: gradient iris, specular highlight, glow, layered stroke weights. Options ranged from a direct polish of round 1's reticle, through camera-autofocus corner brackets (dropped — brackets vanish at 16px), to the full "glass orb" treatment. **Glass Orb shipped.**

**The mark:** the eye is a single almond shape filled edge-to-edge with a radial gradient (light corner to deep-blue edge — `#c8d8ff → #5b8cff → #1c3d9e` dark, `#8fabff → #3059d6 → #152e85` light), no separate iris ring. A soft radial halo glows behind it in the dark theme (dropped in light theme — a light-mode glow on a white ground just reads as a smudge, not a glow). A thin crosshair sits on top in the surface color, off-white on dark / white on light, at low opacity — the "actively targeting," not "passively open" reading Ethan asked for. No corner brackets, no separate pupil ring: the gradient and the crosshair are doing all the work, which is also why it holds up better than the bracket version at 16px — a glow softens into background noise as it shrinks; hard corner brackets just disappear.

The wordmark rule from v1 (`m` / `y`-accent / `kka`) is unchanged.

Files: `pretzel/public/logo-icon.svg` (mark only, 56×56, CSS-var themed), `pretzel/public/logo-dark.svg` / `logo-light.svg` (full lockup, 180×48, hardcoded per-theme hex — same file convention as before). The lockup files' badge region (the mark, not the "mykka" wordmark text) was rescaled from the 56×56 icon coordinate system into the lockup's 40×40 badge box.

---

## 2. Palette

Values map onto the existing CSS custom property names in `pretzel/src/styles/tokens.css` and `pretzel-console/src/styles/tokens.css` — no variables renamed, values only. `mykka-web/app/globals.css` is unified onto the same dark-theme values (its `--bg`/`--surface`/`--surface2`/`--border`/`--accent`/`--green`/`--text`/`--muted`/`--dim` now equal the dark tokens below 1:1; it also keeps a marketing-only `--accent2` lighter tint for gradients/badges).

### Dark (default)

| Variable | Hex |
|---|---|
| `--brand-primary` | `#5b8cff` |
| `--bg-base` | `#0b0e16` |
| `--bg-surface` | `#10141f` |
| `--bg-surface-raised` | `#1b2233` |
| `--border` | `#242c40` |
| `--text-primary` | `#f5f7fa` |
| `--text-secondary` | `#9aa4bc` |
| `--text-muted` | `#5b6580` |
| `--status-danger` | `#ff6b7f` |
| `--status-warn` | `#ffb648` |
| `--status-safe` | `#3ddc97` |

### Light

| Variable | Hex |
|---|---|
| `--brand-primary` | `#3059d6` |
| `--bg-base` | `#f3f5fa` |
| `--bg-surface` | `#ffffff` |
| `--bg-surface-raised` | `#f7f9fc` |
| `--border` | `#dee3ee` |
| `--text-primary` | `#0b0e16` |
| `--text-secondary` | `#4a5470` |
| `--text-muted` | `#8991aa` |
| `--status-danger` | `#c82a44` |
| `--status-warn` | `#9a6300` |
| `--status-safe` | `#0a7a4b` |

### Computed WCAG 2.1 contrast ratios

Computed via the standard relative-luminance formula (`scripts/`-adjacent scratch calculation, not eyeballed), rounded to 2 decimals. AA thresholds: **4.5:1** normal text, **3:1** large text/UI. Every foreground/background pairing below clears full AA (4.5:1); status colors were iterated specifically to clear this bar rather than the lower 3:1 large-text threshold, since they're also used at small badge/label sizes.

**Dark**

| Foreground | vs `bg-base` | vs `bg-surface` |
|---|---|---|
| `text-primary` | 17.97:1 | 17.14:1 |
| `text-secondary` | 7.73:1 | 7.37:1 |
| `brand-primary` | 6.10:1 | 5.82:1 |
| `status-danger` | 7.04:1 | 6.71:1 |
| `status-warn` | 11.06:1 | 10.54:1 |
| `status-safe` | 10.92:1 | 10.41:1 |

**Light**

| Foreground | vs `bg-base` | vs `bg-surface` |
|---|---|---|
| `text-primary` | 17.68:1 | 19.29:1 |
| `text-secondary` | 6.89:1 | 7.52:1 |
| `brand-primary` | 5.46:1 | 5.96:1 |
| `status-danger` | 4.97:1 | 5.43:1 |
| `status-warn` | 4.63:1 | 5.05:1 |
| `status-safe` | 4.94:1 | 5.39:1 |

`status-safe` (light) went through two iterations — the first candidate (`#0e8f5c`) only cleared 3.77–4.12:1 against the light surfaces (AA-large, not full AA). Darkened to `#0a7a4b` to clear 4.5:1 everywhere, per the "no exceptions" contrast rule.

---

## 3a. Positioning review v1 — Priya Nair

Reviewed the ring mark and palette against the brief: does this read as enterprise-security-credible, and does it actually move us off the "cyan DLP tool" template every competitor in this space defaults to.

The blue-over-cyan call is right — it's warmer and more confident than the sea of security-cyan out there, and it finally makes the marketing site match the product instead of running its own mismatched purple. That mismatch was quietly undermining trust before a prospect even opened the extension: sales deck is blue-purple, the actual product is cyan. Gone now.

One revision, and I want it on record because it's the kind of thing that only shows up once you look at the mark doing its actual job instead of sitting still in a spec: **the first version of the icon (a ring with a notch cut out of it, dot sitting in the gap) reads as a loading spinner, not a logo.** Put it in a Chrome toolbar next to a page that's genuinely loading and a user's eye will read "still working" instead of "this is mykka." That's disqualifying for a persistent brand mark — it needs to look like a fixed *thing*, not an in-progress state. Carlos closed the ring and fused the dot to the outer edge instead of cutting a gap for it; same geometric idea (continuous protection loop + an active inspection point), none of the spinner ambiguity. Approved as revised.

## 4a. Sign-off v1 — Ethan Cole

Ships. Blue reads better than cyan for a security buyer, the mark is calm enough to sit in a toolbar all day without being annoying, and the site finally matches the product. Priya's spinner catch was the right call — glad it got caught before launch, not after a prospect asked why our logo looks like it's buffering. Ship it.

## 3b. Positioning review v2 — Priya Nair

Round 1 (five silhouettes): no objection to any on brand-positioning grounds — all stayed on the established blue, none read as gimmicky. Ruled out the camera-aperture-blades option for anything customer-facing at small sizes (favicon, extension icon) — Carlos's own flag, seconded.

Round 2 (five refined "Cursor Eye" treatments): the corner-bracket option is the one to rule out here — brackets nearly vanish at 16px, and a mark that only reads correctly above a certain size is a liability the moment it hits a browser toolbar. Glass Orb reads calm and premium at hero size, and — this is the part that matters more than the hero shot — doesn't fall apart small: the halo just softens into noise instead of the mark losing a structural piece the way the brackets do.

## 4b. Sign-off v2 — Ethan Cole

Went with C. Glass Orb. Ship it — same call as last time, don't relitigate it if it holds up in the toolbar next week.

---

## 5. Implementation notes

- Marketing site kept Inter — no reason tied to the new mark to change it; the mark and wordmark carry the differentiation, not the body typeface, and swapping fonts on top of a full color/logo change would be a second unrelated risk for zero brand payoff.
- Raster assets (`pretzel/public/icons/*.png`, `logo-dark.png`, `logo-light.png`, `mykka-web/app/favicon.ico`, `pretzel-desktop/build/icon.{icns,ico,png}`) are generated from the SVG sources by `scripts/render-brand-assets.mjs` (Playwright headless Chromium for PNG rendering, `png2icons` for ICO/ICNS packing). Re-run it after any change to the three SVG source files.
- `pretzel-desktop/build/icon.icns` was generated by `png2icons` and has not been visually verified on macOS (this environment has no Mac). Spot-check it on the next macOS run of `pretzel-desktop-release.yml`; the render script has a fallback `iconutil` recipe in a comment if it turns out broken.
