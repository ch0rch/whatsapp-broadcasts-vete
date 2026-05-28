/**
 * Sentry client-side configuration (browser runtime).
 *
 * This file is loaded automatically by @sentry/nextjs instrumentation.
 * Only initializes when SENTRY_DSN is set.
 *
 * tracesSampleRate: 0.1     — 10% of page-load/navigation traces
 * replaysSessionSampleRate: 0 — no session replay in MVP (saves quota)
 * replaysOnErrorSampleRate: 1.0 — capture replay for all error sessions
 */

import * as Sentry from '@sentry/nextjs'

const dsn = process.env.NEXT_PUBLIC_SENTRY_DSN ?? process.env.SENTRY_DSN

if (dsn) {
  Sentry.init({
    dsn,
    tracesSampleRate: 0.1,
    replaysSessionSampleRate: 0,
    replaysOnErrorSampleRate: 1.0,
    integrations: [
      Sentry.replayIntegration({
        maskAllText: true,
        blockAllMedia: true,
      }),
    ],
  })
}
