"""
Export the fine-tuned HF model to ONNX fp32, then weight-only quantize to
8-bit (matmul_nbits_quantizer, block_size=32) — matches the scheme the
README documents for the currently-shipped themis.onnx.
"""
import torch
from transformers import AutoModelForSequenceClassification

FT_DIR = "./deberta-v3-small-vocabpruned-ft"
FP32_OUT = "themis_retrained_fp32.onnx"

model = AutoModelForSequenceClassification.from_pretrained(FT_DIR, dtype=torch.float32)
model.eval()

seq_len = 96
dummy_ids = torch.zeros((1, seq_len), dtype=torch.long)
dummy_mask = torch.ones((1, seq_len), dtype=torch.long)

torch.onnx.export(
    model,
    (dummy_ids, dummy_mask),
    FP32_OUT,
    input_names=["input_ids", "attention_mask"],
    output_names=["logits"],
    dynamic_axes={
        "input_ids": {0: "batch", 1: "seq"},
        "attention_mask": {0: "batch", 1: "seq"},
        "logits": {0: "batch"},
    },
    opset_version=17,
)
print(f"exported fp32 onnx to {FP32_OUT}")
