import { describe, it, expect } from "vitest";
import { mkdtempSync, readdirSync, existsSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { ensureModels, manifestFor, MANIFEST, loadModelFiles, sha256Hex, type ModelManifest, type ModelStore } from "../src/models";
import { createFsStore } from "../src/store-fs";
import { createCacheStore } from "../src/store-cache";

const enc = new TextEncoder();

class MemStore implements ModelStore {
  files = new Map<string, Uint8Array>(); ready = new Set<string>(); writes = 0;
  async has(v: string, n: string) { return this.files.has(`${v}/${n}`); }
  async read(v: string, n: string) { const f = this.files.get(`${v}/${n}`); if (!f) throw new Error("missing"); return f; }
  async write(v: string, n: string, d: Uint8Array) { this.writes++; this.files.set(`${v}/${n}`, d); }
  async markReady(v: string) { this.ready.add(v); }
  async isReady(v: string) { return this.ready.has(v); }
  async prune(keep: string) { for (const k of [...this.files.keys()]) if (!k.startsWith(`${keep}/`)) this.files.delete(k); }
}

async function tinyManifest(version = "t1"): Promise<{ m: ModelManifest; bodies: Map<string, Uint8Array> }> {
  const bodies = new Map<string, Uint8Array>();
  const file = async (name: string, text: string) => {
    const data = enc.encode(text); const url = `https://example.test/${version}/${name}`;
    bodies.set(url, data);
    return { name, url, bytes: data.length, sha256: await sha256Hex(data) };
  };
  return { m: { version, fast: [await file("fast-a", "AAA")], second: [await file("so-b", "BBBB")] }, bodies };
}

function fakeFetch(bodies: Map<string, Uint8Array>, opts: { failOn?: string; corrupt?: string } = {}) {
  const calls: string[] = [];
  const f = (async (url: string) => {
    calls.push(url);
    if (opts.failOn && url.endsWith(opts.failOn)) throw new Error("connection reset");
    const body = bodies.get(url)!;
    const data = opts.corrupt && url.endsWith(opts.corrupt) ? enc.encode("XXXX") : body;
    return new Response(data as BodyInit, { status: 200 });
  }) as unknown as typeof fetch;
  return { f, calls };
}

describe("model manifest", () => {
  it("v7 manifest lists the five files of each model with unique release-asset names", () => {
    expect(MANIFEST.version).toBe("v7");
    const names = [...MANIFEST.fast, ...MANIFEST.second].map((f) => f.name);
    expect(new Set(names).size).toBe(10);
    for (const f of [...MANIFEST.fast, ...MANIFEST.second]) {
      expect(f.sha256).toMatch(/^[0-9a-f]{64}$/); expect(f.bytes).toBeGreaterThan(0);
      expect(f.url).toBe(`https://github.com/yarin-mag/mykka.ai/releases/download/judge-v2-v7/${f.name}`);
    }
    expect(manifestFor("http://localhost:9/m/").fast[0]!.url).toBe(`http://localhost:9/m/${MANIFEST.fast[0]!.name}`);
  });
});

describe("ensureModels", () => {
  it("downloads, verifies, marks ready, prunes older versions", async () => {
    const { m, bodies } = await tinyManifest();
    const store = new MemStore(); await store.write("old", "x", enc.encode("x"));
    expect(await ensureModels(m, store, fakeFetch(bodies).f)).toBe("ready");
    expect(await store.isReady("t1")).toBe(true);
    expect(await store.has("old", "x")).toBe(false);
  });

  it("a checksum mismatch writes nothing for that file and fails", async () => {
    const { m, bodies } = await tinyManifest();
    const store = new MemStore();
    expect(await ensureModels(m, store, fakeFetch(bodies, { corrupt: "so-b" }).f)).toBe("failed");
    expect(await store.has("t1", "so-b")).toBe(false);
    expect(await store.isReady("t1")).toBe(false);
  });

  it("an interrupted download resumes with only the missing files", async () => {
    const { m, bodies } = await tinyManifest();
    const store = new MemStore();
    expect(await ensureModels(m, store, fakeFetch(bodies, { failOn: "so-b" }).f)).toBe("failed");
    const second = fakeFetch(bodies);
    expect(await ensureModels(m, store, second.f)).toBe("ready");
    expect(second.calls).toEqual(["https://example.test/t1/so-b"]);
  });

  it("concurrent calls share one download", async () => {
    const { m, bodies } = await tinyManifest();
    const store = new MemStore(); const ff = fakeFetch(bodies);
    const [a, b] = await Promise.all([ensureModels(m, store, ff.f), ensureModels(m, store, ff.f)]);
    expect([a, b]).toEqual(["ready", "ready"]);
    expect(ff.calls.length).toBe(2);
  });

  it("an already-ready version does no network at all", async () => {
    const { m, bodies } = await tinyManifest();
    const store = new MemStore(); await ensureModels(m, store, fakeFetch(bodies).f);
    const again = fakeFetch(bodies);
    expect(await ensureModels(m, store, again.f)).toBe("ready");
    expect(again.calls).toEqual([]);
  });
});

describe("stores", () => {
  it("fs store: atomic writes, ready marker, prune", async () => {
    const root = mkdtempSync(path.join(tmpdir(), "jv2-"));
    const s = createFsStore(root);
    await s.write("v1", "a.bin", enc.encode("hello"));
    expect(await s.has("v1", "a.bin")).toBe(true);
    expect(new TextDecoder().decode(await s.read("v1", "a.bin"))).toBe("hello");
    expect(readdirSync(path.join(root, "v1")).some((f) => f.endsWith(".part"))).toBe(false);
    expect(await s.isReady("v1")).toBe(false);
    await s.markReady("v1"); expect(await s.isReady("v1")).toBe(true);
    await s.write("v0", "b.bin", enc.encode("x"));
    await s.prune("v1");
    expect(existsSync(path.join(root, "v0"))).toBe(false);
    expect(existsSync(path.join(root, "v1"))).toBe(true);
  });

  it("cache store: round-trips bytes and the ready marker; prune drops other versions", async () => {
    const entries = new Map<string, Response>();
    const cache = {
      match: async (k: string) => entries.get(k)?.clone(),
      put: async (k: string, r: Response) => { entries.set(k, r); },
      delete: async (k: string) => entries.delete(k),
      keys: async () => [...entries.keys()].map((url) => ({ url })),
    };
    const s = createCacheStore(async () => cache as unknown as Cache);
    await s.write("v1", "a", enc.encode("abc")); await s.write("v0", "b", enc.encode("z"));
    expect(new TextDecoder().decode(await s.read("v1", "a"))).toBe("abc");
    await s.markReady("v1"); expect(await s.isReady("v1")).toBe(true); expect(await s.isReady("v0")).toBe(false);
    await s.prune("v1");
    expect(await s.has("v0", "b")).toBe(false); expect(await s.has("v1", "a")).toBe(true);
  });
});

describe("loadModelFiles", () => {
  it("builds ModelFiles from the stored files of one model", async () => {
    const store = new MemStore();
    const put = (n: string, t: string) => store.write("v7", n, enc.encode(t));
    await put("fast_v7-judge.onnx", "ONNX"); await put("fast_v7-tokenizer.json", "{}"); await put("fast_v7-tokenizer_config.json", "{\"a\":1}");
    await put("fast_v7-judge_config.json", JSON.stringify({ model_version: "fast_v7" }));
    await put("fast_v7-backbone_spec.json", JSON.stringify({ num_layers: 18, num_kv_heads: 1, head_dim: 256 }));
    const files = await loadModelFiles(MANIFEST, store, "fast");
    expect(new TextDecoder().decode(files.onnx as Uint8Array)).toBe("ONNX");
    expect(files.config.model_version).toBe("fast_v7");
    expect(files.backboneSpec.num_layers).toBe(18);
    expect(files.tokenizerConfigJson).toBe("{\"a\":1}");
  });
});
