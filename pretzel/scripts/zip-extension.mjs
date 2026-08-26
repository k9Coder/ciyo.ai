import JSZip from "jszip";
import { readFile, readdir, stat, mkdir } from "node:fs/promises";
import { createWriteStream } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const rootDir = path.dirname(path.dirname(fileURLToPath(import.meta.url)));
const distDir = path.join(rootDir, "dist");
const outDir = path.join(rootDir, "release");

async function addDir(zip, dir, base) {
  for (const entry of await readdir(dir)) {
    const fullPath = path.join(dir, entry);
    const s = await stat(fullPath);
    const zipPath = path.join(base, entry).replace(/\\/g, "/");
    if (s.isDirectory()) {
      await addDir(zip, fullPath, zipPath);
    } else {
      zip.file(zipPath, await readFile(fullPath));
    }
  }
}

async function main() {
  const manifestRaw = await readFile(path.join(distDir, "manifest.json"), "utf8");
  const { version } = JSON.parse(manifestRaw);
  const mode = process.argv[2] ?? "build";

  const zip = new JSZip();
  await addDir(zip, distDir, "");

  await mkdir(outDir, { recursive: true });
  const outPath = path.join(outDir, `pretzel-v${version}-${mode}.zip`);

  await new Promise((resolve, reject) => {
    zip
      .generateNodeStream({ type: "nodebuffer", streamFiles: true, compression: "DEFLATE" })
      .pipe(createWriteStream(outPath))
      .on("finish", resolve)
      .on("error", reject);
  });

  console.log(`Wrote ${outPath}`);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
