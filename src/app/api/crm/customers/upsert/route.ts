/**
 * POST /api/crm/customers/upsert
 *
 * Bearer-token agent-tool endpoint. Called by the Kapso workflow's upsert_customer tool.
 * Auth: `Authorization: Bearer ${KAPSO_AGENT_TOOL_SECRET}` (Kapso flow_agent_webhooks
 * only support static headers, so HMAC body-signing is not possible).
 *
 * Use case: when lookup_customer returns { found: false }, the agent collects the
 * customer's name (and optionally email/notes) and calls this endpoint to bootstrap
 * the record before any further upsert_pet calls.
 *
 * Input:  { phone_number, phone_number_id, name?, email?, notes? }
 * Output: { customer_id: string, action: 'created' | 'updated' }
 */

import { NextRequest, NextResponse } from 'next/server'
import { verifyBearerToken } from '@/lib/agent-tool-auth'
import { createAdminClient } from '@/lib/supabase/admin'
import { upsertCustomer } from '@/server/customers/repo'
import { env } from '@/env'

export async function POST(request: NextRequest) {
  const authHeader = request.headers.get('authorization')
  const agentSecret = env.KAPSO_AGENT_TOOL_SECRET as string

  if (!verifyBearerToken(authHeader, agentSecret)) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  const rawBody = await request.text()
  console.log('[upsert_customer] rx', { event: 'rx', body: rawBody })

  let body: {
    phone_number: string
    phone_number_id: string
    name?: string
    email?: string
    notes?: string
  }
  try {
    body = JSON.parse(rawBody)
  } catch {
    return NextResponse.json({ error: 'Invalid JSON' }, { status: 400 })
  }

  const { phone_number, phone_number_id, name, email, notes } = body

  if (!phone_number) {
    console.warn('[upsert_customer] reject: missing phone_number', { event: 'reject', reason: 'phone_number_missing', body })
    return NextResponse.json({ error: 'phone_number is required' }, { status: 400 })
  }

  // Resolve clinic_id: prefer the supplied whatsapp_phone_number_id; otherwise fall
  // back to the single-tenant clinic (MVP). TODO multi-tenant: require phone_number_id.
  const admin = createAdminClient()
  const clinicQuery = admin.from('clinics').select('id')
  const { data: clinic } = phone_number_id
    ? await clinicQuery.eq('whatsapp_phone_number_id', phone_number_id).maybeSingle()
    : await clinicQuery.limit(1).maybeSingle()

  if (!clinic) {
    console.warn('[upsert_customer] reject: clinic not resolved', { event: 'reject', reason: 'clinic_not_resolved', phone_number_id })
    return NextResponse.json({ error: 'Clinic not resolved' }, { status: 404 })
  }

  try {
    const result = await upsertCustomer({
      clinic_id: clinic.id,
      phone_number,
      name: name ?? null,
      email: email ?? null,
      notes: notes ?? null,
    })

    return NextResponse.json({ customer_id: result.customer_id, action: result.action })
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Unknown error'
    return NextResponse.json({ error: message }, { status: 500 })
  }
}
