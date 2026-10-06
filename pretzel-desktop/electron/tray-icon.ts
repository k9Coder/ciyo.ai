/**
 * State-aware tray icon — the orb mark (same visual language as renderer/
 * shared/Logo.tsx) with a small status dot at the corner, colored per state,
 * mirroring the tray-ui window's own status pills so the icon in the taskbar
 * and the window it opens tell the same story at a glance.
 *
 * Rendered directly to pixels (see png-encode.ts) rather than rasterizing
 * the SVG through a new dependency — these are three tiny, static, fully
 * deterministic images, well within what's reasonable to hand-draw in code.
 */
import { nativeImage, type NativeImage } from 'electron'
import { encodePNG } from './png-encode'

export type TrayIconState = 'active' | 'warn' | 'inactive'

const SIZE = 32 // rendered @2x, Electron/OS downscale for the actual tray slot

const COLORS: Record<TrayIconState, [number, number, number]> = {
  active:   [61, 220, 151],  // --status-safe
  warn:     [255, 182, 72],  // --status-warn
  inactive: [255, 107, 127], // --status-danger
}
const BG_BASE: [number, number, number] = [11, 14, 22] // --bg-base, used as the status dot's separating ring

function setPixel(buf: Buffer, x: number, y: number, r: number, g: number, b: number, a: number): void {
  if (x < 0 || y < 0 || x >= SIZE || y >= SIZE) return
  const i = (y * SIZE + x) * 4
  buf[i] = r; buf[i + 1] = g; buf[i + 2] = b; buf[i + 3] = a
}

/** Alpha-blend a new color over whatever is already at that pixel. */
function blendPixel(buf: Buffer, x: number, y: number, r: number, g: number, b: number, a: number): void {
  if (x < 0 || y < 0 || x >= SIZE || y >= SIZE) return
  const i = (y * SIZE + x) * 4
  const srcA = a / 255
  const dstA = (buf[i + 3] ?? 0) / 255
  const outA = srcA + dstA * (1 - srcA)
  if (outA <= 0) return
  buf[i]     = Math.round((r * srcA + (buf[i]     ?? 0) * dstA * (1 - srcA)) / outA)
  buf[i + 1] = Math.round((g * srcA + (buf[i + 1] ?? 0) * dstA * (1 - srcA)) / outA)
  buf[i + 2] = Math.round((b * srcA + (buf[i + 2] ?? 0) * dstA * (1 - srcA)) / outA)
  buf[i + 3] = Math.round(outA * 255)
}

function drawOrb(buf: Buffer): void {
  // Glass-orb mark: radial 3-stop gradient (light highlight → brand blue →
  // deep navy edge), same palette as the Logo mark, with a soft edge for
  // antialiasing at this tiny size.
  const cx = 14, cy = 15, r = 12
  const highlight: [number, number, number] = [200, 216, 255]
  const brand: [number, number, number] = [91, 140, 255]
  const deep: [number, number, number] = [28, 61, 158]

  for (let y = 0; y < SIZE; y++) {
    for (let x = 0; x < SIZE; x++) {
      const dx = x - cx, dy = y - cy
      const dist = Math.sqrt(dx * dx + dy * dy)
      if (dist > r + 1) continue
      const t = Math.min(1, dist / r)
      const [r1, g1, b1] = t < 0.45
        ? lerp(highlight, brand, t / 0.45)
        : lerp(brand, deep, (t - 0.45) / 0.55)
      const alpha = dist > r ? Math.max(0, 255 * (1 - (dist - r))) : 255
      blendPixel(buf, x, y, r1, g1, b1, alpha)
    }
  }
}

function lerp(a: [number, number, number], b: [number, number, number], t: number): [number, number, number] {
  return [a[0] + (b[0] - a[0]) * t, a[1] + (b[1] - a[1]) * t, a[2] + (b[2] - a[2]) * t]
}

function drawStatusDot(buf: Buffer, color: [number, number, number]): void {
  // Bottom-right corner, with a small ring of bg-base separating it from the
  // orb behind it — same treatment as .logo-status-dot in the tray-ui window.
  const cx = 24, cy = 25
  for (let y = 0; y < SIZE; y++) {
    for (let x = 0; x < SIZE; x++) {
      const dx = x - cx, dy = y - cy
      const dist = Math.sqrt(dx * dx + dy * dy)
      if (dist <= 6.5) {
        blendPixel(buf, x, y, ...BG_BASE, 255) // separating ring
      }
      if (dist <= 5) {
        setPixel(buf, x, y, ...color, 255)
      }
    }
  }
}

const cache = new Map<TrayIconState, NativeImage>()

/** Test-only: clear the render cache so each test starts from a clean slate. */
export function _resetCacheForTest(): void {
  cache.clear()
}

/** Render (or return a cached render of) the tray icon for a given state. */
export function renderTrayIcon(state: TrayIconState): NativeImage {
  const cached = cache.get(state)
  if (cached) return cached

  const buf = Buffer.alloc(SIZE * SIZE * 4) // starts fully transparent
  drawOrb(buf)
  drawStatusDot(buf, COLORS[state])

  const png = encodePNG(SIZE, SIZE, buf)
  const image = nativeImage.createFromBuffer(png).resize({ width: 16, height: 16, quality: 'best' })
  cache.set(state, image)
  return image
}
