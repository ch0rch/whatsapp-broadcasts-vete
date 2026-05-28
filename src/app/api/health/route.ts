/**
 * GET /api/health
 *
 * Lightweight health check for uptime monitors (e.g. Vercel, UptimeRobot).
 *
 * Middleware: /api/health is in BYPASS_PREFIXES — no auth required.
 * Client: admin (service role) for the DB probe.
 *
 * DB check:
 *   HEAD query on `clinics` with limit 0 — exercises the Supabase connection
 *   without reading data. Cheap: no rows returned.
 *
 * Kapso check:
 *   Presence check only — verifies KAPSO_API_KEY is configured.
 *   We do NOT call the live Kapso API here because:
 *     (a) Kapso charges per API call; a health probe every 30s adds up.
 *     (b) A Kapso API outage should surface via Kapso's own status page,
 *         not trip our uptime monitor on every check.
 *   A deeper Kapso liveness probe (e.g. GET /projects) can be added later
 *   behind a query param or separate endpoint.
 *
 * HTTP status:
 *   200 — always (uptime monitors don't false-alarm on partial degradation).
 *   503 — returned if BOTH db AND kapso are in error state simultaneously.
 *
 * Response shape: { db: 'ok' | 'error', kapso: 'ok' | 'error', timestamp: ISO8601 }
 */

import { NextResponse } from 'next/server'
import { createAdminClient } from '@/lib/supabase/admin'

export async function GET() {
  const timestamp = new Date().toISOString()

  // ── DB check ────────────────────────────────────────────────────────────────
  let dbStatus: 'ok' | 'error' = 'ok'
  try {
    const admin = createAdminClient()
    // HEAD request: count=exact, head=true → returns count only, no rows
    const { error } = await admin
      .from('clinics')
      .select('*', { count: 'exact', head: true })
    if (error) {
      console.error('[health] DB check failed', { event: 'db_check_error', error: error.message })
      dbStatus = 'error'
    }
  } catch (err) {
    console.error('[health] DB check threw', {
      event: 'db_check_threw',
      error: err instanceof Error ? err.message : String(err),
    })
    dbStatus = 'error'
  }

  // ── Kapso check (env-presence only) ─────────────────────────────────────────
  // Rationale: calling the live API costs money (Kapso charges per call) and
  // would trip uptime monitors on Kapso outages outside our control.
  // A live probe can be added later behind ?deep=1 if operational needs change.
  const kapsoStatus: 'ok' | 'error' = process.env.KAPSO_API_KEY ? 'ok' : 'error'

  if (kapsoStatus === 'error') {
    console.warn('[health] Kapso check failed', { event: 'kapso_key_missing' })
  }

  // ── HTTP status ─────────────────────────────────────────────────────────────
  const bothDown = dbStatus === 'error' && kapsoStatus === 'error'
  const httpStatus = bothDown ? 503 : 200

  return NextResponse.json(
    { db: dbStatus, kapso: kapsoStatus, timestamp },
    { status: httpStatus },
  )
}
