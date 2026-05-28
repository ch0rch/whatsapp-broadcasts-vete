/**
 * GET /api/cron/reset-usage
 *
 * Vercel cron job — runs daily at 02:00 UTC (see vercel.json).
 * Resets messages_used_this_month for every clinic whose usage_period_start
 * is in a previous calendar month.
 *
 * Auth: Vercel cron sends Authorization: Bearer <CRON_SECRET>.
 * Middleware bypasses /api/cron/** entirely (no Supabase session required).
 * Uses service-role client — bypasses RLS.
 *
 * Response: { reset_count: number, ran_at: string }
 */

import { NextRequest, NextResponse } from 'next/server'
import { createAdminClient } from '@/lib/supabase/admin'
import { env } from '@/env'

export async function GET(request: NextRequest) {
  // Vercel cron protection: Authorization: Bearer <CRON_SECRET>
  const authHeader = request.headers.get('authorization')
  const cronSecret = env.CRON_SECRET

  if (!authHeader || authHeader !== `Bearer ${cronSecret}`) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  const ranAt = new Date().toISOString()
  const admin = createAdminClient()

  // Reset every clinic whose usage_period_start belongs to a previous calendar month.
  // Supabase JS doesn't expose raw SQL expressions for .update(), so we compute the
  // current month start in JS — safe because this runs once per day from cron.
  const monthStart = getFirstDayOfCurrentMonth()
  const { data: updated, error: updateError } = await admin
    .from('clinics')
    .update({
      messages_used_this_month: 0,
      usage_period_start: monthStart,
    })
    .lt('usage_period_start', monthStart)
    .select('id')

  if (updateError) {
    console.error('[cron/reset-usage] update failed', { error: updateError })
    return NextResponse.json({ error: 'Reset failed', details: updateError.message }, { status: 500 })
  }

  const resetCount = updated?.length ?? 0
  console.log('[cron/reset-usage] reset complete', { reset_count: resetCount, ran_at: ranAt })
  return NextResponse.json({ reset_count: resetCount, ran_at: ranAt })
}

/**
 * Returns the ISO date string for the first day of the current month.
 * E.g. '2025-05-01' when run in May 2025.
 */
function getFirstDayOfCurrentMonth(): string {
  const now = new Date()
  const year = now.getUTCFullYear()
  const month = String(now.getUTCMonth() + 1).padStart(2, '0')
  return `${year}-${month}-01`
}
