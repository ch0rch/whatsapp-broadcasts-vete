/**
 * Sentry edge runtime configuration.
 *
 * This file is loaded automatically by @sentry/nextjs instrumentation
 * for middleware and edge route handlers.
 * Only initializes when SENTRY_DSN is set.
 *
 * Note: The edge runtime has a restricted API surface — no Node.js built-ins.
 * Keep this config minimal.
 */

import * as Sentry from '@sentry/nextjs'

const dsn = process.env.SENTRY_DSN

if (dsn) {
  Sentry.init({
    dsn,
    tracesSampleRate: 0.1,
  })
}
