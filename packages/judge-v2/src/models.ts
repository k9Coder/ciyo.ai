// Model delivery: a pinned manifest, checksum-verified downloads into a pluggable store (fs on desktop, Cache API
// in the extension), and loading a model's files back out of the store.
import v7 from "./manifest-v7.json";
import type { ModelFiles } from "./scorer";

export interface ModelFile { name: string; url: string; bytes: number; sha256: string }
export interface ModelManifest { version: string; fast: ModelFile[]; second: ModelFile[] }

export interface ModelStore {
  has(version: string, name: string): Promise<boolean>;
  read(version: string, name: string): Promise<Uint8Array>;
  write(version: string, name: string, data: Uint8Array): Promise<void>;
  markReady(version: string): Promise<void>;
  isReady(version: string): Promise<boolean>;
  prune(keep: string): Promise<void>;
}

export type EnsureStatus = "ready" | "downloading" | "failed";

/** GitHub Release of the repo the desktop app already publishes to (electron-builder.yml `publish`). */
export const DEFAULT_MODEL_BASE = `https://github.com/yarin-mag/mykka.ai/releases/download/judge-v2-${v7.version}/`;

export function manifestFor(base: string): ModelManifest {
  const root = base.endsWith("/") ? base : `${base}/`;
  const files = (list: typeof v7.fast) => list.map(({ name, bytes, sha256 }) => ({ name, bytes, sha256, url: root + name }));
  return { version: v7.version, fast: files(v7.fast), second: files(v7.second) };
}

export const MANIFEST: ModelManifest = manifestFor(DEFAULT_MODEL_BASE);

export async function sha256Hex(data: Uint8Array): Promise<string> {
  const digest = await globalThis.crypto.subtle.digest("SHA-256", data as BufferSource);
  return [...new Uint8Array(digest)].map((b) => b.toString(16).padStart(2, "0")).join("");
}

const inFlight = new WeakMap<ModelStore, Promise<EnsureStatus>>();

async function download(m: ModelManifest, store: ModelStore, fetchFn: typeof fetch): Promise<EnsureStatus> {
  if (await store.isReady(m.version)) return "ready";
  let ok = true;
  for (const f of [...m.fast, ...m.second]) {
    if (await store.has(m.version, f.name)) continue;
    try {
      const res = await fetchFn(f.url);
      if (!res.ok) { ok = false; continue; }
      const data = new Uint8Array(await res.arrayBuffer());
      if (data.length !== f.bytes || (await sha256Hex(data)) !== f.sha256) { ok = false; continue; }
      await store.write(m.version, f.name, data);
    } catch {
      ok = false;
    }
  }
  if (!ok) return "failed";
  await store.markReady(m.version);
  await store.prune(m.version);
  return "ready";
}

/** Download every missing file of the manifest; resumable, checksum-verified, one download per store at a time. */
export function ensureModels(m: ModelManifest, store: ModelStore, fetchFn: typeof fetch): Promise<EnsureStatus> {
  const running = inFlight.get(store);
  if (running) return running;
  const p = download(m, store, fetchFn).catch(() => "failed" as const).finally(() => inFlight.delete(store));
  inFlight.set(store, p);
  return p;
}

const text = new TextDecoder();

/** One model's files from the store, in the shape createOnnxScorer takes. */
export async function loadModelFiles(m: ModelManifest, store: ModelStore, which: "fast" | "second"): Promise<ModelFiles> {
  const list = which === "fast" ? m.fast : m.second;
  const get = async (suffix: string) => {
    const f = list.find((x) => x.name.endsWith(`-${suffix}`));
    if (!f) throw new Error(`manifest has no ${suffix} for ${which}`);
    return store.read(m.version, f.name);
  };
  const str = async (s: string) => text.decode(await get(s));
  return {
    onnx: await get("judge.onnx"),
    tokenizerJson: await str("tokenizer.json"),
    tokenizerConfigJson: await str("tokenizer_config.json"),
    config: JSON.parse(await str("judge_config.json")),
    backboneSpec: JSON.parse(await str("backbone_spec.json")),
  };
}
