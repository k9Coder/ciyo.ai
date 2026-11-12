// Desktop model store: <root>/<version>/<name>, written as <name>.part then renamed, READY marker per version.
import { promises as fs } from "node:fs";
import path from "node:path";
import type { ModelStore } from "./models";

const READY = "READY";

export function createFsStore(root: string): ModelStore {
  const dir = (v: string) => path.join(root, v);
  const file = (v: string, n: string) => path.join(root, v, n);
  const exists = (p: string) => fs.access(p).then(() => true, () => false);
  return {
    has: (v, n) => exists(file(v, n)),
    read: async (v, n) => new Uint8Array(await fs.readFile(file(v, n))),
    async write(v, n, data) {
      await fs.mkdir(dir(v), { recursive: true });
      const part = `${file(v, n)}.part`;
      await fs.writeFile(part, data);
      await fs.rename(part, file(v, n));
    },
    async markReady(v) {
      await fs.mkdir(dir(v), { recursive: true });
      await fs.writeFile(file(v, READY), "");
    },
    isReady: (v) => exists(file(v, READY)),
    async prune(keep) {
      const entries = await fs.readdir(root, { withFileTypes: true }).catch(() => []);
      await Promise.all(entries.filter((e) => e.isDirectory() && e.name !== keep)
        .map((e) => fs.rm(path.join(root, e.name), { recursive: true, force: true })));
    },
  };
}
