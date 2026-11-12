import hashlib
import tarfile

from judge.archive import build


def test_build_archives_data_and_model_with_checksums(tmp_path):
    a, b, model = tmp_path / "all", tmp_path / "stage1", tmp_path / "model"
    for d in (a, b, model):
        d.mkdir()
    (a / "test.jsonl").write_text("t")
    (a / "splits.json").write_text("{}")
    (b / "train.jsonl").write_text("s")
    (model / "judge.onnx").write_bytes(b"onnx")
    manifest = build([a, b], model, tmp_path / "out")
    lines = manifest.read_text().splitlines()
    assert {l.split("  ", 1)[1] for l in lines} == {"judge-v2-data.tar.gz", "model/judge.onnx"}
    for line in lines:
        digest, rel = line.split("  ", 1)
        assert hashlib.sha256((tmp_path / "out" / rel).read_bytes()).hexdigest() == digest
    with tarfile.open(tmp_path / "out" / "judge-v2-data.tar.gz") as tf:
        names = tf.getnames()
    assert {"all/test.jsonl", "all/splits.json", "stage1/train.jsonl", "LABELING_POLICY.md"} <= set(names)
