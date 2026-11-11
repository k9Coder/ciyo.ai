// Judge v2 shadow ground truth: runs the planted probes (probes.json) through a BUILT extension's offscreen shadow
// runner in Playwright's Chromium and writes expected vs actual. Not a CI gate; run by hand.
//
//   pnpm build:staging            (or a dev build with VITE_JUDGE_V2_MODEL_BASE=<local model server>)
//   node scripts/judge-shadow-probes/run-probes.mjs dist [out.json]
//
// Each probe is judged against its own rule only. "caught" = block for expect=block; block or warn for expect=leak.
import { chromium } from "@playwright/test";
import { readFileSync, writeFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const here = path.dirname(fileURLToPath(import.meta.url));
const extPath = path.resolve(process.argv[2] ?? "dist");
const outPath = process.argv[3] ?? path.join(here, "probe-results.json");
const { rules, probes } = JSON.parse(readFileSync(path.join(here, "probes.json"), "utf-8"));
const RULE_ID = Object.fromEntries(Object.keys(rules).map((k, i) => [k, `00000000-0000-4000-8000-${String(i + 1).padStart(12, "0")}`]));

const context = await chromium.launchPersistentContext("", {
  headless: true, channel: "chromium",
  args: [`--disable-extensions-except=${extPath}`, `--load-extension=${extPath}`],
});
const sw = context.serviceWorkers()[0] ?? (await context.waitForEvent("serviceworker"));
await sw.evaluate(async () => {
  globalThis.__rows = [];
  chrome.runtime.onMessage.addListener((m) => { if (m?.type === "JUDGE_SHADOW_ROWS") globalThis.__rows.push(...m.rows); });
  const existing = await chrome.runtime.getContexts({ contextTypes: ["OFFSCREEN_DOCUMENT"] });
  if (!existing.length) await chrome.offscreen.createDocument({ url: "src/offscreen/index.html", reasons: ["WORKERS"], justification: "probes" });
});

async function judge(text, ruleKey) {
  await sw.evaluate(({ text, rule }) => {
    globalThis.__rows = [];
    return chrome.runtime.sendMessage({ type: "JUDGE_SHADOW_SUBMIT", payload: { text, rules: [rule], primary: { actionByRuleId: {} } } }).catch(() => {});
  }, { text, rule: { id: RULE_ID[ruleKey], kind: "judge_prompt", prompt: rules[ruleKey] } });
  for (;;) {
    await new Promise((r) => setTimeout(r, 200));
    const rows = await sw.evaluate(() => globalThis.__rows);
    if (rows.length) return rows[0];
  }
}

// Wait until the models are downloaded and loaded (first checks come back "skipped" until then).
const t0 = Date.now();
while ((await judge(probes[0].text, probes[0].rule)).secondaryVerdict === "skipped") {
  if (Date.now() - t0 > 15 * 60_000) throw new Error("models never became ready");
  await new Promise((r) => setTimeout(r, 5000));
}

const results = [];
for (const p of probes) {
  const row = await judge(p.text, p.rule);
  const v = row.secondaryVerdict;
  const caught = p.expect === "block" ? v === "block" : v === "block" || v === "warn";
  results.push({ id: p.id, rule: p.rule, expect: p.expect, verdict: v, fast: row.fastScore, second: row.secondScore, ms: row.latencyMs,
                 correct: p.expect === "ok" ? v === "ok" : caught });
  console.log(p.id, p.expect.padEnd(5), "->", v.padEnd(7), row.fastScore, row.secondScore, `${row.latencyMs} ms`);
}
await context.close();

const of = (e) => results.filter((r) => r.expect === e);
const blocks = results.filter((r) => r.verdict === "block");
const flagged = results.filter((r) => r.verdict === "block" || r.verdict === "warn");
const summary = {
  probes: results.length,
  blockRecall: of("block").filter((r) => r.verdict === "block").length / of("block").length,
  leakCaught: of("leak").filter((r) => r.correct).length / of("leak").length,
  okKept: of("ok").filter((r) => r.correct).length / of("ok").length,
  blockPrecision: blocks.length ? blocks.filter((r) => r.expect !== "ok").length / blocks.length : null,
  flagPrecision: flagged.length ? flagged.filter((r) => r.expect !== "ok").length / flagged.length : null,
  medianMs: results.map((r) => r.ms).sort((a, b) => a - b)[Math.floor(results.length / 2)],
};
writeFileSync(outPath, JSON.stringify({ summary, results }, null, 2));
console.log(JSON.stringify(summary, null, 2));
