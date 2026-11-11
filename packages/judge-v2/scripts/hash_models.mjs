// Prints the model manifest (name, bytes, sha256) for a judge v2 release from local artifacts.
// Usage: node scripts/hash_models.mjs <artifacts-dir> <version> > src/manifest-<version>.json
// Release asset names are "<model>-<file>" so the two models' judge.onnx files do not collide.
import { createHash } from "node:crypto";
import { createReadStream, statSync } from "node:fs";
import path from "node:path";

const [dir, version] = process.argv.slice(2);
if (!dir || !version) { console.error("usage: hash_models.mjs <artifacts-dir> <version>"); process.exit(2); }
const FILES = ["judge.onnx", "tokenizer.json", "tokenizer_config.json", "judge_config.json", "backbone_spec.json"];

const sha = (p) => new Promise((res, rej) => {
  const h = createHash("sha256");
  createReadStream(p).on("data", (d) => h.update(d)).on("end", () => res(h.digest("hex"))).on("error", rej);
});

const out = { version, fast: [], second: [] };
for (const [key, model] of [["fast", `fast_${version}`], ["second", `so_${version}`]]) {
  for (const f of FILES) {
    const p = path.join(dir, model, f);
    out[key].push({ name: `${model}-${f}`, source: `${model}/${f}`, bytes: statSync(p).size, sha256: await sha(p) });
  }
}
console.log(JSON.stringify(out, null, 2));
