from judge.data.schema import Category

CRITICAL_FAMILIES = frozenset({"pii", "credentials", "phi", "financial"})


def _c(id, family, heldout, description):
    return Category(id, family, family in CRITICAL_FAMILIES, heldout, description)


CATEGORIES = [
    _c("us_ssn", "pii", False, "a US Social Security Number"),
    _c("national_id_non_us", "pii", True, "a non-US national identity number"),
    _c("passport_number", "pii", False, "a passport number"),
    _c("home_address", "pii", False, "a private individual's home address"),
    _c("personal_contact", "pii", False, "a specific private individual's personal phone number or personal email address"),
    _c("date_of_birth_with_name", "pii", True, "a named person's date of birth"),
    _c("api_key", "credentials", False, "an API key or access token for a cloud or SaaS service"),
    _c("password", "credentials", False, "a password or passphrase for an account"),
    _c("private_key", "credentials", True, "a private cryptographic key (SSH, PGP or TLS)"),
    _c("db_connection_string", "credentials", False, "a database connection string that contains credentials"),
    _c("patient_diagnosis", "phi", False, "an identifiable patient's diagnosis or medical condition"),
    _c("prescription_record", "phi", True, "an identifiable patient's prescription or medication record"),
    _c("credit_card", "financial", False, "a payment card number"),
    _c("bank_account", "financial", False, "a bank account, IBAN or routing number"),
    _c("salary_of_named_person", "hr", False, "a specific named employee's salary or compensation"),
    _c("performance_review", "hr", True, "a specific named employee's performance review or disciplinary record"),
    _c("attorney_client_privilege", "legal", False, "attorney-client privileged legal advice or communications"),
    _c("unreleased_financial_results", "business", False, "unreleased company financial results before public announcement"),
    _c("m_and_a", "business", True, "non-public merger, acquisition or investment plans"),
    _c("product_roadmap", "business", False, "an unannounced product roadmap or launch plan"),
    _c("project_codename", "business", False, "details of a specific internal project identified by its codename"),
    _c("customer_list", "business", False, "a list of customers or customers' contact data"),
    _c("proprietary_source_code", "source_code", False, "proprietary internal source code"),
    _c("internal_infrastructure", "infrastructure", True, "internal hostnames, IP addresses or network architecture details"),
    _c("competitor_confidential", "business", False, "confidential information obtained about a competitor"),
]

MESSAGE_STYLES = {
    "chat_question": "a short direct question or request to the assistant",
    "code_help": "a coding question with pasted code, config or a stack trace",
    "email_draft": "a request to draft, reply to or polish an email, including the email text",
    "document_paste": "a pasted section of a work document with a request to summarize, translate or edit it",
    "log_paste": "pasted logs or terminal output with a debugging question",
    "translation_request": "a request to translate a piece of text",
    "spreadsheet_paste": "pasted tabular data (CSV or TSV) with a request about it",
    "meeting_notes": "pasted meeting notes with a request to turn them into action items",
    "chat_transcript": "a pasted Slack or Teams conversation with a request about it",
}
HELDOUT_STYLES = frozenset({"spreadsheet_paste", "meeting_notes", "chat_transcript"})

LANGUAGES = {"en": "en_US", "he": "he_IL", "es": "es_ES", "fr": "fr_FR", "de": "de_DE", "pt": "pt_BR",
             "ru": "ru_RU", "ar": "ar_AA", "zh": "zh_CN", "it": "it_IT", "nl": "nl_NL"}
TRAIN_LANGUAGES = ("en", "he", "es", "fr", "de", "pt", "ru", "ar", "zh")
HELDOUT_LANGUAGES = ("it", "nl")
SCRIPT_RANGES = {"he": ("֐", "׿"), "ar": ("؀", "ۿ"), "ru": ("Ѐ", "ӿ"),
                 "zh": ("一", "鿿")}


def category_by_id(categories) -> dict:
    return {c.id: c for c in categories}


def has_script(text: str, language: str) -> bool:
    if language not in SCRIPT_RANGES:
        return True
    lo, hi = SCRIPT_RANGES[language]
    return any(lo <= ch <= hi for ch in text)
