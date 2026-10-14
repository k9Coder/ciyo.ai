import argparse
import hashlib
import shutil
import tarfile
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
EXTRAS = ["LABELING_POLICY.md", "DATA_LICENSES.md", "templates"]


def _sha256(path: Path) -> str:
    h = hashlib.sha256()
    with path.open("rb") as f:
        for block in iter(lambda: f.read(1 << 20), b""):
            h.update(block)
    return h.hexdigest()


def build(data_dirs: list[Path], model_dir: Path, out_dir: Path) -> Path:
    out_dir.mkdir(parents=True, exist_ok=True)
    tar_path = out_dir / "judge-v2-data.tar.gz"
    with tarfile.open(tar_path, "w:gz") as tf:
        for d in data_dirs:
            for f in sorted(d.iterdir()):
                if f.is_file() and f.suffix in (".jsonl", ".json"):
                    tf.add(f, arcname=f"{d.name}/{f.name}")
        for name in EXTRAS:
            if (ROOT / name).exists():
                tf.add(ROOT / name, arcname=name)
    model_out = out_dir / "model"
    model_out.mkdir(exist_ok=True)
    for f in sorted(model_dir.iterdir()):
        if f.is_file():
            shutil.copy2(f, model_out / f.name)
    files = [tar_path] + sorted(model_out.iterdir())
    manifest = out_dir / "ARTIFACTS.sha256"
    manifest.write_text("".join(f"{_sha256(f)}  {f.relative_to(out_dir).as_posix()}\n" for f in files), encoding="utf-8")
    return manifest


def main(argv=None):
    ap = argparse.ArgumentParser(prog="judge.archive")
    ap.add_argument("--data-dirs", type=Path, nargs="+", required=True)
    ap.add_argument("--model-dir", type=Path, required=True)
    ap.add_argument("--out", type=Path, required=True)
    a = ap.parse_args(argv)
    print(build(a.data_dirs, a.model_dir, a.out))


if __name__ == "__main__":
    main()
