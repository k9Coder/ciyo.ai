/**
 * Shannon entropy scoring for detecting high-entropy tokens (secrets).
 */

/**
 * Computes Shannon entropy in bits per character for the given string.
 */
export function shannonEntropy(s: string): number {
  if (s.length === 0) return 0;
  const freq: Record<string, number> = {};
  for (const ch of s) {
    freq[ch] = (freq[ch] ?? 0) + 1;
  }
  let entropy = 0;
  for (const count of Object.values(freq)) {
    const p = count / s.length;
    entropy -= p * Math.log2(p);
  }
  return entropy;
}

/**
 * UUID pattern used to allowlist UUIDs from the entropy scanner.
 * UUIDs have high entropy but are not secrets.
 */
const UUID_RE =
  /^[0-9a-f]{8}[0-9a-f]{4}[0-9a-f]{4}[0-9a-f]{4}[0-9a-f]{12}$/i;

/**
 * Returns true if the token looks like a UUID (with hyphens stripped).
 * This allows callers to skip flagging UUIDs as high-entropy secrets.
 */
function isUuid(token: string): boolean {
  // Strip hyphens to handle both raw hex and canonical 8-4-4-4-12 form
  return UUID_RE.test(token.replace(/-/g, ""));
}

/**
 * Splits the text on whitespace/punctuation and returns tokens that exceed
 * the given length and entropy thresholds.
 *
 * Filtering applied (in order):
 * 1. Token must meet minLength.
 * 2. Token must contain BOTH alpha and numeric characters (secrets are mixed;
 *    all-alpha English words and all-digit sequences are not).
 * 3. Token must not be a UUID (high entropy but not a secret).
 * 4. Token entropy must meet minBitsPerChar threshold.
 */
export function findHighEntropyTokens(
  text: string,
  minLength: number,
  minBitsPerChar: number
): Array<{ token: string; index: number; entropy: number }> {
  const results: Array<{ token: string; index: number; entropy: number }> = [];
  // Tokenise on whitespace and common separators (not alphanumeric, not /+=-_)
  const tokenRe = /[A-Za-z0-9+/=_\-]{8,}/g;
  let match: RegExpExecArray | null;
  while ((match = tokenRe.exec(text)) !== null) {
    const token = match[0];
    if (token.length < minLength) continue;

    // Charset diversity: must contain both alpha and numeric characters.
    // All-alpha long words (e.g. CamelCase identifiers) are not secrets.
    const hasAlpha = /[A-Za-z]/.test(token);
    const hasDigit = /[0-9]/.test(token);
    if (!hasAlpha || !hasDigit) continue;

    // UUID allowlist: UUIDs have high entropy but are not secrets.
    if (isUuid(token)) continue;

    const entropy = shannonEntropy(token);
    if (entropy >= minBitsPerChar) {
      results.push({ token, index: match.index, entropy });
    }
  }
  return results;
}
