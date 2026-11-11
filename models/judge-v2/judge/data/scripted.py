import json
import random
import re
import string
from dataclasses import dataclass
from pathlib import Path

from faker import Faker

from judge.data.catalog import CATEGORIES, LANGUAGES, MESSAGE_STYLES, category_by_id, has_script
from judge.data.schema import Label, Message, Pair, Rule, stable_id
from judge.data.splits import message_is_test, rule_is_test_only

SPAN = re.compile(r"\[\[(.*?)\]\]", re.S)
SLOT = re.compile(r"\{([a-z_]+)\}")
CODENAME_WORDS = ["zephyr", "falcon", "orion", "apollo", "aurora", "nimbus", "atlas", "cobalt", "ember", "harbor",
                  "juniper", "kestrel", "lumen", "mosaic", "nova", "onyx", "quartz", "sierra", "talon", "vortex"]
NON_US_ID_LOCALES = ["fr_FR", "it_IT", "nl_NL", "es_ES", "pt_BR", "he_IL", "zh_CN"]
_CATS = category_by_id(CATEGORIES)


def _rand(rng, alphabet, n):
    return "".join(rng.choice(alphabet) for _ in range(n))


_ALNUM = string.ascii_letters + string.digits


def _api_key(fake, rng):
    kind = rng.choice(["aws", "github", "openai", "slack", "google"])
    if kind == "aws":
        return "AKIA" + _rand(rng, string.ascii_uppercase + string.digits, 16)
    if kind == "github":
        return "ghp_" + _rand(rng, _ALNUM, 36)
    if kind == "openai":
        return "sk-" + _rand(rng, _ALNUM, 48)
    if kind == "slack":
        return f"xoxb-{_rand(rng, string.digits, 12)}-{_rand(rng, string.digits, 13)}-{_rand(rng, _ALNUM, 24)}"
    return "AIza" + _rand(rng, _ALNUM + "_-", 35)


def _amount(fake, rng):
    kind = rng.choice(["plain", "thousands", "millions"])
    if kind == "plain":
        return f"{rng.randint(1_000, 250_000):,}"
    if kind == "thousands":
        return f"{rng.randint(5, 950)}K"
    return f"{rng.randint(1, 999)}.{rng.randint(0, 9)}M"


def _password(fake, rng):
    return _rand(rng, string.ascii_letters + string.digits + "!@#$%^&*", rng.randint(10, 16))


def _private_key(fake, rng):
    body = "\n".join(_rand(rng, string.ascii_letters + string.digits + "+/", 64) for _ in range(4))
    return f"-----BEGIN OPENSSH PRIVATE KEY-----\n{body}\n-----END OPENSSH PRIVATE KEY-----"


def _db_url(fake, rng):
    return f"postgres://{fake.user_name()}:{_password(fake, rng)}@{fake.hostname()}:5432/{fake.user_name()}"


def _codename(fake, rng):
    name = "-".join(w.capitalize() for w in rng.sample(CODENAME_WORDS, rng.choice([1, 2])))
    return name + (f"-{rng.randint(1, 99)}" if rng.random() < 0.5 else "")


def _us_ssn(fake, rng):
    return Faker("en_US").ssn()


def _national_id(fake, rng):
    other = Faker(rng.choice(NON_US_ID_LOCALES))
    other.seed_instance(rng.randint(0, 10**9))
    return other.ssn()


FILLERS = {
    "name": lambda f, r: f.name(),
    "company": lambda f, r: f.company(),
    "date": lambda f, r: f.date_this_year().isoformat(),
    "amount": _amount,
    "product": lambda f, r: f.word().capitalize(),
    "us_ssn": _us_ssn,
    "national_id": _national_id,
    "passport": lambda f, r: r.choice(string.ascii_uppercase) + _rand(r, string.digits, 8),
    "address": lambda f, r: f.address().replace("\n", ", "),
    "phone": lambda f, r: f.phone_number(),
    "email": lambda f, r: f.email(),
    "dob": lambda f, r: f.date_of_birth().isoformat(),
    "api_key": _api_key,
    "password": _password,
    "private_key": _private_key,
    "db_url": _db_url,
    "card": lambda f, r: f.credit_card_number(),
    "iban": lambda f, r: f.iban(),
    "ip": lambda f, r: f.ipv4_private(),
    "hostname": lambda f, r: f.hostname(),
    "codename": _codename,
}
SENSITIVE_SLOTS = {
    "us_ssn": {"us_ssn"}, "national_id_non_us": {"national_id"}, "passport_number": {"passport"},
    "home_address": {"address"}, "personal_contact": {"phone", "email"}, "date_of_birth_with_name": {"dob"},
    "api_key": {"api_key"}, "password": {"password"}, "private_key": {"private_key"},
    "db_connection_string": {"db_url"}, "credit_card": {"card"}, "bank_account": {"iban"},
    "internal_infrastructure": {"ip", "hostname"}, "project_codename": {"codename"},
}
ALL_SENSITIVE = set().union(*SENSITIVE_SLOTS.values())


@dataclass(frozen=True)
class MsgTemplate:
    id: str
    category: str | None
    polarity: str
    style: str
    adversarial: bool
    text: str


@dataclass(frozen=True)
class RuleTemplate:
    id: str
    category: str
    text: str


@dataclass(frozen=True)
class TemplateSet:
    language: str
    messages: tuple
    rules: tuple


def load_templates(path: Path) -> TemplateSet:
    d = json.loads(path.read_text(encoding="utf-8"))
    msgs = tuple(MsgTemplate(m["id"], m["category"], m["polarity"], m["style"], bool(m.get("adversarial", False)),
                             m["text"]) for m in d["messages"])
    rules = tuple(RuleTemplate(r["id"], r["category"], r["text"]) for r in d["rules"])
    return TemplateSet(d["language"], msgs, rules)


