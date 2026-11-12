// Extension model store on the Cache API (needs the "unlimitedStorage" permission for ~430 MB).
import type { ModelStore } from "./models";

const ORIGIN = "https://judge-v2.models.local";
const READY = "__ready__";

export function createCacheStore(openCache: () => Promise<Cache> = () => caches.open("judge-v2-models")): ModelStore {
  const key = (v: string, n: string) => `${ORIGIN}/${encodeURIComponent(v)}/${encodeURIComponent(n)}`;
  return {
    has: async (v, n) => (await (await openCache()).match(key(v, n))) !== undefined,
    async read(v, n) {
      const res = await (await openCache()).match(key(v, n));
      if (!res) throw new Error(`model file ${v}/${n} not cached`);
      return new Uint8Array(await res.arrayBuffer());
    },
    async write(v, n, data) {
      await (await openCache()).put(key(v, n), new Response(data as BodyInit));
    },
    async markReady(v) {
      await (await openCache()).put(key(v, READY), new Response("1"));
    },
    isReady: async (v) => (await (await openCache()).match(key(v, READY))) !== undefined,
    async prune(keep) {
      const cache = await openCache();
      const prefix = `${ORIGIN}/${encodeURIComponent(keep)}/`;
      for (const req of await cache.keys()) if (!req.url.startsWith(prefix)) await cache.delete(req.url);
    },
  };
}
