import json
from dataclasses import asdict, dataclass
from pathlib import Path

PROMPT_VERSION = "v1"
INSTRUCTIONS = (
    "You are a data-loss-prevention judge. You will read a message a person is about to send "
    "to an AI assistant, followed by a rule. Decide whether the message itself satisfies the rule.\n\n"
    "Message:\n"
)
RULE_PREFIX = "\n\nRule: "
VERDICT_SUFFIX = "\nVerdict:"


@dataclass(frozen=True)
class JudgeConfig:
    model_version: str
    base_model: str
    temperature: float = 1.0
    threshold: float = 0.5
    prompt_version: str = PROMPT_VERSION
    instructions: str = INSTRUCTIONS
    rule_prefix: str = RULE_PREFIX
    verdict_suffix: str = VERDICT_SUFFIX
    max_chunk_tokens: int = 500
    max_message_tokens: int = 4096
    window_overlap_tokens: int = 256
    vocab_remap_file: str | None = None

    def __post_init__(self):
        if not self.temperature > 0:
            raise ValueError("temperature must be > 0")
        if not 0 < self.threshold < 1:
            raise ValueError("threshold must be in (0, 1)")
        if self.max_chunk_tokens <= 0:
            raise ValueError("max_chunk_tokens must be > 0")
        if not 0 <= self.window_overlap_tokens < self.max_message_tokens:
            raise ValueError("window_overlap_tokens must be in [0, max_message_tokens)")

    def save(self, path: Path) -> None:
        path.write_text(json.dumps(asdict(self), indent=2, sort_keys=True) + "\n", encoding="utf-8")

    @staticmethod
    def load(path: Path) -> "JudgeConfig":
        return JudgeConfig(**json.loads(path.read_text(encoding="utf-8")))
