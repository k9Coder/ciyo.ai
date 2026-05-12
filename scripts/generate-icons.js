/**
 * Generates simple placeholder PNG icons using the Canvas API (Node.js).
 * Run with: node scripts/generate-icons.js
 *
 * For production, replace with proper SVG/PNG artwork.
 */
import { createCanvas } from "canvas";
import { writeFileSync, mkdirSync } from "fs";
import { join, dirname } from "path";
import { fileURLToPath } from "url";

const __dirname = dirname(fileURLToPath(import.meta.url));
const iconsDir = join(__dirname, "../public/icons");
mkdirSync(iconsDir, { recursive: true });

for (const size of [16, 32, 48, 128]) {
  const canvas = createCanvas(size, size);
  const ctx = canvas.getContext("2d");

  // Background
  ctx.fillStyle = "#dc2626";
  roundRect(ctx, 0, 0, size, size, size * 0.18);
  ctx.fill();

  // "PS" text
  ctx.fillStyle = "#ffffff";
  ctx.font = `bold ${Math.floor(size * 0.42)}px sans-serif`;
  ctx.textAlign = "center";
  ctx.textBaseline = "middle";
  ctx.fillText("PS", size / 2, size / 2);

  writeFileSync(join(iconsDir, `icon${size}.png`), canvas.toBuffer("image/png"));
  console.log(`Generated icon${size}.png`);
}

function roundRect(ctx, x, y, w, h, r) {
  ctx.beginPath();
  ctx.moveTo(x + r, y);
  ctx.lineTo(x + w - r, y);
  ctx.quadraticCurveTo(x + w, y, x + w, y + r);
  ctx.lineTo(x + w, y + h - r);
  ctx.quadraticCurveTo(x + w, y + h, x + w - r, y + h);
  ctx.lineTo(x + r, y + h);
  ctx.quadraticCurveTo(x, y + h, x, y + h - r);
  ctx.lineTo(x, y + r);
  ctx.quadraticCurveTo(x, y, x + r, y);
  ctx.closePath();
}
