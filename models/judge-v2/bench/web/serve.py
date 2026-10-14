"""Serve the Chrome benchmark with COOP/COEP (WASM threads) and write the POSTed result."""
import argparse
import http.server
import threading
from pathlib import Path

HERE = Path(__file__).resolve().parent
REPO = HERE.parents[3]


def ort_dist() -> Path:
    found = sorted(REPO.glob("node_modules/.pnpm/onnxruntime-web@*/node_modules/onnxruntime-web/dist"))
    if not found:
        raise SystemExit("onnxruntime-web not found in the pnpm store; run pnpm install at the repo root")
    return found[-1]


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("--model-dir", type=Path, required=True)
    ap.add_argument("--inputs", type=Path, required=True)
    ap.add_argument("--out", type=Path, required=True)
    ap.add_argument("--port", type=int, default=8766)
    a = ap.parse_args()
    routes = {"/": HERE / "index.html", "/judge_steps.mjs": HERE.parent / "judge_steps.mjs", "/inputs.json": a.inputs}
    dist, done = ort_dist(), threading.Event()

    class Handler(http.server.BaseHTTPRequestHandler):
        def _file(self, path: Path):
            if not path.is_file():
                self.send_error(404)
                return
            ctype = {".mjs": "text/javascript", ".js": "text/javascript", ".wasm": "application/wasm",
                     ".html": "text/html", ".json": "application/json"}.get(path.suffix, "application/octet-stream")
            data = path.read_bytes()
            self.send_response(200)
            self.send_header("Content-Type", ctype)
            self.send_header("Content-Length", str(len(data)))
            self.send_header("Cross-Origin-Opener-Policy", "same-origin")
            self.send_header("Cross-Origin-Embedder-Policy", "require-corp")
            self.end_headers()
            self.wfile.write(data)

        def do_GET(self):
            p = self.path.split("?")[0]
            if p in routes:
                return self._file(routes[p])
            if p.startswith("/ort/"):
                return self._file(dist / Path(p[5:]).name)
            if p.startswith("/model/"):
                return self._file(a.model_dir / Path(p[7:]).name)
            self.send_error(404)

        def do_POST(self):
            if self.path != "/result":
                return self.send_error(404)
            body = self.rfile.read(int(self.headers.get("Content-Length", 0)))
            a.out.write_bytes(body)
            self.send_response(204)
            self.end_headers()
            done.set()

        def log_message(self, *args):
            pass

    server = http.server.ThreadingHTTPServer(("127.0.0.1", a.port), Handler)
    threading.Thread(target=server.serve_forever, daemon=True).start()
    print(f"open http://127.0.0.1:{a.port}/ in Chrome; waiting for results…", flush=True)
    done.wait()
    server.shutdown()
    print(f"wrote {a.out}")


if __name__ == "__main__":
    main()
