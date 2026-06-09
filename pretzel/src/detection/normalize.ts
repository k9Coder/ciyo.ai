/**
 * Normalise prompt text before detection.
 * Reverses common obfuscation tricks without losing offset information.
 */

/** Common Unicode lookalikes mapped to their ASCII equivalents. */
const LOOKALIKE_MAP: Record<string, string> = {
  // ── Cyrillic lookalikes ──────────────────────────────────────────────────
  "А": "A", // Cyrillic А (A) → A
  "а": "a", // Cyrillic а (a) → a
  "е": "e", // Cyrillic е (e) → e
  "і": "i", // Cyrillic і (i) → i
  "ї": "i", // Cyrillic ї (yi) → i
  "о": "o", // Cyrillic о (o) → o
  "р": "p", // Cyrillic р (r) → p
  "с": "c", // Cyrillic с (s) → c
  "х": "x", // Cyrillic х (kh) → x
  "у": "y", // Cyrillic у (u) → y
  "ц": "c", // Cyrillic ц (ts) → c
  "В": "B", // Cyrillic В (V) → B
  "М": "M", // Cyrillic М (M) → M
  "Т": "T", // Cyrillic Т (T) → T
  "Е": "E", // Cyrillic Е (E) → E
  "О": "O", // Cyrillic О (O) → O
  "Р": "P", // Cyrillic Р (R) → P
  "С": "C", // Cyrillic С (S) → C
  "Х": "X", // Cyrillic Х (KH) → X
  "У": "Y", // Cyrillic У (U) → Y
  "І": "I", // Cyrillic І (I) → I

  // ── Greek homoglyphs ─────────────────────────────────────────────────────
  "α": "a", // Greek alpha → a
  "β": "b", // Greek beta → b
  "ο": "o", // Greek omicron → o
  "ρ": "p", // Greek rho → p
  "υ": "u", // Greek upsilon → u
  "ν": "v", // Greek nu → v
  "Α": "A", // Greek Alpha → A
  "Β": "B", // Greek Beta → B
  "Ε": "E", // Greek Epsilon → E
  "Ζ": "Z", // Greek Zeta → Z
  "Η": "H", // Greek Eta → H
  "Ι": "I", // Greek Iota → I
  "Κ": "K", // Greek Kappa → K
  "Μ": "M", // Greek Mu → M
  "Ν": "N", // Greek Nu → N
  "Ο": "O", // Greek Omicron → O
  "Ρ": "P", // Greek Rho → P
  "Τ": "T", // Greek Tau → T
  "Υ": "Y", // Greek Upsilon → Y
  "Χ": "X", // Greek Chi → X

  // ── Accented Latin ───────────────────────────────────────────────────────
  "é": "e", // e-acute
  "è": "e", // e-grave
  "à": "a", // a-grave
  "ó": "o", // o-acute
  "ú": "u", // u-acute
  "ü": "u", // u-umlaut
  "á": "a", // a-acute
  "í": "i", // i-acute
  "ñ": "n", // n-tilde
  "â": "a", // a-circumflex
  "ê": "e", // e-circumflex
  "î": "i", // i-circumflex
  "ô": "o", // o-circumflex
  "û": "u", // u-circumflex
  "É": "E", // E-acute
  "À": "A", // A-grave
  "Á": "A", // A-acute

  // ── Typography ───────────────────────────────────────────────────────────
  "–": "-", // en-dash
  "—": "-", // em-dash
  "‘": "'", // left single quotation mark
  "’": "'", // right single quotation mark
  "“": '"', // left double quotation mark
  "”": '"', // right double quotation mark

  // ── Invisible / direction characters (strip) ─────────────────────────────
  " ": " ", // non-breaking space → space
  "​": "",  // zero-width space
  "‌": "",  // zero-width non-joiner
  "‍": "",  // zero-width joiner
  "‮": "",  // RIGHT-TO-LEFT OVERRIDE (classic obfuscation trick)
  "‪": "",  // LEFT-TO-RIGHT EMBEDDING
  "‫": "",  // RIGHT-TO-LEFT EMBEDDING
  "‬": "",  // POP DIRECTIONAL FORMATTING
  "⁦": "",  // LEFT-TO-RIGHT ISOLATE
  "⁧": "",  // RIGHT-TO-LEFT ISOLATE
  "⁨": "",  // FIRST STRONG ISOLATE
  "⁩": "",  // POP DIRECTIONAL ISOLATE
  "﻿": "",  // BOM / zero-width no-break space
};

// Add fullwidth ASCII mappings (U+FF01–U+FF5E → ASCII U+0021–U+007E).
// This covers fullwidth letters, digits, and symbols used in homoglyph attacks
// (e.g. ｓｋ-... to bypass OpenAI key detection).
for (let cp = 0xFF01; cp <= 0xFF5E; cp++) {
  LOOKALIKE_MAP[String.fromCodePoint(cp)] = String.fromCodePoint(cp - 0xFEE0);
}

/**
 * Build the lookalike regex as an alternation of escaped literal characters.
 * This is safer than a character class `[...]` because it avoids metacharacter
 * issues when map keys contain `-`, `]`, `^`, or `\`.
 */
const LOOKALIKE_RE = new RegExp(
  Object.keys(LOOKALIKE_MAP)
    .map((ch) => ch.replace(/[.*+?^${}()|[\]\\]/g, "\\$&"))
    .join("|"),
  "g"
);

/**
 * Returns a normalised copy of the text, suitable for running detection rules
 * against. The normalisation is lossy — do NOT write the result back to the DOM.
 *
 * Tab expansion uses a single space (not 4 spaces) to preserve byte-offset
 * alignment so that Finding.startOffset / endOffset remain valid.
 */
export function normalizeText(text: string): string {
  return text
    .replace(LOOKALIKE_RE, (ch) => LOOKALIKE_MAP[ch] ?? ch)
    .replace(/\r\n/g, "\n") // CRLF → LF
    .replace(/\t/g, " ");   // tab → single space (not 4 spaces — avoids offset drift)
}
