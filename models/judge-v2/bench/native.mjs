// usage: node bench/native.mjs <model_dir> <inputs.json> <out.json>
import { readFileSync, writeFileSync } from "node:fs";
import { createRequire } from "node:module";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { benchScenario, prefixState } from "./judge_steps.mjs";

const here = path.dirname(fileURLToPath(import.meta.url));
const repo = path.resolve(here, "../../..");
const ort = createRequire(path.join(repo, "pretzel-desktop", "package.json"))("onnxruntime-node");
const [modelDir, inputsPath, outPath] = process.argv.slice(2);
const input = JSON.parse(readFileSync(inputsPath, "utf8"));
let peak = 0;
const timer = setInterval(() => { peak = Math.max(peak, process.memoryUsage().rss); }, 20);
const sess = await ort.InferenceSession.create(path.join(modelDir, "judge.onnx"), { enableCpuMemArena: false });
const pre = await prefixState(ort, sess, input);
const scenarios = [];
for (const sc of input.scenarios.filter((s) => s.platform === "native")) {
  const ms = await benchScenario(ort, sess, input, pre, sc);
  scenarios.push({ name: sc.name, ms: Math.round(ms), gate_ms: sc.gate_ms });
  console.log(sc.name, Math.round(ms), "ms");
}
clearInterval(timer);
peak = Math.max(peak, process.memoryUsage().rss);
writeFileSync(outPath, JSON.stringify({ platform: "native", scenarios, peak_rss_mb: Math.round(peak / 1e6) }, null, 2));
