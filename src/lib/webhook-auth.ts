/**
 * HMAC-SHA256 signature verification for Kapso agent-tool and webhook requests.
 *
 * Kapso signs requests by computing:
 *   HMAC-SHA256(secret, rawBody) → hex digest
 * and sending it in the X-Kapso-Signature header.
 *
 * We use crypto.subtle (Web Crypto) — available in both Node.js 18+ and the
 * Next.js Edge runtime, and resistant to timing attacks via timingSafeEqual logic.
 */

/**
 * Verify that the incoming request's X-Kapso-Signature matches the expected
 * HMAC-SHA256 of the raw body using the provided secret.
 *
 * @param rawBody - Raw request body as a string (read once, passed in)
 * @param signature - Value of X-Kapso-Signature header
 * @param secret - The shared HMAC secret
 * @returns true if signature matches, false otherwise
 */
export async function verifyHmacSignature(
  rawBody: string,
  signature: string | null,
  secret: string,
): Promise<boolean> {
  if (!signature) return false

  try {
    const encoder = new TextEncoder()
    const key = await crypto.subtle.importKey(
      'raw',
      encoder.encode(secret),
      { name: 'HMAC', hash: 'SHA-256' },
      false,
      ['sign'],
    )

    const signatureBytes = await crypto.subtle.sign('HMAC', key, encoder.encode(rawBody))
    const expectedHex = Array.from(new Uint8Array(signatureBytes))
      .map((b) => b.toString(16).padStart(2, '0'))
      .join('')

    // Constant-time string comparison to prevent timing attacks
    const expected = expectedHex.toLowerCase()
    const received = signature.toLowerCase().replace(/^sha256=/, '')

    if (expected.length !== received.length) return false

    let mismatch = 0
    for (let i = 0; i < expected.length; i++) {
      mismatch |= expected.charCodeAt(i) ^ received.charCodeAt(i)
    }

    return mismatch === 0
  } catch {
    return false
  }
}
