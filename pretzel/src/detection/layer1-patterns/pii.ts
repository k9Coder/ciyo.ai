/**
 * Validators used post-match for PII rules.
 * These are called by the engine when a PatternRule sets `validator`.
 */

/** Luhn algorithm — validates credit card numbers. */
export function luhnCheck(digits: string): boolean {
  const cleaned = digits.replace(/\D/g, "");
  if (cleaned.length < 13) return false;

  let sum = 0;
  let double = false;
  for (let i = cleaned.length - 1; i >= 0; i--) {
    let digit = parseInt(cleaned[i]!, 10);
    if (double) {
      digit *= 2;
      if (digit > 9) digit -= 9;
    }
    sum += digit;
    double = !double;
  }
  return sum % 10 === 0;
}

/**
 * Validates a US SSN string (NNN-NN-NNNN).
 * Rejects known-invalid area codes (000, 666, 900-999), group numbers (00),
 * and serial numbers (0000).
 */
export function ssnCheck(value: string): boolean {
  const parts = value.split("-");
  if (parts.length !== 3) return false;
  const area = parseInt(parts[0]!, 10);
  const group = parseInt(parts[1]!, 10);
  const serial = parseInt(parts[2]!, 10);
  if (area === 0 || area === 666 || area >= 900) return false;
  if (group === 0) return false;   // group number cannot be 00
  if (serial === 0) return false;  // serial number cannot be 0000
  return true;
}

/**
 * Validates an IBAN using the ISO 13616 mod-97 checksum.
 * Processes in 9-digit chunks to avoid JavaScript integer overflow.
 */
export function ibanCheck(value: string): boolean {
  const cleaned = value.replace(/\s+/g, "").toUpperCase();
  if (cleaned.length < 15 || cleaned.length > 34) return false;
  // Move first 4 chars to end, then convert letters A-Z to numbers 10-35
  const rearranged = cleaned.slice(4) + cleaned.slice(0, 4);
  const numeric = rearranged
    .split("")
    .map((ch) => {
      const code = ch.charCodeAt(0);
      // A=65 → 10, B=66 → 11, …, Z=90 → 35
      return code >= 65 ? (code - 55).toString() : ch;
    })
    .join("");
  // Compute mod 97 on the big numeric string in 9-digit chunks
  let remainder = 0;
  for (const chunk of numeric.match(/.{1,9}/g) ?? []) {
    remainder = parseInt(String(remainder) + chunk, 10) % 97;
  }
  return remainder === 1;
}
