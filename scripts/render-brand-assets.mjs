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

  // --- logo-dark.png / logo-light.png: icon-only, transparent, for <img> usage --------
  // Every in-app consumer (PretzelLogo in the console sidebar, WarningModal's 20x20 badge,
  // Popup's LogoIcon) renders this image next to its OWN separately-coded "Pretzel" /
  // wordmark text/component — the image itself must be a square icon, not a wide lockup,
  // or it overflows/squishes next to that adjacent text. Crop just the icon-badge region
  // (viewBox units 0,0 to 48,48) out of the full lockup SVGs — via an overflow:hidden
  // wrapper sized to the crop, so each theme keeps its correct hardcoded badge colors —
  // rendered at 4x (192px) for retina sharpness.
  async function renderIconCrop(svg) {
    const scale = 8;
    const cropPx = 48 * scale;
    await page.setViewportSize({ width: cropPx, height: cropPx });
    await page.setContent(
      `<html><body style="margin:0;padding:0">` +
        `<div style="width:${cropPx}px;height:${cropPx}px;overflow:hidden">` +
        `<div id="target" style="width:${180 * scale}px;height:${48 * scale}px">${svg}</div>` +
        `</div></body></html>`
    );
    return page.screenshot({ omitBackground: true });
  }
  const iconDark = await renderIconCrop(lockupDarkSvg);
  const iconLight = await renderIconCrop(lockupLightSvg);

  for (const pkg of ["pretzel", "pretzel-console"]) {
    writePng(path(`${pkg}/public/logo-dark.png`), iconDark);
    writePng(path(`${pkg}/public/logo-light.png`), iconLight);
  }

  // --- mykka-web/public/images: sitewide logo.png (schema publisher.logo) + og-default.png
  // (social-share fallback). Reuses the same 512px icon render as the favicon/desktop icons
  // below, plus the full lockup SVG composed onto a branded card for the OG image.
  writePng(path("mykka-web/public/images/logo.png"), icon512);

  const ogWidth = 1200;
  const ogHeight = 630;
  await page.setViewportSize({ width: ogWidth, height: ogHeight });
  await page.setContent(
    `<html><body style="margin:0;padding:0">` +
      `<div style="width:${ogWidth}px;height:${ogHeight}px;background:#0b0e16;display:flex;align-items:center;justify-content:center;position:relative;overflow:hidden;font-family:'Segoe UI',system-ui,sans-serif">` +
      `<div style="position:absolute;width:900px;height:900px;border-radius:50%;background:radial-gradient(circle, rgba(91,140,255,0.18) 0%, rgba(91,140,255,0) 65%)"></div>` +
      `<div style="position:relative;display:flex;flex-direction:column;align-items:center;gap:28px">` +
      `<div style="width:540px;height:144px">${lockupDarkSvg}</div>` +
      `<div style="color:#9aa4bc;font-size:28px;font-weight:500;letter-spacing:-0.2px">AI Prompt Data Loss Prevention</div>` +
      `</div></div></body></html>`
  );
  const ogBuffer = await page.screenshot();
  writePng(path("mykka-web/public/images/og-default.png"), ogBuffer);

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
