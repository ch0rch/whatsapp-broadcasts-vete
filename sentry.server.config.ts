/**
 * Sentry server-side configuration (Node.js runtime).
 *
 * This file is loaded automatically by @sentry/nextjs instrumentation.
 * Only initializes when SENTRY_DSN is set — local dev without Sentry is unaffected.
 *
 * tracesSampleRate: 0.1  — sample 10% of transactions (adjust for traffic)
 * replaysOnErrorSampleRate: not applicable server-side (Session Replay is browser-only)
 */

import * as Sentry from '@sentry/nextjs'

const dsn = process.env.SENTRY_DSN

if (dsn) {
  Sentry.init({
    dsn,
    tracesSampleRate: 0.1,
    // Suppress noisy console breadcrumbs in production logs
    integrations: (integrations) =>
      integrations.filter((i) => i.name !== 'Console'),
  })
}