def validate(ts: TemplateSet) -> list[str]:
    errors = []
    if ts.language not in LANGUAGES:
        errors.append(f"unknown language {ts.language}")
    ids = [t.id for t in ts.messages] + [t.id for t in ts.rules]
    if len(ids) != len(set(ids)):
        errors.append("duplicate template ids")
    for t in ts.messages:
        if t.polarity not in ("positive", "hard_negative", "benign"):
            errors.append(f"{t.id}: bad polarity {t.polarity}")
        if (t.category is None) != (t.polarity == "benign"):
            errors.append(f"{t.id}: benign iff no category")
        if t.category is not None and t.category not in _CATS:
            errors.append(f"{t.id}: unknown category {t.category}")
        if t.style not in MESSAGE_STYLES:
            errors.append(f"{t.id}: unknown style {t.style}")
        spans = SPAN.findall(t.text)
        if t.polarity == "positive" and len(spans) != 1:
            errors.append(f"{t.id}: positive needs exactly one [[...]] span")
        if t.polarity != "positive" and spans:
            errors.append(f"{t.id}: only positives may mark a [[...]] span")
        own = SENSITIVE_SLOTS.get(t.category, set())
        for slot in SLOT.findall(t.text):
            if slot not in FILLERS:
                errors.append(f"{t.id}: unknown slot {slot}")
            elif slot in ALL_SENSITIVE and slot not in own:
                errors.append(f"{t.id}: slot {slot} belongs to another category")
        if (t.category == "project_codename") != ("{codename}" in t.text):
            errors.append(f"{t.id}: codename messages (and only they) must use {{codename}}")
        if not has_script(SLOT.sub("", SPAN.sub(r"\1", t.text)), ts.language):
            errors.append(f"{t.id}: text not in {ts.language} script")
    for t in ts.rules:
        if t.category not in _CATS:
            errors.append(f"{t.id}: unknown category {t.category}")
        if any(s != "codename" for s in SLOT.findall(t.text)):
            errors.append(f"{t.id}: rules may only use the {{codename}} slot")
        if (t.category == "project_codename") != ("{codename}" in t.text):
            errors.append(f"{t.id}: codename rules (and only they) must use {{codename}}")
    return errors


def _render(text: str, fake, rng, values: dict) -> str:
    def sub(m):
        name = m.group(1)
        if name not in values:
            filler = FILLERS[name]
            values[name] = filler(fake, rng)
        return values[name]
    return SLOT.sub(sub, text)


def _fill(text: str, fake, rng, fixed: dict) -> tuple[str, int | None, int | None]:
    values = dict(fixed)
    m = SPAN.search(text)
    if not m:
        return _render(text, fake, rng, values), None, None
    before = _render(text[:m.start()], fake, rng, values)
    span = _render(m.group(1), fake, rng, values)
    after = _render(text[m.end():], fake, rng, values)
    return before + span + after, len(before), len(before) + len(span)


def generate(sets, per_template: int, seed: int, english_rule_share: float = 0.3):
    rng = random.Random(seed)
    rule_tmpls = {ts.language: ts.rules for ts in sets}
    msgs, rules, pairs, labels = [], [], [], []
    rule_index: dict[str, Rule] = {}

    def make_rule(lang, tmpl, codename=None):
        text = tmpl.text.replace("{codename}", codename) if codename else tmpl.text
        rid = stable_id("rule", lang, tmpl.id, text)
        if rid not in rule_index:
            rule_index[rid] = Rule(rid, tmpl.category, lang, text, "scripted")
            rules.append(rule_index[rid])
        return rule_index[rid]

    for ts in sorted(sets, key=lambda s: s.language):
        fake = Faker(LANGUAGES[ts.language])
        fake.seed_instance(seed)
        for t in ts.messages:
            for i in range(per_template):
                codename = _codename(fake, rng) if t.category == "project_codename" else None
                text, start, end = _fill(t.text, fake, rng, {"codename": codename} if codename else {})
                m = Message(stable_id("msg", ts.language, t.id, str(i), text), t.category, t.polarity, t.style,
                            ts.language, text, t.adversarial, start, "tmpl:" + t.id, "scripted", end)
                msgs.append(m)
                is_test = message_is_test(m)
                use_en = ts.language != "en" and "en" in rule_tmpls and rng.random() < english_rule_share
                rule_lang = "en" if use_en else ts.language
                pool = [rt for rt in rule_tmpls.get(rule_lang, ())
                        if is_test or not rule_is_test_only(rt.category, rule_lang)]
                chosen = []
                if t.category is not None:
                    own = [rt for rt in pool if rt.category == t.category]
                    if own:
                        rt = rng.choice(own)
                        chosen.append((make_rule(rule_lang, rt, codename), 1.0 if t.polarity == "positive" else 0.0))
                        if codename:
                            other = codename
                            while other == codename:
                                other = _codename(fake, rng)
                            chosen.append((make_rule(rule_lang, rt, other), 0.0))
                family = _CATS[t.category].family if t.category else None
                others = [rt for rt in pool if rt.category != "project_codename" and _CATS[rt.category].family != family]
                for rt in rng.sample(others, min(2, len(others))):
                    chosen.append((make_rule(rule_lang, rt), 0.0))
                for r, y in chosen:
                    pid = stable_id("pair", m.id, r.id)
                    pairs.append(Pair(pid, m.id, r.id))
                    labels.append(Label(pid, y, "construction"))
    return msgs, rules, pairs, labels
