/**
 * Normalise prompt text before detection.
 * Reverses common obfuscation tricks without losing offset information.
 */

/** Common Unicode lookalikes mapped to their ASCII equivalents. */
const LOOKALIKE_MAP: Record<string, string> = {
  "A": "A", // Cyrillic А → A (already ASCII, but illustrative)
  "а": "a", // Cyrillic а
  "е": "e", // Cyrillic е
  "о": "o", // Cyrillic о
  "р": "p", // Cyrillic р
  "с": "c", // Cyrillic с
  "х": "x", // Cyrillic х
  "é": "e", // é
  "è": "e", // è
  "à": "a", // à
  "ó": "o", // ó
  "ú": "u", // ú
  "ü": "u", // ü
  "–": "-", // en-dash
  "—": "-", // em-dash
  "‘": "'",
  "’": "'",
  "“": '"',
  "”": '"',
  " ": " ", // non-breaking space
  "​": "",  // zero-width space (strip entirely)
  "‌": "",  // zero-width non-joiner
  "‍": "",  // zero-width joiner
  "﻿": "",  // BOM
};

const LOOKALIKE_RE = new RegExp(
  `[${Object.keys(LOOKALIKE_MAP).join("")}]`,
  "g"
);

/**
 * Returns a normalised copy of the text, suitable for running detection rules
 * against. The normalisation is lossy — do NOT write the result back to the DOM.
 */
export function normalizeText(text: string): string {
  return text
    .replace(LOOKALIKE_RE, (ch) => LOOKALIKE_MAP[ch] ?? ch)
    .replace(/\r\n/g, "\n") // CRLF → LF
    .replace(/\t/g, "    "); // tabs to 4 spaces
}
