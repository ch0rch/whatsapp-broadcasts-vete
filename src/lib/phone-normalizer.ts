/**
 * Argentine phone number normalizer.
 *
 * Argentine mobile numbers in E.164 look like: +549AAXXXXXXXX
 * where AA is the area code (2–4 digits) and XXXXXXXX is the subscriber number.
 *
 * Common raw formats received from CSVs or user input:
 *   - +549AAXXXXXXXX  (already E.164 with mobile 9)
 *   - +54AAXXXXXXXX   (E.164 without mobile 9 — landline or old format)
 *   - 549AAXXXXXXXX   (missing +)
 *   - 54AAXXXXXXXX    (missing +, no mobile 9)
 *   - 0AAXXXXXXXX     (local with leading 0 area code)
 *   - 15XXXXXXXX      (mobile prefix without area code — REJECT, unknowable)
 *   - AAXXXXXXXX      (bare 10-digit, area + subscriber, no country code)
 */

/** Remove formatting characters and leading whitespace. */
function strip(raw: string): string {
  return raw.replace(/[\s\-\(\)\.]/g, '')
}

/**
 * Normalize an Argentine phone number to E.164 (+54...).
 * Returns null if normalization is impossible (ambiguous or invalid format).
 *
 * Rules applied in order:
 * 1. Strip formatting chars
 * 2. If starts with "15": mobile prefix without area code → can't normalize → return null
 * 3. If starts with "+54": keep, validate length [12,14] → ok or null
 * 4. If starts with "549" and length 12-14: prepend "+"
 * 5. If starts with "54" and length 11-13: prepend "+"
 * 6. If starts with "0" (leading area code zero): remove leading 0 → treat as bare AAXXXXXXXX
 * 7. Bare number 10 digits (AAXXXXXXXX): prepend "+54"
 * 8. Anything else outside [10,15] digits total → return null
 */
export function normalize(phone: string): string | null {
  if (!phone || !phone.trim()) return null

  let s = strip(phone)

  // Remove any non-digit characters except leading +
  const hasPlus = s.startsWith('+')
  const digits = s.replace(/\D/g, '')

  // Rule 2: starts with "15" (mobile prefix without area code — unknowable)
  if (digits.startsWith('15')) {
    return null
  }

  // Rule 3: already has + prefix
  if (hasPlus) {
    s = '+' + digits
    if (s.startsWith('+54')) {
      // Valid E.164 AR length: +54 + 10-12 more digits = 13-15 total chars
      // Minimum: +54 + area(2) + subscriber(8) = +54AAXXXXXXXX = 13 chars (12 digits after +)
      // Maximum: +549 + area(4) + subscriber(8) = 16 chars — unusual but allow up to +54 + 13 = 16
      const digitCount = digits.length // includes 54 prefix
      if (digitCount >= 10 && digitCount <= 14) {
        return s
      }
      return null
    }
    // Non-AR country code with +: validate length
    if (digits.length >= 10 && digits.length <= 15) {
      return s
    }
    return null
  }

  // From here on, no leading +

  // Rule 4: starts with "549" — E.164 AR mobile without +
  if (digits.startsWith('549') && digits.length >= 11 && digits.length <= 14) {
    return '+' + digits
  }

  // Rule 5: starts with "54" — E.164 AR without +
  if (digits.startsWith('54') && digits.length >= 10 && digits.length <= 14) {
    return '+' + digits
  }

  // Rule 6: leading 0 (local area code format: 011-XXXX-XXXX → 11XXXXXXXX)
  let working = digits
  if (working.startsWith('0')) {
    working = working.slice(1)
  }

  // Rule 7: 10 bare digits (AAXXXXXXXX) → +54AAXXXXXXXX
  if (working.length === 10) {
    return '+54' + working
  }

  // Rule 8: anything outside valid range → reject
  return null
}

/**
 * Returns true if the given string is a valid E.164 phone number.
 * E.164: starts with +, followed by 7–15 digits total (inclusive of country code).
 */
export function isValidE164(phone: string): boolean {
  return /^\+\d{7,15}$/.test(phone.trim())
}

/**
 * Normalize and validate in one call.
 * Returns the E.164 string or null if the number cannot be made valid.
 */
export function normalizeAndValidate(raw: string): string | null {
  const normalized = normalize(raw)
  if (!normalized) return null
  if (!isValidE164(normalized)) return null
  return normalized
}
