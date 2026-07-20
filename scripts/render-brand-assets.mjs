#!/usr/bin/env node
/**
 * Renders raster brand assets (PNG/ICO/ICNS) from the hand-authored SVG sources in
 * pretzel/public/logo-icon.svg, logo-dark.svg, logo-light.svg.
 *
 * Uses Playwright's bundled Chromium (already a devDependency across the workspace for
 * e2e tests) to screenshot each SVG at the required pixel sizes, and png2icons (pure JS,
 * no native deps) to pack the resulting PNGs into Windows .ico and Apple .icns containers.
 *
 * Run with: pnpm render-brand-assets   (or: node scripts/render-brand-assets.mjs)
 */
import { chromium } from "@playwright/test";
import png2icons from "png2icons";
import { readFileSync, writeFileSync, mkdirSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const root = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const path = (...parts) => resolve(root, ...parts);

const iconSvg = readFileSync(path("pretzel/public/logo-icon.svg"), "utf8");
const lockupDarkSvg = readFileSync(path("pretzel/public/logo-dark.svg"), "utf8");
const lockupLightSvg = readFileSync(path("pretzel/public/logo-light.svg"), "utf8");

/**
 * Renders an inline SVG string to a PNG buffer at the given pixel size using a headless
 * Chromium page. The SVG's own viewBox controls proportions; we just set the containing
 * element's pixel box and screenshot it with a transparent background.
 */
async function renderSvgToPng(page, svg, width, height) {
  await page.setViewportSize({ width, height });
  await page.setContent(
    `<html><body style="margin:0;padding:0">` +
      `<div id="target" style="width:${width}px;height:${height}px">${svg}</div>` +
      `</body></html>`
  );
  const el = await page.$("#target");
  return el.screenshot({ omitBackground: true });
}

function ensureDir(filePath) {
  mkdirSync(dirname(filePath), { recursive: true });
}

function writePng(filePath, buffer) {
  ensureDir(filePath);
  writeFileSync(filePath, buffer);
  console.log(`wrote ${filePath.replace(root + "\\", "").replace(root + "/", "")} (${buffer.length} bytes)`);
}

async function main() {
  const browser = await chromium.launch();
  const page = await browser.newPage();

  // --- Extension toolbar / manifest icons (square, from logo-icon.svg) ---------------
  // Sizes must match pretzel/manifest.config.ts action.default_icon / icons.
  const iconSizes = [16, 32, 48, 128];
  const iconBuffers = {};
  for (const size of iconSizes) {
    const buf = await renderSvgToPng(page, iconSvg, size, size);
    iconBuffers[size] = buf;
    writePng(path(`pretzel/public/icons/icon${size}.png`), buf);
  }

  // Larger master render of the icon, used as source for ICO/ICNS packing below.
  const icon512 = await renderSvgToPng(page, iconSvg, 512, 512);

  // --- Full lockups (icon + "mykka" wordmark), transparent, for <img> usage -----------
  // Rendered at 4x the 180x48 viewBox for crisp display up to ~180px wide / retina.
  const LOCKUP_W = 720;
  const LOCKUP_H = 192;
  const lockupDark = await renderSvgToPng(page, lockupDarkSvg, LOCKUP_W, LOCKUP_H);
  const lockupLight = await renderSvgToPng(page, lockupLightSvg, LOCKUP_W, LOCKUP_H);

  for (const pkg of ["pretzel", "pretzel-console"]) {
    writePng(path(`${pkg}/public/logo-dark.png`), lockupDark);
    writePng(path(`${pkg}/public/logo-light.png`), lockupLight);
  }

  await browser.close();

  // --- mykka-web favicon.ico (multi-size ICO packed from the 512px icon) --------------
  const favicoBuffer = png2icons.createICO(icon512, png2icons.BICUBIC2, 0, false, false);
  if (!favicoBuffer) throw new Error("png2icons.createICO returned null for favicon.ico");
  writePng(path("mykka-web/app/favicon.ico"), favicoBuffer);

  // --- pretzel-desktop/build icons (electron-builder: icon.icns / icon.ico / icon.png) -
  // electron-builder convention: Windows reads build/icon.ico, Linux reads build/icon.png
  // (512px is the standard electron-builder Linux size), macOS reads build/icon.icns.
  writePng(path("pretzel-desktop/build/icon.png"), icon512);

  const desktopIco = png2icons.createICO(icon512, png2icons.BICUBIC2, 0, false, true);
  if (!desktopIco) throw new Error("png2icons.createICO returned null for pretzel-desktop icon.ico");
  writePng(path("pretzel-desktop/build/icon.ico"), desktopIco);

  // ICNS packing via png2icons is pure-JS and works cross-platform, but it cannot be
  // visually verified on this (non-macOS) machine. If pretzel-desktop-release.yml's macOS
  // build reports a broken/blurry dock icon, regenerate manually on a Mac instead:
  //   mkdir icon.iconset
  //   sips -z 16 16     icon.png --out icon.iconset/icon_16x16.png
  //   sips -z 32 32     icon.png --out icon.iconset/icon_16x16@2x.png
  //   sips -z 32 32     icon.png --out icon.iconset/icon_32x32.png
  //   sips -z 64 64     icon.png --out icon.iconset/icon_32x32@2x.png
  //   sips -z 128 128   icon.png --out icon.iconset/icon_128x128.png
  //   sips -z 256 256   icon.png --out icon.iconset/icon_128x128@2x.png
  //   sips -z 256 256   icon.png --out icon.iconset/icon_256x256.png
  //   sips -z 512 512   icon.png --out icon.iconset/icon_256x256@2x.png
  //   sips -z 512 512   icon.png --out icon.iconset/icon_512x512.png
  //   cp icon.png icon.iconset/icon_512x512@2x.png
  //   iconutil -c icns icon.iconset -o icon.icns
  const desktopIcns = png2icons.createICNS(icon512, png2icons.BICUBIC2, 0);
  if (!desktopIcns) throw new Error("png2icons.createICNS returned null for pretzel-desktop icon.icns");
  writePng(path("pretzel-desktop/build/icon.icns"), desktopIcns);

  console.log("\nDone. Spot-check pretzel-desktop/build/icon.icns on the next macOS CI run of pretzel-desktop-release.yml.");
}

main().catch((err) => {
  console.error(err);
  process.exitCode = 1;
});
