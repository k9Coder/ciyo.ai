import { copyFileSync, existsSync } from "fs";
import { join } from "path";

const env = process.argv[2];
if (!env || !["staging", "prod"].includes(env)) {
  console.error("Usage: node scripts/set-env.mjs <staging|prod>");
  process.exit(1);
}

// backend, ciyo-web and pretzel-desktop need a file copy; Vite packages use --mode at build time
const copies = [
  { pkg: "backend", src: `.env.${env}`, dest: ".env" },
  { pkg: "ciyo-web", src: `.env.${env}`, dest: ".env.local" },
  { pkg: "pretzel-desktop", src: `.env.${env}`, dest: ".env" },
];

for (const { pkg, src, dest } of copies) {
  const srcPath = join(pkg, src);
  const destPath = join(pkg, dest);
  if (!existsSync(srcPath)) {
    console.warn(`⚠  ${srcPath} not found — skipped`);
    continue;
  }
  copyFileSync(srcPath, destPath);
  console.log(`✓  ${pkg}/${dest}  ←  ${src}`);
}

console.log(`\nEnvironment set to: ${env}`);
console.log("Vite packages (pretzel, pretzel-console) use --mode at build time.");
console.log(`  pretzel:         pnpm build:${env}  or  pnpm dev:${env}`);
console.log(`  pretzel-console: pnpm dev:${env}    or  pnpm build:${env}`);
console.log("pretzel-desktop: .env copied — rebuild with pnpm build (values are baked at build time).");
