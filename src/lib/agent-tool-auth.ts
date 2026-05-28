/**
 * Bearer-token authentication for Kapso agent-tool requests.
 *
 * Kapso `flow_agent_webhooks` only support static headers (with variable
 * interpolation). They cannot compute an HMAC of the request body, so we use
 * shared-token Bearer auth instead. Threat model relies on HTTPS to protect
 * the header in transit (same model Kapso uses for its own platform API key).
 *
 * Webhook receivers from Kapso (`/api/webhooks/kapso/*`) still use HMAC body
 * signing via `webhook-auth.ts` because Kapso itself signs outbound webhooks.
 */

/**
 * Verify an `Authorization: Bearer <token>` header against an expected token
 * using constant-time comparison to resist timing attacks.
 */
export function verifyBearerToken(
  authHeader: string | null,
  expectedToken: string,
): boolean {
  if (!authHeader) return false
  const prefix = 'Bearer '
  if (!authHeader.startsWith(prefix)) return false

  const received = authHeader.slice(prefix.length)
  if (received.length !== expectedToken.length) return false

  let mismatch = 0
  for (let i = 0; i < received.length; i++) {
    mismatch |= received.charCodeAt(i) ^ expectedToken.charCodeAt(i)
  }
  return mismatch === 0
}
