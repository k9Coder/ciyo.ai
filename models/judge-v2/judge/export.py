import json
import shutil
from pathlib import Path

import torch
from onnxruntime.quantization import QuantType, quantize_dynamic

from judge.backbone import spec_from_json
from judge.model import load_judge

BASE_INPUTS = ["input_ids", "position_ids", "attn_bias"]
BASE_AXES = {"input_ids": {1: "S"}, "position_ids": {1: "S"}, "attn_bias": {2: "S", 3: "T"}, "verdict": {1: "S"}}


def kv_names(num_layers: int, kind: str) -> list[str]:
    """Per-layer KV tensor names: all K tensors then all V tensors, e.g. past_k_0..past_k_17, past_v_0.."""
    return [f"{kind}_{kv}_{i}" for kv in ("k", "v") for i in range(num_layers)]


class KVExportJudge(torch.nn.Module):
    """Export wrapper: one fp16 KV tensor per layer instead of stacked fp32 tensors.

    Stacking all layers' presents (and keeping them in fp32) held the KV cache about three times over
    during a step; separate half-precision tensors keep peak RAM near one fp32 copy.
    """

    def __init__(self, model):
        super().__init__()
        self.model = model

    def forward(self, input_ids, position_ids, attn_bias, *past):
        bb = self.model.backbone
        n = len(bb.layers)
        x = bb.embed_tokens(input_ids) * bb.embed_scale
        ks, vs = [], []
        for i, layer in enumerate(bb.layers):
            x, k, v = layer(x, position_ids, attn_bias, past[i].float(), past[n + i].float())
            ks.append(k.half())
            vs.append(v.half())
        return (self.model.head(bb.norm(x)), *ks, *vs)


def export_model_dir(run_dir: Path, out_dir: Path, quantize: bool = True) -> Path:
    out_dir.mkdir(parents=True, exist_ok=True)
    model = load_judge(run_dir)
    spec = spec_from_json(json.loads((run_dir / "backbone_spec.json").read_text(encoding="utf-8")))
    s, p, n = 4, 3, spec.num_layers
    past = [torch.zeros(1, spec.num_kv_heads, p, spec.head_dim, dtype=torch.float16) for _ in range(2 * n)]
    args = (torch.zeros(1, s, dtype=torch.long), torch.arange(p, p + s)[None], torch.zeros(1, 1, s, p + s), *past)
    past_names, present_names = kv_names(n, "past"), kv_names(n, "present")
    axes = {**BASE_AXES, **{k: {2: "P"} for k in past_names}, **{k: {2: "T"} for k in present_names}}
    fp32 = out_dir / "judge_fp32.onnx"
    torch.onnx.export(KVExportJudge(model).eval(), args, str(fp32), opset_version=18, dynamo=False,
                      input_names=BASE_INPUTS + past_names, output_names=["verdict"] + present_names,
                      dynamic_axes=axes)
    final = out_dir / "judge.onnx"
    if quantize:
        quantize_dynamic(str(fp32), str(final), weight_type=QuantType.QInt8, op_types_to_quantize=["MatMul", "Gather"])
        fp32.unlink()
    else:
        fp32.replace(final)
    for name in ["judge_config.json", "backbone_spec.json", "vocab_remap.json"]:
        if (run_dir / name).exists():
            shutil.copy2(run_dir / name, out_dir / name)
    for f in (run_dir / "tokenizer").iterdir():
        shutil.copy2(f, out_dir / f.name)
    return out_dir
