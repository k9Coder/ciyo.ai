from judge.data.devx import devx_pairs
from judge.data.schema import Message, Rule


def test_devx_pairs_use_val_claude_messages_and_other_categories():
    msgs = [Message("v1", "us_ssn", "positive", "email_draft", "en", "t", False, None, "v1", "claude"),
            Message("t1", "us_ssn", "positive", "email_draft", "en", "t", False, None, "t1", "claude")]
    rules = [Rule("r1", "us_ssn", "en", "a", "claude"), Rule("r2", "password", "en", "b", "claude"),
             Rule("r3", "private_key", "en", "c", "claude"), Rule("r4", "password", "he", "d", "claude")]
    pairs = devx_pairs(msgs, rules, {"v1": "val", "t1": "train"}, per_message=5, seed=1)
    assert pairs == [("v1", "r2")]
