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
 * Splits the text on whitespace/punctuation and returns tokens that exceed
 * the given length and entropy thresholds.
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
    const entropy = shannonEntropy(token);
    if (entropy >= minBitsPerChar) {
      results.push({ token, index: match.index, entropy });
    }
  }
  return results;
}
