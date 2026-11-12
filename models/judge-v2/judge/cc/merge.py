from judge.data.schema import Label


def p_from(verdict: str, confidence: float) -> float:
    conf = min(1.0, max(0.5, float(confidence)))
    return conf if verdict == "match" else 1.0 - conf


def needs_second_pass(label: Label, is_test: bool, threshold: float = 0.85) -> bool:
    if label.status == "construction":
        return False
    return is_test or max(label.p_match, 1.0 - label.p_match) < threshold


def merge_second_pass(labels: list[Label], p2: dict) -> list[Label]:
    out = []
    for l in labels:
        if l.pair_id not in p2:
            out.append(l)
        elif (l.p_match >= 0.5) == (p2[l.pair_id] >= 0.5):
            out.append(Label(l.pair_id, (l.p_match + p2[l.pair_id]) / 2, "agreed"))
        else:
            out.append(Label(l.pair_id, l.p_match, "disagreed"))
    return out
