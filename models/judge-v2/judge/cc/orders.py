import json
import random
from dataclasses import asdict, dataclass
from pathlib import Path

from judge.data.catalog import HELDOUT_LANGUAGES, HELDOUT_STYLES, LANGUAGES, MESSAGE_STYLES
from judge.data.schema import stable_id


@dataclass(frozen=True)
class Order:
    id: str
    kind: str
    language: str
    category_id: str | None
    styles: tuple
    n: int
    payload: tuple


def pair_orders(categories, n_per_order: int, seed: int) -> list[Order]:
    rng = random.Random(seed)
    all_styles = sorted(MESSAGE_STYLES)
    train_styles = sorted(set(MESSAGE_STYLES) - HELDOUT_STYLES)
    heldout_categories = {c.id for c in categories if c.heldout}
    out = []
    for lang in LANGUAGES:
        for cid in [c.id for c in categories] + [None]:
            is_test = lang in HELDOUT_LANGUAGES or cid in heldout_categories
            styles = all_styles if is_test else train_styles
            oid = stable_id("order", "pairs", lang, cid or "benign")
            out.append(Order(oid, "pairs", lang, cid, tuple(rng.sample(styles, 3)), n_per_order, ()))
    return out


def label_orders(items: list[dict], batch: int = 40) -> list[Order]:
    items = sorted(items, key=lambda x: x["pair_id"])
    return [Order(stable_id("order", "label", items[i]["pair_id"]), "label", "mixed", None, (),
                  len(items[i:i + batch]), tuple(items[i:i + batch])) for i in range(0, len(items), batch)]


def write_orders(orders, out_dir: Path) -> None:
    out_dir.mkdir(parents=True, exist_ok=True)
    for o in orders:
        (out_dir / f"{o.id}.json").write_text(json.dumps(asdict(o), ensure_ascii=False, indent=1), encoding="utf-8")


def read_order(path: Path) -> Order:
    d = json.loads(path.read_text(encoding="utf-8"))
    return Order(d["id"], d["kind"], d["language"], d["category_id"], tuple(d["styles"]), d["n"], tuple(d["payload"]))
