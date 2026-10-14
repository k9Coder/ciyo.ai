import json
import shutil
from pathlib import Path

import torch
from onnxruntime.quantization import QuantType, quantize_dynamic

from judge.backbone import spec_from_json
from judge.model import load_judge

ONNX_INPUTS = ["input_ids", "position_ids", "attn_bias", "past_k", "past_v"]
ONNX_OUTPUTS = ["verdict", "present_k", "present_v"]
DYNAMIC_AXES = {
    "input_ids": {1: "S"}, "position_ids": {1: "S"}, "attn_bias": {2: "S", 3: "T"},
    "past_k": {3: "P"}, "past_v": {3: "P"},
    "verdict": {1: "S"}, "present_k": {3: "T"}, "present_v": {3: "T"},
}


def export_model_dir(run_dir: Path, out_dir: Path, quantize: bool = True) -> Path:
    out_dir.mkdir(parents=True, exist_ok=True)
    model = load_judge(run_dir)
    spec = spec_from_json(json.loads((run_dir / "backbone_spec.json").read_text(encoding="utf-8")))
    s, p = 4, 3
    past = torch.zeros(spec.num_layers, 1, spec.num_kv_heads, p, spec.head_dim)
    args = (torch.zeros(1, s, dtype=torch.long), torch.arange(p, p + s)[None], torch.zeros(1, 1, s, p + s),
            past, past.clone())
    fp32 = out_dir / "judge_fp32.onnx"
    torch.onnx.export(model, args, str(fp32), opset_version=18, dynamo=False, input_names=ONNX_INPUTS,
                      output_names=ONNX_OUTPUTS, dynamic_axes=DYNAMIC_AXES)
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
