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
 * Rejects known-invalid area codes: 000, 666, 900-999.
 */
export function ssnCheck(value: string): boolean {
  const parts = value.split("-");
  if (parts.length !== 3) return false;
  const area = parseInt(parts[0]!, 10);
  if (area === 0 || area === 666 || area >= 900) return false;
  return true;
}

// TODO: add IBAN checksum validation when IBAN rule is added to defaults
export function ibanCheck(_value: string): boolean {
  return true;
}
