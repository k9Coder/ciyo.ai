import json
from pathlib import Path

from transformers import AutoTokenizer

from judge.config import JudgeConfig


class JudgeTokenizer:
    def __init__(self, hf_tokenizer, cfg: JudgeConfig, remap: dict[int, int] | None = None,
                 fallback_id: int | None = None):
        if remap is not None and fallback_id is None:
            raise ValueError("a vocab remap needs a fallback id")
        self.hf, self.cfg, self.remap, self.fallback_id = hf_tokenizer, cfg, remap, fallback_id

    @staticmethod
    def load(tokenizer_dir: Path, cfg: JudgeConfig, remap_path: Path | None = None) -> "JudgeTokenizer":
        hf = AutoTokenizer.from_pretrained(str(tokenizer_dir))
        if remap_path is None:
            return JudgeTokenizer(hf, cfg)
        data = json.loads(remap_path.read_text(encoding="utf-8"))
        remap = {int(k): int(v) for k, v in data["old_to_new"].items()}
        return JudgeTokenizer(hf, cfg, remap, int(data["fallback_new_id"]))

    def _map(self, ids: list[int]) -> list[int]:
        if self.remap is None:
            return list(ids)
        return [self.remap.get(i, self.fallback_id) for i in ids]

    def _encode(self, text: str) -> list[int]:
        return self._map(self.hf.encode(text, add_special_tokens=False))

    def prefix_ids(self) -> list[int]:
        bos = [] if self.hf.bos_token_id is None else self._map([self.hf.bos_token_id])
        return bos + self._encode(self.cfg.instructions)

    def message_ids(self, text: str) -> list[int]:
        return self._encode(text)

    def rule_ids(self, text: str) -> list[int]:
        rule = text.strip()
        if not rule:
            raise ValueError("rule text is empty")
        return self._encode(self.cfg.rule_prefix + rule + self.cfg.verdict_suffix)

    def char_to_token_index(self, text: str, char_pos: int) -> int:
        return len(self._encode(text[:char_pos]))
